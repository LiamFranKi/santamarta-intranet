/**
 * Reporte «Consolidado de Promedios Detallados» — Excel directo (criterios/indicadores + PROM por curso).
 */
const ExcelJS = require('exceljs');
const { query } = require('./mysql');
const {
  resolverFiltrosConsolidado,
  listarGruposConsolidado,
  cargarAlumnosGrupo,
  cargarAsignaturasGrupo,
  cargarIndicadoresAsignatura,
  cargarCriteriosAsignatura,
  cargarIndicadoresPorCriterio,
  cargarNotasDetalleGrupo,
  mapDetallePorMatriculaAsig,
  mapExplicacionIndicador,
  mapPromedios,
  esNivelInicial,
  tabLabelGrupo,
  subtituloGrupo,
  nombreAlumnoLista,
  fmtNotaNumerica,
  parseNumPromedio,
  colLetter,
  aplicarBordeFila,
  notaIndicadorDesdeDetalle,
  promedioNumericoCriterio,
  aplanarColumnasBloques,
} = require('./reportesGeneralConsolidadoPromedios');
const {
  cargarLibretaInicialGrupo,
  bloquesDesdeLibretaInicial,
  notaLibretaInicial,
} = require('./libretaInicialGrupoReporte');

const FILL_TITULO = 'FF1E40AF';
const FILL_CABECERA_FIJA = 'FFB4C7E7';
const FILL_CABECERA_CURSOS = 'FFFFF2CC';
const FILL_CABECERA_PROM = 'FFFFB366';
const FILL_FILA_PAR = 'FFF8FAFC';
const FILL_FILA_PROM = 'FFFFE0B2';
const NOTA_MINIMA_ROJA = 11;

function aplanarColumnas(bloques) {
  return aplanarColumnasBloques(bloques);
}

async function construirBloquesCursoNumerico(colegioId, asignaturas, ciclo) {
  const bloques = [];
  for (const asig of asignaturas) {
    const criterios = await cargarCriteriosAsignatura(colegioId, asig.asignatura_id, ciclo);
    const criterioIds = (criterios || []).map((c) => c.id);
    const indPorCriterio = await cargarIndicadoresPorCriterio(criterioIds);

    const columnas = (criterios || []).map((crit, idx) => {
      const descripcion = String(crit.descripcion || '').trim();
      const abrev = String(crit.abreviatura || '').trim();
      return {
        key: `crit_${crit.id}`,
        label: abrev || `C${idx + 1}`,
        titulo: descripcion || `Criterio ${crit.id}`,
        criterio_id: crit.id,
        indicador_ids: indPorCriterio[crit.id] || [],
        tipo: 'criterio',
      };
    });

    columnas.push({
      key: `prom_${asig.asignatura_id}`,
      label: 'PROM',
      titulo: `Promedio — ${String(asig.curso_nombre || '').trim()}`,
      asignatura_id: asig.asignatura_id,
      tipo: 'prom',
    });

    bloques.push({
      curso_nombre: String(asig.curso_nombre || '').trim().toUpperCase(),
      asignatura_id: asig.asignatura_id,
      columnas,
    });
  }
  return bloques;
}

async function construirBloquesCursoInicialFallback(colegioId, asignaturas, ciclo) {
  const bloques = [];
  for (const asig of asignaturas) {
    const indicadores = await cargarIndicadoresAsignatura(colegioId, asig.asignatura_id, ciclo);
    const columnas = (indicadores || []).map((ind, idx) => {
      const descripcion = String(ind.descripcion || '').trim();
      return {
        key: `ind_${ind.indicador_id}`,
        label: (descripcion.split(/\s+/)[0] || `C${idx + 1}`).slice(0, 12).toUpperCase(),
        titulo: descripcion || `Indicador ${ind.indicador_id}`,
        indicador_id: ind.indicador_id,
        criterio_id: ind.criterio_id,
        tipo: 'indicador',
      };
    });
    if (!columnas.length) continue;
    bloques.push({
      curso_nombre: String(asig.curso_nombre || '').trim().toUpperCase(),
      asignatura_id: asig.asignatura_id,
      columnas,
    });
  }
  return bloques;
}

function valorCeldaDetallada({
  col,
  matriculaId,
  esInicial,
  detMap,
  explMap,
  promMap,
  notaMapLibreta,
}) {
  if (col.tipo === 'prom') {
    const raw = promMap[`${matriculaId}:${col.asignatura_id}`];
    if (raw == null || raw === '' || raw === '-') return '';
    return esInicial ? String(raw).trim().toUpperCase() : fmtNotaNumerica(raw);
  }

  if (col.tipo === 'indicador_libreta') {
    return notaLibretaInicial(notaMapLibreta || {}, matriculaId, col.indicador_id);
  }

  if (col.tipo === 'criterio') {
    const det = detMap[`${matriculaId}:${col.asignatura_id}`] || {};
    return promedioNumericoCriterio(det, col.criterio_id, col.indicador_ids);
  }

  const det = detMap[`${matriculaId}:${col.asignatura_id}`] || {};
  if (esInicial && col.tipo === 'indicador') {
    let val = notaIndicadorDesdeDetalle(det, col.criterio_id, col.indicador_id);
    if (!val) {
      const raw = explMap[`${matriculaId}:${col.indicador_id}`];
      val = raw != null && raw !== '' ? String(raw).trim().toUpperCase() : '';
    }
    return val;
  }
  return '';
}

