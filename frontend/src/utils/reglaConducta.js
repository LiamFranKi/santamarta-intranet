export const REGLA_CONDUCTA_DEFAULT = Object.freeze({
  max: 20,
  min: 6,
  descuento: 0.5,
  redondear: true,
});

function toNum(value, fallback) {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

export function formatNotaConducta(nota) {
  const n = parseFloat(nota);
  if (!Number.isFinite(n)) return String(REGLA_CONDUCTA_DEFAULT.max).padStart(2, '0');
  const tenth = Math.round(n * 10) / 10;
  if (Math.abs(tenth - Math.round(tenth)) < 1e-9) {
    return String(Math.round(tenth)).padStart(2, '0');
  }
  return tenth.toFixed(1);
}

export function normalizarReglaConducta(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  let max = toNum(src.max, REGLA_CONDUCTA_DEFAULT.max);
  let min = toNum(src.min, REGLA_CONDUCTA_DEFAULT.min);
  let descuento = toNum(src.descuento, REGLA_CONDUCTA_DEFAULT.descuento);
  max = Math.max(0, Math.min(20, max));
  min = Math.max(0, Math.min(20, min));
  if (min > max) {
    const t = min;
    min = max;
    max = t;
  }
  descuento = Math.max(0.1, Math.min(5, Math.round(descuento * 10) / 10));
  const redondear = !(
    src.redondear === false
    || src.redondear === 0
    || src.redondear === '0'
    || src.redondear === 'NO'
    || src.redondear === 'no'
    || src.redondear === 'false'
  );
  return { max, min, descuento, redondear };
}

export function notaDesdeCantidad(cantidad, regla) {
  const r = normalizarReglaConducta(regla);
  const cant = Math.max(0, parseInt(cantidad, 10) || 0);
  let nota = r.max - cant * r.descuento;
  nota = Math.max(r.min, Math.min(r.max, nota));
  if (r.redondear) {
    nota = Math.round(nota + Number.EPSILON);
    nota = Math.max(r.min, Math.min(r.max, nota));
  }
  return formatNotaConducta(nota);
}

export function textoReglaConducta(regla) {
  const r = normalizarReglaConducta(regla);
  const max = formatNotaConducta(r.max);
  const min = formatNotaConducta(r.min);
  const d = r.descuento;
  const descTxt = Math.abs(d - 0.5) < 1e-9
    ? '−0.5 (medio punto)'
    : `−${d} punto${Math.abs(d) === 1 ? '' : 's'}`;
  let t = `Parte de ${max}; ${descTxt} por cada incidencia o descuento de presentación del bimestre (mín. ${min}).`;
  if (r.redondear) t += ' El .5 se redondea hacia arriba (7.5 → 08).';
  t += ' No se edita a mano.';
  return t;
}

export function textoReglaCorta(regla) {
  const r = normalizarReglaConducta(regla);
  const max = formatNotaConducta(r.max);
  const min = formatNotaConducta(r.min);
  let t = `Nota = ${max} − registros × ${r.descuento} (máx. ${max}, mín. ${min})`;
  if (r.redondear) t += '; .5 → arriba';
  return t;
}

export function ejemplosReglaConducta(regla) {
  const r = normalizarReglaConducta(regla);
  const n = (c) => notaDesdeCantidad(c, r);
  return [
    { registros: 0, nota: n(0) },
    { registros: 1, nota: n(1) },
    { registros: 2, nota: n(2) },
    { registros: 25, nota: n(25) },
    { registros: 28, nota: n(28) },
  ];
}
