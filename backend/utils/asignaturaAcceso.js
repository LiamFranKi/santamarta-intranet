/**
 * Verificación de acceso a asignaturas y recursos del aula virtual (exámenes, resultados, preguntas):
 * docente titular o staff (admin/promotoría) del mismo colegio y año activo.
 */
function esStaffColegio(tipo) {
  return tipo === 'ADMINISTRADOR' || tipo === 'PROMOTORIA';
}

const FROM_ASIGNATURA_BASE = `
 FROM asignaturas a
 INNER JOIN grupos g ON g.id = a.grupo_id
 LEFT JOIN niveles n ON n.id = g.nivel_id
 LEFT JOIN turnos t ON t.id = g.turno_id
 LEFT JOIN cursos c ON c.id = a.curso_id`;

const FROM_EXAMEN_BASE = `
 FROM asignaturas_examenes ae
 INNER JOIN asignaturas a ON a.id = ae.asignatura_id
 INNER JOIN grupos g ON g.id = a.grupo_id`;

const FROM_PREGUNTA_EXAMEN_BASE = `
 FROM asignaturas_examenes_preguntas ep
 INNER JOIN asignaturas_examenes ae ON ae.id = ep.examen_id
 INNER JOIN asignaturas a ON a.id = ae.asignatura_id
 INNER JOIN grupos g ON g.id = a.grupo_id`;

const FROM_ALTERNATIVA_EXAMEN_BASE = `
 FROM asignaturas_examenes_preguntas_alternativas aa
 INNER JOIN asignaturas_examenes_preguntas ep ON ep.id = aa.pregunta_id
 INNER JOIN asignaturas_examenes ae ON ae.id = ep.examen_id
 INNER JOIN asignaturas a ON a.id = ae.asignatura_id
 INNER JOIN grupos g ON g.id = a.grupo_id`;

const FROM_RESULTADO_PRUEBA_BASE = `
 FROM asignaturas_examenes_pruebas aep
 INNER JOIN asignaturas_examenes ae ON ae.id = aep.examen_id
 INNER JOIN asignaturas a ON a.id = ae.asignatura_id
 INNER JOIN grupos g ON g.id = a.grupo_id`;

/**
 * @returns {{ where: string, params: any[] } | null}
 */
function buildAccesoAsignaturaWhere(req, aliasAsignatura = 'a') {
  const { colegio_id, anio_activo, tipo, personal_id } = req.user;
  const anio = parseInt(anio_activo, 10);
  if (!colegio_id || !Number.isFinite(anio)) return null;

  if (esStaffColegio(tipo)) {
    return {
      where: ` AND ${aliasAsignatura}.colegio_id = ? AND g.anio = ?`,
      params: [colegio_id, anio],
    };
  }

  if (!personal_id) return null;

  return {
    where: ` AND ${aliasAsignatura}.personal_id = ? AND ${aliasAsignatura}.colegio_id = ? AND g.anio = ?`,
    params: [personal_id, colegio_id, anio],
  };
}

async function fetchWithAcceso(query, req, opts) {
  const {
    selectSql,
    fromSql,
    idColumn,
    idValue,
    aliasAsignatura = 'a',
    extraJoins = '',
  } = opts;

  const id = parseInt(idValue, 10);
  if (!Number.isFinite(id)) return null;

  const acceso = buildAccesoAsignaturaWhere(req, aliasAsignatura);
  if (!acceso) return null;

  const rows = await query(
    `SELECT ${selectSql}${fromSql}${extraJoins} WHERE ${idColumn} = ?${acceso.where}`,
    [id, ...acceso.params]
  );
  return rows && rows[0] ? rows[0] : null;
}

/**
 * @returns {Promise<object|null>} fila de asignaturas o null
 */
async function fetchAsignaturaConAcceso(query, req, asignaturaId, selectSql = 'a.*') {
  return fetchWithAcceso(query, req, {
    selectSql,
    fromSql: FROM_ASIGNATURA_BASE,
    idColumn: 'a.id',
    idValue: asignaturaId,
    aliasAsignatura: 'a',
  });
}

/**
 * @returns {Promise<object|null>} fila del examen (y joins del FROM) o null
 */
async function fetchExamenConAcceso(query, req, examenId, selectSql = 'ae.*', extraJoins = '') {
  return fetchWithAcceso(query, req, {
    selectSql,
    fromSql: FROM_EXAMEN_BASE,
    idColumn: 'ae.id',
    idValue: examenId,
    aliasAsignatura: 'a',
    extraJoins,
  });
}

/**
 * @returns {Promise<object|null>} fila de la prueba/resultado o null
 */
async function fetchResultadoPruebaConAcceso(
  query,
  req,
  resultadoId,
  selectSql = 'aep.*',
  extraJoins = ''
) {
  return fetchWithAcceso(query, req, {
    selectSql,
    fromSql: FROM_RESULTADO_PRUEBA_BASE,
    idColumn: 'aep.id',
    idValue: resultadoId,
    aliasAsignatura: 'a',
    extraJoins,
  });
}

/**
 * @returns {Promise<object|null>} fila de la pregunta o null
 */
async function fetchPreguntaExamenConAcceso(
  query,
  req,
  preguntaId,
  selectSql = 'ep.*',
  extraJoins = ''
) {
  return fetchWithAcceso(query, req, {
    selectSql,
    fromSql: FROM_PREGUNTA_EXAMEN_BASE,
    idColumn: 'ep.id',
    idValue: preguntaId,
    aliasAsignatura: 'a',
    extraJoins,
  });
}

/**
 * @returns {Promise<object|null>} fila de la alternativa o null
 */
async function fetchAlternativaExamenConAcceso(
  query,
  req,
  alternativaId,
  selectSql = 'aa.*',
  extraJoins = ''
) {
  return fetchWithAcceso(query, req, {
    selectSql,
    fromSql: FROM_ALTERNATIVA_EXAMEN_BASE,
    idColumn: 'aa.id',
    idValue: alternativaId,
    aliasAsignatura: 'a',
    extraJoins,
  });
}

module.exports = {
  esStaffColegio,
  buildAccesoAsignaturaWhere,
  fetchAsignaturaConAcceso,
  fetchExamenConAcceso,
  fetchResultadoPruebaConAcceso,
  fetchPreguntaExamenConAcceso,
  fetchAlternativaExamenConAcceso,
};
