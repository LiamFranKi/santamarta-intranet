/**
 * Chat Vanguard: quién es familia/staff, aulas visibles y si pueden hablar 1 a 1.
 */
const { query, execute } = require('./mysql');
const { moduloActivo } = require('./modulosSistema');

const TIPOS_FAMILIA = new Set(['ALUMNO', 'APODERADO']);
const TIPOS_EXCLUIDOS = new Set(['ASISTENCIA']);

function uidDe(req) {
  return parseInt(req.user?.usuario_id || req.user?.id, 10) || 0;
}

function esFamilia(tipo) {
  return TIPOS_FAMILIA.has(String(tipo || '').toUpperCase());
}

function esStaff(tipo) {
  const t = String(tipo || '').toUpperCase();
  return t && !TIPOS_FAMILIA.has(t) && !TIPOS_EXCLUIDOS.has(t);
}

async function requireModuloChat(req, res, next) {
  try {
    if (!(await moduloActivo('comunicaciones.chat'))) {
      return res.status(403).json({ error: 'El módulo Chat está apagado.' });
    }
    if (TIPOS_EXCLUIDOS.has(String(req.user?.tipo || '').toUpperCase())) {
      return res.status(403).json({ error: 'Este perfil no usa el chat.' });
    }
    return next();
  } catch (e) {
    return next(e);
  }
}

async function aulasDeUsuario(req) {
  const cid = req.user.colegio_id;
  const anio = req.user.anio_activo;
  const tipo = String(req.user.tipo || '').toUpperCase();

  if (esStaff(tipo)) {
    return query(
      `SELECT g.id, g.grado, g.seccion, n.nombre AS nivel_nombre
       FROM grupos g
       INNER JOIN niveles n ON n.id = g.nivel_id
       WHERE g.colegio_id = ? AND g.anio = ?
       ORDER BY n.nombre, g.grado, g.seccion`,
      [cid, anio]
    );
  }

  if (tipo === 'ALUMNO') {
    const alumnoId = parseInt(req.user.alumno_id, 10);
    if (!alumnoId) return [];
    return query(
      `SELECT g.id, g.grado, g.seccion, n.nombre AS nivel_nombre
       FROM matriculas m
       INNER JOIN grupos g ON g.id = m.grupo_id AND g.colegio_id = m.colegio_id AND g.anio = ?
       INNER JOIN niveles n ON n.id = g.nivel_id
       WHERE m.alumno_id = ? AND m.colegio_id = ? AND m.estado = 0
       ORDER BY n.nombre, g.grado, g.seccion`,
      [anio, alumnoId, cid]
    );
  }

  if (tipo === 'APODERADO') {
    const apoderadoId = parseInt(req.user.apoderado_id, 10);
    if (!apoderadoId) return [];
    return query(
      `SELECT DISTINCT g.id, g.grado, g.seccion, n.nombre AS nivel_nombre
       FROM familias f
       INNER JOIN matriculas m ON m.alumno_id = f.alumno_id AND m.colegio_id = ? AND m.estado = 0
       INNER JOIN grupos g ON g.id = m.grupo_id AND g.colegio_id = m.colegio_id AND g.anio = ?
       INNER JOIN niveles n ON n.id = g.nivel_id
       WHERE f.apoderado_id = ?
       ORDER BY n.nombre, g.grado, g.seccion`,
      [cid, anio, apoderadoId]
    );
  }

  return [];
}

function tituloAula(g) {
  const nivel = String(g.nivel_nombre || '').trim();
  const grado = g.grado != null && String(g.grado).trim() !== '' ? `${String(g.grado).trim()}°` : '';
  const seccion = String(g.seccion || '').trim();
  return [nivel, grado, seccion].filter(Boolean).join(' ') || `Aula ${g.id}`;
}

