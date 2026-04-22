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

/** Solo fecha calendario Lima → `YYYY-MM-DD` (auditoría, filtros “hoy”, etc.). */
function fechaMySQLLima(date) {
  if (date != null && date !== undefined) {
    return moment(date).tz(ZONA_LIMA).format('YYYY-MM-DD');
  }
  return moment().tz(ZONA_LIMA).format('YYYY-MM-DD');
}

/** Solo hora en Lima → `HH:mm:ss`. */
function horaMySQLLima(date) {
  if (date != null && date !== undefined) {
    return moment(date).tz(ZONA_LIMA).format('HH:mm:ss');
  }
  return moment().tz(ZONA_LIMA).format('HH:mm:ss');
}

/** Texto legible para PDF / pantalla: `22/04/2026 15:30` (Lima). */
function fechaHoraTextoLima(date) {
  if (date == null || date === undefined || String(date).trim() === '') return '—';
  return moment(date).tz(ZONA_LIMA).format('DD/MM/YYYY HH:mm');
}

/** Solo fecha legible en Lima. */
function fechaTextoLima(date) {
  if (date == null || date === undefined || String(date).trim() === '') return '—';
  return moment(date).tz(ZONA_LIMA).format('DD/MM/YYYY');
}

module.exports = {
  fechaHoraMySQLLima,
  fechaMySQLLima,
  horaMySQLLima,
  fechaHoraTextoLima,
  fechaTextoLima,
  ZONA_LIMA
};
