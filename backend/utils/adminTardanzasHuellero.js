/**
 * Importación Excel huellero y listado de tardanzas del personal.
 */
const XLSX = require('xlsx');

const DESCUENTO_POR_MINUTO = 1.0;

const MESES_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function normName(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

function tokens(s) {
  return normName(s).split(' ').filter(Boolean);
}

function overlapScore(a, b) {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.length || !tb.length) return 0;
  let hit = 0;
  ta.forEach((t) => {
    if (tb.some((x) => x === t || x.startsWith(t) || t.startsWith(x))) hit += 1;
  });
  return hit / Math.max(ta.length, tb.length);
}

function scorePersonalMatch(firstName, lastName, personal) {
  const fn = normName(firstName);
  const ln = normName(lastName);
  const nNom = normName(personal.nombres);
  const nApe = normName(personal.apellidos);
  const fullExcel = `${ln} ${fn}`.trim();
  const fullDb = `${nApe} ${nNom}`.trim();

  if (nApe === ln && nNom === fn) return 100;
  if (fullDb === fullExcel) return 98;
  if (nApe === ln && nNom.startsWith(fn)) return 95;
  if (nApe.includes(ln) && nNom.includes(fn)) return 88;
  const sApe = overlapScore(ln, nApe);
  const sNom = overlapScore(fn, nNom);
  if (sApe >= 0.75 && sNom >= 0.75) return 70 + Math.round((sApe + sNom) * 10);
  return Math.round((sApe * 0.55 + sNom * 0.45) * 60);
}

function matchPersonal(firstName, lastName, personalList) {
  let best = null;
  let bestScore = 0;
  let second = 0;
  for (const p of personalList) {
    const sc = scorePersonalMatch(firstName, lastName, p);
    if (sc > bestScore) {
      second = bestScore;
      bestScore = sc;
      best = p;
    } else if (sc > second) {
      second = sc;
    }
  }
  if (!best || bestScore < 55) return null;
  if (bestScore >= 85) return best;
  if (bestScore - second >= 12) return best;
  return null;
}

function parseHoraMarcacion(timeVal) {
  if (timeVal == null || timeVal === '') return null;

  if (timeVal instanceof Date && !Number.isNaN(timeVal.getTime())) {
    const h = timeVal.getHours();
    const m = timeVal.getMinutes();
    const s = timeVal.getSeconds();
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  if (typeof timeVal === 'number' && Number.isFinite(timeVal)) {
    const totalMin = Math.round(timeVal * 24 * 60);
    const h = Math.floor(totalMin / 60) % 24;
    const m = totalMin % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
  }

  let s = String(timeVal).trim();
  if (!s) return null;

  let m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(a\.?\s*m\.?|p\.?\s*m\.?)?$/i);
  if (!m) {
    const embedded = s.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (embedded) m = embedded;
  }
  if (!m) return null;

  let h = parseInt(m[1], 10);
  const min = m[2];
  const sec = m[3] || '00';
  const ampm = (m[4] || '').toLowerCase().replace(/\s/g, '');
  if (ampm.startsWith('p') && h < 12) h += 12;
  if (ampm.startsWith('a') && h === 12) h = 0;

  return `${String(h).padStart(2, '0')}:${min}:${sec.padStart(2, '0')}`;
}

