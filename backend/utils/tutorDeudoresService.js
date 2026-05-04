/**
 * Lista de deudores filtrada por grupo (tutoría), misma lógica de saldos que admin/deudores-lista.
 */

function nombreAlumno(r) {
  return [r.apellido_paterno, r.apellido_materno, r.nombres].filter(Boolean).join(' ').trim() || '—';
}

function etiquetaGrado(r) {
  const sec = (r.seccion || '').toString().trim();
  const g = r.grado != null && r.grado !== '' ? `${r.grado}°` : '';
  return [g, sec].filter(Boolean).join(' ') || '—';
}

function tituloAgrupacion(r) {
  return `${String(r.nivel_nombre || '').toUpperCase()} — ${r.grado}° grado`;
}

function sortFilas(a, b) {
  const nid = (parseInt(a.nivel_id, 10) || 0) - (parseInt(b.nivel_id, 10) || 0);
  if (nid !== 0) return nid;
  const gd = (parseInt(a.grado, 10) || 0) - (parseInt(b.grado, 10) || 0);
  if (gd !== 0) return gd;
  const sec = String(a.seccion || '').localeCompare(String(b.seccion || ''), 'es', { sensitivity: 'base' });
  if (sec !== 0) return sec;
  const ap = String(a.apellido_paterno || '').localeCompare(String(b.apellido_paterno || ''), 'es', { sensitivity: 'base' });
  if (ap !== 0) return ap;
  const am = String(a.apellido_materno || '').localeCompare(String(b.apellido_materno || ''), 'es', { sensitivity: 'base' });
  if (am !== 0) return am;
  return String(a.nombres || '').localeCompare(String(b.nombres || ''), 'es', { sensitivity: 'base' });
}

function sortFilasLuegoConcepto(a, b) {
  const base = sortFilas(a, b);
  if (base !== 0) return base;
  return (parseInt(a.concepto_orden, 10) || 0) - (parseInt(b.concepto_orden, 10) || 0);
}

const nombresMesPension = [
  '',
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre'
];

function etiquetaConceptoPension(nroPago) {
  const indiceMes = 2 + nroPago;
  const nom =
    indiceMes <= 12 ? nombresMesPension[indiceMes] || `Mes ${nroPago}` : `Mes ${nroPago}`;
  return `Mensualidad ${nom}`;
}

async function telefonosPorAlumno(query, colegio_id, alumnoIds) {
  const map = {};
  const uniq = [...new Set((alumnoIds || []).filter((id) => id != null))];
  if (uniq.length === 0) return map;
  const ph = uniq.map(() => '?').join(',');
  const trows = await query(
    `SELECT f.alumno_id, f.id AS familia_id,
        COALESCE(NULLIF(TRIM(ap.telefono_celular), ''), NULLIF(TRIM(ap.telefono_fijo), ''), '') AS telefono
     FROM familias f
     INNER JOIN apoderados ap ON ap.id = f.apoderado_id AND ap.colegio_id = ?
     WHERE f.alumno_id IN (${ph})
     ORDER BY f.alumno_id ASC, f.id ASC`,
    [colegio_id, ...uniq]
  );
  for (const tr of trows || []) {
    const aid = tr.alumno_id;
    const tel = String(tr.telefono || '').trim();
    if (map[aid] == null || map[aid] === '') map[aid] = tel;
  }
  return map;
}

const baseMatriculasSqlGrupo = `
  FROM matriculas m
  INNER JOIN grupos g ON g.id = m.grupo_id
  INNER JOIN niveles n ON n.id = g.nivel_id
  INNER JOIN costos c ON c.id = m.costo_id
  INNER JOIN alumnos a ON a.id = m.alumno_id
  WHERE m.colegio_id = ? AND g.anio = ? AND g.id = ? AND (m.estado = 0)
    AND EXISTS (
      SELECT 1 FROM pagos p
      WHERE p.matricula_id = m.id AND p.colegio_id = ? AND p.estado = 'ACTIVO'
        AND p.tipo = 0 AND p.estado_pago = 'CANCELADO'
    )`;

/**
 * @returns {Promise<{ concepto: string, total_alumnos_unicos: number, filas: object[] }>}
 */
