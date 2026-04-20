import React, { useCallback, useEffect, useState } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import api from '../services/api';
import Swal from 'sweetalert2';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import './VocabulariosPage.css';

function archivoAbsUrl(archivoUrl) {
  if (!archivoUrl) return '';
  const base = (api.defaults.baseURL || '').replace(/\/api\/?$/, '');
  const p = archivoUrl.startsWith('/') ? archivoUrl : `/${archivoUrl}`;
  return `${base}${p}`;
}

function formatFecha(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
}

const VARIANT_COPY = {
  admin: {
    title: 'Vocabularios',
    subtitle: 'Gestione los PDF de vocabulario por nivel y grado. Los alumnos solo ven los de su grado.',
    section: 'Listado del colegio (año lectivo actual)'
  },
  docente: {
    title: 'Vocabularios',
    subtitle: 'Suba PDF para los grados donde imparte o es tutor. Los alumnos los verán en su menú.',
    section: 'Publicaciones visibles para sus grados'
  },
  alumno: {
    title: 'Vocabulario',
    subtitle: 'Material de vocabulario publicado para su nivel y grado.',
    section: 'Documentos disponibles'
  }
};

export default function VocabulariosPage({ variant = 'admin' }) {
  const copy = VARIANT_COPY[variant] || VARIANT_COPY.admin;
  const puedeGestionar = variant === 'admin' || variant === 'docente';

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [opciones, setOpciones] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState({ nivel_grado: '', titulo: '', descripcion: '' });
  const [archivo, setArchivo] = useState(null);

  const cargarOpciones = useCallback(async () => {
    if (!puedeGestionar) return;
    try {
      const res = await api.get('/vocabularios/opciones-grado');
      setOpciones(res.data.opciones || []);
    } catch (e) {
      console.error(e);
      setOpciones([]);
    }
  }, [puedeGestionar]);

  const cargarLista = useCallback(async () => {
    const res = await api.get('/vocabularios');
    setItems(res.data.items || []);
  }, []);

  const refrescar = useCallback(async () => {
    try {
      setLoading(true);
      await Promise.all([cargarOpciones().catch(() => {}), cargarLista()]);
    } catch (e) {
      console.error(e);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: e.response?.data?.error || 'No se pudo cargar el listado.'
      });
    } finally {
      setLoading(false);
    }
  }, [cargarLista, cargarOpciones]);

  useEffect(() => {
    refrescar();
  }, [refrescar]);

  const parseNivelGrado = (val) => {
    const [nid, gr] = String(val).split('|');
    return { nivel_id: parseInt(nid, 10), grado: parseInt(gr, 10) };
  };

  const abrirModal = (row = null) => {
    setEditItem(row);
    setArchivo(null);
    if (row) {
      setForm({
        nivel_grado: `${row.nivel_id}|${row.grado}`,
        titulo: row.titulo || '',
        descripcion: row.descripcion || ''
      });
    } else {
      const first = opciones[0];
      setForm({
        nivel_grado: first ? `${first.nivel_id}|${first.grado}` : '',
        titulo: '',
        descripcion: ''
      });
    }
    setModalOpen(true);
  };

  const guardar = async () => {
    if (!form.titulo.trim()) {
      Swal.fire({ icon: 'warning', title: 'Indique un nombre o título' });
      return;
    }
    if (!form.nivel_grado) {
      Swal.fire({ icon: 'warning', title: 'Elija nivel y grado' });
      return;
    }
    if (!editItem && !archivo) {
      Swal.fire({ icon: 'warning', title: 'Debe adjuntar un PDF' });
      return;
    }
    const { nivel_id, grado } = parseNivelGrado(form.nivel_grado);
    if (!nivel_id || Number.isNaN(grado)) {
      Swal.fire({ icon: 'warning', title: 'Nivel y grado no válidos' });
      return;
    }

    const fd = new FormData();
    fd.append('nivel_id', String(nivel_id));
    fd.append('grado', String(grado));
    fd.append('titulo', form.titulo.trim());
    fd.append('descripcion', form.descripcion.trim());
    if (archivo) fd.append('archivo', archivo);

    try {
      if (editItem) {
        await api.put(`/vocabularios/${editItem.id}`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
      } else {
        await api.post('/vocabularios', fd, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
      }
      Swal.fire({ icon: 'success', title: 'Guardado', timer: 1500, showConfirmButton: false });
      setModalOpen(false);
      await refrescar();
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'No se pudo guardar', text: e.response?.data?.error || '' });
    }
  };

  const eliminar = async (row) => {
    const ok = await Swal.fire({
      icon: 'question',
      title: '¿Eliminar este vocabulario?',
      text: row.titulo,
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    });
    if (!ok.isConfirmed) return;
    try {
      await api.delete(`/vocabularios/${row.id}`);
      Swal.fire({ icon: 'success', title: 'Eliminado', timer: 1400, showConfirmButton: false });
      await refrescar();
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'Error', text: e.response?.data?.error || '' });
    }
  };

  const verPdf = (row) => {
    const url = archivoAbsUrl(row.archivo_url);
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  };

  const sinOpcionesDocente = puedeGestionar && variant === 'docente' && !loading && opciones.length === 0;

  return (
    <DashboardLayout>
      <div className="voc-page">
        <header className="voc-page-header">
          <h1>{copy.title}</h1>
          <p>{copy.subtitle}</p>
        </header>

        <section className="voc-section">
          <div className="voc-section-head">
            <h2>{copy.section}</h2>
            {puedeGestionar && opciones.length > 0 && (
              <button type="button" className="voc-btn-primary" onClick={() => abrirModal(null)}>
                + Subir vocabulario
              </button>
            )}
          </div>

          {sinOpcionesDocente && (
            <div className="voc-alert">
              No tiene grupos a cargo en el año lectivo (asignaturas o tutoría). Cuando se le asignen, podrá publicar
              vocabularios aquí.
            </div>
          )}

          {loading ? (
            <div className="voc-loading">Cargando…</div>
          ) : items.length === 0 ? (
            <div className="voc-empty">
              {variant === 'alumno'
                ? 'Aún no hay vocabularios publicados para su grado.'
                : 'No hay registros. Use «Subir vocabulario» para agregar el primero.'}
            </div>
          ) : (
            <div className="voc-table-wrap">
              <table className="voc-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Nombre</th>
                    <th>Descripción</th>
                    <th>Grado</th>
                    {(variant === 'admin' || variant === 'docente') && <th>Docente</th>}
                    <th aria-label="Acciones" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((row) => (
                    <tr key={row.id}>
                      <td className="voc-fecha">{formatFecha(row.created_at)}</td>
                      <td>
                        <div className="voc-titulo">
                          {row.titulo}
                          {variant === 'docente' && row.es_mio && <span className="voc-badge-mio">Tuyo</span>}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.2rem' }}>
                          {row.nombre_archivo_original || 'PDF'}
                        </div>
                      </td>
                      <td className="voc-desc">{row.descripcion || '—'}</td>
                      <td>
                        <span className="voc-badge-grado">
                          {row.nivel_nombre} · {row.grado}°
                        </span>
                      </td>
                      {(variant === 'admin' || variant === 'docente') && (
                        <td className="voc-docente">{row.docente_nombre?.trim() || '—'}</td>
                      )}
                      <td>
                        <div className="voc-icon-actions">
                          <Tooltip title="Ver PDF">
                            <IconButton size="small" color="primary" onClick={() => verPdf(row)} aria-label="Ver PDF">
                              <VisibilityOutlinedIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          {puedeGestionar && row.puede_editar && (
                            <>
                              <Tooltip title="Editar">
                                <IconButton size="small" color="primary" onClick={() => abrirModal(row)} aria-label="Editar">
                                  <EditOutlinedIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Eliminar">
                                <IconButton size="small" color="error" onClick={() => eliminar(row)} aria-label="Eliminar">
                                  <DeleteOutlineIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            </>
                          )}
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

      {modalOpen && puedeGestionar && (
        <div
          className="voc-modal-overlay"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModalOpen(false);
          }}
        >
          <div className="voc-modal" role="dialog" aria-modal="true" aria-labelledby="voc-modal-title">
            <div className="voc-modal-header" id="voc-modal-title">
              {editItem ? 'Editar vocabulario' : 'Nuevo vocabulario'}
            </div>
            <div className="voc-modal-body">
              <label>
                Nivel y grado
                <select
                  value={form.nivel_grado}
                  onChange={(e) => setForm((f) => ({ ...f, nivel_grado: e.target.value }))}
                  disabled={opciones.length === 0}
                >
                  {opciones.length === 0 ? (
                    <option value="">Sin opciones</option>
                  ) : (
                    opciones.map((o) => (
                      <option key={`${o.nivel_id}-${o.grado}`} value={`${o.nivel_id}|${o.grado}`}>
                        {o.nivel_nombre} — {o.grado}°
                      </option>
                    ))
                  )}
                </select>
              </label>
              <label>
                Nombre
                <input
                  type="text"
                  value={form.titulo}
                  onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))}
                  placeholder="Ej. Unidad 3 — Glosario"
                  maxLength={255}
                />
              </label>
              <label>
                Descripción (opcional)
                <textarea
                  value={form.descripcion}
                  onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
                  placeholder="Breve descripción para la grilla"
                  maxLength={1000}
                />
              </label>
              <label>
                Archivo PDF {editItem ? '(opcional — reemplazar)' : ''}
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={(e) => setArchivo(e.target.files?.[0] || null)}
                />
                <span className="voc-file-hint">Máx. 25 MB. Solo PDF.</span>
                {editItem && (
                  <span className="voc-file-hint">Archivo actual: {editItem.nombre_archivo_original || '—'}</span>
                )}
              </label>
            </div>
            <div className="voc-modal-footer">
              <button type="button" className="voc-btn-cancel" onClick={() => setModalOpen(false)}>
                Cancelar
              </button>
              <button type="button" className="voc-btn-primary" onClick={guardar}>
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
