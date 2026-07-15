/**
 * Utilidades para verificación de deudas por pensiones mensuales.
 *
 * Referencia de numeración (no mezclar):
 * - pagos: matrícula → tipo=0, nro_pago=0 | pensión → tipo=1, nro_pago=1,2,3…
 * - pensiones_vencimiento (config): clave -1=matrícula, 1=1ª pensión, 2=2ª…
 *
 * El bloqueo por deudas solo evalúa pensiones (tipo=1); la matrícula no se incluye.
 */

const {
  parsePensionesVencimiento,
  calcularFechaVencimientoDdMmYyyy,
} = require('./fechaFacturacionJson');

/**
 * @param {unknown} raw — valor de colegios.bloquear_deudores_hasta_mes
 * @returns {number|null} índice de mes 0-11, o null si no hay límite
 */
function parseBloquearDeudoresHastaMes(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = parseInt(raw, 10);
  if (Number.isNaN(n) || n < 0 || n > 11) return null;
  return n;
}

/**
 * Convierte mes calendario (1-12) e inicio_pensiones (0-based) a nro_pago de pensión.
 */
function nroPagoDesdeMesCalendario(mesCalendario, inicioPensiones) {
  return mesCalendario - inicioPensiones;
}

/**
 * Lista de nro_pago de pensiones a revisar para bloqueo.
 *
 * @param {object} opts
 * @param {number} opts.nroPago — pensiones que ya deberían estar pagadas según mes actual
 * @param {object} opts.vencimientosPensiones — pensiones_vencimiento deserializado
 * @param {unknown} opts.bloquearDeudoresHastaMes — mes límite configurado (0-11) o null
 * @param {number} opts.inicioPensiones — inicio_pensiones del colegio (0-based)
 * @returns {number[]}
 */
function calcularPensionesAVerificar({
  nroPago,
  vencimientosPensiones,
  bloquearDeudoresHastaMes,
  inicioPensiones,
}) {
  const inicio = inicioPensiones ?? 2;
  const hastaMes = parseBloquearDeudoresHastaMes(bloquearDeudoresHastaMes);

  let nroPagoCorte = null;
  if (hastaMes !== null) {
    const mesCalendario = hastaMes + 1;
    nroPagoCorte = nroPagoDesdeMesCalendario(mesCalendario, inicio);
    if (nroPagoCorte <= 0) return [];
  }

  let maxNro = null;
  if (nroPago > 0) {
    maxNro = nroPago;
  }
  if (nroPagoCorte !== null) {
    maxNro = maxNro === null ? nroPagoCorte : Math.min(maxNro, nroPagoCorte);
  }

  if (maxNro !== null && maxNro > 0) {
    return Array.from({ length: maxNro }, (_, i) => i + 1);
  }

  let keys = Object.keys(vencimientosPensiones || {})
    .map((k) => parseInt(k, 10))
    .filter((k) => k > 0 && !Number.isNaN(k));

  if (nroPagoCorte !== null) {
    keys = keys.filter((k) => k <= nroPagoCorte);
  }

  return keys.sort((a, b) => a - b);
}

/**
 * nro_pago de pensiones cuya fecha de vencimiento ya pasó (solo día de vencimiento, sin tolerancia).
 * No incluye matrícula (clave -1). Útil para dashboards / estadísticas “deuda real hasta hoy”.
 *
 * @param {object} opts
 * @param {number} opts.anio
 * @param {number} opts.totalPensiones
 * @param {number} [opts.inicioPensiones=2]
 * @param {string|object|null} opts.pensionesVencimientoRaw — columna colegios.pensiones_vencimiento o mapa ya parseado
 * @param {Date} [opts.hoy]
 * @returns {{ nros: number[], fechas: Record<number, string> }}
 */
function listarPensionesVencidasHastaHoy({
  anio,
  totalPensiones,
  inicioPensiones = 2,
  pensionesVencimientoRaw,
  hoy = new Date(),
}) {
  let map = {};
  if (
    pensionesVencimientoRaw &&
    typeof pensionesVencimientoRaw === 'object' &&
    !Array.isArray(pensionesVencimientoRaw)
  ) {
    map = pensionesVencimientoRaw;
  } else {
    map = parsePensionesVencimiento(pensionesVencimientoRaw);
  }

  const fechaHoy = new Date(hoy);
  fechaHoy.setHours(0, 0, 0, 0);

  const nros = [];
  const fechas = {};
  const total = Math.max(0, parseInt(totalPensiones, 10) || 0);

  for (let i = 1; i <= total; i += 1) {
    const ddMmYyyy = calcularFechaVencimientoDdMmYyyy(i, anio, inicioPensiones, map);
    const partes = String(ddMmYyyy || '').split('-');
    if (partes.length !== 3) continue;
    const fechaVenc = new Date(
      parseInt(partes[2], 10),
      parseInt(partes[1], 10) - 1,
      parseInt(partes[0], 10)
    );
    if (Number.isNaN(fechaVenc.getTime())) continue;
    fechaVenc.setHours(23, 59, 59, 999);
    // Deuda desde el día siguiente al vencimiento
    if (fechaHoy > fechaVenc) {
      nros.push(i);
      fechas[i] = ddMmYyyy;
    }
  }

  return { nros, fechas };
}

module.exports = {
  parseBloquearDeudoresHastaMes,
  nroPagoDesdeMesCalendario,
  calcularPensionesAVerificar,
  listarPensionesVencidasHastaHoy,
};
