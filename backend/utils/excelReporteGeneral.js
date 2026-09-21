const { getAnioActivo } = require('./mysql');

const FILL_TITULO = 'FF1E3A8A';
const FILL_SUB = 'FFDBEAFE';
const FILL_CABECERA = 'FF1E40AF';
const FILL_KPI_LABEL = 'FFEFF6FF';
const FILL_KPI_VAL = 'FFFFFFFF';
const FILL_FILA_PAR = 'FFF8FAFC';
const FILL_FILA_IMPAR = 'FFFFFFFF';
const BORDER_THIN = { style: 'thin', color: { argb: 'FFCBD5E1' } };

async function resolverAnioTrabajo(colegioId, raw) {
  const n = parseInt(raw, 10);
  if (Number.isFinite(n) && n >= 2000) return n;
  const calendario = new Date().getFullYear();
  try {
    const activo = parseInt(await getAnioActivo(colegioId), 10);
    if (Number.isFinite(activo) && activo >= 2000) {
      // Si el colegio no actualizó anio_activo, no devolver un año ya cerrado.
      return Math.max(activo, calendario);
    }
  } catch {
    /* año calendario */
  }
  return calendario;
}

function bordeCelda(cell) {
  cell.border = {
    top: BORDER_THIN,
    left: BORDER_THIN,
    bottom: BORDER_THIN,
    right: BORDER_THIN,
  };
}

function aplicarBordeFila(row, colCount) {
  for (let c = 1; c <= colCount; c += 1) bordeCelda(row.getCell(c));
}

function escribirTitulo(ws, { cols, titulo, subtitulo, fila = 1 }) {
  let r = fila;
  ws.mergeCells(r, 1, r, cols);
  const t = ws.getCell(r, 1);
  t.value = titulo;
  t.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' }, name: 'Calibri' };
  t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL_TITULO } };
  t.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(r).height = 24;
  r += 1;
  if (subtitulo) {
    ws.mergeCells(r, 1, r, cols);
    const s = ws.getCell(r, 1);
    s.value = subtitulo;
    s.font = { italic: true, size: 10, color: { argb: 'FF1E3A8A' }, name: 'Calibri' };
    s.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL_SUB } };
    s.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(r).height = 18;
    r += 1;
  }
  return r + 1;
}

function escribirKpisFila(ws, { startRow, pares, cols }) {
  const n = pares.length;
  const rLabel = startRow;
  const rVal = startRow + 1;
  for (let i = 0; i < n; i += 1) {
    const c = i + 1;
    const lab = ws.getCell(rLabel, c);
    lab.value = pares[i][0];
    lab.font = { bold: true, size: 8, color: { argb: 'FF334155' }, name: 'Calibri' };
    lab.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL_KPI_LABEL } };
    lab.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    bordeCelda(lab);
    const val = ws.getCell(rVal, c);
    val.value = pares[i][1] == null || pares[i][1] === '' ? '—' : pares[i][1];
    val.font = { bold: true, size: 12, color: { argb: 'FF1E3A8A' }, name: 'Calibri' };
    val.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL_KPI_VAL } };
    val.alignment = { horizontal: 'center', vertical: 'middle' };
    bordeCelda(val);
  }
  ws.getRow(rLabel).height = 18;
  ws.getRow(rVal).height = 20;
  if (cols > n) {
    /* hueco visual */
  }
  return startRow + 3;
}

function escribirCabecera(row, labels) {
  row.values = labels;
  row.height = 20;
  labels.forEach((_, i) => {
    const cell = row.getCell(i + 1);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL_CABECERA } };
    cell.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' }, name: 'Calibri' };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    bordeCelda(cell);
  });
}

function estiloCuerpo(cell, { fill, align = 'center', wrap = false, bold = false, color } = {}) {
  cell.font = {
    size: 9,
    name: 'Calibri',
    bold,
    color: color ? { argb: color } : { argb: 'FF0F172A' },
  };
  cell.alignment = { vertical: 'middle', horizontal: align, wrapText: wrap };
  if (fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
  bordeCelda(cell);
}

function finalizarHoja(ws, { headerRow, cols, lastRow }) {
  if (lastRow > headerRow) {
    ws.autoFilter = {
      from: { row: headerRow, column: 1 },
      to: { row: lastRow, column: cols },
    };
  }
  ws.views = [{ state: 'frozen', ySplit: headerRow, showGridLines: false }];
  ws.pageSetup = {
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    paperSize: 9,
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
  };
}

module.exports = {
  FILL_TITULO,
  FILL_CABECERA,
  FILL_FILA_PAR,
  FILL_FILA_IMPAR,
  resolverAnioTrabajo,
  aplicarBordeFila,
  escribirTitulo,
  escribirKpisFila,
  escribirCabecera,
  estiloCuerpo,
  finalizarHoja,
};
