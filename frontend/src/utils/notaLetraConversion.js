export const RANGOS_LETRAS_DEFAULT = [
  { rango: '19-20', letra: 'AD' },
  { rango: '13-18', letra: 'A' },
  { rango: '11-12', letra: 'B' },
  { rango: '0-10', letra: 'C' },
];

export function normalizarRangosLetras(rangos) {
  if (Array.isArray(rangos) && rangos.length) return rangos;
  return RANGOS_LETRAS_DEFAULT;
}

/**
 * Convierte nota numérica a letra según rangos del colegio (Configuración).
 * @param {number|string|null} num
 * @param {Array<{rango:string, letra:string}>} [rangos]
 * @returns {string|null}
 */
export function numeroALetra(num, rangos = RANGOS_LETRAS_DEFAULT) {
  if (num === null || num === undefined || num === '' || num === '-') return null;
  const n = parseFloat(num);
  if (Number.isNaN(n)) return null;

  const lista = normalizarRangosLetras(rangos);
  for (const r of lista) {
    if (!r?.rango) continue;
    const partes = String(r.rango).split('-').map((x) => Number(x.trim()));
    if (partes.length < 2 || partes.some((x) => Number.isNaN(x))) continue;
    const [min, max] = partes;
    if (n >= min && n <= max) return String(r.letra || '').trim() || null;
  }
  return null;
}

/** Texto visible del número en celda PF. */
export function textoNotaPf(val) {
  if (val === null || val === undefined || val === '' || val === '-') return '-';
  const n = parseFloat(val);
  if (Number.isNaN(n)) return String(val);
  return String(Math.round(n));
}
