const fs = require('fs');
const os = require('os');
const path = require('path');
const multer = require('multer');
const { execute } = require('./mysql');
const { htmlABloques, htmlATextoPlano } = require('./cnebTextoRico');
const { assetsDir } = require('./fichasIaPaths');
const { htmlStringToPdf } = require('../services/fichasIa/renderFichaPdf');

const DIR = path.join(__dirname, '..', 'uploads', 'cneb-material');
const TIPOS = new Set(['teoria', 'ficha']);
const EXT_OK = new Set(['.pdf', '.png', '.jpg', '.jpeg', '.webp', '.doc', '.docx']);
const MASCOTAS = [
  'vanguarcito.png',
  'avatar-nino1.png',
  'avatar-nina1.png',
  'avatar-nino2.png',
  'avatar-nina2.png',
  'avatar-nino3.png',
  'avatar-nina3.png',
];
const CAJAS = ['caja-verde', 'caja-azul', 'caja-amarilla', 'caja-lila', 'caja-coral'];

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

function dataUri(archivo) {
  if (!archivo || !fs.existsSync(archivo)) return null;
  const ext = path.extname(archivo).toLowerCase();
  const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.webp' ? 'image/webp' : 'image/png';
  return `data:${mime};base64,${fs.readFileSync(archivo).toString('base64')}`;
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

function mascotasDisponibles() {
  return MASCOTAS.map(uriAsset).filter(Boolean);
}

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function partesHtml(parts) {
  return (parts || [])
    .map((p) => {
      const t = esc(p.text);
      return p.bold ? `<strong>${t}</strong>` : t;
    })
    .join('');
}

function bloquesDe(html) {
  const bloques = htmlABloques(html).filter((b) => partesHtml(b.parts).trim());
  if (bloques.length) return bloques;
  const plano = htmlATextoPlano(html);
  if (!plano) return [];
  return plano
    .split(/\n+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => ({ type: 'p', parts: [{ text: t, bold: false }] }));
}

function htmlMaterial({ ses, colegio, grupo, fecha, parte }) {
  const esFicha = parte === 'ficha';
  const crudo = esFicha ? ses.ficha_estudiante : ses.material_teoria;
  const bloques = bloquesDe(crudo);
  if (!bloques.length) return '';
  const mascotas = mascotasDisponibles();
  const logo = logoData();
  const aula = [grupo?.grado, grupo?.seccion].filter((x) => x != null && String(x).trim()).join(' ');
  const kicker = esFicha ? 'Ficha de trabajo' : 'Para leer';
  const titulo = esc(ses.titulo || 'Sesión');
  const meta = esc([colegio?.nombre, aula, fecha].filter(Boolean).join('  ·  '));
  const cajas = bloques
    .map((b, i) => {
      const mascota = mascotas.length ? mascotas[i % mascotas.length] : '';
      const caja = CAJAS[i % CAJAS.length];
      const num = b.type === 'li' || esFicha ? `<span class="num">${i + 1}</span>` : '';
      const img = mascota ? `<img class="mascota" src="${mascota}" alt="" />` : '';
      return `<article class="caja ${caja}">${num}<div class="txt">${partesHtml(b.parts)}</div>${img}</article>`;
    })
    .join('');
  const dibujo = esFicha
    ? `<section class="dibujo"><p>Dibuja o escribe aquí</p><div class="hoja"></div></section>`
    : '';
  const vanguarcito = uriAsset('vanguarcito.png');
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8" />
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: 'Segoe UI', Arial, sans-serif; color: #0f172a; }
  .marco { border: 3px solid #059669; min-height: 270mm; display: flex; flex-direction: column; }
  .banda { height: 7px; background: linear-gradient(90deg, #059669, #2563eb, #059669); }
  .inner { padding: 14px 16px 18px; }
  .cab { display: flex; gap: 12px; align-items: center; padding: 10px 12px; border-radius: 14px;
    background: linear-gradient(135deg, #ecfdf5, #eff6ff); border: 1px solid #a7f3d0; }
  .cab img.logo { height: 52px; max-width: 120px; object-fit: contain; }
  .cab img.van { height: 64px; width: 64px; object-fit: contain; }
  .kicker { margin: 0; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: #047857; font-weight: 800; }
  h1 { margin: 2px 0 0; font-size: 20px; line-height: 1.25; color: #065f46; }
  .meta { margin: 4px 0 0; font-size: 11px; color: #64748b; }
  .cuerpo { margin-top: 14px; display: flex; flex-direction: column; gap: 8px; }
  .caja { display: flex; gap: 10px; align-items: flex-start; padding: 10px 12px; border-radius: 12px;
    break-inside: avoid; page-break-inside: avoid; }
  .caja-verde { background: #f0fdf4; border-left: 5px solid #22c55e; }
  .caja-azul { background: #eff6ff; border-left: 5px solid #3b82f6; }
  .caja-amarilla { background: #fffbeb; border-left: 5px solid #eab308; }
  .caja-lila { background: #faf5ff; border-left: 5px solid #a855f7; }
  .caja-coral { background: #fff7ed; border-left: 5px solid #f97316; }
  .num { flex: 0 0 26px; height: 26px; border-radius: 8px; background: #047857; color: #fff;
    font-weight: 800; font-size: 13px; display: flex; align-items: center; justify-content: center; }
  .txt { flex: 1; font-size: 13px; line-height: 1.55; }
  .mascota { width: 58px; height: 64px; object-fit: contain; flex: 0 0 58px; }
  .dibujo { margin-top: 14px; }
  .dibujo p { margin: 0 0 6px; font-size: 12px; font-weight: 700; color: #047857; }
  .hoja { height: 220px; border: 2px dashed #86efac; border-radius: 12px; background:
    repeating-linear-gradient(#fff, #fff 27px, #d1fae5 28px); }
  .pie { margin-top: 12px; font-size: 10px; color: #64748b; }
</style></head>
<body><div class="marco"><div class="banda"></div><div class="inner">
  <header class="cab">
    ${logo ? `<img class="logo" src="${logo}" alt="" />` : ''}
    <div style="flex:1">
      <p class="kicker">${kicker}</p>
      <h1>${titulo}</h1>
      <p class="meta">${meta}</p>
    </div>
    ${vanguarcito ? `<img class="van" src="${vanguarcito}" alt="" />` : ''}
  </header>
  <div class="cuerpo">${cajas}</div>
  ${dibujo}
  <p class="pie">${esFicha ? 'Hoja de trabajo. No es una nota.' : 'Texto para leer el tema. No es la ficha ni una nota.'}</p>
</div></div></body></html>`;
}

async function bufferPdfBonito({ ses, colegio, grupo, fecha, parte }) {
  const html = htmlMaterial({ ses, colegio, grupo, fecha, parte });
  if (!html) return null;
  const pdfPath = path.join(os.tmpdir(), `cneb-${parte}-${ses.id}-${Date.now()}.pdf`);
  await htmlStringToPdf(html, pdfPath, { marginZero: true, deviceScaleFactor: 2 });
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

module.exports = {
  uploadMaterial,
  subirMaterial,
  guardarMaterial,
  quitarMaterial,
  bufferArchivoPropio,
  bufferPdfBonito,
};

function subirMaterial(req, res, next) {
  uploadMaterial.single('archivo')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'No se pudo subir el archivo.' });
    next();
  });
}
