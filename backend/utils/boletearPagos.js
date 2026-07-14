/**
 * Boletear pagos — legacy do_boletear_json2 y do_boletear_moras_json.
 * No incluye boletear por grupo (do_boletear_json).
 */
const crypto = require('crypto');
const { PassThrough } = require('stream');
const archiverMod = require('archiver');
const { query, execute } = require('./mysql');
const { cargarBcpColegioConfig } = require('./bcpColegioConfig');
const { parseHistorialPagoIds } = require('./bcpCdpgImport');
const { fechaHoraMySQLLima } = require('./fechaHoraLima');
const {
  findActiveImpresion,
  ensurePagoImpresionActiva,
  marcarImpresionComoImpresa,
  impresoPendiente,
} = require('./pagoImpresionEnsure');
const {
  getAdminImpresionPayload,
  getActivePagoBoletaImpresion,
  buildLegacyJsonBoletaFromImpresion,
  buildLegacyJsonNotaDebitoFromImpresion,
  buildLegacyJsonBoletaMoraFromImpresion,
} = require('./pagoImpresionJson');

const SQL_MATRICULA_VISIBLE = `(m.ocultar IS NULL OR m.ocultar = '' OR UPPER(TRIM(m.ocultar)) = 'NO')`;

/** Compatible con archiver v5 (función) y v8 (clase ZipArchive). */
function createZipArchive(options = {}) {
  if (typeof archiverMod === 'function') {
    return archiverMod('zip', options);
  }
  if (archiverMod && typeof archiverMod.ZipArchive === 'function') {
    return new archiverMod.ZipArchive(options);
  }
  const err = new Error('Módulo archiver inválido (se requiere v5 función o v8 ZipArchive)');
  err.code = 'ARCHIVER_INVALID';
  throw err;
}

async function buildZipBuffer(files) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const passthrough = new PassThrough();
    passthrough.on('data', (chunk) => chunks.push(chunk));
    passthrough.on('end', () => resolve(Buffer.concat(chunks)));
    passthrough.on('error', reject);

    let archive;
    try {
      archive = createZipArchive({ zlib: { level: 9 } });
    } catch (e) {
      reject(e);
      return;
    }
    archive.on('error', reject);
    archive.pipe(passthrough);

    files.forEach((f) => {
      archive.append(JSON.stringify(f.contenido, null, 2), { name: f.nombre });
    });
    archive.finalize();
  });
}

function zipFilename() {
  return `${crypto.randomBytes(16).toString('hex')}.zip`;
}

async function obtenerPagoMensualidad(colegioId, matriculaId, nroPago) {
  const rows = await query(
    `SELECT id, monto, estado_pago
     FROM pagos
     WHERE estado = 'ACTIVO' AND colegio_id = ? AND matricula_id = ? AND nro_pago = ? AND tipo = 1
     LIMIT 1`,
    [colegioId, matriculaId, nroPago]
  );
  return rows?.[0] || null;
}

async function crearPagoTemporal(colegioId, matriculaId, nroPago, monto, personalId) {
  const fechaHora = fechaHoraMySQLLima().slice(0, 16);
  const result = await execute(
    `INSERT INTO pagos (
      colegio_id, matricula_id, nro_pago, monto, mora, fecha_hora, tipo, personal_id,
      estado, estado_pago, observaciones
    ) VALUES (?, ?, ?, ?, 0, ?, 1, ?, 'ACTIVO', 'PENDIENTE', 'PAGO TEMPORAL')`,
    [colegioId, matriculaId, nroPago, monto, fechaHora, personalId || 0]
  );
  return result?.insertId;
}

async function actualizarPagoTemporal(pagoId) {
  await execute(`UPDATE pagos SET observaciones = 'PAGO TEMPORAL' WHERE id = ?`, [pagoId]);
}

