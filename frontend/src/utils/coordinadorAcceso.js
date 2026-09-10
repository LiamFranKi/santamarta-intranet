/** Perfil COORDINADOR: menú propio + lectura en catálogo; escritura solo donde se acordó. */

export function esCoordinador(tipo) {
  return String(tipo || '').toUpperCase() === 'COORDINADOR';
}

/** COORDINADOR y DIRECTOR: mismo menú y dashboard. PROMOTORIA no entra. */
export function esPaqueteCoordinador(tipo) {
  const t = String(tipo || '').toUpperCase();
  return t === 'COORDINADOR' || t === 'DIRECTOR';
}

/** Módulos que el paquete coordinador ve pero no crea/edita/borra. */
export function coordinadorSoloLectura(tipo) {
  return esPaqueteCoordinador(tipo);
}

export const COORDINADOR_DASHBOARD = '/docente/dashboard';
