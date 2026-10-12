/**
 * Importación Excel huellero y listado de tardanzas del personal.
 */
const XLSX = require('xlsx');
const { marcaCreadorExcel } = require('./identidadColegio');
const { sqlPersonalSinSuperadmin } = require('./superadminOculto');
const {
  cargarPermisos,
  resolverHoraEntrada,
  etiquetaPermiso,
  fechaISO: fechaPermisoISO,
} = require('./permisoEntradaPersonal');

/** @deprecated La tarifa real es por persona: sueldo / 30 / 8 / 60. Se deja en 0 para no reutilizar S/ 1. */
const DESCUENTO_POR_MINUTO = 0;
/** 30 días × 8 horas × 60 minutos. */
const MINUTOS_MES_LABORAL = 30 * 8 * 60;
const FORMULA_DESCUENTO_TARDANZA = 'sueldo / 30 / 8 / 60';

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

/** 00:00 = perfiles de ejemplo: no cuentan tardanza ni falta. */
function esHoraEntradaMedianoche(hora) {
  if (hora == null || hora === '') return false;
  return toMinutesFromMidnight(hora) === 0;
}

function personalCuentaControlAsistencia(p) {
  if (!p) return false;
  const horaConfig =
    p.hora_entrada_real != null && p.hora_entrada_real !== ''
      ? p.hora_entrada_real
      : p.hora_entrada;
  return !esHoraEntradaMedianoche(horaConfig);
}

function parseSueldoNumero(v) {
  if (v == null || v === '') return 0;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n;
}

function sueldoDe(p) {
  if (!p) return 0;
  return parseSueldoNumero(p.sueldo);
}

/** Valor de un minuto de trabajo. Sin sueldo → 0. */
function tarifaMinutoDesdeSueldo(sueldo) {
  const s = parseSueldoNumero(sueldo);
  if (s <= 0) return 0;
  return s / MINUTOS_MES_LABORAL;
}

function redondearSoles(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Tardanzas y descuento del mes calendario actual (o mes/año indicados)
 * según registros en asistencia_registros (incluye importación huellero).
 */
async function calcularTardanzasMesPersonal(
  query,
  { usuario_id, colegio_id, anio_activo, hora_entrada_config, mes, anio_calendario, sueldo: sueldoParam }
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
      tarifa_por_minuto: 0,
      formula_descuento: FORMULA_DESCUENTO_TARDANZA,
    };
  }

  const [dueno] = await query(
    'SELECT personal_id, tipo FROM usuarios WHERE id = ? AND colegio_id = ? LIMIT 1',
    [usuario_id, colegio_id]
  );
  const permisos = await cargarPermisos(query, colegio_id).catch(() => []);

  const registros = await query(
    `SELECT ar.fecha, ar.hora_entrada AS hora_marcacion, ar.hora_salida,
            p.nombres, p.apellidos, p.nro_documento, p.codigo_biometrico, p.sueldo, u.personal_id, u.tipo AS usuario_tipo
     FROM asistencia_registros ar
     INNER JOIN usuarios u ON u.id = ar.usuario_id AND u.colegio_id = ar.colegio_id
     INNER JOIN personal p ON p.id = u.personal_id AND p.colegio_id = ar.colegio_id
     WHERE ar.colegio_id = ?
       AND ar.anio = ?
       AND YEAR(ar.fecha) = ?
       AND MONTH(ar.fecha) = ?
       AND ar.hora_entrada IS NOT NULL
       AND (ar.tipo_registro = 'ENTRADA' OR ar.tipo_registro = 'ENTRADA_SALIDA')
       AND u.personal_id IN (
         SELECT u2.personal_id FROM usuarios u2
         WHERE u2.id = ? AND u2.colegio_id = ?
       )
     ORDER BY ar.fecha ASC`,
    [colegio_id, anio_activo, anioNum, mesNum, usuario_id, colegio_id]
  );

  const porIdentidad = fusionarFilasPorIdentidad(
    (registros || []).map((reg) => ({
      ...reg,
      fecha: fechaIsoFromValue(reg.fecha),
      hora_entrada: reg.hora_marcacion,
    }))
  );
  const sueldo = parseSueldoNumero(sueldoParam ?? registros?.[0]?.sueldo);
  const tarifa = tarifaMinutoDesdeSueldo(sueldo);
  let totalMinutos = 0;
  let totalDescuento = 0;
  porIdentidad.forEach((reg) => {
    const { minutos_tardanza, descuento } = evaluarMarcacion({
      horaPropia: hora_entrada_config,
      horaMarca: reg.hora_entrada || reg.hora_marcacion,
      sueldo: sueldoDe(reg) || sueldo,
      fecha: reg.fecha,
      personalId: reg.personal_id || dueno?.personal_id,
      tipoUsuario: reg.usuario_tipo || dueno?.tipo,
      permisos,
    });
    totalMinutos += minutos_tardanza;
    totalDescuento += descuento;
  });

  return {
    minutos_tardanza: totalMinutos,
    descuento: redondearSoles(totalDescuento),
    mes: mesNum,
    anio_calendario: anioNum,
    mes_nombre: mesNombre,
    registros: porIdentidad.length,
    hora_entrada_config: formatHoraDisplay(hora_entrada_config),
    tarifa_por_minuto: tarifa,
    formula_descuento: FORMULA_DESCUENTO_TARDANZA,
  };
}

function calcTardanza(horaEntradaConfig, horaMarcacion, sueldo) {
  if (esHoraEntradaMedianoche(horaEntradaConfig)) {
    return { minutos_tardanza: 0, descuento: 0, tarifa_por_minuto: 0 };
  }
  const cfg = toMinutesFromMidnight(horaEntradaConfig);
  const mar = toMinutesFromMidnight(horaMarcacion);
  const tarifa = tarifaMinutoDesdeSueldo(sueldo);
  if (cfg == null || mar == null) {
    return { minutos_tardanza: 0, descuento: 0, tarifa_por_minuto: tarifa };
  }
  const minutos = Math.max(0, mar - cfg);
  return {
    minutos_tardanza: minutos,
    descuento: redondearSoles(minutos * tarifa),
    tarifa_por_minuto: tarifa,
  };
}

function motivoTardanza({ minutos, horaUsadaFmt, horaPropiaFmt, permiso, aflojo }) {
  if (minutos > 0) {
    if (permiso && aflojo) {
      return `Tardanza: ${minutos} min después del permiso (hasta las ${horaUsadaFmt}).`;
    }
    return `Tardanza: ${minutos} min después de su hora de entrada (${horaPropiaFmt}).`;
  }
  if (permiso && aflojo) {
    return `${etiquetaPermiso(permiso)}. A tiempo. Su hora habitual es ${horaPropiaFmt}.`;
  }
  if (permiso) {
    return `A tiempo según su hora de entrada (${horaPropiaFmt}). El permiso de ese día no la adelanta.`;
  }
  return `A tiempo según su hora de entrada (${horaPropiaFmt}).`;
}

