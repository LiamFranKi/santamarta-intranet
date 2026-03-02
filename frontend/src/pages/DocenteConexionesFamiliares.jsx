import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { createPortal } from 'react-dom';
import DashboardLayout from '../components/DashboardLayout';
import api from '../services/api';
import Swal from 'sweetalert2';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import './DocenteGrupos.css';

function DocenteConexionesFamiliares() {
  const { grupoId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [grupo, setGrupo] = useState(null);
  const [historial, setHistorial] = useState([]);
  const [loadingHistorial, setLoadingHistorial] = useState(true);

  // Modal Enviar mensaje
  const [mostrarModalEnviar, setMostrarModalEnviar] = useState(false);
  const [asuntoMensaje, setAsuntoMensaje] = useState('');
  const [contenidoMensaje, setContenidoMensaje] = useState('');
  const [archivosAdjuntos, setArchivosAdjuntos] = useState([]);
  const [enviandoMensaje, setEnviandoMensaje] = useState(false);
  const quillRef = useRef(null);

  // Modal Ver mensaje
  const [mensajeVer, setMensajeVer] = useState(null);

  const cargarGrupo = async () => {
    const grupoDesdeState = location.state?.grupo;
    if (grupoDesdeState && String(grupoDesdeState.id) === String(grupoId)) {
      setGrupo(grupoDesdeState);
      setLoading(false);
      return;
    }
    try {
      const res = await api.get('/docente/grupos');
      const grupos = res.data?.grupos || [];
      const g = grupos.find(gr => String(gr.id) === String(grupoId));
      setGrupo(g || null);
    } catch (err) {
      console.error('Error cargando grupo:', err);
      setGrupo(null);
    } finally {
      setLoading(false);
    }
  };

  const cargarHistorial = async () => {
    if (!grupoId) return;
    setLoadingHistorial(true);
    try {
      const res = await api.get(`/docente/grupos/${grupoId}/mensajes-historial`);
      setHistorial(res.data?.mensajes || []);
      if (res.data?.grupo && !grupo) setGrupo(res.data.grupo);
    } catch (err) {
      console.error('Error cargando historial:', err);
      setHistorial([]);
    } finally {
      setLoadingHistorial(false);
    }
  };

  useEffect(() => {
    cargarGrupo();
  }, [grupoId]);

  useEffect(() => {
    if (grupoId && !loading) {
      cargarHistorial();
    }
  }, [grupoId, loading]);

  const handleArchivoChange = (e) => {
    const files = Array.from(e.target.files);
    setArchivosAdjuntos(prev => [...prev, ...files]);
    e.target.value = '';
  };

  const eliminarArchivo = (index) => {
    setArchivosAdjuntos(prev => prev.filter((_, i) => i !== index));
  };

  const enviarMensaje = async () => {
    if (!grupo) return;
    if (!asuntoMensaje.trim()) {
      Swal.fire('Error', 'El asunto es requerido', 'error');
      return;
    }
    const contenidoLimpio = contenidoMensaje.replace(/<[^>]*>/g, '').trim();
    if (!contenidoLimpio) {
      Swal.fire('Error', 'El mensaje es requerido', 'error');
      return;
    }
    if (enviandoMensaje) return;

    setEnviandoMensaje(true);
    try {
      const formData = new FormData();
      formData.append('destinatarios', JSON.stringify([]));
      formData.append('grupos', JSON.stringify([grupo.id]));
      formData.append('asunto', asuntoMensaje.trim());
      formData.append('mensaje', contenidoMensaje);
      archivosAdjuntos.forEach(archivo => formData.append('archivos', archivo));

      await api.post('/docente/mensajes/enviar', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      Swal.fire({
        title: '¡Mensaje Enviado!',
        text: 'El mensaje se ha enviado correctamente al grupo',
        icon: 'success',
        confirmButtonText: 'Aceptar'
      });

      setAsuntoMensaje('');
      setContenidoMensaje('');
      setArchivosAdjuntos([]);
      setMostrarModalEnviar(false);
      // Pequeña espera para que el backend termine de guardar en mensajes_grupos antes de recargar (evita duplicados por race)
      setTimeout(() => cargarHistorial(), 900);
    } catch (error) {
      console.error('Error enviando mensaje:', error);
      Swal.fire('Error', error.response?.data?.error || 'Error al enviar el mensaje', 'error');
    } finally {
      setEnviandoMensaje(false);
    }
  };

  const formatearFecha = (fechaHora) => {
    if (!fechaHora) return '—';
    const d = new Date(fechaHora);
    return d.toLocaleDateString('es-PE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleEliminarMensaje = async (m) => {
    const confirmado = await Swal.fire({
      title: '¿Eliminar mensaje del historial?',
      text: 'Esta acción no se puede deshacer. El mensaje se quitará solo de este historial.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#dc2626',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    });
    if (!confirmado.isConfirmed) return;
    try {
      await api.delete(`/docente/grupos/${grupoId}/mensajes-historial/${m.id}`);
      setHistorial(prev => prev.filter(item => item.id !== m.id));
      Swal.fire({ title: 'Eliminado', text: 'El mensaje fue eliminado del historial.', icon: 'success', confirmButtonText: 'Aceptar' });
    } catch (err) {
      Swal.fire({ title: 'Error', text: err.response?.data?.error || 'No se pudo eliminar.', icon: 'error', confirmButtonText: 'Aceptar' });
    }
  };

  if (loading || !grupo) {
    return (
      <DashboardLayout>
        <div className="docente-grupos-loading">
          <div className="loading-spinner">
            {loading ? 'Cargando...' : 'Grupo no encontrado'}
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="docente-grupos">
        <div className="page-header">
          <button className="btn-regresar" onClick={() => navigate('/docente/grupos')}>
            <span className="btn-icon">←</span>
            Volver
          </button>
          <h1>Conexiones Familiares</h1>
          <p className="grupo-subtitle">
            {grupo.grado}° {grupo.seccion} — {grupo.nivel_nombre} — {grupo.turno_nombre}
          </p>
        </div>

        <div className="grupos-list-section mundo-card">
          <div className="section-controls" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 className="section-title-blue">Historial de mensajes enviados</h2>
            <button
              className="btn-enviar"
              onClick={() => {
                setAsuntoMensaje('');
                setContenidoMensaje('');
                setArchivosAdjuntos([]);
                setMostrarModalEnviar(true);
              }}
              type="button"
            >
              ✉️ Enviar mensaje al grupo
            </button>
          </div>

          {loadingHistorial ? (
            <div className="loading-notas-detalladas">Cargando historial...</div>
          ) : historial.length === 0 ? (
            <p className="grupo-subtitle" style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
              No hay mensajes enviados a este grupo todavía.
            </p>
          ) : (
            <div className="historial-mensajes-grid-container">
              <table className="historial-mensajes-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Asunto</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {historial.map((m) => (
                    <tr key={m.id}>
                      <td>{formatearFecha(m.fecha_hora)}</td>
                      <td>{m.asunto || '—'}</td>
                      <td>
                        <div className="historial-mensajes-acciones">
                          <button
                            type="button"
                            className="btn-cf-ver"
                            onClick={() => setMensajeVer(m)}
                            title="Ver mensaje"
                            aria-label="Ver mensaje"
                          >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                          </button>
                          <button
                            type="button"
                            className="btn-cf-eliminar"
                            onClick={() => handleEliminarMensaje(m)}
                            title="Eliminar del historial"
                            aria-label="Eliminar mensaje"
                          >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Modal Enviar mensaje */}
      {mostrarModalEnviar && createPortal(
        <div className="modal-mensaje-overlay" onClick={() => setMostrarModalEnviar(false)} style={{ zIndex: 100000 }}>
          <div className="modal-mensaje-container" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="modal-mensaje-header">
              <h2>✉️ Enviar Mensaje al Grupo</h2>
              <button className="modal-mensaje-close" onClick={() => setMostrarModalEnviar(false)} type="button">✕</button>
            </div>
            <div className="modal-mensaje-body">
              <div className="mensaje-grupo-info">
                <p><strong>Grupo:</strong> {grupo.grado}° {grupo.seccion}</p>
                <p><strong>Nivel:</strong> {grupo.nivel_nombre} — {grupo.turno_nombre}</p>
                <p className="mensaje-info-text">El mensaje se enviará a todos los alumnos del grupo</p>
              </div>
              <div className="form-group">
                <label htmlFor="asunto-cf">Asunto:</label>
                <input
                  id="asunto-cf"
                  type="text"
                  className="form-input"
                  value={asuntoMensaje}
                  onChange={e => setAsuntoMensaje(e.target.value)}
                  placeholder="Asunto del mensaje"
                />
              </div>
              <div className="form-group">
                <label>Mensaje:</label>
                <ReactQuill
                  ref={quillRef}
                  theme="snow"
                  value={contenidoMensaje}
                  onChange={setContenidoMensaje}
                  placeholder="Escribe tu mensaje aquí..."
                  modules={{
                    toolbar: [
                      [{ header: [1, 2, 3, false] }],
                      ['bold', 'italic', 'underline', 'strike'],
                      [{ list: 'ordered' }, { list: 'bullet' }],
                      [{ color: [] }, { background: [] }],
                      [{ align: [] }],
                      ['link', 'image'],
                      ['clean']
                    ]
                  }}
                />
              </div>
              <div className="form-group">
                <label>Archivos Adjuntos:</label>
                <div className="archivos-container">
                  <input type="file" id="archivos-cf" multiple onChange={handleArchivoChange} style={{ display: 'none' }} />
                  <label htmlFor="archivos-cf" className="btn-adjuntar-archivo">📎 Adjuntar Archivos</label>
                  {archivosAdjuntos.length > 0 && (
                    <div className="archivos-lista">
                      {archivosAdjuntos.map((archivo, index) => (
                        <div key={index} className="archivo-item">
                          <span className="archivo-nombre">{archivo.name}</span>
                          <button type="button" className="archivo-eliminar" onClick={() => eliminarArchivo(index)}>×</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="form-actions">
                <button className="btn-cancelar" onClick={() => setMostrarModalEnviar(false)} type="button">Cancelar</button>
                <button className="btn-enviar" onClick={enviarMensaje} disabled={enviandoMensaje} type="button">
                  {enviandoMensaje ? '⏳ Enviando...' : '✉️ Enviar Mensaje'}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal Ver mensaje */}
      {mensajeVer && createPortal(
        <div className="modal-mensaje-overlay" onClick={() => setMensajeVer(null)} style={{ zIndex: 100000 }}>
          <div className="modal-mensaje-container" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="modal-mensaje-header">
              <h2>📄 {mensajeVer.asunto || 'Mensaje'}</h2>
              <button className="modal-mensaje-close" onClick={() => setMensajeVer(null)} type="button">✕</button>
            </div>
            <div className="modal-mensaje-body">
              <p className="mensaje-info-text" style={{ marginBottom: '1rem' }}>
                {formatearFecha(mensajeVer.fecha_hora)}
              </p>
              <div
                className="mensaje-contenido-ver"
                dangerouslySetInnerHTML={{ __html: mensajeVer.mensaje || '' }}
                style={{
                  padding: '1rem',
                  background: '#f9fafb',
                  borderRadius: 8,
                  maxHeight: 400,
                  overflowY: 'auto',
                  border: '1px solid #e5e7eb'
                }}
              />
              <div className="form-actions" style={{ marginTop: '1rem' }}>
                <button className="btn-cancelar" onClick={() => setMensajeVer(null)} type="button">Cerrar</button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </DashboardLayout>
  );
}

export default DocenteConexionesFamiliares;
