import api from '../services/api';

/** Marca al inicio del HTML (cumpleaños desde widget); no depende de columna en BD. */
export const MARCA_CUMPLEANOS_HTML = '<!-- intranet-cumpleanos -->';

export function mensajeTieneMarcaCumpleanos(mensaje) {
  if (!mensaje) return false;
  if (mensaje.es_cumpleanos === 'SI') return true;
  return /intranet-cumpleanos/i.test(mensaje.mensaje || '');
}

export function quitarMarcaCumpleanosHtml(html) {
  return String(html || '')
    .replace(/^\s*<!--\s*intranet-cumpleanos\s*-->\s*/i, '')
    .trim();
}

/**
 * Prepara HTML de mensaje para mostrar en modal: rutas de imágenes y URLs absolutas coherentes.
 */
/**
 * True si el HTML del editor tiene texto visible (ignora solo <p><br></p> vacío).
 */
export function mensajeHtmlTieneContenido(html) {
  if (html == null) return false;
  const s = String(html);
  if (!s.trim()) return false;
  if (typeof document === 'undefined') {
    return s.replace(/<[^>]*>/g, '').replace(/&nbsp;/gi, ' ').trim().length > 0;
  }
  const div = document.createElement('div');
  div.innerHTML = s;
  const text = (div.textContent || '').replace(/\u00a0/g, ' ').trim();
  return text.length > 0;
}

export function procesarHTMLMensaje(html) {
  if (!html) return '';
  const baseURL = (api.defaults.baseURL || '').replace(/\/api\/?$/, '');
  const phpBase = (process.env.REACT_APP_PHP_SYSTEM_URL || 'https://nuevo.vanguardschools.edu.pe').replace(
    /\/$/,
    ''
  );
  let out = String(html);
  out = out.replace(/http:\/\/localhost:\d+\/Static\//gi, `${phpBase}/Static/`);
  out = out.replace(/http:\/\/127\.0\.0\.1:\d+\/Static\//gi, `${phpBase}/Static/`);
  return out.replace(/<img([^>]*)\ssrc=["']([^"']+)["']([^>]*)>/gi, (match, before, src, after) => {
    let fixed = String(src || '').trim();
    if (!fixed) return match;
    // Imágenes pegadas en el editor (Quill) suelen guardarse como data URL; no reescribir.
    if (/^data:image\//i.test(fixed)) {
      return `<img${before} src="${fixed}"${after}>`;
    }
    if (fixed.startsWith('blob:')) {
      return `<img${before} src="${fixed}"${after}>`;
    }
    fixed = fixed
      .replace(/https?:\/\/(www\.)?vanguardschools\.edu\.pe/gi, phpBase)
      .replace(/https?:\/\/(www\.)?vanguardschools\.com\/?static/gi, `${phpBase}/Static`);
    if (/^https?:\/\//i.test(fixed)) {
      return `<img${before} src="${fixed}"${after}>`;
    }
    if (fixed.startsWith('/Static/')) {
      return `<img${before} src="${phpBase}${fixed}"${after}>`;
    }
    if (fixed.startsWith('Static/')) {
      return `<img${before} src="${phpBase}/${fixed}"${after}>`;
    }
    if (fixed.startsWith('/uploads/') || fixed.startsWith('uploads/')) {
      const rel = fixed.startsWith('/') ? fixed : `/${fixed}`;
      return `<img${before} src="${baseURL}${rel}"${after}>`;
    }
    return `<img${before} src="${phpBase}/${fixed.replace(/^\/+/, '')}"${after}>`;
  });
}
