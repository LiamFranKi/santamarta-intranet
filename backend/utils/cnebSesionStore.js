const { query, execute, getAnioActivo } = require('./mysql');
const { partirMinutos } = require('./cnebSesionBorrador');
const { leerDua } = require('./cnebDua');

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
    material_teoria: String(body?.material_teoria || body?.teoria || '').trim().slice(0, 20000) || null,
    duracion_min: duracion,
    grupo_id: parseIntOrNull(body?.grupo_id),
    asignatura_id: parseIntOrNull(body?.asignatura_id),
    area_id: parseIntOrNull(body?.area_id),
    competencia_id: parseIntOrNull(body?.competencia_id),
    unidad: String(body?.unidad || '').trim().slice(0, 220) || null,
    bimestre: (() => {
      const b = parseInt(body?.bimestre, 10);
      return b >= 1 && b <= 4 ? b : null;
    })(),
    corte: parseIntOrNull(body?.corte),
    fecha_sesion: body?.fecha_sesion ? String(body.fecha_sesion).slice(0, 10) : null,
    estado,
    nivel_cneb: nivel,
    desempeno_ids: Array.isArray(body?.desempeno_ids) ? body.desempeno_ids : [],
    desempenos_libre: Array.isArray(body?.desempenos_libre)
      ? body.desempenos_libre.map((t) => String(t || '').trim()).filter(Boolean).slice(0, 6)
      : [],
    momentos: body?.momentos || { inicio: '', desarrollo: '', cierre: '' },
    minutos,
    suma,
    cotejo: Array.isArray(body?.cotejo) ? body.cotejo : [],
    dua: leerDua(body?.dua || body?.dua_json),
    indicacion_ia: String(body?.indicacion_ia || '').trim().slice(0, 800) || null,
  };
}

async function guardarIndicacionIa(cid, sesionId, texto) {
  try {
    await execute(
      'UPDATE cneb_sesiones SET indicacion_ia = ? WHERE id = ? AND colegio_id = ?',
      [texto || null, sesionId, cid]
    );
  } catch (e) {
    if (e.code !== 'ER_BAD_FIELD_ERROR') throw e;
  }
}

