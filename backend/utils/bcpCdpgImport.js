/**
 * Importación CDPG y actualización n° operación (legacy importar_bcp / importar_operacion).
 */
const phpSerialize = require('php-serialize');
const XLSX = require('xlsx');
const { query, execute, mysqlReadPool } = require('./mysql');
const { parseCdpgLine } = require('./bcpFormat');
const { resolverPersonalIdPago } = require('./pagoPendienteInsert');
const { fechaMySQLLima } = require('./fechaHoraLima');

async function matriculaExists(colegioId, matriculaId) {
  const rows = await query(
    `SELECT m.id, m.estado, m.costo_id, c.matricula, c.agenda
     FROM matriculas m
     LEFT JOIN costos c ON c.id = m.costo_id
     WHERE m.id = ? AND m.colegio_id = ? LIMIT 1`,
    [matriculaId, colegioId]
  );
  return rows[0] || null;
}

async function findPagoActivo(colegioId, matriculaId, nroPago, tipo) {
  const rows = await query(
    `SELECT * FROM pagos WHERE estado = 'ACTIVO' AND colegio_id = ? AND matricula_id = ? AND nro_pago = ? AND tipo = ? LIMIT 1`,
    [colegioId, matriculaId, nroPago, tipo]
  );
  return rows[0] || null;
}

async function findPagoAgendaCancelado(colegioId, matriculaId) {
  const rows = await query(
    `SELECT id FROM pagos WHERE estado_pago = 'CANCELADO' AND estado = 'ACTIVO'
     AND colegio_id = ? AND matricula_id = ? AND nro_pago = 1 AND tipo = 2 AND incluye_agenda = 'SI' LIMIT 1`,
    [colegioId, matriculaId]
  );
  return rows[0] || null;
}

async function activarMatriculaRegularSiTemporal(conn, matriculaId, tipo) {
  if (tipo !== 0) return;
  await conn.execute(`UPDATE matriculas SET estado = 0 WHERE id = ? AND estado = 4`, [matriculaId]);
}

async function insertPagoImportado(conn, fields) {
  const cols = Object.keys(fields);
  const vals = cols.map((k) => fields[k]);
  const ph = cols.map(() => '?').join(', ');
  const [result] = await conn.execute(`INSERT INTO pagos (${cols.join(', ')}) VALUES (${ph})`, vals);
  return result.insertId;
}

async function updatePagoImportado(conn, pagoId, fields) {
  const cols = Object.keys(fields);
  const sets = cols.map((c) => `${c} = ?`).join(', ');
  const vals = [...cols.map((c) => fields[c]), pagoId];
  await conn.execute(`UPDATE pagos SET ${sets} WHERE id = ?`, vals);
}

function basePagoImport(personalId, details) {
  return {
    monto: details.importe_origen,
    mora: details.importe_mora,
    fecha_hora: `${details.fecha} 00:00:00`,
    fecha_cancelado: details.fecha,
    observaciones: 'IMPORTADO',
    personal_id: personalId,
    estado_pago: 'CANCELADO',
    nro_movimiento_banco: details.nro_movimiento,
    banco: 'BCP',
    estado: 'ACTIVO',
    forma_pago: 'EFECTIVO',
    lugar_pago: 'BANCO',
  };
}

async function importPago(conn, colegioId, matricula, details, tipo, nroPago, personalId) {
  let pago = await findPagoActivo(colegioId, matricula.id, nroPago, tipo);
  const base = basePagoImport(personalId, details);

  if (!pago) {
    const id = await insertPagoImportado(conn, {
      colegio_id: colegioId,
      matricula_id: matricula.id,
      nro_pago: nroPago,
      tipo,
      descripcion: 'PAGO CANCELADO',
      ...base,
    });
    await activarMatriculaRegularSiTemporal(conn, matricula.id, tipo);
    return { id };
  }

  if (String(pago.estado_pago).toUpperCase() === 'PENDIENTE') {
    await updatePagoImportado(conn, pago.id, {
      monto: base.monto,
      mora: base.mora,
      fecha_cancelado: base.fecha_cancelado,
      descripcion: 'PAGO CANCELADO',
      observaciones: base.observaciones,
      personal_id: personalId,
      estado_pago: 'CANCELADO',
      nro_movimiento_banco: base.nro_movimiento_banco,
      banco: 'BCP',
    });
    await activarMatriculaRegularSiTemporal(conn, matricula.id, tipo);
    return { id: pago.id };
  }

  return null;
}

