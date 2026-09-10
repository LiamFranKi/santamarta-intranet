/**
 * Consolidado de asistencia por aula (todos los grupos del mes).
 */
const ExcelJS = require('exceljs');
const { query } = require('./mysql');
const { sqlMatriculaEstadoSoloRegular } = require('./matriculaEstados');
const {
  ordenNivelEducativoNombre,
  etiquetaGradoTitulo,
  columnExists,
} = require('./listaAlumnosMatriculadosReporte');
const { diasLaborablesMes, codigoTipoAsistencia, MESES_ES } = require('./reportesGeneralAsistenciaMensual');

const TIPOS_DETALLE = {
  tardanzas: new Set(['T', 'TJ']),
  faltas: new Set(['F', 'FJ']),
  tardanzas_no_just: new Set(['T']),
  faltas_no_just: new Set(['F']),
  no_justificadas: new Set(['T', 'F']),
  todas: new Set(['T', 'TJ', 'F', 'FJ']),
};

const ETIQUETA_DETALLE = {
  tardanzas: 'Tardanzas',
  faltas: 'Faltas',
  tardanzas_no_just: 'Tardanzas no justificadas',
  faltas_no_just: 'Faltas no justificadas',
  no_justificadas: 'No justificadas',
  todas: 'Incidencias',
};

function etiquetaAula(g) {
  const gl = etiquetaGradoTitulo(g.nivel_nombre, g.grado);
  const sec = String(g.seccion || '').trim().toUpperCase();
  const parts = [gl, sec].filter(Boolean);
  return parts.join(' ') || 'Aula';
}

function vaciosConteo() {
  return {
    tardanzas: 0,
    tardanzas_no_just: 0,
    faltas: 0,
    faltas_no_just: 0,
    no_justificadas: 0,
  };
}

function aplicarCodigo(bucket, cod) {
  if (cod === 'T') {
    bucket.tardanzas += 1;
    bucket.tardanzas_no_just += 1;
    bucket.no_justificadas += 1;
  } else if (cod === 'TJ') {
    bucket.tardanzas += 1;
  } else if (cod === 'F') {
    bucket.faltas += 1;
    bucket.faltas_no_just += 1;
    bucket.no_justificadas += 1;
  } else if (cod === 'FJ') {
    bucket.faltas += 1;
  }
}

function formatHora(raw) {
  if (raw == null || raw === '') return '';
  const s = raw instanceof Date && !Number.isNaN(raw.getTime())
    ? raw.toTimeString()
    : String(raw);
  const match = /(\d{1,2}):(\d{2})/.exec(s);
  if (!match) return '';
  return `${String(match[1]).padStart(2, '0')}:${match[2]}`;
}

