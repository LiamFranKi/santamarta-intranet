/** Utilidades UI para historial de asistencias de un alumno (agrupación, colores, etiquetas). */

export const COLORES_TIPO_ASISTENCIA = {
  PRESENTE: { bg: '#e8f5e9', border: '#4caf50', text: '#2e7d32' },
  TARDANZA: { bg: '#fff3e0', border: '#ff9800', text: '#e65100' },
  TARDANZA_JUSTIFICADA: { bg: '#e3f2fd', border: '#2196f3', text: '#1565c0' },
  FALTA: { bg: '#ffebee', border: '#f44336', text: '#c62828' },
  FALTA_JUSTIFICADA: { bg: '#f3e5f5', border: '#9c27b0', text: '#6a1b9a' },
};

export function colorTipoAsistencia(tipo) {
  return COLORES_TIPO_ASISTENCIA[String(tipo || '').toUpperCase()] || {
    bg: '#f5f5f5',
    border: '#9e9e9e',
    text: '#424242',
  };
}

export function etiquetaTipoAsistencia(tipo) {
  const t = String(tipo || '').toUpperCase();
  const map = {
    PRESENTE: 'Presente',
    TARDANZA: 'Tardanza',
    TARDANZA_JUSTIFICADA: 'Tardanza justificada',
    FALTA: 'Falta',
    FALTA_JUSTIFICADA: 'Falta justificada',
  };
  return map[t] || t.replace(/_/g, ' ');
}

export function obtenerMesAnioAsistencia(fecha) {
  if (!fecha) return 'Sin fecha';
  try {
    const s = String(fecha).trim().slice(0, 10);
    const d = s.match(/^\d{4}-\d{2}-\d{2}$/) ? new Date(`${s}T12:00:00`) : new Date(fecha);
    if (Number.isNaN(d.getTime())) return 'Sin fecha';
    return d.toLocaleDateString('es-PE', { year: 'numeric', month: 'long' });
  } catch {
    return 'Sin fecha';
  }
}

export function agruparAsistenciasPorMes(asistencias) {
  const grupos = {};
  (asistencias || []).forEach((a) => {
    const mesAnio = obtenerMesAnioAsistencia(a.fecha);
    if (!grupos[mesAnio]) grupos[mesAnio] = [];
    grupos[mesAnio].push(a);
  });
  return grupos;
}

/** Botones de leyenda (mismos estilos que registro tutoría, solo visual). */
export const LEYENDA_TIPOS_ASISTENCIA = [
  { tipo: 'PRESENTE', clase: 'btn-presente', label: 'Presente' },
  { tipo: 'TARDANZA', clase: 'btn-tardanza', label: 'Tardanza' },
  { tipo: 'TARDANZA_JUSTIFICADA', clase: 'btn-tj', label: 'TJ' },
  { tipo: 'FALTA', clase: 'btn-falta', label: 'Falta' },
  { tipo: 'FALTA_JUSTIFICADA', clase: 'btn-fj', label: 'FJ' },
];
