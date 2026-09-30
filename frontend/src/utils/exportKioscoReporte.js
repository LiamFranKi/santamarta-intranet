import ExcelJS from 'exceljs';

const OSCURO = 'FF1C1410';
const NARANJA = 'FFC2410C';
const CREMA = 'FFFFF8F1';
const ARENA = 'FFF6EFE7';
const BLANCO = 'FFFFFFFF';
const SUAVE = 'FF7A6554';
const BORDE = { style: 'thin', color: { argb: 'FFE7D5C4' } };
const ESTADO_FILL = {
  Pagado: 'FFDCFCE7',
  Fiado: 'FFFFEDD5',
  'Pendiente de cobro': 'FFFEF3C7',
  Rechazado: 'FFFFE4E6',
  'Por atender': 'FFE0F2FE',
};
const ESTADO_TEXTO = {
  Pagado: 'FF166534',
  Fiado: 'FF9A3412',
  'Pendiente de cobro': 'FF92400E',
  Rechazado: 'FF9F1239',
  'Por atender': 'FF075985',
};

function borde(cell) {
  cell.border = { top: BORDE, left: BORDE, bottom: BORDE, right: BORDE };
}

function soles(valor) {
  return Number(valor) || 0;
}

function etiquetaPedido(p) {
  if (p.estado === 'pedido') return 'Por atender';
  if (p.estado === 'rechazado') return 'Rechazado';
  if (p.pago === 'fiado') return 'Fiado';
  if (p.pago === 'pagado') return 'Pagado';
  if (p.pago === 'pendiente') return 'Pendiente de cobro';
  return p.estado || '';
}

function fechaCorta(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso || '');
}

function pintar(cell, color, texto, bold) {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
  cell.font = { bold: !!bold, color: { argb: texto || OSCURO }, name: 'Calibri', size: 11 };
}

