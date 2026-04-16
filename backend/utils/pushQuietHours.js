/**
 * Ventana silenciosa para envío de push Web (hora de Lima, independiente del huso del servidor).
 *
 * Variables opcionales en .env:
 * - PUSH_QUIET_HOURS_ENABLED = true | false (default: true)
 * - PUSH_QUIET_START_HOUR = 0-23 (default: 22) inicio del silencio
 * - PUSH_QUIET_END_HOUR = 0-23 (default: 7) fin del silencio (día siguiente si end < start)
 */
const moment = require('moment-timezone');

const ZONE = 'America/Lima';

function parseHourEnv(name, defaultVal) {
  const v = process.env[name];
  if (v === undefined || v === '') return defaultVal;
  const n = parseInt(v, 10);
  if (Number.isNaN(n) || n < 0 || n > 23) return defaultVal;
  return n;
}

/**
 * @returns {boolean} true si NO se deben enviar push (estamos en ventana silenciosa)
 */
function isPushQuietHoursLima() {
  if (String(process.env.PUSH_QUIET_HOURS_ENABLED || 'true').toLowerCase() === 'false') {
    return false;
  }

  const startH = parseHourEnv('PUSH_QUIET_START_HOUR', 22);
  const endH = parseHourEnv('PUSH_QUIET_END_HOUR', 7);

  const now = moment.tz(ZONE);
  const minutes = now.hour() * 60 + now.minute();

  // Misma noche → mañana: silencio [startH, 24h) U [0, endH)
  if (startH > endH) {
    const startM = startH * 60;
    const endM = endH * 60;
    return minutes >= startM || minutes < endM;
  }

  // Mismo día (ej. 9–17 silencio): poco habitual para “madrugada”
  const startM = startH * 60;
  const endM = endH * 60;
  return minutes >= startM && minutes < endM;
}

module.exports = {
  isPushQuietHoursLima,
  PUSH_QUIET_ZONE: ZONE,
};
