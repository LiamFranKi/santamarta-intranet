const mysql = require('mysql2/promise');
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

const mysqlReadPool = mysql.createPool({
  host: mysqlHost,
  port: process.env.MYSQL_PORT || 3306,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  multipleStatements: false,
  // Configuración adicional para producción
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
  // Nota: La zona horaria se manejará en las consultas SQL usando DATE() y CURDATE()
  // o configurándola directamente en las consultas cuando sea necesario
  // Nota: 'reconnect' fue removido porque MySQL2 no lo soporta en createPool
});

async function query(sql, params = []) {
  try {
    const sqlUpper = sql.trim().toUpperCase();
    if (!sqlUpper.startsWith('SELECT')) {
      throw new Error('Solo se permiten consultas SELECT. Modificación de datos no permitida.');
    }
    // Asegurar que params es un array válido
    const queryParams = Array.isArray(params) ? params : [];
    const [rows] = await mysqlReadPool.execute(sql, queryParams);
    return rows;
  } catch (error) {
    console.error('MySQL Error:', error);
    console.error('SQL:', sql);
    console.error('Params:', params);
    throw error;
  }
}

// Función para ejecutar consultas de escritura (INSERT, UPDATE, DELETE)
async function execute(sql, params = []) {
  try {
    const [result] = await mysqlReadPool.execute(sql, params);
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
    const [rows] = await mysqlReadPool.execute(
      'SELECT anio_activo FROM colegios WHERE id = ?',
      [colegioId]
    );
    return rows.length > 0 ? rows[0].anio_activo : null;
  } catch (error) {
    console.error('Error obteniendo año activo:', error);
    throw error;
  }
}

module.exports = { query, execute, mysqlReadPool, getAnioActivo };

