/**
 * Admin — Formularios web pública (módulo Web).
 * Tablas: web_reclamos, web_sugerencias, web_contactenos, web_visitas_guiadas,
 *         web_trabaja_con_nosotros, web_admision, web_correos_envio,
 *         web_visita_dias, web_visita_horarios, web_visita_fechas, web_visita_config,
 *         web_visita_secuencias(+slots), web_admision_config, web_paginas_niveles
 * Archivos: solo bajo WEB_VANGUARD_ROOT/data/ (nunca /var/www/web).
 */
const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const multer = require('multer');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { query, execute } = require('../utils/mysql');
const { fechaMySQLLima } = require('../utils/fechaHoraLima');
const {
  resolveWebVanguardRoot,
  resolveWebDataFile,
  saveWebPublicImage,
  saveWebPublicPdf,
  removeWebPublicFileIfSafe,
  sanitizeImageBasename,
  sanitizePdfBasename,
  isUnderRoot,
} = require('../utils/webVanguardFiles');
const {
  parseYmd,
  fechasPorMesYDias,
  leerModoFechas,
} = require('../utils/visitaGuiadaPublicConfig');
const { leerAdmisionConfig, guardarAdmisionConfig } = require('../utils/admisionCampanaConfig');
const { leerPaginasNiveles, guardarPaginasNiveles } = require('../utils/webPaginasNiveles');
const {
  isNivel,
  isSlot,
  leerMedia,
  guardarTextosMedia,
  guardarRutaSlot,
} = require('../utils/webPaginasNivelMedia');
const { leerBannerInicio, guardarBannerInicio } = require('../utils/webPaginasInicio');
const {
  leerConvenios,
  guardarPagina: guardarPaginaConvenios,
  crearItem: crearConvenioItem,
  guardarItem: guardarConvenioItem,
  guardarRutaCampo: guardarConvenioArchivo,
  eliminarItem: eliminarConvenioItem,
} = require('../utils/webPaginasConvenios');

router.use(authenticateToken);
router.use(require('../utils/coordinadorAcceso').requireAdminOCoordinadorGet);
router.use((req, res, next) => {
  if (req.user?.tipo === 'ADMINISTRADOR' || req.user?.tipo === 'COORDINADOR' || req.user?.tipo === 'DIRECTOR' || req.user?.tipo === 'CONTADOR') return next();
  return res.status(403).json({ error: 'Solo el administrador puede gestionar formularios web.' });
});

const ESTADOS = ['nuevo', 'en_revision', 'atendido', 'cerrado'];
const TIPOS_RECLAMO = ['reclamo', 'queja'];

const CORREO_FLAGS = [
  'recibe_sugerencias',
  'recibe_reclamos',
  'recibe_contacto',
  'recibe_visitas',
  'recibe_trabaja',
  'recibe_admision',
  'recibe_matricula',
];

function parseId(raw) {
  const id = parseInt(raw, 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function toBool01(v, fallback = 1) {
  // MySQL TINYINT a veces llega como Buffer
  if (Buffer.isBuffer(v)) {
    return v.length && v[0] ? 1 : 0;
  }
  if (v && typeof v === 'object' && Array.isArray(v.data)) {
    return v.data[0] ? 1 : 0;
  }
  if (v === true || v === 1 || v === '1' || v === 'true') return 1;
  if (v === false || v === 0 || v === '0' || v === 'false') return 0;
  return fallback;
}

/** Normaliza filas de config visitas para el frontend (activo siempre 0|1). */
function mapActivoRow(row) {
  if (!row) return row;
  return { ...row, activo: toBool01(row.activo, 0) };
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

function mapTrabaja(row) {
  if (!row) return null;
  return {
    ...row,
    tiene_cv: !!(row.cv_ruta || row.cv_nombre),
  };
}

async function marcarVisto(table, id) {
  const rows = await query(`SELECT id, estado FROM ${table} WHERE id = ? LIMIT 1`, [id]);
  if (!rows?.length) return { missing: true };
  let cambiado = false;
  if (String(rows[0].estado || '') === 'nuevo') {
    await execute(`UPDATE ${table} SET estado = 'en_revision' WHERE id = ? AND estado = 'nuevo'`, [id]);
    cambiado = true;
  }
  const updated = await query(`SELECT * FROM ${table} WHERE id = ? LIMIT 1`, [id]);
  return { row: updated[0], cambiado };
}

function sendFileSafe(res, filePath, downloadName, inline = true) {
  const disp = inline ? 'inline' : 'attachment';
  res.setHeader('Content-Disposition', `${disp}; filename="${encodeURIComponent(downloadName)}"`);
  return res.sendFile(filePath);
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
    console.error('[admin/web/reclamos]', e);
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
    res.status(500).json({ error: e.message || 'Error al obtener reclamo.' });
  }
});

router.post('/reclamos/:id/marcar-visto', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });
    const result = await marcarVisto('web_reclamos', id);
    if (result.missing) return res.status(404).json({ error: 'Reclamo no encontrado' });
    res.json({ reclamo: mapReclamo(result.row), cambiado: result.cambiado });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al marcar como visto.' });
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
    const filePath = resolveWebDataFile({
      ruta: adjunto_ruta,
      nombre: adjunto_nombre,
      subdirs: ['libro-reclamaciones/adjuntos'],
    });
    if (!filePath) {
      return res.status(404).json({
        error: 'Archivo adjunto no encontrado en el servidor',
        hint: 'Verifique WEB_VANGUARD_ROOT y data/libro-reclamaciones/adjuntos/',
      });
    }
    return sendFileSafe(res, filePath, adjunto_nombre || path.basename(filePath), true);
  } catch (e) {
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
    res.status(500).json({ error: e.message || 'Error al obtener sugerencia.' });
  }
});

router.post('/sugerencias/:id/marcar-visto', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });
    const result = await marcarVisto('web_sugerencias', id);
    if (result.missing) return res.status(404).json({ error: 'Sugerencia no encontrada' });
    res.json({ sugerencia: result.row, cambiado: result.cambiado });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al marcar como visto.' });
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
    res.status(500).json({ error: e.message || 'Error al eliminar sugerencia.' });
  }
});

// ─── Contáctenos ────────────────────────────────────────────────────────────

router.get('/contactenos', async (req, res) => {
  try {
    const { estado, q } = req.query;
    const params = [];
    let sql = `
      SELECT id, fecha_registro, nombre, email, telefono, asunto, mensaje, estado, ip
      FROM web_contactenos WHERE 1=1
    `;
    if (estado) {
      sql += ' AND estado = ?';
      params.push(String(estado));
    }
    if (q && String(q).trim()) {
      const like = `%${String(q).trim()}%`;
      sql += ' AND (nombre LIKE ? OR email LIKE ? OR asunto LIKE ? OR mensaje LIKE ?)';
      params.push(like, like, like, like);
    }
    sql += ' ORDER BY fecha_registro DESC, id DESC LIMIT 500';
    res.json({ contactenos: (await query(sql, params)) || [] });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al listar contactos.' });
  }
});

