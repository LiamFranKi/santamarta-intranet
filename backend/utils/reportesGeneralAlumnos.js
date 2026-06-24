/**
 * Reporte «Reporte de alumnos» (Excel) — listado con antigüedad NUEVO / ANTIGUO.
 */
const ExcelJS = require('exceljs');
const { query } = require('./mysql');
const { sqlMatriculaEstadoSoloRegular } = require('./matriculaEstados');
const {
  columnExists,
} = require('./listaAlumnosMatriculadosReporte');

const FILL_CABECERA = 'FFC6EFCE';
const FILL_FILA_PAR = 'FFF5FBF5';
const FILL_RESUMEN = 'FFE8F5E9';
const BORDER_THIN = { style: 'thin', color: { argb: 'FF000000' } };

const ANTIGUEDAD_FILTROS = new Set(['todos', 'antiguos', 'nuevos']);

function etiquetaGradoGrupo(nivelNombre, grado) {
  const n = String(nivelNombre || '').toLowerCase();
  const g = grado != null && grado !== '' ? String(grado).trim() : '';
  if (!g) return '';
  if (n.includes('inicial')) return `${g} AÑOS`;
  return `${g}º`;
}

function buildEtiquetaGrupo(row) {
  const nivel = String(row.nivel_nombre || '').trim().toUpperCase();
  const gl = etiquetaGradoGrupo(row.nivel_nombre, row.grado);
  const sec = String(row.seccion || '').trim().toUpperCase();
  const left = [gl, sec].filter(Boolean).join(' ');
  return `${nivel} - ${left} - ${row.anio}`;
}

function nombreAlumnoExcel(row) {
  const ap = [row.apellido_paterno, row.apellido_materno]
    .filter((x) => x != null && String(x).trim())
    .join(' ')
    .trim()
    .toUpperCase();
  const nom = String(row.nombres || '').trim();
  if (ap && nom) return `${ap}, ${nom}`;
  if (ap) return ap;
  return nom || '—';
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

function normalizarFiltroAntiguedad(raw) {
  const v = String(raw || 'todos')
    .trim()
    .toLowerCase();
  if (v === 'antiguo' || v === 'antiguos') return 'antiguos';
  if (v === 'nuevo' || v === 'nuevos') return 'nuevos';
  return 'todos';
}

async function cargarAlumnosReporte(colegioId, anio, sedeId, filtroAntiguedad) {
  const hasSede = await columnExists('grupos', 'sede_id');
  const filtro = normalizarFiltroAntiguedad(filtroAntiguedad);

  let sql = `
    SELECT a.id AS alumno_id,
           a.apellido_paterno, a.apellido_materno, a.nombres,
           NULLIF(TRIM(a.nro_documento), '') AS dni,
           g.grado, g.seccion, g.anio,
           n.id AS nivel_id, n.nombre AS nivel_nombre,
           CASE
             WHEN EXISTS (
               SELECT 1
               FROM matriculas m_ant
               INNER JOIN grupos g_ant ON g_ant.id = m_ant.grupo_id AND g_ant.colegio_id = m_ant.colegio_id
               WHERE m_ant.alumno_id = a.id
                 AND m_ant.colegio_id = m.colegio_id
                 AND g_ant.anio < g.anio
             ) THEN 'ANTIGUO'
             ELSE 'NUEVO'
           END AS antiguedad
    FROM matriculas m
    INNER JOIN grupos g ON g.id = m.grupo_id AND g.colegio_id = m.colegio_id
    INNER JOIN niveles n ON n.id = g.nivel_id
    INNER JOIN alumnos a ON a.id = m.alumno_id AND a.colegio_id = m.colegio_id
    WHERE m.colegio_id = ? AND g.anio = ? AND ${sqlMatriculaEstadoSoloRegular('m')}`;

  const params = [colegioId, anio];

  if (hasSede && Number.isFinite(sedeId)) {
    sql += ' AND g.sede_id = ?';
    params.push(sedeId);
  }

  if (filtro === 'antiguos') {
    sql += `
      AND EXISTS (
        SELECT 1
        FROM matriculas m_ant
        INNER JOIN grupos g_ant ON g_ant.id = m_ant.grupo_id AND g_ant.colegio_id = m_ant.colegio_id
        WHERE m_ant.alumno_id = a.id
          AND m_ant.colegio_id = m.colegio_id
          AND g_ant.anio < g.anio
      )`;
  } else if (filtro === 'nuevos') {
    sql += `
      AND NOT EXISTS (
        SELECT 1
        FROM matriculas m_ant
        INNER JOIN grupos g_ant ON g_ant.id = m_ant.grupo_id AND g_ant.colegio_id = m_ant.colegio_id
        WHERE m_ant.alumno_id = a.id
          AND m_ant.colegio_id = m.colegio_id
          AND g_ant.anio < g.anio
      )`;
  }

  sql += `
    ORDER BY a.apellido_paterno ASC, a.apellido_materno ASC, a.nombres ASC`;

  const rows = await query(sql, params);
  return [...(rows || [])].sort(compararPorApellido);
}

function aplicarBordeFila(row, colCount) {
  for (let c = 1; c <= colCount; c += 1) {
    const cell = row.getCell(c);
    cell.border = {
      top: BORDER_THIN,
      left: BORDER_THIN,
      bottom: BORDER_THIN,
      right: BORDER_THIN,
    };
  }
}

function pintarFilaDatos(row, colCount, fillArgb, par = false) {
  for (let c = 1; c <= colCount; c += 1) {
    const cell = row.getCell(c);
    const fill = fillArgb || (par ? FILL_FILA_PAR : null);
    if (fill) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
    }
    cell.font = { size: 10 };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: c === 2 || c === 3 };
  }
  aplicarBordeFila(row, colCount);
}

