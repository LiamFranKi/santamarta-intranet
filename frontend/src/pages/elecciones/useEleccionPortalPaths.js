import { useLocation } from 'react-router-dom';

/**
 * Rutas alumno (/alumno/elecciones) vs portal campaña (/elecciones-campana).
 */
export function useEleccionPortalPaths() {
  const { pathname } = useLocation();
  const isCampana = pathname.startsWith('/elecciones-campana');
  if (isCampana) {
    return {
      isCampana: true,
      apiPrefix: '/elecciones/portal',
      routeBase: '/elecciones-campana'
    };
  }
  return {
    isCampana: false,
    apiPrefix: '/elecciones/alumno',
    routeBase: '/alumno/elecciones'
  };
}