router.get('/contactenos/:id', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });
    const rows = await query('SELECT * FROM web_contactenos WHERE id = ? LIMIT 1', [id]);
    if (!rows?.length) return res.status(404).json({ error: 'Registro no encontrado' });
    res.json({ contacto: rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al obtener contacto.' });
  }
});

router.post('/contactenos/:id/marcar-visto', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });
    const result = await marcarVisto('web_contactenos', id);
    if (result.missing) return res.status(404).json({ error: 'Registro no encontrado' });
    res.json({ contacto: result.row, cambiado: result.cambiado });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al marcar como visto.' });
  }
});

router.put('/contactenos/:id', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });
    const rows = await query('SELECT id FROM web_contactenos WHERE id = ? LIMIT 1', [id]);
    if (!rows?.length) return res.status(404).json({ error: 'Registro no encontrado' });
    const b = req.body || {};
    const estado = b.estado != null ? String(b.estado).trim() : null;
    if (estado && !ESTADOS.includes(estado)) {
      return res.status(400).json({ error: `Estado inválido. Use: ${ESTADOS.join(', ')}` });
    }
    await execute(
      `UPDATE web_contactenos SET
        nombre = ?, email = ?, telefono = ?, asunto = ?, mensaje = ?, estado = COALESCE(?, estado)
      WHERE id = ?`,
      [
        String(b.nombre || '').trim(),
        String(b.email || '').trim(),
        b.telefono != null ? String(b.telefono).trim() || null : null,
        b.asunto != null ? String(b.asunto).trim() || null : null,
        String(b.mensaje || '').trim(),
        estado,
        id,
      ]
    );
    const updated = await query('SELECT * FROM web_contactenos WHERE id = ? LIMIT 1', [id]);
    res.json({ contacto: updated[0], message: 'Contacto actualizado' });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al actualizar.' });
  }
});

router.delete('/contactenos/:id', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });
    const r = await execute('DELETE FROM web_contactenos WHERE id = ?', [id]);
    if (!r?.affectedRows) return res.status(404).json({ error: 'Registro no encontrado' });
    res.json({ message: 'Eliminado' });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al eliminar.' });
  }
});

// ─── Visitas guiadas ────────────────────────────────────────────────────────

router.get('/visitas/opciones-filtro', async (req, res) => {
  try {
    const rows = (await query(
      `SELECT DATE_FORMAT(fecha_preferida, '%Y-%m-%d') AS fecha,
              TRIM(horario_preferido) AS horario
       FROM web_visitas_guiadas
       WHERE fecha_preferida IS NOT NULL
       ORDER BY fecha_preferida DESC, horario_preferido ASC`
    )) || [];
    const byFecha = new Map();
    for (const r of rows) {
      const fecha = String(r.fecha || '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) continue;
      if (!byFecha.has(fecha)) byFecha.set(fecha, []);
      const horario = String(r.horario || '').trim();
      const list = byFecha.get(fecha);
      if (horario && list.indexOf(horario) === -1) list.push(horario);
    }
    const fechas = [];
    byFecha.forEach((horarios, fecha) => {
      fechas.push({ fecha, horarios });
    });
    res.json({ fechas });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al listar fechas de visitas.' });
  }
});

router.get('/visitas', async (req, res) => {
  try {
    const { estado, q, fecha, horario } = req.query;
    const params = [];
    let sql = `
      SELECT id, fecha_registro, nombre, email, telefono, nivel_interes, fecha_preferida,
             horario_preferido, numero_estudiantes, mensaje, estado, ip
      FROM web_visitas_guiadas WHERE 1=1
    `;
    if (estado) {
      sql += ' AND estado = ?';
      params.push(String(estado));
    }
    if (fecha && /^\d{4}-\d{2}-\d{2}$/.test(String(fecha))) {
      sql += ' AND DATE(fecha_preferida) = ?';
      params.push(String(fecha));
    }
    if (horario && String(horario).trim()) {
      sql += ' AND horario_preferido = ?';
      params.push(String(horario).trim());
    }
    if (q && String(q).trim()) {
      const like = `%${String(q).trim()}%`;
      sql += ' AND (nombre LIKE ? OR email LIKE ? OR nivel_interes LIKE ? OR mensaje LIKE ? OR horario_preferido LIKE ?)';
      params.push(like, like, like, like, like);
    }
    if (fecha && /^\d{4}-\d{2}-\d{2}$/.test(String(fecha))) {
      sql += ' ORDER BY horario_preferido ASC, nombre ASC, id ASC LIMIT 500';
    } else {
      sql += ' ORDER BY fecha_preferida ASC, fecha_registro DESC, id DESC LIMIT 500';
    }
    res.json({ visitas: (await query(sql, params)) || [] });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al listar visitas.' });
  }
});

router.get('/visitas/:id', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });
    const rows = await query('SELECT * FROM web_visitas_guiadas WHERE id = ? LIMIT 1', [id]);
    if (!rows?.length) return res.status(404).json({ error: 'Visita no encontrada' });
    res.json({ visita: rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al obtener visita.' });
  }
});

router.post('/visitas/:id/marcar-visto', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });
    const result = await marcarVisto('web_visitas_guiadas', id);
    if (result.missing) return res.status(404).json({ error: 'Visita no encontrada' });
    res.json({ visita: result.row, cambiado: result.cambiado });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al marcar como visto.' });
  }
});

router.put('/visitas/:id', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });
    const rows = await query('SELECT id FROM web_visitas_guiadas WHERE id = ? LIMIT 1', [id]);
    if (!rows?.length) return res.status(404).json({ error: 'Visita no encontrada' });
    const b = req.body || {};
    const estado = b.estado != null ? String(b.estado).trim() : null;
    if (estado && !ESTADOS.includes(estado)) {
      return res.status(400).json({ error: `Estado inválido. Use: ${ESTADOS.join(', ')}` });
    }
    await execute(
      `UPDATE web_visitas_guiadas SET
        nombre = ?, email = ?, telefono = ?, nivel_interes = ?, fecha_preferida = ?,
        horario_preferido = ?, numero_estudiantes = ?, mensaje = ?, estado = COALESCE(?, estado)
      WHERE id = ?`,
      [
        String(b.nombre || '').trim(),
        String(b.email || '').trim(),
        b.telefono != null ? String(b.telefono).trim() || null : null,
        b.nivel_interes != null ? String(b.nivel_interes).trim() || null : null,
        b.fecha_preferida || null,
        String(b.horario_preferido || '').trim(),
        b.numero_estudiantes != null ? String(b.numero_estudiantes).trim() || null : null,
        b.mensaje != null ? String(b.mensaje).trim() || null : null,
        estado,
        id,
      ]
    );
    const updated = await query('SELECT * FROM web_visitas_guiadas WHERE id = ? LIMIT 1', [id]);
    res.json({ visita: updated[0], message: 'Visita actualizada' });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al actualizar visita.' });
  }
});

