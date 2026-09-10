/**
 * Rutas seguras bajo web-vanguard (adjuntos reclamos / CVs / PDFs públicos).
 * Solo permite archivos dentro de WEB_VANGUARD_ROOT (nunca /var/www/web).
 */
const path = require('path');
const fs = require('fs');

function resolveWebVanguardRoot() {
  if (process.env.WEB_VANGUARD_ROOT) {
    return String(process.env.WEB_VANGUARD_ROOT).replace(/[/\\]+$/, '');
  }
  const sibling = path.resolve(__dirname, '..', '..', 'web-vanguard');
  if (fs.existsSync(sibling)) return sibling;
  const vpsDefault = '/home/vanguard/web-vanguard';
  if (fs.existsSync(vpsDefault)) return vpsDefault;
  if (process.env.FTP_BASE_PATH) {
    return String(process.env.FTP_BASE_PATH).replace(/[/\\]+$/, '');
  }
  return sibling;
}

function isUnderRoot(absPath, root) {
  const abs = path.resolve(absPath);
  const r = path.resolve(root);
  return abs === r || abs.startsWith(r + path.sep);
}

/** public/utiles | public/documentos — PDFs servidos por la web Next.js */
function ensureWebPublicDir(subdir) {
  const root = path.resolve(resolveWebVanguardRoot());
  const dir = path.join(root, 'public', String(subdir || '').replace(/^[/\\]+/, ''));
  if (!isUnderRoot(dir, path.join(root, 'public'))) {
    throw new Error('Subdirectorio público inválido');
  }
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function sanitizeImageBasename(name, fallback = 'imagen.jpg') {
  let base = path.basename(String(name || fallback).trim());
  base = base.replace(/[^\w.\-() áéíóúÁÉÍÓÚñÑ]+/gi, '_').replace(/\s+/g, '_');
  const ext = path.extname(base).toLowerCase();
  const allowed = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
  if (!allowed.has(ext)) {
    const stem = path.basename(base, ext) || 'imagen';
    base = `${stem}.jpg`;
  }
  if (!base || base === '.jpg') base = fallback;
  return base;
}

/**
 * Guarda una imagen en web-vanguard/public/<subdir>.
 * ruta pública: /niveles/foo.jpg
 */
function saveWebPublicImage({ subdir, publicPrefix, originalName, destName, tempPath }) {
  const dir = ensureWebPublicDir(subdir);
  const archivo = sanitizeImageBasename(destName || originalName);
  const absPath = path.join(dir, archivo);
  if (!isUnderRoot(absPath, dir)) throw new Error('Nombre de archivo inválido');
  if (tempPath && tempPath !== absPath) {
    fs.copyFileSync(tempPath, absPath);
    try {
      fs.unlinkSync(tempPath);
    } catch {
      /* ignore */
    }
  }
  const prefix = `/${String(publicPrefix || subdir).replace(/^\/+|\/+$/g, '')}`;
  return { archivo, ruta: `${prefix}/${archivo}`, absPath };
}

function sanitizePdfBasename(name, fallback = 'archivo.pdf') {
  let base = path.basename(String(name || fallback).trim());
  base = base.replace(/[^\w.\-() áéíóúÁÉÍÓÚñÑ]+/gi, '_').replace(/\s+/g, '_');
  if (!base.toLowerCase().endsWith('.pdf')) base = `${base || 'archivo'}.pdf`;
  if (!base || base === '.pdf') base = fallback;
  return base;
}

/**
 * Guarda un PDF en web-vanguard/public/<subdir> y devuelve { archivo, ruta, absPath }.
 * ruta pública: /utiles/x.pdf o /documentos/x.pdf
 */
function saveWebPublicPdf({ subdir, publicPrefix, originalName, destName, tempPath }) {
  const dir = ensureWebPublicDir(subdir);
  const archivo = sanitizePdfBasename(destName || originalName);
  const absPath = path.join(dir, archivo);
  if (!isUnderRoot(absPath, dir)) throw new Error('Nombre de archivo inválido');
  if (tempPath && tempPath !== absPath) {
    fs.copyFileSync(tempPath, absPath);
    try {
      fs.unlinkSync(tempPath);
    } catch {
      /* ignore */
    }
  }
  const prefix = `/${String(publicPrefix || subdir).replace(/^\/+|\/+$/g, '')}`;
  return { archivo, ruta: `${prefix}/${archivo}`, absPath };
}

function removeWebPublicFileIfSafe(rutaPublica) {
  if (!rutaPublica) return;
  const root = path.resolve(resolveWebVanguardRoot());
  const publicRoot = path.join(root, 'public');
  const rel = String(rutaPublica).replace(/^[/\\]+/, '');
  const abs = path.resolve(publicRoot, rel);
  if (!isUnderRoot(abs, publicRoot)) return;
  try {
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) fs.unlinkSync(abs);
  } catch {
    /* ignore */
  }
}

/**
 * Resuelve un archivo bajo web-vanguard/data (anti path-traversal).
 * Acepta ruta absoluta del VPS o relativa/basename.
 */
function resolveWebDataFile({ ruta, nombre, subdirs = [] }) {
  const root = path.resolve(resolveWebVanguardRoot());
  const dataRoot = path.join(root, 'data');
  const candidates = [];

  const pushSafe = (p) => {
    if (!p) return;
    const abs = path.resolve(p);
    if (isUnderRoot(abs, dataRoot) || isUnderRoot(abs, root)) {
      candidates.push(abs);
    }
  };

  if (ruta) {
    const raw = String(ruta).trim();
    // Ruta absoluta del VPS (ej. /home/vanguard/web-vanguard/data/...)
    if (path.isAbsolute(raw)) {
      pushSafe(raw);
    } else {
      pushSafe(path.join(root, raw.replace(/^[/\\]+/, '')));
      pushSafe(path.join(dataRoot, raw.replace(/^[/\\]+/, '')));
    }
    for (const sub of subdirs) {
      pushSafe(path.join(dataRoot, ...sub.split(/[/\\]+/), path.basename(raw)));
    }
  }

  if (nombre) {
    const base = path.basename(String(nombre));
    for (const sub of subdirs) {
      pushSafe(path.join(dataRoot, ...sub.split(/[/\\]+/), base));
    }
  }

  for (const c of candidates) {
    try {
      if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
    } catch {
      /* ignore */
    }
  }
  return null;
}

module.exports = {
  resolveWebVanguardRoot,
  resolveWebDataFile,
  isUnderRoot,
  ensureWebPublicDir,
  sanitizePdfBasename,
  sanitizeImageBasename,
  saveWebPublicPdf,
  saveWebPublicImage,
  removeWebPublicFileIfSafe,
};
