/**
 * CRUD de usuarios para administrador: equipo (personal + perfiles), alumnos, apoderados.
 * Montaje: /api/admin/usuarios
 * Autenticación: solo ADMINISTRADOR.
 * Convención: usuario y contraseña inicial = DNI (password en BD como SHA1).
 */
const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const phpSerialize = require('php-serialize');
const router = express.Router();
const { query, execute, mysqlReadPool } = require('../utils/mysql');
const { getBoletaPdfJsonForPago } = require('../utils/boletaPdfData');
const { authenticateToken } = require('../middleware/auth');

/** Valores del ENUM `usuarios.tipo` en MySQL (orden de negocio). */
const TIPOS_ENUM_USUARIO = [
  'ADMINISTRADOR',
  'DIRECTOR',
  'ALUMNO',
  'APODERADO',
  'DOCENTE',
  'AUXILIAR',
  'SECRETARIA',
  'CAJERO',
  'ENFERMERA',
  'PROMOTORIA',
  'COORDINADOR',
  'PSICOLOGA',
  'ASISTENCIA',
  'CONTADOR',
  'TUTOR',
  'MANTENIMIENTO',
];

/**
 * Perfiles asignables en el módulo Personal (tabla `personal` + usuario).
 * ALUMNO y APODERADO no se eligen aquí: se gestionan en sus propios módulos.
 */
const TIPOS_PERSONAL = TIPOS_ENUM_USUARIO.filter((t) => t !== 'ALUMNO' && t !== 'APODERADO');
const TIPOS_PERSONAL_SET = new Set(TIPOS_PERSONAL);

function sha1Password(plain) {
  return crypto.createHash('sha1').update(String(plain), 'utf8').digest('hex');
}

function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Usuario no autenticado' });
  }
  if (req.user.tipo !== 'ADMINISTRADOR') {
    return res.status(403).json({ error: 'Solo administradores pueden gestionar usuarios' });
  }
  next();
}

router.use(authenticateToken);
router.use(requireAdmin);

/**
 * Arma el listado de pagos por matrícula (mismos totales y filas que el historial admin).
 * @param {number} colegio_id
 * @param {Array<object>} matriculas Filas con matricula_id, anio, grado, seccion, nivel_nombre, pension, matricula (costo)
 */
async function buildAlumnoPagosData(colegio_id, matriculas) {
  if (!matriculas?.length) return [];

  const colegioConfig = await query(
    `SELECT ciclo_pensiones, inicio_pensiones, total_pensiones
     FROM colegios
     WHERE id = ?
     LIMIT 1`,
    [colegio_id]
  );
  const cicloPensiones = colegioConfig.length ? colegioConfig[0].ciclo_pensiones : null;
  const inicioPensiones = colegioConfig.length ? parseInt(colegioConfig[0].inicio_pensiones || 1, 10) : 1;
  const totalPensiones = colegioConfig.length ? parseInt(colegioConfig[0].total_pensiones || 10, 10) : 10;
  const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Setiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const getMesPension = (nroPago) => {
    if (cicloPensiones === 0 || cicloPensiones === '0') {
      const idx = Number(nroPago) + inicioPensiones - 1;
      return idx >= 0 && idx < MESES.length ? MESES[idx] : null;
    }
    return null;
  };

  const matriculaIds = matriculas.map((m) => Number(m.matricula_id)).filter((n) => Number.isFinite(n) && n > 0);
  const inMatriculas = matriculaIds.map(() => '?').join(', ');

  const sqlPagosWhere = `p.colegio_id = ? AND p.estado IN ('ACTIVO','ANULADO') AND p.matricula_id IN (${inMatriculas})`;
  const sqlPagosBase = `SELECT p.id, p.matricula_id, p.nro_pago, p.monto, p.mora, p.fecha_hora, p.tipo, p.descripcion,
            p.estado_pago, p.fecha_cancelado, p.nro_movimiento_banco, p.nro_movimiento_importado,
            p.forma_pago, p.lugar_pago, p.estado AS pago_registro_estado
     FROM pagos p
     WHERE ${sqlPagosWhere}
     ORDER BY p.matricula_id ASC, p.tipo ASC, p.nro_pago ASC, p.id ASC`;
  const paramsPagos = [colegio_id, ...matriculaIds];

  let pagosRows;
  try {
    pagosRows = await query(
      `SELECT p.id, p.matricula_id, p.nro_pago, p.monto, p.mora, p.fecha_hora, p.tipo, p.descripcion, p.observaciones,
            p.estado_pago, p.fecha_cancelado, p.nro_movimiento_banco, p.nro_movimiento_importado,
            p.forma_pago, p.lugar_pago, p.estado AS pago_registro_estado, p.fecha_anulado
     FROM pagos p
     WHERE ${sqlPagosWhere}
     ORDER BY p.matricula_id ASC, p.tipo ASC, p.nro_pago ASC, p.id ASC`,
      paramsPagos
    );
  } catch (e) {
    if (!isSqlUnknownColumnError(e)) throw e;
    try {
      pagosRows = await query(
        `SELECT p.id, p.matricula_id, p.nro_pago, p.monto, p.mora, p.fecha_hora, p.tipo, p.descripcion, p.observaciones,
            p.estado_pago, p.fecha_cancelado, p.nro_movimiento_banco, p.nro_movimiento_importado,
            p.forma_pago, p.lugar_pago, p.estado AS pago_registro_estado
     FROM pagos p
     WHERE ${sqlPagosWhere}
     ORDER BY p.matricula_id ASC, p.tipo ASC, p.nro_pago ASC, p.id ASC`,
        paramsPagos
      );
    } catch (e2) {
      if (!isSqlUnknownColumnError(e2)) throw e2;
      pagosRows = await query(sqlPagosBase, paramsPagos);
      pagosRows = pagosRows.map((row) => ({ ...row, observaciones: row.observaciones ?? '' }));
    }
  }

  const pagoIds = pagosRows.map((p) => Number(p.id)).filter((n) => Number.isFinite(n) && n > 0);
  const boletasByPagoId = new Map();
  if (pagoIds.length) {
    const inPagos = pagoIds.map(() => '?').join(', ');
    let boletas;
    try {
      boletas = await query(
        `SELECT i.pago_id, i.numero, i.serie, i.fecha_impresion, i.impreso, i.estado AS impresion_estado
         FROM impresiones i
         INNER JOIN (
            SELECT pago_id, MAX(id) AS max_id
            FROM impresiones
            WHERE tipo = 'PAGO' AND tipo_documento = 'BOLETA' AND pago_id IN (${inPagos})
            GROUP BY pago_id
         ) ult ON ult.max_id = i.id`,
        [...pagoIds]
      );
    } catch (e) {
      if (!isSqlUnknownColumnError(e)) throw e;
      boletas = await query(
        `SELECT i.pago_id, i.numero, i.serie, i.fecha_impresion, i.impreso
         FROM impresiones i
         INNER JOIN (
            SELECT pago_id, MAX(id) AS max_id
            FROM impresiones
            WHERE tipo = 'PAGO' AND tipo_documento = 'BOLETA' AND pago_id IN (${inPagos})
            GROUP BY pago_id
         ) ult ON ult.max_id = i.id`,
        [...pagoIds]
      );
    }
    boletas.forEach((b) => {
      boletasByPagoId.set(Number(b.pago_id), {
        numero: b.numero,
        serie: b.serie,
        serie_numero: `${String(b.serie).padStart(3, '0')}-${String(b.numero).padStart(7, '0')}`,
        fecha_impresion: b.fecha_impresion,
        impreso: b.impreso,
        impresion_estado: b.impresion_estado != null ? String(b.impresion_estado).toUpperCase() : null,
      });
    });
  }

  const pagosByMatricula = new Map();
  pagosRows.forEach((p) => {
    const key = Number(p.matricula_id);
    if (!pagosByMatricula.has(key)) pagosByMatricula.set(key, []);
    pagosByMatricula.get(key).push({
      ...p,
      boleta: boletasByPagoId.get(Number(p.id)) || null,
    });
  });

  return matriculas.map((m) => {
    const matriculaId = Number(m.matricula_id);
    const pensionMonto = parseFloat(m.pension || 0);
    const matriculaMonto = parseFloat(m.matricula || 0);
    const existentes = pagosByMatricula.get(matriculaId) || [];
    const pagosCompletos = [];

    const regEstRow = (p) => String(p.pago_registro_estado || '').toUpperCase();
    const pickMatricula = (list) => {
      const rows = list.filter((p) => Number(p.tipo) === 0);
      return rows.find((p) => regEstRow(p) === 'ACTIVO') || rows.find((p) => regEstRow(p) === 'ANULADO') || null;
    };
    const pickPensionMes = (list, nroMes) => {
      const rows = list.filter((p) => Number(p.tipo) === 1 && Number(p.nro_pago) === Number(nroMes));
      return rows.find((p) => regEstRow(p) === 'ACTIVO') || rows.find((p) => regEstRow(p) === 'ANULADO') || null;
    };

    const pagoMatricula = pickMatricula(existentes);
    if (pagoMatricula) {
      pagosCompletos.push(pagoMatricula);
    } else {
      pagosCompletos.push({
        id: null,
        matricula_id: matriculaId,
        nro_pago: 0,
        monto: matriculaMonto,
        mora: 0,
        fecha_hora: null,
        tipo: 0,
        descripcion: '',
        observaciones: '',
        estado_pago: 'PENDIENTE',
        fecha_cancelado: null,
        nro_movimiento_banco: null,
        nro_movimiento_importado: null,
        forma_pago: null,
        lugar_pago: null,
        pago_registro_estado: 'ACTIVO',
        boleta: null,
      });
    }

    for (let i = 1; i <= totalPensiones; i += 1) {
      const pension = pickPensionMes(existentes, i);
      if (pension) {
        pagosCompletos.push(pension);
      } else {
        pagosCompletos.push({
          id: null,
          matricula_id: matriculaId,
          nro_pago: i,
          monto: pensionMonto,
          mora: 0,
          fecha_hora: null,
          tipo: 1,
          descripcion: '',
          observaciones: '',
          estado_pago: 'PENDIENTE',
          fecha_cancelado: null,
          nro_movimiento_banco: null,
          nro_movimiento_importado: null,
          forma_pago: null,
          lugar_pago: null,
          pago_registro_estado: 'ACTIVO',
          boleta: null,
        });
      }
    }

    const otrosRows = existentes.filter((p) => Number(p.tipo) >= 2);

    /** Id de filas ya mostradas en el cupo principal (un ACTIVO gana el hueco; el ANULADO del mismo mes queda fuera). */
    const idsEnCupos = new Set(
      pagosCompletos.filter((p) => p.id != null).map((p) => Number(p.id))
    );
    const anuladosExtra = existentes
      .filter((p) => p.id != null && regEstRow(p) === 'ANULADO' && !idsEnCupos.has(Number(p.id)))
      .sort((a, b) => {
        const ta = Number(a.tipo);
        const tb = Number(b.tipo);
        if (ta !== tb) return ta - tb;
        if (Number(a.nro_pago) !== Number(b.nro_pago)) return Number(a.nro_pago) - Number(b.nro_pago);
        return Number(a.id) - Number(b.id);
      });
    const anuladosExtraMapped = anuladosExtra.map((p) => {
      const tipo = Number(p.tipo);
      let tipoDescripcion = '';
      if (tipo === 0) {
        tipoDescripcion = 'Matrícula (registro anulado)';
      } else if (tipo === 1) {
        const mes = getMesPension(Number(p.nro_pago));
        tipoDescripcion = mes
          ? `Pensión - ${mes} (registro anulado)`
          : `Pensión - ${p.nro_pago} (registro anulado)`;
      } else {
        tipoDescripcion =
          (p.descripcion && String(p.descripcion).trim()) || `Tipo ${tipo} (registro anulado)`;
      }
      return {
        ...p,
        tipo_descripcion: tipoDescripcion,
        es_anulado_historial: true,
      };
    });

    const pagosBase = pagosCompletos.map((p) => {
      const tipo = Number(p.tipo);
      let tipoDescripcion = '';
      if (tipo === 0) {
        tipoDescripcion = 'Matrícula';
      } else if (tipo === 1) {
        const mes = getMesPension(Number(p.nro_pago));
        tipoDescripcion = mes ? `Pensión - ${mes}` : `Pensión - ${p.nro_pago}`;
      } else {
        tipoDescripcion = p.descripcion || `Tipo ${p.tipo}`;
      }
      return {
        ...p,
        tipo_descripcion: tipoDescripcion,
      };
    });
    const otrosMapped = otrosRows.map((p) => {
      const tipo = Number(p.tipo);
      const tipoDescripcion = (p.descripcion && String(p.descripcion).trim()) || `Tipo ${tipo}`;
      return {
        ...p,
        tipo_descripcion: tipoDescripcion,
      };
    });

    /** Intercala filas anuladas (mismo mes/cupo) justo debajo del ACTIVO correspondiente. */
    const anulaMat = anuladosExtraMapped.filter((p) => Number(p.tipo) === 0);
    const anulaByNroMes = new Map();
    for (const p of anuladosExtraMapped) {
      if (Number(p.tipo) !== 1) continue;
      const n = Number(p.nro_pago);
      if (!anulaByNroMes.has(n)) anulaByNroMes.set(n, []);
      anulaByNroMes.get(n).push(p);
    }
    const anulaTipo2Plus = anuladosExtraMapped.filter((p) => Number(p.tipo) >= 2);
    const anulaTipo2Ids = new Set(anulaTipo2Plus.map((p) => Number(p.id)));
    const otrosMappedDedup = otrosMapped.filter((p) => !anulaTipo2Ids.has(Number(p.id)));

    const pagosIntercalados = [];
    if (pagosBase.length > 0) {
      pagosIntercalados.push(pagosBase[0]);
      anulaMat.forEach((row) => pagosIntercalados.push(row));
    }
    for (let mesIdx = 1; mesIdx <= totalPensiones; mesIdx += 1) {
      if (mesIdx < pagosBase.length) {
        pagosIntercalados.push(pagosBase[mesIdx]);
        (anulaByNroMes.get(mesIdx) || []).forEach((row) => pagosIntercalados.push(row));
      }
    }
    const pagos = [...pagosIntercalados, ...anulaTipo2Plus, ...otrosMappedDedup];

    const esActivoReg = (p) => String(p.pago_registro_estado || '').toUpperCase() === 'ACTIVO';
    const totalPagar = matriculaMonto + (pensionMonto * totalPensiones);
    const totalPagado = pagos
      .filter(
        (p) =>
          esActivoReg(p) &&
          p.estado_pago === 'CANCELADO' &&
          (Number(p.tipo) === 0 || Number(p.tipo) === 1)
      )
      .reduce((sum, p) => sum + parseFloat(p.monto || 0), 0);
    const totalMoraPagada = pagos
      .filter(
        (p) =>
          esActivoReg(p) &&
          p.estado_pago === 'CANCELADO' &&
          (Number(p.tipo) === 0 || Number(p.tipo) === 1)
      )
      .reduce((sum, p) => sum + parseFloat(p.mora || 0), 0);
    const totalOtros = otrosMapped
      .filter((p) => esActivoReg(p) && p.estado_pago === 'CANCELADO')
      .reduce((sum, p) => sum + parseFloat(p.monto || 0), 0);

    /** Opciones para combo «mes» al registrar pensión (nro_pago + etiqueta), alineado a getMesPension */
    const pension_meses_opciones = [];
    for (let nro = 1; nro <= totalPensiones; nro++) {
      let mes_label;
      if (cicloPensiones === 0 || cicloPensiones === '0') {
        const idx = nro + inicioPensiones - 1;
        mes_label = idx >= 0 && idx < MESES.length ? MESES[idx] : `Cuota ${nro}`;
      } else {
        mes_label = `Pensión ${nro}`;
      }
      pension_meses_opciones.push({ nro_pago: nro, mes_label });
    }

    return {
      matricula_id: matriculaId,
      anio: m.anio,
      grado: m.grado,
      seccion: m.seccion,
      nivel_nombre: m.nivel_nombre,
      grupo_texto: `${String(m.nivel_nombre || '').toUpperCase()} - ${m.grado || '—'}° ${m.seccion || ''} - ${m.anio || '—'}`.replace(/\s+/g, ' ').trim(),
      total_pagar: totalPagar,
      total_pagado: totalPagado,
      total_mora_pagada: totalMoraPagada,
      total_pendiente: totalPagar - totalPagado,
      total_otros: totalOtros,
      pension_meses_opciones,
      pension_config: {
        ciclo_pensiones: cicloPensiones,
        inicio_pensiones: inicioPensiones,
        total_pensiones: totalPensiones,
      },
      pagos,
    };
  });
}

function isSqlUnknownColumnError(e) {
  const code = e && e.code;
  const errno = e && e.errno;
  const msg = String((e && e.message) || '');
  return code === 'ER_BAD_FIELD_ERROR' || errno === 1054 || msg.includes('Unknown column');
}

/**
 * Al anular el pago: todas las impresiones ACTIVO de ese pago → ANULADO.
 * @param {import('mysql2/promise').PoolConnection} [conn] Si se pasa, usa la misma conexión (transacción).
 */
async function syncImpresionesAlAnularPago(pagoId, conn = null) {
  const hoy = new Date().toISOString().slice(0, 10);
  const run = conn
    ? (sql, params) => conn.execute(sql, params)
    : (sql, params) => execute(sql, params);
  try {
    await run(
      `UPDATE impresiones SET estado = 'ANULADO', fecha_anulado = ? WHERE pago_id = ? AND estado = 'ACTIVO'`,
      [hoy, pagoId]
    );
  } catch (e) {
    if (!isSqlUnknownColumnError(e)) throw e;
    await run(`UPDATE impresiones SET estado = 'ANULADO' WHERE pago_id = ? AND estado = 'ACTIVO'`, [pagoId]);
  }
}

/**
 * Al reactivar el pago: la impresión ANULADO más reciente (MAX id) vuelve a ACTIVO
 * (varias filas ANULADO históricas pueden existir; no reactivar todas).
 * @param {import('mysql2/promise').PoolConnection} [conn]
 */
async function syncImpresionesAlReactivarPago(pagoId, conn = null) {
  const run = conn
    ? (sql, params) => conn.execute(sql, params)
    : (sql, params) => execute(sql, params);
  const trySets = [
    `SET i.estado = 'ACTIVO', i.fecha_anulado = NULL, i.numero_anulado = 0`,
    `SET i.estado = 'ACTIVO', i.fecha_anulado = NULL`,
    `SET i.estado = 'ACTIVO'`,
  ];
  const sqlBase = `UPDATE impresiones i
      INNER JOIN (
        SELECT MAX(id) AS mid FROM impresiones WHERE pago_id = ? AND estado = 'ANULADO'
      ) t ON i.id = t.mid`;
  for (const setClause of trySets) {
    try {
      await run(`${sqlBase} ${setClause}`, [pagoId]);
      return;
    } catch (e) {
      if (!isSqlUnknownColumnError(e)) throw e;
    }
  }
}

/** Elimina todas las impresiones ligadas al pago (antes de borrar `pagos`). */
async function deleteImpresionesByPagoId(pagoId, conn = null) {
  if (conn) {
    await conn.execute(`DELETE FROM impresiones WHERE pago_id = ?`, [pagoId]);
  } else {
    await execute(`DELETE FROM impresiones WHERE pago_id = ?`, [pagoId]);
  }
}

/** Admin API: alumno → matrícula → pago pertenecen al colegio del usuario. */
async function verifyAdminAlumnoMatriculaPago(req) {
  const { colegio_id } = req.user;
  const alumnoId = parseInt(req.params.id, 10);
  const matriculaId = parseInt(req.params.matriculaId, 10);
  const pagoId = parseInt(req.params.pagoId, 10);
  if (![alumnoId, matriculaId, pagoId].every((n) => Number.isFinite(n) && n > 0)) {
    return { ok: false, status: 400, error: 'Parámetros inválidos' };
  }
  const okAl = await query('SELECT id FROM alumnos WHERE id = ? AND colegio_id = ? LIMIT 1', [alumnoId, colegio_id]);
  if (!okAl.length) return { ok: false, status: 404, error: 'Alumno no encontrado' };
  const okMat = await query(
    'SELECT id FROM matriculas WHERE id = ? AND alumno_id = ? AND colegio_id = ? LIMIT 1',
    [matriculaId, alumnoId, colegio_id]
  );
  if (!okMat.length) return { ok: false, status: 404, error: 'Matrícula no encontrada' };
  const prow = await query(
    `SELECT p.id FROM pagos p
     INNER JOIN matriculas m ON m.id = p.matricula_id AND m.alumno_id = ? AND m.colegio_id = ?
     WHERE p.id = ? AND p.colegio_id = ? AND p.matricula_id = ?
     LIMIT 1`,
    [alumnoId, colegio_id, pagoId, colegio_id, matriculaId]
  );
  if (!prow.length) return { ok: false, status: 404, error: 'Pago no encontrado' };
  return { ok: true, colegio_id, alumnoId, matriculaId, pagoId };
}

function mapImpresionTipoLabel(tipo) {
  const t = String(tipo || '').toUpperCase();
  if (t === 'PAGO') return 'Pago';
  if (t === 'MORA') return 'Mora';
  if (t === 'COMISION' || t === 'COMISIÓN') return 'Comisión';
  if (!tipo) return '—';
  return tipo.charAt(0).toUpperCase() + tipo.slice(1).toLowerCase();
}

function mapImpresionDocumentoLabel(td) {
  const t = String(td || '').toUpperCase();
  if (t === 'BOLETA') return 'Boleta de Venta';
  if (t === 'NOTA' || t === 'NOTA_DEBITO') return 'Nota de Débito';
  return td ? String(td) : '—';
}

function formatSerieNumeroImpresion(serie, numero) {
  const s = serie != null && serie !== '' ? String(serie) : '0';
  const n = numero != null && numero !== '' ? String(numero) : '0';
  return `${s.padStart(3, '0')}-${n.padStart(7, '0')}`;
}

