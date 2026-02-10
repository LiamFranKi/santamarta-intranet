import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import './NotificacionesWidget.css';

function NotificacionesWidget() {
  const { user } = useAuth();
  const [notificaciones, setNotificaciones] = useState([]);
  const [mostrarDropdown, setMostrarDropdown] = useState(false);

  useEffect(() => {
    cargarNotificaciones();
  }, [user]);

  const cargarNotificaciones = async () => {
    try {
      // Usar ruta según el tipo de usuario
      const ruta = user?.tipo === 'ALUMNO' ? '/alumno/notificaciones' : '/docente/notificaciones';
      const response = await api.get(ruta);
      setNotificaciones(response.data.notificaciones || []);
    } catch (error) {
      console.error('Error cargando notificaciones:', error);
    }
  };

  const notificacionesNoLeidas = notificaciones.filter(n => n.estado === 'NO_LEIDO').length;

  return (
    <div className="notificaciones-widget">
      <button
        className="notificaciones-btn"
        onClick={() => setMostrarDropdown(!mostrarDropdown)}
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

