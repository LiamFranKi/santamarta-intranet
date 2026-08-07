/**
 * Admin — Reclamos, sugerencias y correos de envío (formularios web pública).
 * Tablas: web_reclamos, web_sugerencias, web_correos_envio
 * Adjuntos: carpeta web-vanguard (hermana de la intranet) → data/libro-reclamaciones/adjuntos/
 */
const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { query, execute } = require('../utils/mysql');

router.use(authenticateToken);
router.use((req, res, next) => {
  if (req.user?.tipo === 'ADMINISTRADOR') return next();
  return res.status(403).json({ error: 'Solo el administrador puede gestionar reclamos y sugerencias.' });
});

const ESTADOS = ['nuevo', 'en_revision', 'atendido', 'cerrado'];
const TIPOS_RECLAMO = ['reclamo', 'queja'];

function resolveWebVanguardRoot() {
  if (process.env.WEB_VANGUARD_ROOT) {
    return String(process.env.WEB_VANGUARD_ROOT).replace(/[/\\]+$/, '');
  }
  // Producción típica: /home/vanguard/intranet2026/backend → ../../web-vanguard
  const sibling = path.resolve(__dirname, '..', '..', 'web-vanguard');
  if (fs.existsSync(sibling)) return sibling;
  if (process.env.FTP_BASE_PATH) {
    return String(process.env.FTP_BASE_PATH).replace(/[/\\]+$/, '');
  }
  return sibling;
}

function adjuntosDir() {
  return path.join(resolveWebVanguardRoot(), 'data', 'libro-reclamaciones', 'adjuntos');
}

/** Resuelve ruta de archivo bajo la raíz web-vanguard (anti path-traversal). */
function resolveAdjuntoFsPath(adjuntoRuta, adjuntoNombre) {
  const root = path.resolve(resolveWebVanguardRoot());
  const candidates = [];
  const pushSafe = (p) => {
    if (!p) return;
    const abs = path.resolve(p);
    if (abs === root || abs.startsWith(root + path.sep)) {
      candidates.push(abs);
    }
  };

  if (adjuntoRuta) {
    const raw = String(adjuntoRuta).trim().replace(/^[/\\]+/, '');
    pushSafe(path.join(root, raw));
    pushSafe(path.join(adjuntosDir(), path.basename(raw)));
  }
  if (adjuntoNombre) {
    pushSafe(path.join(adjuntosDir(), path.basename(String(adjuntoNombre))));
  }

  for (const c of candidates) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  return null;
}

function parseId(raw) {
  const id = parseInt(raw, 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function toBool01(v, fallback = 1) {
  if (v === true || v === 1 || v === '1' || v === 'true') return 1;
  if (v === false || v === 0 || v === '0' || v === 'false') return 0;
  return fallback;
}

function normalizeEmail(email) {
  return String(email || '')
    .trim()
    .toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function mapReclamo(row) {
  if (!row) return null;
  return {
    ...row,
    tiene_adjunto: !!(row.adjunto_ruta || row.adjunto_nombre),
  };
}

// ─── Reclamos ───────────────────────────────────────────────────────────────

router.get('/reclamos', async (req, res) => {
  try {
    const { estado, tipo, q } = req.query;
    const params = [];
    let sql = `
      SELECT id, numero, fecha_registro, nombre, email, telefono, tipo_documento, numero_documento,
             domicilio, relacion, alumno_nombre, alumno_dni, tipo, bien_contratado, fecha_hecho,
             detalle, pedido, monto, adjunto_nombre, adjunto_ruta, estado, ruc_registrado, razon_social
      FROM web_reclamos
      WHERE 1=1
    `;
    if (estado) {
      sql += ' AND estado = ?';
      params.push(String(estado));
    }
    if (tipo && TIPOS_RECLAMO.includes(String(tipo))) {
      sql += ' AND tipo = ?';
      params.push(String(tipo));
    }
    if (q && String(q).trim()) {
      const like = `%${String(q).trim()}%`;
      sql += ` AND (
        nombre LIKE ? OR email LIKE ? OR numero LIKE ? OR numero_documento LIKE ?
        OR alumno_nombre LIKE ? OR detalle LIKE ?
      )`;
      params.push(like, like, like, like, like, like);
    }
    sql += ' ORDER BY fecha_registro DESC, id DESC LIMIT 500';
    const rows = await query(sql, params);
    res.json({ reclamos: (rows || []).map(mapReclamo) });
  } catch (e) {
    console.error('[admin/reclamos-sugerencias/reclamos]', e);
    res.status(500).json({ error: e.message || 'Error al listar reclamos.' });
  }
});

router.get('/reclamos/:id', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });
    const rows = await query('SELECT * FROM web_reclamos WHERE id = ? LIMIT 1', [id]);
    if (!rows?.length) return res.status(404).json({ error: 'Reclamo no encontrado' });
    res.json({ reclamo: mapReclamo(rows[0]) });
  } catch (e) {
    console.error('[admin/reclamos-sugerencias/reclamos/:id]', e);
    res.status(500).json({ error: e.message || 'Error al obtener reclamo.' });
  }
});

