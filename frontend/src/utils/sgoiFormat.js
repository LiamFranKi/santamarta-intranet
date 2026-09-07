export const SGOI_TIPOS = ['ADMINISTRADOR', 'PROMOTORIA', 'DIRECTOR'];

export function usuarioPuedeSgoi(tipo) {
  return SGOI_TIPOS.includes(String(tipo || '').toUpperCase());
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

export function etiquetaTipoTrabajo(tipo) {
  const map = {
    DESARROLLO: 'Desarrollo',
    SOPORTE: 'Soporte',
    PAGOS: 'Pagos',
    DESPLIEGUE: 'Despliegue',
    REUNION: 'Reunión',
    OTRO: 'Otro',
  };
  return map[tipo] || tipo || '';
}

export function notificarCambioSgoi() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('sgoi-changed'));
  }
}