async function construirHojaDetallada(colegioId, grupo, alumnos, asignaturas, ciclo) {
  const esInicial = esNivelInicial(grupo.nivel_nombre, grupo.tipo_calificacion);
  const matriculaIds = alumnos.map((a) => a.matricula_id);
  let bloques = [];
  let notaMapLibreta = null;

  if (esInicial) {
    const libreta = await cargarLibretaInicialGrupo(query, {
      grupoId: grupo.grupo_id,
      colegioId,
      anio: grupo.anio,
      ciclo,
      matriculaIds,
    });
    if (libreta) {
      bloques = bloquesDesdeLibretaInicial(libreta, { incluirProm: false });
      notaMapLibreta = libreta.notaMap;
    } else {
      bloques = await construirBloquesCursoInicialFallback(colegioId, asignaturas, ciclo);
    }
  } else {
    bloques = await construirBloquesCursoNumerico(colegioId, asignaturas, ciclo);
  }

  const columnasFlat = aplanarColumnas(bloques);

  const asignaturaIds = asignaturas.map((a) => a.asignatura_id);
  const notasPack = await cargarNotasDetalleGrupo(colegioId, asignaturaIds, matriculaIds, ciclo);
  const detMap = mapDetallePorMatriculaAsig(notasPack.detalles);
  const explMap = mapExplicacionIndicador(notasPack.explicaciones);
  const promMap = mapPromedios(notasPack.promedios);

  const filas = alumnos.map((al, idx) => {
    const notas = {};
    for (const col of columnasFlat) {
      notas[col.key] = valorCeldaDetallada({
        col,
        matriculaId: al.matricula_id,
        esInicial,
        detMap,
        explMap,
        promMap,
        notaMapLibreta,
      });
    }
    return {
      numero: idx + 1,
      matricula_id: al.matricula_id,
      dni: al.dni || '',
      nombre: nombreAlumnoLista(al),
      notas,
    };
  });

  return {
    grupo_id: grupo.grupo_id,
    tab_label: tabLabelGrupo(grupo),
    subtitulo: subtituloGrupo(grupo, grupo.anio),
    es_inicial: esInicial,
    bloques,
    columnas_flat: columnasFlat,
    filas,
  };
}

function estiloCabecera(cell, fillArgb, opts = {}) {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillArgb } };
  cell.font = { bold: true, size: 8 };
  cell.alignment = {
    vertical: 'middle',
    horizontal: 'center',
    wrapText: true,
    textRotation: opts.vertical ? 90 : 0,
  };
}

function nombreHojaUnico(base, usados) {
  let name = String(base || 'Hoja').slice(0, 31);
  if (!usados.has(name)) {
    usados.add(name);
    return name;
  }
  let n = 2;
  while (n < 100) {
    const suffix = `_${n}`;
    const candidate = `${String(base).slice(0, 31 - suffix.length)}${suffix}`;
    if (!usados.has(candidate)) {
      usados.add(candidate);
      return candidate;
    }
    n += 1;
  }
  const fallback = `Hoja_${usados.size + 1}`;
  usados.add(fallback);
  return fallback.slice(0, 31);
}

