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
const {
  getAnioActivo,
  upsertMarcacionDia,
  matchPersonal,
  dedupePersonalList,
  parseHoraMarcacion,
} = require('./adminTardanzasHuellero');

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
    const err = new Error('Token inválido');
    err.status = 401;
    throw err;
  }
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

  const timeRaw = pickTimeRaw(ace, env);
  let dt = parseEventDateTime(timeRaw);
  // Nunca inventar fecha de hoy si el dispositivo no trae dateTime usable
  if (!dt) return null;

  // Sin persona: evento de puerta / heartbeat
  if (!employeeNo && !name) {
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
    };
  }

  const hora = parseHoraMarcacion(dt.hora) || dt.hora;
  const { firstName, lastName } = splitPersonName(name);

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
    name,
    metodo,
    majorEventType: ace.majorEventType,
    subEventType: ace.subEventType,
    sinPersona: false,
  };
}

async function loadPersonalForBiometrico(colegioId) {
  try {
    const rows = await query(
      `SELECT p.id AS personal_id, p.nombres, p.apellidos, p.hora_entrada, p.cargo,
              p.nro_documento, p.codigo_biometrico, u.id AS usuario_id
       FROM personal p
       LEFT JOIN usuarios u ON u.personal_id = p.id AND u.colegio_id = p.colegio_id AND u.estado = 'ACTIVO'
       WHERE p.colegio_id = ?
       ORDER BY p.apellidos ASC, p.nombres ASC`,
      [colegioId]
    );
    return dedupePersonalList(rows || []);
  } catch (e) {
    if (String(e.message || '').includes('codigo_biometrico')) {
      const rows = await query(
        `SELECT p.id AS personal_id, p.nombres, p.apellidos, p.hora_entrada, p.cargo,
                p.nro_documento, u.id AS usuario_id
         FROM personal p
         LEFT JOIN usuarios u ON u.personal_id = p.id AND u.colegio_id = p.colegio_id AND u.estado = 'ACTIVO'
         WHERE p.colegio_id = ?
         ORDER BY p.apellidos ASC, p.nombres ASC`,
        [colegioId]
      );
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

  // 0) Solo si configuraron código biométrico explícito en Equipo
  if (code) {
    const byCode = personalList.find(
      (p) =>
        p.codigo_biometrico != null &&
        String(p.codigo_biometrico).trim() !== '' &&
        String(p.codigo_biometrico).trim() === code
    );
    if (byCode) return { personal: byCode, via: 'codigo_biometrico' };
  }

  // 1) Igual que import Excel: matchPersonal(firstName, lastName)
  //    En Excel: First Name = nombres, Last Name = apellidos
  const candidates = [];

  if (event.firstName || event.lastName) {
    candidates.push({
      firstName: event.firstName || '',
      lastName: event.lastName || '',
      via: 'nombre_excel',
    });
  }

  const full = cleanName(event.name);
  if (full) {
    const parts = full.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      // Last Name = 1er token, First Name = resto (formato típico export Hikvision)
      candidates.push({
        firstName: parts.slice(1).join(' '),
        lastName: parts[0],
        via: 'nombre_1ape',
      });
      // Last Name = 2 apellidos, First Name = resto
      if (parts.length >= 3) {
        candidates.push({
          firstName: parts.slice(2).join(' '),
          lastName: `${parts[0]} ${parts[1]}`,
          via: 'nombre_2ape',
        });
      }
      // Por si el terminal guarda NOMBRE APELLIDO
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

  // 2) DNI solo como último recurso (no confiar primero)
  if (code) {
    const byDni = personalList.find(
      (p) => p.nro_documento != null && String(p.nro_documento).trim() === code
    );
    if (byDni) return { personal: byDni, via: 'nro_documento' };
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

  const { personal, via } = matched;
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

  const { anio } = await getAnioActivo(query, colegioId);

  const existing = await query(
    `SELECT id, hora_entrada FROM asistencia_registros
     WHERE usuario_id = ? AND colegio_id = ? AND DATE(fecha) = ? AND anio = ?
     ORDER BY id DESC LIMIT 1`,
    [personal.usuario_id, colegioId, event.fecha, anio]
  );

  if (existing.length) {
    const prev = String(existing[0].hora_entrada || '').slice(0, 8);
    const nueva = String(event.hora_marcacion || '').slice(0, 8);
    if (prev && nueva && prev <= nueva) {
      // Duplicado del día: ACK sin llenar el log (el terminal reenvía salidas/reintentos)
      return finish({
        ok: true,
        ack: true,
        reason: 'kept_earlier',
        action: 'kept_earlier',
        personal_id: personal.personal_id,
        via,
        employeeNo: event.employeeNo || null,
        name: event.name || null,
        fecha: event.fecha,
        hora: event.hora_marcacion,
      });
    }
  }

  const action = await upsertMarcacionDia(execute, query, {
    usuarioId: personal.usuario_id,
    colegioId,
    anio,
    fecha: event.fecha,
    horaMarcacion: event.hora_marcacion,
    auditUserId: null,
  });

  await logEvento({
    colegio_id: colegioId,
    dispositivo_ip: dispositivoIp,
    employee_no: event.employeeNo,
    personal_id: personal.personal_id,
    usuario_id: personal.usuario_id,
    fecha: event.fecha,
    hora_marcacion: event.hora_marcacion,
    metodo_verificacion: event.metodo,
    nombre_evento: event.name,
    estado: 'OK',
    detalle: `${action} (match ${via})`,
    payload_resumen: resumen,
  });

  if (bioDebug() || action === 'insertado' || action === 'actualizado') {
    console.log('[biometrico] marcación', {
      action,
      via,
      employeeNo: event.employeeNo,
      name: event.name,
      fecha: event.fecha,
      hora: event.hora_marcacion,
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
    hora: event.hora_marcacion,
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
  deleteEventosOmitidos,
  deleteAsistenciaEntradaHoy,
  webhookPublicUrl,
  loadPersonalForBiometrico,
  parseEventDateTime,
  hoyLimaISO,
  nowLima,
};
