/**
 * PDF CNEB (libreta / informe) para un alumno por matrícula del año.
 */
const { query } = require('./mysql');
const { nivelDesdeNombre } = require('./cnebAulaAsignatura');
const { informePdfBuffer, libretaPdfBuffer } = require('./cnebPdfs');

function parseBimestre(raw) {
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return 1;
  return Math.min(4, Math.max(1, n));
}

async function contextoPdfCnebAlumno(cid, alumnoId, anio) {
  if (!cid || !alumnoId || !anio) return null;
  const [row] = await query(
    `SELECT m.id AS matricula_id, m.grupo_id, g.grado, g.seccion, n.nombre AS nivel_nombre
     FROM matriculas m
     INNER JOIN grupos g ON g.id = m.grupo_id
     INNER JOIN niveles n ON n.id = g.nivel_id AND n.colegio_id = m.colegio_id
     WHERE m.alumno_id = ? AND m.colegio_id = ? AND g.anio = ? AND (m.estado = 0)
     LIMIT 1`,
    [alumnoId, cid, anio]
  );
  if (!row) return null;
  const nivel = nivelDesdeNombre(row.nivel_nombre);
  if (!nivel) return null;
  return { ...row, nivel };
}

async function bufferPdfCnebAlumno(cid, { alumnoId, anio, bimestre, tipo }) {
  const ctx = await contextoPdfCnebAlumno(cid, alumnoId, anio);
  if (!ctx) {
    const e = new Error('No hay matrícula en ese año.');
    e.code = 'CNEB_SIN_MATRICULA';
    e.status = 404;
    throw e;
  }
  const opts = {
    anio,
    bimestre: parseBimestre(bimestre),
    grupoId: ctx.grupo_id,
    nivel: ctx.nivel,
    matriculaId: ctx.matricula_id,
  };
  const fn = String(tipo || '').toLowerCase() === 'libreta' ? libretaPdfBuffer : informePdfBuffer;
  return fn(cid, opts);
}

function enviarPdfBuffer(res, { buffer, filename }) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(Buffer.from(buffer));
}

async function responderPdfCnebAlumno(res, cid, opts) {
  try {
    const out = await bufferPdfCnebAlumno(cid, opts);
    enviarPdfBuffer(res, out);
  } catch (e) {
    if (e.status === 404 || e.code === 'CNEB_SIN_MATRICULA' || e.code === 'CNEB_SIN_ALUMNOS') {
      return res.status(e.status || 404).json({ error: e.message || 'No hay datos CNEB.' });
    }
    throw e;
  }
}

module.exports = {
  parseBimestre,
  contextoPdfCnebAlumno,
  bufferPdfCnebAlumno,
  enviarPdfBuffer,
  responderPdfCnebAlumno,
};
