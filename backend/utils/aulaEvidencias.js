const { query } = require('./mysql');

function tipoDesdeNombre(nombre) {
  const ext = String(nombre || '').split('.').pop().toLowerCase();
  return ext === 'pdf' ? 'pdf' : 'imagen';
}

function urlArchivoAula(archivo) {
  if (!archivo || String(archivo).trim() === '') return null;
  const nombre = String(archivo).startsWith('/Static/Archivos/')
    ? String(archivo).replace(/^\/Static\/Archivos\//, '')
    : String(archivo);
  const isDevelopment = process.env.NODE_ENV !== 'production';
  const phpSystemUrl = process.env.PHP_SYSTEM_URL || '';
  return isDevelopment
    ? `http://localhost:5000/Static/Archivos/${nombre}`
    : `${phpSystemUrl}/Static/Archivos/${nombre}`;
}

function mapearEvidencia(row) {
  const archivo = row.archivo || '';
  const tipo = row.tipo || tipoDesdeNombre(archivo);
  return {
    ...row,
    tipo,
    archivo_url: urlArchivoAula(archivo),
  };
}

async function listarEvidencias(asignaturaId, ciclo, { sesionId } = {}) {
  const aid = parseInt(asignaturaId, 10);
  const sid = sesionId != null && sesionId !== '' ? parseInt(sesionId, 10) : null;
  if (sid && Number.isFinite(sid)) {
    const rows = await query(
      `SELECT * FROM asignaturas_evidencias
       WHERE asignatura_id = ? AND cneb_sesion_id = ?
       ORDER BY id DESC`,
      [aid, sid]
    );
    return (rows || []).map(mapearEvidencia);
  }
  const rows = await query(
    `SELECT * FROM asignaturas_evidencias
     WHERE asignatura_id = ? AND ciclo = ?
     ORDER BY id DESC`,
    [aid, parseInt(ciclo, 10) || 1]
  );
  return (rows || []).map(mapearEvidencia);
}

async function listarEvidenciasSafe(asignaturaId, ciclo, opts = {}) {
  try {
    return await listarEvidencias(asignaturaId, ciclo, opts);
  } catch (e) {
    if (e && e.code === 'ER_NO_SUCH_TABLE') {
      console.warn('[evidencias] Falta la tabla asignaturas_evidencias. Aplique la migración 082.');
      return [];
    }
    if (e && e.code === 'ER_BAD_FIELD_ERROR' && opts.sesionId) {
      return [];
    }
    throw e;
  }
}

module.exports = {
  tipoDesdeNombre,
  urlArchivoAula,
  mapearEvidencia,
  listarEvidencias,
  listarEvidenciasSafe,
};
