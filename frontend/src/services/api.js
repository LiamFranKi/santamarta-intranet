import axios from 'axios';
import Swal from 'sweetalert2';

// Detectar si estamos en desarrollo o producción
const hostname = window.location.hostname || '';
const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
const isDevelopment = isLocalhost; // Solo localhost es desarrollo

// Determinar URL de API
// Prioridad: 1) Variable de entorno REACT_APP_API_URL, 2) Detección automática
let apiUrl;
const currentProtocol = window.location.protocol === 'https:' ? 'https:' : 'http:';

// Si existe REACT_APP_API_URL, usarla (útil para producción con dominio específico)
if (process.env.REACT_APP_API_URL) {
  apiUrl = process.env.REACT_APP_API_URL;
  console.log('⚙️ Usando URL de API desde variable de entorno:', apiUrl);
} else if (isDevelopment) {
  // Desarrollo: solo si es localhost
  apiUrl = 'http://localhost:5000/api';
  console.log('🔧 Modo desarrollo: usando API local en', apiUrl);
} else {
  // Producción: usar el mismo dominio con /api (NO es localhost)
  apiUrl = `${currentProtocol}//${hostname}/api`;
  console.log('🌐 Modo producción: usando API en', apiUrl);
}

// Variable para evitar múltiples cierres de sesión simultáneos
let isLoggingOut = false;

/**
 * Función para cerrar sesión automáticamente y redirigir al login
 * @param {string} reason - Razón del cierre de sesión
 * @param {string} message - Mensaje a mostrar al usuario
 */
const forceLogout = (reason, message) => {
  // Evitar múltiples cierres de sesión simultáneos
  if (isLoggingOut) {
    return;
  }
  isLoggingOut = true;

  // Limpiar datos de sesión
  localStorage.removeItem('token');
  localStorage.removeItem('user');

  // Mostrar mensaje amigable al usuario
  Swal.fire({
    icon: 'info',
    title: 'Sesión cerrada',
    text: message || 'Tu sesión ha expirado o ha ocurrido un problema. Por favor, inicia sesión nuevamente.',
    confirmButtonText: 'Ir al inicio de sesión',
    allowOutsideClick: false,
    allowEscapeKey: false,
    showCloseButton: false,
  }).then(() => {
    // Redirigir al login
    window.location.href = '/login';
  });
};

const api = axios.create({
  baseURL: apiUrl,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000, // 30 segundos de timeout para conexiones remotas
});

