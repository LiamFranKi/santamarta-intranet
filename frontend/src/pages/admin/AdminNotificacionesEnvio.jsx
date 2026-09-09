import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Swal from 'sweetalert2';
import { useAuth } from '../../context/AuthContext';
import DashboardLayout from '../../components/DashboardLayout';
import api from '../../services/api';
import '../DocenteGrupos.css';
import './AdminConexiones.css';
import './AdminNotificacionesEnvio.css';

const swalSobreModal = {
  target: document.body,
  customClass: { container: 'cf-swal-over-modal' },
  didOpen: (popup) => {
    const root = popup?.closest?.('.swal2-container');
    if (root) root.style.zIndex = '250000';
  },
};

const ETIQUETA_PERFIL_DESTINO = {
  TODOS: 'Todos los perfiles',
  ALUMNOS: 'Alumnos',
  DOCENTES: 'Docentes',
  APODERADOS: 'Apoderados',
  TODO_PERSONAL: 'Todo el personal',
};

const ICONOS_PREDEFINIDOS = [
  { emoji: '', label: 'Sin icono' },
  { emoji: '🔔', label: 'Campana' },
  { emoji: '📢', label: 'Aviso' },
  { emoji: '⚠️', label: 'Advertencia' },
  { emoji: '❗', label: 'Urgente' },
  { emoji: '📅', label: 'Evento' },
  { emoji: '✅', label: 'Confirmación' },
  { emoji: '🎉', label: 'Celebración' },
  { emoji: '📌', label: 'Importante' },
  { emoji: '🏫', label: 'Colegio' },
  { emoji: 'ℹ️', label: 'Información' },
  { emoji: '📚', label: 'Académico' },
  { emoji: '💰', label: 'Pagos' },
  { emoji: '⭐', label: 'Destacado' },
  { emoji: '🚨', label: 'Alerta' },
  { emoji: '📝', label: 'Recordatorio' },
];

function formatFechaHora(value) {
  if (!value) return { fecha: '—', hora: '—' };
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return { fecha: String(value), hora: '—' };
  return {
    fecha: d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    hora: d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: true }),
  };
}

function etiquetaPerfilDestino(codigo) {
  const k = String(codigo || '').toUpperCase();
  return ETIQUETA_PERFIL_DESTINO[k] || k || '—';
}

function tituloPreview(icono, titulo) {
  const t = String(titulo || '').trim();
  const icon = String(icono || '').trim();
  if (!icon) return t || 'Sin título';
  if (t.startsWith(icon)) return t;
  return `${icon} ${t}`.trim();
}

