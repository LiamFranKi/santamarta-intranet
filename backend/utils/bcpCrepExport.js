/**
 * Generación archivo CREP (export al BCP) — lógica legacy importar_exportar/do_bcp.
 */
const { query } = require('./mysql');
const { sqlMatriculaEstadoSoloRegular } = require('./matriculaEstados');
const { buildCrepDetailLine, buildCrepHeader, toYmdFromDateInput, nombreMesPension } = require('./bcpFormat');
const {
  cargarBcpColegioConfig,
  validarRecaudo,
  getFechaVencimiento,
  contarMatriculasAlumno,
} = require('./bcpColegioConfig');
const { listarGruposFiltro } = require('./listaAlumnosMatriculadosReporte');

async function sqlMatriculasExport(colegioId, matriculaIds) {
  if (!matriculaIds.length) return [];
  const ph = matriculaIds.map(() => '?').join(',');
  return query(
    `SELECT
      m.id,
      m.alumno_id,
      m.estado AS matricula_estado,
      m.grupo_id,
      g.anio AS grupo_anio,
      a.nro_documento,
      a.apellido_paterno,
      a.apellido_materno,
      a.nombres,
      COALESCE(c.matricula, 0) AS costo_matricula,
      COALESCE(c.pension, 0) AS costo_pension,
      COALESCE(c.agenda, 0) AS costo_agenda,
      COALESCE(n.monto_adelanto_matricula, 0) AS monto_adelanto_matricula
    FROM matriculas m
    INNER JOIN alumnos a ON a.id = m.alumno_id AND a.colegio_id = m.colegio_id
    INNER JOIN grupos g ON g.id = m.grupo_id
    LEFT JOIN costos c ON c.id = m.costo_id
    LEFT JOIN niveles n ON n.id = g.nivel_id
    WHERE m.colegio_id = ? AND m.id IN (${ph})
      AND (m.ocultar IS NULL OR m.ocultar = '' OR UPPER(TRIM(m.ocultar)) = 'NO')
    ORDER BY a.apellido_paterno, a.apellido_materno, a.nombres`,
    [colegioId, ...matriculaIds]
  );
}

async function matriculasIdsPorGrupos(colegioId, anio, grupoId, sedeId) {
  let grupoIds = [];
  if (grupoId === -1 || grupoId === '-1') {
    const grupos = await query(
      `SELECT id FROM grupos WHERE colegio_id = ? AND anio = ? ORDER BY nivel_id, grado, seccion`,
      [colegioId, anio]
    );
    grupoIds = (grupos || []).map((g) => g.id);
  } else {
    grupoIds = [parseInt(grupoId, 10)];
  }

  if (!grupoIds.length) return [];

  const ph = grupoIds.map(() => '?').join(',');
  let sql = `SELECT m.id FROM matriculas m
    INNER JOIN grupos g ON g.id = m.grupo_id
    WHERE m.colegio_id = ? AND m.grupo_id IN (${ph}) AND ${sqlMatriculaEstadoSoloRegular('m')}
      AND (m.ocultar IS NULL OR m.ocultar = '' OR UPPER(TRIM(m.ocultar)) = 'NO')`;
  const params = [colegioId, ...grupoIds];
  if (sedeId != null && Number.isFinite(sedeId)) {
    sql += ' AND g.sede_id = ?';
    params.push(sedeId);
  }
  const rows = await query(sql, params);
  return (rows || []).map((r) => r.id);
}

async function findPagoActivo(colegioId, matriculaId, nroPago, tipo) {
  const rows = await query(
    `SELECT id, monto, estado_pago FROM pagos
     WHERE estado = 'ACTIVO' AND colegio_id = ? AND matricula_id = ? AND nro_pago = ? AND tipo = ?
     LIMIT 1`,
    [colegioId, matriculaId, nroPago, tipo]
  );
  return rows[0] || null;
}

async function sumPagoCancelado(colegioId, matriculaId, nroPago, tipo) {
  const [row] = await query(
    `SELECT COALESCE(SUM(monto), 0) AS total FROM pagos
     WHERE estado_pago = 'CANCELADO' AND estado = 'ACTIVO' AND colegio_id = ?
       AND matricula_id = ? AND nro_pago = ? AND tipo = ?`,
    [colegioId, matriculaId, nroPago, tipo]
  );
  return parseFloat(row?.total) || 0;
}