function fmtFechaLarga(ymd) {
  const [y, m, d] = String(ymd || '').split('-').map(Number);
  if (!y || !m || !d) return ymd || '—';
  try {
    return new Date(y, m - 1, d).toLocaleDateString('es-PE', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  } catch {
    return ymd;
  }
}

function nombreAlumno(row) {
  const ap = [row.apellido_paterno, row.apellido_materno]
    .filter((x) => x != null && String(x).trim())
    .join(' ')
    .trim();
  const nom = String(row.nombres || '').trim();
  if (ap && nom) return `${ap}, ${nom}`;
  return ap || nom || '—';
}

async function listarGruposConsolidado(colegioId, { anio, sedeId, turnoId }) {
  const hasSede = await columnExists('grupos', 'sede_id');
  let sql = `SELECT g.id, g.anio, g.grado, g.seccion, g.nivel_id, n.nombre AS nivel_nombre, t.nombre AS turno_nombre
    FROM grupos g
    LEFT JOIN niveles n ON n.id = g.nivel_id
    LEFT JOIN turnos t ON t.id = g.turno_id
    WHERE g.colegio_id = ? AND g.anio = ?`;
  const params = [colegioId, anio];
  if (Number.isFinite(turnoId)) {
    sql += ' AND g.turno_id = ?';
    params.push(turnoId);
  }
  if (hasSede && Number.isFinite(sedeId)) {
    sql += ' AND g.sede_id = ?';
    params.push(sedeId);
  }
  const rows = await query(sql, params);
  return [...(rows || [])].sort((a, b) => {
    const oa = ordenNivelEducativoNombre(a.nivel_nombre);
    const ob = ordenNivelEducativoNombre(b.nivel_nombre);
    if (oa !== ob) return oa - ob;
    const nid = (parseInt(a.nivel_id, 10) || 0) - (parseInt(b.nivel_id, 10) || 0);
    if (nid !== 0) return nid;
    const ga = parseInt(a.grado, 10) || 0;
    const gb = parseInt(b.grado, 10) || 0;
    if (ga !== gb) return ga - gb;
    const sc = String(a.seccion || '').localeCompare(String(b.seccion || ''), 'es');
    if (sc !== 0) return sc;
    return String(a.turno_nombre || '').localeCompare(String(b.turno_nombre || ''), 'es');
  });
}

async function conteoAlumnosPorGrupo(colegioId, grupoIds) {
  const map = new Map();
  for (const id of grupoIds) map.set(id, 0);
  if (!grupoIds.length) return map;
  const ph = grupoIds.map(() => '?').join(',');
  const rows = await query(
    `SELECT m.grupo_id, COUNT(*) AS total
     FROM matriculas m
     WHERE m.colegio_id = ? AND m.grupo_id IN (${ph}) AND ${sqlMatriculaEstadoSoloRegular('m')}
     GROUP BY m.grupo_id`,
    [colegioId, ...grupoIds]
  );
  for (const r of rows || []) {
    map.set(parseInt(r.grupo_id, 10), parseInt(r.total, 10) || 0);
  }
  return map;
}

async function cargarAsistenciasMesGrupos(colegioId, grupoIds, fechaInicio, fechaFin, { conHora = false } = {}) {
  if (!grupoIds.length) return [];
  const hasHora = conHora ? await columnExists('matriculas_asistencias', 'hora_entrada') : false;
  const ph = grupoIds.map(() => '?').join(',');
  const horaSql = hasHora ? ', ma.hora_entrada' : '';
  return query(
    `SELECT
       m_actual.grupo_id,
       m_actual.id AS matricula_id,
       DATE_FORMAT(ma.fecha, '%Y-%m-%d') AS fecha,
       ma.tipo
       ${horaSql},
       a.apellido_paterno, a.apellido_materno, a.nombres
     FROM matriculas_asistencias ma
     INNER JOIN matriculas m_reg ON m_reg.id = ma.matricula_id AND m_reg.colegio_id = ?
     INNER JOIN matriculas m_actual ON m_actual.alumno_id = m_reg.alumno_id
       AND m_actual.colegio_id = ?
       AND m_actual.grupo_id IN (${ph})
     INNER JOIN alumnos a ON a.id = m_actual.alumno_id AND a.colegio_id = m_actual.colegio_id
     WHERE DATE(ma.fecha) >= DATE(?) AND DATE(ma.fecha) <= DATE(?)
       AND ${sqlMatriculaEstadoSoloRegular('m_actual')}`,
    [colegioId, colegioId, ...grupoIds, fechaInicio, fechaFin]
  );
}

function sumarTotales(filas) {
  const t = { alumnos: 0, ...vaciosConteo() };
  for (const f of filas) {
    t.alumnos += f.alumnos || 0;
    t.tardanzas += f.tardanzas || 0;
    t.tardanzas_no_just += f.tardanzas_no_just || 0;
    t.faltas += f.faltas || 0;
    t.faltas_no_just += f.faltas_no_just || 0;
    t.no_justificadas += f.no_justificadas || 0;
  }
  return t;
}

async function obtenerConsolidadoAsistencia(colegioId, filtros) {
  const anio = parseInt(filtros.anio, 10);
  const mes = parseInt(filtros.mes, 10);
  const sedeId = filtros.sedeId != null ? parseInt(filtros.sedeId, 10) : null;
  const turnoId = filtros.turnoId != null && filtros.turnoId !== '' ? parseInt(filtros.turnoId, 10) : null;

  if (!Number.isFinite(anio) || !Number.isFinite(mes) || mes < 1 || mes > 12) {
    return { ok: false, status: 400, error: 'Indique año y mes válidos.' };
  }

  const columnas = diasLaborablesMes(anio, mes);
  const mesNombre = MESES_ES[mes - 1] || String(mes);
  const grupos = await listarGruposConsolidado(colegioId, {
    anio,
    sedeId: Number.isFinite(sedeId) ? sedeId : null,
    turnoId: Number.isFinite(turnoId) ? turnoId : null,
  });

  const ids = grupos.map((g) => parseInt(g.id, 10)).filter(Boolean);
  const alumnosMap = await conteoAlumnosPorGrupo(colegioId, ids);
  const conteos = new Map();
  for (const id of ids) conteos.set(id, vaciosConteo());

  if (ids.length && columnas.length) {
    const rows = await cargarAsistenciasMesGrupos(
      colegioId,
      ids,
      columnas[0].fecha,
      columnas[columnas.length - 1].fecha
    );
    const diasSet = new Set(columnas.map((c) => c.fecha));
    for (const row of rows || []) {
      const f = String(row.fecha || '').slice(0, 10);
      if (!diasSet.has(f)) continue;
      const gid = parseInt(row.grupo_id, 10);
      const bucket = conteos.get(gid);
      if (!bucket) continue;
      aplicarCodigo(bucket, codigoTipoAsistencia(row.tipo));
    }
  }

  const filas = grupos.map((g) => {
    const gid = parseInt(g.id, 10);
    const c = conteos.get(gid) || vaciosConteo();
    return {
      grupo_id: gid,
      nivel_id: g.nivel_id,
      nivel_nombre: g.nivel_nombre || 'Otros',
      aula: etiquetaAula(g),
      grado: g.grado,
      seccion: g.seccion,
      turno_nombre: g.turno_nombre || '',
      alumnos: alumnosMap.get(gid) || 0,
      ...c,
    };
  });

  const porNivel = [];
  const mapNivel = new Map();
  for (const f of filas) {
    const key = `${f.nivel_id || 0}|${f.nivel_nombre}`;
    if (!mapNivel.has(key)) {
      const bloque = { nivel_id: f.nivel_id, nivel_nombre: f.nivel_nombre, filas: [] };
      mapNivel.set(key, bloque);
      porNivel.push(bloque);
    }
    mapNivel.get(key).filas.push(f);
  }
  for (const b of porNivel) {
    b.totales = sumarTotales(b.filas);
  }

  return {
    ok: true,
    titulo: 'Consolidado de asistencia',
    subtitulo: `Mes de ${mesNombre} ${anio} · lunes a viernes`,
    anio,
    mes,
    mes_nombre: mesNombre,
    bloques: porNivel,
    totales: sumarTotales(filas),
    aulas: filas.length,
  };
}

async function obtenerDetalleConsolidadoAsistencia(colegioId, filtros) {
  const anio = parseInt(filtros.anio, 10);
  const mes = parseInt(filtros.mes, 10);
  const grupoId = parseInt(filtros.grupoId, 10);
  const tipo = String(filtros.tipo || 'todas').toLowerCase();
  const set = TIPOS_DETALLE[tipo] || TIPOS_DETALLE.todas;

  if (!Number.isFinite(anio) || !Number.isFinite(mes) || !Number.isFinite(grupoId)) {
    return { ok: false, status: 400, error: 'Parámetros incompletos.' };
  }

  const columnas = diasLaborablesMes(anio, mes);
  if (!columnas.length) {
    return { ok: true, grupo_id: grupoId, tipo, etiqueta: ETIQUETA_DETALLE[tipo] || 'Detalle', filas: [] };
  }

  const grupos = await query(
    `SELECT g.id, g.grado, g.seccion, n.nombre AS nivel_nombre
     FROM grupos g
     LEFT JOIN niveles n ON n.id = g.nivel_id
     WHERE g.id = ? AND g.colegio_id = ?
     LIMIT 1`,
    [grupoId, colegioId]
  );
  const grupo = grupos && grupos[0];
  if (!grupo) return { ok: false, status: 404, error: 'No se encontró el aula.' };

  const rows = await cargarAsistenciasMesGrupos(
    colegioId,
    [grupoId],
    columnas[0].fecha,
    columnas[columnas.length - 1].fecha,
    { conHora: true }
  );
  const diasSet = new Set(columnas.map((c) => c.fecha));
  const filas = [];
  for (const row of rows || []) {
    const f = String(row.fecha || '').slice(0, 10);
    if (!diasSet.has(f)) continue;
    const cod = codigoTipoAsistencia(row.tipo);
    if (!set.has(cod)) continue;
    filas.push({
      matricula_id: row.matricula_id,
      alumno_nombre: nombreAlumno(row),
      fecha: f,
      fecha_texto: fmtFechaLarga(f),
      codigo: cod,
      tipo_etiqueta:
        cod === 'T'
          ? 'Tardanza'
          : cod === 'TJ'
            ? 'Tardanza justificada'
            : cod === 'F'
              ? 'Falta'
              : 'Falta justificada',
      hora: formatHora(row.hora_entrada),
    });
  }
  filas.sort((a, b) => {
    const fa = String(a.fecha).localeCompare(String(b.fecha));
    if (fa !== 0) return fa;
    return String(a.alumno_nombre).localeCompare(String(b.alumno_nombre), 'es');
  });

  return {
    ok: true,
    grupo_id: grupoId,
    aula: etiquetaAula(grupo),
    tipo,
    etiqueta: ETIQUETA_DETALLE[tipo] || 'Detalle',
    filas,
    total: filas.length,
  };
}

const BORDER = {
  top: { style: 'thin', color: { argb: 'FF94A3B8' } },
  left: { style: 'thin', color: { argb: 'FF94A3B8' } },
  bottom: { style: 'thin', color: { argb: 'FF94A3B8' } },
  right: { style: 'thin', color: { argb: 'FF94A3B8' } },
};

const FILL_TARD = 'FFFFEDD5';
const FILL_FALTA = 'FFFFE4E6';
const FILL_NJ = 'FFEDE9FE';
const FILL_PAR = 'FFF8FAFC';
const FILL_NIVEL = 'FFDBEAFE';
const FILL_SUB = 'FFEFF6FF';
const FILL_TOT = 'FF1D4ED8';

function pintarRango(ws, rowNum, cols, fn) {
  for (let c = 1; c <= cols; c += 1) fn(ws.getCell(rowNum, c), c);
}

async function nombreColegio(colegioId) {
  try {
    const rows = await query(`SELECT nombre FROM colegios WHERE id = ? LIMIT 1`, [colegioId]);
    return String(rows?.[0]?.nombre || '').trim() || 'Colegio';
  } catch {
    return 'Colegio';
  }
}

async function generarExcelConsolidadoAsistencia(colegioId, filtros) {
  const data = await obtenerConsolidadoAsistencia(colegioId, filtros);
  if (!data.ok) return data;

  const colegio = await nombreColegio(colegioId);
  const tot = data.totales || { alumnos: 0, ...vaciosConteo() };
  const COLS = 7;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'VanguardNet';
  const ws = wb.addWorksheet('Consolidado', {
    views: [{ state: 'frozen', ySplit: 4, showGridLines: false }],
    pageSetup: {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
      paperSize: 9,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    },
  });

  ws.getColumn(1).width = 22;
  ws.getColumn(2).width = 12;
  ws.getColumn(3).width = 13;
  ws.getColumn(4).width = 15;
  ws.getColumn(5).width = 12;
  ws.getColumn(6).width = 15;
  ws.getColumn(7).width = 16;

  ws.mergeCells('A1:G1');
  const t1 = ws.getCell('A1');
  t1.value = String(colegio).toUpperCase();
  t1.font = { bold: true, size: 11, color: { argb: 'FF1E3A8A' } };
  t1.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 18;

  ws.mergeCells('A2:G2');
  const t2 = ws.getCell('A2');
  t2.value = 'CONSOLIDADO DE ASISTENCIA';
  t2.font = { bold: true, size: 16, color: { argb: 'FF1D4ED8' } };
  t2.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(2).height = 24;

  ws.mergeCells('A3:G3');
  const t3 = ws.getCell('A3');
  t3.value = `${data.subtitulo}  ·  ${data.aulas} aulas  ·  ${tot.alumnos} alumnos`;
  t3.font = { size: 10, color: { argb: 'FF64748B' } };
  t3.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(3).height = 16;

  const head = ws.getRow(4);
  head.values = [
    'Aula',
    'Alumnos',
    'Tardanzas',
    'Tard. no just.',
    'Faltas',
    'Faltas no just.',
    'No justificadas',
  ];
  head.height = 28;
  pintarRango(ws, 4, COLS, (cell, c) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 };
    cell.alignment = { vertical: 'middle', horizontal: c === 1 ? 'left' : 'center', wrapText: true };
    cell.border = BORDER;
  });

  let r = 5;
  let zebra = 0;
  for (const b of data.bloques || []) {
    ws.mergeCells(`A${r}:G${r}`);
    const niv = ws.getCell(`A${r}`);
    niv.value = String(b.nivel_nombre || 'Nivel').toUpperCase();
    niv.font = { bold: true, size: 10, color: { argb: 'FF1E40AF' } };
    niv.alignment = { vertical: 'middle', horizontal: 'left' };
    pintarRango(ws, r, COLS, (cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL_NIVEL } };
      cell.border = BORDER;
    });
    ws.getRow(r).height = 20;
    r += 1;

    for (const f of b.filas || []) {
      const row = ws.getRow(r);
      row.values = [
        f.aula,
        f.alumnos,
        f.tardanzas,
        f.tardanzas_no_just,
        f.faltas,
        f.faltas_no_just,
        f.no_justificadas,
      ];
      const bg = zebra % 2 === 1 ? FILL_PAR : 'FFFFFFFF';
      pintarRango(ws, r, COLS, (cell, c) => {
        let fill = bg;
        if (c === 3 || c === 4) fill = FILL_TARD;
        if (c === 5 || c === 6) fill = FILL_FALTA;
        if (c === 7) fill = FILL_NJ;
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
        cell.font = { size: 10, bold: c === 1 };
        cell.alignment = { vertical: 'middle', horizontal: c === 1 ? 'left' : 'center' };
        cell.border = BORDER;
      });
      ws.getRow(r).height = 18;
      zebra += 1;
      r += 1;
    }

    const st = b.totales || { alumnos: 0, ...vaciosConteo() };
    const sub = ws.getRow(r);
    sub.values = [
      `Subtotal ${b.nivel_nombre}`,
      st.alumnos,
      st.tardanzas,
      st.tardanzas_no_just,
      st.faltas,
      st.faltas_no_just,
      st.no_justificadas,
    ];
    pintarRango(ws, r, COLS, (cell, c) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL_SUB } };
      cell.font = { bold: true, size: 9, color: { argb: 'FF334155' } };
      cell.alignment = { vertical: 'middle', horizontal: c === 1 ? 'left' : 'center' };
      cell.border = BORDER;
    });
    ws.getRow(r).height = 18;
    r += 1;
  }

  const totRow = ws.getRow(r);
  totRow.values = [
    `TOTAL · ${data.aulas} aulas`,
    tot.alumnos,
    tot.tardanzas,
    tot.tardanzas_no_just,
    tot.faltas,
    tot.faltas_no_just,
    tot.no_justificadas,
  ];
  totRow.height = 22;
  pintarRango(ws, r, COLS, (cell, c) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL_TOT } };
    cell.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { vertical: 'middle', horizontal: c === 1 ? 'left' : 'center' };
    cell.border = BORDER;
  });

  ws.headerFooter.oddFooter = '&LVanguardNet&CConsolidado de asistencia&RPágina &P de &N';

  const buffer = await wb.xlsx.writeBuffer();
  return {
    ok: true,
    buffer,
    filename: `consolidado_asistencia_${data.mes_nombre}_${data.anio}.xlsx`.replace(/\s+/g, '_'),
  };
}

module.exports = {
  obtenerConsolidadoAsistencia,
  obtenerDetalleConsolidadoAsistencia,
  generarExcelConsolidadoAsistencia,
};
