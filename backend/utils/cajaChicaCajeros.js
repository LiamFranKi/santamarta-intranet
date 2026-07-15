/**
 * Cajero de Caja Chica: permiso aditivo sobre personal (no cambia usuarios.tipo).
 * Acceso: cuentas con privacy = 1 («Pública (cajero)»).
 */
const { query } = require('./mysql');
const { resolvePersonalId } = require('./tutoriaGeneral');

async function esCajeroCajaChicaActivo(personalId, colegioId) {
  const pid = parseInt(personalId, 10);
  const cid = parseInt(colegioId, 10);
  if (!pid || !cid) return false;
  try {
    const rows = await query(
      `SELECT 1 FROM caja_chica_cajeros
       WHERE colegio_id = ? AND personal_id = ? AND activo = 1
       LIMIT 1`,
      [cid, pid]
    );
    return rows.length > 0;
  } catch (e) {
    if (e.code === 'ER_NO_SUCH_TABLE') return false;
    throw e;
  }
}

/** Admin / secretaría / tipo CAJERO, o personal en la lista de cajeros. */
async function puedeUsarCajaChica(req) {
  const t = req.user?.tipo;
  if (t === 'ADMINISTRADOR' || t === 'SECRETARIA' || t === 'CAJERO') return true;
  const personalId = await resolvePersonalId(req);
  if (!personalId) return false;
  return esCajeroCajaChicaActivo(personalId, req.user.colegio_id);
}

module.exports = {
  resolvePersonalId,
  esCajeroCajaChicaActivo,
  puedeUsarCajaChica,
};
