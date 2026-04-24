/**
 * Preguntas tipo COMPLETAR: placeholders [[texto]] o [[alt1|alt2|alt3]] (misma respuesta aceptada).
 */

function stripHtmlParaCompletar(html) {
  return html ? String(html).replace(/<[^>]*>/g, '') : '';
}

/** Parte interna de [[...]] → variantes aceptadas en minúsculas (sin vacíos). */
function alternativasNormDesdeInner(inner) {
  const s = String(inner ?? '').trim();
  if (!s) return [];
  return s
    .split('|')
    .map((p) => String(p).trim().toLowerCase())
    .filter((p) => p.length > 0);
}

/**
 * Lista de huecos en orden de aparición; cada hueco es un array de strings normalizados aceptados.
 */
function huecosCompletarNormPorDescripcion(descripcionHtml) {
  const texto = stripHtmlParaCompletar(descripcionHtml);
  const re = /\[\[([^\]]+)\]\]/g;
  const huecos = [];
  let m;
  while ((m = re.exec(texto)) !== null) {
    const alts = alternativasNormDesdeInner(m[1]);
    if (alts.length) huecos.push(alts);
  }
  return huecos;
}

/** Valores del alumno por índice 0..numHuecos-1 (minúsculas, trim). */
function valoresAlumnoCompletarOrden(respuestaAlumno, numHuecos) {
  const out = [];
  for (let i = 0; i < numHuecos; i++) {
    const raw =
      respuestaAlumno && typeof respuestaAlumno === 'object'
        ? respuestaAlumno[i] ?? respuestaAlumno[String(i)]
        : undefined;
    out.push(String(raw ?? '').trim().toLowerCase());
  }
  return out;
}

/**
 * Correcto si hay huecos, el alumno envió un valor no vacío en cada índice y cada uno coincide
 * con alguna alternativa de ese hueco (misma posición que en el enunciado).
 */
function esCompletarCorrecto(respuestaAlumno, descripcionHtml) {
  const huecos = huecosCompletarNormPorDescripcion(descripcionHtml);
  if (huecos.length === 0) return false;
  const vals = valoresAlumnoCompletarOrden(respuestaAlumno, huecos.length);
  if (vals.some((v) => !v)) return false;
  for (let i = 0; i < huecos.length; i++) {
    if (!huecos[i].includes(vals[i])) return false;
  }
  return true;
}

module.exports = {
  stripHtmlParaCompletar,
  alternativasNormDesdeInner,
  huecosCompletarNormPorDescripcion,
  valoresAlumnoCompletarOrden,
  esCompletarCorrecto
};
