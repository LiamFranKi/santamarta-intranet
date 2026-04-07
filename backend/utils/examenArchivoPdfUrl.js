/**
 * URL absoluta del PDF de un examen (compatibilidad con sistema PHP / Static).
 */
function buildArchivoPdfUrl(archivoPdf) {
  if (!archivoPdf || String(archivoPdf).trim() === '') return null;

  const phpSystemUrl = process.env.PHP_SYSTEM_URL || 'https://nuevo.vanguardschools.edu.pe';
  const isDevelopment = process.env.NODE_ENV !== 'production';
  const s = String(archivoPdf);

  if (s.startsWith('http')) {
    return s
      .replace(/https?:\/\/(www\.)?vanguardschools\.edu\.pe/gi, phpSystemUrl)
      .replace(/vanguardschools\.comstatic/gi, `${phpSystemUrl}/Static`)
      .replace(/vanguardschools\.com\/static/gi, `${phpSystemUrl}/Static`)
      .replace(/vanguardschools\.com\/Static/gi, `${phpSystemUrl}/Static`);
  }
  if (s.startsWith('/uploads/')) {
    return isDevelopment ? `http://localhost:5000${s}` : `${phpSystemUrl}${s}`;
  }
  if (s.startsWith('/Static/')) {
    return isDevelopment ? `http://localhost:5000${s}` : `${phpSystemUrl}${s}`;
  }
  return isDevelopment
    ? `http://localhost:5000/Static/Archivos/${s}`
    : `${phpSystemUrl}/Static/Archivos/${s}`;
}

function esExamenTipoPdf(tipo) {
  return String(tipo || '').toUpperCase().trim() === 'PDF';
}

module.exports = { buildArchivoPdfUrl, esExamenTipoPdf };