router.delete('/visitas/:id', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });
    const r = await execute('DELETE FROM web_visitas_guiadas WHERE id = ?', [id]);
    if (!r?.affectedRows) return res.status(404).json({ error: 'Visita no encontrada' });
    res.json({ message: 'Eliminada' });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al eliminar.' });
  }
});

// Config visitas: días
router.get('/visita-config/dias', async (_req, res) => {
  try {
    const rows = await query(
      `SELECT id, dia_semana, etiqueta, activo FROM web_visita_dias ORDER BY dia_semana ASC`
    );
    res.json({ dias: (rows || []).map(mapActivoRow) });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al listar días.' });
  }
});

/** Cierra visitas: desactiva días de la semana y fechas concretas. */
router.post('/visita-config/cerrar', async (_req, res) => {
  try {
    await execute(`UPDATE web_visita_dias SET activo = 0`);
    try {
      await execute(`UPDATE web_visita_fechas SET activo = 0`);
    } catch {
      /* migración 077 pendiente */
    }
    try {
      await execute(`UPDATE web_visita_secuencias SET activo = 0`);
    } catch {
      /* tabla opcional */
    }
    const rows = await query(
      `SELECT id, dia_semana, etiqueta, activo FROM web_visita_dias ORDER BY dia_semana ASC`
    );
    res.json({
      message: 'Visitas cerradas: ningún día ni fecha activa',
      dias: (rows || []).map(mapActivoRow),
    });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al cerrar visitas.' });
  }
});

router.put('/visita-config/dias/:id', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });
    const b = req.body || {};
    // Si mandan 0 explícito, no usar fallback 1
    const activo = toBool01(b.activo, b.activo === undefined ? 1 : 0);
    const etiqueta = b.etiqueta != null ? String(b.etiqueta).trim() : null;
    if (etiqueta) {
      await execute(`UPDATE web_visita_dias SET activo = ?, etiqueta = ? WHERE id = ?`, [
        activo,
        etiqueta,
        id,
      ]);
    } else {
      await execute(`UPDATE web_visita_dias SET activo = ? WHERE id = ?`, [activo, id]);
    }
    const rows = await query(`SELECT * FROM web_visita_dias WHERE id = ? LIMIT 1`, [id]);
    if (!rows?.length) return res.status(404).json({ error: 'Día no encontrado' });
    res.json({ dia: mapActivoRow(rows[0]) });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al actualizar día.' });
  }
});

// Config visitas: horarios
router.get('/visita-config/horarios', async (_req, res) => {
  try {
    const rows = await query(
      `SELECT id, etiqueta, activo, orden FROM web_visita_horarios ORDER BY orden ASC, id ASC`
    );
    res.json({ horarios: (rows || []).map(mapActivoRow) });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al listar horarios.' });
  }
});

router.post('/visita-config/horarios', async (req, res) => {
  try {
    const b = req.body || {};
    const etiqueta = String(b.etiqueta || '').trim();
    if (!etiqueta) return res.status(400).json({ error: 'Etiqueta obligatoria' });
    const activo = toBool01(b.activo, 1);
    const orden = Number.isFinite(Number(b.orden)) ? Number(b.orden) : 0;
    const r = await execute(
      `INSERT INTO web_visita_horarios (etiqueta, activo, orden) VALUES (?, ?, ?)`,
      [etiqueta, activo, orden]
    );
    const rows = await query(`SELECT * FROM web_visita_horarios WHERE id = ?`, [r.insertId]);
    res.status(201).json({ horario: rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al crear horario.' });
  }
});

router.put('/visita-config/horarios/:id', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });
    const b = req.body || {};
    const etiqueta = String(b.etiqueta || '').trim();
    if (!etiqueta) return res.status(400).json({ error: 'Etiqueta obligatoria' });
    await execute(
      `UPDATE web_visita_horarios SET etiqueta = ?, activo = ?, orden = ? WHERE id = ?`,
      [etiqueta, toBool01(b.activo, 1), Number.isFinite(Number(b.orden)) ? Number(b.orden) : 0, id]
    );
    const rows = await query(`SELECT * FROM web_visita_horarios WHERE id = ?`, [id]);
    if (!rows?.length) return res.status(404).json({ error: 'Horario no encontrado' });
    res.json({ horario: rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al actualizar horario.' });
  }
});

router.delete('/visita-config/horarios/:id', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });
    const r = await execute(`DELETE FROM web_visita_horarios WHERE id = ?`, [id]);
    if (!r?.affectedRows) return res.status(404).json({ error: 'Horario no encontrado' });
    res.json({ message: 'Horario eliminado' });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al eliminar horario.' });
  }
});

function tablaFechasFalta(e) {
  return e && (e.code === 'ER_NO_SUCH_TABLE' || e.errno === 1146);
}

async function asegurarConfigModo() {
  await execute(
    `INSERT IGNORE INTO web_visita_config (id, modo_fechas) VALUES (1, 'semana')`
  );
}

router.get('/visita-config/calendario', async (_req, res) => {
  try {
    const hoy = fechaMySQLLima();
    let modo = 'semana';
    let fechas = [];
    try {
      await asegurarConfigModo();
      modo = await leerModoFechas(query);
      const rows = await query(
        `SELECT id, DATE_FORMAT(fecha, '%Y-%m-%d') AS fecha, activo
         FROM web_visita_fechas
         WHERE fecha >= ?
         ORDER BY fecha ASC`,
        [hoy]
      );
      fechas = (rows || []).map((r) => ({
        id: Number(r.id),
        fecha: String(r.fecha).slice(0, 10),
        activo: toBool01(r.activo, 0),
      }));
    } catch (e) {
      if (!tablaFechasFalta(e)) throw e;
      return res.json({
        modo: 'semana',
        fechas: [],
        necesita_migracion: true,
      });
    }
    res.json({ modo, fechas, necesita_migracion: false });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al leer el calendario de visitas.' });
  }
});

router.put('/visita-config/modo', async (req, res) => {
  try {
    const modo = String(req.body?.modo || '').toLowerCase() === 'lista' ? 'lista' : 'semana';
    try {
      await asegurarConfigModo();
      await execute(`UPDATE web_visita_config SET modo_fechas = ? WHERE id = 1`, [modo]);
    } catch (e) {
      if (tablaFechasFalta(e)) {
        return res.status(503).json({
          error: 'Falta ejecutar la migración 077_web_visita_fechas_mysql.sql en MySQL.',
        });
      }
      throw e;
    }
    res.json({ modo });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al guardar el modo.' });
  }
});

