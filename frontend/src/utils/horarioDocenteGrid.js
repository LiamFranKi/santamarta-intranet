/** Lógica compartida del horario del docente (pantalla y PDF). */

export const DIAS_SEMANA = [
  { id: 1, nombre: 'Lunes', abrev: 'LUNES' },
  { id: 2, nombre: 'Martes', abrev: 'MARTES' },
  { id: 3, nombre: 'Miércoles', abrev: 'MIÉRCOLES' },
  { id: 4, nombre: 'Jueves', abrev: 'JUEVES' },
  { id: 5, nombre: 'Viernes', abrev: 'VIERNES' },
];

const COLOR_PALETTE = [
  '#FFF9C4',
  '#BBDEFB',
  '#F3E5F5',
  '#C8E6C9',
  '#E0F7FA',
  '#FFF3E0',
  '#FCE4EC',
  '#E1F5FE',
  '#F1F8E9',
  '#FFEBEE',
  '#E8EAF6',
  '#E0F2F1',
  '#E1BEE7',
  '#FFE0B2',
  '#FFCCBC',
  '#D1C4E9',
  '#F8BBD0',
  '#B2DFDB',
  '#C5E1A5',
  '#FFE082',
  '#BCAAA4',
  '#90CAF9',
  '#A5D6A7',
  '#CE93D8',
  '#FFAB91',
  '#80CBC4',
  '#FFCC80',
  '#B39DDB',
  '#81C784',
  '#64B5F6',
];

export function formatearHora(hora) {
  if (!hora) return '';
  const horaUpper = String(hora).toUpperCase().trim();
  if (horaUpper.includes('AM') || horaUpper.includes('PM')) return String(hora).trim();

  const partes = String(hora).split(':');
  if (partes.length < 2) return String(hora);
  const h = parseInt(partes[0], 10);
  const m = partes[1] ? partes[1].split(' ')[0] : '00';
  const minutos = String(m).padStart(2, '0');
  if (Number.isNaN(h)) return String(hora);
  if (h === 0) return `12:${minutos} AM`;
  if (h < 12) return `${h}:${minutos} AM`;
  if (h === 12) return `12:${minutos} PM`;
  return `${h - 12}:${minutos} PM`;
}

export function horaAMinutos(hora) {
  if (!hora) return 0;
  const horaUpper = String(hora).toUpperCase().trim();
  if (horaUpper.includes('AM') || horaUpper.includes('PM')) {
    const partes = String(hora).split(':');
    if (partes.length < 2) return 0;
    let h = parseInt(partes[0], 10);
    const minutosStr = partes[1].replace(/[^0-9]/g, '');
    const m = parseInt(minutosStr || 0, 10);
    if (horaUpper.includes('PM') && h !== 12) h += 12;
    else if (horaUpper.includes('AM') && h === 12) h = 0;
    return h * 60 + m;
  }
  const partes = String(hora).split(':');
  if (partes.length < 2) return 0;
  const h = parseInt(partes[0], 10);
  const m = parseInt(partes[1] ? partes[1].split(' ')[0] : 0, 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
}

export function normalizarHorario(clases) {
  const horarioRaw = Array.isArray(clases) ? clases : [];
  if (!horarioRaw.length) return [];
  const dias = horarioRaw
    .map((c) => (typeof c.dia === 'number' ? c.dia : parseInt(c.dia, 10)))
    .filter((d) => Number.isFinite(d));
  if (!dias.length) return horarioRaw;
  const minDia = Math.min(...dias);
  const maxDia = Math.max(...dias);
  const usaCeroCuatro = minDia === 0 && maxDia <= 4;
  return horarioRaw.map((c) => {
    const diaNum = typeof c.dia === 'number' ? c.dia : parseInt(c.dia, 10);
    return {
      ...c,
      diaNormalizado: usaCeroCuatro && Number.isFinite(diaNum) ? diaNum + 1 : diaNum,
    };
  });
}

export function bloquesUnicos(horario) {
  if (!horario?.length) return [];
  const unicos = {};
  horario.forEach((c) => {
    const inicio = c.inicio || c.hora_inicio || '';
    const fin = c.fin || c.hora_final || '';
    if (!inicio || !fin) return;
    const key = `${inicio}-${fin}`;
    if (!unicos[key]) unicos[key] = { inicio, fin };
  });
  return Object.values(unicos).sort((a, b) => horaAMinutos(a.inicio) - horaAMinutos(b.inicio));
}

export function obtenerClase(horario, dia, horaInicio, horaFin) {
  return (horario || []).find((c) => {
    if (c.diaNormalizado !== dia) return false;
    const inicioClase = c.inicio || c.hora_inicio || '';
    const finClase = c.fin || c.hora_final || '';
    return inicioClase === horaInicio && finClase === horaFin;
  }) || null;
}

export function formatearClase(clase) {
  if (!clase) return null;
  const titulo = clase.titulo || '';
  const grupo = clase.grupo || '';
  if (!titulo && !grupo) return null;
  if (!grupo) return titulo;
  if (!titulo) return grupo;
  return `${titulo} - ${grupo}`;
}

function hashString(str) {
  let hash = 0;
  const normalized = String(str || '').trim().toLowerCase();
  for (let i = 0; i < normalized.length; i += 1) {
    const char = normalized.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash + (hash << 10);
    hash ^= hash >> 6;
  }
  hash = hash + (hash << 3);
  hash ^= hash >> 11;
  hash += hash << 15;
  return Math.abs(hash);
}

export function getColorForCourse(titulo) {
  if (!titulo || !String(titulo).trim()) return null;
  return COLOR_PALETTE[hashString(String(titulo).trim()) % COLOR_PALETTE.length];
}

export function aclararColor(colorHex, factor = 0.5) {
  if (!colorHex) return '#ffffff';
  const r = parseInt(colorHex.slice(1, 3), 16);
  const g = parseInt(colorHex.slice(3, 5), 16);
  const b = parseInt(colorHex.slice(5, 7), 16);
  const rNuevo = Math.round(r + (255 - r) * factor);
  const gNuevo = Math.round(g + (255 - g) * factor);
  const bNuevo = Math.round(b + (255 - b) * factor);
  return `#${rNuevo.toString(16).padStart(2, '0')}${gNuevo.toString(16).padStart(2, '0')}${bNuevo.toString(16).padStart(2, '0')}`;
}

export function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
  return result
    ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) }
    : null;
}

export function filasHorario(clases) {
  const horario = normalizarHorario(clases);
  const bloques = bloquesUnicos(horario).filter((bloque) =>
    DIAS_SEMANA.some((dia) => obtenerClase(horario, dia.id, bloque.inicio, bloque.fin))
  );
  return { horario, bloques };
}
