/**
 * Regla de conducta (Configuración → General).
 * Nota = clamp(mín, máx, máx − N × descuento); si redondear, .5 hacia arriba (7.5 → 8).
 * Se guarda en config.clave = 'regla_conducta' (JSON).
 */

const REGLA_CONDUCTA_DEFAULT = Object.freeze({
  max: 20,
  min: 6,
  descuento: 0.5,
  redondear: true,
});

function toNum(value, fallback) {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

function roundHalfUp(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x + Number.EPSILON);
}

function formatNotaAlmacenada(nota) {
  const n = parseFloat(nota);
  if (!Number.isFinite(n)) {
    return String(REGLA_CONDUCTA_DEFAULT.max).padStart(2, '0');
  }
  const clamped = Math.max(0, Math.min(20, n));
  const tenth = Math.round(clamped * 10) / 10;
  if (Math.abs(tenth - Math.round(tenth)) < 1e-9) {
    return String(Math.round(tenth)).padStart(2, '0');
  }
  return tenth.toFixed(1);
}

function formatDescuentoLabel(descuento) {
  const d = toNum(descuento, 0.5);
  const txt = Math.abs(d - Math.round(d)) < 1e-9 ? String(Math.round(d)) : String(Math.round(d * 10) / 10);
  if (Math.abs(d - 0.5) < 1e-9) return `−${txt} (medio punto)`;
  return `−${txt} punto${Math.abs(d) === 1 ? '' : 's'}`;
}

function normalizarReglaConducta(raw) {
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

function notaDesdeCantidad(cantidad, regla) {
  const r = normalizarReglaConducta(regla);
  const cant = Math.max(0, parseInt(cantidad, 10) || 0);
  let nota = r.max - cant * r.descuento;
  nota = Math.max(r.min, Math.min(r.max, nota));
  if (r.redondear) {
    nota = roundHalfUp(nota);
    nota = Math.max(r.min, Math.min(r.max, nota));
  }
  return formatNotaAlmacenada(nota);
}

function textoReglaConducta(regla) {
  const r = normalizarReglaConducta(regla);
  const max = formatNotaAlmacenada(r.max);
  const min = formatNotaAlmacenada(r.min);
  let t = `Parte de ${max}; ${formatDescuentoLabel(r.descuento)} por cada incidencia o descuento de presentación del bimestre (mín. ${min}).`;
  if (r.redondear) t += ' El .5 se redondea hacia arriba (7.5 → 08).';
  t += ' No se edita a mano.';
  return t;
}

function textoReglaCorta(regla) {
  const r = normalizarReglaConducta(regla);
  const max = formatNotaAlmacenada(r.max);
  const min = formatNotaAlmacenada(r.min);
  let t = `Nota = ${max} − registros × ${r.descuento} (máx. ${max}, mín. ${min})`;
  if (r.redondear) t += '; .5 → arriba';
  return t;
}

async function fetchReglaConducta(query) {
  try {
    const rows = await query(`SELECT valor FROM config WHERE clave = 'regla_conducta' LIMIT 1`);
    const rawVal = rows?.[0]?.valor;
    if (rawVal != null && String(rawVal).trim() !== '') {
      const parsed = typeof rawVal === 'string' ? JSON.parse(rawVal) : rawVal;
      return normalizarReglaConducta(parsed);
    }
  } catch (e) {
    if (!(String(e.message || '').includes('JSON'))) {
      console.warn('[conducta] fetch regla:', e.message);
    }
  }
  return normalizarReglaConducta(null);
}

async function guardarReglaConducta(query, execute, raw) {
  const regla = normalizarReglaConducta(raw);
  const valor = JSON.stringify(regla);
  const existing = await query(`SELECT id FROM config WHERE clave = 'regla_conducta' LIMIT 1`);
  if (existing?.length) {
    await execute(`UPDATE config SET valor = ? WHERE clave = 'regla_conducta'`, [valor]);
  } else {
    await execute(`INSERT INTO config (clave, valor) VALUES ('regla_conducta', ?)`, [valor]);
  }
  return regla;
}

module.exports = {
  REGLA_CONDUCTA_DEFAULT,
  toNum,
  roundHalfUp,
  formatNotaAlmacenada,
  formatDescuentoLabel,
  normalizarReglaConducta,
  notaDesdeCantidad,
  textoReglaConducta,
  textoReglaCorta,
  fetchReglaConducta,
  guardarReglaConducta,
};
