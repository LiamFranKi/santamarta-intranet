/**
 * Reporte «Consolidado de Promedios» — matriz por grado/sección (modal + Excel).
 */
const ExcelJS = require('exceljs');
const { query } = require('./mysql');
const { sqlMatriculaEstadoSoloRegular } = require('./matriculaEstados');
const {
  columnExists,
  etiquetaGradoTitulo,
} = require('./listaAlumnosMatriculadosReporte');
const { cargarMetaReportesGeneral } = require('./reportesGeneralMeta');
const { deserializarNotasDetalles } = require('./notasTodosGrupoData');
const {
  cargarLibretaInicialGrupo,
  promedioAreaLibretaInicial,
  aplanarColumnasBloques,
} = require('./libretaInicialGrupoReporte');

const CONDUCTA_ASIGNATURA_ID = -101;
const FILL_TITULO = 'FF1E40AF';
const FILL_CABECERA_FIJA = 'FFB4C7E7';
const FILL_CABECERA_CURSOS = 'FFFFF2CC';
const FILL_FILA_PAR = 'FFF8FAFC';
const BORDER_THIN = { style: 'thin', color: { argb: 'FF000000' } };

const ORDEN_NIVEL_SQL = `
  CASE
    WHEN LOWER(TRIM(COALESCE(n.nombre, ''))) LIKE '%inicial%' THEN 1
    WHEN LOWER(TRIM(COALESCE(n.nombre, ''))) LIKE '%primaria%' THEN 2
    WHEN LOWER(TRIM(COALESCE(n.nombre, ''))) LIKE '%secundaria%' THEN 3
    ELSE 4
  END ASC,
  n.id ASC,
  CAST(g.grado AS UNSIGNED) ASC,
  g.grado ASC,
  g.seccion ASC`;

