'use strict';

/**
 * Build de producción que no deja el sitio en 404.
 *
 * Create React App borra frontend/build al empezar. Apache usa esa carpeta.
 * Si se cancela a mitad (Ctrl+C) o webpack tarda, el intranet queda sin index.html.
 *
 * Aquí se compila en build-next. Solo si hay index.html se reemplaza build.
 * GENERATE_SOURCEMAP=false baja RAM/tiempo en el VPS.
 * .env.local se aparta durante el build (en el VPS no existe; en PC evita
 * incrustar https://nuevo.vanguardschools.edu.pe/api en el JS de producción).
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const liveBuild = path.join(root, 'build');
const nextBuild = path.join(root, 'build-next');
const oldBuild = path.join(root, 'build-old');
const envLocal = path.join(root, '.env.local');
const envLocalPaused = path.join(root, '.env.local.__build_paused');
const reactScriptsBin = path.join(root, 'node_modules', 'react-scripts', 'bin', 'react-scripts.js');

function rmDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function pauseEnvLocal() {
  if (!fs.existsSync(envLocal)) return false;
  if (fs.existsSync(envLocalPaused)) rmDir(envLocalPaused);
  fs.renameSync(envLocal, envLocalPaused);
  console.log('build-safe: .env.local apartado (no se incrusta REACT_APP_API_URL de desarrollo).');
  return true;
}

function restoreEnvLocal() {
  if (!fs.existsSync(envLocalPaused)) return;
  if (fs.existsSync(envLocal)) {
    console.warn('build-safe: .env.local volvió a aparecer; se deja el paused sin pisar.');
    return;
  }
  fs.renameSync(envLocalPaused, envLocal);
}

if (!fs.existsSync(reactScriptsBin)) {
  console.error('No se encontró react-scripts. Ejecuta: cd frontend && npm install');
  process.exit(1);
}

rmDir(nextBuild);
rmDir(oldBuild);

pauseEnvLocal();

const env = { ...process.env };
env.GENERATE_SOURCEMAP = 'false';
env.BUILD_PATH = 'build-next';
delete env.REACT_APP_API_URL;

console.log('build-safe: compilando en frontend/build-next (la carpeta pública build/ no se toca todavía)…');

let result;
try {
  result = spawnSync(process.execPath, [reactScriptsBin, 'build'], {
    cwd: root,
    env,
    stdio: 'inherit',
  });
} finally {
  restoreEnvLocal();
}

if (!result || result.status !== 0) {
  console.error(
    '\nbuild-safe: el compile falló o se canceló. frontend/build NO se modificó (el sitio sigue como estaba).'
  );
  rmDir(nextBuild);
  process.exit(result.status == null ? 1 : result.status);
}

const indexHtml = path.join(nextBuild, 'index.html');
if (!fs.existsSync(indexHtml) || fs.statSync(indexHtml).size < 200) {
  console.error('build-safe: no hay index.html válido en build-next. No se reemplaza frontend/build.');
  rmDir(nextBuild);
  process.exit(1);
}

try {
  if (fs.existsSync(liveBuild)) {
    fs.renameSync(liveBuild, oldBuild);
  }
  fs.renameSync(nextBuild, liveBuild);
} catch (err) {
  console.error('build-safe: no se pudo intercambiar carpetas:', err.message);
  if (fs.existsSync(oldBuild) && !fs.existsSync(liveBuild)) {
    try {
      fs.renameSync(oldBuild, liveBuild);
      console.error('build-safe: se restauró frontend/build anterior.');
    } catch (restoreErr) {
      console.error('build-safe: no se pudo restaurar build:', restoreErr.message);
    }
  }
  process.exit(1);
}

rmDir(oldBuild);
console.log('\nbuild-safe: listo. frontend/build actualizado.');
process.exit(0);
