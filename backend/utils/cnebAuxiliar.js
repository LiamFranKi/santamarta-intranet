const ExcelJS = require('exceljs');
const { query, execute } = require('./mysql');
const { sqlMatriculaEstadoSoloRegular } = require('./matriculaEstados');

async function listarAlumnosGrupo(cid, grupoId) {
  return query(
    `SELECT m.id AS matricula_id, a.id AS alumno_id,
            COALESCE(a.nro_documento, '') AS dni,
            TRIM(CONCAT(COALESCE(a.apellidos,''), ', ', COALESCE(a.nombres,''))) AS nombre
     FROM matriculas m
     INNER JOIN alumnos a ON a.id = m.alumno_id
     WHERE m.grupo_id = ? AND m.colegio_id = ? AND ${sqlMatriculaEstadoSoloRegular('m')}
     ORDER BY a.apellidos ASC, a.nombres ASC`,
    [grupoId, cid]
  );
}

async function competenciasDeNivel(nivel) {
  return query(
    `SELECT c.id, c.nombre, a.nombre AS area_nombre, a.codigo AS area_codigo, a.orden AS area_orden, c.orden
     FROM cneb_competencias c
     INNER JOIN cneb_areas a ON a.id = c.area_id
     WHERE a.nivel_cneb = ? AND a.activo = 1 AND c.activo = 1 AND a.tipo <> 'transversal'
     ORDER BY a.orden ASC, c.orden ASC, c.id ASC`,
    [nivel]
  );
}

async function cargarAuxiliar(cid, sesionId) {
  const [ses] = await query(
    `SELECT id, colegio_id, grupo_id, titulo FROM cneb_sesiones WHERE id = ? AND colegio_id = ? LIMIT 1`,
    [sesionId, cid]
  );
  if (!ses) return null;
  if (!ses.grupo_id) {
    return { sesion: ses, alumnos: [], items: [], valores: [] };
  }
  const [alumnos, items, valores] = await Promise.all([
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

async function cargarCorte(cid, { anio, bimestre, grupoId, nivel }) {
  const alumnos = await listarAlumnosGrupo(cid, grupoId);
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
  return { alumnos, competencias, valores };
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
  const alumnos = await listarAlumnosGrupo(cid, grupoId);
  const sesiones = await query(
    `SELECT s.id, s.titulo, s.fecha_sesion, s.duracion_min, s.estado, s.area_id, s.competencia_id,
            ar.nombre AS area_nombre, cp.nombre AS competencia_nombre
     FROM cneb_sesiones s
     LEFT JOIN cneb_areas ar ON ar.id = s.area_id
     LEFT JOIN cneb_competencias cp ON cp.id = s.competencia_id
     WHERE s.colegio_id = ? AND s.anio = ? AND s.nivel_cneb = ? AND s.grupo_id = ?
     ORDER BY COALESCE(s.fecha_sesion, s.creado_en) ASC, s.id ASC`,
    [cid, anio, nivel, grupoId]
  );
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

async function excelConsolidadoBuffer(cid, { anio, bimestre, grupoId, nivel, grupoLabel }) {
  const data = await cargarConsolidado(cid, { anio, bimestre, grupoId, nivel });
  const cotejoMap = new Map();
  (data.valoresCotejo || []).forEach((v) => {
    cotejoMap.set(`${v.matricula_id}_${v.cotejo_id}`, v.logro || '');
  });
  const corteMap = new Map();
  (data.valoresCorte || []).forEach((v) => {
    corteMap.set(`${v.matricula_id}_${v.competencia_id}`, v);
  });
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Intranet Vanguard · CNEB';
  const ws = wb.addWorksheet('Consolidado');
  const row1 = ['N°', 'DNI', 'Estudiante'];
  const row2 = ['', '', ''];
  (data.sesiones || []).forEach((s) => {
    const n = Math.max(1, (s.items || []).length);
    row1.push(s.titulo || `Sesión ${s.id}`);
    for (let i = 1; i < n; i += 1) row1.push('');
    (s.items || []).forEach((it) => row2.push(String(it.item || '').slice(0, 80)));
    if (!(s.items || []).length) row2.push('(sin cotejo)');
  });
  (data.competencias || []).forEach((c) => {
    row1.push(`${c.area_nombre} · ${c.nombre}`.slice(0, 80));
    row2.push('AD/A/B/C');
  });
  ws.addRow(row1);
  ws.addRow(row2);
  ws.getRow(1).font = { bold: true };
  data.alumnos.forEach((al, i) => {
    const row = [i + 1, al.dni || '', al.nombre];
    (data.sesiones || []).forEach((s) => {
      const items = s.items || [];
      if (!items.length) row.push('');
      items.forEach((it) => {
        const raw = cotejoMap.get(`${al.matricula_id}_${it.id}`) || '';
        row.push(raw === 'si' ? 'Sí' : raw === 'no' ? 'No' : raw === 'en_proceso' ? 'En proceso' : '');
      });
    });
    (data.competencias || []).forEach((c) => {
      row.push(corteMap.get(`${al.matricula_id}_${c.id}`)?.letra || '');
    });
    ws.addRow(row);
  });
  ws.addRow([]);
  ws.addRow(['Nota', '', grupoLabel || '', 'Registro auxiliar consolidado CNEB. No altera notas 0–20 ni SIAGIE.']);
  const buf = await wb.xlsx.writeBuffer();
  return { buffer: buf, filename: `cneb_consolidado_${nivel}_${anio}_b${bimestre}.xlsx` };
}

async function excelSiagieBuffer(cid, { anio, bimestre, grupoId, nivel, grupoLabel }) {
  const { alumnos, competencias, valores } = await cargarCorte(cid, { anio, bimestre, grupoId, nivel });
  const map = new Map();
  (valores || []).forEach((v) => {
    map.set(`${v.matricula_id}_${v.competencia_id}`, v);
  });
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Intranet Vanguard · CNEB';
  const ws = wb.addWorksheet('Calificativos');
  const headers = ['N°', 'DNI', 'Estudiante'];
  competencias.forEach((c) => {
    headers.push(`${c.area_nombre} · ${c.nombre}`.slice(0, 80));
    headers.push(`Conclusión · ${c.nombre}`.slice(0, 80));
  });
  ws.addRow(headers);
  ws.getRow(1).font = { bold: true };
  alumnos.forEach((al, i) => {
    const row = [i + 1, al.dni || '', al.nombre];
    competencias.forEach((c) => {
      const v = map.get(`${al.matricula_id}_${c.id}`);
      row.push(v?.letra || '');
      row.push(v?.conclusion || '');
    });
    ws.addRow(row);
  });
  ws.addRow([]);
  ws.addRow([
    'Nota',
    '',
    'Plantilla de trabajo CNEB. Calzar columnas con el Excel oficial SIAGIE del año antes de subir. No cambiar el nombre del archivo que descargue SIAGIE.',
  ]);
  ws.getCell('A1').note = grupoLabel || '';
  const buf = await wb.xlsx.writeBuffer();
  return { buffer: buf, filename: `cneb_calificativos_${nivel}_${anio}_b${bimestre}.xlsx` };
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