async function cargarSesion(cid, id) {
  const [ses] = await query(
    `SELECT s.*, ar.nombre AS area_nombre, ar.codigo AS area_codigo,
            cp.nombre AS competencia_nombre, cp.estandar_ciclo,
            g.grado, g.seccion
     FROM cneb_sesiones s
     LEFT JOIN cneb_areas ar ON ar.id = s.area_id
     LEFT JOIN cneb_competencias cp ON cp.id = s.competencia_id
     LEFT JOIN grupos g ON g.id = s.grupo_id AND g.colegio_id = s.colegio_id
     WHERE s.id = ? AND s.colegio_id = ? LIMIT 1`,
    [id, cid]
  );
  if (!ses) return null;
  const [desempenos, momentos, cotejo, capacidades] = await Promise.all([
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
    ses.competencia_id
      ? query(
          `SELECT id, nombre, orden FROM cneb_capacidades
           WHERE competencia_id = ? ORDER BY orden ASC, id ASC`,
          [ses.competencia_id]
        )
      : Promise.resolve([]),
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
    capacidades: capacidades || [],
    momentos: mom,
    minutos: min,
    cotejo: cotejo || [],
    dua: leerDua(ses.dua_json),
  };
}

async function idsDesempenosDeLaSesion(sesionId, body) {
  const catalogo = (body.desempeno_ids || []).map((id) => parseInt(id, 10)).filter((n) => Number.isFinite(n));
  const libres = body.desempenos_libre || [];
  if (catalogo.length || !libres.length || !body.competencia_id) return catalogo;
  const nivel = String(body.nivel_cneb || '').toUpperCase();
  const corte = parseInt(body.corte, 10);
  const edad = nivel === 'INICIAL' && corte >= 3 && corte <= 5 ? corte : null;
  const grado = nivel !== 'INICIAL' && corte >= 1 && corte <= 6 ? corte : null;
  const ids = [];
  try {
    for (let i = 0; i < libres.length; i += 1) {
      const ins = await execute(
        `INSERT INTO cneb_desempenos (competencia_id, edad, grado, texto, orden, origen, sesion_id)
         VALUES (?, ?, ?, ?, ?, 'sesion', ?)`,
        [body.competencia_id, edad, grado, libres[i], i + 1, sesionId]
      );
      ids.push(ins.insertId);
    }
    const ph = ids.map(() => '?').join(',');
    await execute(
      `DELETE FROM cneb_desempenos WHERE sesion_id = ? AND origen = 'sesion' AND id NOT IN (${ph})`,
      [sesionId, ...ids]
    );
    return ids;
  } catch (e) {
    if (e.code === 'ER_BAD_FIELD_ERROR' || e.code === 'ER_BAD_NULL_ERROR' || e.code === 'ER_NO_SUCH_TABLE') {
      return catalogo;
    }
    throw e;
  }
}

async function reemplazarHijos(sesionId, body) {
  const { momentos, minutos, cotejo } = body;
  const desempenoIds = await idsDesempenosDeLaSesion(sesionId, body);
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
  const duaStr = JSON.stringify(body.dua || leerDua(null));
  try {
    ins = await execute(
      `INSERT INTO cneb_sesiones
        (colegio_id, anio, nivel_cneb, grupo_id, asignatura_id, area_id, competencia_id,
         titulo, unidad, proposito, ficha_estudiante, material_teoria, dua_json, duracion_min, corte, bimestre, fecha_sesion, estado, creado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [...cols.slice(0, 8), body.unidad, ...cols.slice(8, 9), body.ficha_estudiante, body.material_teoria, duaStr, ...cols.slice(9, 11), body.bimestre, ...cols.slice(11)]
    );
  } catch (e) {
    if (e.code !== 'ER_BAD_FIELD_ERROR') throw e;
    try {
      ins = await execute(
        `INSERT INTO cneb_sesiones
        (colegio_id, anio, nivel_cneb, grupo_id, asignatura_id, area_id, competencia_id,
         titulo, unidad, proposito, ficha_estudiante, dua_json, duracion_min, corte, fecha_sesion, estado, creado_por)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [...cols.slice(0, 8), body.unidad, ...cols.slice(8, 9), body.ficha_estudiante, duaStr, ...cols.slice(9)]
      );
    } catch (eUnidad) {
      if (eUnidad.code !== 'ER_BAD_FIELD_ERROR') throw eUnidad;
    try {
      ins = await execute(
        `INSERT INTO cneb_sesiones
        (colegio_id, anio, nivel_cneb, grupo_id, asignatura_id, area_id, competencia_id,
         titulo, proposito, ficha_estudiante, duracion_min, corte, fecha_sesion, estado, creado_por)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [...cols.slice(0, 9), body.ficha_estudiante, ...cols.slice(9)]
      );
    } catch (e2) {
      if (e2.code !== 'ER_BAD_FIELD_ERROR') throw e2;
      ins = await execute(
        `INSERT INTO cneb_sesiones
        (colegio_id, anio, nivel_cneb, grupo_id, asignatura_id, area_id, competencia_id,
         titulo, proposito, duracion_min, corte, fecha_sesion, estado, creado_por)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        cols
      );
    }
    }
  }
  await reemplazarHijos(ins.insertId, body);
  await guardarIndicacionIa(cid, ins.insertId, body.indicacion_ia);
  return cargarSesion(cid, ins.insertId);
}

async function actualizarSesion(cid, id, body) {
  const duaStr = JSON.stringify(body.dua || leerDua(null));
  try {
    await execute(
      `UPDATE cneb_sesiones SET
         grupo_id = ?, asignatura_id = ?, area_id = ?, competencia_id = ?,
         titulo = ?, unidad = ?, proposito = ?, ficha_estudiante = ?, material_teoria = ?, dua_json = ?, duracion_min = ?, corte = ?, bimestre = ?, fecha_sesion = ?, estado = ?
       WHERE id = ? AND colegio_id = ?`,
      [
        body.grupo_id,
        body.asignatura_id,
        body.area_id,
        body.competencia_id,
        body.titulo,
        body.unidad,
        body.proposito,
        body.ficha_estudiante,
        body.material_teoria,
        duaStr,
        body.duracion_min,
        body.corte,
        body.bimestre,
        body.fecha_sesion,
        body.estado,
        id,
        cid,
      ]
    );
  } catch (e) {
    if (e.code !== 'ER_BAD_FIELD_ERROR') throw e;
    try {
      await execute(
        `UPDATE cneb_sesiones SET
         grupo_id = ?, asignatura_id = ?, area_id = ?, competencia_id = ?,
         titulo = ?, unidad = ?, proposito = ?, ficha_estudiante = ?, dua_json = ?, duracion_min = ?, corte = ?, fecha_sesion = ?, estado = ?
       WHERE id = ? AND colegio_id = ?`,
        [
          body.grupo_id,
          body.asignatura_id,
          body.area_id,
          body.competencia_id,
          body.titulo,
          body.unidad,
          body.proposito,
          body.ficha_estudiante,
          duaStr,
          body.duracion_min,
          body.corte,
          body.fecha_sesion,
          body.estado,
          id,
          cid,
        ]
      );
    } catch (eUnidad) {
      if (eUnidad.code !== 'ER_BAD_FIELD_ERROR') throw eUnidad;
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
    } catch (e2) {
      if (e2.code !== 'ER_BAD_FIELD_ERROR') throw e2;
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
    }
  }
  await reemplazarHijos(id, body);
  await guardarIndicacionIa(cid, id, body.indicacion_ia);
  return cargarSesion(cid, id);
}

