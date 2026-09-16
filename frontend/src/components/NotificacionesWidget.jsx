import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { normalizarUrlNotificacion } from '../utils/notificacionNavigate';
import './NotificacionesWidget.css';

/**
 * @param {{ variant?: 'widget' | 'page' }} props
 * — `page`: bandeja completa bajo Comunicaciones (sin campanita flotante).
 */
function NotificacionesWidget({ variant = 'widget' }) {
  const isPage = variant === 'page';
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notificaciones, setNotificaciones] = useState([]);
  const [mostrarDropdown, setMostrarDropdown] = useState(false);
  const cargandoRef = useRef(false);

  const cargarNotificaciones = useCallback(async () => {
    if (!user || cargandoRef.current) return;
    cargandoRef.current = true;
    try {
      let ruta;
      if (user?.tipo === 'ALUMNO') {
        ruta = '/alumno/notificaciones';
      } else if (user?.tipo === 'APODERADO') {
        ruta = '/apoderado/notificaciones';
      } else if (
        user?.tipo === 'ADMINISTRADOR'
        || user?.tipo === 'PROMOTORIA'
        || user?.tipo === 'PSICOLOGA'
        || user?.tipo === 'COORDINADOR'
        || user?.tipo === 'DIRECTOR'
        || user?.tipo === 'CONTADOR'
      ) {
        ruta = '/admin/notificaciones';
      } else {
        ruta = '/docente/notificaciones';
      }
      const response = await api.get(ruta);
      setNotificaciones(response.data.notificaciones || []);
    } catch (error) {
      console.error('Error cargando notificaciones:', error);
    } finally {
      cargandoRef.current = false;
    }
  }, [user]);

  useEffect(() => {
    if (!user) return undefined;
    cargarNotificaciones();
    const interval = setInterval(() => {
      cargarNotificaciones();
    }, 60000);
    return () => clearInterval(interval);
  }, [user, cargarNotificaciones]);

  const handleToggleDropdown = () => {
    const nuevoEstado = !mostrarDropdown;
    setMostrarDropdown(nuevoEstado);
    if (nuevoEstado) {
      cargarNotificaciones();
    }
  };

  const notificacionesNoLeidas = notificaciones.filter((n) => n.estado === 'NO_LEIDO').length;

  const getRutaMarcarLeido = () => {
    if (user?.tipo === 'ALUMNO') return '/alumno/notificaciones';
    if (user?.tipo === 'APODERADO') return '/apoderado/notificaciones';
    if (user?.tipo === 'ADMINISTRADOR' || user?.tipo === 'PROMOTORIA' || user?.tipo === 'PSICOLOGA' || user?.tipo === 'COORDINADOR' || user?.tipo === 'DIRECTOR' || user?.tipo === 'CONTADOR') {
      return '/admin/notificaciones';
    }
    return '/docente/notificaciones';
  };

  const marcarComoLeido = async (notifId, e) => {
    e?.stopPropagation();
    try {
      const ruta = getRutaMarcarLeido();
      await api.put(`${ruta}/${notifId}/marcar-leido`);
      setNotificaciones((prev) =>
        prev.map((n) => (n.id === notifId ? { ...n, estado: 'LEIDO' } : n))
      );
    } catch (error) {
      console.error('Error marcando notificación como leída:', error);
    }
  };

  const handleClickNotificacion = async (notif) => {
    try {
      if (notif.estado === 'NO_LEIDO') {
        const ruta = getRutaMarcarLeido();
        await api.put(`${ruta}/${notif.id}/marcar-leido`);
        setNotificaciones((prev) =>
          prev.map((n) => (n.id === notif.id ? { ...n, estado: 'LEIDO' } : n))
        );
      }
    } catch (err) {
      console.error('Error al marcar leído antes de navegar:', err);
    }
    const destino = normalizarUrlNotificacion(notif, user);
    if (!isPage) setMostrarDropdown(false);
    navigate(destino);
    if (String(destino).includes('#mis-asistencias') || String(notif?.accion_tipo) === 'tardanza_propia') {
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('vanguard:abrir-asistencias'));
      }, 80);
    }
  };

  const renderLista = () => (
    <div className={`notificaciones-list${isPage ? ' notificaciones-list--page' : ''}`}>
      {notificaciones.length > 0 ? (
        notificaciones.map((notif) => (
          <div
            key={notif.id}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleClickNotificacion(notif);
              }
            }}
            className={`notificacion-item ${notif.estado === 'NO_LEIDO' ? 'no-leida' : ''}`}
            onClick={() => handleClickNotificacion(notif)}
          >
            <div className="notificacion-icon">🔔</div>
            <div className="notificacion-content">
              <h4>{notif.titulo || notif.asunto || 'Notificación del sistema'}</h4>
              {(notif.mensaje || notif.contenido) && <p>{notif.mensaje || notif.contenido}</p>}
              <span className="notificacion-fecha">
                {new Date(notif.fecha_hora || notif.fecha || notif.fecha_creacion).toLocaleDateString('es-PE', {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </span>
              {notif.estado === 'NO_LEIDO' && (
                <button
                  type="button"
                  className="btn-marcar-leido"
                  onClick={(e) => marcarComoLeido(notif.id, e)}
                  title="Marcar como leído"
                >
                  ✓ Marcar como leído
                </button>
              )}
            </div>
          </div>
        ))
      ) : (
        <div className="empty-notificaciones">
          <p>No hay notificaciones</p>
        </div>
      )}
    </div>
  );

  if (isPage) {
    return (
      <div className="notificaciones-widget notificaciones-widget--page">
        <div className="notificaciones-page-header">
          <div>
            <h1 className="notificaciones-page-title">🔔 Notificaciones</h1>
            <p className="notificaciones-page-lead">Bandeja del sistema (misma fuente que la campanita del encabezado).</p>
          </div>
          {notificacionesNoLeidas > 0 ? (
            <span className="notificaciones-page-badge">{notificacionesNoLeidas} sin leer</span>
          ) : null}
          <button type="button" className="notificaciones-page-refresh" onClick={() => cargarNotificaciones()}>
            Actualizar
          </button>
        </div>
        <div className="notificaciones-page-panel">{renderLista()}</div>
      </div>
    );
  }

  return (
    <div className="notificaciones-widget">
      <button
        className="notificaciones-btn"
        onClick={handleToggleDropdown}
        title="Notificaciones"
        type="button"
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
            role="presentation"
          />
          <div className="notificaciones-dropdown">
            <div className="dropdown-header">
              <h3>Notificaciones</h3>
              {notificacionesNoLeidas > 0 && (
                <span className="badge-count">{notificacionesNoLeidas} nuevas</span>
              )}
            </div>
            {renderLista()}
          </div>
        </>
      )}
    </div>
  );
}

export default NotificacionesWidget;
