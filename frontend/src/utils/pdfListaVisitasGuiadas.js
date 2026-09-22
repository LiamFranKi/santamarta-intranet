import { jsPDF } from 'jspdf';
import { obtenerLogoColegioParaPdf } from './pdfReporteColegioLogo';
import { obtenerTituloColegio } from './identidadColegio';
import {
  PDF_HEADER_BLUE,
  PDF_BORDER,
  PDF_PAGE_MARGIN,
  safeTxtPdf,
  textoCentradoCelda,
  dibujarCabeceraReportePdf,
} from './pdfReportesGeneralTheme';

const MARGIN = PDF_PAGE_MARGIN;
const ROW_H = 8;
const HEAD_H = 8;

function safeTxt(s) {
  return safeTxtPdf(s);
}

function fmtFechaLarga(ymd) {
  const [y, m, d] = String(ymd || '').split('-').map(Number);
  if (!d) return ymd || '';
  const dt = new Date(y, m - 1, d);
  const txt = dt.toLocaleDateString('es-PE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  return txt.charAt(0).toUpperCase() + txt.slice(1);
}

export async function generarPdfListaVisitasGuiadas({
  colegioNombre,
  fechaYmd,
  horario = '',
  filas = [],
}) {
  const logo = await obtenerLogoColegioParaPdf();
  const nombreColegio = colegioNombre || (await obtenerTituloColegio());
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const fechaTitulo = fmtFechaLarga(fechaYmd);

  const subtitulos = [`Fecha de visita: ${fechaTitulo}`];
  if (horario) subtitulos.push(`Horario: ${safeTxt(horario)}`);
  subtitulos.push(`${(filas || []).length} visitante${(filas || []).length === 1 ? '' : 's'}`);

  let y = dibujarCabeceraReportePdf(doc, logo, {
    colegioNombre: nombreColegio,
    titulos: ['Lista de visitas guiadas'],
    subtitulos,
  });

  const tableW = pageW - MARGIN * 2;
  const widths = [
    tableW * 0.05,
    tableW * 0.18,
    tableW * 0.12,
    tableW * 0.18,
    tableW * 0.1,
    tableW * 0.14,
    tableW * 0.15,
    tableW * 0.08,
  ];
  const labels = ['N°', 'NOMBRE', 'TELÉFONO', 'EMAIL', 'NIVEL', 'GRADO', 'HORARIO', 'N° EST.'];

  const drawHead = () => {
    doc.setFillColor(...PDF_HEADER_BLUE);
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.8);
    doc.rect(MARGIN, y, tableW, HEAD_H, 'F');
    let x = MARGIN;
    labels.forEach((lb, i) => {
      doc.text(lb, x + widths[i] / 2, y + 5.2, { align: 'center', maxWidth: widths[i] - 1.5 });
      x += widths[i];
    });
    y += HEAD_H;
  };

  drawHead();

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.6);
  doc.setTextColor(35, 35, 35);

  const lista = filas || [];
  lista.forEach((f, idx) => {
    if (y + ROW_H > pageH - MARGIN - 8) {
      doc.addPage();
      y = MARGIN;
      drawHead();
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.6);
      doc.setTextColor(35, 35, 35);
    }
    if (idx % 2 === 1) {
      doc.setFillColor(241, 245, 249);
      doc.rect(MARGIN, y, tableW, ROW_H, 'F');
    }
    doc.setDrawColor(...PDF_BORDER);
    doc.rect(MARGIN, y, tableW, ROW_H, 'S');
    let x = MARGIN;
    const vals = [
      String(idx + 1),
      f.nombre,
      f.telefono,
      f.email,
      f.nivel_interes,
      f.grado_interes,
      f.horario_preferido,
      f.numero_estudiantes != null && f.numero_estudiantes !== '' ? String(f.numero_estudiantes) : '—',
    ];
    vals.forEach((v, i) => {
      const w = widths[i];
      textoCentradoCelda(doc, v, x, y + 5.1, w);
      x += w;
    });
    y += ROW_H;
  });

  if (!lista.length) {
    doc.setFontSize(9);
    doc.text('No hay visitantes registrados para esta fecha.', MARGIN + 2, y + 6);
    y += 12;
  }

  y += 6;
  if (y > pageH - MARGIN - 6) {
    doc.addPage();
    y = MARGIN + 4;
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(30, 64, 175);
  doc.text(`Total de visitantes: ${lista.length}`, MARGIN, y);

  const slug = String(fechaYmd || 'fecha').replace(/[^\d-]/g, '');
  const horaSlug = safeTxt(horario)
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 24);
  doc.save(`visitas_guiadas_${slug}${horaSlug ? `_${horaSlug}` : ''}.pdf`);
}
