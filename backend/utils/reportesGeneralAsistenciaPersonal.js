/**
 * Reporte «Asistencia del Personal» — matriz por rango de fechas (modal + Excel).
 */
const ExcelJS = require('exceljs');
const { query } = require('./mysql');
const {
  loadPersonalColegio,
  calcTardanza,
  DESCUENTO_POR_MINUTO,
  formatHoraDisplay,
  nombrePersonal,
  getAnioActivo,
} = require('./adminTardanzasHuellero');

const FILL_TITULO = 'FFE8A5A5';
const FILL_CABECERA = 'FFF5C6CB';
const FILL_FILA_PAR = 'FFFDF2F2';
const BORDER_THIN = { style: 'thin', color: { argb: 'FF000000' } };
const MAX_DIAS_RANGO = 31;

function validarFechaISO(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '').trim());
}

function fechasEnRango(desde, hasta) {
  const out = [];
  const cur = new Date(`${desde}T12:00:00`);
  const end = new Date(`${hasta}T12:00:00`);
  while (cur <= end) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

function etiquetaMesRango(fechas) {
  if (!fechas.length) return '';
  const [y, m] = fechas[0].split('-');
  const meses = [
    'ENERO',
    'FEBRERO',
    'MARZO',
    'ABRIL',
    'MAYO',
    'JUNIO',
    'JULIO',
    'AGOSTO',
    'SETIEMBRE',
    'OCTUBRE',
    'NOVIEMBRE',
    'DICIEMBRE',
  ];
  const idx = parseInt(m, 10) - 1;
  const todasMismoMes = fechas.every((f) => f.slice(0, 7) === `${y}-${m}`);
  if (!todasMismoMes) return `RANGO ${fechas[0]} — ${fechas[fechas.length - 1]}`;
  return `MES ${meses[idx] || m} ${y}`;
}

function fmtSoles(n) {
  const v = Math.round((parseFloat(n) || 0) * 100) / 100;
  return `S/. ${v.toFixed(2)}`;
}

function colLetter(n) {
  let s = '';
  let num = n;
  while (num > 0) {
    const mod = (num - 1) % 26;
    s = String.fromCharCode(65 + mod) + s;
    num = Math.floor((num - 1) / 26);
  }
  return s;
}

function aplicarBordeFila(row, colCount) {
  for (let c = 1; c <= colCount; c += 1) {
    row.getCell(c).border = {
      top: BORDER_THIN,
      left: BORDER_THIN,
      bottom: BORDER_THIN,
      right: BORDER_THIN,
    };
  }
}

async function cargarMarcacionesRango(colegioId, desde, hasta) {
  const rows = await query(
    `SELECT ar.fecha, ar.hora_entrada AS hora_marcacion, u.personal_id
     FROM asistencia_registros ar
     INNER JOIN usuarios u ON u.id = ar.usuario_id AND u.colegio_id = ar.colegio_id
     WHERE ar.colegio_id = ?
       AND ar.fecha >= ? AND ar.fecha <= ?
       AND ar.hora_entrada IS NOT NULL
       AND u.personal_id > 0
       AND (ar.tipo_registro = 'ENTRADA' OR ar.tipo_registro = 'ENTRADA_SALIDA')
     ORDER BY ar.fecha ASC, ar.hora_entrada ASC`,
    [colegioId, desde, hasta]
  );

  const map = {};
  for (const row of rows || []) {
    const pid = row.personal_id;
    const fecha =
      row.fecha instanceof Date
        ? row.fecha.toISOString().slice(0, 10)
        : String(row.fecha).slice(0, 10);
    const key = `${pid}:${fecha}`;
    if (!map[key]) {
      map[key] = row.hora_marcacion;
    }
  }
  return map;
}

function construirFilasReporte(personalList, fechas, marcMap) {
  return (personalList || []).map((p, idx) => {
    const horaIngreso = p.hora_entrada;
    const horaIngresoFmt = formatHoraDisplay(horaIngreso);
    const dias = {};
    let totalMinutos = 0;
    let totalDescuento = 0;

    for (const fecha of fechas) {
      const horaMarc = marcMap[`${p.personal_id}:${fecha}`];
      const horaMarcFmt = horaMarc ? formatHoraDisplay(horaMarc) : '';
      const { minutos_tardanza: minT, descuento: desc } = horaMarc
        ? calcTardanza(horaIngreso, horaMarc)
        : { minutos_tardanza: 0, descuento: 0 };
      dias[fecha] = {
        hora_marcacion: horaMarcFmt,
        minutos_tardanza: minT,
        descuento: desc,
      };
      totalMinutos += minT;
      totalDescuento += desc;
    }

    totalDescuento = Math.round(totalDescuento * 100) / 100;

    return {
      numero: idx + 1,
      personal_id: p.personal_id,
      nombre: nombrePersonal(p),
      hora_ingreso: horaIngresoFmt,
      hora_ingreso_raw: horaIngreso,
      dias,
      minutos_total: totalMinutos,
      descuento_total: totalDescuento,
      descuento_total_fmt: fmtSoles(totalDescuento),
    };
  });
}

async function construirDatosAsistenciaPersonal(colegioId, filtros) {
  const desde = String(filtros.desde || '').trim();
  const hasta = String(filtros.hasta || '').trim();

  if (!validarFechaISO(desde) || !validarFechaISO(hasta)) {
    return { ok: false, status: 400, error: 'Indique fechas válidas (desde y hasta).' };
  }
  if (desde > hasta) {
    return { ok: false, status: 400, error: 'La fecha «desde» no puede ser posterior a «hasta».' };
  }

  const fechas = fechasEnRango(desde, hasta);
  if (fechas.length === 0) {
    return { ok: false, status: 400, error: 'El rango de fechas no es válido.' };
  }
  if (fechas.length > MAX_DIAS_RANGO) {
    return {
      ok: false,
      status: 400,
      error: `El rango no puede superar ${MAX_DIAS_RANGO} días. Acorte el período.`,
    };
  }

  const { colegio_nombre: colegioNombre } = await getAnioActivo(query, colegioId);
  const personalList = await loadPersonalColegio(query, colegioId);
  const marcMap = await cargarMarcacionesRango(colegioId, desde, hasta);
  const filas = construirFilasReporte(personalList, fechas, marcMap);

  const totalMinutos = filas.reduce((s, f) => s + (f.minutos_total || 0), 0);
  const totalDescuento = Math.round(filas.reduce((s, f) => s + (f.descuento_total || 0), 0) * 100) / 100;

  return {
    ok: true,
    titulo: `RESULTADOS FINALES - DESCUENTOS del ${desde} al ${hasta}`,
    subtitulo: etiquetaMesRango(fechas),
    desde,
    hasta,
    fechas,
    colegio_nombre: colegioNombre,
    tarifa_por_minuto: DESCUENTO_POR_MINUTO,
    filas,
    total_personal: filas.length,
    total_minutos: totalMinutos,
    total_descuento: totalDescuento,
    total_descuento_fmt: fmtSoles(totalDescuento),
  };
}

async function generarExcelAsistenciaPersonal(colegioId, filtros) {
  const data = await construirDatosAsistenciaPersonal(colegioId, filtros);
  if (!data.ok) return data;

  const { titulo, fechas, filas, desde, hasta } = data;
  const colCount = 3 + fechas.length + 2;
  const colMinutos = 3 + fechas.length + 1;
  const colDescuento = colCount;
  const lastCol = colLetter(colCount);

  const wb = new ExcelJS.Workbook();

  const ws = wb.addWorksheet('RESULTADOS', { views: [{ showGridLines: true }] });

  ws.getColumn(1).width = 5;
  ws.getColumn(2).width = 34;
  ws.getColumn(3).width = 14;
  for (let i = 0; i < fechas.length; i += 1) {
    ws.getColumn(4 + i).width = 11;
  }
  ws.getColumn(colMinutos).width = 10;
  ws.getColumn(colDescuento).width = 12;

  let r = 1;
  ws.mergeCells(`A${r}:${lastCol}${r}`);
  const titleCell = ws.getCell(`A${r}`);
  titleCell.value = titulo;
  titleCell.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL_TITULO } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(r).height = 22;
  r += 2;

  const mesLabel = data.subtitulo || '';
  if (mesLabel) {
    const diaStartCol = 4;
    const diaEndCol = 3 + fechas.length;
    if (fechas.length > 0) {
      ws.mergeCells(`${colLetter(diaStartCol)}${r}:${colLetter(diaEndCol)}${r}`);
      const mesCell = ws.getCell(`${colLetter(diaStartCol)}${r}`);
      mesCell.value = mesLabel;
      mesCell.font = { bold: true, size: 9 };
      mesCell.alignment = { horizontal: 'center', vertical: 'middle' };
      mesCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL_CABECERA } };
    }
    ws.mergeCells(`${colLetter(colMinutos)}${r}:${lastCol}${r}`);
    const totCell = ws.getCell(`${colLetter(colMinutos)}${r}`);
    totCell.value = 'TOTALES';
    totCell.font = { bold: true, size: 9 };
    totCell.alignment = { horizontal: 'center', vertical: 'middle' };
    totCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL_CABECERA } };
    r += 1;
  }

  const cabecera = [
    'N°',
    'NOMBRE TRABAJADOR',
    'HORA INGRESO',
    ...fechas,
    'MINUTOS',
    'DESCUENTO',
  ];
  const headRow = ws.getRow(r);
  headRow.values = cabecera;
  for (let c = 1; c <= colCount; c += 1) {
    const cell = headRow.getCell(c);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL_CABECERA } };
    cell.font = { bold: true, size: 9 };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  }
  aplicarBordeFila(headRow, colCount);
  ws.getRow(r).height = 20;
  r += 1;

  for (let i = 0; i < filas.length; i += 1) {
    const f = filas[i];
    const row = ws.getRow(r);
    const vals = [
      f.numero,
      f.nombre,
      f.hora_ingreso,
      ...fechas.map((fecha) => f.dias[fecha]?.hora_marcacion || ''),
      f.minutos_total,
      f.descuento_total_fmt,
    ];
    row.values = vals;
    for (let c = 1; c <= colCount; c += 1) {
      const cell = row.getCell(c);
      if (i % 2 === 1) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL_FILA_PAR } };
      }
      cell.font = { size: 9 };
      cell.alignment = {
        vertical: 'middle',
        horizontal: c === 2 ? 'left' : 'center',
        wrapText: c === 2,
      };
    }
    aplicarBordeFila(row, colCount);
    r += 1;
  }

  for (const fecha of fechas) {
    const sheetName = fecha.slice(0, 10);
    const wsDia = wb.addWorksheet(sheetName, { views: [{ showGridLines: true }] });
    wsDia.getColumn(1).width = 5;
    wsDia.getColumn(2).width = 34;
    wsDia.getColumn(3).width = 14;
    wsDia.getColumn(4).width = 14;
    wsDia.getColumn(5).width = 10;
    wsDia.getColumn(6).width = 12;

    let rd = 1;
    wsDia.mergeCells(`A${rd}:F${rd}`);
    const tCell = wsDia.getCell(`A${rd}`);
    tCell.value = `ASISTENCIA PERSONAL — ${fecha}`;
    tCell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
    tCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL_TITULO } };
    tCell.alignment = { horizontal: 'center', vertical: 'middle' };
    rd += 1;

    const headDia = wsDia.getRow(rd);
    headDia.values = ['N°', 'NOMBRE TRABAJADOR', 'HORA INGRESO', 'HORA MARCACIÓN', 'MINUTOS', 'DESCUENTO'];
    for (let c = 1; c <= 6; c += 1) {
      const cell = headDia.getCell(c);
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL_CABECERA } };
      cell.font = { bold: true, size: 9 };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    }
    aplicarBordeFila(headDia, 6);
    rd += 1;

    filas.forEach((f, idx) => {
      const d = f.dias[fecha] || {};
      const rowD = wsDia.getRow(rd);
      rowD.values = [
        f.numero,
        f.nombre,
        f.hora_ingreso,
        d.hora_marcacion || '',
        d.minutos_tardanza ?? 0,
        fmtSoles(d.descuento ?? 0),
      ];
      for (let c = 1; c <= 6; c += 1) {
        const cell = rowD.getCell(c);
        if (idx % 2 === 1) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL_FILA_PAR } };
        }
        cell.font = { size: 9 };
        cell.alignment = { vertical: 'middle', horizontal: c === 2 ? 'left' : 'center' };
      }
      aplicarBordeFila(rowD, 6);
      rd += 1;
    });
  }

  const buffer = await wb.xlsx.writeBuffer();
  return {
    ok: true,
    buffer,
    filename: `asistencia_personal_${desde}_${hasta}.xlsx`,
  };
}

module.exports = {
  construirDatosAsistenciaPersonal,
  generarExcelAsistenciaPersonal,
  fechasEnRango,
  MAX_DIAS_RANGO,
};
