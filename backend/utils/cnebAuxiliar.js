const ExcelJS = require('exceljs');
const { query, execute } = require('./mysql');
const { sqlMatriculaEstadoSoloRegular } = require('./matriculaEstados');
const { getColegioData } = require('./colegio');
const { marcaCreadorExcel } = require('./identidadColegio');
const { anexarPiarAAlumnos } = require('./cnebPiarAula');

const XL = {
  title: 'FF0F766E',
  area: 'FF115E59',
  head: 'FF0D9488',
  alt: 'FFF0FDFA',
  line: 'FF94A3B8',
  ink: 'FF0F172A',
  white: 'FFFFFFFF',
  muted: 'FF334155',
  AD: 'FF047857',
  ADbg: 'FFD1FAE5',
  B: 'FFB45309',
  Bbg: 'FFFEF3C7',
  C: 'FFB91C1C',
  Cbg: 'FFFEE2E2',
  note: 'FFFEF3C7',
};

function xlBorde() {
  const thin = { style: 'thin', color: { argb: XL.line } };
  return { top: thin, left: thin, bottom: thin, right: thin };
}

function xlFill(argb) {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

function xlLetra(cell, letra) {
  const u = String(letra || '').toUpperCase();
  cell.alignment = { horizontal: 'center', vertical: 'middle' };
  cell.font = { bold: true, size: 11, color: { argb: XL.ink }, name: 'Calibri' };
  if (u === 'AD' || u === 'A') {
    cell.fill = xlFill(XL.ADbg);
    cell.font = { bold: true, size: 11, color: { argb: XL.AD }, name: 'Calibri' };
  } else if (u === 'B') {
    cell.fill = xlFill(XL.Bbg);
    cell.font = { bold: true, size: 11, color: { argb: XL.B }, name: 'Calibri' };
  } else if (u === 'C') {
    cell.fill = xlFill(XL.Cbg);
    cell.font = { bold: true, size: 11, color: { argb: XL.C }, name: 'Calibri' };
  }
  cell.value = u || '';
}

function xlAgruparAreas(competencias) {
  const map = new Map();
  (competencias || []).forEach((c) => {
    const key = c.area_nombre || 'Área';
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(c);
  });
  return [...map.entries()];
}

function etiquetaNivelXl(nivel) {
  if (nivel === 'PRIMARIA') return 'Primaria';
  if (nivel === 'SECUNDARIA') return 'Secundaria';
  return 'Inicial';
}

function xlTexto(v) {
  if (v == null) return '';
  if (typeof v === 'bigint') return v.toString();
  if (typeof v === 'number') return Number.isFinite(v) ? v : '';
  if (v instanceof Date) return v;
  return String(v)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, '')
    .replace(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '')
    .slice(0, 32000);
}

function xlMerge(ws, r1, c1, r2, c2) {
  if (r2 < r1 || c2 < c1 || (r1 === r2 && c1 === c2)) return;
  try {
    ws.mergeCells(r1, c1, r2, c2);
  } catch (e) {
    if (!/already merged/i.test(String(e && e.message))) throw e;
  }
}

