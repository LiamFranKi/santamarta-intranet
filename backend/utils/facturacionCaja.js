/**
 * Caja chica — cash_accounts + cash_account_flows (legacy cash_accounts).
 */
const { query, execute, mysqlReadPool } = require('./mysql');
const { fechaMySQLLima, horaMySQLLima } = require('./fechaHoraLima');

async function listarCuentas(esAdmin) {
  if (esAdmin) {
    return query(
      `SELECT a.id, a.name, a.description, a.privacy, a.cash_currency_id, a.cash_account_type_id,
        c.name AS currency_name, t.name AS type_name
       FROM cash_accounts a
       LEFT JOIN cash_currencies c ON c.id = a.cash_currency_id
       LEFT JOIN cash_account_types t ON t.id = a.cash_account_type_id
       ORDER BY a.name`
    );
  }
  return query(
    `SELECT a.id, a.name, a.description, a.privacy, a.cash_currency_id, a.cash_account_type_id,
      c.name AS currency_name, t.name AS type_name
     FROM cash_accounts a
     LEFT JOIN cash_currencies c ON c.id = a.cash_currency_id
     LEFT JOIN cash_account_types t ON t.id = a.cash_account_type_id
     WHERE a.privacy = 1
     ORDER BY a.name`
  );
}

async function guardarCuenta(body, id = null) {
  const name = String(body.name || '').trim();
  if (!name) return { ok: false, status: 400, error: 'Nombre requerido' };
  const payload = [
    name,
    String(body.description || '').trim(),
    parseInt(body.cash_currency_id, 10) || null,
    parseInt(body.cash_account_type_id, 10) || null,
    parseInt(body.privacy, 10) === 1 ? 1 : 0,
  ];
  if (id) {
    const r = await execute(
      `UPDATE cash_accounts SET name = ?, description = ?, cash_currency_id = ?, cash_account_type_id = ?, privacy = ? WHERE id = ?`,
      [...payload, id]
    );
    if (!r.affectedRows) return { ok: false, status: 404, error: 'Cuenta no encontrada' };
    return { ok: true, id };
  }
  const r = await execute(
    `INSERT INTO cash_accounts (name, description, cash_currency_id, cash_account_type_id, privacy) VALUES (?, ?, ?, ?, ?)`,
    payload
  );
  return { ok: true, id: r.insertId };
}

async function eliminarCuenta(id) {
  const flows = await query(`SELECT COUNT(*) AS n FROM cash_account_flows WHERE cash_account_id = ?`, [id]);
  if (parseInt(flows?.[0]?.n, 10) > 0) {
    return { ok: false, status: 400, error: 'No se puede eliminar: tiene movimientos.' };
  }
  const r = await execute(`DELETE FROM cash_accounts WHERE id = ?`, [id]);
  if (!r.affectedRows) return { ok: false, status: 404, error: 'Cuenta no encontrada' };
  return { ok: true };
}

async function listarMovimientos(cuentaId) {
  return query(
    `SELECT id, cash_account_id, description, entry, date, time, type, amount
     FROM cash_account_flows WHERE cash_account_id = ?
     ORDER BY date DESC, time DESC, id DESC`,
    [cuentaId]
  );
}

async function guardarMovimiento(body, id = null) {
  const cuentaId = parseInt(body.cash_account_id, 10);
  const amount = parseFloat(body.amount);
  if (!Number.isFinite(cuentaId)) return { ok: false, status: 400, error: 'Cuenta requerida' };
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, status: 400, error: 'Monto inválido' };

  const payload = [
    String(body.description || '').trim(),
    String(body.entry || '').trim(),
    body.date ? String(body.date).slice(0, 10) : fechaMySQLLima(),
    body.time ? String(body.time).slice(0, 8) : horaMySQLLima(),
    String(body.type || 'INGRESO').toUpperCase(),
    amount,
    cuentaId,
  ];

  if (id) {
    const r = await execute(
      `UPDATE cash_account_flows SET description = ?, entry = ?, date = ?, time = ?, type = ?, amount = ?, cash_account_id = ?
       WHERE id = ?`,
      [...payload, id]
    );
    if (!r.affectedRows) return { ok: false, status: 404, error: 'Movimiento no encontrado' };
    return { ok: true, id };
  }
  const r = await execute(
    `INSERT INTO cash_account_flows (description, entry, date, time, type, amount, cash_account_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    payload
  );
  return { ok: true, id: r.insertId };
}

async function eliminarMovimiento(id) {
  const r = await execute(`DELETE FROM cash_account_flows WHERE id = ?`, [id]);
  if (!r.affectedRows) return { ok: false, status: 404, error: 'Movimiento no encontrado' };
  return { ok: true };
}

async function metaCaja() {
  const [currencies, types] = await Promise.all([
    query(`SELECT id, name FROM cash_currencies ORDER BY name`).catch(() => []),
    query(`SELECT id, name FROM cash_account_types ORDER BY name`).catch(() => []),
  ]);
  return { currencies: currencies || [], types: types || [] };
}

module.exports = {
  listarCuentas,
  guardarCuenta,
  eliminarCuenta,
  listarMovimientos,
  guardarMovimiento,
  eliminarMovimiento,
  metaCaja,
};
