import api from './api';

/**
 * Solicitar permiso de notificaciones y suscribirse automáticamente
 * Esta función se llama automáticamente cuando el usuario inicia sesión
 */
export async function suscribirNotificacionesPush() {
  try {
    // Verificar que el navegador soporte notificaciones
    if (!('Notification' in window)) {
      console.warn('⚠️ Este navegador no soporta notificaciones');
      return { success: false, error: 'Navegador no compatible' };
    }

    // Verificar que el Service Worker esté registrado
    if (!('serviceWorker' in navigator)) {
      console.warn('⚠️ Este navegador no soporta Service Workers');
      return { success: false, error: 'Service Worker no disponible' };
    }

    // Obtener la clave pública VAPID
    const publicKeyResponse = await api.get('/push/public-key');
    const publicKey = publicKeyResponse.data.publicKey;

    if (!publicKey) {
      console.warn('⚠️ VAPID public key no configurada');
      return { success: false, error: 'VAPID key no configurada' };
    }

    // Verificar estado actual del permiso
    let permission = Notification.permission;

    // Si el permiso es "default" (no se ha preguntado), intentar solicitar automáticamente
    // NOTA: En algunos navegadores, esto requiere interacción del usuario
    // Pero podemos intentar solicitarlo automáticamente
    if (permission === 'default') {
      try {
        permission = await Notification.requestPermission();
      } catch (error) {
        console.warn('⚠️ Error solicitando permiso:', error);
        // Si falla, intentar de nuevo más tarde (después de interacción del usuario)
        return { success: false, error: 'Permiso denegado o no disponible', retry: true };
      }
    }

    if (permission !== 'granted') {
      console.warn('⚠️ Permiso de notificaciones denegado');
      return { success: false, error: 'Permiso denegado', permission };
    }

    // Obtener el Service Worker registration
    const registration = await navigator.serviceWorker.ready;

    // Suscribirse a push notifications
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey)
    });

    // Enviar la suscripción al backend
    await api.post('/push/subscribe', {
      subscription: {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: arrayBufferToBase64(subscription.getKey('p256dh')),
          auth: arrayBufferToBase64(subscription.getKey('auth'))
        }
      }
    });

    console.log('✅ Suscripción a push notifications exitosa');
    return { success: true, subscription };
  } catch (error) {
    console.error('❌ Error suscribiendo a push notifications:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Convertir clave pública VAPID de base64 URL a Uint8Array
 */
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Convertir ArrayBuffer a base64
 */
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

/**
 * Desuscribir de notificaciones push (para renovar suscripción expirada 410)
 * Llama a pushManager.unsubscribe() y notifica al backend
 */
export async function desuscribirNotificacionesPush() {
  try {
    if (!('serviceWorker' in navigator)) {
      return { success: false, error: 'Service Worker no disponible' };
    }

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      await subscription.unsubscribe();
      await api.post('/push/unsubscribe', { endpoint: subscription.endpoint });
      console.log('✅ Desuscripción push exitosa');
      return { success: true };
    }

    // No hay suscripción local: marcar todas las del usuario como inactivas (cleanup)
    await api.post('/push/unsubscribe-all');
    return { success: true };
  } catch (error) {
    console.error('❌ Error desuscribiendo push:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Verificar si las notificaciones están habilitadas
 */
export function verificarEstadoNotificaciones() {
  if (!('Notification' in window)) {
    return { disponible: false, permiso: 'no-soportado' };
  }
  return {
    disponible: true,
    permiso: Notification.permission
  };
}

/**
 * Verificar si hay una suscripción push activa en este dispositivo
 */
export async function tieneSuscripcionPushActiva() {
  try {
    if (!('serviceWorker' in navigator)) return false;
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return !!sub;
  } catch {
    return false;
  }
}




