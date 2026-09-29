const fs = require('fs');
const os = require('os');
const path = require('path');
const multer = require('multer');
const { execute } = require('./mysql');
const { assetsDir } = require('./fichasIaPaths');
const { htmlStringToPdf } = require('../services/fichasIa/renderFichaPdf');

const DIR = path.join(__dirname, '..', 'uploads', 'cneb-material');
const TIPOS = new Set(['teoria', 'ficha']);
const EXT_OK = new Set(['.pdf', '.png', '.jpg', '.jpeg', '.webp', '.doc', '.docx']);

function asegurarDir() {
  if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
  return DIR;
}

function columna(tipo) {
  return tipo === 'ficha' ? 'archivo_ficha' : 'archivo_teoria';
}

function extDe(nombre) {
  const ext = path.extname(String(nombre || '')).toLowerCase();
  return EXT_OK.has(ext) ? ext : '';
}

function mimeDe(nombre) {
  const ext = extDe(nombre);
  if (ext === '.pdf') return 'application/pdf';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.doc') return 'application/msword';
  if (ext === '.docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  return 'application/octet-stream';
}

function rutaSegura(nombre) {
  const base = path.basename(String(nombre || ''));
  if (!base || base !== String(nombre || '') || !extDe(base)) return null;
  const full = path.join(DIR, base);
  if (!full.startsWith(DIR)) return null;
  return fs.existsSync(full) ? full : null;
}

const uploadMaterial = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, asegurarDir()),
    filename: (req, file, cb) => {
      const ext = extDe(file.originalname) || '.pdf';
      cb(null, `cneb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
    },
  }),
  limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!extDe(file.originalname)) {
      cb(new Error('Suba un PDF, un Word o una imagen (JPG, PNG).'));
      return;
    }
    cb(null, true);
  },
});

async function guardarMaterial(cid, sesionId, tipo, file) {
  if (!TIPOS.has(tipo) || !file) {
    const e = new Error('Indique si es teoría o ficha, y el archivo.');
    e.status = 400;
    throw e;
  }
  const col = columna(tipo);
  const anterior = await nombreGuardado(cid, sesionId, col);
  try {
    await execute(
      `UPDATE cneb_sesiones SET ${col} = ? WHERE id = ? AND colegio_id = ?`,
      [file.filename, sesionId, cid]
    );
  } catch (e) {
    fs.unlink(file.path, () => {});
    if (e.code === 'ER_BAD_FIELD_ERROR') {
      const err = new Error('Falta aplicar la migración 118_cneb_material_archivos_mysql.sql');
      err.status = 500;
      throw err;
    }
    throw e;
  }
  if (anterior && anterior !== file.filename) {
    const viejo = rutaSegura(anterior);
    if (viejo) fs.unlink(viejo, () => {});
  }
  return { tipo, archivo: file.filename };
}

async function quitarMaterial(cid, sesionId, tipo) {
  if (!TIPOS.has(tipo)) {
    const e = new Error('Indique si es teoría o ficha.');
    e.status = 400;
    throw e;
  }
  const col = columna(tipo);
  const anterior = await nombreGuardado(cid, sesionId, col);
  try {
    await execute(
      `UPDATE cneb_sesiones SET ${col} = NULL WHERE id = ? AND colegio_id = ?`,
      [sesionId, cid]
    );
  } catch (e) {
    if (e.code === 'ER_BAD_FIELD_ERROR') {
      const err = new Error('Falta aplicar la migración 118_cneb_material_archivos_mysql.sql');
      err.status = 500;
      throw err;
    }
    throw e;
  }
  const viejo = rutaSegura(anterior);
  if (viejo) fs.unlink(viejo, () => {});
  return { tipo, archivo: null };
}

async function nombreGuardado(cid, sesionId, col) {
  const { query } = require('./mysql');
  try {
    const [row] = await query(
      `SELECT ${col} AS nombre FROM cneb_sesiones WHERE id = ? AND colegio_id = ? LIMIT 1`,
      [sesionId, cid]
    );
    return row?.nombre || null;
  } catch (e) {
    if (e.code === 'ER_BAD_FIELD_ERROR') return null;
    throw e;
  }
}

function bufferArchivoPropio(ses, parte) {
  const nombre = parte === 'ficha' ? ses?.archivo_ficha : ses?.archivo_teoria;
  const full = rutaSegura(nombre);
  if (!full) return null;
  return {
    buffer: fs.readFileSync(full),
    filename: path.basename(full),
    contentType: mimeDe(full),
  };
}

const uriCache = new Map();

function dataUri(archivo) {
  if (!archivo || !fs.existsSync(archivo)) return null;
  const key = `${archivo}:${fs.statSync(archivo).mtimeMs}`;
  if (uriCache.has(key)) return uriCache.get(key);
  const ext = path.extname(archivo).toLowerCase();
  const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.webp' ? 'image/webp' : 'image/png';
  const uri = `data:${mime};base64,${fs.readFileSync(archivo).toString('base64')}`;
  uriCache.set(key, uri);
  return uri;
}

function uriAsset(nombre) {
  const full = path.join(assetsDir, nombre);
  return dataUri(full);
}

function logoData() {
  try {
    const { rutaLogoColegioSync } = require('./logoColegio');
    const logo = rutaLogoColegioSync();
    if (logo) return dataUri(logo);
  } catch {
    /* sin logo de colegio */
  }
  return uriAsset('logo-vanguard.png');
}

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function htmlSeguro(raw) {
  const src = String(raw || '').trim();
  if (!src) return '';
  if (!/<(p|div|h[1-6]|ul|ol|li|strong|b|em|i|br)\b/i.test(src)) {
    return src
      .split(/\n+/)
      .map((t) => t.trim())
      .filter(Boolean)
      .map((t) => `<p>${esc(t)}</p>`)
      .join('');
  }
  return src
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<(p|br|strong|b|em|i|ul|ol|li|h[1-3])(?:\s[^>]*)?>/gi, '<$1>')
    .replace(/<(?!\/?(?:p|br|strong|b|em|i|ul|ol|li|h[1-3])\b)[^>]+>/gi, '')
    .replace(/<p>\s*(?:<br>\s*)*<\/p>/gi, '');
}

function htmlMaterial({ ses, colegio, grupo, fecha, parte, mascotaUri, nombreMascota }) {
  const esFicha = parte === 'ficha';
  const cuerpo = htmlSeguro(esFicha ? ses.ficha_estudiante : ses.material_teoria);
  if (!cuerpo.trim()) return '';
  const logo = logoData();
  const vanguarcito = mascotaUri || uriAsset('vanguarcito.png');
  const etiquetaMascota = esc(nombreMascota || 'Vanguarcito');
  const aula = [grupo?.grado, grupo?.seccion].filter((x) => x != null && String(x).trim()).join(' ');
  const curso = ses.curso_nombre || ses.area_nombre || '';
  const kicker = esFicha ? 'Ficha de trabajo' : 'Para leer';
  const titulo = esc(ses.titulo || 'Sesión');
  const unidad = esc(ses.unidad || '');
  const meta = esc([curso, colegio?.nombre, aula, fecha].filter(Boolean).join('  ·  '));
  const datos = esFicha
    ? `<div class="datos"><span>Nombre: <i></i></span><span>Fecha: <i></i></span></div>`
    : '';
  const dibujo = esFicha
    ? `<section class="dibujo"><p>Espacio para dibujar o escribir</p><div class="hoja"></div></section>`
    : '';
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8" />
<style>
  @page { size: A4; margin: 10mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; }
  .marco { border: 3px solid #059669; }
  .banda { height: 6px; background: linear-gradient(90deg, #059669, #2563eb, #059669); }
  .inner { padding: 14px 16px 16px; }
  .cab { display: grid; grid-template-columns: 72px 1fr 88px; gap: 10px; align-items: center;
    padding: 10px 12px; border-radius: 12px; background: linear-gradient(135deg, #ecfdf5, #eff6ff);
    border: 1px solid #a7f3d0; }
  .cab img { height: 58px; width: 72px; object-fit: contain; }
  .mascota-cab { display: flex; flex-direction: column; align-items: center; gap: 2px; }
  .mascota-cab span { font-size: 9px; font-weight: 800; color: #047857; text-align: center; line-height: 1.15; }
  .kicker { margin: 0; font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: #047857; font-weight: 800; }
  h1 { margin: 2px 0 0; font-size: 18px; line-height: 1.25; color: #065f46; }
  .unidad { margin: 3px 0 0; font-size: 12px; color: #1d4ed8; font-weight: 700; }
  .meta { margin: 3px 0 0; font-size: 11px; color: #64748b; }
  .datos { display: flex; gap: 18px; margin-top: 12px; font-size: 13px; }
  .datos i { display: inline-block; width: 180px; border-bottom: 1px solid #94a3b8; }
  .prosa { margin-top: 12px; font-size: 13.5px; line-height: 1.55; }
  .prosa p { margin: 0 0 8px; }
  .prosa ul, .prosa ol { margin: 4px 0 10px; padding-left: 1.25em; }
  .prosa li { margin: 0 0 6px; }
  .prosa strong, .prosa b { color: #065f46; }
  .dibujo { margin-top: 14px; }
  .dibujo p { margin: 0 0 6px; font-size: 12px; font-weight: 700; color: #047857; }
  .hoja { height: 200px; border: 2px dashed #86efac; border-radius: 12px; background:
    repeating-linear-gradient(#fff, #fff 27px, #d1fae5 28px); }
  .pie { margin-top: 12px; font-size: 10px; color: #64748b; }
</style></head>
<body><div class="marco"><div class="banda"></div><div class="inner">
  <header class="cab">
    ${logo ? `<img src="${logo}" alt="" />` : '<span></span>'}
    <div>
      <p class="kicker">${kicker}</p>
      <h1>${titulo}</h1>
      ${unidad ? `<p class="unidad">${unidad}</p>` : ''}
      <p class="meta">${meta}</p>
    </div>
    ${vanguarcito ? `<div class="mascota-cab"><img src="${vanguarcito}" alt="" /><span>${etiquetaMascota}</span></div>` : '<span></span>'}
  </header>
  ${datos}
  <div class="prosa">${cuerpo}</div>
  ${dibujo}
  <p class="pie">${esFicha ? 'Hoja de trabajo. No es una nota.' : 'Texto para leer el tema. No es la ficha ni una nota.'}</p>
</div></div></body></html>`;
}

async function bufferPdfBonito({ ses, colegio, grupo, fecha, parte }) {
  let mascotaUri = null;
  let nombreMascota = 'Vanguarcito';
  try {
    const { leerMascota, dataUriDe } = require('./mascotaColegio');
    const mascota = await leerMascota(colegio?.id || 1);
    nombreMascota = mascota.nombre;
    mascotaUri = dataUriDe(mascota.imagen_fs);
  } catch (_) {
    /* sigue el dibujo de siempre */
  }
  const html = htmlMaterial({ ses, colegio, grupo, fecha, parte, mascotaUri, nombreMascota });
  if (!html) return null;
  const pdfPath = path.join(os.tmpdir(), `cneb-${parte}-${ses.id}-${Date.now()}.pdf`);
  await htmlStringToPdf(html, pdfPath, {
    marginZero: true,
    deviceScaleFactor: 1,
    reutilizar: true,
    waitUntil: 'domcontentloaded',
    preferCSSPageSize: true,
    timeout: 25000,
  });
  const buffer = fs.readFileSync(pdfPath);
  fs.unlink(pdfPath, () => {});
  const slug = String(ses.titulo || 'sesion')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .slice(0, 40);
  return {
    buffer,
    filename: `${parte}_cneb_${ses.id}_${slug}.pdf`,
    contentType: 'application/pdf',
  };
}

function clonarArchivoMaterial(nombre) {
  const full = rutaSegura(nombre);
  if (!full) return null;
  const ext = path.extname(full);
  const nuevo = `cneb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
  try {
    fs.copyFileSync(full, path.join(asegurarDir(), nuevo));
    return nuevo;
  } catch (e) {
    console.error('[clonar material cneb]', e);
    return null;
  }
}

async function duplicarArchivosEnSesion(cid, sesionOrigen, sesionDestinoId) {
  const teoria = clonarArchivoMaterial(sesionOrigen?.archivo_teoria);
  const ficha = clonarArchivoMaterial(sesionOrigen?.archivo_ficha);
  if (!teoria && !ficha) return;
  try {
    await execute(
      `UPDATE cneb_sesiones SET archivo_teoria = ?, archivo_ficha = ? WHERE id = ? AND colegio_id = ?`,
      [teoria, ficha, sesionDestinoId, cid]
    );
  } catch (e) {
    if (teoria) fs.unlink(path.join(DIR, teoria), () => {});
    if (ficha) fs.unlink(path.join(DIR, ficha), () => {});
    if (e.code !== 'ER_BAD_FIELD_ERROR') throw e;
  }
}

module.exports = {
  uploadMaterial,
  subirMaterial,
  guardarMaterial,
  quitarMaterial,
  bufferArchivoPropio,
  bufferPdfBonito,
  duplicarArchivosEnSesion,
};

function subirMaterial(req, res, next) {
  uploadMaterial.single('archivo')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'No se pudo subir el archivo.' });
    next();
  });
}
