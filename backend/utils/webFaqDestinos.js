/** Destinos de publicación de FAQs: menú Web y páginas de nivel. */

const DESTINOS = ['web', 'inicial', 'primaria', 'secundaria'];

function esDestino(v) {
  return DESTINOS.includes(String(v || '').trim().toLowerCase());
}

function uniqValid(list) {
  const out = [];
  for (const raw of list || []) {
    const s = String(raw || '').trim().toLowerCase();
    if (esDestino(s) && !out.includes(s)) out.push(s);
  }
  return out;
}

function parseJsonMaybe(raw) {
  if (raw == null) return null;
  if (Array.isArray(raw)) return raw;
  if (Buffer.isBuffer(raw)) {
    try {
      return JSON.parse(raw.toString('utf8'));
    } catch {
      return null;
    }
  }
  if (typeof raw === 'object') return raw;
  const s = String(raw).trim();
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/** Interpreta destinos nuevos o el valor legado pagina_nivel. */
function parseDestinos(raw, legado) {
  const parsed = parseJsonMaybe(raw);
  if (Array.isArray(parsed) && parsed.length) {
    const list = uniqValid(parsed);
    if (list.length) return list;
  }
  if (typeof raw === 'string' && raw.includes(',')) {
    const list = uniqValid(raw.split(','));
    if (list.length) return list;
  }
  const s = String(legado != null ? legado : raw || '')
    .trim()
    .toLowerCase();
  if (s === 'web') return ['web'];
  if (s === 'inicial' || s === 'primaria' || s === 'secundaria') return ['web', s];
  if (s === 'todos' || !s) return [...DESTINOS];
  if (esDestino(s)) return [s];
  return [...DESTINOS];
}

function destinosDesdeBody(body) {
  if (!body || typeof body !== 'object') return parseDestinos(null, 'todos');
  if (body.pagina_destinos != null) return parseDestinos(body.pagina_destinos, body.pagina_nivel);
  return parseDestinos(null, body.pagina_nivel);
}

function paginaNivelCompat(destinos) {
  const d = uniqValid(destinos);
  const niveles = d.filter((x) => x !== 'web');
  if (niveles.length === 3) return 'todos';
  if (niveles.length === 1) return niveles[0];
  if (d.length === 1 && d[0] === 'web') return 'web';
  if (d.length) return d.join(',');
  return 'todos';
}

function faqSinDestinos(e) {
  const msg = String(e?.message || '');
  return e && (e.code === 'ER_BAD_FIELD_ERROR' || msg.includes('pagina_destinos') || msg.includes('pagina_nivel'));
}

module.exports = {
  DESTINOS,
  parseDestinos,
  destinosDesdeBody,
  paginaNivelCompat,
  faqSinDestinos,
};