async function importPagoAdelantoMatricula(conn, colegioId, matricula, details, personalId) {
  const base = basePagoImport(personalId, details);
  const id = await insertPagoImportado(conn, {
    colegio_id: colegioId,
    matricula_id: matricula.id,
    nro_pago: 1,
    tipo: 0,
    descripcion: 'ADELANTO MATRICULA',
    ...base,
  });
  await activarMatriculaRegularSiTemporal(conn, matricula.id, 0);
  return { id };
}

async function importCancelacionAdelantoMatricula(conn, colegioId, matricula, details, personalId) {
  const agenda = parseFloat(matricula.agenda) || 0;
  const montoMatricula = details.importe_origen - agenda;
  const base = basePagoImport(personalId, details);

  const id = await insertPagoImportado(conn, {
    colegio_id: colegioId,
    matricula_id: matricula.id,
    nro_pago: 1,
    tipo: 0,
    monto: montoMatricula,
    descripcion: 'CANCELACION ADELANTO MATRICULA',
    incluye_agenda: 'SI',
    ...base,
  });

  const pagoAgenda = await findPagoAgendaCancelado(colegioId, matricula.id);
  if (!pagoAgenda) {
    await insertPagoImportado(conn, {
      colegio_id: colegioId,
      matricula_id: matricula.id,
      nro_pago: 1,
      tipo: 2,
      monto: agenda,
      mora: 0,
      fecha_hora: base.fecha_hora,
      fecha_cancelado: base.fecha_cancelado,
      descripcion: 'PAGO DE AGENDA',
      observaciones: 'Matrícula y Agenda',
      personal_id: personalId,
      estado_pago: 'CANCELADO',
      incluye_agenda: 'SI',
      nro_movimiento_banco: base.nro_movimiento_banco,
      banco: 'BCP',
      estado: 'ACTIVO',
      forma_pago: 'EFECTIVO',
      lugar_pago: 'BANCO',
    });
  }

  await activarMatriculaRegularSiTemporal(conn, matricula.id, 0);
  return { id };
}

async function importMatriculaAgenda(conn, colegioId, matricula, details, personalId) {
  let monto = details.importe_origen;
  let montoAgenda = 0;
  const costoMat = parseFloat(matricula.matricula) || 0;
  const costoAgenda = parseFloat(matricula.agenda) || 0;

  if (monto >= costoMat + costoAgenda) {
    montoAgenda = monto - costoMat;
    monto = monto - costoAgenda;
  }

  const pagosIds = [];
  let pago = await findPagoActivo(colegioId, matricula.id, 1, 0);
  const pagoAgendaEx = await findPagoAgendaCancelado(colegioId, matricula.id);

  if (pago) pagosIds.push(pago.id);
  if (pagoAgendaEx) pagosIds.push(pagoAgendaEx.id);

  if (!pago) {
    const base = basePagoImport(personalId, details);
    const id = await insertPagoImportado(conn, {
      colegio_id: colegioId,
      matricula_id: matricula.id,
      nro_pago: 1,
      tipo: 0,
      monto,
      descripcion: 'PAGO CANCELADO',
      incluye_agenda: 'SI',
      ...base,
    });
    pagosIds.push(id);

    if (!pagoAgendaEx && montoAgenda > 0) {
      const idAg = await insertPagoImportado(conn, {
        colegio_id: colegioId,
        matricula_id: matricula.id,
        nro_pago: 1,
        tipo: 2,
        monto: montoAgenda,
        mora: 0,
        fecha_hora: base.fecha_hora,
        fecha_cancelado: base.fecha_cancelado,
        descripcion: 'PAGO DE AGENDA',
        observaciones: 'Matrícula y Agenda',
        personal_id: personalId,
        estado_pago: 'CANCELADO',
        incluye_agenda: 'SI',
        nro_movimiento_banco: base.nro_movimiento_banco,
        banco: 'BCP',
        estado: 'ACTIVO',
        forma_pago: 'EFECTIVO',
        lugar_pago: 'BANCO',
      });
      pagosIds.push(idAg);
    }

    await activarMatriculaRegularSiTemporal(conn, matricula.id, 0);
  }

  return pagosIds.length ? pagosIds : null;
}

