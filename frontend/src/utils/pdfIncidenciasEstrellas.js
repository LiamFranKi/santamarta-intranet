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
const ROW_H = 6.6;
const HEAD_H = 7.2;

function safeTxt(s) {
  return safeTxtPdf(s);
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
    { label: 'Puntos', value: kpis.puntos_estrellas ?? 0 },
    { label: 'Alumnos', value: kpis.alumnos ?? 0 },
  ];
  const kpiW = (tableW - 10) / 6;
  const kpiH = 14;
  kpiItems.forEach((item, i) => {
    const x = MARGIN + i * (kpiW + 2);
    doc.setFillColor(239, 246, 255);
    doc.setDrawColor(...PDF_HEADER_BLUE);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y, kpiW, kpiH, 1.2, 1.2, 'FD');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(71, 85, 105);
    doc.text(item.label.toUpperCase(), x + kpiW / 2, y + 4.5, { align: 'center' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...PDF_HEADER_BLUE);
    doc.text(String(item.value), x + kpiW / 2, y + 11, { align: 'center' });
  });
  y += kpiH + 6;

  const ratios = [0.11, 0.07, 0.11, 0.2, 0.15, 0.12, 0.2, 0.04];
  const widths = ratios.map((r) => tableW * r);
  const labels = ['FECHA', 'HORA', 'TIPO', 'ALUMNO', 'REGISTRÓ', 'ORIGEN', 'DETALLE', 'PTS'];

  const ensureSpace = (need) => {
    if (y + need <= pageH - MARGIN) return;
    doc.addPage();
    y = MARGIN;
  };

  const drawTableHead = () => {
    doc.setFillColor(...PDF_HEADER_BLUE);
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.rect(MARGIN, y, tableW, HEAD_H, 'F');
    let x = MARGIN;
    labels.forEach((lb, i) => {
      textoCentradoCelda(doc, lb, x, y + 4.8, widths[i], 1);
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
    ensureSpace(16);
    doc.setFillColor(30, 64, 175);
    doc.rect(MARGIN, y, tableW, 8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text(safeTxt(g.etiqueta || 'Grupo'), MARGIN + 3, y + 5.4);
    y += 9;
    drawTableHead();
    (g.registros || []).forEach((ev, idx) => {
      ensureSpace(ROW_H + 2);
      if (y === MARGIN) drawTableHead();
      if (ev.tipo === 'incidencia') doc.setFillColor(254, 242, 242);
      else if (ev.tipo === 'estrella') doc.setFillColor(236, 253, 245);
      else if (ev.tipo === 'vestimenta' || ev.tipo === 'olvido_qr') doc.setFillColor(255, 247, 237);
      else if (idx % 2 === 1) doc.setFillColor(248, 250, 252);
      else doc.setFillColor(255, 255, 255);
      doc.setDrawColor(...PDF_BORDER);
      doc.rect(MARGIN, y, tableW, ROW_H, 'FD');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.2);
      doc.setTextColor(35, 35, 35);
      const vals = [
        ev.fecha,
        ev.hora,
        ev.tipo_label,
        ev.alumno_nombre,
        ev.registrado_por,
        ev.origen,
        ev.descripcion,
        ev.puntos != null ? String(ev.puntos) : '—',
      ];
      let x = MARGIN;
      vals.forEach((v, i) => {
        if (i === 3 || i === 6) {
          doc.text(safeTxt(v), x + 1.2, y + 4.3, { maxWidth: widths[i] - 2.2 });
        } else {
          textoCentradoCelda(doc, v, x, y + 4.3, widths[i], 1);
        }
        x += widths[i];
      });
      y += ROW_H;
    });
    y += 4;
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
