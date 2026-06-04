/**
 * Libreta cuantitativa (Primaria/Secundaria): área canónica por curso y agrupación sin duplicados.
 * Un curso debe figurar en una sola área (areas_cursos); si hay filas legacy duplicadas, se elige una.
 */

/**
 * @param {Function} query
 * @param {{ colegio_id: number, grupoId: number, nivelId?: number|null }} opts
 */
async function fetchAsignaturasLibretaConArea(query, { colegio_id, grupoId, nivelId }) {
  const nid = nivelId != null && nivelId !== '' ? parseInt(nivelId, 10) : null;
  const nivelSql = Number.isFinite(nid) && nid > 0 ? ' AND ar2.nivel_id = ?' : '';
  const params = [colegio_id];
  if (Number.isFinite(nid) && nid > 0) params.push(nid);
  params.push(colegio_id, grupoId, colegio_id);

  return query(
    `SELECT
       a.id AS asignatura_id,
       c.id AS curso_id,
       c.nombre AS curso_nombre,
       ac_area.area_id,
       ar.nombre AS area_nombre
     FROM asignaturas a
     INNER JOIN cursos c ON c.id = a.curso_id
     LEFT JOIN (
       SELECT ac.curso_id,
         CAST(SUBSTRING_INDEX(GROUP_CONCAT(ac.area_id ORDER BY ar2.nombre ASC), ',', 1) AS UNSIGNED) AS area_id
       FROM areas_cursos ac
       INNER JOIN areas ar2 ON ar2.id = ac.area_id AND ar2.colegio_id = ?${nivelSql}
       GROUP BY ac.curso_id
     ) ac_area ON ac_area.curso_id = c.id
     LEFT JOIN areas ar ON ar.id = ac_area.area_id AND ar.colegio_id = ?
     WHERE a.grupo_id = ? AND a.colegio_id = ?
     ORDER BY ar.nombre ASC, c.nombre ASC`,
    params
  );
}

/**
 * @param {Function} query
 * @param {{ colegio_id: number, grupoId: number, nivelId?: number|null }} opts
 */
async function fetchAreasLibretaConAsignaturas(query, { colegio_id, grupoId, nivelId }) {
  const nid = nivelId != null && nivelId !== '' ? parseInt(nivelId, 10) : null;
  const nivelSql = Number.isFinite(nid) && nid > 0 ? ' AND ar.nivel_id = ?' : '';
  const params = [grupoId, colegio_id, colegio_id];
  if (Number.isFinite(nid) && nid > 0) params.push(nid);

  return query(
    `SELECT DISTINCT ar.id AS area_id, ar.nombre AS area_nombre
     FROM areas ar
     INNER JOIN areas_cursos ac ON ac.area_id = ar.id
     INNER JOIN cursos c ON c.id = ac.curso_id
     INNER JOIN asignaturas a ON a.curso_id = c.id
     WHERE a.grupo_id = ? AND a.colegio_id = ? AND ar.colegio_id = ?${nivelSql}
     ORDER BY ar.nombre ASC`,
    params
  );
}

/** Una fila por asignatura_id (evita duplicar curso en dos áreas por JOIN múltiple). */
function dedupeAsignaturasPorId(asignaturas) {
  const map = new Map();
  for (const row of asignaturas || []) {
    const id = row.asignatura_id;
    if (id == null) continue;
    if (!map.has(id)) map.set(id, row);
  }
  return Array.from(map.values());
}

/**
 * Agrupa asignaturas bajo áreas; cada asignatura_id solo aparece una vez.
 */
function filtrarAsignaturasDeArea(asignaturas, areaId, asignaturasYaUsadas) {
  return (asignaturas || []).filter(
    (a) =>
      a.area_id === areaId &&
      a.asignatura_id != null &&
      !asignaturasYaUsadas.has(a.asignatura_id)
  );
}

module.exports = {
  fetchAsignaturasLibretaConArea,
  fetchAreasLibretaConAsignaturas,
  dedupeAsignaturasPorId,
  filtrarAsignaturasDeArea
};
