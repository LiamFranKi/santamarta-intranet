/** Paleta pastel y utilidades para incidencias de alumno (grilla admin). */

export const COLORES_PASTEL_INCIDENCIA = [
  { bg: '#FFE5E5', border: '#FFB3B3', text: '#7f1d1d' },
  { bg: '#E5F3FF', border: '#B3D9FF', text: '#1e3a5f' },
  { bg: '#E5FFE5', border: '#B3FFB3', text: '#14532d' },
  { bg: '#FFF5E5', border: '#FFD9B3', text: '#78350f' },
  { bg: '#F0E5FF', border: '#D9B3FF', text: '#4c1d95' },
  { bg: '#E5FFFF', border: '#B3FFFF', text: '#134e4a' },
  { bg: '#FFE5F0', border: '#FFB3D9', text: '#831843' },
  { bg: '#F5FFE5', border: '#D9FFB3', text: '#365314' },
];

export function colorIncidenciaPorIndice(index) {
  return COLORES_PASTEL_INCIDENCIA[Math.abs(index) % COLORES_PASTEL_INCIDENCIA.length];
}

export function formatearFechaIncidencia(val) {
  if (!val) return '—';
  try {
    const s = String(val).trim();
    const d = s.match(/^\d{4}-\d{2}-\d{2}/)
      ? new Date(`${s.slice(0, 10)}T12:00:00`)
      : new Date(val);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('es-PE', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}

export function ordenarIncidenciasRecientes(incidencias) {
  return [...(incidencias || [])].sort((a, b) => {
    const ta = new Date(a.created_at || 0).getTime();
    const tb = new Date(b.created_at || 0).getTime();
    return tb - ta;
  });
}
