/**
 * Crear/obtener impresión activa de un pago (boleta o nota mora).
 */
const { mysqlReadPool } = require('./mysql');
const { fechaMySQLLima } = require('./fechaHoraLima');

const tableColumnsCache = new Map();

function isSqlUnknownColumnError(e) {
  const code = e && e.code;
  const errno = e && e.errno;
  const msg = String((e && e.message) || '');
  return code === 'ER_BAD_FIELD_ERROR' || errno === 1054 || msg.includes('Unknown column');
}

async function getTableColumns(tableName, conn = null) {
  if (tableColumnsCache.has(tableName)) return tableColumnsCache.get(tableName);
  const sql = `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`;
  const run = conn ? (q, p) => conn.execute(q, p) : (q, p) => mysqlReadPool.execute(q, p);
  const [rows] = await run(sql, [tableName]);
  const cols = new Set((rows || []).map((r) => String(r.COLUMN_NAME || '')));
  tableColumnsCache.set(tableName, cols);
  return cols;
}

async function findActiveImpresion(pagoId, tipo, tipoDocumento) {
  const [rows] = await mysqlReadPool.execute(
    `SELECT id, impreso, fecha_impresion, serie, numero, pago_id, tipo, tipo_documento
     FROM impresiones
     WHERE pago_id = ? AND estado = 'ACTIVO' AND tipo = ? AND tipo_documento = ?
     ORDER BY id DESC
     LIMIT 1`,
    [pagoId, tipo, tipoDocumento]
  );
  return rows?.[0] || null;
}

async function ensurePagoImpresionActiva({ colegioId, pagoId, tipo, tipoDocumento }) {
  const conn = await mysqlReadPool.getConnection();
  try {
    await conn.beginTransaction();

    const [activeRows] = await conn.execute(
      `SELECT id, serie, numero, estado, impreso, fecha_impresion, pago_id, tipo_documento
       FROM impresiones
       WHERE pago_id = ? AND estado = 'ACTIVO' AND tipo = ? AND tipo_documento = ?
       ORDER BY id DESC
       LIMIT 1`,
      [pagoId, tipo, tipoDocumento]
    );
    if (activeRows?.length) {
      await conn.commit();
      return { ok: true, created: false, impresion: activeRows[0] };
    }

    const [pagoRows] = await conn.execute(
      `SELECT p.id, p.colegio_id, p.monto, p.mora, m.grupo_id, g.sede_id
       FROM pagos p
       INNER JOIN matriculas m ON m.id = p.matricula_id
       INNER JOIN grupos g ON g.id = m.grupo_id
       WHERE p.id = ? AND p.colegio_id = ?
       LIMIT 1`,
      [pagoId, colegioId]
    );
    if (!pagoRows?.length) {
      await conn.rollback();
      return { ok: false, status: 404, error: 'Pago no encontrado para generar impresión' };
    }
    const pago = pagoRows[0];

    if (tipo === 'PAGO' && Number(pago.monto || 0) <= 0) {
      await conn.rollback();
      return { ok: false, status: 400, error: 'El pago no tiene monto para generar boleta' };
    }
    if (tipo === 'MORA' && Number(pago.mora || 0) <= 0) {
      await conn.rollback();
      return { ok: false, status: 400, error: 'El pago no tiene mora para generar nota de débito' };
    }

    const [cfgRows] = await conn.execute(
      `SELECT id, serie, numero, serie_mora, numero_mora
       FROM boletas_configuracion
       WHERE sede_id = ?
       LIMIT 1`,
      [pago.sede_id]
    );
    if (!cfgRows?.length) {
      await conn.rollback();
      return { ok: false, status: 400, error: 'No existe configuración de boletas para la sede del alumno' };
    }
    const cfg = cfgRows[0];

    const useMoraSerie = tipo === 'MORA' && tipoDocumento === 'NOTA';
    const serieNum = useMoraSerie ? Number(cfg.serie_mora || 0) : Number(cfg.serie || 0);
    const numeroNum = useMoraSerie ? Number(cfg.numero_mora || 0) : Number(cfg.numero || 0);
    const nextField = useMoraSerie ? 'numero_mora' : 'numero';

    const cols = await getTableColumns('impresiones', conn);
    const today = fechaMySQLLima();
    const nowTime = new Date().toTimeString().slice(0, 8);

    const payload = {
      colegio_id: colegioId,
      tipo,
      tipo_documento: tipoDocumento,
      numero: String(numeroNum),
      serie: String(serieNum),
      estado: 'ACTIVO',
      impreso: 'NO',
      fecha_impresion: today,
      hora_impresion: nowTime,
      pago_id: pagoId,
      boleta_id: 0,
      enviado: 'NO',
      verificado: 'NO',
      fecha_anulado: '0000-00-00',
      numero_anulado: 0,
      json_generado: 'NO',
    };

    const insertCols = Object.keys(payload).filter((c) => cols.has(c));
    const insertVals = insertCols.map((c) => payload[c]);
    const placeholders = insertCols.map(() => '?').join(', ');
    await conn.execute(
      `INSERT INTO impresiones (${insertCols.join(', ')}) VALUES (${placeholders})`,
      insertVals
    );

    await conn.execute(
      `UPDATE boletas_configuracion SET ${nextField} = ${nextField} + 1 WHERE id = ?`,
      [cfg.id]
    );

    const [newRows] = await conn.execute(
      `SELECT id, serie, numero, estado, impreso, fecha_impresion, pago_id, tipo_documento
       FROM impresiones
       WHERE pago_id = ? AND estado = 'ACTIVO' AND tipo = ? AND tipo_documento = ?
       ORDER BY id DESC
       LIMIT 1`,
      [pagoId, tipo, tipoDocumento]
    );

    await conn.commit();
    return { ok: true, created: true, impresion: newRows?.[0] || null };
  } catch (e) {
    try {
      await conn.rollback();
    } catch {
      // ignore
    }
    return { ok: false, status: 500, error: e.message || 'No se pudo generar impresión' };
  } finally {
    conn.release();
  }
}

async function marcarImpresionComoImpresa(impresionId) {
  const today = fechaMySQLLima();
  try {
    await mysqlReadPool.execute(
      `UPDATE impresiones SET impreso = 'SI', fecha_impresion = ? WHERE id = ?`,
      [today, impresionId]
    );
  } catch (e) {
    if (!isSqlUnknownColumnError(e)) throw e;
    await mysqlReadPool.execute(`UPDATE impresiones SET impreso = 'SI' WHERE id = ?`, [impresionId]);
  }
}

function impresoPendiente(imp) {
  const v = String(imp?.impreso || '').toUpperCase();
  return !v || v === 'NO';
}

module.exports = {
  findActiveImpresion,
  ensurePagoImpresionActiva,
  marcarImpresionComoImpresa,
  impresoPendiente,
};