async function upsertFechas(ymds) {
  const hoy = fechaMySQLLima();
  const unicas = [...new Set(ymds.filter(Boolean))];
  const insertadas = [];
  for (const ymd of unicas) {
    if (ymd <= hoy) continue;
    await execute(
      `INSERT INTO web_visita_fechas (fecha, activo) VALUES (?, 1)
       ON DUPLICATE KEY UPDATE activo = 1`,
      [ymd]
    );
    insertadas.push(ymd);
  }
  return insertadas;
}

router.post('/visita-config/fechas', async (req, res) => {
  try {
    const una = parseYmd(req.body?.fecha);
    const varias = Array.isArray(req.body?.fechas) ? req.body.fechas.map(parseYmd) : [];
    const ymds = una ? [una, ...varias] : varias;
    if (!ymds.length) {
      return res.status(400).json({ error: 'Indica al menos una fecha (YYYY-MM-DD).' });
    }
    const insertadas = await upsertFechas(ymds);
    if (!insertadas.length) {
      return res.status(400).json({ error: 'Las fechas deben ser posteriores a hoy.' });
    }
    res.json({ ok: true, fechas: insertadas });
  } catch (e) {
    if (tablaFechasFalta(e)) {
      return res.status(503).json({
        error: 'Falta ejecutar la migración 077_web_visita_fechas_mysql.sql en MySQL.',
      });
    }
    res.status(500).json({ error: e.message || 'Error al guardar fechas.' });
  }
});

router.post('/visita-config/fechas/generar', async (req, res) => {
  try {
    const anio = parseInt(req.body?.anio, 10);
    const mes = parseInt(req.body?.mes, 10);
    const dias = Array.isArray(req.body?.dias_semana) ? req.body.dias_semana : [];
    const hoy = fechaMySQLLima();
    const ymds = fechasPorMesYDias(anio, mes, dias, hoy);
    if (!ymds.length) {
      return res.status(400).json({
        error: 'No hay fechas futuras en ese mes para los días elegidos.',
      });
    }
    const insertadas = await upsertFechas(ymds);
    res.json({ ok: true, fechas: insertadas, total: insertadas.length });
  } catch (e) {
    if (tablaFechasFalta(e)) {
      return res.status(503).json({
        error: 'Falta ejecutar la migración 077_web_visita_fechas_mysql.sql en MySQL.',
      });
    }
    res.status(500).json({ error: e.message || 'Error al generar fechas.' });
  }
});

router.delete('/visita-config/fechas/:id', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });
    const r = await execute(`DELETE FROM web_visita_fechas WHERE id = ?`, [id]);
    if (!r?.affectedRows) return res.status(404).json({ error: 'Fecha no encontrada' });
    res.json({ message: 'Fecha quitada' });
  } catch (e) {
    if (tablaFechasFalta(e)) {
      return res.status(503).json({
        error: 'Falta ejecutar la migración 077_web_visita_fechas_mysql.sql en MySQL.',
      });
    }
    res.status(500).json({ error: e.message || 'Error al quitar la fecha.' });
  }
});

// Config visitas: secuencias
router.get('/visita-config/secuencias', async (_req, res) => {
  try {
    const secuencias = await query(
      `SELECT id, nombre, activo, creado_en FROM web_visita_secuencias ORDER BY id DESC`
    );
    const slots = await query(
      `SELECT id, secuencia_id, dia_semana, horario_id FROM web_visita_secuencia_slots ORDER BY id ASC`
    );
    res.json({ secuencias: secuencias || [], slots: slots || [] });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al listar secuencias.' });
  }
});

router.post('/visita-config/secuencias', async (req, res) => {
  try {
    const b = req.body || {};
    const nombre = String(b.nombre || '').trim();
    if (!nombre) return res.status(400).json({ error: 'Nombre obligatorio' });
    const activo = toBool01(b.activo, 1);
    const slots = Array.isArray(b.slots) ? b.slots : [];
    const r = await execute(
      `INSERT INTO web_visita_secuencias (nombre, activo) VALUES (?, ?)`,
      [nombre, activo]
    );
    const seqId = r.insertId;
    for (const s of slots) {
      const dia = Number(s.dia_semana);
      const hid = parseId(s.horario_id);
      if (!Number.isFinite(dia) || dia < 0 || dia > 6 || !hid) continue;
      await execute(
        `INSERT INTO web_visita_secuencia_slots (secuencia_id, dia_semana, horario_id) VALUES (?, ?, ?)`,
        [seqId, dia, hid]
      );
    }
    const seq = await query(`SELECT * FROM web_visita_secuencias WHERE id = ?`, [seqId]);
    const seqSlots = await query(
      `SELECT * FROM web_visita_secuencia_slots WHERE secuencia_id = ?`,
      [seqId]
    );
    res.status(201).json({ secuencia: seq[0], slots: seqSlots || [] });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al crear secuencia.' });
  }
});

router.put('/visita-config/secuencias/:id', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });
    const rows = await query(`SELECT id FROM web_visita_secuencias WHERE id = ?`, [id]);
    if (!rows?.length) return res.status(404).json({ error: 'Secuencia no encontrada' });
    const b = req.body || {};
    const nombre = String(b.nombre || '').trim();
    if (!nombre) return res.status(400).json({ error: 'Nombre obligatorio' });
    await execute(`UPDATE web_visita_secuencias SET nombre = ?, activo = ? WHERE id = ?`, [
      nombre,
      toBool01(b.activo, 1),
      id,
    ]);
    if (Array.isArray(b.slots)) {
      await execute(`DELETE FROM web_visita_secuencia_slots WHERE secuencia_id = ?`, [id]);
      for (const s of b.slots) {
        const dia = Number(s.dia_semana);
        const hid = parseId(s.horario_id);
        if (!Number.isFinite(dia) || dia < 0 || dia > 6 || !hid) continue;
        await execute(
          `INSERT INTO web_visita_secuencia_slots (secuencia_id, dia_semana, horario_id) VALUES (?, ?, ?)`,
          [id, dia, hid]
        );
      }
    }
    const seq = await query(`SELECT * FROM web_visita_secuencias WHERE id = ?`, [id]);
    const seqSlots = await query(
      `SELECT * FROM web_visita_secuencia_slots WHERE secuencia_id = ?`,
      [id]
    );
    res.json({ secuencia: seq[0], slots: seqSlots || [] });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al actualizar secuencia.' });
  }
});

router.delete('/visita-config/secuencias/:id', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });
    const r = await execute(`DELETE FROM web_visita_secuencias WHERE id = ?`, [id]);
    if (!r?.affectedRows) return res.status(404).json({ error: 'Secuencia no encontrada' });
    res.json({ message: 'Secuencia eliminada' });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al eliminar secuencia.' });
  }
});

// ─── Trabaja con nosotros ───────────────────────────────────────────────────

