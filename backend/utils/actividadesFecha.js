/**
 * Fechas de actividades: DATETIME en MySQL = hora de pared America/Lima (sin zona en columna).
 * DATE_FORMAT en SELECT evita que mysql2 serialice como Date UTC en JSON (+5 h en front).
 */

const ACTIVIDADES_SELECT_SQL = `
  SELECT
    a.id,
    a.colegio_id,
    a.descripcion,
    a.lugar,
    a.detalles,
    a.usuario_id,
    DATE_FORMAT(a.fecha_inicio, '%Y-%m-%d %H:%i:%s') AS fecha_inicio,
    DATE_FORMAT(a.fecha_fin, '%Y-%m-%d %H:%i:%s') AS fecha_fin
  FROM actividades a
`;

/** Igual que ACTIVIDADES_SELECT_SQL + columna fecha_evento (solo día) para dashboards. */
const ACTIVIDADES_SELECT_CON_EVENTO_SQL = `
  SELECT
    a.id,
    a.colegio_id,
    a.descripcion,
    a.lugar,
    a.detalles,
    a.usuario_id,
    DATE_FORMAT(a.fecha_inicio, '%Y-%m-%d %H:%i:%s') AS fecha_inicio,
    DATE_FORMAT(a.fecha_fin, '%Y-%m-%d %H:%i:%s') AS fecha_fin,
    DATE(a.fecha_inicio) AS fecha_evento
  FROM actividades a
`;

const DATETIME_MYSQL_RE = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/;

function normalizarDatetimeMysqlEntrada(val) {
  if (val == null || val === '') return null;
  const str = String(val).trim();
  const directo = str.match(DATETIME_MYSQL_RE);
  if (directo) return str;
  const iso = str.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})/);
  if (iso) return `${iso[1]} ${iso[2]}`;
  return null;
}

function timestampDatetimeMysql(val) {
  const norm = normalizarDatetimeMysqlEntrada(val);
  if (!norm) return NaN;
  const m = norm.match(DATETIME_MYSQL_RE);
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
}

function compararDatetimeMysql(a, b) {
  return timestampDatetimeMysql(a) - timestampDatetimeMysql(b);
}

function esDatetimeMysqlValido(val) {
  return normalizarDatetimeMysqlEntrada(val) != null && Number.isFinite(timestampDatetimeMysql(val));
}

module.exports = {
  ACTIVIDADES_SELECT_SQL,
  ACTIVIDADES_SELECT_CON_EVENTO_SQL,
  DATETIME_MYSQL_RE,
  normalizarDatetimeMysqlEntrada,
  compararDatetimeMysql,
  esDatetimeMysqlValido
};
