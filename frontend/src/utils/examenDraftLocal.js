/**
 * Borrador local y cola de sincronización por pregunta (exámenes aula virtual).
 */
const DRAFT_PREFIX = 'exam_draft_v2_';
const PENDING_PREFIX = 'exam_pending_v2_';
const META_PREFIX = 'exam_meta_v2_';

function safeParse(raw, fallback) {
  try {
    return raw ? JSON.parse(raw) : fallback;
  } catch (_) {
    return fallback;
  }
}

export function draftStorageKey(examenId, pruebaId) {
  return `${DRAFT_PREFIX}${examenId}_${pruebaId}`;
}

export function pendingStorageKey(examenId, pruebaId) {
  return `${PENDING_PREFIX}${examenId}_${pruebaId}`;
}

export function metaStorageKey(examenId, pruebaId) {
  return `${META_PREFIX}${examenId}_${pruebaId}`;
}

export function readDraft(examenId, pruebaId) {
  if (!examenId || !pruebaId) return {};
  try {
    const raw = localStorage.getItem(draftStorageKey(examenId, pruebaId));
    const parsed = safeParse(raw, {});
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (_) {
    return {};
  }
}

export function writeDraft(examenId, pruebaId, respuestas) {
  if (!examenId || !pruebaId) return;
  try {
    localStorage.setItem(draftStorageKey(examenId, pruebaId), JSON.stringify(respuestas || {}));
    const meta = safeParse(localStorage.getItem(metaStorageKey(examenId, pruebaId)), {});
    meta.updatedAt = Date.now();
    localStorage.setItem(metaStorageKey(examenId, pruebaId), JSON.stringify(meta));
  } catch (_) {
    // cuota / modo privado
  }
}

export function clearDraft(examenId, pruebaId) {
  try {
    localStorage.removeItem(draftStorageKey(examenId, pruebaId));
    localStorage.removeItem(pendingStorageKey(examenId, pruebaId));
    localStorage.removeItem(metaStorageKey(examenId, pruebaId));
  } catch (_) {
    // ignorar
  }
}

/** Cola: [{ pregunta_id, respuesta, queuedAt }] */
export function readPendingQueue(examenId, pruebaId) {
  if (!examenId || !pruebaId) return [];
  try {
    const raw = localStorage.getItem(pendingStorageKey(examenId, pruebaId));
    const arr = safeParse(raw, []);
    return Array.isArray(arr) ? arr : [];
  } catch (_) {
    return [];
  }
}

export function writePendingQueue(examenId, pruebaId, queue) {
  if (!examenId || !pruebaId) return;
  try {
    localStorage.setItem(pendingStorageKey(examenId, pruebaId), JSON.stringify(queue.slice(-120)));
  } catch (_) {
    // ignorar
  }
}

export function queuePendingAnswer(examenId, pruebaId, preguntaId, respuesta) {
  const q = readPendingQueue(examenId, pruebaId).filter(
    (item) => Number(item.pregunta_id) !== Number(preguntaId)
  );
  q.push({ pregunta_id: Number(preguntaId), respuesta, queuedAt: Date.now() });
  writePendingQueue(examenId, pruebaId, q);
}

export function removePendingAnswer(examenId, pruebaId, preguntaId) {
  const q = readPendingQueue(examenId, pruebaId).filter(
    (item) => Number(item.pregunta_id) !== Number(preguntaId)
  );
  writePendingQueue(examenId, pruebaId, q);
}

export function mergeRespuestasMaps(...maps) {
  const out = {};
  for (const m of maps) {
    if (!m || typeof m !== 'object') continue;
    for (const [k, v] of Object.entries(m)) {
      out[String(k)] = v;
    }
  }
  return out;
}

/** Fusiona cola pendiente al mapa de respuestas (última marca por pregunta). */
export function pendingQueueToRespuestasMap(queue) {
  const out = {};
  if (!Array.isArray(queue)) return out;
  for (const item of queue) {
    if (item && item.pregunta_id != null) {
      out[String(item.pregunta_id)] = item.respuesta;
    }
  }
  return out;
}

export function readMergedRespuestas(examenId, pruebaId, servidorMap) {
  const borrador = readDraft(examenId, pruebaId);
  const pendiente = pendingQueueToRespuestasMap(readPendingQueue(examenId, pruebaId));
  return mergeRespuestasMaps(servidorMap, borrador, pendiente);
}

export function readLastServerSaveAt(examenId, pruebaId) {
  try {
    const meta = safeParse(localStorage.getItem(metaStorageKey(examenId, pruebaId)), {});
    return meta.lastServerSaveAt || null;
  } catch (_) {
    return null;
  }
}

export function markServerSaveAt(examenId, pruebaId) {
  try {
    const meta = safeParse(localStorage.getItem(metaStorageKey(examenId, pruebaId)), {});
    meta.lastServerSaveAt = Date.now();
    localStorage.setItem(metaStorageKey(examenId, pruebaId), JSON.stringify(meta));
  } catch (_) {
    // ignorar
  }
}
