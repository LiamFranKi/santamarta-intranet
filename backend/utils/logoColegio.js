/**
 * Logos del colegio (config + uploads/colegio).
 * `boleta_logo` también acepta el archivo viejo en Static/Archivos.
 */
const fs = require('fs');
const path = require('path');
const { query } = require('./mysql');
const { getPublicStaticBaseUrl } = require('./staticStorage');

const DIR = path.join(__dirname, '..', 'uploads', 'colegio');
const DIR_ESTATICOS = path.join(__dirname, '..', 'public', 'assets', 'logos');

const VARIANTES = {
  logo_colegio: { prefix: 'logo-colegio-', fallback: ['logo.png', 'logo-default.png'] },
  logo_blanco: { prefix: 'logo-blanco-', fallback: ['logoblanco.png', 'logo.png'] },
  logo_minedu: { prefix: 'logo-minedu-', fallback: ['minedu.png', 'minedu.jpg', 'minedu.jpeg'] },
  boleta_logo: { prefix: 'logo-boleta-', fallback: ['logo.png'] },
  icono_app: { prefix: 'icono-app-', fallback: [] },
};

function dirsArchivosLegacy() {
  const dirs = [];
  if (process.env.STATIC_ARCHIVOS_PATH) dirs.push(process.env.STATIC_ARCHIVOS_PATH);
  dirs.push(path.join(__dirname, '..', 'Static', 'Archivos'));
  dirs.push(require('./staticStorage').staticFsSubdir('Archivos'));
  return dirs;
}

