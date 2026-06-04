/** Etiquetas visibles de tutores por grupo (tutor_id + tutor_id_2). */
export const ETIQUETA_TUTOR = 'Tutor';
export const ETIQUETA_CO_TUTOR = 'Co-Tutor';

export const ERROR_TUTORES_MISMA_PERSONA =
  `El ${ETIQUETA_TUTOR} y el ${ETIQUETA_CO_TUTOR} no pueden ser la misma persona.`;

/** Texto de tutores para libretas y reportes (solo nombres, separados por "  /  "). */
export function formatearTutoresLibreta(alumno) {
  if (!alumno) return 'No asignado';
  const m = String(alumno.maestro_tutor_nombre || alumno.tutor_nombre || '').trim();
  const t = String(alumno.tutor2_nombre || '').trim();
  const partes = [m, t].filter(Boolean);
  return partes.length ? partes.join('  /  ') : 'No asignado';
}
