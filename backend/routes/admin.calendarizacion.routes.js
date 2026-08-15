/**
 * Admin — Calendarización web pública.
 * Tablas: web_calendarizacion, web_calendarizacion_conceptos, web_calendarizacion_eventos
 */
const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { query, execute } = require('../utils/mysql');

router.use(authenticateToken);
router.use((req, res, next) => {
  if (req.user?.tipo === 'ADMINISTRADOR') return next();
  return res.status(403).json({ error: 'Solo el administrador puede gestionar la calendarización.' });
});

const MESES = [
  { value: 1, label: 'Enero' },
  { value: 2, label: 'Febrero' },
  { value: 3, label: 'Marzo' },
  { value: 4, label: 'Abril' },
  { value: 5, label: 'Mayo' },
  { value: 6, label: 'Junio' },
  { value: 7, label: 'Julio' },
  { value: 8, label: 'Agosto' },
  { value: 9, label: 'Septiembre' },
  { value: 10, label: 'Octubre' },
  { value: 11, label: 'Noviembre' },
  { value: 12, label: 'Diciembre' },
];

function parseId(raw) {
  const id = parseInt(raw, 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function toBool01(v, fallback = 1) {
  if (Buffer.isBuffer(v)) return v.length && v[0] ? 1 : 0;
  if (v && typeof v === 'object' && Array.isArray(v.data)) return v.data[0] ? 1 : 0;
  if (v === true || v === 1 || v === '1' || v === 'true') return 1;
  if (v === false || v === 0 || v === '0' || v === 'false') return 0;
  return fallback;
}

function mapActivo(row) {
  if (!row) return row;
  return { ...row, activo: toBool01(row.activo, 0) };
}

function normalizeHex(c, fallback = '#3b82f6') {
  const s = String(c || '').trim();
  if (/^#[0-9a-fA-F]{3,8}$/.test(s)) return s;
  return fallback;
}

function validateEventoBody(b) {
  const anio = parseInt(b.anio, 10);
  const mes = parseInt(b.mes, 10);
  const tipo = String(b.tipo || '').trim();
  const texto = String(b.texto || '').trim();
  const modo = String(b.modo || '').toLowerCase() === 'rango' ? 'rango' : 'dia';
  const orden = Number.isFinite(Number(b.orden)) ? Number(b.orden) : 0;
  const activo = toBool01(b.activo, 1);
  const color = normalizeHex(b.color);
  const color_texto = normalizeHex(b.color_texto, '#ffffff');

  if (!Number.isFinite(anio) || anio < 2000 || anio > 2100) {
    return { error: 'Año inválido' };
  }
  if (!Number.isFinite(mes) || mes < 1 || mes > 12) {
    return { error: 'Mes inválido (1-12)' };
  }
  if (!tipo) return { error: 'Tipo/concepto obligatorio' };
  if (!texto) return { error: 'Texto obligatorio' };

  let dia = null;
  let rango_inicio = null;
  let rango_fin = null;

  if (modo === 'dia') {
    dia = parseInt(b.dia, 10);
    if (!Number.isFinite(dia) || dia < 1 || dia > 31) {
      return { error: 'Día inválido (1-31)' };
    }
  } else {
    rango_inicio = parseInt(b.rango_inicio, 10);
    rango_fin = parseInt(b.rango_fin, 10);
    if (!Number.isFinite(rango_inicio) || !Number.isFinite(rango_fin)) {
      return { error: 'Rango inicio/fin obligatorio' };
    }
    if (rango_inicio < 1 || rango_inicio > 31 || rango_fin < 1 || rango_fin > 31) {
      return { error: 'Rango debe estar entre 1 y 31' };
    }
    if (rango_inicio > rango_fin) {
      return { error: 'El inicio del rango no puede ser mayor que el fin' };
    }
  }

  return {
    data: {
      anio,
      mes,
      tipo,
      color,
      color_texto,
      dia,
      rango_inicio,
      rango_fin,
      texto,
      orden,
      activo,
    },
  };
}

// ─── Meta / años ────────────────────────────────────────────────────────────

router.get('/meta', async (_req, res) => {
  res.json({ meses: MESES });
});

router.get('/anios', async (_req, res) => {
  try {
    const rows = await query(
      `SELECT id, anio, activo, creado_en FROM web_calendarizacion ORDER BY anio DESC`
    );
    res.json({ anios: (rows || []).map(mapActivo) });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al listar años.' });
  }
});

router.post('/anios', async (req, res) => {
  try {
    const anio = parseInt(req.body?.anio, 10);
    if (!Number.isFinite(anio) || anio < 2000 || anio > 2100) {
      return res.status(400).json({ error: 'Año inválido' });
    }
    const activo = toBool01(req.body?.activo, 1);
    const exists = await query(`SELECT id FROM web_calendarizacion WHERE anio = ? LIMIT 1`, [anio]);
    if (exists?.length) {
      return res.status(409).json({ error: 'Ese año ya existe' });
    }
    const r = await execute(`INSERT INTO web_calendarizacion (anio, activo) VALUES (?, ?)`, [
      anio,
      activo,
    ]);
    const rows = await query(`SELECT * FROM web_calendarizacion WHERE id = ?`, [r.insertId]);
    res.status(201).json({ anio: mapActivo(rows[0]) });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al crear año.' });
  }
});

router.put('/anios/:id', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });
    const rows = await query(`SELECT id FROM web_calendarizacion WHERE id = ?`, [id]);
    if (!rows?.length) return res.status(404).json({ error: 'Año no encontrado' });

    const b = req.body || {};
    const activo = toBool01(b.activo, 1);
    // Si se activa este año, opcionalmente desactivar los demás
    if (activo === 1 && b.unico_activo) {
      await execute(`UPDATE web_calendarizacion SET activo = 0 WHERE id <> ?`, [id]);
    }
    await execute(`UPDATE web_calendarizacion SET activo = ? WHERE id = ?`, [activo, id]);
    const updated = await query(`SELECT * FROM web_calendarizacion WHERE id = ?`, [id]);
    res.json({ anio: mapActivo(updated[0]) });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al actualizar año.' });
  }
});

