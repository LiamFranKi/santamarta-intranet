/**
 * Conducta automática por bimestre: 4 casilleros (incidencias, presentación, tardanzas, olvido QR)
 * y promedio final. Fechas de colegios.rangos_ciclos_notas.
 */
const {
  fetchRangosCiclosParsed,
  getFechasCicloAsistencia,
} = require('./libretaResumenBimestres');
const {
  fetchReglaConducta,
  notaDesdeCantidad,
  notasDesdeConteos,
  formatNotaAlmacenada,
  formatDescuentoLabel,
  textoReglaConducta,
  captionDescuentosConducta,
} = require('./reglaConducta');

const ASIGNATURA_CONDUCTA = -101;
const ASIGNATURA_CONDUCTA_INCIDENCIAS = -104;
const ASIGNATURA_CONDUCTA_PRESENTACION = -105;
const ASIGNATURA_CONDUCTA_TARDANZAS = -106;
const ASIGNATURA_CONDUCTA_OLVIDO_QR = -107;
const IDS_NOTAS_CONDUCTA = [
  ASIGNATURA_CONDUCTA,
  ASIGNATURA_CONDUCTA_INCIDENCIAS,
  ASIGNATURA_CONDUCTA_PRESENTACION,
  ASIGNATURA_CONDUCTA_TARDANZAS,
  ASIGNATURA_CONDUCTA_OLVIDO_QR,
];
/** Incidencias registradas como tutor */
const ASSIGNMENT_ID_TUTORIA = -102;
/** Descuento por vestimenta / presentación (escaneo QR) */
const ASSIGNMENT_ID_VESTIMENTA = -103;
const MOTIVO_OLVIDO_QR = 'OLVIDO_QR';

function esMotivoOlvidoQr(motivo) {
  return String(motivo || '').trim().toUpperCase() === MOTIVO_OLVIDO_QR;
}

function descVestimentaPrefijo(descuento) {
  return `[VESTIMENTA] Descuento por vestimenta / presentación escolar (${formatDescuentoLabel(descuento)})`;
}

const DESC_VESTIMENTA = descVestimentaPrefijo(0.5);

/**
 * Normaliza Date / ISO / MySQL datetime a YYYY-MM-DD.
 * mysql2 devuelve Date; String(date).slice(0,10) NO es YMD y vaciaba los bimestres.
 */
function toFechaYmd(value) {
  if (value == null || value === '') return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return '';
}

/** Preserva hora si existe; siempre con fecha YMD legible. */
function toFechaHoraSql(value) {
  const ymd = toFechaYmd(value);
  if (!ymd) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const hh = String(value.getHours()).padStart(2, '0');
    const mm = String(value.getMinutes()).padStart(2, '0');
    const ss = String(value.getSeconds()).padStart(2, '0');
    return `${ymd} ${hh}:${mm}:${ss}`;
  }
  const s = String(value).trim();
  const m = s.match(/^\d{4}-\d{2}-\d{2}[ T](\d{2}:\d{2}(?::\d{2})?)/);
  if (m) return `${ymd} ${m[1].length === 5 ? `${m[1]}:00` : m[1]}`;
  return ymd;
}

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

async function contarComponentesConductaEnRango(query, matriculaId, desde, hasta) {
  const rowsInc = await query(
    `SELECT COUNT(*) AS c FROM enrollment_incidents
     WHERE enrollment_id = ? AND type = 1
       AND DATE(created_at) BETWEEN ? AND ?
       AND COALESCE(assignment_id, 0) <> ?
       AND COALESCE(description, '') NOT LIKE '[VESTIMENTA]%'`,
    [matriculaId, desde, hasta, ASSIGNMENT_ID_VESTIMENTA]
  );
  const incidencias = Math.max(0, parseInt(rowsInc?.[0]?.c, 10) || 0);

  let presentacion = 0;
  let olvido_qr = 0;
  try {
    const rowsPed = await query(
      `SELECT ped.motivo, COUNT(*) AS c
       FROM presentacion_escolar_descuentos ped
       INNER JOIN usuarios ua ON ua.id = ped.alumno_usuario_id AND ua.colegio_id = ped.colegio_id
       INNER JOIN matriculas m ON m.id = ? AND m.alumno_id = ua.alumno_id AND m.colegio_id = ped.colegio_id AND (m.estado = 0)
       INNER JOIN grupos g ON g.id = m.grupo_id AND g.anio = ped.anio
       WHERE DATE(ped.fecha) BETWEEN ? AND ?
       GROUP BY ped.motivo`,
      [matriculaId, desde, hasta]
    );
    (rowsPed || []).forEach((r) => {
      const c = Math.max(0, parseInt(r.c, 10) || 0);
      if (esMotivoOlvidoQr(r.motivo)) olvido_qr += c;
      else presentacion += c;
    });
  } catch (e) {
    if (!(String(e.message || '').includes("doesn't exist") || e.code === 'ER_NO_SUCH_TABLE')) {
      console.warn('[conducta] contar presentacion/olvido QR:', e.message);
    }
  }

  let tardanzas = 0;
  try {
    const rowsTard = await query(
      `SELECT COUNT(*) AS c FROM matriculas_asistencias
       WHERE matricula_id = ? AND tipo = 'TARDANZA'
         AND DATE(fecha) BETWEEN ? AND ?`,
      [matriculaId, desde, hasta]
    );
    tardanzas = Math.max(0, parseInt(rowsTard?.[0]?.c, 10) || 0);
  } catch (e) {
    console.warn('[conducta] contar tardanzas:', e.message);
  }

  return { incidencias, presentacion, tardanzas, olvido_qr };
}

