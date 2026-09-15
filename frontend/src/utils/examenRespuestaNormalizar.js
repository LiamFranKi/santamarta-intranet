/**
 * Normaliza respuestas antes de guardar local/servidor (todos los tipos).
 */

export function normalizarRespuestaParaGuardar(respuesta, tipoPregunta) {
  if (respuesta === null || respuesta === undefined || respuesta === '') {
    return respuesta;
  }

  const tipo = String(tipoPregunta || '').toUpperCase();

  if (tipo === 'ALTERNATIVAS' || tipo === 'VERDADERO_FALSO') {
    const n = Number(respuesta);
    return Number.isFinite(n) ? n : String(respuesta).trim();
  }

  if (tipo === 'ORDENAR' && Array.isArray(respuesta)) {
    return respuesta.map((id) => {
      const n = parseInt(id, 10);
      return Number.isNaN(n) ? id : n;
    });
  }

  if (tipo === 'COMPLETAR' && typeof respuesta === 'object' && !Array.isArray(respuesta)) {
    const out = {};
    for (const [k, v] of Object.entries(respuesta)) {
      out[String(k)] = v == null ? '' : String(v);
    }
    return out;
  }

  if (tipo === 'EMPAREJAR' && typeof respuesta === 'object' && !Array.isArray(respuesta)) {
    const out = {};
    for (const [k, v] of Object.entries(respuesta)) {
      const nv = parseInt(v, 10);
      out[String(k)] = Number.isNaN(nv) ? v : nv;
    }
    return out;
  }

  if (tipo === 'ARRASTRAR_Y_SOLTAR' && typeof respuesta === 'object' && !Array.isArray(respuesta)) {
    const out = {};
    for (const [k, v] of Object.entries(respuesta)) {
      if (v && typeof v === 'object' && v.zona != null) {
        out[String(k)] = { zona: String(v.zona) };
      } else if (typeof v === 'string') {
        out[String(k)] = { zona: v };
      } else {
        out[String(k)] = v;
      }
    }
    return out;
  }

  if (tipo === 'RESPUESTA_CORTA') {
    return String(respuesta ?? '');
  }

  if (tipo === 'SPEAKING' && typeof respuesta === 'object' && !Array.isArray(respuesta)) {
    const notaRaw = respuesta.nota_docente;
    const nota =
      notaRaw === null || notaRaw === undefined || notaRaw === '' ? null : Number(notaRaw);
    return {
      modo: respuesta.modo ? String(respuesta.modo).toUpperCase() : null,
      audio: respuesta.audio || respuesta.audio_archivo || null,
      visto: !!(respuesta.visto === true || respuesta.visto === 1 || respuesta.visto === 'SI'),
      nota_docente: Number.isFinite(nota) ? nota : null,
      comentario: respuesta.comentario ? String(respuesta.comentario) : null
    };
  }

  return respuesta;
}
