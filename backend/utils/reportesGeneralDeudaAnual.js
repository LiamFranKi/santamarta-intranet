/**
 * Reporte «Deuda Anual» (Excel) — saldo pendiente por matrícula y pensiones mensuales.
 */
const ExcelJS = require('exceljs');
const { query } = require('./mysql');
const { sqlMatriculaEstadoSoloRegular } = require('./matriculaEstados');
const { sqlFiltroAnioPago } = require('./pagoFechaHora');
const {
  columnExists,
} = require('./listaAlumnosMatriculadosReporte');
const { cargarConfigColegio } = require('./reportesGeneralDeudoresPagadores');

const ANIO_PAGO_SQL = sqlFiltroAnioPago('p');

const MESES_COL = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Setiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

const FILL_CABECERA = 'FFC6EFCE';
const FILL_FILA_PAR = 'FFF5FBF5';
const FILL_TOTAL_COL = 'FFFFF2CC';
const BORDER_THIN = { style: 'thin', color: { argb: 'FF000000' } };

function etiquetasMesesPension(totalPensiones, inicioPensiones) {
  const labels = [];
  for (let nro = 1; nro <= totalPensiones; nro += 1) {
    const idx = nro + inicioPensiones - 1;
    labels.push(idx >= 0 && idx < MESES_COL.length ? MESES_COL[idx] : `Mes ${nro}`);
  }
  return labels;
}

