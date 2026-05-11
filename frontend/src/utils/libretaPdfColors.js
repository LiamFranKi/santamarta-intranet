/**
 * Color de relleno RGB (0-255) para celdas tipo "label" en la libreta PDF (jsPDF setFillColor).
 * Nivel Inicial: pasteles por grado (3° / 4° / 5° años). Otros niveles: azul cornflower.
 *
 * @param {object} datosLibreta Respuesta de GET …/libreta (alumno.grado, alumno.nivel_nombre, es_cualitativa, cursos_cualitativos)
 * @returns {[number, number, number]}
 */
export function getLibretaPdfLabelFillRgb(datosLibreta) {
  const nivelNom = String(datosLibreta?.alumno?.nivel_nombre || '').toUpperCase();
  const g = Number.parseInt(String(datosLibreta?.alumno?.grado ?? '').trim(), 10);
  const esInicial =
    (Boolean(datosLibreta?.es_cualitativa) && Array.isArray(datosLibreta?.cursos_cualitativos)) ||
    nivelNom.includes('INICIAL');
  if (!esInicial) {
    return [100, 149, 237];
  }
  if (g === 3) return [179, 229, 252]; // celeste pastel suave — 3 años
  if (g === 4) return [200, 230, 201]; // verde pastel suave — 4 años
  if (Number.isFinite(g) && g >= 5) return [255, 213, 179]; // naranja pastel suave — 5 años
  return [179, 229, 252]; // inicial sin grado reconocido → celeste
}