async function listarDeudoresGrupo(query, ctx) {
  const { colegio_id, grupo_id, anio, tipoRaw, totalPensiones } = ctx;

  const todos = String(tipoRaw || '').toLowerCase() === 'todos';

  if (todos) {
    const nombreConcepto = 'Todos los conceptos (saldo pendiente)';
    const matRows = await query(
      `SELECT m.id AS matricula_id, m.alumno_id, m.grupo_id,
          a.nombres, a.apellido_paterno, a.apellido_materno,
          g.grado, g.seccion, n.nombre AS nivel_nombre, n.id AS nivel_id,
          c.matricula AS costo_matricula, c.pension AS costo_pension
       ${baseMatriculasSqlGrupo}`,
      [colegio_id, anio, grupo_id, colegio_id]
    );
    if (!matRows || matRows.length === 0) {
      return { concepto: nombreConcepto, total_alumnos_unicos: 0, filas: [] };
    }
    const matIds = matRows.map((r) => r.matricula_id);
    const ph = matIds.map(() => '?').join(',');
    const detRows = await query(
      `SELECT p.matricula_id, p.tipo, COALESCE(p.nro_pago, 0) AS nro_pago,
          COALESCE(SUM(p.monto), 0) AS total
       FROM pagos p
       WHERE p.colegio_id = ? AND p.estado = 'ACTIVO' AND p.estado_pago = 'CANCELADO'
         AND p.matricula_id IN (${ph})
         AND (p.tipo = 0 OR (p.tipo = 1 AND p.nro_pago >= 1 AND p.nro_pago <= ? AND YEAR(p.fecha_hora) = ?))
       GROUP BY p.matricula_id, p.tipo, p.nro_pago`,
      [colegio_id, ...matIds, totalPensiones, anio]
    );
    const pagosPorMatricula = {};
    for (const row of detRows || []) {
      const mid = row.matricula_id;
      if (!pagosPorMatricula[mid]) pagosPorMatricula[mid] = { t0: 0, pens: {} };
      const t = parseInt(row.tipo, 10);
      const tot = parseFloat(row.total || 0);
      if (t === 0) pagosPorMatricula[mid].t0 = tot;
      else if (t === 1) {
        const np = parseInt(row.nro_pago, 10);
        if (np >= 1 && np <= totalPensiones) pagosPorMatricula[mid].pens[np] = tot;
      }
    }

    const filasRaw = [];
    for (const mr of matRows) {
      const pm = pagosPorMatricula[mr.matricula_id] || { t0: 0, pens: {} };
      const costoMat = parseFloat(mr.costo_matricula) || 0;
      const costoPens = parseFloat(mr.costo_pension) || 0;

      const saldoMat = Math.max(0, costoMat - pm.t0);
      if (saldoMat > 0.004) {
        filasRaw.push({
          matricula_id: mr.matricula_id,
          alumno_id: mr.alumno_id,
          nombre: nombreAlumno(mr),
          grado_etiqueta: etiquetaGrado(mr),
          nivel_nombre: mr.nivel_nombre || '',
          nivel_id: mr.nivel_id,
          grado: mr.grado,
          seccion: mr.seccion,
          monto: Math.round(saldoMat * 100) / 100,
          concepto: 'Matrícula',
          concepto_orden: 0,
          tipo_concepto: 0,
          nro_concepto: 0,
          apellido_paterno: mr.apellido_paterno,
          apellido_materno: mr.apellido_materno,
          nombres: mr.nombres
        });
      }

      for (let i = 1; i <= totalPensiones; i += 1) {
        const pag = pm.pens[i] || 0;
        const saldoP = Math.max(0, costoPens - pag);
        if (saldoP > 0.004) {
          filasRaw.push({
            matricula_id: mr.matricula_id,
            alumno_id: mr.alumno_id,
            nombre: nombreAlumno(mr),
            grado_etiqueta: etiquetaGrado(mr),
            nivel_nombre: mr.nivel_nombre || '',
            nivel_id: mr.nivel_id,
            grado: mr.grado,
            seccion: mr.seccion,
            monto: Math.round(saldoP * 100) / 100,
            concepto: etiquetaConceptoPension(i),
            concepto_orden: i,
            tipo_concepto: 1,
            nro_concepto: i,
            apellido_paterno: mr.apellido_paterno,
            apellido_materno: mr.apellido_materno,
            nombres: mr.nombres
          });
        }
      }
    }
    filasRaw.sort(sortFilasLuegoConcepto);
    const telMap = await telefonosPorAlumno(query, colegio_id, filasRaw.map((f) => f.alumno_id));
    const filas = filasRaw.map((f) => {
      const { concepto_orden, ...rest } = f;
      return {
        ...rest,
        telefono_apoderado: telMap[f.alumno_id] || ''
      };
    });
    const idsAlumno = new Set(filasRaw.map((f) => f.alumno_id));
    return { concepto: nombreConcepto, total_alumnos_unicos: idsAlumno.size, filas };
  }

  const tipoParam = parseInt(tipoRaw, 10);
  if (isNaN(tipoParam) || tipoParam < 0) {
    const err = new Error('INVALID_TIPO');
    err.code = 'INVALID_TIPO';
    throw err;
  }

  let conceptoNombre = 'Matrícula';
  let rows;

  if (tipoParam === 0) {
    rows = await query(
      `SELECT m.id AS matricula_id, m.alumno_id, m.grupo_id,
          a.nombres, a.apellido_paterno, a.apellido_materno,
          g.grado, g.seccion, n.nombre AS nivel_nombre, n.id AS nivel_id,
          c.matricula AS tarifa,
          COALESCE((
            SELECT SUM(p.monto) FROM pagos p
            WHERE p.matricula_id = m.id AND p.colegio_id = ? AND p.estado = 'ACTIVO'
              AND p.estado_pago = 'CANCELADO' AND p.tipo = 0
          ), 0) AS pagado
       ${baseMatriculasSqlGrupo}`,
      [colegio_id, colegio_id, anio, grupo_id, colegio_id]
    );
  } else {
    const nroPago = tipoParam;
    if (nroPago < 1 || nroPago > totalPensiones) {
      return { concepto: `Mes ${nroPago}`, total_alumnos_unicos: 0, filas: [] };
    }
    const nombresMes = [
      '',
      'Enero',
      'Febrero',
      'Marzo',
      'Abril',
      'Mayo',
      'Junio',
      'Julio',
      'Agosto',
      'Septiembre',
      'Octubre',
      'Noviembre',
      'Diciembre'
    ];
    const indiceMes = 2 + nroPago;
    conceptoNombre =
      indiceMes <= 12 ? nombresMes[indiceMes] || `Mes ${nroPago}` : `Mes ${nroPago}`;
    rows = await query(
      `SELECT m.id AS matricula_id, m.alumno_id, m.grupo_id,
          a.nombres, a.apellido_paterno, a.apellido_materno,
          g.grado, g.seccion, n.nombre AS nivel_nombre, n.id AS nivel_id,
          c.pension AS tarifa,
          COALESCE((
            SELECT SUM(p.monto) FROM pagos p
            WHERE p.matricula_id = m.id AND p.colegio_id = ? AND p.estado = 'ACTIVO'
              AND p.estado_pago = 'CANCELADO' AND p.tipo = 1 AND p.nro_pago = ? AND YEAR(p.fecha_hora) = ?
          ), 0) AS pagado
       ${baseMatriculasSqlGrupo}`,
      [colegio_id, nroPago, anio, colegio_id, anio, grupo_id, colegio_id]
    );
  }

  const etiquetaFilaUnica = tipoParam === 0 ? 'Matrícula' : `Mensualidad ${conceptoNombre}`;

  const filasRaw = (rows || [])
    .map((r) => {
      const tarifa = parseFloat(r.tarifa) || 0;
      const pagado = parseFloat(r.pagado) || 0;
      const saldo = Math.max(0, tarifa - pagado);
      return {
        matricula_id: r.matricula_id,
        alumno_id: r.alumno_id,
        nombre: nombreAlumno(r),
        grado_etiqueta: etiquetaGrado(r),
        nivel_nombre: r.nivel_nombre || '',
        nivel_id: r.nivel_id,
        grado: r.grado,
        seccion: r.seccion,
        monto: Math.round(saldo * 100) / 100,
        concepto: etiquetaFilaUnica,
        tipo_concepto: tipoParam === 0 ? 0 : 1,
        nro_concepto: tipoParam === 0 ? 0 : tipoParam,
        apellido_paterno: r.apellido_paterno,
        apellido_materno: r.apellido_materno,
        nombres: r.nombres,
        _saldo: saldo
      };
    })
    .filter((f) => f._saldo > 0.004);
  filasRaw.sort(sortFilas);
  const telMap = await telefonosPorAlumno(query, colegio_id, filasRaw.map((f) => f.alumno_id));
  const filas = filasRaw.map(({ _saldo, ...f }) => ({
    ...f,
    telefono_apoderado: telMap[f.alumno_id] || ''
  }));
  const idsAlumno = new Set(filas.map((f) => f.alumno_id));

  return {
    concepto: tipoParam === 0 ? 'Matrícula' : conceptoNombre,
    total_alumnos_unicos: idsAlumno.size,
    filas
  };
}

