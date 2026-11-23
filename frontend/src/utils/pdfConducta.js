import { jsPDF } from 'jspdf';
import { obtenerLogoColegioParaPdf } from './pdfReporteColegioLogo';
import {
  PDF_HEADER_BLUE,
  PDF_BORDER,
  PDF_PAGE_MARGIN,
  safeTxtPdf,
  dibujarCabeceraReportePdf,
} from './pdfReportesGeneralTheme';

const MARGIN = PDF_PAGE_MARGIN;
const ROW_H = 6.2;
const HEAD_H = 7.2;

function fmt(v) {
  if (v == null || v === '') return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return n.toFixed(2);
}

function safeTxt(s) {
  return safeTxtPdf(s);
}

export async function generarPdfConducta({
  colegioNombre,
  titulo,
  subtitulo,
  filas,
  promedios,
  b4EnCurso,
}) {
  const logo = await obtenerLogoColegioParaPdf();
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  let y = dibujarCabeceraReportePdf(doc, logo, {
    colegioNombre,
    titulos: [safeTxt(titulo || 'REPORTE DE CONDUCTA')],
    subtitulos: [
      safeTxt(subtitulo || ''),
      b4EnCurso
        ? '1.º, 2.º y 3.º: promedio final. 4.º: cómo van ahora.'
        : 'Nota de conducta guardada por bimestre.',
    ],
  });

  const tableW = pageW - MARGIN * 2;
  const labels = ['N.º', 'APELLIDOS Y NOMBRES', 'SALÓN', '1.º', '2.º', '3.º', b4EnCurso ? '4.º AHORA' : '4.º', 'PROM.'];
  const ratios = [0.06, 0.32, 0.18, 0.08, 0.08, 0.08, 0.1, 0.1];
  const widths = ratios.map((r) => tableW * r);

  const drawHead = () => {
    doc.setFillColor(...PDF_HEADER_BLUE);
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.rect(MARGIN, y, tableW, HEAD_H, 'F');
    let x = MARGIN;
    labels.forEach((lb, i) => {
      doc.text(lb, x + widths[i] / 2, y + 4.6, { align: 'center', maxWidth: widths[i] - 1.5 });
      x += widths[i];
    });
    y += HEAD_H;
  };

  const drawRow = (cells, bold) => {
    if (y + ROW_H > pageH - MARGIN) {
      doc.addPage();
      y = MARGIN;
      drawHead();
    }
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(7);
    doc.setTextColor(35, 35, 35);
    doc.setDrawColor(...PDF_BORDER);
    doc.rect(MARGIN, y, tableW, ROW_H, 'S');
    let x = MARGIN;
    cells.forEach((cell, i) => {
      const align = i === 1 || i === 2 ? 'left' : 'center';
      const tx = align === 'left' ? x + 1.4 : x + widths[i] / 2;
      doc.text(safeTxt(cell), tx, y + 4.1, { align, maxWidth: widths[i] - 2 });
      x += widths[i];
    });
    y += ROW_H;
  };

  drawHead();
  (filas || []).forEach((f, i) => {
    if (i % 2 === 1 && y + ROW_H <= pageH - MARGIN) {
      doc.setFillColor(248, 250, 252);
      doc.rect(MARGIN, y, tableW, ROW_H, 'F');
    }
    drawRow(
      [String(f.numero || i + 1), f.alumno, f.aula, fmt(f.b1), fmt(f.b2), fmt(f.b3), fmt(f.b4), fmt(f.promedio)],
      false
    );
  });

  if (y + ROW_H > pageH - MARGIN) {
    doc.addPage();
    y = MARGIN;
    drawHead();
  }
  doc.setFillColor(232, 240, 254);
  doc.rect(MARGIN, y, tableW, ROW_H, 'F');
  drawRow(
    [
      '',
      'PROMEDIO DE ESTOS ALUMNOS',
      String((filas || []).length),
      fmt(promedios?.b1),
      fmt(promedios?.b2),
      fmt(promedios?.b3),
      fmt(promedios?.b4),
      fmt(promedios?.general),
    ],
    true
  );

  const nombre = `conducta-${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(nombre);
}
