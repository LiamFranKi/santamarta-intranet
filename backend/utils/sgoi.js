/**
 * Gestión operativa (SGOI). Acceso por tipo + miembros (patrón Caja Chica).
 * No reutiliza tareas/actividades/incidencias académicas.
 */
const { query, execute } = require('./mysql');
const { fechaHoraMySQLLima, fechaMySQLLima } = require('./fechaHoraLima');
const { resolvePersonalId } = require('./tutoriaGeneral');
const { registrarAccion } = require('./auditoria');

const TIPOS_SGOI = ['ADMINISTRADOR', 'PROMOTORIA', 'DIRECTOR', 'COORDINADOR', 'CONTADOR'];
/** Tablero/reporte de toda el área. COORDINADOR y miembros solo ven lo propio. */
const TIPOS_SGOI_AREA = ['ADMINISTRADOR', 'PROMOTORIA', 'DIRECTOR'];
const ESTADOS_CASO_CIERRE = ['RESUELTO', 'PENDIENTE'];
const ESTADOS_TRABAJO_CIERRE = ['HECHO', 'PENDIENTE'];
const TIPOS_TRABAJO = ['DESARROLLO', 'SOPORTE', 'PAGOS', 'DESPLIEGUE', 'REUNION', 'OTRO'];

function esTipoSgoi(tipo) {
  return TIPOS_SGOI.includes(String(tipo || '').toUpperCase());
}

function veTodoElAreaSgoi(tipo) {
  return TIPOS_SGOI_AREA.includes(String(tipo || '').toUpperCase());
}

/** Extra SQL para listados: vacío si ve el área; si no, solo su usuario_id. */
function filtroPropioSgoi(tipo, usuarioId, alias = '') {
  if (veTodoElAreaSgoi(tipo)) return { sql: '', params: [] };
  const uid = parseInt(usuarioId, 10);
  if (!uid) return { sql: ' AND 1=0', params: [] };
  const col = alias ? `${alias}.usuario_id` : 'usuario_id';
  return { sql: ` AND ${col} = ?`, params: [uid] };
}

function esRegistroPropioOArea(tipo, rowUsuarioId, miUsuarioId) {
  if (veTodoElAreaSgoi(tipo)) return true;
  return parseInt(rowUsuarioId, 10) === parseInt(miUsuarioId, 10);
}

/** Cada usuario con Gestión operativa arma su propia plantilla semanal. */
function esTipoHorarioSgoi(tipo) {
  return esTipoSgoi(tipo);
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

/** DATETIME naive de Lima como texto, para que JSON no lo marque como UTC (+5 h). */
function sqlDt(ref, alias) {
  const as = alias || String(ref).replace(/^.*\./, '');
  return `DATE_FORMAT(${ref}, '%Y-%m-%d %H:%i:%s') AS ${as}`;
}

function serializarDatetimeLima(valor) {
  if (valor == null || valor === '') return valor;
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
    const p = (n) => String(n).padStart(2, '0');
    return `${valor.getUTCFullYear()}-${p(valor.getUTCMonth() + 1)}-${p(valor.getUTCDate())} ${p(valor.getUTCHours())}:${p(valor.getUTCMinutes())}:${p(valor.getUTCSeconds())}`;
  }
  const s = String(valor).trim();
  if (/[zZ]$/.test(s) || /[+-]\d{2}:\d{2}$/.test(s)) {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) {
      const p = (n) => String(n).padStart(2, '0');
      return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
    }
  }
  return s.replace('T', ' ').slice(0, 19);
}

const SGOI_DT_KEYS = ['inicio_at', 'fin_at', 'cerrado_at', 'created_at', 'updated_at', 'fecha_hora'];

function serializarFilaSgoi(row) {
  if (!row || typeof row !== 'object') return row;
  const out = { ...row };
  for (const k of SGOI_DT_KEYS) {
    if (out[k] != null) out[k] = serializarDatetimeLima(out[k]);
  }
  return out;
}

function serializarFilasSgoi(rows) {
  return Array.isArray(rows) ? rows.map(serializarFilaSgoi) : rows;
}

async function obtenerActivo(colegioId, usuarioId) {
  const cid = parseInt(colegioId, 10);
  const uid = parseInt(usuarioId, 10);
  const casos = await query(
    `SELECT id, codigo, titulo, estado, ${sqlDt('inicio_at')}, prioridad, pendiente_id, NULL AS tipo, 'CASO' AS kind
     FROM sgoi_casos
     WHERE colegio_id = ? AND usuario_id = ? AND estado = 'EN_CURSO'
     ORDER BY inicio_at DESC LIMIT 1`,
    [cid, uid]
  );
  return casos[0] ? serializarFilaSgoi(casos[0]) : null;
}

