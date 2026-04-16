/**
 * Idempotencia para jobs programados (reinicios PM2): evita reenviar campanita/push
 * el mismo día en hora de Lima para la misma clave lógica.
 *
 * Requiere tabla push_cron_dedup (ver database/migrations/028_push_cron_dedup_mysql.sql).
 */
const moment = require('moment-timezone');
const { execute } = require('./mysql');

let warnedMissingTable = false;

/**
 * @param {string} jobType ej. 'tarea_por_vencer', 'cumpleanos_dia_usuario'
 * @param {string} dedupKey clave única dentro del día (ej. tareaId + tipo o userId)
 * @param {string} fechaLimaYmd YYYY-MM-DD en America/Lima
 * @returns {Promise<boolean>} true si es la primera vez hoy (insert OK), false si ya existía
 */
async function tryInsertPushCronDedup(jobType, dedupKey, fechaLimaYmd) {
  const jt = String(jobType || '').slice(0, 64);
  const key = String(dedupKey || '').slice(0, 255);
  const fecha = String(fechaLimaYmd || '').slice(0, 10);
  if (!jt || !key || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return true;
  }

  try {
    const result = await execute(
      `INSERT IGNORE INTO push_cron_dedup (job_type, dedup_key, fecha_lima) VALUES (?, ?, ?)`,
      [jt, key, fecha]
    );
    return result.affectedRows === 1;
  } catch (e) {
    if (e.code === 'ER_NO_SUCH_TABLE' || e.errno === 1146) {
      if (!warnedMissingTable) {
        console.warn(
          '⚠️ [push_cron_dedup] Tabla push_cron_dedup no existe. Ejecute database/migrations/028_push_cron_dedup_mysql.sql. Sin deduplicación entre reinicios.'
        );
        warnedMissingTable = true;
      }
      return true;
    }
    throw e;
  }
}

function fechaLimaYmd() {
  return moment.tz('America/Lima').format('YYYY-MM-DD');
}

module.exports = {
  tryInsertPushCronDedup,
  fechaLimaYmd,
};
