import React, { useState, useEffect, useCallback } from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import api from '../../services/api';
import Swal from 'sweetalert2';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import './AdminDocumentosGestion.css';

function baseArchivoUrl(rutaRelativa) {
  if (!rutaRelativa) return '';
  const base = (api.defaults.baseURL || '').replace(/\/api\/?$/, '');
  const p = rutaRelativa.startsWith('/') ? rutaRelativa : `/${rutaRelativa}`;
  return `${base}${p}`;
}

function AdminDocumentosGestion() {
  const [loading, setLoading] = useState(true);
  const [categorias, setCategorias] = useState([]);
  const [documentos, setDocumentos] = useState([]);
  const [perfiles, setPerfiles] = useState([]);
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [filtroPerfil, setFiltroPerfil] = useState('');

  const [modalCat, setModalCat] = useState(false);
  const [catEdit, setCatEdit] = useState(null);
  const [formCat, setFormCat] = useState({ nombre: '', descripcion: '', orden: 0 });

  const [modalDoc, setModalDoc] = useState(false);
  const [docEdit, setDocEdit] = useState(null);
  const [formDoc, setFormDoc] = useState({
    titulo: '',
    categoria_id: '',
    perfil_destino: 'DOCENTE',
    fecha_publicacion: ''
  });
  const [archivoDoc, setArchivoDoc] = useState(null);

  const cargarPerfiles = useCallback(async () => {
    try {
      const res = await api.get('/admin/gestion-documentos/perfiles-tipos');
      setPerfiles(res.data.perfiles || []);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const cargarCategorias = useCallback(async () => {
    const res = await api.get('/admin/gestion-documentos/categorias');
    setCategorias(res.data.categorias || []);
  }, []);

  const cargarDocumentos = useCallback(async () => {
    const params = {};
    if (filtroCategoria) params.categoria_id = filtroCategoria;
    if (filtroPerfil) params.perfil_destino = filtroPerfil;
    const res = await api.get('/admin/gestion-documentos', { params });
    setDocumentos(res.data.documentos || []);
  }, [filtroCategoria, filtroPerfil]);

  const refrescarTodo = useCallback(async () => {
    try {
      setLoading(true);
      await Promise.all([cargarPerfiles(), cargarCategorias()]);
    } catch (e) {
      console.error(e);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: e.response?.data?.error || 'No se pudieron cargar los datos. ¿Ejecutó el SQL en la base de datos?'
      });
    } finally {
      setLoading(false);
    }
  }, [cargarPerfiles, cargarCategorias]);

  useEffect(() => {
    refrescarTodo();
  }, [refrescarTodo]);

  useEffect(() => {
    if (loading) return;
    cargarDocumentos().catch(() => {});
  }, [filtroCategoria, filtroPerfil, loading, cargarDocumentos]);

  const abrirModalCat = (cat = null) => {
    setCatEdit(cat);
    setFormCat(
      cat
        ? { nombre: cat.nombre || '', descripcion: cat.descripcion || '', orden: cat.orden ?? 0 }
        : { nombre: '', descripcion: '', orden: 0 }
    );
    setModalCat(true);
  };

  const guardarCategoria = async () => {
    if (!formCat.nombre.trim()) {
      Swal.fire({ icon: 'warning', title: 'Nombre requerido' });
      return;
    }
    try {
      if (catEdit) {
        await api.put(`/admin/gestion-documentos/categorias/${catEdit.id}`, formCat);
        Swal.fire({ icon: 'success', title: 'Categoría actualizada', timer: 1600, showConfirmButton: false });
      } else {
        await api.post('/admin/gestion-documentos/categorias', formCat);
        Swal.fire({ icon: 'success', title: 'Categoría creada', timer: 1600, showConfirmButton: false });
      }
      setModalCat(false);
      await cargarCategorias();
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'Error', text: e.response?.data?.error || 'No se pudo guardar' });
    }
  };

  const eliminarCategoria = async (cat) => {
    const ok = await Swal.fire({
      icon: 'question',
      title: '¿Eliminar categoría?',
      text: cat.nombre,
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    });
    if (!ok.isConfirmed) return;
    try {
      await api.delete(`/admin/gestion-documentos/categorias/${cat.id}`);
      Swal.fire({ icon: 'success', title: 'Eliminada', timer: 1400, showConfirmButton: false });
      await cargarCategorias();
      await cargarDocumentos();
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'No se pudo eliminar', text: e.response?.data?.error || '' });
    }
  };

  const abrirModalDoc = (doc = null) => {
    setDocEdit(doc);
    setArchivoDoc(null);
    setFormDoc(
      doc
        ? {
            titulo: doc.titulo || '',
            categoria_id: String(doc.categoria_id || ''),
            perfil_destino: doc.perfil_destino || 'DOCENTE',
            fecha_publicacion: doc.fecha_publicacion
              ? String(doc.fecha_publicacion).slice(0, 10)
              : ''
          }
        : {
            titulo: '',
            categoria_id: categorias[0]?.id ? String(categorias[0].id) : '',
            perfil_destino: 'DOCENTE',
            fecha_publicacion: ''
          }
    );
    setModalDoc(true);
  };

  const guardarDocumento = async () => {
    if (!formDoc.titulo.trim()) {
      Swal.fire({ icon: 'warning', title: 'Título requerido' });
      return;
    }
    if (!formDoc.categoria_id) {
      Swal.fire({ icon: 'warning', title: 'Elija una categoría' });
      return;
    }
    if (!docEdit && !archivoDoc) {
      Swal.fire({ icon: 'warning', title: 'Debe seleccionar un PDF' });
      return;
    }
    try {
      const fd = new FormData();
      fd.append('titulo', formDoc.titulo.trim());
      fd.append('categoria_id', formDoc.categoria_id);
      fd.append('perfil_destino', formDoc.perfil_destino);
      if (formDoc.fecha_publicacion) fd.append('fecha_publicacion', formDoc.fecha_publicacion);
      if (archivoDoc) fd.append('archivo', archivoDoc);

      if (docEdit) {
        await api.put(`/admin/gestion-documentos/${docEdit.id}`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
      } else {
        await api.post('/admin/gestion-documentos', fd, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
      }
      Swal.fire({ icon: 'success', title: 'Guardado', timer: 1600, showConfirmButton: false });
      setModalDoc(false);
      await cargarDocumentos();
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'Error', text: e.response?.data?.error || 'No se pudo guardar' });
    }
  };

  const eliminarDocumento = async (doc) => {
    const ok = await Swal.fire({
      icon: 'warning',
      title: '¿Eliminar documento?',
      text: doc.titulo,
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    });
    if (!ok.isConfirmed) return;
    try {
      await api.delete(`/admin/gestion-documentos/${doc.id}`);
      Swal.fire({ icon: 'success', title: 'Eliminado', timer: 1400, showConfirmButton: false });
      await cargarDocumentos();
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'Error', text: e.response?.data?.error || '' });
    }
  };

  const etiquetaPerfil = (codigo) => {
    const p = perfiles.find((x) => x.value === codigo);
    return p ? p.label : codigo;
  };

  const fmtFecha = (d) => {
    if (!d) return '—';
    try {
      return new Date(d).toLocaleDateString('es-PE', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return d;
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="dg-page">
          <div className="dg-loading">Cargando Documento De Gestión…</div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="dg-page">
        <header className="dg-page-header">
          <h1>Documento De Gestión</h1>
          <p>Suba PDFs, organícelos por categoría y defina qué perfil de usuario puede verlos.</p>
        </header>

        <section className="dg-section" aria-labelledby="dg-cat-heading">
          <div className="dg-section-title" id="dg-cat-heading">
            <span>Categorías</span>
            <button type="button" className="dg-btn-primary" onClick={() => abrirModalCat(null)}>
              + Nueva categoría
            </button>
          </div>
          {categorias.length === 0 ? (
            <p className="dg-empty">No hay categorías. Cree la primera para poder subir documentos.</p>
          ) : (
            <div className="dg-categorias-grid">
              {categorias.map((c) => (
                <div key={c.id} className="dg-cat-card">
                  <h4>{c.nombre}</h4>
                  {c.descripcion ? <p className="dg-cat-meta">{c.descripcion}</p> : null}
                  <span className="dg-cat-meta">Orden: {c.orden}</span>
                  <div className="dg-cat-actions">
                    <Tooltip title="Editar categoría">
                      <IconButton size="small" color="primary" onClick={() => abrirModalCat(c)} aria-label="Editar">
                        <EditOutlinedIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Eliminar categoría">
                      <IconButton size="small" color="error" onClick={() => eliminarCategoria(c)} aria-label="Eliminar">
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="dg-section" aria-labelledby="dg-doc-heading">
          <div className="dg-section-title" id="dg-doc-heading">
            <span>Documentos PDF</span>
            <button
              type="button"
              className="dg-btn-primary"
              onClick={() => abrirModalDoc(null)}
              disabled={!categorias.length}
            >
              + Subir documento
            </button>
          </div>

          <div className="dg-filters">
            <label>
              Categoría
              <select value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value)}>
                <option value="">Todas</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Perfil destino
              <select value={filtroPerfil} onChange={(e) => setFiltroPerfil(e.target.value)}>
                <option value="">Todos</option>
                {perfiles.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {documentos.length === 0 ? (
            <p className="dg-empty">No hay documentos con los filtros actuales.</p>
          ) : (
            <div className="dg-table-wrap">
              <table className="dg-table">
                <thead>
                  <tr>
                    <th>Documento</th>
                    <th>Categoría</th>
                    <th>Perfil</th>
                    <th>Publicación</th>
                    <th style={{ width: 130 }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {documentos.map((d) => (
                    <tr key={d.id}>
                      <td className="dg-doc-titulo">{d.titulo}</td>
                      <td>{d.categoria_nombre}</td>
                      <td>
                        <span className="dg-badge-perfil">{etiquetaPerfil(d.perfil_destino)}</span>
                      </td>
                      <td>{fmtFecha(d.fecha_publicacion || d.created_at)}</td>
                      <td>
                        <div className="dg-icon-actions">
                          <Tooltip title="Ver PDF">
                            <IconButton
                              size="small"
                              color="primary"
                              component="a"
                              href={baseArchivoUrl(d.archivo_url)}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label="Ver PDF"
                            >
                              <VisibilityOutlinedIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Editar">
                            <IconButton size="small" color="primary" onClick={() => abrirModalDoc(d)} aria-label="Editar">
                              <EditOutlinedIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Eliminar">
                            <IconButton size="small" color="error" onClick={() => eliminarDocumento(d)} aria-label="Eliminar">
                              <DeleteOutlineIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {modalCat && (
        <div className="dg-modal-overlay" role="dialog" aria-modal="true" onClick={() => setModalCat(false)}>
          <div className="dg-modal" onClick={(e) => e.stopPropagation()}>
            <div className="dg-modal-header">{catEdit ? 'Editar categoría' : 'Nueva categoría'}</div>
            <div className="dg-modal-body">
              <label>
                Nombre *
                <input
                  value={formCat.nombre}
                  onChange={(e) => setFormCat({ ...formCat, nombre: e.target.value })}
                  maxLength={120}
                />
              </label>
              <label>
                Descripción
                <textarea value={formCat.descripcion} onChange={(e) => setFormCat({ ...formCat, descripcion: e.target.value })} />
              </label>
              <label>
                Orden (menor = primero)
                <input
                  type="number"
                  value={formCat.orden}
                  onChange={(e) => setFormCat({ ...formCat, orden: parseInt(e.target.value, 10) || 0 })}
                />
              </label>
            </div>
            <div className="dg-modal-footer">
              <button type="button" className="dg-btn-cancel" onClick={() => setModalCat(false)}>
                Cancelar
              </button>
              <button type="button" className="dg-btn-primary" onClick={guardarCategoria}>
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {modalDoc && (
        <div className="dg-modal-overlay" role="dialog" aria-modal="true" onClick={() => setModalDoc(false)}>
          <div className="dg-modal" onClick={(e) => e.stopPropagation()}>
            <div className="dg-modal-header">{docEdit ? 'Editar documento' : 'Nuevo documento PDF'}</div>
            <div className="dg-modal-body">
              <label>
                Título *
                <input value={formDoc.titulo} onChange={(e) => setFormDoc({ ...formDoc, titulo: e.target.value })} maxLength={255} />
              </label>
              <label>
                Categoría *
                <select value={formDoc.categoria_id} onChange={(e) => setFormDoc({ ...formDoc, categoria_id: e.target.value })}>
                  <option value="">— Seleccione —</option>
                  {categorias.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Visible para (perfil)
                <select
                  value={formDoc.perfil_destino}
                  onChange={(e) => setFormDoc({ ...formDoc, perfil_destino: e.target.value })}
                >
                  {perfiles.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Fecha de publicación (opcional)
                <input
                  type="date"
                  value={formDoc.fecha_publicacion}
                  onChange={(e) => setFormDoc({ ...formDoc, fecha_publicacion: e.target.value })}
                />
              </label>
              <label>
                Archivo PDF {docEdit ? '(opcional — dejar vacío para mantener el actual)' : '*'}
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={(e) => setArchivoDoc(e.target.files?.[0] || null)}
                />
              </label>
            </div>
            <div className="dg-modal-footer">
              <button type="button" className="dg-btn-cancel" onClick={() => setModalDoc(false)}>
                Cancelar
              </button>
              <button type="button" className="dg-btn-primary" onClick={guardarDocumento}>
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

export default AdminDocumentosGestion;