router.get('/trabaja', async (req, res) => {
  try {
    const { estado, q } = req.query;
    const params = [];
    let sql = `
      SELECT id, fecha_registro, nombre, email, telefono, puesto, mensaje,
             cv_nombre, cv_ruta, cv_mime, cv_size, estado, ip
      FROM web_trabaja_con_nosotros WHERE 1=1
    `;
    if (estado) {
      sql += ' AND estado = ?';
      params.push(String(estado));
    }
    if (q && String(q).trim()) {
      const like = `%${String(q).trim()}%`;
      sql += ' AND (nombre LIKE ? OR email LIKE ? OR puesto LIKE ? OR mensaje LIKE ?)';
      params.push(like, like, like, like);
    }
    sql += ' ORDER BY fecha_registro DESC, id DESC LIMIT 500';
    const rows = await query(sql, params);
    res.json({ postulaciones: (rows || []).map(mapTrabaja) });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al listar postulaciones.' });
  }
});

router.get('/trabaja/:id', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });
    const rows = await query('SELECT * FROM web_trabaja_con_nosotros WHERE id = ? LIMIT 1', [id]);
    if (!rows?.length) return res.status(404).json({ error: 'Postulación no encontrada' });
    res.json({ postulacion: mapTrabaja(rows[0]) });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al obtener postulación.' });
  }
});

router.post('/trabaja/:id/marcar-visto', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });
    const result = await marcarVisto('web_trabaja_con_nosotros', id);
    if (result.missing) return res.status(404).json({ error: 'Postulación no encontrada' });
    res.json({ postulacion: mapTrabaja(result.row), cambiado: result.cambiado });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al marcar como visto.' });
  }
});

router.put('/trabaja/:id', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });
    const rows = await query('SELECT id FROM web_trabaja_con_nosotros WHERE id = ? LIMIT 1', [id]);
    if (!rows?.length) return res.status(404).json({ error: 'Postulación no encontrada' });
    const b = req.body || {};
    const estado = b.estado != null ? String(b.estado).trim() : null;
    if (estado && !ESTADOS.includes(estado)) {
      return res.status(400).json({ error: `Estado inválido. Use: ${ESTADOS.join(', ')}` });
    }
    await execute(
      `UPDATE web_trabaja_con_nosotros SET
        nombre = ?, email = ?, telefono = ?, puesto = ?, mensaje = ?, estado = COALESCE(?, estado)
      WHERE id = ?`,
      [
        String(b.nombre || '').trim(),
        String(b.email || '').trim(),
        b.telefono != null ? String(b.telefono).trim() || null : null,
        String(b.puesto || '').trim(),
        b.mensaje != null ? String(b.mensaje).trim() || null : null,
        estado,
        id,
      ]
    );
    const updated = await query('SELECT * FROM web_trabaja_con_nosotros WHERE id = ? LIMIT 1', [id]);
    res.json({ postulacion: mapTrabaja(updated[0]), message: 'Actualizado' });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al actualizar.' });
  }
});

router.delete('/trabaja/:id', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });
    const r = await execute('DELETE FROM web_trabaja_con_nosotros WHERE id = ?', [id]);
    if (!r?.affectedRows) return res.status(404).json({ error: 'Postulación no encontrada' });
    res.json({ message: 'Eliminada' });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al eliminar.' });
  }
});

router.get('/trabaja/:id/cv', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });
    const rows = await query(
      'SELECT cv_nombre, cv_ruta, cv_mime FROM web_trabaja_con_nosotros WHERE id = ? LIMIT 1',
      [id]
    );
    if (!rows?.length) return res.status(404).json({ error: 'Postulación no encontrada' });
    const { cv_nombre, cv_ruta, cv_mime } = rows[0];
    if (!cv_nombre && !cv_ruta) {
      return res.status(404).json({ error: 'Esta postulación no tiene CV' });
    }
    const filePath = resolveWebDataFile({
      ruta: cv_ruta,
      nombre: cv_nombre,
      subdirs: ['curriculums'],
    });
    if (!filePath) {
      return res.status(404).json({
        error: 'CV no encontrado en el servidor',
        hint: 'Verifique WEB_VANGUARD_ROOT y data/curriculums/',
      });
    }
    if (cv_mime) res.setHeader('Content-Type', cv_mime);
    return sendFileSafe(res, filePath, cv_nombre || path.basename(filePath), true);
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al abrir CV.' });
  }
});

// ─── Admisión ───────────────────────────────────────────────────────────────

router.get('/admision-config', async (_req, res) => {
  try {
    const payload = await leerAdmisionConfig(query);
    res.json(payload);
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al leer config de admisión.' });
  }
});

router.put('/admision-config', async (req, res) => {
  try {
    const payload = await guardarAdmisionConfig(execute, query, req.body || {});
    if (payload.necesita_migracion) {
      return res.status(503).json({
        error: 'Falta ejecutar la migración 078 (web_admision_config).',
        ...payload,
      });
    }
    res.json({ ...payload, message: 'Configuración de admisión guardada' });
  } catch (e) {
    if (e && (e.code === 'ER_NO_SUCH_TABLE' || e.errno === 1146)) {
      return res.status(503).json({
        error: 'Falta ejecutar la migración 078 (web_admision_config).',
      });
    }
    res.status(500).json({ error: e.message || 'Error al guardar config de admisión.' });
  }
});

router.get('/admision', async (req, res) => {
  try {
    const { estado, q } = req.query;
    const params = [];
    let sql = `
      SELECT id, fecha_registro, nombres_estudiante, apellidos_estudiante, nombres_apoderado,
             dni_apoderado, telefono_apoderado, email_apoderado, direccion_apoderado, grado, estado, ip
      FROM web_admision WHERE 1=1
    `;
    if (estado) {
      sql += ' AND estado = ?';
      params.push(String(estado));
    }
    if (q && String(q).trim()) {
      const like = `%${String(q).trim()}%`;
      sql += ` AND (
        nombres_estudiante LIKE ? OR apellidos_estudiante LIKE ? OR nombres_apoderado LIKE ?
        OR dni_apoderado LIKE ? OR email_apoderado LIKE ? OR grado LIKE ?
      )`;
      params.push(like, like, like, like, like, like);
    }
    sql += ' ORDER BY fecha_registro DESC, id DESC LIMIT 500';
    res.json({ admisiones: (await query(sql, params)) || [] });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al listar admisiones.' });
  }
});

router.get('/admision/:id', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });
    const rows = await query('SELECT * FROM web_admision WHERE id = ? LIMIT 1', [id]);
    if (!rows?.length) return res.status(404).json({ error: 'Registro no encontrado' });
    res.json({ admision: rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al obtener admisión.' });
  }
});

router.post('/admision/:id/marcar-visto', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });
    const result = await marcarVisto('web_admision', id);
    if (result.missing) return res.status(404).json({ error: 'Registro no encontrado' });
    res.json({ admision: result.row, cambiado: result.cambiado });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al marcar como visto.' });
  }
});