function normalizeHoraImpresionBody(raw) {
  const t = String(raw ?? '').trim();
  if (!t) return null;
  const compact = t.replace(/\s+/g, '');
  const match = compact.match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return '__INVALID_TIME__';
  const hh = Number(match[1]);
  const mm = Number(match[2]);
  const ss = Number(match[3] ?? '00');
  const isValidRange =
    Number.isInteger(hh) &&
    Number.isInteger(mm) &&
    Number.isInteger(ss) &&
    hh >= 0 &&
    hh <= 23 &&
    mm >= 0 &&
    mm <= 59 &&
    ss >= 0 &&
    ss <= 59;
  if (!isValidRange) return '__INVALID_TIME__';
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

function safeJsonFilename(v, fallback = 'documento') {
  const s = String(v || fallback)
    .trim()
    .replace(/[^\w.-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return s || fallback;
}

async function markImpresionJsonGenerado(impresionId) {
  try {
    await execute(`UPDATE impresiones SET json_generado = 'SI' WHERE id = ?`, [impresionId]);
  } catch (e) {
    if (!isSqlUnknownColumnError(e)) throw e;
  }
}

async function getAdminImpresionPayload({ colegio_id, pagoId, impresionId }) {
  const rows = await query(
    `SELECT i.id, i.pago_id, i.tipo, i.tipo_documento, i.serie, i.numero, i.estado, i.fecha_impresion, i.hora_impresion,
            i.fecha_anulado, i.numero_anulado,
            p.monto, p.mora, p.fecha_cancelado, p.estado_pago, p.nro_pago, p.tipo AS pago_tipo, p.descripcion,
            a.id AS alumno_id, a.nombres, a.apellido_paterno, a.apellido_materno, a.nro_documento, a.tipo_documento AS alumno_tipo_documento,
            c.ruc, c.razon_social, c.nombre_empresa, c.inicio_pensiones,
            s.prefijo_boleta, s.direccion AS sede_direccion, s.codigo_sunat,
            g.grado, g.seccion, n.nombre AS nivel_nombre
     FROM impresiones i
     INNER JOIN pagos p ON p.id = i.pago_id
     INNER JOIN matriculas m ON m.id = p.matricula_id
     INNER JOIN alumnos a ON a.id = m.alumno_id
     LEFT JOIN grupos g ON g.id = m.grupo_id
     LEFT JOIN niveles n ON n.id = g.nivel_id
     LEFT JOIN sedes s ON s.id = g.sede_id
     LEFT JOIN colegios c ON c.id = p.colegio_id
     WHERE i.id = ? AND i.pago_id = ? AND p.colegio_id = ?
     LIMIT 1`,
    [impresionId, pagoId, colegio_id]
  );
  return rows?.[0] || null;
}

function toFixed2(v) {
  return Number(parseFloat(v || 0)).toFixed(2);
}

function legacyTipoDocumentoFacturacion(alumnoTipoDocumento, nroDocumento) {
  const idx = Number(alumnoTipoDocumento);
  if (idx === 0) return '1';
  if (idx === 1) return '7';
  if (idx === 5) return '4';
  const dniLike = String(nroDocumento || '').trim().length === 8;
  return dniLike ? '1' : '0';
}

function legacySerieConPrefijo(impSerie, prefijoBoleta) {
  const pref = String(prefijoBoleta || '').trim();
  const serie3 = String(impSerie || '0').padStart(3, '0');
  if (!pref) return serie3;
  if (pref === 'B') return `${pref}${serie3}`;
  const serie2 = String(impSerie || '0').padStart(2, '0');
  return `${pref}${serie2}`;
}

function legacyNumeroImpresion(impNumero) {
  return String(impNumero || '0').padStart(8, '0');
}

function legacyPagoDescripcion(imp) {
  const tipo = Number(imp.pago_tipo);
  const nivel = String(imp.nivel_nombre || '').toUpperCase();
  const grado = imp.grado != null ? `${imp.grado}°` : '';
  const seccion = String(imp.seccion || '').trim();
  const grupoShort = [nivel, grado, seccion].filter(Boolean).join(' ').trim();
  if (tipo === 0) return `MATRÍCULA${grupoShort ? ` - ${grupoShort}` : ''}`;
  if (tipo === 1) return `MENSUALIDAD ${Number(imp.nro_pago || 0)}${grupoShort ? ` - ${grupoShort}` : ''}`;
  return String(imp.descripcion || 'OTRO');
}

async function getActivePagoBoletaImpresion(pagoId) {
  const rows = await query(
    `SELECT id, serie, numero
     FROM impresiones
     WHERE pago_id = ? AND estado = 'ACTIVO' AND tipo = 'PAGO' AND tipo_documento = 'BOLETA'
     ORDER BY id DESC
     LIMIT 1`,
    [pagoId]
  );
  return rows?.[0] || null;
}

function buildLegacyJsonBoletaFromImpresion(imp) {
  const serie = legacySerieConPrefijo(imp.serie, imp.prefijo_boleta);
  const numero = legacyNumeroImpresion(imp.numero);
  const numeroDocAdq = String(imp.nro_documento || '').trim();
  const razonAlumno = `${imp.apellido_paterno || ''} ${imp.apellido_materno || ''} ${imp.nombres || ''}`
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
  const fechaEmision = imp.fecha_impresion ? String(imp.fecha_impresion).slice(0, 10) : '';
  const fechaVenc = imp.fecha_cancelado ? String(imp.fecha_cancelado).slice(0, 10) : fechaEmision;
  const monto = toFixed2(imp.monto);
  const descripcion = legacyPagoDescripcion(imp);
  const json = {
    boleta: {
      IDE: {
        numeracion: `${serie}-${numero}`,
        fechaEmision,
        codTipoDocumento: '03',
        tipoMoneda: 'PEN',
        fechaVencimiento: fechaVenc,
      },
      EMI: {
        tipoDocId: '6',
        numeroDocId: String(imp.ruc || ''),
        razonSocial: String(imp.razon_social || imp.nombre_empresa || ''),
        direccion: String(imp.sede_direccion || ''),
        codigoAsigSUNAT: String(imp.codigo_sunat || ''),
      },
      REC: {
        tipoDocId: legacyTipoDocumentoFacturacion(imp.alumno_tipo_documento, numeroDocAdq),
        numeroDocId: numeroDocAdq,
        razonSocial: razonAlumno,
      },
      CAB: {
        inafectas: { codigo: '1002', totalVentas: monto },
        totalImpuestos: [{ idImpuesto: '9998', montoImpuesto: '0.00' }],
        importeTotal: monto,
        tipoOperacion: '0101',
        leyenda: [{ codigo: '1000', descripcion: `SON ${monto} SOLES` }],
        montoTotalImpuestos: '0.00',
      },
      DET: [
        {
          numeroItem: '001',
          descripcionProducto: descripcion,
          cantidadItems: '1.00',
          unidad: 'NIU',
          valorUnitario: monto,
          precioVentaUnitario: monto,
          totalImpuestos: [
            {
              idImpuesto: '9998',
              montoImpuesto: '0.00',
              tipoAfectacion: '30',
              montoBase: monto,
              porcentaje: '0.00',
            },
          ],
          valorVenta: monto,
          montoTotalImpuestos: '0.00',
        },
      ],
    },
  };
  return {
    nombre: `${imp.ruc}-03-${serie}-${numero}.json`,
    contenido: json,
  };
}

function buildLegacyJsonNotaDebitoFromImpresion(imp, boletaActiva) {
  const numeroDocAdq = String(imp.nro_documento || '').trim();
  const razonAlumno = `${imp.apellido_paterno || ''} ${imp.apellido_materno || ''} ${imp.nombres || ''}`
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
  const mora = toFixed2(imp.mora);
  const serieBoleta = legacySerieConPrefijo(boletaActiva?.serie || 0, imp.prefijo_boleta);
  const nroBoleta = legacyNumeroImpresion(boletaActiva?.numero || 0);
  const serieNd = `BND${parseInt(String(imp.serie || '0'), 10)}`;
  const nroNd = legacyNumeroImpresion(imp.numero);
  const fechaEmision = imp.fecha_cancelado ? String(imp.fecha_cancelado).slice(0, 10) : '';
  const json = {
    notaDebito: {
      IDE: {
        numeracion: `${serieNd}-${nroNd}`,
        fechaEmision,
        tipoMoneda: 'PEN',
      },
      EMI: {
        tipoDocId: '6',
        numeroDocId: String(imp.ruc || ''),
        razonSocial: String(imp.razon_social || imp.nombre_empresa || ''),
        direccion: String(imp.sede_direccion || ''),
        codigoAsigSUNAT: String(imp.codigo_sunat || ''),
      },
      REC: {
        tipoDocId: legacyTipoDocumentoFacturacion(imp.alumno_tipo_documento, numeroDocAdq),
        numeroDocId: numeroDocAdq,
        razonSocial: razonAlumno,
      },
      DRF: [
        {
          tipoDocRelacionado: '03',
          numeroDocRelacionado: `${serieBoleta}-${nroBoleta}`,
          codigoMotivo: '03',
          descripcionMotivo: 'PENALIDAD POR ATRASO DE PAGO',
        },
      ],
      CAB: {
        inafectas: { codigo: '1002', totalVentas: mora },
        totalImpuestos: [{ idImpuesto: '9998', montoImpuesto: '0.00' }],
        importeTotal: mora,
        tipoOperacion: '0101',
        leyenda: [{ codigo: '1000', descripcion: `SON ${mora} SOLES` }],
        montoTotalImpuestos: '0.00',
      },
      DET: [
        {
          numeroItem: '001',
          descripcionProducto: `PENALIDAD - ${legacyPagoDescripcion(imp)}`,
          cantidadItems: '1.00',
          unidad: 'NIU',
          valorUnitario: mora,
          precioVentaUnitario: mora,
          totalImpuestos: [
            {
              idImpuesto: '9998',
              montoImpuesto: '0.00',
              tipoAfectacion: '30',
              montoBase: mora,
              porcentaje: '0.00',
            },
          ],
          valorVenta: mora,
          montoTotalImpuestos: '0.00',
        },
      ],
    },
  };
  return {
    nombre: `${imp.ruc}-08-${serieNd}-${nroNd}.json`,
    contenido: json,
  };
}

async function ensureRcDataForImpresion(impresionId) {
  const rows = await query(
    `SELECT id, fecha_anulado, numero_anulado, estado
     FROM impresiones
     WHERE id = ?
     LIMIT 1`,
    [impresionId]
  );
  if (!rows?.length) return null;
  const imp = rows[0];
  const estado = String(imp.estado || '').toUpperCase();
  if (estado !== 'ANULADO') return null;
  let fecha = imp.fecha_anulado ? String(imp.fecha_anulado).slice(0, 10) : '';
  if (!fecha || fecha === '0000-00-00') {
    fecha = new Date().toISOString().slice(0, 10);
    await execute(`UPDATE impresiones SET fecha_anulado = ? WHERE id = ?`, [fecha, impresionId]);
  }
  let numeroAnulado = Number(imp.numero_anulado || 0);
  if (!numeroAnulado) {
    const cnt = await query(
      `SELECT COUNT(*) AS c
       FROM impresiones
       WHERE fecha_anulado = ? AND estado = 'ANULADO'`,
      [fecha]
    );
    numeroAnulado = Number(cnt?.[0]?.c || 0) + 1;
    await execute(`UPDATE impresiones SET numero_anulado = ? WHERE id = ?`, [numeroAnulado, impresionId]);
  }
  return { fecha_anulado: fecha, numero_anulado: numeroAnulado };
}

function buildLegacyJsonRcInafecta(imp) {
  const serie = legacySerieConPrefijo(imp.serie, imp.prefijo_boleta);
  const numero = legacyNumeroImpresion(imp.numero);
  const fechaAnulado = imp.fecha_anulado ? String(imp.fecha_anulado).slice(0, 10) : '';
  const nroAnulado = Number(imp.numero_anulado || 0);
  const monto = toFixed2(imp.monto);
  const json = {
    resumenComprobantes: {
      IDE: {
        numeracion: `RC-${fechaAnulado.replace(/-/g, '')}-${nroAnulado}`,
        fechaEmision: fechaAnulado,
        fechaReferencia: imp.fecha_impresion ? String(imp.fecha_impresion).slice(0, 10) : '',
      },
      EMI: {
        tipoDocId: '6',
        numeroDocId: String(imp.ruc || ''),
        razonSocial: String(imp.razon_social || imp.nombre_empresa || ''),
        direccion: String(imp.sede_direccion || ''),
      },
      DET: [
        {
          numeroItem: '1',
          monedaItem: 'PEN',
          numeracionItem: `${serie}-${numero}`,
          tipoComprobanteItem: '03',
          numeroDocIdAdq: String(imp.nro_documento || ''),
          tipoDocIdAdq: '1',
          estadoItem: '3',
          importeTotal: monto,
          inafectas: { codigo: '03', totalVentas: monto },
          totalImpuestos: [{ idImpuesto: '1000', montoImpuesto: '0.00' }],
        },
      ],
    },
  };
  return {
    nombre: `${imp.ruc}-RC-${fechaAnulado.replace(/-/g, '')}-${nroAnulado}.json`,
    contenido: json,
  };
}

function buildLegacyJsonRcNota(imp) {
  const nroNd = legacyNumeroImpresion(imp.numero);
  const serieNd = `BND${parseInt(String(imp.serie || '0'), 10)}`;
  const fechaAnulado = imp.fecha_anulado ? String(imp.fecha_anulado).slice(0, 10) : '';
  const nroAnulado = Number(imp.numero_anulado || 0);
  const mora = toFixed2(imp.mora);
  const json = {
    resumenComprobantes: {
      IDE: {
        numeracion: `RC-${fechaAnulado.replace(/-/g, '')}-${nroAnulado}`,
        fechaEmision: fechaAnulado,
        fechaReferencia: imp.fecha_impresion ? String(imp.fecha_impresion).slice(0, 10) : '',
      },
      EMI: {
        tipoDocId: '6',
        numeroDocId: String(imp.ruc || ''),
        razonSocial: String(imp.razon_social || imp.nombre_empresa || ''),
        direccion: String(imp.sede_direccion || ''),
      },
      DET: [
        {
          numeroItem: '1',
          monedaItem: 'PEN',
          numeracionItem: `${serieNd}-${nroNd}`,
          tipoComprobanteItem: '08',
          numeroDocIdAdq: String(imp.nro_documento || ''),
          tipoDocIdAdq: '1',
          estadoItem: '3',
          importeTotal: mora,
          inafectas: { codigo: '03', totalVentas: mora },
          totalImpuestos: [{ idImpuesto: '1000', montoImpuesto: '0.00' }],
        },
      ],
    },
  };
  return {
    nombre: `${imp.ruc}-RC-${fechaAnulado.replace(/-/g, '')}-${nroAnulado}.json`,
    contenido: json,
  };
}

const tableColumnsCache = new Map();

async function getTableColumns(tableName, conn = null) {
  if (tableColumnsCache.has(tableName)) return tableColumnsCache.get(tableName);
  const sql = `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`;
  const run = conn ? (q, p) => conn.execute(q, p) : (q, p) => mysqlReadPool.execute(q, p);
  const [rows] = await run(sql, [tableName]);
  const cols = new Set((rows || []).map((r) => String(r.COLUMN_NAME || '')));
  tableColumnsCache.set(tableName, cols);
  return cols;
}

async function ensureAdminPagoImpresionActiva({
  colegioId,
  pagoId,
  tipo,
  tipoDocumento,
}) {
  const conn = await mysqlReadPool.getConnection();
  try {
    await conn.beginTransaction();

    const [activeRows] = await conn.execute(
      `SELECT id, serie, numero, estado
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

    const useMora = tipo === 'MORA' && tipoDocumento === 'NOTA';
    const serieNum = useMora ? Number(cfg.serie_mora || 0) : Number(cfg.serie || 0);
    const numeroNum = useMora ? Number(cfg.numero_mora || 0) : Number(cfg.numero || 0);
    const nextField = useMora ? 'numero_mora' : 'numero';

    const cols = await getTableColumns('impresiones', conn);
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const mi = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    const today = `${yyyy}-${mm}-${dd}`;
    const nowTime = `${hh}:${mi}:${ss}`;

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
      `SELECT id, serie, numero, estado
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
      // ignore rollback error
    }
    return { ok: false, status: 500, error: e.message || 'No se pudo generar impresión' };
  } finally {
    conn.release();
  }
}

/**
 * Valor para input HTML `datetime-local` desde MySQL o ISO.
 * mysql2 devuelve DATETIME como `Date` en JS: `String(date)` es locale ("Mon Apr 14...") y no matchea ISO.
 */
function fechaHoraToDatetimeLocalInput(fh) {
  if (fh == null || fh === '') return '';
  if (Object.prototype.toString.call(fh) === '[object Date]' && !Number.isNaN(fh.getTime())) {
    const pad = (n) => String(n).padStart(2, '0');
    const y = fh.getFullYear();
    const mo = pad(fh.getMonth() + 1);
    const d = pad(fh.getDate());
    const h = pad(fh.getHours());
    const mi = pad(fh.getMinutes());
    return `${y}-${mo}-${d}T${h}:${mi}`;
  }
  const s = String(fh).trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})/);
  if (m) return `${m[1]}T${m[2]}:${m[3]}`;
  return '';
}

/** Valor para input `type="date"` desde MySQL DATE/DATETIME o `Date` (evita String(Date).slice(0,10) === "Mon Apr 14"). */
function fechaSqlOrDateToDateInput(fc) {
  if (fc == null || fc === '') return '';
  if (Object.prototype.toString.call(fc) === '[object Date]' && !Number.isNaN(fc.getTime())) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${fc.getFullYear()}-${pad(fc.getMonth() + 1)}-${pad(fc.getDate())}`;
  }
  const s = String(fc).trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  return '';
}

/**
 * Parsea y valida el cuerpo de alta/edición de pago (admin), alineado al legado PHP.
 * @returns {Promise<{ ok: true, …campos } | { ok: false, status?: number, error: string }>}
 */
async function parseAdminPagoRegistroBody(body, reqUser, colegio_id) {
  const b = body || {};
  const monto = parseFloat(b.monto);
  const mora = parseFloat(b.mora != null && b.mora !== '' ? b.mora : 0);
  if (!Number.isFinite(monto) || monto < 0) {
    return { ok: false, error: 'Monto inválido' };
  }
  if (!Number.isFinite(mora) || mora < 0) {
    return { ok: false, error: 'Mora inválida' };
  }

  const tipo = parseInt(b.tipo, 10);
  if (!Number.isFinite(tipo) || tipo < 0) {
    return { ok: false, error: 'Tipo de pago inválido' };
  }

  let nro_pago = parseInt(b.nro_pago != null && b.nro_pago !== '' ? b.nro_pago : 0, 10);
  if (!Number.isFinite(nro_pago) || nro_pago < 0) nro_pago = 0;
  if (tipo === 0) nro_pago = 0;
  if (tipo === 1 && nro_pago < 1) {
    return { ok: false, error: 'Indique el número de pensión (mes)' };
  }

  const estado_pago = String(b.estado_pago || '').toUpperCase();
  if (estado_pago !== 'CANCELADO' && estado_pago !== 'PENDIENTE') {
    return { ok: false, error: 'Estado de pago inválido' };
  }

  /** `pagos.fecha_hora` es NOT NULL en BD: valor neutro cuando el pago vuelve a pendiente (lista no muestra fecha). */
  const FECHA_HORA_PENDIENTE_DB = '1970-01-01 00:00:00';

  let fecha_hora;
  let fecha_cancelado = null;
  let descripcion = String(b.descripcion || '').trim();
  let observaciones = String(b.observaciones || '').trim();

  if (estado_pago === 'PENDIENTE') {
    fecha_hora = FECHA_HORA_PENDIENTE_DB;
    fecha_cancelado = null;
    descripcion = '';
    observaciones = '';
  } else {
    fecha_hora = String(b.fecha_hora || '').trim();
    if (!fecha_hora) {
      const d = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      fecha_hora = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
    } else {
      fecha_hora = fecha_hora.replace('T', ' ');
      if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(fecha_hora)) {
        fecha_hora = `${fecha_hora}:00`;
      }
    }
    if (estado_pago === 'CANCELADO') {
      let fc = String(b.fecha_cancelado || '').trim();
      if (!fc) {
        fc = new Date().toISOString().slice(0, 10);
      } else {
        fc = fc.slice(0, 10);
      }
      fecha_cancelado = fc;
    }
  }
  const forma_pago = String(b.forma_pago || 'EFECTIVO').toUpperCase();
  const tipo_tarjeta = String(b.tipo_tarjeta || '').trim();

  let personal_id = reqUser.personal_id && Number(reqUser.personal_id) > 0 ? Number(reqUser.personal_id) : null;
  if (personal_id) {
    const pr = await query('SELECT id FROM personal WHERE id = ? AND colegio_id = ? LIMIT 1', [personal_id, colegio_id]);
    if (!pr.length) personal_id = null;
  }
  if (!personal_id) {
    const pr2 = await query(
      'SELECT id FROM personal WHERE colegio_id = ? ORDER BY id ASC LIMIT 1',
      [colegio_id]
    );
    personal_id = pr2[0]?.id || null;
  }
  if (!personal_id) {
    return {
      ok: false,
      status: 400,
      error:
        'No hay personal en el colegio para asociar el pago. Registre al menos un trabajador o asocie su usuario a personal.',
    };
  }

  const colegioTarifa = await query(
    'SELECT comision_tarjeta_debito, comision_tarjeta_credito FROM colegios WHERE id = ? LIMIT 1',
    [colegio_id]
  );
  const comDeb = parseFloat(colegioTarifa[0]?.comision_tarjeta_debito) || 0;
  const comCred = parseFloat(colegioTarifa[0]?.comision_tarjeta_credito) || 0;
  const comision_tarjeta =
    forma_pago === 'TARJETA' ? (tipo_tarjeta === 'DEBITO' ? comDeb : comCred) : 0;

  return {
    ok: true,
    monto,
    mora,
    nro_pago,
    tipo,
    estado_pago,
    fecha_hora,
    fecha_cancelado,
    descripcion,
    observaciones,
    forma_pago,
    tipo_tarjeta,
    comision_tarjeta,
    personal_id,
  };
}

/** Título por palabras (PRESENCIAL VIRTUAL → Presencial Virtual). */
function formatoTextoLegible(val) {
  const s = String(val || '').trim();
  if (!s) return '';
  return s
    .split(/\s+/)
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : ''))
    .join(' ');
}

/**
 * Etiqueta por índice `matriculas.estado` — alineado a sistema-anterior:
 * Main/Models/TraitConstants.php → $ESTADOS_MATRICULA =
 *   ['REGULAR','IRREGULAR','RETIRADO','TRASLADO','TEMPORAL'] (índices 0..4)
 */
const ESTADOS_MATRICULA_LABELS = ['Regular', 'Irregular', 'Retirado', 'Traslado', 'Temporal'];

function estadoMatriculaDesdeCodigo(estado) {
  const e = Number(estado);
  if (Number.isFinite(e) && e >= 0 && e < ESTADOS_MATRICULA_LABELS.length) {
    return ESTADOS_MATRICULA_LABELS[e];
  }
  return `Cód. ${estado}`;
}

/**
 * Lista matrículas admin: `m.modalidad` (ENUM en BD, ver matriculas.modalidad).
 * Sin depender de columnas opcionales inexistentes.
 */
async function queryAlumnoMatriculasListRows(colegio_id, alumnoId) {
  const from = `
       FROM matriculas m
       INNER JOIN grupos g ON g.id = m.grupo_id AND g.colegio_id = m.colegio_id
       LEFT JOIN niveles n ON n.id = g.nivel_id
       LEFT JOIN turnos t ON t.id = g.turno_id
       WHERE m.alumno_id = ? AND m.colegio_id = ?
       ORDER BY g.anio DESC, g.grado ASC, g.seccion ASC`;

  const withModalidad = `SELECT m.id AS matricula_id, m.estado, m.costo_id, m.fecha_registro, m.grupo_id,
            m.modalidad AS modalidad_raw,
            g.anio, g.grado, g.seccion, n.nombre AS nivel_nombre,
            t.nombre AS turno_nombre`;
  const baseOnly = `SELECT m.id AS matricula_id, m.estado, m.costo_id, m.fecha_registro, m.grupo_id,
            g.anio, g.grado, g.seccion, n.nombre AS nivel_nombre,
            t.nombre AS turno_nombre`;

  try {
    return await query(withModalidad + from, [alumnoId, colegio_id]);
  } catch (e) {
    if (!isSqlUnknownColumnError(e)) throw e;
    return await query(baseOnly + from, [alumnoId, colegio_id]);
  }
}

function mapMatriculaListAdminRows(rows) {
  return (rows || []).map((r) => {
    const rawMod = r.modalidad_raw != null && String(r.modalidad_raw).trim() !== ''
      ? formatoTextoLegible(String(r.modalidad_raw).replace(/_/g, ' '))
      : '';
    return {
      ...r,
      grupo_texto: `${String(r.nivel_nombre || '').toUpperCase()} - ${r.grado || '—'}° ${r.seccion || ''} - ${r.anio || '—'}`
        .replace(/\s+/g, ' ')
        .trim(),
      estado_display: estadoMatriculaDesdeCodigo(r.estado),
      modalidad_texto: rawMod || null,
    };
  });
}

const personalFotoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = '/home/vanguard/nuevo.vanguardschools.edu.pe/Static/Image/Fotos';
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '') || '.jpg';
    const safe = ext.toLowerCase().replace(/[^.a-z0-9]/g, '');
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${safe}`);
  },
});

