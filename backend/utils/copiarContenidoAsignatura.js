/**
 * Resuelve el id de tema interactivo en asignatura destino (copiar contenido / sesiones PDF).
 */
async function resolverTemaDestinoId(
  query,
  { temaOrigenId, asignaturaOrigenId, asignaturaDestinoId, mapeoTemasOrigenADestino = {} }
) {
  if (temaOrigenId == null) return null;

  const mapKey = String(temaOrigenId);
  const desdeMapa = mapeoTemasOrigenADestino[mapKey] ?? mapeoTemasOrigenADestino[temaOrigenId];
  if (desdeMapa) return desdeMapa;

  const temaOrigen = await query(
    `SELECT id, nombre, ciclo, orden FROM asignaturas_archivos WHERE id = ? AND asignatura_id = ?`,
    [temaOrigenId, asignaturaOrigenId]
  );
  if (!temaOrigen.length) return null;

  const t = temaOrigen[0];
  const nombre = String(t.nombre || '').trim();
  const ciclo = parseInt(t.ciclo, 10);
  const orden = t.orden != null ? parseInt(t.orden, 10) : 0;

  if (!nombre || Number.isNaN(ciclo)) return null;

  let dest = await query(
    `SELECT id FROM asignaturas_archivos
     WHERE asignatura_id = ? AND TRIM(nombre) = ? AND ciclo = ? AND orden = ?
     LIMIT 1`,
    [asignaturaDestinoId, nombre, ciclo, orden]
  );
  if (dest.length) return dest[0].id;

  dest = await query(
    `SELECT id FROM asignaturas_archivos
     WHERE asignatura_id = ? AND TRIM(nombre) = ? AND ciclo = ?
     ORDER BY orden ASC, id ASC
     LIMIT 1`,
    [asignaturaDestinoId, nombre, ciclo]
  );
  if (dest.length) return dest[0].id;

  dest = await query(
    `SELECT id FROM asignaturas_archivos
     WHERE asignatura_id = ? AND LOWER(TRIM(nombre)) = LOWER(?) AND ciclo = ?
     ORDER BY orden ASC, id ASC
     LIMIT 1`,
    [asignaturaDestinoId, nombre, ciclo]
  );
  if (dest.length) return dest[0].id;

  return null;
}

module.exports = { resolverTemaDestinoId };
