/** Rutas de exámenes de herramientas según contexto (URL con prefijo admin/docente o genérica). */

export const HEX_ROOT = '/herramientas-examenes';
export const HEX_DOCENTE_BASE = '/docente/herramientas/examenes';
export const HEX_ADMIN_BASE = '/admin/herramientas/examenes';

/** @returns {'admin' | 'docente' | 'default'} */
export function getHexContext(pathname) {
  if (!pathname) return 'default';
  if (pathname === HEX_ADMIN_BASE || pathname.startsWith(`${HEX_ADMIN_BASE}/`)) return 'admin';
  if (pathname === HEX_DOCENTE_BASE || pathname.startsWith(`${HEX_DOCENTE_BASE}/`)) return 'docente';
  return 'default';
}

/**
 * URLs para paneles que conocen el contexto explícitamente (no están en una subruta todavía).
 * @param {'admin' | 'docente' | 'default'} routeContext
 */
export function hexExamenesUrls(routeContext = 'default') {
  const base =
    routeContext === 'admin' ? HEX_ADMIN_BASE : routeContext === 'docente' ? HEX_DOCENTE_BASE : HEX_ROOT;
  return {
    base,
    list: base,
    listAdminResponder: `${HEX_ADMIN_BASE}?tab=responder`,
    resultado: (examId) => `${base}/resultado/${examId}`,
    realizar: (examId, queryRecord) => {
      const qs =
        queryRecord && Object.keys(queryRecord).length
          ? new URLSearchParams(queryRecord).toString()
          : '';
      return `${base}/realizar/${examId}${qs ? `?${qs}` : ''}`;
    }
  };
}
