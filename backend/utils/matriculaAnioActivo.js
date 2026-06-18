/**
 * Matrícula operativa en el año académico electivo (colegios.anio_activo):
 * - Regular (estado = 0)
 * - Grupo del mismo colegio y año
 * - Matrícula pagada: pagos.tipo = 0, estado_pago = CANCELADO, estado = ACTIVO
 */
const { MATRICULA_ESTADO } = require('./matriculaEstados');

const SELECT_MATRICULA_QR = `m.*, g.grado, g.seccion, g.anio AS grupo_anio, n.nombre AS nivel_nombre`;

function sqlExistePagoMatriculaCancelado(aliasMatricula = 'm') {
  const a = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(String(aliasMatricula)) ? String(aliasMatricula) : 'm';
  return `EXISTS (
    SELECT 1 FROM pagos p_mat_ac
    WHERE p_mat_ac.matricula_id = ${a}.id
      AND p_mat_ac.colegio_id = ${a}.colegio_id
      AND p_mat_ac.estado = 'ACTIVO'
      AND p_mat_ac.tipo = 0
      AND p_mat_ac.estado_pago = 'CANCELADO'
  )`;
}

/** Condiciones SQL sobre alias m/g ya unidos a matrículas y grupos. */
function sqlWhereMatriculaAnioActivoOperativa(aliasMatricula = 'm', aliasGrupo = 'g') {
  const m = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(String(aliasMatricula)) ? aliasMatricula : 'm';
  const g = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(String(aliasGrupo)) ? aliasGrupo : 'g';
  return `(${m}.estado = ${MATRICULA_ESTADO.REGULAR})
    AND ${g}.anio = ?
    AND ${sqlExistePagoMatriculaCancelado(m)}`;
}

/**
 * Subconsulta: id de matrícula operativa del alumno en el año electivo.
 * Params en orden: colegio_id, anio_activo
 */
function sqlMatriculaIdAnioActivoOperativa(aliasAlumno = 'a') {
  const al = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(String(aliasAlumno)) ? aliasAlumno : 'a';
  return `(
    SELECT m2.id
    FROM matriculas m2
    INNER JOIN grupos g2 ON g2.id = m2.grupo_id
    WHERE m2.alumno_id = ${al}.id
      AND m2.colegio_id = ?
      AND (m2.estado = ${MATRICULA_ESTADO.REGULAR})
      AND g2.anio = ?
      AND ${sqlExistePagoMatriculaCancelado('m2')}
    LIMIT 1
  )`;
}

async function fetchMatriculaAnioActivoOperativa(
  queryFn,
  alumnoId,
  colegio_id,
  anioActivo,
  selectSql = SELECT_MATRICULA_QR
) {
  if (!alumnoId || !colegio_id || !anioActivo) return [];
  return queryFn(
    `SELECT ${selectSql}
     FROM matriculas m
     INNER JOIN grupos g ON g.id = m.grupo_id
     INNER JOIN niveles n ON n.id = g.nivel_id
     WHERE m.alumno_id = ?
       AND m.colegio_id = ?
       AND ${sqlWhereMatriculaAnioActivoOperativa('m', 'g')}`,
    [alumnoId, colegio_id, anioActivo]
  );
}

async function alumnoTieneMatriculaAnioActivoOperativa(queryFn, alumnoId, colegio_id, anioActivo) {
  const rows = await fetchMatriculaAnioActivoOperativa(
    queryFn,
    alumnoId,
    colegio_id,
    anioActivo,
    'm.id'
  );
  return rows.length > 0;
}

async function contarHijosMatriculaAnioActivoOperativa(queryFn, apoderadoId, colegio_id, anioActivo) {
  if (!apoderadoId || !colegio_id || !anioActivo) return 0;
  const rows = await queryFn(
    `SELECT COUNT(DISTINCT a.id) AS total
     FROM familias f
     INNER JOIN alumnos a ON a.id = f.alumno_id AND a.colegio_id = ?
     INNER JOIN matriculas m ON m.alumno_id = a.id AND m.colegio_id = ?
     INNER JOIN grupos g ON g.id = m.grupo_id
     WHERE f.apoderado_id = ?
       AND ${sqlWhereMatriculaAnioActivoOperativa('m', 'g')}`,
    [colegio_id, colegio_id, apoderadoId, anioActivo]
  );
  return Number(rows[0]?.total || 0);
}

async function apoderadoTieneHijoMatriculaAnioActivoOperativa(queryFn, apoderadoId, colegio_id, anioActivo) {
  const total = await contarHijosMatriculaAnioActivoOperativa(
    queryFn,
    apoderadoId,
    colegio_id,
    anioActivo
  );
  return total > 0;
}

async function apoderadoEsPadreDeAlumnoColegio(queryFn, apoderadoId, alumnoId, colegio_id) {
  const rows = await queryFn(
    `SELECT COUNT(*) AS total
     FROM familias f
     INNER JOIN alumnos a ON a.id = f.alumno_id
     WHERE f.apoderado_id = ?
       AND a.id = ?
       AND a.colegio_id = ?`,
    [apoderadoId, alumnoId, colegio_id]
  );
  return Number(rows[0]?.total || 0) > 0;
}

