function urlArchivoTarea(archivoNombre) {
  if (!archivoNombre || String(archivoNombre).trim() === '') return null;
  const phpSystemUrl = process.env.PHP_SYSTEM_URL || '';
  const isDevelopment = process.env.NODE_ENV !== 'production';
  const archivo = String(archivoNombre);
  if (archivo.startsWith('http')) {
    return archivo
      .replace(/https?:\/\/(www\.)?vanguardschools\.edu\.pe/gi, phpSystemUrl)
      .replace(/https?:\/\/nuevo\.vanguardschools\.edu\.pe/gi, phpSystemUrl)
      .replace(/vanguardschools\.comstatic/gi, `${phpSystemUrl}/Static`)
      .replace(/vanguardschools\.com\/static/gi, `${phpSystemUrl}/Static`)
      .replace(/vanguardschools\.com\/Static/gi, `${phpSystemUrl}/Static`);
  }
  if (archivo.startsWith('/Static/')) {
    const nombreArchivo = archivo.replace(/^\/Static\/Archivos\//, '');
    return isDevelopment
      ? `http://localhost:5000/Static/Archivos/${nombreArchivo}`
      : `${phpSystemUrl}/Static/Archivos/${nombreArchivo}`;
  }
  if (archivo.startsWith('/uploads/')) {
    return isDevelopment ? `http://localhost:5000${archivo}` : `${phpSystemUrl}${archivo}`;
  }
  return isDevelopment
    ? `http://localhost:5000/Static/Archivos/${archivo}`
    : `${phpSystemUrl}/Static/Archivos/${archivo}`;
}

/**
 * Lista de tareas con archivos en 1 SELECT (evita 1 query por tarea al abrir el aula).
 */
async function enriquecerTareasConArchivos(query, tareas) {
  if (!tareas || tareas.length === 0) return [];
  const ids = tareas.map((t) => t.id).filter((id) => Number.isFinite(Number(id)) && Number(id) > 0);
  const byTarea = {};
  if (ids.length) {
    const ph = ids.map(() => '?').join(',');
    const archivos = await query(
      `SELECT * FROM asignaturas_tareas_archivos WHERE tarea_id IN (${ph})`,
      ids
    );
    for (const archivo of archivos || []) {
      if (!byTarea[archivo.tarea_id]) byTarea[archivo.tarea_id] = [];
      byTarea[archivo.tarea_id].push({
        ...archivo,
        archivo_url: urlArchivoTarea(archivo.archivo),
      });
    }
  }
  return tareas.map((tarea) => ({
    ...tarea,
    archivos: byTarea[tarea.id] || [],
    enlace_url: tarea.enlace && String(tarea.enlace).trim() !== '' ? String(tarea.enlace).trim() : null,
  }));
}

module.exports = { enriquecerTareasConArchivos, urlArchivoTarea };
