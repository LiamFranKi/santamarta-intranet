/**
 * Misma lógica que backend/utils/examenCompletar.js para vistas (COMPLETAR con [[a|b]]).
 */

export function stripHtmlParaCompletar(html) {
  return html ? String(html).replace(/<[^>]*>/g, '') : '';
}

export function alternativasNormDesdeInner(inner) {
  const s = String(inner ?? '').trim();
  if (!s) return [];
  return s
    .split('|')
    .map((p) => String(p).trim().toLowerCase())
    .filter((p) => p.length > 0);
}

/** Cada elemento: { raw: string original del placeholder, display: string para UI } */
export function huecosCompletarMetaPorDescripcion(descripcionHtml) {
  const texto = stripHtmlParaCompletar(descripcionHtml);
  const re = /\[\[([^\]]+)\]\]/g;
  const huecos = [];
  let m;
  while ((m = re.exec(texto)) !== null) {
    const raw = String(m[1]).trim();
    if (!raw) continue;
    const parts = raw.split('|').map((p) => String(p).trim()).filter(Boolean);
    const display = parts.length ? parts.join(' · ') : raw;
    huecos.push({ raw, display, alternativasNorm: alternativasNormDesdeInner(raw) });
  }
  return huecos;
}

export function valoresAlumnoCompletarOrden(respuestaAlumno, numHuecos) {
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

export function esCompletarCorrecto(respuestaAlumno, descripcionHtml) {
  const meta = huecosCompletarMetaPorDescripcion(descripcionHtml);
  if (meta.length === 0) return false;
  const vals = valoresAlumnoCompletarOrden(respuestaAlumno, meta.length);
  if (vals.some((v) => !v)) return false;
  for (let i = 0; i < meta.length; i++) {
    if (!meta[i].alternativasNorm.includes(vals[i])) return false;
  }
  return true;
}
