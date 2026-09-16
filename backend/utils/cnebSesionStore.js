const { query, execute, getAnioActivo } = require('./mysql');
const { partirMinutos } = require('./cnebSesionBorrador');

const MOMENTOS = ['inicio', 'desarrollo', 'cierre'];

function parseIntOrNull(v) {
  if (v === '' || v == null) return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

function leerCuerpoSesion(body, nivel) {
  const titulo = String(body?.titulo || '').trim();
  const duracion = Math.min(180, Math.max(20, parseInt(body?.duracion_min, 10) || 60));
  const estado = String(body?.estado || '') === 'aprobada' ? 'aprobada' : 'borrador';
  const minutos = body?.minutos || partirMinutos(duracion);
  const suma = MOMENTOS.reduce((acc, t) => acc + (parseInt(minutos[t], 10) || 0), 0);
  return {
    titulo,
    proposito: String(body?.proposito || '').trim() || null,
    ficha_estudiante: String(body?.ficha_estudiante || body?.ficha || '').trim() || null,
    duracion_min: duracion,
    grupo_id: parseIntOrNull(body?.grupo_id),
    asignatura_id: parseIntOrNull(body?.asignatura_id),
    area_id: parseIntOrNull(body?.area_id),
    competencia_id: parseIntOrNull(body?.competencia_id),
    corte: parseIntOrNull(body?.corte),
    fecha_sesion: body?.fecha_sesion ? String(body.fecha_sesion).slice(0, 10) : null,
    estado,
    nivel_cneb: nivel,
    desempeno_ids: Array.isArray(body?.desempeno_ids) ? body.desempeno_ids : [],
    momentos: body?.momentos || { inicio: '', desarrollo: '', cierre: '' },
    minutos,
    suma,
    cotejo: Array.isArray(body?.cotejo) ? body.cotejo : [],
  };
}

async function cargarSesion(cid, id) {
  const [ses] = await query(
    `SELECT s.*, ar.nombre AS area_nombre, ar.codigo AS area_codigo,
            cp.nombre AS competencia_nombre,
            g.grado, g.seccion
     FROM cneb_sesiones s
     LEFT JOIN cneb_areas ar ON ar.id = s.area_id
     LEFT JOIN cneb_competencias cp ON cp.id = s.competencia_id
     LEFT JOIN grupos g ON g.id = s.grupo_id AND g.colegio_id = s.colegio_id
     WHERE s.id = ? AND s.colegio_id = ? LIMIT 1`,
    [id, cid]
  );
  if (!ses) return null;
  const [desempenos, momentos, cotejo] = await Promise.all([
    query(
      `SELECT d.id, d.edad, d.grado, d.texto, d.orden
       FROM cneb_sesion_desempenos sd
       INNER JOIN cneb_desempenos d ON d.id = sd.desempeno_id
       WHERE sd.sesion_id = ?
       ORDER BY d.orden ASC, d.id ASC`,
      [id]
    ),
    query(
      `SELECT tipo, minutos, contenido, orden FROM cneb_sesion_momentos
       WHERE sesion_id = ? ORDER BY orden ASC`,
      [id]
    ),
    query(
      `SELECT id, desempeno_id, item, orden FROM cneb_sesion_cotejo
       WHERE sesion_id = ? ORDER BY orden ASC, id ASC`,
      [id]
    ),
  ]);
  const mom = { inicio: '', desarrollo: '', cierre: '' };
  const min = partirMinutos(ses.duracion_min);
  MOMENTOS.forEach((t) => {
    const row = (momentos || []).find((m) => m.tipo === t);
    mom[t] = row?.contenido || '';
    min[t] = row ? Number(row.minutos) : min[t];
  });
  return {
    ...ses,
    desempeno_ids: (desempenos || []).map((d) => d.id),
    desempenos: desempenos || [],
    momentos: mom,
    minutos: min,
    cotejo: cotejo || [],
  };
}

async function reemplazarHijos(sesionId, { desempeno_ids: desempenoIds, momentos, minutos, cotejo }) {
  await execute('DELETE FROM cneb_sesion_desempenos WHERE sesion_id = ?', [sesionId]);
  await execute('DELETE FROM cneb_sesion_momentos WHERE sesion_id = ?', [sesionId]);
  for (const rawId of desempenoIds || []) {
    const did = parseInt(rawId, 10);
    if (!Number.isFinite(did)) continue;
    await execute(
      'INSERT INTO cneb_sesion_desempenos (sesion_id, desempeno_id) VALUES (?, ?)',
      [sesionId, did]
    );
  }
  const mins = minutos || partirMinutos(60);
  const textos = momentos || {};
  await Promise.all(
    MOMENTOS.map((tipo, i) => {
      const n = Math.max(0, parseInt(mins[tipo], 10) || 0);
      return execute(
        `INSERT INTO cneb_sesion_momentos (sesion_id, tipo, minutos, contenido, orden)
         VALUES (?, ?, ?, ?, ?)`,
        [sesionId, tipo, n, String(textos[tipo] || '').trim() || null, i + 1]
      );
    })
  );
  const items = Array.isArray(cotejo) ? cotejo : [];
  const limpios = [];
  for (let i = 0; i < items.length; i += 1) {
    const it = items[i];
    const texto = String(it?.item || it || '').trim();
    if (!texto) continue;
    limpios.push({
      texto,
      desempeno_id: parseIntOrNull(it?.desempeno_id),
    });
  }
  const actuales = await query(
    'SELECT id FROM cneb_sesion_cotejo WHERE sesion_id = ? ORDER BY orden ASC, id ASC',
    [sesionId]
  );
  const max = Math.max(actuales.length, limpios.length);
  for (let i = 0; i < max; i += 1) {
    const row = actuales[i];
    const nuevo = limpios[i];
    if (row && nuevo) {
      await execute(
        'UPDATE cneb_sesion_cotejo SET desempeno_id = ?, item = ?, orden = ? WHERE id = ?',
        [nuevo.desempeno_id, nuevo.texto, i + 1, row.id]
      );
    } else if (nuevo) {
      await execute(
        'INSERT INTO cneb_sesion_cotejo (sesion_id, desempeno_id, item, orden) VALUES (?, ?, ?, ?)',
        [sesionId, nuevo.desempeno_id, nuevo.texto, i + 1]
      );
    } else if (row) {
      await execute('DELETE FROM cneb_sesion_cotejo WHERE id = ?', [row.id]);
    }
  }
}

async function insertarSesion(cid, usuarioId, body) {
  const anio = (await getAnioActivo(cid)) || new Date().getFullYear();
  const cols = [
    cid,
    anio,
    body.nivel_cneb,
    body.grupo_id,
    body.asignatura_id,
    body.area_id,
    body.competencia_id,
    body.titulo,
    body.proposito,
    body.duracion_min,
    body.corte,
    body.fecha_sesion,
    body.estado,
    usuarioId || null,
  ];
  let ins;
  try {
    ins = await execute(
      `INSERT INTO cneb_sesiones
        (colegio_id, anio, nivel_cneb, grupo_id, asignatura_id, area_id, competencia_id,
         titulo, proposito, ficha_estudiante, duracion_min, corte, fecha_sesion, estado, creado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [...cols.slice(0, 9), body.ficha_estudiante, ...cols.slice(9)]
    );
  } catch (e) {
    if (e.code !== 'ER_BAD_FIELD_ERROR') throw e;
    ins = await execute(
      `INSERT INTO cneb_sesiones
        (colegio_id, anio, nivel_cneb, grupo_id, asignatura_id, area_id, competencia_id,
         titulo, proposito, duracion_min, corte, fecha_sesion, estado, creado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      cols
    );
  }
  await reemplazarHijos(ins.insertId, body);
  return cargarSesion(cid, ins.insertId);
}

async function actualizarSesion(cid, id, body) {
  try {
    await execute(
      `UPDATE cneb_sesiones SET
         grupo_id = ?, asignatura_id = ?, area_id = ?, competencia_id = ?,
         titulo = ?, proposito = ?, ficha_estudiante = ?, duracion_min = ?, corte = ?, fecha_sesion = ?, estado = ?
       WHERE id = ? AND colegio_id = ?`,
      [
        body.grupo_id,
        body.asignatura_id,
        body.area_id,
        body.competencia_id,
        body.titulo,
        body.proposito,
        body.ficha_estudiante,
        body.duracion_min,
        body.corte,
        body.fecha_sesion,
        body.estado,
        id,
        cid,
      ]
    );
  } catch (e) {
    if (e.code !== 'ER_BAD_FIELD_ERROR') throw e;
    await execute(
      `UPDATE cneb_sesiones SET
         grupo_id = ?, asignatura_id = ?, area_id = ?, competencia_id = ?,
         titulo = ?, proposito = ?, duracion_min = ?, corte = ?, fecha_sesion = ?, estado = ?
       WHERE id = ? AND colegio_id = ?`,
      [
        body.grupo_id,
        body.asignatura_id,
        body.area_id,
        body.competencia_id,
        body.titulo,
        body.proposito,
        body.duracion_min,
        body.corte,
        body.fecha_sesion,
        body.estado,
        id,
        cid,
      ]
    );
  }
  await reemplazarHijos(id, body);
  return cargarSesion(cid, id);
}

async function eliminarSesion(cid, id) {
  const r = await execute('DELETE FROM cneb_sesiones WHERE id = ? AND colegio_id = ?', [id, cid]);
  return Number(r.affectedRows || 0);
}

async function listarSesiones(cid, { nivel, anio, grupoIds }) {
  const params = [cid, nivel, anio];
  let extra = '';
  if (Array.isArray(grupoIds)) {
    if (!grupoIds.length) return [];
    extra = ` AND s.grupo_id IN (${grupoIds.map(() => '?').join(',')})`;
    params.push(...grupoIds);
  }
  return query(
    `SELECT s.id, s.titulo, s.duracion_min, s.estado, s.fecha_sesion, s.corte, s.grupo_id,
            s.area_id, s.competencia_id, s.actualizado_en, s.creado_en, s.nivel_cneb,
            ar.nombre AS area_nombre, g.grado, g.seccion
     FROM cneb_sesiones s
     LEFT JOIN cneb_areas ar ON ar.id = s.area_id
     LEFT JOIN grupos g ON g.id = s.grupo_id AND g.colegio_id = s.colegio_id
     WHERE s.colegio_id = ? AND s.nivel_cneb = ? AND s.anio = ?${extra}
     ORDER BY COALESCE(s.fecha_sesion, s.creado_en) DESC, s.id DESC`,
    params
  );
}

module.exports = {
  MOMENTOS,
  parseIntOrNull,
  leerCuerpoSesion,
  cargarSesion,
  reemplazarHijos,
  insertarSesion,
  actualizarSesion,
  eliminarSesion,
  listarSesiones,
};
