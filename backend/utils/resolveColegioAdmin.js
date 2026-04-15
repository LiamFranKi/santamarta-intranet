const { query } = require('./mysql');

/**
 * Colegio efectivo para operaciones admin: query/body `colegio_id` si existe en BD; si no, el del JWT.
 */
async function resolveColegioIdAdmin(req, requested) {
  const tokenColegio = Number(req.user?.colegio_id);
  const rid = requested != null && String(requested).trim() !== '' ? parseInt(requested, 10) : NaN;
  if (Number.isFinite(rid) && rid > 0) {
    const rows = await query('SELECT id FROM colegios WHERE id = ? LIMIT 1', [rid]);
    if (rows.length) return rid;
  }
  return Number.isFinite(tokenColegio) && tokenColegio > 0 ? tokenColegio : null;
}

module.exports = { resolveColegioIdAdmin };
