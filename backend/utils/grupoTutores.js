/**
 * Dos tutores por grupo (grupos.tutor_id + grupos.tutor_id_2).
 * - tutor_id: Tutor
 * - tutor_id_2: Co-Tutor (segundo; 0 = sin asignar)
 */

const ETIQUETA_TUTOR = 'Tutor';
const ETIQUETA_CO_TUTOR = 'Co-Tutor';

/** Condición SQL: personal_id es Tutor o Co-Tutor del grupo (alias g). */
const SQL_G_PERSONAL_ES_TUTOR = '(g.tutor_id = ? OR (COALESCE(g.tutor_id_2, 0) > 0 AND g.tutor_id_2 = ?))';

function sqlPersonalEsTutor(alias = 'g') {
  const a = alias;
  return `(${a}.tutor_id = ? OR (COALESCE(${a}.tutor_id_2, 0) > 0 AND ${a}.tutor_id_2 = ?))`;
}

/** @returns {[number, number]} */
function paramsPersonalEsTutor(personalId) {
  const p = parseInt(personalId, 10);
  return [p, p];
}

/** WHERE g.id = ? AND es tutor AND g.colegio_id = ? AND g.anio = ? */
function sqlGrupoIdPersonalEsTutorConAnio(alias = 'g') {
  return `${alias}.id = ? AND ${sqlPersonalEsTutor(alias)} AND ${alias}.colegio_id = ? AND ${alias}.anio = ?`;
}

function paramsGrupoIdPersonalEsTutorConAnio(grupoId, personalId, colegioId, anio) {
  return [grupoId, ...paramsPersonalEsTutor(personalId), colegioId, anio];
}

/** WHERE es tutor AND g.colegio_id = ? AND g.anio = ? */
function sqlGruposDondePersonalEsTutorConAnio(alias = 'g') {
  return `${sqlPersonalEsTutor(alias)} AND ${alias}.colegio_id = ? AND ${alias}.anio = ?`;
}

function paramsGruposDondePersonalEsTutorConAnio(personalId, colegioId, anio) {
  return [...paramsPersonalEsTutor(personalId), colegioId, anio];
}

/** WHERE g.id = ? AND es tutor AND g.colegio_id = ? (sin filtro año) */
function sqlGrupoIdPersonalEsTutor(alias = 'g') {
  return `${alias}.id = ? AND ${sqlPersonalEsTutor(alias)} AND ${alias}.colegio_id = ?`;
}

function paramsGrupoIdPersonalEsTutor(grupoId, personalId, colegioId) {
  return [grupoId, ...paramsPersonalEsTutor(personalId), colegioId];
}

async function fetchEsTutorDelGrupo(queryFn, grupoId, personalId, colegioId, anio) {
  const rows = await queryFn(
    `SELECT 1 FROM grupos g WHERE ${sqlGrupoIdPersonalEsTutorConAnio('g')} LIMIT 1`,
    paramsGrupoIdPersonalEsTutorConAnio(grupoId, personalId, colegioId, anio)
  );
  return !!(rows && rows.length);
}

function personalEsTutorDeGrupoMeta(personalId, grupoMeta) {
  const pid = parseInt(personalId, 10);
  if (Number.isNaN(pid)) return false;
  const t1 = grupoMeta?.tutor_id != null ? parseInt(grupoMeta.tutor_id, 10) : 0;
  const t2 = grupoMeta?.tutor_id_2 != null ? parseInt(grupoMeta.tutor_id_2, 10) : 0;
  return (t1 > 0 && pid === t1) || (t2 > 0 && pid === t2);
}

/**
 * @param {object} body
 * @returns {{ error?: string, tutor_id: number|null, tutor_id_2: number|null, tutor_id_save: number, tutor_id_2_save: number }}
 */
function parseTutorIdsFromBody(body) {
  const raw1 = body?.tutor_id;
  const raw2 = body?.tutor_id_2;
  const tutor_id =
    raw1 != null && raw1 !== '' ? parseInt(raw1, 10) : null;
  const tutor_id_2 =
    raw2 != null && raw2 !== '' ? parseInt(raw2, 10) : null;
  const t1 = tutor_id && tutor_id > 0 ? tutor_id : 0;
  const t2 = tutor_id_2 && tutor_id_2 > 0 ? tutor_id_2 : 0;
  if (t1 && t2 && t1 === t2) {
    return {
      error: `El ${ETIQUETA_TUTOR} y el ${ETIQUETA_CO_TUTOR} no pueden ser la misma persona.`,
      tutor_id: null,
      tutor_id_2: null,
      tutor_id_save: 0,
      tutor_id_2_save: 0
    };
  }
  return {
    tutor_id: t1 || null,
    tutor_id_2: t2 || null,
    tutor_id_save: t1 || 0,
    tutor_id_2_save: t2 || 0
  };
}

/** Texto para libretas / reportes (solo nombres, separados por "  /  "). */
function formatearTutoresLibreta(maestroNombre, tutor2Nombre) {
  const m = String(maestroNombre || '').trim();
  const t = String(tutor2Nombre || '').trim();
  const partes = [m, t].filter(Boolean);
  return partes.length ? partes.join('  /  ') : 'No asignado';
}

/** Condición JOIN u.personal_id ↔ Tutor o Co-Tutor del grupo (alias g, u). */
function sqlUsuarioEsTutorDeGrupo(aliasGrupo = 'g', aliasUsuario = 'u') {
  const g = aliasGrupo;
  const u = aliasUsuario;
  return `((${g}.tutor_id > 0 AND ${u}.personal_id = ${g}.tutor_id)
    OR (COALESCE(${g}.tutor_id_2, 0) > 0 AND ${u}.personal_id = ${g}.tutor_id_2))`;
}

/**
 * Usuarios DOCENTE activos que son Tutor o Co-Tutor de los grupos indicados.
 * @param {Function} queryFn
 * @param {number} colegio_id
 * @param {number[]} grupoIds
 */
async function fetchUsuariosTutoresGrupos(queryFn, colegio_id, grupoIds) {
  const ids = [...new Set((grupoIds || []).map((id) => parseInt(id, 10)).filter((n) => !Number.isNaN(n) && n > 0))];
  if (ids.length === 0) return [];
  const ph = ids.map(() => '?').join(',');
  const rows = await queryFn(
    `SELECT DISTINCT u.id AS usuario_id
     FROM grupos g
     INNER JOIN usuarios u ON u.colegio_id = g.colegio_id
       AND u.estado = 'ACTIVO'
       AND u.tipo = 'DOCENTE'
       AND ${sqlUsuarioEsTutorDeGrupo('g', 'u')}
     WHERE g.id IN (${ph})
       AND g.colegio_id = ?`,
    [...ids, colegio_id]
  );
  return rows || [];
}

module.exports = {
  SQL_G_PERSONAL_ES_TUTOR,
  sqlPersonalEsTutor,
  paramsPersonalEsTutor,
  sqlGrupoIdPersonalEsTutorConAnio,
  paramsGrupoIdPersonalEsTutorConAnio,
  sqlGruposDondePersonalEsTutorConAnio,
  paramsGruposDondePersonalEsTutorConAnio,
  sqlGrupoIdPersonalEsTutor,
  paramsGrupoIdPersonalEsTutor,
  fetchEsTutorDelGrupo,
  personalEsTutorDeGrupoMeta,
  parseTutorIdsFromBody,
  formatearTutoresLibreta,
  sqlUsuarioEsTutorDeGrupo,
  fetchUsuariosTutoresGrupos
};
