const fs = require('fs');
const path = require('path');
const { renderFichaHtml } = require('./renderFichaHtml');
const { dirs } = require('../../utils/fichasIaPaths');

/**
 * Convierte el mismo HTML de vista previa a PDF (misma maquetación, colores y mascotas).
 */
async function htmlStringToPdf(html, pdfPath) {
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

  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || undefined;
  const browser = await puppeteer.launch({
    headless: true,
    executablePath,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--font-render-hinting=none',
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 90000 });
    await page.emulateMediaType('print');
    await page.pdf({
      path: pdfPath,
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '8mm', right: '8mm', bottom: '10mm', left: '8mm' },
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
  const baseName = `ficha-${trabajoId}-${Date.now()}`;
  const htmlPath = path.join(dirs.trabajo, `${baseName}.html`);
  const pdfPath = path.join(dirs.generados, `${baseName}.pdf`);
  fs.writeFileSync(htmlPath, html, 'utf8');

  await htmlStringToPdf(html, pdfPath);

  return {
    htmlPath,
    pdfPath,
    pdfFilename: path.basename(pdfPath),
    htmlFilename: path.basename(htmlPath),
  };
}

module.exports = { renderFichaPdfYHtml, htmlStringToPdf };
