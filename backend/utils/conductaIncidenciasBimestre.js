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
  const rows = await query(
    `SELECT COUNT(*) AS c FROM enrollment_incidents
     WHERE enrollment_id = ? AND type = 1
       AND DATE(created_at) BETWEEN ? AND ?`,
    [matriculaId, desde, hasta]
  );
  return Math.max(0, parseInt(rows?.[0]?.c, 10) || 0);
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
  const r = await execute(
    `INSERT INTO enrollment_incidents
      (enrollment_id, assignment_id, worker_id, type, points, description, created_at, updated_at)
     VALUES (?, ?, ?, 1, 0, ?, ?, ?)`,
    [
      matriculaId,
      ASSIGNMENT_ID_VESTIMENTA,
      workerId || 0,
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
      `SELECT ped.id, ped.fecha, ped.hora, ped.motivo, ped.registrado_por_usuario_id, m.id AS matricula_id, u_reg.personal_id
       FROM presentacion_escolar_descuentos ped
       INNER JOIN usuarios ua ON ua.id = ped.alumno_usuario_id AND ua.colegio_id = ?
       INNER JOIN matriculas m ON m.alumno_id = ua.alumno_id AND m.grupo_id = ? AND m.colegio_id = ? AND (m.estado = 0)
       LEFT JOIN usuarios u_reg ON u_reg.id = ped.registrado_por_usuario_id
       WHERE ped.colegio_id = ? AND ped.anio = ?
         AND DATE(ped.fecha) BETWEEN ? AND ?`,
      [colegio_id, grupoId, colegio_id, colegio_id, anio, desde, hasta]
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
    const fecha = String(row.fecha).slice(0, 10);
    const r = await asegurarIncidenciaVestimenta(query, execute, {
      matriculaId: row.matricula_id,
      workerId: row.personal_id || 0,
      fechaYmd: fecha,
      hora: row.hora || '12:00:00',
      motivo: row.motivo || null,
      descuentoId: row.id || null,
    });
    if (r.created) created += 1;
  }
  return created;
}

async function listarIncidenciasUnificadasGrupo(query, {
  grupoId,
  colegio_id,
  anio,
  desde,
  hasta,
  matriculaId = null,
}) {
  const params = [ASSIGNMENT_ID_TUTORIA, ASSIGNMENT_ID_VESTIMENTA, grupoId, colegio_id, anio, desde, hasta];
  let extra = '';
  if (matriculaId) {
    extra = ' AND m.id = ? ';
    params.push(matriculaId);
  }

  const rows = await query(
    `SELECT ei.id, ei.description, ei.created_at, ei.assignment_id, ei.enrollment_id AS matricula_id,
            CONCAT(COALESCE(p.nombres,''), ' ', COALESCE(p.apellidos,'')) AS docente_nombre,
            CASE
              WHEN ei.assignment_id = ? THEN 'Tutoría'
              WHEN ei.assignment_id = ? THEN 'Presentación (QR)'
              ELSE COALESCE(c.nombre, '—')
            END AS curso_nombre,
            CASE
              WHEN ei.assignment_id = ${ASSIGNMENT_ID_VESTIMENTA} OR ei.description LIKE '[VESTIMENTA]%' THEN 'vestimenta'
              ELSE 'incidencia'
            END AS origen,
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
       ${extra}
     ORDER BY alumno_nombre ASC, ei.created_at DESC`,
    params
  );

  const porAlumno = new Map();
  (rows || []).forEach((r) => {
    const aid = r.alumno_id;
    if (!porAlumno.has(aid)) {
      porAlumno.set(aid, {
        alumno_id: aid,
        matricula_id: r.matricula_id,
        alumno_nombre: r.alumno_nombre,
        incidencias: [],
      });
    }
    porAlumno.get(aid).incidencias.push({
      id: r.id,
      description: String(r.description || '')
        .replace(/^\[VESTIMENTA\]\s*/i, '')
        .replace(/\s*\[#ped:\d+\]\s*$/i, '')
        .trim(),
      created_at: r.created_at,
      docente_nombre: r.docente_nombre,
      curso_nombre: r.curso_nombre,
      origen: r.origen,
    });
  });

  return {
    fecha_desde: desde,
    fecha_hasta: hasta,
    total: (rows || []).length,
    alumnos: Array.from(porAlumno.values()),
  };
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
  fetchRangosCiclosParsed,
};
