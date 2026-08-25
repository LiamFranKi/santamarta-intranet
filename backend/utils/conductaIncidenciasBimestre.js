/**
 * Conducta automática por bimestre: nota = max(0, 20 − incidencias del periodo).
 * Las fechas del bimestre salen de colegios.rangos_ciclos_notas (Configuración → Notas).
 * Vestimenta (QR) se refleja también como incidencia (enrollment_incidents).
 */
const {
  fetchRangosCiclosParsed,
  getFechasCicloAsistencia,
} = require('./libretaResumenBimestres');

const ASIGNATURA_CONDUCTA = -101;
/** Incidencias registradas como tutor */
const ASSIGNMENT_ID_TUTORIA = -102;
/** Descuento por vestimenta / presentación (escaneo QR) */
const ASSIGNMENT_ID_VESTIMENTA = -103;

const DESC_VESTIMENTA =
  '[VESTIMENTA] Descuento por vestimenta / presentación escolar (−1 punto)';

async function obtenerRangoBimestre(query, colegio_id, ciclo, anioEscolar) {
  const cicloInt = parseInt(ciclo, 10) || 1;
  const rangos = await fetchRangosCiclosParsed(query, colegio_id);
  const r = getFechasCicloAsistencia(rangos, cicloInt, anioEscolar);
  if (r?.desde && r?.hasta) {
    return { ciclo: cicloInt, desde: r.desde, hasta: r.hasta };
  }
  const anio = parseInt(anioEscolar, 10) || new Date().getFullYear();
  const fb = getFechasCicloAsistencia(null, cicloInt, anio);
  return {
    ciclo: cicloInt,
    desde: fb?.desde || `${anio}-01-01`,
    hasta: fb?.hasta || `${anio}-12-31`,
  };
}

function cicloQueContieneFecha(rangosParsed, anioEscolar, fechaYmd) {
  for (let c = 1; c <= 4; c += 1) {
    const r = getFechasCicloAsistencia(rangosParsed, c, anioEscolar);
    if (r && fechaYmd >= r.desde && fechaYmd <= r.hasta) return c;
  }
  return 1;
}

async function contarIncidenciasMatriculaEnRango(query, matriculaId, desde, hasta) {
  // Incidencias docentes/tutor (sin espejos de vestimenta)
  const rowsInc = await query(
    `SELECT COUNT(*) AS c FROM enrollment_incidents
     WHERE enrollment_id = ? AND type = 1
       AND DATE(created_at) BETWEEN ? AND ?
       AND COALESCE(assignment_id, 0) <> ?
       AND COALESCE(description, '') NOT LIKE '[VESTIMENTA]%'`,
    [matriculaId, desde, hasta, ASSIGNMENT_ID_VESTIMENTA]
  );
  const nInc = Math.max(0, parseInt(rowsInc?.[0]?.c, 10) || 0);

  // Descuentos por presentación (tabla fuente QR)
  let nPed = 0;
  try {
    const rowsPed = await query(
      `SELECT COUNT(*) AS c
       FROM presentacion_escolar_descuentos ped
       INNER JOIN usuarios ua ON ua.id = ped.alumno_usuario_id AND ua.colegio_id = ped.colegio_id
       INNER JOIN matriculas m ON m.id = ? AND m.alumno_id = ua.alumno_id AND m.colegio_id = ped.colegio_id AND (m.estado = 0)
       INNER JOIN grupos g ON g.id = m.grupo_id AND g.anio = ped.anio
       WHERE DATE(ped.fecha) BETWEEN ? AND ?`,
      [matriculaId, desde, hasta]
    );
    nPed = Math.max(0, parseInt(rowsPed?.[0]?.c, 10) || 0);
  } catch (e) {
    if (!(String(e.message || '').includes("doesn't exist") || e.code === 'ER_NO_SUCH_TABLE')) {
      console.warn('[conducta] contar presentacion:', e.message);
    }
  }

  return nInc + nPed;
}

function notaDesdeCantidad(cantidad) {
  const n = 20 - Math.max(0, parseInt(cantidad, 10) || 0);
  return Math.max(0, Math.min(20, n));
}