async function findPagoAgendaCancelado(colegioId, matriculaId) {
  const rows = await query(
    `SELECT id FROM pagos WHERE estado_pago = 'CANCELADO' AND estado = 'ACTIVO'
     AND colegio_id = ? AND matricula_id = ? AND nro_pago = 1 AND tipo = 2 AND incluye_agenda = 'SI' LIMIT 1`,
    [colegioId, matriculaId]
  );
  return rows[0] || null;
}

function buildLinePayload(cfg, colegioId, matricula, payload, fechaArchivoYmd, tipo) {
  return buildCrepDetailLine(cfg.recaudo, matricula, payload, fechaArchivoYmd, tipo);
}

async function lineForMatriculaOrPension(cfg, colegioId, matricula, nroPago, tipo, tipoActualizacion, fechaArchivoYmd) {
  const pago = await findPagoActivo(colegioId, matricula.id, nroPago, tipo);
  if (pago && String(pago.estado_pago).toUpperCase() === 'CANCELADO') return null;
  if (tipo === 1 && parseFloat(matricula.costo_pension) <= 0) return null;

  let monto;
  let descripcion;
  let fecha_vencimiento;
  let nro_pago_export;

  if (tipo === 1) {
    fecha_vencimiento = getFechaVencimiento(cfg, matricula, nroPago);
    monto = pago ? parseFloat(pago.monto) : parseFloat(matricula.costo_pension) + cfg.monto_adicional;
    descripcion = `MENSUALIDAD ${nombreMesPension(nroPago, cfg.inicio_pensiones).toUpperCase()}`;
    nro_pago_export = nroPago;
  } else if (tipo === 0) {
    fecha_vencimiento = getFechaVencimiento(cfg, matricula, -1);
    monto = pago ? parseFloat(pago.monto) : parseFloat(matricula.costo_matricula);
    descripcion = `MATRICULA ${matricula.grupo_anio}`;
    nro_pago_export = 0;
  } else if (tipo === 3) {
    fecha_vencimiento = cfg.fecha_comedor || getFechaVencimiento(cfg, matricula, nroPago);
    monto = cfg.pago_comedor;
    descripcion = `COMEDOR ${nombreMesPension(nroPago, cfg.inicio_pensiones).toUpperCase()}`;
    nro_pago_export = nroPago;
  } else {
    return null;
  }

  return buildLinePayload(cfg, colegioId, matricula, {
    monto,
    nro_pago: nro_pago_export,
    descripcion,
    fecha_vencimiento,
  }, fechaArchivoYmd, tipoActualizacion);
}

async function lineForMatriculaAgenda(cfg, colegioId, matricula, tipoActualizacion, fechaArchivoYmd) {
  let total = 0;
  const pagoMat = await findPagoActivo(colegioId, matricula.id, 1, 0);
  if (!pagoMat || String(pagoMat.estado_pago).toUpperCase() !== 'CANCELADO') {
    total += parseFloat(matricula.costo_matricula) || 0;
  }
  const pagoAgenda = await findPagoAgendaCancelado(colegioId, matricula.id);
  if (!pagoAgenda) total += parseFloat(matricula.costo_agenda) || 0;
  if (total <= 0) return null;

  return buildLinePayload(cfg, colegioId, matricula, {
    monto: total,
    nro_pago: 20,
    descripcion: `MATRICULAYAGENDA${matricula.grupo_anio}`,
    fecha_vencimiento: getFechaVencimiento(cfg, matricula, -1),
  }, fechaArchivoYmd, tipoActualizacion);
}

