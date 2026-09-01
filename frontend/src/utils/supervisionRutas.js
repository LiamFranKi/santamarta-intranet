export function rutaBaseSupervision(tipo) {
  const t = String(tipo || '').toUpperCase();
  if (t === 'DOCENTE') return '/docente/herramientas/supervision';
  return '/admin/herramientas/supervision';
}

export function urlFichaSupervision(tipo, visitaId) {
  const base = rutaBaseSupervision(tipo);
  return visitaId ? `${base}?visita=${visitaId}` : base;
}

export function visitaIdDeEvento(item) {
  if (!item) return null;
  if (item.supervision_visita_id != null && item.supervision_visita_id !== '') return item.supervision_visita_id;
  if (String(item.tipo || '').toLowerCase() === 'supervision') {
    const raw = String(item.id || '');
    if (raw.startsWith('supervision-')) return raw.slice('supervision-'.length);
    return item.id;
  }
  return null;
}