const uploadUsuarioFoto = multer({
  storage: personalFotoStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if ((file.mimetype || '').startsWith('image/')) return cb(null, true);
    cb(new Error('Solo se permiten imágenes'));
  },
});

function parsePageLimit(req) {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(200, Math.max(5, parseInt(req.query.limit, 10) || 50));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

function normalizarHora(valor, fallback = '08:00:00') {
  const raw = String(valor || '').trim();
  if (!raw) return fallback;
  const match = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return fallback;
  const hh = parseInt(match[1], 10);
  const mm = parseInt(match[2], 10);
  const ss = parseInt(match[3] || '0', 10);
  if (Number.isNaN(hh) || Number.isNaN(mm) || Number.isNaN(ss)) return fallback;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59 || ss < 0 || ss > 59) return fallback;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

const getBimestreActual = () => {
  const m = new Date().getMonth() + 1;
  return Math.min(4, Math.max(1, Math.ceil(m / 3)));
};

const getBimestreActualFromConfig = async (colegio_id, anio_activo) => {
  try {
    const rows = await query(
      'SELECT rangos_ciclos_notas FROM colegios WHERE id = ? LIMIT 1',
      [colegio_id]
    );
    if (!rows || rows.length === 0 || !rows[0].rangos_ciclos_notas) return getBimestreActual();

    let rangos = {};
    try {
      rangos = phpSerialize.unserialize(rows[0].rangos_ciclos_notas) || {};
    } catch (e) {
      try {
        rangos = JSON.parse(rows[0].rangos_ciclos_notas) || {};
      } catch (e2) {
        return getBimestreActual();
      }
    }

    const anio = parseInt(anio_activo, 10) || new Date().getFullYear();
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const parseDdMm = (str) => {
      if (!str || typeof str !== 'string') return null;
      const parts = str.trim().split('-');
      if (parts.length < 2) return null;
      const d = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      if (Number.isNaN(d) || Number.isNaN(m) || m < 1 || m > 12) return null;
      return new Date(anio, m - 1, d);
    };

    for (let ciclo = 1; ciclo <= 4; ciclo += 1) {
      const key = ciclo.toString();
      const r = rangos[key] || rangos[ciclo];
      if (!r || !r.inicio || !r.final) continue;
      const inicioDate = parseDdMm(r.inicio);
      const finalDate = parseDdMm(r.final);
      if (!inicioDate || !finalDate) continue;
      inicioDate.setHours(0, 0, 0, 0);
      finalDate.setHours(23, 59, 59, 999);
      if (hoy >= inicioDate && hoy <= finalDate) return ciclo;
    }
  } catch (err) {
    console.warn('getBimestreActualFromConfig admin:', err.message);
  }
  return getBimestreActual();
};

function getAvatarBaseUrlForReq(req) {
  if (process.env.NODE_ENV !== 'production') {
    return 'http://localhost:5000/api/static/avatars';
  }
  const host = req.get('x-forwarded-host') || req.get('host');
  let protocol = req.get('x-forwarded-proto') || req.protocol;
  if (!protocol || protocol === 'http') protocol = 'https';
  if (host) return `${protocol}://${host}/api/static/avatars`;
  const fallback = process.env.API_PUBLIC_URL || process.env.PHP_SYSTEM_URL || 'https://sistema.vanguardschools.edu.pe';
  return fallback.replace(/\/$/, '') + '/api/static/avatars';
}

async function usuarioLibre(colegioId, usuarioLogin, excludeUsuarioId = null) {
  const sql = excludeUsuarioId
    ? 'SELECT id FROM usuarios WHERE colegio_id = ? AND usuario = ? AND id != ? LIMIT 1'
    : 'SELECT id FROM usuarios WHERE colegio_id = ? AND usuario = ? LIMIT 1';
  const params = excludeUsuarioId
    ? [colegioId, usuarioLogin, excludeUsuarioId]
    : [colegioId, usuarioLogin];
  const rows = await query(sql, params);
  return rows.length === 0;
}

/**
 * JOIN optimizado para resolver usuario de apoderado:
 * 1) prioriza vínculo directo por apoderado_id
 * 2) fallback a cuenta de personal/docente con mismo DNI
 * Evita OR/TRIM en el JOIN principal para mejorar uso de índices.
 */
const SQL_JOIN_USUARIO_APODERADO_OPT = `
  LEFT JOIN (
    SELECT colegio_id, apoderado_id, MIN(id) AS usuario_id
    FROM usuarios
    WHERE apoderado_id > 0
    GROUP BY colegio_id, apoderado_id
  ) ua_idx ON ua_idx.colegio_id = ap.colegio_id AND ua_idx.apoderado_id = ap.id
  LEFT JOIN usuarios u_ap ON u_ap.id = ua_idx.usuario_id
  LEFT JOIN (
    SELECT colegio_id, usuario, MIN(id) AS usuario_id
    FROM usuarios
    WHERE personal_id > 0
    GROUP BY colegio_id, usuario
  ) up_idx ON up_idx.colegio_id = ap.colegio_id AND up_idx.usuario = ap.nro_documento
  LEFT JOIN usuarios u_per ON u_per.id = up_idx.usuario_id
`;

/**
 * Fila `usuarios` para una ficha apoderado: primero por apoderado_id, luego personal con mismo DNI.
 */
async function resolverUsuarioFilaParaApoderado(colegioId, apoderadoId) {
  const linked = await query(
    'SELECT id, tipo, estado, usuario, personal_id, apoderado_id FROM usuarios WHERE colegio_id = ? AND apoderado_id = ? LIMIT 1',
    [colegioId, apoderadoId]
  );
  if (linked.length) {
    return linked[0];
  }
  const apRows = await query(
    'SELECT nro_documento FROM apoderados WHERE id = ? AND colegio_id = ? LIMIT 1',
    [apoderadoId, colegioId]
  );
  if (!apRows.length) {
    return null;
  }
  const dni = String(apRows[0].nro_documento || '').trim();
  const staff = await query(
    `SELECT id, tipo, estado, usuario, personal_id, apoderado_id FROM usuarios
     WHERE colegio_id = ? AND TRIM(usuario) = ? AND personal_id > 0
     LIMIT 1`,
    [colegioId, dni]
  );
  return staff[0] || null;
}

// ——— Equipo (tabla personal + usuarios) ———

router.get('/equipo/tipos', (req, res) => {
  res.json({ tipos: TIPOS_PERSONAL });
});

router.get('/equipo', async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const { page, limit, offset } = parsePageLimit(req);
    const search = (req.query.search || '').trim();
    const perfil = (req.query.perfil || '').trim().toUpperCase();

    const whereParts = ['p.colegio_id = ?'];
    const params = [colegio_id];

    if (search) {
      const like = `%${search.replace(/%/g, '')}%`;
      whereParts.push(
        '(CONCAT(TRIM(p.apellidos), ", ", TRIM(p.nombres)) LIKE ? OR CONCAT(TRIM(p.nombres), " ", TRIM(p.apellidos)) LIKE ? OR p.nro_documento LIKE ? OR p.email LIKE ?)'
      );
      params.push(like, like, like, like);
    }

    if (perfil && TIPOS_PERSONAL_SET.has(perfil)) {
      whereParts.push(
        `EXISTS (
          SELECT 1
          FROM usuarios ux
          WHERE ux.personal_id = p.id
            AND ux.colegio_id = p.colegio_id
            AND ux.tipo = ?
        )`
      );
      params.push(perfil);
    }

    const whereSql = whereParts.join(' AND ');

    const countRows = await query(`SELECT COUNT(*) AS total FROM personal p WHERE ${whereSql}`, params);
    const total = countRows[0]?.total ?? 0;

    /** Orden de `?` en el SELECT: primero el subquery del JOIN (uu.tipo), luego los de WHERE (params), al final LIMIT/OFFSET. */
    const filtroPerfilRepresentativo =
      perfil && TIPOS_PERSONAL_SET.has(perfil) ? 'AND uu.tipo = ?' : '';
    const listParams = [];
    if (filtroPerfilRepresentativo) {
      listParams.push(perfil);
    }
    listParams.push(...params);
    listParams.push(limit, offset);
    const rows = await query(
      `SELECT p.id, p.nombres, p.apellidos, p.nro_documento, p.email, p.telefono_celular, p.cargo,
              p.foto, p.fecha_nacimiento,
              u.id AS usuario_id, u.tipo AS usuario_tipo, u.estado AS usuario_estado, u.usuario AS login_usuario
       FROM personal p
       LEFT JOIN usuarios u ON u.id = (
         SELECT uu.id
         FROM usuarios uu
         WHERE uu.personal_id = p.id
           AND uu.colegio_id = p.colegio_id
           ${filtroPerfilRepresentativo}
         ORDER BY (uu.estado = 'ACTIVO') DESC, uu.id ASC
         LIMIT 1
       )
       WHERE ${whereSql}
       ORDER BY p.apellidos ASC, p.nombres ASC
       LIMIT ? OFFSET ?`,
      listParams
    );

    res.json({ data: rows, total, page, limit });
  } catch (e) {
    console.error('GET /admin/usuarios/equipo', e);
    res.status(500).json({ error: e.message || 'Error al listar equipo' });
  }
});

router.get('/equipo/:personalId', async (req, res) => {
  try {
    const { colegio_id, anio_activo } = req.user;
    const personalId = parseInt(req.params.personalId, 10);
    if (!personalId) {
      return res.status(400).json({ error: 'ID inválido' });
    }
    const rows = await query(
      `SELECT p.*, u.id AS usuario_id, u.tipo AS usuario_tipo, u.estado AS usuario_estado, u.usuario AS login_usuario
       FROM personal p
       LEFT JOIN usuarios u ON u.personal_id = p.id AND u.colegio_id = p.colegio_id
       WHERE p.id = ? AND p.colegio_id = ?
       LIMIT 1`,
      [personalId, colegio_id]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'No encontrado' });
    }
    const cursosRows = await query(
      `SELECT DISTINCT c.nombre AS curso, g.anio, g.grado, g.seccion, n.nombre AS nivel
       FROM asignaturas a
       INNER JOIN cursos c ON c.id = a.curso_id
       INNER JOIN grupos g ON g.id = a.grupo_id
       LEFT JOIN niveles n ON n.id = g.nivel_id
       WHERE a.personal_id = ? AND a.colegio_id = ? AND g.anio = ?
       ORDER BY g.anio DESC, n.nombre ASC, g.grado ASC, g.seccion ASC, c.nombre ASC`,
      [personalId, colegio_id, anio_activo]
    );

    const tutoriaRows = await query(
      `SELECT g.id, g.anio, g.grado, g.seccion, n.nombre AS nivel
       FROM grupos g
       LEFT JOIN niveles n ON n.id = g.nivel_id
       WHERE g.tutor_id = ? AND g.colegio_id = ? AND g.anio = ?
       ORDER BY g.grado ASC, g.seccion ASC
       LIMIT 1`,
      [personalId, colegio_id, anio_activo]
    );

    const gruposMap = new Map();
    const cursosSet = new Set();
    for (const r of cursosRows) {
      const grupoTexto = `${r.nivel || ''} ${r.grado ? `${r.grado}°` : ''} ${r.seccion || ''} - ${r.anio || ''}`
        .replace(/\s+/g, ' ')
        .trim();
      if (grupoTexto) {
        gruposMap.set(grupoTexto, grupoTexto);
      }
      if (r.curso) {
        cursosSet.add(String(r.curso).trim());
      }
    }

    const dniPersonal = String(rows[0].nro_documento || '').trim();
    let hijos_como_alumnos = [];
    let otros_apoderados_hijos = [];
    try {
      const apoderadoSelfRows = dniPersonal
        ? await query(
            `SELECT id FROM apoderados WHERE colegio_id = ? AND TRIM(nro_documento) = ?`,
            [colegio_id, dniPersonal]
          )
        : [];
      const selfApoderadoIds = (apoderadoSelfRows || []).map((r) => r.id).filter((id) => id > 0);

      if (dniPersonal && selfApoderadoIds.length > 0) {
        const hijosRows = await query(
          `SELECT DISTINCT
              a.id AS alumno_id,
              a.nombres,
              a.apellido_paterno,
              a.apellido_materno,
              a.nro_documento,
              g.anio,
              g.grado,
              g.seccion,
              n.nombre AS nivel_nombre,
              m.estado AS matricula_estado
           FROM apoderados ap_self
           INNER JOIN familias f ON f.apoderado_id = ap_self.id
           INNER JOIN alumnos a ON a.id = f.alumno_id AND a.colegio_id = ap_self.colegio_id
           LEFT JOIN matriculas m ON m.id = (
             SELECT m2.id
             FROM matriculas m2
             INNER JOIN grupos g2 ON g2.id = m2.grupo_id AND g2.colegio_id = m2.colegio_id
             WHERE m2.alumno_id = a.id AND m2.colegio_id = a.colegio_id
             ORDER BY (m2.estado = 0 OR m2.estado = 4) DESC, g2.anio DESC, m2.id DESC
             LIMIT 1
           )
           LEFT JOIN grupos g ON g.id = m.grupo_id AND g.colegio_id = a.colegio_id
           LEFT JOIN niveles n ON n.id = g.nivel_id
           WHERE ap_self.colegio_id = ? AND ap_self.id IN (${selfApoderadoIds.map(() => '?').join(',')})
           ORDER BY a.apellido_paterno, a.apellido_materno, a.nombres`,
          [colegio_id, ...selfApoderadoIds]
        );
        hijos_como_alumnos = (hijosRows || []).map((h) => {
          const grupoTxt = `${h.nivel_nombre || ''} ${h.grado ? `${h.grado}°` : ''} ${h.seccion || ''} - ${h.anio || ''}`
            .replace(/\s+/g, ' ')
            .trim();
          const est = h.matricula_estado;
          const vigente = est === 0 || est === 4;
          return {
            alumno_id: h.alumno_id,
            nombres: h.nombres || '',
            apellido_paterno: h.apellido_paterno || '',
            apellido_materno: h.apellido_materno || '',
            nro_documento: h.nro_documento != null ? String(h.nro_documento).trim() : '',
            grupo_texto: grupoTxt || '—',
            matricula_estado: est,
            matricula_vigente: vigente,
          };
        });

        const alumnoIds = [...new Set(hijos_como_alumnos.map((h) => h.alumno_id).filter(Boolean))];
        if (alumnoIds.length > 0) {
          const ph = alumnoIds.map(() => '?').join(',');
          const exPh = selfApoderadoIds.map(() => '?').join(',');
          const otrosRows = await query(
            `SELECT DISTINCT
                ap.id,
                ap.nombres,
                ap.apellido_paterno,
                ap.apellido_materno,
                ap.nro_documento,
                ap.email,
                ap.telefono_celular,
                ap.parentesco,
                u.id AS usuario_id
             FROM familias f
             INNER JOIN apoderados ap ON ap.id = f.apoderado_id AND ap.colegio_id = ?
             LEFT JOIN usuarios u ON u.apoderado_id = ap.id AND u.colegio_id = ap.colegio_id
             WHERE f.alumno_id IN (${ph})
               AND ap.id NOT IN (${exPh})
             ORDER BY ap.apellido_paterno, ap.apellido_materno, ap.nombres`,
            [colegio_id, ...alumnoIds, ...selfApoderadoIds]
          );
          otros_apoderados_hijos = (otrosRows || []).map((ap) => ({
            id: ap.id,
            nombres: ap.nombres || '',
            apellido_paterno: ap.apellido_paterno || '',
            apellido_materno: ap.apellido_materno || '',
            nro_documento: ap.nro_documento != null ? String(ap.nro_documento).trim() : '',
            email: ap.email || '',
            telefono_celular: ap.telefono_celular || '',
            parentesco: ap.parentesco || '',
            usuario_id: ap.usuario_id || null,
          }));
        }
      }
    } catch (famErr) {
      console.warn('[GET equipo/:id] hijos/apoderados familias:', famErr.message);
    }

    res.json({
      ...rows[0],
      grupos_cargo: Array.from(gruposMap.values()),
      cursos_ensena: Array.from(cursosSet.values()),
      tutoria: tutoriaRows[0]
        ? `${tutoriaRows[0].nivel || ''} ${tutoriaRows[0].grado ? `${tutoriaRows[0].grado}°` : ''} ${tutoriaRows[0].seccion || ''} - ${tutoriaRows[0].anio || ''}`
            .replace(/\s+/g, ' ')
            .trim()
        : '',
      hijos_como_alumnos,
      otros_apoderados_hijos,
    });
  } catch (e) {
      console.error('GET /admin/usuarios/equipo/:id', e);
      res.status(500).json({ error: e.message || 'Error al obtener registro' });
  }
});

/** Valores por defecto para columnas obligatorias de `personal` (compat. legado PHP). */
function defaultsNuevoPersonal(colegioId, body) {
  const hoy = new Date().toISOString().slice(0, 10);
  return {
    colegio_id: colegioId,
    sexo: 0,
    telefono_fijo: body.telefono_fijo != null ? String(body.telefono_fijo) : '',
    telefono_celular: body.telefono_celular != null ? String(body.telefono_celular) : '',
    linea_celular: 0,
    direccion: body.direccion != null ? String(body.direccion) : '',
    foto: '',
    nombres: String(body.nombres || '').trim(),
    apellidos: String(body.apellidos || '').trim(),
    tipo_documento: parseInt(body.tipo_documento, 10) || 1,
    nro_documento: String(body.nro_documento || '').trim(),
    grado_instruccion: 0,
    profesion: body.profesion != null ? String(body.profesion).trim() : '',
    cargo: body.cargo != null ? String(body.cargo).trim() : '',
    email: String(body.email || '').trim(),
    fecha_nacimiento: body.fecha_nacimiento || '2000-01-01',
    pais_nacimiento_id: 0,
    estado_civil: 0,
    tipo_contrato: 0,
    observaciones: '',
    departamento_nacimiento_id: 0,
    provincia_nacimiento_id: 0,
    distrito_nacimiento_id: 0,
    domicilio_pais_id: 0,
    domicilio_departamento_id: 0,
    domicilio_provincia_id: 0,
    domicilio_distrito_id: 0,
    fecha_ingreso: body.fecha_ingreso ? String(body.fecha_ingreso).slice(0, 10) : hoy,
    hora_entrada: normalizarHora(body.hora_entrada, '08:00:00'),
    hora_salida: normalizarHora(body.hora_salida, '17:00:00'),
    resena: '',
    mostrar_app: 'NO',
    link_aula: '',
  };
}

async function insertUsuarioPersonal(colegioId, personalId, dni, tipo) {
  const exists = await query(
    'SELECT id FROM usuarios WHERE colegio_id = ? AND personal_id = ? LIMIT 1',
    [colegioId, personalId]
  );
  if (exists.length) {
    const err = new Error('El personal ya tiene usuario vinculado');
    err.code = 'PERSONAL_USUARIO_DUPLICADO';
    throw err;
  }
  const pwd = sha1Password(dni);
  const result = await execute(
    `INSERT INTO usuarios (
       colegio_id, alumno_id, personal_id, apoderado_id, usuario, password, tipo, estado,
       ms_email, ms_access_token, ms_refresh_token, ms_id_token, auth_token, permisos,
       cambiar_password, app_terminos_aceptados, cambiar_datos
     ) VALUES (?, 0, ?, 0, ?, ?, ?, 'ACTIVO', '', '', '', '', '', '', 'NO', 'NO', 'SI')`,
    [colegioId, personalId, dni, pwd, tipo]
  );
  return result.insertId;
}