function parseFecha(dateVal) {
  if (!dateVal) return null;
  if (dateVal instanceof Date && !Number.isNaN(dateVal.getTime())) {
    const y = dateVal.getFullYear();
    const mo = String(dateVal.getMonth() + 1).padStart(2, '0');
    const d = String(dateVal.getDate()).padStart(2, '0');
    return `${y}-${mo}-${d}`;
  }
  if (typeof dateVal === 'number' && Number.isFinite(dateVal)) {
    const dc = XLSX.SSF.parse_date_code(dateVal);
    if (dc) return `${dc.y}-${String(dc.m).padStart(2, '0')}-${String(dc.d).padStart(2, '0')}`;
  }
  const s = String(dateVal).trim().split(' ')[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}

function toMinutesFromMidnight(timeVal) {
  if (timeVal == null || timeVal === '') return null;
  if (timeVal instanceof Date && !Number.isNaN(timeVal.getTime())) {
    return timeVal.getUTCHours() * 60 + timeVal.getUTCMinutes();
  }
  const s = String(timeVal).trim();
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (Number.isNaN(h) || Number.isNaN(min)) return null;
  return h * 60 + min;
}

/**
 * Tardanzas y descuento del mes calendario actual (o mes/año indicados)
 * según registros en asistencia_registros (incluye importación huellero).
 */
async function calcularTardanzasMesPersonal(
  query,
  { usuario_id, colegio_id, anio_activo, hora_entrada_config, mes, anio_calendario }
) {
  const ahora = new Date();
  const mesNum = Number.isFinite(mes) ? mes : ahora.getMonth() + 1;
  const anioNum = Number.isFinite(anio_calendario) ? anio_calendario : ahora.getFullYear();
  const mesNombre = MESES_ES[mesNum - 1] || `Mes ${mesNum}`;

  if (!hora_entrada_config) {
    return {
      minutos_tardanza: 0,
      descuento: 0,
      mes: mesNum,
      anio_calendario: anioNum,
      mes_nombre: mesNombre,
      registros: 0,
      hora_entrada_config: null,
      tarifa_por_minuto: DESCUENTO_POR_MINUTO,
    };
  }

  const registros = await query(
    `SELECT ar.fecha, ar.hora_entrada
     FROM asistencia_registros ar
     WHERE ar.usuario_id = ?
       AND ar.colegio_id = ?
       AND ar.anio = ?
       AND YEAR(ar.fecha) = ?
       AND MONTH(ar.fecha) = ?
       AND ar.hora_entrada IS NOT NULL
       AND (ar.tipo_registro = 'ENTRADA' OR ar.tipo_registro = 'ENTRADA_SALIDA')
     ORDER BY ar.fecha ASC`,
    [usuario_id, colegio_id, anio_activo, anioNum, mesNum]
  );

  let totalMinutos = 0;
  (registros || []).forEach((reg) => {
    const { minutos_tardanza } = calcTardanza(hora_entrada_config, reg.hora_entrada);
    totalMinutos += minutos_tardanza;
  });

  return {
    minutos_tardanza: totalMinutos,
    descuento: Math.round(totalMinutos * DESCUENTO_POR_MINUTO * 100) / 100,
    mes: mesNum,
    anio_calendario: anioNum,
    mes_nombre: mesNombre,
    registros: (registros || []).length,
    hora_entrada_config: formatHoraDisplay(hora_entrada_config),
    tarifa_por_minuto: DESCUENTO_POR_MINUTO,
  };
}

function calcTardanza(horaEntradaConfig, horaMarcacion) {
  const cfg = toMinutesFromMidnight(horaEntradaConfig);
  const mar = toMinutesFromMidnight(horaMarcacion);
  if (cfg == null || mar == null) {
    return { minutos_tardanza: 0, descuento: 0 };
  }
  const minutos = Math.max(0, mar - cfg);
  return {
    minutos_tardanza: minutos,
    descuento: Math.round(minutos * DESCUENTO_POR_MINUTO * 100) / 100,
  };
}

function formatHoraDisplay(timeStr) {
  if (!timeStr) return '—';
  const p = String(timeStr).split(':');
  if (p.length < 2) return String(timeStr);
  return `${p[0].padStart(2, '0')}:${p[1].padStart(2, '0')}`;
}

function nombrePersonal(p) {
  const ape = String(p.apellidos || '').trim();
  const nom = String(p.nombres || '').trim();
  if (ape && nom) return `${ape}, ${nom}`;
  return ape || nom || '—';
}

function parseHuelleroExcelBuffer(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheetName = wb.SheetNames[0];
  const raw = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '' });
  const headerIdx = raw.findIndex((r) => normName(r[0]) === 'first name');
  if (headerIdx < 0) {
    const err = new Error('No se encontró la fila de encabezados (First Name / Last Name / Date / Time).');
    err.status = 400;
    throw err;
  }

  const rows = raw.slice(headerIdx + 1).filter((r) => r[0] || r[1]);
  const dedupeMap = new Map();

  for (const r of rows) {
    const firstName = String(r[0] || '').trim();
    const lastName = String(r[1] || '').trim();
    const fecha = parseFecha(r[4]);
    const hora = parseHoraMarcacion(r[5]);
    if (!firstName || !lastName || !fecha || !hora) continue;

    const key = `${normName(lastName)}|${normName(firstName)}|${fecha}`;
    const min = toMinutesFromMidnight(hora);
    const cur = dedupeMap.get(key);
    if (!cur || (min != null && min < toMinutesFromMidnight(cur.hora_marcacion))) {
      dedupeMap.set(key, {
        first_name: firstName,
        last_name: lastName,
        fecha,
        hora_marcacion: hora,
        department: String(r[3] || '').trim(),
      });
    }
  }

  return [...dedupeMap.values()];
}