async function lineForAdelantoMatricula(cfg, colegioId, matricula, tipoActualizacion, fechaArchivoYmd) {
  const pagoMat = await findPagoActivo(colegioId, matricula.id, 1, 0);
  if (pagoMat && String(pagoMat.estado_pago).toUpperCase() === 'CANCELADO') return null;

  const costoMat = parseFloat(matricula.costo_matricula) || 0;
  const adelanto = parseFloat(matricula.monto_adelanto_matricula) || 0;
  const monto = costoMat > adelanto && adelanto > 0 ? adelanto : costoMat;

  return buildLinePayload(cfg, colegioId, matricula, {
    monto,
    nro_pago: 21,
    descripcion: `RESERVA DE VACANTE${matricula.grupo_anio}`,
    fecha_vencimiento: getFechaVencimiento(cfg, matricula, -1),
  }, fechaArchivoYmd, tipoActualizacion);
}

async function lineForCancelacionMatricula(cfg, colegioId, matricula, tipoActualizacion, fechaArchivoYmd) {
  const totalPagado = await sumPagoCancelado(colegioId, matricula.id, 1, 0);
  if (totalPagado <= 0) return null;

  let monto = (parseFloat(matricula.costo_matricula) || 0) - totalPagado;
  const pagoAgenda = await findPagoAgendaCancelado(colegioId, matricula.id);
  if (!pagoAgenda) monto += parseFloat(matricula.costo_agenda) || 0;
  if (monto <= 0) return null;

  return buildLinePayload(cfg, colegioId, matricula, {
    monto,
    nro_pago: 22,
    descripcion: `CANCELACION MATRICULA${matricula.grupo_anio}`,
    fecha_vencimiento: getFechaVencimiento(cfg, matricula, -1),
  }, fechaArchivoYmd, tipoActualizacion);
}

async function lineForNroPago(cfg, colegioId, matricula, nroPago, tipoActualizacion, fechaArchivoYmd) {
  if (nroPago === 20) return lineForMatriculaAgenda(cfg, colegioId, matricula, tipoActualizacion, fechaArchivoYmd);
  if (nroPago === 21) return lineForAdelantoMatricula(cfg, colegioId, matricula, tipoActualizacion, fechaArchivoYmd);
  if (nroPago === 22) return lineForCancelacionMatricula(cfg, colegioId, matricula, tipoActualizacion, fechaArchivoYmd);
  if (nroPago > 50) return lineForMatriculaOrPension(cfg, colegioId, matricula, nroPago - 50, 3, tipoActualizacion, fechaArchivoYmd);
  if (nroPago >= 1 && nroPago <= 10) return lineForMatriculaOrPension(cfg, colegioId, matricula, nroPago, 1, tipoActualizacion, fechaArchivoYmd);
  if (nroPago === 0) return lineForMatriculaOrPension(cfg, colegioId, matricula, 1, 0, tipoActualizacion, fechaArchivoYmd);
  return null;
}

async function filtrarTipoAlumno(colegioId, matricula, tipoAlumno) {
  if (!tipoAlumno || tipoAlumno === 'TODOS') return true;
  const total = await contarMatriculasAlumno(colegioId, matricula.alumno_id);
  if (tipoAlumno === 'NUEVOS') return total <= 1;
  if (tipoAlumno === 'ANTIGUOS') return total > 1;
  return true;
}