router.put('/admision/:id', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });
    const rows = await query('SELECT id FROM web_admision WHERE id = ? LIMIT 1', [id]);
    if (!rows?.length) return res.status(404).json({ error: 'Registro no encontrado' });
    const b = req.body || {};
    const estado = b.estado != null ? String(b.estado).trim() : null;
    if (estado && !ESTADOS.includes(estado)) {
      return res.status(400).json({ error: `Estado inválido. Use: ${ESTADOS.join(', ')}` });
    }
    await execute(
      `UPDATE web_admision SET
        nombres_estudiante = ?, apellidos_estudiante = ?, nombres_apoderado = ?,
        dni_apoderado = ?, telefono_apoderado = ?, email_apoderado = ?,
        direccion_apoderado = ?, grado = ?, estado = COALESCE(?, estado)
      WHERE id = ?`,
      [
        String(b.nombres_estudiante || '').trim(),
        String(b.apellidos_estudiante || '').trim(),
        String(b.nombres_apoderado || '').trim(),
        String(b.dni_apoderado || '').trim(),
        b.telefono_apoderado != null ? String(b.telefono_apoderado).trim() || null : null,
        String(b.email_apoderado || '').trim(),
        b.direccion_apoderado != null ? String(b.direccion_apoderado).trim() || null : null,
        String(b.grado || '').trim(),
        estado,
        id,
      ]
    );
    const updated = await query('SELECT * FROM web_admision WHERE id = ? LIMIT 1', [id]);
    res.json({ admision: updated[0], message: 'Actualizado' });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al actualizar.' });
  }
});

router.delete('/admision/:id', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });
    const r = await execute('DELETE FROM web_admision WHERE id = ?', [id]);
    if (!r?.affectedRows) return res.status(404).json({ error: 'Registro no encontrado' });
    res.json({ message: 'Eliminado' });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al eliminar.' });
  }
});

// ─── Correos de envío ───────────────────────────────────────────────────────

function parseCorreoFlags(b, defaultsOn = true) {
  const flags = {};
  for (const f of CORREO_FLAGS) {
    flags[f] = toBool01(b[f], defaultsOn ? 1 : 0);
  }
  return flags;
}

function anyFlagOn(flags) {
  return CORREO_FLAGS.some((f) => flags[f] === 1);
}

router.get('/correos', async (req, res) => {
  try {
    const rows = await query(
      `SELECT id, email, etiqueta, activo,
              recibe_sugerencias, recibe_reclamos,
              recibe_contacto, recibe_visitas, recibe_trabaja, recibe_admision,
              recibe_matricula,
              creado_en
       FROM web_correos_envio
       ORDER BY activo DESC, etiqueta ASC, email ASC`
    );
    res.json({ correos: rows || [] });
  } catch (e) {
    // Fallback si faltan columnas nuevas (SQL de web aún no corrido)
    if (String(e.message || '').includes('Unknown column')) {
      try {
        const rows = await query(
          `SELECT id, email, etiqueta, activo, recibe_sugerencias, recibe_reclamos,
                  recibe_contacto, recibe_visitas, recibe_trabaja, recibe_admision, creado_en
           FROM web_correos_envio
           ORDER BY activo DESC, etiqueta ASC, email ASC`
        );
        return res.json({
          correos: (rows || []).map((r) => ({
            ...r,
            recibe_contacto: r.recibe_contacto ?? 0,
            recibe_visitas: r.recibe_visitas ?? 0,
            recibe_trabaja: r.recibe_trabaja ?? 0,
            recibe_admision: r.recibe_admision ?? 0,
            recibe_matricula: 0,
          })),
          warning:
            'Falta columna recibe_matricula en web_correos_envio. Ejecute sql/web_correos_recibe_matricula.sql',
        });
      } catch (e2) {
        try {
          const rows = await query(
            `SELECT id, email, etiqueta, activo, recibe_sugerencias, recibe_reclamos, creado_en
             FROM web_correos_envio
             ORDER BY activo DESC, etiqueta ASC, email ASC`
          );
          return res.json({
            correos: (rows || []).map((r) => ({
              ...r,
              recibe_contacto: 0,
              recibe_visitas: 0,
              recibe_trabaja: 0,
              recibe_admision: 0,
              recibe_matricula: 0,
            })),
            warning:
              'Faltan columnas recibe_* en web_correos_envio. Ejecute los SQL de canales web (incl. recibe_matricula).',
          });
        } catch (e3) {
          return res.status(500).json({ error: e3.message || 'Error al listar correos.' });
        }
      }
    }
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
    const flags = parseCorreoFlags(b, false);
    if (!anyFlagOn(flags)) {
      return res.status(400).json({ error: 'Marque al menos un canal de recepción' });
    }

    const exists = await query('SELECT id FROM web_correos_envio WHERE email = ? LIMIT 1', [email]);
    if (exists?.length) {
      return res.status(409).json({ error: 'Ese correo ya está registrado' });
    }

    const r = await execute(
      `INSERT INTO web_correos_envio
        (email, etiqueta, activo, recibe_sugerencias, recibe_reclamos,
         recibe_contacto, recibe_visitas, recibe_trabaja, recibe_admision, recibe_matricula)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        email,
        etiqueta,
        activo,
        flags.recibe_sugerencias,
        flags.recibe_reclamos,
        flags.recibe_contacto,
        flags.recibe_visitas,
        flags.recibe_trabaja,
        flags.recibe_admision,
        flags.recibe_matricula,
      ]
    );
    const rows = await query('SELECT * FROM web_correos_envio WHERE id = ? LIMIT 1', [r.insertId]);
    res.status(201).json({ correo: rows[0], message: 'Correo creado' });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Ese correo ya está registrado' });
    }
    if (String(e.message || '').includes('Unknown column')) {
      return res.status(400).json({
        error:
          'Faltan columnas de canales en web_correos_envio. Ejecute sql/web_correos_recibe_matricula.sql (y SQL previos de canales web).',
      });
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
    const flags = parseCorreoFlags(b, false);
    if (!anyFlagOn(flags)) {
      return res.status(400).json({ error: 'Marque al menos un canal de recepción' });
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
       SET email = ?, etiqueta = ?, activo = ?,
           recibe_sugerencias = ?, recibe_reclamos = ?,
           recibe_contacto = ?, recibe_visitas = ?, recibe_trabaja = ?, recibe_admision = ?,
           recibe_matricula = ?
       WHERE id = ?`,
      [
        email,
        etiqueta,
        activo,
        flags.recibe_sugerencias,
        flags.recibe_reclamos,
        flags.recibe_contacto,
        flags.recibe_visitas,
        flags.recibe_trabaja,
        flags.recibe_admision,
        flags.recibe_matricula,
        id,
      ]
    );
    const updated = await query('SELECT * FROM web_correos_envio WHERE id = ? LIMIT 1', [id]);
    res.json({ correo: updated[0], message: 'Correo actualizado' });
  } catch (e) {
    if (String(e.message || '').includes('Unknown column')) {
      return res.status(400).json({
        error:
          'Faltan columnas de canales en web_correos_envio. Ejecute sql/web_correos_recibe_matricula.sql',
      });
    }
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
    res.status(500).json({ error: e.message || 'Error al eliminar correo.' });
  }
});

