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

function fmtPuntaje(v) {
  if (v == null || v === '') return '';
  const n = Number(v);
  if (!Number.isFinite(n)) return '';
  return n.toFixed(2);
}

function fmtPromedio(v) {
  if (v == null || v === '') return '';
  const n = Number(v);
  if (!Number.isFinite(n)) return '';
  return n.toFixed(2);
}

function fmtPuesto(v) {
  if (v == null || v === '') return '';
  return String(v);
}

export async function generarPdfRankingNotas({
  colegioNombre,
  titulo,
  subtitulo,
  filas,
  modoCualitativo,
}) {
  const logo = await obtenerLogoColegioParaPdf();
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  let y = dibujarCabeceraReportePdf(doc, logo, {
    colegioNombre,
    titulos: [safeTxt(titulo || 'RANKING DE NOTAS')],
    subtitulos: subtitulo ? [safeTxt(subtitulo)] : [],
  });

  const tableW = pageW - MARGIN * 2;
  const ratios = [0.46, 0.18, 0.18, 0.18];
  const widths = ratios.map((r) => tableW * r);
  const labels = ['APELLIDOS Y NOMBRES', 'PUNTAJE', 'PROMEDIO', 'PUESTO'];

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

  const lista = filas || [];
  for (let i = 0; i < lista.length; i += 1) {
    const f = lista[i];
    if (y + ROW_H > pageH - MARGIN) {
      doc.addPage();
      y = MARGIN;
      drawHead();
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(35, 35, 35);
    }

    if (i % 2 === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(MARGIN, y, tableW, ROW_H, 'F');
    }

    doc.setDrawColor(...PDF_BORDER);
    doc.rect(MARGIN, y, tableW, ROW_H, 'S');

    let x = MARGIN;
    const vals = modoCualitativo
      ? [f.alumno_nombre, '', '', '']
      : [
          f.alumno_nombre,
          fmtPuntaje(f.puntaje),
          fmtPromedio(f.promedio),
          fmtPuesto(f.puesto),
        ];

    vals.forEach((v, col) => {
      const w = widths[col];
      const align = col === 0 ? 'left' : 'center';
      const raw = safeTxt(v);
      if (align === 'center') {
        textoCentradoCelda(doc, raw, x, y + 4.6, w);
      } else {
        doc.text(raw, x + 1.5, y + 4.6, { maxWidth: w - 3 });
      }
      x += w;
    });
    y += ROW_H;
  }

  if (!lista.length) {
    doc.setFontSize(9);
    doc.text('No hay alumnos matriculados en este grupo.', MARGIN + 2, y + 6);
  }

  const slug = safeTxt(subtitulo).replace(/[^\w\s-]/g, '').slice(0, 36) || 'ranking';
  doc.save(`ranking_notas_${slug}.pdf`);
}