/** Tardanza de una marca, usando permiso del día si afloja la hora de la ficha. */
function evaluarMarcacion({ horaPropia, horaMarca, sueldo, fecha, personalId, tipoUsuario, permisos }) {
  if (esHoraEntradaMedianoche(horaPropia)) {
    return {
      minutos_tardanza: 0,
      descuento: 0,
      tarifa_por_minuto: 0,
      hora_usada: horaPropia,
      hora_usada_fmt: formatHoraDisplay(horaPropia),
      motivo: 'Esta ficha no controla tardanzas (hora de entrada 00:00).',
      permiso_etiqueta: '',
    };
  }
  const resuelto = resolverHoraEntrada({
    horaPropia,
    fecha,
    personalId,
    tipoUsuario,
    permisos: permisos || [],
  });
  const calc = calcTardanza(resuelto.horaUsada, horaMarca, sueldo);
  const horaUsadaFmt = formatHoraDisplay(resuelto.horaUsada);
  const horaPropiaFmt = formatHoraDisplay(horaPropia);
  return {
    ...calc,
    hora_usada: resuelto.horaUsada,
    hora_usada_fmt: horaUsadaFmt,
    motivo: motivoTardanza({
      minutos: calc.minutos_tardanza,
      horaUsadaFmt,
      horaPropiaFmt,
      permiso: resuelto.permiso,
      aflojo: resuelto.aflojo,
    }),
    permiso_etiqueta: resuelto.permiso ? etiquetaPermiso(resuelto.permiso) : '',
  };
}

