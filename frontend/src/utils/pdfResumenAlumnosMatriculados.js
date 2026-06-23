import { jsPDF } from 'jspdf';
import { obtenerLogoColegioParaPdf, dibujarLogoEsquina } from './pdfReporteColegioLogo';
import { PDF_HEADER_BLUE, PDF_BORDER, safeTxtPdf, textoCentradoCelda } from './pdfReportesGeneralTheme';

const MARGIN = 12;

function safeTxt(s) {
  return safeTxtPdf(s);
}

function drawSectionTable(doc, seccion, startY, pageW) {
  let y = startY;
  const tableW = pageW - MARGIN * 2;
  const colGrupo = tableW * 0.55;
  const colNum = (tableW - colGrupo) / 3;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(30, 30, 30);
  doc.text(safeTxt(seccion.nivel), MARGIN, y);
  y += 6;

  doc.setFillColor(...PDF_HEADER_BLUE);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.rect(MARGIN, y, tableW, 7, 'F');
  const heads = ['GRUPO', 'HOMBRES', 'MUJERES', 'TOTAL'];
  const widths = [colGrupo, colNum, colNum, colNum];
  let x = MARGIN;
  heads.forEach((h, i) => {
    doc.text(h, x + widths[i] / 2, y + 4.8, { align: 'center' });
    x += widths[i];
  });
  y += 7;

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(35, 35, 35);
  doc.setFontSize(7);

  for (const fila of seccion.filas || []) {
    if (y > doc.internal.pageSize.getHeight() - 20) {
      doc.addPage();
      y = MARGIN;
    }
    doc.setDrawColor(...PDF_BORDER);
    doc.rect(MARGIN, y, tableW, 6);
    x = MARGIN;
    const vals = [fila.grupo, String(fila.hombres), String(fila.mujeres), String(fila.total)];
    vals.forEach((v, i) => {
      const w = widths[i];
      textoCentradoCelda(doc, v, x, y + 4.2, w);
      x += w;
    });
    y += 6;
  }

  doc.setFont('helvetica', 'bold');
  doc.rect(MARGIN, y, tableW, 7);
  x = MARGIN;
  const totVals = ['TOTAL', String(seccion.totales?.hombres ?? 0), String(seccion.totales?.mujeres ?? 0), String(seccion.totales?.total ?? 0)];
  totVals.forEach((v, i) => {
    const w = widths[i];
    textoCentradoCelda(doc, v, x, y + 4.8, w);
    x += w;
  });
  y += 12;

  return y;
}

export async function generarPdfResumenAlumnosMatriculados({ colegioNombre, anio, secciones, total_general }) {
  const logo = await obtenerLogoColegioParaPdf();
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  let y = MARGIN;

  const logoH = dibujarLogoEsquina(doc, logo, { margin: MARGIN });
  y = Math.max(y, MARGIN + logoH);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(30, 64, 175);
  doc.text(safeTxt(colegioNombre || 'Colegio'), pageW - MARGIN, y, { align: 'right' });
  y += 7;
  doc.setFontSize(12);
  doc.text(`Alumnos Matriculados ${anio}`, pageW - MARGIN, y, { align: 'right' });
  y += 12;

  for (const sec of secciones || []) {
    if (y > doc.internal.pageSize.getHeight() - 40) {
      doc.addPage();
      y = MARGIN;
    }
    y = drawSectionTable(doc, sec, y, pageW);
  }

  const tg = total_general || { hombres: 0, mujeres: 0, total: 0 };
  if (y > doc.internal.pageSize.getHeight() - 25) {
    doc.addPage();
    y = MARGIN;
  }
  const tableW = pageW - MARGIN * 2;
  const colGrupo = tableW * 0.55;
  const colNum = (tableW - colGrupo) / 3;
  const widths = [colGrupo, colNum, colNum, colNum];

  doc.setFillColor(230, 236, 250);
  doc.rect(MARGIN, y, tableW, 8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(30, 64, 175);
  let x = MARGIN;
  ['TOTAL GENERAL', String(tg.hombres), String(tg.mujeres), String(tg.total)].forEach((v, i) => {
    const w = widths[i];
    textoCentradoCelda(doc, v, x, y + 5.5, w);
    x += w;
  });

  doc.save(`resumen_matriculados_${anio}.pdf`);
}