export async function exportarKioscoReporte({ desde, hasta, cierre, pedidos, productos, filtro }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Kiosco cafetín';
  wb.created = new Date();
  const cierreHoja = wb.addWorksheet('Cierre de caja', {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 1 },
    views: [{ showGridLines: false }],
  });
  const pedidosHoja = wb.addWorksheet('Pedidos', {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    views: [{ state: 'frozen', ySplit: 5, showGridLines: false }],
  });
  const productosHoja = wb.addWorksheet('Productos', {
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    views: [{ state: 'frozen', ySplit: 4, showGridLines: false }],
  });

  cierreHoja.columns = [
    { width: 34 }, { width: 14 }, { width: 16 }, { width: 3 }, { width: 22 }, { width: 52 },
  ];
  cierreHoja.mergeCells('A1:F1');
  const titulo = cierreHoja.getCell('A1');
  titulo.value = 'Kiosco cafetín  ·  Cierre de caja';
  pintar(titulo, OSCURO, BLANCO, true);
  titulo.font.size = 18;
  titulo.alignment = { vertical: 'middle', horizontal: 'left' };
  cierreHoja.getRow(1).height = 32;
  cierreHoja.mergeCells('A2:F2');
  const sub = cierreHoja.getCell('A2');
  sub.value = `Del ${fechaCorta(desde)} al ${fechaCorta(hasta)}${filtro && filtro !== 'Todos' ? `   ·   Lista: ${filtro}` : ''}`;
  pintar(sub, NARANJA, BLANCO, true);
  cierreHoja.getRow(2).height = 22;
  cierreHoja.mergeCells('A3:F3');
  cierreHoja.getCell('A3').value = 'Lo pagado entró a caja. Lo fiado sigue debiendo hasta que se pague. Lo rechazado no se vendió. El cierre suma todo el rango; la hoja Pedidos sigue el filtro.';
  cierreHoja.getCell('A3').font = { italic: true, color: { argb: SUAVE }, size: 10 };
  cierreHoja.getRow(3).height = 20;

  const filas = [
    ['Concepto', 'Pedidos', 'Soles'],
    ['Vendido (atendido)', cierre?.vendido?.n || 0, soles(cierre?.vendido?.total)],
    ['Pagado (entró a caja)', cierre?.pagado?.n || 0, soles(cierre?.pagado?.total)],
    ['Fiado (sigue debiendo)', cierre?.fiado?.n || 0, soles(cierre?.fiado?.total)],
    ['Pendiente de cobro', cierre?.pendiente?.n || 0, soles(cierre?.pendiente?.total)],
    ['Rechazado (no se vendió)', cierre?.rechazado?.n || 0, soles(cierre?.rechazado?.total)],
    ['Por atender', cierre?.espera?.n || 0, soles(cierre?.espera?.total)],
  ];
  filas.forEach((fila, i) => {
    const row = cierreHoja.getRow(5 + i);
    row.height = 22;
    fila.forEach((valor, col) => {
      const cell = row.getCell(col + 1);
      cell.value = valor;
      cell.alignment = { vertical: 'middle' };
      borde(cell);
      if (i === 0) pintar(cell, NARANJA, BLANCO, true);
      else if (i % 2 === 0) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CREMA } };
      if (i > 0 && col === 2) cell.numFmt = '"S/" #,##0.00';
      if (i === 2) {
        cell.font = { bold: true, color: { argb: 'FF9A3412' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF7ED' } };
      }
    });
  });

  const notas = [
    ['Cómo leerlo', ''],
    ['Pagado', 'Dinero que ya entró a caja.'],
    ['Fiado', 'Se atendió y todavía se debe. Si se paga, deja de sumar aquí.'],
    ['Rechazado', 'No se vendió y no entra al cierre cobrado.'],
  ];
  notas.forEach((fila, i) => {
    const row = cierreHoja.getRow(5 + i);
    fila.forEach((valor, col) => {
      const cell = row.getCell(col + 5);
      cell.value = valor;
      if (i === 0) pintar(cell, OSCURO, BLANCO, true);
      else cell.font = { color: { argb: OSCURO }, size: 10 };
    });
  });

  pedidosHoja.columns = [
    { key: 'fecha', width: 14 },
    { key: 'hora', width: 10 },
    { key: 'codigo', width: 12 },
    { key: 'cliente', width: 28 },
    { key: 'grado', width: 22 },
    { key: 'origen', width: 14 },
    { key: 'situacion', width: 22 },
    { key: 'total', width: 14 },
    { key: 'detalle', width: 46 },
  ];
  pedidosHoja.mergeCells('A1:I1');
  const t2 = pedidosHoja.getCell('A1');
  t2.value = 'Kiosco cafetín  ·  Pedidos';
  pintar(t2, OSCURO, BLANCO, true);
  t2.font.size = 16;
  pedidosHoja.getRow(1).height = 28;
  pedidosHoja.mergeCells('A2:I2');
  const s2 = pedidosHoja.getCell('A2');
  s2.value = `Del ${fechaCorta(desde)} al ${fechaCorta(hasta)}   ·   ${filtro || 'Todos'}`;
  pintar(s2, NARANJA, BLANCO, true);
  pedidosHoja.getRow(2).height = 20;
  pedidosHoja.getRow(3).height = 8;
  pedidosHoja.getRow(4).height = 8;
  const cab = pedidosHoja.getRow(5);
  cab.values = ['Fecha', 'Hora', 'Código', 'Cliente', 'Grado', 'Origen', 'Situación', 'Total', 'Detalle'];
  cab.height = 22;
  cab.eachCell((cell) => {
    pintar(cell, NARANJA, BLANCO, true);
    borde(cell);
    cell.alignment = { vertical: 'middle' };
  });
  let suma = 0;
  (pedidos || []).forEach((p, i) => {
    const situacion = etiquetaPedido(p);
    const row = pedidosHoja.addRow({
      fecha: fechaCorta(p.fecha),
      hora: p.hora || '',
      codigo: p.codigo || '',
      cliente: p.cliente || '',
      grado: p.grado || '',
      origen: p.origen || '',
      situacion,
      total: soles(p.total),
      detalle: p.detalle || '',
    });
    suma += soles(p.total);
    row.height = 20;
    row.getCell('total').numFmt = '"S/" #,##0.00';
    row.eachCell((cell, col) => {
      borde(cell);
      cell.alignment = { vertical: 'middle' };
      if (col === 7 && ESTADO_FILL[situacion]) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ESTADO_FILL[situacion] } };
        cell.font = { bold: true, color: { argb: ESTADO_TEXTO[situacion] } };
      } else if (i % 2 === 1) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CREMA } };
      }
    });
  });
  const pie = pedidosHoja.addRow({ cliente: `${(pedidos || []).length} pedidos`, situacion: 'Total del filtro', total: suma });
  pie.height = 22;
  pie.eachCell((cell) => {
    borde(cell);
    pintar(cell, OSCURO, BLANCO, true);
  });
  pie.getCell('total').numFmt = '"S/" #,##0.00';
  pedidosHoja.autoFilter = { from: 'A5', to: 'I5' };
  pedidosHoja.pageSetup.printTitlesRow = '1:5';

  productosHoja.columns = [
    { width: 36 }, { width: 16 }, { width: 18 }, { width: 28 },
  ];
  productosHoja.mergeCells('A1:D1');
  const t3 = productosHoja.getCell('A1');
  t3.value = 'Kiosco cafetín  ·  Productos';
  pintar(t3, OSCURO, BLANCO, true);
  t3.font.size = 16;
  productosHoja.getRow(1).height = 28;
  productosHoja.mergeCells('A2:D2');
  const s3 = productosHoja.getCell('A2');
  s3.value = `Del ${fechaCorta(desde)} al ${fechaCorta(hasta)}`;
  pintar(s3, NARANJA, BLANCO, true);
  const cabP = productosHoja.getRow(4);
  cabP.values = ['Producto', 'Vendidos', 'Soles vendidos', 'No vendidos (rechazados)'];
  cabP.height = 22;
  cabP.eachCell((cell) => {
    pintar(cell, OSCURO, BLANCO, true);
    borde(cell);
  });
  (productos || []).forEach((p, i) => {
    const row = productosHoja.addRow([p.nombre, Number(p.vendidos) || 0, soles(p.monto), Number(p.no_vendidos) || 0]);
    row.height = 20;
    row.getCell(3).numFmt = '"S/" #,##0.00';
    row.eachCell((cell) => {
      borde(cell);
      cell.alignment = { vertical: 'middle' };
      if (i % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ARENA } };
    });
  });
  productosHoja.autoFilter = { from: 'A4', to: 'D4' };
  productosHoja.views = [{ state: 'frozen', ySplit: 4, showGridLines: false }];

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `kiosco_${desde}_${hasta}.xlsx`;
  a.click();
  window.URL.revokeObjectURL(url);
}
