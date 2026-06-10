/**
 * Alumnos deudores y pagadores (Reportes → General).
 * Reutiliza la lógica de saldos de admin/estadisticas/deudores-lista con filtro por sede.
 */
const { query } = require('./mysql');
const { sqlFiltroAnioPago } = require('./pagoFechaHora');
const {
  ordenNivelEducativoNombre,
  columnExists,
} = require('./listaAlumnosMatriculadosReporte');

const ANIO_PAGO_SQL = sqlFiltroAnioPago('p');

const MESES = [
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
  'Diciembre',
];

function nombreAlumnoLista(row) {
  const ap = [row.apellido_paterno, row.apellido_materno]
    .filter((x) => x != null && String(x).trim())
    .join(' ')
    .trim();
  const nom = String(row.nombres || '').trim();
  if (ap && nom) return `${ap}, ${nom}`;
  return ap || nom || '—';
}

function etiquetaGrado(row) {
  const sec = (row.seccion || '').toString().trim();
  const g = row.grado != null && row.grado !== '' ? `${row.grado}°` : '';
  return [g, sec].filter(Boolean).join(' ') || '—';
}

function tituloAgrupacion(row) {
  return `${String(row.nivel_nombre || '').toUpperCase()} — ${row.grado}° grado`;
}

function sortFilas(a, b) {
  const oa = ordenNivelEducativoNombre(a.nivel_nombre);
  const ob = ordenNivelEducativoNombre(b.nivel_nombre);
  if (oa !== ob) return oa - ob;
  const nid = (parseInt(a.nivel_id, 10) || 0) - (parseInt(b.nivel_id, 10) || 0);
  if (nid !== 0) return nid;
  const gd = (parseInt(a.grado, 10) || 0) - (parseInt(b.grado, 10) || 0);
  if (gd !== 0) return gd;
  const sec = String(a.seccion || '').localeCompare(String(b.seccion || ''), 'es', { sensitivity: 'base' });
  if (sec !== 0) return sec;
  const ap = String(a.apellido_paterno || '').localeCompare(String(b.apellido_paterno || ''), 'es', {
    sensitivity: 'base',
  });
  if (ap !== 0) return ap;
  const am = String(a.apellido_materno || '').localeCompare(String(b.apellido_materno || ''), 'es', {
    sensitivity: 'base',
  });
  if (am !== 0) return am;
  return String(a.nombres || '').localeCompare(String(b.nombres || ''), 'es', { sensitivity: 'base' });
}

function sortFilasLuegoConcepto(a, b) {
  const base = sortFilas(a, b);
  if (base !== 0) return base;
  return (parseInt(a.concepto_orden, 10) || 0) - (parseInt(b.concepto_orden, 10) || 0);
}

function nombreMesPension(nroPago, inicioPensiones) {
  const indiceMes = nroPago + inicioPensiones - 1;
  if (indiceMes >= 0 && indiceMes < MESES.length) return MESES[indiceMes];
  return `Mes ${nroPago}`;
}

function etiquetaConceptoPension(nroPago, inicioPensiones) {
  return `Mensualidad ${nombreMesPension(nroPago, inicioPensiones)}`;
}

function buildConceptosOpciones(totalPensiones, inicioPensiones) {
  const list = [{ value: 'todos', label: 'TODOS' }];
  list.push({ value: '0', label: 'MATRÍCULA' });
  for (let i = 1; i <= totalPensiones; i += 1) {
    const mes = nombreMesPension(i, inicioPensiones);
    list.push({ value: String(i), label: `MENSUALIDAD ${mes.toUpperCase()}` });
  }
  return list;
}

async function cargarConfigColegio(colegioId) {
  const [colegio] = await query(
    `SELECT anio_activo, total_pensiones, moneda, inicio_pensiones, titulo_intranet, razon_social, nombre
     FROM colegios WHERE id = ? LIMIT 1`,
    [colegioId]
  );
  const totalPensiones = parseInt(colegio?.total_pensiones || 10, 10);
  const inicioPensiones = parseInt(colegio?.inicio_pensiones ?? 2, 10);
  return {
    anioActivo: parseInt(colegio?.anio_activo || new Date().getFullYear(), 10),
    totalPensiones,
    inicioPensiones,
    moneda: colegio?.moneda || 'S/',
    colegioNombre: (colegio?.razon_social || colegio?.titulo_intranet || colegio?.nombre || 'Colegio').trim(),
  };
}

