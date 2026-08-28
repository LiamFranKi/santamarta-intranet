export const REGLA_BLOQUE_DEFAULT = Object.freeze({
  max: 20,
  min: 6,
  descuento: 0.5,
  redondear: true,
});

export const REGLA_CONDUCTA_DEFAULT = Object.freeze({
  incidencias: { ...REGLA_BLOQUE_DEFAULT },
  presentacion: { ...REGLA_BLOQUE_DEFAULT },
  tardanzas: { ...REGLA_BLOQUE_DEFAULT },
  olvido_qr: { ...REGLA_BLOQUE_DEFAULT },
  redondear_promedio: true,
});

export const CASILLEROS_CONDUCTA = ['incidencias', 'presentacion', 'tardanzas', 'olvido_qr'];

export const LABELS_CASILLERO = {
  incidencias: 'Incidencias',
  presentacion: 'Presentación',
  tardanzas: 'Tardanzas',
  olvido_qr: 'Olvido QR',
};

function toNum(value, fallback) {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

function parseRedondear(v, fallback = true) {
  if (v === undefined || v === null || v === '') return fallback;
  return !(v === false || v === 0 || v === '0' || v === 'NO' || v === 'no' || v === 'false');
}

export function formatNotaConducta(nota) {
  const n = parseFloat(nota);
  if (!Number.isFinite(n)) return String(REGLA_BLOQUE_DEFAULT.max).padStart(2, '0');
  const tenth = Math.round(n * 10) / 10;
  if (Math.abs(tenth - Math.round(tenth)) < 1e-9) {
    return String(Math.round(tenth)).padStart(2, '0');
  }
  return tenth.toFixed(1);
}

export function formatDescuentoLabel(descuento) {
  const d = toNum(descuento, 0.5);
  const txt = Math.abs(d - Math.round(d)) < 1e-9 ? String(Math.round(d)) : String(Math.round(d * 10) / 10);
  if (Math.abs(d - 0.5) < 1e-9) return `−${txt} (medio punto)`;
  return `−${txt} punto${Math.abs(d) === 1 ? '' : 's'}`;
}

export function normalizarReglaBloque(raw) {
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

export function normalizarReglaConducta(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const legado = esFormatoPlanoLegacy(src) ? normalizarReglaBloque(src) : null;
  const base = legado || REGLA_BLOQUE_DEFAULT;
  const redondear_promedio = parseRedondear(
    src.redondear_promedio !== undefined ? src.redondear_promedio : (legado ? legado.redondear : true),
    true
  );
  const bloque = (rawBloque) => {
    const b = normalizarReglaBloque(rawBloque);
    return { ...b, redondear: redondear_promedio };
  };
  return {
    incidencias: bloque(src.incidencias || base),
    presentacion: bloque(src.presentacion || base),
    tardanzas: bloque(src.tardanzas || base),
    olvido_qr: bloque(src.olvido_qr || base),
    redondear_promedio,
  };
}

export function notaDesdeCantidad(cantidad, reglaBloque) {
  const r = normalizarReglaBloque(reglaBloque);
  const cant = Math.max(0, parseInt(cantidad, 10) || 0);
  let nota = r.max - cant * r.descuento;
  nota = Math.max(r.min, Math.min(r.max, nota));
  if (r.redondear) {
    nota = Math.round(nota + Number.EPSILON);
    nota = Math.max(r.min, Math.min(r.max, nota));
  }
  return formatNotaConducta(nota);
}

export function promedioCasilleros(notasStr, redondearPromedio = true) {
  const nums = (notasStr || []).map((n) => parseFloat(n)).filter((n) => Number.isFinite(n));
  if (!nums.length) return formatNotaConducta(REGLA_BLOQUE_DEFAULT.max);
  let p = nums.reduce((a, b) => a + b, 0) / nums.length;
  if (redondearPromedio) p = Math.round(p + Number.EPSILON);
  else p = Math.round(p * 10) / 10;
  return formatNotaConducta(p);
}

export function textoReglaConducta(reglaRaw) {
  const r = normalizarReglaConducta(reglaRaw);
  const partes = CASILLEROS_CONDUCTA.map((k) => {
    const b = r[k];
    return `${LABELS_CASILLERO[k]}: parte de ${formatNotaConducta(b.max)}, ${formatDescuentoLabel(b.descuento)} por registro (mín. ${formatNotaConducta(b.min)})`;
  });
  let t = `${partes.join('. ')}. La nota de conducta es el promedio de los cuatro casilleros.`;
  if (r.redondear_promedio) t += ' El promedio redondea .5 hacia arriba.';
  t += ' No se edita a mano.';
  return t;
}

export function textoReglaCorta(reglaRaw) {
  const r = normalizarReglaConducta(reglaRaw);
  const bits = CASILLEROS_CONDUCTA.map((k) => `${LABELS_CASILLERO[k]} −${r[k].descuento}`);
  return `${bits.join(' · ')} · nota = promedio`;
}

export function captionDescuentosConducta(reglaRaw) {
  const r = normalizarReglaConducta(reglaRaw);
  return `Incid. ${formatDescuentoLabel(r.incidencias.descuento)} · Present. ${formatDescuentoLabel(r.presentacion.descuento)} · Tard. ${formatDescuentoLabel(r.tardanzas.descuento)} · Olvido QR ${formatDescuentoLabel(r.olvido_qr.descuento)}. La nota es el promedio de los cuatro casilleros.`;
}

export function ejemplosReglaBloque(reglaBloque) {
  const r = normalizarReglaBloque(reglaBloque);
  const n = (c) => notaDesdeCantidad(c, r);
  return [
    { registros: 0, nota: n(0) },
    { registros: 1, nota: n(1) },
    { registros: 2, nota: n(2) },
    { registros: 25, nota: n(25) },
    { registros: 28, nota: n(28) },
  ];
}

/** Compat: vista previa del casillero incidencias. */
export function ejemplosReglaConducta(regla) {
  const r = normalizarReglaConducta(regla);
  return ejemplosReglaBloque(r.incidencias);
}

export function notaMaxReferencia(reglaRaw) {
  const r = normalizarReglaConducta(reglaRaw);
  return formatNotaConducta(r.incidencias.max);
}

export function esOrigenIncidenciaDocente(origen) {
  return origen !== 'vestimenta' && origen !== 'tardanza' && origen !== 'olvido_qr';
}

export function conteosOrigenConducta(regs = []) {
  let incidencias = 0;
  let presentacion = 0;
  let tardanzas = 0;
  let olvido_qr = 0;
  (regs || []).forEach((x) => {
    if (x.origen === 'vestimenta') presentacion += 1;
    else if (x.origen === 'tardanza') tardanzas += 1;
    else if (x.origen === 'olvido_qr') olvido_qr += 1;
    else incidencias += 1;
  });
  return { incidencias, presentacion, tardanzas, olvido_qr };
}

export function etiquetaOrigenConducta(origen) {
  if (origen === 'vestimenta') return 'Presentación';
  if (origen === 'tardanza') return 'Tardanza';
  if (origen === 'olvido_qr') return 'Olvido QR';
  return 'Incidencia';
}

export function claseOrigenConducta(origen) {
  if (origen === 'vestimenta') return 'es-vestimenta';
  if (origen === 'tardanza') return 'es-tardanza';
  if (origen === 'olvido_qr') return 'es-olvido-qr';
  return 'es-incidencia';
}