async function apoderadoHijoTieneMatriculaAnioActivoOperativa(
  queryFn,
  apoderadoId,
  alumnoId,
  colegio_id,
  anioActivo
) {
  const esPadre = await apoderadoEsPadreDeAlumnoColegio(queryFn, apoderadoId, alumnoId, colegio_id);
  if (!esPadre) return false;
  return alumnoTieneMatriculaAnioActivoOperativa(queryFn, alumnoId, colegio_id, anioActivo);
}

/**
 * Docente/admin con hijos vía mismo DNI en apoderados.
 */
async function personalHijoTieneMatriculaAnioActivoOperativa(
  queryFn,
  nroDocumento,
  alumnoId,
  colegio_id,
  anioActivo
) {
  const rows = await queryFn(
    `SELECT COUNT(*) AS total
     FROM apoderados ap
     INNER JOIN familias f ON f.apoderado_id = ap.id
     INNER JOIN alumnos a ON a.id = f.alumno_id
     INNER JOIN matriculas m ON m.alumno_id = a.id AND m.colegio_id = ap.colegio_id
     INNER JOIN grupos g ON g.id = m.grupo_id
     WHERE ap.colegio_id = ?
       AND ap.nro_documento = ?
       AND a.id = ?
       AND a.colegio_id = ?
       AND ${sqlWhereMatriculaAnioActivoOperativa('m', 'g')}`,
    [colegio_id, nroDocumento, alumnoId, colegio_id, anioActivo]
  );
  return Number(rows[0]?.total || 0) > 0;
}

const MENSAJE_SIN_MATRICULA =
  'No tiene matrícula activa pagada para el año académico actual. Contacte a secretaría.';

/** FROM/WHERE para listar hijos del apoderado matriculados en el año electivo. Params: apoderado_id, colegio_id, anio_activo */
function sqlFromHijosApoderadoMatriculaAnioActivo() {
  return `
    FROM apoderados ap
    INNER JOIN familias f ON f.apoderado_id = ap.id
    INNER JOIN alumnos a ON a.id = f.alumno_id AND a.colegio_id = ap.colegio_id
    INNER JOIN matriculas m ON m.alumno_id = a.id AND m.colegio_id = ap.colegio_id
    INNER JOIN grupos g ON g.id = m.grupo_id
    INNER JOIN niveles n ON n.id = g.nivel_id
    INNER JOIN turnos t ON t.id = g.turno_id
    WHERE ap.id = ?
      AND ap.colegio_id = ?
      AND ${sqlWhereMatriculaAnioActivoOperativa('m', 'g')}
  `;
}

const SQL_SELECT_CAMPOS_HIJO_APODERADO = `
  SELECT DISTINCT
    a.id,
    a.nombres,
    a.apellido_paterno,
    a.apellido_materno,
    a.nro_documento AS dni,
    a.foto,
    g.grado,
    g.seccion,
    n.nombre AS nivel_nombre,
    t.nombre AS turno_nombre,
    m.id AS matricula_id
`;

/**
 * Verificación en login (solo ALUMNO y APODERADO).
 * @returns {{ permitido: boolean, mensaje?: string }}
 */
async function verificarMatriculaPortalLogin(queryFn, usuario, anioActivo) {
  const tipo = String(usuario?.tipo || '').toUpperCase();

  if (tipo === 'ALUMNO') {
    if (!usuario.alumno_id) {
      return { permitido: false, mensaje: MENSAJE_SIN_MATRICULA };
    }
    const ok = await alumnoTieneMatriculaAnioActivoOperativa(
      queryFn,
      usuario.alumno_id,
      usuario.colegio_id,
      anioActivo
    );
    return ok ? { permitido: true } : { permitido: false, mensaje: MENSAJE_SIN_MATRICULA };
  }

  if (tipo === 'APODERADO') {
    if (!usuario.apoderado_id) {
      return { permitido: false, mensaje: MENSAJE_SIN_MATRICULA };
    }
    const ok = await apoderadoTieneHijoMatriculaAnioActivoOperativa(
      queryFn,
      usuario.apoderado_id,
      usuario.colegio_id,
      anioActivo
    );
    return ok ? { permitido: true } : { permitido: false, mensaje: MENSAJE_SIN_MATRICULA };
  }

  return { permitido: true };
}

module.exports = {
  SELECT_MATRICULA_QR,
  MENSAJE_SIN_MATRICULA,
  SQL_SELECT_CAMPOS_HIJO_APODERADO,
  sqlExistePagoMatriculaCancelado,
  sqlWhereMatriculaAnioActivoOperativa,
  sqlMatriculaIdAnioActivoOperativa,
  sqlFromHijosApoderadoMatriculaAnioActivo,
  fetchMatriculaAnioActivoOperativa,
  alumnoTieneMatriculaAnioActivoOperativa,
  contarHijosMatriculaAnioActivoOperativa,
  apoderadoTieneHijoMatriculaAnioActivoOperativa,
  apoderadoEsPadreDeAlumnoColegio,
  apoderadoHijoTieneMatriculaAnioActivoOperativa,
  personalHijoTieneMatriculaAnioActivoOperativa,
  verificarMatriculaPortalLogin
};