router.post('/equipo', uploadUsuarioFoto.single('foto'), async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const tipo = String(req.body.tipo || '').toUpperCase();
    if (!TIPOS_PERSONAL_SET.has(tipo)) {
      return res.status(400).json({ error: 'Tipo de usuario no válido para personal' });
    }
    const d = defaultsNuevoPersonal(colegio_id, req.body);
    if (req.file?.filename) {
      d.foto = req.file.filename;
    }
    if (!d.nombres || !d.apellidos || !d.nro_documento) {
      return res.status(400).json({ error: 'Nombres, apellidos y DNI son obligatorios' });
    }

    const ocupado = await query(
      'SELECT id FROM personal WHERE colegio_id = ? AND nro_documento = ? LIMIT 1',
      [colegio_id, d.nro_documento]
    );
    if (ocupado.length) {
      return res.status(409).json({ error: 'Ya existe personal con ese DNI' });
    }
    if (!(await usuarioLibre(colegio_id, d.nro_documento))) {
      return res.status(409).json({ error: 'Ya existe un usuario con ese DNI' });
    }

    await execute(
      `INSERT INTO personal (
        colegio_id, sexo, telefono_fijo, telefono_celular, linea_celular, direccion, foto,
        nombres, apellidos, tipo_documento, nro_documento, grado_instruccion, profesion, cargo, email,
        fecha_nacimiento, pais_nacimiento_id, estado_civil, tipo_contrato, observaciones,
        departamento_nacimiento_id, provincia_nacimiento_id, distrito_nacimiento_id,
        domicilio_pais_id, domicilio_departamento_id, domicilio_provincia_id, domicilio_distrito_id,
        fecha_ingreso, hora_entrada, hora_salida, resena, mostrar_app, link_aula
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        d.colegio_id,
        d.sexo,
        d.telefono_fijo,
        d.telefono_celular,
        d.linea_celular,
        d.direccion,
        d.foto,
        d.nombres,
        d.apellidos,
        d.tipo_documento,
        d.nro_documento,
        d.grado_instruccion,
        d.profesion,
        d.cargo,
        d.email,
        d.fecha_nacimiento,
        d.pais_nacimiento_id,
        d.estado_civil,
        d.tipo_contrato,
        d.observaciones,
        d.departamento_nacimiento_id,
        d.provincia_nacimiento_id,
        d.distrito_nacimiento_id,
        d.domicilio_pais_id,
        d.domicilio_departamento_id,
        d.domicilio_provincia_id,
        d.domicilio_distrito_id,
        d.fecha_ingreso,
        d.hora_entrada,
        d.hora_salida,
        d.resena,
        d.mostrar_app,
        d.link_aula,
      ]
    );

    const [last] = await query(
      'SELECT id FROM personal WHERE colegio_id = ? AND nro_documento = ? ORDER BY id DESC LIMIT 1',
      [colegio_id, d.nro_documento]
    );
    const personalId = last?.id;
    if (!personalId) {
      return res.status(500).json({ error: 'No se pudo obtener el personal creado' });
    }

    const usuarioId = await insertUsuarioPersonal(colegio_id, personalId, d.nro_documento, tipo);
    res.status(201).json({ personal_id: personalId, usuario_id: usuarioId });
  } catch (e) {
    console.error('POST /admin/usuarios/equipo', e);
    if (e.code === 'PERSONAL_USUARIO_DUPLICADO') {
      return res.status(409).json({ error: 'Este personal ya tiene un usuario vinculado' });
    }
    if (e.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'DNI o usuario duplicado' });
    }
    res.status(500).json({ error: e.message || 'Error al crear personal' });
  }
});

router.put('/equipo/:personalId', async (req, res) => {
  try {
    const { colegio_id, usuario_id: adminUsuarioId } = req.user;
    const personalId = parseInt(req.params.personalId, 10);
    if (!personalId) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    const exist = await query(
      'SELECT id, nro_documento FROM personal WHERE id = ? AND colegio_id = ? LIMIT 1',
      [personalId, colegio_id]
    );
    if (!exist.length) {
      return res.status(404).json({ error: 'No encontrado' });
    }

    const urows = await query(
      'SELECT id, usuario, tipo FROM usuarios WHERE personal_id = ? AND colegio_id = ? LIMIT 1',
      [personalId, colegio_id]
    );
    const usuarioRow = urows[0];

    const nombres = req.body.nombres != null ? String(req.body.nombres).trim() : null;
    const apellidos = req.body.apellidos != null ? String(req.body.apellidos).trim() : null;
    const email = req.body.email != null ? String(req.body.email).trim() : null;
    const telefono_celular = req.body.telefono_celular != null ? String(req.body.telefono_celular) : null;
    const cargo = req.body.cargo != null ? String(req.body.cargo).trim() : null;
    const profesion = req.body.profesion != null ? String(req.body.profesion).trim() : null;
    const fecha_ingreso = req.body.fecha_ingreso != null ? String(req.body.fecha_ingreso).slice(0, 10) : null;
    const hora_entrada = req.body.hora_entrada != null ? normalizarHora(req.body.hora_entrada, '08:00:00') : null;
    const hora_salida = req.body.hora_salida != null ? normalizarHora(req.body.hora_salida, '17:00:00') : null;
    const fecha_nacimiento = req.body.fecha_nacimiento != null ? String(req.body.fecha_nacimiento).slice(0, 10) : null;
    const nro_documento = req.body.nro_documento != null ? String(req.body.nro_documento).trim() : null;

    if (nro_documento && nro_documento !== exist[0].nro_documento) {
      const dupP = await query(
        'SELECT id FROM personal WHERE colegio_id = ? AND nro_documento = ? AND id != ? LIMIT 1',
        [colegio_id, nro_documento, personalId]
      );
      if (dupP.length) {
        return res.status(409).json({ error: 'Otro registro ya usa ese DNI' });
      }
      if (!(await usuarioLibre(colegio_id, nro_documento, usuarioRow?.id))) {
        return res.status(409).json({ error: 'El DNI ya está en uso como usuario' });
      }
    }

    const sets = [];
    const params = [];
    if (nombres != null) {
      sets.push('nombres = ?');
      params.push(nombres);
    }
    if (apellidos != null) {
      sets.push('apellidos = ?');
      params.push(apellidos);
    }
    if (email != null) {
      sets.push('email = ?');
      params.push(email);
    }
    if (telefono_celular != null) {
      sets.push('telefono_celular = ?');
      params.push(telefono_celular);
    }
    if (cargo != null) {
      sets.push('cargo = ?');
      params.push(cargo);
    }
    if (profesion != null) {
      sets.push('profesion = ?');
      params.push(profesion);
    }
    if (fecha_ingreso != null) {
      sets.push('fecha_ingreso = ?');
      params.push(fecha_ingreso);
    }
    if (hora_entrada != null) {
      sets.push('hora_entrada = ?');
      params.push(hora_entrada);
    }
    if (hora_salida != null) {
      sets.push('hora_salida = ?');
      params.push(hora_salida);
    }
    if (fecha_nacimiento != null) {
      sets.push('fecha_nacimiento = ?');
      params.push(fecha_nacimiento);
    }
    if (nro_documento != null) {
      sets.push('nro_documento = ?');
      params.push(nro_documento);
    }

    if (sets.length) {
      params.push(personalId, colegio_id);
      await execute(`UPDATE personal SET ${sets.join(', ')} WHERE id = ? AND colegio_id = ?`, params);
    }

    const nuevoDoc = nro_documento != null ? nro_documento : exist[0].nro_documento;

    if (usuarioRow) {
      const nuevoTipo = req.body.tipo != null ? String(req.body.tipo).toUpperCase() : null;
      const nuevoEstado = req.body.usuario_estado != null ? String(req.body.usuario_estado).toUpperCase() : null;

      if (nuevoTipo != null) {
        if (!TIPOS_PERSONAL_SET.has(nuevoTipo)) {
          return res.status(400).json({ error: 'Tipo no válido' });
        }
        await execute('UPDATE usuarios SET tipo = ? WHERE id = ? AND colegio_id = ?', [
          nuevoTipo,
          usuarioRow.id,
          colegio_id,
        ]);
      }

      if (nuevoEstado === 'ACTIVO' || nuevoEstado === 'INACTIVO') {
        if (parseInt(usuarioRow.id, 10) === parseInt(adminUsuarioId, 10) && nuevoEstado === 'INACTIVO') {
          return res.status(400).json({ error: 'No puede desactivar su propio usuario' });
        }
        await execute('UPDATE usuarios SET estado = ? WHERE id = ? AND colegio_id = ?', [
          nuevoEstado,
          usuarioRow.id,
          colegio_id,
        ]);
      }

      if (nro_documento != null && nro_documento !== usuarioRow.usuario) {
        await execute('UPDATE usuarios SET usuario = ? WHERE id = ? AND colegio_id = ?', [
          nuevoDoc,
          usuarioRow.id,
          colegio_id,
        ]);
      }
    }

    res.json({ ok: true });
  } catch (e) {
    console.error('PUT /admin/usuarios/equipo/:id', e);
    res.status(500).json({ error: e.message || 'Error al actualizar' });
  }
});

router.put('/equipo/:personalId/foto', uploadUsuarioFoto.single('foto'), async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const personalId = parseInt(req.params.personalId, 10);
    if (!personalId) {
      return res.status(400).json({ error: 'ID inválido' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Debe adjuntar una imagen' });
    }

    const exist = await query('SELECT id FROM personal WHERE id = ? AND colegio_id = ? LIMIT 1', [personalId, colegio_id]);
    if (!exist.length) {
      return res.status(404).json({ error: 'No encontrado' });
    }

    await execute('UPDATE personal SET foto = ? WHERE id = ? AND colegio_id = ?', [req.file.filename, personalId, colegio_id]);
    res.json({ ok: true, foto: req.file.filename });
  } catch (e) {
    console.error('PUT /admin/usuarios/equipo/:personalId/foto', e);
    res.status(500).json({ error: e.message || 'Error al actualizar foto' });
  }
});

router.post('/equipo/:personalId/acceso', async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const personalId = parseInt(req.params.personalId, 10);
    const tipo = String(req.body.tipo || 'DOCENTE').toUpperCase();
    if (!TIPOS_PERSONAL_SET.has(tipo)) {
      return res.status(400).json({ error: 'Tipo no válido' });
    }

    const prow = await query(
      'SELECT id, nro_documento FROM personal WHERE id = ? AND colegio_id = ? LIMIT 1',
      [personalId, colegio_id]
    );
    if (!prow.length) {
      return res.status(404).json({ error: 'Personal no encontrado' });
    }
    const tiene = await query(
      'SELECT id FROM usuarios WHERE personal_id = ? AND colegio_id = ? LIMIT 1',
      [personalId, colegio_id]
    );
    if (tiene.length) {
      return res.status(409).json({ error: 'Este personal ya tiene acceso' });
    }
    const dni = prow[0].nro_documento;
    if (!(await usuarioLibre(colegio_id, dni))) {
      return res.status(409).json({ error: 'El DNI ya está registrado como otro usuario' });
    }
    const usuarioId = await insertUsuarioPersonal(colegio_id, personalId, dni, tipo);
    res.status(201).json({ usuario_id: usuarioId });
  } catch (e) {
    console.error('POST acceso equipo', e);
    if (e.code === 'PERSONAL_USUARIO_DUPLICADO') {
      return res.status(409).json({ error: 'Este personal ya tiene un usuario vinculado' });
    }
    res.status(500).json({ error: e.message || 'Error al crear acceso' });
  }
});

router.post('/equipo/:personalId/reset-password', async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const personalId = parseInt(req.params.personalId, 10);
    const urows = await query(
      `SELECT u.id, p.nro_documento
       FROM usuarios u
       INNER JOIN personal p ON p.id = u.personal_id AND p.colegio_id = u.colegio_id
       WHERE u.personal_id = ? AND u.colegio_id = ? LIMIT 1`,
      [personalId, colegio_id]
    );
    if (!urows.length) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    const pwd = sha1Password(urows[0].nro_documento);
    await execute('UPDATE usuarios SET password = ?, cambiar_password = ? WHERE id = ? AND colegio_id = ?', [
      pwd,
      'NO',
      urows[0].id,
      colegio_id,
    ]);
    res.json({ ok: true });
  } catch (e) {
    console.error('reset-password equipo', e);
    res.status(500).json({ error: e.message || 'Error al restablecer' });
  }
});

router.post('/equipo/:personalId/password', async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const personalId = parseInt(req.params.personalId, 10);
    const password = String(req.body.password || '').trim();
    if (!personalId) {
      return res.status(400).json({ error: 'ID inválido' });
    }
    if (password.length < 4) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 4 caracteres' });
    }
    const urows = await query(
      'SELECT id FROM usuarios WHERE personal_id = ? AND colegio_id = ? LIMIT 1',
      [personalId, colegio_id]
    );
    if (!urows.length) {
      return res.status(404).json({ error: 'Usuario no encontrado para este personal' });
    }
    const pwd = sha1Password(password);
    await execute('UPDATE usuarios SET password = ?, cambiar_password = ? WHERE id = ? AND colegio_id = ?', [
      pwd,
      'NO',
      urows[0].id,
      colegio_id,
    ]);
    res.json({ ok: true });
  } catch (e) {
    console.error('password equipo', e);
    res.status(500).json({ error: e.message || 'Error al cambiar contraseña' });
  }
});

router.get('/equipo/:personalId/horario', async (req, res) => {
  try {
    const { colegio_id, anio_activo } = req.user;
    const personalId = parseInt(req.params.personalId, 10);
    if (!personalId) {
      return res.status(400).json({ error: 'ID inválido' });
    }
    const prow = await query(
      'SELECT id, nombres, apellidos FROM personal WHERE id = ? AND colegio_id = ? LIMIT 1',
      [personalId, colegio_id]
    );
    if (!prow.length) {
      return res.status(404).json({ error: 'Personal no encontrado' });
    }

    const anioActivoInt = parseInt(anio_activo, 10);
    if (!Number.isFinite(anioActivoInt)) {
      return res.json({ docente: prow[0], horario: [], anio: null });
    }

    const horarioCrudo = await query(
      `SELECT 
         gh.id,
         gh.dia,
         gh.hora_inicio,
         gh.hora_final,
         gh.anio,
         c.nombre        AS curso_nombre,
         gh.descripcion  AS descripcion,
         g.grado,
         g.seccion,
         n.nombre        AS nivel_nombre
       FROM grupos_horarios gh
       LEFT JOIN asignaturas a ON a.id = gh.asignatura_id
       LEFT JOIN grupos g      ON g.id = COALESCE(a.grupo_id, gh.grupo_id)
       LEFT JOIN niveles n     ON n.id = g.nivel_id
       LEFT JOIN cursos c      ON c.id = a.curso_id
       WHERE gh.anio = ?
         AND (a.personal_id = ? OR gh.personal_id = ?)
       ORDER BY gh.dia, 
         TIME(STR_TO_DATE(gh.hora_inicio, '%l:%i %p')),
         COALESCE(TIME(STR_TO_DATE(gh.hora_inicio, '%H:%i:%s')), TIME(STR_TO_DATE(gh.hora_inicio, '%H:%i')))`,
      [anioActivoInt, personalId, personalId]
    );

    const horario = (horarioCrudo || []).map((row) => {
      const gradoTexto = row.grado ? `${row.grado}°` : '';
      let grupo = `${row.nivel_nombre || ''} ${gradoTexto} ${row.seccion || ''}`.trim();
      if (row.anio) {
        grupo = `${grupo} - ${row.anio}`.trim();
      }
      return {
        id: row.id,
        dia: typeof row.dia === 'number' ? row.dia : parseInt(row.dia || 0, 10),
        inicio: row.hora_inicio,
        fin: row.hora_final,
        titulo: row.curso_nombre || row.descripcion || '—',
        grupo,
      };
    });

    res.json({
      docente: prow[0],
      horario,
      anio: anioActivoInt,
    });
  } catch (e) {
    console.error('horario equipo', e);
    res.status(500).json({ error: e.message || 'Error al obtener horario' });
  }
});

router.delete('/equipo/:personalId', async (req, res) => {
  try {
    const { colegio_id, usuario_id: adminUsuarioId } = req.user;
    const personalId = parseInt(req.params.personalId, 10);
    if (!personalId) {
      return res.status(400).json({ error: 'ID inválido' });
    }
    const prow = await query(
      'SELECT id, nro_documento FROM personal WHERE id = ? AND colegio_id = ? LIMIT 1',
      [personalId, colegio_id]
    );
    if (!prow.length) {
      return res.status(404).json({ error: 'Personal no encontrado' });
    }

    const asignaturas = await query(
      'SELECT COUNT(*) AS n FROM asignaturas WHERE personal_id = ?',
      [personalId]
    );
    if ((asignaturas[0]?.n || 0) > 0) {
      return res.status(409).json({
        error: 'No se puede eliminar: este personal tiene cursos/asignaturas asignados.',
      });
    }

    const horarios = await query(
      'SELECT COUNT(*) AS n FROM grupos_horarios WHERE personal_id = ?',
      [personalId]
    );
    if ((horarios[0]?.n || 0) > 0) {
      return res.status(409).json({
        error: 'No se puede eliminar: este personal tiene horarios registrados.',
      });
    }

    const urows = await query(
      'SELECT id FROM usuarios WHERE personal_id = ? AND colegio_id = ?',
      [personalId, colegio_id]
    );
    for (const u of urows) {
      if (parseInt(u.id, 10) === parseInt(adminUsuarioId, 10)) {
        return res.status(400).json({ error: 'No puede eliminar su propio usuario.' });
      }
      await execute('DELETE FROM usuarios WHERE id = ? AND colegio_id = ?', [u.id, colegio_id]);
    }

    await execute('DELETE FROM personal WHERE id = ? AND colegio_id = ?', [personalId, colegio_id]);
    res.json({ ok: true });
  } catch (e) {
    console.error('DELETE equipo', e);
    res.status(500).json({ error: e.message || 'Error al eliminar personal' });
  }
});

// ——— Alumnos ———

const ALUMNO_DEFAULTS = {
  estado_civil: 0,
  tipo_documento: 1,
  pais_nacimiento_id: 0,
  departamento_nacimiento_id: 0,
  provincia_nacimiento_id: 0,
  distrito_nacimiento_id: 0,
  sexo: 0,
  foto: '',
  observaciones: '',
  nro_hermanos: 0,
  lugar_hermanos: 0,
  religion: 0,
  lengua_materna: 0,
  segunda_lengua: 0,
  codigo: '',
  discapacidad: '',
  domicilio: '',
  estado_nacimiento: 0,
  observaciones_nacimiento: '',
  actividades_nacimiento: '',
  controles_peso_talla: '',
  otros_controles: '',
  alergias: '',
  experiencias_traumaticas: '',
  tipo_sangre: 0,
  enfermedades_sufridas: '',
  vacunas: '',
  trabajos: '',
  foto_dni: '',
  registro_desde: 'SISTEMA',
  seguro_id: 0,
};

router.get('/alumnos', async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const { page, limit, offset } = parsePageLimit(req);
    const search = (req.query.search || '').trim();

    const whereParts = ['a.colegio_id = ?'];
    const params = [colegio_id];
    if (search) {
      const like = `%${search.replace(/%/g, '')}%`;
      whereParts.push(
        '(a.nro_documento LIKE ? OR a.nombres LIKE ? OR a.apellido_paterno LIKE ? OR a.apellido_materno LIKE ?)'
      );
      params.push(like, like, like, like);
    }
    const whereSql = whereParts.join(' AND ');

    const countRows = await query(
      `SELECT COUNT(*) AS total FROM alumnos a WHERE ${whereSql}`,
      params
    );
    const total = countRows[0]?.total ?? 0;

    const rows = await query(
      `SELECT a.id, a.nombres, a.apellido_paterno, a.apellido_materno, a.nro_documento, a.fecha_nacimiento, a.foto, a.email,
              u.id AS usuario_id, u.usuario AS login_usuario, u.estado AS usuario_estado
       FROM alumnos a
       LEFT JOIN usuarios u ON u.alumno_id = a.id AND u.colegio_id = a.colegio_id AND u.tipo = 'ALUMNO'
       WHERE ${whereSql}
       ORDER BY a.apellido_paterno, a.apellido_materno, a.nombres
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    res.json({ data: rows, total, page, limit });
  } catch (e) {
    console.error('GET alumnos admin', e);
    res.status(500).json({ error: e.message || 'Error al listar alumnos' });
  }
});

/** Buscar alumno por DNI (mismo colegio). Para vincular desde ficha apoderado. */
router.get('/alumnos/por-dni', async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const dni = String(req.query.dni || '').trim();
    if (!dni) {
      return res.status(400).json({ error: 'Indique el DNI' });
    }
    const rows = await query(
      `SELECT a.id, a.nombres, a.apellido_paterno, a.apellido_materno, a.nro_documento, a.fecha_nacimiento, a.email
       FROM alumnos a
       WHERE a.colegio_id = ? AND TRIM(a.nro_documento) = ?
       LIMIT 1`,
      [colegio_id, dni]
    );
    if (!rows.length) {
      return res.json({ encontrado: false });
    }
    res.json({ encontrado: true, alumno: rows[0] });
  } catch (e) {
    console.error('GET alumnos/por-dni', e);
    res.status(500).json({ error: e.message || 'Error al buscar' });
  }
});

router.get('/alumnos/:id', async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const id = parseInt(req.params.id, 10);
    const rows = await query(
      `SELECT a.*,
              u.id AS usuario_id, u.usuario AS login_usuario, u.estado AS usuario_estado, u.tipo AS usuario_tipo
       FROM alumnos a
       LEFT JOIN usuarios u ON u.alumno_id = a.id AND u.colegio_id = a.colegio_id AND u.tipo = 'ALUMNO'
       WHERE a.id = ? AND a.colegio_id = ?
       LIMIT 1`,
      [id, colegio_id]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'No encontrado' });
    }
    const alumno = rows[0];

    let avatar_asignado_url = null;
    try {
      const bimestre = await getBimestreActualFromConfig(colegio_id, req.user?.anio_activo);
      const sexoAv = alumno.sexo !== null && alumno.sexo !== undefined ? alumno.sexo : 0;
      let bases = await query(
        'SELECT id, imagen_base FROM avatar_bases WHERE bimestre = ? AND sexo = ? LIMIT 1',
        [bimestre, sexoAv]
      );
      if (!bases.length) {
        bases = await query('SELECT id, imagen_base FROM avatar_bases WHERE bimestre = ? LIMIT 1', [bimestre]);
      }
      if (bases.length > 0) {
        const base = bases[0];
        const equipado = await query(
          'SELECT accesorio_id FROM alumno_avatar_equipado WHERE student_id = ? AND avatar_base_id = ? LIMIT 1',
          [id, base.id]
        );
        const accesorioId = equipado[0]?.accesorio_id;
        const baseUrl = getAvatarBaseUrlForReq(req);
        if (accesorioId) {
          const acc = await query('SELECT imagen_combinada FROM avatar_accesorios WHERE id = ? LIMIT 1', [accesorioId]);
          if (acc.length > 0 && acc[0].imagen_combinada) {
            avatar_asignado_url = `${baseUrl}/${acc[0].imagen_combinada}`;
          }
        }
        if (!avatar_asignado_url && base.imagen_base) {
          avatar_asignado_url = `${baseUrl}/${base.imagen_base}`;
        }
      }
    } catch (e) {
      const msg = String(e.message || '').toLowerCase();
      const esTablaFaltante = msg.includes("doesn't exist") || msg.includes('avatar_bases') || msg.includes('avatar_accesorios') || msg.includes('alumno_avatar_equipado');
      if (!esTablaFaltante) {
        console.warn('GET alumno admin avatar:', e.message);
      }
    }

    res.json({ ...alumno, avatar_asignado_url });
  } catch (e) {
    console.error('GET alumno admin', e);
    res.status(500).json({ error: e.message || 'Error' });
  }
});

