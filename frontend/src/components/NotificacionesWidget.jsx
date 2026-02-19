import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import './NotificacionesWidget.css';

function NotificacionesWidget() {
  const { user } = useAuth();
  const [notificaciones, setNotificaciones] = useState([]);
  const [mostrarDropdown, setMostrarDropdown] = useState(false);

  useEffect(() => {
    if (user) {
      cargarNotificaciones();
      // Recargar notificaciones cada 30 segundos
      const interval = setInterval(() => {
        cargarNotificaciones();
      }, 30000);
      
      return () => clearInterval(interval);
    }
  }, [user]);

  const cargarNotificaciones = async () => {
    try {
      // Usar ruta según el tipo de usuario
      let ruta;
      if (user?.tipo === 'ALUMNO') {
        ruta = '/alumno/notificaciones';
      } else if (user?.tipo === 'APODERADO') {
        ruta = '/apoderado/notificaciones';
      } else {
        ruta = '/docente/notificaciones';
      }
      const response = await api.get(ruta);
      setNotificaciones(response.data.notificaciones || []);
    } catch (error) {
      console.error('Error cargando notificaciones:', error);
    }
  };

  // Recargar notificaciones cuando se abre el dropdown
  const handleToggleDropdown = () => {
    const nuevoEstado = !mostrarDropdown;
    setMostrarDropdown(nuevoEstado);
    if (nuevoEstado) {
      // Recargar cuando se abre
      cargarNotificaciones();
    }
  };

  const notificacionesNoLeidas = notificaciones.filter(n => n.estado === 'NO_LEIDO').length;

  return (
    <div className="notificaciones-widget">
      <button
        className="notificaciones-btn"
        onClick={handleToggleDropdown}
        title="Notificaciones"
      >
        🔔
        {notificacionesNoLeidas > 0 && (
          <span className="notification-badge">{notificacionesNoLeidas}</span>
        )}
      </button>

      {mostrarDropdown && (
        <>
          <div
            className="notificaciones-overlay"
            onClick={() => setMostrarDropdown(false)}
          />
          <div className="notificaciones-dropdown">
            <div className="dropdown-header">
              <h3>Notificaciones</h3>
              {notificacionesNoLeidas > 0 && (
                <span className="badge-count">{notificacionesNoLeidas} nuevas</span>
              )}
            </div>
            <div className="notificaciones-list">
              {notificaciones.length > 0 ? (
                notificaciones.map((notif) => (
                  <div
                    key={notif.id}
                    className={`notificacion-item ${notif.estado === 'NO_LEIDO' ? 'no-leida' : ''}`}
                  >
                    <div className="notificacion-icon">🔔</div>
                    <div className="notificacion-content">
                      <h4>{notif.titulo || notif.asunto || 'Notificación del sistema'}</h4>
                      {(notif.mensaje || notif.contenido) && (
                        <p>{notif.mensaje || notif.contenido}</p>
                      )}
                      <span className="notificacion-fecha">
                        {new Date(notif.fecha_hora || notif.fecha || notif.fecha_creacion).toLocaleDateString('es-PE', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="empty-notificaciones">
                  <p>No hay notificaciones</p>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default NotificacionesWidget;

