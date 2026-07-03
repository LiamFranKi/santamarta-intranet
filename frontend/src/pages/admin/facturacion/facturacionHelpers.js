export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function sedeIdSanMartin(sedes) {
  if (!Array.isArray(sedes) || !sedes.length) return '';
  const found = sedes.find((s) => /san\s*mart[ií]n/i.test(String(s.nombre || '')));
  return found ? found.id : sedes[0].id;
}

export const SERIES_VENTA = [
  { value: 1, label: '001 — Ventas' },
  { value: 2, label: '002 — Talleres' },
  { value: 3, label: '003 — Transferencias gratuitas' },
];

export const TIPOS_DOC_IDENTIDAD = [
  'DNI',
  'Pasaporte',
  'Partida de Nacimiento',
  'Libreta Electoral',
  'Libreta Militar',
  'Carnet de Extranjería',
  'Licencia de Conducir',
  'Tarjeta de Seguro',
  'Otro',
];

export const TRANSFERENCIA_GRATUITA_OPCIONES = ['NO', 'SI'];

export const TIPOS_TARJETA_VENTA = [
  { value: 'NINGUNO', label: 'Ninguno' },
  { value: 'CREDITO', label: 'Tarjeta Crédito' },
  { value: 'DEBITO', label: 'Tarjeta Débito' },
];

/** Porcentaje con un decimal para UI (evita 3.599999990463256%). */
export function formatPctTarjeta(pct) {
  return (parseFloat(pct) || 0).toFixed(1);
}

/** Comisión en soles según porcentaje configurado en colegio. */
export function calcularComisionTarjeta(subtotal, pct) {
  const base = parseFloat(subtotal) || 0;
  const tasa = parseFloat(pct) || 0;
  return Math.round(((base * tasa) / 100) * 100) / 100;
}

export const RUBROS_VENTA = [
  'NINGUNO',
  'BCP RECAUDADORA',
  'BCP IEP',
  'BCP MARTHA',
  'BCP YAPE',
  'YAPE NUMERAL',
  'EFECTIVO',
  'TRANSFERENCIA',
];

export const TIPOS_COMPRA = ['BOLETA DE VENTA', 'FACTURA'];

export const TIPOS_MOVIMIENTO = ['INGRESO', 'EGRESO'];

export const TIPOS_CLIENTE_VENTA = ['ALUMNO', 'DOCENTE', 'EXTERNO'];

export const ESTADOS_PAGO_VENTA = ['PENDIENTE', 'CANCELADO'];
