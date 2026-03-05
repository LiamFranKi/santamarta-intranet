const webpush = require('web-push');

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
    if (!subscription || !subscription.endpoint) {
      console.warn('⚠️ [PUSH] Subscription inválida para push notification');
      return { success: false, error: 'Subscription inválida' };
    }

    if (!subscription.keys || !subscription.keys.p256dh || !subscription.keys.auth) {
      console.warn('⚠️ [PUSH] Subscription sin keys válidas');
      return { success: false, error: 'Subscription sin keys' };
    }

    console.log(`📱 [PUSH] Enviando notificación a: ${subscription.endpoint.substring(0, 50)}...`);
    const result = await webpush.sendNotification(subscription, JSON.stringify(payload));
    console.log(`✅ [PUSH] Notificación enviada exitosamente. StatusCode: ${result.statusCode}`);
    return { success: true, statusCode: result.statusCode };
  } catch (error) {
    if (error.statusCode === 410 || error.statusCode === 404) {
      console.warn(`⚠️ [PUSH] Subscription expirada (${error.statusCode}) - endpoint: ${(subscription.endpoint || '').substring(0, 50)}...`);
      return { success: false, error: 'Subscription expirada', expired: true };
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
  return resultados;
}

module.exports = {
  enviarPushNotification,
  enviarPushNotificationMultiple
};

