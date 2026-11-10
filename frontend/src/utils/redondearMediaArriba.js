/** .5 sube a la siguiente nota. Limpia el error binario (12.499999999 → 12.5 → 13). */
export function redondearMediaArriba(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return null;
  const limpio = Math.round((x + Number.EPSILON) * 1e6) / 1e6;
  return Math.round(limpio);
}
