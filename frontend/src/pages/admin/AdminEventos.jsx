import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import DashboardLayout from '../../components/DashboardLayout';
import api from '../../services/api';
import Swal from 'sweetalert2';
import { QRCodeSVG } from 'qrcode.react';
import './AdminEventos.css';

const PASTEL_CARD_BGS = [
  'linear-gradient(145deg, #e8f4fc 0%, #dceef9 100%)',
  'linear-gradient(145deg, #fdf2f8 0%, #fce7f3 100%)',
  'linear-gradient(145deg, #f0fdf4 0%, #dcfce7 100%)',
  'linear-gradient(145deg, #fffbeb 0%, #fef3c7 100%)',
  'linear-gradient(145deg, #f5f3ff 0%, #ede9fe 100%)',
  'linear-gradient(145deg, #ecfeff 0%, #cffafe 100%)'
];

function labelGrupo(g) {
  const parts = [g.nivel_nombre, g.curso_nombre, g.grado != null ? `${g.grado}°` : '', g.seccion].filter(Boolean);
  return parts.join(' · ');
}

function formatHoraEvento(h) {
  if (h == null || h === '') return null;
  const s = String(h);
  const m = s.match(/(\d{1,2}:\d{2})/);
  return m ? m[1] : s.slice(0, 5);
}

