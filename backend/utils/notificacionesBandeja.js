/**
 * Bandeja de campanita: SELECT cortos + cache para no repetir el scan de TODOS
 * en cada pestaña abierta.
 */
const SELECT_BANDEJA = `n.id,
         n.asunto as titulo,
         n.contenido as mensaje,
         n.fecha_hora,
         n.estado,
         COALESCE(n.leida, 0) as leida,
         n.accion_tipo,
         n.accion_payload,
         n.url_destino,
         n.destinatario_id,
         'NOTIFICACION' as tipo_origen`;

const TODOS_TTL_MS = 60 * 1000;
const USER_TTL_MS = 20 * 1000;
let todosCache = { rows: null, expires: 0, inflight: null };
const userCache = new Map();

function ordenarBandeja(rows) {
  const seen = new Set();
  const merged = [];
  for (const row of rows || []) {
    const id = Number(row.id);
    if (!Number.isFinite(id) || seen.has(id)) continue;
    seen.add(id);
    merged.push(row);
  }
  merged.sort((a, b) => {
    const ta = new Date(a.fecha_hora).getTime() || 0;
    const tb = new Date(b.fecha_hora).getTime() || 0;
    if (tb !== ta) return tb - ta;
    return (Number(b.id) || 0) - (Number(a.id) || 0);
  });
  return merged.slice(0, 30);
}

async function fetchTodos(query) {
  const now = Date.now();
  if (todosCache.rows && now < todosCache.expires) return todosCache.rows;
  if (todosCache.inflight) return todosCache.inflight;
  todosCache.inflight = query(
    `SELECT ${SELECT_BANDEJA}
     FROM notificaciones n
     WHERE n.para = 'TODOS'
     ORDER BY n.id DESC
     LIMIT 30`
  )
    .then((rows) => {
      todosCache.rows = rows || [];
      todosCache.expires = Date.now() + TODOS_TTL_MS;
      return todosCache.rows;
    })
    .catch((err) => {
      console.warn('⚠️ [CAMPANITA] Avisos generales omitidos:', err.message);
      return todosCache.rows || [];
    })
    .finally(() => {
      todosCache.inflight = null;
    });
  return todosCache.inflight;
}

async function fetchNotificacionesBandeja(query, destinatarioIds) {
  const ids = [
    ...new Set(
      (Array.isArray(destinatarioIds) ? destinatarioIds : [destinatarioIds])
        .map((id) => parseInt(id, 10))
        .filter((n) => Number.isFinite(n) && n > 0)
    )
  ];
  const cacheKey = ids.slice().sort((a, b) => a - b).join(',') || '0';
  const now = Date.now();
  const cached = userCache.get(cacheKey);
  if (cached && now < cached.expires) return cached.rows;
  if (cached && cached.inflight) return cached.inflight;

  const slot = { rows: cached?.rows, expires: cached?.expires || 0, inflight: null };
  slot.inflight = (async () => {
    try {
      let propias = [];
      if (ids.length) {
        const ph = ids.map(() => '?').join(',');
        propias = await query(
          `SELECT ${SELECT_BANDEJA}
           FROM notificaciones n
           WHERE n.para = 'USUARIO' AND n.destinatario_id IN (${ph})
           ORDER BY n.id DESC
           LIMIT 30`,
          ids
        );
      }
      const todos = await fetchTodos(query);
      const rows = ordenarBandeja([...(propias || []), ...(todos || [])]);
      slot.rows = rows;
      slot.expires = Date.now() + USER_TTL_MS;
      return rows;
    } catch (err) {
      console.warn('⚠️ [CAMPANITA] Bandeja omitida:', err.message);
      return slot.rows || [];
    } finally {
      slot.inflight = null;
    }
  })();
  userCache.set(cacheKey, slot);
  if (userCache.size > 4000) {
    for (const [k, v] of userCache) {
      if (!v.inflight && Date.now() > v.expires) userCache.delete(k);
    }
  }
  return slot.inflight;
}

function invalidarBandejaUsuarios(ids) {
  const set = new Set(
    (Array.isArray(ids) ? ids : [ids])
      .map((id) => parseInt(id, 10))
      .filter((n) => Number.isFinite(n) && n > 0)
  );
  if (!set.size) return;
  for (const key of userCache.keys()) {
    const parts = String(key).split(',').map((n) => parseInt(n, 10));
    if (parts.some((id) => set.has(id))) userCache.delete(key);
  }
}

module.exports = { fetchNotificacionesBandeja, invalidarBandejaUsuarios };
