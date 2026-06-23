/** Estilo compartido para PDFs de Reportes → General */
export const PDF_HEADER_BLUE = [30, 64, 175];
export const PDF_BORDER = [190, 200, 220];

export function safeTxtPdf(s) {
  if (s == null) return '';
  return String(s).replace(/\r?\n/g, ' ').trim();
}

/** Texto centrado en celda de tabla PDF */
export function textoCentradoCelda(doc, text, x, y, w, maxLines = 2) {
  const raw = safeTxtPdf(text);
  const lines = doc.splitTextToSize(raw, w - 2).slice(0, maxLines);
  const txt = lines[0] || '';
  doc.text(txt, x + w / 2, y, { align: 'center', maxWidth: w - 2 });
}
