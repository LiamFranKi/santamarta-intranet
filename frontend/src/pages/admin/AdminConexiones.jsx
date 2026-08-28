import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ReactQuill from 'react-quill';
import Swal from 'sweetalert2';
import DashboardLayout from '../../components/DashboardLayout';
import api from '../../services/api';
import 'react-quill/dist/quill.snow.css';
import '../DocenteGrupos.css';
import './AdminConexiones.css';

const cfSwalSobreModal = {
  target: document.body,
  customClass: { container: 'cf-swal-over-modal' },
  didOpen: (popup) => {
    const root = popup?.closest?.('.swal2-container');
    if (root) root.style.zIndex = '250000';
  }
};

function formatFechaHora(value) {
  if (!value) return { fecha: '—', hora: '—' };
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return { fecha: String(value), hora: '—' };
  const fecha = d.toLocaleDateString('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
  const hora = d.toLocaleTimeString('es-PE', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
  return { fecha, hora };
}

const ETIQUETA_PERFIL_DESTINO = {
  TODOS: 'Todos los perfiles',
  ALUMNOS: 'Alumnos',
  DOCENTES: 'Docentes',
  APODERADOS: 'Apoderados',
  TODO_PERSONAL: 'Todo el personal'
};

function etiquetaPerfilDestino(codigo) {
  const k = String(codigo || '').toUpperCase();
  return ETIQUETA_PERFIL_DESTINO[k] || k || '—';
}

function formatCobertura(row) {
  return etiquetaPerfilDestino(row?.perfil_destino);
}

export default function AdminConexiones() {
  const quillRef = useRef(null);
  const [items, setItems] = useState([]);
  const [paginaActual, setPaginaActual] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [detalle, setDetalle] = useState(null);
  const [detalleRow, setDetalleRow] = useState(null);
  const [loadingDetalle, setLoadingDetalle] = useState(false);
  const [grupos, setGrupos] = useState([]);
  const [filtroPersonal, setFiltroPersonal] = useState('');
  const [filtroGrupo, setFiltroGrupo] = useState('');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [asunto, setAsunto] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [alcance, setAlcance] = useState('todos');
  const [perfilDestino, setPerfilDestino] = useState('todos');
  const [gruposSeleccionados, setGruposSeleccionados] = useState([]);
  const [archivosAdjuntos, setArchivosAdjuntos] = useState([]);
  const [enviando, setEnviando] = useState(false);
  const [mostrarModalNuevo, setMostrarModalNuevo] = useState(false);

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

  const cargarConexiones = async () => {
    try {
      setLoading(true);
      setError('');
      const params = {};
      if (filtroPersonal) params.personal_id = filtroPersonal;
      if (filtroGrupo) params.grupo_id = filtroGrupo;
      if (fechaDesde) params.fecha_desde = fechaDesde;
      if (fechaHasta) params.fecha_hasta = fechaHasta;
      const response = await api.get('/admin/conexiones', { params });
      setItems(response.data?.conexiones || []);
      setPaginaActual(1);
    } catch (err) {
      console.error('Error cargando conexiones familiares:', err);
      setError(err?.response?.data?.error || 'No se pudo cargar la lista de conexiones familiares.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarConexiones();
  }, []);

  useEffect(() => {
    if (gruposSeleccionados.length > 0) {
      setAlcance('grupos');
    }
  }, [gruposSeleccionados]);

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
    if (!mostrarModalNuevo) return undefined;
    const timer = setTimeout(() => {
      const quill = quillRef.current?.getEditor?.();
      if (!quill) return;
      const toolbar = quill.getModule('toolbar');
      if (!toolbar) return;
      toolbar.addHandler('image', async () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.click();
        input.onchange = async () => {
          const file = input.files?.[0];
          if (!file) return;
          if (!file.type.startsWith('image/')) {
            Swal.fire({ ...cfSwalSobreModal, title: 'Error', text: 'Solo se permiten imágenes', icon: 'error' });
            return;
          }
          try {
            const fd = new FormData();
            fd.append('imagen', file);
            const resp = await api.post('/docente/mensajes/subir-imagen', fd, {
              headers: { 'Content-Type': 'multipart/form-data' }
            });
            const url = resp.data?.url;
            if (!url) return;
            const range = quill.getSelection(true) || { index: quill.getLength(), length: 0 };
            quill.insertEmbed(range.index, 'image', url);
            quill.setSelection(range.index + 1);
          } catch (err) {
            Swal.fire({ ...cfSwalSobreModal, title: 'Error', text: 'No se pudo subir la imagen', icon: 'error' });
          }
        };
      });
    }, 150);
    return () => clearTimeout(timer);
  }, [mostrarModalNuevo]);

  useEffect(() => {
    if (paginaActual > totalPaginas) {
      setPaginaActual(totalPaginas);
    }
  }, [paginaActual, totalPaginas]);

  const abrirDetalle = async (rowOrId) => {
    const row = typeof rowOrId === 'object' && rowOrId != null
      ? rowOrId
      : items.find((x) => x.id === rowOrId) || { id: rowOrId };
    const id = row.id;
    try {
      setDetalleRow(row);
      setModalOpen(true);
      setLoadingDetalle(true);
      const response = await api.get(`/admin/conexiones/${id}`);
      setDetalle(response.data?.conexion || null);
    } catch (err) {
      console.error('Error cargando detalle de conexión:', err);
      setDetalle({
        asunto: 'No disponible',
        mensaje: err?.response?.data?.error || 'No se pudo cargar el detalle.'
      });
    } finally {
      setLoadingDetalle(false);
    }
  };

  /** Borra el envío del historial y de todas las bandejas (remitente + destinatarios). */
  const eliminarEnvioParaTodos = async (row) => {
    if (!row?.id) return;
    const resultado = await Swal.fire({
      ...cfSwalSobreModal,
      title: '¿Borrar para TODOS?',
      html:
        `Se eliminará este envío del historial y de <b>todas las bandejas</b> (quien lo envió y quienes lo recibieron).<br/><br/>` +
        `<b>Asunto:</b> ${String(row.asunto || '—').slice(0, 120)}`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#991b1b',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Sí, borrar para todos',
      cancelButtonText: 'Cancelar',
    });
    if (!resultado.isConfirmed) return;

    try {
      const source = row.source || 'conexiones_envios';
      const { data } = await api.delete(`/admin/conexiones/${row.id}`, {
        params: { source },
      });
      Swal.fire({
        ...cfSwalSobreModal,
        icon: 'success',
        title: 'Eliminado',
        text: data?.message || 'Envío eliminado para todos.',
      });
      if (modalOpen && (detalle?.id === row.id || detalleRow?.id === row.id)) {
        setModalOpen(false);
        setDetalle(null);
        setDetalleRow(null);
      }
      await cargarConexiones();
    } catch (err) {
      console.error('Error borrando conexión:', err);
      Swal.fire({
        ...cfSwalSobreModal,
        icon: 'error',
        title: 'Error',
        text: err?.response?.data?.error || 'No se pudo eliminar el envío.',
      });
    }
  };

  const abrirModalNuevo = () => {
    setAsunto('');
    setMensaje('');
    setAlcance('todos');
    setPerfilDestino('todos');
    setGruposSeleccionados([]);
    setArchivosAdjuntos([]);
    setMostrarModalNuevo(true);
  };

  const toggleGrupo = (grupoId) => {
    setGruposSeleccionados((prev) =>
      prev.includes(grupoId) ? prev.filter((x) => x !== grupoId) : [...prev, grupoId]
    );
  };

  const enviarConexion = async () => {
    const textoPlano = String(mensaje || '').replace(/<(.|\n)*?>/g, '').trim();
    if (!asunto.trim() || !textoPlano) {
      Swal.fire({
        ...cfSwalSobreModal,
        title: 'Falta información',
        text: 'Asunto y mensaje son requeridos.',
        icon: 'warning'
      });
      return;
    }
    if (alcance === 'grupos' && gruposSeleccionados.length === 0) {
      Swal.fire({
        ...cfSwalSobreModal,
        title: 'Falta información',
        text: 'Debes seleccionar al menos un grupo.',
        icon: 'warning'
      });
      return;
    }
    try {
      setEnviando(true);
      const alcanceEfectivo = gruposSeleccionados.length > 0 ? 'grupos' : alcance;
      const fd = new FormData();
      fd.append('destinatarios', JSON.stringify([]));
      fd.append('grupos', JSON.stringify(alcanceEfectivo === 'grupos' ? gruposSeleccionados : []));
      fd.append('asunto', asunto.trim());
      fd.append('mensaje', mensaje);
      fd.append('enviar_a', perfilDestino);
      fd.append('alcance', alcanceEfectivo);
      fd.append('modo_conexiones', 'true');
      archivosAdjuntos.forEach((f) => fd.append('archivos', f));
      await api.post('/docente/mensajes/enviar', fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      Swal.fire({
        ...cfSwalSobreModal,
        title: 'Listo',
        text: 'Conexión enviada correctamente.',
        icon: 'success'
      });
      setMostrarModalNuevo(false);
      await cargarConexiones();
    } catch (err) {
      Swal.fire({
        ...cfSwalSobreModal,
        title: 'Error',
        text: err?.response?.data?.error || 'No se pudo enviar la conexión.',
        icon: 'error'
      });
    } finally {
      setEnviando(false);
    }
  };

  const opcionesPersonal = useMemo(() => {
    const map = new Map();
    (items || []).forEach((it) => {
      if (!it.personal_id) return;
      if (!map.has(it.personal_id)) map.set(it.personal_id, it.personal || `Personal ${it.personal_id}`);
    });
    return Array.from(map.entries()).map(([id, label]) => ({ id, label }));
  }, [items]);

  return (
    <DashboardLayout>
      <div className="docente-grupos admin-conexiones-page">
        <div className="page-header">
          <h1>Conexiones Familiares</h1>
          <p className="grupo-subtitle">Envío masivo por cobertura/perfil y listado único de envíos.</p>
        </div>

        <div className="grupos-list-section mundo-card">
          <div
            className="section-controls"
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}
          >
            <h2 className="section-title-blue">Filtros y acciones</h2>
            <button type="button" className="admin-conexiones-btn-nuevo" onClick={abrirModalNuevo}>
              Nueva Conexion
            </button>
          </div>

          <div className="admin-cf-filtros">
            <div className="form-group">
              <label>Personal</label>
              <select className="cf-enviar-a-select" value={filtroPersonal} onChange={(e) => setFiltroPersonal(e.target.value)}>
                <option value="">Todos</option>
                {opcionesPersonal.map((op) => (
                  <option key={op.id} value={op.id}>{op.label}</option>
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
              <button type="button" className="admin-conexiones-btn-filtro" onClick={cargarConexiones}>
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
            <div className="admin-conexiones-empty">Cargando conexiones...</div>
          ) : error ? (
            <div className="admin-conexiones-empty">{error}</div>
          ) : items.length === 0 ? (
            <div className="admin-conexiones-empty">No hay conexiones familiares registradas.</div>
          ) : (
            <div className="historial-mensajes-grid-container">
              <table className="historial-mensajes-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Personal</th>
                    <th>Grupo</th>
                    <th>Cobertura</th>
                    <th>Asunto</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {itemsPaginados.map((row) => (
                    <tr key={`${row.source || 'conn'}-${row.id}`}>
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
                      <td>{row.personal || '—'}</td>
                      <td>{row.grupo || '—'}</td>
                      <td>{formatCobertura(row)}</td>
                      <td title={row.asunto || ''}>{row.asunto || 'Sin asunto'}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            className="btn-cf-ver"
                            onClick={() => abrirDetalle(row)}
                            title="Ver detalle"
                            aria-label="Ver detalle"
                          >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                              <circle cx="12" cy="12" r="3" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            className="btn-cf-ver"
                            onClick={() => eliminarEnvioParaTodos(row)}
                            title="Borrar para todos (todas las bandejas)"
                            aria-label="Borrar para todos"
                            style={{ background: '#991b1b', color: '#fff', borderColor: '#991b1b' }}
                          >
                            🗑️
                          </button>
                        </div>
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

      {mostrarModalNuevo && createPortal(
        <div className="modal-mensaje-overlay" onClick={() => setMostrarModalNuevo(false)} style={{ zIndex: 100000 }}>
          <div className="modal-mensaje-container admin-conexiones-modal-wide" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="modal-mensaje-header">
              <h2>Nueva conexión familiar</h2>
              <button className="modal-mensaje-close" onClick={() => setMostrarModalNuevo(false)} type="button">✕</button>
            </div>
            <div className="modal-mensaje-body">
              <div className="form-group">
                <label>Asunto</label>
                <input
                  className="form-input"
                  value={asunto}
                  onChange={(e) => setAsunto(e.target.value)}
                  placeholder="Asunto del mensaje"
                />
              </div>

              <div className="form-group">
                <label>Mensaje</label>
                <div id="mensaje-editor-wrapper-grupo">
                  <ReactQuill
                    ref={quillRef}
                    theme="snow"
                    value={mensaje}
                    onChange={setMensaje}
                    className="admin-conexiones-editor"
                    modules={{
                      toolbar: [
                        [{ header: [1, 2, false] }],
                        ['bold', 'italic', 'underline'],
                        ['link', 'image'],
                        [{ list: 'ordered' }, { list: 'bullet' }],
                        ['clean']
                      ]
                    }}
                  />
                </div>
              </div>

              <div className="admin-conexiones-row">
                <span className="admin-conexiones-label">Cobertura:</span>
                <label><input type="radio" checked={alcance === 'todos'} onChange={() => setAlcance('todos')} /> Todos</label>
                <label><input type="radio" checked={alcance === 'grupos'} onChange={() => setAlcance('grupos')} /> Grupos</label>
              </div>

              <div className="admin-conexiones-row">
                <span className="admin-conexiones-label">Perfil destino:</span>
                <label title="Alumnos y apoderados de los grupos. No incluye a los docentes del aula.">
                  <input type="radio" checked={perfilDestino === 'todos'} onChange={() => setPerfilDestino('todos')} /> Apoderados y alumnos
                </label>
                <label><input type="radio" checked={perfilDestino === 'alumnos'} onChange={() => setPerfilDestino('alumnos')} /> Alumnos</label>
                <label><input type="radio" checked={perfilDestino === 'docentes'} onChange={() => setPerfilDestino('docentes')} /> Docentes</label>
                <label><input type="radio" checked={perfilDestino === 'apoderados'} onChange={() => setPerfilDestino('apoderados')} /> Apoderados</label>
                <label title="Administración, secretaría, promotoría, psicología, docentes, asistencia. No familias ni alumnos; los docentes que también son apoderados reciben en su usuario docente.">
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

              <div className="form-group">
                <div className="archivos-container">
                  <label htmlFor="archivos-cf-admin" className="btn-adjuntar-archivo">📎 Adjuntar archivos</label>
                  <input
                    id="archivos-cf-admin"
                    type="file"
                    multiple
                    style={{ display: 'none' }}
                    onChange={(e) => setArchivosAdjuntos(Array.from(e.target.files || []))}
                  />
                </div>
              </div>
              {archivosAdjuntos.length > 0 && (
                <div className="admin-conexiones-adjuntos-info">{archivosAdjuntos.length} archivo(s) seleccionado(s)</div>
              )}

              <div className="form-actions">
                <button className="btn-cancelar" onClick={() => setMostrarModalNuevo(false)} type="button">Cancelar</button>
                <button className="btn-enviar" onClick={enviarConexion} disabled={enviando} type="button">
                  {enviando ? 'Enviando...' : 'Enviar conexión'}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {modalOpen && (
        createPortal(
          <div className="modal-mensaje-overlay" onClick={() => setModalOpen(false)} style={{ zIndex: 100000 }}>
            <div className="modal-mensaje-container admin-conexiones-modal-wide" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
              <div className="modal-mensaje-header">
                <h2>Detalle del mensaje</h2>
                <button className="modal-mensaje-close" onClick={() => setModalOpen(false)} type="button">✕</button>
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
                    <div><strong>Personal:</strong> {detalle?.personal || '—'}</div>
                    <div>
                      <strong>Alcance:</strong>{' '}
                      {String(detalle?.alcance || '').toUpperCase() === 'TODOS' ? 'Todo el colegio' : 'Grupos seleccionados'}
                    </div>
                    <div><strong>Perfil destino:</strong> {etiquetaPerfilDestino(detalle?.perfil_destino)}</div>
                    <div><strong>Grupo:</strong> {detalle?.grupo || '—'}</div>
                    <div><strong>Asunto:</strong> {detalle?.asunto || 'Sin asunto'}</div>
                  </div>
                  <div className="admin-conexiones-mensaje-block">
                    <strong>Mensaje:</strong>
                    <div className="admin-conexiones-html" dangerouslySetInnerHTML={{ __html: detalle?.mensaje || '<p>Sin contenido</p>' }} />
                  </div>
                  {detalle?.archivos && Array.isArray(detalle.archivos) && detalle.archivos.length > 0 && (
                    <div className="admin-conexiones-mensaje-block">
                      <strong>Archivos adjuntos ({detalle.archivos.length}):</strong>
                      <div className="admin-conexiones-adjuntos-lista">
                        {detalle.archivos.map((archivo, idx) => (
                          <a
                            key={archivo.id || idx}
                            href={archivo.archivo_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="archivo-enlace"
                            download={archivo.nombre_archivo}
                          >
                            📎 {archivo.nombre_archivo || `Adjunto ${idx + 1}`}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              <div className="modal-mensaje-body">
                <div className="form-actions" style={{ marginTop: '0.25rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {detalleRow?.id && (
                    <button
                      type="button"
                      className="btn-cancelar"
                      style={{ background: '#991b1b', color: '#fff', borderColor: '#991b1b' }}
                      onClick={() => eliminarEnvioParaTodos(detalleRow)}
                    >
                      🗑️ Borrar para todos
                    </button>
                  )}
                  <button className="btn-cancelar" onClick={() => setModalOpen(false)} type="button">Cerrar</button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )
      )}
    </DashboardLayout>
  );
}