async function persistirNotaConducta(execute, matriculaId, cicloInt, nota) {
  const notaFinal = String(Math.max(0, Math.min(20, parseInt(nota, 10) || 0)));
  await execute(
    `DELETE FROM promedios WHERE matricula_id = ? AND asignatura_id = ? AND ciclo = ?`,
    [matriculaId, ASIGNATURA_CONDUCTA, cicloInt]
  );
  await execute(
    `INSERT INTO promedios (matricula_id, asignatura_id, ciclo, promedio) VALUES (?, ?, ?, ?)`,
    [matriculaId, ASIGNATURA_CONDUCTA, cicloInt, notaFinal]
  );
  return notaFinal;
}

async function sincronizarConductaMatriculaBimestre(query, execute, {
  matriculaId,
  colegio_id,
  anioEscolar,
  ciclo,
}) {
  const rango = await obtenerRangoBimestre(query, colegio_id, ciclo, anioEscolar);
  const cant = await contarIncidenciasMatriculaEnRango(query, matriculaId, rango.desde, rango.hasta);
  const nota = notaDesdeCantidad(cant);
  await persistirNotaConducta(execute, matriculaId, rango.ciclo, nota);
  return { nota, cantidad: cant, ...rango };
}

/**
 * Inserta incidencia espejo de vestimenta si aún no existe para ese día / matrícula.
 * No envía notificación (el escaneo ya avisa por vestimenta).
 */
function descripcionVestimenta(motivo) {
  const m = String(motivo || '').trim();
  if (!m || /^PRESENTACION$/i.test(m)) return DESC_VESTIMENTA;
  return `[VESTIMENTA] ${m} (−1 punto)`;
}

async function asegurarIncidenciaVestimenta(query, execute, {
  matriculaId,
  workerId,
  fechaYmd,
  hora,
  motivo = null,
  descuentoId = null,
}) {
  const desc = descripcionVestimenta(motivo);
  // Evitar duplicar el mismo descuento (por id) o la misma descripción el mismo día
  if (descuentoId) {
    const porId = await query(
      `SELECT id FROM enrollment_incidents
       WHERE enrollment_id = ? AND type = 1 AND assignment_id = ?
         AND description LIKE ?
       LIMIT 1`,
      [matriculaId, ASSIGNMENT_ID_VESTIMENTA, `%#ped:${descuentoId}%`]
    );
    if (porId?.length) return { created: false, id: porId[0].id };
  } else {
    const exist = await query(
      `SELECT id FROM enrollment_incidents
       WHERE enrollment_id = ? AND type = 1 AND assignment_id = ?
         AND DATE(created_at) = ?
         AND description = ?
       LIMIT 1`,
      [matriculaId, ASSIGNMENT_ID_VESTIMENTA, fechaYmd, desc]
    );
    if (exist?.length) return { created: false, id: exist[0].id };
  }

  const descFinal = descuentoId ? `${desc} [#ped:${descuentoId}]` : desc;
  const createdAt = `${fechaYmd} ${hora && String(hora).length >= 5 ? String(hora).slice(0, 8) : '12:00:00'}`;
  const worker = workerId && Number(workerId) > 0 ? Number(workerId) : null;
  const r = await execute(
    `INSERT INTO enrollment_incidents
      (enrollment_id, assignment_id, worker_id, type, points, description, created_at, updated_at)
     VALUES (?, ?, ?, 1, 0, ?, ?, ?)`,
    [
      matriculaId,
      ASSIGNMENT_ID_VESTIMENTA,
      worker,
      descFinal,
      createdAt,
      createdAt,
    ]
  );
  return { created: true, id: r.insertId };
}

/**
 * Backfill: descuentos QR históricos → incidencia [VESTIMENTA] si faltan.
 */
