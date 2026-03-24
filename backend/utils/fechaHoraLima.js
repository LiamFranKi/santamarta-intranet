/**
 * Fecha/hora en America/Lima como string MySQL DATETIME (sin componente de zona).
 * Evita usar toISOString() (siempre UTC) o NOW() de MySQL cuando la zona del servidor
 * no coincide con Perú, que desplazaba ~5 h en publicaciones, mensajes y notificaciones.
 */
const moment = require('moment-timezone');

const ZONA_LIMA = 'America/Lima';

function fechaHoraMySQLLima(date) {
  if (date != null && date !== undefined) {
    return moment(date).tz(ZONA_LIMA).format('YYYY-MM-DD HH:mm:ss');
  }
  return moment().tz(ZONA_LIMA).format('YYYY-MM-DD HH:mm:ss');
}

module.exports = {
  fechaHoraMySQLLima,
  ZONA_LIMA
};
