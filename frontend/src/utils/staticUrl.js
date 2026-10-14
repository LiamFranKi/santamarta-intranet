/**
 * Archivos de esta intranet (fotos, documentos, temas).
 * En el navegador se piden al mismo origen, con el puerto incluido.
 */
export function getPublicStaticBaseUrl() {
  if (typeof window !== 'undefined' && window.location) {
    const host = window.location.hostname || '';
    if (host === 'localhost' || host === '127.0.0.1') return 'http://localhost:5000';
    return window.location.origin;
  }
  const fromApi = process.env.REACT_APP_API_URL
    ? String(process.env.REACT_APP_API_URL).replace(/\/api\/?$/i, '')
    : '';
  const candidatos = [
    process.env.REACT_APP_STATIC_PUBLIC_URL,
    process.env.REACT_APP_PHP_SYSTEM_URL,
    fromApi,
  ];
  for (const candidato of candidatos) {
    const base = String(candidato || '').trim().replace(/\/$/, '');
    if (!base || /vanguardschools/i.test(base)) continue;
    return base;
  }
  return '';
}

/** Quita dominios de otro colegio y deja la ruta en esta intranet. */
export function urlDeEsteColegio(urlOrPath) {
  if (urlOrPath == null || String(urlOrPath).trim() === '') return null;
  const base = getPublicStaticBaseUrl();
  let s = String(urlOrPath).trim();
  s = s.replace(/https?:\/\/(?:[\w-]+\.)?vanguardschools\.edu\.pe/gi, base);
  s = s.replace(/https?:\/\/(?:www\.)?vanguardschools\.com/gi, base);
  s = s.replace(/vanguardschools\.comstatic/gi, `${base}/Static`);
  s = s.replace(/vanguardschools\.com\/static/gi, `${base}/Static`);
  s = s.replace(/vanguardschools\.com\/Static/gi, `${base}/Static`);
  s = s.replace(/([^:]\/)\/+/g, '$1');
  return s;
}

/** Reescribe nuevo.vanguard y otros dominios legacy → base actual. */
export function normalizeLegacyStaticUrl(urlOrPath) {
  return urlDeEsteColegio(urlOrPath);
}

export function urlStaticArchivos(filename) {
  const name = String(filename || '').replace(/^\/+/, '');
  return `${getPublicStaticBaseUrl()}/Static/Archivos/${name}`;
}