/** Horario Área de Sistemas (L–S). Índices 2–7 = lun…sáb. "—" = sin franja. */
const HORARIO_SISTEMAS = [
  ['07:30:00', '08:00:00', 'Bancos/pagos', 'Bancos/pagos', 'Bancos/pagos', 'Bancos/pagos', 'Bancos/pagos', 'Bancos/pagos'],
  ['08:00:00', '09:00:00', 'Monitoreo/soporte', 'Monitoreo/soporte', 'Monitoreo/soporte', 'Monitoreo/soporte', 'Monitoreo/soporte', 'Backup/revisión'],
  ['09:00:00', '09:30:00', 'Desarrollo', 'Desarrollo', 'Desarrollo', 'Desarrollo', 'Desarrollo', 'Mantenimiento'],
  ['09:30:00', '10:00:00', 'Desayuno', 'Desayuno', 'Desayuno', 'Desayuno', 'Desayuno', 'Desayuno'],
  ['10:00:00', '11:00:00', 'Frontend/UI', 'Backend/API', 'Frontend/UI', 'Backend/API', 'Mejoras/bugs', 'Desarrollo'],
  ['11:00:00', '12:00:00', 'Backend', 'Base de datos', 'Módulos', 'Base de datos', 'Testing', 'BD/respaldos'],
  ['12:00:00', '13:00:00', 'Testing', 'Desarrollo', 'Testing', 'Desarrollo', 'Testing', 'Servidor'],
  ['13:00:00', '13:30:00', 'Git/Deploy', 'Documentación', 'Git/Deploy', 'Testing', 'Git/Deploy', 'Reporte semanal'],
  ['13:30:00', '14:00:00', 'Almuerzo', 'Almuerzo', 'Almuerzo', 'Almuerzo', 'Almuerzo', 'Almuerzo'],
  ['14:00:00', '15:00:00', 'Desarrollo', 'Desarrollo', 'Desarrollo', 'Desarrollo', 'Desarrollo', 'Testing'],
  ['15:00:00', '16:00:00', 'Backend/BD', 'Frontend/UX', 'Backend/BD', 'Frontend/UX', 'Optimización', '—'],
  ['16:00:00', '17:00:00', 'Testing', 'Testing', 'Testing', 'Testing', 'Mantenimiento', '—'],
  ['17:00:00', '18:00:00', 'Deploy/validación', 'Web/contenido', 'Deploy/validación', 'Planificación', 'Backup/cierre', '—'],
];

function tipoFranja(titulo) {
  const t = String(titulo || '').trim();
  if (!t || t === '—') return null;
  const low = t.toLowerCase();
  if (low.includes('desayuno') || low.includes('almuerzo')) return 'DESCANSO';
  if (low.includes('banco') || low.includes('pago')) return 'PAGOS';
  if (low.includes('monitoreo') || low.includes('soporte')) return 'SOPORTE';
  if (low.includes('deploy') || low.startsWith('git/')) return 'DESPLIEGUE';
  return 'DESARROLLO';
}

function plantillaDefault() {
  const rows = [];
  HORARIO_SISTEMAS.forEach((fila, i) => {
    const [horaIni, horaFin, ...dias] = fila;
    dias.forEach((titulo, idx) => {
      const tipo = tipoFranja(titulo);
      if (!tipo) return;
      rows.push({
        weekday: idx + 1,
        hora_ini: horaIni,
        hora_fin: horaFin,
        titulo,
        tipo,
        orden: i + 1,
      });
    });
  });
  return rows;
}