router.put('/reclamos/:id', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });
    const rows = await query('SELECT id FROM web_reclamos WHERE id = ? LIMIT 1', [id]);
    if (!rows?.length) return res.status(404).json({ error: 'Reclamo no encontrado' });

    const b = req.body || {};
    const estado = b.estado != null ? String(b.estado).trim() : null;
    if (estado && !ESTADOS.includes(estado)) {
      return res.status(400).json({ error: `Estado inválido. Use: ${ESTADOS.join(', ')}` });
    }
    const tipo = b.tipo != null ? String(b.tipo).trim() : null;
    if (tipo && !TIPOS_RECLAMO.includes(tipo)) {
      return res.status(400).json({ error: 'Tipo debe ser reclamo o queja' });
    }

    await execute(
      `UPDATE web_reclamos SET
        nombre = ?, email = ?, telefono = ?, tipo_documento = ?, numero_documento = ?,
        domicilio = ?, relacion = ?, alumno_nombre = ?, alumno_dni = ?,
        tipo = COALESCE(?, tipo), bien_contratado = ?, fecha_hecho = ?,
        detalle = ?, pedido = ?, monto = ?, estado = COALESCE(?, estado),
        ruc_registrado = ?, razon_social = ?
      WHERE id = ?`,
      [
        String(b.nombre || '').trim(),
        String(b.email || '').trim(),
        b.telefono != null ? String(b.telefono).trim() || null : null,
        String(b.tipo_documento || '').trim(),
        String(b.numero_documento || '').trim(),
        b.domicilio != null ? String(b.domicilio).trim() || null : null,
        b.relacion != null ? String(b.relacion).trim() || null : null,
        b.alumno_nombre != null ? String(b.alumno_nombre).trim() || null : null,
        b.alumno_dni != null ? String(b.alumno_dni).trim() || null : null,
        tipo,
        b.bien_contratado != null ? String(b.bien_contratado).trim() || null : null,
        b.fecha_hecho || null,
        String(b.detalle || '').trim(),
        String(b.pedido || '').trim(),
        b.monto != null ? String(b.monto).trim() || null : null,
        estado,
        b.ruc_registrado != null ? String(b.ruc_registrado).trim() || null : null,
        b.razon_social != null ? String(b.razon_social).trim() || null : null,
        id,
      ]
    );
    const updated = await query('SELECT * FROM web_reclamos WHERE id = ? LIMIT 1', [id]);
    res.json({ reclamo: mapReclamo(updated[0]), message: 'Reclamo actualizado' });
  } catch (e) {
    console.error('[admin/reclamos-sugerencias PUT reclamos]', e);
    res.status(500).json({ error: e.message || 'Error al actualizar reclamo.' });
  }
});

router.delete('/reclamos/:id', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });
    const r = await execute('DELETE FROM web_reclamos WHERE id = ?', [id]);
    if (!r?.affectedRows) return res.status(404).json({ error: 'Reclamo no encontrado' });
    res.json({ message: 'Reclamo eliminado' });
  } catch (e) {
    console.error('[admin/reclamos-sugerencias DELETE reclamos]', e);
    res.status(500).json({ error: e.message || 'Error al eliminar reclamo.' });
  }
});

router.get('/reclamos/:id/adjunto', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });
    const rows = await query(
      'SELECT adjunto_nombre, adjunto_ruta FROM web_reclamos WHERE id = ? LIMIT 1',
      [id]
    );
    if (!rows?.length) return res.status(404).json({ error: 'Reclamo no encontrado' });
    const { adjunto_nombre, adjunto_ruta } = rows[0];
    if (!adjunto_nombre && !adjunto_ruta) {
      return res.status(404).json({ error: 'Este reclamo no tiene adjunto' });
    }
    const filePath = resolveAdjuntoFsPath(adjunto_ruta, adjunto_nombre);
    if (!filePath) {
      return res.status(404).json({
        error: 'Archivo adjunto no encontrado en el servidor',
        hint: 'Verifique WEB_VANGUARD_ROOT y la carpeta data/libro-reclamaciones/adjuntos/',
      });
    }
    const downloadName = adjunto_nombre || path.basename(filePath);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(downloadName)}"`);
    return res.sendFile(filePath);
  } catch (e) {
    console.error('[admin/reclamos-sugerencias adjunto]', e);
    res.status(500).json({ error: e.message || 'Error al abrir adjunto.' });
  }
});

