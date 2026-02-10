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

/**
 * Enviar notificación push a un dispositivo
 */
async function enviarPushNotification(subscription, payload) {
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
    console.error(`❌ [PUSH] Error enviando push notification:`, error.message);
    console.error(`❌ [PUSH] StatusCode:`, error.statusCode);
    
    // Si el error es 410 (Gone) o 404 (Not Found), la subscription ya no es válida
    if (error.statusCode === 410 || error.statusCode === 404) {
      console.warn(`⚠️ [PUSH] Subscription expirada o no encontrada (${error.statusCode})`);
      return { success: false, error: 'Subscription expirada', expired: true };
    }
    
    return { success: false, error: error.message, statusCode: error.statusCode };
  }
}

/**
 * Enviar notificación push a múltiples dispositivos (apoderados)
 */
async function enviarPushNotificationMultiple(subscriptions, payload) {
  const resultados = [];
  
  for (const subscription of subscriptions) {
    const resultado = await enviarPushNotification(subscription, payload);
    resultados.push({ subscription, resultado });
  }
  
  return resultados;
}

module.exports = {
  enviarPushNotification,
  enviarPushNotificationMultiple
};

