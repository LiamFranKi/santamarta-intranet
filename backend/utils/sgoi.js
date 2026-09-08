/**
 * Gestión operativa (SGOI). Acceso por tipo + miembros (patrón Caja Chica).
 * No reutiliza tareas/actividades/incidencias académicas.
 */
const { query, execute } = require('./mysql');
const { fechaHoraMySQLLima } = require('./fechaHoraLima');
const { resolvePersonalId } = require('./tutoriaGeneral');
const { registrarAccion } = require('./auditoria');

const TIPOS_SGOI = ['ADMINISTRADOR', 'PROMOTORIA', 'DIRECTOR'];
const ESTADOS_CASO_CIERRE = ['RESUELTO', 'PENDIENTE'];
const ESTADOS_TRABAJO_CIERRE = ['HECHO', 'PENDIENTE'];
const TIPOS_TRABAJO = ['DESARROLLO', 'SOPORTE', 'PAGOS', 'DESPLIEGUE', 'REUNION', 'OTRO'];

function esTipoSgoi(tipo) {
  return TIPOS_SGOI.includes(String(tipo || '').toUpperCase());
}

function tableMissing(err) {
  return err && (err.code === 'ER_NO_SUCH_TABLE' || String(err.message || '').includes("doesn't exist"));
}

function sgoiNoTablePayload() {
  return {
    error: 'Falta ejecutar la migración de Gestión operativa (079 y, para el horario, 081).',
    code: 'SGOI_NO_TABLE',
  };
}

async function esMiembroSgoi(personalId, colegioId) {
  const pid = parseInt(personalId, 10);
  const cid = parseInt(colegioId, 10);
  if (!pid || !cid) return false;
  try {
    const rows = await query(
      `SELECT 1 FROM sgoi_miembros
       WHERE colegio_id = ? AND personal_id = ? AND activo = 1
       LIMIT 1`,
      [cid, pid]
    );
    return rows.length > 0;
  } catch (e) {
    if (tableMissing(e)) return false;
    throw e;
  }
}

async function puedeUsarSgoi(req) {
  if (esTipoSgoi(req.user?.tipo)) return true;
  const personalId = await resolvePersonalId(req);
  if (!personalId) return false;
  return esMiembroSgoi(personalId, req.user.colegio_id);
}

function requireSgoi(req, res, next) {
  puedeUsarSgoi(req)
    .then((ok) => {
      if (!ok) {
        return res.status(403).json({ error: 'No tienes acceso a Gestión operativa.' });
      }
      return next();
    })
    .catch((e) => {
      if (tableMissing(e)) {
        return res.status(503).json(sgoiNoTablePayload());
      }
      console.error('[sgoi] requireSgoi', e);
      return res.status(500).json({ error: 'Error al verificar acceso.' });
    });
}

async function asegurarAreaSistemas(colegioId) {
  const cid = parseInt(colegioId, 10);
  if (!cid) return null;
  const existentes = await query(
    `SELECT id, nombre, slug FROM sgoi_areas
     WHERE colegio_id = ? AND slug = 'sistemas' LIMIT 1`,
    [cid]
  );
  if (existentes[0]) return existentes[0];
  const ins = await execute(
    `INSERT INTO sgoi_areas (colegio_id, nombre, slug, activo, orden)
     VALUES (?, 'Sistemas', 'sistemas', 1, 1)`,
    [cid]
  );
  return { id: ins.insertId, nombre: 'Sistemas', slug: 'sistemas' };
}

async function obtenerActivo(colegioId, usuarioId) {
  const cid = parseInt(colegioId, 10);
  const uid = parseInt(usuarioId, 10);
  const casos = await query(
    `SELECT id, codigo, titulo, estado, inicio_at, prioridad, pendiente_id, NULL AS tipo, 'CASO' AS kind
     FROM sgoi_casos
     WHERE colegio_id = ? AND usuario_id = ? AND estado = 'EN_CURSO'
     ORDER BY inicio_at DESC LIMIT 1`,
    [cid, uid]
  );
  return casos[0] || null;
}

const PLANTILLA_LV = [
  ['07:30:00', '08:00:00', 'Proceso bancario / pagos', 'PAGOS'],
  ['08:00:00', '09:00:00', 'Monitoreo y soporte', 'SOPORTE'],
  ['09:00:00', '09:30:00', 'Desarrollo VanguardNet', 'DESARROLLO'],
  ['09:30:00', '10:00:00', 'Desayuno', 'DESCANSO'],
  ['10:00:00', '13:30:00', 'Desarrollo', 'DESARROLLO'],
  ['13:30:00', '14:00:00', 'Almuerzo', 'DESCANSO'],
  ['14:00:00', '18:00:00', 'Desarrollo, soporte y despliegues', 'DESARROLLO'],
];

