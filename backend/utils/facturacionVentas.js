/**
 * Ventas (tabla boletas + boletas_detalles) con numeración y stock.
 */
const { query, mysqlReadPool } = require('./mysql');
const { fechaMySQLLima } = require('./fechaHoraLima');
const { incrementarContadorVenta, asignarNumeroSiPendiente, padSerie, padNumero, getBoletaConfigPorSede, leerContador } = require('./boletasVentaNumeracion');

async function controlaStock(conn, conceptoId) {
  const [rows] = await conn.execute(
    `SELECT controlar_stock FROM boletas_conceptos WHERE id = ? LIMIT 1`,
    [conceptoId]
  );
  return rows?.[0] && String(rows[0].controlar_stock || '').toUpperCase() === 'SI';
}

async function ajustarStock(conn, conceptoId, delta) {
  if (!(await controlaStock(conn, conceptoId))) return;
  await conn.execute(`UPDATE boletas_conceptos SET stock = stock + ? WHERE id = ?`, [delta, conceptoId]);
}

async function revertirStockDetalles(conn, boletaId) {
  const [dets] = await conn.execute(
    `SELECT concepto_id, cantidad FROM boletas_detalles WHERE boleta_id = ?`,
    [boletaId]
  );
  for (const d of dets || []) {
    await ajustarStock(conn, d.concepto_id, parseFloat(d.cantidad) || 0);
  }
}

async function aplicarStockDetalles(conn, detalles, direction = -1) {
  for (const d of detalles) {
    const qty = parseFloat(d.cantidad) || 0;
    if (qty <= 0) continue;
    await ajustarStock(conn, d.concepto_id, direction * qty);
  }
}

function normalizarDetalles(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((d) => ({
      concepto_id: parseInt(d.concepto_id, 10),
      categoria_id: parseInt(d.categoria_id, 10),
      cantidad: parseFloat(d.cantidad) || 0,
      precio: parseFloat(d.precio) || 0,
    }))
    .filter((d) => Number.isFinite(d.concepto_id) && d.cantidad > 0);
}

async function listarVentas(colegioId, { fecha1, fecha2, estado = 'ACTIVO' } = {}) {
  const f1 = fecha1 || fechaMySQLLima();
  const f2 = fecha2 || f1;
  const rows = await query(
    `SELECT b.id, b.sede_id, b.serie, b.numero, b.dni, b.nombre, b.fecha, b.estado, b.estado_pago,
      b.tipo, b.tipo_documento, b.impreso, b.transferencia_gratuita, b.entry,
      s.nombre AS sede_nombre,
      (SELECT COALESCE(SUM(d.cantidad * d.precio), 0) FROM boletas_detalles d WHERE d.boleta_id = b.id) AS monto_detalles
     FROM boletas b
     LEFT JOIN sedes s ON s.id = b.sede_id
     WHERE b.colegio_id = ? AND b.estado = ? AND DATE(b.fecha) BETWEEN DATE(?) AND DATE(?)
     ORDER BY b.fecha DESC, b.id DESC`,
    [colegioId, estado, f1, f2]
  );
  return (rows || []).map((r) => ({
    ...r,
    nro_boleta:
      parseInt(r.numero, 10) > 0
        ? `${padSerie(r.serie)}-${padNumero(r.numero)}`
        : 'PENDIENTE',
    monto_total: parseFloat(r.monto_detalles) || 0,
  }));
}

async function obtenerVenta(colegioId, id) {
  const [venta] = await query(
    `SELECT b.*, s.nombre AS sede_nombre FROM boletas b
     LEFT JOIN sedes s ON s.id = b.sede_id
     WHERE b.id = ? AND b.colegio_id = ? LIMIT 1`,
    [id, colegioId]
  );
  if (!venta) return null;
  const detalles = await query(
    `SELECT d.*, c.descripcion AS concepto_descripcion
     FROM boletas_detalles d
     LEFT JOIN boletas_conceptos c ON c.id = d.concepto_id
     WHERE d.boleta_id = ?`,
    [id]
  );
  return {
    ...venta,
    nro_boleta:
      parseInt(venta.numero, 10) > 0
        ? `${padSerie(venta.serie)}-${padNumero(venta.numero)}`
        : 'PENDIENTE',
    detalles: detalles || [],
  };
}

