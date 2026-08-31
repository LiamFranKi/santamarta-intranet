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

export function urlFichaReunion(tipo, reunionId) {
  const base = rutaBaseReuniones(tipo);
  return reunionId ? `${base}/${reunionId}` : base;
}

export function reunionIdDeEvento(item) {
  if (!item) return null;
  if (item.reunion_id != null && item.reunion_id !== '') return item.reunion_id;
  if (String(item.tipo || '').toLowerCase() === 'reunion') {
    const raw = String(item.id || '');
    if (raw.startsWith('reunion-')) return raw.slice('reunion-'.length);
    return item.id;
  }
  return null;
}

export function esReunionEnCurso(item) {
  return !!reunionIdDeEvento(item) && String(item.estado_reunion || item.estado || '').toUpperCase() === 'EN_CURSO';
}

export function irAReunionSiEnCurso(navigate, tipoUsuario, item) {
  if (!esReunionEnCurso(item) || typeof navigate !== 'function') return false;
  navigate(urlFichaReunion(tipoUsuario, reunionIdDeEvento(item)));
  return true;
}
