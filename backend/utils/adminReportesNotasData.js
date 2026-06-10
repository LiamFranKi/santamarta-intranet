/**
 * Motor de datos para reportes de notas (admin / promotoría).
 */
const { query } = require('./mysql');

const CONDUCTA_ASIGNATURA_ID = -101;

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

async function resolveAnioColegio(colegioId, anioQ) {
  const [cRow] = await query('SELECT anio_activo, nombre FROM colegios WHERE id = ? LIMIT 1', [colegioId]);
  const anio = Number.isFinite(anioQ)
    ? anioQ
    : parseInt(cRow?.anio_activo || new Date().getFullYear(), 10);
  return { anio, colegio_nombre: cRow?.nombre || 'Colegio' };
}

function parseNumPromedio(raw) {
  if (raw == null || raw === '' || raw === '-') return null;
  const n = parseFloat(String(raw).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function parseLetraPromedio(raw) {
  if (raw == null || raw === '') return null;
  const s = String(raw).trim().toUpperCase();
  return /^[A-D]{1,2}$/.test(s) || s === 'AD' ? s : null;
}

function etiquetaGrupo(g) {
  const sec = String(g.seccion ?? '').trim();
  return `${g.nivel_nombre || 'Nivel'} · ${g.grado}° · Sec. ${sec || '—'}`;
}

function round2(n) {
  return Math.round(n * 100) / 100;
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

/** ¿Tiene nota registrada en el bimestre? (numérica o cualitativa) */
function notaEstaRegistrada(eng, matriculaId, asignaturaId, esCualitativo) {
  const raw = eng.promMap[`${matriculaId}:${asignaturaId}`];
  if (esCualitativo) return eng.parseLetraPromedio(raw) != null;
  return eng.parseNumPromedio(raw) != null;
}

/** Query string / body → entero opcional */
function optInt(v) {
  if (v == null || v === '') return undefined;
  const n = typeof v === 'number' ? v : parseInt(v, 10);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * @param {Function} queryFn
 * @param {object} opts
 */
async function buildNotasEngine(queryFn, opts) {
  const colegioId = opts.colegioId;
  const anio = opts.anio;
  const ciclo = opts.ciclo;
  const nivelId = optInt(opts.nivelId ?? opts.nivel_id);
  const grupoId = optInt(opts.grupoId ?? opts.grupo_id);
  const cursoId = optInt(opts.cursoId ?? opts.curso_id);
  const areaId = optInt(opts.areaId ?? opts.area_id);
  const grado =
    opts.grado != null && String(opts.grado).trim() !== '' ? String(opts.grado).trim() : undefined;
  const soloNumericos = opts.soloNumericos;
  const cicloInt = Math.min(4, Math.max(1, parseInt(ciclo, 10) || 1));

  let grupoSql = `
    SELECT g.id AS grupo_id, g.grado, g.seccion, g.nivel_id,
           n.nombre AS nivel_nombre, n.tipo_calificacion, n.nota_aprobatoria, n.nota_maxima
    FROM grupos g
    INNER JOIN niveles n ON n.id = g.nivel_id AND n.colegio_id = g.colegio_id
    WHERE g.colegio_id = ? AND g.anio = ?`;
  const grupoParams = [colegioId, anio];
  if (Number.isFinite(nivelId)) {
    grupoSql += ' AND g.nivel_id = ?';
    grupoParams.push(nivelId);
  }
  if (grado != null && String(grado).trim() !== '') {
    grupoSql += ' AND CAST(g.grado AS CHAR) = ?';
    grupoParams.push(String(grado).trim());
  }
  if (Number.isFinite(grupoId)) {
    grupoSql += ' AND g.id = ?';
    grupoParams.push(grupoId);
  }
  grupoSql += ` ORDER BY ${ORDEN_NIVEL_SQL}`;

  const grupos = await queryFn(grupoSql, grupoParams);
  const grupoIds = grupos.map((g) => g.grupo_id);
  if (grupoIds.length === 0) {
    return { ciclo: cicloInt, anio, grupos: [], alumnos: [], asignaturas: [], promedios: [], areas: [] };
  }

  const inG = grupoIds.map(() => '?').join(',');

  const alumnos = await queryFn(
    `SELECT m.id AS matricula_id, m.grupo_id, m.alumno_id,
            a.nombres, a.apellido_paterno, a.apellido_materno
     FROM matriculas m
     INNER JOIN alumnos a ON a.id = m.alumno_id
     WHERE m.grupo_id IN (${inG}) AND m.colegio_id = ? AND (m.estado = 0)
     ORDER BY a.apellido_paterno, a.apellido_materno, a.nombres`,
    [...grupoIds, colegioId]
  );

  let asigSql = `
    SELECT a.id AS asignatura_id, a.grupo_id, a.curso_id, c.nombre AS curso_nombre
    FROM asignaturas a
    INNER JOIN cursos c ON c.id = a.curso_id
    WHERE a.grupo_id IN (${inG}) AND a.colegio_id = ?`;
  const asigParams = [...grupoIds, colegioId];
  if (Number.isFinite(cursoId)) {
    asigSql += ' AND a.curso_id = ?';
    asigParams.push(cursoId);
  }
  if (Number.isFinite(areaId)) {
    asigSql += ` AND EXISTS (
      SELECT 1 FROM areas_cursos ac WHERE ac.curso_id = a.curso_id AND ac.area_id = ?
    )`;
    asigParams.push(areaId);
  }
  asigSql += ' ORDER BY c.nombre ASC';
  const asignaturas = await queryFn(asigSql, asigParams);

  const matriculaIds = alumnos.map((a) => a.matricula_id);
  let promedios = [];
  if (matriculaIds.length > 0) {
    const inM = matriculaIds.map(() => '?').join(',');
    promedios = await queryFn(
      `SELECT p.matricula_id, p.asignatura_id, p.promedio
       FROM promedios p
       WHERE p.matricula_id IN (${inM}) AND p.ciclo = ?`,
      [...matriculaIds, cicloInt]
    );
  }

  const asignaturaIdsAcad = asignaturas
    .map((a) => a.asignatura_id)
    .filter((id) => id !== CONDUCTA_ASIGNATURA_ID);

  const grupoMap = {};
  grupos.forEach((g) => {
    grupoMap[g.grupo_id] = {
      ...g,
      label: etiquetaGrupo(g),
      es_cualitativo: g.tipo_calificacion === 0,
    };
  });

  const asignPorGrupo = {};
  asignaturas.forEach((a) => {
    if (!asignPorGrupo[a.grupo_id]) asignPorGrupo[a.grupo_id] = [];
    asignPorGrupo[a.grupo_id].push(a);
  });

  const alumnosPorGrupo = {};
  alumnos.forEach((a) => {
    if (!alumnosPorGrupo[a.grupo_id]) alumnosPorGrupo[a.grupo_id] = [];
    alumnosPorGrupo[a.grupo_id].push(a);
  });

  const promMap = {};
  promedios.forEach((p) => {
    const key = `${p.matricula_id}:${p.asignatura_id}`;
    promMap[key] = p.promedio;
  });

  function promedioAlumnoAcademico(matriculaId, gid) {
    const asigs = asignPorGrupo[gid] || [];
    const vals = [];
    asigs.forEach((as) => {
      if (as.asignatura_id === CONDUCTA_ASIGNATURA_ID) return;
      const raw = promMap[`${matriculaId}:${as.asignatura_id}`];
      const n = parseNumPromedio(raw);
      if (n != null) vals.push(n);
    });
    if (vals.length === 0) return null;
    return round2(vals.reduce((s, v) => s + v, 0) / vals.length);
  }

  function promedioConducta(matriculaId) {
    const raw = promMap[`${matriculaId}:${CONDUCTA_ASIGNATURA_ID}`];
    return parseNumPromedio(raw);
  }

  function promedioCursoEnGrupo(gid, asignaturaId) {
    const list = alumnosPorGrupo[gid] || [];
    const vals = [];
    list.forEach((al) => {
      const n = parseNumPromedio(promMap[`${al.matricula_id}:${asignaturaId}`]);
      if (n != null) vals.push(n);
    });
    if (vals.length === 0) return null;
    return round2(vals.reduce((s, v) => s + v, 0) / vals.length);
  }

  function statsSalon(gid, { soloAcademico = true } = {}) {
    const g = grupoMap[gid];
    if (!g) return null;
    const list = alumnosPorGrupo[gid] || [];
    const notaApr = parseFloat(g.nota_aprobatoria) || 11;
    const promsAlumnos = [];
    let aprobados = 0;
    let conNotas = 0;
    list.forEach((al) => {
      const p = soloAcademico ? promedioAlumnoAcademico(al.matricula_id, gid) : promedioConducta(al.matricula_id);
      if (p != null) {
        conNotas++;
        promsAlumnos.push(p);
        if (p >= notaApr) aprobados++;
      }
    });
    const total = list.length;
    const promSalon = promsAlumnos.length
      ? round2(promsAlumnos.reduce((s, v) => s + v, 0) / promsAlumnos.length)
      : null;
    return {
      grupo_id: gid,
      label: g.label,
      nivel_nombre: g.nivel_nombre,
      grado: g.grado,
      seccion: g.seccion,
      nivel_id: g.nivel_id,
      tipo_calificacion: g.tipo_calificacion,
      promedio: promSalon,
      alumnos_total: total,
      alumnos_con_notas: conNotas,
      pct_aprobados: total > 0 ? round2((aprobados / total) * 100) : null,
      pct_cobertura: total > 0 ? round2((conNotas / total) * 100) : null,
    };
  }

  const rankingSalones = (filterFn = () => true) => {
    const rows = [];
    grupos.forEach((g) => {
      if (soloNumericos && g.tipo_calificacion === 0) return;
      if (!filterFn(g)) return;
      const st = statsSalon(g.grupo_id, { soloAcademico: true });
      if (st) rows.push(st);
    });
    rows.sort((a, b) => {
      const pa = a.promedio != null ? a.promedio : -1;
      const pb = b.promedio != null ? b.promedio : -1;
      return pb - pa;
    });
    return rows.map((r, i) => ({ ...r, puesto: i + 1 }));
  };

  return {
    ciclo: cicloInt,
    anio,
    grupos,
    grupoMap,
    alumnos,
    alumnosPorGrupo,
    asignaturas,
    asignPorGrupo,
    promMap,
    promedioAlumnoAcademico,
    promedioConducta,
    promedioCursoEnGrupo,
    statsSalon,
    rankingSalones,
    parseNumPromedio,
    parseLetraPromedio,
  };
}

async function getMeta(colegioId, anioQ) {
  const [colegioRow] = await query(
    'SELECT anio_activo, nombre FROM colegios WHERE id = ? LIMIT 1',
    [colegioId]
  );
  const anio = Number.isFinite(anioQ) ? anioQ : parseInt(colegioRow?.anio_activo || new Date().getFullYear(), 10);

  const grupos = await query(
    `SELECT g.id AS grupo_id, g.nivel_id, g.grado, g.seccion, n.nombre AS nivel_nombre, n.tipo_calificacion
     FROM grupos g
     INNER JOIN niveles n ON n.id = g.nivel_id AND n.colegio_id = g.colegio_id
     WHERE g.colegio_id = ? AND g.anio = ?
     ORDER BY ${ORDEN_NIVEL_SQL}`,
    [colegioId, anio]
  );

  const cursos = await query(
    `SELECT DISTINCT c.id, c.nombre
     FROM asignaturas a
     INNER JOIN cursos c ON c.id = a.curso_id
     INNER JOIN grupos g ON g.id = a.grupo_id
     WHERE a.colegio_id = ? AND g.anio = ?
     ORDER BY c.nombre ASC`,
    [colegioId, anio]
  );

  const areas = await query(
    `SELECT id, nombre FROM areas WHERE colegio_id = ? ORDER BY nombre ASC`,
    [colegioId]
  );

  const nivelesRaw = await query(
    `SELECT DISTINCT n.id, n.nombre, n.tipo_calificacion
     FROM niveles n
     INNER JOIN grupos g ON g.nivel_id = n.id AND g.colegio_id = n.colegio_id
     WHERE g.colegio_id = ? AND g.anio = ?
     ORDER BY
       CASE
         WHEN LOWER(TRIM(COALESCE(n.nombre, ''))) LIKE '%inicial%' THEN 1
         WHEN LOWER(TRIM(COALESCE(n.nombre, ''))) LIKE '%primaria%' THEN 2
         WHEN LOWER(TRIM(COALESCE(n.nombre, ''))) LIKE '%secundaria%' THEN 3
         ELSE 4
       END ASC,
       n.id ASC`,
    [colegioId, anio]
  );

  /** Inicial tiene reporte cualitativo aparte; no va en combobox numérico */
  const niveles = (nivelesRaw || []).filter(
    (n) => Number(n.tipo_calificacion) !== 0 && !/inicial/i.test(String(n.nombre || ''))
  );
  const niveles_inicial = (nivelesRaw || []).filter(
    (n) => Number(n.tipo_calificacion) === 0 || /inicial/i.test(String(n.nombre || ''))
  );

  const cursosVinculo = await query(
    `SELECT DISTINCT c.id AS curso_id, c.nombre AS curso_nombre, g.nivel_id, g.grado
     FROM asignaturas a
     INNER JOIN cursos c ON c.id = a.curso_id
     INNER JOIN grupos g ON g.id = a.grupo_id AND g.colegio_id = a.colegio_id
     WHERE a.colegio_id = ? AND g.anio = ?
     ORDER BY c.nombre ASC, g.nivel_id ASC, g.grado ASC`,
    [colegioId, anio]
  );

  return {
    anio,
    colegio_nombre: colegioRow?.nombre || 'Colegio',
    grupos: grupos.map((g) => ({
      grupo_id: g.grupo_id,
      key: String(g.grupo_id),
      nivel_id: g.nivel_id,
      grado: g.grado,
      seccion: g.seccion,
      label: etiquetaGrupo(g),
      tipo_calificacion: g.tipo_calificacion,
    })),
    cursos: cursos || [],
    cursos_vinculo: cursosVinculo || [],
    areas: areas || [],
    niveles: niveles || [],
    niveles_inicial: niveles_inicial || [],
  };
}

async function reportRankingSalonesGeneral(colegioId, params) {
  const eng = await buildNotasEngine(query, {
    colegioId,
    anio: params.anio,
    ciclo: params.ciclo,
    nivel_id: params.nivel_id,
    grado: params.grado,
    soloNumericos: true,
  });
  const filas = eng.rankingSalones();
  const maxProm = filas[0]?.promedio || 20;
  return {
    titulo: 'Ranking de salones — Promedio general académico',
    ciclo: eng.ciclo,
    anio: eng.anio,
    filas,
    chart: filas.map((f) => ({
      label: f.label,
      value: f.promedio,
      pct: maxProm > 0 && f.promedio != null ? Math.round((f.promedio / maxProm) * 100) : 0,
    })),
  };
}

async function reportRankingSalonesCurso(colegioId, params) {
  const cursoId = parseInt(params.curso_id, 10);
  if (!Number.isFinite(cursoId)) {
    const err = new Error('curso_id es requerido');
    err.status = 400;
    throw err;
  }
  const eng = await buildNotasEngine(query, {
    colegioId,
    anio: params.anio,
    ciclo: params.ciclo,
    nivel_id: params.nivel_id,
    grado: params.grado,
    curso_id: cursoId,
    soloNumericos: true,
  });
  const filas = [];
  eng.grupos.forEach((g) => {
    if (g.tipo_calificacion === 0) return;
    const asig = (eng.asignPorGrupo[g.grupo_id] || []).find((a) => a.curso_id === cursoId);
    if (!asig) return;
    const prom = eng.promedioCursoEnGrupo(g.grupo_id, asig.asignatura_id);
    const st = eng.statsSalon(g.grupo_id);
    filas.push({
      grupo_id: g.grupo_id,
      label: eng.grupoMap[g.grupo_id].label,
      curso_nombre: asig.curso_nombre,
      promedio: prom,
      alumnos_total: st?.alumnos_total ?? 0,
      alumnos_con_notas: st?.alumnos_con_notas ?? 0,
    });
  });
  filas.sort((a, b) => (b.promedio ?? -1) - (a.promedio ?? -1));
  const ranked = filas.map((f, i) => ({ ...f, puesto: i + 1 }));
  const maxProm = ranked[0]?.promedio || 20;
  const cursoNombre = ranked[0]?.curso_nombre || 'Curso';
  return {
    titulo: `Ranking de salones — ${cursoNombre}`,
    ciclo: eng.ciclo,
    anio: eng.anio,
    curso_nombre: cursoNombre,
    filas: ranked,
    chart: ranked.map((f) => ({
      label: f.label,
      value: f.promedio,
      pct: maxProm > 0 && f.promedio != null ? Math.round((f.promedio / maxProm) * 100) : 0,
    })),
  };
}

async function reportMatrizCursosSalones(colegioId, params) {
  const eng = await buildNotasEngine(query, {
    colegioId,
    anio: params.anio,
    ciclo: params.ciclo,
    nivel_id: params.nivel_id,
    grado: params.grado,
    soloNumericos: true,
  });
  const cursosSet = new Map();
  eng.asignaturas.forEach((a) => {
    if (!cursosSet.has(a.curso_id)) cursosSet.set(a.curso_id, a.curso_nombre);
  });
  const cursos = [...cursosSet.entries()].map(([id, nombre]) => ({ curso_id: id, nombre }));
  cursos.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  const salones = eng.grupos.filter((g) => g.tipo_calificacion !== 0).map((g) => ({
    grupo_id: g.grupo_id,
    label: eng.grupoMap[g.grupo_id].label,
  }));

  const celdas = [];
  cursos.forEach((c) => {
    salones.forEach((s) => {
      const asig = (eng.asignPorGrupo[s.grupo_id] || []).find((a) => a.curso_id === c.curso_id);
      const val = asig ? eng.promedioCursoEnGrupo(s.grupo_id, asig.asignatura_id) : null;
      celdas.push({
        curso_id: c.curso_id,
        curso_nombre: c.nombre,
        grupo_id: s.grupo_id,
        salon_label: s.label,
        promedio: val,
      });
    });
  });

  return {
    titulo: 'Matriz cursos × salones',
    ciclo: eng.ciclo,
    anio: eng.anio,
    cursos,
    salones,
    celdas,
  };
}

async function reportMejoresCursosColegio(colegioId, params) {
  const eng = await buildNotasEngine(query, {
    colegioId,
    anio: params.anio,
    ciclo: params.ciclo,
    nivel_id: params.nivel_id,
    soloNumericos: true,
  });
  const byCurso = new Map();
  eng.asignaturas.forEach((a) => {
    const g = eng.grupoMap[a.grupo_id];
    if (!g || g.tipo_calificacion === 0) return;
    const n = eng.promedioCursoEnGrupo(a.grupo_id, a.asignatura_id);
    if (n == null) return;
    if (!byCurso.has(a.curso_id)) {
      byCurso.set(a.curso_id, { curso_id: a.curso_id, nombre: a.curso_nombre, sum: 0, count: 0 });
    }
    const row = byCurso.get(a.curso_id);
    row.sum += n;
    row.count += 1;
  });
  const filas = [...byCurso.values()]
    .map((r) => ({
      curso_id: r.curso_id,
      curso_nombre: r.nombre,
      promedio: round2(r.sum / r.count),
      secciones_evaluadas: r.count,
    }))
    .sort((a, b) => b.promedio - a.promedio)
    .map((f, i) => ({ ...f, puesto: i + 1 }));
  const maxProm = filas[0]?.promedio || 20;
  return {
    titulo: 'Mejores cursos del colegio (promedio institucional por materia)',
    ciclo: eng.ciclo,
    anio: eng.anio,
    filas,
    chart: filas.slice(0, 15).map((f) => ({
      label: f.curso_nombre,
      value: f.promedio,
      pct: maxProm > 0 ? Math.round((f.promedio / maxProm) * 100) : 0,
    })),
  };
}

async function reportResumenEjecutivo(colegioId, params) {
  const ranking = await reportRankingSalonesGeneral(colegioId, params);
  const filas = ranking.filas.filter((f) => f.promedio != null);
  const institucional =
    filas.length > 0
      ? round2(filas.reduce((s, f) => s + f.promedio, 0) / filas.length)
      : null;
  return {
    titulo: 'Resumen ejecutivo — Notas',
    ciclo: ranking.ciclo,
    anio: ranking.anio,
    kpis: {
      promedio_institucional: institucional,
      mejor_salon: filas[0] || null,
      peor_salon: filas[filas.length - 1] || null,
      total_salones: ranking.filas.length,
      salones_con_datos: filas.length,
    },
    filas: ranking.filas,
    chart: ranking.chart,
  };
}

async function reportDetalleSalon(colegioId, params) {
  const gid = parseInt(params.grupo_id, 10);
  if (!Number.isFinite(gid)) {
    const err = new Error('grupo_id es requerido');
    err.status = 400;
    throw err;
  }
  const eng = await buildNotasEngine(query, {
    colegioId,
    anio: params.anio,
    ciclo: params.ciclo,
    grupo_id: gid,
  });
  const g = eng.grupoMap[gid];
  const alumnos = (eng.alumnosPorGrupo[gid] || []).map((al, idx) => {
    const promAcad = eng.promedioAlumnoAcademico(al.matricula_id, gid);
    const promCond = eng.promedioConducta(al.matricula_id);
    return {
      puesto: 0,
      matricula_id: al.matricula_id,
      nombre: `${al.apellido_paterno} ${al.apellido_materno}, ${al.nombres}`.trim(),
      promedio_academico: promAcad,
      promedio_conducta: promCond,
    };
  });
  alumnos.sort((a, b) => (b.promedio_academico ?? -1) - (a.promedio_academico ?? -1));
  alumnos.forEach((a, i) => {
    a.puesto = i + 1;
  });

  const cursosSalon = (eng.asignPorGrupo[gid] || [])
    .filter((a) => a.asignatura_id !== CONDUCTA_ASIGNATURA_ID)
    .map((a) => ({
      curso_nombre: a.curso_nombre,
      asignatura_id: a.asignatura_id,
      promedio: eng.promedioCursoEnGrupo(gid, a.asignatura_id),
    }))
    .sort((a, b) => (b.promedio ?? -1) - (a.promedio ?? -1));

  const maxA = alumnos[0]?.promedio_academico || 20;
  return {
    titulo: `Detalle del salón — ${g?.label || ''}`,
    ciclo: eng.ciclo,
    anio: eng.anio,
    grupo: g,
    stats: eng.statsSalon(gid),
    alumnos,
    cursos: cursosSalon,
    chart_alumnos: alumnos.slice(0, 25).map((a) => ({
      label: a.nombre.length > 28 ? `${a.nombre.slice(0, 26)}…` : a.nombre,
      value: a.promedio_academico,
      pct: maxA > 0 && a.promedio_academico != null ? Math.round((a.promedio_academico / maxA) * 100) : 0,
    })),
    chart_cursos: cursosSalon.map((c) => ({
      label: c.curso_nombre,
      value: c.promedio,
      pct:
        cursosSalon[0]?.promedio > 0 && c.promedio != null
          ? Math.round((c.promedio / (cursosSalon[0].promedio || 20)) * 100)
          : 0,
    })),
  };
}

async function reportComparativaSecciones(colegioId, params) {
  const nivelId = parseInt(params.nivel_id, 10);
  const grado = params.grado != null ? String(params.grado).trim() : '';
  if (!Number.isFinite(nivelId) || grado === '') {
    const err = new Error('nivel_id y grado son requeridos');
    err.status = 400;
    throw err;
  }
  return reportRankingSalonesGeneral(colegioId, {
    ...params,
    nivel_id: nivelId,
    grado,
  });
}

async function reportPanelGeneral(colegioId, params) {
  const eng = await buildNotasEngine(query, {
    colegioId,
    anio: params.anio,
    ciclo: params.ciclo,
    nivel_id: params.nivel_id,
    soloNumericos: true,
  });
  const todosProms = [];
  const rangos = { '0-10': 0, '11-14': 0, '15-17': 0, '18-20': 0 };
  let aprobados = 0;
  let totalAlumnos = 0;

  eng.grupos.forEach((g) => {
    if (g.tipo_calificacion === 0) return;
    const notaApr = parseFloat(g.nota_aprobatoria) || 11;
    (eng.alumnosPorGrupo[g.grupo_id] || []).forEach((al) => {
      totalAlumnos++;
      const p = eng.promedioAlumnoAcademico(al.matricula_id, g.grupo_id);
      if (p == null) return;
      todosProms.push(p);
      if (p >= notaApr) aprobados++;
      if (p <= 10) rangos['0-10']++;
      else if (p <= 14) rangos['11-14']++;
      else if (p <= 17) rangos['15-17']++;
      else rangos['18-20']++;
    });
  });

  const promInst =
    todosProms.length > 0 ? round2(todosProms.reduce((s, v) => s + v, 0) / todosProms.length) : null;

  const chartRangos = Object.entries(rangos).map(([label, count]) => ({
    label,
    value: count,
    pct: totalAlumnos > 0 ? Math.round((count / totalAlumnos) * 100) : 0,
  }));

  return {
    titulo: 'Panel general — Estadísticas de notas',
    ciclo: eng.ciclo,
    anio: eng.anio,
    kpis: {
      promedio_institucional: promInst,
      alumnos_evaluados: todosProms.length,
      alumnos_matriculados: totalAlumnos,
      pct_aprobados: todosProms.length > 0 ? round2((aprobados / todosProms.length) * 100) : null,
    },
    rangos,
    chart: chartRangos,
  };
}

async function reportEvolucionBimestres(colegioId, params) {
  const gid = params.grupo_id != null ? parseInt(params.grupo_id, 10) : null;
  const nivelId = params.nivel_id != null ? parseInt(params.nivel_id, 10) : null;
  const grado = params.grado != null ? String(params.grado).trim() : null;
  const series = [];

  for (let c = 1; c <= 4; c++) {
    const eng = await buildNotasEngine(query, {
      colegioId,
      anio: params.anio,
      ciclo: c,
      grupo_id: Number.isFinite(gid) ? gid : undefined,
      nivel_id: Number.isFinite(nivelId) ? nivelId : undefined,
      grado: grado || undefined,
      soloNumericos: true,
    });
    const ranked = eng.rankingSalones();
    const prom =
      ranked.filter((r) => r.promedio != null).length > 0
        ? round2(
            ranked.filter((r) => r.promedio != null).reduce((s, r) => s + r.promedio, 0) /
              ranked.filter((r) => r.promedio != null).length
          )
        : null;
    series.push({ bimestre: c, label: `${c}° bim.`, promedio: prom, salones: ranked });
  }

  return {
    titulo: Number.isFinite(gid)
      ? `Evolución bimestral — ${series[0]?.salones?.[0]?.label || 'Salón'}`
      : 'Evolución bimestral — Promedio por bimestre',
    anio: params.anio,
    series,
    chart: series.map((s) => ({ label: s.label, value: s.promedio, pct: s.promedio != null ? (s.promedio / 20) * 100 : 0 })),
  };
}

async function reportPorArea(colegioId, params) {
  const areaId = params.area_id != null ? parseInt(params.area_id, 10) : null;
  const areas = await query(`SELECT id, nombre FROM areas WHERE colegio_id = ? ORDER BY nombre`, [colegioId]);

  const filasArea = [];
  for (const area of areas) {
    if (Number.isFinite(areaId) && area.id !== areaId) continue;
    const eng = await buildNotasEngine(query, {
      colegioId,
      anio: params.anio,
      ciclo: params.ciclo,
      area_id: area.id,
      nivel_id: params.nivel_id,
      soloNumericos: true,
    });
    const proms = [];
    eng.grupos.forEach((g) => {
      if (g.tipo_calificacion === 0) return;
      const st = eng.statsSalon(g.grupo_id);
      if (st?.promedio != null) proms.push(st.promedio);
    });
    if (proms.length === 0) continue;
    filasArea.push({
      area_id: area.id,
      area_nombre: area.nombre,
      promedio: round2(proms.reduce((s, v) => s + v, 0) / proms.length),
      salones: proms.length,
    });
  }
  filasArea.sort((a, b) => b.promedio - a.promedio);
  const ranked = filasArea.map((f, i) => ({ ...f, puesto: i + 1 }));
  const maxP = ranked[0]?.promedio || 20;
  return {
    titulo: 'Promedio por área curricular',
    ciclo: parseInt(params.ciclo, 10) || 1,
    anio: params.anio,
    filas: ranked,
    chart: ranked.map((f) => ({
      label: f.area_nombre,
      value: f.promedio,
      pct: maxP > 0 ? Math.round((f.promedio / maxP) * 100) : 0,
    })),
  };
}

async function reportCobertura(colegioId, params) {
  const eng = await buildNotasEngine(query, {
    colegioId,
    anio: params.anio,
    ciclo: params.ciclo,
    nivel_id: params.nivel_id,
    grado: params.grado,
  });
  const filas = eng.grupos.map((g) => {
    const st = eng.statsSalon(g.grupo_id);
    const esCualitativo = g.tipo_calificacion === 0;
    const asigsAcad = (eng.asignPorGrupo[g.grupo_id] || []).filter(
      (a) => a.asignatura_id !== CONDUCTA_ASIGNATURA_ID
    );
    const alumnos = eng.alumnosPorGrupo[g.grupo_id] || [];
    const esperados = alumnos.length * asigsAcad.length;
    let registrados = 0;
    alumnos.forEach((al) => {
      asigsAcad.forEach((as) => {
        if (notaEstaRegistrada(eng, al.matricula_id, as.asignatura_id, esCualitativo)) registrados++;
      });
    });
    let cursosIncompletos = 0;
    asigsAcad.forEach((as) => {
      let regCurso = 0;
      alumnos.forEach((al) => {
        if (notaEstaRegistrada(eng, al.matricula_id, as.asignatura_id, esCualitativo)) regCurso++;
      });
      if (alumnos.length > 0 && regCurso < alumnos.length) cursosIncompletos++;
    });
    const pct = esperados > 0 ? round2((registrados / esperados) * 100) : null;
    return {
      grupo_id: g.grupo_id,
      label: eng.grupoMap[g.grupo_id].label,
      alumnos: st?.alumnos_total ?? 0,
      cursos: asigsAcad.length,
      notas_registradas: registrados,
      notas_esperadas: esperados,
      cursos_incompletos: cursosIncompletos,
      pct_cobertura: pct,
      promedio_salon: st?.promedio ?? null,
    };
  });
  filas.sort((a, b) => (a.pct_cobertura ?? 0) - (b.pct_cobertura ?? 0));
  const ranked = filas.map((f, i) => ({ ...f, puesto: i + 1 }));
  return {
    titulo: 'Cobertura de registro de notas',
    ciclo: eng.ciclo,
    anio: eng.anio,
    filas: ranked,
    chart: ranked.map((f) => ({
      label: f.label.length > 22 ? `${f.label.slice(0, 20)}…` : f.label,
      value: f.pct_cobertura,
      pct: f.pct_cobertura ?? 0,
    })),
  };
}

async function reportCoberturaDetalle(colegioId, params) {
  const grupoId = parseInt(params.grupo_id, 10);
  if (!Number.isFinite(grupoId)) {
    const err = new Error('Indique un salón válido (grupo_id).');
    err.status = 400;
    throw err;
  }

  const eng = await buildNotasEngine(query, {
    colegioId,
    anio: params.anio,
    ciclo: params.ciclo,
    grupoId,
  });

  if (!eng.grupos.length) {
    const err = new Error('Salón no encontrado para el año indicado.');
    err.status = 404;
    throw err;
  }

  const g = eng.grupos[0];
  const esCualitativo = g.tipo_calificacion === 0;
  const st = eng.statsSalon(g.grupo_id);
  const alumnos = eng.alumnosPorGrupo[grupoId] || [];
  const asigsAcad = (eng.asignPorGrupo[grupoId] || []).filter(
    (a) => a.asignatura_id !== CONDUCTA_ASIGNATURA_ID
  );

  const docRows = await query(
    `SELECT a.id AS asignatura_id,
            TRIM(CONCAT(COALESCE(p.apellidos, ''), ', ', COALESCE(p.nombres, ''))) AS docente_nombre
     FROM asignaturas a
     LEFT JOIN personal p ON p.id = a.personal_id
     WHERE a.grupo_id = ? AND a.colegio_id = ?`,
    [grupoId, colegioId]
  );
  const docMap = {};
  (docRows || []).forEach((r) => {
    const nom = String(r.docente_nombre || '').replace(/^,\s*|,\s*$/g, '').trim();
    docMap[r.asignatura_id] = nom || '—';
  });

  const cursos = asigsAcad.map((as) => {
    const alumnosPendientes = [];
    let registradas = 0;
    alumnos.forEach((al) => {
      if (notaEstaRegistrada(eng, al.matricula_id, as.asignatura_id, esCualitativo)) {
        registradas++;
      } else {
        alumnosPendientes.push({
          matricula_id: al.matricula_id,
          alumno_nombre: nombreAlumnoLista(al),
        });
      }
    });
    const esperadas = alumnos.length;
    const pct = esperadas > 0 ? round2((registradas / esperadas) * 100) : null;
    return {
      asignatura_id: as.asignatura_id,
      curso_nombre: as.curso_nombre,
      docente_nombre: docMap[as.asignatura_id] || '—',
      registradas,
      esperadas,
      faltantes: Math.max(0, esperadas - registradas),
      pct_cobertura: pct,
      completo: esperadas > 0 && registradas >= esperadas,
      alumnos_pendientes: alumnosPendientes,
    };
  });

  cursos.sort((a, b) => {
    const pa = a.pct_cobertura ?? 0;
    const pb = b.pct_cobertura ?? 0;
    if (pa !== pb) return pa - pb;
    return String(a.curso_nombre || '').localeCompare(String(b.curso_nombre || ''), 'es');
  });

  let totalReg = 0;
  let totalEsp = 0;
  cursos.forEach((c) => {
    totalReg += c.registradas;
    totalEsp += c.esperadas;
  });

  return {
    titulo: 'Detalle de cobertura de registro',
    grupo_id: grupoId,
    label: eng.grupoMap[grupoId].label,
    ciclo: eng.ciclo,
    anio: eng.anio,
    es_cualitativo: esCualitativo,
    notas_registradas: totalReg,
    notas_esperadas: totalEsp,
    pct_cobertura: totalEsp > 0 ? round2((totalReg / totalEsp) * 100) : null,
    promedio_salon: st?.promedio ?? null,
    alumnos_total: alumnos.length,
    cursos_total: cursos.length,
    cursos_incompletos: cursos.filter((c) => !c.completo).length,
    cursos,
  };
}

async function reportInicialCualitativo(colegioId, params) {
  const eng = await buildNotasEngine(query, {
    colegioId,
    anio: params.anio,
    ciclo: params.ciclo,
    nivel_id: params.nivel_id,
  });
  const distribucion = { AD: 0, A: 0, B: 0, C: 0, OTRO: 0 };
  eng.grupos.forEach((g) => {
    if (g.tipo_calificacion !== 0) return;
    (eng.alumnosPorGrupo[g.grupo_id] || []).forEach((al) => {
      (eng.asignPorGrupo[g.grupo_id] || []).forEach((as) => {
        if (as.asignatura_id === CONDUCTA_ASIGNATURA_ID) return;
        const raw = eng.promMap[`${al.matricula_id}:${as.asignatura_id}`];
        const L = eng.parseLetraPromedio(raw);
        if (L === 'AD') distribucion.AD++;
        else if (L === 'A') distribucion.A++;
        else if (L === 'B') distribucion.B++;
        else if (L === 'C') distribucion.C++;
        else if (raw) distribucion.OTRO++;
      });
    });
  });
  const totalDist = Object.values(distribucion).reduce((s, v) => s + v, 0);
  const filasSalon = eng.grupos
    .filter((g) => g.tipo_calificacion === 0)
    .map((g) => ({
      ...eng.statsSalon(g.grupo_id),
      es_cualitativo: true,
    }))
    .filter(Boolean);
  return {
    titulo: 'Inicial — Distribución de calificaciones cualitativas',
    ciclo: eng.ciclo,
    anio: eng.anio,
    distribucion,
    filas: filasSalon,
    chart: ['AD', 'A', 'B', 'C']
      .filter((label) => distribucion[label] > 0)
      .map((label) => ({
        label,
        value: distribucion[label],
        pct: totalDist > 0 ? Math.round((distribucion[label] / totalDist) * 100) : 0,
      })),
  };
}

async function reportConductaSalones(colegioId, params) {
  const eng = await buildNotasEngine(query, {
    colegioId,
    anio: params.anio,
    ciclo: params.ciclo,
    nivel_id: params.nivel_id,
    grado: params.grado,
  });
  const filas = [];
  eng.grupos.forEach((g) => {
    const list = eng.alumnosPorGrupo[g.grupo_id] || [];
    const vals = [];
    list.forEach((al) => {
      const c = eng.promedioConducta(al.matricula_id);
      if (c != null) vals.push(c);
    });
    const prom = vals.length ? round2(vals.reduce((s, v) => s + v, 0) / vals.length) : null;
    filas.push({
      grupo_id: g.grupo_id,
      label: eng.grupoMap[g.grupo_id].label,
      promedio: prom,
      alumnos_con_conducta: vals.length,
      alumnos_total: list.length,
    });
  });
  filas.sort((a, b) => (b.promedio ?? -1) - (a.promedio ?? -1));
  const ranked = filas.map((f, i) => ({ ...f, puesto: i + 1 }));
  const maxP = ranked[0]?.promedio || 20;
  return {
    titulo: 'Ranking de salones — Conducta',
    ciclo: eng.ciclo,
    anio: eng.anio,
    filas: ranked,
    chart: ranked.map((f) => ({
      label: f.label,
      value: f.promedio,
      pct: maxP > 0 && f.promedio != null ? Math.round((f.promedio / maxP) * 100) : 0,
    })),
  };
}

const REPORT_HANDLERS = {
  'ranking-salones-general': reportRankingSalonesGeneral,
  'ranking-salones-curso': reportRankingSalonesCurso,
  'matriz-cursos-salones': reportMatrizCursosSalones,
  'mejores-cursos-colegio': reportMejoresCursosColegio,
  'resumen-ejecutivo': reportResumenEjecutivo,
  'detalle-salon': reportDetalleSalon,
  'comparativa-secciones': reportComparativaSecciones,
  'panel-general': reportPanelGeneral,
  'evolucion-bimestres': reportEvolucionBimestres,
  'por-area': reportPorArea,
  cobertura: reportCobertura,
  'inicial-cualitativo': reportInicialCualitativo,
  'conducta-salones': reportConductaSalones,
};

async function runReport(tipo, colegioId, queryParams) {
  const handler = REPORT_HANDLERS[tipo];
  if (!handler) {
    const err = new Error('Tipo de reporte no válido');
    err.status = 400;
    throw err;
  }
  const anioQ = queryParams.anio != null ? parseInt(queryParams.anio, 10) : null;
  const { anio, colegio_nombre } = await resolveAnioColegio(colegioId, anioQ);
  const params = { ...queryParams, anio, colegio_nombre };
  const data = await handler(colegioId, params);
  return { tipo, ...data, colegio_nombre };
}

module.exports = {
  CONDUCTA_ASIGNATURA_ID,
  getMeta,
  runReport,
  reportCoberturaDetalle,
  REPORT_TYPES: Object.keys(REPORT_HANDLERS),
};
