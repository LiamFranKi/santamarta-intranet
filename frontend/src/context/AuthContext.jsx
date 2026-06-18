import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';
import { suscribirNotificacionesPush } from '../services/pushNotificationService';

/** Perfiles que registran Web Push al iniciar sesión (incluye staff que recibe derivaciones psicología, encuestas, etc.). */
const TIPOS_CON_PUSH_AUTOMATICO = new Set([
  'ALUMNO',
  'APODERADO',
  'DOCENTE',
  'ADMINISTRADOR',
  'PROMOTORIA',
  'SECRETARIA',
  'PSICOLOGA',
]);

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe usarse dentro de AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    // Verificar si hay token guardado
    const token = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');
    
    if (token) {
      // Si hay usuario guardado, restaurarlo inmediatamente para evitar flash de login
      if (savedUser) {
        try {
          const userData = JSON.parse(savedUser);
          setUser(userData);
          setIsAuthenticated(true);
        } catch (e) {
          console.error('Error al parsear usuario guardado:', e);
        }
      }
      
      // Verificar token con el servidor
      api.get('/auth/me')
        .then(response => {
          setUser(response.data.user);
          setIsAuthenticated(true);
          // Actualizar usuario guardado
          localStorage.setItem('user', JSON.stringify(response.data.user));
          
          // Web Push: antes solo alumno/apoderado/docente; staff (admin, psicología…) también debe suscribirse o no llegan pushes.
          if (TIPOS_CON_PUSH_AUTOMATICO.has(String(response.data.user.tipo || '').toUpperCase())) {
            setTimeout(() => {
              suscribirNotificacionesPush().catch((err) => {
                console.warn('No se pudo suscribir a notificaciones push:', err);
              });
            }, 2000);
          }
        })
        .catch((error) => {
          // Solo limpiar token si es un error 401 (no autorizado)
          // Si es error de red, mantener el token y el usuario
          if (error.response?.status === 401) {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            setUser(null);
            setIsAuthenticated(false);
          } else {
            // Error de red u otro error: mantener el estado actual
            // El usuario seguirá autenticado con los datos guardados
            console.warn('Error al verificar token (posible error de red):', error.message);
          }
        })
        .finally(() => {
          setLoading(false);
        });
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (usuario, password) => {
    try {
      const response = await api.post('/auth/login', { usuario, password });
      const { token, user: userData } = response.data;

      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(userData));
      setUser(userData);
      setIsAuthenticated(true);

      // Nuevo inicio de sesión: no arrastrar año histórico guardado (p. ej. 2025) cuando el colegio ya está en 2026.
      if (userData.tipo === 'APODERADO') {
        localStorage.removeItem('anio_consulta_apoderado');
      }

      if (TIPOS_CON_PUSH_AUTOMATICO.has(String(userData.tipo || '').toUpperCase())) {
        setTimeout(() => {
          suscribirNotificacionesPush().catch((err) => {
            console.warn('No se pudo suscribir a notificaciones push:', err);
          });
        }, 2000);
      }

      return { success: true, user: userData };
    } catch (error) {
      const status = error.response?.status;
      // 403 en login = política interna (p. ej. acceso restringido); nunca mostrar texto de deudas al usuario
      if (status === 403) {
        const code = error.response?.data?.code;
        if (code === 'SIN_MATRICULA_ACTIVA') {
          return {
            success: false,
            error:
              error.response?.data?.error ||
              'No tiene matrícula activa pagada para el año académico actual. Contacte a secretaría.'
          };
        }
        return {
          success: false,
          error: 'Problemas con el servidor, se está solucionando.'
        };
      }
      const message = error.response?.data?.error || 'Error al iniciar sesión';
      return { success: false, error: message };
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('anio_consulta_apoderado');
    setUser(null);
    setIsAuthenticated(false);
  };

  const value = {
    user,
    setUser,
    loading,
    isAuthenticated,
    login,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

