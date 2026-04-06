/**
 * Normaliza URLs de imágenes embebidas en HTML de mensajes (Quill).
 * Evita guardar localhost en producción y que el destinatario no pueda cargarlas.
 */
function normalizarUrlsImagenesEnHtml(html, phpSystemUrl) {
  if (!html || typeof html !== 'string') return html;
  const base = String(phpSystemUrl || process.env.PHP_SYSTEM_URL || 'https://nuevo.vanguardschools.edu.pe').replace(/\/$/, '');
  let out = html;
  // localhost / 127.0.0.1 con cualquier puerto → dominio PHP
  out = out.replace(/http:\/\/localhost:\d+\/Static\//gi, `${base}/Static/`);
  out = out.replace(/http:\/\/127\.0\.0\.1:\d+\/Static\//gi, `${base}/Static/`);
  return out;
}

/**
 * URL pública de un archivo subido a Static/Archivos (mensajes).
 */
function urlArchivoMensajeStatic(nombreArchivo) {
  const base = String(process.env.PHP_SYSTEM_URL || 'https://nuevo.vanguardschools.edu.pe').replace(/\/$/, '');
  const name = String(nombreArchivo || '').replace(/^\/+/, '');
  return `${base}/Static/Archivos/${name}`;
}

module.exports = {
  normalizarUrlsImagenesEnHtml,
  urlArchivoMensajeStatic,
};
