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
const ROW_H = 6.4;
const HEAD_H = 7.2;

function safeTxt(s) {
  return safeTxtPdf(s);
}

function fmtNum(v) {
  if (v == null || v === '') return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

export async function generarPdfExamenesVirtuales({ data }) {
  const logo = await obtenerLogoColegioParaPdf();
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const tableW = pageW - MARGIN * 2;
  const kpis = data?.kpis || {};
  const grupos = data?.grupos || [];

  let y = dibujarCabeceraReportePdf(doc, logo, {
    colegioNombre: data?.colegio_nombre || 'Colegio',
    titulos: [safeTxt(data?.titulo || 'EXÁMENES VIRTUALES')],
    subtitulos: data?.subtitulo ? [safeTxt(data.subtitulo)] : [],
  });

  const kpiW = (tableW - 8) / 5;
  const kpiH = 14;
  const kpiItems = [
    { label: 'Publicados', value: kpis.total_examenes ?? 0 },
    { label: 'Con rendición', value: kpis.examenes_rendidos ?? 0 },
    { label: 'Sin rendir', value: kpis.examenes_sin_rendir ?? 0 },
    { label: 'Alumnos que rindieron', value: kpis.alumnos_rindieron ?? 0 },
    { label: 'Promedio general', value: fmtNum(kpis.promedio_general) },
  ];
  kpiItems.forEach((item, i) => {
    const x = MARGIN + i * (kpiW + 2);
    doc.setFillColor(239, 246, 255);
    doc.setDrawColor(...PDF_HEADER_BLUE);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y, kpiW, kpiH, 1.2, 1.2, 'FD');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(71, 85, 105);
    doc.text(item.label.toUpperCase(), x + kpiW / 2, y + 4.5, { align: 'center' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...PDF_HEADER_BLUE);
    doc.text(String(item.value), x + kpiW / 2, y + 11, { align: 'center' });
  });
  y += kpiH + 6;

  const ratios = [0.06, 0.38, 0.14, 0.14, 0.12, 0.08, 0.08];
  const widths = ratios.map((r) => tableW * r);
  const labels = ['N°', 'ALUMNO', 'ESTADO', 'FECHA', 'PUNTAJE', 'OK', 'ERR'];

  const ensureSpace = (need) => {
    if (y + need <= pageH - MARGIN) return;
    doc.addPage();
    y = MARGIN;
  };

  const drawTableHead = () => {
    doc.setFillColor(...PDF_HEADER_BLUE);
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
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
    doc.text('No hay exámenes virtuales para los filtros seleccionados.', MARGIN, y + 6);
  }

  for (const g of grupos) {
    ensureSpace(18);
    doc.setFillColor(30, 64, 175);
    doc.rect(MARGIN, y, tableW, 8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text(safeTxt(g.etiqueta || 'Grupo'), MARGIN + 3, y + 5.4);
    y += 10;

    for (const asig of g.asignaturas || []) {
      for (const ex of asig.examenes || []) {
        ensureSpace(22);
        doc.setFillColor(238, 242, 255);
        doc.setDrawColor(191, 219, 254);
        doc.rect(MARGIN, y, tableW, 8, 'FD');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(30, 64, 175);
        const metaEx = [
          safeTxt(asig.curso_nombre),
          safeTxt(asig.docente_nombre),
          safeTxt(ex.tipo),
          `${ex.rendidos || 0}/${ex.total_alumnos || 0} rindieron`,
          ex.promedio != null ? `Prom. ${fmtNum(ex.promedio)}` : 'Sin promedio',
        ].filter(Boolean).join('  ·  ');
        doc.text(safeTxt(ex.titulo), MARGIN + 3, y + 3.4, { maxWidth: tableW - 8 });
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(71, 85, 105);
        doc.text(metaEx, MARGIN + 3, y + 6.8, { maxWidth: tableW - 8 });
        y += 9;

        drawTableHead();
        (ex.alumnos || []).forEach((al, idx) => {
          ensureSpace(ROW_H + 2);
          if (y === MARGIN) {
            drawTableHead();
          }
          if (!al.rindio) doc.setFillColor(254, 242, 242);
          else if (idx % 2 === 1) doc.setFillColor(248, 250, 252);
          else doc.setFillColor(255, 255, 255);
          doc.setDrawColor(...PDF_BORDER);
          doc.rect(MARGIN, y, tableW, ROW_H, 'FD');
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(6.5);
          doc.setTextColor(35, 35, 35);
          const vals = [
            String(idx + 1),
            al.alumno_nombre,
            al.estado,
            al.fecha,
            fmtNum(al.puntaje),
            al.correctas != null ? String(al.correctas) : '—',
            al.incorrectas != null ? String(al.incorrectas) : '—',
          ];
          let x = MARGIN;
          vals.forEach((v, i) => {
            if (i === 1) {
              doc.text(safeTxt(v), x + 1.4, y + 4.3, { maxWidth: widths[i] - 2.4 });
            } else {
              textoCentradoCelda(doc, v, x, y + 4.3, widths[i], 1);
            }
            x += widths[i];
          });
          y += ROW_H;
        });
        y += 4;
      }
    }
  }

  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p += 1) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Página ${p} de ${totalPages}`,
      pageW - MARGIN,
      pageH - 4,
      { align: 'right' }
    );
  }

  const bim = data?.bimestre_label || data?.bimestre || '';
  const anio = data?.anio || '';
  doc.save(`examenes_virtuales_b${bim}_${anio}.pdf`);
}
