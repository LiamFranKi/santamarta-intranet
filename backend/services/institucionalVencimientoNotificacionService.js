/**
 * Avisos por fecha de vencimiento de documentos institucionales (PDF admin).
 * Solo destinatarios: usuarios tipo ADMINISTRADOR del mismo colegio.
 * Fases (día calendario Lima vs fecha_vencimiento): 10 días antes, 5, 1, mismo día, día siguiente al vencimiento.
 * Campanita (tabla notificaciones) + push web si hay suscripción.
 */
const moment = require('moment-timezone');
const { query, execute } = require('../utils/mysql');
const { insertNotificacionUsuario } = require('../utils/notificacionInsert');
const { enviarPushNotificacionesIndividuales } = require('./pushNotificationService');

const ZONA = 'America/Lima';

/** Días hasta la fecha de vencimiento (entero): 10 → aviso "10 días antes"; 0 → hoy; -1 → día después de vencer */
function faseParaDiasRestantes(daysUntil) {
  if (daysUntil === 10) return 'ANTES_10';
  if (daysUntil === 5) return 'ANTES_5';
  if (daysUntil === 1) return 'ANTES_1';
  if (daysUntil === 0) return 'HOY';
  if (daysUntil === -1) return 'DIA_DESPUES';
  return null;
}