function tituloNivel(nombre) {
  const s = String(nombre || '').trim();
  if (!s) return '—';
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function celdaGrupo(row) {
  const nivel = tituloNivel(row.nivel_nombre);
  const grado = row.grado != null && row.grado !== '' ? String(row.grado).trim() : '—';
  const sec = String(row.seccion || '').trim().toUpperCase() || '—';
  return `${nivel} ${grado} ${sec}`;
}

function celdaAlumno(row) {
  const ap = String(row.apellido_paterno || '').trim().toUpperCase() || '—';
  const am = String(row.apellido_materno || '').trim().toUpperCase() || '—';
  const nom = String(row.nombres || '').trim().toUpperCase() || '—';
  return `${ap} ${am} ${nom}`;
}

function compararPorApellido(a, b) {
  const ap = String(a.apellido_paterno || '').localeCompare(String(b.apellido_paterno || ''), 'es', {
    sensitivity: 'base',
  });
  if (ap !== 0) return ap;
  const am = String(a.apellido_materno || '').localeCompare(String(b.apellido_materno || ''), 'es', {
    sensitivity: 'base',
  });
  if (am !== 0) return am;
  return String(a.nombres || '').localeCompare(String(b.nombres || ''), 'es', { sensitivity: 'base' });
}

function saldoPendiente(tarifa, pagado) {
  const t = parseFloat(tarifa) || 0;
  const p = parseFloat(pagado) || 0;
  const s = Math.round(Math.max(0, t - p) * 100) / 100;
  return s > 0.004 ? s : '-';
}

function sumaDeudas(celdas) {
  let sum = 0;
  for (const v of celdas) {
    if (typeof v === 'number' && Number.isFinite(v)) sum += v;
  }
  return Math.round(sum * 100) / 100;
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

async function cargarMatriculasDeudaAnual(colegioId, anio, sedeId) {
  const hasSede = await columnExists('grupos', 'sede_id');
  let sql = `
    SELECT m.id AS matricula_id, m.alumno_id,
           a.apellido_paterno, a.apellido_materno, a.nombres,
           g.grado, g.seccion, g.anio,
           n.id AS nivel_id, n.nombre AS nivel_nombre,
           COALESCE(c.matricula, 0) AS costo_matricula,
           COALESCE(c.pension, 0) AS costo_pension
    FROM matriculas m
    INNER JOIN grupos g ON g.id = m.grupo_id AND g.colegio_id = m.colegio_id
    INNER JOIN niveles n ON n.id = g.nivel_id
    INNER JOIN costos c ON c.id = m.costo_id
    INNER JOIN alumnos a ON a.id = m.alumno_id AND a.colegio_id = m.colegio_id
    WHERE m.colegio_id = ? AND g.anio = ? AND ${sqlMatriculaEstadoSoloRegular('m')}`;
  const params = [colegioId, anio];
  if (hasSede && Number.isFinite(sedeId)) {
    sql += ' AND g.sede_id = ?';
    params.push(sedeId);
  }
  sql += `
    ORDER BY a.apellido_paterno ASC, a.apellido_materno ASC, a.nombres ASC`;
  const rows = await query(sql, params);
  return [...(rows || [])].sort(compararPorApellido);
}

async function cargarPagosPorMatricula(colegioId, matriculaIds, totalPensiones, anio) {
  const map = {};
  if (!matriculaIds.length) return map;

  const ph = matriculaIds.map(() => '?').join(',');
  const detRows = await query(
    `SELECT p.matricula_id, p.tipo, COALESCE(p.nro_pago, 0) AS nro_pago,
            COALESCE(SUM(p.monto), 0) AS total
     FROM pagos p
     WHERE p.colegio_id = ? AND p.estado = 'ACTIVO' AND p.estado_pago = 'CANCELADO'
       AND p.matricula_id IN (${ph})
       AND (p.tipo = 0 OR (p.tipo = 1 AND p.nro_pago >= 1 AND p.nro_pago <= ? AND ${ANIO_PAGO_SQL}))
     GROUP BY p.matricula_id, p.tipo, p.nro_pago`,
    [colegioId, ...matriculaIds, totalPensiones, anio, anio]
  );

  for (const row of detRows || []) {
    const mid = row.matricula_id;
    if (!map[mid]) map[mid] = { matricula: 0, pensiones: {} };
    const t = parseInt(row.tipo, 10);
    const tot = parseFloat(row.total || 0);
    if (t === 0) map[mid].matricula = tot;
    else if (t === 1) {
      const np = parseInt(row.nro_pago, 10);
      if (np >= 1 && np <= totalPensiones) map[mid].pensiones[np] = tot;
    }
  }
  return map;
}

function filaDeudaAlumno(row, pagos, costoMat, costoPens, totalPensiones) {
  const pm = pagos || { matricula: 0, pensiones: {} };
  const celdaMatricula = saldoPendiente(costoMat, pm.matricula);
  const pensiones = [];
  for (let i = 1; i <= totalPensiones; i += 1) {
    pensiones.push(saldoPendiente(costoPens, pm.pensiones[i] || 0));
  }
  const conceptos = [celdaMatricula, ...pensiones];
  const total = sumaDeudas(conceptos);
  return {
    grupo: celdaGrupo(row),
    alumno: celdaAlumno(row),
    matricula: celdaMatricula,
    pensiones,
    total,
    conceptos,
  };
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

async function construirDatosDeudaAnual(colegioId, filtros) {
  const anio = parseInt(filtros.anio, 10);
  const sedeId = filtros.sedeId != null ? parseInt(filtros.sedeId, 10) : null;
  if (!Number.isFinite(anio)) {
    return { ok: false, status: 400, error: 'Indique un año válido.' };
  }

  const cfg = await cargarConfigColegio(colegioId);
  const mesesCols = etiquetasMesesPension(cfg.totalPensiones, cfg.inicioPensiones);
  const matRows = await cargarMatriculasDeudaAnual(
    colegioId,
    anio,
    Number.isFinite(sedeId) ? sedeId : null
  );

  const matIds = matRows.map((r) => r.matricula_id);
  const pagosMap = await cargarPagosPorMatricula(colegioId, matIds, cfg.totalPensiones, anio);

  const filas = matRows.map((row) => {
    const costoMat = parseFloat(row.costo_matricula) || 0;
    const costoPens = parseFloat(row.costo_pension) || 0;
    return filaDeudaAlumno(row, pagosMap[row.matricula_id], costoMat, costoPens, cfg.totalPensiones);
  });

  const totalGeneral = Math.round(filas.reduce((s, f) => s + (f.total || 0), 0) * 100) / 100;

  return {
    ok: true,
    anio,
    meses_columnas: mesesCols,
    total_pensiones: cfg.totalPensiones,
    filas,
    total_alumnos: filas.length,
    total_deuda_general: totalGeneral,
  };
}

async function generarExcelDeudaAnual(colegioId, filtros) {
  const data = await construirDatosDeudaAnual(colegioId, filtros);
  if (!data.ok) return data;

  const { anio, meses_columnas: mesesCols, filas } = data;
  const colCount = 2 + 1 + mesesCols.length + 1;
  const lastCol = colLetter(colCount);

  const cabecera = [
    'Grado y Seccion',
    'Nombres Completos',
    'Matrícula',
    ...mesesCols,
    'Total',
  ];

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Deuda Anual', { views: [{ showGridLines: true }] });

  ws.getColumn(1).width = 22;
  ws.getColumn(2).width = 40;
  ws.getColumn(3).width = 11;
  for (let c = 4; c < colCount; c += 1) ws.getColumn(c).width = 10;
  ws.getColumn(colCount).width = 11;

  let r = 1;
  ws.mergeCells(`A${r}:${lastCol}${r}`);
  const titleCell = ws.getCell(`A${r}`);
  titleCell.value = `REPORTE DE DEUDA X AÑO ${anio}`;
  titleCell.font = { bold: true, size: 13 };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(r).height = 24;
  r += 1;

  const headRow = ws.getRow(r);
  headRow.values = cabecera;
  for (let c = 1; c <= colCount; c += 1) {
    const cell = headRow.getCell(c);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL_CABECERA } };
    cell.font = { bold: true, size: 9 };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  }
  aplicarBordeFila(headRow, colCount);
  ws.getRow(r).height = 28;
  r += 1;

  for (let i = 0; i < filas.length; i += 1) {
    const f = filas[i];
    const row = ws.getRow(r);
    row.values = [f.grupo, f.alumno, f.matricula, ...f.pensiones, f.total];

    for (let c = 1; c <= colCount; c += 1) {
      const cell = row.getCell(c);
      if (i % 2 === 1) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL_FILA_PAR } };
      }
      cell.font = { size: 9 };
      if (c <= 2) {
        cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: false };
      } else {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      }
      if (c === colCount) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL_TOTAL_COL } };
        cell.font = { bold: true, size: 9 };
      }
    }
    aplicarBordeFila(row, colCount);
    r += 1;
  }

  if (filas.length > 0) {
    const totRow = ws.getRow(r);
    const granTotal = Math.round(filas.reduce((s, f) => s + f.total, 0) * 100) / 100;
    const totValues = Array.from({ length: colCount }, () => '');
    totValues[0] = 'TOTAL GENERAL';
    totValues[colCount - 1] = granTotal;
    totRow.values = totValues;
    for (let c = 1; c <= colCount; c += 1) {
      const cell = totRow.getCell(c);
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL_CABECERA } };
      cell.font = { bold: true, size: 9 };
      cell.alignment = {
        vertical: 'middle',
        horizontal: c <= 2 ? 'left' : 'center',
      };
    }
    aplicarBordeFila(totRow, colCount);
  }

  const buffer = await wb.xlsx.writeBuffer();
  return {
    ok: true,
    buffer,
    filename: `reporte_deuda_${anio}.xlsx`,
    anio,
    total_alumnos: filas.length,
  };
}

module.exports = {
  construirDatosDeudaAnual,
  generarExcelDeudaAnual,
  etiquetasMesesPension,
  saldoPendiente,
};