async function loadPersonalColegio(query, colegioId) {
  const rows = await query(
    `SELECT p.id AS personal_id, p.nombres, p.apellidos, p.hora_entrada, p.cargo,
            u.id AS usuario_id
     FROM personal p
     LEFT JOIN usuarios u ON u.personal_id = p.id AND u.colegio_id = p.colegio_id AND u.estado = 'ACTIVO'
     WHERE p.colegio_id = ?
     ORDER BY p.apellidos ASC, p.nombres ASC`,
    [colegioId]
  );
  return rows || [];
}

async function getAnioActivo(query, colegioId) {
  const [row] = await query('SELECT anio_activo, nombre FROM colegios WHERE id = ? LIMIT 1', [colegioId]);
  return {
    anio: parseInt(row?.anio_activo || new Date().getFullYear(), 10),
    colegio_nombre: row?.nombre || '',
  };
}

async function findRegistrosMarcacion(query, usuarioId, colegioId, fecha, anio) {
  return query(
    `SELECT id, hora_entrada
     FROM asistencia_registros
     WHERE usuario_id = ? AND colegio_id = ? AND DATE(fecha) = ? AND anio = ?
     ORDER BY id DESC`,
    [usuarioId, colegioId, fecha, anio]
  );
}

/** Inserta o actualiza la marcación del día; elimina duplicados previos. */
async function upsertMarcacionDia(execute, query, { usuarioId, colegioId, anio, fecha, horaMarcacion, auditUserId }) {
  const existing = await findRegistrosMarcacion(query, usuarioId, colegioId, fecha, anio);

  if (existing.length > 0) {
    const keepId = existing[0].id;
    await execute(
      `UPDATE asistencia_registros
       SET hora_entrada = ?, tipo_registro = 'ENTRADA', actualizado_por = ?, fecha_actualizacion = NOW()
       WHERE id = ?`,
      [horaMarcacion, auditUserId, keepId]
    );
    const dupIds = existing.slice(1).map((r) => r.id);
    if (dupIds.length) {
      await execute(
        `DELETE FROM asistencia_registros WHERE id IN (${dupIds.map(() => '?').join(',')})`,
        dupIds
      );
    }
    return 'actualizado';
  }

  await execute(
    `INSERT INTO asistencia_registros
     (usuario_id, colegio_id, anio, fecha, tipo_registro, hora_entrada, creado_por, fecha_creacion)
     VALUES (?, ?, ?, ?, 'ENTRADA', ?, ?, NOW())`,
    [usuarioId, colegioId, anio, fecha, horaMarcacion, auditUserId]
  );
  return 'insertado';
}