router.post('/alumnos', uploadUsuarioFoto.single('foto'), async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const ap = String(req.body.apellido_paterno || '').trim();
    const am = String(req.body.apellido_materno || '').trim();
    const nom = String(req.body.nombres || '').trim();
    const doc = String(req.body.nro_documento || '').trim();
    const fn = req.body.fecha_nacimiento || '2000-01-01';
    if (!ap || !nom || !doc) {
      return res.status(400).json({ error: 'Apellido paterno, nombres y DNI son obligatorios' });
    }

    const dup = await query(
      'SELECT id FROM alumnos WHERE colegio_id = ? AND nro_documento = ? LIMIT 1',
      [colegio_id, doc]
    );
    if (dup.length) {
      return res.status(409).json({ error: 'Ya existe un alumno con ese DNI' });
    }
    if (!(await usuarioLibre(colegio_id, doc))) {
      return res.status(409).json({ error: 'El DNI ya está en uso como usuario' });
    }

    const email = String(req.body.email || '').trim();
    const foto = req.file?.filename || ALUMNO_DEFAULTS.foto;
    const hoy = new Date().toISOString().slice(0, 10);

    await execute(
      `INSERT INTO alumnos (
        colegio_id, apellido_paterno, apellido_materno, nombres, estado_civil, tipo_documento, nro_documento, fecha_nacimiento,
        pais_nacimiento_id, departamento_nacimiento_id, provincia_nacimiento_id, distrito_nacimiento_id,
        sexo, email, foto, fecha_inscripcion, observaciones, nro_hermanos, lugar_hermanos, religion, lengua_materna, segunda_lengua,
        codigo, discapacidad, domicilio, estado_nacimiento, observaciones_nacimiento, actividades_nacimiento, controles_peso_talla,
        otros_controles, alergias, experiencias_traumaticas, tipo_sangre, enfermedades_sufridas, vacunas, trabajos, foto_dni, registro_desde, seguro_id
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        colegio_id,
        ap,
        am,
        nom,
        ALUMNO_DEFAULTS.estado_civil,
        ALUMNO_DEFAULTS.tipo_documento,
        doc,
        fn.slice(0, 10),
        ALUMNO_DEFAULTS.pais_nacimiento_id,
        ALUMNO_DEFAULTS.departamento_nacimiento_id,
        ALUMNO_DEFAULTS.provincia_nacimiento_id,
        ALUMNO_DEFAULTS.distrito_nacimiento_id,
        ALUMNO_DEFAULTS.sexo,
        email,
        foto,
        hoy,
        ALUMNO_DEFAULTS.observaciones,
        ALUMNO_DEFAULTS.nro_hermanos,
        ALUMNO_DEFAULTS.lugar_hermanos,
        ALUMNO_DEFAULTS.religion,
        ALUMNO_DEFAULTS.lengua_materna,
        ALUMNO_DEFAULTS.segunda_lengua,
        ALUMNO_DEFAULTS.codigo,
        ALUMNO_DEFAULTS.discapacidad,
        ALUMNO_DEFAULTS.domicilio,
        ALUMNO_DEFAULTS.estado_nacimiento,
        ALUMNO_DEFAULTS.observaciones_nacimiento,
        ALUMNO_DEFAULTS.actividades_nacimiento,
        ALUMNO_DEFAULTS.controles_peso_talla,
        ALUMNO_DEFAULTS.otros_controles,
        ALUMNO_DEFAULTS.alergias,
        ALUMNO_DEFAULTS.experiencias_traumaticas,
        ALUMNO_DEFAULTS.tipo_sangre,
        ALUMNO_DEFAULTS.enfermedades_sufridas,
        ALUMNO_DEFAULTS.vacunas,
        ALUMNO_DEFAULTS.trabajos,
        ALUMNO_DEFAULTS.foto_dni,
        ALUMNO_DEFAULTS.registro_desde,
        ALUMNO_DEFAULTS.seguro_id,
      ]
    );

    const [last] = await query(
      'SELECT id FROM alumnos WHERE colegio_id = ? AND nro_documento = ? ORDER BY id DESC LIMIT 1',
      [colegio_id, doc]
    );
    const alumnoId = last?.id;
    if (!alumnoId) {
      return res.status(500).json({ error: 'No se pudo obtener el alumno creado' });
    }

    const pwd = sha1Password(doc);
    await execute(
      `INSERT INTO usuarios (
         colegio_id, alumno_id, personal_id, apoderado_id, usuario, password, tipo, estado,
         ms_email, ms_access_token, ms_refresh_token, ms_id_token, auth_token, permisos,
         cambiar_password, app_terminos_aceptados, cambiar_datos
       ) VALUES (?, ?, 0, 0, ?, ?, 'ALUMNO', 'ACTIVO', '', '', '', '', '', '', 'NO', 'NO', 'SI')`,
      [colegio_id, alumnoId, doc, pwd]
    );

    res.status(201).json({ alumno_id: alumnoId });
  } catch (e) {
    console.error('POST alumno admin', e);
    if (e.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'DNI duplicado' });
    }
    res.status(500).json({ error: e.message || 'Error al crear alumno' });
  }
});

router.put('/alumnos/:id', async (req, res) => {
  try {
    const { colegio_id, usuario_id: adminUsuarioId } = req.user;
    const id = parseInt(req.params.id, 10);
    const exist = await query(
      'SELECT id, nro_documento FROM alumnos WHERE id = ? AND colegio_id = ? LIMIT 1',
      [id, colegio_id]
    );
    if (!exist.length) {
      return res.status(404).json({ error: 'No encontrado' });
    }

    const urows = await query(
      "SELECT id, usuario FROM usuarios WHERE alumno_id = ? AND colegio_id = ? AND tipo = 'ALUMNO' LIMIT 1",
      [id, colegio_id]
    );
    const uAl = urows[0];

    const ap = req.body.apellido_paterno != null ? String(req.body.apellido_paterno).trim() : null;
    const am = req.body.apellido_materno != null ? String(req.body.apellido_materno).trim() : null;
    const nom = req.body.nombres != null ? String(req.body.nombres).trim() : null;
    const doc = req.body.nro_documento != null ? String(req.body.nro_documento).trim() : null;
    const fn = req.body.fecha_nacimiento != null ? String(req.body.fecha_nacimiento).slice(0, 10) : null;
    const email = req.body.email != null ? String(req.body.email).trim() : null;
    const usuario_estado = req.body.usuario_estado != null ? String(req.body.usuario_estado).toUpperCase() : null;

    if (doc && doc !== exist[0].nro_documento) {
      const dup = await query(
        'SELECT id FROM alumnos WHERE colegio_id = ? AND nro_documento = ? AND id != ? LIMIT 1',
        [colegio_id, doc, id]
      );
      if (dup.length) {
        return res.status(409).json({ error: 'Otro alumno ya usa ese DNI' });
      }
      if (!(await usuarioLibre(colegio_id, doc, uAl?.id))) {
        return res.status(409).json({ error: 'El DNI ya está en uso como usuario' });
      }
    }

    const sets = [];
    const params = [];
    if (ap != null) {
      sets.push('apellido_paterno = ?');
      params.push(ap);
    }
    if (am != null) {
      sets.push('apellido_materno = ?');
      params.push(am);
    }
    if (nom != null) {
      sets.push('nombres = ?');
      params.push(nom);
    }
    if (doc != null) {
      sets.push('nro_documento = ?');
      params.push(doc);
    }
    if (fn != null) {
      sets.push('fecha_nacimiento = ?');
      params.push(fn);
    }
    if (email != null) {
      sets.push('email = ?');
      params.push(email);
    }
    if (sets.length) {
      params.push(id, colegio_id);
      await execute(`UPDATE alumnos SET ${sets.join(', ')} WHERE id = ? AND colegio_id = ?`, params);
    }

    const nuevoDoc = doc != null ? doc : exist[0].nro_documento;
    if (uAl && doc != null && doc !== uAl.usuario) {
      await execute('UPDATE usuarios SET usuario = ? WHERE id = ? AND colegio_id = ?', [nuevoDoc, uAl.id, colegio_id]);
    }

    if (uAl && (usuario_estado === 'ACTIVO' || usuario_estado === 'INACTIVO')) {
      if (parseInt(uAl.id, 10) === parseInt(adminUsuarioId, 10) && usuario_estado === 'INACTIVO') {
        return res.status(400).json({ error: 'No puede desactivar su propio usuario' });
      }
      await execute('UPDATE usuarios SET estado = ? WHERE id = ? AND colegio_id = ?', [
        usuario_estado,
        uAl.id,
        colegio_id,
      ]);
    }

    res.json({ ok: true });
  } catch (e) {
    console.error('PUT alumno admin', e);
    res.status(500).json({ error: e.message || 'Error al actualizar alumno' });
  }
});

router.put('/alumnos/:id/foto', uploadUsuarioFoto.single('foto'), async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const id = parseInt(req.params.id, 10);
    if (!id) {
      return res.status(400).json({ error: 'ID inválido' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Debe adjuntar una imagen' });
    }

    const exist = await query('SELECT id FROM alumnos WHERE id = ? AND colegio_id = ? LIMIT 1', [id, colegio_id]);
    if (!exist.length) {
      return res.status(404).json({ error: 'No encontrado' });
    }

    await execute('UPDATE alumnos SET foto = ? WHERE id = ? AND colegio_id = ?', [req.file.filename, id, colegio_id]);
    res.json({ ok: true, foto: req.file.filename });
  } catch (e) {
    console.error('PUT /admin/usuarios/alumnos/:id/foto', e);
    res.status(500).json({ error: e.message || 'Error al actualizar foto' });
  }
});

router.post('/alumnos/:id/reset-password', async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const id = parseInt(req.params.id, 10);
    const rows = await query(
      `SELECT u.id, a.nro_documento
       FROM usuarios u
       INNER JOIN alumnos a ON a.id = u.alumno_id AND a.colegio_id = u.colegio_id
       WHERE u.alumno_id = ? AND u.colegio_id = ? AND u.tipo = 'ALUMNO' LIMIT 1`,
      [id, colegio_id]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'Usuario alumno no encontrado' });
    }
    const pwd = sha1Password(rows[0].nro_documento);
    await execute('UPDATE usuarios SET password = ?, cambiar_password = ? WHERE id = ? AND colegio_id = ?', [
      pwd,
      'NO',
      rows[0].id,
      colegio_id,
    ]);
    res.json({ ok: true });
  } catch (e) {
    console.error('reset alumno pwd', e);
    res.status(500).json({ error: e.message || 'Error' });
  }
});

router.post('/alumnos/:id/password', async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const id = parseInt(req.params.id, 10);
    const password = String(req.body.password || '').trim();
    if (!id) {
      return res.status(400).json({ error: 'ID inválido' });
    }
    if (password.length < 4) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 4 caracteres' });
    }
    const rows = await query(
      `SELECT u.id
       FROM usuarios u
       WHERE u.alumno_id = ? AND u.colegio_id = ? AND u.tipo = 'ALUMNO'
       LIMIT 1`,
      [id, colegio_id]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'Usuario alumno no encontrado' });
    }
    const pwd = sha1Password(password);
    await execute('UPDATE usuarios SET password = ?, cambiar_password = ? WHERE id = ? AND colegio_id = ?', [
      pwd,
      'NO',
      rows[0].id,
      colegio_id,
    ]);
    res.json({ ok: true });
  } catch (e) {
    console.error('password alumno', e);
    res.status(500).json({ error: e.message || 'Error al cambiar contraseña' });
  }
});

router.post('/alumnos/:id/acceso', async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const id = parseInt(req.params.id, 10);
    const arows = await query(
      'SELECT id, nro_documento FROM alumnos WHERE id = ? AND colegio_id = ? LIMIT 1',
      [id, colegio_id]
    );
    if (!arows.length) {
      return res.status(404).json({ error: 'Alumno no encontrado' });
    }
    const tiene = await query(
      "SELECT id FROM usuarios WHERE alumno_id = ? AND colegio_id = ? AND tipo = 'ALUMNO' LIMIT 1",
      [id, colegio_id]
    );
    if (tiene.length) {
      return res.status(409).json({ error: 'El alumno ya tiene usuario' });
    }
    const dni = arows[0].nro_documento;
    if (!(await usuarioLibre(colegio_id, dni))) {
      return res.status(409).json({ error: 'El DNI ya está en uso' });
    }
    const pwd = sha1Password(dni);
    await execute(
      `INSERT INTO usuarios (
         colegio_id, alumno_id, personal_id, apoderado_id, usuario, password, tipo, estado,
         ms_email, ms_access_token, ms_refresh_token, ms_id_token, auth_token, permisos,
         cambiar_password, app_terminos_aceptados, cambiar_datos
       ) VALUES (?, ?, 0, 0, ?, ?, 'ALUMNO', 'ACTIVO', '', '', '', '', '', '', 'NO', 'NO', 'SI')`,
      [colegio_id, id, dni, pwd]
    );
    res.status(201).json({ ok: true });
  } catch (e) {
    console.error('POST alumno acceso', e);
    res.status(500).json({ error: e.message || 'Error' });
  }
});

router.get('/alumnos/:id/apoderados', async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const id = parseInt(req.params.id, 10);
    const ok = await query('SELECT id FROM alumnos WHERE id = ? AND colegio_id = ? LIMIT 1', [id, colegio_id]);
    if (!ok.length) {
      return res.status(404).json({ error: 'Alumno no encontrado' });
    }
    const rows = await query(
      `SELECT ap.id, ap.nombres, ap.apellido_paterno, ap.apellido_materno, ap.nro_documento,
              ap.email, ap.telefono_celular, ap.parentesco,
              u.id AS usuario_id, u.estado AS usuario_estado
       FROM familias f
       INNER JOIN apoderados ap ON ap.id = f.apoderado_id AND ap.colegio_id = ?
       LEFT JOIN usuarios u ON u.apoderado_id = ap.id AND u.colegio_id = ap.colegio_id
       WHERE f.alumno_id = ?
       ORDER BY ap.apellido_paterno, ap.apellido_materno, ap.nombres`,
      [colegio_id, id]
    );
    res.json({ data: rows });
  } catch (e) {
    console.error('GET alumno apoderados admin', e);
    res.status(500).json({ error: e.message || 'Error' });
  }
});

/**
 * POST /alumnos/:alumnoId/vincular-apoderado
 * Vincula un apoderado existente (por DNI) al alumno en `familias`. Actualiza parentesco en la ficha del apoderado.
 */
router.post('/alumnos/:alumnoId/vincular-apoderado', async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const alumnoId = parseInt(req.params.alumnoId, 10);
    const dni = String(req.body.nro_documento || '').trim();
    let parentesco = parseInt(req.body.parentesco, 10);
    if (Number.isNaN(parentesco) || parentesco < 1 || parentesco > 4) parentesco = 1;
    if (!alumnoId || !dni) {
      return res.status(400).json({ error: 'Alumno y DNI son obligatorios' });
    }
    const al = await query('SELECT id FROM alumnos WHERE id = ? AND colegio_id = ? LIMIT 1', [alumnoId, colegio_id]);
    if (!al.length) {
      return res.status(404).json({ error: 'Alumno no encontrado' });
    }
    const aprows = await query(
      'SELECT id FROM apoderados WHERE colegio_id = ? AND TRIM(nro_documento) = ? LIMIT 1',
      [colegio_id, dni]
    );
    if (!aprows.length) {
      return res.status(404).json({ error: 'No hay apoderado registrado con ese DNI en este colegio' });
    }
    const apoderadoId = aprows[0].id;
    const dup = await query(
      'SELECT 1 FROM familias WHERE alumno_id = ? AND apoderado_id = ? LIMIT 1',
      [alumnoId, apoderadoId]
    );
    if (dup.length) {
      return res.status(409).json({ error: 'Ese apoderado ya está vinculado a este alumno' });
    }
    await execute('INSERT INTO familias (alumno_id, apoderado_id) VALUES (?, ?)', [alumnoId, apoderadoId]);
    await execute('UPDATE apoderados SET parentesco = ? WHERE id = ? AND colegio_id = ?', [parentesco, apoderadoId, colegio_id]);
    res.json({ ok: true, apoderado_id: apoderadoId });
  } catch (e) {
    console.error('POST vincular-apoderado', e);
    res.status(500).json({ error: e.message || 'Error al vincular' });
  }
});

router.get('/alumnos/:id/hermanos', async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const id = parseInt(req.params.id, 10);
    const ok = await query('SELECT id FROM alumnos WHERE id = ? AND colegio_id = ? LIMIT 1', [id, colegio_id]);
    if (!ok.length) {
      return res.status(404).json({ error: 'Alumno no encontrado' });
    }
    const rows = await query(
      `SELECT DISTINCT
          s.id,
          s.nombres,
          s.apellido_paterno,
          s.apellido_materno,
          s.nro_documento,
          g.anio,
          g.grado,
          g.seccion,
          n.nombre AS nivel_nombre
       FROM familias f0
       INNER JOIN familias f ON f.apoderado_id = f0.apoderado_id AND f.alumno_id <> f0.alumno_id
       INNER JOIN alumnos s ON s.id = f.alumno_id AND s.colegio_id = ?
       LEFT JOIN matriculas m ON m.id = (
         SELECT m2.id
         FROM matriculas m2
         INNER JOIN grupos g2 ON g2.id = m2.grupo_id AND g2.colegio_id = m2.colegio_id
         WHERE m2.alumno_id = s.id AND m2.colegio_id = s.colegio_id
         ORDER BY (m2.estado = 0 OR m2.estado = 4) DESC, g2.anio DESC, m2.id DESC
         LIMIT 1
       )
       LEFT JOIN grupos g ON g.id = m.grupo_id AND g.colegio_id = s.colegio_id
       LEFT JOIN niveles n ON n.id = g.nivel_id
       WHERE f0.alumno_id = ?
       ORDER BY s.apellido_paterno, s.apellido_materno, s.nombres`,
      [colegio_id, id]
    );
    res.json({ data: rows });
  } catch (e) {
    console.error('GET alumno hermanos admin', e);
    res.status(500).json({ error: e.message || 'Error' });
  }
});

router.get('/alumnos/:id/matriculas/:matriculaId/pagos', async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const alumnoId = parseInt(req.params.id, 10);
    const matriculaId = parseInt(req.params.matriculaId, 10);
    if (!Number.isFinite(alumnoId) || !Number.isFinite(matriculaId)) {
      return res.status(400).json({ error: 'Parámetros inválidos' });
    }
    const ok = await query('SELECT id FROM alumnos WHERE id = ? AND colegio_id = ? LIMIT 1', [alumnoId, colegio_id]);
    if (!ok.length) {
      return res.status(404).json({ error: 'Alumno no encontrado' });
    }
    const matriculas = await query(
      `SELECT m.id AS matricula_id,
              g.anio,
              g.grado,
              g.seccion,
              n.nombre AS nivel_nombre,
              c.pension,
              c.matricula
       FROM matriculas m
       INNER JOIN grupos g ON g.id = m.grupo_id AND g.colegio_id = m.colegio_id
       LEFT JOIN niveles n ON n.id = g.nivel_id
       LEFT JOIN costos c ON c.id = m.costo_id
       WHERE m.alumno_id = ? AND m.colegio_id = ? AND m.id = ?
       LIMIT 1`,
      [alumnoId, colegio_id, matriculaId]
    );
    if (!matriculas.length) {
      return res.status(404).json({ error: 'Matrícula no encontrada' });
    }
    const data = await buildAlumnoPagosData(colegio_id, matriculas);
    res.json({ data: data[0] });
  } catch (e) {
    console.error('GET alumno matricula pagos admin', e);
    res.status(500).json({ error: e.message || 'Error' });
  }
});

/**
 * GET …/pagos/:pagoId/boleta — mismos datos que apoderado para generar el PDF de boleta.
 */
router.get('/alumnos/:id/matriculas/:matriculaId/pagos/:pagoId/boleta', async (req, res) => {
  try {
    const v = await verifyAdminAlumnoMatriculaPago(req);
    if (!v.ok) return res.status(v.status).json({ error: v.error });
    const { colegio_id, alumnoId, matriculaId, pagoId } = v;

    const ensured = await ensureAdminPagoImpresionActiva({
      colegioId: colegio_id,
      pagoId,
      tipo: 'PAGO',
      tipoDocumento: 'BOLETA',
    });
    if (!ensured.ok) {
      return res.status(ensured.status || 500).json({ error: ensured.error || 'No se pudo preparar la boleta' });
    }

    const result = await getBoletaPdfJsonForPago(query, colegio_id, pagoId, {
      type: 'admin',
      alumno_id: alumnoId,
      matricula_id: matriculaId,
    });
    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }
    res.json(result.data);
  } catch (e) {
    console.error('GET admin boleta pago', e);
    res.status(500).json({ error: e.message || 'Error al obtener datos de boleta' });
  }
});

/**
 * POST …/pagos/:pagoId/impresiones/mora/ensure — asegura impresión activa de mora (NOTA), alineado al legacy.
 */
router.post('/alumnos/:id/matriculas/:matriculaId/pagos/:pagoId/impresiones/mora/ensure', async (req, res) => {
  try {
    const v = await verifyAdminAlumnoMatriculaPago(req);
    if (!v.ok) return res.status(v.status).json({ error: v.error });
    const { colegio_id, pagoId } = v;
    const ensured = await ensureAdminPagoImpresionActiva({
      colegioId: colegio_id,
      pagoId,
      tipo: 'MORA',
      tipoDocumento: 'NOTA',
    });
    if (!ensured.ok) {
      return res.status(ensured.status || 500).json({ error: ensured.error || 'No se pudo generar la impresión de mora' });
    }
    return res.json({
      ok: true,
      created: !!ensured.created,
      impresion: ensured.impresion || null,
    });
  } catch (e) {
    console.error('POST admin impresion mora ensure', e);
    return res.status(500).json({ error: e.message || 'Error al preparar impresión de mora' });
  }
});

/**
 * GET …/impresiones/:impresionId/json — genera JSON del comprobante activo (boleta/nota).
 */
router.get(
  '/alumnos/:id/matriculas/:matriculaId/pagos/:pagoId/impresiones/:impresionId/json',
  async (req, res) => {
    try {
      const v = await verifyAdminAlumnoMatriculaPago(req);
      if (!v.ok) return res.status(v.status).json({ error: v.error });
      const { colegio_id, pagoId } = v;
      const impresionId = parseInt(req.params.impresionId, 10);
      if (!Number.isFinite(impresionId) || impresionId <= 0) {
        return res.status(400).json({ error: 'ID de impresión inválido' });
      }

      const imp = await getAdminImpresionPayload({ colegio_id, pagoId, impresionId });
      if (!imp) return res.status(404).json({ error: 'Impresión no encontrada' });
      if (String(imp.estado || '').toUpperCase() === 'ANULADO') {
        return res.status(400).json({ error: 'La impresión está anulada. Use «JSON RC» para este comprobante.' });
      }
      let payloadObj;
      const tipoDoc = String(imp.tipo_documento || '').toUpperCase();
      if (tipoDoc === 'NOTA') {
        const boletaActiva = await getActivePagoBoletaImpresion(pagoId);
        if (!boletaActiva) {
          return res.status(400).json({ error: 'No hay boleta activa relacionada para generar la Nota de Débito.' });
        }
        payloadObj = buildLegacyJsonNotaDebitoFromImpresion(imp, boletaActiva);
      } else {
        payloadObj = buildLegacyJsonBoletaFromImpresion(imp);
      }
      await markImpresionJsonGenerado(impresionId);
      const filename = safeJsonFilename(payloadObj.nombre, `impresion_${impresionId}.json`);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(JSON.stringify(payloadObj.contenido, null, 2));
    } catch (e) {
      console.error('GET admin impresion json', e);
      return res.status(500).json({ error: e.message || 'Error al generar JSON' });
    }
  }
);

/**
 * GET …/impresiones/:impresionId/json-rc — genera JSON RC para comprobante anulado.
 */
router.get(
  '/alumnos/:id/matriculas/:matriculaId/pagos/:pagoId/impresiones/:impresionId/json-rc',
  async (req, res) => {
    try {
      const v = await verifyAdminAlumnoMatriculaPago(req);
      if (!v.ok) return res.status(v.status).json({ error: v.error });
      const { colegio_id, pagoId } = v;
      const impresionId = parseInt(req.params.impresionId, 10);
      if (!Number.isFinite(impresionId) || impresionId <= 0) {
        return res.status(400).json({ error: 'ID de impresión inválido' });
      }

      const imp = await getAdminImpresionPayload({ colegio_id, pagoId, impresionId });
      if (!imp) return res.status(404).json({ error: 'Impresión no encontrada' });
      if (String(imp.estado || '').toUpperCase() !== 'ANULADO') {
        return res.status(400).json({ error: 'Solo se puede generar JSON RC para comprobantes anulados.' });
      }
      await ensureRcDataForImpresion(impresionId);
      const impFresh = await getAdminImpresionPayload({ colegio_id, pagoId, impresionId });
      if (!impFresh) return res.status(404).json({ error: 'Impresión no encontrada' });
      const tipoDoc = String(impFresh.tipo_documento || '').toUpperCase();
      const payloadObj = tipoDoc === 'NOTA' ? buildLegacyJsonRcNota(impFresh) : buildLegacyJsonRcInafecta(impFresh);
      await markImpresionJsonGenerado(impresionId);
      const filename = safeJsonFilename(payloadObj.nombre, `impresion_rc_${impresionId}.json`);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(JSON.stringify(payloadObj.contenido, null, 2));
    } catch (e) {
      console.error('GET admin impresion json rc', e);
      return res.status(500).json({ error: e.message || 'Error al generar JSON RC' });
    }
  }
);

/**
 * GET …/pagos/:pagoId/impresiones — listado de impresiones del pago + resumen (mora, forma de pago, etc.).
 */
router.get('/alumnos/:id/matriculas/:matriculaId/pagos/:pagoId/impresiones', async (req, res) => {
  try {
    const v = await verifyAdminAlumnoMatriculaPago(req);
    if (!v.ok) return res.status(v.status).json({ error: v.error });
    const { alumnoId, matriculaId, pagoId, colegio_id } = v;

    let pagoRows;
    try {
      pagoRows = await query(
        `SELECT p.mora, p.forma_pago, p.estado_pago, p.comision_tarjeta
         FROM pagos p
         INNER JOIN matriculas m ON m.id = p.matricula_id AND m.alumno_id = ? AND m.colegio_id = ?
         WHERE p.id = ? AND p.colegio_id = ? AND p.matricula_id = ?
         LIMIT 1`,
        [alumnoId, colegio_id, pagoId, colegio_id, matriculaId]
      );
    } catch (e) {
      if (!isSqlUnknownColumnError(e)) throw e;
      pagoRows = await query(
        `SELECT p.mora, p.forma_pago, p.estado_pago
         FROM pagos p
         INNER JOIN matriculas m ON m.id = p.matricula_id AND m.alumno_id = ? AND m.colegio_id = ?
         WHERE p.id = ? AND p.colegio_id = ? AND p.matricula_id = ?
         LIMIT 1`,
        [alumnoId, colegio_id, pagoId, colegio_id, matriculaId]
      );
      pagoRows = (pagoRows || []).map((r) => ({ ...r, comision_tarjeta: null }));
    }
    if (!pagoRows.length) {
      return res.status(404).json({ error: 'Pago no encontrado' });
    }
    const pago = pagoRows[0];
    const moraNum = parseFloat(pago.mora) || 0;
    const comisionNum = parseFloat(pago.comision_tarjeta) || 0;
    const forma = String(pago.forma_pago || '').toUpperCase();

    let impRows;
    try {
      impRows = await query(
        `SELECT id, pago_id, tipo, tipo_documento, serie, numero, estado, fecha_impresion, hora_impresion, impreso,
                fecha_anulado, numero_anulado, json_generado
         FROM impresiones WHERE pago_id = ? ORDER BY id ASC`,
        [pagoId]
      );
    } catch (e) {
      if (!isSqlUnknownColumnError(e)) throw e;
      try {
        impRows = await query(
          `SELECT id, pago_id, tipo, tipo_documento, serie, numero, estado, fecha_impresion, hora_impresion, impreso, fecha_anulado
           FROM impresiones WHERE pago_id = ? ORDER BY id ASC`,
          [pagoId]
        );
      } catch (e2) {
        if (!isSqlUnknownColumnError(e2)) throw e2;
        impRows = await query(
          `SELECT id, pago_id, tipo, tipo_documento, serie, numero, estado, fecha_impresion, impreso
           FROM impresiones WHERE pago_id = ? ORDER BY id ASC`,
          [pagoId]
        );
      }
    }

    const tieneBoletaPago = (impRows || []).some(
      (r) =>
        String(r.tipo || '').toUpperCase() === 'PAGO' && String(r.tipo_documento || '').toUpperCase() === 'BOLETA'
    );

    const impresiones = (impRows || []).map((r) => {
      const fechaStr =
        r.fecha_impresion instanceof Date && !Number.isNaN(r.fecha_impresion.getTime())
          ? r.fecha_impresion.toISOString().slice(0, 10)
          : r.fecha_impresion != null
            ? String(r.fecha_impresion).slice(0, 10)
            : '';
      const horaRaw = r.hora_impresion != null ? String(r.hora_impresion).trim() : '';
      let fecha_impresion_display = '—';
      if (fechaStr && horaRaw) fecha_impresion_display = `${fechaStr} ${horaRaw.slice(0, 8)}`;
      else if (fechaStr) fecha_impresion_display = fechaStr;
      else if (horaRaw) fecha_impresion_display = horaRaw;

      return {
        id: r.id,
        pago_id: r.pago_id,
        tipo: r.tipo,
        tipo_documento: r.tipo_documento,
        serie: r.serie,
        numero: r.numero,
        serie_numero: formatSerieNumeroImpresion(r.serie, r.numero),
        tipo_label: mapImpresionTipoLabel(r.tipo),
        documento_label: mapImpresionDocumentoLabel(r.tipo_documento),
        estado: r.estado != null ? String(r.estado).toUpperCase() : '',
        fecha_impresion: fechaStr || null,
        hora_impresion: horaRaw || null,
        fecha_impresion_display,
        impreso: r.impreso,
        json_generado: r.json_generado != null ? String(r.json_generado) : null,
      };
    });

    res.json({
      pago: {
        mora: moraNum,
        forma_pago: pago.forma_pago,
        estado_pago: pago.estado_pago,
        comision_tarjeta: comisionNum,
        tiene_boleta_pago: tieneBoletaPago,
        mostrar_boton_mora_nd: moraNum > 0,
        mostrar_nota_comision:
          forma === 'TARJETA' && comisionNum > 0 && tieneBoletaPago,
      },
      impresiones,
    });
  } catch (e) {
    console.error('GET admin impresiones pago', e);
    res.status(500).json({ error: e.message || 'Error al listar impresiones' });
  }
});

/**
 * PATCH …/pagos/:pagoId/impresiones/:impresionId — fecha / hora de impresión (alineado a edición legado).
 */
router.patch('/alumnos/:id/matriculas/:matriculaId/pagos/:pagoId/impresiones/:impresionId', async (req, res) => {
  try {
    const v = await verifyAdminAlumnoMatriculaPago(req);
    if (!v.ok) return res.status(v.status).json({ error: v.error });
    const { pagoId } = v;
    const impresionId = parseInt(req.params.impresionId, 10);
    if (!Number.isFinite(impresionId) || impresionId <= 0) {
      return res.status(400).json({ error: 'ID de impresión inválido' });
    }

    const belongs = await query(`SELECT id FROM impresiones WHERE id = ? AND pago_id = ? LIMIT 1`, [
      impresionId,
      pagoId,
    ]);
    if (!belongs.length) {
      return res.status(404).json({ error: 'Impresión no encontrada' });
    }

    const body = req.body || {};
    const fechaRaw = body.fecha_impresion;
    const horaRaw = body.hora_impresion;
    const sets = [];
    const params = [];

    if (fechaRaw != null && String(fechaRaw).trim() !== '') {
      sets.push('fecha_impresion = ?');
      params.push(String(fechaRaw).trim().slice(0, 10));
    }
    const horaNorm = normalizeHoraImpresionBody(horaRaw);
    if (horaNorm === '__INVALID_TIME__') {
      return res.status(400).json({ error: 'Hora inválida. Use formato HH:mm o HH:mm:ss con rango válido.' });
    }
    if (horaNorm) {
      sets.push('hora_impresion = ?');
      params.push(horaNorm);
    }

    if (!sets.length) {
      return res.status(400).json({ error: 'Indique fecha_impresion y/o hora_impresion' });
    }

    params.push(impresionId, pagoId);
    const sql = `UPDATE impresiones SET ${sets.join(', ')} WHERE id = ? AND pago_id = ?`;
    try {
      await execute(sql, params);
    } catch (e) {
      if (!isSqlUnknownColumnError(e)) throw e;
      const hadFecha = fechaRaw != null && String(fechaRaw).trim() !== '';
      if (!hadFecha) {
        return res.status(400).json({
          error:
            'No se pudo guardar la hora: falta la columna hora_impresion o indique también fecha_impresion para actualizar solo la fecha.',
        });
      }
      await execute(`UPDATE impresiones SET fecha_impresion = ? WHERE id = ? AND pago_id = ?`, [
        String(fechaRaw).trim().slice(0, 10),
        impresionId,
        pagoId,
      ]);
    }

    res.json({ ok: true });
  } catch (e) {
    console.error('PATCH admin impresion', e);
    res.status(500).json({ error: e.message || 'Error al actualizar impresión' });
  }
});

/**
 * POST …/impresiones/:impresionId/toggle-estado — ACTIVO ↔ ANULADO (fila concreta).
 */
router.post(
  '/alumnos/:id/matriculas/:matriculaId/pagos/:pagoId/impresiones/:impresionId/toggle-estado',
  async (req, res) => {
    try {
      const v = await verifyAdminAlumnoMatriculaPago(req);
      if (!v.ok) return res.status(v.status).json({ error: v.error });
      const { pagoId } = v;
      const impresionId = parseInt(req.params.impresionId, 10);
      if (!Number.isFinite(impresionId) || impresionId <= 0) {
        return res.status(400).json({ error: 'ID de impresión inválido' });
      }

      const rows = await query(`SELECT id, estado FROM impresiones WHERE id = ? AND pago_id = ? LIMIT 1`, [
        impresionId,
        pagoId,
      ]);
      if (!rows.length) {
        return res.status(404).json({ error: 'Impresión no encontrada' });
      }
      const cur = String(rows[0].estado || '').toUpperCase();
      const next = cur === 'ANULADO' ? 'ACTIVO' : 'ANULADO';
      await execute(`UPDATE impresiones SET estado = ? WHERE id = ? AND pago_id = ?`, [next, impresionId, pagoId]);

      res.json({ ok: true, estado: next });
    } catch (e) {
      console.error('POST admin toggle impresion estado', e);
      res.status(500).json({ error: e.message || 'Error al cambiar estado' });
    }
  }
);

/**
 * Un pago concreto (precarga del formulario «Editar», misma data de meses que la lista).
 */
router.get('/alumnos/:id/matriculas/:matriculaId/pagos/:pagoId', async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const alumnoId = parseInt(req.params.id, 10);
    const matriculaId = parseInt(req.params.matriculaId, 10);
    const pagoId = parseInt(req.params.pagoId, 10);
    if (![alumnoId, matriculaId, pagoId].every((n) => Number.isFinite(n) && n > 0)) {
      return res.status(400).json({ error: 'Parámetros inválidos' });
    }
    const okAl = await query('SELECT id FROM alumnos WHERE id = ? AND colegio_id = ? LIMIT 1', [alumnoId, colegio_id]);
    if (!okAl.length) {
      return res.status(404).json({ error: 'Alumno no encontrado' });
    }

    let pagoRows;
    try {
      pagoRows = await query(
        `SELECT p.id, p.matricula_id, p.nro_pago, p.monto, p.mora, p.fecha_hora, p.tipo, p.descripcion, p.observaciones,
                p.estado_pago, p.fecha_cancelado, p.forma_pago, p.tipo_tarjeta, p.lugar_pago, p.estado AS pago_registro_estado, p.personal_id
         FROM pagos p
         INNER JOIN matriculas m ON m.id = p.matricula_id AND m.alumno_id = ? AND m.colegio_id = ?
         WHERE p.id = ? AND p.colegio_id = ? AND p.matricula_id = ?
         LIMIT 1`,
        [alumnoId, colegio_id, pagoId, colegio_id, matriculaId]
      );
    } catch (e) {
      if (!isSqlUnknownColumnError(e)) throw e;
      pagoRows = await query(
        `SELECT p.id, p.matricula_id, p.nro_pago, p.monto, p.mora, p.fecha_hora, p.tipo, p.descripcion,
                p.estado_pago, p.fecha_cancelado, p.forma_pago, p.tipo_tarjeta, p.lugar_pago, p.estado AS pago_registro_estado, p.personal_id
         FROM pagos p
         INNER JOIN matriculas m ON m.id = p.matricula_id AND m.alumno_id = ? AND m.colegio_id = ?
         WHERE p.id = ? AND p.colegio_id = ? AND p.matricula_id = ?
         LIMIT 1`,
        [alumnoId, colegio_id, pagoId, colegio_id, matriculaId]
      );
      pagoRows = (pagoRows || []).map((r) => ({ ...r, observaciones: '' }));
    }
    if (!pagoRows.length) {
      return res.status(404).json({ error: 'Pago no encontrado' });
    }

    const matriculas = await query(
      `SELECT m.id AS matricula_id,
              g.anio,
              g.grado,
              g.seccion,
              n.nombre AS nivel_nombre,
              c.pension,
              c.matricula
       FROM matriculas m
       INNER JOIN grupos g ON g.id = m.grupo_id AND g.colegio_id = m.colegio_id
       LEFT JOIN niveles n ON n.id = g.nivel_id
       LEFT JOIN costos c ON c.id = m.costo_id
       WHERE m.alumno_id = ? AND m.colegio_id = ? AND m.id = ?
       LIMIT 1`,
      [alumnoId, colegio_id, matriculaId]
    );
    if (!matriculas.length) {
      return res.status(404).json({ error: 'Matrícula no encontrada' });
    }
    const listaData = await buildAlumnoPagosData(colegio_id, matriculas);
    const pension_meses_opciones = listaData[0]?.pension_meses_opciones || [];

    const pr = pagoRows[0];
    const esPendientePago = String(pr.estado_pago || '').toUpperCase() === 'PENDIENTE';
    const fecha_hora_local = esPendientePago ? '' : fechaHoraToDatetimeLocalInput(pr.fecha_hora);
    const fecha_cancelado_date = esPendientePago ? '' : fechaSqlOrDateToDateInput(pr.fecha_cancelado);

    res.json({
      data: {
        pago: {
          ...pr,
          descripcion: esPendientePago ? '' : pr.descripcion,
          observaciones: esPendientePago ? '' : pr.observaciones ?? '',
          fecha_hora_local,
          fecha_cancelado_date,
        },
        pension_meses_opciones,
      },
    });
  } catch (e) {
    console.error('GET alumno matricula pago admin', e);
    res.status(500).json({ error: e.message || 'Error' });
  }
});

/**
 * Actualizar un pago activo (no permite editar filas anuladas en `pagos.estado`).
 */
router.put('/alumnos/:id/matriculas/:matriculaId/pagos/:pagoId', async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const alumnoId = parseInt(req.params.id, 10);
    const matriculaId = parseInt(req.params.matriculaId, 10);
    const pagoId = parseInt(req.params.pagoId, 10);
    if (![alumnoId, matriculaId, pagoId].every((n) => Number.isFinite(n) && n > 0)) {
      return res.status(400).json({ error: 'Parámetros inválidos' });
    }
    const okAl = await query('SELECT id FROM alumnos WHERE id = ? AND colegio_id = ? LIMIT 1', [alumnoId, colegio_id]);
    if (!okAl.length) {
      return res.status(404).json({ error: 'Alumno no encontrado' });
    }
    const okMat = await query(
      'SELECT id FROM matriculas WHERE id = ? AND alumno_id = ? AND colegio_id = ? LIMIT 1',
      [matriculaId, alumnoId, colegio_id]
    );
    if (!okMat.length) {
      return res.status(404).json({ error: 'Matrícula no encontrada' });
    }

    const exist = await query(
      `SELECT id, estado FROM pagos WHERE id = ? AND colegio_id = ? AND matricula_id = ? LIMIT 1`,
      [pagoId, colegio_id, matriculaId]
    );
    if (!exist.length) {
      return res.status(404).json({ error: 'Pago no encontrado' });
    }
    if (String(exist[0].estado || '').toUpperCase() !== 'ACTIVO') {
      return res.status(400).json({ error: 'No se puede editar un pago anulado.' });
    }

    const parsed = await parseAdminPagoRegistroBody(req.body, req.user, colegio_id);
    if (!parsed.ok) {
      return res.status(parsed.status || 400).json({ error: parsed.error });
    }
    const {
      monto,
      mora,
      nro_pago,
      tipo,
      estado_pago,
      fecha_hora,
      fecha_cancelado,
      descripcion,
      observaciones,
      forma_pago,
      tipo_tarjeta,
      comision_tarjeta,
      personal_id,
    } = parsed;

    const tryUpdate = async (withObservaciones) => {
      if (withObservaciones) {
        return execute(
          `UPDATE pagos SET nro_pago=?, monto=?, mora=?, fecha_hora=?, tipo=?, descripcion=?, observaciones=?,
             estado_pago=?, fecha_cancelado=?, forma_pago=?, tipo_tarjeta=?, lugar_pago=?, comision_tarjeta=?, personal_id=?
           WHERE id=? AND colegio_id=? AND matricula_id=? AND estado='ACTIVO'`,
          [
            nro_pago,
            monto,
            mora,
            fecha_hora,
            tipo,
            descripcion,
            observaciones,
            estado_pago,
            fecha_cancelado,
            forma_pago,
            tipo_tarjeta || '',
            'CAJA',
            comision_tarjeta,
            personal_id,
            pagoId,
            colegio_id,
            matriculaId,
          ]
        );
      }
      return execute(
        `UPDATE pagos SET nro_pago=?, monto=?, mora=?, fecha_hora=?, tipo=?, descripcion=?,
           estado_pago=?, fecha_cancelado=?, forma_pago=?, tipo_tarjeta=?, lugar_pago=?, comision_tarjeta=?, personal_id=?
         WHERE id=? AND colegio_id=? AND matricula_id=? AND estado='ACTIVO'`,
        [
          nro_pago,
          monto,
          mora,
          fecha_hora,
          tipo,
          descripcion,
          estado_pago,
          fecha_cancelado,
          forma_pago,
          tipo_tarjeta || '',
          'CAJA',
          comision_tarjeta,
          personal_id,
          pagoId,
          colegio_id,
          matriculaId,
        ]
      );
    };

    try {
      await tryUpdate(true);
    } catch (e) {
      if (isSqlUnknownColumnError(e)) {
        await tryUpdate(false);
      } else {
        throw e;
      }
    }

    res.json({ ok: true, id: pagoId });
  } catch (e) {
    console.error('PUT alumno matricula pago admin', e);
    res.status(500).json({ error: e.message || 'Error al actualizar el pago' });
  }
});

/**
 * Alterna `pagos.estado` entre ACTIVO y ANULADO (legado PHP: PagosApplication::anular).
 * Además sincroniza `impresiones` del mismo pago: al anular, ACTIVO→ANULADO;
 * al reactivar, la impresión ANULADO más reciente (MAX id) vuelve a ACTIVO.
 */
router.post('/alumnos/:id/matriculas/:matriculaId/pagos/:pagoId/anular', async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const alumnoId = parseInt(req.params.id, 10);
    const matriculaId = parseInt(req.params.matriculaId, 10);
    const pagoId = parseInt(req.params.pagoId, 10);
    if (![alumnoId, matriculaId, pagoId].every((n) => Number.isFinite(n) && n > 0)) {
      return res.status(400).json({ error: 'Parámetros inválidos' });
    }
    const okAl = await query('SELECT id FROM alumnos WHERE id = ? AND colegio_id = ? LIMIT 1', [alumnoId, colegio_id]);
    if (!okAl.length) {
      return res.status(404).json({ error: 'Alumno no encontrado' });
    }
    const okMat = await query(
      'SELECT id FROM matriculas WHERE id = ? AND alumno_id = ? AND colegio_id = ? LIMIT 1',
      [matriculaId, alumnoId, colegio_id]
    );
    if (!okMat.length) {
      return res.status(404).json({ error: 'Matrícula no encontrada' });
    }

    const rows = await query(
      `SELECT id, estado FROM pagos WHERE id = ? AND colegio_id = ? AND matricula_id = ? LIMIT 1`,
      [pagoId, colegio_id, matriculaId]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'Pago no encontrado' });
    }
    const est = String(rows[0].estado || '').toUpperCase();
    const nextEst = est === 'ACTIVO' ? 'ANULADO' : 'ACTIVO';
    const hoy = new Date().toISOString().slice(0, 10);

    const conn = await mysqlReadPool.getConnection();
    try {
      await conn.beginTransaction();

      const tryToggleConn = async (withFechaAnul) => {
        if (withFechaAnul) {
          if (nextEst === 'ANULADO') {
            return conn.execute(
              `UPDATE pagos SET estado = ?, fecha_anulado = ? WHERE id = ? AND colegio_id = ? AND matricula_id = ?`,
              [nextEst, hoy, pagoId, colegio_id, matriculaId]
            );
          }
          return conn.execute(
            `UPDATE pagos SET estado = ?, fecha_anulado = NULL WHERE id = ? AND colegio_id = ? AND matricula_id = ?`,
            [nextEst, pagoId, colegio_id, matriculaId]
          );
        }
        return conn.execute(`UPDATE pagos SET estado = ? WHERE id = ? AND colegio_id = ? AND matricula_id = ?`, [
          nextEst,
          pagoId,
          colegio_id,
          matriculaId,
        ]);
      };

      try {
        await tryToggleConn(true);
      } catch (e) {
        if (isSqlUnknownColumnError(e)) {
          await tryToggleConn(false);
        } else {
          throw e;
        }
      }

      if (nextEst === 'ANULADO') {
        await syncImpresionesAlAnularPago(pagoId, conn);
      } else {
        await syncImpresionesAlReactivarPago(pagoId, conn);
      }

      await conn.commit();
    } catch (e) {
      try {
        await conn.rollback();
      } catch (rb) {
        /* ignore */
      }
      throw e;
    } finally {
      conn.release();
    }

    res.json({ ok: true, id: pagoId, estado: nextEst });
  } catch (e) {
    console.error('POST anular pago admin', e);
    res.status(500).json({ error: e.message || 'Error al anular o activar el pago' });
  }
});

/**
 * Elimina el registro de pago (legado PHP: PagosApplication::borrar).
 */
router.delete('/alumnos/:id/matriculas/:matriculaId/pagos/:pagoId', async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const alumnoId = parseInt(req.params.id, 10);
    const matriculaId = parseInt(req.params.matriculaId, 10);
    const pagoId = parseInt(req.params.pagoId, 10);
    if (![alumnoId, matriculaId, pagoId].every((n) => Number.isFinite(n) && n > 0)) {
      return res.status(400).json({ error: 'Parámetros inválidos' });
    }
    const okAl = await query('SELECT id FROM alumnos WHERE id = ? AND colegio_id = ? LIMIT 1', [alumnoId, colegio_id]);
    if (!okAl.length) {
      return res.status(404).json({ error: 'Alumno no encontrado' });
    }
    const okMat = await query(
      'SELECT id FROM matriculas WHERE id = ? AND alumno_id = ? AND colegio_id = ? LIMIT 1',
      [matriculaId, alumnoId, colegio_id]
    );
    if (!okMat.length) {
      return res.status(404).json({ error: 'Matrícula no encontrada' });
    }

    const pagoRow = await query(
      `SELECT id FROM pagos WHERE id = ? AND colegio_id = ? AND matricula_id = ? LIMIT 1`,
      [pagoId, colegio_id, matriculaId]
    );
    if (!pagoRow.length) {
      return res.status(404).json({ error: 'Pago no encontrado' });
    }

    const tieneBoleta = await query(
      `SELECT id FROM impresiones WHERE pago_id = ? AND tipo = 'PAGO' AND tipo_documento = 'BOLETA' LIMIT 1`,
      [pagoId]
    );
    if (tieneBoleta.length) {
      return res.status(409).json({
        error:
          'Este pago tiene boleta registrada y no puede eliminarse. Use «Anular pago» para dejar constancia sin borrar la numeración.',
        code: 'TIENE_BOLETA',
      });
    }

    const conn = await mysqlReadPool.getConnection();
    try {
      await conn.beginTransaction();
      await deleteImpresionesByPagoId(pagoId, conn);
      const [delPago] = await conn.execute(
        `DELETE FROM pagos WHERE id = ? AND colegio_id = ? AND matricula_id = ?`,
        [pagoId, colegio_id, matriculaId]
      );
      if (!delPago.affectedRows) {
        await conn.rollback();
        return res.status(404).json({ error: 'Pago no encontrado' });
      }
      await conn.commit();
    } catch (e) {
      try {
        await conn.rollback();
      } catch (rb) {
        /* ignore */
      }
      throw e;
    } finally {
      conn.release();
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('DELETE pago admin', e);
    res.status(500).json({ error: e.message || 'Error al borrar el pago' });
  }
});

/**
 * Registro manual de un pago (alineado al legado PHP: /pagos/save).
 * fecha_hora y fecha_cancelado (si aplica) pueden omitirse: el servidor usa la fecha actual.
 */
router.post('/alumnos/:id/matriculas/:matriculaId/pagos', async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const alumnoId = parseInt(req.params.id, 10);
    const matriculaId = parseInt(req.params.matriculaId, 10);
    if (!Number.isFinite(alumnoId) || !Number.isFinite(matriculaId)) {
      return res.status(400).json({ error: 'Parámetros inválidos' });
    }
    const okAl = await query('SELECT id FROM alumnos WHERE id = ? AND colegio_id = ? LIMIT 1', [alumnoId, colegio_id]);
    if (!okAl.length) {
      return res.status(404).json({ error: 'Alumno no encontrado' });
    }
    const okMat = await query(
      'SELECT id FROM matriculas WHERE id = ? AND alumno_id = ? AND colegio_id = ? LIMIT 1',
      [matriculaId, alumnoId, colegio_id]
    );
    if (!okMat.length) {
      return res.status(404).json({ error: 'Matrícula no encontrada' });
    }

    const parsed = await parseAdminPagoRegistroBody(req.body, req.user, colegio_id);
    if (!parsed.ok) {
      return res.status(parsed.status || 400).json({ error: parsed.error });
    }
    const {
      monto,
      mora,
      nro_pago,
      tipo,
      estado_pago,
      fecha_hora,
      fecha_cancelado,
      descripcion,
      observaciones,
      forma_pago,
      tipo_tarjeta,
      comision_tarjeta,
      personal_id,
    } = parsed;

    const dup = await query(
      `SELECT id FROM pagos WHERE colegio_id = ? AND matricula_id = ? AND tipo = ? AND nro_pago = ? AND estado = 'ACTIVO' LIMIT 1`,
      [colegio_id, matriculaId, tipo, nro_pago]
    );
    if (dup.length) {
      return res.status(409).json({
        error:
          'Ya existe un pago activo para esta matrícula y cuota. Use Editar, anule el existente o borre el registro.',
      });
    }

    const tryInsert = async (withObservaciones) => {
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
      const placeholders = cols.map(() => '?').join(', ');
      const vals = [
        colegio_id,
        matriculaId,
        nro_pago,
        monto,
        mora,
        fecha_hora,
        tipo,
        descripcion,
        ...(withObservaciones ? [observaciones] : []),
        estado_pago,
        fecha_cancelado,
        forma_pago,
        tipo_tarjeta || '',
        'CAJA',
        comision_tarjeta,
        personal_id,
        'ACTIVO',
      ];
      return execute(`INSERT INTO pagos (${cols.join(', ')}) VALUES (${placeholders})`, vals);
    };

    let result;
    try {
      result = await tryInsert(true);
    } catch (e) {
      if (isSqlUnknownColumnError(e)) {
        result = await tryInsert(false);
      } else {
        throw e;
      }
    }

    res.status(201).json({ id: result.insertId });
  } catch (e) {
    console.error('POST alumno matricula pago admin', e);
    res.status(500).json({ error: e.message || 'Error al registrar el pago' });
  }
});

router.get('/alumnos/:id/matriculas/:matriculaId', async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const alumnoId = parseInt(req.params.id, 10);
    const matriculaId = parseInt(req.params.matriculaId, 10);
    if (!Number.isFinite(alumnoId) || !Number.isFinite(matriculaId)) {
      return res.status(400).json({ error: 'Parámetros inválidos' });
    }
    const ok = await query('SELECT id FROM alumnos WHERE id = ? AND colegio_id = ? LIMIT 1', [alumnoId, colegio_id]);
    if (!ok.length) {
      return res.status(404).json({ error: 'Alumno no encontrado' });
    }
    const rows = await query(
      `SELECT m.id AS matricula_id, m.alumno_id, m.grupo_id, m.costo_id, m.fecha_registro, m.estado,
              g.anio, g.grado, g.seccion, n.nombre AS nivel_nombre,
              t.nombre AS turno_nombre
       FROM matriculas m
       INNER JOIN grupos g ON g.id = m.grupo_id AND g.colegio_id = m.colegio_id
       LEFT JOIN niveles n ON n.id = g.nivel_id
       LEFT JOIN turnos t ON t.id = g.turno_id
       WHERE m.alumno_id = ? AND m.colegio_id = ? AND m.id = ?
       LIMIT 1`,
      [alumnoId, colegio_id, matriculaId]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'Matrícula no encontrada' });
    }
    const mat = rows[0];
    const costos = await query(
      'SELECT id, matricula, pension FROM costos WHERE colegio_id = ? ORDER BY id DESC',
      [colegio_id]
    );
    const grupos = await query(
      `SELECT g.id, g.anio, g.grado, g.seccion, n.nombre AS nivel_nombre
       FROM grupos g
       LEFT JOIN niveles n ON n.id = g.nivel_id
       WHERE g.colegio_id = ?
       ORDER BY g.anio DESC, g.grado ASC, g.seccion ASC
       LIMIT 1000`,
      [colegio_id]
    );
    res.json({
      data: {
        matricula: mat,
        costos: costos || [],
        grupos: grupos || [],
      },
    });
  } catch (e) {
    console.error('GET alumno matricula detalle admin', e);
    res.status(500).json({ error: e.message || 'Error' });
  }
});

router.put('/alumnos/:id/matriculas/:matriculaId', async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const alumnoId = parseInt(req.params.id, 10);
    const matriculaId = parseInt(req.params.matriculaId, 10);
    if (!Number.isFinite(alumnoId) || !Number.isFinite(matriculaId)) {
      return res.status(400).json({ error: 'Parámetros inválidos' });
    }
    const { estado, fecha_registro, grupo_id, costo_id } = req.body || {};
    const est = parseInt(estado, 10);
    if (![0, 1, 2, 3, 4].includes(est)) {
      return res.status(400).json({ error: 'Estado de matrícula no válido' });
    }
    const gid = parseInt(grupo_id, 10);
    const cid = parseInt(costo_id, 10);
    if (!Number.isFinite(gid) || !Number.isFinite(cid)) {
      return res.status(400).json({ error: 'Grupo y costo son obligatorios' });
    }
    const fr = fecha_registro != null && String(fecha_registro).trim() !== ''
      ? String(fecha_registro).trim().slice(0, 10)
      : null;
    if (!fr || !/^\d{4}-\d{2}-\d{2}$/.test(fr)) {
      return res.status(400).json({ error: 'Fecha de registro inválida (use AAAA-MM-DD)' });
    }
    const mrows = await query(
      'SELECT id FROM matriculas WHERE id = ? AND alumno_id = ? AND colegio_id = ? LIMIT 1',
      [matriculaId, alumnoId, colegio_id]
    );
    if (!mrows.length) {
      return res.status(404).json({ error: 'Matrícula no encontrada' });
    }
    const gOk = await query(
      'SELECT id FROM grupos WHERE id = ? AND colegio_id = ? LIMIT 1',
      [gid, colegio_id]
    );
    if (!gOk.length) {
      return res.status(400).json({ error: 'El grupo seleccionado no pertenece al colegio' });
    }
    const cOk = await query(
      'SELECT id FROM costos WHERE id = ? AND colegio_id = ? LIMIT 1',
      [cid, colegio_id]
    );
    if (!cOk.length) {
      return res.status(400).json({ error: 'El costo seleccionado no pertenece al colegio' });
    }
    await execute(
      `UPDATE matriculas SET estado = ?, fecha_registro = ?, grupo_id = ?, costo_id = ?
       WHERE id = ? AND alumno_id = ? AND colegio_id = ?`,
      [est, fr, gid, cid, matriculaId, alumnoId, colegio_id]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error('PUT alumno matricula admin', e);
    res.status(500).json({ error: e.message || 'Error al actualizar matrícula' });
  }
});

router.delete('/alumnos/:id/matriculas/:matriculaId', async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const alumnoId = parseInt(req.params.id, 10);
    const matriculaId = parseInt(req.params.matriculaId, 10);
    if (!Number.isFinite(alumnoId) || !Number.isFinite(matriculaId)) {
      return res.status(400).json({ error: 'Parámetros inválidos' });
    }
    const mrows = await query(
      'SELECT id FROM matriculas WHERE id = ? AND alumno_id = ? AND colegio_id = ? LIMIT 1',
      [matriculaId, alumnoId, colegio_id]
    );
    if (!mrows.length) {
      return res.status(404).json({ error: 'Matrícula no encontrada' });
    }
    const [pc] = await query(
      'SELECT COUNT(*) AS n FROM pagos WHERE matricula_id = ? AND colegio_id = ?',
      [matriculaId, colegio_id]
    );
    if ((pc?.n || 0) > 0) {
      return res.status(409).json({
        error: 'No se puede eliminar: existen pagos asociados a esta matrícula.',
      });
    }
    await execute('DELETE FROM matriculas WHERE id = ? AND alumno_id = ? AND colegio_id = ?', [
      matriculaId,
      alumnoId,
      colegio_id,
    ]);
    res.json({ ok: true });
  } catch (e) {
    console.error('DELETE alumno matricula admin', e);
    res.status(500).json({ error: e.message || 'Error al eliminar matrícula' });
  }
});

router.get('/alumnos/:id/matriculas', async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const id = parseInt(req.params.id, 10);
    const ok = await query('SELECT id FROM alumnos WHERE id = ? AND colegio_id = ? LIMIT 1', [id, colegio_id]);
    if (!ok.length) {
      return res.status(404).json({ error: 'Alumno no encontrado' });
    }
    const rows = await queryAlumnoMatriculasListRows(colegio_id, id);
    const data = mapMatriculaListAdminRows(rows);
    res.json({ data });
  } catch (e) {
    console.error('GET alumno matriculas admin', e);
    res.status(500).json({ error: e.message || 'Error' });
  }
});

router.get('/alumnos/:id/pagos', async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const id = parseInt(req.params.id, 10);
    const ok = await query('SELECT id FROM alumnos WHERE id = ? AND colegio_id = ? LIMIT 1', [id, colegio_id]);
    if (!ok.length) {
      return res.status(404).json({ error: 'Alumno no encontrado' });
    }

    const matriculas = await query(
      `SELECT m.id AS matricula_id,
              g.anio,
              g.grado,
              g.seccion,
              n.nombre AS nivel_nombre,
              c.pension,
              c.matricula
       FROM matriculas m
       INNER JOIN grupos g ON g.id = m.grupo_id AND g.colegio_id = m.colegio_id
       LEFT JOIN niveles n ON n.id = g.nivel_id
       LEFT JOIN costos c ON c.id = m.costo_id
       WHERE m.alumno_id = ? AND m.colegio_id = ?
       ORDER BY g.anio DESC, g.grado ASC, g.seccion ASC`,
      [id, colegio_id]
    );

    if (!matriculas.length) {
      return res.json({ data: [] });
    }

    const data = await buildAlumnoPagosData(colegio_id, matriculas);
    res.json({ data });
  } catch (e) {
    console.error('GET alumno pagos admin', e);
    res.status(500).json({ error: e.message || 'Error' });
  }
});

router.delete('/alumnos/:id', async (req, res) => {
  try {
    const { colegio_id, usuario_id: adminUsuarioId } = req.user;
    const id = parseInt(req.params.id, 10);
    const arows = await query(
      'SELECT id FROM alumnos WHERE id = ? AND colegio_id = ? LIMIT 1',
      [id, colegio_id]
    );
    if (!arows.length) {
      return res.status(404).json({ error: 'Alumno no encontrado' });
    }
    const [mc] = await query(
      'SELECT COUNT(*) AS n FROM matriculas WHERE alumno_id = ? AND colegio_id = ?',
      [id, colegio_id]
    );
    if ((mc?.n || 0) > 0) {
      return res.status(409).json({
        error:
          'No se puede eliminar: el alumno tiene matrículas registradas. Retírelo o anule matrículas desde el sistema académico si aplica.',
      });
    }
    const uAl = await query(
      "SELECT id FROM usuarios WHERE alumno_id = ? AND colegio_id = ? AND tipo = 'ALUMNO'",
      [id, colegio_id]
    );
    for (const u of uAl) {
      if (parseInt(u.id, 10) === parseInt(adminUsuarioId, 10)) {
        return res.status(400).json({ error: 'No puede eliminar su propio usuario vinculado a este alumno.' });
      }
      await execute('DELETE FROM usuarios WHERE id = ? AND colegio_id = ?', [u.id, colegio_id]);
    }
    await execute('DELETE FROM familias WHERE alumno_id = ?', [id]);
    await execute('DELETE FROM alumnos WHERE id = ? AND colegio_id = ?', [id, colegio_id]);
    res.json({ ok: true });
  } catch (e) {
    console.error('DELETE alumno admin', e);
    res.status(500).json({ error: e.message || 'Error al eliminar alumno' });
  }
});

// ——— Apoderados ———

/**
 * GET /personal-por-dni?dni=
 * Datos de `personal` para precargar alta de apoderado (mismo DNI en todo el colegio).
 */
router.get('/personal-por-dni', async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const dni = String(req.query.dni || '').trim();
    if (!dni) {
      return res.status(400).json({ error: 'Indique el DNI' });
    }
    const rows = await query(
      `SELECT id, nombres, apellidos, nro_documento, email, telefono_celular, fecha_nacimiento
       FROM personal WHERE colegio_id = ? AND TRIM(nro_documento) = ? LIMIT 1`,
      [colegio_id, dni]
    );
    if (!rows.length) {
      return res.json({ encontrado: false });
    }
    const p = rows[0];
    const apParts = String(p.apellidos || '').trim().split(/\s+/).filter(Boolean);
    res.json({
      encontrado: true,
      personal_id: p.id,
      nombres: p.nombres || '',
      apellido_paterno: apParts[0] || '',
      apellido_materno: apParts.slice(1).join(' ') || '',
      nro_documento: String(p.nro_documento || '').trim(),
      email: p.email || '',
      telefono_celular: p.telefono_celular || '',
      fecha_nacimiento: p.fecha_nacimiento ? String(p.fecha_nacimiento).slice(0, 10) : '1985-01-01',
    });
  } catch (e) {
    console.error('GET personal-por-dni', e);
    res.status(500).json({ error: e.message || 'Error al buscar personal' });
  }
});

router.get('/apoderados', async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const { page, limit, offset } = parsePageLimit(req);
    const search = (req.query.search || '').trim();

    const whereParts = ['ap.colegio_id = ?'];
    const params = [colegio_id];
    if (search) {
      const like = `%${search.replace(/%/g, '')}%`;
      whereParts.push(
        '(ap.nro_documento LIKE ? OR ap.nombres LIKE ? OR ap.apellido_paterno LIKE ? OR ap.apellido_materno LIKE ?)'
      );
      params.push(like, like, like, like);
    }
    const whereSql = whereParts.join(' AND ');

    const countRows = await query(`SELECT COUNT(*) AS total FROM apoderados ap WHERE ${whereSql}`, params);
    const total = countRows[0]?.total ?? 0;

    const rows = await query(
      `SELECT ap.id, ap.nombres, ap.apellido_paterno, ap.apellido_materno, ap.nro_documento, ap.parentesco, ap.email, ap.foto, ap.fecha_nacimiento, ap.telefono_celular,
              COALESCE(u_ap.id, u_per.id) AS usuario_id,
              COALESCE(u_ap.usuario, u_per.usuario) AS login_usuario,
              COALESCE(u_ap.estado, u_per.estado) AS usuario_estado,
              COALESCE(u_ap.tipo, u_per.tipo) AS usuario_tipo
       FROM apoderados ap
       ${SQL_JOIN_USUARIO_APODERADO_OPT}
       WHERE ${whereSql}
       ORDER BY ap.apellido_paterno, ap.apellido_materno, ap.nombres
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    res.json({ data: rows, total, page, limit });
  } catch (e) {
    console.error('GET apoderados admin', e);
    res.status(500).json({ error: e.message || 'Error al listar apoderados' });
  }
});