export default function AdminNotificacionesEnvio() {
  const { user } = useAuth();
  const soloLectura = user?.tipo === 'COORDINADOR';
  const [items, setItems] = useState([]);
  const [paginaActual, setPaginaActual] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [grupos, setGrupos] = useState([]);
  const [filtroRemitente, setFiltroRemitente] = useState('');
  const [filtroGrupo, setFiltroGrupo] = useState('');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');

  const [mostrarModalNuevo, setMostrarModalNuevo] = useState(false);
  const [modalDetalle, setModalDetalle] = useState(false);
  const [detalle, setDetalle] = useState(null);
  const [loadingDetalle, setLoadingDetalle] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const [iconoEmoji, setIconoEmoji] = useState('🔔');
  const [titulo, setTitulo] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [alcance, setAlcance] = useState('todos');
  const [perfilDestino, setPerfilDestino] = useState('todos');
  const [gruposSeleccionados, setGruposSeleccionados] = useState([]);

  const itemsPorPagina = 20;
  const totalPaginas = Math.max(1, Math.ceil((items || []).length / itemsPorPagina));
  const itemsPaginados = useMemo(() => {
    const inicio = (paginaActual - 1) * itemsPorPagina;
    return (items || []).slice(inicio, inicio + itemsPorPagina);
  }, [items, paginaActual]);
  const paginasVisibles = useMemo(() => {
    if (totalPaginas <= 5) return Array.from({ length: totalPaginas }, (_, i) => i + 1);
    if (paginaActual <= 3) return [1, 2, 3, 4, 5];
    if (paginaActual >= totalPaginas - 2) {
      return [totalPaginas - 4, totalPaginas - 3, totalPaginas - 2, totalPaginas - 1, totalPaginas];
    }
    return [paginaActual - 2, paginaActual - 1, paginaActual, paginaActual + 1, paginaActual + 2];
  }, [paginaActual, totalPaginas]);

  const cargarEnvios = async () => {
    try {
      setLoading(true);
      setError('');
      const params = {};
      if (filtroRemitente) params.remitente_id = filtroRemitente;
      if (filtroGrupo) params.grupo_id = filtroGrupo;
      if (fechaDesde) params.fecha_desde = fechaDesde;
      if (fechaHasta) params.fecha_hasta = fechaHasta;
      const response = await api.get('/admin/notificaciones/envios', { params });
      setItems(response.data?.envios || []);
      setPaginaActual(1);
    } catch (err) {
      console.error('Error cargando notificaciones enviadas:', err);
      setError(err?.response?.data?.error || 'No se pudo cargar el historial.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarEnvios();
  }, []);

  useEffect(() => {
    const cargarGrupos = async () => {
      try {
        const response = await api.get('/docente/grupos');
        setGrupos(response.data?.grupos || []);
      } catch (err) {
        console.warn('No se pudieron cargar grupos:', err?.message);
      }
    };
    cargarGrupos();
  }, []);

  useEffect(() => {
    if (gruposSeleccionados.length > 0) setAlcance('grupos');
  }, [gruposSeleccionados]);

  useEffect(() => {
    if (paginaActual > totalPaginas) setPaginaActual(totalPaginas);
  }, [paginaActual, totalPaginas]);

  const opcionesRemitente = useMemo(() => {
    const map = new Map();
    (items || []).forEach((it) => {
      if (!it.remitente_id) return;
      if (!map.has(it.remitente_id)) map.set(it.remitente_id, it.remitente || `Usuario ${it.remitente_id}`);
    });
    return Array.from(map.entries()).map(([id, label]) => ({ id, label }));
  }, [items]);

  const abrirModalNuevo = () => {
    setIconoEmoji('🔔');
    setTitulo('');
    setMensaje('');
    setAlcance('todos');
    setPerfilDestino('todos');
    setGruposSeleccionados([]);
    setMostrarModalNuevo(true);
  };

  const toggleGrupo = (grupoId) => {
    setGruposSeleccionados((prev) =>
      prev.includes(grupoId) ? prev.filter((x) => x !== grupoId) : [...prev, grupoId]
    );
  };

  const abrirDetalle = async (id) => {
    try {
      setModalDetalle(true);
      setLoadingDetalle(true);
      const response = await api.get(`/admin/notificaciones/envios/${id}`);
      setDetalle(response.data?.envio || null);
    } catch (err) {
      setDetalle({
        titulo: 'No disponible',
        mensaje: err?.response?.data?.error || 'No se pudo cargar el detalle.',
      });
    } finally {
      setLoadingDetalle(false);
    }
  };

  const enviarNotificacion = async () => {
    const tituloLimpio = titulo.trim();
    const mensajeLimpio = mensaje.trim();
    if (!tituloLimpio || !mensajeLimpio) {
      Swal.fire({
        ...swalSobreModal,
        title: 'Falta información',
        text: 'Título y mensaje son requeridos.',
        icon: 'warning',
      });
      return;
    }
    if (tituloLimpio.length > 120) {
      Swal.fire({
        ...swalSobreModal,
        title: 'Título muy largo',
        text: 'Use hasta 120 caracteres en el título (sin contar el icono).',
        icon: 'warning',
      });
      return;
    }
    if (mensajeLimpio.length > 2000) {
      Swal.fire({
        ...swalSobreModal,
        title: 'Mensaje muy largo',
        text: 'El mensaje no puede superar 2000 caracteres.',
        icon: 'warning',
      });
      return;
    }
    const alcanceEfectivo = gruposSeleccionados.length > 0 ? 'grupos' : alcance;
    if (alcanceEfectivo === 'grupos' && gruposSeleccionados.length === 0) {
      Swal.fire({
        ...swalSobreModal,
        title: 'Falta información',
        text: 'Seleccione al menos un grupo.',
        icon: 'warning',
      });
      return;
    }

    const confirm = await Swal.fire({
      ...swalSobreModal,
      title: '¿Enviar notificación?',
      html: `<p>Se enviará a los destinatarios según cobertura y perfil.</p>
        <p style="margin-top:0.5rem"><strong>Vista previa:</strong> ${tituloPreview(iconoEmoji, tituloLimpio)}</p>`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Enviar',
      cancelButtonText: 'Cancelar',
    });
    if (!confirm.isConfirmed) return;

    try {
      setEnviando(true);
      const response = await api.post('/admin/notificaciones/envios', {
        titulo: tituloLimpio,
        icono_emoji: iconoEmoji,
        mensaje: mensajeLimpio,
        alcance: alcanceEfectivo,
        perfil_destino: perfilDestino,
        grupos_ids: alcanceEfectivo === 'grupos' ? gruposSeleccionados : [],
      });
      Swal.fire({
        ...swalSobreModal,
        title: 'Notificación enviada',
        text: response.data?.message || 'Envío registrado correctamente.',
        icon: 'success',
      });
      setMostrarModalNuevo(false);
      await cargarEnvios();
    } catch (err) {
      Swal.fire({
        ...swalSobreModal,
        title: 'Error',
        text: err?.response?.data?.error || 'No se pudo enviar la notificación.',
        icon: 'error',
      });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="docente-grupos admin-conexiones-page admin-notif-envio-page">
        <div className="page-header">
          <h1>Notificaciones</h1>
          <p className="grupo-subtitle">
            Envío masivo a campanita y dispositivos (push). El mensaje completo queda en la intranet; en el celular
            puede verse resumido.
          </p>
        </div>

        <div className="grupos-list-section mundo-card">
          <div
            className="section-controls"
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}
          >
            <h2 className="section-title-blue">Filtros y acciones</h2>
            {!soloLectura && (
            <button type="button" className="admin-conexiones-btn-nuevo" onClick={abrirModalNuevo}>
              + Nueva Notificación
            </button>
            )}
          </div>

          <div className="admin-cf-filtros">
            <div className="form-group">
              <label>Remitente</label>
              <select
                className="cf-enviar-a-select"
                value={filtroRemitente}
                onChange={(e) => setFiltroRemitente(e.target.value)}
              >
                <option value="">Todos</option>
                {opcionesRemitente.map((op) => (
                  <option key={op.id} value={op.id}>
                    {op.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Grupo</label>
              <select className="cf-enviar-a-select" value={filtroGrupo} onChange={(e) => setFiltroGrupo(e.target.value)}>
                <option value="">Todos</option>
                {grupos.map((g) => (
                  <option key={g.id} value={g.id}>{`${g.grado}° ${g.seccion} ${g.nivel_nombre || ''}`.trim()}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Fecha desde</label>
              <input className="form-input" type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Fecha hasta</label>
              <input className="form-input" type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} />
            </div>
            <div className="form-group admin-cf-filtro-btn-wrap">
              <label>&nbsp;</label>
              <button type="button" className="admin-conexiones-btn-filtro" onClick={cargarEnvios}>
                🔍 Buscar
              </button>
            </div>
          </div>
        </div>

        <div className="grupos-list-section mundo-card admin-cf-historial">
          <div className="section-controls" style={{ marginBottom: '1rem' }}>
            <h2 className="section-title-blue">Historial de envíos</h2>
          </div>
          {loading ? (
            <div className="admin-conexiones-empty">Cargando historial...</div>
          ) : error ? (
            <div className="admin-conexiones-empty">{error}</div>
          ) : items.length === 0 ? (
            <div className="admin-conexiones-empty">No hay notificaciones enviadas. Use «+ Nueva Notificación».</div>
          ) : (
            <div className="historial-mensajes-grid-container">
              <table className="historial-mensajes-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Remitente</th>
                    <th>Grupo / Alcance</th>
                    <th>Perfil</th>
                    <th>Título</th>
                    <th>Destinatarios</th>
                    <th>Ver</th>
                  </tr>
                </thead>
                <tbody>
                  {itemsPaginados.map((row) => (
                    <tr key={row.id}>
                      <td>
                        {(() => {
                          const fh = formatFechaHora(row.fecha_hora);
                          return (
                            <div className="admin-conexiones-fecha-cell">
                              <span>{fh.fecha}</span>
                              <span>{fh.hora}</span>
                            </div>
                          );
                        })()}
                      </td>
                      <td>{row.remitente || '—'}</td>
                      <td title={row.grupo || ''}>{row.grupo || '—'}</td>
                      <td>{etiquetaPerfilDestino(row.perfil_destino)}</td>
                      <td title={row.titulo || ''}>{row.titulo || '—'}</td>
                      <td>
                        <span className="admin-notif-envio-stats" title="Campanita / Push enviados">
                          {row.total_destinatarios ?? 0}
                          <small>
                            {' '}
                            ({row.total_campanita ?? 0} / {row.total_push_enviados ?? 0})
                          </small>
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn-cf-ver"
                          onClick={() => abrirDetalle(row.id)}
                          title="Ver detalle"
                          aria-label="Ver detalle"
                        >
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!loading && !error && items.length > itemsPorPagina && (
            <div className="admin-cf-paginacion">
              <button
                type="button"
                className="admin-cf-page-btn"
                onClick={() => setPaginaActual((p) => Math.max(1, p - 1))}
                disabled={paginaActual === 1}
              >
                Anterior
              </button>
              {paginasVisibles.map((page) => (
                <button
                  key={page}
                  type="button"
                  className={`admin-cf-page-btn ${page === paginaActual ? 'is-active' : ''}`}
                  onClick={() => setPaginaActual(page)}
                >
                  {page}
                </button>
              ))}
              <button
                type="button"
                className="admin-cf-page-btn"
                onClick={() => setPaginaActual((p) => Math.min(totalPaginas, p + 1))}
                disabled={paginaActual === totalPaginas}
              >
                Siguiente
              </button>
            </div>
          )}
        </div>
      </div>

      {mostrarModalNuevo &&
        createPortal(
          <div
            className="modal-mensaje-overlay admin-notif-envio-overlay"
            onClick={() => !enviando && setMostrarModalNuevo(false)}
            role="presentation"
          >
            <div
              className="modal-mensaje-container admin-conexiones-modal-wide admin-notif-envio-modal"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
            >
              <div className="modal-mensaje-header">
                <h2>Nueva notificación</h2>
                <button className="modal-mensaje-close" onClick={() => !enviando && setMostrarModalNuevo(false)} type="button">
                  ✕
                </button>
              </div>
              <div className="modal-mensaje-body">
                <div className="form-group">
                  <label>Icono del título</label>
                  <p className="admin-notif-envio-hint">Emojis compatibles con campanita y alertas en celular/PC.</p>
                  <div className="admin-notif-envio-iconos" role="listbox" aria-label="Icono del título">
                    {ICONOS_PREDEFINIDOS.map((opt) => (
                      <button
                        key={opt.label}
                        type="button"
                        role="option"
                        aria-selected={iconoEmoji === opt.emoji}
                        className={`admin-notif-envio-icon-btn ${iconoEmoji === opt.emoji ? 'is-selected' : ''}`}
                        title={opt.label}
                        onClick={() => setIconoEmoji(opt.emoji)}
                      >
                        {opt.emoji ? <span className="admin-notif-envio-icon-char">{opt.emoji}</span> : <span className="admin-notif-envio-icon-none">—</span>}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="form-group">
                  <label>Título</label>
                  <input
                    className="form-input"
                    value={titulo}
                    onChange={(e) => setTitulo(e.target.value)}
                    placeholder="Ej. Reunión de padres mañana"
                    maxLength={120}
                  />
                  <div className="admin-notif-envio-preview">
                    <strong>Vista previa:</strong> {tituloPreview(iconoEmoji, titulo) || '—'}
                  </div>
                  <div className="admin-notif-envio-counter">{titulo.trim().length}/120</div>
                </div>

                <div className="form-group">
                  <label>Mensaje</label>
                  <textarea
                    className="form-input admin-notif-envio-textarea"
                    value={mensaje}
                    onChange={(e) => setMensaje(e.target.value)}
                    placeholder="Redacte el aviso. En dispositivos móviles se mostrará un resumen; el texto completo queda en la campanita."
                    rows={5}
                    maxLength={2000}
                  />
                  <div className="admin-notif-envio-counter">{mensaje.trim().length}/2000</div>
                </div>

                <div className="admin-conexiones-row">
                  <span className="admin-conexiones-label">Cobertura:</span>
                  <label>
                    <input type="radio" checked={alcance === 'todos'} onChange={() => setAlcance('todos')} /> Todo el colegio
                  </label>
                  <label>
                    <input type="radio" checked={alcance === 'grupos'} onChange={() => setAlcance('grupos')} /> Grupos
                  </label>
                </div>

                <div className="admin-conexiones-row">
                  <span className="admin-conexiones-label">Perfil destino:</span>
                  <label>
                    <input type="radio" checked={perfilDestino === 'todos'} onChange={() => setPerfilDestino('todos')} /> Todos
                  </label>
                  <label>
                    <input type="radio" checked={perfilDestino === 'alumnos'} onChange={() => setPerfilDestino('alumnos')} /> Alumnos
                  </label>
                  <label>
                    <input type="radio" checked={perfilDestino === 'docentes'} onChange={() => setPerfilDestino('docentes')} /> Docentes
                  </label>
                  <label>
                    <input type="radio" checked={perfilDestino === 'apoderados'} onChange={() => setPerfilDestino('apoderados')} /> Apoderados
                  </label>
                  <label title="Administración, secretaría, promotoría, psicología, docentes, asistencia">
                    <input type="radio" checked={perfilDestino === 'todo_personal'} onChange={() => setPerfilDestino('todo_personal')} /> Todo el personal
                  </label>
                </div>

                {alcance === 'grupos' && (
                  <div className="admin-conexiones-grupos">
                    {grupos.map((g) => (
                      <label key={g.id} className="admin-conexiones-grupo-item">
                        <input
                          type="checkbox"
                          checked={gruposSeleccionados.includes(g.id)}
                          onChange={() => toggleGrupo(g.id)}
                        />
                        <span>{`${g.grado}° ${g.seccion} ${g.nivel_nombre || ''}`.trim()}</span>
                      </label>
                    ))}
                  </div>
                )}

                <div className="form-actions">
                  <button className="btn-cancelar" onClick={() => setMostrarModalNuevo(false)} disabled={enviando} type="button">
                    Cancelar
                  </button>
                  <button className="btn-enviar" onClick={enviarNotificacion} disabled={enviando} type="button">
                    {enviando ? 'Enviando...' : 'Enviar notificación'}
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}

      {modalDetalle &&
        createPortal(
          <div className="modal-mensaje-overlay admin-notif-envio-overlay" onClick={() => setModalDetalle(false)} role="presentation">
            <div
              className="modal-mensaje-container admin-conexiones-modal-wide"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
            >
              <div className="modal-mensaje-header">
                <h2>Detalle del envío</h2>
                <button className="modal-mensaje-close" onClick={() => setModalDetalle(false)} type="button">
                  ✕
                </button>
              </div>
              {loadingDetalle ? (
                <div className="admin-conexiones-empty">Cargando detalle...</div>
              ) : (
                <div className="modal-mensaje-body admin-conexiones-modal-body">
                  <div className="admin-conexiones-detalle-info">
                    <div>
                      {(() => {
                        const fh = formatFechaHora(detalle?.fecha_hora);
                        return (
                          <>
                            <strong>Fecha:</strong> {fh.fecha} {fh.hora}
                          </>
                        );
                      })()}
                    </div>
                    <div>
                      <strong>Remitente:</strong> {detalle?.remitente || '—'}
                    </div>
                    <div>
                      <strong>Alcance:</strong>{' '}
                      {String(detalle?.alcance || '').toUpperCase() === 'TODOS' ? 'Todo el colegio' : 'Grupos seleccionados'}
                    </div>
                    <div>
                      <strong>Perfil destino:</strong> {etiquetaPerfilDestino(detalle?.perfil_destino)}
                    </div>
                    <div>
                      <strong>Grupo(s):</strong> {detalle?.grupo || '—'}
                    </div>
                    <div>
                      <strong>Título:</strong> {detalle?.titulo || '—'}
                    </div>
                    <div>
                      <strong>Destinatarios:</strong> {detalle?.total_destinatarios ?? 0} — Campanita:{' '}
                      {detalle?.total_campanita ?? 0} — Push: {detalle?.total_push_enviados ?? 0}
                    </div>
                  </div>
                  <div className="admin-conexiones-mensaje-block">
                    <strong>Mensaje:</strong>
                    <p className="admin-notif-envio-detalle-msg">{detalle?.mensaje || 'Sin contenido'}</p>
                  </div>
                </div>
              )}
              <div className="modal-mensaje-body">
                <div className="form-actions" style={{ marginTop: '0.25rem' }}>
                  <button className="btn-cancelar" onClick={() => setModalDetalle(false)} type="button">
                    Cerrar
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </DashboardLayout>
  );
}
