import React, { useCallback, useEffect, useState } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import api from '../services/api';
import Swal from 'sweetalert2';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
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

/** Texto de grupo: nivel — grado° — sección */
function etiquetaGrupo(row) {
  const sec = (row.seccion || '').trim();
  const parteSec = sec ? ` · Sec. ${sec}` : '';
  return `${row.nivel_nombre || ''} · ${row.grado}°${parteSec}`;
}

function opcionLabel(o) {
  const sec = (o.seccion || '').trim();
  const parteSec = sec ? ` · Sec. ${sec}` : '';
  return `${o.nivel_nombre} — ${o.grado}°${parteSec}`;
}

const VARIANT_COPY = {
  admin: {
    title: 'Vocabularios',
    subtitle:
      'Publique PDF por grupo (nivel, grado y sección). Cada alumno solo ve los de su aula.',
    section: 'Listado del colegio (año lectivo actual)'
  },
  docente: {
    title: 'Vocabularios',
    subtitle: 'Suba material para los grupos donde imparte o es tutor. Se elige la sección en el formulario.',
    section: 'Publicaciones visibles para sus grupos'
  },
  alumno: {
    title: 'Vocabulario',
    subtitle: 'Material publicado para su nivel, grado y sección.',
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
  const [form, setForm] = useState({ grupo_id: '', titulo: '', descripcion: '' });
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

  const resolverGrupoIdInicial = (row, opts) => {
    if (!row) {
      const first = opts[0];
      return first ? String(first.grupo_id) : '';
    }
    if (row.grupo_id) return String(row.grupo_id);
    const m = opts.find(
      (o) => Number(o.nivel_id) === Number(row.nivel_id) && Number(o.grado) === Number(row.grado)
    );
    return m ? String(m.grupo_id) : '';
  };

  const abrirModal = (row = null) => {
    setEditItem(row);
    setArchivo(null);
    setForm({
      grupo_id: resolverGrupoIdInicial(row, opciones),
      titulo: row?.titulo || '',
      descripcion: row?.descripcion || ''
    });
    setModalOpen(true);
  };

  const guardar = async () => {
    if (!form.titulo.trim()) {
      Swal.fire({ icon: 'warning', title: 'Indique un nombre o título' });
      return;
    }
    if (!form.grupo_id) {
      Swal.fire({ icon: 'warning', title: 'Elija el grupo (nivel, grado y sección)' });
      return;
    }
    if (!editItem && !archivo) {
      Swal.fire({ icon: 'warning', title: 'Debe adjuntar un PDF' });
      return;
    }
    const gid = parseInt(form.grupo_id, 10);
    if (!gid || Number.isNaN(gid)) {
      Swal.fire({ icon: 'warning', title: 'Grupo no válido' });
      return;
    }

    const fd = new FormData();
    fd.append('grupo_id', String(gid));
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
                ? 'Aún no hay vocabularios publicados para su grupo.'
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
                    <th>Grupo</th>
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
                        <div className="voc-file-meta">{row.nombre_archivo_original || 'PDF'}</div>
                      </td>
                      <td className="voc-desc">{row.descripcion || '—'}</td>
                      <td>
                        <span className="voc-badge-grado">{etiquetaGrupo(row)}</span>
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
          <div className="voc-modal voc-modal--wide" role="dialog" aria-modal="true" aria-labelledby="voc-modal-title">
            <div className="voc-modal-topbar" aria-hidden />
            <div className="voc-modal-header" id="voc-modal-title">
              <div className="voc-modal-title-row">
                <span className="voc-modal-icon-wrap" aria-hidden>
                  <PictureAsPdfOutlinedIcon sx={{ fontSize: 26, color: '#2563eb' }} />
                </span>
                <div>
                  <div className="voc-modal-kicker">{editItem ? 'Editar publicación' : 'Nueva publicación'}</div>
                  <h2 className="voc-modal-h2">{editItem ? 'Editar vocabulario' : 'Subir vocabulario'}</h2>
                </div>
              </div>
            </div>

            <div className="voc-modal-body">
              <div className="voc-panel">
                <div className="voc-panel-head">
                  <GroupsOutlinedIcon sx={{ fontSize: 20, color: '#4a83c1' }} />
                  <div>
                    <div className="voc-panel-title">Grupo destino</div>
                    <p className="voc-panel-desc">Nivel, grado y sección del aula. Solo verán el PDF los alumnos de ese grupo.</p>
                  </div>
                </div>
                <label className="voc-label-block">
                  <span className="voc-label-text">Aula / grupo</span>
                  <select
                    className="voc-input voc-select"
                    value={form.grupo_id}
                    onChange={(e) => setForm((f) => ({ ...f, grupo_id: e.target.value }))}
                    disabled={opciones.length === 0}
                  >
                    {opciones.length === 0 ? (
                      <option value="">Sin grupos disponibles</option>
                    ) : (
                      <>
                        <option value="">Seleccione nivel — grado — sección…</option>
                        {opciones.map((o) => (
                          <option key={o.grupo_id} value={String(o.grupo_id)}>
                            {opcionLabel(o)}
                          </option>
                        ))}
                      </>
                    )}
                  </select>
                </label>
              </div>

              <div className="voc-modal-grid">
                <label className="voc-label-block">
                  <span className="voc-label-text">Nombre del material</span>
                  <input
                    className="voc-input"
                    type="text"
                    value={form.titulo}
                    onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))}
                    placeholder="Ej. Unidad 3 — Glosario"
                    maxLength={255}
                  />
                </label>
                <label className="voc-label-block voc-span-2">
                  <span className="voc-label-text">Descripción (opcional)</span>
                  <textarea
                    className="voc-input voc-textarea"
                    value={form.descripcion}
                    onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
                    placeholder="Aparece en la grilla como referencia breve."
                    maxLength={1000}
                    rows={3}
                  />
                </label>
              </div>

              <div className="voc-file-panel">
                <div className="voc-file-panel-head">
                  <PictureAsPdfOutlinedIcon sx={{ fontSize: 22, color: '#dc2626' }} />
                  <span className="voc-label-text">Archivo PDF {editItem ? <em className="voc-optional">(reemplazar opcional)</em> : null}</span>
                </div>
                <label className="voc-file-drop">
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    className="voc-file-input"
                    onChange={(e) => setArchivo(e.target.files?.[0] || null)}
                  />
                  <div className="voc-file-drop-inner">
                    <span className="voc-file-drop-title">
                      {archivo ? archivo.name : 'Elegir archivo PDF o arrastre aquí'}
                    </span>
                    <span className="voc-file-hint">Máximo 25 MB · solo formato PDF</span>
                  </div>
                </label>
                {editItem && (
                  <p className="voc-file-current">
                    Archivo actual: <strong>{editItem.nombre_archivo_original || '—'}</strong>
                  </p>
                )}
              </div>
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