async function backfillVestimentaAIncidenciasGrupo(query, execute, {
  grupoId,
  colegio_id,
  anio,
  desde,
  hasta,
}) {
  let rows = [];
  try {
    rows = await query(
      `SELECT ped.id, ped.fecha, ped.hora, ped.motivo, ped.registrado_por_usuario_id,
              m.id AS matricula_id, u_reg.personal_id
       FROM presentacion_escolar_descuentos ped
       INNER JOIN usuarios ua ON ua.id = ped.alumno_usuario_id AND ua.colegio_id = ped.colegio_id
       INNER JOIN matriculas m ON m.alumno_id = ua.alumno_id AND m.grupo_id = ? AND m.colegio_id = ped.colegio_id AND (m.estado = 0)
       INNER JOIN grupos gx ON gx.id = m.grupo_id AND gx.anio = ped.anio
       LEFT JOIN usuarios u_reg ON u_reg.id = ped.registrado_por_usuario_id
       WHERE ped.colegio_id = ? AND ped.anio = ?
         AND DATE(ped.fecha) BETWEEN ? AND ?`,
      [grupoId, colegio_id, anio, desde, hasta]
    );
  } catch (e) {
    if (String(e.message || '').includes("doesn't exist") || e.code === 'ER_NO_SUCH_TABLE') return 0;
    throw e;
  }

  // Quitar espejos genéricos antiguos (sin #ped:id) del rango para no duplicar con el backfill 1:1
  try {
    await execute(
      `DELETE ei FROM enrollment_incidents ei
       INNER JOIN matriculas m ON m.id = ei.enrollment_id
       WHERE m.grupo_id = ? AND m.colegio_id = ? AND (m.estado = 0)
         AND ei.type = 1 AND ei.assignment_id = ?
         AND ei.description LIKE '[VESTIMENTA]%'
         AND ei.description NOT LIKE '%#ped:%'
         AND DATE(ei.created_at) BETWEEN ? AND ?`,
      [grupoId, colegio_id, ASSIGNMENT_ID_VESTIMENTA, desde, hasta]
    );
  } catch (eDel) {
    console.warn('[conducta] cleanup vestimenta genérica:', eDel.message);
  }

  let created = 0;
  for (const row of rows || []) {
    try {
      const fecha = String(row.fecha).slice(0, 10);
      const r = await asegurarIncidenciaVestimenta(query, execute, {
        matriculaId: row.matricula_id,
        workerId: row.personal_id || null,
        fechaYmd: fecha,
        hora: row.hora || '12:00:00',
        motivo: row.motivo || null,
        descuentoId: row.id || null,
      });
      if (r.created) created += 1;
    } catch (eOne) {
      console.warn('[conducta] backfill ped', row.id, eOne.message);
    }
  }
  return created;
}

/**
 * Lista unificada: incidencias docentes + descuentos presentación (tabla QR).
 * La presentación se toma siempre de presentacion_escolar_descuentos (fuente de verdad).
 */
