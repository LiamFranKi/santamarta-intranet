/**
 * Recepción de eventos HTTP del biométrico Hikvision (Monitoreo HTTP / AccessControllerEvent).
 * Inserta en asistencia_registros (misma lógica que import Excel de tardanzas).
 *
 * El terminal suele enviar multipart/form-data con campo "event_log" (JSON).
 * La fecha va en el sobre (dateTime); employeeNoString dentro de AccessControllerEvent.
 */
const multer = require('multer');
const { query, execute } = require('./mysql');
const { DEFAULT_COLEGIO_ID } = require('./defaultColegio');
const { sqlPersonalSinSuperadmin } = require('./superadminOculto');
const {
  getAnioActivo,
  upsertMarcacionEntradaSalida,
  matchPersonal,
  dedupePersonalList,
  parseHoraMarcacion,
  formatHoraDisplay,
  evaluarMarcacion,
  sueldoDe,
  FORMULA_DESCUENTO_TARDANZA,
  fusionarFilasPorIdentidad,
  fusionarRegistrosEquivalentesDia,
  resolverPersonalCanonico,
  personalIdsEquivalentes,
  personalCuentaControlAsistencia,
} = require('./adminTardanzasHuellero');
const { cargarPermisos } = require('./permisoEntradaPersonal');

const TZ_LIMA = 'America/Lima';

/** Diagnóstico en memoria: último POST del huellero (no persiste tras reinicio PM2). */
const lastWebhook = {
  at: null,
  ip: null,
  reason: null,
  action: null,
  employeeNo: null,
  name: null,
  fecha: null,
  hora: null,
  count: 0,
};

function noteWebhook(meta = {}) {
  lastWebhook.at = new Date().toISOString();
  lastWebhook.ip = meta.ip || lastWebhook.ip;
  lastWebhook.reason = meta.reason != null ? meta.reason : lastWebhook.reason;
  lastWebhook.action = meta.action != null ? meta.action : null;
  lastWebhook.employeeNo = meta.employeeNo != null ? meta.employeeNo : null;
  lastWebhook.name = meta.name != null ? meta.name : null;
  lastWebhook.fecha = meta.fecha != null ? meta.fecha : null;
  lastWebhook.hora = meta.hora != null ? meta.hora : null;
  lastWebhook.count += 1;
}

function getLastWebhook() {
  return { ...lastWebhook };
}

const uploadAny = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
}).any();

function webhookTokenConfigured() {
  return String(process.env.BIOMETRICO_WEBHOOK_TOKEN || '').trim();
}

function assertWebhookAuth(req) {
  const expected = webhookTokenConfigured();
  if (!expected) {
    const err = new Error('BIOMETRICO_WEBHOOK_TOKEN no configurado en el servidor');
    err.status = 503;
    throw err;
  }
  const q = String(req.query?.token || '').trim();
  const h =
    String(req.headers['x-biometrico-token'] || '').trim() ||
    String(req.headers['x-hikvision-token'] || '').trim();
  const auth = String(req.headers.authorization || '');
  const bearer = auth.toLowerCase().startsWith('bearer ')
    ? auth.slice(7).trim()
    : '';
  const pathToken = String(req.params?.token || '').trim();
  const got = q || h || bearer || pathToken;
  if (!got || got !== expected) {
    console.warn('[biometrico] auth fallida', {
      ip: req.ip || req.socket?.remoteAddress || null,
      hasToken: !!got,
      path: String(req.originalUrl || '').split('?')[0],
    });
    const err = new Error('Token inválido');
    err.status = 401;
    throw err;
  }
}

