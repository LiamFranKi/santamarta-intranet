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
  return String(u).replace(/\/$/, '');
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
  const f = String(filenameOrPath || '').replace(/^\/+/, '');
  if (f.startsWith('http://') || f.startsWith('https://')) return f;
  if (f.startsWith('Static/')) return `${getPublicStaticBaseUrl()}/${f}`;
  return `${getPublicStaticBaseUrl()}/Static/Image/Fotos/${path.basename(f)}`;
}

module.exports = {
  DEFAULT_PUBLIC_BASE,
  resolveStaticFsRoot,
  getPublicStaticBaseUrl,
  staticFsSubdir,
  joinStaticFs,
  urlStaticArchivos,
  urlStaticFotos,
};
