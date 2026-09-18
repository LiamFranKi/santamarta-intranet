// Service Worker: push + toma de control. No cachea la intranet
// (evita menús y pantallas viejas en el celular). La versión la sella
// frontend/scripts/build-safe.js en cada npm run build.
const CACHE_VERSION = '__SW_BUILD_ID__';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.map((name) => caches.delete(name))))
      .then(() => self.clients.claim())
  );
  void CACHE_VERSION;
});

// No interceptar fetch: HTML/JS salen de red + caché HTTP del navegador.
// Así un deploy nuevo no queda tapado por Cache Storage.

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('push', (event) => {
  let notificationData = {
    title: 'Vanguard Schools',
    body: 'Tienes una nueva notificación',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-192x192.png',
    vibrate: [200, 100, 200],
    data: {
      url: '/'
    }
  };

  if (event.data) {
    try {
      const data = event.data.json();
      notificationData = {
        title: data.title || notificationData.title,
        body: data.body || notificationData.body,
        icon: data.icon || notificationData.icon,
        badge: data.badge || notificationData.badge,
        vibrate: data.vibrate || notificationData.vibrate,
        data: data.data || notificationData.data,
        tag: data.tag || 'default',
        requireInteraction: data.requireInteraction || false
      };
    } catch (e) {
      console.error('Error parseando datos de push:', e);
    }
  }

  event.waitUntil(self.registration.showNotification(notificationData.title, notificationData));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const raw = event.notification.data && event.notification.data.url ? String(event.notification.data.url) : '/';
  let pathForRouter = raw;
  try {
    if (raw.startsWith('http://') || raw.startsWith('https://')) {
      const u = new URL(raw);
      pathForRouter = u.pathname + u.search + u.hash;
    } else if (!raw.startsWith('/')) {
      pathForRouter = '/' + raw;
    }
  } catch (e) {
    pathForRouter = '/';
  }
  const fullUrl = new URL(pathForRouter, self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if ('focus' in client) {
          try {
            client.postMessage({ type: 'NAVIGATE_FROM_SW', path: pathForRouter });
          } catch (err) {
            console.warn('SW: postMessage falló', err);
          }
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(fullUrl);
      }
      return undefined;
    })
  );
});
