/** Texto de tutores para libretas y reportes (Maestro Tutor + Tutor). */
export function formatearTutoresLibreta(alumno) {
  if (!alumno) return 'No asignado';
  const m = String(alumno.maestro_tutor_nombre || alumno.tutor_nombre || '').trim();
  const t = String(alumno.tutor2_nombre || '').trim();
  const partes = [];
  if (m) partes.push(`Maestro Tutor: ${m}`);
  if (t) partes.push(`Tutor: ${t}`);
  return partes.length ? partes.join(' · ') : 'No asignado';
}
