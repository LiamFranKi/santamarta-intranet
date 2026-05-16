import { jsPDF } from 'jspdf';

const HEADER_BLUE = [30, 64, 175];
const HEADER_TEXT = [255, 255, 255];
const BORDER = [190, 200, 220];
const BAR_FILL = [59, 130, 246];

function safeTxt(s) {
  if (s == null) return '';
  return String(s).replace(/\r?\n/g, ' ').trim();
}

function fmtNota(n) {
  if (n == null || n === '') return '—';
  const v = typeof n === 'number' ? n : parseFloat(n);
  if (Number.isNaN(v)) return safeTxt(n);
  return v.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtPct(n) {
  if (n == null || n === '') return '—';
  return `${Number(n).toLocaleString('es-PE', { maximumFractionDigits: 1 })}%`;
}

/**
 * @param {object} opts
 * @param {string} opts.colegioNombre
 * @param {string} opts.titulo
 * @param {number} opts.anio
 * @param {number} [opts.ciclo]
 * @param {Array<{key:string, label:string, width?:number, align?:'left'|'center'|'right', format?:'nota'|'pct'|'text'}>} opts.columns
 * @param {Array<Record<string, unknown>>} opts.rows
 * @param {Array<{label:string, value?:number|null, pct?:number}>} [opts.chart]
 * @param {Array<{label:string, value:string}>} [opts.kpis]
 * @param {string} [opts.nombreArchivo]
 */
export function generarPdfReporteNotas(opts) {
  const {
    colegioNombre = '',
    titulo = 'Reporte de notas',
    anio,
    ciclo,
    columns = [],
    rows = [],
    chart = [],
    kpis = [],
    nombreArchivo
  } = opts;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 12;
  const innerW = pageW - margin * 2;
  const bottomSafe = 18;
  let y = margin;

  function newPageIf(need) {
    if (y + need > pageH - bottomSafe) {
      doc.addPage();
      y = margin;
    }
  }

  function drawHeader() {
    doc.setFillColor(...HEADER_BLUE);
    doc.rect(margin, y, innerW, 9, 'F');
    doc.setTextColor(...HEADER_TEXT);
    doc.setFontSize(10.5);
    doc.setFont('helvetica', 'bold');
    doc.text(safeTxt(titulo).toUpperCase(), margin + innerW / 2, y + 5.8, { align: 'center' });
    y += 9;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    let sub = safeTxt(colegioNombre);
    if (anio) sub += ` · Año ${anio}`;
    if (ciclo) sub += ` · ${ciclo}° bimestre`;
    const subLines = doc.splitTextToSize(sub, innerW - 4);
    doc.text(subLines, margin + innerW / 2, y + 4, { align: 'center' });
    doc.setTextColor(0, 0, 0);
    y += 4 + subLines.length * 3.6 + 3;
  }

  function drawKpis() {
    if (!kpis.length) return;
    newPageIf(14);
    const colW = innerW / Math.min(kpis.length, 4);
    doc.setFontSize(7);
    kpis.forEach((k, i) => {
      const x = margin + i * colW;
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text(safeTxt(k.label), x + 1, y + 3);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 41, 59);
      doc.setFontSize(9);
      doc.text(safeTxt(k.value), x + 1, y + 8);
    });
    doc.setFontSize(8);
    doc.setTextColor(0, 0, 0);
    y += 14;
  }

  function drawChart() {
    if (!chart.length) return;
    newPageIf(8 + chart.length * 5.5);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('Gráfico resumen', margin, y + 3);
    y += 6;
    const maxVal = Math.max(...chart.map((c) => (c.pct != null ? c.pct : c.value) || 0), 1);
    chart.slice(0, 18).forEach((item) => {
      newPageIf(6);
      const label = safeTxt(item.label);
      const val = item.value != null ? fmtNota(item.value) : '';
      const pct = item.pct != null ? item.pct : item.value != null ? (item.value / 20) * 100 : 0;
      const barW = ((pct || 0) / maxVal) * (innerW * 0.55);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.text(label.length > 32 ? `${label.slice(0, 30)}…` : label, margin, y + 3.2);
      doc.setFillColor(...BAR_FILL);
      doc.rect(margin + innerW * 0.38, y, Math.max(barW, 1), 4, 'F');
      doc.setTextColor(55, 65, 81);
      doc.text(`${val}${val && pct ? ` (${Math.round(pct)}%)` : pct ? ` ${Math.round(pct)}%` : ''}`, margin + innerW * 0.38 + barW + 2, y + 3.2);
      doc.setTextColor(0, 0, 0);
      y += 5.5;
    });
    y += 4;
  }

  function cellValue(row, col) {
    const raw = row[col.key];
    if (col.format === 'nota') return fmtNota(raw);
    if (col.format === 'pct') return fmtPct(raw);
    return safeTxt(raw ?? '—');
  }

  function drawTable() {
    if (!columns.length || !rows.length) return;
    const colWidths = columns.map((c) => (c.width || 1) / columns.reduce((s, x) => s + (x.width || 1), 0));
    const positioned = colWidths.map((frac, i) => ({
      ...columns[i],
      w: innerW * frac,
      x0: margin + colWidths.slice(0, i).reduce((s, f) => s + innerW * f, 0)
    }));

    function drawTableHead() {
      newPageIf(8);
      doc.setFillColor(...HEADER_BLUE);
      doc.rect(margin, y, innerW, 7, 'F');
      doc.setTextColor(...HEADER_TEXT);
      doc.setFontSize(6.2);
      doc.setFont('helvetica', 'bold');
      positioned.forEach((c) => {
        const align = c.align === 'left' ? 'left' : 'center';
        const tx = align === 'left' ? c.x0 + 1.5 : c.x0 + c.w / 2;
        doc.text(safeTxt(c.label), tx, y + 4.8, { align, maxWidth: c.w - 2 });
      });
      doc.setTextColor(0, 0, 0);
      y += 7;
    }

    drawTableHead();

    rows.forEach((row, ri) => {
      newPageIf(7);
      const rowH = 6.5;
      if (ri % 2 === 0) {
        doc.setFillColor(248, 250, 252);
        doc.rect(margin, y, innerW, rowH, 'F');
      }
      doc.setDrawColor(...BORDER);
      doc.setLineWidth(0.1);
      doc.rect(margin, y, innerW, rowH);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.8);
      positioned.forEach((c) => {
        const txt = cellValue(row, c);
        const align = c.align === 'left' ? 'left' : 'center';
        const tx = align === 'left' ? c.x0 + 1.5 : c.x0 + c.w / 2;
        const lines = doc.splitTextToSize(txt, c.w - 2).slice(0, 1);
        doc.text(lines[0] || '—', tx, y + 4.2, { align, maxWidth: c.w - 2 });
      });
      y += rowH;
    });
    y += 4;
  }

  drawHeader();
  drawKpis();
  drawChart();
  drawTable();

  const slug = safeTxt(titulo)
    .toLowerCase()
    .replace(/[^a-z0-9áéíóúñ]+/gi, '-')
    .replace(/^-|-$/g, '');
  const file =
    nombreArchivo ||
    `reporte-notas-${slug || 'informe'}-${anio || ''}${ciclo ? `-b${ciclo}` : ''}.pdf`;
  doc.save(file.endsWith('.pdf') ? file : `${file}.pdf`);
}