function formatFechaCard(d) {
  if (!d) return '';
  try {
    const x = typeof d === 'string' ? d.slice(0, 10) : d;
    return new Date(x).toLocaleDateString('es-PE', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return String(d).slice(0, 10);
  }
}

function nombreDesdePartes(n, ap, am) {
  return [n, ap, am].filter(Boolean).join(' ').trim() || '—';
}

export default function AdminEventos() {
  const [loading, setLoading] = useState(true);
  const [eventos, setEventos] = useState([]);
  const [gruposDisponibles, setGruposDisponibles] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [qrModal, setQrModal] = useState(null);
  const [asisModal, setAsisModal] = useState(null);

  const [form, setForm] = useState({
    titulo: '',
    descripcion: '',
    fecha_evento: '',
    hora_inicio: '',
    hora_fin: '',
    lugar: '',
    responsable: '',
    expositor: '',
    aviso_texto: '',
    programa_texto: '',
    materiales_texto: '',
    estado: 'BORRADOR',
    grupo_ids: []
  });

  const publicUrlBase = useMemo(() => `${window.location.origin}/evento/`, []);

  const load = async () => {
    setLoading(true);
    try {
      const [list, grupos] = await Promise.all([
        api.get('/admin/eventos'),
        api.get('/admin/eventos/grupos-disponibles')
      ]);
      setEventos(list.data.eventos || []);
      setGruposDisponibles(grupos.data.grupos || []);
    } catch (e) {
      Swal.fire('Error', e.response?.data?.error || 'No se pudieron cargar los eventos', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const anyOverlayOpen = modalOpen || qrModal || asisModal;
  useEffect(() => {
    if (!anyOverlayOpen) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (saving) return;
      if (modalOpen) setModalOpen(false);
      else if (qrModal) setQrModal(null);
      else if (asisModal) setAsisModal(null);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [anyOverlayOpen, modalOpen, qrModal, asisModal, saving]);

  const openNuevo = () => {
    setEditId(null);
    setForm({
      titulo: '',
      descripcion: '',
      fecha_evento: '',
      hora_inicio: '',
      hora_fin: '',
      lugar: '',
      responsable: '',
      expositor: '',
      aviso_texto: '',
      programa_texto: '',
      materiales_texto: '',
      estado: 'BORRADOR',
      grupo_ids: []
    });
    setModalOpen(true);
  };

  const openEditar = async (id) => {
    try {
      const { data } = await api.get(`/admin/eventos/${id}`);
      const ev = data.evento;
      setEditId(id);
      setForm({
        titulo: ev.titulo || '',
        descripcion: ev.descripcion || '',
        fecha_evento: ev.fecha_evento ? String(ev.fecha_evento).slice(0, 10) : '',
        hora_inicio: ev.hora_inicio || '',
        hora_fin: ev.hora_fin || '',
        lugar: ev.lugar || '',
        responsable: ev.responsable || '',
        expositor: ev.expositor || '',
        aviso_texto: ev.aviso_texto || '',
        programa_texto: ev.programa_texto || '',
        materiales_texto: ev.materiales_texto || '',
        estado: ev.estado || 'BORRADOR',
        grupo_ids: data.grupo_ids || []
      });
      setModalOpen(true);
    } catch (e) {
      Swal.fire('Error', e.response?.data?.error || 'No se pudo abrir el evento', 'error');
    }
  };

  const toggleGrupo = (gid) => {
    setForm((f) => {
      const set = new Set(f.grupo_ids);
      if (set.has(gid)) set.delete(gid);
      else set.add(gid);
      return { ...f, grupo_ids: [...set] };
    });
  };

  const guardar = async (e) => {
    e.preventDefault();
    const titulo = String(form.titulo || '').trim();
    if (!titulo) {
      Swal.fire('Atención', 'El título es obligatorio', 'warning');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        titulo,
        grupo_ids: form.grupo_ids
      };
      if (editId) {
        await api.put(`/admin/eventos/${editId}`, payload);
        Swal.fire('Listo', 'Evento actualizado', 'success');
      } else {
        await api.post('/admin/eventos', payload);
        Swal.fire('Listo', 'Evento creado', 'success');
      }
      setModalOpen(false);
      load();
    } catch (err) {
      Swal.fire('Error', err.response?.data?.error || 'No se pudo guardar', 'error');
    } finally {
      setSaving(false);
    }
  };

  const eliminar = async (id) => {
    const r = await Swal.fire({
      title: '¿Eliminar evento?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    });
    if (!r.isConfirmed) return;
    try {
      await api.delete(`/admin/eventos/${id}`);
      Swal.fire('Eliminado', '', 'success');
      load();
    } catch (e) {
      Swal.fire('Error', e.response?.data?.error || 'No se pudo eliminar', 'error');
    }
  };

  const copiarEnlace = (token) => {
    const url = `${publicUrlBase}${token}`;
    navigator.clipboard.writeText(url).then(
      () => Swal.fire({ icon: 'success', title: 'Enlace copiado', timer: 1600, showConfirmButton: false }),
      () => Swal.fire('Error', 'No se pudo copiar', 'error')
    );
  };

  const abrirAsistencias = async (ev) => {
    setAsisModal({
      titulo: ev.titulo,
      loading: true,
      asistencias: [],
      visitantes: [],
      error: null
    });
    try {
      const { data } = await api.get(`/admin/eventos/${ev.id}/asistencias`);
      setAsisModal({
        titulo: data.evento?.titulo || ev.titulo,
        loading: false,
        asistencias: data.asistencias || [],
        visitantes: data.visitantes || [],
        error: null
      });
    } catch (e) {
      setAsisModal({
        titulo: ev.titulo,
        loading: false,
        asistencias: [],
        visitantes: [],
        error: e.response?.data?.error || e.message || 'Error al cargar'
      });
    }
  };

  const modalNode =
    modalOpen &&
    createPortal(
      <div
        className="admin-evento-modal-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-evento-modal-title"
        onClick={() => !saving && setModalOpen(false)}
      >
        <form className="admin-evento-modal" onSubmit={guardar} onClick={(e) => e.stopPropagation()}>
          <div className="admin-evento-modal__header">
            <h2 id="admin-evento-modal-title">{editId ? 'Editar evento' : 'Nuevo evento'}</h2>
            <button
              type="button"
              className="admin-evento-modal__close"
              aria-label="Cerrar"
              disabled={saving}
              onClick={() => setModalOpen(false)}
            >
              ×
            </button>
          </div>
          <div className="admin-evento-modal__body">
            <div className="admin-evento-field">
              <label htmlFor="ev-titulo">Título *</label>
              <input
                id="ev-titulo"
                required
                value={form.titulo}
                onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))}
                placeholder="Ej. Reunión de padres de familia"
                autoComplete="off"
              />
            </div>
            <div className="admin-evento-field">
              <label htmlFor="ev-desc">Descripción</label>
              <textarea
                id="ev-desc"
                value={form.descripcion}
                onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
                rows={3}
                placeholder="Detalle opcional del evento"
              />
            </div>
            <div className="admin-evento-row2">
              <div className="admin-evento-field">
                <label htmlFor="ev-fecha">Fecha</label>
                <input
                  id="ev-fecha"
                  type="date"
                  value={form.fecha_evento}
                  onChange={(e) => setForm((f) => ({ ...f, fecha_evento: e.target.value }))}
                />
              </div>
              <div className="admin-evento-field">
                <label htmlFor="ev-estado">Estado</label>
                <select
                  id="ev-estado"
                  value={form.estado}
                  onChange={(e) => setForm((f) => ({ ...f, estado: e.target.value }))}
                >
                  <option value="BORRADOR">Borrador</option>
                  <option value="ACTIVO">Activo (visible por QR)</option>
                  <option value="CERRADO">Cerrado</option>
                </select>
              </div>
            </div>
            <div className="admin-evento-row2">
              <div className="admin-evento-field">
                <label htmlFor="ev-hi">Hora inicio</label>
                <input
                  id="ev-hi"
                  value={form.hora_inicio}
                  onChange={(e) => setForm((f) => ({ ...f, hora_inicio: e.target.value }))}
                  placeholder="ej. 08:00"
                />
              </div>
              <div className="admin-evento-field">
                <label htmlFor="ev-hf">Hora fin</label>
                <input
                  id="ev-hf"
                  value={form.hora_fin}
                  onChange={(e) => setForm((f) => ({ ...f, hora_fin: e.target.value }))}
                  placeholder="ej. 10:00"
                />
              </div>
            </div>
            <div className="admin-evento-field">
              <label htmlFor="ev-lugar">Lugar</label>
              <input
                id="ev-lugar"
                value={form.lugar}
                onChange={(e) => setForm((f) => ({ ...f, lugar: e.target.value }))}
                placeholder="Auditorio, aula, etc."
              />
            </div>
            <div className="admin-evento-field">
              <span className="admin-evento-field__legend">Grupos incluidos (matrícula del año activo)</span>
              <div className="admin-evento-grupos-box">
                {gruposDisponibles.map((g) => (
                  <label key={g.id} className="admin-evento-grupo-item" htmlFor={`ev-grupo-${g.id}`}>
                    <input
                      id={`ev-grupo-${g.id}`}
                      type="checkbox"
                      checked={form.grupo_ids.includes(g.id)}
                      onChange={() => toggleGrupo(g.id)}
                    />
                    <span>{labelGrupo(g)}</span>
                  </label>
                ))}
                {!gruposDisponibles.length && (
                  <span style={{ color: '#6b7280', fontSize: '0.9rem' }}>No hay grupos para el año activo.</span>
                )}
              </div>
            </div>
            <div className="admin-evento-modal__actions">
              <button type="button" className="btn-secondary" disabled={saving} onClick={() => setModalOpen(false)}>
                Cancelar
              </button>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </form>
      </div>,
      document.body
    );

  const qrModalNode =
    qrModal &&
    createPortal(
      <div
        className="admin-evento-modal-overlay"
        role="dialog"
        aria-modal="true"
        aria-label="Código QR del evento"
        onClick={() => setQrModal(null)}
      >
        <div className="admin-evento-qr-modal" onClick={(e) => e.stopPropagation()}>
          <h3>{qrModal.titulo}</h3>
          <div className="admin-evento-qr-modal__big">
            <QRCodeSVG value={`${publicUrlBase}${qrModal.token}`} size={240} level="M" />
          </div>
          <p className="admin-evento-qr-modal__url">{`${publicUrlBase}${qrModal.token}`}</p>
          <button type="button" className="admin-evento-qr-modal__copy" onClick={() => copiarEnlace(qrModal.token)}>
            Copiar enlace público
          </button>
        </div>
      </div>,
      document.body
    );

  const asisModalNode =
    asisModal &&
    createPortal(
      <div
        className="admin-evento-modal-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="asis-modal-title"
        onClick={() => setAsisModal(null)}
      >
        <div className="admin-evento-modal admin-evento-modal--wide" onClick={(e) => e.stopPropagation()}>
          <div className="admin-evento-modal__header">
            <h2 id="asis-modal-title">Asistencias — {asisModal.titulo}</h2>
            <button type="button" className="admin-evento-modal__close" aria-label="Cerrar" onClick={() => setAsisModal(null)}>
              ×
            </button>
          </div>
          <div className="admin-evento-asis-body">
            {asisModal.loading ? (
              <p className="admin-evento-asis-empty">Cargando…</p>
            ) : asisModal.error ? (
              <p className="admin-evento-asis-empty" style={{ color: '#b91c1c' }}>
                {asisModal.error}
              </p>
            ) : (
              <>
                <div className="admin-evento-asis-section">
                  <h4>Apoderados (registro por alumno)</h4>
                  {(asisModal.asistencias || []).length === 0 ? (
                    <p className="admin-evento-asis-empty">Aún no hay registros de apoderados.</p>
                  ) : (
                    <div className="admin-evento-asis-table-wrap">
                      <table className="admin-evento-asis-table">
                        <thead>
                          <tr>
                            <th>Fecha y hora</th>
                            <th>Alumno</th>
                            <th>Apoderado</th>
                            <th>Contacto</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(asisModal.asistencias || []).map((row) => (
                            <tr key={row.id}>
                              <td>
                                {row.marcado_en
                                  ? new Date(String(row.marcado_en).replace(' ', 'T')).toLocaleString('es-PE', {
                                      dateStyle: 'short',
                                      timeStyle: 'short'
                                    })
                                  : '—'}
                              </td>
                              <td>{nombreDesdePartes(row.alumno_nombres, row.alumno_apellido_paterno, row.alumno_apellido_materno)}</td>
                              <td>
                                {nombreDesdePartes(row.apoderado_nombres, row.apoderado_apellido_paterno, row.apoderado_apellido_materno)}
                              </td>
                              <td>
                                {[row.apoderado_telefono, row.apoderado_email].filter(Boolean).join(' · ') || '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
                <div className="admin-evento-asis-section">
                  <h4>Visitantes</h4>
                  {(asisModal.visitantes || []).length === 0 ? (
                    <p className="admin-evento-asis-empty">No hay visitantes registrados.</p>
                  ) : (
                    <div className="admin-evento-asis-table-wrap">
                      <table className="admin-evento-asis-table">
                        <thead>
                          <tr>
                            <th>Fecha y hora</th>
                            <th>Nombre</th>
                            <th>Teléfono</th>
                            <th>Correo</th>
                            <th>Parentesco</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(asisModal.visitantes || []).map((v) => (
                            <tr key={v.id}>
                              <td>
                                {v.marcado_en
                                  ? new Date(String(v.marcado_en).replace(' ', 'T')).toLocaleString('es-PE', {
                                      dateStyle: 'short',
                                      timeStyle: 'short'
                                    })
                                  : '—'}
                              </td>
                              <td>{v.nombre_completo || '—'}</td>
                              <td>{v.telefono || '—'}</td>
                              <td>{v.correo || '—'}</td>
                              <td>{v.parentesco || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>,
      document.body
    );

  return (
    <DashboardLayout>
      <div className="admin-evento-page-wrap">
        <div className="admin-evento-toolbar">
          <div className="admin-evento-page-header">
            <h1>Eventos institucionales</h1>
            <p>
              Crea eventos y comparte el enlace o QR para registro de asistencia (apoderados y visitantes).
            </p>
          </div>
          <button type="button" className="admin-evento-btn-primary" onClick={openNuevo}>
            Nuevo evento
          </button>
        </div>

        {loading ? (
          <p>Cargando…</p>
        ) : (
          <div className="admin-evento-grid">
            {eventos.map((ev, idx) => {
              const hi = formatHoraEvento(ev.hora_inicio);
              const hf = formatHoraEvento(ev.hora_fin);
              const horaTxt =
                hi && hf ? `${hi} – ${hf}` : hi ? `Desde ${hi}` : hf ? `Hasta ${hf}` : null;
              const badgeClass =
                ev.estado === 'ACTIVO'
                  ? 'admin-evento-card__badge admin-evento-card__badge--activo'
                  : ev.estado === 'CERRADO'
                    ? 'admin-evento-card__badge admin-evento-card__badge--cerrado'
                    : 'admin-evento-card__badge admin-evento-card__badge--borrador';
              const bg = PASTEL_CARD_BGS[idx % PASTEL_CARD_BGS.length];
              return (
                <article key={ev.id} className="admin-evento-card" style={{ background: bg }}>
                  <div className="admin-evento-card__top">
                    {ev.token_publico ? (
                      <div className="admin-evento-card__qr-mini" aria-hidden>
                        <QRCodeSVG value={`${publicUrlBase}${ev.token_publico}`} size={64} level="M" />
                      </div>
                    ) : (
                      <div className="admin-evento-card__qr-mini" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem' }}>📅</div>
                    )}
                    <div className="admin-evento-card__meta">
                      <h3 className="admin-evento-card__title">{ev.titulo}</h3>
                      <p className="admin-evento-card__line">
                        {ev.fecha_evento ? formatFechaCard(ev.fecha_evento) : 'Sin fecha'}
                        {ev.lugar ? ` · ${ev.lugar}` : ''}
                      </p>
                      {horaTxt && <p className="admin-evento-card__hora">🕐 {horaTxt}</p>}
                      <span className={badgeClass}>{ev.estado}</span>
                    </div>
                  </div>
                  <div className="admin-evento-card__actions">
                    <button
                      type="button"
                      className="admin-evento-card__btn admin-evento-card__btn--qr"
                      disabled={!ev.token_publico}
                      onClick={() => ev.token_publico && setQrModal({ titulo: ev.titulo, token: ev.token_publico })}
                    >
                      Ver QR
                    </button>
                    <button type="button" className="admin-evento-card__btn admin-evento-card__btn--asis" onClick={() => abrirAsistencias(ev)}>
                      Ver asistencias
                    </button>
                  </div>
                  <div className="admin-evento-card__footer">
                    <button type="button" className="admin-evento-card__link" onClick={() => openEditar(ev.id)}>
                      Editar
                    </button>
                    <button type="button" className="admin-evento-card__link admin-evento-card__link--danger" onClick={() => eliminar(ev.id)}>
                      Eliminar
                    </button>
                  </div>
                </article>
              );
            })}
            {!eventos.length && <p style={{ color: '#5c6378', gridColumn: '1 / -1' }}>No hay eventos aún.</p>}
          </div>
        )}

        {modalNode}
        {qrModalNode}
        {asisModalNode}
      </div>
    </DashboardLayout>
  );
}
