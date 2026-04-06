/**
 * Matrícula "vigente" para portal apoderado/alumno: entre estados 0 y 4,
 * se toma la de mayor año de grupo (desempate m.id DESC).
 * Así el carnet/QR y listados coinciden con la última matrícula aunque el JWT lleve año antiguo.
 */

const SELECT_MATRICULA_QR = `m.*, g.grado, g.seccion, g.anio AS grupo_anio, n.nombre AS nivel_nombre`;

/**
 * @param {Function} query - función query de mysql
 * @param {number} alumnoId
 * @param {number} colegio_id
 * @param {string} [selectSql] - por defecto incluye datos para QR/carnet
 */
async function fetchMatriculaVigenteMasReciente(query, alumnoId, colegio_id, selectSql = SELECT_MATRICULA_QR) {
  return query(
    `SELECT ${selectSql}
     FROM matriculas m
     INNER JOIN grupos g ON g.id = m.grupo_id
     INNER JOIN niveles n ON n.id = g.nivel_id
     WHERE m.alumno_id = ? AND m.colegio_id = ?
       AND (m.estado = 0 OR m.estado = 4)
     ORDER BY g.anio DESC, m.id DESC
     LIMIT 1`,
    [alumnoId, colegio_id]
  );
}

/**
 * Subconsulta correlacionada: id de la matrícula vigente más reciente.
 * @param {string} aliasAlumno - alias de la tabla alumnos (p.ej. 'a' o 'al')
 */
function sqlMatriculaIdMasRecientePorAlumno(aliasAlumno = 'a') {
  return `(
    SELECT m2.id FROM matriculas m2
    INNER JOIN grupos g2 ON g2.id = m2.grupo_id
    WHERE m2.alumno_id = ${aliasAlumno}.id AND m2.colegio_id = ?
      AND (m2.estado = 0 OR m2.estado = 4)
    ORDER BY g2.anio DESC, m2.id DESC
    LIMIT 1
  )`;
}

module.exports = {
  fetchMatriculaVigenteMasReciente,
  sqlMatriculaIdMasRecientePorAlumno,
  SELECT_MATRICULA_QR,
};
