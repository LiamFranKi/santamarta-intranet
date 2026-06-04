/**
 * Tipos de seguro de salud del alumno (`alumnos.seguro_id`).
 * Alineado al formulario legacy de matrícula online.
 */
const SEGURO_OPCIONES = [
  { id: 1, label: 'SIS' },
  { id: 2, label: 'ESSALUD' },
  { id: 3, label: 'EPS' },
  { id: 4, label: 'OTRO' },
  { id: 5, label: 'NO TIENE' },
];

function etiquetaSeguro(seguroId) {
  const id = parseInt(seguroId, 10);
  const o = SEGURO_OPCIONES.find((x) => x.id === id);
  return o ? o.label : '—';
}

function esSeguroIdValido(seguroId) {
  const id = parseInt(seguroId, 10);
  return SEGURO_OPCIONES.some((x) => x.id === id);
}

module.exports = { SEGURO_OPCIONES, etiquetaSeguro, esSeguroIdValido };
