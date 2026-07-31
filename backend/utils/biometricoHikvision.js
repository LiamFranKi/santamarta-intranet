/**
 * Recepción de eventos HTTP del biométrico Hikvision (Monitoreo HTTP / AccessControllerEvent).
 * Inserta en asistencia_registros (misma lógica que import Excel de tardanzas).
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
  const got = q || h || bearer;
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
    return null;
  }
}

function dig(obj, paths) {
  for (const p of paths) {
    const parts = p.split('.');
    let cur = obj;
    let ok = true;
    for (const part of parts) {
      if (cur == null || typeof cur !== 'object' || !(part in cur)) {
        ok = false;
        break;
      }
      cur = cur[part];
    }
    if (ok && cur != null && cur !== '') return cur;
  }
  return null;
}

/**
 * Extrae AccessControllerEvent desde JSON o multipart típico Hikvision.
 */
function extractAccessControllerEvent(body) {
  if (!body || typeof body !== 'object') return null;

  if (body.AccessControllerEvent && typeof body.AccessControllerEvent === 'object') {
    return body.AccessControllerEvent;
  }
  if (typeof body.AccessControllerEvent === 'string') {
    return safeJsonParse(body.AccessControllerEvent);
  }

  // A veces el body entero ES el evento
  if (body.employeeNoString != null || body.employeeNo != null || body.time != null) {
    return body;
  }

  for (const key of Object.keys(body)) {
    const val = body[key];
    if (typeof val === 'string' && val.includes('AccessControllerEvent')) {
      const parsed = safeJsonParse(val);
      if (parsed?.AccessControllerEvent) return parsed.AccessControllerEvent;
      if (parsed?.employeeNoString || parsed?.employeeNo) return parsed;
    }
    if (typeof val === 'string' && (val.includes('employeeNo') || val.includes('dateTime'))) {
      const parsed = safeJsonParse(val);
      if (parsed?.AccessControllerEvent) return parsed.AccessControllerEvent;
      if (parsed) return parsed;
    }
  }

  return null;
}

function parseEventDateTime(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  // 2024-07-31T08:05:22-05:00 o 2024-07-31T08:05:22
  const iso = s.match(
    /^(\d{4}-\d{2}-\d{2})[T\s](\d{2}):(\d{2}):(\d{2})/
  );
  if (iso) {
    return {
      fecha: iso[1],
      hora: `${iso[2]}:${iso[3]}:${iso[4]}`,
    };
  }
  const dmy = s.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (dmy) {
    return {
      fecha: `${dmy[3]}-${dmy[2]}-${dmy[1]}`,
      hora: `${dmy[4]}:${dmy[5]}:${dmy[6]}`,
    };
  }
  return null;
}

