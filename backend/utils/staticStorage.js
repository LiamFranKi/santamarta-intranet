/**
 * Archivos de ESTA intranet.
 * Disco: backend/Static de la carpeta donde corre el proceso
 * (Santa Marta: /home/vanguard/santamarta/backend/Static).
 * URL: el mismo origen del navegador (/Static/...), nunca el dominio de otro colegio.
 */
const path = require('path');
const fs = require('fs');

const LEGACY_STATIC_ROOT = '/home/vanguard/intranet2026/backend/Static';

function urlApuntaAOtroColegio(valor) {
  return /vanguardschools/i.test(String(valor || ''));
}

['PHP_SYSTEM_URL', 'FRONTEND_URL', 'STATIC_PUBLIC_URL', 'API_PUBLIC_URL'].forEach((clave) => {
  if (urlApuntaAOtroColegio(process.env[clave])) delete process.env[clave];
});

function resolveStaticFsRoot() {
  if (process.env.STATIC_FS_ROOT && !urlApuntaAOtroColegio(process.env.STATIC_FS_ROOT) && !/intranet2026/i.test(process.env.STATIC_FS_ROOT)) {
    return String(process.env.STATIC_FS_ROOT).replace(/\/$/, '');
  }
  return path.join(__dirname, '..', 'Static');
}

function getPublicStaticBaseUrl() {
  const candidatos = [
    process.env.STATIC_PUBLIC_URL,
    process.env.API_PUBLIC_URL,
    process.env.FRONTEND_URL,
    process.env.PHP_SYSTEM_URL,
  ];
  for (const candidato of candidatos) {
    const base = String(candidato || '').trim().replace(/\/$/, '');
    if (!base || urlApuntaAOtroColegio(base)) continue;
    return base;
  }
  return '';
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
  s = s.replace(/https?:\/\/(?:nuevo\.|sistema\.|www\.)?vanguardschools\.edu\.pe/gi, base);
  s = s.replace(/https?:\/\/(?:www\.)?vanguardschools\.com/gi, base);
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

/**
 * Si el archivo ya está en esta intranet, lo usa.
 * Si una subida anterior quedó en la carpeta del otro colegio, lo copia aquí y desde entonces se sirve desde esta intranet.
 */
function asegurarArchivoStatic(rel) {
  const limpio = path.normalize(String(rel || '')).replace(/^(\.\.(\/|\\|$))+/, '').replace(/^[/\\]+/, '');
  if (!limpio || limpio.split(/[/\\]/).includes('..')) return null;
  const local = path.join(resolveStaticFsRoot(), limpio);
  if (fs.existsSync(local) && fs.statSync(local).isFile()) return local;
  const legado = path.resolve(LEGACY_STATIC_ROOT, limpio);
  const raizLegado = path.resolve(LEGACY_STATIC_ROOT);
  if (!legado.startsWith(raizLegado)) return null;
  if (!fs.existsSync(legado) || !fs.statSync(legado).isFile()) return null;
  fs.mkdirSync(path.dirname(local), { recursive: true });
  fs.copyFileSync(legado, local);
  return local;
}

/** Carpeta de fondos de esta copia. */
function rutaFondoConfig(filename) {
  const name = nombreFondoSeguro(filename);
  if (!name) return null;
  return asegurarArchivoStatic(path.join('Image', 'Fondos', name));
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
  resolveStaticFsRoot,
  getPublicStaticBaseUrl,
  staticFsSubdir,
  joinStaticFs,
  asegurarArchivoStatic,
  urlStaticArchivos,
  urlStaticFotos,
  normalizeLegacyStaticUrl,
  buildStaticArchivoUrl,
  nombreFondoSeguro,
  rutaFondoConfig,
  urlFondoConfig,
};
