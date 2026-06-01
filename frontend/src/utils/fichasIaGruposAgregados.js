/**
 * Agrupa opciones de grupo (nivel + grado + sección) en un solo ítem por grado
 * para Fichas IA: sin mostrar sección (5° A y 5° B → un solo «5°»).
 */

const ORDEN_NIVEL = { Inicial: 0, INICIAL: 0, Primaria: 1, PRIMARIA: 1, Secundaria: 2, SECUNDARIA: 2 };

export function claveGradoAgregado(o) {
  if (!o) return '';
  const nivelId = o.nivel_id != null && o.nivel_id !== '' ? String(o.nivel_id) : '';
  const grado = o.grado != null && o.grado !== '' ? String(o.grado) : '';
  if (nivelId) return `n:${nivelId}:g:${grado}`;
  const nivelNom = String(o.nivel_nombre || '')
    .trim()
    .toUpperCase();
  return `nn:${nivelNom}:g:${grado}`;
}

/** Etiqueta visible: «Inicial — 3°» (sin sección). */
export function etiquetaGradoAgregado(o) {
  if (!o) return '—';
  const nivel = String(o.nivel_nombre || '').trim();
  const grado = o.grado != null && o.grado !== '' ? `${o.grado}°` : '';
  if (nivel && grado) return `${nivel} — ${grado}`;
  return nivel || grado || '—';
}

function ordenAgregado(a, b) {
  const na =
    ORDEN_NIVEL[a.nivel_nombre] ??
    (a.nivel_orden != null ? Number(a.nivel_orden) : 999);
  const nb =
    ORDEN_NIVEL[b.nivel_nombre] ??
    (b.nivel_orden != null ? Number(b.nivel_orden) : 999);
  if (na !== nb) return na - nb;
  const ga = a.grado != null ? Number(a.grado) : 0;
  const gb = b.grado != null ? Number(b.grado) : 0;
  return ga - gb;
}

/**
 * @param {Array<object>} opciones — filas de /fichas-ia/meta/grupos
 * @returns {Array<{ clave, etiqueta, nivel_id, grado, nivel_nombre, nivel_orden, grupo_ids, grupo_id_rep }>}
 */
export function agruparOpcionesGrupoPorGrado(opciones) {
  const map = new Map();
  for (const o of opciones || []) {
    const clave = claveGradoAgregado(o);
    if (!clave) continue;
    let bucket = map.get(clave);
    const gid = parseInt(o.grupo_id, 10);
    if (!bucket) {
      bucket = {
        clave,
        etiqueta: etiquetaGradoAgregado(o),
        nivel_id: o.nivel_id,
        grado: o.grado,
        nivel_nombre: o.nivel_nombre,
        nivel_orden: o.nivel_orden,
        grupo_ids: [],
        grupo_id_rep: Number.isFinite(gid) ? gid : o.grupo_id,
      };
      map.set(clave, bucket);
    }
    if (Number.isFinite(gid) && !bucket.grupo_ids.includes(gid)) {
      bucket.grupo_ids.push(gid);
      if (gid < bucket.grupo_id_rep) bucket.grupo_id_rep = gid;
    }
  }
  return Array.from(map.values()).sort(ordenAgregado);
}

/** Resuelve la clave agregada a partir de un grupo_id guardado en BD. */
export function claveGradoDesdeGrupoId(opciones, grupoId) {
  const gid = parseInt(grupoId, 10);
  if (!Number.isFinite(gid)) return '';
  const fila = (opciones || []).find((o) => parseInt(o.grupo_id, 10) === gid);
  return fila ? claveGradoAgregado(fila) : '';
}

export function bucketPorClave(agregados, clave) {
  if (!clave) return null;
  return (agregados || []).find((b) => b.clave === clave) || null;
}