async function eliminarSesion(cid, id) {
  try {
    await execute("DELETE FROM cneb_desempenos WHERE sesion_id = ? AND origen = 'sesion'", [id]);
  } catch (e) {
    if (e.code !== 'ER_BAD_FIELD_ERROR' && e.code !== 'ER_NO_SUCH_TABLE') throw e;
  }
  try {
    await execute('UPDATE asignaturas_evidencias SET cneb_sesion_id = NULL WHERE cneb_sesion_id = ?', [id]);
  } catch (e) {
    if (e.code !== 'ER_BAD_FIELD_ERROR' && e.code !== 'ER_NO_SUCH_TABLE') throw e;
  }
  try {
    await execute('UPDATE cneb_ia_trabajos SET sesion_id = NULL WHERE sesion_id = ?', [id]);
  } catch (e) {
    if (e.code !== 'ER_BAD_FIELD_ERROR' && e.code !== 'ER_NO_SUCH_TABLE') throw e;
  }
  const r = await execute('DELETE FROM cneb_sesiones WHERE id = ? AND colegio_id = ?', [id, cid]);
  return Number(r.affectedRows || 0);
}

async function listarSesiones(cid, { nivel, anio, grupoIds, bimestre }) {
  const params = [cid, nivel, anio];
  let extra = '';
  if (Array.isArray(grupoIds)) {
    if (!grupoIds.length) return [];
    extra = ` AND s.grupo_id IN (${grupoIds.map(() => '?').join(',')})`;
    params.push(...grupoIds);
  }
  const b = parseInt(bimestre, 10);
  const filtrar = b >= 1 && b <= 4;
  const from = `FROM cneb_sesiones s
     LEFT JOIN cneb_areas ar ON ar.id = s.area_id
     LEFT JOIN asignaturas asg ON asg.id = s.asignatura_id
     LEFT JOIN cursos cu ON cu.id = asg.curso_id
     LEFT JOIN grupos g ON g.id = s.grupo_id AND g.colegio_id = s.colegio_id
     WHERE s.colegio_id = ? AND s.nivel_cneb = ? AND s.anio = ?${extra}`;
  const order = ' ORDER BY COALESCE(s.fecha_sesion, s.creado_en) DESC, s.id DESC';
  try {
    return await query(
      `SELECT s.id, s.titulo, s.unidad, s.duracion_min, s.estado, s.fecha_sesion, s.corte, s.bimestre, s.grupo_id,
            s.area_id, s.competencia_id, s.asignatura_id, s.actualizado_en, s.creado_en, s.nivel_cneb,
            ar.nombre AS area_nombre, cu.nombre AS asignatura_nombre, g.grado, g.seccion
     ${from}${filtrar ? ' AND s.bimestre = ?' : ''}${order}`,
      filtrar ? [...params, b] : params
    );
  } catch (e) {
    if (e.code !== 'ER_BAD_FIELD_ERROR') throw e;
    return query(
      `SELECT s.id, s.titulo, s.duracion_min, s.estado, s.fecha_sesion, s.corte, s.grupo_id,
            s.area_id, s.competencia_id, s.asignatura_id, s.actualizado_en, s.creado_en, s.nivel_cneb,
            ar.nombre AS area_nombre, cu.nombre AS asignatura_nombre, g.grado, g.seccion
     ${from}${order}`,
      params
    );
  }
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
