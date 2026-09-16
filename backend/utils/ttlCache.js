/**
 * Cache corto + singleflight: si 20 pestañas piden lo mismo, solo 1 consulta a MySQL.
 */
function memoKeyed(ttlMs) {
  const slots = new Map();

  async function run(key, producer) {
    const now = Date.now();
    const slot = slots.get(key);
    if (slot && slot.data !== undefined && now < slot.expires) {
      return slot.data;
    }
    if (slot && slot.inflight) return slot.inflight;
    const next = { data: slot?.data, expires: slot?.expires || 0, inflight: null };
    next.inflight = Promise.resolve()
      .then(producer)
      .then((data) => {
        next.data = data;
        next.expires = Date.now() + ttlMs;
        return data;
      })
      .finally(() => {
        next.inflight = null;
      });
    slots.set(key, next);
    return next.inflight;
  }

  return { run };
}

function withTimeout(promise, ms, label) {
  let t;
  const timeout = new Promise((_, reject) => {
    t = setTimeout(() => reject(new Error(label || `timeout ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
}

module.exports = { memoKeyed, withTimeout };