async function listarIncidenciasUnificadasGrupo(query, {
  grupoId,
  colegio_id,
  anio,
  desde,
  hasta,
  matriculaId = null,
}) {
  const paramsInc = [ASSIGNMENT_ID_TUTORIA, grupoId, colegio_id, anio, desde, hasta, ASSIGNMENT_ID_VESTIMENTA];
  let extraInc = '';
  if (matriculaId) {
    extraInc = ' AND m.id = ? ';
    paramsInc.push(matriculaId);
  }

  const rowsInc = await query(
    `SELECT ei.id, ei.description, ei.created_at, ei.assignment_id, ei.enrollment_id AS matricula_id,
            CONCAT(COALESCE(p.nombres,''), ' ', COALESCE(p.apellidos,'')) AS docente_nombre,
            CASE
              WHEN ei.assignment_id = ? THEN 'Tutoría'
              ELSE COALESCE(c.nombre, '—')
            END AS curso_nombre,
            'incidencia' AS origen,
            m.alumno_id,
            TRIM(CONCAT(COALESCE(al.apellido_paterno,''),' ', COALESCE(al.apellido_materno,''),' ', COALESCE(al.nombres,''))) AS alumno_nombre
     FROM enrollment_incidents ei
     INNER JOIN matriculas m ON m.id = ei.enrollment_id
     INNER JOIN grupos g ON g.id = m.grupo_id
     INNER JOIN alumnos al ON al.id = m.alumno_id
     LEFT JOIN personal p ON p.id = ei.worker_id
     LEFT JOIN asignaturas a ON a.id = ei.assignment_id AND ei.assignment_id > 0
     LEFT JOIN cursos c ON c.id = a.curso_id
     WHERE g.id = ? AND g.colegio_id = ?
       AND ei.type = 1 AND g.anio = ?
       AND DATE(ei.created_at) BETWEEN ? AND ?
       AND COALESCE(ei.assignment_id, 0) <> ?
       AND COALESCE(ei.description, '') NOT LIKE '[VESTIMENTA]%'
       ${extraInc}
     ORDER BY alumno_nombre ASC, ei.created_at DESC`,
    paramsInc
  );

  let rowsPed = [];
  try {
    const paramsPed = [grupoId, colegio_id, anio, desde, hasta];
    let extraPed = '';
    if (matriculaId) {
      extraPed = ' AND m.id = ? ';
      paramsPed.push(matriculaId);
    }
    rowsPed = await query(
      `SELECT ped.id, ped.fecha, ped.hora, ped.motivo, ped.puntos, m.id AS matricula_id,
              ua.alumno_id,
              TRIM(CONCAT(COALESCE(al.apellido_paterno,''),' ', COALESCE(al.apellido_materno,''),' ', COALESCE(al.nombres,''))) AS alumno_nombre,
              CASE
                WHEN rpp.id IS NOT NULL THEN TRIM(CONCAT(COALESCE(rpp.nombres,''), ' ', COALESCE(rpp.apellidos,'')))
                WHEN alrp.id IS NOT NULL THEN TRIM(CONCAT(
                  COALESCE(alrp.apellido_paterno,''),' ', COALESCE(alrp.apellido_materno,''),' ', COALESCE(alrp.nombres,'')))
                ELSE 'Escaneo QR'
              END AS docente_nombre
       FROM presentacion_escolar_descuentos ped
       INNER JOIN usuarios ua ON ua.id = ped.alumno_usuario_id AND ua.colegio_id = ped.colegio_id
       INNER JOIN alumnos al ON al.id = ua.alumno_id
       INNER JOIN matriculas m ON m.alumno_id = ua.alumno_id AND m.grupo_id = ? AND m.colegio_id = ped.colegio_id AND (m.estado = 0)
       INNER JOIN grupos gx ON gx.id = m.grupo_id AND gx.anio = ped.anio
       LEFT JOIN usuarios ur ON ur.id = ped.registrado_por_usuario_id
       LEFT JOIN personal rpp ON rpp.id = ur.personal_id
       LEFT JOIN alumnos alrp ON alrp.id = ur.alumno_id
       WHERE ped.colegio_id = ? AND ped.anio = ?
         AND DATE(ped.fecha) BETWEEN ? AND ?
         ${extraPed}
       ORDER BY alumno_nombre ASC, ped.fecha DESC, ped.hora DESC`,
      paramsPed
    );
  } catch (e) {
    if (!(String(e.message || '').includes("doesn't exist") || e.code === 'ER_NO_SUCH_TABLE')) {
      console.warn('[conducta] listar presentacion:', e.message);
    }
    rowsPed = [];
  }

  const porAlumno = new Map();
  const ensureAlumno = (aid, nombre, mid) => {
    if (!porAlumno.has(aid)) {
      porAlumno.set(aid, {
        alumno_id: aid,
        matricula_id: mid,
        alumno_nombre: nombre,
        incidencias: [],
      });
    }
    return porAlumno.get(aid);
  };

  (rowsInc || []).forEach((r) => {
    ensureAlumno(r.alumno_id, r.alumno_nombre, r.matricula_id).incidencias.push({
      id: `inc-${r.id}`,
      description: String(r.description || '').trim(),
      created_at: r.created_at,
      docente_nombre: r.docente_nombre,
      curso_nombre: r.curso_nombre,
      origen: 'incidencia',
    });
  });

  (rowsPed || []).forEach((r) => {
    const fecha = String(r.fecha).slice(0, 10);
    const hora = r.hora ? String(r.hora).slice(0, 8) : '12:00:00';
    const motivo = String(r.motivo || '').trim();
    const desc =
      !motivo || /^PRESENTACION$/i.test(motivo)
        ? 'Descuento por vestimenta / presentación escolar (−1 punto)'
        : `${motivo} (−1 punto)`;
    ensureAlumno(r.alumno_id, r.alumno_nombre, r.matricula_id).incidencias.push({
      id: `ped-${r.id}`,
      description: desc,
      created_at: `${fecha} ${hora}`,
      docente_nombre: r.docente_nombre || 'Escaneo QR',
      curso_nombre: 'Presentación (QR)',
      origen: 'vestimenta',
      puntos: r.puntos,
    });
  });

  // Ordenar cada alumno: más reciente primero
  for (const bloque of porAlumno.values()) {
    bloque.incidencias.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  }

  const alumnos = Array.from(porAlumno.values()).sort((a, b) =>
    String(a.alumno_nombre || '').localeCompare(String(b.alumno_nombre || ''), 'es')
  );

  const total = alumnos.reduce((s, a) => s + (a.incidencias?.length || 0), 0);

  return {
    fecha_desde: desde,
    fecha_hasta: hasta,
    total,
    alumnos,
  };
}

