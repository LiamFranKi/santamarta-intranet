/**
 * Inserción de filas `pagos` en PENDIENTE (legado), compartida por inscripción y recuperación al reactivar matrícula.
 */
const { query } = require('./mysql');

const FECHA_HORA_PENDIENTE_DB = '1970-01-01 00:00:00';
const FECHA_CANCELADO_PENDIENTE_DB = '1970-01-01';

async function resolverPersonalIdPago(colegio_id, reqUser) {
  let personal_id = reqUser.personal_id && Number(reqUser.personal_id) > 0 ? Number(reqUser.personal_id) : null;
  if (personal_id) {
    const pr = await query('SELECT id FROM personal WHERE id = ? AND colegio_id = ? LIMIT 1', [personal_id, colegio_id]);
    if (!pr.length) personal_id = null;
  }
  if (!personal_id) {
    const pr2 = await query('SELECT id FROM personal WHERE colegio_id = ? ORDER BY id ASC LIMIT 1', [colegio_id]);
    personal_id = pr2[0]?.id || null;
  }
  return personal_id;
}

async function insertPagoPendienteConn(conn, {
  colegio_id,
  matriculaId,
  nro_pago,
  tipo,
  monto,
  descripcion,
  personal_id,
  withObservaciones,
}) {
  const cols = [
    'colegio_id',
    'matricula_id',
    'nro_pago',
    'monto',
    'mora',
    'fecha_hora',
    'tipo',
    'descripcion',
    ...(withObservaciones ? ['observaciones'] : []),
    'estado_pago',
    'fecha_cancelado',
    'forma_pago',
    'tipo_tarjeta',
    'lugar_pago',
    'comision_tarjeta',
    'personal_id',
    'estado',
  ];
  const useNowFechaMatricula = Number(tipo) === 0;
  const placeholders = cols
    .map((c) => (c === 'fecha_hora' && useNowFechaMatricula ? 'NOW()' : '?'))
    .join(', ');
  const vals = [
    colegio_id,
    matriculaId,
    nro_pago,
    monto,
    0,
    ...(useNowFechaMatricula ? [] : [FECHA_HORA_PENDIENTE_DB]),
    tipo,
    descripcion,
    ...(withObservaciones ? [''] : []),
    'PENDIENTE',
    FECHA_CANCELADO_PENDIENTE_DB,
    'EFECTIVO',
    '',
    'CAJA',
    0,
    personal_id,
    'ACTIVO',
  ];
  await conn.execute(`INSERT INTO pagos (${cols.join(', ')}) VALUES (${placeholders})`, vals);
}

/**
 * Tras borrar pendientes (p. ej. retiro) o matrícula nueva sin líneas: crea meses y opcional línea de matrícula
 * sin duplicar filas ACTIVO existentes (cobrado o pendiente).
 */
async function ensurePagosPendientesMatriculaConn(conn, {
  colegio_id,
  matriculaId,
  totalPensiones,
  montoPension,
  montoMatricula,
  personal_id,
  registrarLineaPagoMatricula = true,
}) {
  if (!personal_id || !Number.isFinite(montoPension) || montoPension <= 0) {
    return;
  }
  const tp = Math.max(1, Math.min(24, parseInt(totalPensiones, 10) || 10));

  let withObs = true;
  const insertPensionMes = async (mes) => {
    try {
      await insertPagoPendienteConn(conn, {
        colegio_id,
        matriculaId,
        nro_pago: mes,
        tipo: 1,
        monto: montoPension,
        descripcion: '',
        personal_id,
        withObservaciones: withObs,
      });
    } catch (e) {
      if (withObs) {
        withObs = false;
        await insertPagoPendienteConn(conn, {
          colegio_id,
          matriculaId,
          nro_pago: mes,
          tipo: 1,
          monto: montoPension,
          descripcion: '',
          personal_id,
          withObservaciones: false,
        });
      } else {
        throw e;
      }
    }
  };

  for (let mes = 1; mes <= tp; mes += 1) {
    const [ex] = await conn.execute(
      `SELECT id FROM pagos WHERE matricula_id = ? AND colegio_id = ? AND tipo = 1 AND nro_pago = ? AND UPPER(TRIM(estado)) = 'ACTIVO' LIMIT 1`,
      [matriculaId, colegio_id, mes]
    );
    if (ex.length) continue;
    await insertPensionMes(mes);
  }

  if (registrarLineaPagoMatricula && Number(montoMatricula) > 0) {
    const [ex0] = await conn.execute(
      `SELECT id FROM pagos WHERE matricula_id = ? AND colegio_id = ? AND tipo = 0 AND UPPER(TRIM(estado)) = 'ACTIVO' LIMIT 1`,
      [matriculaId, colegio_id]
    );
    if (ex0.length) return;
    try {
      await insertPagoPendienteConn(conn, {
        colegio_id,
        matriculaId,
        nro_pago: 0,
        tipo: 0,
        monto: montoMatricula,
        descripcion: 'MATRÍCULA',
        personal_id,
        withObservaciones: withObs,
      });
    } catch (e) {
      await insertPagoPendienteConn(conn, {
        colegio_id,
        matriculaId,
        nro_pago: 0,
        tipo: 0,
        monto: montoMatricula,
        descripcion: 'MATRÍCULA',
        personal_id,
        withObservaciones: false,
      });
    }
  }
}

module.exports = {
  FECHA_HORA_PENDIENTE_DB,
  FECHA_CANCELADO_PENDIENTE_DB,
  insertPagoPendienteConn,
  ensurePagosPendientesMatriculaConn,
  resolverPersonalIdPago,
};
