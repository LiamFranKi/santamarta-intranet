/**
 * Normaliza respuestas de alumno para persistir en JSON/línea (todos los tipos de pregunta).
 */

function normalizarRespuestaParaPersistir(respuesta, tipoPregunta) {
  if (respuesta === null || respuesta === undefined || respuesta === '') {
    return respuesta;
  }

  const tipo = String(tipoPregunta || '').toUpperCase();

  if (tipo === 'ALTERNATIVAS' || tipo === 'VERDADERO_FALSO') {
    const n = Number(respuesta);
    if (Number.isFinite(n)) return n;
    return String(respuesta).trim();
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
      const nk = String(k);
      const nv = parseInt(v, 10);
      out[nk] = Number.isNaN(nv) ? v : nv;
    }
    return out;
  }

  if (tipo === 'ARRASTRAR_Y_SOLTAR' && typeof respuesta === 'object' && !Array.isArray(respuesta)) {
    const out = {};
    for (const [k, v] of Object.entries(respuesta)) {
      const nk = String(k);
      if (v && typeof v === 'object' && v.zona != null) {
        out[nk] = { zona: String(v.zona) };
      } else if (typeof v === 'string') {
        out[nk] = { zona: v };
      } else {
        out[nk] = v;
      }
    }
    return out;
  }

  if (tipo === 'RESPUESTA_CORTA') {
    return String(respuesta ?? '');
  }

  return respuesta;
}

function parseRespuestaDesdeLinea(raw) {
  if (raw === null || raw === undefined) return raw;
  if (typeof raw === 'object') return raw;
  if (typeof raw !== 'string') return raw;
  const t = raw.trim();
  if (t === '') return raw;
  if (t.startsWith('{') || t.startsWith('[')) {
    try {
      return JSON.parse(t);
    } catch (_) {
      return raw;
    }
  }
  const n = Number(t);
  if (Number.isFinite(n) && String(n) === t) return n;
  return raw;
}

module.exports = {
  normalizarRespuestaParaPersistir,
  parseRespuestaDesdeLinea
};
