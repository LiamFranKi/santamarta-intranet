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
    error: 'Falta ejecutar la migración 079 (Gestión operativa).',
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
  if (casos[0]) return casos[0];
  const trabajos = await query(
    `SELECT id, codigo, titulo, estado, inicio_at, NULL AS prioridad, pendiente_id, tipo, 'TRABAJO' AS kind
     FROM sgoi_trabajos
     WHERE colegio_id = ? AND usuario_id = ? AND estado = 'EN_CURSO'
     ORDER BY inicio_at DESC LIMIT 1`,
    [cid, uid]
  );
  return trabajos[0] || null;
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
  padCodigo,
  segundosEntre,
  sanitizarTexto,
  agregarSeguimiento,
  auditarSgoi,
  resolvePersonalId,
};