/**
 * Importa destinatarios legacy de config.email_notificacion_matricula_online
 * hacia web_correos_envio con recibe_matricula=1 (idempotente; se llama también al abrir Web → Matrícula).
 */
router.post('/matricula-online/sync-correos-legacy', async (req, res) => {
  try {
    const { sincronizarDestinatariosMatriculaLegacy } = require('../utils/matriculaOnlineCorreosSync');
    const result = await sincronizarDestinatariosMatriculaLegacy();
    res.json({
      ok: true,
      imported: result.imported || 0,
      updated: result.updated || 0,
      message:
        result.message ||
        (result.skipped
          ? 'No hay correos legacy en configuración.'
          : 'Sin cambios.'),
    });
  } catch (e) {
    if (String(e.message || '').includes('Unknown column')) {
      return res.status(400).json({
        error: 'Falta columna recibe_matricula. Ejecute sql/web_correos_recibe_matricula.sql en la base de datos.',
      });
    }
    res.status(500).json({ error: e.message || 'Error al sincronizar correos.' });
  }
});

const uploadNivelImg = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      const dir = path.join(os.tmpdir(), 'intranet-web-niveles');
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      cb(null, `${Date.now()}-${sanitizeImageBasename(file.originalname)}`);
    },
  }),
  fileFilter: (_req, file, cb) => {
    const ok = /^image\/(jpeg|png|webp|gif)$/i.test(file.mimetype || '');
    cb(ok ? null : new Error('Solo JPG, PNG o WEBP'), ok);
  },
  limits: { fileSize: 12 * 1024 * 1024 },
});

const uploadConvenioPdf = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      const dir = path.join(os.tmpdir(), 'intranet-web-convenios');
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      cb(null, `${Date.now()}-${sanitizePdfBasename(file.originalname)}`);
    },
  }),
  fileFilter: (_req, file, cb) => {
    const ok =
      /^application\/pdf$/i.test(file.mimetype || '') ||
      String(file.originalname || '').toLowerCase().endsWith('.pdf');
    cb(ok ? null : new Error('Solo PDF'), ok);
  },
  limits: { fileSize: 20 * 1024 * 1024 },
});

router.get('/paginas-niveles', async (_req, res) => {
  try {
    const payload = await leerPaginasNiveles(query);
    const mediaPayload = await leerMedia(query);
    res.json({ ...payload, ...mediaPayload });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al leer inversión de niveles.' });
  }
});

router.put('/paginas-niveles/media/:nivel', async (req, res) => {
  try {
    const nivel = isNivel(req.params.nivel);
    if (!nivel) return res.status(400).json({ error: 'Nivel inválido' });
    const row = await guardarTextosMedia(execute, query, nivel, req.body || {});
    res.json({ media: row, message: 'Textos del campus guardados' });
  } catch (e) {
    if (e && (e.code === 'ER_NO_SUCH_TABLE' || e.errno === 1146)) {
      return res.status(503).json({
        error: 'Falta ejecutar la migración 088 (banners de niveles).',
      });
    }
    res.status(e.status || 500).json({ error: e.message || 'Error al guardar textos.' });
  }
});

router.post('/paginas-niveles/imagen', (req, res) => {
  uploadNivelImg.single('imagen')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'No se pudo subir la imagen' });
    }
    try {
      const nivel = isNivel(req.body?.nivel);
      const slot = isSlot(req.body?.slot);
      if (!nivel || !slot) {
        return res.status(400).json({ error: 'Indique nivel y slot (hero, campus1, campus2, campus3).' });
      }
      if (!req.file?.path) {
        return res.status(400).json({ error: 'Seleccione una imagen' });
      }
      const ext = path.extname(req.file.originalname || req.file.filename || '').toLowerCase() || '.jpg';
      const saved = saveWebPublicImage({
        subdir: 'niveles',
        publicPrefix: 'niveles',
        originalName: req.file.originalname,
        destName: `${nivel}-${slot}-${Date.now()}${ext === '.jpeg' ? '.jpg' : ext}`,
        tempPath: req.file.path,
      });
      const row = await guardarRutaSlot(execute, query, {
        nivel,
        slot,
        ruta: saved.ruta,
        removeOld: removeWebPublicFileIfSafe,
      });
      res.json({ media: row, ruta: saved.ruta, message: 'Imagen actualizada' });
    } catch (e) {
      if (e && (e.code === 'ER_NO_SUCH_TABLE' || e.errno === 1146 || e.status === 503)) {
        return res.status(503).json({
          error: 'Falta ejecutar la migración 088 (banners de niveles).',
          ...(e.payload || {}),
        });
      }
      res.status(e.status || 500).json({ error: e.message || 'Error al guardar la imagen.' });
    }
  });
});

router.get('/paginas-inicio', async (_req, res) => {
  try {
    const payload = await leerBannerInicio(query);
    res.json(payload);
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al leer el banner del inicio.' });
  }
});

router.post('/paginas-inicio/imagen', (req, res) => {
  uploadNivelImg.single('imagen')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'No se pudo subir la imagen' });
    }
    try {
      if (!req.file?.path) {
        return res.status(400).json({ error: 'Seleccione una imagen' });
      }
      const ext = path.extname(req.file.originalname || req.file.filename || '').toLowerCase() || '.jpg';
      const saved = saveWebPublicImage({
        subdir: 'inicio',
        publicPrefix: 'inicio',
        originalName: req.file.originalname,
        destName: `banner-${Date.now()}${ext === '.jpeg' ? '.jpg' : ext}`,
        tempPath: req.file.path,
      });
      const payload = await guardarBannerInicio(execute, query, {
        ruta: saved.ruta,
        removeOld: removeWebPublicFileIfSafe,
      });
      res.json({ ...payload, ruta: saved.ruta, message: 'Banner del inicio actualizado' });
    } catch (e) {
      if (e && (e.code === 'ER_NO_SUCH_TABLE' || e.errno === 1146 || e.status === 503)) {
        return res.status(503).json({
          error: 'Falta ejecutar la migración 090 (banner del inicio).',
          ...(e.payload || {}),
        });
      }
      res.status(e.status || 500).json({ error: e.message || 'Error al guardar el banner.' });
    }
  });
});

router.get('/paginas-niveles/archivo', async (req, res) => {
  try {
    const ruta = String(req.query.ruta || '').trim();
    if (!ruta.startsWith('/') || ruta.includes('..')) {
      return res.status(400).json({ error: 'Ruta inválida' });
    }
    const root = path.resolve(resolveWebVanguardRoot());
    const publicRoot = path.join(root, 'public');
    const abs = path.resolve(path.join(publicRoot, ruta.replace(/^[/\\]+/, '')));
    if (!isUnderRoot(abs, publicRoot) || !fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
      return res.status(404).json({ error: 'Imagen no encontrada' });
    }
    res.sendFile(abs);
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al leer imagen.' });
  }
});

