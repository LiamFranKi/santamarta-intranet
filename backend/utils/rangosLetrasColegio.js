const phpSerialize = require('php-serialize');

const RANGOS_LETRAS_DEFAULT = [
  { rango: '19-20', letra: 'AD' },
  { rango: '13-18', letra: 'A' },
  { rango: '11-12', letra: 'B' },
  { rango: '0-10', letra: 'C' },
];

function normalizarRangosArray(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'object') return Object.values(raw);
  return [];
}

/**
 * Deserializa colegios.rangos_letras_primaria (base64 + PHP serialize).
 * @param {string|Buffer|null} valorRaw
 * @returns {Array<{rango:string, letra:string}>}
 */
function deserializarRangosLetrasPrimaria(valorRaw) {
  if (!valorRaw || valorRaw === '') return [];
  try {
    const base64String = typeof valorRaw === 'string' ? valorRaw : String(valorRaw);
    const buffer = Buffer.from(base64String, 'base64');
    const deserialized = phpSerialize.unserialize(buffer);
    return normalizarRangosArray(deserialized).filter((r) => r && (r.rango || r.letra));
  } catch (_e) {
    return [];
  }
}

/**
 * @param {import('../utils/mysql').query} queryFn
 * @param {number} colegio_id
 */
async function obtenerRangosLetrasColegio(queryFn, colegio_id) {
  const rows = await queryFn(`SELECT rangos_letras_primaria FROM colegios WHERE id = ? LIMIT 1`, [
    colegio_id,
  ]);
  const parsed = deserializarRangosLetrasPrimaria(rows[0]?.rangos_letras_primaria);
  return parsed.length ? parsed : [...RANGOS_LETRAS_DEFAULT];
}

module.exports = {
  RANGOS_LETRAS_DEFAULT,
  deserializarRangosLetrasPrimaria,
  obtenerRangosLetrasColegio,
};
