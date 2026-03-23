// Service Worker para PWA con actualización automática
// Este archivo se copia automáticamente al build por react-scripts
// IMPORTANTE: La versión del cache se actualiza automáticamente en cada build

// Versión del cache (se actualiza automáticamente en cada build)
// React Scripts genera un hash único para cada build, así que el navegador detecta cambios
const CACHE_VERSION = 'vanguard-intranet-v1.0.0';
const CACHE_NAME = `vanguard-intranet-${CACHE_VERSION}`;

// Archivos críticos para cache inicial (estos se cachean en la instalación)
const urlsToCache = [
  '/',
  '/manifest.json'
];

// Instalación del Service Worker
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('✅ Service Worker: Cache abierto');
        return cache.addAll(urlsToCache);
      })
      .catch((error) => {
        console.error('❌ Service Worker: Error al cachear', error);
      })
  );
  // Forzar activación inmediata
  self.skipWaiting();
});

// Activación del Service Worker
self.addEventListener('activate', (event) => {
  console.log('🔄 Service Worker: Activando nueva versión', CACHE_VERSION);
  
  event.waitUntil(
    Promise.all([
      // Limpiar caches antiguos
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              console.log('🗑️ Service Worker: Eliminando cache antiguo', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      }),
      // Tomar control inmediato de todas las páginas abiertas
      self.clients.claim()
    ]).then(() => {
      // Notificar a todas las páginas que hay una nueva versión
      return self.clients.matchAll({ includeUncontrolled: true, type: 'window' }).then((clients) => {
        clients.forEach((client) => {
          client.postMessage({
            type: 'SW_UPDATED',
            version: CACHE_VERSION,
            message: 'Nueva versión de la aplicación disponible'
          });
        });
      });
    })
  );
});

// Estrategia: Network First, luego Cache
// Esta estrategia asegura que siempre se obtenga la versión más reciente de los archivos
self.addEventListener('fetch', (event) => {
  // Solo cachear peticiones GET
  if (event.request.method !== 'GET') {
    return;
  }

  // No cachear peticiones a la API (siempre usar la red)
  if (event.request.url.includes('/api/')) {
    return;
  }

  // Estrategia: Network First (intentar red primero, luego cache)
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Si la respuesta es válida, clonarla y guardarla en cache
        if (response && response.status === 200) {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => {
        // Si falla la red, intentar desde cache
        return caches.match(event.request).then((response) => {
          if (response) {
            console.log('📦 Service Worker: Sirviendo desde cache', event.request.url);
            return response;
          }
          // Si no hay en cache, devolver una respuesta por defecto
          return new Response('Sin conexión', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: new Headers({
              'Content-Type': 'text/plain'
            })
          });
        });
      })
  );
});

// Escuchar mensajes desde la página principal
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    // Si la página solicita saltar la espera, activar inmediatamente
    self.skipWaiting();
  }
});

// Manejar notificaciones push
self.addEventListener('push', (event) => {
  console.log('📬 Service Worker: Push notification recibida', event);
  
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

  // Si el evento tiene datos, usarlos
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

  event.waitUntil(
    self.registration.showNotification(notificationData.title, notificationData)
  );
});

// Manejar clics en notificaciones (deep links: ruta relativa o absoluta)
self.addEventListener('notificationclick', (event) => {
  console.log('👆 Service Worker: Notificación clickeada', event);
  
  event.notification.close();

  const raw = (event.notification.data && event.notification.data.url) ? String(event.notification.data.url) : '/';
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
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
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
      })
  );
});

