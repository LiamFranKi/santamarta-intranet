import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import api from '../../services/api';
import Swal from 'sweetalert2';
import '../../pages/DocenteCursos.css';

function emptyForm() {
  return {
    asignatura_destino_id: '',
    temas_id: [],
    tareas_id: [],
    examenes_id: [],
    videos_id: [],
    enlaces_id: [],
    sesiones_id: [],
  };
}

/**
 * Modal "Copiar contenido" entre secciones del mismo curso/grado (API docente, compatible con staff admin).
 * Se monta en document.body con createPortal.
 */
export default function ModalCopiarContenidoAsignatura({
  open,
  asignaturaId,
  onClose,
  onCopied,
}) {
  const [loading, setLoading] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [datosCopiarContenido, setDatosCopiarContenido] = useState(null);
  const [formCopiarContenido, setFormCopiarContenido] = useState(() => emptyForm());

  const cargarDatosCopiarContenido = useCallback(async (cursoId) => {
    try {
      setLoading(true);
      const response = await api.get(`/docente/cursos/${cursoId}/copiar-contenido`);
      const d = response.data || {};
      setDatosCopiarContenido({
        otrasAsignaturas: d.otrasAsignaturas || [],
        temas: d.temas || [],
        tareas: d.tareas || [],
        examenes: d.examenes || [],
        videos: d.videos || [],
        enlaces: d.enlaces || [],
        sesiones: d.sesiones || [],
      });
      setFormCopiarContenido(emptyForm());
    } catch (error) {
      console.error('Error cargando datos para copiar contenido:', error);
      Swal.fire({
        title: 'Error',
        text: error.response?.data?.error || 'No se pudieron cargar los datos para copiar contenido',
        icon: 'error',
        confirmButtonText: 'Aceptar',
      });
      setDatosCopiarContenido({
        otrasAsignaturas: [],
        temas: [],
        tareas: [],
        examenes: [],
        videos: [],
        enlaces: [],
        sesiones: [],
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open || asignaturaId == null || String(asignaturaId).trim() === '') {
      setDatosCopiarContenido(null);
      setFormCopiarContenido(emptyForm());
      return;
    }
    cargarDatosCopiarContenido(asignaturaId);
  }, [open, asignaturaId, cargarDatosCopiarContenido]);

  const cerrarModalCopiarContenido = () => {
    setDatosCopiarContenido(null);
    setFormCopiarContenido(emptyForm());
    onClose();
  };

  const handleGuardarCopiarContenido = async () => {
    if (!formCopiarContenido.asignatura_destino_id) {
      Swal.fire('Error', 'Debe seleccionar una asignatura destino', 'error');
      return;
    }

    const totalSeleccionado =
      formCopiarContenido.temas_id.length +
      formCopiarContenido.tareas_id.length +
      formCopiarContenido.examenes_id.length +
      formCopiarContenido.videos_id.length +
      formCopiarContenido.enlaces_id.length +
      formCopiarContenido.sesiones_id.length;

    if (totalSeleccionado === 0) {
      Swal.fire('Error', 'Debe seleccionar al menos un elemento para copiar', 'error');
      return;
    }

    try {
      setGuardando(true);
      const response = await api.post(
        `/docente/cursos/${asignaturaId}/copiar-contenido`,
        formCopiarContenido
      );

      const { copiados, omitidos = {} } = response.data;
      const totalOmitidos = Object.values(omitidos).reduce((a, b) => a + (b || 0), 0);
      const omitHtml = totalOmitidos
        ? `<br><br><span style="color:#b45309">Omitidos (no se encontró en destino):<br>
           Temas: ${omitidos.temas || 0} · Sesiones: ${omitidos.sesiones || 0} · Proyectos: ${omitidos.tareas || 0} · Exámenes: ${omitidos.examenes || 0}</span>`
        : '';
      Swal.fire({
        title: totalOmitidos ? 'Copiado con advertencias' : '¡Éxito!',
        html: `${response.data.message || 'Contenido copiado.'}<br>
               <strong>Temas:</strong> ${copiados.temas}<br>
               <strong>Sesiones (PDF):</strong> ${copiados.sesiones ?? 0}<br>
               <strong>Proyectos:</strong> ${copiados.tareas}<br>
               <strong>Exámenes:</strong> ${copiados.examenes}<br>
               <strong>Videos:</strong> ${copiados.videos}<br>
               <strong>Enlaces:</strong> ${copiados.enlaces}${omitHtml}`,
        icon: totalOmitidos ? 'warning' : 'success',
        confirmButtonText: 'Aceptar',
      });

      cerrarModalCopiarContenido();
      if (typeof onCopied === 'function') onCopied();
    } catch (error) {
      console.error('Error copiando contenido:', error);
      Swal.fire('Error', error.response?.data?.error || 'No se pudo copiar el contenido', 'error');
    } finally {
      setGuardando(false);
    }
  };

  if (!open || asignaturaId == null || String(asignaturaId).trim() === '') {
    return null;
  }

  return createPortal(
    <div
      className="modal-overlay"
      onClick={cerrarModalCopiarContenido}
      style={{ zIndex: 100000 }}
    >
      <div
        className="modal-container modal-copiar-contenido"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-copiar-contenido-title"
      >
        <div className="modal-header-copiar-contenido">
          <div className="modal-header-gradient">
            <h2 id="modal-copiar-contenido-title">📋 Copiar Contenido</h2>
          </div>
          <button
            className="modal-close"
            onClick={cerrarModalCopiarContenido}
            type="button"
            aria-label="Cerrar modal"
          >
            ✕
          </button>
        </div>

        <div className="modal-body-copiar-contenido">
          {loading ? (
            <div className="loading-overlay">
              <div className="loading-spinner">
                <div className="spinner-ring"></div>
                <div className="spinner-ring"></div>
                <div className="spinner-ring"></div>
                <div className="spinner-ring"></div>
              </div>
              <p className="loading-text">Cargando datos...</p>
            </div>
          ) : !datosCopiarContenido ? (
            <div className="empty-state">
              <p>No se pudieron cargar los datos. Por favor, intente nuevamente.</p>
              <button
                type="button"
                className="btn-guardar"
                onClick={() => cargarDatosCopiarContenido(asignaturaId)}
                style={{ marginTop: '1rem' }}
              >
                Reintentar
              </button>
            </div>
          ) : datosCopiarContenido.otrasAsignaturas && datosCopiarContenido.otrasAsignaturas.length === 0 ? (
            <div className="empty-state">
              <p>No hay otras secciones disponibles para copiar contenido.</p>
              <p style={{ fontSize: '0.9rem', color: '#6b7280', marginTop: '0.5rem' }}>
                Puedes copiar tu contenido a cualquier sección del mismo grado y curso (aunque la lleve otro
                docente).
              </p>
            </div>
          ) : (
            <>
              <div className="form-group-copiar">
                <label htmlFor="asignatura-destino" className="form-label-copiar">
                  Copiar A <span className="text-danger">*</span>
                </label>
                <select
                  id="asignatura-destino"
                  className="form-select-copiar"
                  value={formCopiarContenido.asignatura_destino_id}
                  onChange={(e) =>
                    setFormCopiarContenido((prev) => ({
                      ...prev,
                      asignatura_destino_id: e.target.value,
                    }))
                  }
                >
                  <option value="">-- Seleccione --</option>
                  {datosCopiarContenido.otrasAsignaturas.map((asig) => (
                    <option key={asig.id} value={asig.id}>
                      {asig.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group-copiar">
                <label htmlFor="temas-id" className="form-label-copiar">
                  📚 Temas Interactivos
                </label>
                <div className="checkbox-list-container">
                  {datosCopiarContenido.temas.length > 0 ? (
                    <>
                      <div className="checkbox-list-header">
                        <button
                          type="button"
                          className="btn-select-all"
                          onClick={() => {
                            const allSelected = datosCopiarContenido.temas.every((t) =>
                              formCopiarContenido.temas_id.includes(t.id)
                            );
                            setFormCopiarContenido((prev) => ({
                              ...prev,
                              temas_id: allSelected ? [] : datosCopiarContenido.temas.map((t) => t.id),
                            }));
                          }}
                        >
                          {datosCopiarContenido.temas.every((t) =>
                            formCopiarContenido.temas_id.includes(t.id)
                          )
                            ? '☑ Deseleccionar Todos'
                            : '☐ Seleccionar Todos'}
                        </button>
                      </div>
                      <div className="checkbox-list">
                        {datosCopiarContenido.temas.map((tema) => (
                          <label key={tema.id} className="checkbox-item">
                            <input
                              type="checkbox"
                              checked={formCopiarContenido.temas_id.includes(tema.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setFormCopiarContenido((prev) => ({
                                    ...prev,
                                    temas_id: [...prev.temas_id, tema.id],
                                  }));
                                } else {
                                  setFormCopiarContenido((prev) => ({
                                    ...prev,
                                    temas_id: prev.temas_id.filter((id) => id !== tema.id),
                                  }));
                                }
                              }}
                            />
                            <span>{tema.nombre}</span>
                          </label>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="empty-list-text">No hay temas disponibles</p>
                  )}
                </div>
              </div>

              <div className="form-group-copiar">
                <label htmlFor="sesiones-id" className="form-label-copiar">
                  📄 Sesiones (PDF)
                </label>
                <p style={{ fontSize: '0.85rem', color: '#6b7280', margin: '0 0 0.5rem 0' }}>
                  Si copias solo sesiones, en destino debe existir el mismo tema interactivo (mismo nombre,
                  bimestre y orden) o haber copiado antes los temas correspondientes.
                </p>
                <div className="checkbox-list-container">
                  {(datosCopiarContenido.sesiones || []).length > 0 ? (
                    <>
                      <div className="checkbox-list-header">
                        <button
                          type="button"
                          className="btn-select-all"
                          onClick={() => {
                            const sesiones = datosCopiarContenido.sesiones || [];
                            const allSelected = sesiones.every((s) =>
                              formCopiarContenido.sesiones_id.includes(s.id)
                            );
                            setFormCopiarContenido((prev) => ({
                              ...prev,
                              sesiones_id: allSelected ? [] : sesiones.map((s) => s.id),
                            }));
                          }}
                        >
                          {(datosCopiarContenido.sesiones || []).every((s) =>
                            formCopiarContenido.sesiones_id.includes(s.id)
                          )
                            ? '☑ Deseleccionar Todos'
                            : '☐ Seleccionar Todos'}
                        </button>
                      </div>
                      <div className="checkbox-list">
                        {(datosCopiarContenido.sesiones || []).map((sesion) => (
                          <label key={sesion.id} className="checkbox-item">
                            <input
                              type="checkbox"
                              checked={formCopiarContenido.sesiones_id.includes(sesion.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setFormCopiarContenido((prev) => ({
                                    ...prev,
                                    sesiones_id: [...prev.sesiones_id, sesion.id],
                                  }));
                                } else {
                                  setFormCopiarContenido((prev) => ({
                                    ...prev,
                                    sesiones_id: prev.sesiones_id.filter((id) => id !== sesion.id),
                                  }));
                                }
                              }}
                            />
                            <span>{sesion.nombre}</span>
                          </label>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="empty-list-text">No hay sesiones PDF disponibles</p>
                  )}
                </div>
              </div>

              <div className="form-group-copiar">
                <label htmlFor="tareas-id" className="form-label-copiar">
                  📝 Proyectos
                </label>
                <div className="checkbox-list-container">
                  {datosCopiarContenido.tareas.length > 0 ? (
                    <>
                      <div className="checkbox-list-header">
                        <button
                          type="button"
                          className="btn-select-all"
                          onClick={() => {
                            const allSelected = datosCopiarContenido.tareas.every((t) =>
                              formCopiarContenido.tareas_id.includes(t.id)
                            );
                            setFormCopiarContenido((prev) => ({
                              ...prev,
                              tareas_id: allSelected ? [] : datosCopiarContenido.tareas.map((t) => t.id),
                            }));
                          }}
                        >
                          {datosCopiarContenido.tareas.every((t) =>
                            formCopiarContenido.tareas_id.includes(t.id)
                          )
                            ? '☑ Deseleccionar Todos'
                            : '☐ Seleccionar Todos'}
                        </button>
                      </div>
                      <div className="checkbox-list">
                        {datosCopiarContenido.tareas.map((tarea) => (
                          <label key={tarea.id} className="checkbox-item">
                            <input
                              type="checkbox"
                              checked={formCopiarContenido.tareas_id.includes(tarea.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setFormCopiarContenido((prev) => ({
                                    ...prev,
                                    tareas_id: [...prev.tareas_id, tarea.id],
                                  }));
                                } else {
                                  setFormCopiarContenido((prev) => ({
                                    ...prev,
                                    tareas_id: prev.tareas_id.filter((id) => id !== tarea.id),
                                  }));
                                }
                              }}
                            />
                            <span>{tarea.nombre}</span>
                          </label>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="empty-list-text">No hay proyectos disponibles</p>
                  )}
                </div>
              </div>

              <div className="form-group-copiar">
                <label htmlFor="examenes-id" className="form-label-copiar">
                  📋 Exámenes
                </label>
                <div className="checkbox-list-container">
                  {datosCopiarContenido.examenes.length > 0 ? (
                    <>
                      <div className="checkbox-list-header">
                        <button
                          type="button"
                          className="btn-select-all"
                          onClick={() => {
                            const allSelected = datosCopiarContenido.examenes.every((e) =>
                              formCopiarContenido.examenes_id.includes(e.id)
                            );
                            setFormCopiarContenido((prev) => ({
                              ...prev,
                              examenes_id: allSelected ? [] : datosCopiarContenido.examenes.map((e) => e.id),
                            }));
                          }}
                        >
                          {datosCopiarContenido.examenes.every((e) =>
                            formCopiarContenido.examenes_id.includes(e.id)
                          )
                            ? '☑ Deseleccionar Todos'
                            : '☐ Seleccionar Todos'}
                        </button>
                      </div>
                      <div className="checkbox-list">
                        {datosCopiarContenido.examenes.map((examen) => (
                          <label key={examen.id} className="checkbox-item">
                            <input
                              type="checkbox"
                              checked={formCopiarContenido.examenes_id.includes(examen.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setFormCopiarContenido((prev) => ({
                                    ...prev,
                                    examenes_id: [...prev.examenes_id, examen.id],
                                  }));
                                } else {
                                  setFormCopiarContenido((prev) => ({
                                    ...prev,
                                    examenes_id: prev.examenes_id.filter((id) => id !== examen.id),
                                  }));
                                }
                              }}
                            />
                            <span>{examen.nombre}</span>
                          </label>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="empty-list-text">No hay exámenes disponibles</p>
                  )}
                </div>
              </div>

              <div className="form-group-copiar">
                <label htmlFor="videos-id" className="form-label-copiar">
                  🎥 Videos
                </label>
                <div className="checkbox-list-container">
                  {datosCopiarContenido.videos.length > 0 ? (
                    <>
                      <div className="checkbox-list-header">
                        <button
                          type="button"
                          className="btn-select-all"
                          onClick={() => {
                            const allSelected = datosCopiarContenido.videos.every((v) =>
                              formCopiarContenido.videos_id.includes(v.id)
                            );
                            setFormCopiarContenido((prev) => ({
                              ...prev,
                              videos_id: allSelected ? [] : datosCopiarContenido.videos.map((v) => v.id),
                            }));
                          }}
                        >
                          {datosCopiarContenido.videos.every((v) =>
                            formCopiarContenido.videos_id.includes(v.id)
                          )
                            ? '☑ Deseleccionar Todos'
                            : '☐ Seleccionar Todos'}
                        </button>
                      </div>
                      <div className="checkbox-list">
                        {datosCopiarContenido.videos.map((video) => (
                          <label key={video.id} className="checkbox-item">
                            <input
                              type="checkbox"
                              checked={formCopiarContenido.videos_id.includes(video.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setFormCopiarContenido((prev) => ({
                                    ...prev,
                                    videos_id: [...prev.videos_id, video.id],
                                  }));
                                } else {
                                  setFormCopiarContenido((prev) => ({
                                    ...prev,
                                    videos_id: prev.videos_id.filter((id) => id !== video.id),
                                  }));
                                }
                              }}
                            />
                            <span>{video.nombre}</span>
                          </label>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="empty-list-text">No hay videos disponibles</p>
                  )}
                </div>
              </div>

              <div className="form-group-copiar">
                <label htmlFor="enlaces-id" className="form-label-copiar">
                  🔗 Enlaces
                </label>
                <div className="checkbox-list-container">
                  {datosCopiarContenido.enlaces.length > 0 ? (
                    <>
                      <div className="checkbox-list-header">
                        <button
                          type="button"
                          className="btn-select-all"
                          onClick={() => {
                            const allSelected = datosCopiarContenido.enlaces.every((e) =>
                              formCopiarContenido.enlaces_id.includes(e.id)
                            );
                            setFormCopiarContenido((prev) => ({
                              ...prev,
                              enlaces_id: allSelected ? [] : datosCopiarContenido.enlaces.map((e) => e.id),
                            }));
                          }}
                        >
                          {datosCopiarContenido.enlaces.every((e) =>
                            formCopiarContenido.enlaces_id.includes(e.id)
                          )
                            ? '☑ Deseleccionar Todos'
                            : '☐ Seleccionar Todos'}
                        </button>
                      </div>
                      <div className="checkbox-list">
                        {datosCopiarContenido.enlaces.map((enlace) => (
                          <label key={enlace.id} className="checkbox-item">
                            <input
                              type="checkbox"
                              checked={formCopiarContenido.enlaces_id.includes(enlace.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setFormCopiarContenido((prev) => ({
                                    ...prev,
                                    enlaces_id: [...prev.enlaces_id, enlace.id],
                                  }));
                                } else {
                                  setFormCopiarContenido((prev) => ({
                                    ...prev,
                                    enlaces_id: prev.enlaces_id.filter((id) => id !== enlace.id),
                                  }));
                                }
                              }}
                            />
                            <span>{enlace.nombre}</span>
                          </label>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="empty-list-text">No hay enlaces disponibles</p>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="modal-footer-copiar-contenido">
          <button
            type="button"
            className="btn-cancelar"
            onClick={cerrarModalCopiarContenido}
            disabled={guardando}
          >
            ✕ Cancelar
          </button>
          <button
            type="button"
            className="btn-guardar"
            onClick={handleGuardarCopiarContenido}
            disabled={guardando || loading}
          >
            {guardando ? '⏳ Guardando...' : '💾 Guardar Datos'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