/**
 * Historial unificado de un alumno (matrícula): incidencias + presentación QR del año,
 * agrupable por bimestre con nota de conducta (20 − N).
 */
async function listarIncidenciasUnificadasMatricula(query, {
  matriculaId,
  colegio_id,
  anio,
}) {
  const anioInt = parseInt(anio, 10) || new Date().getFullYear();
  const rowsInc = await query(
    `SELECT ei.id, ei.description, ei.created_at, ei.assignment_id, ei.points,
            CONCAT(COALESCE(p.nombres,''), ' ', COALESCE(p.apellidos,'')) AS docente_nombre,
            CASE
              WHEN ei.assignment_id = ? THEN 'Tutoría'
              ELSE COALESCE(c.nombre, '—')
            END AS curso_nombre
     FROM enrollment_incidents ei
     INNER JOIN matriculas m ON m.id = ei.enrollment_id
     INNER JOIN grupos g ON g.id = m.grupo_id
     LEFT JOIN personal p ON p.id = ei.worker_id
     LEFT JOIN asignaturas a ON a.id = ei.assignment_id AND ei.assignment_id > 0
     LEFT JOIN cursos c ON c.id = a.curso_id
     WHERE ei.enrollment_id = ?
       AND ei.type = 1
       AND g.anio = ?
       AND COALESCE(ei.assignment_id, 0) <> ?
       AND COALESCE(ei.description, '') NOT LIKE '[VESTIMENTA]%'
     ORDER BY ei.created_at DESC`,
    [ASSIGNMENT_ID_TUTORIA, matriculaId, anioInt, ASSIGNMENT_ID_VESTIMENTA]
  );

  let rowsPed = [];
  try {
    rowsPed = await query(
      `SELECT ped.id, ped.fecha, ped.hora, ped.motivo, ped.puntos,
              CASE
                WHEN rpp.id IS NOT NULL THEN TRIM(CONCAT(COALESCE(rpp.nombres,''), ' ', COALESCE(rpp.apellidos,'')))
                WHEN alrp.id IS NOT NULL THEN TRIM(CONCAT(
                  COALESCE(alrp.apellido_paterno,''),' ', COALESCE(alrp.apellido_materno,''),' ', COALESCE(alrp.nombres,'')))
                ELSE 'Escaneo QR'
              END AS docente_nombre
       FROM presentacion_escolar_descuentos ped
       INNER JOIN usuarios ua ON ua.id = ped.alumno_usuario_id AND ua.colegio_id = ped.colegio_id
       INNER JOIN matriculas m ON m.id = ? AND m.alumno_id = ua.alumno_id AND m.colegio_id = ped.colegio_id AND (m.estado = 0)
       INNER JOIN grupos g ON g.id = m.grupo_id AND g.anio = ped.anio
       LEFT JOIN usuarios ur ON ur.id = ped.registrado_por_usuario_id
       LEFT JOIN personal rpp ON rpp.id = ur.personal_id
       LEFT JOIN alumnos alrp ON alrp.id = ur.alumno_id
       WHERE ped.colegio_id = ? AND ped.anio = ?
       ORDER BY ped.fecha DESC, ped.hora DESC`,
      [matriculaId, colegio_id, anioInt]
    );
  } catch (e) {
    if (!(String(e.message || '').includes("doesn't exist") || e.code === 'ER_NO_SUCH_TABLE')) {
      console.warn('[conducta] listar presentacion matricula:', e.message);
    }
    rowsPed = [];
  }

  const fechaEnAnioEscolar = (fechaRaw) => {
    const ymd = String(fechaRaw || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return false;
    const y = parseInt(ymd.slice(0, 4), 10);
    return y >= anioInt - 1 && y <= anioInt + 1;
  };

  const lista = [];

  (rowsInc || []).forEach((r) => {
    if (!fechaEnAnioEscolar(r.created_at)) return;
    lista.push({
      id: `inc-${r.id}`,
      description: String(r.description || '').trim(),
      created_at: r.created_at,
      docente_nombre: r.docente_nombre || '—',
      curso_nombre: r.curso_nombre || '—',
      origen: 'incidencia',
      points: r.points,
    });
  });

  (rowsPed || []).forEach((r) => {
    if (!fechaEnAnioEscolar(r.fecha)) return;
    const fecha = String(r.fecha).slice(0, 10);
    const hora = r.hora ? String(r.hora).slice(0, 8) : '12:00:00';
    const motivo = String(r.motivo || '').trim();
    const desc =
      !motivo || /^PRESENTACION$/i.test(motivo)
        ? 'Descuento por vestimenta / presentación escolar (−1 punto)'
        : `${motivo} (−1 punto)`;
    lista.push({
      id: `ped-${r.id}`,
      description: desc,
      created_at: `${fecha} ${hora}`,
      docente_nombre: r.docente_nombre || 'Escaneo QR',
      curso_nombre: 'Presentación (QR)',
      origen: 'vestimenta',
      points: r.puntos,
    });
  });

  const rangos = await fetchRangosCiclosParsed(query, colegio_id);
  lista.forEach((item) => {
    const ymd = String(item.created_at).slice(0, 10);
    item.ciclo = cicloQueContieneFecha(rangos, anioInt, ymd);
  });
  lista.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));

  const bimestres = [];
  for (let c = 1; c <= 4; c += 1) {
    const rango = await obtenerRangoBimestre(query, colegio_id, c, anioInt);
    const items = lista.filter((i) => {
      const f = String(i.created_at).slice(0, 10);
      return f >= rango.desde && f <= rango.hasta;
    });
    items.forEach((i) => { i.ciclo = c; });
    const nInc = items.filter((x) => x.origen !== 'vestimenta').length;
    const nPres = items.filter((x) => x.origen === 'vestimenta').length;
    bimestres.push({
      ciclo: c,
      fecha_desde: rango.desde,
      fecha_hasta: rango.hasta,
      total: items.length,
      total_incidencias: nInc,
      total_presentacion: nPres,
      nota_conducta: String(notaDesdeCantidad(items.length)),
      incidencias: items,
    });
  }

  return {
    incidencias: lista,
    bimestres,
    anio: anioInt,
  };
}