// Interceptor para agregar token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // APODERADO: si eligió año histórico en localStorage, adjuntar `anio_consulta` a los GET.
    // Si la petición ya trae `params.anio_consulta`, tiene prioridad (evita que un valor viejo en
    // localStorage pise una consulta explícita; antes el storage sobrescribía y forzaba 2025).
    try {
      const userRaw = localStorage.getItem('user');
      const user = userRaw ? JSON.parse(userRaw) : null;
      const stored = localStorage.getItem('anio_consulta_apoderado');
      const method = String(config.method || 'get').toLowerCase();

      if (user?.tipo === 'APODERADO' && method === 'get') {
        const p = config.params || {};
        const explicit = p.anio_consulta;
        const hasExplicit = explicit !== undefined && explicit !== null && String(explicit).trim() !== '';
        const hasStored = stored != null && String(stored).trim() !== '';
        if (hasExplicit || hasStored) {
          config.params = {
            ...p,
            anio_consulta: hasExplicit ? explicit : stored,
          };
        }
      }
    } catch {
      // no-op
    }

    // FormData: no fijar Content-Type para que el navegador agregue multipart/form-data con boundary
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type'];
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Interceptor para manejar errores
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const statusText = error.response?.statusText || '';
    const errorMessage = error.response?.data?.error || error.response?.data?.message || '';
    
    // Errores críticos que requieren cerrar sesión automáticamente
    const criticalErrors = {
      401: {
        reason: 'SESION_EXPIRADA',
        message: 'Tu sesión ha expirado. Por favor, inicia sesión nuevamente.',
      },
      403: {
        reason: 'SIN_PERMISOS',
        message: 'No tienes permisos para acceder a este recurso. Tu sesión será cerrada.',
      },
      500: {
        reason: 'ERROR_SERVIDOR',
        message: 'Ha ocurrido un error en el servidor. Por seguridad, tu sesión será cerrada.',
      },
      502: {
        reason: 'SERVIDOR_NO_DISPONIBLE',
        message: 'El servidor no está disponible temporalmente. Por favor, intenta más tarde.',
      },
      503: {
        reason: 'SERVICIO_NO_DISPONIBLE',
        message: 'El servicio no está disponible temporalmente. Por favor, intenta más tarde.',
      },
    };

    // Verificar si es un error crítico
    // EXCEPCIÓN: No cerrar sesión para errores 403 en rutas de hijos (editar datos)
    // EXCEPCIÓN: No cerrar sesión para errores 401/403 en rutas proxy de hijos (aula virtual, mensajes, etc.)
    // EXCEPCIÓN: No cerrar sesión para errores 401/403 en rutas proxy de tutores (aula virtual, mensajes, etc.)
    // EXCEPCIÓN: No cerrar sesión para errores 403 en publicaciones cuando el usuario es APODERADO (se resuelve con endpoint correcto)
    // EXCEPCIÓN: No cerrar sesión para errores 401/403 en push notifications (es opcional y no crítico)
    const reqUrl = String(error.config?.url || '');
    const base = String(error.config?.baseURL || '');
    const urlForMatch = reqUrl + base;

    const isHijosRoute = reqUrl.includes('/hijos/') && reqUrl.includes('/datos');
    const isApoderadoHijosRoute = reqUrl.includes('/apoderado/hijos');
    /** 403 en login no debe cerrar sesión ni mostrar mensaje de “permisos” genérico por interceptor */
    const isAuthLoginRoute = /\/auth\/login\b/.test(reqUrl);
    const isHijosProxyRoute =
      (reqUrl.includes('/docente/hijos/') || reqUrl.includes('docente/hijos/')) &&
      (reqUrl.includes('aula-virtual') || reqUrl.includes('/mensajes') || reqUrl.includes('/cursos'));
    // Tutoría: path puede venir sin "/" inicial o mezclado con baseURL; no cerrar sesión por 401/403 aquí
    const isTutoriaProxyRoute =
      (urlForMatch.includes('tutoria/grupos') || urlForMatch.includes('/tutoria/grupos')) &&
      (urlForMatch.includes('aula-virtual') ||
        urlForMatch.includes('/cursos') ||
        urlForMatch.includes('/mensajes'));
    // 403 en aula virtual docente (p. ej. tutor si el rewrite falló): no desloguear; el 401 sigue cerrando sesión
    const is403DocenteAulaVirtual =
      status === 403 &&
      (reqUrl.includes('docente/aula-virtual') || reqUrl.includes('/docente/aula-virtual'));
    /** Aula virtual docente: 500 por bug de API no debe cerrar sesión (p. ej. SQL puntual). */
    const skipLogoutDocenteAulaVirtual500 =
      status === 500 &&
      (reqUrl.includes('docente/aula-virtual') || reqUrl.includes('/docente/aula-virtual'));
    const isPublicacionesRoute = error.config?.url?.includes('/publicaciones');
    const isPushRoute = error.config?.url?.includes('/push/');
    const isNotificacionesRoute = error.config?.url?.includes('/notificaciones');
    // Exámenes de alumno: errores 403/5xx pueden ser cierre concurrente o validación de intento, no sesión inválida.
    const isAlumnoExamenRoute = /\/alumno\/examenes\//.test(reqUrl);
    /** Eventos institucionales (/api/admin/eventos): 403 por rol desactualizado no debe cerrar la sesión. */
    const isAdminEventosRoute = /\/admin\/eventos/.test(reqUrl);
    const isActividadesRoute = error.config?.url?.includes('/actividades');
    const isGruposRoute = error.config?.url?.includes('/grupos');
    /** Catálogo académico admin: errores 500 no deben cerrar sesión (bug de API ≠ sesión inválida). */
    const isAdminAcademicoRoute = reqUrl.includes('/admin/academico/');
    /** Psicología admin: 500/503 por SQL o migración pendiente no deben cerrar la sesión. */
    const isAdminPsicologiaRoute = reqUrl.includes('/admin/psicologia');
    const isAdminImpresionesRoute =
      reqUrl.includes('/admin/usuarios/alumnos/') && reqUrl.includes('/impresiones');
    /** Asistencia a eventos por QR (público): 403/500 no deben cerrar la sesión del intranet */
    const isPublicEventosRoute = reqUrl.includes('/public/eventos');
    // Bandeja de mensajes: no desloguear solo por 403/500 (p. ej. rol equivocado o error puntual); el 401 sigue cerrando sesión
    const isMensajesIntranetRoute = /\/(alumno|apoderado|docente)\/mensajes/.test(reqUrl);
    const skipLogoutMensajesApi = isMensajesIntranetRoute && (status === 403 || status === 500);
    const skipLogoutAdminImpresiones = isAdminImpresionesRoute && status === 500;
    const skipLogoutAdminAcademico500 = status === 500 && isAdminAcademicoRoute;
    const skipLogoutAdminPsicologiaCritical =
      isAdminPsicologiaRoute && (status === 500 || status === 503);
    const skipLogoutAlumnoExamen =
      isAlumnoExamenRoute && (status === 403 || status === 500 || status === 502 || status === 503);
    /** Elecciones (alumno / portal intranet): 403/409 por convocatoria, horario o voto duplicado no debe cerrar sesión. */
    const isEleccionesIntranetRoute = /\/elecciones\/(alumno|portal)\//.test(reqUrl);
    const skipLogoutEleccionesIntranet =
      isEleccionesIntranetRoute && (status === 403 || status === 409 || status === 500);
    /** Elecciones admin: 403 por rol, token edge o reglas del servidor no debe desloguear (mostrar error en pantalla). */
    const isEleccionesAdminRoute = /\/elecciones\/admin\//.test(reqUrl);
    const skipLogoutEleccionesAdmin403 = isEleccionesAdminRoute && (status === 403 || status === 500);
    /**
     * Bootstrap público (/colegio/:id): 5xx o 502/503 del proxy no implican sesión inválida.
     * Sin esto, caída del API muestra “Sesión cerrada” aún en la pantalla de login.
     */
    const isPublicColegioBootstrapRoute =
      /^\/colegio\/\d+$/.test(reqUrl) || /^\/colegio\/\d+\/nombre-intranet$/.test(reqUrl);
    const skipLogoutPublicColegioServerErrors =
      isPublicColegioBootstrapRoute && [500, 502, 503].includes(status);
    /** Diseñador de fichas: 500 por bug o Gemini no debe cerrar sesión. */
    const isFichasIaRoute = /\/fichas-ia\//.test(reqUrl);
    const skipLogoutFichasIa500 = isFichasIaRoute && status === 500;

    if (
      status &&
      criticalErrors[status] &&
      !isAuthLoginRoute &&
      !isHijosRoute &&
      !isApoderadoHijosRoute &&
      !isHijosProxyRoute &&
      !isTutoriaProxyRoute &&
      !is403DocenteAulaVirtual &&
      !skipLogoutDocenteAulaVirtual500 &&
      !isPublicacionesRoute &&
      !isPushRoute &&
      !isNotificacionesRoute &&
      !isAdminEventosRoute &&
      !isActividadesRoute &&
      !isGruposRoute &&
      !skipLogoutMensajesApi &&
      !skipLogoutAdminImpresiones &&
      !skipLogoutAdminAcademico500 &&
      !skipLogoutAdminPsicologiaCritical &&
      !skipLogoutAlumnoExamen &&
      !skipLogoutEleccionesIntranet &&
      !skipLogoutEleccionesAdmin403 &&
      !skipLogoutPublicColegioServerErrors &&
      !skipLogoutFichasIa500 &&
      !isPublicEventosRoute
    ) {
      const errorInfo = criticalErrors[status];
      console.warn(`⚠️ Error crítico detectado (${status}):`, errorInfo.reason);
      
      // Cerrar sesión automáticamente
      forceLogout(errorInfo.reason, errorInfo.message);
      
      // No rechazar la promesa para evitar que se muestren más errores
      return Promise.reject(new Error(errorInfo.reason));
    }

    // Manejar errores de timeout
    if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
      console.error('⏱️ Timeout en la petición:', error.message);
      
      // Si hay múltiples timeouts consecutivos, podría ser un problema del servidor
      // Por ahora solo logueamos, pero podrías agregar lógica para contar timeouts
      // y cerrar sesión si hay muchos seguidos
      
      return Promise.reject(error);
    }

    // Manejar errores de red (sin respuesta del servidor)
    if (!error.response) {
      const networkError = error.code || error.message || 'Error desconocido';
      console.error('🌐 Error de conexión:', networkError);
      
      // Errores de red críticos que indican problemas del servidor
      const criticalNetworkErrors = [
        'ERR_NETWORK',
        'ERR_INTERNET_DISCONNECTED',
        'ERR_CONNECTION_REFUSED',
        'ERR_CONNECTION_RESET',
      ];
      
      if (criticalNetworkErrors.some(err => networkError.includes(err))) {
        // Si es un error de red crítico persistente, podríamos cerrar sesión
        // Por ahora solo logueamos, pero puedes activar esto si lo necesitas:
        // forceLogout('ERROR_RED', 'No se puede conectar con el servidor. Por favor, verifica tu conexión.');
      }
      
      return Promise.reject(error);
    }

    // Manejar error de certificado SSL
    if (error.code === 'ERR_CERT_COMMON_NAME_INVALID' || error.message?.includes('certificate')) {
      console.error('🔒 Error de certificado SSL. Verifica la configuración HTTPS.');
      // Si estamos en producción y hay error de certificado, podría ser un problema de seguridad
      if (!isDevelopment && apiUrl.startsWith('https://')) {
        console.warn('⚠️ Error de certificado SSL en producción. Esto podría indicar un problema de seguridad.');
        // Podrías cerrar sesión aquí si lo consideras necesario:
        // forceLogout('ERROR_SSL', 'Error de seguridad detectado. Por favor, contacta al administrador.');
      }
    }
    
    // Para otros errores (404, 422, etc.), solo rechazar la promesa normalmente
    // Estos no requieren cerrar sesión
    return Promise.reject(error);
  }
);

export default api;

