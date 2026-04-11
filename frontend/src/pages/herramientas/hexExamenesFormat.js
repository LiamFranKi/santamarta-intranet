/** Puntajes en UI sin decimales innecesarios (20 en lugar de 20.00). */
export function fmtPts(n) {
  if (n == null || n === '') return '—';
  const x = Number(n);
  if (Number.isNaN(x)) return '—';
  return String(Math.round(x));
}
