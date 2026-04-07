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

    // 2. Detectar cambio de pestaña/ventana (Page Visibility API)
    const handleVisibilityChange = () => {
      if (document.hidden) {
        violationCountRef.current += 1;
        setViolations(violationCountRef.current);
        
        if (onViolation) {
          onViolation({
            type: 'TAB_CHANGE',
            count: violationCountRef.current,
            timestamp: new Date()
          });
        }

        // Si autoFinish está activado y hay muchas violaciones
        if (autoFinish && violationCountRef.current >= 3) {
          if (window.confirm('Has salido de la ventana del examen múltiples veces. ¿Deseas finalizar el examen ahora?')) {
            // Llamar función para finalizar
            if (onViolation) {
              onViolation({
                type: 'AUTO_FINISH',
                count: violationCountRef.current,
                timestamp: new Date()
              });
            }
          }
        }
      }
    };

        // 3. Detectar pérdida de foco de la ventana (solo si está visible)
        const handleBlur = () => {
          // Solo registrar si la ventana está visible (no oculta)
          if (!document.hidden) {
            violationCountRef.current += 1;
            setViolations(violationCountRef.current);
            
            if (onViolation) {
              onViolation({
                type: 'WINDOW_BLUR',
                count: violationCountRef.current,
                timestamp: new Date()
              });
            }
          }
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
      const touch = e.touches[0];
      if (touch.clientX <= 10 || touch.clientX >= window.innerWidth - 10) {
        // Swipe desde el borde - podría ser navegación del sistema
        violationCountRef.current += 1;
        setViolations(violationCountRef.current);
        
        if (onViolation) {
          onViolation({
            type: 'EDGE_SWIPE',
            count: violationCountRef.current,
            timestamp: new Date()
          });
        }
      }
    };

    // 6. Detectar intento de salir de pantalla completa
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && 
          !document.webkitFullscreenElement && 
          !document.mozFullScreenElement &&
          !document.msFullscreenElement) {
        // El usuario salió de pantalla completa
        violationCountRef.current += 1;
        setViolations(violationCountRef.current);
        
        if (onViolation) {
          onViolation({
            type: 'FULLSCREEN_EXIT',
            count: violationCountRef.current,
            timestamp: new Date()
          });
        }

        // Intentar volver a pantalla completa
        enableFullscreen();
      }
    };

    // Registrar event listeners
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);
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

