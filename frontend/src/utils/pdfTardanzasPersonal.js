import { jsPDF } from 'jspdf';
import { obtenerLogoColegioDataUrl, dibujarLogoEsquina } from './pdfReporteColegioLogo';

const MARGIN = 12;
const ROW_H = 6.5;
const HEAD_H = 8;

function safeTxt(s) {
  return String(s ?? '').replace(/\r?\n/g, ' ').trim();
}

function fmtSoles(n) {
  const v = parseFloat(n);
  if (Number.isNaN(v)) return '—';
  return `S/ ${v.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export async function generarPdfTardanzasPersonal({
  colegioNombre,
  anio,
  filtroEtiqueta,
  filas = [],
  total_descuento,
  tarifa_por_minuto = 1,
}) {
  const logoData = await obtenerLogoColegioDataUrl();
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const tableW = pageW - MARGIN * 2;

  const colRatios = [0.32, 0.12, 0.14, 0.14, 0.12, 0.16];
  const widths = colRatios.map((r) => tableW * r);
  const labels = ['Personal', 'Fecha', 'Hora entrada', 'Hora marcación', 'Min. tarde', 'Descuento'];

  const drawPageHeader = (yStart) => {
    const logoH = dibujarLogoEsquina(doc, logoData, { margin: MARGIN, size: 14 });
    let y = Math.max(yStart, MARGIN + logoH);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Tardanzas del personal', pageW - MARGIN, y, { align: 'right' });
    y += 5.5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(safeTxt(colegioNombre || ''), pageW - MARGIN, y, { align: 'right' });
    y += 4.5;
    doc.setFontSize(8.5);
    doc.setTextColor(80, 80, 80);
    const sub = [`Año ${anio || '—'}`, filtroEtiqueta, `Tarifa: S/ ${tarifa_por_minuto.toFixed(2)} por minuto`]
      .filter(Boolean)
      .join(' · ');
    doc.text(sub, pageW - MARGIN, y, { align: 'right' });
    doc.setTextColor(0, 0, 0);
    return y + 8;
  };

  const drawTableHead = (y) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setDrawColor(30, 64, 175);
    doc.setFillColor(30, 64, 175);
    doc.rect(MARGIN, y, tableW, HEAD_H, 'FD');
    doc.setTextColor(255, 255, 255);
    let x = MARGIN;
    labels.forEach((lb, i) => {
      doc.text(lb, x + 2, y + 5.2, { maxWidth: widths[i] - 4 });
      x += widths[i];
    });
    doc.setTextColor(0, 0, 0);
    return y + HEAD_H;
  };

  let y = drawPageHeader(MARGIN);
  y = drawTableHead(y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);

  (filas || []).forEach((f, idx) => {
    if (y + ROW_H > pageH - 18) {
      doc.addPage();
      y = drawPageHeader(MARGIN);
      y = drawTableHead(y);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
    }
    if (idx % 2 === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(MARGIN, y, tableW, ROW_H, 'F');
    }
    const cells = [
      f.personal_nombre,
      f.fecha,
      f.hora_entrada_real_fmt,
      f.hora_marcacion_fmt,
      f.minutos_tardanza > 0 ? String(f.minutos_tardanza) : '—',
      f.descuento > 0 ? fmtSoles(f.descuento) : '—',
    ];
    let x = MARGIN;
    cells.forEach((txt, i) => {
      doc.text(safeTxt(txt), x + 2, y + 4.5, { maxWidth: widths[i] - 4 });
      x += widths[i];
    });
    y += ROW_H;
  });

  if (y + 12 > pageH - 10) {
    doc.addPage();
    y = MARGIN + 20;
  }
  doc.setDrawColor(30, 64, 175);
  doc.setFillColor(239, 246, 255);
  doc.rect(MARGIN, y + 2, tableW, 10, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('TOTAL DESCUENTO', pageW - MARGIN - 55, y + 8.5);
  doc.text(fmtSoles(total_descuento), pageW - MARGIN - 2, y + 8.5, { align: 'right' });

  doc.save(`tardanzas-personal-${new Date().toISOString().slice(0, 10)}.pdf`);
}