function plantillaDefault() {
  const rows = [];
  for (let d = 1; d <= 5; d += 1) {
    PLANTILLA_LV.forEach((b, i) => {
      rows.push({ weekday: d, hora_ini: b[0], hora_fin: b[1], titulo: b[2], tipo: b[3], orden: i + 1 });
    });
  }
  rows.push({
    weekday: 6,
    hora_ini: '08:00:00',
    hora_fin: '13:00:00',
    titulo: 'Revisión, mantenimiento, respaldos y planificación',
    tipo: 'DESARROLLO',
    orden: 1,
  });
  return rows;
}

async function asegurarPlantilla(colegioId, usuarioId) {
  const cid = parseInt(colegioId, 10);
  const uid = parseInt(usuarioId, 10);
  const n = await query(
    `SELECT COUNT(*) AS n FROM sgoi_plantilla_bloques WHERE colegio_id = ? AND usuario_id = ?`,
    [cid, uid]
  );
  if (Number(n[0]?.n || 0) > 0) return;
  const filas = plantillaDefault();
  for (const f of filas) {
    await execute(
      `INSERT INTO sgoi_plantilla_bloques
        (colegio_id, usuario_id, weekday, hora_ini, hora_fin, titulo, tipo, orden)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [cid, uid, f.weekday, f.hora_ini, f.hora_fin, f.titulo, f.tipo, f.orden]
    );
  }
}

async function materializarDia(colegioId, usuarioId, fecha) {
  await asegurarPlantilla(colegioId, usuarioId);
  const existen = await query(
    `SELECT id FROM sgoi_dia_bloques
     WHERE colegio_id = ? AND usuario_id = ? AND fecha = ?
     LIMIT 1`,
    [colegioId, usuarioId, fecha]
  );
  if (existen.length) return;
  const wd = require('moment-timezone').tz(fecha, 'YYYY-MM-DD', 'America/Lima').isoWeekday();
  const plantilla = await query(
    `SELECT id, hora_ini, hora_fin, titulo, tipo, orden
     FROM sgoi_plantilla_bloques
     WHERE colegio_id = ? AND usuario_id = ? AND weekday = ?
     ORDER BY hora_ini ASC, orden ASC`,
    [colegioId, usuarioId, wd]
  );
  for (const p of plantilla) {
    await execute(
      `INSERT INTO sgoi_dia_bloques
        (colegio_id, usuario_id, fecha, hora_ini, hora_fin, titulo, tipo, plantilla_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [colegioId, usuarioId, fecha, p.hora_ini, p.hora_fin, p.titulo, p.tipo, p.id]
    );
  }
}

function hhmm(valor) {
  const s = String(valor || '');
  return s.length >= 5 ? s.slice(0, 5) : s;
}

function solapaHora(iniA, finA, iniB, finB) {
  return hhmm(iniA) < hhmm(finB) && hhmm(iniB) < hhmm(finA);
}

function padCodigo(prefijo, id) {
  return `${prefijo}-${String(id).padStart(5, '0')}`;
}

function segundosEntre(inicioAt, finAt) {
  const a = new Date(String(inicioAt).replace(' ', 'T'));
  const b = new Date(String(finAt).replace(' ', 'T'));
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 1000));
}

function sanitizarTexto(valor, max) {
  const t = String(valor || '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  return t.slice(0, max);
}

async function agregarSeguimiento({ colegioId, entidad, entidadId, usuarioId, texto }) {
  const limpio = sanitizarTexto(texto, 4000);
  if (!limpio) return null;
  const ins = await execute(
    `INSERT INTO sgoi_seguimientos (colegio_id, entidad, entidad_id, usuario_id, texto, fecha_hora)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [colegioId, entidad, entidadId, usuarioId, limpio, fechaHoraMySQLLima()]
  );
  return ins.insertId;
}

function auditarSgoi(req, { accion, entidad, entidad_id, descripcion }) {
  registrarAccion({
    usuario_id: req.user.usuario_id,
    colegio_id: req.user.colegio_id,
    tipo_usuario: req.user.tipo,
    accion,
    modulo: 'SGOI',
    entidad,
    entidad_id,
    descripcion,
    url: req.originalUrl,
    metodo_http: req.method,
    ip_address: req.ip,
    user_agent: req.get('user-agent'),
  });
}

module.exports = {
  TIPOS_SGOI,
  ESTADOS_CASO_CIERRE,
  ESTADOS_TRABAJO_CIERRE,
  TIPOS_TRABAJO,
  esTipoSgoi,
  tableMissing,
  sgoiNoTablePayload,
  puedeUsarSgoi,
  requireSgoi,
  asegurarAreaSistemas,
  obtenerActivo,
  asegurarPlantilla,
  materializarDia,
  hhmm,
  solapaHora,
  padCodigo,
  segundosEntre,
  sanitizarTexto,
  agregarSeguimiento,
  auditarSgoi,
  resolvePersonalId,
};
