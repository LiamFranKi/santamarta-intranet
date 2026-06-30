/**
 * Compras (boletas_ingresos + detalles) — serie/número manual, stock + al guardar.
 */
const { query, mysqlReadPool } = require('./mysql');
const { fechaMySQLLima } = require('./fechaHoraLima');

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

async function controlaStock(conn, conceptoId) {
  const [rows] = await conn.execute(
    `SELECT controlar_stock FROM boletas_conceptos WHERE id = ? LIMIT 1`,
    [conceptoId]
  );
  return rows?.[0] && String(rows[0].controlar_stock || '').toUpperCase() === 'SI';
}

async function revertirCompraStock(conn, ingresoId) {
  const [dets] = await conn.execute(
    `SELECT concepto_id, cantidad FROM boletas_ingresos_detalles WHERE boleta_ingreso_id = ?`,
    [ingresoId]
  );
  for (const d of dets || []) {
    if (await controlaStock(conn, d.concepto_id)) {
      await conn.execute(`UPDATE boletas_conceptos SET stock = stock - ? WHERE id = ?`, [
        parseFloat(d.cantidad) || 0,
        d.concepto_id,
      ]);
    }
  }
}

async function aplicarCompraStock(conn, detalles) {
  for (const d of detalles) {
    if (await controlaStock(conn, d.concepto_id)) {
      await conn.execute(`UPDATE boletas_conceptos SET stock = stock + ? WHERE id = ?`, [
        d.cantidad,
        d.concepto_id,
      ]);
    }
  }
}

async function listarCompras(colegioId, { desde, hasta } = {}) {
  const f1 = desde || fechaMySQLLima();
  const f2 = hasta || f1;
  return query(
    `SELECT i.id, i.descripcion, i.fecha, i.estado, i.tipo, i.serie, i.numero,
      (SELECT COALESCE(SUM(d.cantidad * d.precio), 0) FROM boletas_ingresos_detalles d WHERE d.boleta_ingreso_id = i.id) AS monto_total
     FROM boletas_ingresos i
     WHERE i.colegio_id = ? AND DATE(i.fecha) BETWEEN DATE(?) AND DATE(?)
     ORDER BY i.fecha DESC, i.id DESC`,
    [colegioId, f1, f2]
  );
}

async function obtenerCompra(colegioId, id) {
  const [row] = await query(`SELECT * FROM boletas_ingresos WHERE id = ? AND colegio_id = ?`, [id, colegioId]);
  if (!row) return null;
  const detalles = await query(
    `SELECT d.*, c.descripcion AS concepto_descripcion
     FROM boletas_ingresos_detalles d
     LEFT JOIN boletas_conceptos c ON c.id = d.concepto_id
     WHERE d.boleta_ingreso_id = ?`,
    [id]
  );
  return { ...row, detalles: detalles || [] };
}

async function guardarCompra(colegioId, body) {
  const id = body.id ? parseInt(body.id, 10) : null;
  const detalles = normalizarDetalles(body.detalles);
  if (!String(body.descripcion || '').trim()) {
    return { ok: false, status: 400, error: 'Descripción requerida' };
  }
  if (!detalles.length) return { ok: false, status: 400, error: 'Agregue al menos un producto' };

  const conn = await mysqlReadPool.getConnection();
  try {
    await conn.beginTransaction();
    const fecha = body.fecha ? String(body.fecha).slice(0, 10) : fechaMySQLLima();
    const tipo = String(body.tipo || 'BOLETA DE VENTA').trim();
    const serie = String(body.serie || '').trim();
    const numero = String(body.numero || '').trim();
    let ingresoId = id;

    if (!ingresoId) {
      const [ins] = await conn.execute(
        `INSERT INTO boletas_ingresos (colegio_id, descripcion, fecha, estado, tipo, serie, numero)
         VALUES (?, ?, ?, 'ACTIVO', ?, ?, ?)`,
        [colegioId, String(body.descripcion).trim(), fecha, tipo, serie, numero]
      );
      ingresoId = ins.insertId;
    } else {
      const [ex] = await conn.execute(`SELECT id FROM boletas_ingresos WHERE id = ? AND colegio_id = ?`, [
        ingresoId,
        colegioId,
      ]);
      if (!ex?.length) {
        await conn.rollback();
        return { ok: false, status: 404, error: 'Compra no encontrada' };
      }
      await revertirCompraStock(conn, ingresoId);
      await conn.execute(`DELETE FROM boletas_ingresos_detalles WHERE boleta_ingreso_id = ?`, [ingresoId]);
      await conn.execute(
        `UPDATE boletas_ingresos SET descripcion = ?, fecha = ?, tipo = ?, serie = ?, numero = ? WHERE id = ?`,
        [String(body.descripcion).trim(), fecha, tipo, serie, numero, ingresoId]
      );
    }

    for (const d of detalles) {
      await conn.execute(
        `INSERT INTO boletas_ingresos_detalles (colegio_id, boleta_ingreso_id, concepto_id, categoria_id, cantidad, precio)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [colegioId, ingresoId, d.concepto_id, d.categoria_id, d.cantidad, d.precio]
      );
    }
    await aplicarCompraStock(conn, detalles);

    await conn.commit();
    return { ok: true, id: ingresoId };
  } catch (e) {
    await conn.rollback();
    return { ok: false, status: 500, error: e.message || 'Error al guardar compra' };
  } finally {
    conn.release();
  }
}

async function eliminarCompra(colegioId, id) {
  const conn = await mysqlReadPool.getConnection();
  try {
    await conn.beginTransaction();
    const [ex] = await conn.execute(`SELECT id FROM boletas_ingresos WHERE id = ? AND colegio_id = ?`, [
      id,
      colegioId,
    ]);
    if (!ex?.length) {
      await conn.rollback();
      return { ok: false, status: 404, error: 'Compra no encontrada' };
    }
    await revertirCompraStock(conn, id);
    await conn.execute(`DELETE FROM boletas_ingresos_detalles WHERE boleta_ingreso_id = ?`, [id]);
    await conn.execute(`DELETE FROM boletas_ingresos WHERE id = ?`, [id]);
    await conn.commit();
    return { ok: true };
  } catch (e) {
    await conn.rollback();
    return { ok: false, status: 500, error: e.message || 'Error al eliminar' };
  } finally {
    conn.release();
  }
}

module.exports = {
  listarCompras,
  obtenerCompra,
  guardarCompra,
  eliminarCompra,
};
