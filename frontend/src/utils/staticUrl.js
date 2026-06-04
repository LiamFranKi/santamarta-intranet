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

export function urlStaticArchivos(filename) {
  const name = String(filename || '').replace(/^\/+/, '');
  return `${getPublicStaticBaseUrl()}/Static/Archivos/${name}`;
}
