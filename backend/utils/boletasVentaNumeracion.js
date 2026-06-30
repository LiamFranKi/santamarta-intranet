/**
 * Numeración de ventas (tabla boletas) desde boletas_configuracion por sede.
 * Legacy: boletas/index.php save + get_current_numero + imprimir.
 *
 * Serie 1 → numero   (ventas)
 * Serie 2 → numero_2 (talleres)
 * Serie 3 → numero_3 (transferencias gratuitas)
 */
const { mysqlReadPool } = require('./mysql');

const SERIE_MAP = {
  1: { serieField: 'serie', numeroField: 'numero' },
  2: { serieField: 'serie_2', numeroField: 'numero_2' },
  3: { serieField: 'serie_3', numeroField: 'numero_3' },
};

function serieValida(serie) {
  const s = parseInt(serie, 10);
  return SERIE_MAP[s] ? s : null;
}

function padSerie(v, zeros = 3) {
  return String(v || '0').padStart(zeros, '0');
}

function padNumero(v, zeros = 8) {
  return String(v || '0').padStart(zeros, '0');
}

async function getBoletaConfigPorSede(sedeId, conn = null) {
  const run = conn ? (sql, p) => conn.execute(sql, p) : (sql, p) => mysqlReadPool.execute(sql, p);
  const [rows] = await run(
    `SELECT id, sede_id, serie, numero, serie_2, numero_2, serie_3, numero_3,
            serie_mora, numero_mora
     FROM boletas_configuracion WHERE sede_id = ? LIMIT 1`,
    [sedeId]
  );
  return rows?.[0] || null;
}

function leerContador(cfg, serie) {
  const map = SERIE_MAP[serie];
  if (!cfg || !map) return { serieVal: 0, numeroVal: 0 };
  return {
    serieVal: parseInt(cfg[map.serieField] || 0, 10),
    numeroVal: parseInt(cfg[map.numeroField] || 0, 10),
  };
}

/** Siguiente número disponible (sin incrementar) — legacy get_current_numero */
async function obtenerSiguienteNumero(sedeId, serie) {
  const s = serieValida(serie);
  if (!s) return { ok: false, status: 400, error: 'Serie inválida (use 1, 2 o 3).' };
  const cfg = await getBoletaConfigPorSede(sedeId);
  if (!cfg) {
    return { ok: false, status: 400, error: 'No existe configuración de boletas para la sede seleccionada.' };
  }
  const { serieVal, numeroVal } = leerContador(cfg, s);
  return {
    ok: true,
    sede_id: sedeId,
    serie: s,
    serie_display: padSerie(serieVal),
    numero: numeroVal,
    numero_display: padNumero(numeroVal),
    nro_boleta: `${padSerie(serieVal)}-${padNumero(numeroVal)}`,
  };
}

/**
 * Incrementa contador al guardar venta nueva — legacy save() is_new_record.
 * @param {import('mysql2/promise').PoolConnection} conn
 */
async function incrementarContadorVenta(conn, sedeId, serie) {
  const s = serieValida(serie);
  if (!s) throw new Error('Serie inválida');
  const map = SERIE_MAP[s];
  const [rows] = await conn.execute(
    `SELECT id FROM boletas_configuracion WHERE sede_id = ? LIMIT 1 FOR UPDATE`,
    [sedeId]
  );
  if (!rows?.length) throw new Error('Configuración de boletas no encontrada');
  await conn.execute(
    `UPDATE boletas_configuracion SET ${map.numeroField} = ${map.numeroField} + 1 WHERE id = ?`,
    [rows[0].id]
  );
}

/**
 * Asigna serie/numero al imprimir si boleta.numero == 0.
 * Usa el contador de la serie indicada en la boleta (1→numero, 2→numero_2, 3→numero_3).
 */
async function asignarNumeroSiPendiente(conn, boletaId, sedeId) {
  const [rows] = await conn.execute(
    `SELECT id, numero, serie, sede_id FROM boletas WHERE id = ? FOR UPDATE`,
    [boletaId]
  );
  if (!rows?.length) return null;
  const b = rows[0];
  if (parseInt(b.numero, 10) !== 0) return b;

  const cfg = await getBoletaConfigPorSede(sedeId, conn);
  if (!cfg) throw new Error('Sin configuración de boletas');

  let serieIdx = 1;
  const boletaSerie = parseInt(b.serie, 10);
  if (boletaSerie === parseInt(cfg.serie_2, 10)) serieIdx = 2;
  else if (boletaSerie === parseInt(cfg.serie_3, 10)) serieIdx = 3;
  else if (boletaSerie === 2 || boletaSerie === 3) serieIdx = boletaSerie;

  const { serieVal, numeroVal } = leerContador(cfg, serieIdx);

  await conn.execute(`UPDATE boletas SET serie = ?, numero = ? WHERE id = ?`, [serieVal, numeroVal, boletaId]);
  const map = SERIE_MAP[serieIdx];
  await conn.execute(`UPDATE boletas_configuracion SET ${map.numeroField} = ${map.numeroField} + 1 WHERE id = ?`, [cfg.id]);
  return { serie: serieVal, numero: numeroVal };
}

module.exports = {
  SERIE_MAP,
  serieValida,
  padSerie,
  padNumero,
  getBoletaConfigPorSede,
  obtenerSiguienteNumero,
  incrementarContadorVenta,
  asignarNumeroSiPendiente,
  leerContador,
};