/** Buscar apoderado por DNI (mismo colegio). Para vincular desde ficha alumno. */
router.get('/apoderados/por-dni', async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const dni = String(req.query.dni || '').trim();
    if (!dni) {
      return res.status(400).json({ error: 'Indique el DNI' });
    }
    const rows = await query(
      `SELECT ap.id, ap.nombres, ap.apellido_paterno, ap.apellido_materno, ap.nro_documento, ap.parentesco,
              ap.email, ap.telefono_celular, ap.fecha_nacimiento,
              COALESCE(u_ap.id, u_per.id) AS usuario_id,
              COALESCE(u_ap.estado, u_per.estado) AS usuario_estado
       FROM apoderados ap
       ${SQL_JOIN_USUARIO_APODERADO_OPT}
       WHERE ap.colegio_id = ? AND TRIM(ap.nro_documento) = ?
       LIMIT 1`,
      [colegio_id, dni]
    );
    if (!rows.length) {
      return res.json({ encontrado: false });
    }
    res.json({ encontrado: true, apoderado: rows[0] });
  } catch (e) {
    console.error('GET apoderados/por-dni', e);
    res.status(500).json({ error: e.message || 'Error al buscar' });
  }
});

router.get('/apoderados/:id', async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const id = parseInt(req.params.id, 10);
    const rows = await query(
      `SELECT ap.*,
              COALESCE(u_ap.id, u_per.id) AS usuario_id,
              COALESCE(u_ap.usuario, u_per.usuario) AS login_usuario,
              COALESCE(u_ap.estado, u_per.estado) AS usuario_estado,
              COALESCE(u_ap.tipo, u_per.tipo) AS usuario_tipo
       FROM apoderados ap
       ${SQL_JOIN_USUARIO_APODERADO_OPT}
       WHERE ap.id = ? AND ap.colegio_id = ?
       LIMIT 1`,
      [id, colegio_id]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'No encontrado' });
    }
    res.json(rows[0]);
  } catch (e) {
    console.error('GET apoderado admin', e);
    res.status(500).json({ error: e.message || 'Error' });
  }
});

