import { jsPDF } from 'jspdf';
import { obtenerLogoColegioParaPdf } from './pdfReporteColegioLogo';
import {
  PDF_HEADER_BLUE,
  PDF_BORDER,
  PDF_PAGE_MARGIN,
  safeTxtPdf,
  textoCentradoCelda,
  dibujarCabeceraReportePdf,
} from './pdfReportesGeneralTheme';

const MARGIN = PDF_PAGE_MARGIN;
const ROW_H = 7;
const HEAD_H = 8;

function safeTxt(s) {
  return safeTxtPdf(s);
}

export async function generarPdfListaMaestrosPorAula({ colegioNombre, titulo, filas }) {
  const logo = await obtenerLogoColegioParaPdf();
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  let y = dibujarCabeceraReportePdf(doc, logo, {
    colegioNombre,
    titulos: ['Lista de Maestros por Aula', safeTxt(titulo)],
  });

  const tableW = pageW - MARGIN * 2;
  const wNombre = tableW * 0.55;
  const wCurso = tableW - wNombre;
  const widths = [wNombre, wCurso];
  const labels = ['NOMBRES Y APELLIDOS PROFESOR', 'CURSO'];

  const drawHead = () => {
    doc.setFillColor(...PDF_HEADER_BLUE);
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.rect(MARGIN, y, tableW, HEAD_H, 'F');
    let x = MARGIN;
    labels.forEach((lb, i) => {
      doc.text(lb, x + widths[i] / 2, y + 5.2, { align: 'center', maxWidth: widths[i] - 2 });
      x += widths[i];
    });
    y += HEAD_H;
  };

  drawHead();

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(35, 35, 35);

  for (const f of filas || []) {
    if (y + ROW_H > pageH - MARGIN) {
      doc.addPage();
      y = MARGIN;
      drawHead();
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(35, 35, 35);
    }
    doc.setDrawColor(...PDF_BORDER);
    doc.rect(MARGIN, y, tableW, ROW_H, 'S');
    let x = MARGIN;
    const vals = [f.profesor_nombre, f.curso];
    vals.forEach((v, i) => {
      const w = widths[i];
      textoCentradoCelda(doc, v, x, y + 4.6, w);
      x += w;
    });
    y += ROW_H;
  }

  if (!(filas || []).length) {
    doc.setFontSize(9);
    doc.text('No hay docentes asignados a este grupo.', MARGIN + 2, y + 6);
  }

  const slug = safeTxt(titulo).replace(/[^\w\s-]/g, '').slice(0, 40) || 'aula';
  doc.save(`maestros_por_aula_${slug}.pdf`);
}
