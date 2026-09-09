import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';
import { suscribirNotificacionesPush, desuscribirPushEsteDispositivo } from '../services/pushNotificationService';
import { limpiarStorageSesion } from '../utils/limpiarSesionLocal';

/** Perfiles que registran Web Push al iniciar sesión (incluye staff que recibe derivaciones psicología, encuestas, etc.). */
const TIPOS_CON_PUSH_AUTOMATICO = new Set([
  'ALUMNO',
  'APODERADO',
  'DOCENTE',
  'ADMINISTRADOR',
  'PROMOTORIA',
  'SECRETARIA',
  'PSICOLOGA',
  'COORDINADOR',
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
        .catch(async (error) => {
          if (error.response?.status === 401) {
            try {
              await desuscribirPushEsteDispositivo();
            } catch {
              /* ignore */
            }
            limpiarStorageSesion();
            setUser(null);
            setIsAuthenticated(false);
          } else if (error.message === 'SESION_EXPIRADA' || error.message === 'SESSION_REVOKED' || error.message === 'SIN_PERMISOS') {
            setUser(null);
            setIsAuthenticated(false);
          } else {
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

  const logout = async () => {
    try {
      await desuscribirPushEsteDispositivo();
    } catch (e) {
      console.warn('No se pudo quitar push al cerrar sesión:', e);
    }
    limpiarStorageSesion();
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