// ─── Sugerencias ────────────────────────────────────────────────────────────

router.get('/sugerencias', async (req, res) => {
  try {
    const { estado, q } = req.query;
    const params = [];
    let sql = `
      SELECT id, fecha_registro, nombre, email, telefono, relacion, tipo, mensaje, estado, ip
      FROM web_sugerencias
      WHERE 1=1
    `;
    if (estado) {
      sql += ' AND estado = ?';
      params.push(String(estado));
    }
    if (q && String(q).trim()) {
      const like = `%${String(q).trim()}%`;
      sql += ' AND (nombre LIKE ? OR email LIKE ? OR mensaje LIKE ? OR tipo LIKE ?)';
      params.push(like, like, like, like);
    }
    sql += ' ORDER BY fecha_registro DESC, id DESC LIMIT 500';
    const rows = await query(sql, params);
    res.json({ sugerencias: rows || [] });
  } catch (e) {
    console.error('[admin/reclamos-sugerencias/sugerencias]', e);
    res.status(500).json({ error: e.message || 'Error al listar sugerencias.' });
  }
});

router.get('/sugerencias/:id', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });
    const rows = await query('SELECT * FROM web_sugerencias WHERE id = ? LIMIT 1', [id]);
    if (!rows?.length) return res.status(404).json({ error: 'Sugerencia no encontrada' });
    res.json({ sugerencia: rows[0] });
  } catch (e) {
    console.error('[admin/reclamos-sugerencias/sugerencias/:id]', e);
    res.status(500).json({ error: e.message || 'Error al obtener sugerencia.' });
  }
});

router.put('/sugerencias/:id', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });
    const rows = await query('SELECT id FROM web_sugerencias WHERE id = ? LIMIT 1', [id]);
    if (!rows?.length) return res.status(404).json({ error: 'Sugerencia no encontrada' });

    const b = req.body || {};
    const estado = b.estado != null ? String(b.estado).trim() : null;
    if (estado && !ESTADOS.includes(estado)) {
      return res.status(400).json({ error: `Estado inválido. Use: ${ESTADOS.join(', ')}` });
    }

    await execute(
      `UPDATE web_sugerencias SET
        nombre = ?, email = ?, telefono = ?, relacion = ?, tipo = ?,
        mensaje = ?, estado = COALESCE(?, estado)
      WHERE id = ?`,
      [
        String(b.nombre || '').trim(),
        String(b.email || '').trim(),
        b.telefono != null ? String(b.telefono).trim() || null : null,
        b.relacion != null ? String(b.relacion).trim() || null : null,
        b.tipo != null ? String(b.tipo).trim() || null : null,
        String(b.mensaje || '').trim(),
        estado,
        id,
      ]
    );
    const updated = await query('SELECT * FROM web_sugerencias WHERE id = ? LIMIT 1', [id]);
    res.json({ sugerencia: updated[0], message: 'Sugerencia actualizada' });
  } catch (e) {
    console.error('[admin/reclamos-sugerencias PUT sugerencias]', e);
    res.status(500).json({ error: e.message || 'Error al actualizar sugerencia.' });
  }
});

router.delete('/sugerencias/:id', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });
    const r = await execute('DELETE FROM web_sugerencias WHERE id = ?', [id]);
    if (!r?.affectedRows) return res.status(404).json({ error: 'Sugerencia no encontrada' });
    res.json({ message: 'Sugerencia eliminada' });
  } catch (e) {
    console.error('[admin/reclamos-sugerencias DELETE sugerencias]', e);
    res.status(500).json({ error: e.message || 'Error al eliminar sugerencia.' });
  }
});

// ─── Correos de envío ───────────────────────────────────────────────────────

