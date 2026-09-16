const { urlArchivoMensajeStatic } = require('./mensajesHtml');

/**
 * Una sola consulta de adjuntos para una página de bandeja (evita 1 query por mensaje).
 */
async function adjuntarArchivosListaMensajes(query, mensajes) {
  if (!mensajes || mensajes.length === 0) return mensajes;
  const ids = mensajes.map((m) => m.id).filter((id) => Number.isFinite(Number(id)) && Number(id) > 0);
  if (!ids.length) {
    for (const m of mensajes) m.archivos = m.archivos || [];
    return mensajes;
  }
  const ph = ids.map(() => '?').join(',');
  const rows = await query(
    `SELECT id, nombre_archivo, archivo, mensaje_id
     FROM mensajes_archivos
     WHERE mensaje_id IN (${ph})`,
    ids
  );
  const byMsg = {};
  for (const a of rows || []) {
    if (!byMsg[a.mensaje_id]) byMsg[a.mensaje_id] = [];
    byMsg[a.mensaje_id].push({
      ...a,
      archivo_url: urlArchivoMensajeStatic(a.archivo),
    });
  }
  for (const m of mensajes) {
    m.archivos = byMsg[m.id] || [];
  }
  return mensajes;
}

module.exports = { adjuntarArchivosListaMensajes };