// ─── Conceptos ──────────────────────────────────────────────────────────────

router.get('/conceptos', async (_req, res) => {
  try {
    const rows = await query(
      `SELECT id, codigo, etiqueta, color, color_texto, activo, orden
       FROM web_calendarizacion_conceptos
       ORDER BY orden ASC, id ASC`
    );
    res.json({ conceptos: (rows || []).map(mapActivo) });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al listar conceptos.' });
  }
});

router.post('/conceptos', async (req, res) => {
  try {
    const b = req.body || {};
    const codigo = String(b.codigo || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_');
    const etiqueta = String(b.etiqueta || '').trim();
    if (!codigo || !etiqueta) {
      return res.status(400).json({ error: 'Código y etiqueta obligatorios' });
    }
    const color = normalizeHex(b.color);
    const color_texto = normalizeHex(b.color_texto, '#ffffff');
    const activo = toBool01(b.activo, 1);
    const orden = Number.isFinite(Number(b.orden)) ? Number(b.orden) : 0;

    const r = await execute(
      `INSERT INTO web_calendarizacion_conceptos (codigo, etiqueta, color, color_texto, activo, orden)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [codigo, etiqueta, color, color_texto, activo, orden]
    );
    const rows = await query(`SELECT * FROM web_calendarizacion_conceptos WHERE id = ?`, [r.insertId]);
    res.status(201).json({ concepto: mapActivo(rows[0]) });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Ese código de concepto ya existe' });
    }
    res.status(500).json({ error: e.message || 'Error al crear concepto.' });
  }
});

router.put('/conceptos/:id', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });
    const rows = await query(`SELECT id FROM web_calendarizacion_conceptos WHERE id = ?`, [id]);
    if (!rows?.length) return res.status(404).json({ error: 'Concepto no encontrado' });

    const b = req.body || {};
    const codigo = String(b.codigo || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_');
    const etiqueta = String(b.etiqueta || '').trim();
    if (!codigo || !etiqueta) {
      return res.status(400).json({ error: 'Código y etiqueta obligatorios' });
    }
    await execute(
      `UPDATE web_calendarizacion_conceptos
       SET codigo = ?, etiqueta = ?, color = ?, color_texto = ?, activo = ?, orden = ?
       WHERE id = ?`,
      [
        codigo,
        etiqueta,
        normalizeHex(b.color),
        normalizeHex(b.color_texto, '#ffffff'),
        toBool01(b.activo, 1),
        Number.isFinite(Number(b.orden)) ? Number(b.orden) : 0,
        id,
      ]
    );
    const updated = await query(`SELECT * FROM web_calendarizacion_conceptos WHERE id = ?`, [id]);
    res.json({ concepto: mapActivo(updated[0]) });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Ese código de concepto ya existe' });
    }
    res.status(500).json({ error: e.message || 'Error al actualizar concepto.' });
  }
});

router.delete('/conceptos/:id', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });
    const r = await execute(`DELETE FROM web_calendarizacion_conceptos WHERE id = ?`, [id]);
    if (!r?.affectedRows) return res.status(404).json({ error: 'Concepto no encontrado' });
    res.json({ message: 'Concepto eliminado' });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al eliminar concepto.' });
  }
});

// ─── Eventos ────────────────────────────────────────────────────────────────

router.get('/eventos', async (req, res) => {
  try {
    const anio = parseInt(req.query.anio, 10);
    if (!Number.isFinite(anio)) {
      return res.status(400).json({ error: 'Parámetro anio obligatorio' });
    }
    const params = [anio];
    let sql = `
      SELECT id, anio, mes, tipo, color, color_texto, dia, rango_inicio, rango_fin, texto, orden, activo
      FROM web_calendarizacion_eventos
      WHERE anio = ?
    `;
    if (req.query.mes) {
      const mes = parseInt(req.query.mes, 10);
      if (Number.isFinite(mes) && mes >= 1 && mes <= 12) {
        sql += ' AND mes = ?';
        params.push(mes);
      }
    }
    if (req.query.activo === '1' || req.query.activo === '0') {
      sql += ' AND activo = ?';
      params.push(Number(req.query.activo));
    }
    if (req.query.q && String(req.query.q).trim()) {
      sql += ' AND (texto LIKE ? OR tipo LIKE ?)';
      const like = `%${String(req.query.q).trim()}%`;
      params.push(like, like);
    }
    sql += ' ORDER BY mes ASC, orden ASC, id ASC';
    const rows = await query(sql, params);
    res.json({
      eventos: (rows || []).map((r) => ({
        ...mapActivo(r),
        modo: r.dia != null ? 'dia' : 'rango',
      })),
    });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al listar eventos.' });
  }
});

router.get('/eventos/:id', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });
    const rows = await query(`SELECT * FROM web_calendarizacion_eventos WHERE id = ? LIMIT 1`, [id]);
    if (!rows?.length) return res.status(404).json({ error: 'Evento no encontrado' });
    const r = rows[0];
    res.json({ evento: { ...mapActivo(r), modo: r.dia != null ? 'dia' : 'rango' } });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al obtener evento.' });
  }
});

router.post('/eventos', async (req, res) => {
  try {
    const checked = validateEventoBody(req.body || {});
    if (checked.error) return res.status(400).json({ error: checked.error });
    const d = checked.data;
    const r = await execute(
      `INSERT INTO web_calendarizacion_eventos
        (anio, mes, tipo, color, color_texto, dia, rango_inicio, rango_fin, texto, orden, activo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        d.anio,
        d.mes,
        d.tipo,
        d.color,
        d.color_texto,
        d.dia,
        d.rango_inicio,
        d.rango_fin,
        d.texto,
        d.orden,
        d.activo,
      ]
    );
    const rows = await query(`SELECT * FROM web_calendarizacion_eventos WHERE id = ?`, [r.insertId]);
    const ev = rows[0];
    res.status(201).json({ evento: { ...mapActivo(ev), modo: ev.dia != null ? 'dia' : 'rango' } });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al crear evento.' });
  }
});

router.put('/eventos/:id', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });
    const rows = await query(`SELECT id FROM web_calendarizacion_eventos WHERE id = ?`, [id]);
    if (!rows?.length) return res.status(404).json({ error: 'Evento no encontrado' });

    const checked = validateEventoBody(req.body || {});
    if (checked.error) return res.status(400).json({ error: checked.error });
    const d = checked.data;

    await execute(
      `UPDATE web_calendarizacion_eventos SET
        anio = ?, mes = ?, tipo = ?, color = ?, color_texto = ?,
        dia = ?, rango_inicio = ?, rango_fin = ?, texto = ?, orden = ?, activo = ?
       WHERE id = ?`,
      [
        d.anio,
        d.mes,
        d.tipo,
        d.color,
        d.color_texto,
        d.dia,
        d.rango_inicio,
        d.rango_fin,
        d.texto,
        d.orden,
        d.activo,
        id,
      ]
    );
    const updated = await query(`SELECT * FROM web_calendarizacion_eventos WHERE id = ?`, [id]);
    const ev = updated[0];
    res.json({ evento: { ...mapActivo(ev), modo: ev.dia != null ? 'dia' : 'rango' } });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al actualizar evento.' });
  }
});

router.delete('/eventos/:id', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });
    const r = await execute(`DELETE FROM web_calendarizacion_eventos WHERE id = ?`, [id]);
    if (!r?.affectedRows) return res.status(404).json({ error: 'Evento no encontrado' });
    res.json({ message: 'Evento eliminado' });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al eliminar evento.' });
  }
});

module.exports = router;