/** Suma de incidencias + presentación (compat). */
async function contarIncidenciasMatriculaEnRango(query, matriculaId, desde, hasta) {
  const c = await contarComponentesConductaEnRango(query, matriculaId, desde, hasta);
  return (c.incidencias || 0) + (c.presentacion || 0) + (c.olvido_qr || 0);
}

async function persistirNotaConducta(execute, matriculaId, cicloInt, nota) {
  const notaFinal = formatNotaAlmacenada(nota);
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

async function persistirNotasConductaDesglose(execute, matriculaId, cicloInt, notas) {
  const pares = [
    [ASIGNATURA_CONDUCTA, notas.final],
    [ASIGNATURA_CONDUCTA_INCIDENCIAS, notas.incidencias],
    [ASIGNATURA_CONDUCTA_PRESENTACION, notas.presentacion],
    [ASIGNATURA_CONDUCTA_TARDANZAS, notas.tardanzas],
    [ASIGNATURA_CONDUCTA_OLVIDO_QR, notas.olvido_qr],
  ];
  const ids = pares.map((p) => p[0]);
  const ph = ids.map(() => '?').join(',');
  await execute(
    `DELETE FROM promedios WHERE matricula_id = ? AND ciclo = ? AND asignatura_id IN (${ph})`,
    [matriculaId, cicloInt, ...ids]
  );
  const values = [];
  const params = [];
  pares.forEach(([aid, nota]) => {
    values.push('(?, ?, ?, ?)');
    params.push(matriculaId, aid, cicloInt, formatNotaAlmacenada(nota));
  });
  await execute(
    `INSERT INTO promedios (matricula_id, asignatura_id, ciclo, promedio) VALUES ${values.join(',')}`,
    params
  );
  return {
    incidencias: formatNotaAlmacenada(notas.incidencias),
    presentacion: formatNotaAlmacenada(notas.presentacion),
    tardanzas: formatNotaAlmacenada(notas.tardanzas),
    olvido_qr: formatNotaAlmacenada(notas.olvido_qr),
    final: formatNotaAlmacenada(notas.final),
  };
}

async function sincronizarConductaMatriculaBimestre(query, execute, {
  matriculaId,
  colegio_id,
  anioEscolar,
  ciclo,
  regla: reglaIn = null,
}) {
  const regla = reglaIn || await fetchReglaConducta(query);
  const rango = await obtenerRangoBimestre(query, colegio_id, ciclo, anioEscolar);
  try {
    const { usaConductaNueva, sincronizarConductaNueva } = require('./conductaCatalogo');
    if (usaConductaNueva(anioEscolar, rango.ciclo)) {
      const nueva = await sincronizarConductaNueva(query, execute, {
        matriculaId,
        colegio_id,
        anioEscolar,
        ciclo: rango.ciclo,
        rango,
        avisar: false,
      });
      if (nueva) {
        return {
          nota: nueva.nota,
          notas: {
            final: nueva.notas.final,
            incidencias: nueva.notas.mes1,
            presentacion: nueva.notas.mes2,
            tardanzas: nueva.notas.final,
            olvido_qr: nueva.notas.final,
          },
          cantidad: 0,
          conteos: { incidencias: 0, presentacion: 0, tardanzas: 0, olvido_qr: 0 },
          regla,
          modo: 'nueva',
          ...rango,
        };
      }
    }
  } catch (eNueva) {
    console.warn('[conducta] régimen nuevo:', eNueva.message);
  }
  const conteos = await contarComponentesConductaEnRango(query, matriculaId, rango.desde, rango.hasta);
  const notas = notasDesdeConteos(conteos, regla);
  await persistirNotasConductaDesglose(execute, matriculaId, rango.ciclo, notas);
  return {
    nota: notas.final,
    notas,
    cantidad: (conteos.incidencias || 0) + (conteos.presentacion || 0) + (conteos.tardanzas || 0) + (conteos.olvido_qr || 0),
    conteos,
    regla,
    ...rango,
  };
}

/**
 * Borra un descuento QR de presentación del grupo, su espejo [VESTIMENTA] y recalcula conducta.
 */
async function borrarDescuentoPresentacionGrupo(query, execute, {
  descuentoId,
  grupoId,
  colegio_id,
}) {
  const id = parseInt(descuentoId, 10);
  const gid = parseInt(grupoId, 10);
  if (!id || !gid) return { ok: false, status: 400, error: 'Parámetros inválidos' };

  let rows = [];
  try {
    rows = await query(
      `SELECT ped.id, ped.fecha, ped.motivo, m.id AS matricula_id, gx.anio
       FROM presentacion_escolar_descuentos ped
       INNER JOIN usuarios ua ON ua.id = ped.alumno_usuario_id AND ua.colegio_id = ped.colegio_id
       INNER JOIN matriculas m ON m.alumno_id = ua.alumno_id AND m.grupo_id = ? AND m.colegio_id = ped.colegio_id AND (m.estado = 0)
       INNER JOIN grupos gx ON gx.id = m.grupo_id AND gx.anio = ped.anio
       WHERE ped.id = ? AND ped.colegio_id = ?
       LIMIT 1`,
      [gid, id, colegio_id]
    );
  } catch (e) {
    if (String(e.message || '').includes("doesn't exist") || e.code === 'ER_NO_SUCH_TABLE') {
      return { ok: false, status: 404, error: 'No hay registro de presentación para borrar' };
    }
    throw e;
  }
  if (!rows.length) {
    return { ok: false, status: 404, error: 'Descuento de presentación no encontrado en este grupo' };
  }

  const row = rows[0];
  const esOlvido = esMotivoOlvidoQr(row.motivo);
  await execute(`DELETE FROM presentacion_escolar_descuentos WHERE id = ?`, [id]);
  try {
    const { borrarRegistroVinculado } = require('./conductaCatalogo');
    await borrarRegistroVinculado('presentacion_descuento_id', id);
  } catch (_) { /* el descuento ya se borró */ }
  if (!esOlvido) {
    try {
      await execute(
        `DELETE FROM enrollment_incidents
         WHERE enrollment_id = ? AND type = 1 AND assignment_id = ?
           AND description LIKE ?`,
        [row.matricula_id, ASSIGNMENT_ID_VESTIMENTA, `%#ped:${id}%`]
      );
    } catch (eDel) {
      console.warn('[conducta] borrar espejo vestimenta:', eDel.message);
    }
  }

  await sincronizarConductaMatriculaPorFecha(query, execute, {
    matriculaId: row.matricula_id,
    colegio_id,
    anioEscolar: row.anio,
    fechaYmd: toFechaYmd(row.fecha),
  });
  return { ok: true, matriculaId: row.matricula_id, motivo: esOlvido ? MOTIVO_OLVIDO_QR : 'PRESENTACION' };
}

/**
 * Corrige una tardanza (la pasa a PRESENTE) y recalcula conducta.
 * No borra el día: el alumno sigue figurando como que asistió.
 */
async function corregirTardanzaAsistenciaGrupo(query, execute, {
  asistenciaId,
  grupoId,
  colegio_id,
}) {
  const id = parseInt(asistenciaId, 10);
  const gid = parseInt(grupoId, 10);
  if (!id || !gid) return { ok: false, status: 400, error: 'Parámetros inválidos' };

  const rows = await query(
    `SELECT ma.id, ma.fecha, m.id AS matricula_id, g.anio
     FROM matriculas_asistencias ma
     INNER JOIN matriculas m ON m.id = ma.matricula_id AND (m.estado = 0)
     INNER JOIN grupos g ON g.id = m.grupo_id
     WHERE ma.id = ? AND m.grupo_id = ? AND g.colegio_id = ? AND ma.tipo = 'TARDANZA'
     LIMIT 1`,
    [id, gid, colegio_id]
  );
  if (!rows.length) {
    return { ok: false, status: 404, error: 'Tardanza no encontrada en este grupo' };
  }

  const row = rows[0];
  await execute(`UPDATE matriculas_asistencias SET tipo = 'PRESENTE' WHERE id = ?`, [id]);
  await sincronizarConductaMatriculaPorFecha(query, execute, {
    matriculaId: row.matricula_id,
    colegio_id,
    anioEscolar: row.anio,
    fechaYmd: toFechaYmd(row.fecha),
  });
  return { ok: true, matriculaId: row.matricula_id };
}

async function sincronizarConductaMatriculaPorFecha(query, execute, {
  matriculaId,
  colegio_id,
  anioEscolar,
  fechaYmd,
}) {
  const rangos = await fetchRangosCiclosParsed(query, colegio_id);
  const ciclo = cicloQueContieneFecha(rangos, anioEscolar, fechaYmd);
  return sincronizarConductaMatriculaBimestre(query, execute, {
    matriculaId,
    colegio_id,
    anioEscolar,
    ciclo,
  });
}

function mapaBimestresVacio() {
  return { b1: null, b2: null, b3: null, b4: null };
}

async function fetchMapasNotasConductaLibreta(query, matriculaId) {
  const rows = await query(
    `SELECT asignatura_id, ciclo, promedio FROM promedios
     WHERE matricula_id = ? AND asignatura_id IN (?, ?, ?, ?, ?) AND ciclo IN (1,2,3,4)`,
    [matriculaId, ...IDS_NOTAS_CONDUCTA]
  );
  const maps = {
    promedio_conducta: mapaBimestresVacio(),
    conducta_incidencias: mapaBimestresVacio(),
    conducta_presentacion: mapaBimestresVacio(),
    conducta_tardanzas: mapaBimestresVacio(),
    conducta_olvido_qr: mapaBimestresVacio(),
  };
  const keyById = {
    [ASIGNATURA_CONDUCTA]: 'promedio_conducta',
    [ASIGNATURA_CONDUCTA_INCIDENCIAS]: 'conducta_incidencias',
    [ASIGNATURA_CONDUCTA_PRESENTACION]: 'conducta_presentacion',
    [ASIGNATURA_CONDUCTA_TARDANZAS]: 'conducta_tardanzas',
    [ASIGNATURA_CONDUCTA_OLVIDO_QR]: 'conducta_olvido_qr',
  };
  (rows || []).forEach((r) => {
    const k = keyById[Number(r.asignatura_id)];
    const ciclo = parseInt(r.ciclo, 10);
    if (!k || ciclo < 1 || ciclo > 4) return;
    maps[k][`b${ciclo}`] = r.promedio != null && r.promedio !== '' ? r.promedio : null;
  });
  maps.conducta_detalle = [];
  try {
    const meta = await query(
      `SELECT m.colegio_id, g.anio FROM matriculas m INNER JOIN grupos g ON g.id = m.grupo_id WHERE m.id = ? LIMIT 1`,
      [matriculaId]
    );
    if (meta?.[0]) {
      const { detalleLibreta } = require('./conductaCatalogo');
      maps.conducta_detalle = await detalleLibreta(matriculaId, meta[0].colegio_id, meta[0].anio);
      (maps.conducta_detalle || []).forEach((h) => {
        const c = parseInt(h.ciclo, 10);
        if (c >= 1 && c <= 4 && h.nota_final != null && h.nota_final !== '') {
          maps.promedio_conducta[`b${c}`] = h.nota_final;
        }
      });
    }
  } catch (eDet) {
    maps.conducta_detalle = [];
  }
  return maps;
}

/**
 * Inserta incidencia espejo de vestimenta si aún no existe para ese día / matrícula.
 * No envía notificación (el escaneo ya avisa por vestimenta).
 */
function descripcionVestimenta(motivo, descuento = 0.5) {
  const m = String(motivo || '').trim();
  const tag = formatDescuentoLabel(descuento);
  if (!m || /^PRESENTACION$/i.test(m)) return descVestimentaPrefijo(descuento);
  return `[VESTIMENTA] ${m} (${tag})`;
}

async function asegurarIncidenciaVestimenta(query, execute, {
  matriculaId,
  workerId,
  fechaYmd,
  hora,
  motivo = null,
  descuentoId = null,
  descuento = null,
}) {
  let descVal = descuento;
  if (descVal == null) {
    try {
      const regla = await fetchReglaConducta(query);
      descVal = regla.presentacion?.descuento ?? 0.5;
    } catch {
      descVal = 0.5;
    }
  }
  const desc = descripcionVestimenta(motivo, descVal);
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
         AND DATE(ped.fecha) BETWEEN ? AND ?
         AND COALESCE(ped.motivo, '') <> 'OLVIDO_QR'`,
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

function descPresentacionLista(motivo, descuento) {
  const tag = formatDescuentoLabel(descuento);
  const m = String(motivo || '').trim();
  if (!m || /^PRESENTACION$/i.test(m)) {
    return `Descuento por vestimenta / presentación escolar (${tag})`;
  }
  return `${m} (${tag})`;
}

function descTardanzaLista(hora, descuento) {
  const tag = formatDescuentoLabel(descuento);
  const h = hora ? String(hora).slice(0, 8) : '';
  if (h && h !== '00:00:00') return `Tardanza registrada a las ${h} (${tag})`;
  return `Tardanza (${tag})`;
}

function descOlvidoQrLista(descuento) {
  const tag = formatDescuentoLabel(descuento);
  return `Olvido de QR / carné de asistencia (${tag})`;
}

function itemListaDesdePed(r, regla) {
  const fecha = toFechaYmd(r.fecha) || String(r.fecha).slice(0, 10);
  const hora = r.hora ? String(r.hora).slice(0, 8) : '12:00:00';
  const docente = r.docente_nombre || 'Escaneo QR';
  if (esMotivoOlvidoQr(r.motivo)) {
    return {
      id: `ped-${r.id}`,
      description: descOlvidoQrLista(regla.olvido_qr?.descuento ?? 0.5),
      created_at: `${fecha} ${hora}`,
      docente_nombre: docente,
      curso_nombre: 'Olvido QR',
      origen: 'olvido_qr',
      puntos: r.puntos,
    };
  }
  const motivo = String(r.motivo || '').trim();
  return {
    id: `ped-${r.id}`,
    description: descPresentacionLista(motivo, regla.presentacion?.descuento ?? 0.5),
    created_at: `${fecha} ${hora}`,
    docente_nombre: docente,
    curso_nombre: 'Presentación (QR)',
    origen: 'vestimenta',
    puntos: r.puntos,
  };
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
  const regla = await fetchReglaConducta(query);
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
      created_at: toFechaHoraSql(r.created_at) || r.created_at,
      docente_nombre: r.docente_nombre,
      curso_nombre: r.curso_nombre,
      origen: 'incidencia',
    });
  });

  (rowsPed || []).forEach((r) => {
    const item = itemListaDesdePed(r, regla);
    ensureAlumno(r.alumno_id, r.alumno_nombre, r.matricula_id).incidencias.push(item);
  });

  let rowsTard = [];
  try {
    const paramsTard = [grupoId, colegio_id, anio, desde, hasta];
    let extraTard = '';
    if (matriculaId) {
      extraTard = ' AND m.id = ? ';
      paramsTard.push(matriculaId);
    }
    rowsTard = await query(
      `SELECT ma.id, ma.fecha, ma.hora_entrada, m.id AS matricula_id, m.alumno_id,
              TRIM(CONCAT(COALESCE(al.apellido_paterno,''),' ', COALESCE(al.apellido_materno,''),' ', COALESCE(al.nombres,''))) AS alumno_nombre
       FROM matriculas_asistencias ma
       INNER JOIN matriculas m ON m.id = ma.matricula_id AND (m.estado = 0)
       INNER JOIN grupos g ON g.id = m.grupo_id
       INNER JOIN alumnos al ON al.id = m.alumno_id
       WHERE g.id = ? AND g.colegio_id = ? AND g.anio = ?
         AND ma.tipo = 'TARDANZA'
         AND DATE(ma.fecha) BETWEEN ? AND ?
         ${extraTard}
       ORDER BY alumno_nombre ASC, ma.fecha DESC, ma.hora_entrada DESC`,
      paramsTard
    );
  } catch (e) {
    console.warn('[conducta] listar tardanzas:', e.message);
    rowsTard = [];
  }

  (rowsTard || []).forEach((r) => {
    const fecha = toFechaYmd(r.fecha) || String(r.fecha).slice(0, 10);
    const hora = r.hora_entrada ? String(r.hora_entrada).slice(0, 8) : '';
    ensureAlumno(r.alumno_id, r.alumno_nombre, r.matricula_id).incidencias.push({
      id: `tard-${r.id}`,
      description: descTardanzaLista(hora, regla.tardanzas?.descuento ?? 0.5),
      created_at: hora ? `${fecha} ${hora}` : fecha,
      docente_nombre: 'Asistencia',
      curso_nombre: 'Tardanza',
      origen: 'tardanza',
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
    regla,
    texto_regla: textoReglaConducta(regla),
    caption_descuentos: captionDescuentosConducta(regla),
  };
}

/**
 * Historial unificado de un alumno (matrícula): incidencias + presentación QR del año,
 * agrupable por bimestre con nota de conducta según la regla configurada.
 */
async function listarIncidenciasUnificadasMatricula(query, {
  matriculaId,
  colegio_id,
  anio,
}) {
  const anioInt = parseInt(anio, 10) || new Date().getFullYear();
  const regla = await fetchReglaConducta(query);
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
    const ymd = toFechaYmd(fechaRaw);
    if (!ymd) return false;
    const y = parseInt(ymd.slice(0, 4), 10);
    return y >= anioInt - 1 && y <= anioInt + 1;
  };

  const lista = [];

  (rowsInc || []).forEach((r) => {
    if (!fechaEnAnioEscolar(r.created_at)) return;
    lista.push({
      id: `inc-${r.id}`,
      description: String(r.description || '').trim(),
      created_at: toFechaHoraSql(r.created_at),
      docente_nombre: r.docente_nombre || '—',
      curso_nombre: r.curso_nombre || '—',
      origen: 'incidencia',
      points: r.points,
    });
  });

  (rowsPed || []).forEach((r) => {
    if (!fechaEnAnioEscolar(r.fecha)) return;
    lista.push(itemListaDesdePed(r, regla));
  });

  let rowsTard = [];
  try {
    rowsTard = await query(
      `SELECT ma.id, ma.fecha, ma.hora_entrada
       FROM matriculas_asistencias ma
       INNER JOIN matriculas m ON m.id = ma.matricula_id
       INNER JOIN grupos g ON g.id = m.grupo_id
       WHERE ma.matricula_id = ? AND ma.tipo = 'TARDANZA' AND g.anio = ?
       ORDER BY ma.fecha DESC, ma.hora_entrada DESC`,
      [matriculaId, anioInt]
    );
  } catch (e) {
    console.warn('[conducta] listar tardanzas matricula:', e.message);
    rowsTard = [];
  }

  (rowsTard || []).forEach((r) => {
    if (!fechaEnAnioEscolar(r.fecha)) return;
    const fecha = toFechaYmd(r.fecha);
    const hora = r.hora_entrada ? String(r.hora_entrada).slice(0, 8) : '';
    lista.push({
      id: `tard-${r.id}`,
      description: descTardanzaLista(hora, regla.tardanzas?.descuento ?? 0.5),
      created_at: hora ? `${fecha} ${hora}` : fecha,
      docente_nombre: 'Asistencia',
      curso_nombre: 'Tardanza',
      origen: 'tardanza',
    });
  });

  const rangos = await fetchRangosCiclosParsed(query, colegio_id);
  lista.forEach((item) => {
    const ymd = toFechaYmd(item.created_at);
    item.ciclo = cicloQueContieneFecha(rangos, anioInt, ymd);
  });
  lista.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));

  const bimestres = [];
  for (let c = 1; c <= 4; c += 1) {
    const rango = await obtenerRangoBimestre(query, colegio_id, c, anioInt);
    const items = lista.filter((i) => Number(i.ciclo) === c);
    items.forEach((i) => { i.ciclo = c; });
    const nInc = items.filter((x) => x.origen !== 'vestimenta' && x.origen !== 'tardanza' && x.origen !== 'olvido_qr').length;
    const nPres = items.filter((x) => x.origen === 'vestimenta').length;
    const nTard = items.filter((x) => x.origen === 'tardanza').length;
    const nOlvido = items.filter((x) => x.origen === 'olvido_qr').length;
    const notas = notasDesdeConteos({
      incidencias: nInc,
      presentacion: nPres,
      tardanzas: nTard,
      olvido_qr: nOlvido,
    }, regla);
    bimestres.push({
      ciclo: c,
      fecha_desde: rango.desde,
      fecha_hasta: rango.hasta,
      total: items.length,
      total_incidencias: nInc,
      total_presentacion: nPres,
      total_tardanzas: nTard,
      total_olvido_qr: nOlvido,
      nota_incidencias: notas.incidencias,
      nota_presentacion: notas.presentacion,
      nota_tardanzas: notas.tardanzas,
      nota_olvido_qr: notas.olvido_qr,
      nota_conducta: notas.final,
      incidencias: items,
    });
  }

  try {
    const { aplicarEnBimestres } = require('./conductaCatalogo');
    await aplicarEnBimestres(bimestres, { matriculaId, anio: anioInt });
  } catch (eNuevo) {
    console.warn('[conducta] detalle nuevo:', eNuevo.message);
  }

  return {
    incidencias: lista,
    bimestres,
    anio: anioInt,
    regla,
    texto_regla: textoReglaConducta(regla),
    caption_descuentos: captionDescuentosConducta(regla),
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
  const rangos = await fetchRangosCiclosParsed(query, colegio_id);

  const normalizados = lista.map((item) => {
    const ymd = toFechaYmd(item.created_at);
    const copy = {
      ...item,
      created_at: toFechaHoraSql(item.created_at) || String(item.created_at || ''),
    };
    if (!ymd) {
      // Sin fecha parseable: no se pierde; va al bimestre 1
      copy.ciclo = 1;
      return copy;
    }
    const y = parseInt(ymd.slice(0, 4), 10);
    if (y < anioInt - 1 || y > anioInt + 1) {
      // Fuera de ventana amplia: aún así asignar ciclo estimado del año escolar
      copy.ciclo = cicloQueContieneFecha(rangos, anioInt, ymd) || 1;
      return copy;
    }
    copy.ciclo = cicloQueContieneFecha(rangos, anioInt, ymd) || 1;
    return copy;
  });

  const bimestres = [];
  for (let c = 1; c <= 4; c += 1) {
    const rango = await obtenerRangoBimestre(query, colegio_id, c, anioInt);
    const itemsB = normalizados.filter((i) => Number(i.ciclo) === c);
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

/**
 * Estrellas de todos los alumnos de un grupo en un rango de fechas.
 */
async function listarEstrellasGrupo(query, {
  grupoId,
  colegio_id,
  anio,
  desde,
  hasta,
}) {
  const anioInt = parseInt(anio, 10) || new Date().getFullYear();
  const rows = await query(
    `SELECT ei.id, ei.points, ei.description, ei.created_at, ei.worker_id, ei.assignment_id,
            m.id AS matricula_id, m.alumno_id,
            TRIM(CONCAT(COALESCE(al.apellido_paterno,''),' ', COALESCE(al.apellido_materno,''),' ', COALESCE(al.nombres,''))) AS alumno_nombre,
            CONCAT(COALESCE(p.nombres,''), ' ', COALESCE(p.apellidos,'')) AS docente_nombre,
            CASE WHEN ei.assignment_id = ? THEN 'Tutoría' ELSE COALESCE(c.nombre, '—') END AS curso_nombre
     FROM enrollment_incidents ei
     INNER JOIN matriculas m ON m.id = ei.enrollment_id AND m.grupo_id = ? AND m.colegio_id = ? AND (m.estado = 0)
     INNER JOIN grupos g ON g.id = m.grupo_id AND g.anio = ?
     INNER JOIN alumnos al ON al.id = m.alumno_id
     LEFT JOIN personal p ON p.id = ei.worker_id
     LEFT JOIN asignaturas a ON a.id = ei.assignment_id AND ei.assignment_id > 0
     LEFT JOIN cursos c ON c.id = a.curso_id
     WHERE ei.type = 2
       AND DATE(ei.created_at) BETWEEN ? AND ?
     ORDER BY alumno_nombre ASC, ei.created_at DESC`,
    [ASSIGNMENT_ID_TUTORIA, grupoId, colegio_id, anioInt, desde, hasta]
  );

  const porAlumno = new Map();
  (rows || []).forEach((r) => {
    const aid = r.alumno_id;
    if (!porAlumno.has(aid)) {
      porAlumno.set(aid, {
        alumno_id: aid,
        matricula_id: r.matricula_id,
        alumno_nombre: r.alumno_nombre,
        total_puntos: 0,
        estrellas: [],
      });
    }
    const bloque = porAlumno.get(aid);
    const pts = parseInt(r.points, 10) || 0;
    bloque.total_puntos += pts;
    bloque.estrellas.push({
      id: r.id,
      points: pts,
      description: String(r.description || '').trim(),
      created_at: toFechaHoraSql(r.created_at),
      docente_nombre: r.docente_nombre || '—',
      curso_nombre: r.curso_nombre || '—',
    });
  });

  const alumnos = Array.from(porAlumno.values()).sort((a, b) =>
    String(a.alumno_nombre || '').localeCompare(String(b.alumno_nombre || ''), 'es')
  );
  const total = alumnos.reduce((s, a) => s + (a.estrellas?.length || 0), 0);
  const totalPuntos = alumnos.reduce((s, a) => s + (a.total_puntos || 0), 0);

  return {
    fecha_desde: desde,
    fecha_hasta: hasta,
    total,
    total_puntos: totalPuntos,
    alumnos,
  };
}

async function recalcularConductaColegioAnio(query, execute, { colegio_id, anio }) {
  const regla = await fetchReglaConducta(query);
  const anioInt = parseInt(anio, 10) || new Date().getFullYear();
  const matriculas = await query(
    `SELECT m.id AS matricula_id
     FROM matriculas m
     INNER JOIN grupos g ON g.id = m.grupo_id
     WHERE m.colegio_id = ? AND g.anio = ? AND (m.estado = 0)`,
    [colegio_id, anioInt]
  );
  const ids = (matriculas || []).map((m) => m.matricula_id).filter((id) => id != null);
  if (!ids.length) {
    return { matriculas: 0, notas: 0, grupos: 0, regla };
  }

  const CHUNK = 150;
  let notas = 0;
  let catalogo;
  try {
    catalogo = require('./conductaCatalogo');
  } catch (eCat) {
    catalogo = null;
  }
  for (let ciclo = 1; ciclo <= 4; ciclo += 1) {
    if (catalogo && catalogo.usaConductaNueva(anioInt, ciclo)) {
      notas += await catalogo.recalcularCicloNuevo(colegio_id, anioInt, ciclo);
      continue;
    }
    if (catalogo) continue;
    const rango = await obtenerRangoBimestre(query, colegio_id, ciclo, anioInt);
    const incRows = await query(
      `SELECT ei.enrollment_id AS mid, COUNT(*) AS c
       FROM enrollment_incidents ei
       INNER JOIN matriculas m ON m.id = ei.enrollment_id
       INNER JOIN grupos g ON g.id = m.grupo_id
       WHERE m.colegio_id = ? AND g.anio = ? AND (m.estado = 0)
         AND ei.type = 1
         AND DATE(ei.created_at) BETWEEN ? AND ?
         AND COALESCE(ei.assignment_id, 0) <> ?
         AND COALESCE(ei.description, '') NOT LIKE '[VESTIMENTA]%'
       GROUP BY ei.enrollment_id`,
      [colegio_id, anioInt, rango.desde, rango.hasta, ASSIGNMENT_ID_VESTIMENTA]
    );
    const incMap = {};
    (incRows || []).forEach((r) => {
      incMap[r.mid] = Math.max(0, parseInt(r.c, 10) || 0);
    });

    const pedMap = {};
    const olvidoMap = {};
    try {
      const pedRows = await query(
        `SELECT m.id AS mid, ped.motivo, COUNT(*) AS c
         FROM presentacion_escolar_descuentos ped
         INNER JOIN usuarios ua ON ua.id = ped.alumno_usuario_id AND ua.colegio_id = ped.colegio_id
         INNER JOIN matriculas m ON m.alumno_id = ua.alumno_id AND m.colegio_id = ped.colegio_id AND (m.estado = 0)
         INNER JOIN grupos g ON g.id = m.grupo_id AND g.anio = ped.anio
         WHERE ped.colegio_id = ? AND ped.anio = ?
           AND DATE(ped.fecha) BETWEEN ? AND ?
         GROUP BY m.id, ped.motivo`,
        [colegio_id, anioInt, rango.desde, rango.hasta]
      );
      (pedRows || []).forEach((r) => {
        const c = Math.max(0, parseInt(r.c, 10) || 0);
        if (esMotivoOlvidoQr(r.motivo)) {
          olvidoMap[r.mid] = (olvidoMap[r.mid] || 0) + c;
        } else {
          pedMap[r.mid] = (pedMap[r.mid] || 0) + c;
        }
      });
    } catch (e) {
      if (!(String(e.message || '').includes("doesn't exist") || e.code === 'ER_NO_SUCH_TABLE')) {
        console.warn('[conducta] recalc presentacion/olvido QR:', e.message);
      }
    }

    const tardMap = {};
    try {
      const tardRows = await query(
        `SELECT ma.matricula_id AS mid, COUNT(*) AS c
         FROM matriculas_asistencias ma
         INNER JOIN matriculas m ON m.id = ma.matricula_id AND (m.estado = 0)
         INNER JOIN grupos g ON g.id = m.grupo_id
         WHERE m.colegio_id = ? AND g.anio = ?
           AND ma.tipo = 'TARDANZA'
           AND DATE(ma.fecha) BETWEEN ? AND ?
         GROUP BY ma.matricula_id`,
        [colegio_id, anioInt, rango.desde, rango.hasta]
      );
      (tardRows || []).forEach((r) => {
        tardMap[r.mid] = Math.max(0, parseInt(r.c, 10) || 0);
      });
    } catch (e) {
      console.warn('[conducta] recalc tardanzas:', e.message);
    }

    const idsNotasPh = IDS_NOTAS_CONDUCTA.map(() => '?').join(',');
    for (let i = 0; i < ids.length; i += CHUNK) {
      const slice = ids.slice(i, i + CHUNK);
      const ph = slice.map(() => '?').join(',');
      await execute(
        `DELETE FROM promedios WHERE asignatura_id IN (${idsNotasPh}) AND ciclo = ? AND matricula_id IN (${ph})`,
        [...IDS_NOTAS_CONDUCTA, ciclo, ...slice]
      );
      const values = [];
      const params = [];
      slice.forEach((mid) => {
        const notasM = notasDesdeConteos({
          incidencias: incMap[mid] || 0,
          presentacion: pedMap[mid] || 0,
          tardanzas: tardMap[mid] || 0,
          olvido_qr: olvidoMap[mid] || 0,
        }, regla);
        [
          [ASIGNATURA_CONDUCTA, notasM.final],
          [ASIGNATURA_CONDUCTA_INCIDENCIAS, notasM.incidencias],
          [ASIGNATURA_CONDUCTA_PRESENTACION, notasM.presentacion],
          [ASIGNATURA_CONDUCTA_TARDANZAS, notasM.tardanzas],
          [ASIGNATURA_CONDUCTA_OLVIDO_QR, notasM.olvido_qr],
        ].forEach(([aid, n]) => {
          values.push('(?, ?, ?, ?)');
          params.push(mid, aid, ciclo, n);
        });
      });
      if (values.length) {
        await execute(
          `INSERT INTO promedios (matricula_id, asignatura_id, ciclo, promedio) VALUES ${values.join(',')}`,
          params
        );
        notas += values.length;
      }
    }
  }

  return {
    matriculas: ids.length,
    notas,
    regla,
    texto_regla: textoReglaConducta(regla),
  };
}

module.exports = {
  ASIGNATURA_CONDUCTA,
  ASIGNATURA_CONDUCTA_INCIDENCIAS,
  ASIGNATURA_CONDUCTA_PRESENTACION,
  ASIGNATURA_CONDUCTA_TARDANZAS,
  ASIGNATURA_CONDUCTA_OLVIDO_QR,
  IDS_NOTAS_CONDUCTA,
  ASSIGNMENT_ID_TUTORIA,
  ASSIGNMENT_ID_VESTIMENTA,
  MOTIVO_OLVIDO_QR,
  DESC_VESTIMENTA,
  toFechaYmd,
  toFechaHoraSql,
  obtenerRangoBimestre,
  cicloQueContieneFecha,
  contarComponentesConductaEnRango,
  contarIncidenciasMatriculaEnRango,
  notaDesdeCantidad,
  persistirNotaConducta,
  persistirNotasConductaDesglose,
  sincronizarConductaMatriculaBimestre,
  sincronizarConductaMatriculaPorFecha,
  borrarDescuentoPresentacionGrupo,
  corregirTardanzaAsistenciaGrupo,
  fetchMapasNotasConductaLibreta,
  asegurarIncidenciaVestimenta,
  backfillVestimentaAIncidenciasGrupo,
  listarIncidenciasUnificadasGrupo,
  listarIncidenciasUnificadasMatricula,
  agruparItemsPorBimestre,
  listarEstrellasGrupo,
  fetchRangosCiclosParsed,
  recalcularConductaColegioAnio,
  textoReglaConducta,
  fetchReglaConducta,
};
