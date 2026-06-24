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
const HEAD_H = 6;
const HEAD_ROWS = 2;

function safeTxt(s) {
  return safeTxtPdf(s);
}

function etiquetaDiaNumero(col) {
  if (col == null) return '';
  if (col.dia_numero != null && col.dia_numero !== '') return String(col.dia_numero);
  if (col.dia != null && col.dia !== '') return String(col.dia);
  const f = String(col.fecha || '').trim();
  const m = f.match(/-(\d{1,2})$/);
  if (m) return String(parseInt(m[1], 10));
  return '';
}

function etiquetaDiaSemana(col) {
  if (col == null) return '';
  return String(col.dia_semana || col.diaSemana || '').trim();
}

/** Texto blanco centrado en celda de cabecera azul */
function textoCabeceraCelda(doc, text, x, y, w, h) {
  const raw = String(text ?? '').trim();
  if (!raw) return;
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.text(raw, x + w / 2, y + h / 2 + 1.2, { align: 'center' });
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
    const headTotalH = HEAD_H * HEAD_ROWS;

    doc.setFillColor(...PDF_HEADER_BLUE);
    doc.setDrawColor(...PDF_BORDER);
    doc.setFontSize(6);

    doc.rect(MARGIN, y, wNombre, headTotalH, 'FD');
    textoCabeceraCelda(doc, 'APELLIDOS Y', MARGIN, y, wNombre, HEAD_H);
    textoCabeceraCelda(doc, 'NOMBRES', MARGIN, y + HEAD_H, wNombre, HEAD_H);

    let x = MARGIN + wNombre;
    cols.forEach((c) => {
      doc.rect(x, y, wDia, HEAD_H, 'FD');
      textoCabeceraCelda(doc, etiquetaDiaSemana(c), x, y, wDia, HEAD_H);
      x += wDia;
    });

    const y2 = y + HEAD_H;
    x = MARGIN + wNombre;
    cols.forEach((c) => {
      doc.rect(x, y2, wDia, HEAD_H, 'FD');
      textoCabeceraCelda(doc, etiquetaDiaNumero(c), x, y2, wDia, HEAD_H);
      x += wDia;
    });

    return y + headTotalH;
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
