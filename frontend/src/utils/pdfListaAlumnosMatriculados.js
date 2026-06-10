import { jsPDF } from 'jspdf';
import { obtenerLogoColegioDataUrl, dibujarLogoEsquina } from './pdfReporteColegioLogo';

const HEADER_BLUE = [30, 64, 175];
const BORDER = [190, 200, 220];
const ROW_H = 7;
const HEAD_H = 8;
const MARGIN = 10;
const FOOTER_H = 14;

const COLS = [
  { key: 'n', label: 'N°', w: 7, align: 'center' },
  { key: 'alumno_nombre', label: 'Apellidos y Nombres', w: 42, align: 'left' },
  { key: 'alumno_dni', label: 'N° Doc.', w: 18, align: 'center' },
  { key: 'apoderado_nombre', label: 'Apoderado', w: 38, align: 'left' },
  { key: 'apoderado_dni', label: 'N° Doc.', w: 18, align: 'center' },
  { key: 'fecha_nacimiento', label: 'Fec.Nac.', w: 18, align: 'center' },
  { key: 'telefono', label: 'Teléfono', w: 20, align: 'center' },
  { key: 'email', label: 'Email', w: 29, align: 'left' },
];

function safeTxt(s) {
  if (s == null) return '';
  return String(s).replace(/\r?\n/g, ' ').trim();
}

function fmtFecha(iso) {
  if (!iso || iso === '—') return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return safeTxt(iso);
  return d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function prepFila(f) {
  return {
    ...f,
    fecha_nacimiento: fmtFecha(f.fecha_nacimiento),
  };
}

function totalColWidth() {
  return COLS.reduce((s, c) => s + c.w, 0);
}

function drawTableHeader(doc, y, pageW) {
  const totalW = totalColWidth();
  const scale = (pageW - MARGIN * 2) / totalW;
  let x = MARGIN;
  doc.setFillColor(...HEADER_BLUE);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.rect(MARGIN, y, pageW - MARGIN * 2, HEAD_H, 'F');
  for (const col of COLS) {
    const w = col.w * scale;
    doc.text(col.label, x + w / 2, y + 5.2, { align: 'center', maxWidth: w - 1 });
    x += w;
  }
  return y + HEAD_H;
}

function drawRow(doc, fila, y, pageW) {
  const totalW = totalColWidth();
  const scale = (pageW - MARGIN * 2) / totalW;
  let x = MARGIN;
  doc.setDrawColor(...BORDER);
  doc.setTextColor(35, 35, 35);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.3);
  doc.rect(MARGIN, y, pageW - MARGIN * 2, ROW_H);
  for (const col of COLS) {
    const w = col.w * scale;
    const val = safeTxt(fila[col.key]);
    const lines = doc.splitTextToSize(val, w - 2).slice(0, 2);
    const txt = lines[0] || '';
    const cx = col.align === 'center' ? x + w / 2 : x + 1.5;
    doc.text(txt, cx, y + 4.8, {
      align: col.align === 'center' ? 'center' : 'left',
      maxWidth: w - 2,
    });
    x += w;
    doc.line(x, y, x, y + ROW_H);
  }
  return y + ROW_H;
}

function drawTotales(doc, totales, y, pageW) {
  const boxW = (pageW - MARGIN * 2) / 3;
  const labels = [
    { t: 'Hombres', v: totales.hombres ?? 0 },
    { t: 'Mujeres', v: totales.mujeres ?? 0 },
    { t: 'Total', v: totales.total ?? 0 },
  ];
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(30, 64, 175);
  labels.forEach((lb, i) => {
    const x0 = MARGIN + i * boxW;
    doc.setDrawColor(...BORDER);
    doc.rect(x0, y, boxW, FOOTER_H);
    doc.text(lb.t, x0 + boxW / 2, y + 5, { align: 'center' });
    doc.setFontSize(11);
    doc.text(String(lb.v), x0 + boxW / 2, y + 11, { align: 'center' });
    doc.setFontSize(9);
  });
  return y + FOOTER_H + 4;
}

