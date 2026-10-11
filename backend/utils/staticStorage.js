/**
 * Archivos estáticos del intranet React (sistema.vanguardschools.edu.pe).
 * Disco: backend/Static (en VPS: /home/vanguard/intranet2026/backend/Static)
 * URL pública: https://sistema.vanguardschools.edu.pe/Static/...
 */
const path = require('path');
const fs = require('fs');

const DEFAULT_PUBLIC_BASE = 'https://sistema.vanguardschools.edu.pe';

function resolveStaticFsRoot() {
  if (process.env.STATIC_FS_ROOT) {
    return String(process.env.STATIC_FS_ROOT).replace(/\/$/, '');
  }
  return path.join(__dirname, '..', 'Static');
}

function getPublicStaticBaseUrl() {
  const u =
    process.env.STATIC_PUBLIC_URL ||
    process.env.API_PUBLIC_URL ||
    process.env.FRONTEND_URL ||
    process.env.PHP_SYSTEM_URL ||
    DEFAULT_PUBLIC_BASE;
  let base = String(u).replace(/\/$/, '');
  // Seguridad: nunca devolver dominio legacy en producción
  base = base.replace(/https?:\/\/nuevo\.vanguardschools\.edu\.pe/gi, DEFAULT_PUBLIC_BASE);
  return base;
}

function staticFsSubdir(...segments) {
  const p = path.join(resolveStaticFsRoot(), ...segments);
  if (!fs.existsSync(p)) {
    fs.mkdirSync(p, { recursive: true });
  }
  return p;
}

function joinStaticFs(...segments) {
  return path.join(resolveStaticFsRoot(), ...segments);
}

function urlStaticArchivos(filename) {
  const name = String(filename || '').replace(/^\/+/, '');
  return `${getPublicStaticBaseUrl()}/Static/Archivos/${name}`;
}

function urlStaticFotos(filenameOrPath) {
  if (filenameOrPath == null || String(filenameOrPath).trim() === '') return null;
  const f = String(filenameOrPath || '').replace(/^\/+/, '');
  if (f.startsWith('http://') || f.startsWith('https://')) {
    return normalizeLegacyStaticUrl(f);
  }
  if (f.startsWith('uploads/') || f.startsWith('/uploads/')) {
    const pathPart = f.startsWith('/') ? f : `/${f}`;
    const isDev =
      process.env.NODE_ENV !== 'production' &&
      !process.env.STATIC_PUBLIC_URL &&
      !process.env.PHP_SYSTEM_URL;
    return isDev ? `http://localhost:5000${pathPart}` : `${getPublicStaticBaseUrl()}${pathPart}`;
  }
  if (f.startsWith('Static/')) return `${getPublicStaticBaseUrl()}/${f}`;
  return `${getPublicStaticBaseUrl()}/Static/Image/Fotos/${path.basename(f)}`;
}

/** Reescribe dominios legacy (nuevo.vanguard, vanguardschools.edu.pe) → URL pública actual. */
function normalizeLegacyStaticUrl(urlOrPath) {
  if (urlOrPath == null || urlOrPath === '') return null;
  const base = getPublicStaticBaseUrl();
  let s = String(urlOrPath).trim();
  s = s.replace(/https?:\/\/nuevo\.vanguardschools\.edu\.pe/gi, base);
  s = s.replace(/https?:\/\/(www\.)?vanguardschools\.edu\.pe/gi, base);
  s = s.replace(/vanguardschools\.comstatic/gi, `${base}/Static`);
  s = s.replace(/vanguardschools\.com\/static/gi, `${base}/Static`);
  s = s.replace(/vanguardschools\.com\/Static/gi, `${base}/Static`);
  s = s.replace(/([^:]\/)\/+/g, '$1');
  return s;
}

/**
 * URL pública de un archivo en Static/Archivos (temas, tareas, PDFs, adjuntos).
 * Acepta nombre suelto, /Static/Archivos/x, /uploads/... o URL http legacy.
 */
function nombreFondoSeguro(filename) {
  const name = path.basename(String(filename || ''));
  if (!name || !/^[\w.\-]+\.(png|jpe?g|webp)$/i.test(name)) return null;
  return name;
}

/** Carpeta de fondos de esta copia. Si el archivo se guardó antes en la de Vanguard, también lo encuentra. */
function rutaFondoConfig(filename) {
  const name = nombreFondoSeguro(filename);
  if (!name) return null;
  const local = path.join(resolveStaticFsRoot(), 'Image', 'Fondos', name);
  if (fs.existsSync(local)) return local;
  const legado = '/home/vanguard/intranet2026/backend/Static/Image/Fondos/' + name;
  if (fs.existsSync(legado)) return legado;
  return null;
}

function urlFondoConfig(filename) {
  const name = nombreFondoSeguro(filename);
  return name ? `/api/static/fondos/${name}` : null;
}

function buildStaticArchivoUrl(archivo) {
  if (archivo == null || String(archivo).trim() === '') return null;
  const base = getPublicStaticBaseUrl();
  const isDev =
    process.env.NODE_ENV !== 'production' &&
    !process.env.STATIC_PUBLIC_URL &&
    !process.env.PHP_SYSTEM_URL;
  const s = String(archivo).trim();

  if (s.startsWith('http://') || s.startsWith('https://')) {
    return normalizeLegacyStaticUrl(s);
  }
  if (s.startsWith('/Static/')) {
    const nombre = s.replace(/^\/Static\/Archivos\//, '').replace(/^\/Static\//, '');
    const file = path.basename(nombre);
    return isDev
      ? `http://localhost:5000/Static/Archivos/${file}`
      : `${base}/Static/Archivos/${file}`;
  }
  if (s.startsWith('/uploads/')) {
    return isDev ? `http://localhost:5000${s}` : `${base}${s}`;
  }
  return isDev
    ? `http://localhost:5000/Static/Archivos/${s.replace(/^\/+/, '')}`
    : `${base}/Static/Archivos/${s.replace(/^\/+/, '')}`;
}

module.exports = {
  DEFAULT_PUBLIC_BASE,
  resolveStaticFsRoot,
  getPublicStaticBaseUrl,
  staticFsSubdir,
  joinStaticFs,
  urlStaticArchivos,
  urlStaticFotos,
  normalizeLegacyStaticUrl,
  buildStaticArchivoUrl,
  nombreFondoSeguro,
  rutaFondoConfig,
  urlFondoConfig,
};