function pintarFilaResumen(row, colCount, etiqueta, valor) {
  for (let c = 1; c <= colCount; c += 1) {
    const cell = row.getCell(c);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL_RESUMEN } };
    cell.font = { bold: c === 2, size: 10 };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  }
  aplicarBordeFila(row, colCount);
  row.getCell(2).value = etiqueta;
  row.getCell(5).value = valor;
}

async function construirDatosReporte(colegioId, filtros) {
  const anio = parseInt(filtros.anio, 10);
  const sedeId = filtros.sedeId != null ? parseInt(filtros.sedeId, 10) : null;
  const antiguedad = normalizarFiltroAntiguedad(filtros.antiguedad);

  if (!Number.isFinite(anio)) {
    return { ok: false, status: 400, error: 'Indique un año válido.' };
  }
  if (!ANTIGUEDAD_FILTROS.has(antiguedad)) {
    return { ok: false, status: 400, error: 'Filtro de antigüedad no válido.' };
  }

  const rows = await cargarAlumnosReporte(
    colegioId,
    anio,
    Number.isFinite(sedeId) ? sedeId : null,
    antiguedad
  );

  const filas = rows.map((row, idx) => ({
    numero: idx + 1,
    nombre: nombreAlumnoExcel(row),
    grupo: buildEtiquetaGrupo(row),
    dni: row.dni || '',
    antiguedad: row.antiguedad || 'NUEVO',
  }));

  const totalNuevos = filas.filter((f) => f.antiguedad === 'NUEVO').length;
  const totalAntiguos = filas.filter((f) => f.antiguedad === 'ANTIGUO').length;

  return {
    ok: true,
    anio,
    antiguedad,
    filas,
    total: filas.length,
    total_nuevos: totalNuevos,
    total_antiguos: totalAntiguos,
  };
}

async function generarExcelReporteAlumnos(colegioId, filtros) {
  const data = await construirDatosReporte(colegioId, filtros);
  if (!data.ok) return data;

  const { anio, filas, total, total_nuevos: totalNuevos, total_antiguos: totalAntiguos } = data;
  const colCount = 5;
  const lastCol = 'E';
  const cabecera = ['N°', 'Apellidos y Nombres', 'Grupo', 'DNI', 'ANTIGUEDAD'];

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Hoja1', { views: [{ showGridLines: true }] });

  ws.getColumn(1).width = 5;
  ws.getColumn(2).width = 44;
  ws.getColumn(3).width = 36;
  ws.getColumn(4).width = 12;
  ws.getColumn(5).width = 14;

  let r = 1;
  ws.mergeCells(`A${r}:${lastCol}${r}`);
  const titleCell = ws.getCell(`A${r}`);
  titleCell.value = `REPORTE DE ALUMNOS ${anio}`;
  titleCell.font = { bold: true, size: 13 };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(r).height = 24;
  r += 1;

  const headRow = ws.getRow(r);
  headRow.values = cabecera;
  for (let c = 1; c <= colCount; c += 1) {
    const cell = headRow.getCell(c);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL_CABECERA } };
    cell.font = { bold: true, size: 10 };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  }
  aplicarBordeFila(headRow, colCount);
  ws.getRow(r).height = 20;
  r += 1;

  for (let i = 0; i < filas.length; i += 1) {
    const alumno = filas[i];
    const row = ws.getRow(r);
    row.values = [alumno.numero, alumno.nombre, alumno.grupo, alumno.dni, alumno.antiguedad];
    pintarFilaDatos(row, colCount, null, i % 2 === 1);
    r += 1;
  }

  r += 1;
  const resumenFilas = [
    ['TOTAL ALUMNOS', total],
    ['TOTAL NUEVOS', totalNuevos],
    ['TOTAL ANTIGUOS', totalAntiguos],
  ];
  for (const [etiqueta, valor] of resumenFilas) {
    const resRow = ws.getRow(r);
    pintarFilaResumen(resRow, colCount, etiqueta, valor);
    ws.getRow(r).height = 18;
    r += 1;
  }

  const buffer = await wb.xlsx.writeBuffer();
  return {
    ok: true,
    buffer,
    filename: `reporte_alumnos_${anio}.xlsx`,
    anio,
    total: filas.length,
  };
}

module.exports = {
  construirDatosReporte,
  generarExcelReporteAlumnos,
  buildEtiquetaGrupo,
  normalizarFiltroAntiguedad,
};
