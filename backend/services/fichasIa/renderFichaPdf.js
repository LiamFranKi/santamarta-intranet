const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { renderFichaHtml } = require('./renderFichaHtml');
const { dirs } = require('../../utils/fichasIaPaths');

/**
 * Genera PDF con pdfkit (resumen estructurado). También guarda HTML de respaldo para vista previa en navegador.
 */
async function renderFichaPdfYHtml(ctx, archivoPlantilla, trabajoId) {
  const html = renderFichaHtml(ctx, archivoPlantilla);
  const baseName = `ficha-${trabajoId}-${Date.now()}`;
  const htmlPath = path.join(dirs.trabajo, `${baseName}.html`);
  const pdfPath = path.join(dirs.generados, `${baseName}.pdf`);
  fs.writeFileSync(htmlPath, html, 'utf8');

  await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const stream = fs.createWriteStream(pdfPath);
    doc.pipe(stream);

    const { titulo, grado, area, unidad, contenido } = ctx;
    const c = contenido || {};

    doc.fillColor('#047857').fontSize(16).text(titulo || 'Ficha pedagógica', { align: 'center' });
    doc.moveDown(0.3);
    doc.fillColor('#374151').fontSize(10).text(
      [grado ? `${grado}.º grado` : null, area, unidad ? `Unidad ${unidad}` : null].filter(Boolean).join(' · '),
      { align: 'center' }
    );
    doc.moveDown(1);

    doc.fillColor('#111827').fontSize(11).text(c.intro || '', { align: 'justify' });
    doc.moveDown(0.8);

    if (Array.isArray(c.recuerda) && c.recuerda.length) {
      doc.fillColor('#1d4ed8').fontSize(12).text('RECUERDA', { underline: true });
      doc.moveDown(0.3);
      doc.fillColor('#1e3a8a').fontSize(10);
      c.recuerda.forEach((item) => {
        doc.text(`• ${item}`);
      });
      doc.moveDown(0.8);
    }

    const acts = Array.isArray(c.actividades) ? c.actividades : [];
    acts.forEach((act, idx) => {
      doc.fillColor('#047857').fontSize(11).text(act.titulo || `Actividad ${idx + 1}`);
      doc.moveDown(0.2);
      if (act.instruccion) {
        doc.fillColor('#4b5563').fontSize(9).text(act.instruccion);
        doc.moveDown(0.2);
      }
      doc.fillColor('#111827').fontSize(10);
      if (act.tipo === 'tabla_partes' && Array.isArray(act.filas)) {
        act.filas.forEach((row) => {
          doc.text(`${row.parte || '—'}: ${row.funcion || '________________'}`);
        });
      } else if (act.tipo === 'preguntas' && Array.isArray(act.preguntas)) {
        act.preguntas.forEach((q, qi) => {
          doc.text(`${String.fromCharCode(97 + qi)}) ${q}`);
          doc.moveDown(0.4);
        });
      }
      doc.moveDown(0.6);
    });

    if (c.pie_motivacional) {
      doc.moveDown(0.5);
      doc.fillColor('#b45309').fontSize(10).text(c.pie_motivacional, { align: 'center' });
    }

    doc.end();
    stream.on('finish', resolve);
    stream.on('error', reject);
  });

  return {
    htmlPath,
    pdfPath,
    pdfFilename: path.basename(pdfPath),
    htmlFilename: path.basename(htmlPath),
  };
}

module.exports = { renderFichaPdfYHtml };