function parseNumPromedio(raw) {
  if (raw == null || raw === '' || raw === '-') return null;
  const n = parseFloat(String(raw).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function fmtNotaNumerica(raw) {
  const n = parseNumPromedio(raw);
  if (n == null) return '';
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');
}

function nombreAlumnoLista(row) {
  const ap = [row.apellido_paterno, row.apellido_materno]
    .filter((x) => x != null && String(x).trim())
    .join(' ')
    .trim();
  const nom = String(row.nombres || '').trim();
  if (ap && nom) return `${ap}, ${nom}`;
  return ap || nom || '—';
}

function esNivelInicial(nivelNombre, tipoCalificacion) {
  if (parseInt(tipoCalificacion, 10) === 0) return true;
  return /inicial/i.test(String(nivelNombre || ''));
}

function tabLabelGrupo(g) {
  const nivel = String(g.nivel_nombre || '').trim();
  const nLower = nivel.toLowerCase();
  let pref = 'Nivel';
  if (nLower.includes('inicial')) pref = 'Inicial';
  else if (nLower.includes('primaria')) pref = 'Primaria';
  else if (nLower.includes('secundaria')) pref = 'Secundaria';
  else if (nivel) pref = nivel.split(/\s+/)[0];

  const grado = String(g.grado ?? '').trim();
  const sec = String(g.seccion || 'UNICA').trim().toUpperCase();
  return `${pref}-${grado}${sec}`;
}

function subtituloGrupo(g, anio) {
  const nivel = String(g.nivel_nombre || '').trim().toUpperCase();
  const gl = String(etiquetaGradoTitulo(g.nivel_nombre, g.grado) || '')
    .trim()
    .toUpperCase();
  const sec = String(g.seccion || '').trim().toUpperCase();
  const turno = String(g.turno_nombre || '').trim().toUpperCase();
  const left = [gl, sec].filter(Boolean).join(' ');
  return `${nivel} - ${left} - ${turno} - ${anio}`;
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

function notaIndicadorDesdeDetalle(notasDet, criterioId, indicadorId) {
  const notaCriterio = notasDet[criterioId] ?? notasDet[String(criterioId)];
  const notasArr =
    notaCriterio && (notaCriterio[indicadorId] ?? notaCriterio[String(indicadorId)]);
  if (!notasArr || !Array.isArray(notasArr)) return '';
  const arr = notasArr.filter((x) => x != null && x !== '');
  if (!arr.length) return '';
  if (arr.length === 1) return String(arr[0]).trim().toUpperCase();
  return arr.map((x) => String(x).trim().toUpperCase()).join(', ');
}

function promedioNumericoIndicador(notasDet, criterioId, indicadorId) {
  const notaCriterio = notasDet[criterioId] ?? notasDet[String(criterioId)];
  const notasArr =
    notaCriterio && (notaCriterio[indicadorId] ?? notaCriterio[String(indicadorId)]);
  if (!notasArr || !Array.isArray(notasArr)) return '';
  const validas = notasArr
    .map((n) => parseFloat(String(n).replace(',', '.')))
    .filter((n) => Number.isFinite(n));
  if (!validas.length) return '';
  return String(Math.round(validas.reduce((s, n) => s + n, 0) / validas.length));
}

function promedioNumericoCriterio(notasDet, criterioId, indicadorIds) {
  const notaCriterio = notasDet[criterioId] ?? notasDet[String(criterioId)];
  if (!notaCriterio) return '';
  const ids =
    indicadorIds?.length > 0
      ? indicadorIds
      : Object.keys(notaCriterio).map((k) => parseInt(k, 10)).filter((n) => Number.isFinite(n));
  const allNums = [];
  for (const indId of ids) {
    const notasArr = notaCriterio[indId] ?? notaCriterio[String(indId)];
    if (!notasArr || !Array.isArray(notasArr)) continue;
    notasArr.forEach((n) => {
      const v = parseFloat(String(n).replace(',', '.'));
      if (Number.isFinite(v)) allNums.push(v);
    });
  }
  if (!allNums.length) return '';
  return String(Math.round(allNums.reduce((s, n) => s + n, 0) / allNums.length));
}

async function cargarCriteriosAsignatura(colegioId, asignaturaId, ciclo) {
  let criterios = await query(
    `SELECT id, asignatura_id, descripcion, abreviatura, orden
     FROM asignaturas_criterios
     WHERE asignatura_id = ? AND colegio_id = ? AND (ciclo = ? OR ciclo = 0)
     ORDER BY orden ASC, id ASC`,
    [asignaturaId, colegioId, ciclo]
  );
  if ((!criterios || !criterios.length) && ciclo > 1) {
    criterios = await query(
      `SELECT id, asignatura_id, descripcion, abreviatura, orden
       FROM asignaturas_criterios
       WHERE asignatura_id = ? AND colegio_id = ? AND (ciclo = 1 OR ciclo = 0)
       ORDER BY orden ASC, id ASC`,
      [asignaturaId, colegioId]
    );
  }
  return criterios || [];
}

async function cargarIndicadoresPorCriterio(criterioIds) {
  if (!criterioIds?.length) return {};
  const rows = await query(
    `SELECT id, criterio_id FROM asignaturas_indicadores
     WHERE criterio_id IN (${criterioIds.map(() => '?').join(',')})
     ORDER BY id ASC`,
    criterioIds
  );
  const map = {};
  for (const row of rows || []) {
    const cid = row.criterio_id;
    if (!map[cid]) map[cid] = [];
    map[cid].push(row.id);
  }
  return map;
}

async function listarGruposConsolidado(colegioId, anio, turnoId, sedeId) {
  const hasSede = await columnExists('grupos', 'sede_id');
  let sql = `
    SELECT g.id AS grupo_id, g.grado, g.seccion, g.nivel_id,
           n.nombre AS nivel_nombre, n.tipo_calificacion, t.nombre AS turno_nombre
    FROM grupos g
    INNER JOIN niveles n ON n.id = g.nivel_id AND n.colegio_id = g.colegio_id
    LEFT JOIN turnos t ON t.id = g.turno_id
    WHERE g.colegio_id = ? AND g.anio = ? AND g.turno_id = ?`;
  const params = [colegioId, anio, turnoId];
  if (hasSede && Number.isFinite(sedeId)) {
    sql += ' AND g.sede_id = ?';
    params.push(sedeId);
  }
  sql += ` ORDER BY ${ORDEN_NIVEL_SQL}`;
  const rows = await query(sql, params);
  return rows || [];
}

async function cargarAlumnosGrupo(colegioId, grupoId) {
  return query(
    `SELECT m.id AS matricula_id, m.alumno_id,
            a.nombres, a.apellido_paterno, a.apellido_materno,
            NULLIF(TRIM(a.nro_documento), '') AS dni
     FROM matriculas m
     INNER JOIN alumnos a ON a.id = m.alumno_id AND a.colegio_id = m.colegio_id
     WHERE m.grupo_id = ? AND m.colegio_id = ? AND ${sqlMatriculaEstadoSoloRegular('m')}
     ORDER BY a.apellido_paterno ASC, a.apellido_materno ASC, a.nombres ASC`,
    [grupoId, colegioId]
  );
}

async function cargarAsignaturasGrupo(colegioId, grupoId) {
  return query(
    `SELECT a.id AS asignatura_id, a.grupo_id, a.curso_id, c.nombre AS curso_nombre
     FROM asignaturas a
     INNER JOIN cursos c ON c.id = a.curso_id
     WHERE a.grupo_id = ? AND a.colegio_id = ? AND a.id <> ?
     ORDER BY c.nombre ASC`,
    [grupoId, colegioId, CONDUCTA_ASIGNATURA_ID]
  );
}

async function cargarIndicadoresAsignatura(colegioId, asignaturaId, ciclo) {
  let criterios = await query(
    `SELECT id, asignatura_id FROM asignaturas_criterios
     WHERE asignatura_id = ? AND colegio_id = ? AND (ciclo = ? OR ciclo = 0)
     ORDER BY orden ASC, id ASC`,
    [asignaturaId, colegioId, ciclo]
  );
  if ((!criterios || !criterios.length) && ciclo > 1) {
    criterios = await query(
      `SELECT id, asignatura_id FROM asignaturas_criterios
       WHERE asignatura_id = ? AND colegio_id = ? AND (ciclo = 1 OR ciclo = 0)
       ORDER BY orden ASC, id ASC`,
      [asignaturaId, colegioId]
    );
  }
  const criterioIds = (criterios || []).map((c) => c.id);
  if (!criterioIds.length) return [];

  const indicadores = await query(
    `SELECT i.id AS indicador_id, i.criterio_id, i.descripcion, c.asignatura_id
     FROM asignaturas_indicadores i
     INNER JOIN asignaturas_criterios c ON c.id = i.criterio_id
     WHERE i.criterio_id IN (${criterioIds.map(() => '?').join(',')})
     ORDER BY c.orden ASC, c.id ASC, i.id ASC`,
    criterioIds
  );
  return indicadores || [];
}

async function cargarNotasDetalleGrupo(colegioId, asignaturaIds, matriculaIds, ciclo) {
  if (!asignaturaIds.length || !matriculaIds.length) {
    return { detalles: [], explicaciones: [], promedios: [] };
  }
  const inA = asignaturaIds.map(() => '?').join(',');
  const inM = matriculaIds.map(() => '?').join(',');

  const [detalles, explicaciones, promedios] = await Promise.all([
    query(
      `SELECT asignatura_id, matricula_id, data
       FROM notas_detalles
       WHERE asignatura_id IN (${inA}) AND matricula_id IN (${inM}) AND ciclo = ?`,
      [...asignaturaIds, ...matriculaIds, ciclo]
    ),
    query(
      `SELECT asignatura_id, matricula_id, indicador_id, nota
       FROM notas_detalle_explicaciones_indicadores
       WHERE asignatura_id IN (${inA}) AND matricula_id IN (${inM}) AND ciclo = ? AND colegio_id = ?`,
      [...asignaturaIds, ...matriculaIds, ciclo, colegioId]
    ).catch(() => []),
    query(
      `SELECT asignatura_id, matricula_id, promedio
       FROM promedios
       WHERE asignatura_id IN (${inA}) AND matricula_id IN (${inM}) AND ciclo = ?`,
      [...asignaturaIds, ...matriculaIds, ciclo]
    ),
  ]);

  return {
    detalles: detalles || [],
    explicaciones: explicaciones || [],
    promedios: promedios || [],
  };
}

function mapDetallePorMatriculaAsig(detalles) {
  const map = {};
  for (const row of detalles || []) {
    const key = `${row.matricula_id}:${row.asignatura_id}`;
    map[key] = row.data ? deserializarNotasDetalles(row.data) : {};
  }
  return map;
}

function mapExplicacionIndicador(explicaciones) {
  const map = {};
  for (const row of explicaciones || []) {
    map[`${row.matricula_id}:${row.indicador_id}`] = row.nota;
  }
  return map;
}

function mapPromedios(promedios) {
  const map = {};
  for (const row of promedios || []) {
    map[`${row.matricula_id}:${row.asignatura_id}`] = row.promedio;
  }
  return map;
}

async function construirPestanaNumerica(colegioId, grupo, alumnos, asignaturas, ciclo) {
  const asignaturaIds = asignaturas.map((a) => a.asignatura_id);
  const matriculaIds = alumnos.map((a) => a.matricula_id);
  const notasPack = await cargarNotasDetalleGrupo(colegioId, asignaturaIds, matriculaIds, ciclo);
  const promMap = mapPromedios(notasPack.promedios);

  const columnas = asignaturas.map((a) => ({
    key: `asig_${a.asignatura_id}`,
    asignatura_id: a.asignatura_id,
    nombre: String(a.curso_nombre || '').trim().toUpperCase(),
    tipo: 'curso',
  }));

  const filas = alumnos.map((al, idx) => {
    const notas = {};
    for (const col of columnas) {
      const raw = promMap[`${al.matricula_id}:${col.asignatura_id}`];
      notas[col.key] = fmtNotaNumerica(raw);
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
    modo_cualitativo: false,
    columnas,
    filas,
  };
}

async function construirPestanaInicial(colegioId, grupo, alumnos, asignaturas, ciclo) {
  const matriculaIds = alumnos.map((a) => a.matricula_id);
  const anio = grupo.anio;

  const libreta = await cargarLibretaInicialGrupo(query, {
    grupoId: grupo.grupo_id,
    colegioId,
    anio,
    ciclo,
    matriculaIds,
  });

  if (libreta) {
    const columnas = (libreta.areas || []).map((area) => ({
      key: `area_${area.id}`,
      nombre: String(area.nombre || '').trim().toUpperCase(),
      area_id: area.id,
      indicador_ids: (area.indicadores || []).map((i) => i.id),
      tipo: 'curso_libreta',
    }));

    const filas = alumnos.map((al, idx) => {
      const notas = {};
      for (const col of columnas) {
        notas[col.key] = promedioAreaLibretaInicial(
          libreta.notaMap,
          al.matricula_id,
          col.indicador_ids
        );
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
      modo_cualitativo: true,
      columnas,
      filas,
    };
  }

  const asignaturaIds = asignaturas.map((a) => a.asignatura_id);
  const notasPack = await cargarNotasDetalleGrupo(colegioId, asignaturaIds, matriculaIds, ciclo);
  const promMap = mapPromedios(notasPack.promedios);

  const columnas = asignaturas.map((asig) => ({
    key: `asig_${asig.asignatura_id}`,
    asignatura_id: asig.asignatura_id,
    nombre: String(asig.curso_nombre || '').trim().toUpperCase(),
    tipo: 'curso',
  }));

  const filas = alumnos.map((al, idx) => {
    const notas = {};
    for (const col of columnas) {
      const raw = promMap[`${al.matricula_id}:${col.asignatura_id}`];
      notas[col.key] =
        raw != null && raw !== '' && raw !== '-'
          ? String(raw).trim().toUpperCase()
          : '';
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
    modo_cualitativo: true,
    columnas,
    filas,
  };
}

async function resolverFiltrosConsolidado(colegioId, filtros) {
  const anio = parseInt(filtros.anio, 10);
  const bimestre = Math.min(4, Math.max(1, parseInt(filtros.bimestre, 10) || 1));
  if (!Number.isFinite(anio)) {
    return { ok: false, status: 400, error: 'Indique un año válido.' };
  }

  const meta = await cargarMetaReportesGeneral(colegioId);
  const turnoId = Number.isFinite(parseInt(filtros.turno_id, 10))
    ? parseInt(filtros.turno_id, 10)
    : meta.defaults?.turno_id;
  const sedeId = Number.isFinite(parseInt(filtros.sede_id, 10))
    ? parseInt(filtros.sede_id, 10)
    : meta.defaults?.sede_id;

  if (!Number.isFinite(turnoId)) {
    return { ok: false, status: 400, error: 'No se pudo determinar el turno por defecto.' };
  }

  return {
    ok: true,
    anio,
    bimestre,
    turnoId,
    sedeId: Number.isFinite(sedeId) ? sedeId : null,
    colegioNombre: meta.colegio_nombre || '',
  };
}

async function construirConsolidadoPromedios(colegioId, filtros) {
  const resolved = await resolverFiltrosConsolidado(colegioId, filtros);
  if (!resolved.ok) return resolved;

  const { anio, bimestre, turnoId, sedeId, colegioNombre } = resolved;
  const grupos = await listarGruposConsolidado(colegioId, anio, turnoId, sedeId);
  const pestanas = [];

  for (const g of grupos) {
    const grupo = { ...g, anio };
    const alumnos = await cargarAlumnosGrupo(colegioId, g.grupo_id);
    if (!alumnos.length) continue;

    const asignaturas = await cargarAsignaturasGrupo(colegioId, g.grupo_id);
    const inicial = esNivelInicial(g.nivel_nombre, g.tipo_calificacion);
    const pestana = inicial
      ? await construirPestanaInicial(colegioId, grupo, alumnos, asignaturas, bimestre)
      : await construirPestanaNumerica(colegioId, grupo, alumnos, asignaturas, bimestre);
    pestanas.push(pestana);
  }

  return {
    ok: true,
    titulo: `CONSOLIDADO DE PROMEDIOS — BIMESTRE ${bimestre} — ${anio}`,
    colegio_nombre: colegioNombre,
    anio,
    bimestre,
    pestanas,
    total_pestanas: pestanas.length,
  };
}

function estiloCabecera(cell, fillArgb, { vertical = false } = {}) {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillArgb } };
  cell.font = { bold: true, size: 8 };
  cell.alignment = {
    vertical: 'middle',
    horizontal: 'center',
    wrapText: true,
    textRotation: vertical ? 90 : 0,
  };
}

function escribirHojaConsolidado(ws, pest, tituloGlobal) {
  const bloques = pest.bloques || [];
  const usaBloques = pest.usa_bloques && bloques.length > 0;
  const columnasFlat = usaBloques
    ? pest.columnas_flat || aplanarColumnasBloques(bloques)
    : [];
  const cols = usaBloques ? columnasFlat : pest.columnas || [];
  const colCount = 3 + cols.length;
  const lastCol = colLetter(colCount);

  ws.getColumn(1).width = 4;
  ws.getColumn(2).width = 11;
  ws.getColumn(3).width = 34;
  for (let i = 0; i < cols.length; i += 1) {
    ws.getColumn(4 + i).width = cols.length > 12 ? 5 : 8;
  }

  let r = 1;
  ws.mergeCells(`A${r}:${lastCol}${r}`);
  const titleCell = ws.getCell(`A${r}`);
  titleCell.value = `${tituloGlobal} — ${pest.tab_label}`;
  titleCell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL_TITULO } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(r).height = 22;
  r += 1;

  if (pest.subtitulo) {
    ws.mergeCells(`A${r}:${lastCol}${r}`);
    const sub = ws.getCell(`A${r}`);
    sub.value = pest.subtitulo;
    sub.font = { size: 9, italic: true };
    sub.alignment = { horizontal: 'center' };
    r += 1;
  }

  if (usaBloques) {
    const rCurso = r;
    const rInd = r + 1;

    ws.mergeCells(`A${rCurso}:A${rInd}`);
    ws.mergeCells(`B${rCurso}:B${rInd}`);
    ws.mergeCells(`C${rCurso}:C${rInd}`);

    estiloCabecera(ws.getCell(`A${rCurso}`), FILL_CABECERA_FIJA);
    ws.getCell(`A${rCurso}`).value = 'N°';
    estiloCabecera(ws.getCell(`B${rCurso}`), FILL_CABECERA_FIJA);
    ws.getCell(`B${rCurso}`).value = 'DNI';
    estiloCabecera(ws.getCell(`C${rCurso}`), FILL_CABECERA_FIJA);
    ws.getCell(`C${rCurso}`).value = 'ALUMNOS';

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
        cell.value = col.label || col.nombre;
        estiloCabecera(cell, FILL_CABECERA_CURSOS, { vertical: true });
        if (col.titulo && col.titulo !== (col.label || col.nombre)) {
          cell.note = col.titulo;
        }
        colIdx += 1;
      }
    }

    aplicarBordeFila(ws.getRow(rCurso), colCount);
    aplicarBordeFila(ws.getRow(rInd), colCount);
    ws.getRow(rInd).height = cols.length > 10 ? 72 : 32;
    r = rInd + 1;
  } else {
    const headRow = ws.getRow(r);
    headRow.values = ['N°', 'DNI', 'ALUMNOS', ...cols.map((c) => c.nombre)];
    for (let c = 1; c <= colCount; c += 1) {
      estiloCabecera(headRow.getCell(c), c <= 3 ? FILL_CABECERA_FIJA : FILL_CABECERA_CURSOS, {
        vertical: c > 3,
      });
    }
    aplicarBordeFila(headRow, colCount);
    ws.getRow(r).height = cols.length > 10 ? 72 : 28;
    r += 1;
  }

  (pest.filas || []).forEach((f, idx) => {
    const row = ws.getRow(r);
    row.values = [
      f.numero,
      f.dni || '',
      f.nombre,
      ...cols.map((c) => f.notas?.[c.key] || ''),
    ];
    for (let c = 1; c <= colCount; c += 1) {
      const cell = row.getCell(c);
      if (idx % 2 === 1) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL_FILA_PAR } };
      }
      cell.font = { size: 9 };
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

async function generarExcelConsolidadoPromedios(colegioId, filtros) {
  const data = await construirConsolidadoPromedios(colegioId, filtros);
  if (!data.ok) return data;

  const wb = new ExcelJS.Workbook();

  for (const pest of data.pestanas || []) {
    const sheetName = String(pest.tab_label || 'Hoja').slice(0, 31);
    const ws = wb.addWorksheet(sheetName, { views: [{ showGridLines: true }] });
    escribirHojaConsolidado(ws, pest, data.titulo);
  }

  if (!data.pestanas?.length) {
    const ws = wb.addWorksheet('Sin datos');
    ws.getCell('A1').value = 'No hay grupos con alumnos para los filtros indicados.';
  }

  const buffer = await wb.xlsx.writeBuffer();
  return {
    ok: true,
    buffer,
    filename: `consolidado_promedios_b${data.bimestre}_${data.anio}.xlsx`,
  };
}

module.exports = {
  construirConsolidadoPromedios,
  generarExcelConsolidadoPromedios,
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
  promedioNumericoIndicador,
  promedioNumericoCriterio,
  aplanarColumnasBloques,
};
