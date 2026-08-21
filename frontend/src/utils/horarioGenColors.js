/** Paleta pastel estable (misma que PDF) para diferenciar cursos. */
export const CURSO_COLOR_PALETTE = [
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
];

function hashString(str) {
  let h = 0;
  const s = String(str || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  for (let i = 0; i < s.length; i += 1) {
    h = (h << 5) - h + s.charCodeAt(i);
    h += h << 10;
    h ^= h >> 6;
    h += h << 3;
    h ^= h >> 11;
    h += h << 15;
  }
  return Math.abs(h);
}

/** Color estable por nombre de curso (igual en todos los grados). */
export function colorForCurso(nombre) {
  const t = String(nombre || '').trim();
  if (!t) return '#ffffff';
  return CURSO_COLOR_PALETTE[hashString(t) % CURSO_COLOR_PALETTE.length];
}

/** Prefiere color guardado en BD; si no, hash del nombre. */
export function resolveCursoColor(stored, nombre) {
  const s = stored != null ? String(stored).trim() : '';
  if (s) return s;
  return colorForCurso(nombre);
}

export function hexToRgb(hex) {
  const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex || ''));
  return r
    ? { r: parseInt(r[1], 16), g: parseInt(r[2], 16), b: parseInt(r[3], 16) }
    : null;
}