/** Compara IDs/DNI ignorando ceros a la izquierda y no-dígitos. */
function idsMatch(a, b) {
  const dig = (v) => String(v ?? '').replace(/\D/g, '');
  const na = dig(a);
  const nb = dig(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  return na.replace(/^0+/, '') === nb.replace(/^0+/, '');
}

function safeJsonParse(raw) {
  if (raw == null) return null;
  if (typeof raw === 'object') return raw;
  const s = String(raw).trim();
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    // A veces viene basura alrededor del JSON
    const start = s.indexOf('{');
    const end = s.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(s.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

/** Elige dateTime usable (evita campos numéricos basura de Hikvision). */
function pickTimeRaw(ace, env) {
  const candidates = [env?.dateTime, ace?.dateTime, env?.time, ace?.time];
  for (const c of candidates) {
    if (c == null || c === '') continue;
    if (typeof c === 'number') {
      // unix seconds / ms
      if (c > 1e12) return new Date(c).toISOString();
      if (c > 1e9) return new Date(c * 1000).toISOString();
      continue;
    }
    const s = String(c).trim();
    if (/\d{4}-\d{2}-\d{2}/.test(s) || /\d{2}\/\d{2}\/\d{4}/.test(s)) return s;
  }
  return null;
}

/** Fecha/hora del evento convertida a Lima (America/Lima). */
function parseEventDateTime(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;

  // ISO con offset Lima o sin zona → reloj de pared (no reinterpretar)
  const iso = s.match(
    /^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/
  );
  if (iso) {
    const off = iso[7] || '';
    const wall = {
      fecha: `${iso[1]}-${iso[2]}-${iso[3]}`,
      hora: `${iso[4]}:${iso[5]}:${iso[6]}`,
    };
    if (!off || off === '-05:00' || off === '-0500') return wall;
    if (off === 'Z' || off === '+00:00' || off === '+0000') {
      // UTC → Lima (−5h)
      const d = new Date(`${iso[1]}-${iso[2]}-${iso[3]}T${iso[4]}:${iso[5]}:${iso[6]}Z`);
      return formatDateInLima(d);
    }
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return formatDateInLima(d);
    return wall;
  }

  const dmy = s.match(/^(\d{2})\/(\d{2})\/(\d{4})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (dmy) {
    return {
      fecha: `${dmy[3]}-${dmy[2]}-${dmy[1]}`,
      hora: `${dmy[4]}:${dmy[5]}:${dmy[6]}`,
    };
  }

  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return formatDateInLima(d);
}

function formatDateInLima(d) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ_LIMA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  let hour = get('hour');
  if (hour === '24') hour = '00';
  return {
    fecha: `${get('year')}-${get('month')}-${get('day')}`,
    hora: `${hour}:${get('minute')}:${get('second')}`,
  };
}

function nowLima() {
  return parseEventDateTime(new Date().toISOString());
}

/**
 * Hikvision: multipart event_log → JSON envelope con AccessControllerEvent anidado.
 */
function resolveHikvisionPayload(body, rawBody) {
  let root = body && typeof body === 'object' ? { ...body } : {};

  if ((!root || !Object.keys(root).length) && rawBody) {
    const parsed = safeJsonParse(rawBody);
    if (parsed) root = parsed;
  }

  // Multipart: event_log / AccessControllerEvent como string u objeto
  const candidateKeys = [
    'event_log',
    'EventNotificationAlert',
    'AccessControllerEvent',
    'eventLog',
    'json',
  ];

  let envelope = null;

  for (const key of candidateKeys) {
    if (root[key] == null) continue;
    const val = root[key];
    if (typeof val === 'string') {
      const parsed = safeJsonParse(val);
      if (!parsed) continue;
      if (key === 'AccessControllerEvent' && !parsed.AccessControllerEvent) {
        envelope = { ...root, AccessControllerEvent: parsed, dateTime: root.dateTime || parsed.dateTime };
      } else {
        envelope = parsed.AccessControllerEvent || parsed.eventType
          ? parsed
          : { AccessControllerEvent: parsed };
      }
      break;
    }
    if (typeof val === 'object') {
      if (key === 'AccessControllerEvent' && !val.employeeNoString && !val.dateTime && root.dateTime) {
        envelope = root;
      } else if (val.AccessControllerEvent || val.eventType || val.employeeNoString != null) {
        envelope = val.AccessControllerEvent || val.eventType ? val : root;
      } else {
        envelope = { ...root, AccessControllerEvent: val };
      }
      break;
    }
  }

  if (!envelope) {
    if (root.AccessControllerEvent || root.eventType === 'AccessControllerEvent' || root.employeeNoString != null) {
      envelope = root;
    }
  }

  // Buscar JSON embebido en cualquier campo string
  if (!envelope) {
    for (const val of Object.values(root)) {
      if (typeof val !== 'string') continue;
      if (!val.includes('AccessControllerEvent') && !val.includes('employeeNo') && !val.includes('dateTime')) {
        continue;
      }
      const parsed = safeJsonParse(val);
      if (parsed) {
        envelope = parsed.AccessControllerEvent && !parsed.dateTime && root.dateTime
          ? { ...parsed, dateTime: root.dateTime }
          : parsed;
        break;
      }
    }
  }

  if (!envelope && rawBody && (String(rawBody).includes('AccessControllerEvent') || String(rawBody).includes('employeeNo'))) {
    envelope = safeJsonParse(rawBody);
  }

  if (!envelope) return { envelope: null, ace: null };

  let ace = envelope.AccessControllerEvent;
  if (typeof ace === 'string') ace = safeJsonParse(ace);
  if (!ace || typeof ace !== 'object') {
    if (envelope.employeeNoString != null || envelope.employeeNo != null || envelope.name) {
      ace = envelope;
    } else {
      ace = null;
    }
  }

  return { envelope, ace };
}

/** @deprecated usar resolveHikvisionPayload */
function extractAccessControllerEvent(body) {
  return resolveHikvisionPayload(body).ace;
}

function cleanId(v) {
  if (v == null) return '';
  const s = String(v).trim();
  if (!s || s === 'undefined' || s === 'null' || s === '-' || s === '--') return '';
  return s;
}

function cleanName(v) {
  if (v == null) return '';
  const s = String(v).trim();
  if (!s || s === 'undefined' || s === 'null' || s === '-' || s === '--') return '';
  return s;
}

function splitPersonName(full) {
  const name = cleanName(full);
  if (!name) return { firstName: '', lastName: '', name: '' };
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return { firstName: parts[0], lastName: '', name };
  if (parts.length === 2) return { firstName: parts[1], lastName: parts[0], name };
  // 3+: asumir 2 apellidos + resto nombres (común en Perú)
  return {
    lastName: `${parts[0]} ${parts[1]}`,
    firstName: parts.slice(2).join(' '),
    name,
  };
}

function normalizeEvent(ace, envelope) {
  if (!ace || typeof ace !== 'object') return null;
  const env = envelope && typeof envelope === 'object' ? envelope : {};

  const employeeNo = cleanId(
    ace.employeeNoString ??
      ace.employeeNo ??
      ace.employeeNoString ??
      env.employeeNoString ??
      env.employeeNo ??
      ace.cardNo ??
      ''
  );

  const name = cleanName(
    ace.name ||
      ace.employeeName ||
      ace.personName ||
      ace.userName ||
      ace.workerName ||
      env.name ||
      env.employeeName ||
      ''
  );

  // Algunos firmwares mandan First/Last Name separados (como el Excel)
  const aceFirst = cleanName(ace.firstName || ace.FirstName || '');
  const aceLast = cleanName(ace.lastName || ace.LastName || '');

  const timeRaw = pickTimeRaw(ace, env);
  let dt = parseEventDateTime(timeRaw);
  let fechaDesdeServidor = false;
  // Si hay persona pero no dateTime parseable: usar reloj Lima (dispositivo con fecha OK suele traer dateTime)
  if (!dt && (employeeNo || name || aceFirst || aceLast)) {
    dt = nowLima();
    fechaDesdeServidor = true;
  }
  if (!dt) return null;

  // Sin persona: evento de puerta / heartbeat
  if (!employeeNo && !name && !aceFirst && !aceLast) {
    return {
      employeeNo: '',
      fecha: dt.fecha,
      hora_marcacion: parseHoraMarcacion(dt.hora) || dt.hora,
      firstName: '',
      lastName: '',
      name: '',
      metodo: '',
      majorEventType: ace.majorEventType,
      subEventType: ace.subEventType,
      sinPersona: true,
      fechaDesdeServidor,
    };
  }

  const hora = parseHoraMarcacion(dt.hora) || dt.hora;
  // Excel: First Name = nombres, Last Name = apellidos
  let firstName = aceFirst;
  let lastName = aceLast;
  if (!firstName && !lastName && name) {
    if (name.includes(',')) {
      const [ape, nom] = name.split(',').map((x) => cleanName(x));
      lastName = ape || '';
      firstName = nom || '';
    } else {
      ({ firstName, lastName } = splitPersonName(name));
    }
  }

  const metodo = String(
    ace.currentVerifyMode ||
      ace.verifyMode ||
      ace.attendanceStatus ||
      ''
  ).trim();

  return {
    employeeNo,
    fecha: dt.fecha,
    hora_marcacion: hora,
    firstName,
    lastName,
    name: name || `${lastName} ${firstName}`.trim(),
    metodo,
    majorEventType: ace.majorEventType,
    subEventType: ace.subEventType,
    sinPersona: false,
    fechaDesdeServidor,
  };
}

async function loadPersonalForBiometrico(colegioId) {
  const sql = (extraCols) =>
    `SELECT p.id AS personal_id, p.nombres, p.apellidos, p.hora_entrada, p.cargo,
            ${extraCols}
            u.id AS usuario_id, u.tipo AS usuario_tipo
     FROM personal p
     LEFT JOIN usuarios u ON u.id = (
       SELECT u2.id FROM usuarios u2
       WHERE u2.personal_id = p.id AND u2.colegio_id = p.colegio_id AND u2.estado = 'ACTIVO'
       ORDER BY u2.id ASC
       LIMIT 1
     )
     WHERE p.colegio_id = ?
       AND ${sqlPersonalSinSuperadmin('p')}
     ORDER BY p.apellidos ASC, p.nombres ASC`;
  try {
    const rows = await query(sql('p.nro_documento, p.codigo_biometrico,'), [colegioId]);
    return dedupePersonalList(rows || []);
  } catch (e) {
    if (String(e.message || '').includes('codigo_biometrico')) {
      const rows = await query(sql('p.nro_documento,'), [colegioId]);
      return dedupePersonalList((rows || []).map((r) => ({ ...r, codigo_biometrico: null })));
    }
    throw e;
  }
}

/**
 * Misma lógica que el Excel del huellero (First Name / Last Name → matchPersonal).
 * El DNI del employeeNo es solo respaldo: en el terminal a menudo el ID no es el DNI.
 */
function matchPersonalBiometrico(event, personalList) {
  const code = cleanId(event.employeeNo);

  // 0) Código biométrico en Equipo (o employeeNo = ese código)
  if (code) {
    const byCode = personalList.find(
      (p) =>
        p.codigo_biometrico != null &&
        String(p.codigo_biometrico).trim() !== '' &&
        idsMatch(p.codigo_biometrico, code)
    );
    if (byCode) return { personal: byCode, via: 'codigo_biometrico' };
  }

  // 0b) DNI como employeeNo (muy común en su huellero) — antes del nombre
  if (code) {
    const byDni = personalList.find(
      (p) => p.nro_documento != null && idsMatch(p.nro_documento, code)
    );
    if (byDni) return { personal: byDni, via: 'nro_documento' };
  }

  // 1) Igual que import Excel: matchPersonal(First Name=nombres, Last Name=apellidos)
  const candidates = [];

  if (event.firstName || event.lastName) {
    candidates.push({
      firstName: event.firstName || '',
      lastName: event.lastName || '',
      via: 'nombre_excel',
    });
    // Por si vinieron al revés
    candidates.push({
      firstName: event.lastName || '',
      lastName: event.firstName || '',
      via: 'nombre_excel_swap',
    });
  }

  const full = cleanName(event.name);
  if (full) {
    if (full.includes(',')) {
      const [ape, nom] = full.split(',').map((x) => cleanName(x));
      if (ape || nom) {
        candidates.push({ firstName: nom || '', lastName: ape || '', via: 'nombre_coma' });
      }
    }
    const parts = full.replace(/,/g, ' ').split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      // Export Hikvision típico: "Apellido Nombre..." → Last=1er, First=resto
      candidates.push({
        firstName: parts.slice(1).join(' '),
        lastName: parts[0],
        via: 'nombre_1ape',
      });
      if (parts.length >= 3) {
        candidates.push({
          firstName: parts.slice(2).join(' '),
          lastName: `${parts[0]} ${parts[1]}`,
          via: 'nombre_2ape',
        });
      }
      // NOMBRE APELLIDO
      candidates.push({
        firstName: parts[0],
        lastName: parts.slice(1).join(' '),
        via: 'nombre_invertido',
      });
    }
  }

  for (const c of candidates) {
    if (!String(c.firstName || '').trim() && !String(c.lastName || '').trim()) continue;
    const m = matchPersonal(c.firstName, c.lastName, personalList);
    if (m) return { personal: m, via: c.via };
  }

  return null;
}

function bioDebug() {
  return String(process.env.BIOMETRICO_DEBUG || '').trim() === '1';
}

async function logEvento(row) {
  try {
    // created_at en hora Lima (UTC-5) sin tocar el time_zone del pool MySQL
    await execute(
      `INSERT INTO biometrico_eventos_log
        (colegio_id, dispositivo_ip, employee_no, personal_id, usuario_id, fecha, hora_marcacion,
         metodo_verificacion, nombre_evento, estado, detalle, payload_resumen, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?, DATE_SUB(UTC_TIMESTAMP(), INTERVAL 5 HOUR))`,
      [
        row.colegio_id,
        row.dispositivo_ip || null,
        row.employee_no || null,
        row.personal_id || null,
        row.usuario_id || null,
        row.fecha || null,
        row.hora_marcacion || null,
        row.metodo_verificacion || null,
        row.nombre_evento || null,
        row.estado || 'OK',
        row.detalle || null,
        row.payload_resumen ? String(row.payload_resumen).slice(0, 4000) : null,
      ]
    );
  } catch (e) {
    console.warn('[biometrico] log evento:', e.message);
  }
}

/** Evita reinsertar el mismo evento del replay del huellero. */
async function alreadyLoggedExact(colegioId, employeeNo, fecha, hora) {
  if (!employeeNo || !fecha || !hora) return false;
  const rows = await query(
    `SELECT id FROM biometrico_eventos_log
     WHERE colegio_id = ?
       AND employee_no = ?
       AND fecha = ?
       AND hora_marcacion = ?
     LIMIT 1`,
    [colegioId, String(employeeNo), fecha, String(hora).slice(0, 8)]
  ).catch(() => []);
  return rows.length > 0;
}

function buildResumen(body, envelope, event, rawBody) {
  const snippet = (() => {
    try {
      const src = envelope || body || rawBody;
      const s = typeof src === 'string' ? src : JSON.stringify(src);
      return String(s).slice(0, 1500);
    } catch {
      return '';
    }
  })();
  return JSON.stringify({
    keys: body && typeof body === 'object' ? Object.keys(body).slice(0, 30) : [],
    eventType: envelope?.eventType || body?.eventType,
    employeeNo: event?.employeeNo,
    fecha: event?.fecha,
    hora: event?.hora_marcacion,
    name: event?.name,
    snippet,
  });
}

/**
 * Procesa un payload ya parseado (objeto). meta.rawBody opcional.
 */
async function ingestHikvisionPayload(body, meta = {}) {
  const colegioId = parseInt(meta.colegioId || process.env.BIOMETRICO_COLEGIO_ID || DEFAULT_COLEGIO_ID, 10);
  const dispositivoIp = meta.ip || null;
  const rawBody = meta.rawBody || null;

  const { envelope, ace } = resolveHikvisionPayload(body, rawBody);
  const event = normalizeEvent(ace, envelope || body);
  const resumen = buildResumen(body, envelope, event, rawBody);

  const finish = (result) => {
    noteWebhook({
      ip: dispositivoIp,
      reason: result.reason || result.action || (result.ok ? 'ok' : 'error'),
      action: result.action || null,
      employeeNo: result.employeeNo ?? event?.employeeNo ?? null,
      name: result.name ?? event?.name ?? null,
      fecha: result.fecha ?? event?.fecha ?? null,
      hora: result.hora ?? event?.hora_marcacion ?? null,
    });
    return result;
  };

  if (!event) {
    if (bioDebug()) {
      console.warn('[biometrico] unparsed', {
        keys: body && typeof body === 'object' ? Object.keys(body) : [],
        hasRaw: !!rawBody,
      });
    }
    return finish({ ok: true, ack: true, reason: 'unparsed' });
  }

  if (event.sinPersona) {
    return finish({
      ok: true,
      ack: true,
      reason: 'no_employee',
      major: event.majorEventType,
      sub: event.subEventType,
    });
  }

  // El terminal reenvía historial al activar HTTP Listening o tras reinicio.
  // ACK 200 sin escribir BD → libera la cola del huellero y no llena el log admin.
  const hoy = nowLima();
  if (!event.fecha || event.fecha !== hoy.fecha) {
    if (bioDebug()) {
      console.warn('[biometrico] histórico ack', {
        fechaEvento: event.fecha,
        hoy: hoy.fecha,
        employeeNo: event.employeeNo,
      });
    }
    return finish({
      ok: true,
      ack: true,
      reason: 'historico',
      employeeNo: event.employeeNo || null,
      name: event.name || null,
      fecha: event.fecha,
      hora: event.hora_marcacion,
    });
  }

  // Replay del mismo evento de hoy: no reescribir log ni asistencia
  if (await alreadyLoggedExact(colegioId, event.employeeNo, event.fecha, event.hora_marcacion)) {
    return finish({
      ok: true,
      ack: true,
      reason: 'ya_procesado',
      employeeNo: event.employeeNo || null,
      fecha: event.fecha,
      hora: event.hora_marcacion,
    });
  }

  const personalList = await loadPersonalForBiometrico(colegioId);
  const matched = matchPersonalBiometrico(event, personalList);

  if (!matched) {
    if (bioDebug()) {
      console.warn('[biometrico] no_match', {
        employeeNo: event.employeeNo,
        name: event.name,
      });
    }
    await logEvento({
      colegio_id: colegioId,
      dispositivo_ip: dispositivoIp,
      employee_no: event.employeeNo || null,
      fecha: event.fecha,
      hora_marcacion: event.hora_marcacion,
      metodo_verificacion: event.metodo,
      nombre_evento: event.name || null,
      estado: 'OMITIDO',
      detalle: `Sin coincidencia (id=${event.employeeNo || '—'}; nombre=${event.name || '—'}). Use código biométrico o revise el nombre en el huellero.`,
      payload_resumen: resumen,
    });
    return finish({
      ok: true,
      ack: true,
      reason: 'no_match',
      employeeNo: event.employeeNo || null,
      name: event.name || null,
      fecha: event.fecha,
      hora: event.hora_marcacion,
    });
  }

  const { personal: matchedPersonal, via } = matched;
  const { anio } = await getAnioActivo(query, colegioId);
  const personal =
    (await resolverPersonalCanonico(query, {
      colegioId,
      anio,
      fecha: event.fecha,
      personal: matchedPersonal,
      personalList,
    })) || matchedPersonal;
  if (!personal.usuario_id) {
    await logEvento({
      colegio_id: colegioId,
      dispositivo_ip: dispositivoIp,
      employee_no: event.employeeNo,
      personal_id: personal.personal_id,
      fecha: event.fecha,
      hora_marcacion: event.hora_marcacion,
      metodo_verificacion: event.metodo,
      nombre_evento: event.name,
      estado: 'OMITIDO',
      detalle: `Personal sin usuario activo (match por ${via})`,
      payload_resumen: resumen,
    });
    return finish({
      ok: true,
      ack: true,
      reason: 'no_user',
      personal_id: personal.personal_id,
      employeeNo: event.employeeNo || null,
      name: event.name || null,
      fecha: event.fecha,
      hora: event.hora_marcacion,
    });
  }

  const nuevaHora = parseHoraMarcacion(event.hora_marcacion) || String(event.hora_marcacion || '').slice(0, 8);

  const action = await upsertMarcacionEntradaSalida(execute, query, {
    usuarioId: personal.usuario_id,
    colegioId,
    anio,
    fecha: event.fecha,
    horaMarcacion: nuevaHora,
    auditUserId: null,
    personal,
  });

  // No spamear el log de diagnóstico con reenvíos idénticos / entre entrada-salida
  if (action === 'ya_procesado' || action === 'kept_between') {
    return finish({
      ok: true,
      ack: true,
      reason: action,
      action,
      personal_id: personal.personal_id,
      via,
      employeeNo: event.employeeNo || null,
      name: event.name || null,
      fecha: event.fecha,
      hora: nuevaHora,
    });
  }

  const detalleMap = {
    insertado: 'entrada (1ª marcación del día)',
    actualizado_entrada: 'entrada actualizada (más temprana)',
    actualizado_salida: 'salida (última marcación)',
  };

  await logEvento({
    colegio_id: colegioId,
    dispositivo_ip: dispositivoIp,
    employee_no: event.employeeNo,
    personal_id: personal.personal_id,
    usuario_id: personal.usuario_id,
    fecha: event.fecha,
    hora_marcacion: nuevaHora,
    metodo_verificacion: event.metodo,
    nombre_evento: event.name,
    estado: 'OK',
    detalle: `${detalleMap[action] || action} (match ${via})`,
    payload_resumen: resumen,
  });

  // Aviso a administradores si la 1ª entrada del día es con tardanza
  if (action === 'insertado' || action === 'actualizado_entrada') {
    try {
      const { notificarAdminsTardanzaPersonal } = require('../services/tardanzaPersonalNotificacionService');
      await notificarAdminsTardanzaPersonal({
        colegioId,
        personal,
        fecha: event.fecha,
        horaMarcacion: nuevaHora,
        accionUpsert: action,
        origen: 'biometrico',
      });
    } catch (e) {
      console.warn('[biometrico] notif tardanza:', e.message);
    }
  }

  if (
    bioDebug() ||
    action === 'insertado' ||
    action === 'actualizado_entrada' ||
    action === 'actualizado_salida'
  ) {
    console.log('[biometrico] marcación', {
      action,
      via,
      employeeNo: event.employeeNo,
      name: event.name,
      fecha: event.fecha,
      hora: nuevaHora,
    });
  }

  return finish({
    ok: true,
    action,
    reason: action,
    personal_id: personal.personal_id,
    via,
    employeeNo: event.employeeNo || null,
    name: event.name || null,
    fecha: event.fecha,
    hora: nuevaHora,
  });
}

/**
 * Simula un evento Hikvision de hoy para un personal (prueba sin huellero).
 */
async function simularMarcacionHoy({ colegioId, employeeNo, name, ip = 'admin-test' }) {
  const lima = nowLima();
  const body = {
    ipAddress: ip,
    dateTime: `${lima.fecha}T${lima.hora}`,
    eventType: 'AccessControllerEvent',
    AccessControllerEvent: {
      employeeNoString: String(employeeNo || ''),
      name: String(name || ''),
      currentVerifyMode: 'cardOrFaceOrFp',
      attendanceStatus: 'checkIn',
    },
  };
  return ingestHikvisionPayload(body, { colegioId, ip, rawBody: JSON.stringify(body) });
}

/**
 * Arma body desde req (JSON, urlencoded, multipart fields + files).
 */
function buildBodyFromRequest(req) {
  let body =
    req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)
      ? { ...req.body }
      : {};

  if (typeof req.body === 'string' && req.body.trim()) {
    const parsed = safeJsonParse(req.body);
    if (parsed) body = parsed;
    else body = { raw: req.body };
  }

  if (req.files?.length) {
    for (const f of req.files) {
      if (!f.fieldname || !f.buffer) continue;
      const asText = f.buffer.toString('utf8');
      const parsed = safeJsonParse(asText);
      if (parsed) {
        body[f.fieldname] = parsed;
        if (parsed.AccessControllerEvent && !body.AccessControllerEvent) {
          body.AccessControllerEvent = parsed.AccessControllerEvent;
        }
        if (parsed.dateTime && !body.dateTime) body.dateTime = parsed.dateTime;
        // event_log suele ser el sobre completo
        if (f.fieldname === 'event_log' || parsed.eventType) {
          Object.assign(body, {
            event_log: parsed,
            dateTime: body.dateTime || parsed.dateTime,
            AccessControllerEvent: body.AccessControllerEvent || parsed.AccessControllerEvent,
          });
        }
      } else if (!f.mimetype || String(f.mimetype).includes('json') || String(f.mimetype).includes('text')) {
        body[f.fieldname] = asText;
      }
      // omitir binarios (fotos)
    }
  }

  return body;
}

/**
 * Lista eventos del log. Orden: más reciente primero (fecha/hora marcación, luego id).
 * Filtros: personalId, desde, hasta (YYYY-MM-DD).
 */
async function listRecentEvents(colegioId, opts = {}) {
  const lim = Math.min(Math.max(parseInt(opts.limit, 10) || 100, 1), 300);
  const where = ['l.colegio_id = ?'];
  const params = [colegioId];

  const personalId = parseInt(opts.personalId, 10);
  if (personalId) {
    where.push('l.personal_id = ?');
    params.push(personalId);
  }

  const desde = opts.desde ? String(opts.desde).slice(0, 10) : '';
  const hasta = opts.hasta ? String(opts.hasta).slice(0, 10) : '';
  if (desde && /^\d{4}-\d{2}-\d{2}$/.test(desde)) {
    where.push('COALESCE(l.fecha, DATE(l.created_at)) >= ?');
    params.push(desde);
  }
  if (hasta && /^\d{4}-\d{2}-\d{2}$/.test(hasta)) {
    where.push('COALESCE(l.fecha, DATE(l.created_at)) <= ?');
    params.push(hasta);
  }

  return query(
    `SELECT l.*,
            CONCAT(COALESCE(p.apellidos,''), ', ', COALESCE(p.nombres,'')) AS personal_nombre
     FROM biometrico_eventos_log l
     LEFT JOIN personal p ON p.id = l.personal_id
     WHERE ${where.join(' AND ')}
     ORDER BY
       COALESCE(l.fecha, DATE(l.created_at)) DESC,
       COALESCE(l.hora_marcacion, TIME(l.created_at)) DESC,
       l.id DESC
     LIMIT ${lim}`,
    params
  );
}

/**
 * Marcaciones reales (1 fila por persona/día): entrada + salida.
 * Orden: fecha DESC, hora de entrada DESC (más reciente → más temprano).
 */
async function listMarcacionesAsistencia(colegioId, opts = {}) {
  const lim = Math.min(Math.max(parseInt(opts.limit, 10) || 200, 1), 500);
  const { anio } = await getAnioActivo(query, colegioId);
  const where = [
    'ar.colegio_id = ?',
    'ar.anio = ?',
    'ar.hora_entrada IS NOT NULL',
    `(ar.tipo_registro = 'ENTRADA' OR ar.tipo_registro = 'ENTRADA_SALIDA')`,
  ];
  const params = [colegioId, anio];

  const personalId = parseInt(opts.personalId, 10);
  if (personalId) {
    const ids = await personalIdsEquivalentes(query, colegioId, personalId);
    where.push(`p.id IN (${ids.map(() => '?').join(',')})`);
    params.push(...ids);
  }

  const desde = opts.desde ? String(opts.desde).slice(0, 10) : '';
  const hasta = opts.hasta ? String(opts.hasta).slice(0, 10) : '';
  if (desde && /^\d{4}-\d{2}-\d{2}$/.test(desde)) {
    where.push('DATE(ar.fecha) >= ?');
    params.push(desde);
  }
  if (hasta && /^\d{4}-\d{2}-\d{2}$/.test(hasta)) {
    where.push('DATE(ar.fecha) <= ?');
    params.push(hasta);
  }

  const selectSql = `SELECT ar.id,
            ar.fecha,
            ar.hora_entrada,
            ar.hora_salida,
            ar.tipo_registro,
            COALESCE(ar.fecha_actualizacion, ar.fecha_creacion) AS recibido_at,
            ar.fecha_creacion,
            ar.fecha_actualizacion,
            p.id AS personal_id,
            p.nombres,
            p.apellidos,
            p.nro_documento,
            p.codigo_biometrico,
            p.hora_entrada AS hora_entrada_real,
            p.sueldo,
            u.tipo AS usuario_tipo,
            CONCAT(COALESCE(p.apellidos,''), ', ', COALESCE(p.nombres,'')) AS personal_nombre
     FROM asistencia_registros ar
     INNER JOIN usuarios u ON u.id = ar.usuario_id
     INNER JOIN personal p ON p.id = u.personal_id
     WHERE ${where.join(' AND ')}
     ORDER BY DATE(ar.fecha) DESC,
              ar.hora_entrada DESC,
              ar.id DESC
     LIMIT ${lim}`;

  let rows = await query(selectSql, params);

  const fechas = [...new Set((rows || []).map((r) => String(r.fecha || '').slice(0, 10)))].filter((f) =>
    /^\d{4}-\d{2}-\d{2}$/.test(f)
  );
  for (const fecha of fechas) {
    await fusionarRegistrosEquivalentesDia(query, execute, { colegioId, anio, fecha });
  }
  if (fechas.length) {
    rows = await query(selectSql, params);
  }

  const permisos = await cargarPermisos(query, colegioId).catch(() => []);

  const filasRaw = (rows || []).map((r) => {
    const fechaStr =
      r.fecha instanceof Date
        ? `${r.fecha.getFullYear()}-${String(r.fecha.getMonth() + 1).padStart(2, '0')}-${String(r.fecha.getDate()).padStart(2, '0')}`
        : String(r.fecha || '').slice(0, 10);
    const he = parseHoraMarcacion(r.hora_entrada) || formatHoraDisplay(r.hora_entrada);
    const hs = r.hora_salida
      ? parseHoraMarcacion(r.hora_salida) || formatHoraDisplay(r.hora_salida)
      : null;
    const horaReal = r.hora_entrada_real;
    const sueldo = sueldoDe(r);
    const ev = evaluarMarcacion({
      horaPropia: horaReal,
      horaMarca: he,
      sueldo,
      fecha: fechaStr,
      personalId: r.personal_id,
      tipoUsuario: r.usuario_tipo,
      permisos,
    });
    return {
      id: r.id,
      personal_id: r.personal_id,
      nombres: r.nombres,
      apellidos: r.apellidos,
      nro_documento: r.nro_documento,
      codigo_biometrico: r.codigo_biometrico,
      personal_nombre: (r.personal_nombre || '').replace(/^,\s*/, '').trim() || '—',
      fecha: fechaStr,
      hora_entrada: he,
      hora_salida: hs,
      hora_entrada_real: horaReal,
      hora_entrada_real_fmt: formatHoraDisplay(horaReal),
      usuario_tipo: r.usuario_tipo || null,
      sueldo: sueldo || null,
      tarifa_por_minuto: ev.tarifa_por_minuto,
      hora_marcacion: he,
      hora_marcacion_fmt: formatHoraDisplay(he),
      hora_salida_fmt: hs ? formatHoraDisplay(hs) : '—',
      minutos_tardanza: ev.minutos_tardanza,
      descuento: ev.descuento,
      motivo: ev.motivo,
      hora_usada_fmt: ev.hora_usada_fmt,
      fecha_hora_entrada: he ? `${fechaStr} ${he}` : fechaStr,
      fecha_hora_salida: hs ? `${fechaStr} ${hs}` : null,
      recibido_at: r.recibido_at,
      tipo_registro: r.tipo_registro,
    };
  });

  const filas = fusionarFilasPorIdentidad(filasRaw, permisos)
    .filter(personalCuentaControlAsistencia)
    .sort((a, b) => {
    const fd = String(b.fecha).localeCompare(String(a.fecha));
    if (fd !== 0) return fd;
    return String(b.hora_entrada || '').localeCompare(String(a.hora_entrada || ''));
  });

  const total_descuento = Math.round(filas.reduce((s, f) => s + (f.descuento || 0), 0) * 100) / 100;
  const total_minutos = filas.reduce((s, f) => s + (f.minutos_tardanza || 0), 0);

  return {
    filas,
    total_descuento,
    total_minutos,
    total_registros: filas.length,
    tarifa_por_minuto: null,
    formula_descuento: FORMULA_DESCUENTO_TARDANZA,
  };
}

function hoyLimaISO() {
  return formatDateInLima(new Date()).fecha;
}

/** Borra filas de diagnóstico OMITIDO (no toca asistencia_registros). */
async function deleteEventosOmitidos(colegioId) {
  const result = await execute(
    `DELETE FROM biometrico_eventos_log
     WHERE colegio_id = ? AND estado = 'OMITIDO'`,
    [colegioId]
  );
  return { deleted: result?.affectedRows || 0 };
}

/**
 * Emergencia: borra marcaciones ENTRADA del día (Lima) creadas por el flood histórico.
 * No borra el log biométrico.
 */
async function deleteAsistenciaEntradaHoy(colegioId) {
  const hoy = hoyLimaISO();
  const { anio } = await getAnioActivo(query, colegioId);
  const result = await execute(
    `DELETE FROM asistencia_registros
     WHERE colegio_id = ?
       AND anio = ?
       AND DATE(fecha) = ?
       AND (tipo_registro = 'ENTRADA' OR tipo_registro = 'ENTRADA_SALIDA')`,
    [colegioId, anio, hoy]
  );
  return { deleted: result?.affectedRows || 0, fecha: hoy, anio };
}

function webhookPublicUrl(req) {
  let base = String(
    process.env.BIOMETRICO_PUBLIC_URL ||
      process.env.API_PUBLIC_URL ||
      process.env.FRONTEND_URL ||
      ''
  )
    .replace(/\/$/, '')
    .replace(/\/api$/i, '');
  if (!base && req) {
    const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0].trim();
    const host = String(req.headers['x-forwarded-host'] || req.get?.('host') || '').split(',')[0].trim();
    if (host) base = `${proto}://${host}`;
  }
  // Preferir dominio API real si FRONTEND_URL apunta a un host que no resuelve
  if (/intranet\.vanguardschools\.com/i.test(base)) {
    base = 'https://sistema.vanguardschools.edu.pe';
  }
  const token = webhookTokenConfigured();
  const path = '/api/biometrico/hikvision/eventos';
  if (!base) return `${path}?token=***`;
  if (!token) return `${base}${path}?token=CONFIGURE_BIOMETRICO_WEBHOOK_TOKEN`;
  return `${base}${path}?token=${token}`;
}

module.exports = {
  uploadAny,
  assertWebhookAuth,
  webhookTokenConfigured,
  ingestHikvisionPayload,
  simularMarcacionHoy,
  getLastWebhook,
  extractAccessControllerEvent,
  resolveHikvisionPayload,
  normalizeEvent,
  buildBodyFromRequest,
  listRecentEvents,
  listMarcacionesAsistencia,
  deleteEventosOmitidos,
  deleteAsistenciaEntradaHoy,
  webhookPublicUrl,
  loadPersonalForBiometrico,
  parseEventDateTime,
  hoyLimaISO,
  nowLima,
};