router.get('/correos', async (req, res) => {
  try {
    const rows = await query(
      `SELECT id, email, etiqueta, activo, recibe_sugerencias, recibe_reclamos, creado_en
       FROM web_correos_envio
       ORDER BY activo DESC, etiqueta ASC, email ASC`
    );
    res.json({ correos: rows || [] });
  } catch (e) {
    console.error('[admin/reclamos-sugerencias/correos]', e);
    res.status(500).json({ error: e.message || 'Error al listar correos.' });
  }
});

router.post('/correos', async (req, res) => {
  try {
    const b = req.body || {};
    const email = normalizeEmail(b.email);
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Correo electrónico inválido' });
    }
    const etiqueta = b.etiqueta != null ? String(b.etiqueta).trim() || null : null;
    const activo = toBool01(b.activo, 1);
    const recibe_sugerencias = toBool01(b.recibe_sugerencias, 1);
    const recibe_reclamos = toBool01(b.recibe_reclamos, 1);
    if (!recibe_sugerencias && !recibe_reclamos) {
      return res.status(400).json({ error: 'Marque al menos un destino: sugerencias o reclamos' });
    }

    const exists = await query('SELECT id FROM web_correos_envio WHERE email = ? LIMIT 1', [email]);
    if (exists?.length) {
      return res.status(409).json({ error: 'Ese correo ya está registrado' });
    }

    const r = await execute(
      `INSERT INTO web_correos_envio (email, etiqueta, activo, recibe_sugerencias, recibe_reclamos)
       VALUES (?, ?, ?, ?, ?)`,
      [email, etiqueta, activo, recibe_sugerencias, recibe_reclamos]
    );
    const rows = await query('SELECT * FROM web_correos_envio WHERE id = ? LIMIT 1', [r.insertId]);
    res.status(201).json({ correo: rows[0], message: 'Correo creado' });
  } catch (e) {
    console.error('[admin/reclamos-sugerencias POST correos]', e);
    if (e.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Ese correo ya está registrado' });
    }
    res.status(500).json({ error: e.message || 'Error al crear correo.' });
  }
});

router.put('/correos/:id', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });
    const rows = await query('SELECT id FROM web_correos_envio WHERE id = ? LIMIT 1', [id]);
    if (!rows?.length) return res.status(404).json({ error: 'Correo no encontrado' });

    const b = req.body || {};
    const email = normalizeEmail(b.email);
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Correo electrónico inválido' });
    }
    const etiqueta = b.etiqueta != null ? String(b.etiqueta).trim() || null : null;
    const activo = toBool01(b.activo, 1);
    const recibe_sugerencias = toBool01(b.recibe_sugerencias, 1);
    const recibe_reclamos = toBool01(b.recibe_reclamos, 1);
    if (!recibe_sugerencias && !recibe_reclamos) {
      return res.status(400).json({ error: 'Marque al menos un destino: sugerencias o reclamos' });
    }

    const dup = await query(
      'SELECT id FROM web_correos_envio WHERE email = ? AND id <> ? LIMIT 1',
      [email, id]
    );
    if (dup?.length) {
      return res.status(409).json({ error: 'Ese correo ya está registrado en otro registro' });
    }

    await execute(
      `UPDATE web_correos_envio
       SET email = ?, etiqueta = ?, activo = ?, recibe_sugerencias = ?, recibe_reclamos = ?
       WHERE id = ?`,
      [email, etiqueta, activo, recibe_sugerencias, recibe_reclamos, id]
    );
    const updated = await query('SELECT * FROM web_correos_envio WHERE id = ? LIMIT 1', [id]);
    res.json({ correo: updated[0], message: 'Correo actualizado' });
  } catch (e) {
    console.error('[admin/reclamos-sugerencias PUT correos]', e);
    res.status(500).json({ error: e.message || 'Error al actualizar correo.' });
  }
});

router.delete('/correos/:id', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });
    const r = await execute('DELETE FROM web_correos_envio WHERE id = ?', [id]);
    if (!r?.affectedRows) return res.status(404).json({ error: 'Correo no encontrado' });
    res.json({ message: 'Correo eliminado' });
  } catch (e) {
    console.error('[admin/reclamos-sugerencias DELETE correos]', e);
    res.status(500).json({ error: e.message || 'Error al eliminar correo.' });
  }
});

router.get('/meta', async (_req, res) => {
  const root = resolveWebVanguardRoot();
  const adj = adjuntosDir();
  res.json({
    estados: ESTADOS,
    tipos_reclamo: TIPOS_RECLAMO,
    web_vanguard_root: root,
    adjuntos_dir: adj,
    adjuntos_dir_existe: fs.existsSync(adj),
  });
});

module.exports = router;