/** Muestra HH:mm:ss (el descuento de tardanza sigue calculándose por minuto, sin segundos). */
function formatHoraDisplay(timeStr) {
  if (timeStr == null || timeStr === '') return '—';
  const parsed = parseHoraMarcacion(timeStr);
  if (parsed) return parsed;
  const raw = String(timeStr).trim();
  const m = raw.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return raw || '—';
  return `${String(m[1]).padStart(2, '0')}:${m[2]}:${(m[3] || '00').padStart(2, '0')}`;
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

function fechaIsoFromValue(fecha) {
  return fechaPermisoISO(fecha) || String(fecha || '').slice(0, 10);
}

function esDiaLaboral(fechaISO) {
  const day = new Date(`${fechaIsoFromValue(fechaISO)}T12:00:00`).getDay();
  return day !== 0 && day !== 6;
}

function mapPersonalAsistenciaMeta(p) {
  return {
    id: p.personal_id,
    nombre: nombrePersonal(p),
    cargo: p.cargo ? String(p.cargo).trim() : '',
    tipo: p.usuario_tipo || p.tipo || null,
  };
}

function idsIguales(a, b) {
  const dig = (v) => String(v ?? '').replace(/\D/g, '');
  const na = dig(a);
  const nb = dig(b);
  if (na && nb) {
    if (na === nb) return true;
    return na.replace(/^0+/, '') === nb.replace(/^0+/, '');
  }
  const sa = String(a ?? '').trim().toLowerCase();
  const sb = String(b ?? '').trim().toLowerCase();
  return !!(sa && sb && sa === sb);
}

function primerTokenNombre(s) {
  return tokens(s)[0] || '';
}

/**
 * Misma persona física aunque haya 2 fichas / 2 usuarios.
 * DNI, código biométrico, o mismo primer nombre + primer apellido.
 */
function mismaIdentidad(a, b) {
  if (!a || !b) return false;
  const ida = Number(a.personal_id ?? a.id ?? 0);
  const idb = Number(b.personal_id ?? b.id ?? 0);
  if (ida && idb && ida === idb) return true;

  const dniA = String(a.nro_documento || '').replace(/\D/g, '');
  const dniB = String(b.nro_documento || '').replace(/\D/g, '');
  if (dniA.length >= 8 && dniB.length >= 8 && idsIguales(dniA, dniB)) return true;

  const bioA = a.codigo_biometrico;
  const bioB = b.codigo_biometrico;
  if (bioA != null && String(bioA).trim() !== '' && bioB != null && String(bioB).trim() !== '') {
    if (idsIguales(bioA, bioB)) return true;
  }

  const nomA = primerTokenNombre(a.nombres);
  const nomB = primerTokenNombre(b.nombres);
  const apeA = primerTokenNombre(a.apellidos);
  const apeB = primerTokenNombre(b.apellidos);
  if (nomA && nomB && apeA && apeB && nomA === nomB && apeA === apeB) return true;

  if (a.nombres && a.apellidos && scorePersonalMatch(a.nombres, a.apellidos, b) >= 88) return true;
  if (b.nombres && b.apellidos && scorePersonalMatch(b.nombres, b.apellidos, a) >= 88) return true;
  return false;
}

function clusterPorIdentidadYFecha(rows) {
  const clusters = [];
  for (const r of rows || []) {
    const fecha = fechaIsoFromValue(r.fecha);
    const found = clusters.find((c) => c.fecha === fecha && mismaIdentidad(c.probe, r));
    if (found) found.rows.push(r);
    else clusters.push({ fecha, probe: r, rows: [r] });
  }
  return clusters;
}

function horaRegistro(r, campo) {
  const raw = r[campo];
  if (raw == null || raw === '') return null;
  return parseHoraMarcacion(raw) || String(raw).slice(0, 8);
}

function tiemposDeRegistro(r) {
  const times = [];
  const he = horaRegistro(r, 'hora_entrada') || horaRegistro(r, 'hora_marcacion');
  const hs = horaRegistro(r, 'hora_salida');
  const em = toMinutesFromMidnight(he);
  const sm = toMinutesFromMidnight(hs);
  if (em != null) times.push({ min: em, hora: he });
  if (sm != null) times.push({ min: sm, hora: hs });
  return times;
}

function colapsarTiemposMarcacion(rows) {
  const times = [];
  for (const r of rows || []) times.push(...tiemposDeRegistro(r));
  times.sort((a, b) => a.min - b.min);
  if (!times.length) return { horaEntrada: null, horaSalida: null };
  const horaEntrada = times[0].hora;
  const last = times[times.length - 1];
  const horaSalida = last.min > times[0].min ? last.hora : null;
  return { horaEntrada, horaSalida };
}

function elegirKeeperCluster(rows) {
  let keep = rows[0];
  let keepMin = toMinutesFromMidnight(horaRegistro(keep, 'hora_entrada') || horaRegistro(keep, 'hora_marcacion'));
  for (const r of rows) {
    const m = toMinutesFromMidnight(horaRegistro(r, 'hora_entrada') || horaRegistro(r, 'hora_marcacion'));
    if (m != null && (keepMin == null || m < keepMin || (m === keepMin && Number(r.id) < Number(keep.id)))) {
      keep = r;
      keepMin = m;
    }
  }
  return keep;
}

function colapsarFilasMarcacion(rows, permisos) {
  if (!rows || rows.length <= 1) {
    const unica = rows?.[0] || null;
    if (!unica || !permisos) return unica;
    const ev = evaluarMarcacion({
      horaPropia: unica.hora_entrada_real,
      horaMarca: unica.hora_marcacion || unica.hora_entrada,
      sueldo: sueldoDe(unica),
      fecha: unica.fecha,
      personalId: unica.personal_id,
      tipoUsuario: unica.usuario_tipo,
      permisos,
    });
    return { ...unica, ...camposPermiso(ev) };
  }
  const keep = elegirKeeperCluster(rows);
  const { horaEntrada, horaSalida } = colapsarTiemposMarcacion(rows);
  const ev = evaluarMarcacion({
    horaPropia: keep.hora_entrada_real,
    horaMarca: horaEntrada,
    sueldo: sueldoDe(keep),
    fecha: keep.fecha,
    personalId: keep.personal_id,
    tipoUsuario: keep.usuario_tipo,
    permisos,
  });
  return {
    ...keep,
    hora_marcacion: horaEntrada,
    hora_marcacion_fmt: formatHoraDisplay(horaEntrada),
    hora_entrada: horaEntrada,
    hora_salida: horaSalida,
    hora_salida_fmt: horaSalida ? formatHoraDisplay(horaSalida) : '—',
    ...camposPermiso(ev),
  };
}

function camposPermiso(ev) {
  return {
    minutos_tardanza: ev.minutos_tardanza,
    descuento: ev.descuento,
    tarifa_por_minuto: ev.tarifa_por_minuto,
    hora_usada_fmt: ev.hora_usada_fmt,
    motivo: ev.motivo,
    permiso_etiqueta: ev.permiso_etiqueta,
  };
}

function fusionarFilasPorIdentidad(filas, permisos) {
  return clusterPorIdentidadYFecha(filas).map((c) => colapsarFilasMarcacion(c.rows, permisos));
}

async function loadRegistrosDiaColegio(query, colegioId, anio, fecha) {
  const sql = (extra) =>
    `SELECT ar.id, ar.usuario_id, ar.hora_entrada, ar.hora_salida, ar.tipo_registro, ar.fecha,
            u.personal_id, p.nombres, p.apellidos, p.nro_documento, ${extra}
            p.hora_entrada AS hora_entrada_real
     FROM asistencia_registros ar
     INNER JOIN usuarios u ON u.id = ar.usuario_id AND u.colegio_id = ar.colegio_id
     INNER JOIN personal p ON p.id = u.personal_id AND p.colegio_id = ar.colegio_id
     WHERE ar.colegio_id = ? AND ar.anio = ? AND DATE(ar.fecha) = ?
       AND ar.hora_entrada IS NOT NULL
       AND u.personal_id > 0
       AND (ar.tipo_registro = 'ENTRADA' OR ar.tipo_registro = 'ENTRADA_SALIDA')
     ORDER BY ar.id ASC`;
  try {
    return await query(sql('p.codigo_biometrico,'), [colegioId, anio, fecha]);
  } catch (e) {
    if (String(e.message || '').includes('codigo_biometrico')) {
      const rows = await query(sql(''), [colegioId, anio, fecha]);
      return (rows || []).map((r) => ({ ...r, codigo_biometrico: null }));
    }
    throw e;
  }
}

async function persistirClusterMarcacion(execute, rows, auditUserId) {
  if (!rows || !rows.length) return null;
  if (rows.length === 1) return rows[0];
  const keep = elegirKeeperCluster(rows);
  const { horaEntrada, horaSalida } = colapsarTiemposMarcacion(rows);
  const tipo = horaSalida ? 'ENTRADA_SALIDA' : 'ENTRADA';
  await execute(
    `UPDATE asistencia_registros
     SET hora_entrada = ?, hora_salida = ?, tipo_registro = ?,
         actualizado_por = ?, fecha_actualizacion = NOW()
     WHERE id = ?`,
    [horaEntrada, horaSalida, tipo, auditUserId ?? null, keep.id]
  );
  const dupIds = rows.filter((r) => Number(r.id) !== Number(keep.id)).map((r) => r.id);
  if (dupIds.length) {
    await execute(
      `DELETE FROM asistencia_registros WHERE id IN (${dupIds.map(() => '?').join(',')})`,
      dupIds
    );
  }
  return { ...keep, hora_entrada: horaEntrada, hora_salida: horaSalida, tipo_registro: tipo };
}

/**
 * Junta filas del mismo día que son la misma persona (2 fichas / 2 usuarios).
 * Si personalProbe está definido, solo esa identidad.
 */
async function fusionarRegistrosEquivalentesDia(
  query,
  execute,
  { colegioId, anio, fecha, personalProbe = null, auditUserId = null }
) {
  const rows = await loadRegistrosDiaColegio(query, colegioId, anio, fecha);
  const pool = personalProbe ? rows.filter((r) => mismaIdentidad(personalProbe, r)) : rows;
  if (!pool.length) return null;

  const clusters = clusterPorIdentidadYFecha(pool);
  let keeper = null;
  for (const c of clusters) {
    const merged = await persistirClusterMarcacion(execute, c.rows, auditUserId);
    if (personalProbe && merged && mismaIdentidad(personalProbe, merged)) keeper = merged;
    else if (!personalProbe) keeper = merged;
  }
  return keeper;
}

function elegirPersonalCanonico(candidatos, rowsDia = []) {
  const conUsuario = (candidatos || []).filter((p) => p.usuario_id);
  const lista = conUsuario.length ? conUsuario : candidatos || [];
  if (!lista.length) return null;
  if (rowsDia.length) {
    const conMarca = lista.filter((p) =>
      rowsDia.some((r) => Number(r.personal_id) === Number(p.personal_id) || mismaIdentidad(p, r))
    );
    if (conMarca.length) {
      const byEarliest = conMarca.slice().sort((a, b) => {
        const ra = rowsDia.filter((r) => mismaIdentidad(a, r));
        const rb = rowsDia.filter((r) => mismaIdentidad(b, r));
        const ma = Math.min(
          ...ra.map((r) => toMinutesFromMidnight(horaRegistro(r, 'hora_entrada'))).filter((n) => n != null)
        );
        const mb = Math.min(
          ...rb.map((r) => toMinutesFromMidnight(horaRegistro(r, 'hora_entrada'))).filter((n) => n != null)
        );
        if (Number.isFinite(ma) && Number.isFinite(mb) && ma !== mb) return ma - mb;
        return Number(a.personal_id) - Number(b.personal_id);
      });
      return byEarliest[0];
    }
  }
  return lista.slice().sort((a, b) => Number(a.personal_id) - Number(b.personal_id))[0];
}

async function resolverPersonalCanonico(query, { colegioId, anio, fecha, personal, personalList }) {
  if (!personal) return personal;
  const equivalentes = (personalList || []).filter((p) => mismaIdentidad(personal, p));
  if (equivalentes.length <= 1) {
    const conUser = equivalentes.find((p) => p.usuario_id) || personal;
    return conUser.usuario_id ? conUser : personal;
  }
  let rowsDia = [];
  if (fecha && anio) {
    rowsDia = await loadRegistrosDiaColegio(query, colegioId, anio, fecha);
  }
  return elegirPersonalCanonico(equivalentes, rowsDia) || personal;
}

/** Un registro por personal_id (usuario ACTIVO de id más bajo). */
function dedupePersonalList(personalList) {
  const byId = new Map();
  for (const p of personalList || []) {
    const id = p.personal_id ?? p.id;
    if (!id) continue;
    const prev = byId.get(id);
    const takeNew =
      !prev ||
      (!prev.usuario_id && p.usuario_id) ||
      (prev.usuario_id && p.usuario_id && Number(p.usuario_id) < Number(prev.usuario_id));
    if (takeNew) byId.set(id, p);
  }
  return Array.from(byId.values()).sort((a, b) => {
    const ap = String(a.apellidos || '').localeCompare(String(b.apellidos || ''), 'es');
    if (ap !== 0) return ap;
    return String(a.nombres || '').localeCompare(String(b.nombres || ''), 'es');
  });
}

const SQL_USUARIO_ACTIVO_CANONICO = `LEFT JOIN usuarios u ON u.id = (
  SELECT u2.id FROM usuarios u2
  WHERE u2.personal_id = p.id AND u2.colegio_id = p.colegio_id AND u2.estado = 'ACTIVO'
  ORDER BY u2.id ASC
  LIMIT 1
)`;

/**
 * Suma tardanzas sin doble conteo (misma persona física + mismo día).
 * Por defecto excluye sábados y domingos, igual que el reporte Asistencia del Personal.
 */
function sumarTardanzasDesdeRegistros(rows, { soloDiasLaborables = true, permisos } = {}) {
  const filtradas = (rows || []).filter((r) => {
    const fecha = fechaIsoFromValue(r.fecha);
    if (soloDiasLaborables && !esDiaLaboral(fecha)) return false;
    if (!personalCuentaControlAsistencia(r)) return false;
    return !!(r.personal_id || r.nombres || r.apellidos);
  });
  const clusters = clusterPorIdentidadYFecha(filtradas);
  let totalMinutos = 0;
  let totalDescuento = 0;
  for (const c of clusters) {
    const { horaEntrada } = colapsarTiemposMarcacion(c.rows);
    const base = c.rows.find((r) => r.hora_entrada_real) || c.probe;
    const horaReal = base?.hora_entrada_real;
    const sueldo = sueldoDe(c.rows.find((r) => r.sueldo != null) || c.probe);
    const { minutos_tardanza, descuento } = evaluarMarcacion({
      horaPropia: horaReal,
      horaMarca: horaEntrada,
      sueldo,
      fecha: base?.fecha || c.probe?.fecha,
      personalId: base?.personal_id || c.probe?.personal_id,
      tipoUsuario: base?.usuario_tipo || c.probe?.usuario_tipo,
      permisos,
    });
    totalMinutos += minutos_tardanza;
    totalDescuento += descuento;
  }
  return {
    totalMinutos,
    totalDescuento: redondearSoles(totalDescuento),
    registrosUnicos: clusters.length,
  };
}

async function loadPersonalColegio(query, colegioId) {
  const sql = (extraCols) =>
    `SELECT p.id AS personal_id, p.nombres, p.apellidos, p.hora_entrada, p.cargo,
            ${extraCols}
            u.id AS usuario_id, u.tipo AS usuario_tipo
     FROM personal p
     ${SQL_USUARIO_ACTIVO_CANONICO}
     WHERE p.colegio_id = ?
       AND ${sqlPersonalSinSuperadmin('p')}
     ORDER BY p.apellidos ASC, p.nombres ASC`;
  const run = async (extraCols, mapRow) => {
    const rows = await query(sql(extraCols), [colegioId]);
    const mapped = (rows || []).map(mapRow || ((r) => r));
    return dedupePersonalList(mapped);
  };
  try {
    return await run('p.nro_documento, p.codigo_biometrico, p.sueldo,');
  } catch (e) {
    const msg = String(e.message || '');
    if (msg.includes('sueldo')) {
      try {
        const list = await run('p.nro_documento, p.codigo_biometrico,');
        return list.map((r) => ({ ...r, sueldo: null }));
      } catch (e2) {
        if (String(e2.message || '').includes('codigo_biometrico')) {
          const list = await run('p.nro_documento,');
          return list.map((r) => ({ ...r, codigo_biometrico: null, sueldo: null }));
        }
        throw e2;
      }
    }
    if (msg.includes('codigo_biometrico')) {
      try {
        return await run('p.nro_documento, p.sueldo,');
      } catch (e2) {
        if (String(e2.message || '').includes('sueldo')) {
          const list = await run('p.nro_documento,');
          return list.map((r) => ({ ...r, codigo_biometrico: null, sueldo: null }));
        }
        throw e2;
      }
    }
    throw e;
  }
}

async function personalIdsEquivalentes(query, colegioId, personalId) {
  const pid = parseInt(personalId, 10);
  if (!Number.isFinite(pid)) return [];
  const list = await loadPersonalColegio(query, colegioId);
  const probe = list.find((p) => Number(p.personal_id) === pid);
  if (!probe) return [pid];
  const ids = list.filter((p) => mismaIdentidad(probe, p)).map((p) => p.personal_id);
  return ids.length ? ids : [pid];
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
    `SELECT id, hora_entrada, hora_salida
     FROM asistencia_registros
     WHERE usuario_id = ? AND colegio_id = ? AND DATE(fecha) = ? AND anio = ?
     ORDER BY id DESC`,
    [usuarioId, colegioId, fecha, anio]
  );
}

