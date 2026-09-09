/** Perfil COORDINADOR: menú propio + lectura en catálogo; escritura solo donde se acordó. */

export function esCoordinador(tipo) {
  return String(tipo || '').toUpperCase() === 'COORDINADOR';
}

/** Módulos que el coordinador ve pero no crea/edita/borra. */
export function coordinadorSoloLectura(tipo) {
  return esCoordinador(tipo);
}

export const COORDINADOR_DASHBOARD = '/docente/dashboard';