function enrichFilaMarcacion(row, personal) {
  const horaEntradaReal = personal?.hora_entrada || null;
  const { minutos_tardanza, descuento } = calcTardanza(horaEntradaReal, row.hora_marcacion);
  return {
    personal_id: personal?.personal_id || null,
    usuario_id: personal?.usuario_id || null,
    personal_nombre: personal ? nombrePersonal(personal) : `${row.last_name}, ${row.first_name}`,
    fecha: row.fecha,
    hora_entrada_real: horaEntradaReal,
    hora_entrada_real_fmt: formatHoraDisplay(horaEntradaReal),
    hora_marcacion: row.hora_marcacion,
    hora_marcacion_fmt: formatHoraDisplay(row.hora_marcacion),
    minutos_tardanza,
    descuento,
    excel_first_name: row.first_name,
    excel_last_name: row.last_name,
    department: row.department || null,
  };
}

async function previewHuelleroImport(query, colegioId, buffer) {
  const parsed = parseHuelleroExcelBuffer(buffer);
  const personalList = await loadPersonalColegio(query, colegioId);
  const { anio } = await getAnioActivo(query, colegioId);

  const coincidencias = [];
  const sinCoincidencia = [];
  const sinUsuario = [];

  for (const row of parsed) {
    const match = matchPersonal(row.first_name, row.last_name, personalList);
    if (!match) {
      sinCoincidencia.push({
        first_name: row.first_name,
        last_name: row.last_name,
        fecha: row.fecha,
        hora_marcacion_fmt: formatHoraDisplay(row.hora_marcacion),
      });
      continue;
    }
    if (!match.usuario_id) {
      sinUsuario.push({
        personal_nombre: nombrePersonal(match),
        personal_id: match.personal_id,
        fecha: row.fecha,
        hora_marcacion_fmt: formatHoraDisplay(row.hora_marcacion),
      });
      continue;
    }
    coincidencias.push(enrichFilaMarcacion(row, match));
  }

  let nuevos = 0;
  let actualizados = 0;
  for (const c of coincidencias) {
    const existing = await findRegistrosMarcacion(query, c.usuario_id, colegioId, c.fecha, anio);
    if (existing.length) actualizados += 1;
    else nuevos += 1;
  }

  return {
    resumen: {
      filas_excel_raw: parsed.length,
      filas_despues_dedupe: parsed.length,
      coincidencias: coincidencias.length,
      sin_coincidencia: sinCoincidencia.length,
      sin_usuario: sinUsuario.length,
      nuevos,
      actualizados,
      tarifa_por_minuto: DESCUENTO_POR_MINUTO,
    },
    coincidencias: coincidencias.slice(0, 200),
    sin_coincidencia: sinCoincidencia.slice(0, 100),
    sin_usuario: sinUsuario.slice(0, 50),
  };
}

async function importarHuellero(query, execute, colegioId, adminUsuarioId, buffer) {
  const auditUserId = adminUsuarioId ?? null;
  const parsed = parseHuelleroExcelBuffer(buffer);
  const personalList = await loadPersonalColegio(query, colegioId);
  const { anio } = await getAnioActivo(query, colegioId);

  const stats = {
    procesados: 0,
    insertados: 0,
    actualizados: 0,
    omitidos_sin_match: 0,
    omitidos_sin_usuario: 0,
    errores: 0,
  };

  for (const row of parsed) {
    const match = matchPersonal(row.first_name, row.last_name, personalList);
    if (!match) {
      stats.omitidos_sin_match += 1;
      continue;
    }
    if (!match.usuario_id) {
      stats.omitidos_sin_usuario += 1;
      continue;
    }

    try {
      const result = await upsertMarcacionDia(execute, query, {
        usuarioId: match.usuario_id,
        colegioId,
        anio,
        fecha: row.fecha,
        horaMarcacion: row.hora_marcacion,
        auditUserId,
      });
      if (result === 'actualizado') stats.actualizados += 1;
      else stats.insertados += 1;
      stats.procesados += 1;
    } catch (e) {
      stats.errores += 1;
      console.error('[tardanzas/import]', e?.message || e);
    }
  }

  return stats;
}