function rowsPerPage(yStart, pageH) {
  const usable = pageH - MARGIN - FOOTER_H - 8 - yStart;
  return Math.max(8, Math.floor(usable / ROW_H));
}

function drawBloqueGrupo(doc, { titulo, filas, totales, colegioNombre, esPrimeraPagina, logoData }) {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  let y = MARGIN;

  if (!esPrimeraPagina) {
    doc.addPage();
    y = MARGIN;
  }

  const logoH = dibujarLogoEsquina(doc, logoData, { margin: MARGIN, size: 14 });
  y = Math.max(y, MARGIN + logoH);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(30, 64, 175);
  doc.text(safeTxt(colegioNombre || 'Colegio'), pageW - MARGIN, y + 4, { align: 'right' });
  y += 8;
  doc.setFontSize(10);
  doc.text(`LISTA DE ALUMNOS - ${safeTxt(titulo)}`, pageW - MARGIN, y, { align: 'right' });
  y += 10;

  const prepared = (filas || []).map(prepFila);
  let idx = 0;
  let firstTablePage = true;

  while (idx < prepared.length) {
    if (!firstTablePage) {
      doc.addPage();
      y = MARGIN;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(80, 80, 80);
      doc.text(`(continúa) ${safeTxt(titulo)}`, MARGIN, y + 4);
      y += 8;
    }
    y = drawTableHeader(doc, y, pageW);
    const maxRows = rowsPerPage(y, pageH);
    const slice = prepared.slice(idx, idx + maxRows);
    for (const row of slice) {
      y = drawRow(doc, row, y, pageW);
    }
    idx += slice.length;
    firstTablePage = false;

    if (idx < prepared.length) {
      continue;
    }
    if (y + FOOTER_H + 6 > pageH - MARGIN) {
      doc.addPage();
      y = MARGIN;
    }
    drawTotales(doc, totales, y + 4, pageW);
  }

  if (prepared.length === 0) {
    y = drawTableHeader(doc, y, pageW);
    drawTotales(doc, totales || { hombres: 0, mujeres: 0, total: 0 }, y + 4, pageW);
  }
}

/**
 * @param {{ colegioNombre?: string, titulo?: string, filas?: object[], totales?: object }} payload — un grupo
 */
export async function generarPdfListaAlumnosUnGrupo(payload) {
  const logoData = await obtenerLogoColegioDataUrl();
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  drawBloqueGrupo(doc, {
    colegioNombre: payload.colegioNombre,
    titulo: payload.titulo,
    filas: payload.filas || [],
    totales: payload.totales || { hombres: 0, mujeres: 0, total: 0 },
    esPrimeraPagina: true,
    logoData,
  });
  const safeName = safeTxt(payload.titulo).replace(/[^\w\s-]/g, '').slice(0, 40) || 'lista';
  doc.save(`lista_alumnos_${safeName}.pdf`);
}

/**
 * @param {{ colegioNombre?: string, bloques?: { titulo, filas, totales }[], totales_generales?: object }} payload
 */
export async function generarPdfListaAlumnosTodosGrupos(payload) {
  const logoData = await obtenerLogoColegioDataUrl();
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const bloques = payload.bloques || [];
  if (!bloques.length) {
    doc.setFontSize(12);
    doc.text('No hay alumnos matriculados para exportar.', MARGIN, 20);
    doc.save('lista_alumnos_todos.pdf');
    return;
  }
  bloques.forEach((bloque, i) => {
    drawBloqueGrupo(doc, {
      colegioNombre: payload.colegioNombre,
      titulo: bloque.titulo,
      filas: bloque.filas,
      totales: bloque.totales,
      esPrimeraPagina: i === 0,
      logoData,
    });
  });
  doc.save('lista_alumnos_todos_grados.pdf');
}
