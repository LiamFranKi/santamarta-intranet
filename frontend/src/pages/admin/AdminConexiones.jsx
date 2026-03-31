import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ReactQuill from 'react-quill';
import Swal from 'sweetalert2';
import DashboardLayout from '../../components/DashboardLayout';
import api from '../../services/api';
import 'react-quill/dist/quill.snow.css';
import '../DocenteGrupos.css';
import './AdminConexiones.css';

function formatFecha(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatCobertura(row) {
  const perfil = String(row?.perfil_destino || 'TODOS').toUpperCase();
  return perfil;
}

export default function AdminConexiones() {
  const quillRef = useRef(null);
  const [items, setItems] = useState([]);
  const [paginaActual, setPaginaActual] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [detalle, setDetalle] = useState(null);
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
    if (!quillRef.current) return;
    const quill = quillRef.current.getEditor();
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
          Swal.fire('Error', 'Solo se permiten imágenes', 'error');
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
          const range = quill.getSelection(true);
          quill.insertEmbed(range.index, 'image', url);
          quill.setSelection(range.index + 1);
        } catch (err) {
          Swal.fire('Error', 'No se pudo subir la imagen', 'error');
        }
      };
    });
  }, []);

  useEffect(() => {
    if (paginaActual > totalPaginas) {
      setPaginaActual(totalPaginas);
    }
  }, [paginaActual, totalPaginas]);

  const abrirDetalle = async (id) => {
    try {
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
      Swal.fire('Falta información', 'Asunto y mensaje son requeridos.', 'warning');
      return;
    }
    if (alcance === 'grupos' && gruposSeleccionados.length === 0) {
      Swal.fire('Falta información', 'Debes seleccionar al menos un grupo.', 'warning');
      return;
    }
    try {
      setEnviando(true);
      const fd = new FormData();
      fd.append('destinatarios', JSON.stringify([]));
      fd.append('grupos', JSON.stringify(alcance === 'grupos' ? gruposSeleccionados : []));
      fd.append('asunto', asunto.trim());
      fd.append('mensaje', mensaje);
      fd.append('enviar_a', perfilDestino);
      fd.append('alcance', alcance);
      fd.append('modo_conexiones', 'true');
      archivosAdjuntos.forEach((f) => fd.append('archivos', f));
      await api.post('/docente/mensajes/enviar', fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      Swal.fire('Listo', 'Conexión enviada correctamente.', 'success');
      setMostrarModalNuevo(false);
      await cargarConexiones();
    } catch (err) {
      Swal.fire('Error', err?.response?.data?.error || 'No se pudo enviar la conexión.', 'error');
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
              NUEVA PUBLICACION
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
                Aplicar filtros
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
                    <th>Ver</th>
                  </tr>
                </thead>
                <tbody>
                  {itemsPaginados.map((row) => (
                    <tr key={`${row.source || 'conn'}-${row.id}`}>
                      <td>{formatFecha(row.fecha_hora)}</td>
                      <td>{row.personal || '—'}</td>
                      <td>{row.grupo || '—'}</td>
                      <td>{formatCobertura(row)}</td>
                      <td title={row.asunto || ''}>{row.asunto || 'Sin asunto'}</td>
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
                <label><input type="radio" checked={perfilDestino === 'todos'} onChange={() => setPerfilDestino('todos')} /> Todos</label>
                <label><input type="radio" checked={perfilDestino === 'alumnos'} onChange={() => setPerfilDestino('alumnos')} /> Alumnos</label>
                <label><input type="radio" checked={perfilDestino === 'docentes'} onChange={() => setPerfilDestino('docentes')} /> Docentes</label>
                <label><input type="radio" checked={perfilDestino === 'apoderados'} onChange={() => setPerfilDestino('apoderados')} /> Apoderados</label>
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
                    <div><strong>Fecha:</strong> {formatFecha(detalle?.fecha_hora)}</div>
                    <div><strong>Personal:</strong> {detalle?.personal || '—'}</div>
                    <div><strong>Cobertura:</strong> {String(detalle?.perfil_destino || '—').toUpperCase()}</div>
                    <div><strong>Grupo:</strong> {detalle?.grupo || '—'}</div>
                    <div><strong>Asunto:</strong> {detalle?.asunto || 'Sin asunto'}</div>
                  </div>
                  <div className="admin-conexiones-mensaje-block">
                    <strong>Mensaje:</strong>
                    <div className="admin-conexiones-html" dangerouslySetInnerHTML={{ __html: detalle?.mensaje || '<p>Sin contenido</p>' }} />
                  </div>
                </div>
              )}
              <div className="modal-mensaje-body">
                <div className="form-actions" style={{ marginTop: '0.25rem' }}>
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
