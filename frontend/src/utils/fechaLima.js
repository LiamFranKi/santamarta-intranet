/**
 * Fechas sin zona horaria: interpretar/guardar como hora de pared (America/Lima).
 * Evita new Date(string) con ISO UTC que desplaza ~5 h en Perú.
 */

/** YYYY-MM-DD HH:mm:ss o ISO → Date local con esos componentes (sin conversión UTC). */
export function crearFechaLima(fechaString) {
  if (!fechaString) return null;

  if (fechaString instanceof Date) {
    return new Date(
      fechaString.getFullYear(),
      fechaString.getMonth(),
      fechaString.getDate(),
      fechaString.getHours(),
      fechaString.getMinutes(),
      fechaString.getSeconds()
    );
  }

  const str = fechaString.toString().trim();
  const fechaPart = str.replace('T', ' ').split(' ')[0];
  const horaPart = (str.replace('T', ' ').split(' ')[1] || '00:00:00')
    .replace(/\.\d+Z?$/i, '')
    .replace(/Z$/i, '');

  const [year, month, day] = fechaPart.split('-').map(Number);
  const [hours, minutes, seconds = 0] = horaPart.split(':').map((n) => parseInt(n, 10) || 0);

  if (!year || !month || !day) return null;

  return new Date(year, month - 1, day, hours, minutes, seconds);
}

/** Input datetime-local (YYYY-MM-DDTHH:mm) → YYYY-MM-DD HH:mm:ss */
export function datetimeLocalAMysql(fechaLocal) {
  if (!fechaLocal) return null;
  const [datePart, timePart = '00:00'] = String(fechaLocal).split('T');
  if (!datePart) return null;
  const [h = '00', m = '00'] = timePart.split(':');
  return `${datePart} ${h.padStart(2, '0')}:${m.padStart(2, '0')}:00`;
}

/** YYYY-MM-DD HH:mm:ss → valor para input datetime-local */
export function mysqlADatetimeLocal(fechaString) {
  const fecha = crearFechaLima(fechaString);
  if (!fecha) return '';
  const year = fecha.getFullYear();
  const month = String(fecha.getMonth() + 1).padStart(2, '0');
  const day = String(fecha.getDate()).padStart(2, '0');
  const hours = String(fecha.getHours()).padStart(2, '0');
  const minutes = String(fecha.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}