async function contactosPorAlumno(colegioId, alumnoIds) {
  const map = {};
  const uniq = [...new Set((alumnoIds || []).filter((id) => id != null))];
  if (uniq.length === 0) return map;
  const ph = uniq.map(() => '?').join(',');
  const trows = await query(
    `SELECT f.alumno_id, f.id AS familia_id,
        COALESCE(NULLIF(TRIM(ap.telefono_celular), ''), NULLIF(TRIM(ap.telefono_fijo), ''), '') AS telefono,
        NULLIF(TRIM(ap.email), '') AS email,
        NULLIF(TRIM(ap.direccion), '') AS direccion
     FROM familias f
     INNER JOIN apoderados ap ON ap.id = f.apoderado_id AND ap.colegio_id = ?
     WHERE f.alumno_id IN (${ph})
     ORDER BY f.alumno_id ASC, f.id ASC`,
    [colegioId, ...uniq]
  );
  for (const tr of trows || []) {
    const aid = tr.alumno_id;
    if (map[aid] == null) {
      map[aid] = {
        telefono: String(tr.telefono || '').trim(),
        email: String(tr.email || '').trim(),
        direccion: String(tr.direccion || '').trim(),
      };
    }
  }
  return map;
}

async function etiquetaSede(colegioId, sedeId) {
  if (!Number.isFinite(sedeId)) return '';
  const [row] = await query('SELECT nombre FROM sedes WHERE id = ? AND colegio_id = ? LIMIT 1', [
    sedeId,
    colegioId,
  ]);
  return row?.nombre ? String(row.nombre).trim() : '';
}

function cumpleModo(modo, tarifa, pagado) {
  const t = parseFloat(tarifa) || 0;
  const p = parseFloat(pagado) || 0;
  const saldo = Math.max(0, t - p);
  if (modo === 'deudor') return saldo > 0.004;
  return t > 0.004 && p >= t - 0.004;
}

function montoFila(modo, tarifa, pagado) {
  const t = parseFloat(tarifa) || 0;
  const p = parseFloat(pagado) || 0;
  if (modo === 'deudor') return Math.round(Math.max(0, t - p) * 100) / 100;
  return Math.round(t * 100) / 100;
}

