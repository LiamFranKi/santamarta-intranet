/**
 * Rutas seguras bajo web-vanguard (adjuntos reclamos / CVs).
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
};