/**
 * GET /apoderados/:id/detalle
 * Ficha ampliada: hijos vinculados en familias y otros apoderados que comparten esos alumnos.
 */
router.get('/apoderados/:id/detalle', async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const id = parseInt(req.params.id, 10);
    if (!id) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    const base = await query(
      `SELECT ap.*,
              COALESCE(u_ap.id, u_per.id) AS usuario_id,
              COALESCE(u_ap.usuario, u_per.usuario) AS login_usuario,
              COALESCE(u_ap.estado, u_per.estado) AS usuario_estado,
              COALESCE(u_ap.tipo, u_per.tipo) AS usuario_tipo
       FROM apoderados ap
       ${SQL_JOIN_USUARIO_APODERADO_OPT}
       WHERE ap.id = ? AND ap.colegio_id = ?
       LIMIT 1`,
      [id, colegio_id]
    );
    if (!base.length) {
      return res.status(404).json({ error: 'No encontrado' });
    }

    const hijosRows = await query(
      `SELECT DISTINCT
          a.id AS alumno_id,
          a.nombres,
          a.apellido_paterno,
          a.apellido_materno,
          a.nro_documento,
          g.anio,
          g.grado,
          g.seccion,
          n.nombre AS nivel_nombre,
          m.estado AS matricula_estado
       FROM familias f
       INNER JOIN alumnos a ON a.id = f.alumno_id AND a.colegio_id = ?
       LEFT JOIN matriculas m ON m.id = (
         SELECT m2.id
         FROM matriculas m2
         INNER JOIN grupos g2 ON g2.id = m2.grupo_id AND g2.colegio_id = m2.colegio_id
         WHERE m2.alumno_id = a.id AND m2.colegio_id = a.colegio_id
         ORDER BY (m2.estado = 0 OR m2.estado = 4) DESC, g2.anio DESC, m2.id DESC
         LIMIT 1
       )
       LEFT JOIN grupos g ON g.id = m.grupo_id AND g.colegio_id = a.colegio_id
       LEFT JOIN niveles n ON n.id = g.nivel_id
       WHERE f.apoderado_id = ?
       ORDER BY a.apellido_paterno, a.apellido_materno, a.nombres`,
      [colegio_id, id]
    );

    const hijos = (hijosRows || []).map((h) => {
      const grupoTxt = `${h.nivel_nombre || ''} ${h.grado ? `${h.grado}°` : ''} ${h.seccion || ''} - ${h.anio || ''}`
        .replace(/\s+/g, ' ')
        .trim();
      const est = h.matricula_estado;
      const vigente = est === 0 || est === 4;
      return {
        alumno_id: h.alumno_id,
        nombres: h.nombres || '',
        apellido_paterno: h.apellido_paterno || '',
        apellido_materno: h.apellido_materno || '',
        nro_documento: h.nro_documento != null ? String(h.nro_documento).trim() : '',
        anio: h.anio,
        grado: h.grado,
        seccion: h.seccion,
        nivel_nombre: h.nivel_nombre || '',
        matricula_estado: est,
        matricula_vigente: vigente,
        grupo_texto: grupoTxt || '—',
      };
    });

    const alumnoIds = [...new Set(hijos.map((h) => h.alumno_id).filter(Boolean))];
    let otros_apoderados = [];
    if (alumnoIds.length > 0) {
      const ph = alumnoIds.map(() => '?').join(',');
      const otrosRows = await query(
        `SELECT DISTINCT
            ap.id,
            ap.nombres,
            ap.apellido_paterno,
            ap.apellido_materno,
            ap.nro_documento,
            ap.email,
            ap.telefono_celular,
            ap.parentesco,
            u.id AS usuario_id,
            u.estado AS usuario_estado,
            u.tipo AS usuario_tipo
         FROM familias f
         INNER JOIN apoderados ap ON ap.id = f.apoderado_id AND ap.colegio_id = ?
         LEFT JOIN usuarios u ON u.apoderado_id = ap.id AND u.colegio_id = ap.colegio_id
         WHERE f.alumno_id IN (${ph})
           AND ap.id <> ?
         ORDER BY ap.apellido_paterno, ap.apellido_materno, ap.nombres`,
        [colegio_id, ...alumnoIds, id]
      );
      otros_apoderados = otrosRows || [];
    }

    res.json({
      ...base[0],
      hijos,
      otros_apoderados,
    });
  } catch (e) {
    console.error('GET apoderado detalle admin', e);
    res.status(500).json({ error: e.message || 'Error al cargar detalle' });
  }
});