function buscarEnArchivosLegacy(nombre) {
  const name = path.basename(String(nombre || ''));
  if (!name || !/\.(png|jpe?g)$/i.test(name)) return null;
  const copiado = require('./staticStorage').asegurarArchivoStatic(path.join('Archivos', name));
  if (copiado) return copiado;
  for (const dir of dirsArchivosLegacy()) {
    if (/intranet2026|vanguardschools/i.test(dir)) continue;
    const p = path.join(dir, name);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function asegurarDir() {
  if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
  return DIR;
}

function specDe(clave) {
  return VARIANTES[clave] || VARIANTES.logo_colegio;
}

function archivoSubido(prefix) {
  if (!fs.existsSync(DIR)) return null;
  const files = fs
    .readdirSync(DIR)
    .filter((f) => f.startsWith(prefix) && /\.(png|jpe?g)$/i.test(f))
    .sort();
  if (!files.length) return null;
  return files[files.length - 1];
}

function fallbackEstatico(nombres, urlSiFalta) {
  for (const name of nombres) {
    const p = path.join(DIR_ESTATICOS, name);
    if (fs.existsSync(p)) return { fsPath: p, urlPath: `/assets/logos/${name}` };
  }
  return { fsPath: null, urlPath: urlSiFalta };
}

/** Lectura en disco, sin BD. La usan los PDF del servidor. */
function rutaLogoVarianteSync(clave) {
  const spec = specDe(clave);
  const name = archivoSubido(spec.prefix);
  if (name) return path.join(DIR, name);
  if (!spec.fallback || !spec.fallback.length) return null;
  return fallbackEstatico(spec.fallback, `/assets/logos/${spec.fallback[0]}`).fsPath;
}

function rutaLogoColegioSync() {
  return rutaLogoVarianteSync('logo_colegio');
}

async function resolverLogoVariante(clave) {
  const spec = specDe(clave);
  let desdeConfig = false;
  let fsPath = null;
  let urlPath = null;
  try {
    const rows = await query(`SELECT valor FROM config WHERE clave = ? LIMIT 1`, [clave]);
    const name = rows?.[0]?.valor ? path.basename(String(rows[0].valor)) : '';
    if (name && /\.(png|jpe?g)$/i.test(name)) {
      if (name.startsWith(spec.prefix)) {
        const p = path.join(DIR, name);
        if (fs.existsSync(p)) {
          desdeConfig = true;
          fsPath = p;
          urlPath = `/uploads/colegio/${name}`;
        }
      }
      if (!desdeConfig && clave === 'boleta_logo') {
        const legacy = buscarEnArchivosLegacy(name);
        if (legacy) {
          desdeConfig = true;
          fsPath = legacy;
          urlPath = `/Static/Archivos/${name}`;
        }
      }
    }
  } catch (_) {
    /* sin tabla config: se usa el archivo fijo */
  }
  if (!desdeConfig) {
    if (!spec.fallback || !spec.fallback.length) {
      fsPath = null;
      urlPath = null;
    } else {
      const fb = fallbackEstatico(spec.fallback, `/assets/logos/${spec.fallback[0]}`);
      fsPath = fb.fsPath;
      urlPath = fb.urlPath;
    }
  }
  const base = String(getPublicStaticBaseUrl() || '').replace(/\/$/, '');
  return {
    desdeConfig,
    fsPath,
    urlPath,
    urlAbsoluta: urlPath ? `${base}${urlPath}` : null,
  };
}

async function resolverLogoColegio() {
  return resolverLogoVariante('logo_colegio');
}

function guardarArchivoLogo(tempPath, originalName, clave = 'logo_colegio') {
  const spec = specDe(clave);
  asegurarDir();
  const ext = (path.extname(originalName || '') || '.png').toLowerCase();
  const safeExt = ['.png', '.jpg', '.jpeg'].includes(ext) ? ext : '.png';
  const filename = `${spec.prefix}${Date.now()}${safeExt}`;
  const dest = path.join(DIR, filename);
  fs.copyFileSync(tempPath, dest);
  try {
    if (tempPath && fs.existsSync(tempPath) && path.resolve(tempPath) !== path.resolve(dest)) {
      fs.unlinkSync(tempPath);
    }
  } catch (_) {
    /* el temporal de multer puede vivir en otro disco */
  }
  for (const f of fs.readdirSync(DIR)) {
    if (f.startsWith(spec.prefix) && f !== filename) {
      try {
        fs.unlinkSync(path.join(DIR, f));
      } catch (_) {
        /* seguir */
      }
    }
  }
  return filename;
}

async function upsertClave(clave, valor) {
  const { execute } = require('./mysql');
  const existing = await query(`SELECT id FROM config WHERE clave = ? LIMIT 1`, [clave]);
  if (existing?.length) {
    await execute(`UPDATE config SET valor = ? WHERE clave = ?`, [valor, clave]);
  } else {
    await execute(`INSERT INTO config (clave, valor) VALUES (?, ?)`, [clave, valor]);
  }
}

function dataUrlDesdeArchivo(fsPath) {
  if (!fsPath || !fs.existsSync(fsPath)) return null;
  try {
    const buf = fs.readFileSync(fsPath);
    const ext = path.extname(fsPath).toLowerCase();
    const mime = ext === '.png' ? 'image/png' : 'image/jpeg';
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch (_) {
    return null;
  }
}

/** Logo de CV, carnet QR y respaldo de boleta. Sale de `boleta_logo` en config. */
async function leerLogoParaCliente() {
  const logo = await resolverLogoVariante('boleta_logo');
  return {
    logo_url: logo.urlAbsoluta || null,
    logo_base64: dataUrlDesdeArchivo(logo.fsPath),
    desdeConfig: !!logo.desdeConfig,
  };
}

/** Boletas de pago: logo a color si está subido; si no, el de boleta/CV. */
async function urlLogoBoletaPago() {
  const color = await resolverLogoColegio();
  if (color.desdeConfig && color.urlAbsoluta) return color.urlAbsoluta;
  const boleta = await resolverLogoVariante('boleta_logo');
  return boleta.urlAbsoluta || null;
}

module.exports = {
  resolverLogoColegio,
  resolverLogoVariante,
  guardarArchivoLogo,
  rutaLogoColegioSync,
  rutaLogoVarianteSync,
  leerLogoParaCliente,
  urlLogoBoletaPago,
  upsertClave,
};
