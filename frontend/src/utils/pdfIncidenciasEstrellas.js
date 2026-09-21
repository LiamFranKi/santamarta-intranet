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
const HEAD_H = 7.4;
const LINE_H = 3.4;
const PAD_Y = 2.2;
const MAX_LINES = 4;

function safeTxt(s) {
  return safeTxtPdf(s);
}

function lineasCelda(doc, text, width, maxLines = MAX_LINES) {
  const raw = safeTxt(text) || '—';
  return doc.splitTextToSize(raw, Math.max(4, width - 2.4)).slice(0, maxLines);
}

function alturaFila(lineCounts) {
  const n = Math.max(1, ...lineCounts);
  return Math.max(8, PAD_Y * 2 + n * LINE_H);
}

export async function generarPdfIncidenciasEstrellas({ data }) {
  const logo = await obtenerLogoColegioParaPdf();
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const tableW = pageW - MARGIN * 2;
  const kpis = data?.kpis || {};
  const grupos = data?.grupos || [];

  let y = dibujarCabeceraReportePdf(doc, logo, {
    colegioNombre: data?.colegio_nombre || 'Colegio',
    titulos: [safeTxt(data?.titulo || 'INCIDENCIAS Y ESTRELLAS')],
    subtitulos: data?.subtitulo ? [safeTxt(data.subtitulo)] : [],
  });

  const kpiItems = [
    { label: 'Incidencias', value: kpis.incidencias ?? 0 },
    { label: 'Vestimenta', value: kpis.vestimenta ?? 0 },
    { label: 'Olvido QR', value: kpis.olvido_qr ?? 0 },
    { label: 'Estrellas', value: kpis.estrellas ?? 0 },
    { label: 'Pts. dados / desc.', value: kpis.puntos_label || `${kpis.puntos_estrellas ?? 0} / −${kpis.puntos_descontados ?? 0}` },
    { label: 'Alumnos', value: kpis.alumnos ?? 0 },
  ];
  const kpiW = (tableW - 10) / 6;
  const kpiH = 15;
  kpiItems.forEach((item, i) => {
    const x = MARGIN + i * (kpiW + 2);
    doc.setFillColor(239, 246, 255);
    doc.setDrawColor(...PDF_HEADER_BLUE);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y, kpiW, kpiH, 1.2, 1.2, 'FD');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(71, 85, 105);
    doc.text(item.label.toUpperCase(), x + kpiW / 2, y + 4.6, { align: 'center' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...PDF_HEADER_BLUE);
    doc.text(String(item.value), x + kpiW / 2, y + 11.4, { align: 'center' });
  });
  y += kpiH + 5;

  const ratios = [0.09, 0.06, 0.1, 0.16, 0.14, 0.1, 0.27, 0.08];
  const widths = ratios.map((r) => tableW * r);
  const labels = ['FECHA', 'HORA', 'TIPO', 'ALUMNO', 'REGISTRÓ', 'ORIGEN', 'DETALLE', 'PTS'];
  const wrapCols = new Set([3, 4, 5, 6]);

  const ensureSpace = (need) => {
    if (y + need <= pageH - MARGIN - 6) return false;
    doc.addPage();
    y = MARGIN;
    return true;
  };

  const drawTableHead = () => {
    doc.setFillColor(...PDF_HEADER_BLUE);
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.rect(MARGIN, y, tableW, HEAD_H, 'F');
    let x = MARGIN;
    labels.forEach((lb, i) => {
      textoCentradoCelda(doc, lb, x, y + 4.9, widths[i], 1);
      x += widths[i];
    });
    y += HEAD_H;
  };

  if (!grupos.length) {
    ensureSpace(12);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text('No hay incidencias ni estrellas para los filtros seleccionados.', MARGIN, y + 6);
  }

  for (const g of grupos) {
    ensureSpace(18);
    doc.setFillColor(30, 64, 175);
    doc.rect(MARGIN, y, tableW, 8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text(safeTxt(g.etiqueta || 'Grupo'), MARGIN + 3, y + 5.4);
    y += 8.6;
    drawTableHead();

    (g.registros || []).forEach((ev, idx) => {
      const vals = [
        ev.fecha,
        ev.hora,
        ev.tipo_label,
        ev.alumno_nombre,
        ev.registrado_por,
        ev.origen,
        ev.descripcion,
        ev.puntos_label || (ev.puntos != null ? String(ev.puntos) : '—'),
      ];
      const wrapped = vals.map((v, i) =>
        wrapCols.has(i) ? lineasCelda(doc, v, widths[i], i === 6 ? MAX_LINES : 2) : [safeTxt(v) || '—']
      );
      const rowH = alturaFila(wrapped.map((ls) => ls.length));
      if (ensureSpace(rowH + 1)) drawTableHead();

      if (ev.tipo === 'incidencia') doc.setFillColor(254, 242, 242);
      else if (ev.tipo === 'estrella') doc.setFillColor(236, 253, 245);
      else if (ev.tipo === 'vestimenta' || ev.tipo === 'olvido_qr') doc.setFillColor(255, 247, 237);
      else if (idx % 2 === 1) doc.setFillColor(248, 250, 252);
      else doc.setFillColor(255, 255, 255);
      doc.setDrawColor(...PDF_BORDER);
      doc.setLineWidth(0.2);
      doc.rect(MARGIN, y, tableW, rowH, 'FD');

      let x = MARGIN;
      wrapped.forEach((lines, i) => {
        const blockH = lines.length * LINE_H;
        let ty = y + (rowH - blockH) / 2 + 2.5;
        if (i === 7) {
          const n = Number(ev.puntos);
          if (n < 0) doc.setTextColor(190, 18, 60);
          else if (n > 0) doc.setTextColor(4, 120, 87);
          else doc.setTextColor(35, 35, 35);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7.2);
          doc.text(lines[0] || '—', x + widths[i] / 2, y + rowH / 2 + 1.1, { align: 'center' });
        } else if (wrapCols.has(i)) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(6.3);
          doc.setTextColor(35, 35, 35);
          lines.forEach((ln) => {
            doc.text(ln, x + 1.2, ty, { maxWidth: widths[i] - 2.2 });
            ty += LINE_H;
          });
        } else {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(6.3);
          doc.setTextColor(35, 35, 35);
          textoCentradoCelda(doc, lines[0], x, y + rowH / 2 + 1.1, widths[i], 1);
        }
        x += widths[i];
      });
      y += rowH;
    });
    y += 3.5;
  }

  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p += 1) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(`Página ${p} de ${totalPages}`, pageW - MARGIN, pageH - 4, { align: 'right' });
  }

  doc.save(`incidencias_estrellas_${data?.bimestre_label || 'todos'}_${data?.anio || ''}.pdf`);
}
