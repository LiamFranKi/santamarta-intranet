import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ReactQuill from 'react-quill';
import Swal from 'sweetalert2';
import DashboardLayout from '../../components/DashboardLayout';
import api from '../../services/api';
import 'react-quill/dist/quill.snow.css';
import './AdminDocumentosGestion.css';
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
  const alcance = String(row?.alcance || 'TODOS').toUpperCase();
  const perfil = String(row?.perfil_destino || 'TODOS').toUpperCase();
  return `${alcance} • ${perfil}`;
}

export default function AdminConexiones() {
  const quillRef = useRef(null);
  const [items, setItems] = useState([]);
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

  const total = useMemo(() => (items || []).length, [items]);

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
      <div className="dg-page">
        <header className="dg-page-header">
          <h1>Conexiones Familiares</h1>
          <p>Envío masivo por cobertura/perfil y listado único de envíos.</p>
          <span className="admin-conexiones-total">Total: {total}</span>
        </header>

        <section className="dg-section">
          <div className="dg-section-title">
            <span>Filtros y acciones</span>
            <button type="button" className="dg-btn-primary" onClick={abrirModalNuevo}>
              + Nuevo
            </button>
          </div>
          <div className="dg-filters">
            <label>
              Personal
              <select value={filtroPersonal} onChange={(e) => setFiltroPersonal(e.target.value)}>
                <option value="">Todos</option>
                {opcionesPersonal.map((op) => (
                  <option key={op.id} value={op.id}>{op.label}</option>
                ))}
              </select>
            </label>
            <label>
              Grupo
              <select value={filtroGrupo} onChange={(e) => setFiltroGrupo(e.target.value)}>
                <option value="">Todos</option>
                {grupos.map((g) => (
                  <option key={g.id} value={g.id}>{`${g.grado}° ${g.seccion} ${g.nivel_nombre || ''}`.trim()}</option>
                ))}
              </select>
            </label>
            <label>
              Fecha desde
              <input type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} />
            </label>
            <label>
              Fecha hasta
              <input type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} />
            </label>
            <button type="button" className="dg-btn-ghost" onClick={cargarConexiones}>
              Aplicar filtros
            </button>
          </div>
        </section>

        <section className="dg-section">
          <div className="dg-section-title">
            <span>Historial de envíos</span>
          </div>
          {loading ? (
            <div className="admin-conexiones-empty">Cargando conexiones...</div>
          ) : error ? (
            <div className="admin-conexiones-empty">{error}</div>
          ) : items.length === 0 ? (
            <div className="admin-conexiones-empty">No hay conexiones familiares registradas.</div>
          ) : (
            <div className="dg-table-wrap">
              <table className="dg-table">
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
                  {items.map((row) => (
                    <tr key={`${row.source || 'conn'}-${row.id}`}>
                      <td>{formatFecha(row.fecha_hora)}</td>
                      <td>{row.personal || '—'}</td>
                      <td>{row.grupo || '—'}</td>
                      <td>{formatCobertura(row)}</td>
                      <td title={row.asunto || ''}>{row.asunto || 'Sin asunto'}</td>
                      <td>
                        <button type="button" className="dg-btn-ghost" onClick={() => abrirDetalle(row.id)} title="Ver detalle">
                          👁️ Ver
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {mostrarModalNuevo && createPortal(
        <div className="dg-modal-overlay" onClick={() => setMostrarModalNuevo(false)}>
          <div className="dg-modal admin-conexiones-modal-wide" onClick={(e) => e.stopPropagation()}>
            <div className="dg-modal-header">Nueva conexión familiar</div>
            <div className="dg-modal-body">
              <label>
                Asunto
                <input value={asunto} onChange={(e) => setAsunto(e.target.value)} placeholder="Asunto del mensaje" />
              </label>
              <label>
                Mensaje
                <ReactQuill ref={quillRef} theme="snow" value={mensaje} onChange={setMensaje} className="admin-conexiones-editor" />
              </label>

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

              <label>
                Adjuntos
                <input type="file" multiple onChange={(e) => setArchivosAdjuntos(Array.from(e.target.files || []))} />
              </label>
              {archivosAdjuntos.length > 0 && (
                <div className="admin-conexiones-adjuntos-info">{archivosAdjuntos.length} archivo(s) seleccionado(s)</div>
              )}
            </div>

            <div className="dg-modal-footer">
              <button type="button" className="dg-btn-cancel" onClick={() => setMostrarModalNuevo(false)}>
                Cancelar
              </button>
              <button type="button" className="dg-btn-primary" onClick={enviarConexion} disabled={enviando}>
                {enviando ? 'Enviando...' : 'Enviar conexión'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {modalOpen && (
        createPortal(
          <div className="dg-modal-overlay" onClick={() => setModalOpen(false)}>
            <div className="dg-modal admin-conexiones-modal-wide" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
              <div className="dg-modal-header">Detalle del mensaje</div>
              {loadingDetalle ? (
                <div className="admin-conexiones-empty">Cargando detalle...</div>
              ) : (
                <div className="dg-modal-body admin-conexiones-modal-body">
                  <div><strong>Fecha:</strong> {formatFecha(detalle?.fecha_hora)}</div>
                  <div><strong>Personal:</strong> {detalle?.personal || '—'}</div>
                  <div><strong>Cobertura:</strong> {detalle?.alcance || '—'}</div>
                  <div><strong>Perfil destino:</strong> {detalle?.perfil_destino || '—'}</div>
                  <div><strong>Grupo:</strong> {detalle?.grupo || '—'}</div>
                  <div><strong>Asunto:</strong> {detalle?.asunto || 'Sin asunto'}</div>
                  <div className="admin-conexiones-mensaje-block">
                    <strong>Mensaje:</strong>
                    <div className="admin-conexiones-html" dangerouslySetInnerHTML={{ __html: detalle?.mensaje || '<p>Sin contenido</p>' }} />
                  </div>
                </div>
              )}
              <div className="dg-modal-footer">
                <button type="button" className="dg-btn-cancel" onClick={() => setModalOpen(false)}>
                  Cerrar
                </button>
              </div>
            </div>
          </div>,
          document.body
        )
      )}
    </DashboardLayout>
  );
}
