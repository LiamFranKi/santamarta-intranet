const fs = require('fs');
const pdfParse = require('pdf-parse');

/**
 * Extrae texto plano de un PDF en disco.
 * @param {string} filePath
 * @returns {Promise<string>}
 */
async function extractPdfText(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return '';
  const buffer = fs.readFileSync(filePath);
  const data = await pdfParse(buffer);
  return String(data.text || '').trim();
}

module.exports = { extractPdfText };
