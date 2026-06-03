const { query } = require('../../utils/mysql');

const ORDEN_NIVEL = { Inicial: 0, INICIAL: 0, Primaria: 1, PRIMARIA: 1, Secundaria: 2, SECUNDARIA: 2 };

function sortGrupos(rows) {
  return [...(rows || [])].sort((a, b) => {
    const na = ORDEN_NIVEL[a.nivel_nombre] ?? (a.nivel_orden != null ? Number(a.nivel_orden) : 999);
    const nb = ORDEN_NIVEL[b.nivel_nombre] ?? (b.nivel_orden != null ? Number(b.nivel_orden) : 999);
    if (na !== nb) return na - nb;
    const ga = a.grado != null ? Number(a.grado) : 0;
    const gb = b.grado != null ? Number(b.grado) : 0;
    if (ga !== gb) return ga - gb;
    return String(a.seccion || '').localeCompare(String(b.seccion || ''), 'es', { numeric: true });
  });
}

function etiquetaGrupo(row) {
  const sec = (row.seccion || '').trim();
  const parteSec = sec ? ` · Sec. ${sec}` : '';
  return `${row.nivel_nombre || ''} · ${row.grado}°${parteSec}`.trim();
}

async function listarGruposOpciones(colegio_id, anio, { tipo, personal_id }) {
  const esAdmin = tipo === 'ADMINISTRADOR' || tipo === 'PROMOTORIA' || tipo === 'PSICOLOGA';
  let rows;
  if (esAdmin) {
    rows = await query(
      `SELECT g.id AS grupo_id, g.nivel_id, g.grado, g.seccion, n.nombre AS nivel_nombre,
              COALESCE(n.grado_minimo, 0) AS nivel_orden
       FROM grupos g
       INNER JOIN niveles n ON n.id = g.nivel_id AND n.colegio_id = g.colegio_id
       WHERE g.colegio_id = ? AND g.anio = ?`,
      [colegio_id, anio]
    );
  } else if (tipo === 'DOCENTE' && personal_id) {
    /* Solo cursos asignados (asignaturas); no tutoría — distinto a Conexiones u otros módulos. */
    rows = await query(
      `SELECT DISTINCT g.id AS grupo_id, g.nivel_id, g.grado, g.seccion, n.nombre AS nivel_nombre,
              COALESCE(n.grado_minimo, 0) AS nivel_orden
       FROM grupos g
       INNER JOIN niveles n ON n.id = g.nivel_id
       INNER JOIN asignaturas a ON a.grupo_id = g.id AND a.colegio_id = g.colegio_id
       WHERE g.colegio_id = ? AND g.anio = ? AND a.personal_id = ?`,
      [colegio_id, anio, personal_id]
    );
  } else {
    rows = [];
  }
  return sortGrupos(rows).map((r) => ({
    ...r,
    etiqueta: etiquetaGrupo(r),
  }));
}

async function listarCursosPorGrupo(colegio_id, grupo_id) {
  const rows = await query(
    `SELECT a.id AS asignatura_id, a.curso_id, c.nombre AS curso_nombre,
            (SELECT ar.nombre FROM areas_cursos acr
             INNER JOIN areas ar ON ar.id = acr.area_id AND ar.colegio_id = c.colegio_id
             WHERE acr.curso_id = c.id LIMIT 1) AS area_nombre
     FROM asignaturas a
     INNER JOIN cursos c ON c.id = a.curso_id AND c.colegio_id = a.colegio_id
     WHERE a.grupo_id = ? AND a.colegio_id = ?
     ORDER BY c.nombre ASC`,
    [grupo_id, colegio_id]
  );
  return rows || [];
}

/** Cursos de varias secciones del mismo grado. Con personal_id: solo asignaturas del docente, sin duplicar curso. */
async function listarCursosPorGrupos(colegio_id, grupoIds, { personal_id } = {}) {
  const ids = [...new Set((grupoIds || []).map((id) => parseInt(id, 10)).filter(Number.isFinite))];
  if (!ids.length) return [];
  const ph = ids.map(() => '?').join(',');
  const params = [...ids, colegio_id];
  let sql = `
     SELECT a.id AS asignatura_id, a.grupo_id, a.curso_id, c.nombre AS curso_nombre,
            (SELECT ar.nombre FROM areas_cursos acr
             INNER JOIN areas ar ON ar.id = acr.area_id AND ar.colegio_id = c.colegio_id
             WHERE acr.curso_id = c.id LIMIT 1) AS area_nombre
     FROM asignaturas a
     INNER JOIN cursos c ON c.id = a.curso_id AND c.colegio_id = a.colegio_id
     WHERE a.grupo_id IN (${ph}) AND a.colegio_id = ?`;
  if (personal_id) {
    sql += ' AND a.personal_id = ?';
    params.push(personal_id);
  }
  sql += ' ORDER BY c.nombre ASC, a.id ASC';
  const rows = await query(sql, params);
  const vistos = new Set();
  const unicos = [];
  for (const r of rows || []) {
    const dedupeKey = personal_id
      ? `c:${parseInt(r.curso_id, 10)}`
      : `a:${parseInt(r.asignatura_id, 10)}`;
    if (vistos.has(dedupeKey)) continue;
    vistos.add(dedupeKey);
    unicos.push({
      asignatura_id: r.asignatura_id,
      grupo_id: r.grupo_id,
      curso_id: r.curso_id,
      curso_nombre: r.curso_nombre,
      area_nombre: r.area_nombre,
    });
  }
  return unicos;
}

module.exports = {
  listarGruposOpciones,
  listarCursosPorGrupo,
  listarCursosPorGrupos,
  etiquetaGrupo,
  sortGrupos,
};
