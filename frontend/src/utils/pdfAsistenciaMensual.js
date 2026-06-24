import { jsPDF } from 'jspdf';
import { obtenerLogoColegioParaPdf } from './pdfReporteColegioLogo';
import {
  PDF_HEADER_BLUE,
  PDF_BORDER,
  PDF_PAGE_MARGIN,
  safeTxtPdf,
  dibujarCabeceraReportePdf,
} from './pdfReportesGeneralTheme';

const CODIGO_ASISTENCIA_COLOR = {
  P: '#1565c0',
  F: '#c62828',
  T: '#e65100',
  TJ: '#1565c0',
  FJ: '#6a1b9a',
};

const MARGIN = PDF_PAGE_MARGIN;
const ROW_H = 5.5;
const HEAD_H = 5;
const HEAD_ROWS = 2;

function safeTxt(s) {
  return safeTxtPdf(s);
}

function colorPdfCodigo(doc, codigo) {
  const c = String(codigo || '').toUpperCase();
  const hex = CODIGO_ASISTENCIA_COLOR[c];
  if (hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    doc.setTextColor(r, g, b);
    if (c === 'P' || c === 'T' || c === 'TJ') doc.setFont('helvetica', 'bold');
    else doc.setFont('helvetica', 'normal');
    return;
  }
  doc.setTextColor(35, 35, 35);
  doc.setFont('helvetica', 'normal');
}

function textoCentradoMark(doc, text, x, y, w) {
  const raw = safeTxt(text);
  if (!raw) return;
  doc.text(raw, x + w / 2, y, { align: 'center', maxWidth: w - 1 });
}

export async function generarPdfAsistenciaMensual({ colegioNombre, titulo, subtitulo, columnas, filas }) {
  const logo = await obtenerLogoColegioParaPdf();
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const cols = columnas || [];
  const numDias = cols.length || 1;

  const titulos = [safeTxt(titulo || 'REPORTE DE ASISTENCIA')];
  const subtitulos = subtitulo ? [safeTxt(subtitulo)] : [];

  const wNombre = 52;
  const tableW = pageW - MARGIN * 2;
  const wDia = (tableW - wNombre) / numDias;

  const drawHead = (startY) => {
    let y = startY;
    doc.setFillColor(...PDF_HEADER_BLUE);
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.5);

    doc.rect(MARGIN, y, wNombre, HEAD_H * HEAD_ROWS, 'F');
    doc.text('APELLIDOS Y', MARGIN + wNombre / 2, y + 4, { align: 'center', maxWidth: wNombre - 2 });
    doc.text('NOMBRES', MARGIN + wNombre / 2, y + 8, { align: 'center', maxWidth: wNombre - 2 });

    let x = MARGIN + wNombre;
    cols.forEach((c) => {
      doc.rect(x, y, wDia, HEAD_H, 'F');
      doc.text(String(c.dia_semana || ''), x + wDia / 2, y + 3.8, { align: 'center', maxWidth: wDia - 1 });
      x += wDia;
    });
    y += HEAD_H;

    x = MARGIN + wNombre;
    cols.forEach((c) => {
      doc.rect(x, y, wDia, HEAD_H, 'F');
      doc.text(String(c.dia_numero ?? ''), x + wDia / 2, y + 3.8, { align: 'center', maxWidth: wDia - 1 });
      x += wDia;
    });
    y += HEAD_H;
    return y;
  };

  let y = dibujarCabeceraReportePdf(doc, logo, {
    colegioNombre,
    titulos,
    subtitulos,
  });

  y = drawHead(y);

  doc.setFontSize(5);
  doc.setTextColor(35, 35, 35);

  for (const f of filas || []) {
    if (y + ROW_H > pageH - MARGIN) {
      doc.addPage();
      y = MARGIN;
      y = drawHead(y);
    }

    doc.setDrawColor(...PDF_BORDER);
    doc.rect(MARGIN, y, tableW, ROW_H);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(35, 35, 35);
    doc.setFontSize(5);
    const nomLines = doc.splitTextToSize(safeTxt(f.alumno_nombre), wNombre - 2).slice(0, 1);
    doc.text(nomLines[0] || '', MARGIN + 1.5, y + 3.8, { maxWidth: wNombre - 2 });

    let x = MARGIN + wNombre;
    (f.marcas || []).forEach((cod) => {
      colorPdfCodigo(doc, cod);
      textoCentradoMark(doc, cod, x, y + 3.8, wDia);
      x += wDia;
    });
    doc.setTextColor(35, 35, 35);
    doc.setFont('helvetica', 'normal');
    y += ROW_H;
  }

  if (!(filas || []).length) {
    doc.setFontSize(9);
    doc.text('No hay alumnos matriculados en este grupo.', MARGIN + 2, y + 6);
  }

  const slug = safeTxt(subtitulo).replace(/[^\w\s-]/g, '').slice(0, 30) || 'mes';
  doc.save(`asistencia_mensual_${slug}.pdf`);
}
