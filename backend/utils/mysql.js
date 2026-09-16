const mysql = require('mysql2/promise');
const mysqlFormat = require('mysql2').format;
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Detectar si estamos en producción o desarrollo
const isProduction = process.env.NODE_ENV === 'production';

// En producción: conexión directa al MySQL remoto
// En desarrollo: conexión a través del túnel SSH (localhost)
// IMPORTANTE: Usar 127.0.0.1 en lugar de localhost para evitar problemas con IPv6
const mysqlHost = isProduction
  ? (process.env.MYSQL_HOST_PRODUCTION || process.env.MYSQL_HOST || '127.0.0.1')
  : (process.env.MYSQL_HOST_DEVELOPMENT || process.env.MYSQL_HOST || '127.0.0.1');

console.log(`🔌 MySQL: ${isProduction ? 'PRODUCCIÓN' : 'DESARROLLO'} - Host: ${mysqlHost}`);

/** Límite por proceso Node; con muchos usuarios concurrentes, 10 saturaba el pool (colas largas). Ajustar con MYSQL_CONNECTION_LIMIT (5–100). */
function mysqlPoolConnectionLimit() {
  const raw = parseInt(String(process.env.MYSQL_CONNECTION_LIMIT || '').trim(), 10);
  if (Number.isFinite(raw) && raw >= 5 && raw <= 100) return raw;
  return isProduction ? 32 : 12;
}
const MYSQL_POOL_LIMIT = mysqlPoolConnectionLimit();
console.log(`🔌 MySQL pool connectionLimit=${MYSQL_POOL_LIMIT} (opcional: MYSQL_CONNECTION_LIMIT; max_connections del servidor debe ser mayor)`);

const mysqlReadPool = mysql.createPool({
  host: mysqlHost,
  port: process.env.MYSQL_PORT || 3306,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  waitForConnections: true,
  connectionLimit: MYSQL_POOL_LIMIT,
  queueLimit: 0,
  multipleStatements: false,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  // Nota: NO usar pool.timezone ni SET time_zone en 'connection':
  // en mysql2/promise rompe el pool (Error: Cannot read properties of undefined reading 'length').
  // La hora Lima del biométrico se resuelve en biometricoHikvision (parseEventDateTime).
});

/**
 * mysql2.format / pool.query sustituyen TODOS los `?` del string, también dentro
 * de literales, REGEXP o comentarios. Eso rompe consultas tipo
 * REGEXP '^[0-9]+\.?[0-9]*$' cuando hay parámetros.
 * Se enmascaran literales/comentarios, se formatean los placeholders reales y se restauran.
 */
const SQL_LITERAL_OR_COMMENT =
  /('(?:''|\\.|[^'\\])*')|(`(?:``|\\.|[^`\\])*`)|(\/\*[\s\S]*?\*\/)|(--[^\n\r]*)/g;

function maskSqlLiterals(sql) {
  const parts = [];
  const masked = String(sql).replace(SQL_LITERAL_OR_COMMENT, (m) => {
    const i = parts.length;
    parts.push(m);
    return `/*SQLMASK${i}*/`;
  });
  return { masked, parts };
}

function unmaskSqlLiterals(sql, parts) {
  return String(sql).replace(/\/\*SQLMASK(\d+)\*\//g, (_, idx) => parts[Number(idx)] ?? '');
}

function formatSqlTextProtocol(sql, params) {
  const queryParams = Array.isArray(params) ? params : [];
  if (queryParams.length === 0) return sql;
  const { masked, parts } = maskSqlLiterals(sql);
  return unmaskSqlLiterals(mysqlFormat(masked, queryParams), parts);
}

async function runTextQuery(sql, params) {
  const formatted = formatSqlTextProtocol(sql, params);
  return mysqlReadPool.query(formatted);
}

async function query(sql, params = []) {
  try {
    const sqlNorm = sql.trim().replace(/^[\s(]+/, '').toUpperCase();
    if (!sqlNorm.startsWith('SELECT')) {
      throw new Error('Solo se permiten consultas SELECT. Modificación de datos no permitida.');
    }
    const [rows] = await runTextQuery(sql, params);
    return rows;
  } catch (error) {
    console.error('MySQL Error:', error);
    console.error('SQL:', sql);
    console.error('Params:', params);
    throw error;
  }
}

async function execute(sql, params = []) {
  try {
    const [result] = await runTextQuery(sql, params);
    return result;
  } catch (error) {
    const isDup =
      error?.code === 'ER_DUP_ENTRY' ||
      error?.errno === 1062 ||
      String(error?.sqlMessage || '').includes('Duplicate entry');
    if (!isDup) {
      console.error('MySQL Execute Error:', error);
    }
    throw error;
  }
}

async function getAnioActivo(colegioId) {
  try {
    const [rows] = await runTextQuery(
      'SELECT anio_activo FROM colegios WHERE id = ?',
      [colegioId]
    );
    return rows.length > 0 ? rows[0].anio_activo : null;
  } catch (error) {
    console.error('Error obteniendo año activo:', error);
    throw error;
  }
}

module.exports = { query, execute, mysqlReadPool, getAnioActivo, formatSqlTextProtocol };