async function findRegistrosMarcacionIdentidad(query, { usuarioId, personal, colegioId, fecha, anio }) {
  const rows = await loadRegistrosDiaColegio(query, colegioId, anio, fecha);
  const probe = personal || { usuario_id: usuarioId };
  const hit = rows.filter((r) => {
    if (personal && mismaIdentidad(probe, r)) return true;
    if (usuarioId && Number(r.usuario_id) === Number(usuarioId)) return true;
    if (personal?.personal_id && Number(r.personal_id) === Number(personal.personal_id)) return true;
    return false;
  });
  hit.sort((a, b) => Number(b.id) - Number(a.id));
  return hit;
}

/** Inserta o actualiza solo la entrada del día (import Excel / tardanzas). */
async function upsertMarcacionDia(
  execute,
  query,
  { usuarioId, colegioId, anio, fecha, horaMarcacion, auditUserId, personal }
) {
  const existing = await findRegistrosMarcacionIdentidad(query, {
    usuarioId,
    personal,
    colegioId,
    fecha,
    anio,
  });

  if (existing.length > 0) {
    const keep = elegirKeeperCluster(existing);
    await execute(
      `UPDATE asistencia_registros
       SET hora_entrada = ?, tipo_registro = IF(hora_salida IS NULL, 'ENTRADA', 'ENTRADA_SALIDA'),
           actualizado_por = ?, fecha_actualizacion = NOW()
       WHERE id = ?`,
      [horaMarcacion, auditUserId, keep.id]
    );
    const dupIds = existing.filter((r) => Number(r.id) !== Number(keep.id)).map((r) => r.id);
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

/**
 * Biométrico: 1ª marcación del día = entrada (se conserva la más temprana);
 * marcaciones posteriores = salida (siempre la más tardía).
 * Une fichas/usuarios duplicados de la misma persona.
 * @returns {'insertado'|'actualizado_entrada'|'actualizado_salida'|'ya_procesado'|'kept_between'}
 */
async function upsertMarcacionEntradaSalida(
  execute,
  query,
  { usuarioId, colegioId, anio, fecha, horaMarcacion, auditUserId, personal }
) {
  const nuevaHora = parseHoraMarcacion(horaMarcacion) || String(horaMarcacion || '').slice(0, 8);
  const nuevaMin = toMinutesFromMidnight(nuevaHora);
  if (!nuevaHora || nuevaMin == null) {
    const err = new Error('Hora de marcación inválida');
    err.status = 400;
    throw err;
  }

  const probe = personal ? { ...personal, usuario_id: usuarioId } : { usuario_id: usuarioId };
  await fusionarRegistrosEquivalentesDia(query, execute, {
    colegioId,
    anio,
    fecha,
    personalProbe: personal ? probe : null,
    auditUserId,
  });

  const existing = await findRegistrosMarcacionIdentidad(query, {
    usuarioId,
    personal: probe,
    colegioId,
    fecha,
    anio,
  });

  if (!existing.length) {
    await execute(
      `INSERT INTO asistencia_registros
       (usuario_id, colegio_id, anio, fecha, tipo_registro, hora_entrada, creado_por, fecha_creacion)
       VALUES (?, ?, ?, ?, 'ENTRADA', ?, ?, NOW())`,
      [usuarioId, colegioId, anio, fecha, nuevaHora, auditUserId]
    );
    return 'insertado';
  }

  const keep = elegirKeeperCluster(existing);
  const keepId = keep.id;
  const dupIds = existing.filter((r) => Number(r.id) !== Number(keepId)).map((r) => r.id);
  if (dupIds.length) {
    await execute(
      `DELETE FROM asistencia_registros WHERE id IN (${dupIds.map(() => '?').join(',')})`,
      dupIds
    );
  }

  const entradaHora = horaRegistro(keep, 'hora_entrada');
  const salidaHora = horaRegistro(keep, 'hora_salida');
  const entradaMin = toMinutesFromMidnight(entradaHora);
  const salidaMin = toMinutesFromMidnight(salidaHora);

  if (entradaMin != null && nuevaMin === entradaMin) return 'ya_procesado';
  if (salidaMin != null && nuevaMin === salidaMin) return 'ya_procesado';

  // Más temprana → nueva entrada; la anterior entrada pasa a candidata de salida
  if (entradaMin != null && nuevaMin < entradaMin) {
    let nuevaSalida = entradaHora;
    let nuevaSalidaMin = entradaMin;
    if (salidaMin != null && salidaMin > nuevaSalidaMin) {
      nuevaSalida = salidaHora;
      nuevaSalidaMin = salidaMin;
    }
    await execute(
      `UPDATE asistencia_registros
       SET hora_entrada = ?, hora_salida = ?, tipo_registro = 'ENTRADA_SALIDA',
           usuario_id = ?, actualizado_por = ?, fecha_actualizacion = NOW()
       WHERE id = ?`,
      [nuevaHora, nuevaSalida, usuarioId, auditUserId, keepId]
    );
    return 'actualizado_entrada';
  }

  // Más tardía que la salida actual (o primera salida) → actualizar salida
  if (salidaMin == null || nuevaMin > salidaMin) {
    await execute(
      `UPDATE asistencia_registros
       SET hora_salida = ?, tipo_registro = 'ENTRADA_SALIDA',
           actualizado_por = ?, fecha_actualizacion = NOW()
       WHERE id = ?`,
      [nuevaHora, auditUserId, keepId]
    );
    return 'actualizado_salida';
  }

  // Entre entrada y salida ya registrada: no mueve nada
  return 'kept_between';
}

function enrichFilaMarcacion(row, personal, permisos) {
  const horaEntradaReal = personal?.hora_entrada || null;
  const ev = evaluarMarcacion({
    horaPropia: horaEntradaReal,
    horaMarca: row.hora_marcacion,
    sueldo: sueldoDe(personal),
    fecha: row.fecha,
    personalId: personal?.personal_id,
    tipoUsuario: personal?.usuario_tipo,
    permisos,
  });
  return {
    personal_id: personal?.personal_id || null,
    usuario_id: personal?.usuario_id || null,
    usuario_tipo: personal?.usuario_tipo || null,
    personal_nombre: personal ? nombrePersonal(personal) : `${row.last_name}, ${row.first_name}`,
    fecha: row.fecha,
    hora_entrada_real: horaEntradaReal,
    hora_entrada_real_fmt: formatHoraDisplay(horaEntradaReal),
    hora_marcacion: row.hora_marcacion,
    hora_marcacion_fmt: formatHoraDisplay(row.hora_marcacion),
    ...camposPermiso(ev),
    sueldo: sueldoDe(personal) || null,
    excel_first_name: row.first_name,
    excel_last_name: row.last_name,
    department: row.department || null,
  };
}

async function previewHuelleroImport(query, colegioId, buffer) {
  const parsed = parseHuelleroExcelBuffer(buffer);
  const personalList = (await loadPersonalColegio(query, colegioId)).filter(
    personalCuentaControlAsistencia
  );
  const { anio } = await getAnioActivo(query, colegioId);
  const permisos = await cargarPermisos(query, colegioId).catch(() => []);

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
    coincidencias.push(enrichFilaMarcacion(row, match, permisos));
  }

  let nuevos = 0;
  let actualizados = 0;
  for (const c of coincidencias) {
    const existing = await findRegistrosMarcacionIdentidad(query, {
      usuarioId: c.usuario_id,
      personal: c,
      colegioId,
      fecha: c.fecha,
      anio,
    });
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
      tarifa_por_minuto: null,
      formula_descuento: FORMULA_DESCUENTO_TARDANZA,
    },
    coincidencias: coincidencias.slice(0, 200),
    sin_coincidencia: sinCoincidencia.slice(0, 100),
    sin_usuario: sinUsuario.slice(0, 50),
  };
}