async function asegurarSala({ colegioId, tipo, clave, titulo, grupoId = null, userA = null, userB = null }) {
  const existentes = await query(
    `SELECT * FROM chat_salas WHERE colegio_id = ? AND clave = ? LIMIT 1`,
    [colegioId, clave]
  );
  if (existentes[0]) {
    if (existentes[0].titulo !== titulo) {
      await execute(`UPDATE chat_salas SET titulo = ? WHERE id = ?`, [titulo, existentes[0].id]);
      existentes[0].titulo = titulo;
    }
    return existentes[0];
  }
  const r = await execute(
    `INSERT INTO chat_salas (colegio_id, tipo, clave, grupo_id, user_a_id, user_b_id, titulo)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [colegioId, tipo, clave, grupoId, userA, userB, titulo]
  );
  const id = r.insertId;
  const rows = await query(`SELECT * FROM chat_salas WHERE id = ?`, [id]);
  return rows[0];
}

async function gruposIdsDeUsuarioId(usuarioId, colegioId, anio) {
  const u = await query(
    `SELECT tipo, alumno_id, apoderado_id FROM usuarios WHERE id = ? AND colegio_id = ? LIMIT 1`,
    [usuarioId, colegioId]
  );
  if (!u[0]) return [];
  const tipo = String(u[0].tipo || '').toUpperCase();
  if (tipo === 'ALUMNO' && u[0].alumno_id) {
    const rows = await query(
      `SELECT g.id FROM matriculas m
       INNER JOIN grupos g ON g.id = m.grupo_id AND g.anio = ?
       WHERE m.alumno_id = ? AND m.colegio_id = ? AND m.estado = 0`,
      [anio, u[0].alumno_id, colegioId]
    );
    return rows.map((r) => r.id);
  }
  if (tipo === 'APODERADO' && u[0].apoderado_id) {
    const rows = await query(
      `SELECT DISTINCT g.id FROM familias f
       INNER JOIN matriculas m ON m.alumno_id = f.alumno_id AND m.colegio_id = ? AND m.estado = 0
       INNER JOIN grupos g ON g.id = m.grupo_id AND g.anio = ?
       WHERE f.apoderado_id = ?`,
      [colegioId, anio, u[0].apoderado_id]
    );
    return rows.map((r) => r.id);
  }
  return null;
}

async function puedenDm(req, otroUsuarioId) {
  const yo = uidDe(req);
  const otro = parseInt(otroUsuarioId, 10);
  if (!yo || !otro || yo === otro) return false;
  const cid = req.user.colegio_id;
  const anio = req.user.anio_activo;
  const rows = await query(
    `SELECT id, tipo FROM usuarios WHERE id = ? AND colegio_id = ? AND estado = 'ACTIVO' LIMIT 1`,
    [otro, cid]
  );
  if (!rows[0]) return false;
  const tipoOtro = String(rows[0].tipo || '').toUpperCase();
  if (TIPOS_EXCLUIDOS.has(tipoOtro)) return false;
  if (esStaff(req.user.tipo) || esStaff(tipoOtro)) return true;
  const mios = await gruposIdsDeUsuarioId(yo, cid, anio);
  const suyos = await gruposIdsDeUsuarioId(otro, cid, anio);
  if (!mios || !suyos) return false;
  const set = new Set(mios);
  return suyos.some((id) => set.has(id));
}

async function puedeVerSala(req, sala) {
  if (!sala || Number(sala.colegio_id) !== Number(req.user.colegio_id)) return false;
  const yo = uidDe(req);
  if (sala.tipo === 'personal') return esStaff(req.user.tipo);
  if (sala.tipo === 'dm') {
    return Number(sala.user_a_id) === yo || Number(sala.user_b_id) === yo;
  }
  if (sala.tipo === 'aula') {
    if (esStaff(req.user.tipo)) return true;
    const aulas = await aulasDeUsuario(req);
    return aulas.some((g) => Number(g.id) === Number(sala.grupo_id));
  }
  return false;
}

function nombreSqlUsuario() {
  return `TRIM(CONCAT_WS(' ',
    NULLIF(TRIM(CONCAT_WS(' ', a.nombres, a.apellido_paterno, a.apellido_materno)), ''),
    NULLIF(TRIM(CONCAT_WS(' ', ap.nombres, ap.apellido_paterno, ap.apellido_materno)), ''),
    NULLIF(TRIM(CONCAT_WS(' ', p.nombres, p.apellidos)), ''),
    u.usuario
  ))`;
}

function joinPersonaUsuario() {
  return `
    LEFT JOIN alumnos a ON a.id = u.alumno_id
    LEFT JOIN apoderados ap ON ap.id = u.apoderado_id
    LEFT JOIN personal p ON p.id = u.personal_id
  `;
}

async function idsStaff(colegioId, exceptoId) {
  const rows = await query(
    `SELECT id FROM usuarios
     WHERE colegio_id = ? AND id <> ?
       AND (estado = 'ACTIVO' OR estado IS NULL)
       AND tipo NOT IN ('ALUMNO','APODERADO','ASISTENCIA')`,
    [colegioId, exceptoId || 0]
  );
  return rows.map((r) => Number(r.id)).filter(Boolean);
}

async function destinatariosDeSala(sala, exceptoId) {
  const yo = Number(exceptoId) || 0;
  const cid = sala.colegio_id;
  if (sala.tipo === 'dm') {
    const otro = Number(sala.user_a_id) === yo ? Number(sala.user_b_id) : Number(sala.user_a_id);
    return otro && otro !== yo ? [otro] : [];
  }
  if (sala.tipo === 'personal') return idsStaff(cid, yo);
  if (sala.tipo === 'aula' && sala.grupo_id) {
    const familia = await query(
      `SELECT DISTINCT u.id
       FROM usuarios u
       WHERE u.colegio_id = ? AND u.id <> ?
         AND (u.estado = 'ACTIVO' OR u.estado IS NULL)
         AND (
           (u.tipo = 'ALUMNO' AND u.alumno_id IN (
             SELECT m.alumno_id FROM matriculas m
             WHERE m.colegio_id = ? AND m.estado = 0 AND m.grupo_id = ?
           ))
           OR (u.tipo = 'APODERADO' AND u.apoderado_id IN (
             SELECT f.apoderado_id FROM familias f
             INNER JOIN matriculas m ON m.alumno_id = f.alumno_id AND m.colegio_id = ? AND m.estado = 0
             WHERE m.grupo_id = ?
           ))
         )`,
      [cid, yo, cid, sala.grupo_id, cid, sala.grupo_id]
    );
    const staff = await idsStaff(cid, yo);
    return [...new Set([...familia.map((r) => Number(r.id)), ...staff])];
  }
  return [];
}

module.exports = {
  uidDe,
  esFamilia,
  esStaff,
  requireModuloChat,
  aulasDeUsuario,
  tituloAula,
  asegurarSala,
  puedenDm,
  puedeVerSala,
  nombreSqlUsuario,
  joinPersonaUsuario,
  destinatariosDeSala,
};
