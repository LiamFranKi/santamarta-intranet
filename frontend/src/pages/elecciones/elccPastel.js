/** Modificador de tarjeta pastel (rotación por índice). */
export function elccPastelClass(i) {
  const n = Number(i);
  return `elcc-pastel-${Number.isFinite(n) ? Math.abs(Math.floor(n)) % 6 : 0}`;
}
