const path = require('path');
const fs = require('fs');

const backendRoot = path.join(__dirname, '..');
const uploadRoot = process.env.FICHAS_IA_UPLOAD_ROOT
  ? path.resolve(process.env.FICHAS_IA_UPLOAD_ROOT)
  : path.join(backendRoot, 'uploads', 'fichas-ia');

const dirs = {
  origen: path.join(uploadRoot, 'origen'),
  generados: path.join(uploadRoot, 'generados'),
  trabajo: path.join(uploadRoot, 'trabajo'),
};

const assetsDir = path.join(backendRoot, 'public', 'assets', 'fichas-ia');
const templatesDir = path.join(backendRoot, 'templates', 'fichas-ia');

function ensureFichasIaDirs() {
  Object.values(dirs).forEach((d) => {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  });
  if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });
  if (!fs.existsSync(templatesDir)) fs.mkdirSync(templatesDir, { recursive: true });
}

function publicBaseUrl() {
  const base = (
    process.env.PUBLIC_FILES_URL ||
    process.env.FRONTEND_URL ||
    'http://localhost:5000'
  ).replace(/\/$/, '');
  return base;
}

function urlUploads(relPath) {
  const clean = String(relPath || '').replace(/^\/+/, '');
  return `${publicBaseUrl()}/uploads/fichas-ia/${clean}`;
}

function urlAssets(relPath) {
  const clean = String(relPath || '').replace(/^\/+/, '');
  return `${publicBaseUrl()}/assets/fichas-ia/${clean}`;
}

module.exports = {
  backendRoot,
  uploadRoot,
  dirs,
  assetsDir,
  templatesDir,
  ensureFichasIaDirs,
  publicBaseUrl,
  urlUploads,
  urlAssets,
};