function idOk(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function acotarPorEleccion(sesiones, { areaId, asignaturaId, sesionId }) {
  const sid = idOk(sesionId);
  const asid = idOk(asignaturaId);
  const aid = idOk(areaId);
  let list = sesiones || [];
  if (sid) list = list.filter((s) => Number(s.id) === sid);
  else if (asid) list = list.filter((s) => Number(s.asignatura_id) === asid);
  else if (aid) list = list.filter((s) => Number(s.area_id) === aid);
  return { list, acotar: Boolean(sid || asid || aid) };
}

function competenciasDeSesiones(competencias, sesiones, acotar) {
  if (!acotar) return competencias || [];
  const ids = new Set(
    (sesiones || [])
      .map((s) => s.competencia_id)
      .filter((id) => id != null && id !== '')
      .map((id) => String(id))
  );
  if (!ids.size) return [];
  return (competencias || []).filter((c) => ids.has(String(c.id)));
}

async function listarAlumnosGrupo(cid, grupoId) {
  return query(
    `SELECT m.id AS matricula_id, a.id AS alumno_id,
            COALESCE(a.nro_documento, '') AS dni,
            TRIM(CONCAT(
              COALESCE(a.apellido_paterno,''), ' ', COALESCE(a.apellido_materno,''), ', ', COALESCE(a.nombres,'')
            )) AS nombre
     FROM matriculas m
     INNER JOIN alumnos a ON a.id = m.alumno_id
     WHERE m.grupo_id = ? AND m.colegio_id = ? AND ${sqlMatriculaEstadoSoloRegular('m')}
     ORDER BY a.apellido_paterno ASC, a.apellido_materno ASC, a.nombres ASC`,
    [grupoId, cid]
  );
}

async function competenciasDeNivel(nivel) {
  return query(
    `SELECT c.id, c.area_id, c.nombre, c.estandar_ciclo, a.nombre AS area_nombre, a.codigo AS area_codigo, a.orden AS area_orden, c.orden
     FROM cneb_competencias c
     INNER JOIN cneb_areas a ON a.id = c.area_id
     WHERE a.nivel_cneb = ? AND a.activo = 1 AND c.activo = 1 AND a.tipo <> 'transversal'
     ORDER BY a.orden ASC, c.orden ASC, c.id ASC`,
    [nivel]
  );
}

async function cargarAuxiliar(cid, sesionId) {
  const [ses] = await query(
    `SELECT id, colegio_id, grupo_id, titulo, anio FROM cneb_sesiones WHERE id = ? AND colegio_id = ? LIMIT 1`,
    [sesionId, cid]
  );
  if (!ses) return null;
  if (!ses.grupo_id) {
    return { sesion: ses, alumnos: [], items: [], valores: [] };
  }
  const [alumnosRaw, items, valores] = await Promise.all([
    listarAlumnosGrupo(cid, ses.grupo_id),
    query(
      `SELECT id, item, orden FROM cneb_sesion_cotejo WHERE sesion_id = ? ORDER BY orden ASC, id ASC`,
      [sesionId]
    ),
    query(
      `SELECT cotejo_id, matricula_id, logro, observacion
       FROM cneb_cotejo_valores WHERE sesion_id = ?`,
      [sesionId]
    ),
  ]);
  const alumnos = await anexarPiarAAlumnos(cid, ses.anio, ses.grupo_id, alumnosRaw);
  return { sesion: ses, alumnos, items, valores };
}

async function guardarAuxiliar(cid, sesionId, filas) {
  const [ses] = await query(
    `SELECT id FROM cneb_sesiones WHERE id = ? AND colegio_id = ? LIMIT 1`,
    [sesionId, cid]
  );
  if (!ses) return { ok: false, error: 'Sesión no encontrada.' };
  const items = await query('SELECT id FROM cneb_sesion_cotejo WHERE sesion_id = ?', [sesionId]);
  const itemIds = new Set((items || []).map((i) => Number(i.id)));
  const logroOk = new Set(['si', 'en_proceso', 'no']);
  let n = 0;
  for (const raw of filas || []) {
    const cotejoId = parseInt(raw.cotejo_id, 10);
    const matriculaId = parseInt(raw.matricula_id, 10);
    const logro = logroOk.has(String(raw.logro || '')) ? String(raw.logro) : 'en_proceso';
    if (!itemIds.has(cotejoId) || !Number.isFinite(matriculaId)) continue;
    await execute(
      `INSERT INTO cneb_cotejo_valores (sesion_id, cotejo_id, matricula_id, logro, observacion)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE logro = VALUES(logro), observacion = VALUES(observacion)`,
      [sesionId, cotejoId, matriculaId, logro, String(raw.observacion || '').trim() || null]
    );
    n += 1;
  }
  return { ok: true, guardados: n };
}

async function cargarCorte(cid, { anio, bimestre, grupoId, nivel, areaId, asignaturaId, sesionId }) {
  const alumnosRaw = await listarAlumnosGrupo(cid, grupoId);
  const alumnos = await anexarPiarAAlumnos(cid, anio, grupoId, alumnosRaw);
  const competencias = await competenciasDeNivel(nivel);
  const matIds = alumnos.map((a) => a.matricula_id);
  let valores = [];
  if (matIds.length && competencias.length) {
    valores = await query(
      `SELECT matricula_id, competencia_id, letra, conclusion
       FROM cneb_periodo_competencia
       WHERE colegio_id = ? AND anio = ? AND bimestre = ?
         AND matricula_id IN (${matIds.map(() => '?').join(',')})`,
      [cid, anio, bimestre, ...matIds]
    );
  }
  const sesParams = [cid, anio, nivel, grupoId];
  let sesExtra = '';
  const asId = parseInt(asignaturaId, 10);
  const arId = parseInt(areaId, 10);
  const sesId = parseInt(sesionId, 10);
  if (Number.isFinite(sesId) && sesId > 0) {
    sesExtra += ' AND s.id = ?';
    sesParams.push(sesId);
  }
  if (Number.isFinite(asId) && asId > 0) {
    sesExtra += ' AND s.asignatura_id = ?';
    sesParams.push(asId);
  } else if (Number.isFinite(arId) && arId > 0) {
    sesExtra += ' AND s.area_id = ?';
    sesParams.push(arId);
  }
  const b = parseInt(bimestre, 10);
  const filtrarBim = b >= 1 && b <= 4;
  const sqlSes = (conBim) =>
    `SELECT s.id, s.titulo, s.fecha_sesion, s.area_id, s.competencia_id, s.asignatura_id,
            ar.nombre AS area_nombre, cp.nombre AS competencia_nombre
     FROM cneb_sesiones s
     LEFT JOIN cneb_areas ar ON ar.id = s.area_id
     LEFT JOIN cneb_competencias cp ON cp.id = s.competencia_id
     WHERE s.colegio_id = ? AND s.anio = ? AND s.nivel_cneb = ? AND s.grupo_id = ?${sesExtra}${
       conBim ? ' AND s.bimestre = ?' : ''
     }
     ORDER BY COALESCE(s.fecha_sesion, s.creado_en) ASC, s.id ASC`;
  let sesiones = [];
  try {
    sesiones = await query(sqlSes(filtrarBim), filtrarBim ? [...sesParams, b] : sesParams);
  } catch (e) {
    if (e.code === 'ER_BAD_FIELD_ERROR' && filtrarBim) {
      sesiones = await query(sqlSes(false), sesParams).catch(() => []);
    }
  }
  return { alumnos, competencias, valores, sesiones: sesiones || [] };
}

async function guardarCorte(cid, { anio, bimestre, items }) {
  let n = 0;
  const letras = new Set(['AD', 'A', 'B', 'C', '']);
  for (const raw of items || []) {
    const matriculaId = parseInt(raw.matricula_id, 10);
    const competenciaId = parseInt(raw.competencia_id, 10);
    const letraRaw = String(raw.letra || '').toUpperCase();
    const letra = letras.has(letraRaw) && letraRaw ? letraRaw : null;
    if (!Number.isFinite(matriculaId) || !Number.isFinite(competenciaId)) continue;
    await execute(
      `INSERT INTO cneb_periodo_competencia
        (colegio_id, anio, bimestre, matricula_id, competencia_id, letra, conclusion)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE letra = VALUES(letra), conclusion = VALUES(conclusion)`,
      [cid, anio, bimestre, matriculaId, competenciaId, letra, String(raw.conclusion || '').trim() || null]
    );
    n += 1;
  }
  return { guardados: n };
}

async function cargarConsolidado(cid, { anio, bimestre, grupoId, nivel }) {
  const alumnosRaw = await listarAlumnosGrupo(cid, grupoId);
  const alumnos = await anexarPiarAAlumnos(cid, anio, grupoId, alumnosRaw);
  const b = parseInt(bimestre, 10);
  const filtrarBim = b >= 1 && b <= 4;
  const sqlCons = (conBim) =>
    `SELECT s.id, s.titulo, s.fecha_sesion, s.duracion_min, s.estado, s.area_id, s.competencia_id,
            s.asignatura_id, ar.nombre AS area_nombre, cp.nombre AS competencia_nombre
     FROM cneb_sesiones s
     LEFT JOIN cneb_areas ar ON ar.id = s.area_id
     LEFT JOIN cneb_competencias cp ON cp.id = s.competencia_id
     WHERE s.colegio_id = ? AND s.anio = ? AND s.nivel_cneb = ? AND s.grupo_id = ?${
       conBim ? ' AND s.bimestre = ?' : ''
     }
     ORDER BY COALESCE(s.fecha_sesion, s.creado_en) ASC, s.id ASC`;
  let sesiones = [];
  try {
    sesiones = await query(sqlCons(filtrarBim), filtrarBim ? [cid, anio, nivel, grupoId, b] : [cid, anio, nivel, grupoId]);
  } catch (e) {
    if (e.code === 'ER_BAD_FIELD_ERROR' && filtrarBim) {
      sesiones = await query(sqlCons(false), [cid, anio, nivel, grupoId]);
    } else if (e.code !== 'ER_BAD_FIELD_ERROR') {
      throw e;
    }
  }
  const sesIds = (sesiones || []).map((s) => s.id);
  let items = [];
  let valoresCotejo = [];
  if (sesIds.length) {
    const ph = sesIds.map(() => '?').join(',');
    items = await query(
      `SELECT id, sesion_id, item, orden FROM cneb_sesion_cotejo
       WHERE sesion_id IN (${ph}) ORDER BY sesion_id ASC, orden ASC, id ASC`,
      sesIds
    );
    valoresCotejo = await query(
      `SELECT sesion_id, cotejo_id, matricula_id, logro, observacion
       FROM cneb_cotejo_valores WHERE sesion_id IN (${ph})`,
      sesIds
    );
  }
  const competencias = await competenciasDeNivel(nivel);
  const matIds = alumnos.map((a) => a.matricula_id);
  let valoresCorte = [];
  if (matIds.length && competencias.length) {
    valoresCorte = await query(
      `SELECT matricula_id, competencia_id, letra, conclusion
       FROM cneb_periodo_competencia
       WHERE colegio_id = ? AND anio = ? AND bimestre = ?
         AND matricula_id IN (${matIds.map(() => '?').join(',')})`,
      [cid, anio, bimestre, ...matIds]
    );
  }
  const bySes = new Map();
  (items || []).forEach((it) => {
    if (!bySes.has(it.sesion_id)) bySes.set(it.sesion_id, []);
    bySes.get(it.sesion_id).push(it);
  });
  return {
    anio,
    bimestre,
    alumnos,
    sesiones: (sesiones || []).map((s) => ({ ...s, items: bySes.get(s.id) || [] })),
    valoresCotejo: valoresCotejo || [],
    competencias,
    valoresCorte: valoresCorte || [],
  };
}

async function excelConsolidadoBuffer(cid, { anio, bimestre, grupoId, nivel, grupoLabel, areaId, asignaturaId, sesionId }) {
  const data = await cargarConsolidado(cid, { anio, bimestre, grupoId, nivel });
  const colegio = await getColegioData(cid).catch(() => null);
  const cotejoMap = new Map();
  (data.valoresCotejo || []).forEach((v) => {
    cotejoMap.set(`${v.matricula_id}_${v.cotejo_id}`, v.logro || '');
  });
  const corteMap = new Map();
  (data.valoresCorte || []).forEach((v) => {
    corteMap.set(`${v.matricula_id}_${v.competencia_id}`, v);
  });
  const elegido = acotarPorEleccion(data.sesiones || [], { areaId, asignaturaId, sesionId });
  const sesiones = elegido.list;
  const competencias = competenciasDeSesiones(data.competencias || [], sesiones, elegido.acotar);
  const areas = xlAgruparAreas(competencias);
  const cotejoCols = sesiones.reduce((n, s) => n + Math.max(1, (s.items || []).length), 0);
  const totalCols = 3 + cotejoCols + competencias.length;
  const wb = new ExcelJS.Workbook();
  wb.creator = `${await marcaCreadorExcel(cid)} · CNEB`;
  const ws = wb.addWorksheet('Consolidado', {
    views: [{ state: 'frozen', xSplit: 3, ySplit: 4, showGridLines: false }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 1, paperSize: 9 },
  });
  xlMerge(ws, 1, 1, 1, Math.max(1, totalCols));
  const t = ws.getCell(1, 1);
  t.value = 'REGISTRO AUXILIAR CONSOLIDADO · CNEB';
  t.font = { bold: true, size: 14, color: { argb: XL.white }, name: 'Calibri' };
  t.fill = xlFill(XL.title);
  t.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 24;
  xlMerge(ws, 2, 1, 2, Math.max(1, totalCols));
  const sub = ws.getCell(2, 1);
  sub.value = xlTexto(
    [
      colegio?.nombre || 'Institución educativa',
      etiquetaNivelXl(nivel),
      grupoLabel || '',
      `${bimestre}.º bimestre`,
      anio,
    ]
      .filter(Boolean)
      .join('  ·  ')
  );
  sub.font = { size: 10, color: { argb: XL.muted }, name: 'Calibri' };
  sub.fill = xlFill('FFE2E8F0');
  sub.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(2).height = 18;

  const rA = 3;
  const rB = 4;
  const borde = xlBorde();
  const cabeceraFija = (col, texto, rowSpan) => {
    const cell = ws.getCell(rA, col);
    const abajo = ws.getCell(rB, col);
    cell.fill = xlFill(XL.head);
    cell.font = { bold: true, size: 9, color: { argb: XL.white }, name: 'Calibri' };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = borde;
    abajo.fill = xlFill(XL.head);
    abajo.border = borde;
    abajo.font = { bold: true, size: 8, color: { argb: XL.white }, name: 'Calibri' };
    if (rowSpan > 1) xlMerge(ws, rA, col, rB, col);
    cell.value = xlTexto(texto);
  };
  cabeceraFija(1, 'N°', 2);
  cabeceraFija(2, 'DNI', 2);
  cabeceraFija(3, 'Estudiante', 2);
  let col = 4;
  sesiones.forEach((s) => {
    const n = Math.max(1, (s.items || []).length);
    for (let i = 0; i < n; i += 1) {
      const h = ws.getCell(rA, col + i);
      h.fill = xlFill(XL.area);
      h.font = { bold: true, size: 8, color: { argb: XL.white }, name: 'Calibri' };
      h.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      h.border = borde;
    }
    if (n > 1) xlMerge(ws, rA, col, rA, col + n - 1);
    const cell = ws.getCell(rA, col);
    cell.value = xlTexto(s.titulo || `Sesión ${s.id}`);
    const items = s.items || [];
    if (!items.length) {
      const c2 = ws.getCell(rB, col);
      c2.value = xlTexto('(sin cotejo)');
      c2.fill = xlFill(XL.head);
      c2.font = { bold: true, size: 8, color: { argb: XL.white }, name: 'Calibri' };
      c2.alignment = { wrapText: true, vertical: 'middle' };
      c2.border = borde;
      col += 1;
    } else {
      items.forEach((it) => {
        const c2 = ws.getCell(rB, col);
        c2.value = xlTexto(String(it.item || ''));
        c2.fill = xlFill(XL.head);
        c2.font = { bold: true, size: 8, color: { argb: XL.white }, name: 'Calibri' };
        c2.alignment = { wrapText: true, vertical: 'middle' };
        c2.border = borde;
        col += 1;
      });
    }
  });
  areas.forEach(([area, comps]) => {
    for (let i = 0; i < comps.length; i += 1) {
      const h = ws.getCell(rA, col + i);
      h.fill = xlFill(XL.title);
      h.font = { bold: true, size: 8, color: { argb: XL.white }, name: 'Calibri' };
      h.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      h.border = borde;
    }
    if (comps.length > 1) xlMerge(ws, rA, col, rA, col + comps.length - 1);
    const cell = ws.getCell(rA, col);
    cell.value = xlTexto(`Corte · ${area}`);
    comps.forEach((c) => {
      const c2 = ws.getCell(rB, col);
      c2.value = xlTexto(c.nombre);
      c2.fill = xlFill(XL.head);
      c2.font = { bold: true, size: 8, color: { argb: XL.white }, name: 'Calibri' };
      c2.alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' };
      c2.border = borde;
      col += 1;
    });
  });
  ws.getRow(rA).height = 36;
  ws.getRow(rB).height = 78;
  ws.getColumn(1).width = 5;
  ws.getColumn(2).width = 14;
  ws.getColumn(3).width = 36;
  for (let c = 4; c <= totalCols; c += 1) ws.getColumn(c).width = 28;

  data.alumnos.forEach((al, i) => {
    const row = ws.getRow(5 + i);
    row.getCell(1).value = i + 1;
    row.getCell(2).value = xlTexto(al.dni);
    row.getCell(3).value = xlTexto(al.nombre);
    let c = 4;
    sesiones.forEach((s) => {
      const items = s.items || [];
      if (!items.length) {
        row.getCell(c).value = '';
        c += 1;
      } else {
        items.forEach((it) => {
          const raw = cotejoMap.get(`${al.matricula_id}_${it.id}`) || '';
          row.getCell(c).value =
            raw === 'si' ? 'Sí' : raw === 'no' ? 'No' : raw === 'en_proceso' ? 'En proceso' : '';
          c += 1;
        });
      }
    });
    competencias.forEach((comp) => {
      xlLetra(row.getCell(c), corteMap.get(`${al.matricula_id}_${comp.id}`)?.letra || '');
      c += 1;
    });
    for (let k = 1; k <= totalCols; k += 1) {
      row.getCell(k).border = borde;
      row.getCell(k).font = row.getCell(k).font || { name: 'Calibri', size: 10 };
      if (k <= 3) {
        row.getCell(k).fill = i % 2 ? xlFill(XL.alt) : xlFill(XL.white);
        row.getCell(k).alignment = { vertical: 'middle', horizontal: k === 3 ? 'left' : 'center' };
      }
    }
    row.height = 18;
  });
  const noteRow = 6 + data.alumnos.length;
  xlMerge(ws, noteRow, 1, noteRow, Math.max(1, totalCols));
  const note = ws.getCell(noteRow, 1);
  note.value = xlTexto(
    'Registro auxiliar interno. El cotejo incluye talleres; el corte AD/A/B/C es solo de áreas oficiales. No altera notas 0–20 ni SIAGIE.'
  );
  note.font = { italic: true, size: 9, color: { argb: XL.muted }, name: 'Calibri' };
  const buf = await wb.xlsx.writeBuffer();
  return { buffer: buf, filename: `cneb_consolidado_${nivel}_${anio}_b${bimestre}.xlsx` };
}

async function excelSiagieBuffer(cid, { anio, bimestre, grupoId, nivel, grupoLabel, areaId, asignaturaId, sesionId }) {
  const corte = await cargarCorte(cid, {
    anio,
    bimestre,
    grupoId,
    nivel,
    areaId,
    asignaturaId,
    sesionId,
  });
  const { alumnos, valores } = corte;
  const elegido = acotarPorEleccion(corte.sesiones || [], { areaId, asignaturaId, sesionId });
  const competencias = competenciasDeSesiones(corte.competencias || [], elegido.list, elegido.acotar);
  const colegio = await getColegioData(cid).catch(() => null);
  const map = new Map();
  (valores || []).forEach((v) => {
    map.set(`${v.matricula_id}_${v.competencia_id}`, v);
  });
  const areas = xlAgruparAreas(competencias);
  const totalCols = Math.max(4, 3 + competencias.length + 1);
  const wb = new ExcelJS.Workbook();
  wb.creator = `${await marcaCreadorExcel(cid)} · CNEB`;
  wb.created = new Date();
  const ws = wb.addWorksheet('Corte CNEB', {
    views: [{ state: 'frozen', xSplit: 3, ySplit: 4, showGridLines: false }],
    pageSetup: {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
      paperSize: 9,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    },
  });

  xlMerge(ws, 1, 1, 1, totalCols);
  const title = ws.getCell(1, 1);
  title.value = 'CORTE BIMESTRAL CNEB  ·  CALIFICATIVOS AD / A / B / C';
  title.font = { bold: true, size: 14, color: { argb: XL.white }, name: 'Calibri' };
  title.fill = xlFill(XL.title);
  title.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 26;

  xlMerge(ws, 2, 1, 2, totalCols);
  const meta = ws.getCell(2, 1);
  meta.value = xlTexto(
    [
      colegio?.nombre || 'Institución educativa',
      etiquetaNivelXl(nivel),
      grupoLabel || '',
      `${bimestre}.º bimestre`,
      String(anio),
    ]
      .filter(Boolean)
      .join('   ·   ')
  );
  meta.font = { size: 10, color: { argb: XL.muted }, name: 'Calibri' };
  meta.fill = xlFill('FFE2E8F0');
  meta.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(2).height = 18;

  const rA = 3;
  const rB = 4;
  const borde = xlBorde();
  const pintarFijo = (col, texto) => {
    const cell = ws.getCell(rA, col);
    const abajo = ws.getCell(rB, col);
    cell.fill = xlFill(XL.head);
    cell.font = { bold: true, size: 10, color: { argb: XL.white }, name: 'Calibri' };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = borde;
    abajo.fill = xlFill(XL.head);
    abajo.border = borde;
    xlMerge(ws, rA, col, rB, col);
    cell.value = xlTexto(texto);
  };
  pintarFijo(1, 'N°');
  pintarFijo(2, 'DNI');
  pintarFijo(3, 'Estudiante');

  let col = 4;
  areas.forEach(([area, comps]) => {
    for (let i = 0; i < comps.length; i += 1) {
      const h = ws.getCell(rA, col + i);
      h.fill = xlFill(XL.area);
      h.font = { bold: true, size: 9, color: { argb: XL.white }, name: 'Calibri' };
      h.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      h.border = borde;
    }
    if (comps.length > 1) xlMerge(ws, rA, col, rA, col + comps.length - 1);
    const cell = ws.getCell(rA, col);
    cell.value = xlTexto(String(area || '').toUpperCase());
    comps.forEach((c) => {
      const c2 = ws.getCell(rB, col);
      c2.value = xlTexto(c.nombre);
      c2.fill = xlFill(XL.head);
      c2.font = { bold: true, size: 8, color: { argb: XL.white }, name: 'Calibri' };
      c2.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      c2.border = borde;
      col += 1;
    });
  });
  pintarFijo(col, 'Conclusión del periodo');

  ws.getRow(rA).height = 22;
  ws.getRow(rB).height = 42;
  ws.getColumn(1).width = 5;
  ws.getColumn(2).width = 13;
  ws.getColumn(3).width = 36;
  for (let c = 4; c < totalCols; c += 1) ws.getColumn(c).width = 16;
  ws.getColumn(totalCols).width = 42;

  alumnos.forEach((al, i) => {
    const row = ws.getRow(5 + i);
    row.getCell(1).value = i + 1;
    row.getCell(2).value = xlTexto(al.dni);
    row.getCell(3).value = xlTexto(al.nombre);
    let c = 4;
    competencias.forEach((comp) => {
      const v = map.get(`${al.matricula_id}_${comp.id}`);
      xlLetra(row.getCell(c), v?.letra || '');
      c += 1;
    });
    const concCell = row.getCell(c);
    concCell.value = xlTexto(conclusionDeAlumno(valores, al.matricula_id));
    concCell.alignment = { wrapText: true, vertical: 'middle' };
    concCell.font = { size: 9, name: 'Calibri', color: { argb: XL.ink } };
    for (let k = 1; k <= totalCols; k += 1) {
      row.getCell(k).border = borde;
      if (k <= 3) {
        row.getCell(k).fill = i % 2 ? xlFill(XL.alt) : xlFill(XL.white);
        row.getCell(k).alignment = {
          vertical: 'middle',
          horizontal: k === 3 ? 'left' : 'center',
        };
        row.getCell(k).font = { name: 'Calibri', size: 10, color: { argb: XL.ink } };
      }
    }
    row.height = 22;
  });

  const ley = wb.addWorksheet('Leyenda', { views: [{ showGridLines: false }] });
  ley.getColumn(1).width = 10;
  ley.getColumn(2).width = 22;
  ley.getColumn(3).width = 72;
  xlMerge(ley, 1, 1, 1, 3);
  ley.getCell(1, 1).value = xlTexto('Escala de calificación CNEB / MINEDU');
  ley.getCell(1, 1).font = { bold: true, size: 13, color: { argb: XL.white }, name: 'Calibri' };
  ley.getCell(1, 1).fill = xlFill(XL.title);
  ley.getCell(1, 1).alignment = { horizontal: 'center', vertical: 'middle' };
  ley.getRow(1).height = 22;
  const escala = [
    ['AD', 'Logro destacado', 'Evidencia un nivel superior a lo esperado respecto a la competencia.'],
    ['A', 'Logro esperado', 'Evidencia el nivel esperado, con manejo satisfactorio y en el tiempo previsto.'],
    ['B', 'En proceso', 'Está próximo al nivel esperado; requiere acompañamiento por un tiempo razonable.'],
    ['C', 'En inicio', 'Muestra progreso mínimo; necesita más tiempo de acompañamiento e intervención.'],
  ];
  escala.forEach((fila, i) => {
    const row = ley.getRow(3 + i);
    xlLetra(row.getCell(1), fila[0]);
    row.getCell(2).value = xlTexto(fila[1]);
    row.getCell(3).value = xlTexto(fila[2]);
    [1, 2, 3].forEach((c) => {
      row.getCell(c).border = borde;
      row.getCell(c).font = row.getCell(c).font || { name: 'Calibri', size: 10 };
      row.getCell(c).alignment = { vertical: 'middle', wrapText: true };
    });
    row.height = 22;
  });
  xlMerge(ley, 8, 1, 8, 3);
  ley.getCell(8, 1).value = xlTexto(
    'Plantilla de trabajo del colegio. Calce las columnas con el Excel oficial de SIAGIE del año antes de subir. No sustituye el reporte que genera SIAGIE.'
  );
  ley.getCell(8, 1).font = { italic: true, size: 9, color: { argb: XL.muted }, name: 'Calibri' };
  ley.getCell(8, 1).alignment = { wrapText: true, vertical: 'middle' };
  ley.getRow(8).height = 32;

  const buf = await wb.xlsx.writeBuffer();
  return { buffer: buf, filename: `cneb_calificativos_${nivel}_${anio}_b${bimestre}.xlsx` };
}

function conclusionDeAlumno(valores, matriculaId) {
  const texts = (valores || [])
    .filter((v) => Number(v.matricula_id) === Number(matriculaId) && String(v.conclusion || '').trim())
    .map((v) => String(v.conclusion).trim());
  return [...new Set(texts)].join(' ');
}

async function guardarConsolidado(cid, { anio, bimestre, filasCotejo, itemsCorte }) {
  const bySes = new Map();
  (filasCotejo || []).forEach((f) => {
    const sid = parseInt(f.sesion_id, 10);
    if (!Number.isFinite(sid)) return;
    if (!bySes.has(sid)) bySes.set(sid, []);
    bySes.get(sid).push(f);
  });
  let cotejo = 0;
  for (const [sesionId, filas] of bySes.entries()) {
    const out = await guardarAuxiliar(cid, sesionId, filas);
    if (out.ok) cotejo += out.guardados;
  }
  const corte = await guardarCorte(cid, { anio, bimestre, items: itemsCorte || [] });
  return { cotejo, corte: corte.guardados };
}

module.exports = {
  listarAlumnosGrupo,
  competenciasDeNivel,
  cargarAuxiliar,
  guardarAuxiliar,
  cargarCorte,
  guardarCorte,
  cargarConsolidado,
  guardarConsolidado,
  excelSiagieBuffer,
  excelConsolidadoBuffer,
};
