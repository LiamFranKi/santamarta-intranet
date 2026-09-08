export const SGOI_TIPOS = ['ADMINISTRADOR', 'PROMOTORIA', 'DIRECTOR'];

export function usuarioPuedeSgoi(tipo) {
  return SGOI_TIPOS.includes(String(tipo || '').toUpperCase());
}

export function usuarioPuedeHorarioSgoi(tipo) {
  return String(tipo || '').toUpperCase() === 'ADMINISTRADOR';
}

export function formatDuracionSeg(seg) {
  const n = Math.max(0, parseInt(seg, 10) || 0);
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m} min`;
  return `${n} s`;
}

export function formatHoraItem(valor) {
  if (!valor) return '';
  const raw = String(valor).replace(' ', 'T').slice(0, 19);
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    const p = String(valor).match(/(\d{2}:\d{2})/);
    return p ? p[1] : '';
  }
  return d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function formatFechaCorta(valor) {
  if (!valor) return '';
  const raw = String(valor).slice(0, 10);
  const [y, m, day] = raw.split('-');
  if (!y || !m || !day) return raw;
  return `${day}/${m}/${y}`;
}

export function etiquetaEstado(estado) {
  const map = {
    EN_CURSO: 'En curso',
    RESUELTO: 'Resuelto',
    PENDIENTE: 'Pendiente',
    HECHO: 'Hecho',
    ABIERTO: 'Abierto',
  };
  return map[estado] || estado || '';
}

export const SGOI_TIPOS_FRANJA = ['DESARROLLO', 'SOPORTE', 'PAGOS', 'DESPLIEGUE', 'REUNION', 'DESCANSO', 'OTRO'];

export function etiquetaTipoTrabajo(tipo) {
  const map = {
    DESARROLLO: 'Desarrollo',
    SOPORTE: 'Soporte',
    PAGOS: 'Pagos',
    DESPLIEGUE: 'Despliegue',
    REUNION: 'Reunión',
    DESCANSO: 'Descanso',
    OTRO: 'Otro',
  };
  return map[tipo] || tipo || '';
}

/** Color suave estable: misma actividad (mismo título) = mismo color en toda la semana. */
const PASTELES_FRANJA = [
  { bg: '#dbeafe', fg: '#1e40af' },
  { bg: '#ccfbf1', fg: '#0f766e' },
  { bg: '#fef3c7', fg: '#b45309' },
  { bg: '#ede9fe', fg: '#6d28d9' },
  { bg: '#fce7f3', fg: '#be185d' },
  { bg: '#e0f2fe', fg: '#0369a1' },
  { bg: '#dcfce7', fg: '#15803d' },
  { bg: '#ffedd5', fg: '#c2410c' },
  { bg: '#f1f5f9', fg: '#475569' },
  { bg: '#fae8ff', fg: '#a21caf' },
  { bg: '#e0e7ff', fg: '#3730a3' },
  { bg: '#fef9c3', fg: '#a16207' },
];

export function colorFranjaIgual(titulo, tipo) {
  const clave = String(titulo || '').trim().toLowerCase() || String(tipo || '').toLowerCase();
  let h = 0;
  for (let i = 0; i < clave.length; i += 1) {
    h = (h * 31 + clave.charCodeAt(i)) >>> 0;
  }
  return PASTELES_FRANJA[h % PASTELES_FRANJA.length];
}

export function etiquetaDiaCorto(iso) {
  const raw = String(iso || '').slice(0, 10);
  const [y, m, d] = raw.split('-').map((n) => parseInt(n, 10));
  if (!y || !m || !d) return raw;
  return new Date(y, m - 1, d).toLocaleDateString('es-PE', { weekday: 'short', day: 'numeric' });
}

export function notificarCambioSgoi() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('sgoi-changed'));
  }
}
