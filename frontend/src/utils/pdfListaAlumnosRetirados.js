import { jsPDF } from 'jspdf';
import { obtenerLogoColegioParaPdf, dibujarLogoEsquina } from './pdfReporteColegioLogo';
import { PDF_HEADER_BLUE, PDF_BORDER, safeTxtPdf, textoCentradoCelda } from './pdfReportesGeneralTheme';

const MARGIN = 12;
const ROW_H = 7;
const HEAD_H = 8;

function safeTxt(s) {
  return safeTxtPdf(s);
}

export async function generarPdfListaAlumnosRetirados({ colegioNombre, anio, nivel_etiqueta, filas }) {
  const logo = await obtenerLogoColegioParaPdf();
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  let y = MARGIN;

  const logoH = dibujarLogoEsquina(doc, logo, { margin: MARGIN });
  y = Math.max(y, MARGIN + logoH);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(30, 64, 175);
  doc.text(safeTxt(colegioNombre || ''), pageW - MARGIN, y, { align: 'right' });
  y += 7;
  doc.text(`Lista de alumnos retirados - ${anio}`, pageW - MARGIN, y, { align: 'right' });
  y += 6;
  doc.setFontSize(10);
  doc.setTextColor(80, 80, 80);
  doc.text(`Alumnos de nivel: ${safeTxt(nivel_etiqueta || 'TODOS')}`, pageW - MARGIN, y, { align: 'right' });
  y += 10;

  const tableW = pageW - MARGIN * 2;
  const wNom = tableW * 0.42;
  const wGrado = tableW * 0.43;
  const wDoc = tableW - wNom - wGrado;
  const widths = [wNom, wGrado, wDoc];
  const labels = ['APELLIDOS Y NOMBRES', 'GRADO - SECCIÓN', 'Nº DOCUMENTO'];

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
    }
    doc.setDrawColor(...PDF_BORDER);
    doc.rect(MARGIN, y, tableW, ROW_H);
    let x = MARGIN;
    const vals = [f.alumno_nombre, f.grado_seccion, f.nro_documento];
    vals.forEach((v, i) => {
      const w = widths[i];
      textoCentradoCelda(doc, v, x, y + 4.6, w);
      x += w;
    });
    y += ROW_H;
  }

  if (!(filas || []).length) {
    doc.setFontSize(9);
    doc.text('No hay alumnos retirados con los filtros seleccionados.', MARGIN + 2, y + 6);
  }

  doc.save(`alumnos_retirados_${anio}.pdf`);
}
