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
const MAX_LINES = 3;

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

function drawSectionTitle(doc, y, tableW, text) {
  doc.setFillColor(30, 64, 175);
  doc.rect(MARGIN, y, tableW, 8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text(safeTxt(text), MARGIN + 3, y + 5.4);
  return y + 8.6;
}

export async function generarPdfAvatar({ data }) {
  const logo = await obtenerLogoColegioParaPdf();
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const tableW = pageW - MARGIN * 2;
  const kpis = data?.kpis || {};
  const ranking = data?.ranking || [];
  const grupos = data?.grupos || [];

  let y = dibujarCabeceraReportePdf(doc, logo, {
    colegioNombre: data?.colegio_nombre || 'Colegio',
    titulos: [safeTxt(data?.titulo || 'AVATAR')],
    subtitulos: data?.subtitulo ? [safeTxt(data.subtitulo)] : [],
  });

  const kpiItems = [
    { label: 'Canjes', value: kpis.canjes ?? 0 },
    { label: 'Alumnos que canjearon', value: kpis.alumnos_canjearon ?? 0 },
    { label: 'En ranking', value: kpis.alumnos_ranking ?? 0 },
    { label: 'Puntos totales', value: kpis.puntos_totales ?? 0 },
    { label: '1.er puesto', value: kpis.top_nombre || '—' },
    { label: 'Puntos del 1.°', value: kpis.top_puntos ?? 0 },
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
    doc.text(String(item.label).toUpperCase(), x + kpiW / 2, y + 4.6, { align: 'center', maxWidth: kpiW - 3 });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(i === 4 ? 6.6 : 10);
    doc.setTextColor(...PDF_HEADER_BLUE);
    const val = String(item.value);
    const valLines = doc.splitTextToSize(val, kpiW - 3).slice(0, 2);
    doc.text(valLines, x + kpiW / 2, y + (i === 4 ? 9.6 : 11.4), { align: 'center' });
  });
  y += kpiH + 5;

  const ensureSpace = (need) => {
    if (y + need <= pageH - MARGIN - 6) return false;
    doc.addPage();
    y = MARGIN;
    return true;
  };

  const drawHead = (labels, widths) => {
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

  const ratiosR = [0.08, 0.2, 0.42, 0.15, 0.15];
  const widthsR = ratiosR.map((r) => tableW * r);
  const labelsR = ['PUESTO', 'AULA', 'ALUMNO', 'PUNTOS', 'CANJES'];

  ensureSpace(20);
  y = drawSectionTitle(doc, y, tableW, `Ranking de estrellas — ${data?.alcance || 'Ranking general'}`);
  drawHead(labelsR, widthsR);

  if (!ranking.length) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text('No hay alumnos con estrellas para los filtros seleccionados.', MARGIN + 2, y + 6);
    y += 12;
  }

  ranking.forEach((ev) => {
    const vals = [String(ev.puesto), ev.aula, ev.alumno_nombre, String(ev.puntos), String(ev.canjes ?? 0)];
    const wrapped = vals.map((v, i) => (i === 1 || i === 2 ? lineasCelda(doc, v, widthsR[i], 2) : [safeTxt(v)]));
    const rowH = alturaFila(wrapped.map((ls) => ls.length));
    if (ensureSpace(rowH + 1)) drawHead(labelsR, widthsR);

    if (ev.puesto === 1) doc.setFillColor(254, 243, 199);
    else if (ev.puesto === 2) doc.setFillColor(241, 245, 249);
    else if (ev.puesto === 3) doc.setFillColor(255, 237, 213);
    else doc.setFillColor(255, 255, 255);
    doc.setDrawColor(...PDF_BORDER);
    doc.setLineWidth(0.2);
    doc.rect(MARGIN, y, tableW, rowH, 'FD');

    let x = MARGIN;
    wrapped.forEach((lines, i) => {
      const blockH = lines.length * LINE_H;
      let ty = y + (rowH - blockH) / 2 + 2.5;
      if (i === 0 || i === 3) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(i === 0 ? 8 : 7.4);
        if (i === 3) doc.setTextColor(4, 120, 87);
        else if (ev.puesto === 1) doc.setTextColor(180, 83, 9);
        else doc.setTextColor(30, 64, 175);
        doc.text(lines[0] || '—', x + widthsR[i] / 2, y + rowH / 2 + 1.1, { align: 'center' });
      } else {
        doc.setFont('helvetica', i === 2 ? 'bold' : 'normal');
        doc.setFontSize(6.4);
        doc.setTextColor(35, 35, 35);
        lines.forEach((ln) => {
          doc.text(ln, x + 1.2, ty, { maxWidth: widthsR[i] - 2.2 });
          ty += LINE_H;
        });
      }
      x += widthsR[i];
    });
    y += rowH;
  });

  y += 5;
  const ratiosC = [0.16, 0.09, 0.22, 0.1, 0.2, 0.14, 0.09];
  const widthsC = ratiosC.map((r) => tableW * r);
  const labelsC = ['AULA', 'FECHA', 'ALUMNO', 'TIPO', 'ÍTEM', 'AVATAR', 'PTS REQ.'];

  if (ensureSpace(22)) {
    /* nueva página */
  }
  y = drawSectionTitle(doc, y, tableW, 'Canjes y desbloqueos de avatar');
  drawHead(labelsC, widthsC);

  if (!grupos.length) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text('No hay canjes ni desbloqueos para los filtros seleccionados.', MARGIN + 2, y + 6);
    y += 10;
  }

  grupos.forEach((g) => {
    (g.registros || []).forEach((ev) => {
      const vals = [
        ev.aula || g.aula,
        ev.fecha,
        ev.alumno_nombre,
        ev.tipo_label,
        ev.item_nombre,
        ev.base_nombre,
        ev.puntos_req != null ? String(ev.puntos_req) : '—',
      ];
      const wrapCols = new Set([0, 2, 4, 5]);
      const wrapped = vals.map((v, i) => (wrapCols.has(i) ? lineasCelda(doc, v, widthsC[i], 2) : [safeTxt(v) || '—']));
      const rowH = alturaFila(wrapped.map((ls) => ls.length));
      if (ensureSpace(rowH + 1)) drawHead(labelsC, widthsC);

      if (ev.tipo === 'accesorio') doc.setFillColor(236, 253, 245);
      else doc.setFillColor(239, 246, 255);
      doc.setDrawColor(...PDF_BORDER);
      doc.setLineWidth(0.2);
      doc.rect(MARGIN, y, tableW, rowH, 'FD');

      let x = MARGIN;
      wrapped.forEach((lines, i) => {
        const blockH = lines.length * LINE_H;
        let ty = y + (rowH - blockH) / 2 + 2.5;
        doc.setFont('helvetica', i === 2 ? 'bold' : 'normal');
        doc.setFontSize(6.3);
        doc.setTextColor(35, 35, 35);
        if (wrapCols.has(i)) {
          lines.forEach((ln) => {
            doc.text(ln, x + 1.2, ty, { maxWidth: widthsC[i] - 2.2 });
            ty += LINE_H;
          });
        } else {
          textoCentradoCelda(doc, lines[0], x, y + rowH / 2 + 1.1, widthsC[i], 1);
        }
        x += widthsC[i];
      });
      y += rowH;
    });
  });

  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p += 1) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(`Página ${p} de ${totalPages}`, pageW - MARGIN, pageH - 4, { align: 'right' });
  }

  doc.save(`avatar_${data?.bimestre_label || 'todos'}_${data?.anio || ''}.pdf`);
}
