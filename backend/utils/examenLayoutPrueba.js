/**
 * Layout fijo de un intento de examen (orden preguntas + alternativas por pregunta).
 * Retrocompatible con campo legacy `preguntas` (solo IDs de preguntas, PHP serialize base64).
 */
const phpSerialize = require('php-serialize');

const LAYOUT_VERSION = 1;

function parsePreguntaIdsLegacy(pruebaRow) {
  if (!pruebaRow?.preguntas || String(pruebaRow.preguntas).trim() === '') return null;
  try {
    const decoded = Buffer.from(pruebaRow.preguntas, 'base64').toString('utf-8');
    const arr = phpSerialize.unserialize(decoded);
    if (!Array.isArray(arr) || arr.length === 0) return null;
    const ids = arr.map((id) => parseInt(id, 10)).filter((n) => !Number.isNaN(n));
    return ids.length > 0 ? ids : null;
  } catch (_) {
    return null;
  }
}

function normalizarAlternativasIdsMap(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw)) {
    const pid = parseInt(k, 10);
    if (Number.isNaN(pid)) continue;
    if (!Array.isArray(v)) continue;
    const ids = v.map((id) => parseInt(id, 10)).filter((n) => !Number.isNaN(n));
    if (ids.length > 0) out[String(pid)] = ids;
  }
  return out;
}

function parseLayoutFromPruebaRow(pruebaRow) {
  if (!pruebaRow) return null;

  let raw = pruebaRow.exam_layout_json;
  if (raw != null && typeof raw === 'string' && raw.trim() !== '') {
    try {
      raw = JSON.parse(raw);
    } catch (_) {
      raw = null;
    }
  }

  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const preguntaIds = Array.isArray(raw.pregunta_ids)
      ? raw.pregunta_ids.map((id) => parseInt(id, 10)).filter((n) => !Number.isNaN(n))
      : [];
    const alternativasIds = normalizarAlternativasIdsMap(raw.alternativas_ids);
    if (preguntaIds.length > 0) {
      return {
        v: raw.v || LAYOUT_VERSION,
        pregunta_ids: preguntaIds,
        alternativas_ids: alternativasIds
      };
    }
  }

  const legacyIds = parsePreguntaIdsLegacy(pruebaRow);
  if (legacyIds && legacyIds.length > 0) {
    return {
      v: LAYOUT_VERSION,
      pregunta_ids: legacyIds,
      alternativas_ids: {}
    };
  }

  return null;
}

function buildLayoutPayload(preguntaIds, alternativasIdsPorPregunta) {
  const ids = (preguntaIds || [])
    .map((id) => parseInt(id, 10))
    .filter((n) => !Number.isNaN(n));
  return {
    v: LAYOUT_VERSION,
    pregunta_ids: ids,
    alternativas_ids: normalizarAlternativasIdsMap(alternativasIdsPorPregunta)
  };
}

function serializeLayoutForDb(layout) {
  return JSON.stringify(layout);
}

function serializePreguntaIdsLegacy(preguntaIds) {
  const ids = (preguntaIds || [])
    .map((id) => parseInt(id, 10))
    .filter((n) => !Number.isNaN(n));
  const serialized = phpSerialize.serialize(ids);
  return Buffer.from(serialized).toString('base64');
}

async function guardarLayoutEnPrueba(execute, pruebaId, layout) {
  const jsonStr = serializeLayoutForDb(layout);
  const legacyB64 = serializePreguntaIdsLegacy(layout.pregunta_ids);

  try {
    await execute(
      `UPDATE asignaturas_examenes_pruebas
       SET exam_layout_json = ?, preguntas = ?
       WHERE id = ?`,
      [jsonStr, legacyB64, pruebaId]
    );
    return true;
  } catch (err) {
    if (err && err.code === 'ER_BAD_FIELD_ERROR') {
      await execute(
        `UPDATE asignaturas_examenes_pruebas SET preguntas = ? WHERE id = ?`,
        [legacyB64, pruebaId]
      );
      return false;
    }
    throw err;
  }
}

module.exports = {
  LAYOUT_VERSION,
  parsePreguntaIdsLegacy,
  parseLayoutFromPruebaRow,
  buildLayoutPayload,
  serializeLayoutForDb,
  serializePreguntaIdsLegacy,
  guardarLayoutEnPrueba,
  normalizarAlternativasIdsMap
};
