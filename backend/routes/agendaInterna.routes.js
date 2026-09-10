/**
 * Agenda interna — calendario operativo del colegio.
 * GET: admin, coordinador, promotoría, dirección, docente.
 * POST/PUT/PATCH/DELETE: admin, coordinador, promotoría, dirección.
 */
const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { query, execute } = require('../utils/mysql');
const { fechaHoraMySQLLima, fechaMySQLLima } = require('../utils/fechaHoraLima');
const {
  TIPOS_EVENTO,
  AVISO_DIAS_PERMITIDOS,
  ROLES_AVISO_PERMITIDOS,
  puedeVerAgendaInterna,
  puedeGestionarAgendaInterna,
  parseAvisoDias,
  parseAvisosRoles,
  serializarAvisoDias,
  serializarAvisosRoles,
  tipoEventoMeta,
  ymdDeValor,
  diasHasta,
  urgenciaDeDias,
  sanitizarTexto,
  tableMissing,
} = require('../utils/agendaInterna');
const { notificarCreacionAgendaInterna } = require('../services/agendaInternaNotificacionService');

router.use(authenticateToken);

function requireVer(req, res, next) {
  if (!puedeVerAgendaInterna(req.user?.tipo)) {
    return res.status(403).json({ error: 'No tienes acceso a la agenda interna.' });
  }
  next();
}

function requireGestionar(req, res, next) {
  if (!puedeGestionarAgendaInterna(req.user?.tipo)) {
    return res.status(403).json({ error: 'Solo administración, coordinación, promotoría y dirección pueden gestionar avisos.' });
  }
  next();
}

function payloadSinTabla() {
  return {
    error: 'Falta ejecutar la migración 085_agenda_interna_mysql.sql',
    code: 'AGENDA_INTERNA_NO_TABLA',
  };
}

function handleError(res, e, etiqueta) {
  if (tableMissing(e)) {
    return res.status(503).json(payloadSinTabla());
  }
  console.error(`[agenda-interna] ${etiqueta}`, e);
  return res.status(500).json({ error: e.message || 'Error en agenda interna.' });
}

