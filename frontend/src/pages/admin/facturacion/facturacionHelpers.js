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

export const TIPOS_DOC_IDENTIDAD = ['DNI', 'RUC', 'CE', 'PASAPORTE'];

export const RUBROS_VENTA = ['NINGUNO', 'LIBROS', 'UNIFORMES', 'UTILES', 'OTROS'];

export const TIPOS_COMPRA = ['BOLETA DE VENTA', 'FACTURA'];

export const TIPOS_MOVIMIENTO = ['INGRESO', 'EGRESO'];

export const TIPOS_CLIENTE_VENTA = ['EXTERNO', 'ALUMNO', 'DOCENTE'];

export const ESTADOS_PAGO_VENTA = ['PENDIENTE', 'CANCELADO'];
