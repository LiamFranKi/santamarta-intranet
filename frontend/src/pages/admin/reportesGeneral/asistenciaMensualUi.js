/** Códigos y colores para reporte mensual de asistencia */
export const CODIGO_ASISTENCIA_COLOR = {
  P: '#1565c0',
  F: '#c62828',
  T: '#e65100',
  TJ: '#1565c0',
  FJ: '#6a1b9a',
};

export function claseCodigoAsistencia(codigo) {
  const c = String(codigo || '').toUpperCase();
  if (c === 'P') return 'rg-asist-mes-mark--p';
  if (c === 'F') return 'rg-asist-mes-mark--f';
  if (c === 'T') return 'rg-asist-mes-mark--t';
  if (c === 'TJ') return 'rg-asist-mes-mark--tj';
  if (c === 'FJ') return 'rg-asist-mes-mark--fj';
  return '';
}

export const MESES_OPCIONES = [
  { value: 1, label: 'Enero' },
  { value: 2, label: 'Febrero' },
  { value: 3, label: 'Marzo' },
  { value: 4, label: 'Abril' },
  { value: 5, label: 'Mayo' },
  { value: 6, label: 'Junio' },
  { value: 7, label: 'Julio' },
  { value: 8, label: 'Agosto' },
  { value: 9, label: 'Septiembre' },
  { value: 10, label: 'Octubre' },
  { value: 11, label: 'Noviembre' },
  { value: 12, label: 'Diciembre' },
];
