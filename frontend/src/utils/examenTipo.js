export function tipoExamenNorm(tipo) {
  return String(tipo || '').toUpperCase().trim();
}

export function esExamenEnLinea(tipo) {
  const t = tipoExamenNorm(tipo);
  return t === 'VIRTUAL' || t === 'HIBRIDO';
}

export function esExamenHibrido(tipo) {
  return tipoExamenNorm(tipo) === 'HIBRIDO';
}

export function esPreguntaSpeaking(tipo) {
  return String(tipo || '').toUpperCase().trim() === 'SPEAKING';
}

export function etiquetaTipoExamen(tipo) {
  const t = tipoExamenNorm(tipo);
  if (t === 'HIBRIDO') return 'HÍBRIDO';
  if (t === 'PDF') return 'PDF';
  if (t === 'VIRTUAL') return 'VIRTUAL';
  return t || '—';
}

export function parseSpeakingRespuesta(respuesta) {
  if (!respuesta || typeof respuesta !== 'object' || Array.isArray(respuesta)) {
    return { modo: null, audio: null, nota_docente: null, comentario: null, visto: false };
  }
  const notaRaw = respuesta.nota_docente;
  const nota =
    notaRaw === null || notaRaw === undefined || notaRaw === '' ? null : Number(notaRaw);
  return {
    modo: respuesta.modo ? String(respuesta.modo).toUpperCase() : null,
    audio: respuesta.audio || respuesta.audio_archivo || null,
    nota_docente: Number.isFinite(nota) ? nota : null,
    comentario: respuesta.comentario ? String(respuesta.comentario) : null,
    visto: respuesta.visto === true || respuesta.visto === 1 || respuesta.visto === 'SI'
  };
}

export function puntosMaxSpeaking(pregunta, examenRow) {
  const propios = parseFloat(pregunta && pregunta.puntos);
  if (Number.isFinite(propios) && propios > 0) return propios;
  if (examenRow && String(examenRow.tipo_puntaje || '').toUpperCase() === 'GENERAL') {
    return parseFloat(examenRow.puntos_correcta) || 0;
  }
  return 0;
}
