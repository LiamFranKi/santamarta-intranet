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

function fmtMonto(n, moneda) {
  const v = parseFloat(n);
  if (Number.isNaN(v)) return '—';
  return `${moneda || 'S/'} ${v.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export async function generarPdfResumenIngresos({
  colegioNombre,
  rango_etiqueta,
  sede_etiqueta,
  moneda = 'S/',
  filas = [],
  total_ingresos,
}) {
  const logo = await obtenerLogoColegioParaPdf();
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const tableW = pageW - MARGIN * 2;

  const colRatios = [0.18, 0.12, 0.22, 0.32, 0.16];
  const widths = colRatios.map((r) => tableW * r);
  const sum = widths.reduce((a, b) => a + b, 0);
  widths[widths.length - 1] += tableW - sum;
  const labels = ['Nº DE RECIBO', 'MONTO S/.', 'DESCRIPCIÓN', 'ALUMNO', 'FECHA PAGO'];

  const drawPageHeader = () =>
    dibujarCabeceraReportePdf(doc, logo, {
      colegioNombre,
      titulos: ['Resumen de Ingresos', safeTxt(rango_etiqueta)],
      subtitulos: sede_etiqueta ? [`Sede: ${safeTxt(sede_etiqueta)}`] : [],
    });

  const drawSectionTitle = (y, title) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(30, 30, 30);
    doc.text(title, MARGIN, y);
    return y + 4;
  };

  const drawTableHead = (y) => {
    doc.setFillColor(...PDF_HEADER_BLUE);
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.rect(MARGIN, y, tableW, HEAD_H, 'F');
    let x = MARGIN;
    labels.forEach((lb, i) => {
      doc.text(lb, x + widths[i] / 2, y + 5.2, { align: 'center', maxWidth: widths[i] - 2 });
      x += widths[i];
    });
    return y + HEAD_H;
  };

  const drawRow = (y, row) => {
    doc.setDrawColor(...PDF_BORDER);
    doc.rect(MARGIN, y, tableW, ROW_H);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(35, 35, 35);
    let x = MARGIN;
    const vals = [
      row.nro_recibo,
      fmtMonto(row.monto, moneda).replace(`${moneda} `, ''),
      row.descripcion,
      row.alumno_nombre,
      row.fecha_pago,
    ];
    vals.forEach((v, i) => {
      const w = widths[i];
      textoCentradoCelda(doc, v, x, y + 4.8, w);
      x += w;
      doc.line(x, y, x, y + ROW_H);
    });
    return y + ROW_H;
  };

  const drawBalance = (y) => {
    y = drawSectionTitle(y + 4, 'BALANCE');
    const boxW = tableW * 0.35;
    const boxX = MARGIN + (tableW - boxW) / 2;
    doc.setDrawColor(...PDF_BORDER);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.rect(boxX, y, boxW, 7);
    doc.text('TOTAL INGRESOS S/.', boxX + boxW / 2, y + 4.8, { align: 'center' });
    y += 7;
    doc.rect(boxX, y, boxW, 8);
    doc.setFontSize(10);
    const totalTxt = (parseFloat(total_ingresos) || 0).toLocaleString('es-PE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    doc.text(totalTxt, boxX + boxW / 2, y + 5.5, { align: 'center' });
    return y + 12;
  };

  let y = drawPageHeader();
  y = drawSectionTitle(y, 'INGRESOS');
  y = drawTableHead(y);

  for (const row of filas || []) {
    if (y + ROW_H > pageH - MARGIN - 30) {
      doc.addPage();
      y = drawPageHeader();
      y = drawSectionTitle(y, 'INGRESOS (continúa)');
      y = drawTableHead(y);
    }
    y = drawRow(y, row);
  }

  if (!(filas || []).length) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text('No hay ingresos en el rango seleccionado.', MARGIN + 2, y + 6);
    y += 12;
  }

  if (y + 28 > pageH - MARGIN) {
    doc.addPage();
    y = MARGIN + 6;
  }
  drawBalance(y);

  doc.save(`resumen_ingresos_${safeTxt(rango_etiqueta).replace(/\s+/g, '_')}.pdf`);
}