async function importarHuellero(query, execute, colegioId, adminUsuarioId, buffer) {
  const auditUserId = adminUsuarioId ?? null;
  const parsed = parseHuelleroExcelBuffer(buffer);
  const personalList = (await loadPersonalColegio(query, colegioId)).filter(
    personalCuentaControlAsistencia
  );
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
        personal: match,
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

function mapRowToFilaTardanza(r, permisos) {
  const horaMarcacion = r.hora_marcacion ?? r.hora_entrada;
  const sueldo = sueldoDe(r);
  const ev = evaluarMarcacion({
    horaPropia: r.hora_entrada_real,
    horaMarca: horaMarcacion,
    sueldo,
    fecha: r.fecha,
    personalId: r.personal_id,
    tipoUsuario: r.usuario_tipo,
    permisos,
  });
  const horaSalida = r.hora_salida
    ? parseHoraMarcacion(r.hora_salida) || String(r.hora_salida).slice(0, 8)
    : null;
  return {
    id: r.id,
    personal_id: r.personal_id,
    usuario_id: r.usuario_id || null,
    nombres: r.nombres,
    apellidos: r.apellidos,
    nro_documento: r.nro_documento || null,
    codigo_biometrico: r.codigo_biometrico || null,
    usuario_tipo: r.usuario_tipo || null,
    personal_nombre: nombrePersonal(r),
    fecha: fechaIsoFromValue(r.fecha),
    hora_entrada_real: r.hora_entrada_real,
    hora_entrada_real_fmt: formatHoraDisplay(r.hora_entrada_real),
    hora_marcacion: horaMarcacion,
    hora_marcacion_fmt: formatHoraDisplay(horaMarcacion),
    hora_salida: horaSalida,
    hora_salida_fmt: horaSalida ? formatHoraDisplay(horaSalida) : '—',
    ...camposPermiso(ev),
    sueldo: sueldo || null,
  };
}

async function filaTardanzaConPermiso(query, colegioId, row) {
  const permisos = await cargarPermisos(query, colegioId).catch(() => []);
  return mapRowToFilaTardanza(row, permisos);
}

async function getRegistroTardanzaPersonal(query, registroId, colegioId) {
  const [row] = await query(
    `SELECT ar.id, ar.fecha, ar.hora_entrada, ar.hora_salida, ar.hora_entrada AS hora_marcacion,
            p.id AS personal_id, p.nombres, p.apellidos, p.hora_entrada AS hora_entrada_real, p.sueldo,
            u.tipo AS usuario_tipo
     FROM asistencia_registros ar
     INNER JOIN usuarios u ON u.id = ar.usuario_id AND u.colegio_id = ar.colegio_id
     INNER JOIN personal p ON p.id = u.personal_id AND p.colegio_id = ar.colegio_id
     WHERE ar.id = ? AND ar.colegio_id = ?
       AND ar.hora_entrada IS NOT NULL
       AND u.personal_id > 0
       AND (ar.tipo_registro = 'ENTRADA' OR ar.tipo_registro = 'ENTRADA_SALIDA')
     LIMIT 1`,
    [registroId, colegioId]
  );
  return row || null;
}

async function actualizarHoraRegistro(query, execute, colegioId, registroId, horaInput, auditUserId) {
  const hora = parseHoraMarcacion(horaInput);
  if (!hora) {
    const err = new Error('Hora inválida. Use formato HH:MM.');
    err.status = 400;
    throw err;
  }

  const reg = await getRegistroTardanzaPersonal(query, registroId, colegioId);
  if (!reg) {
    const err = new Error('Registro no encontrado.');
    err.status = 404;
    throw err;
  }

  await execute(
    `UPDATE asistencia_registros
     SET hora_entrada = ?, actualizado_por = ?, fecha_actualizacion = NOW()
     WHERE id = ? AND colegio_id = ?`,
    [hora, auditUserId ?? null, registroId, colegioId]
  );

  const updated = await getRegistroTardanzaPersonal(query, registroId, colegioId);
  return await filaTardanzaConPermiso(query, colegioId, updated);
}

/**
 * Edita entrada y/o salida de un registro de asistencia del personal.
 * horaSalida: string HH:MM | ''/null para borrar salida | undefined para no tocar.
 */
async function actualizarEntradaSalidaRegistro(
  query,
  execute,
  colegioId,
  registroId,
  { horaEntrada, horaSalida } = {},
  auditUserId
) {
  const reg = await getRegistroTardanzaPersonal(query, registroId, colegioId);
  if (!reg) {
    const err = new Error('Registro no encontrado.');
    err.status = 404;
    throw err;
  }

  let he =
    horaEntrada != null && String(horaEntrada).trim() !== ''
      ? parseHoraMarcacion(horaEntrada)
      : parseHoraMarcacion(reg.hora_entrada) || String(reg.hora_entrada || '').slice(0, 8);
  if (!he) {
    const err = new Error('Hora de entrada inválida. Use formato HH:MM.');
    err.status = 400;
    throw err;
  }

  let hs;
  if (horaSalida === undefined) {
    hs = reg.hora_salida
      ? parseHoraMarcacion(reg.hora_salida) || String(reg.hora_salida || '').slice(0, 8)
      : null;
  } else if (horaSalida === null || String(horaSalida).trim() === '') {
    hs = null;
  } else {
    hs = parseHoraMarcacion(horaSalida);
    if (!hs) {
      const err = new Error('Hora de salida inválida. Use formato HH:MM.');
      err.status = 400;
      throw err;
    }
  }

  const entradaMin = toMinutesFromMidnight(he);
  const salidaMin = toMinutesFromMidnight(hs);
  if (entradaMin != null && salidaMin != null && salidaMin < entradaMin) {
    const err = new Error('La hora de salida no puede ser anterior a la de entrada.');
    err.status = 400;
    throw err;
  }

  const tipo = hs ? 'ENTRADA_SALIDA' : 'ENTRADA';
  await execute(
    `UPDATE asistencia_registros
     SET hora_entrada = ?, hora_salida = ?, tipo_registro = ?,
         actualizado_por = ?, fecha_actualizacion = NOW()
     WHERE id = ? AND colegio_id = ?`,
    [he, hs, tipo, auditUserId ?? null, registroId, colegioId]
  );

  const updated = await getRegistroTardanzaPersonal(query, registroId, colegioId);
  const fila = await filaTardanzaConPermiso(query, colegioId, updated);
  fila.hora_salida = updated?.hora_salida
    ? parseHoraMarcacion(updated.hora_salida) || String(updated.hora_salida).slice(0, 8)
    : null;
  fila.hora_salida_fmt = formatHoraDisplay(fila.hora_salida);
  return fila;
}

async function eliminarRegistroTardanza(query, execute, colegioId, registroId) {
  const reg = await getRegistroTardanzaPersonal(query, registroId, colegioId);
  if (!reg) {
    const err = new Error('Registro no encontrado.');
    err.status = 404;
    throw err;
  }

  await execute(
    `DELETE FROM asistencia_registros WHERE id = ? AND colegio_id = ?`,
    [registroId, colegioId]
  );

  return { ok: true, id: registroId };
}

/**
 * Alta manual (olvido de marcación): personal + fecha + hora entrada (+ salida opcional).
 * Si ya existe registro ese día, lo actualiza (mismo criterio que editar).
 */
async function crearRegistroManual(
  query,
  execute,
  colegioId,
  { personalId, fecha, horaEntrada, horaSalida },
  auditUserId
) {
  const pid = parseInt(personalId, 10);
  if (!Number.isFinite(pid)) {
    const err = new Error('Seleccione el personal.');
    err.status = 400;
    throw err;
  }

  const fechaIso = fechaIsoFromValue(fecha);
  if (!fechaIso || !/^\d{4}-\d{2}-\d{2}$/.test(fechaIso)) {
    const err = new Error('Indique una fecha válida (AAAA-MM-DD).');
    err.status = 400;
    throw err;
  }

  const he = parseHoraMarcacion(horaEntrada);
  if (!he) {
    const err = new Error('Indique la hora de entrada (HH:MM).');
    err.status = 400;
    throw err;
  }

  let hs = null;
  if (horaSalida != null && String(horaSalida).trim() !== '') {
    hs = parseHoraMarcacion(horaSalida);
    if (!hs) {
      const err = new Error('Hora de salida inválida (use HH:MM).');
      err.status = 400;
      throw err;
    }
  }

  const entradaMin = toMinutesFromMidnight(he);
  const salidaMin = toMinutesFromMidnight(hs);
  if (entradaMin != null && salidaMin != null && salidaMin < entradaMin) {
    const err = new Error('La hora de salida no puede ser anterior a la de entrada.');
    err.status = 400;
    throw err;
  }

  const personalList = await loadPersonalColegio(query, colegioId);
  const personal = personalList.find((p) => Number(p.personal_id) === pid);
  if (!personal) {
    const err = new Error('Personal no encontrado en el colegio.');
    err.status = 404;
    throw err;
  }
  if (!personalCuentaControlAsistencia(personal)) {
    const err = new Error(
      'Ese personal tiene hora de ingreso 00:00 y no se controla en tardanzas ni faltas (perfil de ejemplo).'
    );
    err.status = 400;
    throw err;
  }
  if (!personal.usuario_id) {
    const err = new Error(
      'Ese personal no tiene usuario activo en la intranet. Cree el usuario antes de registrar asistencia.'
    );
    err.status = 400;
    throw err;
  }

  const { anio } = await getAnioActivo(query, colegioId);
  await fusionarRegistrosEquivalentesDia(query, execute, {
    colegioId,
    anio,
    fecha: fechaIso,
    personalProbe: personal,
    auditUserId,
  });
  const existing = await findRegistrosMarcacionIdentidad(query, {
    usuarioId: personal.usuario_id,
    personal,
    colegioId,
    fecha: fechaIso,
    anio,
  });
  const tipo = hs ? 'ENTRADA_SALIDA' : 'ENTRADA';
  let accion = 'insertado';
  let registroId;

  if (existing.length > 0) {
    const keep = elegirKeeperCluster(existing);
    registroId = keep.id;
    const dupIds = existing.filter((r) => Number(r.id) !== Number(keep.id)).map((r) => r.id);
    if (dupIds.length) {
      await execute(
        `DELETE FROM asistencia_registros WHERE id IN (${dupIds.map(() => '?').join(',')})`,
        dupIds
      );
    }
    await execute(
      `UPDATE asistencia_registros
       SET hora_entrada = ?, hora_salida = ?, tipo_registro = ?,
           actualizado_por = ?, fecha_actualizacion = NOW()
       WHERE id = ? AND colegio_id = ?`,
      [he, hs, tipo, auditUserId ?? null, registroId, colegioId]
    );
    accion = 'actualizado';
  } else {
    const ins = await execute(
      `INSERT INTO asistencia_registros
       (usuario_id, colegio_id, anio, fecha, tipo_registro, hora_entrada, hora_salida, creado_por, fecha_creacion)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [personal.usuario_id, colegioId, anio, fechaIso, tipo, he, hs, auditUserId ?? null]
    );
    registroId = ins.insertId;
  }

  const updated = await getRegistroTardanzaPersonal(query, registroId, colegioId);
  const fila = await filaTardanzaConPermiso(query, colegioId, updated);
  fila.hora_salida = updated?.hora_salida
    ? parseHoraMarcacion(updated.hora_salida) || String(updated.hora_salida).slice(0, 8)
    : null;
  fila.hora_salida_fmt = formatHoraDisplay(fila.hora_salida);
  return { accion, fila };
}

async function listarTardanzas(query, colegioId, params = {}, execute = null) {
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
    const ids = await personalIdsEquivalentes(query, colegioId, personalId);
    where.push(`p.id IN (${ids.map(() => '?').join(',')})`);
    sqlParams.push(...ids);
  }
  if (desde) {
    where.push('ar.fecha >= ?');
    sqlParams.push(desde);
  }
  if (hasta) {
    where.push('ar.fecha <= ?');
    sqlParams.push(hasta);
  }

  let rows = await query(
    `SELECT ar.id, ar.fecha, ar.hora_entrada AS hora_marcacion, ar.hora_salida,
            p.id AS personal_id, p.nombres, p.apellidos, p.nro_documento, p.codigo_biometrico,
            p.hora_entrada AS hora_entrada_real, p.sueldo, u.id AS usuario_id, u.tipo AS usuario_tipo
     FROM asistencia_registros ar
     INNER JOIN usuarios u ON u.id = ar.usuario_id AND u.colegio_id = ar.colegio_id
     INNER JOIN personal p ON p.id = u.personal_id AND p.colegio_id = ar.colegio_id
     WHERE ${where.join(' AND ')}
     ORDER BY ar.fecha DESC, p.apellidos ASC, p.nombres ASC`,
    sqlParams
  );

  if (execute) {
    const fechas = [...new Set((rows || []).map((r) => fechaIsoFromValue(r.fecha)))];
    for (const fecha of fechas) {
      await fusionarRegistrosEquivalentesDia(query, execute, { colegioId, anio, fecha });
    }
    rows = await query(
      `SELECT ar.id, ar.fecha, ar.hora_entrada AS hora_marcacion, ar.hora_salida,
              p.id AS personal_id, p.nombres, p.apellidos, p.nro_documento, p.codigo_biometrico,
              p.hora_entrada AS hora_entrada_real, p.sueldo, u.id AS usuario_id, u.tipo AS usuario_tipo
       FROM asistencia_registros ar
       INNER JOIN usuarios u ON u.id = ar.usuario_id AND u.colegio_id = ar.colegio_id
       INNER JOIN personal p ON p.id = u.personal_id AND p.colegio_id = ar.colegio_id
       WHERE ${where.join(' AND ')}
       ORDER BY ar.fecha DESC, p.apellidos ASC, p.nombres ASC`,
      sqlParams
    );
  }

  const permisos = await cargarPermisos(query, colegioId).catch(() => []);
  const filasRaw = (rows || []).map((r) => mapRowToFilaTardanza(r, permisos));
  const filas = fusionarFilasPorIdentidad(filasRaw, permisos).filter(personalCuentaControlAsistencia);

  const total_descuento = Math.round(filas.reduce((s, f) => s + (f.descuento || 0), 0) * 100) / 100;
  const total_minutos = filas.reduce((s, f) => s + (f.minutos_tardanza || 0), 0);

  return {
    colegio_nombre,
    anio,
    tarifa_por_minuto: null,
    formula_descuento: FORMULA_DESCUENTO_TARDANZA,
    filas,
    total_descuento,
    total_minutos,
    total_registros: filas.length,
  };
}

/**
 * Días con al menos una marcación en el rango: personal (excepto hora de ingreso 00:00) sin entrada ese día.
 * GET /api/admin/tardanzas/faltas?personal_id=&desde=&hasta=
 */
async function listarFaltasPersonalComun(query, colegioId, params = {}) {
  const { fechaMySQLLima } = require('./fechaHoraLima');
  const { anio, colegio_nombre } = await getAnioActivo(query, colegioId);
  const hoy = fechaMySQLLima();
  const personalId = params.personal_id ? parseInt(params.personal_id, 10) : null;
  const desde = params.desde || hoy;
  const hasta = params.hasta || hoy;

  const universoBase = (await loadPersonalColegio(query, colegioId)).filter(
    personalCuentaControlAsistencia
  );
  const personalList = universoBase;

  let universo = universoBase;
  if (Number.isFinite(personalId)) {
    const probe =
      universoBase.find((p) => Number(p.personal_id) === personalId) ||
      personalList.find((p) => Number(p.personal_id) === personalId);
    const match = probe
      ? universoBase.find(
          (p) => Number(p.personal_id) === Number(probe.personal_id) || mismaIdentidad(p, probe)
        )
      : null;
    universo = match ? [match] : [];
  }

  const where = [
    'ar.colegio_id = ?',
    'ar.anio = ?',
    'ar.hora_entrada IS NOT NULL',
    'u.personal_id > 0',
    "(ar.tipo_registro = 'ENTRADA' OR ar.tipo_registro = 'ENTRADA_SALIDA')",
    'ar.fecha >= ?',
    'ar.fecha <= ?',
  ];
  const sqlParams = [colegioId, anio, desde, hasta];

  const rows = await query(
    `SELECT ar.fecha, p.id AS personal_id, p.nombres, p.apellidos, p.nro_documento, p.codigo_biometrico,
            p.hora_entrada
     FROM asistencia_registros ar
     INNER JOIN usuarios u ON u.id = ar.usuario_id AND u.colegio_id = ar.colegio_id
     INNER JOIN personal p ON p.id = u.personal_id AND p.colegio_id = ar.colegio_id
     WHERE ${where.join(' AND ')}`,
    sqlParams
  );

  const marcasPorFecha = new Map();
  for (const r of rows || []) {
    if (!personalCuentaControlAsistencia(r)) continue;
    const fecha = fechaIsoFromValue(r.fecha);
    if (!fecha) continue;
    if (!marcasPorFecha.has(fecha)) marcasPorFecha.set(fecha, []);
    marcasPorFecha.get(fecha).push(r);
  }

  const dias = [...marcasPorFecha.keys()].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  const filas = [];
  for (const fecha of dias) {
    const marcas = marcasPorFecha.get(fecha) || [];
    for (const p of universo) {
      const marco = marcas.some(
        (m) => Number(m.personal_id) === Number(p.personal_id) || mismaIdentidad(p, m)
      );
      if (!marco) {
        filas.push({
          fecha,
          personal_id: p.personal_id,
          personal_nombre: nombrePersonal(p),
          cargo: p.cargo ? String(p.cargo).trim() : '',
        });
      }
    }
  }

  return {
    colegio_nombre,
    anio,
    desde,
    hasta,
    filas,
    total: filas.length,
    dias_con_marca: dias.length,
    personal_comun: universoBase.map(mapPersonalAsistenciaMeta),
  };
}

/** Totales de tardanzas y descuento del personal del colegio en un mes calendario. */
async function calcularTardanzasMesColegio(query, colegioId, params = {}) {
  const ahora = new Date();
  const mesNum = params.mes ? parseInt(params.mes, 10) : ahora.getMonth() + 1;
  const anioCal = params.anio_calendario ? parseInt(params.anio_calendario, 10) : ahora.getFullYear();
  const { anio } = await getAnioActivo(query, colegioId);
  const mesNombre = MESES_ES[mesNum - 1] || `Mes ${mesNum}`;

  const rows = await query(
    `SELECT ar.fecha, ar.hora_entrada AS hora_marcacion, ar.hora_salida,
            p.hora_entrada AS hora_entrada_real, p.sueldo, u.personal_id, u.tipo AS usuario_tipo,
            p.nombres, p.apellidos, p.nro_documento, p.codigo_biometrico
     FROM asistencia_registros ar
     INNER JOIN usuarios u ON u.id = ar.usuario_id AND u.colegio_id = ar.colegio_id
     INNER JOIN personal p ON p.id = u.personal_id AND p.colegio_id = ar.colegio_id
     WHERE ar.colegio_id = ?
       AND ar.anio = ?
       AND YEAR(ar.fecha) = ?
       AND MONTH(ar.fecha) = ?
       AND ar.hora_entrada IS NOT NULL
       AND u.personal_id > 0
       AND (ar.tipo_registro = 'ENTRADA' OR ar.tipo_registro = 'ENTRADA_SALIDA')
     ORDER BY ar.fecha ASC, ar.hora_entrada ASC`,
    [colegioId, anio, anioCal, mesNum]
  );

  const permisos = await cargarPermisos(query, colegioId).catch(() => []);
  const { totalMinutos, totalDescuento, registrosUnicos } = sumarTardanzasDesdeRegistros(rows, { permisos });

  return {
    mes: mesNum,
    anio_calendario: anioCal,
    mes_nombre: mesNombre,
    anio_academico: anio,
    minutos_tardanza: totalMinutos,
    descuento: totalDescuento,
    registros: registrosUnicos,
    tarifa_por_minuto: null,
    formula_descuento: FORMULA_DESCUENTO_TARDANZA,
  };
}

function fmtFechaExcel(iso) {
  const s = String(iso || '').slice(0, 10);
  const [y, m, d] = s.split('-');
  if (!d) return s;
  return `${d}/${m}/${y}`;
}

/** Excel con formato (cabecera, bordes, anchos). Async → Buffer. */
async function buildExportWorkbook(lista) {
  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = await marcaCreadorExcel();
  const ws = wb.addWorksheet('Tardanzas', {
    views: [{ state: 'frozen', ySplit: 3, showGridLines: false }],
  });

  const headers = [
    'Personal',
    'Fecha',
    'Hora entrada real',
    'Hora entrada',
    'Min. tardanza',
    'Descuento S/.',
    'Hora salida',
    'Detalle',
  ];
  const colWidths = [36, 12, 18, 16, 13, 14, 14, 52];
  colWidths.forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });

  const thin = { style: 'thin', color: { argb: 'FF94A3B8' } };
  const border = { top: thin, left: thin, bottom: thin, right: thin };
  const fillHead = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
  const fillAlt = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
  const fillTotal = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } };
  const center = { horizontal: 'center', vertical: 'middle', wrapText: true };
  const leftMid = { horizontal: 'left', vertical: 'middle' };

  // Título
  ws.mergeCells(1, 1, 1, 8);
  const title = ws.getCell(1, 1);
  title.value = `Tardanzas del personal${lista.colegio_nombre ? ` — ${lista.colegio_nombre}` : ''}`;
  title.font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } };
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
  title.alignment = center;
  ws.getRow(1).height = 24;

  // Subtítulo
  ws.mergeCells(2, 1, 2, 8);
  const sub = ws.getCell(2, 1);
  sub.value = `Año ${lista.anio || '—'} · Descuento: sueldo ÷ 30 ÷ 8 ÷ 60 por minuto (S/ 0 sin sueldo) · ${lista.total_registros || (lista.filas || []).length} registro(s)`;
  sub.font = { size: 9, color: { argb: 'FF334155' } };
  sub.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
  sub.alignment = center;
  ws.getRow(2).height = 18;

  // Cabecera
  const headRow = ws.getRow(3);
  headers.forEach((h, i) => {
    const cell = headRow.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
    cell.fill = fillHead;
    cell.alignment = center;
    cell.border = border;
  });
  headRow.height = 20;

  const filas = lista.filas || [];
  filas.forEach((f, idx) => {
    const row = ws.getRow(4 + idx);
    const salida =
      f.hora_salida_fmt && f.hora_salida_fmt !== '—'
        ? f.hora_salida_fmt
        : f.hora_salida
          ? formatHoraDisplay(f.hora_salida)
          : '—';
    const vals = [
      f.personal_nombre || '',
      fmtFechaExcel(f.fecha),
      f.hora_entrada_real_fmt && f.hora_entrada_real_fmt !== '—' ? f.hora_entrada_real_fmt : '—',
      f.hora_marcacion_fmt && f.hora_marcacion_fmt !== '—' ? f.hora_marcacion_fmt : '—',
      f.minutos_tardanza != null ? f.minutos_tardanza : 0,
      Number(f.descuento || 0),
      salida,
      f.motivo || '',
    ];
    vals.forEach((v, i) => {
      const cell = row.getCell(i + 1);
      cell.value = v;
      cell.border = border;
      cell.alignment = i === 0 || i === 7 ? leftMid : center;
      cell.font = { size: 10 };
      if (idx % 2 === 1) cell.fill = fillAlt;
      if (i === 5 && typeof v === 'number') {
        cell.numFmt = '"S/"#,##0.00';
      }
    });
    row.height = f.motivo ? 28 : 18;
  });

  const totalRowNum = 4 + filas.length;
  const totalRow = ws.getRow(totalRowNum);
  for (let c = 1; c <= 8; c += 1) {
    const cell = totalRow.getCell(c);
    cell.fill = fillTotal;
    cell.border = border;
    cell.font = { bold: true, size: 10 };
    cell.alignment = center;
  }
  totalRow.getCell(1).value = '';
  totalRow.getCell(5).value = 'TOTAL';
  totalRow.getCell(6).value = Number(lista.total_descuento || 0);
  totalRow.getCell(6).numFmt = '"S/"#,##0.00';
  totalRow.height = 20;

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

module.exports = {
  DESCUENTO_POR_MINUTO,
  FORMULA_DESCUENTO_TARDANZA,
  tarifaMinutoDesdeSueldo,
  sueldoDe,
  MESES_ES,
  parseHuelleroExcelBuffer,
  previewHuelleroImport,
  importarHuellero,
  listarTardanzas,
  listarFaltasPersonalComun,
  personalCuentaControlAsistencia,
  esHoraEntradaMedianoche,
  actualizarHoraRegistro,
  eliminarRegistroTardanza,
  calcularTardanzasMesColegio,
  loadPersonalColegio,
  dedupePersonalList,
  esDiaLaboral,
  sumarTardanzasDesdeRegistros,
  getAnioActivo,
  buildExportWorkbook,
  nombrePersonal,
  calcTardanza,
  evaluarMarcacion,
  calcularTardanzasMesPersonal,
  formatHoraDisplay,
  matchPersonal,
  parseHoraMarcacion,
  toMinutesFromMidnight,
  upsertMarcacionDia,
  upsertMarcacionEntradaSalida,
  actualizarEntradaSalidaRegistro,
  crearRegistroManual,
  mismaIdentidad,
  fusionarFilasPorIdentidad,
  fusionarRegistrosEquivalentesDia,
  resolverPersonalCanonico,
  personalIdsEquivalentes,
};