async function importComedor(conn, colegioId, matricula, details, personalId) {
  const nroPago = details.nro_pago - 50;
  const existente = await query(
    `SELECT id FROM pagos WHERE estado_pago = 'CANCELADO' AND estado = 'ACTIVO'
     AND colegio_id = ? AND matricula_id = ? AND nro_pago = ? AND tipo = 3 LIMIT 1`,
    [colegioId, matricula.id, nroPago]
  );
  if (existente.length) return { id: existente[0].id };

  const base = basePagoImport(personalId, details);
  const id = await insertPagoImportado(conn, {
    colegio_id: colegioId,
    matricula_id: matricula.id,
    nro_pago: nroPago,
    tipo: 3,
    descripcion: 'COMEDOR',
    ...base,
  });
  return { id };
}

async function procesarLineaCdpg(conn, colegioId, matricula, details, personalId) {
  const np = details.nro_pago;
  if (np === 21) return importPagoAdelantoMatricula(conn, colegioId, matricula, details, personalId);
  if (np === 22) return importCancelacionAdelantoMatricula(conn, colegioId, matricula, details, personalId);
  if (np > 50) return importComedor(conn, colegioId, matricula, details, personalId);
  if (np === 20) return importMatriculaAgenda(conn, colegioId, matricula, details, personalId);
  if (np === 0) return importPago(conn, colegioId, matricula, details, 0, 1, personalId);
  if (np >= 1 && np <= 10) return importPago(conn, colegioId, matricula, details, 1, np, personalId);
  return null;
}

function normalizarIdsPago(result) {
  if (!result) return [];
  if (Array.isArray(result)) return result.map((x) => (typeof x === 'object' ? x.id : x)).filter(Boolean);
  return [result.id].filter(Boolean);
}

/**
 * @param {string} fileText contenido UTF-8 del archivo
 */
async function importarCdpg(colegioId, fileText, nombreArchivo, reqUser) {
  const personalId = await resolverPersonalIdPago(colegioId, reqUser);
  if (!personalId) {
    return { ok: false, status: 400, error: 'No hay personal en el colegio para asociar los pagos importados.' };
  }

  const rawLines = String(fileText || '').split(/\r?\n/);
  const errores = [];
  const erroresFormato = [];
  const pagoIds = [];

  const conn = await mysqlReadPool.getConnection();

  try {
    for (let x = 1; x < rawLines.length; x += 1) {
      const line = rawLines[x];
      if (!String(line).trim()) continue;

      const parsed = parseCdpgLine(line, x + 1);
      if (!parsed.ok) {
        erroresFormato.push(parsed.error);
        continue;
      }
      const details = parsed.data;

      const matricula = await matriculaExists(colegioId, details.matricula_id);
      if (!matricula) {
        errores.push(`ID: ${details.matricula_id} - DNI: ${details.dni}`);
        continue;
      }

      try {
        await conn.beginTransaction();
        const result = await procesarLineaCdpg(conn, colegioId, matricula, details, personalId);
        await conn.commit();
        normalizarIdsPago(result).forEach((id) => pagoIds.push(id));
      } catch (lineErr) {
        await conn.rollback();
        errores.push(`Línea ${x + 1}: ${lineErr.message || 'Error al registrar pago'}`);
      }
    }
  } finally {
    conn.release();
  }

  if (erroresFormato.length > 0) {
    return {
      ok: false,
      status: 400,
      code: -3,
      error: 'El archivo tiene líneas con formato inválido.',
      errores: erroresFormato,
    };
  }

  if (errores.length > 0) {
    return {
      ok: false,
      status: 400,
      code: -2,
      error: 'Se procesó el archivo, pero hay matrículas no encontradas u otros errores. No se guardó el historial.',
      errores,
      pagos_procesados: pagoIds.length,
    };
  }

  let historialId = null;
  if (pagoIds.length > 0) {
    const dataSerialized = Buffer.from(phpSerialize.serialize(pagoIds), 'utf8').toString('base64');
    const fechaHoy = fechaMySQLLima();
    const ins = await execute(
      `INSERT INTO pagos_historial (colegio_id, archivo, fecha, data, impreso) VALUES (?, ?, ?, ?, 'NO')`,
      [colegioId, nombreArchivo || 'importacion.txt', fechaHoy, dataSerialized]
    );
    historialId = ins.insertId;
  }

  return {
    ok: true,
    code: 1,
    pagos_procesados: pagoIds.length,
    historial_id: historialId,
  };
}