function parseId(raw) {
  const id = parseInt(raw, 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function serializarEvento(row, hoyYmd) {
  if (!row) return null;
  const fecha_inicio = ymdDeValor(row.fecha_inicio);
  const fecha_fin = ymdDeValor(row.fecha_fin);
  const dias = diasHasta(fecha_fin, hoyYmd);
  const meta = tipoEventoMeta(row.tipo);
  return {
    id: row.id,
    colegio_id: row.colegio_id,
    titulo: row.titulo,
    descripcion: row.descripcion || '',
    tipo: meta.codigo,
    tipo_etiqueta: meta.etiqueta,
    tipo_icono: meta.icono,
    tipo_color: meta.color,
    lugar: row.lugar || '',
    fecha_inicio,
    fecha_fin,
    estado: row.estado,
    aviso_dias: parseAvisoDias(row.aviso_dias),
    avisos_roles: parseAvisosRoles(row.avisos_roles),
    creado_por: row.creado_por,
    creador_nombre: row.creador_nombre || '',
    hecho_por: row.hecho_por,
    hecho_nombre: row.hecho_nombre || '',
    hecho_en: row.hecho_en,
    created_at: row.created_at,
    updated_at: row.updated_at,
    dias_restantes: dias,
    urgencia: urgenciaDeDias(dias, row.estado),
  };
}

const SELECT_EVENTO = `
  SELECT e.*,
    TRIM(CONCAT(COALESCE(pc.nombres,''), ' ', COALESCE(pc.apellidos,''))) AS creador_nombre,
    TRIM(CONCAT(COALESCE(ph.nombres,''), ' ', COALESCE(ph.apellidos,''))) AS hecho_nombre
  FROM agenda_interna_eventos e
  LEFT JOIN usuarios uc ON uc.id = e.creado_por
  LEFT JOIN personal pc ON pc.id = uc.personal_id
  LEFT JOIN usuarios uh ON uh.id = e.hecho_por
  LEFT JOIN personal ph ON ph.id = uh.personal_id
`;

async function obtenerEvento(id, colegioId) {
  const rows = await query(
    `${SELECT_EVENTO} WHERE e.id = ? AND e.colegio_id = ? LIMIT 1`,
    [id, colegioId]
  );
  return rows && rows[0] ? rows[0] : null;
}

function validarCuerpo(body, { parcial = false } = {}) {
  const out = {};
  if (!parcial || body.titulo != null) {
    const titulo = sanitizarTexto(body.titulo, 160);
    if (!titulo) return { error: 'Escribe un título corto.' };
    out.titulo = titulo;
  }
  if (!parcial || body.descripcion != null) {
    out.descripcion = sanitizarTexto(body.descripcion, 4000) || null;
  }
  if (!parcial || body.lugar != null) {
    out.lugar = sanitizarTexto(body.lugar, 160) || null;
  }
  if (!parcial || body.tipo != null) {
    const meta = tipoEventoMeta(body.tipo);
    out.tipo = meta.codigo;
  }
  if (!parcial || body.fecha_inicio != null || body.fecha_fin != null) {
    const ini = ymdDeValor(body.fecha_inicio);
    const fin = ymdDeValor(body.fecha_fin) || ini;
    if (!ini) return { error: 'Indica la fecha.' };
    if (fin < ini) return { error: 'La fecha de fin no puede ser anterior al inicio.' };
    out.fecha_inicio = ini;
    out.fecha_fin = fin;
  }
  if (!parcial || body.aviso_dias != null) {
    out.aviso_dias = serializarAvisoDias(body.aviso_dias);
  }
  if (!parcial || body.avisos_roles != null) {
    out.avisos_roles = serializarAvisosRoles(body.avisos_roles);
  }
  if (body.estado != null && ['PENDIENTE', 'HECHO', 'CANCELADO'].includes(String(body.estado).toUpperCase())) {
    out.estado = String(body.estado).toUpperCase();
  }
  return { data: out };
}

router.get('/meta', requireVer, (req, res) => {
  res.json({
    puede_gestionar: puedeGestionarAgendaInterna(req.user?.tipo),
    tipos: TIPOS_EVENTO,
    aviso_dias: AVISO_DIAS_PERMITIDOS,
    avisos_roles: ROLES_AVISO_PERMITIDOS.map((codigo) => ({
      codigo,
      etiqueta:
        codigo === 'ADMINISTRADOR'
          ? 'Administrador'
          : codigo === 'COORDINADOR'
            ? 'Coordinación'
            : codigo === 'PROMOTORIA'
              ? 'Promotoría'
              : codigo === 'DIRECTOR'
                ? 'Dirección'
                : 'Docentes',
    })),
  });
});

router.get('/proximos', requireVer, async (req, res) => {
  try {
    const colegio_id = parseInt(req.user.colegio_id, 10);
    const hoy = fechaMySQLLima();
    const rows = await query(
      `${SELECT_EVENTO}
       WHERE e.colegio_id = ?
         AND e.estado = 'PENDIENTE'
         AND e.fecha_fin >= DATE_SUB(?, INTERVAL 14 DAY)
       ORDER BY e.fecha_fin ASC, e.id ASC
       LIMIT 40`,
      [colegio_id, hoy]
    );
    res.json({
      hoy,
      puede_gestionar: puedeGestionarAgendaInterna(req.user?.tipo),
      eventos: (rows || []).map((r) => serializarEvento(r, hoy)),
    });
  } catch (e) {
    return handleError(res, e, 'proximos');
  }
});

router.get('/eventos', requireVer, async (req, res) => {
  try {
    const colegio_id = parseInt(req.user.colegio_id, 10);
    const hoy = fechaMySQLLima();
    const anio = parseInt(req.query.anio, 10);
    const mes = parseInt(req.query.mes, 10);
    let desde = ymdDeValor(req.query.desde);
    let hasta = ymdDeValor(req.query.hasta);

    if (!desde || !hasta) {
      const y = Number.isFinite(anio) ? anio : parseInt(hoy.slice(0, 4), 10);
      const m = Number.isFinite(mes) && mes >= 1 && mes <= 12 ? mes : parseInt(hoy.slice(5, 7), 10);
      const last = new Date(y, m, 0).getDate();
      desde = `${y}-${String(m).padStart(2, '0')}-01`;
      hasta = `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
    }

    const estado = String(req.query.estado || '').toUpperCase();
    const tipo = String(req.query.tipo || '').toUpperCase();
    const params = [colegio_id, hasta, desde];
    let extra = '';
    if (TIPOS_EVENTO.some((t) => t.codigo === tipo)) {
      extra += ' AND e.tipo = ?';
      params.push(tipo);
    }

    const rows = await query(
      `${SELECT_EVENTO}
       WHERE e.colegio_id = ?
         AND e.fecha_inicio <= ?
         AND e.fecha_fin >= ?
         ${extra}
       ORDER BY e.fecha_inicio ASC, e.id ASC`,
      params
    );

    const todos = (rows || []).map((r) => serializarEvento(r, hoy));
    const pendientes = todos.filter((e) => e.estado === 'PENDIENTE');
    const eventos = ['PENDIENTE', 'HECHO', 'CANCELADO'].includes(estado)
      ? todos.filter((e) => e.estado === estado)
      : todos;
    res.json({
      hoy,
      desde,
      hasta,
      puede_gestionar: puedeGestionarAgendaInterna(req.user?.tipo),
      resumen: {
        pendientes: pendientes.length,
        hoy: pendientes.filter((e) => e.urgencia === 'hoy').length,
        vencidos: pendientes.filter((e) => e.urgencia === 'vencido').length,
        proximos: pendientes.filter((e) => e.urgencia === 'proximo').length,
      },
      eventos,
    });
  } catch (e) {
    return handleError(res, e, 'listar');
  }
});

router.get('/eventos/:id', requireVer, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Aviso no válido.' });
    const row = await obtenerEvento(id, parseInt(req.user.colegio_id, 10));
    if (!row) return res.status(404).json({ error: 'Aviso no encontrado.' });
    res.json({
      puede_gestionar: puedeGestionarAgendaInterna(req.user?.tipo),
      evento: serializarEvento(row, fechaMySQLLima()),
    });
  } catch (e) {
    return handleError(res, e, 'detalle');
  }
});

router.post('/eventos', requireVer, requireGestionar, async (req, res) => {
  try {
    const v = validarCuerpo(req.body || {});
    if (v.error) return res.status(400).json({ error: v.error });
    const d = v.data;
    const colegio_id = parseInt(req.user.colegio_id, 10);
    const usuario_id = parseInt(req.user.usuario_id, 10);
    const now = fechaHoraMySQLLima();
    const r = await execute(
      `INSERT INTO agenda_interna_eventos
        (colegio_id, titulo, descripcion, tipo, lugar, fecha_inicio, fecha_fin, estado,
         aviso_dias, avisos_roles, creado_por, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDIENTE', ?, ?, ?, ?)`,
      [
        colegio_id,
        d.titulo,
        d.descripcion,
        d.tipo,
        d.lugar,
        d.fecha_inicio,
        d.fecha_fin,
        d.aviso_dias,
        d.avisos_roles,
        usuario_id,
        now,
      ]
    );
    const row = await obtenerEvento(r.insertId, colegio_id);
    const evento = serializarEvento(row, fechaMySQLLima());
    notificarCreacionAgendaInterna(row).catch((err) =>
      console.warn('📅 [AGENDA-INTERNA] Aviso creación:', err.message)
    );
    res.status(201).json({ evento });
  } catch (e) {
    return handleError(res, e, 'crear');
  }
});

router.put('/eventos/:id', requireVer, requireGestionar, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Aviso no válido.' });
    const colegio_id = parseInt(req.user.colegio_id, 10);
    const actual = await obtenerEvento(id, colegio_id);
    if (!actual) return res.status(404).json({ error: 'Aviso no encontrado.' });
    const v = validarCuerpo(
      {
        titulo: req.body?.titulo ?? actual.titulo,
        descripcion: req.body?.descripcion ?? actual.descripcion,
        tipo: req.body?.tipo ?? actual.tipo,
        lugar: req.body?.lugar ?? actual.lugar,
        fecha_inicio: req.body?.fecha_inicio ?? actual.fecha_inicio,
        fecha_fin: req.body?.fecha_fin ?? actual.fecha_fin,
        aviso_dias: req.body?.aviso_dias ?? actual.aviso_dias,
        avisos_roles: req.body?.avisos_roles ?? actual.avisos_roles,
      },
      { parcial: false }
    );
    if (v.error) return res.status(400).json({ error: v.error });
    const d = v.data;
    await execute(
      `UPDATE agenda_interna_eventos
       SET titulo = ?, descripcion = ?, tipo = ?, lugar = ?, fecha_inicio = ?, fecha_fin = ?,
           aviso_dias = ?, avisos_roles = ?, updated_at = ?
       WHERE id = ? AND colegio_id = ?`,
      [
        d.titulo,
        d.descripcion,
        d.tipo,
        d.lugar,
        d.fecha_inicio,
        d.fecha_fin,
        d.aviso_dias,
        d.avisos_roles,
        fechaHoraMySQLLima(),
        id,
        colegio_id,
      ]
    );
    const row = await obtenerEvento(id, colegio_id);
    res.json({ evento: serializarEvento(row, fechaMySQLLima()) });
  } catch (e) {
    return handleError(res, e, 'editar');
  }
});

router.patch('/eventos/:id/hecho', requireVer, requireGestionar, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Aviso no válido.' });
    const colegio_id = parseInt(req.user.colegio_id, 10);
    const actual = await obtenerEvento(id, colegio_id);
    if (!actual) return res.status(404).json({ error: 'Aviso no encontrado.' });
    const now = fechaHoraMySQLLima();
    await execute(
      `UPDATE agenda_interna_eventos
       SET estado = 'HECHO', hecho_por = ?, hecho_en = ?, updated_at = ?
       WHERE id = ? AND colegio_id = ?`,
      [parseInt(req.user.usuario_id, 10), now, now, id, colegio_id]
    );
    const row = await obtenerEvento(id, colegio_id);
    res.json({ evento: serializarEvento(row, fechaMySQLLima()) });
  } catch (e) {
    return handleError(res, e, 'hecho');
  }
});

