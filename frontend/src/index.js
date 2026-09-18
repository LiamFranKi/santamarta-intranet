import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

// Suprimir advertencia de findDOMNode de ReactQuill (problema conocido de la librería)
// Esta advertencia no afecta la funcionalidad y será resuelta en futuras versiones de ReactQuill
const originalWarn = console.warn;
const originalError = console.error;

console.warn = (...args) => {
  const message = args[0];
  if (
    (typeof message === 'string' && message.includes('findDOMNode is deprecated')) ||
    (typeof message === 'string' && message.includes('findDOMNode'))
  ) {
    // Suprimir solo la advertencia de findDOMNode
    return;
  }
  originalWarn.apply(console, args);
};

console.error = (...args) => {
  const message = args[0];
  if (
    (typeof message === 'string' && message.includes('findDOMNode is deprecated')) ||
    (typeof message === 'string' && message.includes('findDOMNode'))
  ) {
    // Suprimir solo el error de findDOMNode
    return;
  }
  originalError.apply(console, args);
};

// Service Worker: push + recarga una vez si hay versión nueva (no cachea la app).
if ('serviceWorker' in navigator) {
  let recargarSiCambiaControl = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!recargarSiCambiaControl) {
      recargarSiCambiaControl = true;
      return;
    }
    window.location.reload();
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/service-worker.js', { updateViaCache: 'none' })
      .then((registration) => {
        const pedirUpdate = () => {
          registration.update().catch(() => {});
        };
        pedirUpdate();
        setInterval(pedirUpdate, 3600000);
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') pedirUpdate();
        });
        window.addEventListener('focus', pedirUpdate);
      })
      .catch((error) => {
        console.warn('⚠️ Service Worker no se pudo registrar:', error);
      });
  });
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