function parseExcelFecha(cellVal) {
  if (cellVal == null || cellVal === '') return null;
  if (typeof cellVal === 'number') {
    const dc = XLSX.SSF.parse_date_code(cellVal);
    if (dc) {
      return `${dc.y}-${String(dc.m).padStart(2, '0')}-${String(dc.d).padStart(2, '0')}`;
    }
  }
  const s = String(cellVal).trim().replace(/\//g, '-');
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/) || s.match(/^(\d{2})-(\d{2})-(\d{4})/);
  if (m) {
    if (m[1].length === 4) return `${m[1]}-${m[2]}-${m[3]}`;
    return `${m[3]}-${m[2]}-${m[1]}`;
  }
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return fechaMySQLLima(d);
  return null;
}

async function importarNumeroOperacion(colegioId, buffer, startRow) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) {
    return { ok: false, status: 400, error: 'El archivo Excel no tiene hojas.' };
  }

  let row = Math.max(1, parseInt(startRow, 10) || 5);
  let actualizados = 0;
  const errores = [];

  while (true) {
    const fechaCell = sheet[`A${row}`]?.v;
    if (fechaCell == null || fechaCell === '') break;

    const fecha = parseExcelFecha(fechaCell);
    const dniRaw = sheet[`C${row}`]?.v;
    const dni = String(dniRaw ?? '').substr(14, 8).trim();
    const numero = sheet[`G${row}`]?.v;

    if (!fecha) {
      errores.push(`Fila ${row}: fecha inválida`);
      row += 1;
      continue;
    }
    if (!dni) {
      errores.push(`Fila ${row}: DNI inválido en columna C`);
      row += 1;
      continue;
    }

    const pagos = await query(
      `SELECT p.id FROM pagos p
       INNER JOIN matriculas m ON m.id = p.matricula_id
       INNER JOIN alumnos a ON a.id = m.alumno_id
       WHERE p.fecha_cancelado = ? AND a.nro_documento = ? AND p.colegio_id = ?`,
      [fecha, dni, colegioId]
    );

    for (const p of pagos || []) {
      await execute(`UPDATE pagos SET nro_movimiento_importado = ? WHERE id = ?`, [String(numero ?? ''), p.id]);
      actualizados += 1;
    }

    row += 1;
  }

  return { ok: true, code: 1, actualizados, errores };
}

function parseHistorialPagoIds(dataField) {
  if (!dataField) return [];
  try {
    let raw = String(dataField);
    try {
      raw = Buffer.from(raw, 'base64').toString('utf8');
    } catch {
      /* plain */
    }
    const arr = phpSerialize.unserialize(raw);
    if (Array.isArray(arr)) {
      return arr.map((id) => parseInt(id, 10)).filter((id) => Number.isFinite(id) && id > 0);
    }
  } catch {
    try {
      const j = JSON.parse(String(dataField));
      if (Array.isArray(j)) {
        return j.map((id) => parseInt(id, 10)).filter((id) => Number.isFinite(id) && id > 0);
      }
    } catch {
      /* ignore */
    }
  }
  return [];
}

function contarPagosHistorial(dataField) {
  return parseHistorialPagoIds(dataField).length;
}