function escribirHojaDetallada(ws, data, tituloGlobal) {
  const bloques = data.bloques || [];
  const columnasFlat = data.columnas_flat || [];
  const colCount = 3 + columnasFlat.length;
  const lastCol = colLetter(colCount);

  ws.getColumn(1).width = 4;
  ws.getColumn(2).width = 11;
  ws.getColumn(3).width = 34;
  for (let i = 0; i < columnasFlat.length; i += 1) {
    ws.getColumn(4 + i).width = columnasFlat[i].tipo === 'prom' ? 6 : 5;
  }

  let r = 1;
  ws.mergeCells(`A${r}:${lastCol}${r}`);
  const titleCell = ws.getCell(`A${r}`);
  titleCell.value = `${tituloGlobal} — ${data.tab_label}`;
  titleCell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL_TITULO } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(r).height = 22;
  r += 1;

  if (data.subtitulo) {
    ws.mergeCells(`A${r}:${lastCol}${r}`);
    const sub = ws.getCell(`A${r}`);
    sub.value = data.subtitulo;
    sub.font = { size: 9, italic: true };
    sub.alignment = { horizontal: 'center' };
    r += 1;
  }

  const rCurso = r;
  const rInd = r + 1;

  ws.mergeCells(`A${rCurso}:A${rInd}`);
  ws.mergeCells(`B${rCurso}:B${rInd}`);
  ws.mergeCells(`C${rCurso}:C${rInd}`);

  const cellN = ws.getCell(`A${rCurso}`);
  cellN.value = 'N°';
  estiloCabecera(cellN, FILL_CABECERA_FIJA);

  const cellDni = ws.getCell(`B${rCurso}`);
  cellDni.value = 'DNI';
  estiloCabecera(cellDni, FILL_CABECERA_FIJA);

  const cellAl = ws.getCell(`C${rCurso}`);
  cellAl.value = 'ALUMNOS';
  estiloCabecera(cellAl, FILL_CABECERA_FIJA);

  let colIdx = 4;
  for (const bloque of bloques) {
    const colsBloque = bloque.columnas || [];
    if (!colsBloque.length) continue;
    const startCol = colIdx;
    const endCol = colIdx + colsBloque.length - 1;
    if (startCol < endCol) {
      ws.mergeCells(`${colLetter(startCol)}${rCurso}:${colLetter(endCol)}${rCurso}`);
    }
    const cursoCell = ws.getCell(`${colLetter(startCol)}${rCurso}`);
    cursoCell.value = bloque.curso_nombre;
    estiloCabecera(cursoCell, FILL_CABECERA_CURSOS);

    for (const col of colsBloque) {
      const cell = ws.getCell(`${colLetter(colIdx)}${rInd}`);
      cell.value = col.label;
      estiloCabecera(cell, col.tipo === 'prom' ? FILL_CABECERA_PROM : FILL_CABECERA_CURSOS, {
        vertical: col.tipo !== 'prom',
      });
      if (col.titulo && col.titulo !== col.label) {
        cell.note = col.titulo;
      }
      colIdx += 1;
    }
  }

  aplicarBordeFila(ws.getRow(rCurso), colCount);
  aplicarBordeFila(ws.getRow(rInd), colCount);
  ws.getRow(rInd).height = columnasFlat.length > 14 ? 56 : 32;
  r = rInd + 1;

  (data.filas || []).forEach((f, idx) => {
    const row = ws.getRow(r);
    row.values = [
      f.numero,
      f.dni || '',
      f.nombre,
      ...columnasFlat.map((c) => f.notas?.[c.key] || ''),
    ];
    for (let c = 1; c <= colCount; c += 1) {
      const cell = row.getCell(c);
      const flatCol = columnasFlat[c - 4];
      if (flatCol?.tipo === 'prom') {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL_FILA_PROM } };
      } else if (idx % 2 === 1) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL_FILA_PAR } };
      }
      cell.font = { size: 9 };
      if (!data.es_inicial && flatCol && c > 3 && flatCol.tipo !== 'prom') {
        const n = parseNumPromedio(cell.value);
        if (n != null && n < NOTA_MINIMA_ROJA) {
          cell.font = { size: 9, color: { argb: 'FFDC2626' }, bold: true };
        }
      }
      cell.alignment = {
        vertical: 'middle',
        horizontal: c === 3 ? 'left' : 'center',
        wrapText: c === 3,
      };
    }
    aplicarBordeFila(row, colCount);
    r += 1;
  });
}

async function generarExcelConsolidadoPromediosDetallado(colegioId, filtros) {
  const resolved = await resolverFiltrosConsolidado(colegioId, filtros);
  if (!resolved.ok) return resolved;

  const { anio, bimestre, turnoId, sedeId } = resolved;
  const tituloGlobal = `CONSOLIDADO DE PROMEDIOS DETALLADOS — BIMESTRE ${bimestre} — ${anio}`;
  const grupos = await listarGruposConsolidado(colegioId, anio, turnoId, sedeId);
  const wb = new ExcelJS.Workbook();
  const hojasUsadas = new Set();
  let hojasConDatos = 0;

  for (const g of grupos) {
    const grupo = { ...g, anio };
    const alumnos = await cargarAlumnosGrupo(colegioId, g.grupo_id);
    if (!alumnos.length) continue;

    const asignaturas = await cargarAsignaturasGrupo(colegioId, g.grupo_id);
    const esInicial = esNivelInicial(g.nivel_nombre, g.tipo_calificacion);
    if (!asignaturas.length && !esInicial) continue;

    const hoja = await construirHojaDetallada(colegioId, grupo, alumnos, asignaturas, bimestre);
    if (!hoja.columnas_flat.length) continue;

    const sheetName = nombreHojaUnico(hoja.tab_label, hojasUsadas);
    const ws = wb.addWorksheet(sheetName, { views: [{ showGridLines: true }] });
    escribirHojaDetallada(ws, hoja, tituloGlobal);
    hojasConDatos += 1;
  }

  if (hojasConDatos === 0) {
    const ws = wb.addWorksheet('Sin datos');
    ws.getCell('A1').value = 'No hay grupos con alumnos y cursos para los filtros indicados.';
  }

  const buffer = await wb.xlsx.writeBuffer();
  return {
    ok: true,
    buffer,
    filename: `consolidado_promedios_detallado_b${bimestre}_${anio}.xlsx`,
    hojas: hojasConDatos,
  };
}

module.exports = {
  generarExcelConsolidadoPromediosDetallado,
  construirHojaDetallada,
};