async function obtenerListaDeudoresPagadores(colegioId, opts) {
  const { anio, sedeId, conceptoRaw, modo } = opts;
  if (modo !== 'deudor' && modo !== 'pagador') {
    throw new Error('Modo inválido (deudor o pagador).');
  }

  const cfg = await cargarConfigColegio(colegioId);
  const { totalPensiones, inicioPensiones, moneda, colegioNombre } = cfg;
  const hasSede = await columnExists('grupos', 'sede_id');
  const sedeSql = hasSede && Number.isFinite(sedeId) ? ' AND g.sede_id = ?' : '';

  const baseMatriculaParams = () => {
    const p = [colegioId, anio];
    if (hasSede && Number.isFinite(sedeId)) p.push(sedeId);
    p.push(colegioId);
    return p;
  };

  const baseMatriculasSql = `
    FROM matriculas m
    INNER JOIN grupos g ON g.id = m.grupo_id
    INNER JOIN niveles n ON n.id = g.nivel_id
    INNER JOIN costos c ON c.id = m.costo_id
    INNER JOIN alumnos a ON a.id = m.alumno_id
    WHERE m.colegio_id = ? AND g.anio = ?${sedeSql} AND (m.estado = 0)
      AND EXISTS (
        SELECT 1 FROM pagos p
        WHERE p.matricula_id = m.id AND p.colegio_id = ? AND p.estado = 'ACTIVO'
          AND p.tipo = 0 AND p.estado_pago = 'CANCELADO'
      )`;

  const todos = String(conceptoRaw || '').toLowerCase() === 'todos';
  const sedeEtiqueta = await etiquetaSede(colegioId, sedeId);

  if (todos) {
    const nombreConcepto = 'TODOS';
    const matRows = await query(
      `SELECT m.id AS matricula_id, m.alumno_id, m.grupo_id,
          a.nombres, a.apellido_paterno, a.apellido_materno,
          NULLIF(TRIM(a.nro_documento), '') AS nro_documento,
          g.grado, g.seccion, n.nombre AS nivel_nombre, n.id AS nivel_id,
          c.matricula AS costo_matricula, c.pension AS costo_pension
       ${baseMatriculasSql}`,
      baseMatriculaParams()
    );

    if (!matRows?.length) {
      return {
        colegio_nombre: colegioNombre,
        anio,
        moneda,
        concepto: nombreConcepto,
        sede_etiqueta: sedeEtiqueta,
        modo,
        total_registros: 0,
        total_monto: 0,
        total_alumnos_unicos: 0,
        filas: [],
      };
    }

    const matIds = matRows.map((r) => r.matricula_id);
    const ph = matIds.map(() => '?').join(',');
    const detRows = await query(
      `SELECT p.matricula_id, p.tipo, COALESCE(p.nro_pago, 0) AS nro_pago,
          COALESCE(SUM(p.monto), 0) AS total
       FROM pagos p
       WHERE p.colegio_id = ? AND p.estado = 'ACTIVO' AND p.estado_pago = 'CANCELADO'
         AND p.matricula_id IN (${ph})
         AND (p.tipo = 0 OR (p.tipo = 1 AND p.nro_pago >= 1 AND p.nro_pago <= ? AND ${ANIO_PAGO_SQL}))
       GROUP BY p.matricula_id, p.tipo, p.nro_pago`,
      [colegioId, ...matIds, totalPensiones, anio, anio]
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

      if (cumpleModo(modo, costoMat, pm.t0)) {
        filasRaw.push({
          matricula_id: mr.matricula_id,
          alumno_id: mr.alumno_id,
          alumno_nombre: nombreAlumnoLista(mr),
          grado_seccion: etiquetaGrado(mr),
          nro_documento: mr.nro_documento || '—',
          nivel_nombre: mr.nivel_nombre || '',
          grado_agrupacion_key: `${mr.nivel_id}|${mr.grado}`,
          grado_agrupacion_titulo: tituloAgrupacion(mr),
          nivel_id: mr.nivel_id,
          grado: mr.grado,
          seccion: mr.seccion,
          monto: montoFila(modo, costoMat, pm.t0),
          concepto: 'Matrícula',
          concepto_orden: 0,
          apellido_paterno: mr.apellido_paterno,
          apellido_materno: mr.apellido_materno,
          nombres: mr.nombres,
        });
      }

      for (let i = 1; i <= totalPensiones; i += 1) {
        const pag = pm.pens[i] || 0;
        if (cumpleModo(modo, costoPens, pag)) {
          filasRaw.push({
            matricula_id: mr.matricula_id,
            alumno_id: mr.alumno_id,
            alumno_nombre: nombreAlumnoLista(mr),
            grado_seccion: etiquetaGrado(mr),
            nro_documento: mr.nro_documento || '—',
            nivel_nombre: mr.nivel_nombre || '',
            grado_agrupacion_key: `${mr.nivel_id}|${mr.grado}`,
            grado_agrupacion_titulo: tituloAgrupacion(mr),
            nivel_id: mr.nivel_id,
            grado: mr.grado,
            seccion: mr.seccion,
            monto: montoFila(modo, costoPens, pag),
            concepto: etiquetaConceptoPension(i, inicioPensiones),
            concepto_orden: i,
            apellido_paterno: mr.apellido_paterno,
            apellido_materno: mr.apellido_materno,
            nombres: mr.nombres,
          });
        }
      }
    }

    filasRaw.sort(sortFilasLuegoConcepto);
    const contactMap = await contactosPorAlumno(
      colegioId,
      filasRaw.map((f) => f.alumno_id)
    );
    const filas = filasRaw.map(({ concepto_orden: _co, ...f }) => {
      const c = contactMap[f.alumno_id] || {};
      return {
        ...f,
        telefono_apoderado: c.telefono || '',
        email_apoderado: c.email || '',
        direccion: c.direccion || '',
      };
    });

    const totalMonto = Math.round(filas.reduce((s, r) => s + (parseFloat(r.monto) || 0), 0) * 100) / 100;
    const idsAlumno = new Set(filas.map((f) => f.alumno_id));

    return {
      colegio_nombre: colegioNombre,
      anio,
      moneda,
      concepto: nombreConcepto,
      sede_etiqueta: sedeEtiqueta,
      modo,
      total_registros: filas.length,
      total_monto: totalMonto,
      total_alumnos_unicos: idsAlumno.size,
      filas,
    };
  }

  const tipoParam = parseInt(conceptoRaw, 10);
  if (Number.isNaN(tipoParam) || tipoParam < 0) {
    throw new Error('Concepto inválido (0=matrícula, 1..N=pensión, o todos).');
  }

  let conceptoNombre = 'MATRÍCULA';
  let rows;

  if (tipoParam === 0) {
    rows = await query(
      `SELECT m.id AS matricula_id, m.alumno_id, m.grupo_id,
          a.nombres, a.apellido_paterno, a.apellido_materno,
          NULLIF(TRIM(a.nro_documento), '') AS nro_documento,
          g.grado, g.seccion, n.nombre AS nivel_nombre, n.id AS nivel_id,
          c.matricula AS tarifa,
          COALESCE((
            SELECT SUM(p.monto) FROM pagos p
            WHERE p.matricula_id = m.id AND p.colegio_id = ? AND p.estado = 'ACTIVO'
              AND p.estado_pago = 'CANCELADO' AND p.tipo = 0
          ), 0) AS pagado
       ${baseMatriculasSql}`,
      [colegioId, ...baseMatriculaParams()]
    );
  } else {
    const nroPago = tipoParam;
    if (nroPago < 1 || nroPago > totalPensiones) {
      return {
        colegio_nombre: colegioNombre,
        anio,
        moneda,
        concepto: `MENSUALIDAD ${nombreMesPension(nroPago, inicioPensiones).toUpperCase()}`,
        sede_etiqueta: sedeEtiqueta,
        modo,
        total_registros: 0,
        total_monto: 0,
        total_alumnos_unicos: 0,
        filas: [],
      };
    }
    const mesNom = nombreMesPension(nroPago, inicioPensiones);
    conceptoNombre = `MENSUALIDAD ${mesNom.toUpperCase()}`;
    rows = await query(
      `SELECT m.id AS matricula_id, m.alumno_id, m.grupo_id,
          a.nombres, a.apellido_paterno, a.apellido_materno,
          NULLIF(TRIM(a.nro_documento), '') AS nro_documento,
          g.grado, g.seccion, n.nombre AS nivel_nombre, n.id AS nivel_id,
          c.pension AS tarifa,
          COALESCE((
            SELECT SUM(p.monto) FROM pagos p
            WHERE p.matricula_id = m.id AND p.colegio_id = ? AND p.estado = 'ACTIVO'
              AND p.estado_pago = 'CANCELADO' AND p.tipo = 1 AND p.nro_pago = ? AND ${ANIO_PAGO_SQL}
          ), 0) AS pagado
       ${baseMatriculasSql}`,
      [colegioId, nroPago, anio, anio, ...baseMatriculaParams()]
    );
  }

  const etiquetaFilaUnica =
    tipoParam === 0 ? 'Matrícula' : etiquetaConceptoPension(tipoParam, inicioPensiones);

  const filasRaw = (rows || [])
    .map((r) => {
      const tarifa = parseFloat(r.tarifa) || 0;
      const pagado = parseFloat(r.pagado) || 0;
      return {
        matricula_id: r.matricula_id,
        alumno_id: r.alumno_id,
        alumno_nombre: nombreAlumnoLista(r),
        grado_seccion: etiquetaGrado(r),
        nro_documento: r.nro_documento || '—',
        nivel_nombre: r.nivel_nombre || '',
        grado_agrupacion_key: `${r.nivel_id}|${r.grado}`,
        grado_agrupacion_titulo: tituloAgrupacion(r),
        nivel_id: r.nivel_id,
        grado: r.grado,
        seccion: r.seccion,
        monto: montoFila(modo, tarifa, pagado),
        concepto: etiquetaFilaUnica,
        apellido_paterno: r.apellido_paterno,
        apellido_materno: r.apellido_materno,
        nombres: r.nombres,
        _ok: cumpleModo(modo, tarifa, pagado),
      };
    })
    .filter((f) => f._ok);

  filasRaw.sort(sortFilas);
  const contactMap = await contactosPorAlumno(
    colegioId,
    filasRaw.map((f) => f.alumno_id)
  );
  const filas = filasRaw.map(({ _ok, ...f }) => {
    const c = contactMap[f.alumno_id] || {};
    return {
      ...f,
      telefono_apoderado: c.telefono || '',
      email_apoderado: c.email || '',
      direccion: c.direccion || '',
    };
  });

  const totalMonto = Math.round(filas.reduce((s, r) => s + (parseFloat(r.monto) || 0), 0) * 100) / 100;
  const idsAlumno = new Set(filas.map((f) => f.alumno_id));

  return {
    colegio_nombre: colegioNombre,
    anio,
    moneda,
    concepto: tipoParam === 0 ? 'MATRÍCULA' : conceptoNombre,
    sede_etiqueta: sedeEtiqueta,
    modo,
    total_registros: filas.length,
    total_monto: totalMonto,
    total_alumnos_unicos: idsAlumno.size,
    filas,
  };
}

async function obtenerListaDeudores(colegioId, opts) {
  return obtenerListaDeudoresPagadores(colegioId, { ...opts, modo: 'deudor' });
}

async function obtenerListaPagadores(colegioId, opts) {
  return obtenerListaDeudoresPagadores(colegioId, { ...opts, modo: 'pagador' });
}

module.exports = {
  buildConceptosOpciones,
  cargarConfigColegio,
  obtenerListaDeudores,
  obtenerListaPagadores,
};
