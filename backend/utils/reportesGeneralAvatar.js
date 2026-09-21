/**
 * Reporte «Avatar» — canjes/desbloqueos y ranking de estrellas.
 */
const ExcelJS = require('exceljs');
const { query } = require('./mysql');
const {
  FILL_FILA_PAR,
  FILL_FILA_IMPAR,
  resolverAnioTrabajo,
  escribirTitulo,
  escribirKpisFila,
  escribirCabecera,
  estiloCuerpo,
  finalizarHoja,
} = require('./excelReporteGeneral');
const { sqlMatriculaEstadoSoloRegular } = require('./matriculaEstados');
const {
  columnExists,
  etiquetaGradoTitulo,
  ordenNivelEducativoNombre,
} = require('./listaAlumnosMatriculadosReporte');
const { obtenerRangoBimestre, toFechaYmd } = require('./conductaIncidenciasBimestre');

const BIM_LABEL = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV' };
const FILL_TOP1 = 'FFFEF3C7';
const FILL_TOP2 = 'FFF1F5F9';
const FILL_TOP3 = 'FFFFEDD5';
const FILL_CANJE = 'FFECFDF5';

function validarFechaISO(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '').trim());
}

function fmtFechaUi(iso) {
  const s = toFechaYmd(iso);
  if (!s) return '—';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
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

function etiquetaAula(g) {
  const nivel = String(g.nivel_nombre || '').trim();
  const n = nivel.toLowerCase();
  const gnum = g.grado != null && g.grado !== '' ? String(g.grado).trim() : '';
  const gl = n.includes('inicial') && gnum ? `${gnum} Años` : gnum ? `${gnum}°` : '';
  const sec = String(g.seccion || '').trim();
  return [nivel, [gl, sec].filter(Boolean).join(' ')].filter(Boolean).join(' ');
}

function compararAula(a, b) {
  const oa = ordenNivelEducativoNombre(a.nivel_nombre);
  const ob = ordenNivelEducativoNombre(b.nivel_nombre);
  if (oa !== ob) return oa - ob;
  const gd = (parseInt(a.grado, 10) || 0) - (parseInt(b.grado, 10) || 0);
  if (gd !== 0) return gd;
  const sc = String(a.seccion || '').localeCompare(String(b.seccion || ''), 'es', { sensitivity: 'base' });
  if (sc !== 0) return sc;
  return String(a.alumno_nombre || '').localeCompare(String(b.alumno_nombre || ''), 'es', { sensitivity: 'base' });
}

function maxIso(a, b) {
  const xs = [a, b].filter(Boolean);
  if (!xs.length) return null;
  return xs.sort()[xs.length - 1];
}

function minIso(a, b) {
  const xs = [a, b].filter(Boolean);
  if (!xs.length) return null;
  return xs.sort()[0];
}

function parseBimestreOpcional(v) {
  if (v === undefined || v === null || String(v).trim() === '') return null;
  const n = parseInt(v, 10);
  if (!Number.isFinite(n) || n < 1 || n > 4) return null;
  return n;
}

function sqlFiltroGrupo(aliasG, { hasSede, sedeId, nivelId, grado, docenteId }) {
  let sql = '';
  const params = [];
  if (hasSede && Number.isFinite(sedeId)) {
    sql += ` AND ${aliasG}.sede_id = ?`;
    params.push(sedeId);
  }
  if (Number.isFinite(nivelId)) {
    sql += ` AND ${aliasG}.nivel_id = ?`;
    params.push(nivelId);
  }
  if (Number.isFinite(grado)) {
    sql += ` AND CAST(${aliasG}.grado AS UNSIGNED) = ?`;
    params.push(grado);
  }
  if (Number.isFinite(docenteId)) {
    sql += ` AND (${aliasG}.tutor_id = ? OR (COALESCE(${aliasG}.tutor_id_2, 0) > 0 AND ${aliasG}.tutor_id_2 = ?))`;
    params.push(docenteId, docenteId);
  }
  return { sql, params };
}

function tablaExisteError(e) {
  return Boolean(
    e &&
      (e.code === 'ER_NO_SUCH_TABLE' ||
        String(e.message || '').includes("doesn't exist") ||
        String(e.message || '').includes('Unknown column'))
  );
}

async function resolverVentanaFechas(colegioId, anio, bimestre, desdeUser, hastaUser) {
  let bimDesde = null;
  let bimHasta = null;
  if (Number.isFinite(bimestre)) {
    const rango = await obtenerRangoBimestre(query, colegioId, bimestre, anio);
    bimDesde = rango?.desde || null;
    bimHasta = rango?.hasta || null;
  }
  const desde = maxIso(bimDesde, desdeUser) || `${anio}-01-01`;
  const hasta = minIso(bimHasta, hastaUser) || `${anio}-12-31`;
  if (desde > hasta) {
    return { ok: false, status: 400, error: 'El rango de fechas no coincide con el bimestre elegido.' };
  }
  return { ok: true, desde, hasta };
}

function asignarPuestos(filas) {
  let lastPts = null;
  let lastPuesto = 0;
  return filas.map((row, idx) => {
    const pts = Number(row.puntos) || 0;
    const puesto = lastPts === pts ? lastPuesto : idx + 1;
    lastPts = pts;
    lastPuesto = puesto;
    return { ...row, puesto };
  });
}

async function cargarCanjesNuevos({ colegioId, anio, bimestre, desde, hasta, gFiltro }) {
  const params = [colegioId, anio, desde, hasta];
  let extraBim = '';
  if (Number.isFinite(bimestre)) {
    extraBim = ' AND b.bimestre = ? ';
    params.push(bimestre);
  }
  params.push(...gFiltro.params);
  const rows = await query(
    `SELECT d.id, d.created_at, d.student_id,
            acc.nombre AS item_nombre, acc.puntuacion_requerida,
            b.nombre AS base_nombre, b.bimestre AS item_bimestre,
            m.grupo_id,
            al.nombres, al.apellido_paterno, al.apellido_materno,
            g.grado, g.seccion, g.nivel_id,
            n.nombre AS nivel_nombre,
            t.nombre AS turno_nombre
     FROM alumno_avatar_desbloqueos d
     INNER JOIN avatar_accesorios acc ON acc.id = d.accesorio_id
     INNER JOIN avatar_bases b ON b.id = acc.avatar_base_id
     INNER JOIN alumnos al ON al.id = d.student_id AND al.colegio_id = ?
     INNER JOIN matriculas m ON m.alumno_id = al.id AND m.colegio_id = al.colegio_id AND ${sqlMatriculaEstadoSoloRegular('m')}
     INNER JOIN grupos g ON g.id = m.grupo_id AND g.colegio_id = m.colegio_id AND g.anio = ?
     INNER JOIN niveles n ON n.id = g.nivel_id
     LEFT JOIN turnos t ON t.id = g.turno_id
     WHERE DATE(d.created_at) BETWEEN ? AND ?
       ${extraBim}
       ${gFiltro.sql}
     ORDER BY d.created_at DESC, d.id DESC`,
    params
  );
  return (rows || []).map((r) => ({
    id: `acc-${r.id}`,
    tipo: 'accesorio',
    tipo_label: 'Accesorio',
    fecha_iso: toFechaYmd(r.created_at),
    fecha: fmtFechaUi(r.created_at),
    alumno_id: Number(r.student_id),
    alumno_nombre: nombreAlumno(r),
    item_nombre: String(r.item_nombre || '').trim() || 'Accesorio',
    base_nombre: String(r.base_nombre || '').trim() || '—',
    puntos_req: Number(r.puntuacion_requerida) || 0,
    item_bimestre: r.item_bimestre != null ? Number(r.item_bimestre) : null,
    grupo_id: Number(r.grupo_id),
    nivel_nombre: r.nivel_nombre,
    grado: r.grado,
    seccion: r.seccion,
    turno_nombre: r.turno_nombre,
    aula: etiquetaAula(r),
  }));
}

async function cargarCanjesTienda({ colegioId, anio, desde, hasta, gFiltro }) {
  const params = [colegioId, anio, desde, hasta, ...gFiltro.params];
  const rows = await query(
    `SELECT ass.id, ass.created_at, ass.student_id,
            asi.name AS item_nombre, asi.price AS puntos_req, asi.level,
            m.grupo_id,
            al.nombres, al.apellido_paterno, al.apellido_materno,
            g.grado, g.seccion, g.nivel_id,
            n.nombre AS nivel_nombre,
            t.nombre AS turno_nombre
     FROM avatar_shop_sales ass
     INNER JOIN avatar_shop_items asi ON asi.id = ass.item_id
     INNER JOIN alumnos al ON al.id = ass.student_id AND al.colegio_id = ?
     INNER JOIN matriculas m ON m.alumno_id = al.id AND m.colegio_id = al.colegio_id AND ${sqlMatriculaEstadoSoloRegular('m')}
     INNER JOIN grupos g ON g.id = m.grupo_id AND g.colegio_id = m.colegio_id AND g.anio = ?
     INNER JOIN niveles n ON n.id = g.nivel_id
     LEFT JOIN turnos t ON t.id = g.turno_id
     WHERE DATE(ass.created_at) BETWEEN ? AND ?
       ${gFiltro.sql}
     ORDER BY ass.created_at DESC, ass.id DESC`,
    params
  );
  return (rows || []).map((r) => ({
    id: `shop-${r.id}`,
    tipo: 'tienda',
    tipo_label: 'Tienda',
    fecha_iso: toFechaYmd(r.created_at),
    fecha: fmtFechaUi(r.created_at),
    alumno_id: Number(r.student_id),
    alumno_nombre: nombreAlumno(r),
    item_nombre: String(r.item_nombre || '').trim() || 'Avatar',
    base_nombre: r.level != null ? `Nivel ${r.level}` : '—',
    puntos_req: Number(r.puntos_req) || 0,
    item_bimestre: null,
    grupo_id: Number(r.grupo_id),
    nivel_nombre: r.nivel_nombre,
    grado: r.grado,
    seccion: r.seccion,
    turno_nombre: r.turno_nombre,
    aula: etiquetaAula(r),
  }));
}

async function cargarRanking({ colegioId, anio, desde, hasta, gFiltro }) {
  const params = [desde, hasta, anio, colegioId, ...gFiltro.params];
  const rows = await query(
    `SELECT m.id AS matricula_id, m.grupo_id, al.id AS alumno_id,
            al.nombres, al.apellido_paterno, al.apellido_materno,
            g.grado, g.seccion, g.nivel_id,
            n.nombre AS nivel_nombre,
            t.nombre AS turno_nombre,
            COALESCE((
              SELECT SUM(ei.points)
              FROM enrollment_incidents ei
              WHERE ei.enrollment_id = m.id
                AND ei.type = 2
                AND DATE(ei.created_at) BETWEEN ? AND ?
            ), 0) AS puntos
     FROM matriculas m
     INNER JOIN alumnos al ON al.id = m.alumno_id AND al.colegio_id = m.colegio_id
     INNER JOIN grupos g ON g.id = m.grupo_id AND g.colegio_id = m.colegio_id AND g.anio = ?
     INNER JOIN niveles n ON n.id = g.nivel_id
     LEFT JOIN turnos t ON t.id = g.turno_id
     WHERE m.colegio_id = ?
       AND ${sqlMatriculaEstadoSoloRegular('m')}
       ${gFiltro.sql}`,
    params
  );
  return (rows || [])
    .map((r) => ({
      alumno_id: Number(r.alumno_id),
      matricula_id: Number(r.matricula_id),
      alumno_nombre: nombreAlumno(r),
      puntos: Math.round(Number(r.puntos) || 0),
      grupo_id: Number(r.grupo_id),
      nivel_nombre: r.nivel_nombre,
      grado: r.grado,
      seccion: r.seccion,
      turno_nombre: r.turno_nombre,
      aula: etiquetaAula(r),
      canjes: 0,
    }))
    .filter((r) => r.puntos > 0)
    .sort((a, b) => {
      if (b.puntos !== a.puntos) return b.puntos - a.puntos;
      const aula = compararAula(a, b);
      if (aula !== 0) return aula;
      return String(a.alumno_nombre).localeCompare(String(b.alumno_nombre), 'es', { sensitivity: 'base' });
    });
}

async function obtenerAvatar(colegioId, filtros) {
  const anio = await resolverAnioTrabajo(colegioId, filtros.anio);
  const bimestre = parseBimestreOpcional(filtros.bimestre);
  const sedeId = filtros.sedeId != null ? parseInt(filtros.sedeId, 10) : NaN;
  const nivelId = filtros.nivelId != null ? parseInt(filtros.nivelId, 10) : NaN;
  const grado = filtros.grado != null ? parseInt(filtros.grado, 10) : NaN;
  const docenteId = filtros.docenteId != null ? parseInt(filtros.docenteId, 10) : NaN;
  const desdeUser = validarFechaISO(filtros.desde) ? String(filtros.desde).trim() : null;
  const hastaUser = validarFechaISO(filtros.hasta) ? String(filtros.hasta).trim() : null;

  if (filtros.bimestre != null && String(filtros.bimestre).trim() !== '' && !Number.isFinite(bimestre)) {
    return { ok: false, status: 400, error: 'Seleccione un bimestre válido o Todos.' };
  }
  if (desdeUser && hastaUser && desdeUser > hastaUser) {
    return { ok: false, status: 400, error: 'La fecha «desde» no puede ser posterior a «hasta».' };
  }

  const ventana = await resolverVentanaFechas(colegioId, anio, bimestre, desdeUser, hastaUser);
  if (!ventana.ok) return ventana;
  const { desde, hasta } = ventana;

  const hasSede = await columnExists('grupos', 'sede_id');
  const gFiltro = sqlFiltroGrupo('g', { hasSede, sedeId, nivelId, grado, docenteId });

  let canjes = [];
  try {
    canjes = canjes.concat(await cargarCanjesNuevos({ colegioId, anio, bimestre, desde, hasta, gFiltro }));
  } catch (e) {
    if (!tablaExisteError(e)) console.warn('[reportes/avatar] desbloqueos:', e.message);
  }
  try {
    canjes = canjes.concat(await cargarCanjesTienda({ colegioId, anio, desde, hasta, gFiltro }));
  } catch (e) {
    if (!tablaExisteError(e)) console.warn('[reportes/avatar] tienda:', e.message);
  }
  canjes.sort((a, b) => {
    const aula = compararAula(a, b);
    if (aula !== 0) return aula;
    return String(b.fecha_iso || '').localeCompare(String(a.fecha_iso || ''));
  });

  let ranking = [];
  try {
    ranking = await cargarRanking({ colegioId, anio, desde, hasta, gFiltro });
  } catch (e) {
    console.warn('[reportes/avatar] ranking:', e.message);
  }
  const canjesPorAlumno = new Map();
  canjes.forEach((c) => {
    canjesPorAlumno.set(c.alumno_id, (canjesPorAlumno.get(c.alumno_id) || 0) + 1);
  });
  ranking = asignarPuestos(
    ranking.map((r) => ({ ...r, canjes: canjesPorAlumno.get(r.alumno_id) || 0 }))
  );

  const gruposMap = new Map();
  canjes.forEach((ev) => {
    if (!gruposMap.has(ev.grupo_id)) {
      gruposMap.set(ev.grupo_id, {
        grupo_id: ev.grupo_id,
        nivel_nombre: ev.nivel_nombre,
        grado: ev.grado,
        seccion: ev.seccion,
        aula: ev.aula,
        registros: [],
      });
    }
    gruposMap.get(ev.grupo_id).registros.push(ev);
  });
  const grupos = [...gruposMap.values()].sort(compararAula);

  const alumnosCanje = new Set(canjes.map((c) => c.alumno_id));
  const top = ranking[0] || null;
  const kpis = {
    canjes: canjes.length,
    alumnos_canjearon: alumnosCanje.size,
    alumnos_ranking: ranking.length,
    puntos_totales: ranking.reduce((acc, r) => acc + (Number(r.puntos) || 0), 0),
    top_nombre: top?.alumno_nombre || '—',
    top_puntos: top?.puntos ?? 0,
  };

  const [colegioRow] = await query('SELECT nombre FROM colegios WHERE id = ? LIMIT 1', [colegioId]);
  const colegioNombre = String(colegioRow?.nombre || '').trim() || 'Colegio';
  const bimTxt = Number.isFinite(bimestre) ? `BIMESTRE ${BIM_LABEL[bimestre] || bimestre}` : 'TODOS LOS BIMESTRES';
  const extraFiltro = [];
  if (Number.isFinite(nivelId)) {
    const [nv] = await query('SELECT nombre FROM niveles WHERE id = ? LIMIT 1', [nivelId]);
    if (nv?.nombre) extraFiltro.push(String(nv.nombre).trim());
  }
  if (Number.isFinite(grado)) extraFiltro.push(etiquetaGradoTitulo(extraFiltro[0] || '', grado));
  if (Number.isFinite(docenteId)) {
    const [doc] = await query('SELECT apellidos, nombres FROM personal WHERE id = ? LIMIT 1', [docenteId]);
    if (doc) {
      const ap = String(doc.apellidos || '').trim();
      const nom = String(doc.nombres || '').trim();
      extraFiltro.push(ap && nom ? `${ap}, ${nom}` : ap || nom);
    }
  }
  const alcance = Number.isFinite(grado)
    ? 'Ranking del grado'
    : Number.isFinite(nivelId)
      ? 'Ranking del nivel'
      : 'Ranking general';
  extraFiltro.push(alcance);
  const subtitulo = [`${fmtFechaUi(desde)} — ${fmtFechaUi(hasta)}`, ...extraFiltro].filter(Boolean).join('  ·  ');

  return {
    ok: true,
    colegio_nombre: colegioNombre,
    titulo: `AVATAR — ${bimTxt} · ${anio}`,
    subtitulo,
    anio,
    bimestre,
    bimestre_label: Number.isFinite(bimestre) ? BIM_LABEL[bimestre] : 'todos',
    desde,
    hasta,
    alcance,
    kpis,
    ranking,
    grupos,
    canjes,
  };
}

function pintarFila(row, cols, { fill, leftUntil = 3, ptsCol = null, pts }) {
  for (let c = 1; c <= cols; c += 1) {
    const esPts = ptsCol === c;
    estiloCuerpo(row.getCell(c), {
      fill,
      align: c <= leftUntil ? 'left' : 'center',
      wrap: c <= leftUntil,
      bold: esPts || c === 1,
      color: esPts && Number(pts) > 0 ? 'FF047857' : null,
    });
  }
}

async function generarExcelAvatar(colegioId, filtros) {
  const data = await obtenerAvatar(colegioId, filtros);
  if (!data.ok) return data;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'VanguardNet';
  wb.created = new Date();
  const k = data.kpis || {};

  const wsRank = wb.addWorksheet('Ranking', { views: [{ showGridLines: false }] });
  const colsR = 6;
  wsRank.columns = [
    { width: 9 },
    { width: 24 },
    { width: 34 },
    { width: 12 },
    { width: 12 },
    { width: 14 },
  ];
  let r = escribirTitulo(wsRank, {
    cols: colsR,
    titulo: `${data.titulo} — RANKING DE ESTRELLAS`,
    subtitulo: `${data.colegio_nombre}  ·  ${data.subtitulo}`,
  });
  r = escribirKpisFila(wsRank, {
    startRow: r,
    cols: colsR,
    pares: [
      ['Canjes', k.canjes ?? 0],
      ['Alumnos que canjearon', k.alumnos_canjearon ?? 0],
      ['En ranking', k.alumnos_ranking ?? 0],
      ['Puntos totales', k.puntos_totales ?? 0],
      ['1.er puesto', k.top_nombre || '—'],
      ['Puntos del 1.°', k.top_puntos ?? 0],
    ],
  });
  const headR = r;
  escribirCabecera(wsRank.getRow(r), ['Puesto', 'Aula', 'Alumno', 'Puntos', 'Canjes', 'Alcance']);
  r += 1;
  (data.ranking || []).forEach((ev) => {
    const row = wsRank.getRow(r);
    row.values = [ev.puesto, ev.aula, ev.alumno_nombre, ev.puntos, ev.canjes, data.alcance];
    row.height = 18;
    let fill = FILL_FILA_IMPAR;
    if (ev.puesto === 1) fill = FILL_TOP1;
    else if (ev.puesto === 2) fill = FILL_TOP2;
    else if (ev.puesto === 3) fill = FILL_TOP3;
    else if (r % 2 === 0) fill = FILL_FILA_PAR;
    pintarFila(row, colsR, { fill, leftUntil: 3, ptsCol: 4, pts: ev.puntos });
    r += 1;
  });
  finalizarHoja(wsRank, { headerRow: headR, cols: colsR, lastRow: Math.max(headR, r - 1) });

  const wsCan = wb.addWorksheet('Canjes', { views: [{ showGridLines: false }] });
  const colsC = 8;
  wsCan.columns = [
    { width: 22 },
    { width: 12 },
    { width: 32 },
    { width: 12 },
    { width: 28 },
    { width: 22 },
    { width: 12 },
    { width: 11 },
  ];
  let rc = escribirTitulo(wsCan, {
    cols: colsC,
    titulo: `${data.titulo} — CANJES Y DESBLOQUEOS`,
    subtitulo: `${data.colegio_nombre}  ·  ${data.subtitulo}`,
  });
  rc = escribirKpisFila(wsCan, {
    startRow: rc,
    cols: colsC,
    pares: [
      ['Canjes', k.canjes ?? 0],
      ['Alumnos', k.alumnos_canjearon ?? 0],
      ['Accesorios', (data.canjes || []).filter((c) => c.tipo === 'accesorio').length],
      ['Tienda', (data.canjes || []).filter((c) => c.tipo === 'tienda').length],
    ],
  });
  const headC = rc;
  escribirCabecera(wsCan.getRow(rc), [
    'Aula',
    'Fecha',
    'Alumno',
    'Tipo',
    'Ítem',
    'Avatar / nivel',
    'Pts. req.',
    'Bim.',
  ]);
  rc += 1;
  (data.canjes || []).forEach((ev, idx) => {
    const row = wsCan.getRow(rc);
    row.values = [
      ev.aula,
      ev.fecha,
      ev.alumno_nombre,
      ev.tipo_label,
      ev.item_nombre,
      ev.base_nombre,
      ev.puntos_req,
      ev.item_bimestre != null ? BIM_LABEL[ev.item_bimestre] || ev.item_bimestre : '—',
    ];
    row.height = 18;
    const fill = ev.tipo === 'accesorio' ? FILL_CANJE : idx % 2 === 1 ? FILL_FILA_PAR : FILL_FILA_IMPAR;
    pintarFila(row, colsC, { fill, leftUntil: 3 });
    rc += 1;
  });
  finalizarHoja(wsCan, { headerRow: headC, cols: colsC, lastRow: Math.max(headC, rc - 1) });

  const buffer = await wb.xlsx.writeBuffer();
  return {
    ok: true,
    buffer,
    filename: `avatar_${data.bimestre_label}_${data.anio}.xlsx`,
  };
}

module.exports = {
  obtenerAvatar,
  generarExcelAvatar,
};