function fechaVencimientoMoment(fechaRaw) {
  const s =
    fechaRaw instanceof Date
      ? moment(fechaRaw).tz(ZONA).format('YYYY-MM-DD')
      : String(fechaRaw || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return moment.tz(s, 'YYYY-MM-DD', ZONA).startOf('day');
}

function fmtFechaPe(m) {
  try {
    return m.toDate().toLocaleDateString('es-PE', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  } catch {
    return m.format('YYYY-MM-DD');
  }
}

async function obtenerIdsSoloAdministradoresColegio(colegio_id) {
  const rows = await query(
    `SELECT id FROM usuarios
     WHERE colegio_id = ? AND tipo = 'ADMINISTRADOR'
       AND (estado = 'ACTIVO' OR estado IS NULL)`,
    [colegio_id]
  );
  return (rows || []).map((r) => parseInt(r.id, 10)).filter(Boolean);
}

async function yaRegistradoEnvio(documento_id, fase) {
  const rows = await query(
    `SELECT 1 FROM institucional_notif_vencimiento_log WHERE documento_id = ? AND fase = ? LIMIT 1`,
    [documento_id, fase]
  );
  return rows && rows.length > 0;
}

function textoAsuntoYContenido(docTitulo, fase, mVenc) {
  const nombre = String(docTitulo || 'Documento').trim() || 'Documento';
  const fechaTxt = fmtFechaPe(mVenc);

  switch (fase) {
    case 'ANTES_10':
      return {
        asunto: 'Institucional: vencimiento en 10 días',
        contenido: `«${nombre}». Fecha de vencimiento: ${fechaTxt}. Quedan 10 días.`
      };
    case 'ANTES_5':
      return {
        asunto: 'Institucional: vencimiento en 5 días',
        contenido: `«${nombre}». Fecha de vencimiento: ${fechaTxt}. Quedan 5 días.`
      };
    case 'ANTES_1':
      return {
        asunto: 'Institucional: vence mañana',
        contenido: `«${nombre}». Fecha de vencimiento: ${fechaTxt}. Falta 1 día.`
      };
    case 'HOY':
      return {
        asunto: 'Institucional: vence hoy',
        contenido: `«${nombre}». Fecha de vencimiento: ${fechaTxt} (hoy).`
      };
    case 'DIA_DESPUES':
      return {
        asunto: 'Institucional: documento vencido',
        contenido: `«${nombre}». La fecha de vencimiento fue ${fechaTxt} (ayer). Revise o actualice el documento.`
      };
    default:
      return { asunto: 'Institucional', contenido: nombre };
  }
}

function tituloPushCorto(fase) {
  const map = {
    ANTES_10: 'Institucional: 10 días',
    ANTES_5: 'Institucional: 5 días',
    ANTES_1: 'Institucional: vence mañana',
    HOY: 'Institucional: vence hoy',
    DIA_DESPUES: 'Institucional: vencido'
  };
  return map[fase] || 'Institucional';
}

let warnedSinTablaLog = false;

/**
 * Ejecutar una vez por ciclo (p. ej. cada 24 h). Usa fecha local Lima.
 */
async function ejecutarNotificacionesInstitucionalVencimiento() {
  try {
    await query('SELECT 1 FROM institucional_notif_vencimiento_log LIMIT 1', []);
  } catch (e) {
    if (!warnedSinTablaLog) {
      console.warn(
        '📋 [INSTITUCIONAL-VENC] Ejecute la migración 025 (tabla institucional_notif_vencimiento_log). Avisos desactivados hasta entonces.'
      );
      warnedSinTablaLog = true;
    }
    return;
  }

  const hoy = moment.tz(ZONA).startOf('day');

  let docs;
  try {
    docs = await query(
      `SELECT id, colegio_id, titulo, fecha_vencimiento, subido_por_usuario_id
       FROM institucional_documentos
       WHERE activo = 1 AND fecha_vencimiento IS NOT NULL`,
      []
    );
  } catch (e) {
    if (String(e.message || '').includes('institucional_documentos')) {
      console.warn('📋 [INSTITUCIONAL-VENC] Tabla institucional_documentos no disponible. Omitiendo.');
      return;
    }
    throw e;
  }

  if (!docs || docs.length === 0) {
    console.log('📋 [INSTITUCIONAL-VENC] Sin documentos con fecha de vencimiento.');
    return;
  }

  const adminsCache = new Map();
  const getAdmins = async (colegio_id) => {
    if (adminsCache.has(colegio_id)) return adminsCache.get(colegio_id);
    const ids = await obtenerIdsSoloAdministradoresColegio(colegio_id);
    adminsCache.set(colegio_id, ids);
    return ids;
  };

  let enviados = 0;

  for (const doc of docs) {
    const mVenc = fechaVencimientoMoment(doc.fecha_vencimiento);
    if (!mVenc || !mVenc.isValid()) continue;

    const daysUntil = mVenc.diff(hoy, 'days');
    const fase = faseParaDiasRestantes(daysUntil);
    if (!fase) continue;

    if (await yaRegistradoEnvio(doc.id, fase)) continue;

    const adminIds = await getAdmins(doc.colegio_id);
    if (adminIds.length === 0) continue;

    let emisorId = adminIds[0];
    const sub = doc.subido_por_usuario_id ? parseInt(doc.subido_por_usuario_id, 10) : null;
    if (sub && adminIds.includes(sub)) emisorId = sub;

    const fechaStr = mVenc.format('YYYY-MM-DD');
    const { asunto, contenido } = textoAsuntoYContenido(doc.titulo, fase, mVenc);

    for (const did of adminIds) {
      try {
        await insertNotificacionUsuario(execute, {
          usuario_id: emisorId,
          destinatario_id: did,
          asunto,
          contenido,
          estado: 'ENVIADO',
          accion_tipo: 'institucional_doc_vencimiento',
          accion_payload: {
            documento_id: doc.id,
            fase,
            fecha_vencimiento: fechaStr
          },
          url_destino: '/admin/institucional'
        });
      } catch (e) {
        console.warn(`📋 [INSTITUCIONAL-VENC] Campanita usuario ${did}:`, e.message);
      }
    }

    try {
      await execute(
        `INSERT INTO institucional_notif_vencimiento_log (documento_id, fase) VALUES (?, ?)`,
        [doc.id, fase]
      );
    } catch (e) {
      console.warn('📋 [INSTITUCIONAL-VENC] No se pudo registrar envío en log:', e.message);
    }

    enviados += 1;

    const ph = adminIds.map(() => '?').join(',');
    let subsData;
    try {
      subsData = await query(
        `SELECT usuario_id, endpoint, p256dh, auth FROM push_subscriptions
         WHERE usuario_id IN (${ph}) AND colegio_id = ? AND (activo = 1 OR activo IS NULL)`,
        [...adminIds, doc.colegio_id]
      );
    } catch (e) {
      subsData = [];
    }

    if (subsData && subsData.length > 0) {
      const urlDestino = '/admin/institucional';
      const bodyPush = contenido.length > 110 ? `${contenido.slice(0, 107)}…` : contenido;
      const pushItems = subsData.map((sub) => ({
        subscription: {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth }
        },
        payload: {
          title: tituloPushCorto(fase),
          body: bodyPush,
          icon: '/icons/icon-192x192.png',
          badge: '/icons/icon-192x192.png',
          vibrate: [120, 60, 120],
          tag: `inst-doc-${doc.id}-${fase}-${fechaStr}`,
          data: {
            url: urlDestino,
            tipo: 'institucional_doc_vencimiento',
            documento_id: doc.id,
            fase
          }
        }
      }));
      enviarPushNotificacionesIndividuales(pushItems).catch((err) =>
        console.warn('📋 [INSTITUCIONAL-VENC] Push:', err.message)
      );
    }
  }

  if (enviados > 0) {
    console.log(`📋 [INSTITUCIONAL-VENC] Procesados avisos nuevos para ${enviados} documento(s). Fecha Lima: ${hoy.format('YYYY-MM-DD')}`);
  }
}

module.exports = {
  ejecutarNotificacionesInstitucionalVencimiento,
  faseParaDiasRestantes
};
