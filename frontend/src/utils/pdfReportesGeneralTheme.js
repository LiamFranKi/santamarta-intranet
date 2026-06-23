/** Estilo compartido para PDFs de Reportes → General */
import { dibujarLogoEsquina } from './pdfReporteColegioLogo';

export const PDF_HEADER_BLUE = [30, 64, 175];
export const PDF_BORDER = [190, 200, 220];
export const PDF_PAGE_MARGIN = 8;
export const PDF_LOGO_OPTS = { maxWidth: 28, maxHeight: 8 };

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

/**
 * Cabecera compacta: logo arriba-izq, títulos arriba-der, retorna Y para iniciar tabla.
 */
export function dibujarCabeceraReportePdf(doc, logo, opts = {}) {
  const pageW = doc.internal.pageSize.getWidth();
  const margin = opts.margin ?? PDF_PAGE_MARGIN;
  const colegioNombre = safeTxtPdf(opts.colegioNombre || 'Colegio');
  const titulos = (opts.titulos || []).filter(Boolean).map(safeTxtPdf);
  const subtitulos = (opts.subtitulos || []).filter(Boolean).map(safeTxtPdf);

  const logoBottom = margin + dibujarLogoEsquina(doc, logo, { margin, ...PDF_LOGO_OPTS });

  let ty = margin + 3;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(opts.tituloSize ?? 11);
  doc.setTextColor(30, 64, 175);
  doc.text(colegioNombre, pageW - margin, ty, { align: 'right' });
  ty += 4.5;

  doc.setFontSize(opts.lineaSize ?? 10);
  for (const line of titulos) {
    doc.text(line, pageW - margin, ty, { align: 'right' });
    ty += 4.5;
  }

  if (subtitulos.length) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(opts.subSize ?? 8.5);
    doc.setTextColor(80, 80, 80);
    for (const line of subtitulos) {
      doc.text(line, pageW - margin, ty, { align: 'right' });
      ty += 4;
    }
    doc.setTextColor(35, 35, 35);
  }

  return Math.max(logoBottom, ty) + 3;
}
