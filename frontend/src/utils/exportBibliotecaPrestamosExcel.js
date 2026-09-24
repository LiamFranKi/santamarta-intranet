import ExcelJS from 'exceljs';

const FILL_TITULO = 'FF0F766E';
const FILL_SUB = 'FFCCFBF1';
const FILL_CABECERA = 'FF115E59';
const FILL_KPI_LABEL = 'FFECFDF5';
const FILL_KPI_VAL = 'FFFFFFFF';
const FILL_PAR = 'FFF0FDFA';
const FILL_IMPAR = 'FFFFFFFF';
const FILL_VENCIDO = 'FFFFEDD5';
const FILL_PIE = 'FFF1F5F9';
const BORDER = { style: 'thin', color: { argb: 'FF99F6E4' } };

const ESTADO_LABEL = {
  SEPARADO: 'Separado',
  PRESTADO: 'Prestado',
  DEVUELTO: 'Devuelto',
  CANCELADO: 'Cancelado',
  NO_RECOGIDO: 'No recogido',
};

const ESTADO_FILL = {
  SEPARADO: 'FFFEF3C7',
  PRESTADO: 'FFCCFBF1',
  DEVUELTO: 'FFDCFCE7',
  CANCELADO: 'FFE2E8F0',
  NO_RECOGIDO: 'FFFEE2E2',
};

const ESTADO_COLOR = {
  SEPARADO: 'FF92400E',
  PRESTADO: 'FF115E59',
  DEVUELTO: 'FF166534',
  CANCELADO: 'FF334155',
  NO_RECOGIDO: 'FF9F1239',
};

const COLS = 12;

function borde(cell) {
  cell.border = { top: BORDER, left: BORDER, bottom: BORDER, right: BORDER };
}

function ymd(val) {
  if (!val) return '';
  if (val instanceof Date && !Number.isNaN(val.getTime())) {
    return val.toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
  }
  return String(val).slice(0, 10);
}

function fmtFecha(val) {
  const s = ymd(val);
  if (!s) return '—';
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
}

function hoyYmd() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
}

function situacion(mov) {
  if (mov.estado === 'DEVUELTO') return 'Devuelto';
  if (mov.estado !== 'PRESTADO') return '—';
  const vence = ymd(mov.fecha_vencimiento);
  if (vence && vence < hoyYmd()) return 'Vencido';
  if (vence === hoyYmd()) return 'Vence hoy';
  return 'En plazo';
}

function descargarBuffer(buffer, filename) {
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  a.click();
  window.URL.revokeObjectURL(url);
}

/**
 * Excel profesional de préstamos / reservas de biblioteca.
 */
