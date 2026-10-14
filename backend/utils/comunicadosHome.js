/**
 * Comunicados marcados para la ventana al iniciar sesión (show_in_home).
 * Puede haber varios a la vez; el front los muestra juntos.
 */

function archivoUrlDeComunicado(com) {
  if (!com?.archivo || String(com.archivo).trim() === '') return null;

  const nombreArchivo = String(com.archivo).trim();
  const esSistemaNuevo =
    nombreArchivo.startsWith('/uploads/comunicados/') ||
    nombreArchivo.startsWith('uploads/comunicados/');
  const isProduction = process.env.NODE_ENV === 'production';
  const { getPublicStaticBaseUrl } = require('./staticStorage');
  const dominioBase = getPublicStaticBaseUrl();

  if (esSistemaNuevo) {
    const pathNorm = nombreArchivo.startsWith('/') ? nombreArchivo : `/${nombreArchivo}`;
    return isProduction
      ? `${dominioBase}${pathNorm}`
      : `http://localhost:5000${pathNorm}`;
  }

  if (nombreArchivo.startsWith('/Static/')) return `${dominioBase}${nombreArchivo}`;
  if (nombreArchivo.startsWith('Static/')) return `${dominioBase}/${nombreArchivo}`;
  return `${dominioBase}/Static/Archivos/${nombreArchivo}`;
}

function flagShowInHome(valor) {
  if (valor === true || valor === 1 || valor === '1' || valor === 'true') return 1;
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(valor)) return valor[0] === 1 ? 1 : 0;
  if (valor && typeof valor === 'object' && Array.isArray(valor.data)) {
    return Number(valor.data[0]) === 1 ? 1 : 0;
  }
  return Number(valor) === 1 ? 1 : 0;
}

/**
 * @param {Function} query
 * @param {number} colegioId
 * @returns {Promise<object[]>}
 */
async function listarComunicadosInicio(query, colegioId) {
  const rows = await query(
    `SELECT c.*
     FROM comunicados c
     WHERE c.colegio_id = ? AND c.estado = 'ACTIVO' AND c.show_in_home = 1
     ORDER BY c.fecha_hora DESC
     LIMIT 20`,
    [colegioId]
  );

  return (rows || []).map((com) => ({
    ...com,
    show_in_home: flagShowInHome(com.show_in_home),
    archivo_url: archivoUrlDeComunicado(com),
  }));
}

module.exports = {
  archivoUrlDeComunicado,
  flagShowInHome,
  listarComunicadosInicio,
};