function normalizeEvent(ace, envelope) {
  if (!ace || typeof ace !== 'object') return null;

  const employeeNo = String(
    ace.employeeNoString ??
      ace.employeeNo ??
      dig(envelope, ['employeeNoString', 'employeeNo']) ??
      ''
  ).trim();

  const timeRaw =
    ace.time ||
    ace.dateTime ||
    dig(envelope, ['dateTime', 'time']) ||
    null;
  const dt = parseEventDateTime(timeRaw);
  if (!dt) return null;

  const hora = parseHoraMarcacion(dt.hora) || dt.hora;
  const name = String(ace.name || ace.employeeName || '').trim();
  let firstName = '';
  let lastName = '';
  if (name) {
    const parts = name.split(/\s+/);
    if (parts.length === 1) {
      firstName = parts[0];
    } else {
      lastName = parts[0];
      firstName = parts.slice(1).join(' ');
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
    name,
    metodo,
    majorEventType: ace.majorEventType,
    subEventType: ace.subEventType,
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
    // Migración 067 aún no aplicada
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

function matchPersonalBiometrico(event, personalList) {
  const code = String(event.employeeNo || '').trim();
  if (code) {
    const byCode = personalList.find(
      (p) =>
        p.codigo_biometrico != null &&
        String(p.codigo_biometrico).trim() === code
    );
    if (byCode) return { personal: byCode, via: 'codigo_biometrico' };

    const byDni = personalList.find(
      (p) => p.nro_documento != null && String(p.nro_documento).trim() === code
    );
    if (byDni) return { personal: byDni, via: 'nro_documento' };
  }

  if (event.firstName || event.lastName) {
    const byName = matchPersonal(
      event.firstName || event.name,
      event.lastName || '',
      personalList
    );
    if (byName) return { personal: byName, via: 'nombre' };
  }
  return null;
}

async function logEvento(row) {
  try {
    await execute(
      `INSERT INTO biometrico_eventos_log
        (colegio_id, dispositivo_ip, employee_no, personal_id, usuario_id, fecha, hora_marcacion,
         metodo_verificacion, nombre_evento, estado, detalle, payload_resumen)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
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

/**
 * Procesa un payload ya parseado (objeto).
 */
async function ingestHikvisionPayload(body, meta = {}) {
  const colegioId = parseInt(meta.colegioId || process.env.BIOMETRICO_COLEGIO_ID || DEFAULT_COLEGIO_ID, 10);
  const dispositivoIp = meta.ip || null;

  const ace = extractAccessControllerEvent(body);
  const event = normalizeEvent(ace, body);

  const resumen = JSON.stringify({
    keys: body && typeof body === 'object' ? Object.keys(body).slice(0, 20) : [],
    employeeNo: event?.employeeNo,
    fecha: event?.fecha,
    hora: event?.hora_marcacion,
    name: event?.name,
  });

  if (!event) {
    await logEvento({
      colegio_id: colegioId,
      dispositivo_ip: dispositivoIp,
      estado: 'OMITIDO',
      detalle: 'No se pudo parsear AccessControllerEvent',
      payload_resumen: resumen,
    });
    return { ok: false, reason: 'unparsed' };
  }

  // Filtrar eventos que no son marcación de asistencia (si vienen major/sub)
  // major 5 = event trigger; sub 75/76 often attendance. Si no hay datos, igual aceptamos si hay employee+time.
  const personalList = await loadPersonalForBiometrico(colegioId);
  const matched = matchPersonalBiometrico(event, personalList);

  if (!matched) {
    await logEvento({
      colegio_id: colegioId,
      dispositivo_ip: dispositivoIp,
      employee_no: event.employeeNo,
      fecha: event.fecha,
      hora_marcacion: event.hora_marcacion,
      metodo_verificacion: event.metodo,
      nombre_evento: event.name,
      estado: 'OMITIDO',
      detalle: 'Sin coincidencia de personal (configure codigo_biometrico o DNI = employeeNo)',
      payload_resumen: resumen,
    });
    return { ok: false, reason: 'no_match', employeeNo: event.employeeNo };
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
    return { ok: false, reason: 'no_user', personal_id: personal.personal_id };
  }

  const { anio } = await getAnioActivo(query, colegioId);

  // Si ya hay marcación ese día con hora igual o más temprana, no empeorar (primera entrada del día)
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
        estado: 'DUPLICADO',
        detalle: `Ya existe entrada ${prev}; se conserva la más temprana`,
        payload_resumen: resumen,
      });
      return { ok: true, action: 'kept_earlier', personal_id: personal.personal_id };
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

  return {
    ok: true,
    action,
    personal_id: personal.personal_id,
    via,
    fecha: event.fecha,
    hora: event.hora_marcacion,
  };
}

async function listRecentEvents(colegioId, limit = 50) {
  const lim = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
  return query(
    `SELECT l.*,
            CONCAT(COALESCE(p.apellidos,''), ', ', COALESCE(p.nombres,'')) AS personal_nombre
     FROM biometrico_eventos_log l
     LEFT JOIN personal p ON p.id = l.personal_id
     WHERE l.colegio_id = ?
     ORDER BY l.id DESC
     LIMIT ${lim}`,
    [colegioId]
  );
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
  extractAccessControllerEvent,
  normalizeEvent,
  listRecentEvents,
  webhookPublicUrl,
  loadPersonalForBiometrico,
};
