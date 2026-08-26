/**
 * Regla de conducta (Configuración → General).
 * Tres casilleros independientes (incidencias, presentación, tardanzas).
 * Cada uno: clamp(mín, máx, máx − N × descuento); si redondear, .5 hacia arriba.
 * La nota final es el promedio de los tres.
 * Se guarda en config.clave = 'regla_conducta' (JSON).
 */

const REGLA_BLOQUE_DEFAULT = Object.freeze({
  max: 20,
  min: 6,
  descuento: 0.5,
  redondear: true,
});

const REGLA_CONDUCTA_DEFAULT = Object.freeze({
  incidencias: { ...REGLA_BLOQUE_DEFAULT },
  presentacion: { ...REGLA_BLOQUE_DEFAULT },
  tardanzas: { ...REGLA_BLOQUE_DEFAULT },
  redondear_promedio: true,
});

const CASILLEROS_CONDUCTA = Object.freeze(['incidencias', 'presentacion', 'tardanzas']);

const LABELS_CASILLERO = Object.freeze({
  incidencias: 'Incidencias',
  presentacion: 'Presentación',
  tardanzas: 'Tardanzas',
});

function toNum(value, fallback) {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

function parseRedondear(v, fallback = true) {
  if (v === undefined || v === null || v === '') return fallback;
  return !(
    v === false
    || v === 0
    || v === '0'
    || v === 'NO'
    || v === 'no'
    || v === 'false'
  );
}

function roundHalfUp(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x + Number.EPSILON);
}

function formatNotaAlmacenada(nota) {
  const n = parseFloat(nota);
  if (!Number.isFinite(n)) {
    return String(REGLA_BLOQUE_DEFAULT.max).padStart(2, '0');
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

function normalizarReglaBloque(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  let max = toNum(src.max, REGLA_BLOQUE_DEFAULT.max);
  let min = toNum(src.min, REGLA_BLOQUE_DEFAULT.min);
  let descuento = toNum(src.descuento, REGLA_BLOQUE_DEFAULT.descuento);
  max = Math.max(0, Math.min(20, max));
  min = Math.max(0, Math.min(20, min));
  if (min > max) {
    const t = min;
    min = max;
    max = t;
  }
  descuento = Math.max(0.1, Math.min(5, Math.round(descuento * 10) / 10));
  return { max, min, descuento, redondear: parseRedondear(src.redondear, true) };
}

function esFormatoPlanoLegacy(src) {
  if (!src || typeof src !== 'object') return false;
  const tieneAnidados = CASILLEROS_CONDUCTA.some((k) => src[k] && typeof src[k] === 'object');
  if (tieneAnidados) return false;
  return src.max != null || src.min != null || src.descuento != null;
}

function normalizarReglaConducta(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const legado = esFormatoPlanoLegacy(src) ? normalizarReglaBloque(src) : null;
  const base = legado || REGLA_BLOQUE_DEFAULT;
  return {
    incidencias: normalizarReglaBloque(src.incidencias || base),
    presentacion: normalizarReglaBloque(src.presentacion || base),
    tardanzas: normalizarReglaBloque(src.tardanzas || base),
    redondear_promedio: parseRedondear(
      src.redondear_promedio !== undefined ? src.redondear_promedio : (legado ? legado.redondear : true),
      true
    ),
  };
}

function notaDesdeCantidad(cantidad, reglaBloque) {
  const r = normalizarReglaBloque(reglaBloque);
  const cant = Math.max(0, parseInt(cantidad, 10) || 0);
  let nota = r.max - cant * r.descuento;
  nota = Math.max(r.min, Math.min(r.max, nota));
  if (r.redondear) {
    nota = roundHalfUp(nota);
    nota = Math.max(r.min, Math.min(r.max, nota));
  }
  return formatNotaAlmacenada(nota);
}

function promedioCasilleros(notasStr, redondearPromedio = true) {
  const nums = (notasStr || [])
    .map((n) => parseFloat(n))
    .filter((n) => Number.isFinite(n));
  if (!nums.length) return formatNotaAlmacenada(REGLA_BLOQUE_DEFAULT.max);
  let p = nums.reduce((a, b) => a + b, 0) / nums.length;
  if (redondearPromedio) p = roundHalfUp(p);
  else p = Math.round(p * 10) / 10;
  return formatNotaAlmacenada(p);
}

function notasDesdeConteos(conteos, reglaRaw) {
  const regla = normalizarReglaConducta(reglaRaw);
  const incidencias = notaDesdeCantidad(conteos?.incidencias || 0, regla.incidencias);
  const presentacion = notaDesdeCantidad(conteos?.presentacion || 0, regla.presentacion);
  const tardanzas = notaDesdeCantidad(conteos?.tardanzas || 0, regla.tardanzas);
  const final = promedioCasilleros([incidencias, presentacion, tardanzas], regla.redondear_promedio);
  return { incidencias, presentacion, tardanzas, final, regla };
}

function textoReglaConducta(reglaRaw) {
  const r = normalizarReglaConducta(reglaRaw);
  const partes = CASILLEROS_CONDUCTA.map((k) => {
    const b = r[k];
    return `${LABELS_CASILLERO[k]}: parte de ${formatNotaAlmacenada(b.max)}, ${formatDescuentoLabel(b.descuento)} por registro (mín. ${formatNotaAlmacenada(b.min)})`;
  });
  let t = `${partes.join('. ')}. La nota de conducta es el promedio de los tres casilleros.`;
  if (r.redondear_promedio) t += ' El promedio redondea .5 hacia arriba.';
  t += ' No se edita a mano.';
  return t;
}

function textoReglaCorta(reglaRaw) {
  const r = normalizarReglaConducta(reglaRaw);
  const bits = CASILLEROS_CONDUCTA.map((k) => `${LABELS_CASILLERO[k]} −${r[k].descuento}`);
  return `${bits.join(' · ')} · nota = promedio`;
}

function captionDescuentosConducta(reglaRaw) {
  const r = normalizarReglaConducta(reglaRaw);
  return `Incid. ${formatDescuentoLabel(r.incidencias.descuento)} · Present. ${formatDescuentoLabel(r.presentacion.descuento)} · Tard. ${formatDescuentoLabel(r.tardanzas.descuento)}. La nota es el promedio de los tres casilleros.`;
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
  REGLA_BLOQUE_DEFAULT,
  CASILLEROS_CONDUCTA,
  LABELS_CASILLERO,
  toNum,
  roundHalfUp,
  formatNotaAlmacenada,
  formatDescuentoLabel,
  normalizarReglaBloque,
  normalizarReglaConducta,
  notaDesdeCantidad,
  promedioCasilleros,
  notasDesdeConteos,
  textoReglaConducta,
  textoReglaCorta,
  captionDescuentosConducta,
  fetchReglaConducta,
  guardarReglaConducta,
};
