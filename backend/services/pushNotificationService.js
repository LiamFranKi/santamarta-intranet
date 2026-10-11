const webpush = require('web-push');
const { isPushQuietHoursLima } = require('../utils/pushQuietHours');
const { execute } = require('../utils/mysql');
const { resolverLogoVariante } = require('../utils/logoColegio');

let iconoPushCache = { at: 0, url: null };

async function urlIconoPush() {
  if (Date.now() - iconoPushCache.at < 30000) return iconoPushCache.url;
  try {
    const icono = await resolverLogoVariante('icono_app');
    const url = icono.desdeConfig && icono.urlPath ? icono.urlPath : null;
    iconoPushCache = { at: Date.now(), url };
    return url;
  } catch (_) {
    iconoPushCache = { at: Date.now(), url: null };
    return null;
  }
}

async function conIconoColegio(payload) {
  const url = await urlIconoPush();
  if (!url || !payload || typeof payload !== 'object') return payload;
  return { ...payload, icon: url, badge: url };
}

// Configurar VAPID keys (si están en .env)
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    `mailto:${process.env.VAPID_EMAIL || process.env.EMAIL_USER}`,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
  console.log(`📱 [PUSH] VAPID keys configuradas correctamente`);
} else {
  console.error(`❌ [PUSH] VAPID keys no configuradas en .env`);
}

// Errores de red que merecen reintento (ECONNRESET, ETIMEDOUT, etc.)
const ERRORES_RETRY = ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'socket hang up'];

function esErrorRetryable(error) {
  const msg = (error && error.message) ? String(error.message) : '';
  const code = error && error.code;
  return ERRORES_RETRY.some(e => msg.includes(e) || code === e);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Enviar notificación push a un dispositivo (con retry para ECONNRESET)
 */
async function enviarPushNotification(subscription, payload, intento = 1) {
  const maxIntentos = 3;
  try {
    if (isPushQuietHoursLima()) {
      return { success: false, skipped: true, reason: 'quiet_hours' };
    }
    if (!subscription || !subscription.endpoint) {
      console.warn('⚠️ [PUSH] Subscription inválida para push notification');
      return { success: false, error: 'Subscription inválida' };
    }

    if (!subscription.keys || !subscription.keys.p256dh || !subscription.keys.auth) {
      console.warn('⚠️ [PUSH] Subscription sin keys válidas');
      return { success: false, error: 'Subscription sin keys' };
    }

    console.log(`📱 [PUSH] Enviando notificación a: ${subscription.endpoint.substring(0, 50)}...`);
    const aviso = await conIconoColegio(payload);
    const result = await webpush.sendNotification(subscription, JSON.stringify(aviso));
    console.log(`✅ [PUSH] Notificación enviada exitosamente. StatusCode: ${result.statusCode}`);
    return { success: true, statusCode: result.statusCode };
  } catch (error) {
    if (error.statusCode === 410 || error.statusCode === 404) {
      return { success: false, error: 'Subscription expirada', expired: true, statusCode: error.statusCode };
    }
    if (esErrorRetryable(error) && intento < maxIntentos) {
      const delayMs = 400 * intento;
      console.warn(`⚠️ [PUSH] ${error.message} - Reintento ${intento + 1}/${maxIntentos} en ${delayMs}ms...`);
      await sleep(delayMs);
      return enviarPushNotification(subscription, payload, intento + 1);
    }
    console.error(`❌ [PUSH] Error enviando push notification:`, error.message, `StatusCode: ${error.statusCode}`);
    return { success: false, error: error.message, statusCode: error.statusCode };
  }
}

// Tamaño de lote para evitar saturar conexiones (ECONNRESET al enviar muchas a la vez)
const BATCH_SIZE = 4;

/**
 * Enviar notificación push a múltiples dispositivos (apoderados)
 * Envía en lotes para reducir ECONNRESET; cada push tiene retry interno
 */
async function enviarPushNotificationMultiple(subscriptions, payload) {
  if (!subscriptions || subscriptions.length === 0) return [];
  if (isPushQuietHoursLima()) {
    const qh = process.env.PUSH_QUIET_START_HOUR || '22';
    const qe = process.env.PUSH_QUIET_END_HOUR || '7';
    console.log(
      `🔕 [PUSH] ${subscriptions.length} omitido(s): ventana silenciosa America/Lima (${qh}:00–${qe}:00). Campanita u otros canales no se ven afectados por esta capa.`
    );
    return subscriptions.map((subscription) => ({
      subscription,
      resultado: { success: false, skipped: true, reason: 'quiet_hours' },
    }));
  }
  const resultados = [];
  for (let i = 0; i < subscriptions.length; i += BATCH_SIZE) {
    const lote = subscriptions.slice(i, i + BATCH_SIZE);
    const promesas = lote.map(async (subscription) => {
      const resultado = await enviarPushNotification(subscription, payload);
      return { subscription, resultado };
    });
    const loteResultados = await Promise.all(promesas);
    resultados.push(...loteResultados);
    if (i + BATCH_SIZE < subscriptions.length) {
      await sleep(150); // Pequeña pausa entre lotes para evitar saturar
    }
  }
  await desactivarSuscripcionesExpiradas(resultados);
  return resultados;
}

/**
 * Envía un payload distinto por suscripción (misma notificación, distinta URL / data).
 * @param {Array<{ subscription: object, payload: object }>} items
 */
async function enviarPushNotificacionesIndividuales(items) {
  if (!items || items.length === 0) return [];
  if (isPushQuietHoursLima()) {
    const qh = process.env.PUSH_QUIET_START_HOUR || '22';
    const qe = process.env.PUSH_QUIET_END_HOUR || '7';
    console.log(
      `🔕 [PUSH] ${items.length} omitido(s): ventana silenciosa America/Lima (${qh}:00–${qe}:00).`
    );
    return items.map(({ subscription }) => ({
      subscription,
      resultado: { success: false, skipped: true, reason: 'quiet_hours' },
    }));
  }
  const resultados = [];
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const lote = items.slice(i, i + BATCH_SIZE);
    const promesas = lote.map(async ({ subscription, payload }) => {
      const resultado = await enviarPushNotification(subscription, payload);
      return { subscription, resultado };
    });
    const loteResultados = await Promise.all(promesas);
    resultados.push(...loteResultados);
    if (i + BATCH_SIZE < items.length) {
      await sleep(150);
    }
  }
  await desactivarSuscripcionesExpiradas(resultados);
  return resultados;
}

async function desactivarSuscripcionesExpiradas(resultados) {
  const endpoints = [
    ...new Set(
      (resultados || [])
        .filter((r) => r?.resultado?.expired && r.subscription?.endpoint)
        .map((r) => r.subscription.endpoint)
    ),
  ];
  if (!endpoints.length) return 0;
  try {
    for (const endpoint of endpoints) {
      await execute('UPDATE push_subscriptions SET activo = 0 WHERE endpoint = ?', [endpoint]);
    }
    console.log(`📱 [PUSH] ${endpoints.length} suscripción(es) expiradas (410/404) desactivadas`);
  } catch (e) {
    console.warn('[PUSH] No se pudieron desactivar suscripciones expiradas:', e.message);
  }
  return endpoints.length;
}

module.exports = {
  enviarPushNotification,
  enviarPushNotificationMultiple,
  enviarPushNotificacionesIndividuales,
  isPushQuietHoursLima,
};

