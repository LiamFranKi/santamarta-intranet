import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import useIsMobileViewport from '../hooks/useIsMobileViewport';
import './BirthdayWidget.css';

/** Móvil + tablet: panel contraído por defecto (solo icono 🎂). Escritorio: desplegado. */
const BIRTHDAY_COMPACT_MAX_WIDTH = 1024;

function initialBirthdayExpanded() {
  if (typeof window === 'undefined') return true;
  return window.innerWidth > BIRTHDAY_COMPACT_MAX_WIDTH;
}

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function rutaMensajesPorPerfil(tipo) {
  switch (tipo) {
    case 'ALUMNO':
      return '/alumno/mensajes';
    case 'APODERADO':
      return '/apoderado/mensajes';
    case 'ADMINISTRADOR':
    case 'PROMOTORIA':
      return '/admin/mensajes';
    case 'DOCENTE':
    default:
      return '/docente/mensajes';
  }
}

/**
 * Widget flotante de cumpleaños del mes.
 * Clic en nombre → modal con datos + "Enviar mensaje" (redactor con decoración de cumpleaños).
 */
function BirthdayWidget({ visibleDefault = true, comunicadoAbierto = false }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isCompactViewport = useIsMobileViewport(BIRTHDAY_COMPACT_MAX_WIDTH);
  const [showConfig, setShowConfig] = useState(null);
  const [expanded, setExpanded] = useState(initialBirthdayExpanded);
  const [userPinnedExpanded, setUserPinnedExpanded] = useState(false);

  const setExpandedUser = useCallback((value) => {
    setUserPinnedExpanded(true);
    setExpanded(value);
  }, []);

  useEffect(() => {
    if (userPinnedExpanded) return;
    setExpanded(!isCompactViewport);
  }, [isCompactViewport, userPinnedExpanded]);
  const [loading, setLoading] = useState(true);
  const [cumpleanos, setCumpleanos] = useState([]);
  const [mes, setMes] = useState(new Date().getMonth() + 1);
  const [perfil, setPerfil] = useState('TODOS');

  const [detalle, setDetalle] = useState(null);
  const [loadingDetalle, setLoadingDetalle] = useState(false);
  const [errorDetalle, setErrorDetalle] = useState(null);

  useEffect(() => {
    api.get('/cumpleanos/config').then((res) => {
      setShowConfig((res.data?.show_birthday_window || 'NO').toUpperCase() === 'SI');
    }).catch(() => setShowConfig(false));
  }, []);

  const cargarCumpleanos = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/cumpleanos?mes=${mes}&perfil=${perfil}`);
      setCumpleanos(res.data.cumpleanos || []);
    } catch (err) {
      console.error('Error cargando cumpleaños:', err);
      setCumpleanos([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (showConfig && expanded) cargarCumpleanos();
  }, [showConfig, expanded, mes, perfil]);

  const abrirDetalle = async (c) => {
    setErrorDetalle(null);
    setDetalle(null);
    setLoadingDetalle(true);
    try {
      const encoded = encodeURIComponent(c.id);
      const res = await api.get(`/cumpleanos/detalle/${encoded}`);
      setDetalle(res.data);
    } catch (err) {
      setErrorDetalle(err.response?.data?.error || 'No se pudo cargar el detalle');
    } finally {
      setLoadingDetalle(false);
    }
  };

  const cerrarModal = () => {
    setDetalle(null);
    setErrorDetalle(null);
  };

  const enviarMensajeCumpleanos = () => {
    if (!detalle || !user) return;
    const base = rutaMensajesPorPerfil(user.tipo);
    const tipoDocente = detalle.tipo_mensaje_ui || detalle.tipo_mensaje;
    const esDocenteOAdmin = user.tipo === 'DOCENTE' || user.tipo === 'ADMINISTRADOR' || user.tipo === 'PROMOTORIA';

    let tipoDestinatario;
    if (esDocenteOAdmin) {
      tipoDestinatario = tipoDocente;
    } else {
      tipoDestinatario = detalle.usuario_tipo || tipoDocente;
    }

    navigate(base, {
      state: {
        preselectCumpleanos: {
          usuario_id: detalle.usuario_id,
          nombre_completo: detalle.nombre_completo,
          tipo: tipoDestinatario,
          info_adicional: detalle.info_adicional || null,
          asuntoSugerido: '¡Feliz cumpleaños! 🎂',
          esCumpleanos: true
        }
      }
    });
    cerrarModal();
    setExpandedUser(false);
  };

  if (showConfig === false || !visibleDefault) return null;

  if (showConfig === null) return null;

  if (!expanded) {
    return (
      <button
        type="button"
        className="birthday-widget-icon"
        onClick={() => setExpandedUser(true)}
        aria-label="Ver cumpleaños del mes"
        style={{ zIndex: comunicadoAbierto ? 9990 : 9999 }}
      >
        🎂
      </button>
    );
  }

  const modalZ = comunicadoAbierto ? 9992 : 10001;

  return (
    <>
      <div
        className="birthday-widget"
        style={{ zIndex: comunicadoAbierto ? 9990 : 9999 }}
        aria-label="Cumpleaños del mes"
      >
        <div className="birthday-widget-header">
          <h3 className="birthday-widget-title">🎂 Cumpleaños del mes</h3>
          <button
            type="button"
            className="birthday-widget-close"
            onClick={() => setExpandedUser(false)}
            aria-label="Minimizar"
          >
            ×
          </button>
        </div>

        <div className="birthday-widget-filters">
          <select
            value={mes}
            onChange={(e) => setMes(parseInt(e.target.value, 10))}
            className="birthday-widget-select"
          >
            {MESES.map((m, i) => (
              <option key={m} value={i + 1}>{m}</option>
            ))}
          </select>
          <select
            value={perfil}
            onChange={(e) => setPerfil(e.target.value)}
            className="birthday-widget-select"
          >
            <option value="TODOS">Todos los perfiles</option>
            <option value="PERSONAL">Personal</option>
            <option value="ALUMNO">Alumnos</option>
            <option value="APODERADO">Apoderados</option>
          </select>
        </div>

        <div className="birthday-widget-body">
          {loading ? (
            <p className="birthday-widget-loading">Cargando...</p>
          ) : cumpleanos.length === 0 ? (
            <p className="birthday-widget-empty">No hay cumpleaños este mes</p>
          ) : (
            <table className="birthday-widget-table">
              <thead>
                <tr>
                  <th>FECHA</th>
                  <th>NOMBRE</th>
                  <th>PERFIL</th>
                </tr>
              </thead>
              <tbody>
                {cumpleanos.map((c) => (
                  <tr key={c.id}>
                    <td>{c.fecha}</td>
                    <td>
                      <button
                        type="button"
                        className="birthday-nombre-btn"
                        onClick={() => abrirDetalle(c)}
                      >
                        {c.nombre}
                      </button>
                    </td>
                    <td>
                      <span className={`birthday-badge birthday-badge-${c.perfil.toLowerCase()}`}>
                        {c.perfil}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {(loadingDetalle || detalle != null || errorDetalle)
        ? createPortal(
            <div className="birthday-detalle-overlay" style={{ zIndex: modalZ }} onClick={cerrarModal} role="presentation">
              <div
                className="birthday-detalle-modal"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="birthday-detalle-title"
              >
                <button type="button" className="birthday-detalle-close" onClick={cerrarModal} aria-label="Cerrar">
                  ×
                </button>
                {loadingDetalle && <p className="birthday-detalle-loading">Cargando...</p>}
                {errorDetalle && !loadingDetalle && (
                  <p className="birthday-detalle-error">{errorDetalle}</p>
                )}
                {detalle && !loadingDetalle && (
                  <>
                    <div className="birthday-detalle-header-fiesta">
                      <span className="birthday-detalle-confetti" aria-hidden>🎉</span>
                      <h3 id="birthday-detalle-title">Cumpleaños</h3>
                    </div>
                    <div className="birthday-detalle-foto-wrap">
                      {detalle.foto_url ? (
                        <img src={detalle.foto_url} alt="" className="birthday-detalle-foto" />
                      ) : (
                        <div className="birthday-detalle-avatar-placeholder" aria-hidden>
                          🎂
                        </div>
                      )}
                    </div>
                    <p className="birthday-detalle-nombre">{detalle.nombre_completo}</p>
                    <dl className="birthday-detalle-dl">
                      <div><dt>Perfil</dt><dd>{detalle.perfil}</dd></div>
                      <div><dt>Grado / grupo</dt><dd>{detalle.grado_texto || '—'}</dd></div>
                      <div>
                        <dt>Años que cumple (este año)</dt>
                        <dd>{detalle.edad_que_cumple != null ? detalle.edad_que_cumple : '—'}</dd>
                      </div>
                    </dl>
                    <div className="birthday-detalle-actions">
                      <button type="button" className="birthday-btn-msg" onClick={enviarMensajeCumpleanos}>
                        ✉️ Enviar mensaje
                      </button>
                      <button type="button" className="birthday-btn-cerrar" onClick={cerrarModal}>
                        Cerrar
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}

export default BirthdayWidget;
