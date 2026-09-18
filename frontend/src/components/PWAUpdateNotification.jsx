import React, { useCallback, useEffect, useState } from 'react';
import './PWAUpdateNotification.css';

/**
 * Botón de respaldo si el service worker nuevo queda en waiting
 * (el recarga automático está en index.js vía controllerchange).
 */
function PWAUpdateNotification() {
  const [registration, setRegistration] = useState(null);
  const [waiting, setWaiting] = useState(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return undefined;

    let cancelled = false;
    navigator.serviceWorker.getRegistration().then((reg) => {
      if (cancelled || !reg) return;
      setRegistration(reg);
      if (reg.waiting) setWaiting(true);
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller && reg.waiting) {
            setWaiting(true);
          }
        });
      });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleUpdate = useCallback(() => {
    if (registration?.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      return;
    }
    window.location.reload();
  }, [registration]);

  if (!waiting) return null;

  return (
    <div className="pwa-update-notification">
      <button
        type="button"
        className="pwa-update-btn"
        onClick={handleUpdate}
        aria-label="Actualizar aplicación"
        title="Hay una nueva versión. Pulsa para actualizar."
      >
        Actualizar
      </button>
    </div>
  );
}

export default PWAUpdateNotification;
