import { useEffect, useRef, useState } from 'react';

/**
 * Hook para proteger el examen contra salida de ventana
 * @param {Function} onViolation - Callback cuando se detecta una violación
 * @param {Boolean} autoFinish - Si true, finaliza el examen después de múltiples violaciones
 * @param {Boolean} enabled - Si false, no registra listeners ni pantalla completa (p. ej. examen solo PDF)
 */
export const useExamProtection = (onViolation, autoFinish = false, enabled = true) => {
  const [violations, setViolations] = useState(0);
  const violationCountRef = useRef(0);
  const fullscreenEnabled = useRef(false);
  const lastViolationRef = useRef({ type: null, timestampMs: 0 });
  const focusLossTimerRef = useRef(null);
  const isFocusLostRef = useRef(false);
  const offlineTimerRef = useRef(null);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    // 1. Intentar entrar en pantalla completa (solo en desktop, no en móviles/tablets)
    const enableFullscreen = async () => {
      try {
        // Detectar si es móvil o tablet
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        const isTablet = /iPad|Android/i.test(navigator.userAgent) && window.innerWidth <= 1024;
        
        // En móviles/tablets, no forzar pantalla completa pero sí bloquear otras acciones
        if (isMobile || isTablet) {
          console.log('Dispositivo móvil/tablet detectado - bloqueo de pantalla adaptado');
          return;
        }
        
        // En desktop, activar pantalla completa
        if (document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen();
          fullscreenEnabled.current = true;
        } else if (document.documentElement.webkitRequestFullscreen) {
          await document.documentElement.webkitRequestFullscreen();
          fullscreenEnabled.current = true;
        } else if (document.documentElement.mozRequestFullScreen) {
          await document.documentElement.mozRequestFullScreen();
          fullscreenEnabled.current = true;
        } else if (document.documentElement.msRequestFullscreen) {
          await document.documentElement.msRequestFullscreen();
          fullscreenEnabled.current = true;
        }
      } catch (error) {
        console.warn('No se pudo activar pantalla completa:', error);
      }
    };

    enableFullscreen();

    const limpiarTimerFoco = () => {
      if (focusLossTimerRef.current) {
        clearTimeout(focusLossTimerRef.current);
        focusLossTimerRef.current = null;
      }
    };

    const limpiarTimerOffline = () => {
      if (offlineTimerRef.current) {
        clearTimeout(offlineTimerRef.current);
        offlineTimerRef.current = null;
      }
    };

    const registrarViolacion = (type, options = {}) => {
      const ahora = Date.now();
      const ultima = lastViolationRef.current;
      const skipCooldown = options.skipCooldown === true;
      const COOLDOWN_GENERAL_MS = 2500;
      const COOLDOWN_MISMO_TIPO_MS = 5000;

      if (!skipCooldown) {
        // Evitar que una sola acción del sistema dispare múltiples eventos consecutivos.
        if (ahora - ultima.timestampMs < COOLDOWN_GENERAL_MS) {
          return;
        }

        // Evitar duplicados repetitivos del mismo evento (ej. EDGE_SWIPE continuo).
        if (ultima.type === type && ahora - ultima.timestampMs < COOLDOWN_MISMO_TIPO_MS) {
          return;
        }
      }

      lastViolationRef.current = { type, timestampMs: ahora };
      violationCountRef.current += 1;
      setViolations(violationCountRef.current);

      if (onViolation) {
        onViolation({
          type,
          count: violationCountRef.current,
          timestamp: new Date(ahora)
        });
      }

      if (autoFinish && violationCountRef.current >= 3) {
        if (window.confirm('Has salido de la ventana del examen múltiples veces. ¿Deseas finalizar el examen ahora?')) {
          if (onViolation) {
            onViolation({
              type: 'AUTO_FINISH',
              count: violationCountRef.current,
              timestamp: new Date(ahora)
            });
          }
        }
      }
    };

    const iniciarTimerFueraDeFoco = () => {
      if (isFocusLostRef.current) return;
      isFocusLostRef.current = true;
      limpiarTimerFoco();
      focusLossTimerRef.current = setTimeout(() => {
        if (isFocusLostRef.current) {
          registrarViolacion('OUT_OF_FOCUS_7S', { skipCooldown: true });
        }
      }, 7000);
    };

    const finalizarFueraDeFoco = () => {
      isFocusLostRef.current = false;
      limpiarTimerFoco();
    };

    // 2. Detectar cambio de pestaña/ventana (Page Visibility API)
    const handleVisibilityChange = () => {
      if (document.hidden) {
        iniciarTimerFueraDeFoco();
      } else if (document.hasFocus()) {
        finalizarFueraDeFoco();
      }
    };

    // 3. Detectar pérdida de foco de la ventana (solo si está visible)
    const handleBlur = () => {
      iniciarTimerFueraDeFoco();
    };

    const handleFocus = () => {
      if (!document.hidden) {
        finalizarFueraDeFoco();
      }
    };

    // 3b. Detectar pérdida de internet sostenida (10 segundos)
    const handleOffline = () => {
      limpiarTimerOffline();
      offlineTimerRef.current = setTimeout(() => {
        if (navigator.onLine === false) {
          registrarViolacion('INTERNET_LOSS', { skipCooldown: true });
        }
      }, 10000);
    };

    const handleOnline = () => {
      limpiarTimerOffline();
    };

    // 4. Prevenir cierre accidental del navegador
    const handleBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = '⚠️ ¿Estás seguro de salir? El examen se finalizará automáticamente.';
      return e.returnValue;
    };

    // 5. Detectar teclas de atajo (desktop) y gestos táctiles (móviles/tablets)
    const handleKeyDown = (e) => {
      // Bloquear F11 (salir de pantalla completa)
      if (e.key === 'F11') {
        e.preventDefault();
      }
      
      // Bloquear Alt+Tab (en algunos navegadores)
      if (e.altKey && e.key === 'Tab') {
        e.preventDefault();
      }
      
      // Bloquear Ctrl+W (cerrar pestaña)
      if (e.ctrlKey && e.key === 'w') {
        e.preventDefault();
        alert('⚠️ No puedes cerrar la pestaña durante el examen');
      }

      // Bloquear Ctrl+T (nueva pestaña)
      if (e.ctrlKey && e.key === 't') {
        e.preventDefault();
      }

      // Bloquear Ctrl+Shift+T (reabrir pestaña)
      if (e.ctrlKey && e.shiftKey && e.key === 'T') {
        e.preventDefault();
      }
    };

    // Bloquear gestos táctiles en móviles/tablets (swipe para cambiar app, etc.)
    const handleTouchStart = (e) => {
      // Permitir toques normales pero detectar gestos de navegación
      if (e.touches.length > 1) {
        // Multi-touch podría ser un gesto de navegación
        e.preventDefault();
      }
    };

    const handleTouchMove = (e) => {
      // Detectar swipe desde los bordes (gesto de navegación del sistema)
      if (!e.touches || e.touches.length === 0) return;
      const touch = e.touches[0];
      if (touch.clientX <= 10 || touch.clientX >= window.innerWidth - 10) {
        // Swipe desde el borde - podría ser navegación del sistema
        registrarViolacion('EDGE_SWIPE');
      }
    };

    // 6. Detectar intento de salir de pantalla completa
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && 
          !document.webkitFullscreenElement && 
          !document.mozFullScreenElement &&
          !document.msFullscreenElement) {
        // El usuario salió de pantalla completa
        registrarViolacion('FULLSCREEN_EXIT');

        // Intentar volver a pantalla completa
        enableFullscreen();
      }
    };

    // Registrar event listeners
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);
    
    // Event listeners para móviles/tablets
    document.addEventListener('touchstart', handleTouchStart, { passive: false });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });

    // Bloquear clic derecho
    const handleContextMenu = (e) => {
      e.preventDefault();
      return false;
    };
    document.addEventListener('contextmenu', handleContextMenu);

    // Bloquear selección de texto
    const handleSelectStart = (e) => {
      e.preventDefault();
      return false;
    };
    document.addEventListener('selectstart', handleSelectStart);

    // Bloquear copiar/pegar
    const handleCopy = (e) => {
      e.preventDefault();
      return false;
    };
    const handlePaste = (e) => {
      e.preventDefault();
      return false;
    };
    document.addEventListener('copy', handleCopy);
    document.addEventListener('paste', handlePaste);

    // Cleanup
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('selectstart', handleSelectStart);
      document.removeEventListener('copy', handleCopy);
      document.removeEventListener('paste', handlePaste);
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      limpiarTimerFoco();
      limpiarTimerOffline();

      // Salir de pantalla completa al desmontar (solo si está activa)
      if (fullscreenEnabled.current) {
        try {
          if (document.fullscreenElement && document.exitFullscreen) {
            document.exitFullscreen().catch(() => {});
          } else if (document.webkitFullscreenElement && document.webkitExitFullscreen) {
            document.webkitExitFullscreen().catch(() => {});
          } else if (document.mozFullScreenElement && document.mozCancelFullScreen) {
            document.mozCancelFullScreen().catch(() => {});
          } else if (document.msFullscreenElement && document.msExitFullscreen) {
            document.msExitFullscreen().catch(() => {});
          }
        } catch (error) {
          // Ignorar errores al salir de fullscreen
        }
      }
    };
  }, [onViolation, autoFinish, enabled]);

  return { violations, fullscreenEnabled: fullscreenEnabled.current };
};