async function sembrarPlantilla(colegioId, usuarioId) {
  const filas = plantillaDefault();
  for (const f of filas) {
    await execute(
      `INSERT INTO sgoi_plantilla_bloques
        (colegio_id, usuario_id, weekday, hora_ini, hora_fin, titulo, tipo, orden)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [colegioId, usuarioId, f.weekday, f.hora_ini, f.hora_fin, f.titulo, f.tipo, f.orden]
    );
  }
}

async function asegurarPlantilla(colegioId, usuarioId, { sembrarSiVacio = false } = {}) {
  const cid = parseInt(colegioId, 10);
  const uid = parseInt(usuarioId, 10);
  const n = await query(
    `SELECT COUNT(*) AS n FROM sgoi_plantilla_bloques WHERE colegio_id = ? AND usuario_id = ?`,
    [cid, uid]
  );
  const lunes = await query(
    `SELECT COUNT(*) AS n FROM sgoi_plantilla_bloques
     WHERE colegio_id = ? AND usuario_id = ? AND weekday = 1`,
    [cid, uid]
  );
  const total = Number(n[0]?.n || 0);
  const yaNueva = Number(lunes[0]?.n || 0) >= 12;
  if (total > 0 && yaNueva) return;
  if (!sembrarSiVacio) return;

  if (total > 0) {
    const hoy = fechaMySQLLima();
    await execute(
      `DELETE FROM sgoi_plantilla_bloques WHERE colegio_id = ? AND usuario_id = ?`,
      [cid, uid]
    );
    await execute(
      `DELETE FROM sgoi_dia_bloques WHERE colegio_id = ? AND usuario_id = ? AND fecha >= ?`,
      [cid, uid, hoy]
    );
  }
  await sembrarPlantilla(cid, uid);
}

async function materializarDia(colegioId, usuarioId, fecha, opts = {}) {
  await asegurarPlantilla(colegioId, usuarioId, opts);
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
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
    const p = (n) => String(n).padStart(2, '0');
    return `${p(valor.getUTCHours())}:${p(valor.getUTCMinutes())}`;
  }
  const s = String(valor || '');
  const m = s.match(/(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : (s.length >= 5 ? s.slice(0, 5) : s);
}

function solapaHora(iniA, finA, iniB, finB) {
  return hhmm(iniA) < hhmm(finB) && hhmm(iniB) < hhmm(finA);
}

/** Cuelga cada caso en las franjas que se solapan (Mi día / reporte). */
function colgarCasosEnBloques(bloques, casos) {
  const usados = new Set();
  const bloquesOut = (bloques || []).map((b) => {
    const interrupciones = (casos || []).filter((c) => {
      const horaIni = c.hora_ini_hm || hhmm(c.inicio_at);
      const horaFin = c.hora_fin_hm || horaIni;
      if (!solapaHora(b.hora_ini, b.hora_fin, horaIni, horaFin)) return false;
      usados.add(`c-${c.id}`);
      return true;
    });
    return {
      ...b,
      hora_ini: hhmm(b.hora_ini),
      hora_fin: hhmm(b.hora_fin),
      descanso: b.tipo === 'DESCANSO',
      interrupciones: serializarFilasSgoi(interrupciones),
    };
  });
  return {
    bloques: bloquesOut,
    casos_sueltos: serializarFilasSgoi((casos || []).filter((c) => !usados.has(`c-${c.id}`))),
  };
}

function padCodigo(prefijo, id) {
  return `${prefijo}-${String(id).padStart(5, '0')}`;
}

function instanteLimaMs(valor) {
  if (valor == null || valor === '') return NaN;
  const naive = serializarDatetimeLima(valor);
  const m = require('moment-timezone').tz(naive, 'YYYY-MM-DD HH:mm:ss', 'America/Lima');
  return m.isValid() ? m.valueOf() : NaN;
}

function segundosEntre(inicioAt, finAt) {
  const a = instanteLimaMs(inicioAt);
  const b = instanteLimaMs(finAt);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.max(0, Math.round((b - a) / 1000));
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

async function nombrePersonalDeUsuario(usuarioId) {
  const uid = parseInt(usuarioId, 10);
  if (!uid) return '';
  const rows = await query(
    `SELECT TRIM(CONCAT(COALESCE(p.nombres,''), ' ', COALESCE(p.apellidos,''))) AS nombre,
            u.usuario
     FROM usuarios u
     LEFT JOIN personal p ON p.id = u.personal_id
     WHERE u.id = ?
     LIMIT 1`,
    [uid]
  );
  const nombre = String(rows[0]?.nombre || '').replace(/\s+/g, ' ').trim();
  return nombre || String(rows[0]?.usuario || '').trim();
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
  TIPOS_SGOI_AREA,
  veTodoElAreaSgoi,
  filtroPropioSgoi,
  esRegistroPropioOArea,
  ESTADOS_CASO_CIERRE,
  ESTADOS_TRABAJO_CIERRE,
  TIPOS_TRABAJO,
  esTipoSgoi,
  esTipoHorarioSgoi,
  tableMissing,
  sgoiNoTablePayload,
  puedeUsarSgoi,
  requireSgoi,
  asegurarAreaSistemas,
  sqlDt,
  serializarFilaSgoi,
  serializarFilasSgoi,
  obtenerActivo,
  asegurarPlantilla,
  materializarDia,
  hhmm,
  solapaHora,
  colgarCasosEnBloques,
  padCodigo,
  segundosEntre,
  sanitizarTexto,
  agregarSeguimiento,
  nombrePersonalDeUsuario,
  auditarSgoi,
  resolvePersonalId,
};