async function jsonDesdeImpresion(colegioId, impresionRow) {
  const imp = await getAdminImpresionPayload({
    colegio_id: colegioId,
    pagoId: impresionRow.pago_id,
    impresionId: impresionRow.id,
  });
  if (!imp) return null;

  const tipoDoc = String(impresionRow.tipo_documento || imp.tipo_documento || '').toUpperCase();
  const tipo = String(impresionRow.tipo || imp.tipo || '').toUpperCase();

  if (tipo === 'PAGO' && tipoDoc === 'BOLETA') {
    return buildLegacyJsonBoletaFromImpresion(imp);
  }
  if (tipo === 'MORA' && tipoDoc === 'NOTA') {
    const boletaActiva = await getActivePagoBoletaImpresion(imp.pago_id);
    return buildLegacyJsonNotaDebitoFromImpresion(imp, boletaActiva);
  }
  if (tipo === 'MORA' && tipoDoc === 'BOLETA') {
    const boletaActiva = await getActivePagoBoletaImpresion(imp.pago_id);
    return buildLegacyJsonBoletaMoraFromImpresion(imp, boletaActiva);
  }
  return null;
}

/**
 * Boletear todos los grupos del año activo (do_boletear_json2).
 */
async function boletearGeneral(colegioId, { nro_pago: nroPago, personal_id: personalId }) {
  const nro = parseInt(nroPago, 10);
  if (!Number.isFinite(nro) || nro < 1) {
    return { ok: false, status: 400, error: 'Seleccione una mensualidad válida.' };
  }

  const cfg = await cargarBcpColegioConfig(colegioId);
  const anio = cfg.anio_activo;

  const grupos = await query(
    `SELECT id FROM grupos
     WHERE colegio_id = ? AND anio = ?
     ORDER BY nivel_id ASC, grado ASC, seccion ASC`,
    [colegioId, anio]
  );

  const impresionesPendientes = [];

  for (const grupo of grupos || []) {
    const matriculas = await query(
      `SELECT m.id, COALESCE(c.pension, 0) AS pension
       FROM matriculas m
       LEFT JOIN costos c ON c.id = m.costo_id
       WHERE m.grupo_id = ? AND m.colegio_id = ? AND ${SQL_MATRICULA_VISIBLE}`,
      [grupo.id, colegioId]
    );

    for (const mat of matriculas || []) {
      if (parseFloat(mat.pension) <= 0) continue;

      let pagoId;
      const existente = await obtenerPagoMensualidad(colegioId, mat.id, nro);
      if (!existente) {
        pagoId = await crearPagoTemporal(colegioId, mat.id, nro, parseFloat(mat.pension), personalId);
      } else {
        pagoId = existente.id;
        await actualizarPagoTemporal(pagoId);
      }
      if (!pagoId) continue;

      const ens = await ensurePagoImpresionActiva({
        colegioId,
        pagoId,
        tipo: 'PAGO',
        tipoDocumento: 'BOLETA',
      });
      if (!ens.ok || !ens.impresion) continue;

      const imp = ens.impresion;
      if (impresoPendiente(imp)) {
        impresionesPendientes.push(imp);
        await marcarImpresionComoImpresa(imp.id);
      }
    }
  }

  const files = [];
  for (const imp of impresionesPendientes) {
    const json = await jsonDesdeImpresion(colegioId, imp);
    if (json) files.push(json);
  }

  const buffer = await buildZipBuffer(files);
  return {
    ok: true,
    buffer,
    filename: zipFilename(),
    boletas: files.length,
  };
}

function parseFechaRango(from, to) {
  if (!from || !to) return null;
  const f = String(from).trim().slice(0, 10);
  const t = String(to).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f) || !/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  return { from: f, to: t };
}

/**
 * Boletear moras por rango de fechas (do_boletear_moras_json).
 */
