export function rutaBaseReuniones(tipo) {
  const t = String(tipo || '').toUpperCase();
  if (t === 'ALUMNO') return '/alumno/reuniones';
  if (t === 'APODERADO') return '/apoderado/reuniones';
  if (t === 'DOCENTE') return '/docente/herramientas/reuniones';
  return '/admin/herramientas/reuniones';
}

export function esGestorReunionesFront(tipo) {
  const t = String(tipo || '').toUpperCase();
  return t === 'ADMINISTRADOR' || t === 'PROMOTORIA' || t === 'SECRETARIA' || t === 'PSICOLOGA';
}
