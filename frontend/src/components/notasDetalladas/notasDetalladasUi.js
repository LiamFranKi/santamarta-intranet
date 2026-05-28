/** Colores pastel para tarjetas de notas detalladas (mismo criterio que Apoderado/Docente). */

export const COLORES_PASTEL_NOTAS = [
  { bg: 'linear-gradient(145deg, #e8f5e9, #f1f8e9)', border: '#4caf50', text: '#2e7d32' },
  { bg: 'linear-gradient(145deg, #e3f2fd, #e8f4fd)', border: '#2196f3', text: '#1565c0' },
  { bg: 'linear-gradient(145deg, #fff3e0, #fff8e1)', border: '#ff9800', text: '#e65100' },
  { bg: 'linear-gradient(145deg, #f3e5f5, #f5e6f7)', border: '#9c27b0', text: '#6a1b9a' },
  { bg: 'linear-gradient(145deg, #ffebee, #fce4ec)', border: '#f44336', text: '#c62828' },
  { bg: 'linear-gradient(145deg, #fff9e6, #fffde7)', border: '#ffc107', text: '#f57c00' },
  { bg: 'linear-gradient(145deg, #e0f2f1, #e8f5f3)', border: '#009688', text: '#00695c' },
  { bg: 'linear-gradient(145deg, #fce4ec, #fce8ed)', border: '#e91e63', text: '#c2185b' },
];

export function colorNotasPorIndice(index) {
  return COLORES_PASTEL_NOTAS[Math.abs(index) % COLORES_PASTEL_NOTAS.length];
}
