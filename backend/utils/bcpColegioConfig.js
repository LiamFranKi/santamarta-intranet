/**
 * Configuración colegio + recaudo BCP para export/import.
 */
const phpSerialize = require('php-serialize');
const { query } = require('./mysql');
const { parsePensionesVencimiento, calcularFechaVencimientoDdMmYyyy } = require('./fechaFacturacionJson');
const { buildConceptosOpciones } = require('./reportesGeneralDeudoresPagadores');
const { nombreMesPension } = require('./bcpFormat');

async function cargarRecaudoBcp() {
  const rows = await query(
    `SELECT clave, valor FROM config WHERE clave IN ('recaudo_nro_sucursal', 'recaudo_nro_cuenta', 'recaudo_razon_social')`
  );
  const map = {};
  (rows || []).forEach((r) => {
    map[r.clave] = r.valor != null ? String(r.valor).trim() : '';
  });
  return {
    nro_sucursal: map.recaudo_nro_sucursal || '',
    nro_cuenta: map.recaudo_nro_cuenta || '',
    razon_social: map.recaudo_razon_social || '',
  };
}

function validarRecaudo(recaudo) {
  const faltantes = [];
  if (!recaudo.nro_sucursal) faltantes.push('recaudo_nro_sucursal');
  if (!recaudo.nro_cuenta) faltantes.push('recaudo_nro_cuenta');
  if (!recaudo.razon_social) faltantes.push('recaudo_razon_social');
  return faltantes;
}

async function cargarBcpColegioConfig(colegioId) {
  const [colegio] = await query(
    `SELECT anio_activo, total_pensiones, inicio_pensiones, monto_adicional, pago_comedor, fecha_comedor, pensiones_vencimiento
     FROM colegios WHERE id = ? LIMIT 1`,
    [colegioId]
  );
  const totalPensiones = parseInt(colegio?.total_pensiones || 10, 10);
  const inicioPensiones = parseInt(colegio?.inicio_pensiones ?? 2, 10);
  const vencimientos = parsePensionesVencimiento(colegio?.pensiones_vencimiento);

  const recaudo = await cargarRecaudoBcp();

  const conceptos = buildConceptosOpciones(totalPensiones, inicioPensiones);
  const opcionesNroPago = [{ value: -1, label: '-- TODOS --' }];
  conceptos.forEach((c) => {
    if (c.value === 'todos') return;
    if (c.value === '0') {
      opcionesNroPago.push({ value: 0, label: 'MATRÍCULA' });
      return;
    }
    const n = parseInt(c.value, 10);
    if (Number.isFinite(n) && n >= 1) {
      opcionesNroPago.push({ value: n, label: c.label });
    }
  });
  opcionesNroPago.push(
    { value: 20, label: 'MATRÍCULA Y AGENDA' },
    { value: 21, label: 'RESERVA DE VACANTE' },
    { value: 22, label: 'CANCELACIÓN DE MATRÍCULA' }
  );
  for (let i = 1; i <= totalPensiones; i += 1) {
    const mes = nombreMesPension(i, inicioPensiones).toUpperCase();
    opcionesNroPago.push({ value: i + 50, label: `COMEDOR ${mes}` });
  }

  return {
    anio_activo: parseInt(colegio?.anio_activo || new Date().getFullYear(), 10),
    total_pensiones: totalPensiones,
    inicio_pensiones: inicioPensiones,
    monto_adicional: parseFloat(colegio?.monto_adicional) || 0,
    pago_comedor: parseFloat(colegio?.pago_comedor) || 0,
    fecha_comedor: colegio?.fecha_comedor || null,
    vencimientos,
    recaudo,
    opciones_nro_pago: opcionesNroPago,
  };
}

function getFechaVencimiento(cfg, matricula, nroPago) {
  const anio = parseInt(matricula.grupo_anio, 10) || cfg.anio_activo;
  const map = cfg.vencimientos || {};

  let diaVencimiento = map[nroPago];
  if (diaVencimiento == null || diaVencimiento === '') {
    diaVencimiento = map[String(nroPago)];
  }

  if (diaVencimiento == null || diaVencimiento === '') {
    if (nroPago === -1 || nroPago === 0) {
      return calcularFechaVencimientoDdMmYyyy(0, anio, cfg.inicio_pensiones, map) || `31-${cfg.inicio_pensiones + 1}-${anio}`;
    }
    return `31-${cfg.inicio_pensiones + 1}-${anio}`;
  }

  const s = String(diaVencimiento).trim();
  const parts = s.split('-');
  if (parts.length === 3) return s;

  if (nroPago === -1 || parts.length === 2) {
    return `${s}-${anio}`;
  }

  return `${s}-${nroPago + 2}-${anio}`;
}

async function contarMatriculasAlumno(colegioId, alumnoId) {
  const [row] = await query(
    `SELECT COUNT(*) AS n FROM matriculas WHERE colegio_id = ? AND alumno_id = ?`,
    [colegioId, alumnoId]
  );
  return parseInt(row?.n, 10) || 0;
}

module.exports = {
  cargarRecaudoBcp,
  validarRecaudo,
  cargarBcpColegioConfig,
  getFechaVencimiento,
  contarMatriculasAlumno,
};
