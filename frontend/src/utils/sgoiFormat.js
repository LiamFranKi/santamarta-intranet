export const SGOI_TIPOS = ['ADMINISTRADOR', 'PROMOTORIA', 'DIRECTOR', 'COORDINADOR', 'CONTADOR'];
export const SGOI_TIPOS_AREA = ['ADMINISTRADOR', 'PROMOTORIA', 'DIRECTOR'];

export function usuarioPuedeSgoi(tipo) {
  return SGOI_TIPOS.includes(String(tipo || '').toUpperCase());
}

/** Tablero/listados de toda el área. Coordinador solo ve lo suyo. */
export function usuarioVeAreaSgoi(tipo) {
  return SGOI_TIPOS_AREA.includes(String(tipo || '').toUpperCase());
}

export function usuarioPuedeHorarioSgoi(tipo) {
  return usuarioPuedeSgoi(tipo);
}

export function idUsuarioSesion(user) {
  return Number(user?.id ?? user?.usuario_id) || 0;
}

export function esRegistroSgoiPropio(item, user) {
  const uid = idUsuarioSesion(user);
  return uid > 0 && Number(item?.usuario_id) === uid;
}

/** Nombre del personal/usuario para reportes (API o sesión). */
export function nombrePersonaSgoi(user, apiNombre) {
  const fromApi = String(apiNombre || '').replace(/\s+/g, ' ').trim();
  if (fromApi) return fromApi;
  if (user?.nombres && user?.apellidos) {
    return `${user.nombres} ${user.apellidos}`.replace(/\s+/g, ' ').trim();
  }
  return String(user?.nombres || user?.usuario || '').replace(/\s+/g, ' ').trim();
}

export function formatDuracionSeg(seg) {
  const n = Math.max(0, parseInt(seg, 10) || 0);
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m} min`;
  return `${n} s`;
}

/** DATETIME naive de Lima o ISO → HH:mm en hora de Perú (sin +5 h por UTC). */
export function formatHoraItem(valor) {
  if (!valor) return '';
  const s = String(valor).trim();
  if (/[zZ]|[+-]\d{2}:\d{2}$/.test(s)) {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleTimeString('es-PE', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'America/Lima',
      });
    }
  }
  const p = s.replace('T', ' ').match(/(\d{2}):(\d{2})/);
  return p ? `${p[1]}:${p[2]}` : '';
}

/** Instantánea en ms: naive = hora de pared Lima (UTC−05); ISO con Z/offset = instante real. */
export function instanteMsLima(valor) {
  if (!valor) return NaN;
  if (valor instanceof Date) return valor.getTime();
  const s = String(valor).trim();
  if (/[zZ]|[+-]\d{2}:\d{2}$/.test(s)) {
    const t = Date.parse(s);
    return Number.isNaN(t) ? NaN : t;
  }
  const m = s.replace('T', ' ').match(/^(\d{4}-\d{2}-\d{2})[ ](\d{2}:\d{2}(?::\d{2})?)/);
  if (!m) return Date.parse(s);
  const time = m[2].length === 5 ? `${m[2]}:00` : m[2];
  return Date.parse(`${m[1]}T${time}-05:00`);
}

export function formatFechaCorta(valor) {
  if (!valor) return '';
  const s = String(valor).trim();
  if (/[zZ]|[+-]\d{2}:\d{2}$/.test(s)) {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString('es-PE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        timeZone: 'America/Lima',
      });
    }
  }
  const raw = s.slice(0, 10);
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

export function etiquetaDiaLargo(iso) {
  const raw = String(iso || '').slice(0, 10);
  const [y, m, d] = raw.split('-').map((n) => parseInt(n, 10));
  if (!y || !m || !d) return raw;
  const txt = new Date(y, m - 1, d).toLocaleDateString('es-PE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  return txt.charAt(0).toUpperCase() + txt.slice(1);
}

export function notificarCambioSgoi() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('sgoi-changed'));
  }
}
