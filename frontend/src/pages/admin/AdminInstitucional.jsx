import React, { useState, useEffect, useCallback, useMemo } from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import api from '../../services/api';
import Swal from 'sweetalert2';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import './AdminDocumentosGestion.css';
import './AdminInstitucional.css';

function baseArchivoUrl(rutaRelativa) {
  if (!rutaRelativa) return '';
  const base = (api.defaults.baseURL || '').replace(/\/api\/?$/, '');
  const p = rutaRelativa.startsWith('/') ? rutaRelativa : `/${rutaRelativa}`;
  return `${base}${p}`;
}

/** null | 'vencido' | 'proximo' | 'ok' */
function estadoVencimiento(fechaVenc) {
  if (!fechaVenc) return null;
  try {
    const end = new Date(fechaVenc);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    if (end < today) return 'vencido';
    const diff = (end.getTime() - today.getTime()) / 86400000;
    if (diff <= 30) return 'proximo';
    return 'ok';
  } catch {
    return null;
  }
}

export default function AdminInstitucional() {
  const [loading, setLoading] = useState(true);
  const [categorias, setCategorias] = useState([]);
  const [documentos, setDocumentos] = useState([]);
  const [filtroCategoria, setFiltroCategoria] = useState('');

  const [modalCat, setModalCat] = useState(false);
  const [catEdit, setCatEdit] = useState(null);
  const [formCat, setFormCat] = useState({ nombre: '', descripcion: '', orden: 0 });

  const [modalDoc, setModalDoc] = useState(false);
  const [docEdit, setDocEdit] = useState(null);
  const [formDoc, setFormDoc] = useState({
    titulo: '',
    categoria_id: '',
    fecha_publicacion: '',
    fecha_vencimiento: ''
  });
  const [archivoDoc, setArchivoDoc] = useState(null);
  /** IDs de categorías con el panel de documentos expandido */
  const [expandedIds, setExpandedIds] = useState(() => new Set());

  const toggleAccordion = (categoriaId) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(categoriaId)) next.delete(categoriaId);
      else next.add(categoriaId);
      return next;
    });
  };

  const cargarCategorias = useCallback(async () => {
    const res = await api.get('/admin/institucional/categorias', {
      params: { excluir_matricula: 1 },
    });
    setCategorias(res.data.categorias || []);
  }, []);

  const cargarDocumentos = useCallback(async () => {
    const params = { excluir_matricula: 1 };
    if (filtroCategoria) params.categoria_id = filtroCategoria;
    const res = await api.get('/admin/institucional/documentos', { params });
    setDocumentos(res.data.documentos || []);
  }, [filtroCategoria]);

  const refrescarTodo = useCallback(async () => {
    try {
      setLoading(true);
      await cargarCategorias();
    } catch (e) {
      console.error(e);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text:
          e.response?.data?.error ||
          'No se pudieron cargar los datos. ¿Ejecutó la migración SQL en la base de datos?'
      });
    } finally {
      setLoading(false);
    }
  }, [cargarCategorias]);

  useEffect(() => {
    refrescarTodo();
  }, [refrescarTodo]);

  useEffect(() => {
    if (loading) return;
    cargarDocumentos().catch(() => {});
  }, [filtroCategoria, loading, cargarDocumentos]);

  const docsByCatId = useMemo(() => {
    const m = {};
    documentos.forEach((d) => {
      const k = d.categoria_id;
      if (!m[k]) m[k] = [];
      m[k].push(d);
    });
    return m;
  }, [documentos]);

  const categoriasMostrar = useMemo(() => {
    if (!filtroCategoria) return categorias;
    return categorias.filter((c) => String(c.id) === String(filtroCategoria));
  }, [categorias, filtroCategoria]);

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
        await api.put(`/admin/institucional/categorias/${catEdit.id}`, formCat);
        Swal.fire({ icon: 'success', title: 'Categoría actualizada', timer: 1600, showConfirmButton: false });
      } else {
        await api.post('/admin/institucional/categorias', formCat);
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
      await api.delete(`/admin/institucional/categorias/${cat.id}`);
      Swal.fire({ icon: 'success', title: 'Eliminada', timer: 1400, showConfirmButton: false });
      await cargarCategorias();
      await cargarDocumentos();
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'No se pudo eliminar', text: e.response?.data?.error || '' });
    }
  };

  const abrirModalDoc = (doc = null, categoriaIdPref = null) => {
    setDocEdit(doc);
    setArchivoDoc(null);
    const defaultCat =
      categoriaIdPref != null
        ? String(categoriaIdPref)
        : categorias[0]?.id
          ? String(categorias[0].id)
          : '';
    setFormDoc(
      doc
        ? {
            titulo: doc.titulo || '',
            categoria_id: String(doc.categoria_id || ''),
            fecha_publicacion: doc.fecha_publicacion ? String(doc.fecha_publicacion).slice(0, 10) : '',
            fecha_vencimiento: doc.fecha_vencimiento ? String(doc.fecha_vencimiento).slice(0, 10) : ''
          }
        : {
            titulo: '',
            categoria_id: defaultCat,
            fecha_publicacion: '',
            fecha_vencimiento: ''
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
      if (docEdit) {
        fd.append('fecha_publicacion', formDoc.fecha_publicacion || '');
        fd.append('fecha_vencimiento', formDoc.fecha_vencimiento || '');
      } else {
        if (formDoc.fecha_publicacion) fd.append('fecha_publicacion', formDoc.fecha_publicacion);
        if (formDoc.fecha_vencimiento) fd.append('fecha_vencimiento', formDoc.fecha_vencimiento);
      }
      if (archivoDoc) fd.append('archivo', archivoDoc);

      if (docEdit) {
        await api.put(`/admin/institucional/documentos/${docEdit.id}`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
      } else {
        await api.post('/admin/institucional/documentos', fd, {
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
      await api.delete(`/admin/institucional/documentos/${doc.id}`);
      Swal.fire({ icon: 'success', title: 'Eliminado', timer: 1400, showConfirmButton: false });
      await cargarDocumentos();
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'Error', text: e.response?.data?.error || '' });
    }
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
        <div className="inst-page">
          <div className="dg-loading">Cargando Institucional…</div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="inst-page">
        <header className="inst-hero">
          <div className="inst-hero-icon" aria-hidden="true">
            🏛️
          </div>
          <div className="inst-hero-text">
            <h1>Institucional</h1>
            <p>
              Documentación institucional en PDF, organizada por categorías. Con fecha de vencimiento, los
              administradores reciben avisos en la campanita (y push, si está activo) a los 10, 5 y 1 día antes,
              el día del vencimiento y el día siguiente. Los documentos de <strong>Matrícula</strong> se gestionan
              en <strong>Web → Matrícula</strong> (no se listan aquí).
            </p>
            <div className="inst-hero-meta">
              <span className="inst-hero-chip">{categorias.length} categorí{categorias.length === 1 ? 'a' : 'as'}</span>
              <span className="inst-hero-chip">{documentos.length} documento{documentos.length === 1 ? '' : 's'}</span>
            </div>
          </div>
        </header>

        <div className="inst-help">
          <div className="inst-help-icon" aria-hidden="true">
            💡
          </div>
          <div>
            <h2>Categorías y documentos</h2>
            <p>
              Expandí una categoría para ver sus PDF. Podés filtrar, crear categorías y subir documentos. Los
              vencidos o próximos a vencer se marcan en la lista.
            </p>
          </div>
        </div>

        <div className="inst-toolbar" aria-label="Acciones de categorías y documentos">
          <nav className="inst-tabs" aria-label="Vista institucional">
            <button type="button" className="inst-tab is-active" disabled>
              Categorías
            </button>
          </nav>
          <div className="inst-toolbar-actions">
            <button type="button" className="inst-btn-primary" onClick={() => abrirModalCat(null)}>
              + Nueva categoría
            </button>
            <button
              type="button"
              className="inst-btn-primary inst-btn-primary--teal"
              onClick={() => abrirModalDoc(null)}
              disabled={!categorias.length}
            >
              + Subir documento
            </button>
          </div>
          <div className="inst-filter">
            <label>
              Mostrar
              <select value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value)}>
                <option value="">Todas las categorías</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {categorias.length === 0 ? (
          <p className="dg-empty">No hay categorías. Cree la primera para poder subir documentos.</p>
        ) : categoriasMostrar.length === 0 ? (
          <p className="dg-empty">No hay categorías para mostrar con el filtro actual.</p>
        ) : (
          <div className="inst-acc-list" role="list">
            {categoriasMostrar.map((c) => {
              const lista = docsByCatId[c.id] || [];
              const open = expandedIds.has(c.id);
              const colorIdx = Math.abs(Number(c.id)) % 8;
              return (
                <article
                  key={c.id}
                  className={`inst-acc-card inst-acc-card--${colorIdx}`}
                  role="listitem"
                >
                  <div className="inst-acc-top">
                    <button
                      type="button"
                      className="inst-acc-header"
                      onClick={() => toggleAccordion(c.id)}
                      aria-expanded={open}
                      id={`inst-acc-trigger-${c.id}`}
                      aria-controls={`inst-acc-panel-${c.id}`}
                    >
                      <span
                        className={`inst-acc-chevron ${open ? 'inst-acc-chevron--open' : ''}`}
                        aria-hidden
                      >
                        <ExpandMoreIcon fontSize="small" />
                      </span>
                      <span className="inst-acc-folder" aria-hidden="true">
                        📁
                      </span>
                      <span className="inst-acc-header-main">
                        <span className="inst-acc-name">{c.nombre}</span>
                        {c.descripcion ? <p className="inst-acc-desc">{c.descripcion}</p> : null}
                        <div className="inst-acc-meta">
                          Orden: {c.orden} · {lista.length} documento{lista.length === 1 ? '' : 's'}
                        </div>
                      </span>
                    </button>
                    <div className="inst-acc-actions">
                      <Tooltip title="Editar categoría">
                        <IconButton
                          size="small"
                          color="primary"
                          onClick={() => abrirModalCat(c)}
                          aria-label={`Editar categoría ${c.nombre}`}
                        >
                          <EditOutlinedIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Eliminar categoría">
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => eliminarCategoria(c)}
                          aria-label={`Eliminar categoría ${c.nombre}`}
                        >
                          <DeleteOutlineIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </div>
                  </div>

                  <div
                    id={`inst-acc-panel-${c.id}`}
                    role="region"
                    aria-labelledby={`inst-acc-trigger-${c.id}`}
                    className={`inst-acc-panel ${open ? 'inst-acc-panel--open' : ''}`}
                    aria-hidden={!open}
                  >
                    <div className="inst-acc-panel-inner">
                      <div className="inst-acc-body inst-acc-body-pad">
                        <div className="inst-inner-card">
                          <div className="inst-doc-actions-row">
                            <span className="inst-acc-meta" style={{ marginTop: 0 }}>
                              Documentos en esta categoría
                            </span>
                            <button
                              type="button"
                              className="inst-btn-nuevo-doc"
                              onClick={() => abrirModalDoc(null, c.id)}
                              disabled={!categorias.length}
                            >
                              + Nuevo
                            </button>
                          </div>
                          {lista.length === 0 ? (
                            <p className="inst-empty">
                              Sin documentos. Use &quot;+ Nuevo&quot; aquí o &quot;Subir documento&quot; en la barra
                              superior.
                            </p>
                          ) : (
                            <div className="inst-table-wrap">
                              <table className="inst-table">
                                <thead>
                                  <tr>
                                    <th>Documento</th>
                                    <th>Publicación</th>
                                    <th>Vencimiento</th>
                                    <th style={{ width: 130 }}>Acciones</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {lista.map((d) => {
                                    const ev = estadoVencimiento(d.fecha_vencimiento);
                                    return (
                                      <tr key={d.id}>
                                        <td className="inst-doc-titulo">
                                          {d.titulo}
                                          {ev === 'vencido' ? (
                                            <span className="inst-badge inst-badge--vencido">Vencido</span>
                                          ) : null}
                                          {ev === 'proximo' ? (
                                            <span className="inst-badge inst-badge--proximo">Por vencer</span>
                                          ) : null}
                                        </td>
                                        <td>{fmtFecha(d.fecha_publicacion || d.created_at)}</td>
                                        <td>{fmtFecha(d.fecha_vencimiento)}</td>
                                        <td>
                                          <div className="inst-icon-actions">
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
                                              <IconButton
                                                size="small"
                                                color="primary"
                                                onClick={() => abrirModalDoc(d)}
                                                aria-label="Editar"
                                              >
                                                <EditOutlinedIcon fontSize="small" />
                                              </IconButton>
                                            </Tooltip>
                                            <Tooltip title="Eliminar">
                                              <IconButton
                                                size="small"
                                                color="error"
                                                onClick={() => eliminarDocumento(d)}
                                                aria-label="Eliminar"
                                              >
                                                <DeleteOutlineIcon fontSize="small" />
                                              </IconButton>
                                            </Tooltip>
                                          </div>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
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
                Fecha de publicación (opcional)
                <input
                  type="date"
                  value={formDoc.fecha_publicacion}
                  onChange={(e) => setFormDoc({ ...formDoc, fecha_publicacion: e.target.value })}
                />
              </label>
              <label>
                Fecha de vencimiento (opcional)
                <input
                  type="date"
                  value={formDoc.fecha_vencimiento}
                  onChange={(e) => setFormDoc({ ...formDoc, fecha_vencimiento: e.target.value })}
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