router.patch('/eventos/:id/reabrir', requireVer, requireGestionar, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Aviso no válido.' });
    const colegio_id = parseInt(req.user.colegio_id, 10);
    const actual = await obtenerEvento(id, colegio_id);
    if (!actual) return res.status(404).json({ error: 'Aviso no encontrado.' });
    await execute(
      `UPDATE agenda_interna_eventos
       SET estado = 'PENDIENTE', hecho_por = NULL, hecho_en = NULL, updated_at = ?
       WHERE id = ? AND colegio_id = ?`,
      [fechaHoraMySQLLima(), id, colegio_id]
    );
    const row = await obtenerEvento(id, colegio_id);
    res.json({ evento: serializarEvento(row, fechaMySQLLima()) });
  } catch (e) {
    return handleError(res, e, 'reabrir');
  }
});

router.delete('/eventos/:id', requireVer, requireGestionar, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Aviso no válido.' });
    const colegio_id = parseInt(req.user.colegio_id, 10);
    const actual = await obtenerEvento(id, colegio_id);
    if (!actual) return res.status(404).json({ error: 'Aviso no encontrado.' });
    await execute(`DELETE FROM agenda_interna_eventos WHERE id = ? AND colegio_id = ?`, [id, colegio_id]);
    res.json({ ok: true });
  } catch (e) {
    return handleError(res, e, 'eliminar');
  }
});

module.exports = router;
