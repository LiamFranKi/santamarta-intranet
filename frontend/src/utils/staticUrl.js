/**
 * URL base pública de /Static (sistema React en producción).
 */
export function getPublicStaticBaseUrl() {
  const fromApi = process.env.REACT_APP_API_URL
    ? String(process.env.REACT_APP_API_URL).replace(/\/api\/?$/i, '')
    : '';
  const u =
    process.env.REACT_APP_STATIC_PUBLIC_URL ||
    process.env.REACT_APP_PHP_SYSTEM_URL ||
    fromApi ||
    'https://sistema.vanguardschools.edu.pe';
  return String(u).replace(/\/$/, '');
}

/** Reescribe nuevo.vanguard y otros dominios legacy → base actual. */
export function normalizeLegacyStaticUrl(urlOrPath) {
  if (urlOrPath == null || urlOrPath === '') return null;
  const base = getPublicStaticBaseUrl();
  return String(urlOrPath)
    .trim()
    .replace(/https?:\/\/nuevo\.vanguardschools\.edu\.pe/gi, base)
    .replace(/https?:\/\/(www\.)?vanguardschools\.edu\.pe/gi, base);
}

export function urlStaticArchivos(filename) {
  const name = String(filename || '').replace(/^\/+/, '');
  return `${getPublicStaticBaseUrl()}/Static/Archivos/${name}`;
}
