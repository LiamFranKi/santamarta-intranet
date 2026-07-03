/**
 * Logs de verificación de deudas en login/sesión.
 * En producción solo errores, advertencias y detección de deuda (DEUDAS_DEBUG=1 para traza completa).
 */
const VERBOSE = String(process.env.DEUDAS_DEBUG || '').trim() === '1';

function deudasLog(...args) {
  if (VERBOSE) console.log('[VERIFICAR DEUDAS]', ...args);
}

function deudasWarn(...args) {
  console.warn('[VERIFICAR DEUDAS]', ...args);
}

function deudasError(...args) {
  console.error('[VERIFICAR DEUDAS]', ...args);
}

/** Resumen visible en producción cuando hay deuda o resultado relevante. */
function deudasInfo(...args) {
  console.log('[VERIFICAR DEUDAS]', ...args);
}

module.exports = { deudasLog, deudasWarn, deudasError, deudasInfo, DEUDAS_VERBOSE: VERBOSE };
