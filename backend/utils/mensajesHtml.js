/**
 * Normaliza URLs de imágenes embebidas en HTML de mensajes (Quill).
 */
const { getPublicStaticBaseUrl, urlStaticArchivos } = require('./staticStorage');

function normalizarUrlsImagenesEnHtml(html, baseUrlOverride) {
  if (!html || typeof html !== 'string') return html;
  const base = String(baseUrlOverride || getPublicStaticBaseUrl()).replace(/\/$/, '');
  let out = html;
  out = out.replace(/https?:\/\/nuevo\.vanguardschools\.edu\.pe/gi, base);
  out = out.replace(/http:\/\/localhost:\d+\/Static\//gi, `${base}/Static/`);
  out = out.replace(/http:\/\/127\.0\.0\.1:\d+\/Static\//gi, `${base}/Static/`);
  return out;
}

function urlArchivoMensajeStatic(nombreArchivo) {
  return urlStaticArchivos(nombreArchivo);
}

module.exports = {
  normalizarUrlsImagenesEnHtml,
  urlArchivoMensajeStatic,
};
