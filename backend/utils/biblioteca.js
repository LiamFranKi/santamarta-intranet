/**
 * Biblioteca: permisos y helpers de catálogo / préstamos.
 */
const path = require('path');
const { query } = require('./mysql');
const { resolvePersonalId } = require('./tutoriaGeneral');
const { moduloActivo } = require('./modulosSistema');

const ESTADOS_EJ = new Set(['DISPONIBLE', 'SEPARADO', 'PRESTADO', 'BAJA']);
const ESTADOS_MOV = new Set(['SEPARADO', 'PRESTADO', 'DEVUELTO', 'CANCELADO', 'NO_RECOGIDO']);

function hoyLima() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
}

function sumarDias(ymd, dias) {
  const [y, m, d] = String(ymd).split('-').map((n) => parseInt(n, 10));
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + Number(dias));
  return dt.toISOString().slice(0, 10);
}

function portadaUrl(colegioId, filename) {
  if (!filename) return null;
  const name = String(filename).replace(/^\/+/, '');
  if (/^https?:\/\//i.test(name)) return name;
  return `/uploads/biblioteca/${colegioId}/${name}`;
}

function dirPortadas(colegioId) {
  return path.join(__dirname, '..', 'uploads', 'biblioteca', String(colegioId));
}

async function esBibliotecarioAsignado(personalId, colegioId) {
  const pid = parseInt(personalId, 10);
  const cid = parseInt(colegioId, 10);
  if (!pid || !cid) return false;
  try {
    const rows = await query(
      `SELECT 1 FROM biblioteca_personal
       WHERE colegio_id = ? AND personal_id = ? AND activo = 1
       LIMIT 1`,
      [cid, pid]
    );
    return rows.length > 0;
  } catch (e) {
    if (e.code === 'ER_NO_SUCH_TABLE') return false;
    throw e;
  }
}

async function puedeGestionarBiblioteca(req) {
  const t = String(req.user?.tipo || '').toUpperCase();
  if (t === 'ADMINISTRADOR' || t === 'SECRETARIA') return true;
  const personalId = await resolvePersonalId(req);
  if (!personalId) return false;
  return esBibliotecarioAsignado(personalId, req.user.colegio_id);
}

async function requireModuloBiblioteca(req, res, next) {
  try {
    if (!(await moduloActivo('biblioteca'))) {
      return res.status(403).json({ error: 'El módulo Biblioteca está apagado.' });
    }
    return next();
  } catch (e) {
    return next(e);
  }
}

async function requireGestionBiblioteca(req, res, next) {
  try {
    if (!(await puedeGestionarBiblioteca(req))) {
      return res.status(403).json({ error: 'No autorizado para gestionar la biblioteca.' });
    }
    return next();
  } catch (e) {
    return next(e);
  }
}

async function resolveAlumnoId(req) {
  if (req.user?.alumno_id) return parseInt(req.user.alumno_id, 10);
  if (!req.user?.usuario_id) return null;
  const rows = await query(
    `SELECT alumno_id FROM usuarios WHERE id = ? AND colegio_id = ? AND alumno_id > 0 LIMIT 1`,
    [req.user.usuario_id, req.user.colegio_id]
  );
  return rows[0]?.alumno_id ? parseInt(rows[0].alumno_id, 10) : null;
}

async function resolveApoderadoId(req) {
  if (req.user?.apoderado_id) return parseInt(req.user.apoderado_id, 10);
  if (!req.user?.usuario_id) return null;
  const rows = await query(
    `SELECT apoderado_id FROM usuarios WHERE id = ? AND colegio_id = ? AND apoderado_id > 0 LIMIT 1`,
    [req.user.usuario_id, req.user.colegio_id]
  );
  return rows[0]?.apoderado_id ? parseInt(rows[0].apoderado_id, 10) : null;
}

async function hijosDelApoderado(apoderadoId, colegioId) {
  if (!apoderadoId) return [];
  return query(
    `SELECT DISTINCT a.id, a.nombres, a.apellido_paterno, a.apellido_materno
     FROM familias f
     INNER JOIN alumnos a ON a.id = f.alumno_id AND a.colegio_id = ?
     WHERE f.apoderado_id = ?
     ORDER BY a.apellido_paterno, a.apellido_materno, a.nombres`,
    [colegioId, apoderadoId]
  );
}

async function apoderadoPuedeHijo(apoderadoId, alumnoId, colegioId) {
  const rows = await query(
    `SELECT 1 FROM familias f
     INNER JOIN alumnos a ON a.id = f.alumno_id AND a.colegio_id = ?
     WHERE f.apoderado_id = ? AND f.alumno_id = ?
     LIMIT 1`,
    [colegioId, apoderadoId, alumnoId]
  );
  return rows.length > 0;
}

function mapLibro(row, colegioId) {
  return {
    ...row,
    disponibles: Number(row.disponibles || 0),
    total_ejemplares: Number(row.total_ejemplares || 0),
    portada_url: portadaUrl(colegioId, row.portada),
  };
}

module.exports = {
  ESTADOS_EJ,
  ESTADOS_MOV,
  hoyLima,
  sumarDias,
  portadaUrl,
  dirPortadas,
  esBibliotecarioAsignado,
  puedeGestionarBiblioteca,
  requireModuloBiblioteca,
  requireGestionBiblioteca,
  resolveAlumnoId,
  resolveApoderadoId,
  hijosDelApoderado,
  apoderadoPuedeHijo,
  mapLibro,
  resolvePersonalId,
};
