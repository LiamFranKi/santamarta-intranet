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
    if (status && criticalErrors[status]) {
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