async function listarTardanzas(query, colegioId, params = {}) {
  const { anio, colegio_nombre } = await getAnioActivo(query, colegioId);
  const personalId = params.personal_id ? parseInt(params.personal_id, 10) : null;
  const desde = params.desde || null;
  const hasta = params.hasta || null;

  const where = [
    'ar.colegio_id = ?',
    'ar.anio = ?',
    'ar.hora_entrada IS NOT NULL',
    "u.personal_id > 0",
    "(ar.tipo_registro = 'ENTRADA' OR ar.tipo_registro = 'ENTRADA_SALIDA')",
  ];
  const sqlParams = [colegioId, anio];

  if (Number.isFinite(personalId)) {
    where.push('p.id = ?');
    sqlParams.push(personalId);
  }
  if (desde) {
    where.push('ar.fecha >= ?');
    sqlParams.push(desde);
  }
  if (hasta) {
    where.push('ar.fecha <= ?');
    sqlParams.push(hasta);
  }

  const rows = await query(
    `SELECT ar.id, ar.fecha, ar.hora_entrada AS hora_marcacion,
            p.id AS personal_id, p.nombres, p.apellidos, p.hora_entrada AS hora_entrada_real,
            u.id AS usuario_id
     FROM asistencia_registros ar
     INNER JOIN usuarios u ON u.id = ar.usuario_id AND u.colegio_id = ar.colegio_id
     INNER JOIN personal p ON p.id = u.personal_id AND p.colegio_id = ar.colegio_id
     WHERE ${where.join(' AND ')}
     ORDER BY ar.fecha DESC, p.apellidos ASC, p.nombres ASC`,
    sqlParams
  );

  const filas = (rows || []).map((r) => {
    const { minutos_tardanza, descuento } = calcTardanza(r.hora_entrada_real, r.hora_marcacion);
    return {
      id: r.id,
      personal_id: r.personal_id,
      personal_nombre: nombrePersonal(r),
      fecha: r.fecha instanceof Date ? r.fecha.toISOString().slice(0, 10) : String(r.fecha).slice(0, 10),
      hora_entrada_real: r.hora_entrada_real,
      hora_entrada_real_fmt: formatHoraDisplay(r.hora_entrada_real),
      hora_marcacion: r.hora_marcacion,
      hora_marcacion_fmt: formatHoraDisplay(r.hora_marcacion),
      minutos_tardanza,
      descuento,
    };
  });

  const total_descuento = Math.round(filas.reduce((s, f) => s + (f.descuento || 0), 0) * 100) / 100;
  const total_minutos = filas.reduce((s, f) => s + (f.minutos_tardanza || 0), 0);

  return {
    colegio_nombre,
    anio,
    tarifa_por_minuto: DESCUENTO_POR_MINUTO,
    filas,
    total_descuento,
    total_minutos,
    total_registros: filas.length,
  };
}

function buildExportWorkbook(lista) {
  const wb = XLSX.utils.book_new();
  const data = [
    ['Personal', 'Fecha', 'Hora entrada real', 'Hora marcación', 'Min. tardanza', 'Descuento S/.'],
    ...(lista.filas || []).map((f) => [
      f.personal_nombre,
      f.fecha,
      f.hora_entrada_real_fmt,
      f.hora_marcacion_fmt,
      f.minutos_tardanza,
      f.descuento,
    ]),
    [],
    ['', '', '', '', 'TOTAL', lista.total_descuento],
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, 'Tardanzas');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = {
  DESCUENTO_POR_MINUTO,
  MESES_ES,
  parseHuelleroExcelBuffer,
  previewHuelleroImport,
  importarHuellero,
  listarTardanzas,
  loadPersonalColegio,
  getAnioActivo,
  buildExportWorkbook,
  nombrePersonal,
  calcTardanza,
  calcularTardanzasMesPersonal,
  formatHoraDisplay,
};
