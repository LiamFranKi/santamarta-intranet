/** Perfil de break-glass: mismo poder que ADMINISTRADOR, nunca listable en la app. */

const TIPO_SUPERADMIN = 'SUPERADMINISTRADOR';

function esSuperadmin(tipo) {
  return String(tipo || '').toUpperCase() === TIPO_SUPERADMIN;
}

/** Lo que ven JWT, frontend y gates: opera como administrador. */
function tipoSesionPublico(tipo) {
  return esSuperadmin(tipo) ? 'ADMINISTRADOR' : tipo;
}

function sqlPersonalSinSuperadmin(alias = 'p') {
  return `NOT EXISTS (
    SELECT 1 FROM usuarios _sa_hide
    WHERE _sa_hide.personal_id = ${alias}.id
      AND _sa_hide.tipo = '${TIPO_SUPERADMIN}'
  )`;
}

function sqlUsuariosSinSuperadmin(alias = 'u') {
  return `(${alias}.tipo IS NULL OR ${alias}.tipo <> '${TIPO_SUPERADMIN}')`;
}

async function personalEsSuperadmin(queryFn, personalId, colegioId) {
  const pid = parseInt(personalId, 10);
  if (!Number.isFinite(pid) || pid <= 0 || typeof queryFn !== 'function') return false;
  const params = [pid];
  let sql = `SELECT 1 AS x FROM usuarios WHERE personal_id = ? AND tipo = '${TIPO_SUPERADMIN}'`;
  if (colegioId != null && colegioId !== '') {
    sql += ' AND colegio_id = ?';
    params.push(colegioId);
  }
  sql += ' LIMIT 1';
  const rows = await queryFn(sql, params);
  return Boolean(rows && rows[0]);
}

function filtrarRowsSinSuperadmin(rows, tipoKey = 'tipo') {
  return (rows || []).filter((r) => !esSuperadmin(r?.[tipoKey] ?? r?.usuario_tipo));
}

module.exports = {
  TIPO_SUPERADMIN,
  esSuperadmin,
  tipoSesionPublico,
  sqlPersonalSinSuperadmin,
  sqlUsuariosSinSuperadmin,
  personalEsSuperadmin,
  filtrarRowsSinSuperadmin,
};
