const fs = require('fs');
const path = require('path');
const { renderFichaHtml } = require('./renderFichaHtml');
const { dirs } = require('../../utils/fichasIaPaths');

const CHROMIUM_PATHS = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome-stable',
  '/snap/bin/chromium',
].filter(Boolean);

const APT_DEPS_HINT = `En el VPS (PuTTY) instale Chromium y dependencias:
sudo apt-get update && sudo apt-get install -y chromium-browser fonts-liberation libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libgbm1 libgtk-3-0 libnss3 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libxss1 libasound2
Luego en backend/.env opcional: PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
y: pm2 restart all`;

/**
 * Rutas de Chromium del sistema (preferidas al Chrome empaquetado de Puppeteer).
 */
function rutasChromium() {
  const vistos = new Set();
  const lista = [];
  for (const p of CHROMIUM_PATHS) {
    if (!p || vistos.has(p)) continue;
    vistos.add(p);
    if (fs.existsSync(p)) lista.push(p);
  }
  return lista;
}

async function lanzarNavegador(puppeteer) {
  const launchArgs = {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--font-render-hinting=none',
    ],
  };

  const errores = [];
  const rutas = rutasChromium();

  for (const executablePath of rutas) {
    try {
      return await puppeteer.launch({ ...launchArgs, executablePath });
    } catch (err) {
      errores.push(`${executablePath}: ${err.message}`);
    }
  }

  try {
    return await puppeteer.launch(launchArgs);
  } catch (err) {
    errores.push(`chrome-puppeteer: ${err.message}`);
    const e = new Error(
      `No se pudo abrir Chromium para el PDF. ${errores[0] || err.message}\n\n${APT_DEPS_HINT}`
    );
    e.code = 'PUPPETEER_CHROME_LIBS';
    throw e;
  }
}

/**
 * Convierte el mismo HTML de vista previa a PDF (misma maquetación, colores y mascotas).
 */
async function htmlStringToPdf(html, pdfPath, opts = {}) {
  let puppeteer;
  try {
    puppeteer = require('puppeteer');
  } catch (e) {
    const err = new Error(
      'Puppeteer no está instalado en el servidor. Ejecute: cd backend && npm install'
    );
    err.code = 'PUPPETEER_MISSING';
    throw err;
  }

  const browser = await lanzarNavegador(puppeteer);

  const marginZero = Boolean(opts.marginZero);
  const margin = marginZero
    ? { top: '0', right: '0', bottom: '0', left: '0' }
    : opts.margin || { top: '6mm', right: '6mm', bottom: '8mm', left: '6mm' };
  // Escala 2 = tipografía nítida en PDF (evita texto “pixelado”)
  const deviceScaleFactor = Number(opts.deviceScaleFactor) > 0 ? Number(opts.deviceScaleFactor) : 2;

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 794, height: 1123, deviceScaleFactor });
    await page.setContent(html, { waitUntil: 'load', timeout: 90000 });
    await page.emulateMediaType('print');
    await page.pdf({
      path: pdfPath,
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin,
    });
  } finally {
    await browser.close();
  }
}

/**
 * Genera PDF desde la plantilla HTML (idéntico a vista previa) y guarda copia .html.
 */
async function renderFichaPdfYHtml(ctx, archivoPlantilla, trabajoId) {
  const html = renderFichaHtml({ ...ctx, inlineAssets: true }, archivoPlantilla);
  return guardarHtmlYPdf(html, trabajoId);
}

/**
 * Guarda HTML ya generado (diseño libre) y lo convierte a PDF A4.
 */
async function guardarHtmlYPdf(html, trabajoId, opts = {}) {
  const baseName = `ficha-${trabajoId}-${Date.now()}`;
  const htmlPath = path.join(dirs.trabajo, `${baseName}.html`);
  const pdfPath = path.join(dirs.generados, `${baseName}.pdf`);
  fs.writeFileSync(htmlPath, html, 'utf8');

  await htmlStringToPdf(html, pdfPath, opts);

  return {
    htmlPath,
    pdfPath,
    pdfFilename: path.basename(pdfPath),
    htmlFilename: path.basename(htmlPath),
  };
}

module.exports = {
  renderFichaPdfYHtml,
  guardarHtmlYPdf,
  htmlStringToPdf,
  APT_DEPS_HINT,
};