export async function exportarBibliotecaPrestamosExcel({
  movimientos = [],
  colegioNombre = 'Vanguard Schools',
  filtrosTexto = '',
} = {}) {
  const lista = Array.isArray(movimientos) ? movimientos : [];
  const hoy = hoyYmd();
  const kpis = {
    total: lista.length,
    prestados: lista.filter((m) => m.estado === 'PRESTADO').length,
    vencidos: lista.filter((m) => m.estado === 'PRESTADO' && ymd(m.fecha_vencimiento) && ymd(m.fecha_vencimiento) < hoy).length,
    separados: lista.filter((m) => m.estado === 'SEPARADO').length,
    devueltos: lista.filter((m) => m.estado === 'DEVUELTO').length,
  };

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Intranet Vanguard · Biblioteca';
  wb.created = new Date();
  const ws = wb.addWorksheet('Préstamos', {
    views: [{ showGridLines: false }],
    properties: { defaultRowHeight: 18 },
  });
  ws.columns = [
    { width: 6 },
    { width: 34 },
    { width: 24 },
    { width: 14 },
    { width: 30 },
    { width: 14 },
    { width: 12 },
    { width: 13 },
    { width: 13 },
    { width: 13 },
    { width: 8 },
    { width: 13 },
  ];

  ws.mergeCells(1, 1, 1, COLS);
  const title = ws.getCell(1, 1);
  title.value = 'BIBLIOTECA — LISTADO DE PRÉSTAMOS';
  title.font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' }, name: 'Calibri' };
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL_TITULO } };
  title.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 28;

  ws.mergeCells(2, 1, 2, COLS);
  const sub = ws.getCell(2, 1);
  const generado = new Date().toLocaleString('es-PE', { timeZone: 'America/Lima' });
  sub.value = [colegioNombre, filtrosTexto, `Generado: ${generado}`].filter(Boolean).join('  ·  ');
  sub.font = { italic: true, size: 10, color: { argb: 'FF115E59' }, name: 'Calibri' };
  sub.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL_SUB } };
  sub.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(2).height = 20;

  const pares = [
    ['Total', kpis.total],
    ['Prestados', kpis.prestados],
    ['Vencidos', kpis.vencidos],
    ['Separados', kpis.separados],
    ['Devueltos', kpis.devueltos],
  ];
  pares.forEach(([label, value], i) => {
    const c = i + 1;
    const lab = ws.getCell(4, c);
    lab.value = label;
    lab.font = { bold: true, size: 8, color: { argb: 'FF334155' }, name: 'Calibri' };
    lab.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL_KPI_LABEL } };
    lab.alignment = { horizontal: 'center', vertical: 'middle' };
    borde(lab);
    const val = ws.getCell(5, c);
    val.value = value;
    val.font = { bold: true, size: 14, color: { argb: i === 2 && value > 0 ? 'FFC2410C' : 'FF0F766E' }, name: 'Calibri' };
    val.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL_KPI_VAL } };
    val.alignment = { horizontal: 'center', vertical: 'middle' };
    borde(val);
  });
  ws.getRow(4).height = 16;
  ws.getRow(5).height = 22;

  const headerRow = 7;
  const headers = [
    'N°',
    'Libro',
    'Autor',
    'Ejemplar',
    'Persona',
    'Estado',
    'Canal',
    'Prestado',
    'Vence',
    'Devuelto',
    'Días',
    'Situación',
  ];
  const head = ws.getRow(headerRow);
  head.values = headers;
  head.height = 22;
  headers.forEach((_, i) => {
    const cell = head.getCell(i + 1);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL_CABECERA } };
    cell.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' }, name: 'Calibri' };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    borde(cell);
  });

  lista.forEach((m, idx) => {
    const r = headerRow + 1 + idx;
    const row = ws.getRow(r);
    const sit = situacion(m);
    const vencido = sit === 'Vencido' || sit === 'Vence hoy';
    row.values = [
      idx + 1,
      m.libro_titulo || '—',
      m.libro_autor || '—',
      m.ejemplar_codigo || '—',
      m.persona || '—',
      ESTADO_LABEL[m.estado] || m.estado || '—',
      m.canal === 'VIRTUAL' ? 'Virtual' : 'Presencial',
      fmtFecha(m.fecha_prestamo),
      fmtFecha(m.fecha_vencimiento),
      fmtFecha(m.fecha_devolucion),
      m.dias_prestamo || '—',
      sit,
    ];
    row.height = 20;
    const baseFill = vencido ? FILL_VENCIDO : idx % 2 === 1 ? FILL_PAR : FILL_IMPAR;
    for (let c = 1; c <= COLS; c += 1) {
      const cell = row.getCell(c);
      cell.font = { size: 9, name: 'Calibri', color: { argb: 'FF0F172A' } };
      cell.alignment = {
        vertical: 'middle',
        horizontal: c === 2 || c === 3 || c === 5 ? 'left' : 'center',
        wrapText: c === 2 || c === 5,
      };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: baseFill } };
      borde(cell);
    }
    const est = row.getCell(6);
    est.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ESTADO_FILL[m.estado] || baseFill } };
    est.font = { bold: true, size: 9, name: 'Calibri', color: { argb: ESTADO_COLOR[m.estado] || 'FF0F172A' } };
    const sitCell = row.getCell(12);
    if (vencido) {
      sitCell.font = { bold: true, size: 9, name: 'Calibri', color: { argb: 'FFC2410C' } };
    } else if (sit === 'En plazo') {
      sitCell.font = { bold: true, size: 9, name: 'Calibri', color: { argb: 'FF0F766E' } };
    }
  });

  const lastData = headerRow + lista.length;
  const pie = lastData + 2;
  ws.mergeCells(pie, 1, pie, COLS);
  const pieCell = ws.getCell(pie, 1);
  pieCell.value = `Intranet Vanguard · Biblioteca escolar  ·  ${lista.length} registro${lista.length === 1 ? '' : 's'}  ·  ${generado}`;
  pieCell.font = { italic: true, size: 8, color: { argb: 'FF64748B' }, name: 'Calibri' };
  pieCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL_PIE } };
  pieCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(pie).height = 16;

  if (lista.length) {
    ws.autoFilter = {
      from: { row: headerRow, column: 1 },
      to: { row: lastData, column: COLS },
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
  ws.headerFooter = {
    oddHeader: '&C&BBiblioteca — Listado de préstamos',
    oddFooter: '&LIntranet Vanguard&C&P / &N&R&D',
  };

  const buffer = await wb.xlsx.writeBuffer();
  descargarBuffer(buffer, `biblioteca-prestamos-${hoy}.xlsx`);
}

export { ESTADO_LABEL };
