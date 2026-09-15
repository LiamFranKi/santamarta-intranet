/**
 * Tipos de examen del aula virtual.
 * VIRTUAL: el sistema califica todo.
 * HIBRIDO: sistema + Speaking que califica el docente.
 * PDF: material descargable, sin prueba en línea.
 */

function tipoExamenNorm(tipo) {
  return String(tipo || '').toUpperCase().trim();
}

function tipoPreguntaNorm(tipo) {
  return String(tipo || '').toUpperCase().trim();
}

function esExamenEnLinea(tipo) {
  const t = tipoExamenNorm(tipo);
  return t === 'VIRTUAL' || t === 'HIBRIDO';
}

function esExamenHibrido(tipo) {
  return tipoExamenNorm(tipo) === 'HIBRIDO';
}

function esPreguntaSpeaking(tipo) {
  return tipoPreguntaNorm(tipo) === 'SPEAKING';
}

function normalizarSpeakingModo(tipoExamen, modo) {
  if (!esExamenHibrido(tipoExamen)) return null;
  return String(modo || 'AUDIO').toUpperCase().trim() === 'EN_VIVO' ? 'EN_VIVO' : 'AUDIO';
}

function filtrarPreguntasSegunTipoExamen(tipoExamen, preguntas) {
  const list = Array.isArray(preguntas) ? preguntas : [];
  if (esExamenHibrido(tipoExamen)) return list;
  return list.filter((p) => !esPreguntaSpeaking(p && p.tipo));
}

function parseSpeakingRespuesta(respuesta) {
  if (!respuesta || typeof respuesta !== 'object' || Array.isArray(respuesta)) {
    return { modo: null, audio: null, nota_docente: null, comentario: null, visto: false };
  }
  const notaRaw = respuesta.nota_docente;
  const nota =
    notaRaw === null || notaRaw === undefined || notaRaw === ''
      ? null
      : Number(notaRaw);
  return {
    modo: respuesta.modo ? String(respuesta.modo).toUpperCase() : null,
    audio: respuesta.audio || respuesta.audio_archivo || null,
    nota_docente: Number.isFinite(nota) ? nota : null,
    comentario: respuesta.comentario ? String(respuesta.comentario) : null,
    visto: respuesta.visto === true || respuesta.visto === 1 || respuesta.visto === 'SI'
  };
}

function puntosMaxSpeaking(pregunta, examenRow) {
  const propios = parseFloat(pregunta && pregunta.puntos);
  if (Number.isFinite(propios) && propios > 0) return propios;
  if (examenRow && String(examenRow.tipo_puntaje || '').toUpperCase() === 'GENERAL') {
    return parseFloat(examenRow.puntos_correcta) || 0;
  }
  return 0;
}

/** Conserva audio y nota del docente si el alumno vuelve a guardar la misma pregunta. */
function fusionarCamposSpeaking(respuestaNorm, previa) {
  if (!respuestaNorm || typeof respuestaNorm !== 'object' || Array.isArray(respuestaNorm)) {
    return respuestaNorm;
  }
  if (!previa || typeof previa !== 'object' || Array.isArray(previa)) {
    return respuestaNorm;
  }
  const out = { ...respuestaNorm };
  if (out.nota_docente == null && previa.nota_docente != null) {
    out.nota_docente = previa.nota_docente;
  }
  if (!out.comentario && previa.comentario) {
    out.comentario = previa.comentario;
  }
  if (!out.audio && (previa.audio || previa.audio_archivo)) {
    out.audio = previa.audio || previa.audio_archivo;
  }
  if (!out.modo && previa.modo) {
    out.modo = previa.modo;
  }
  if (previa.calificado_por && out.calificado_por == null) {
    out.calificado_por = previa.calificado_por;
  }
  return out;
}

function adjuntarAudioUrlSpeaking(respuestasMap, buildUrl) {
  const map = respuestasMap && typeof respuestasMap === 'object' ? respuestasMap : {};
  Object.keys(map).forEach((key) => {
    const val = map[key];
    if (val && typeof val === 'object' && (val.audio || val.audio_archivo)) {
      val.audio_url = buildUrl(val.audio || val.audio_archivo);
    }
  });
  return map;
}

module.exports = {
  tipoExamenNorm,
  tipoPreguntaNorm,
  esExamenEnLinea,
  esExamenHibrido,
  esPreguntaSpeaking,
  normalizarSpeakingModo,
  filtrarPreguntasSegunTipoExamen,
  parseSpeakingRespuesta,
  puntosMaxSpeaking,
  fusionarCamposSpeaking,
  adjuntarAudioUrlSpeaking
};