async function boletearMoras(colegioId, { from, to, cantidad }) {
  const rango = parseFechaRango(from, to);
  if (!rango) {
    return { ok: false, status: 400, error: 'Indique fechas válidas (desde y hasta).' };
  }

  const limite = Math.max(1, parseInt(cantidad, 10) || 1);

  const pagos = await query(
    `SELECT p.id AS pago_id, p.mora, p.fecha_cancelado, m.id AS matricula_id
     FROM pagos p
     INNER JOIN matriculas m ON m.id = p.matricula_id
     WHERE p.estado_pago = 'CANCELADO'
       AND p.estado = 'ACTIVO'
       AND p.colegio_id = ?
       AND p.tipo = 1
       AND DATE(p.fecha_cancelado) BETWEEN DATE(?) AND DATE(?)
       AND p.mora > 0
       AND ${SQL_MATRICULA_VISIBLE}
     ORDER BY p.fecha_cancelado ASC`,
    [colegioId, rango.from, rango.to]
  );

  const impresionesPendientes = [];
  let count = 0;

  for (const pago of pagos || []) {
    if (count >= limite) break;

    const impresionBoleta = await findActiveImpresion(pago.pago_id, 'PAGO', 'BOLETA');
    if (!impresionBoleta) continue;

    const impresionMoraExistente = await findActiveImpresion(pago.pago_id, 'MORA', 'NOTA');
    const fechaBoleta = impresionBoleta.fecha_impresion;
    const d = fechaBoleta ? new Date(fechaBoleta) : null;
    const mes = d ? d.getMonth() + 1 : 0;
    const anio = d ? d.getFullYear() : 0;

    let impresionMora;
    if (anio <= 2018 && mes <= 8 && !impresionMoraExistente) {
      const ens = await ensurePagoImpresionActiva({
        colegioId,
        pagoId: pago.pago_id,
        tipo: 'MORA',
        tipoDocumento: 'BOLETA',
      });
      impresionMora = ens.ok ? ens.impresion : null;
    } else {
      const ens = await ensurePagoImpresionActiva({
        colegioId,
        pagoId: pago.pago_id,
        tipo: 'MORA',
        tipoDocumento: 'NOTA',
      });
      impresionMora = ens.ok ? ens.impresion : null;
    }

    if (!impresionMora) continue;

    if (impresoPendiente(impresionMora)) {
      impresionesPendientes.push(impresionMora);
      await marcarImpresionComoImpresa(impresionMora.id);
      count += 1;
    }
  }

  const files = [];
  for (const imp of impresionesPendientes) {
    const json = await jsonDesdeImpresion(colegioId, imp);
    if (json) files.push(json);
  }

  const buffer = await buildZipBuffer(files);
  return {
    ok: true,
    buffer,
    filename: zipFilename(),
    boletas: files.length,
  };
}

/**
 * Boletear lote de un archivo CDPG importado (historial pagos_historial).
 * Solo crea/marca impresiones como IMPRESAS y marca el historial; no genera ZIP.
 */
async function boletearHistorialImportacion(colegioId, historialId) {
  const id = parseInt(historialId, 10);
  if (!Number.isFinite(id) || id < 1) {
    return { ok: false, status: 400, error: 'ID de historial inválido.' };
  }

  const rows = await query(
    `SELECT id, data FROM pagos_historial WHERE id = ? AND colegio_id = ? LIMIT 1`,
    [id, colegioId]
  );
  const row = rows?.[0];
  if (!row) {
    return { ok: false, status: 404, error: 'Registro de historial no encontrado.' };
  }

  const pagoIds = parseHistorialPagoIds(row.data);
  if (!pagoIds.length) {
    return { ok: false, status: 400, error: 'El historial no contiene pagos para boletear.' };
  }

  let boletas = 0;

  for (const pagoId of pagoIds) {
    const ens = await ensurePagoImpresionActiva({
      colegioId,
      pagoId,
      tipo: 'PAGO',
      tipoDocumento: 'BOLETA',
    });
    if (!ens.ok || !ens.impresion) continue;

    const imp = ens.impresion;
    if (impresoPendiente(imp)) {
      await marcarImpresionComoImpresa(imp.id);
    }
    boletas += 1;
  }

  if (!boletas) {
    return {
      ok: false,
      status: 400,
      error: 'No se pudo boletear ningún pago de este lote (revise que los pagos existan).',
    };
  }

  await execute(`UPDATE pagos_historial SET impreso = 'SI' WHERE id = ? AND colegio_id = ?`, [id, colegioId]);

  return {
    ok: true,
    sin_zip: true,
    boletas,
    mensaje: `Se boletearon ${boletas} pago(s). El lote quedó marcado como BOLETAS IMPRESAS.`,
  };
}

module.exports = {
  boletearGeneral,
  boletearMoras,
  boletearHistorialImportacion,
};