async function guardarVenta(colegioId, body, user) {
  const id = body.id ? parseInt(body.id, 10) : null;
  const sedeId = parseInt(body.sede_id, 10);
  const serie = parseInt(body.serie, 10) || 1;
  const detalles = normalizarDetalles(body.detalles);
  if (!Number.isFinite(sedeId)) return { ok: false, status: 400, error: 'Seleccione sede' };
  if (!detalles.length) return { ok: false, status: 400, error: 'Agregue al menos un producto' };

  const conn = await mysqlReadPool.getConnection();
  try {
    await conn.beginTransaction();

    const payload = {
      nombre: String(body.nombre || '').trim(),
      dni: String(body.dni || '').trim(),
      fecha: body.fecha ? String(body.fecha).slice(0, 10) : fechaMySQLLima(),
      serie,
      numero: parseInt(body.numero, 10) || 0,
      tipo: String(body.tipo || 'EXTERNO').toUpperCase(),
      estado_pago: String(body.estado_pago || 'PENDIENTE').toUpperCase(),
      tipo_documento: String(body.tipo_documento || 'BOLETA').toUpperCase(),
      transferencia_gratuita: String(body.transferencia_gratuita || 'NO').toUpperCase() === 'SI' ? 'SI' : 'NO',
      entry: String(body.entry || '').trim(),
      comision_tarjeta: parseFloat(body.comision_tarjeta) || 0,
    };

    if (payload.estado_pago === 'CANCELADO') {
      payload.fecha_pago = body.fecha_pago ? String(body.fecha_pago).slice(0, 10) : fechaMySQLLima();
    }

    const cfg = await getBoletaConfigPorSede(sedeId, conn);
    if (!cfg) {
      await conn.rollback();
      return { ok: false, status: 400, error: 'No existe configuración de boletas para la sede.' };
    }
    const contador = leerContador(cfg, serie);
    payload.serie = contador.serieVal;

    let boletaId = id;

    if (!boletaId) {
      payload.numero = contador.numeroVal;
      await incrementarContadorVenta(conn, sedeId, serie);
      const [ins] = await conn.execute(
        `INSERT INTO boletas (
          colegio_id, sede_id, nombre, fecha, serie, numero, dni, tipo, estado_pago, tipo_documento,
          transferencia_gratuita, entry, comision_tarjeta, estado, impreso, fecha_pago
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVO', 'NO', ?)`,
        [
          colegioId,
          sedeId,
          payload.nombre,
          payload.fecha,
          payload.serie,
          payload.numero,
          payload.dni,
          payload.tipo,
          payload.estado_pago,
          payload.tipo_documento,
          payload.transferencia_gratuita,
          payload.entry,
          payload.comision_tarjeta,
          payload.estado_pago === 'CANCELADO' ? payload.fecha_pago : null,
        ]
      );
      boletaId = ins.insertId;
    } else {
      const [ex] = await conn.execute(`SELECT id, estado FROM boletas WHERE id = ? AND colegio_id = ?`, [
        boletaId,
        colegioId,
      ]);
      if (!ex?.length) {
        await conn.rollback();
        return { ok: false, status: 404, error: 'Venta no encontrada' };
      }
      await revertirStockDetalles(conn, boletaId);
      await conn.execute(`DELETE FROM boletas_detalles WHERE boleta_id = ?`, [boletaId]);
      await conn.execute(
        `UPDATE boletas SET sede_id = ?, nombre = ?, fecha = ?, serie = ?, numero = ?, dni = ?, tipo = ?,
          estado_pago = ?, tipo_documento = ?, transferencia_gratuita = ?, entry = ?, comision_tarjeta = ?,
          fecha_pago = ?
         WHERE id = ? AND colegio_id = ?`,
        [
          sedeId,
          payload.nombre,
          payload.fecha,
          payload.serie,
          payload.numero,
          payload.dni,
          payload.tipo,
          payload.estado_pago,
          payload.tipo_documento,
          payload.transferencia_gratuita,
          payload.entry,
          payload.comision_tarjeta,
          payload.estado_pago === 'CANCELADO' ? payload.fecha_pago : null,
          boletaId,
          colegioId,
        ]
      );
    }

    for (const d of detalles) {
      await conn.execute(
        `INSERT INTO boletas_detalles (colegio_id, boleta_id, concepto_id, categoria_id, cantidad, precio)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [colegioId, boletaId, d.concepto_id, d.categoria_id, d.cantidad, d.precio]
      );
    }
    await aplicarStockDetalles(conn, detalles, -1);

    await conn.commit();
    return { ok: true, id: boletaId };
  } catch (e) {
    await conn.rollback();
    return { ok: false, status: 500, error: e.message || 'Error al guardar venta' };
  } finally {
    conn.release();
  }
}

async function toggleEstadoVenta(colegioId, id) {
  const conn = await mysqlReadPool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute(`SELECT id, estado FROM boletas WHERE id = ? AND colegio_id = ?`, [
      id,
      colegioId,
    ]);
    if (!rows?.length) {
      await conn.rollback();
      return { ok: false, status: 404, error: 'Venta no encontrada' };
    }
    const actual = String(rows[0].estado || '').toUpperCase();
    const nuevo = actual === 'ACTIVO' ? 'ANULADO' : 'ACTIVO';
    if (actual === 'ACTIVO') await revertirStockDetalles(conn, id);
    else {
      const [dets] = await conn.execute(
        `SELECT concepto_id, cantidad FROM boletas_detalles WHERE boleta_id = ?`,
        [id]
      );
      await aplicarStockDetalles(conn, dets || [], -1);
    }
    await conn.execute(`UPDATE boletas SET estado = ? WHERE id = ?`, [nuevo, id]);
    await conn.commit();
    return { ok: true, estado: nuevo };
  } catch (e) {
    await conn.rollback();
    return { ok: false, status: 500, error: e.message || 'Error al cambiar estado' };
  } finally {
    conn.release();
  }
}

async function marcarImpresa(colegioId, id) {
  const conn = await mysqlReadPool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute(`SELECT id, sede_id, numero FROM boletas WHERE id = ? AND colegio_id = ?`, [
      id,
      colegioId,
    ]);
    if (!rows?.length) {
      await conn.rollback();
      return { ok: false, status: 404, error: 'Venta no encontrada' };
    }
    const b = rows[0];
    if (parseInt(b.numero, 10) === 0) {
      await asignarNumeroSiPendiente(conn, id, b.sede_id);
    }
    await conn.execute(`UPDATE boletas SET impreso = 'SI' WHERE id = ?`, [id]);
    await conn.commit();
    const venta = await obtenerVenta(colegioId, id);
    return { ok: true, venta };
  } catch (e) {
    await conn.rollback();
    return { ok: false, status: 500, error: e.message || 'Error al marcar impresión' };
  } finally {
    conn.release();
  }
}

module.exports = {
  listarVentas,
  obtenerVenta,
  guardarVenta,
  toggleEstadoVenta,
  marcarImpresa,
};
