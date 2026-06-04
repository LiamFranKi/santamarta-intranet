const { buildStaticArchivoUrl } = require('./staticStorage');

/** URL absoluta del PDF de un examen (compatibilidad con sistema PHP / Static). */
function buildArchivoPdfUrl(archivoPdf) {
  return buildStaticArchivoUrl(archivoPdf);
}

function esExamenTipoPdf(tipo) {
  return String(tipo || '').toUpperCase().trim() === 'PDF';
}

module.exports = { buildArchivoPdfUrl, esExamenTipoPdf };