/**
 * POST /apoderados/:apoderadoId/vincular-alumno
 * Vincula un alumno existente (por DNI) al apoderado en `familias`.
 */
router.post('/apoderados/:apoderadoId/vincular-alumno', async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const apoderadoId = parseInt(req.params.apoderadoId, 10);
    const dni = String(req.body.nro_documento || '').trim();
    if (!apoderadoId || !dni) {
      return res.status(400).json({ error: 'Apoderado y DNI son obligatorios' });
    }
    const ap = await query('SELECT id FROM apoderados WHERE id = ? AND colegio_id = ? LIMIT 1', [apoderadoId, colegio_id]);
    if (!ap.length) {
      return res.status(404).json({ error: 'Apoderado no encontrado' });
    }
    const alrows = await query(
      'SELECT id FROM alumnos WHERE colegio_id = ? AND TRIM(nro_documento) = ? LIMIT 1',
      [colegio_id, dni]
    );
    if (!alrows.length) {
      return res.status(404).json({ error: 'No hay alumno registrado con ese DNI en este colegio' });
    }
    const alumnoId = alrows[0].id;
    const dup = await query(
      'SELECT 1 FROM familias WHERE alumno_id = ? AND apoderado_id = ? LIMIT 1',
      [alumnoId, apoderadoId]
    );
    if (dup.length) {
      return res.status(409).json({ error: 'Ese alumno ya está vinculado a este apoderado' });
    }
    await execute('INSERT INTO familias (alumno_id, apoderado_id) VALUES (?, ?)', [alumnoId, apoderadoId]);
    res.json({ ok: true, alumno_id: alumnoId });
  } catch (e) {
    console.error('POST vincular-alumno', e);
    res.status(500).json({ error: e.message || 'Error al vincular' });
  }
});

router.post('/apoderados', uploadUsuarioFoto.single('foto'), async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const nom = String(req.body.nombres || '').trim();
    const ap = String(req.body.apellido_paterno || '').trim();
    const am = String(req.body.apellido_materno || '').trim();
    const doc = String(req.body.nro_documento || '').trim();
    const fn = req.body.fecha_nacimiento || '1980-01-01';
    if (!nom || !ap || !doc) {
      return res.status(400).json({ error: 'Nombres, apellido paterno y DNI son obligatorios' });
    }

    const dup = await query(
      'SELECT id FROM apoderados WHERE colegio_id = ? AND nro_documento = ? LIMIT 1',
      [colegio_id, doc]
    );
    if (dup.length) {
      return res.status(409).json({ error: 'Ya existe apoderado con ese DNI' });
    }

    const email = String(req.body.email || '').trim();
    const tel = String(req.body.telefono_celular || '').trim();
    let parentesco = parseInt(req.body.parentesco, 10);
    if (Number.isNaN(parentesco) || parentesco < 1 || parentesco > 4) parentesco = 1;
    const fotoNombre = req.file && req.file.filename ? req.file.filename : null;

    await execute(
      `INSERT INTO apoderados (
        colegio_id, nombres, apellido_paterno, apellido_materno, vive, tipo_documento, nro_documento, estado_civil,
        telefono_fijo, telefono_celular, direccion, centro_trabajo_direccion, grado_instruccion, ocupacion, parentesco,
        vive_con_estudiante, fecha_nacimiento, pais_nacimiento_id, email, foto, firma_digital
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        colegio_id,
        nom,
        ap,
        am,
        'SI',
        1,
        doc,
        0,
        '',
        tel,
        '',
        '',
        0,
        '',
        parentesco,
        'SI',
        fn.slice(0, 10),
        0,
        email,
        fotoNombre,
        '',
      ]
    );

    const [last] = await query(
      'SELECT id FROM apoderados WHERE colegio_id = ? AND nro_documento = ? ORDER BY id DESC LIMIT 1',
      [colegio_id, doc]
    );
    const apoderadoId = last?.id;
    if (!apoderadoId) {
      return res.status(500).json({ error: 'No se pudo crear apoderado' });
    }

    const existU = await query(
      'SELECT id, tipo, personal_id, apoderado_id, alumno_id FROM usuarios WHERE colegio_id = ? AND TRIM(usuario) = ? LIMIT 1',
      [colegio_id, doc]
    );

    if (!existU.length) {
      const pwd = sha1Password(doc);
      await execute(
        `INSERT INTO usuarios (
           colegio_id, alumno_id, personal_id, apoderado_id, usuario, password, tipo, estado,
           ms_email, ms_access_token, ms_refresh_token, ms_id_token, auth_token, permisos,
           cambiar_password, app_terminos_aceptados, cambiar_datos
         ) VALUES (?, 0, 0, ?, ?, ?, 'APODERADO', 'ACTIVO', '', '', '', '', '', '', 'NO', 'NO', 'SI')`,
        [colegio_id, apoderadoId, doc, pwd]
      );
      return res.status(201).json({
        apoderado_id: apoderadoId,
        usuario_compartido: false,
      });
    }

    const u = existU[0];
    const pid = parseInt(u.personal_id, 10) || 0;
    const aid = parseInt(u.apoderado_id, 10) || 0;
    const alumnoId = parseInt(u.alumno_id, 10) || 0;

    if (alumnoId > 0) {
      return res.status(409).json({ error: 'Este DNI ya está en uso como alumno' });
    }

    if (u.tipo === 'APODERADO' && pid === 0) {
      return res.status(409).json({
        error: 'Ya existe un usuario solo apoderado con este DNI. No se puede duplicar.',
      });
    }

    if (pid > 0) {
      if (aid > 0 && aid !== apoderadoId) {
        return res.status(409).json({
          error: 'Este usuario de personal ya está vinculado a otra ficha de apoderado.',
        });
      }
      await execute('UPDATE usuarios SET apoderado_id = ? WHERE id = ? AND colegio_id = ?', [
        apoderadoId,
        u.id,
        colegio_id,
      ]);
      return res.status(201).json({
        apoderado_id: apoderadoId,
        usuario_compartido: true,
        usuario_tipo: u.tipo,
        mensaje:
          'Ficha de apoderado creada. El mismo DNI usa la cuenta de personal/docente; no se creó un segundo usuario.',
      });
    }

    return res.status(409).json({ error: 'El DNI ya está en uso en otra cuenta del sistema' });
  } catch (e) {
    console.error('POST apoderado admin', e);
    if (e.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Duplicado' });
    }
    res.status(500).json({ error: e.message || 'Error al crear apoderado' });
  }
});

router.put('/apoderados/:id', async (req, res) => {
  try {
    const { colegio_id, usuario_id: adminUsuarioId } = req.user;
    const id = parseInt(req.params.id, 10);
    const exist = await query(
      'SELECT id, nro_documento FROM apoderados WHERE id = ? AND colegio_id = ? LIMIT 1',
      [id, colegio_id]
    );
    if (!exist.length) {
      return res.status(404).json({ error: 'No encontrado' });
    }

    const uAp = await resolverUsuarioFilaParaApoderado(colegio_id, id);

    const nom = req.body.nombres != null ? String(req.body.nombres).trim() : null;
    const ap = req.body.apellido_paterno != null ? String(req.body.apellido_paterno).trim() : null;
    const am = req.body.apellido_materno != null ? String(req.body.apellido_materno).trim() : null;
    const doc = req.body.nro_documento != null ? String(req.body.nro_documento).trim() : null;
    const email = req.body.email != null ? String(req.body.email).trim() : null;
    const tel = req.body.telefono_celular != null ? String(req.body.telefono_celular) : null;
    let parentesco = null;
    if (req.body.parentesco !== undefined && req.body.parentesco !== null && req.body.parentesco !== '') {
      const p = parseInt(req.body.parentesco, 10);
      if (!Number.isNaN(p) && p >= 1 && p <= 4) parentesco = p;
    }
    let fechaNac = null;
    if (req.body.fecha_nacimiento !== undefined && req.body.fecha_nacimiento !== null && req.body.fecha_nacimiento !== '') {
      const raw = String(req.body.fecha_nacimiento).trim().slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) fechaNac = raw;
    }
    const usuario_estado = req.body.usuario_estado != null ? String(req.body.usuario_estado).toUpperCase() : null;

    if (doc && doc !== exist[0].nro_documento) {
      const dup = await query(
        'SELECT id FROM apoderados WHERE colegio_id = ? AND nro_documento = ? AND id != ? LIMIT 1',
        [colegio_id, doc, id]
      );
      if (dup.length) {
        return res.status(409).json({ error: 'Otro apoderado usa ese DNI' });
      }
      if (!(await usuarioLibre(colegio_id, doc, uAp?.id))) {
        return res.status(409).json({ error: 'El DNI ya está en uso' });
      }
    }

    const sets = [];
    const params = [];
    if (nom != null) {
      sets.push('nombres = ?');
      params.push(nom);
    }
    if (ap != null) {
      sets.push('apellido_paterno = ?');
      params.push(ap);
    }
    if (am != null) {
      sets.push('apellido_materno = ?');
      params.push(am);
    }
    if (doc != null) {
      sets.push('nro_documento = ?');
      params.push(doc);
    }
    if (email != null) {
      sets.push('email = ?');
      params.push(email);
    }
    if (tel != null) {
      sets.push('telefono_celular = ?');
      params.push(tel);
    }
    if (parentesco != null) {
      sets.push('parentesco = ?');
      params.push(parentesco);
    }
    if (fechaNac != null) {
      sets.push('fecha_nacimiento = ?');
      params.push(fechaNac);
    }
    if (sets.length) {
      params.push(id, colegio_id);
      await execute(`UPDATE apoderados SET ${sets.join(', ')} WHERE id = ? AND colegio_id = ?`, params);
    }

    const nuevoDoc = doc != null ? doc : exist[0].nro_documento;
    if (uAp) {
      if (doc != null && doc !== uAp.usuario) {
        await execute('UPDATE usuarios SET usuario = ? WHERE id = ? AND colegio_id = ?', [nuevoDoc, uAp.id, colegio_id]);
      }
      if (usuario_estado === 'ACTIVO' || usuario_estado === 'INACTIVO') {
        if (parseInt(uAp.id, 10) === parseInt(adminUsuarioId, 10) && usuario_estado === 'INACTIVO') {
          return res.status(400).json({ error: 'No puede desactivar su propio usuario' });
        }
        await execute('UPDATE usuarios SET estado = ? WHERE id = ? AND colegio_id = ?', [
          usuario_estado,
          uAp.id,
          colegio_id,
        ]);
      }
    }

    res.json({ ok: true });
  } catch (e) {
    console.error('PUT apoderado admin', e);
    res.status(500).json({ error: e.message || 'Error al actualizar' });
  }
});

router.put('/apoderados/:id/foto', uploadUsuarioFoto.single('foto'), async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const id = parseInt(req.params.id, 10);
    if (!id) {
      return res.status(400).json({ error: 'ID inválido' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Debe adjuntar una imagen' });
    }

    const exist = await query('SELECT id FROM apoderados WHERE id = ? AND colegio_id = ? LIMIT 1', [id, colegio_id]);
    if (!exist.length) {
      return res.status(404).json({ error: 'No encontrado' });
    }

    await execute('UPDATE apoderados SET foto = ? WHERE id = ? AND colegio_id = ?', [req.file.filename, id, colegio_id]);
    res.json({ ok: true, foto: req.file.filename });
  } catch (e) {
    console.error('PUT /admin/usuarios/apoderados/:id/foto', e);
    res.status(500).json({ error: e.message || 'Error al actualizar foto' });
  }
});

router.post('/apoderados/:id/reset-password', async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const id = parseInt(req.params.id, 10);
    const urow = await resolverUsuarioFilaParaApoderado(colegio_id, id);
    if (!urow || !urow.id) {
      return res.status(404).json({ error: 'Usuario no encontrado para este apoderado' });
    }
    const apRows = await query('SELECT nro_documento FROM apoderados WHERE id = ? AND colegio_id = ? LIMIT 1', [
      id,
      colegio_id,
    ]);
    const dni = String(apRows[0]?.nro_documento || '').trim();
    if (!dni) {
      return res.status(404).json({ error: 'Apoderado no encontrado' });
    }
    const pwd = sha1Password(dni);
    await execute('UPDATE usuarios SET password = ?, cambiar_password = ? WHERE id = ? AND colegio_id = ?', [
      pwd,
      'NO',
      urow.id,
      colegio_id,
    ]);
    res.json({ ok: true });
  } catch (e) {
    console.error('reset apoderado pwd', e);
    res.status(500).json({ error: e.message || 'Error' });
  }
});

router.post('/apoderados/:id/password', async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const id = parseInt(req.params.id, 10);
    const password = String(req.body.password || '').trim();
    if (!id) {
      return res.status(400).json({ error: 'ID inválido' });
    }
    if (password.length < 4) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 4 caracteres' });
    }
    const urow = await resolverUsuarioFilaParaApoderado(colegio_id, id);
    if (!urow || !urow.id) {
      return res.status(404).json({ error: 'Usuario no encontrado para este apoderado' });
    }
    const pwd = sha1Password(password);
    await execute('UPDATE usuarios SET password = ?, cambiar_password = ? WHERE id = ? AND colegio_id = ?', [
      pwd,
      'NO',
      urow.id,
      colegio_id,
    ]);
    res.json({ ok: true });
  } catch (e) {
    console.error('POST apoderado password admin', e);
    res.status(500).json({ error: e.message || 'Error al cambiar contraseña' });
  }
});

router.post('/apoderados/:id/acceso', async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const id = parseInt(req.params.id, 10);
    const arows = await query('SELECT id, nro_documento FROM apoderados WHERE id = ? AND colegio_id = ? LIMIT 1', [
      id,
      colegio_id,
    ]);
    if (!arows.length) {
      return res.status(404).json({ error: 'No encontrado' });
    }
    const dni = String(arows[0].nro_documento || '').trim();

    const uLinked = await query(
      'SELECT id FROM usuarios WHERE colegio_id = ? AND apoderado_id = ? LIMIT 1',
      [colegio_id, id]
    );
    if (uLinked.length) {
      return res.status(409).json({ error: 'Ya tiene acceso vinculado (apoderado_id)' });
    }

    const urow = await resolverUsuarioFilaParaApoderado(colegio_id, id);
    if (urow && urow.id) {
      const aid = parseInt(urow.apoderado_id, 10) || 0;
      if (aid > 0 && aid !== id) {
        return res.status(409).json({ error: 'El usuario con este DNI ya está vinculado a otro apoderado' });
      }
      await execute('UPDATE usuarios SET apoderado_id = ? WHERE id = ? AND colegio_id = ?', [id, urow.id, colegio_id]);
      return res.status(201).json({ ok: true, usuario_compartido: true });
    }

    if (!(await usuarioLibre(colegio_id, dni))) {
      return res.status(409).json({ error: 'DNI en uso' });
    }
    const pwd = sha1Password(dni);
    await execute(
      `INSERT INTO usuarios (
         colegio_id, alumno_id, personal_id, apoderado_id, usuario, password, tipo, estado,
         ms_email, ms_access_token, ms_refresh_token, ms_id_token, auth_token, permisos,
         cambiar_password, app_terminos_aceptados, cambiar_datos
       ) VALUES (?, 0, 0, ?, ?, ?, 'APODERADO', 'ACTIVO', '', '', '', '', '', '', 'NO', 'NO', 'SI')`,
      [colegio_id, id, dni, pwd]
    );
    res.status(201).json({ ok: true, usuario_compartido: false });
  } catch (e) {
    console.error('POST apoderado acceso', e);
    res.status(500).json({ error: e.message || 'Error' });
  }
});

router.delete('/apoderados/:id', async (req, res) => {
  try {
    const { colegio_id, usuario_id: adminUsuarioId } = req.user;
    const id = parseInt(req.params.id, 10);
    if (!id) {
      return res.status(400).json({ error: 'ID inválido' });
    }
    const arows = await query('SELECT id FROM apoderados WHERE id = ? AND colegio_id = ? LIMIT 1', [id, colegio_id]);
    if (!arows.length) {
      return res.status(404).json({ error: 'No encontrado' });
    }

    const uRows = await query(
      'SELECT id, tipo, personal_id, alumno_id FROM usuarios WHERE apoderado_id = ? AND colegio_id = ?',
      [id, colegio_id]
    );
    for (const u of uRows) {
      if (parseInt(u.id, 10) === parseInt(adminUsuarioId, 10)) {
        return res.status(400).json({ error: 'No puede eliminar su propio usuario vinculado a este apoderado.' });
      }
      const pid = parseInt(u.personal_id, 10) || 0;
      const aid = parseInt(u.alumno_id, 10) || 0;
      const tipo = String(u.tipo || '').toUpperCase();
      if (tipo === 'APODERADO' && pid === 0 && aid === 0) {
        await execute('DELETE FROM usuarios WHERE id = ? AND colegio_id = ?', [u.id, colegio_id]);
      } else {
        await execute('UPDATE usuarios SET apoderado_id = 0 WHERE id = ? AND colegio_id = ?', [u.id, colegio_id]);
      }
    }

    await execute('DELETE FROM familias WHERE apoderado_id = ?', [id]);
    await execute('DELETE FROM apoderados WHERE id = ? AND colegio_id = ?', [id, colegio_id]);
    res.json({ ok: true });
  } catch (e) {
    console.error('DELETE apoderado admin', e);
    res.status(500).json({ error: e.message || 'Error al eliminar apoderado' });
  }
});

module.exports = router;
