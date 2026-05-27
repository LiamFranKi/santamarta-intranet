/**
 * Fechas de `pagos`: placeholder 1970 (pendiente legado) y normalización al cobrar.
 */
const { fechaHoraMySQLLima } = require('./fechaHoraLima');

function esFechaHoraPlaceholder1970(fh) {
  if (fh == null || fh === '') return true;
  if (Object.prototype.toString.call(fh) === '[object Date]' && !Number.isNaN(fh.getTime())) {
    return fh.getFullYear() === 1970 && fh.getMonth() === 0 && fh.getDate() <= 1;
  }
  const s = String(fh).trim();
  return s.startsWith('1970-01-01') || s.startsWith('1970-01-02');
}

function esFechaPlaceholder1970(fc) {
  if (fc == null || fc === '') return true;
  if (Object.prototype.toString.call(fc) === '[object Date]' && !Number.isNaN(fc.getTime())) {
    return fc.getFullYear() === 1970 && fc.getMonth() === 0 && fc.getDate() <= 1;
  }
  return String(fc).trim().startsWith('1970-01-01');
}

/**
 * Al guardar un pago CANCELADO: nunca dejar `fecha_hora` en 1970 (estadísticas filtran por YEAR(fecha_hora)).
 */
function normalizarFechaHoraPagoCancelado(fecha_hora, fecha_cancelado) {
  if (!esFechaHoraPlaceholder1970(fecha_hora)) {
    return String(fecha_hora).trim().replace('T', ' ');
  }
  if (fecha_cancelado && !esFechaPlaceholder1970(fecha_cancelado)) {
    const d = String(fecha_cancelado).trim().slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      return `${d} 12:00:00`;
    }
  }
  return fechaHoraMySQLLima();
}

/** Condición SQL: pago del año escolar (fecha real o legado 1970 + fecha_cancelado). */
function sqlFiltroAnioPago(alias, anioParam = '?') {
  const a = alias || 'p';
  return `(YEAR(${a}.fecha_hora) = ${anioParam} OR (YEAR(${a}.fecha_hora) = 1970 AND UPPER(TRIM(${a}.estado_pago)) = 'CANCELADO' AND YEAR(${a}.fecha_cancelado) = ${anioParam}))`;
}

module.exports = {
  esFechaHoraPlaceholder1970,
  esFechaPlaceholder1970,
  normalizarFechaHoraPagoCancelado,
  sqlFiltroAnioPago,
};
