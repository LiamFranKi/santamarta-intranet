/**
 * Texto de nivel / grado / sección para notificaciones a apoderados (exámenes, etc.).
 */

function etiquetaGradoGrupo(row) {
  const partes = [];
  const n = (row.nivel_nombre && String(row.nivel_nombre).trim()) || '';
  if (n) partes.push(n);
  const g = row.grado;
  if (g !== null && g !== undefined && String(g).trim() !== '') {
    const gs = String(g).trim();
    partes.push(gs.endsWith('°') || gs.endsWith('º') ? gs : `${gs}°`);
  }
  const sec = row.seccion;
  if (sec !== null && sec !== undefined && String(sec).trim() !== '') {
    partes.push(`Sección ${String(sec).trim()}`);
  }
  return partes.length ? partes.join(' ') : '';
}

function lineaAlumnoGrado(row) {
  const nom = String(row.alumno_nombre || '')
    .replace(/\s+/g, ' ')
    .trim();
  const gr = etiquetaGradoGrupo(row);
  if (nom && gr) return `Alumno/a: ${nom} (${gr})`;
  if (nom) return `Alumno/a: ${nom}`;
  if (gr) return `Grado: ${gr}`;
  return '';
}

module.exports = {
  etiquetaGradoGrupo,
  lineaAlumnoGrado
};
