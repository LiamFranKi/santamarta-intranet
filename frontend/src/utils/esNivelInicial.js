/**
 * Indica si el alumno/grupo pertenece al nivel INICIAL (calificación cualitativa).
 * Misma lógica que backend/libreta: tipo_calificacion === 0 o nombre del nivel contiene "INICIAL".
 *
 * @param {object} entity - hijo, grupoInfo, alumno, etc.
 * @returns {boolean}
 */
export function esNivelInicial(entity) {
  if (!entity) return false;

  const tipo =
    entity.tipo_calificacion ??
    entity.nivel_tipo_calificacion ??
    entity.tipo_calificacion_nivel;

  if (tipo === 0 || tipo === '0') return true;

  const nombre = String(
    entity.nivel_nombre ?? entity.nivel ?? entity.nombre_nivel ?? ''
  ).toUpperCase();

  return nombre.includes('INICIAL');
}

/** Oculta "Notas detalladas" en menús cuando el nivel es Inicial (usar Ver libreta). */
export function debeMostrarNotasDetalladas(entity) {
  return !esNivelInicial(entity);
}
