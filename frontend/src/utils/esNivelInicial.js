/**
 * Cualitativo (letras y CNEB). Si el tipo viene informado, manda él.
 * El nombre Inicial solo cubre pantallas viejas que no traen el tipo.
 */
export function esNivelInicial(entity) {
  if (!entity) return false;

  const tipo =
    entity.tipo_calificacion ??
    entity.nivel_tipo_calificacion ??
    entity.tipo_calificacion_nivel;

  if (tipo === 0 || tipo === '0') return true;
  if (tipo === 1 || tipo === '1') return false;

  const nombre = String(
    entity.nivel_nombre ?? entity.nivel ?? entity.nombre_nivel ?? ''
  ).toUpperCase();

  return nombre.includes('INICIAL');
}

/** Oculta "Notas detalladas" en menús cuando el nivel es Inicial (usar Ver libreta). */
export function debeMostrarNotasDetalladas(entity) {
  return !esNivelInicial(entity);
}