async function generarCrep(colegioId, params) {
  const cfg = await cargarBcpColegioConfig(colegioId);
  const faltantes = validarRecaudo(cfg.recaudo);
  if (faltantes.length) {
    return {
      ok: false,
      status: 400,
      error: `Configure en Institucional los datos de recaudo BCP: ${faltantes.join(', ')}`,
    };
  }

  const fechaArchivoYmd = toYmdFromDateInput(params.fecha);
  if (!fechaArchivoYmd) {
    return { ok: false, status: 400, error: 'Fecha de archivo inválida.' };
  }

  const tipo = ['A', 'M', 'E'].includes(String(params.tipo || 'A').toUpperCase())
    ? String(params.tipo).toUpperCase()
    : 'A';
  const tipoDocumento = ['A', 'R'].includes(String(params.tipo_documento || 'A').toUpperCase())
    ? String(params.tipo_documento).toUpperCase()
    : 'A';
  const tipoAlumno = String(params.tipo_alumno || 'TODOS').toUpperCase();
  const nroPago = parseInt(params.nro_pago, 10);

  let matriculaIds = [];
  if (Array.isArray(params.matricula_id) && params.matricula_id.length) {
    matriculaIds = params.matricula_id.map((id) => parseInt(id, 10)).filter((n) => Number.isFinite(n) && n > 0);
  } else if (params.grupo_id != null && params.grupo_id !== '') {
    const anio = parseInt(params.anio, 10);
    const sedeId = params.sede_id != null && params.sede_id !== '' ? parseInt(params.sede_id, 10) : null;
    matriculaIds = await matriculasIdsPorGrupos(colegioId, anio, params.grupo_id, sedeId);
  }

  if (!matriculaIds.length) {
    return { ok: false, status: 400, error: 'No hay matrículas para exportar con los filtros indicados.' };
  }

  const matriculas = await sqlMatriculasExport(colegioId, matriculaIds);
  const detailMeta = [];

  for (const matricula of matriculas) {
    if (!(await filtrarTipoAlumno(colegioId, matricula, tipoAlumno))) continue;

    if (nroPago > -1) {
      const built = await lineForNroPago(cfg, colegioId, matricula, nroPago, tipo, fechaArchivoYmd);
      if (built) detailMeta.push(built);
    } else {
      for (let i = 0; i <= cfg.total_pensiones; i += 1) {
        const np = i === 0 ? 1 : i;
        const tp = i > 0 ? 1 : 0;
        const built = await lineForMatriculaOrPension(cfg, colegioId, matricula, np, tp, tipo, fechaArchivoYmd);
        if (built) detailMeta.push(built);
      }
    }
  }

  const header = buildCrepHeader(cfg.recaudo, fechaArchivoYmd, detailMeta, tipoDocumento);
  const lines = [header, ...detailMeta.map((d) => d.line)];

  return {
    ok: true,
    filename: 'CREP.txt',
    content: `${lines.join('\n')}\n`,
    registros: detailMeta.length,
  };
}

async function listarGruposBcp(colegioId, anio, sedeId) {
  const turnos = await query('SELECT id FROM turnos WHERE colegio_id = ? ORDER BY id LIMIT 1', [colegioId]);
  const turnoId = turnos[0]?.id || 1;
  const grupos = await listarGruposFiltro(colegioId, {
    anio: parseInt(anio, 10),
    turnoId,
    sedeId: sedeId != null && Number.isFinite(sedeId) ? sedeId : null,
  });
  return grupos.map((g) => ({
    id: g.id,
    label: [g.nivel_nombre, g.grado != null ? `${g.grado}°` : '', g.seccion, g.turno_nombre]
      .filter(Boolean)
      .join(' - '),
  }));
}

async function buscarMatriculasAutocomplete(colegioId, anio, q) {
  const term = String(q || '').trim();
  if (term.length < 2) return [];
  const like = `%${term}%`;
  const rows = await query(
    `SELECT m.id AS matricula_id, a.id AS alumno_id,
      CONCAT_WS(', ', TRIM(CONCAT_WS(' ', a.apellido_paterno, a.apellido_materno)), TRIM(a.nombres)) AS nombre,
      a.nro_documento, g.anio, n.nombre AS nivel_nombre, g.grado, g.seccion
    FROM matriculas m
    INNER JOIN alumnos a ON a.id = m.alumno_id
    INNER JOIN grupos g ON g.id = m.grupo_id
    LEFT JOIN niveles n ON n.id = g.nivel_id
    WHERE m.colegio_id = ? AND g.anio = ? AND ${sqlMatriculaEstadoSoloRegular('m')}
      AND (
        a.nombres LIKE ? OR a.apellido_paterno LIKE ? OR a.apellido_materno LIKE ?
        OR a.nro_documento LIKE ?
      )
    ORDER BY a.apellido_paterno, a.apellido_materno, a.nombres
    LIMIT 30`,
    [colegioId, parseInt(anio, 10), like, like, like, like]
  );
  return (rows || []).map((r) => ({
    matricula_id: r.matricula_id,
    alumno_id: r.alumno_id,
    label: `${r.nombre} — DNI ${r.nro_documento || '—'} (${r.nivel_nombre || ''} ${r.grado || ''}° ${r.seccion || ''})`,
  }));
}

module.exports = {
  generarCrep,
  listarGruposBcp,
  buscarMatriculasAutocomplete,
};
