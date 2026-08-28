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
  titulo = 'Tardanzas del personal',
  incluirHoraSalida = false,
  minutosCeroComoCero = false,
}) {
  const logoData = await obtenerLogoColegioDataUrl();
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const tableW = pageW - MARGIN * 2;

  const colRatios = incluirHoraSalida
    ? [0.26, 0.1, 0.12, 0.12, 0.1, 0.14, 0.16]
    : [0.32, 0.12, 0.14, 0.14, 0.12, 0.16];
  const widths = colRatios.map((r) => tableW * r);
  const labels = incluirHoraSalida
    ? ['Personal', 'Fecha', 'Hora real', 'Hora entrada', 'Min. tarde', 'Descuento', 'Hora salida']
    : ['Personal', 'Fecha', 'Hora entrada', 'Hora marcación', 'Min. tarde', 'Descuento'];

  const drawPageHeader = (yStart) => {
    const logoH = dibujarLogoEsquina(doc, logoData, { margin: MARGIN, size: 14 });
    let y = Math.max(yStart, MARGIN + logoH);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(titulo, pageW - MARGIN, y, { align: 'right' });
    y += 5.5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(safeTxt(colegioNombre || ''), pageW - MARGIN, y, { align: 'right' });
    y += 4.5;
    doc.setFontSize(8.5);
    doc.setTextColor(80, 80, 80);
    const sub = [
      `Año ${anio || '—'}`,
      filtroEtiqueta,
      tarifa_por_minuto != null && Number(tarifa_por_minuto) > 0
        ? `Tarifa: S/ ${Number(tarifa_por_minuto).toFixed(4)} por minuto`
        : 'Descuento: sueldo ÷ 30 ÷ 8 ÷ 60 por minuto (S/ 0 sin sueldo)',
    ]
      .filter(Boolean)
      .join(' · ');
    doc.text(sub, pageW - MARGIN, y, { align: 'right' });
    doc.setTextColor(0, 0, 0);
    return y + 8;
  };

  const drawCenteredInCol = (txt, colX, colW, textY) => {
    doc.text(safeTxt(txt), colX + colW / 2, textY, {
      align: 'center',
      maxWidth: Math.max(colW - 2, 4),
    });
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
      drawCenteredInCol(lb, x, widths[i], y + 5.2);
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
    const minTxt = minutosCeroComoCero
      ? String(f.minutos_tardanza ?? 0)
      : f.minutos_tardanza > 0
        ? String(f.minutos_tardanza)
        : '—';
    const descTxt = minutosCeroComoCero
      ? fmtSoles(f.descuento ?? 0)
      : f.descuento > 0
        ? fmtSoles(f.descuento)
        : '—';
    const cells = incluirHoraSalida
      ? [
          f.personal_nombre,
          f.fecha,
          f.hora_entrada_real_fmt,
          f.hora_marcacion_fmt || f.hora_entrada,
          minTxt,
          descTxt,
          f.hora_salida_fmt && f.hora_salida_fmt !== '—'
            ? f.hora_salida_fmt
            : f.hora_salida
              ? String(f.hora_salida).slice(0, 8)
              : '—',
        ]
      : [
          f.personal_nombre,
          f.fecha,
          f.hora_entrada_real_fmt,
          f.hora_marcacion_fmt,
          minTxt,
          descTxt,
        ];
    let x = MARGIN;
    cells.forEach((txt, i) => {
      drawCenteredInCol(txt, x, widths[i], y + 4.5);
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

export async function generarPdfFaltasPersonal({
  colegioNombre,
  anio,
  filtroEtiqueta,
  filas = [],
}) {
  const logoData = await obtenerLogoColegioDataUrl();
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const tableW = pageW - MARGIN * 2;
  const widths = [tableW * 0.22, tableW * 0.5, tableW * 0.28];
  const labels = ['Fecha', 'Personal', 'Cargo'];

  const logoH = dibujarLogoEsquina(doc, logoData, { margin: MARGIN, size: 14 });
  let y = Math.max(MARGIN, MARGIN + logoH);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Faltas del personal', pageW - MARGIN, y, { align: 'right' });
  y += 5.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(safeTxt(colegioNombre || ''), pageW - MARGIN, y, { align: 'right' });
  y += 4.5;
  doc.setFontSize(8.5);
  doc.setTextColor(80, 80, 80);
  doc.text(
    [`Año ${anio || '—'}`, filtroEtiqueta, `${filas.length} falta(s)`].filter(Boolean).join(' · '),
    pageW - MARGIN,
    y,
    { align: 'right' }
  );
  doc.setTextColor(0, 0, 0);
  y += 8;

  const drawHead = () => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setFillColor(190, 18, 60);
    doc.setTextColor(255, 255, 255);
    doc.rect(MARGIN, y, tableW, HEAD_H, 'F');
    let x = MARGIN;
    labels.forEach((lab, i) => {
      doc.text(lab, x + widths[i] / 2, y + 5.4, { align: 'center' });
      x += widths[i];
    });
    doc.setTextColor(0, 0, 0);
    y += HEAD_H;
  };

  drawHead();
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  filas.forEach((f, idx) => {
    if (y + ROW_H > pageH - 14) {
      doc.addPage();
      y = MARGIN + 8;
      drawHead();
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
    }
    if (idx % 2 === 1) {
      doc.setFillColor(255, 241, 242);
      doc.rect(MARGIN, y, tableW, ROW_H, 'F');
    }
    const cells = [f.fecha, f.personal_nombre, f.cargo || '—'];
    let x = MARGIN;
    cells.forEach((txt, i) => {
      doc.text(safeTxt(txt), x + widths[i] / 2, y + 4.5, {
        align: 'center',
        maxWidth: Math.max(widths[i] - 2, 4),
      });
      x += widths[i];
    });
    y += ROW_H;
  });

  doc.save(`faltas-personal-${new Date().toISOString().slice(0, 10)}.pdf`);
}