async function mergeObservacionesTutor(query, colegio_id, filas) {
  if (!filas || filas.length === 0) return filas;
  const mids = [...new Set(filas.map((f) => f.matricula_id))];
  const ph = mids.map(() => '?').join(',');
  let obsRows = [];
  try {
    obsRows = await query(
      `SELECT matricula_id, tipo_concepto, nro_concepto, observaciones
       FROM tutor_deuda_seguimiento
       WHERE colegio_id = ? AND matricula_id IN (${ph})`,
      [colegio_id, ...mids]
    );
  } catch (e) {
    if (e.code === 'ER_NO_SUCH_TABLE') {
      return filas.map((f) => ({ ...f, observaciones: '' }));
    }
    throw e;
  }
  const omap = {};
  for (const o of obsRows || []) {
    omap[`${o.matricula_id}-${o.tipo_concepto}-${o.nro_concepto}`] = o.observaciones != null ? String(o.observaciones) : '';
  }
  return filas.map((f) => ({
    ...f,
    observaciones: omap[`${f.matricula_id}-${f.tipo_concepto}-${f.nro_concepto}`] || ''
  }));
}

module.exports = {
  listarDeudoresGrupo,
  mergeObservacionesTutor,
  etiquetaConceptoPension,
  nombresMesPension
};
