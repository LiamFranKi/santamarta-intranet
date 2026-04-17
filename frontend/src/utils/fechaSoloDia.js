/**
 * Fechas solo-día (YYYY-MM-DD) sin desfase por UTC al usar new Date('YYYY-MM-DD')
 * (en zonas como America/Lima puede mostrarse el día anterior).
 */
export function toLocalDateFromDateOnly(d) {
  if (d == null || d === '') return null;
  const s = typeof d === 'string' ? d.slice(0, 10) : String(d).slice(0, 10);
  const p = s.split('-');
  if (p.length !== 3) return null;
  const y = parseInt(p[0], 10);
  const mo = parseInt(p[1], 10) - 1;
  const day = parseInt(p[2], 10);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(day)) return null;
  const dt = new Date(y, mo, day);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

export function formatFechaLargaEsPe(d) {
  const dt = toLocalDateFromDateOnly(d);
  if (!dt) return '';
  return dt.toLocaleDateString('es-PE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}

export function formatFechaCortaCardEsPe(d) {
  const dt = toLocalDateFromDateOnly(d);
  if (!dt) {
    try {
      return String(d || '').slice(0, 10);
    } catch {
      return '';
    }
  }
  return dt.toLocaleDateString('es-PE', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}