router.get('/paginas-convenios', async (_req, res) => {
  try {
    const payload = await leerConvenios(query);
    res.json(payload);
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al leer convenios.' });
  }
});

router.put('/paginas-convenios', async (req, res) => {
  try {
    const payload = await guardarPaginaConvenios(execute, query, req.body || {});
    if (payload.necesita_migracion_convenios) {
      return res.status(503).json({
        error: 'Falta ejecutar la migración 098 (página Convenios).',
        ...payload,
      });
    }
    res.json({ ...payload, message: 'Textos de Convenios guardados' });
  } catch (e) {
    if (e && (e.code === 'ER_NO_SUCH_TABLE' || e.errno === 1146)) {
      return res.status(503).json({
        error: 'Falta ejecutar la migración 098 (página Convenios).',
      });
    }
    res.status(e.status || 500).json({ error: e.message || 'Error al guardar Convenios.' });
  }
});

router.post('/paginas-convenios/items', async (req, res) => {
  try {
    const payload = await crearConvenioItem(execute, query, req.body || {});
    res.status(201).json({ ...payload, message: 'Convenio creado' });
  } catch (e) {
    if (e && (e.code === 'ER_NO_SUCH_TABLE' || e.errno === 1146 || e.status === 503)) {
      return res.status(503).json({
        error: 'Falta ejecutar la migración 098 (página Convenios).',
        ...(e.payload || {}),
      });
    }
    res.status(e.status || 500).json({ error: e.message || 'Error al crear el convenio.' });
  }
});

router.put('/paginas-convenios/items/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ error: 'Id inválido' });
    }
    const payload = await guardarConvenioItem(execute, query, id, req.body || {});
    res.json({ ...payload, message: 'Convenio actualizado' });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'Error al guardar el convenio.' });
  }
});

router.delete('/paginas-convenios/items/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ error: 'Id inválido' });
    }
    const payload = await eliminarConvenioItem(execute, query, id, removeWebPublicFileIfSafe);
    res.json({ ...payload, message: 'Convenio eliminado' });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'Error al eliminar el convenio.' });
  }
});

router.post('/paginas-convenios/items/:id/imagen', (req, res) => {
  uploadNivelImg.single('imagen')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'No se pudo subir la imagen' });
    }
    try {
      const id = Number(req.params.id);
      const slot = String(req.body?.slot || '').trim();
      if (!Number.isInteger(id) || id < 1) {
        return res.status(400).json({ error: 'Id inválido' });
      }
      if (slot !== 'logo' && slot !== 'imagen') {
        return res.status(400).json({ error: 'Indique slot logo o imagen.' });
      }
      if (!req.file?.path) {
        return res.status(400).json({ error: 'Seleccione una imagen' });
      }
      const ext = path.extname(req.file.originalname || req.file.filename || '').toLowerCase() || '.jpg';
      const saved = saveWebPublicImage({
        subdir: 'convenios',
        publicPrefix: 'convenios',
        originalName: req.file.originalname,
        destName: `${slot}-${id}-${Date.now()}${ext === '.jpeg' ? '.jpg' : ext}`,
        tempPath: req.file.path,
      });
      const payload = await guardarConvenioArchivo(execute, query, {
        id,
        campo: slot === 'logo' ? 'logo_ruta' : 'imagen_ruta',
        ruta: saved.ruta,
        removeOld: removeWebPublicFileIfSafe,
      });
      res.json({ ...payload, ruta: saved.ruta, message: 'Imagen actualizada' });
    } catch (e) {
      if (e && (e.code === 'ER_NO_SUCH_TABLE' || e.errno === 1146 || e.status === 503)) {
        return res.status(503).json({
          error: 'Falta ejecutar la migración 098 (página Convenios).',
          ...(e.payload || {}),
        });
      }
      res.status(e.status || 500).json({ error: e.message || 'Error al guardar la imagen.' });
    }
  });
});

router.post('/paginas-convenios/items/:id/pdf', (req, res) => {
  uploadConvenioPdf.single('pdf')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'No se pudo subir el PDF' });
    }
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id < 1) {
        return res.status(400).json({ error: 'Id inválido' });
      }
      if (!req.file?.path) {
        return res.status(400).json({ error: 'Seleccione un PDF' });
      }
      const saved = saveWebPublicPdf({
        subdir: 'convenios',
        publicPrefix: 'convenios',
        originalName: req.file.originalname,
        destName: `convenio-${id}-${Date.now()}.pdf`,
        tempPath: req.file.path,
      });
      const payload = await guardarConvenioArchivo(execute, query, {
        id,
        campo: 'pdf_ruta',
        ruta: saved.ruta,
        removeOld: removeWebPublicFileIfSafe,
      });
      res.json({ ...payload, ruta: saved.ruta, message: 'PDF actualizado' });
    } catch (e) {
      if (e && (e.code === 'ER_NO_SUCH_TABLE' || e.errno === 1146 || e.status === 503)) {
        return res.status(503).json({
          error: 'Falta ejecutar la migración 098 (página Convenios).',
          ...(e.payload || {}),
        });
      }
      res.status(e.status || 500).json({ error: e.message || 'Error al guardar el PDF.' });
    }
  });
});

router.put('/paginas-niveles', async (req, res) => {
  try {
    const payload = await guardarPaginasNiveles(execute, query, req.body || {});
    if (payload.necesita_migracion) {
      return res.status(503).json({
        error: 'Falta ejecutar la migración 080 (web_paginas_niveles).',
        ...payload,
      });
    }
    res.json({ ...payload, message: 'Inversión de niveles guardada' });
  } catch (e) {
    if (e && (e.code === 'ER_NO_SUCH_TABLE' || e.errno === 1146)) {
      return res.status(503).json({
        error: 'Falta ejecutar la migración 080 (web_paginas_niveles).',
      });
    }
    res.status(500).json({ error: e.message || 'Error al guardar inversión de niveles.' });
  }
});

router.get('/meta', async (_req, res) => {
  const root = resolveWebVanguardRoot();
  const adj = path.join(root, 'data', 'libro-reclamaciones', 'adjuntos');
  const cvs = path.join(root, 'data', 'curriculums');
  res.json({
    estados: ESTADOS,
    tipos_reclamo: TIPOS_RECLAMO,
    canales: ['reclamos', 'sugerencias', 'contacto', 'visitas', 'trabaja', 'admision', 'matricula'],
    correo_flags: CORREO_FLAGS,
    web_vanguard_root: root,
    adjuntos_dir: adj,
    adjuntos_dir_existe: fs.existsSync(adj),
    curriculums_dir: cvs,
    curriculums_dir_existe: fs.existsSync(cvs),
  });
});

module.exports = router;
