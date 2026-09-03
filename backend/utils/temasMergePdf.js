const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const { PDFDocument } = require('pdf-lib');
const { joinStaticFs, staticFsSubdir } = require('./staticStorage');

function guessArchivoFsPathFromValor(archivoValor) {
  if (!archivoValor) return null;
  const s = String(archivoValor).trim();
  if (!s || /^https?:\/\//i.test(s)) return null;

  // Normalizar a un path relativo dentro de Static/Archivos
  let rel = s.replace(/^\/+/, '');

  // Quitar prefijos comunes
  rel = rel.replace(/^Static\/Archivos\//i, '');
  rel = rel.replace(/^Static\//i, ''); // fallback
  rel = rel.replace(/^Archivos\//i, '');
  rel = rel.replace(/^uploads\//i, '');

  return joinStaticFs('Archivos', rel);
}

async function loadPdfBytes({ archivoValor, archivoIdForDebug }) {
  if (!archivoValor) {
    throw new Error(`Archivo sin valor (id=${archivoIdForDebug || '??'})`);
  }

  if (/^https?:\/\//i.test(String(archivoValor).trim())) {
    const r = await axios.get(String(archivoValor).trim(), { responseType: 'arraybuffer', timeout: 30000 });
    return Buffer.from(r.data);
  }

  const fsPath = guessArchivoFsPathFromValor(archivoValor);
  if (!fsPath || !fs.existsSync(fsPath)) {
    throw new Error(`PDF no encontrado en FS: ${fsPath || '(null)'} (id=${archivoIdForDebug || '??'})`);
  }

  return fs.readFileSync(fsPath);
}

/**
 * Une PDFs en el orden indicado por `archivoIdsOrdered` (no agrega encabezados).
 * Continúa con los demás aunque algunos fallen.
 */
async function mergeTemasPdfsToFile({
  archivoIdsOrdered,
  archivoRowsById,
  outputFileNameBase,
  outputSubdir = ['Archivos', 'TemasMerge'],
}) {
  const mergedPdf = await PDFDocument.create();

  const failedIds = [];
  let okCount = 0;

  for (const archivoId of archivoIdsOrdered) {
    const key = String(archivoId);
    const row = archivoRowsById.get(key);
    if (!row) {
      failedIds.push({ id: archivoId, error: 'No existe en el set accesible' });
      continue;
    }

    try {
      const archivoValor = row.archivo || row.archivo_url || row.archivo_pdf || row.archivoFile || null;
      const pdfBytes = await loadPdfBytes({ archivoValor, archivoIdForDebug: archivoId });
      const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });

      const pageIndices = pdfDoc.getPageIndices();
      if (!pageIndices || pageIndices.length === 0) {
        throw new Error(`PDF sin páginas (id=${archivoId})`);
      }

      const copiedPages = await mergedPdf.copyPages(pdfDoc, pageIndices);
      copiedPages.forEach((p) => mergedPdf.addPage(p));

      okCount++;
    } catch (e) {
      failedIds.push({ id: archivoId, error: e?.message || 'Error al cargar PDF' });
    }
  }

  if (okCount === 0) {
    return {
      mergedBytes: null,
      downloadUrl: null,
      failedIds,
      okCount,
    };
  }

  const mergedBytes = await mergedPdf.save();

  const mergedDir = staticFsSubdir(...outputSubdir);
  const rand = crypto.randomBytes(8).toString('hex');
  const safeBase = String(outputFileNameBase || 'temas').replace(/[^a-zA-Z0-9-_]/g, '');
  const fileName = `${safeBase}-${Date.now()}-${rand}.pdf`;
  const outPath = path.join(mergedDir, fileName);

  fs.writeFileSync(outPath, mergedBytes);

  // Ruta relativa del mismo origen. Nunca usar replace(/\/+/g, '/') sobre URLs
  // absolutas: convierte https:// en https:/ y el navegador abre una página en blanco.
  const downloadUrl = `/Static/Archivos/TemasMerge/${fileName}`;

  return {
    mergedBytes,
    downloadUrl,
    failedIds,
    okCount,
  };
}

function sendMergedPdf(res, mergeResult, filename = 'temas-bimestre.pdf') {
  const safeName = String(filename || 'temas-bimestre.pdf').replace(/[^a-zA-Z0-9._-]/g, '');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${safeName}"`);
  res.setHeader('X-Temas-Failed-Count', String((mergeResult.failedIds || []).length));
  res.setHeader('Access-Control-Expose-Headers', 'X-Temas-Failed-Count');
  res.send(Buffer.from(mergeResult.mergedBytes));
}

module.exports = { mergeTemasPdfsToFile, sendMergedPdf };