async function listarHistorialImportaciones(colegioId, { anio, page = 1, pageSize = 10 }) {
  const anioN = parseInt(anio, 10) || new Date().getFullYear();
  const pageN = Math.max(1, parseInt(page, 10) || 1);
  const sizeN = Math.min(100, Math.max(1, parseInt(pageSize, 10) || 20));
  const offset = (pageN - 1) * sizeN;

  const [countRow] = await query(
    `SELECT COUNT(*) AS total FROM pagos_historial
     WHERE colegio_id = ? AND YEAR(fecha) = ?`,
    [colegioId, anioN]
  );
  const total = parseInt(countRow?.total, 10) || 0;

  const rows = await query(
    `SELECT id, archivo, fecha, data, impreso FROM pagos_historial
     WHERE colegio_id = ? AND YEAR(fecha) = ?
     ORDER BY fecha DESC, id DESC
     LIMIT ? OFFSET ?`,
    [colegioId, anioN, sizeN, offset]
  );

  const items = (rows || []).map((r) => ({
    id: r.id,
    fecha: r.fecha,
    archivo: r.archivo,
    cantidad_pagos: contarPagosHistorial(r.data),
    estado: String(r.impreso).toUpperCase() === 'SI' ? 'BOLETAS IMPRESAS' : 'IMPRESION PENDIENTE',
    impreso: r.impreso,
  }));

  return {
    items,
    pagination: {
      page: pageN,
      page_size: sizeN,
      total,
      total_pages: Math.max(1, Math.ceil(total / sizeN)),
    },
    anio: anioN,
  };
}

async function obtenerHistorialImportacion(colegioId, historialId) {
  const id = parseInt(historialId, 10);
  if (!Number.isFinite(id) || id < 1) {
    return { ok: false, status: 400, error: 'ID de historial inválido.' };
  }

  const rows = await query(
    `SELECT id, archivo, fecha, data, impreso FROM pagos_historial
     WHERE id = ? AND colegio_id = ? LIMIT 1`,
    [id, colegioId]
  );
  const row = rows?.[0];
  if (!row) {
    return { ok: false, status: 404, error: 'Registro de historial no encontrado.' };
  }

  const pagoIds = parseHistorialPagoIds(row.data);
  let pagos = [];
  if (pagoIds.length > 0) {
    const placeholders = pagoIds.map(() => '?').join(',');
    pagos = await query(
      `SELECT p.id, p.nro_pago, p.descripcion, p.monto, p.mora, p.estado_pago, p.fecha_cancelado,
              a.nro_documento AS dni, a.apellido_paterno, a.apellido_materno, a.nombres,
              g.grado, g.seccion, n.nombre AS nivel_nombre
       FROM pagos p
       INNER JOIN matriculas m ON m.id = p.matricula_id
       INNER JOIN alumnos a ON a.id = m.alumno_id
       INNER JOIN grupos g ON g.id = m.grupo_id
       LEFT JOIN niveles n ON n.id = g.nivel_id
       WHERE p.colegio_id = ? AND p.id IN (${placeholders})
       ORDER BY a.apellido_paterno, a.apellido_materno, a.nombres, p.nro_pago`,
      [colegioId, ...pagoIds]
    );
  }

  return {
    ok: true,
    historial: {
      id: row.id,
      archivo: row.archivo,
      fecha: row.fecha,
      impreso: row.impreso,
      estado: String(row.impreso).toUpperCase() === 'SI' ? 'BOLETAS IMPRESAS' : 'IMPRESION PENDIENTE',
      cantidad_pagos: pagoIds.length,
    },
    pagos: (pagos || []).map((p) => ({
      id: p.id,
      nro_pago: p.nro_pago,
      descripcion: p.descripcion,
      monto: parseFloat(p.monto) || 0,
      mora: parseFloat(p.mora) || 0,
      estado_pago: p.estado_pago,
      fecha_cancelado: p.fecha_cancelado,
      dni: p.dni,
      alumno: [p.apellido_paterno, p.apellido_materno, p.nombres].filter(Boolean).join(' ').trim(),
      grado: p.grado,
      seccion: p.seccion,
      nivel: p.nivel_nombre,
    })),
  };
}

module.exports = {
  importarCdpg,
  importarNumeroOperacion,
  listarHistorialImportaciones,
  obtenerHistorialImportacion,
  parseHistorialPagoIds,
};