/**
 * Agrupa una lista ya cargada (estrellas u otros) en los 4 bimestres del colegio.
 * @param {Array} items - cada uno con created_at
 * @param {{ itemsKey?: string, pointsField?: string|null }} opts
 */
async function agruparItemsPorBimestre(query, colegio_id, anio, items, opts = {}) {
  const itemsKey = opts.itemsKey || 'items';
  const pointsField = opts.pointsField || null;
  const anioInt = parseInt(anio, 10) || new Date().getFullYear();
  const lista = Array.isArray(items) ? items.slice() : [];

  const fechaEnAnioEscolar = (fechaRaw) => {
    const ymd = String(fechaRaw || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return false;
    const y = parseInt(ymd.slice(0, 4), 10);
    return y >= anioInt - 1 && y <= anioInt + 1;
  };

  const filtrados = lista.filter((item) => fechaEnAnioEscolar(item.created_at));

  const bimestres = [];
  for (let c = 1; c <= 4; c += 1) {
    const rango = await obtenerRangoBimestre(query, colegio_id, c, anioInt);
    const itemsB = filtrados.filter((i) => {
      const f = String(i.created_at).slice(0, 10);
      return f >= rango.desde && f <= rango.hasta;
    });
    itemsB.forEach((i) => {
      i.ciclo = c;
    });
    const entry = {
      ciclo: c,
      fecha_desde: rango.desde,
      fecha_hasta: rango.hasta,
      total: itemsB.length,
      [itemsKey]: itemsB,
    };
    if (pointsField) {
      entry.total_puntos = itemsB.reduce(
        (s, e) => s + (parseInt(e[pointsField], 10) || 0),
        0
      );
    }
    bimestres.push(entry);
  }

  return { bimestres, anio: anioInt };
}

module.exports = {
  ASIGNATURA_CONDUCTA,
  ASSIGNMENT_ID_TUTORIA,
  ASSIGNMENT_ID_VESTIMENTA,
  DESC_VESTIMENTA,
  obtenerRangoBimestre,
  cicloQueContieneFecha,
  contarIncidenciasMatriculaEnRango,
  notaDesdeCantidad,
  persistirNotaConducta,
  sincronizarConductaMatriculaBimestre,
  asegurarIncidenciaVestimenta,
  backfillVestimentaAIncidenciasGrupo,
  listarIncidenciasUnificadasGrupo,
  listarIncidenciasUnificadasMatricula,
  agruparItemsPorBimestre,
  fetchRangosCiclosParsed,
};
