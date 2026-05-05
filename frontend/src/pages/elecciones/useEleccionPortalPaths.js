import { useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

/** Debe coincidir con ELECCIONES_PORTAL_STAFF_TIPOS en App.js (vista previa admin/promotoría). */
const STAFF_ELECC_PREVIEW = new Set(['ADMINISTRADOR', 'SECRETARIA', 'PROMOTORIA', 'PSICOLOGA']);

/**
 * Rutas alumno (/alumno/elecciones) vs portal campaña (/elecciones-campana).
 * El personal de gestión usa la misma API que el portal al abrir URL de alumno (el backend /alumno solo acepta ALUMNO).
 */
export function useEleccionPortalPaths() {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const isCampana = pathname.startsWith('/elecciones-campana');
  const tipo = String(user?.tipo || '').toUpperCase();

  if (isCampana) {
    return {
      isCampana: true,
      apiPrefix: '/elecciones/portal',
      routeBase: '/elecciones-campana'
    };
  }

  if (pathname.startsWith('/alumno/elecciones') && STAFF_ELECC_PREVIEW.has(tipo)) {
    return {
      isCampana: false,
      apiPrefix: '/elecciones/portal',
      routeBase: '/alumno/elecciones'
    };
  }

  return {
    isCampana: false,
    apiPrefix: '/elecciones/alumno',
    routeBase: '/alumno/elecciones'
  };
}
