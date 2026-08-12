import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import Swal from 'sweetalert2';
import DashboardLayout from '../../components/DashboardLayout';
import api from '../../services/api';
import './AdminReclamosSugerencias.css';

const API = '/admin/reclamos-sugerencias';
const ESTADOS = [
  { value: 'nuevo', label: 'Nuevo' },
  { value: 'en_revision', label: 'En revisión' },
  { value: 'atendido', label: 'Atendido' },
  { value: 'cerrado', label: 'Cerrado' },
];

const swalOpts = {
  target: document.body,
  customClass: { container: 'rs-swal-over-modal' },
  didOpen: (popup) => {
    const root = popup?.closest?.('.swal2-container');
    if (root) root.style.setProperty('z-index', '250000', 'important');
  },
};

function fmtFecha(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function etiquetaEstado(estado) {
  const e = ESTADOS.find((x) => x.value === estado);
  return e?.label || estado || '—';
}

function BadgeEstado({ estado }) {
  const key = String(estado || 'nuevo').replace(/\s+/g, '_');
  return <span className={`rs-badge rs-badge--${key}`}>{etiquetaEstado(estado)}</span>;
}

function CorreosModal({ open, onClose }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [edit, setEdit] = useState(null);
  const [form, setForm] = useState({
    email: '',
    etiqueta: '',
    activo: true,
    recibe_sugerencias: true,
    recibe_reclamos: true,
  });

  const cargar = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await api.get(`${API}/correos`);
      setItems(data.correos || []);
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: e.response?.data?.error || 'No se pudieron cargar los correos',
        ...swalOpts,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      setEdit(null);
      setForm({
        email: '',
        etiqueta: '',
        activo: true,
        recibe_sugerencias: true,
        recibe_reclamos: true,
      });
      cargar();
    }
  }, [open, cargar]);

  const abrirEditar = (row) => {
    setEdit(row);
    setForm({
      email: row.email || '',
      etiqueta: row.etiqueta || '',
      activo: !!row.activo,
      recibe_sugerencias: !!row.recibe_sugerencias,
      recibe_reclamos: !!row.recibe_reclamos,
    });
  };

  const cancelarForm = () => {
    setEdit(null);
    setForm({
      email: '',
      etiqueta: '',
      activo: true,
      recibe_sugerencias: true,
      recibe_reclamos: true,
    });
  };

  const guardar = async () => {
    try {
      setSaving(true);
      const payload = {
        email: form.email,
        etiqueta: form.etiqueta,
        activo: form.activo ? 1 : 0,
        recibe_sugerencias: form.recibe_sugerencias ? 1 : 0,
        recibe_reclamos: form.recibe_reclamos ? 1 : 0,
      };
      if (edit?.id) {
        await api.put(`${API}/correos/${edit.id}`, payload);
      } else {
        await api.post(`${API}/correos`, payload);
      }
      await Swal.fire({
        icon: 'success',
        title: edit ? 'Correo actualizado' : 'Correo creado',
        timer: 1600,
        showConfirmButton: false,
        ...swalOpts,
      });
      cancelarForm();
      await cargar();
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: e.response?.data?.error || 'No se pudo guardar',
        ...swalOpts,
      });
    } finally {
      setSaving(false);
    }
  };

  const eliminar = async (row) => {
    const conf = await Swal.fire({
      icon: 'warning',
      title: '¿Eliminar correo?',
      text: row.email,
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#b91c1c',
      ...swalOpts,
    });
    if (!conf.isConfirmed) return;
    try {
      await api.delete(`${API}/correos/${row.id}`);
      await cargar();
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: e.response?.data?.error || 'No se pudo eliminar',
        ...swalOpts,
      });
    }
  };

  if (!open) return null;

  return createPortal(
    <div className="rs-overlay" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="rs-modal rs-modal--wide" role="dialog" aria-modal="true" aria-labelledby="rs-correos-title" onMouseDown={(e) => e.stopPropagation()}>
        <div className="rs-modal-header">
          <div>
            <h2 id="rs-correos-title">📧 Correos de envío</h2>
            <p>Destinatarios que reciben avisos del libro de reclamaciones y sugerencias de la web.</p>
          </div>
          <button type="button" className="rs-modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <div className="rs-modal-body">
          <div className="rs-form-grid" style={{ marginBottom: '1.1rem' }}>
            <div className="rs-field">
              <label>Correo *</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="nombre@colegio.edu.pe"
              />
            </div>
            <div className="rs-field">
              <label>Etiqueta</label>
              <input
                type="text"
                value={form.etiqueta}
                onChange={(e) => setForm((f) => ({ ...f, etiqueta: e.target.value }))}
                placeholder="Ej. Dirección"
              />
            </div>
            <div className="rs-field rs-field--full">
              <label>Opciones</label>
              <div className="rs-checks">
                <label>
                  <input
                    type="checkbox"
                    checked={form.activo}
                    onChange={(e) => setForm((f) => ({ ...f, activo: e.target.checked }))}
                  />
                  Activo
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={form.recibe_sugerencias}
                    onChange={(e) => setForm((f) => ({ ...f, recibe_sugerencias: e.target.checked }))}
                  />
                  Recibe sugerencias
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={form.recibe_reclamos}
                    onChange={(e) => setForm((f) => ({ ...f, recibe_reclamos: e.target.checked }))}
                  />
                  Recibe reclamos
                </label>
              </div>
            </div>
          </div>
          <div className="rs-modal-footer" style={{ borderTop: 'none', padding: '0 0 1rem' }}>
            {edit && (
              <button type="button" className="rs-btn rs-btn-ghost" onClick={cancelarForm}>
                Cancelar edición
              </button>
            )}
            <button type="button" className="rs-btn rs-btn-primary" onClick={guardar} disabled={saving}>
              {saving ? 'Guardando…' : edit ? '💾 Guardar cambios' : '➕ Crear correo'}
            </button>
          </div>

          {loading ? (
            <p className="rs-loading">Cargando correos…</p>
          ) : items.length === 0 ? (
            <p className="rs-empty">No hay correos configurados. Cree el primero arriba.</p>
          ) : (
            <div className="rs-table-wrap">
              <table className="rs-table">
                <thead>
                  <tr>
                    <th>Correo</th>
                    <th>Etiqueta</th>
                    <th>Estado</th>
                    <th>Recibe</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <div className="rs-nombre">{row.email}</div>
                        <div className="rs-muted">Desde {fmtFecha(row.creado_en)}</div>
                      </td>
                      <td>{row.etiqueta || '—'}</td>
                      <td>
                        <span className={`rs-badge ${row.activo ? 'rs-badge--ok' : 'rs-badge--off'}`}>
                          {row.activo ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td>
                        <div className="rs-chip-row">
                          <span className={`rs-badge ${row.recibe_sugerencias ? 'rs-badge--ok' : 'rs-badge--off'}`}>
                            Sugerencias
                          </span>
                          <span className={`rs-badge ${row.recibe_reclamos ? 'rs-badge--reclamo' : 'rs-badge--off'}`}>
                            Reclamos
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className="rs-actions">
                          <button type="button" className="rs-btn rs-btn-ghost rs-btn-sm" onClick={() => abrirEditar(row)} title="Editar">
                            ✏️
                          </button>
                          <button type="button" className="rs-btn rs-btn-danger rs-btn-sm" onClick={() => eliminar(row)} title="Eliminar">
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
        </div>
      </div>
    </div>,
    document.body
  );
}

function ModalReclamo({ open, mode, item, onClose, onSaved }) {
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && item) {
      setForm({
        ...item,
        fecha_hecho: item.fecha_hecho ? String(item.fecha_hecho).slice(0, 10) : '',
      });
    }
  }, [open, item]);

  if (!open || !form) return null;

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const guardar = async () => {
    try {
      setSaving(true);
      await api.put(`${API}/reclamos/${form.id}`, form);
      await Swal.fire({
        icon: 'success',
        title: 'Reclamo actualizado',
        timer: 1500,
        showConfirmButton: false,
        ...swalOpts,
      });
      onSaved?.();
      onClose();
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: e.response?.data?.error || 'No se pudo guardar',
        ...swalOpts,
      });
    } finally {
      setSaving(false);
    }
  };

  const abrirAdjunto = async () => {
    try {
      const res = await api.get(`${API}/reclamos/${form.id}/adjunto`, { responseType: 'blob' });
      const blob = new Blob([res.data], { type: res.headers['content-type'] || 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      let msg = 'No se pudo abrir el adjunto';
      try {
        if (e.response?.data instanceof Blob) {
          const text = await e.response.data.text();
          const j = JSON.parse(text);
          msg = j.error || msg;
        } else {
          msg = e.response?.data?.error || msg;
        }
      } catch {
        /* ignore */
      }
      Swal.fire({ icon: 'error', title: 'Adjunto', text: msg, ...swalOpts });
    }
  };

  return createPortal(
    <div className="rs-overlay" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="rs-modal rs-modal--wide" role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
        <div className="rs-modal-header">
          <div>
            <h2>{mode === 'edit' ? '✏️ Editar reclamo' : '📋 Detalle del reclamo'}</h2>
            <p>
              N.º {form.numero || form.id} · {fmtFecha(form.fecha_registro)}
            </p>
          </div>
          <button type="button" className="rs-modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <div className="rs-modal-body">
          {mode === 'view' ? (
            <>
              <div className="rs-detail-block">
                <h3>Reclamante</h3>
                <div className="rs-detail-grid">
                  <div className="rs-detail-item">
                    <span>Nombre</span>
                    <strong>{form.nombre}</strong>
                  </div>
                  <div className="rs-detail-item">
                    <span>Email</span>
                    <strong>{form.email}</strong>
                  </div>
                  <div className="rs-detail-item">
                    <span>Teléfono</span>
                    <strong>{form.telefono || '—'}</strong>
                  </div>
                  <div className="rs-detail-item">
                    <span>Documento</span>
                    <strong>
                      {form.tipo_documento} {form.numero_documento}
                    </strong>
                  </div>
                  <div className="rs-detail-item">
                    <span>Relación</span>
                    <strong>{form.relacion || '—'}</strong>
                  </div>
                  <div className="rs-detail-item">
                    <span>Domicilio</span>
                    <strong>{form.domicilio || '—'}</strong>
                  </div>
                </div>
              </div>
              <div className="rs-detail-block">
                <h3>Alumno / registro</h3>
                <div className="rs-detail-grid">
                  <div className="rs-detail-item">
                    <span>Alumno</span>
                    <strong>{form.alumno_nombre || '—'}</strong>
                  </div>
                  <div className="rs-detail-item">
                    <span>DNI alumno</span>
                    <strong>{form.alumno_dni || '—'}</strong>
                  </div>
                  <div className="rs-detail-item">
                    <span>Tipo</span>
                    <strong>
                      <span className={`rs-badge rs-badge--${form.tipo}`}>{form.tipo}</span>
                    </strong>
                  </div>
                  <div className="rs-detail-item">
                    <span>Estado</span>
                    <strong>
                      <BadgeEstado estado={form.estado} />
                    </strong>
                  </div>
                  <div className="rs-detail-item">
                    <span>Fecha del hecho</span>
                    <strong>{form.fecha_hecho || '—'}</strong>
                  </div>
                  <div className="rs-detail-item">
                    <span>Bien / servicio</span>
                    <strong>{form.bien_contratado || '—'}</strong>
                  </div>
                  <div className="rs-detail-item">
                    <span>Monto</span>
                    <strong>{form.monto || '—'}</strong>
                  </div>
                </div>
              </div>
              <div className="rs-detail-block">
                <h3>Detalle</h3>
                <p className="rs-detail-text">{form.detalle}</p>
              </div>
              <div className="rs-detail-block">
                <h3>Pedido</h3>
                <p className="rs-detail-text">{form.pedido}</p>
              </div>
              {(form.adjunto_nombre || form.adjunto_ruta) && (
                <div className="rs-detail-block">
                  <h3>Adjunto</h3>
                  <button type="button" className="rs-btn rs-btn-primary rs-btn-sm" onClick={abrirAdjunto}>
                    📎 {form.adjunto_nombre || 'Abrir archivo'}
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="rs-form-grid">
              <div className="rs-field">
                <label>Nombre *</label>
                <input value={form.nombre || ''} onChange={(e) => set('nombre', e.target.value)} />
              </div>
              <div className="rs-field">
                <label>Email *</label>
                <input value={form.email || ''} onChange={(e) => set('email', e.target.value)} />
              </div>
              <div className="rs-field">
                <label>Teléfono</label>
                <input value={form.telefono || ''} onChange={(e) => set('telefono', e.target.value)} />
              </div>
              <div className="rs-field">
                <label>Estado</label>
                <select value={form.estado || 'nuevo'} onChange={(e) => set('estado', e.target.value)}>
                  {ESTADOS.map((e) => (
                    <option key={e.value} value={e.value}>
                      {e.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="rs-field">
                <label>Tipo</label>
                <select value={form.tipo || 'reclamo'} onChange={(e) => set('tipo', e.target.value)}>
                  <option value="reclamo">Reclamo</option>
                  <option value="queja">Queja</option>
                </select>
              </div>
              <div className="rs-field">
                <label>Fecha del hecho</label>
                <input type="date" value={form.fecha_hecho || ''} onChange={(e) => set('fecha_hecho', e.target.value)} />
              </div>
              <div className="rs-field">
                <label>Tipo documento</label>
                <input value={form.tipo_documento || ''} onChange={(e) => set('tipo_documento', e.target.value)} />
              </div>
              <div className="rs-field">
                <label>N° documento</label>
                <input value={form.numero_documento || ''} onChange={(e) => set('numero_documento', e.target.value)} />
              </div>
              <div className="rs-field">
                <label>Alumno</label>
                <input value={form.alumno_nombre || ''} onChange={(e) => set('alumno_nombre', e.target.value)} />
              </div>
              <div className="rs-field">
                <label>DNI alumno</label>
                <input value={form.alumno_dni || ''} onChange={(e) => set('alumno_dni', e.target.value)} />
              </div>
              <div className="rs-field rs-field--full">
                <label>Detalle *</label>
                <textarea value={form.detalle || ''} onChange={(e) => set('detalle', e.target.value)} />
              </div>
              <div className="rs-field rs-field--full">
                <label>Pedido *</label>
                <textarea value={form.pedido || ''} onChange={(e) => set('pedido', e.target.value)} />
              </div>
            </div>
          )}
        </div>
        <div className="rs-modal-footer">
          <button type="button" className="rs-btn rs-btn-ghost" onClick={onClose}>
            Cerrar
          </button>
          {mode === 'edit' && (
            <button type="button" className="rs-btn rs-btn-primary" onClick={guardar} disabled={saving}>
              {saving ? 'Guardando…' : '💾 Guardar'}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

function ModalSugerencia({ open, mode, item, onClose, onSaved }) {
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && item) setForm({ ...item });
  }, [open, item]);

  if (!open || !form) return null;

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const guardar = async () => {
    try {
      setSaving(true);
      await api.put(`${API}/sugerencias/${form.id}`, form);
      await Swal.fire({
        icon: 'success',
        title: 'Sugerencia actualizada',
        timer: 1500,
        showConfirmButton: false,
        ...swalOpts,
      });
      onSaved?.();
      onClose();
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: e.response?.data?.error || 'No se pudo guardar',
        ...swalOpts,
      });
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="rs-overlay" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="rs-modal" role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
        <div className="rs-modal-header">
          <div>
            <h2>{mode === 'edit' ? '✏️ Editar sugerencia' : '💡 Detalle de sugerencia'}</h2>
            <p>{fmtFecha(form.fecha_registro)}</p>
          </div>
          <button type="button" className="rs-modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <div className="rs-modal-body">
          {mode === 'view' ? (
            <>
              <div className="rs-detail-block">
                <div className="rs-detail-grid">
                  <div className="rs-detail-item">
                    <span>Nombre</span>
                    <strong>{form.nombre}</strong>
                  </div>
                  <div className="rs-detail-item">
                    <span>Email</span>
                    <strong>{form.email}</strong>
                  </div>
                  <div className="rs-detail-item">
                    <span>Teléfono</span>
                    <strong>{form.telefono || '—'}</strong>
                  </div>
                  <div className="rs-detail-item">
                    <span>Relación</span>
                    <strong>{form.relacion || '—'}</strong>
                  </div>
                  <div className="rs-detail-item">
                    <span>Tipo</span>
                    <strong>{form.tipo || '—'}</strong>
                  </div>
                  <div className="rs-detail-item">
                    <span>Estado</span>
                    <strong>
                      <BadgeEstado estado={form.estado} />
                    </strong>
                  </div>
                </div>
              </div>
              <div className="rs-detail-block">
                <h3>Mensaje</h3>
                <p className="rs-detail-text">{form.mensaje}</p>
              </div>
            </>
          ) : (
            <div className="rs-form-grid">
              <div className="rs-field">
                <label>Nombre *</label>
                <input value={form.nombre || ''} onChange={(e) => set('nombre', e.target.value)} />
              </div>
              <div className="rs-field">
                <label>Email *</label>
                <input value={form.email || ''} onChange={(e) => set('email', e.target.value)} />
              </div>
              <div className="rs-field">
                <label>Teléfono</label>
                <input value={form.telefono || ''} onChange={(e) => set('telefono', e.target.value)} />
              </div>
              <div className="rs-field">
                <label>Estado</label>
                <select value={form.estado || 'nuevo'} onChange={(e) => set('estado', e.target.value)}>
                  {ESTADOS.map((e) => (
                    <option key={e.value} value={e.value}>
                      {e.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="rs-field">
                <label>Relación</label>
                <input value={form.relacion || ''} onChange={(e) => set('relacion', e.target.value)} />
              </div>
              <div className="rs-field">
                <label>Tipo</label>
                <input value={form.tipo || ''} onChange={(e) => set('tipo', e.target.value)} />
              </div>
              <div className="rs-field rs-field--full">
                <label>Mensaje *</label>
                <textarea value={form.mensaje || ''} onChange={(e) => set('mensaje', e.target.value)} />
              </div>
            </div>
          )}
        </div>
        <div className="rs-modal-footer">
          <button type="button" className="rs-btn rs-btn-ghost" onClick={onClose}>
            Cerrar
          </button>
          {mode === 'edit' && (
            <button type="button" className="rs-btn rs-btn-primary" onClick={guardar} disabled={saving}>
              {saving ? 'Guardando…' : '💾 Guardar'}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function AdminReclamosSugerencias() {
  const [searchParams] = useSearchParams();
  const tabInicial =
    searchParams.get('tab') === 'sugerencias' ? 'sugerencias' : 'reclamos';
  const [tab, setTab] = useState(tabInicial);
  const [reclamos, setReclamos] = useState([]);
  const [sugerencias, setSugerencias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [estado, setEstado] = useState('');
  const [tipoReclamo, setTipoReclamo] = useState('');
  const [modalCorreos, setModalCorreos] = useState(false);
  const [modalReclamo, setModalReclamo] = useState({ open: false, mode: 'view', item: null });
  const [modalSugerencia, setModalSugerencia] = useState({ open: false, mode: 'view', item: null });

  useEffect(() => {
    const t = searchParams.get('tab');
    if (t === 'sugerencias' || t === 'reclamos') setTab(t);
  }, [searchParams]);

  const cargar = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const params = {};
      if (q.trim()) params.q = q.trim();
      if (estado) params.estado = estado;
      if (tab === 'reclamos' && tipoReclamo) params.tipo = tipoReclamo;

      if (tab === 'reclamos') {
        const [{ data }, sugRes] = await Promise.all([
          api.get(`${API}/reclamos`, { params }),
          api.get(`${API}/sugerencias`).catch(() => ({ data: { sugerencias: null } })),
        ]);
        setReclamos(data.reclamos || []);
        if (Array.isArray(sugRes.data?.sugerencias)) {
          setSugerencias(sugRes.data.sugerencias);
        }
      } else {
        const [{ data }, recRes] = await Promise.all([
          api.get(`${API}/sugerencias`, { params }),
          api.get(`${API}/reclamos`).catch(() => ({ data: { reclamos: null } })),
        ]);
        setSugerencias(data.sugerencias || []);
        if (Array.isArray(recRes.data?.reclamos)) {
          setReclamos(recRes.data.reclamos);
        }
      }
    } catch (e) {
      setError(e.response?.data?.error || 'Error al cargar datos');
    } finally {
      setLoading(false);
    }
  }, [tab, q, estado, tipoReclamo]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const nuevosReclamos = useMemo(
    () => reclamos.filter((x) => x.estado === 'nuevo').length,
    [reclamos]
  );
  const nuevasSugerencias = useMemo(
    () => sugerencias.filter((x) => x.estado === 'nuevo').length,
    [sugerencias]
  );

  const abrirReclamo = async (row, mode) => {
    let item = row;
    if (row?.estado === 'nuevo') {
      try {
        const { data } = await api.post(`${API}/reclamos/${row.id}/marcar-visto`);
        if (data?.reclamo) {
          item = data.reclamo;
          setReclamos((prev) =>
            prev.map((r) => (r.id === row.id ? { ...r, ...data.reclamo, estado: data.reclamo.estado } : r))
          );
        }
      } catch (e) {
        console.warn('No se pudo marcar reclamo como visto:', e);
      }
    }
    setModalReclamo({ open: true, mode, item });
  };

  const abrirSugerencia = async (row, mode) => {
    let item = row;
    if (row?.estado === 'nuevo') {
      try {
        const { data } = await api.post(`${API}/sugerencias/${row.id}/marcar-visto`);
        if (data?.sugerencia) {
          item = data.sugerencia;
          setSugerencias((prev) =>
            prev.map((r) => (r.id === row.id ? { ...r, ...data.sugerencia, estado: data.sugerencia.estado } : r))
          );
        }
      } catch (e) {
        console.warn('No se pudo marcar sugerencia como vista:', e);
      }
    }
    setModalSugerencia({ open: true, mode, item });
  };

  const eliminarReclamo = async (row) => {
    const conf = await Swal.fire({
      icon: 'warning',
      title: '¿Eliminar reclamo?',
      text: `${row.numero || row.id} — ${row.nombre}`,
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#b91c1c',
      ...swalOpts,
    });
    if (!conf.isConfirmed) return;
    try {
      await api.delete(`${API}/reclamos/${row.id}`);
      await cargar();
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: e.response?.data?.error || 'No se pudo eliminar',
        ...swalOpts,
      });
    }
  };

  const eliminarSugerencia = async (row) => {
    const conf = await Swal.fire({
      icon: 'warning',
      title: '¿Eliminar sugerencia?',
      text: row.nombre,
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#b91c1c',
      ...swalOpts,
    });
    if (!conf.isConfirmed) return;
    try {
      await api.delete(`${API}/sugerencias/${row.id}`);
      await cargar();
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: e.response?.data?.error || 'No se pudo eliminar',
        ...swalOpts,
      });
    }
  };

  const abrirAdjunto = async (row) => {
    try {
      const res = await api.get(`${API}/reclamos/${row.id}/adjunto`, { responseType: 'blob' });
      const blob = new Blob([res.data], { type: res.headers['content-type'] || 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      let msg = 'No se pudo abrir el adjunto';
      try {
        if (e.response?.data instanceof Blob) {
          const text = await e.response.data.text();
          const j = JSON.parse(text);
          msg = j.error || msg;
        }
      } catch {
        /* ignore */
      }
      Swal.fire({ icon: 'error', title: 'Adjunto', text: msg, ...swalOpts });
    }
  };

  return (
    <DashboardLayout>
      <div className="rs-page">
        <header className="rs-hero">
          <div>
            <h1>Reclamos y Sugerencias</h1>
            <p>
              Gestión de registros enviados desde la web pública (
              <a href="https://vanguardschools.com/libro-de-reclamaciones" target="_blank" rel="noreferrer" style={{ color: '#fff' }}>
                Libro de reclamaciones
              </a>
              ). Solo administradores.
            </p>
          </div>
          <div className="rs-hero-actions">
            <button type="button" className="rs-btn rs-btn-light" onClick={() => setModalCorreos(true)}>
              📧 Correos de envío
            </button>
            <button type="button" className="rs-btn rs-btn-light" onClick={cargar}>
              🔄 Actualizar
            </button>
          </div>
        </header>

        <nav className="rs-tabs" aria-label="Secciones">
          <button
            type="button"
            className={`rs-tab${tab === 'reclamos' ? ' rs-tab--active' : ''}`}
            onClick={() => setTab('reclamos')}
          >
            📋 Reclamos
            {nuevosReclamos > 0 && <span className="rs-tab-badge">{nuevosReclamos}</span>}
          </button>
          <button
            type="button"
            className={`rs-tab${tab === 'sugerencias' ? ' rs-tab--active' : ''}`}
            onClick={() => setTab('sugerencias')}
          >
            💡 Sugerencias
            {nuevasSugerencias > 0 && <span className="rs-tab-badge">{nuevasSugerencias}</span>}
          </button>
        </nav>

        <div className="rs-toolbar">
          <div className="rs-field">
            <label>Buscar</label>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={tab === 'reclamos' ? 'Nombre, N°, email, detalle…' : 'Nombre, email, mensaje…'}
            />
          </div>
          <div className="rs-field">
            <label>Estado</label>
            <select value={estado} onChange={(e) => setEstado(e.target.value)}>
              <option value="">Todos</option>
              {ESTADOS.map((e) => (
                <option key={e.value} value={e.value}>
                  {e.label}
                </option>
              ))}
            </select>
          </div>
          {tab === 'reclamos' && (
            <div className="rs-field">
              <label>Tipo</label>
              <select value={tipoReclamo} onChange={(e) => setTipoReclamo(e.target.value)}>
                <option value="">Todos</option>
                <option value="reclamo">Reclamo</option>
                <option value="queja">Queja</option>
              </select>
            </div>
          )}
          <button type="button" className="rs-btn rs-btn-primary" onClick={cargar}>
            Filtrar
          </button>
        </div>

        {error && <p className="rs-error">{error}</p>}
        {loading ? (
          <p className="rs-loading">Cargando…</p>
        ) : tab === 'reclamos' ? (
          reclamos.length === 0 ? (
            <p className="rs-empty">No hay reclamos con esos filtros.</p>
          ) : (
            <div className="rs-table-wrap">
              <table className="rs-table">
                <thead>
                  <tr>
                    <th>N°</th>
                    <th>Fecha</th>
                    <th>Reclamante</th>
                    <th>Tipo</th>
                    <th>Estado</th>
                    <th>Adjunto</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {reclamos.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <div className="rs-nombre">{row.numero || row.id}</div>
                      </td>
                      <td>
                        <div>{fmtFecha(row.fecha_registro)}</div>
                      </td>
                      <td>
                        <div className="rs-nombre">{row.nombre}</div>
                        <div className="rs-muted">{row.email}</div>
                        {row.alumno_nombre && <div className="rs-muted">Alumno: {row.alumno_nombre}</div>}
                      </td>
                      <td>
                        <span className={`rs-badge rs-badge--${row.tipo}`}>{row.tipo}</span>
                      </td>
                      <td>
                        <BadgeEstado estado={row.estado} />
                      </td>
                      <td>
                        {row.tiene_adjunto ? (
                          <button type="button" className="rs-btn rs-btn-ghost rs-btn-sm" onClick={() => abrirAdjunto(row)} title="Abrir adjunto">
                            📎 Ver
                          </button>
                        ) : (
                          <span className="rs-muted">—</span>
                        )}
                      </td>
                      <td>
                        <div className="rs-actions">
                          <button
                            type="button"
                            className="rs-btn rs-btn-ghost rs-btn-sm"
                            title="Ver"
                            onClick={() => abrirReclamo(row, 'view')}
                          >
                            👁️
                          </button>
                          <button
                            type="button"
                            className="rs-btn rs-btn-ghost rs-btn-sm"
                            title="Editar"
                            onClick={() => abrirReclamo(row, 'edit')}
                          >
                            ✏️
                          </button>
                          <button type="button" className="rs-btn rs-btn-danger rs-btn-sm" title="Eliminar" onClick={() => eliminarReclamo(row)}>
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : sugerencias.length === 0 ? (
          <p className="rs-empty">No hay sugerencias con esos filtros.</p>
        ) : (
          <div className="rs-table-wrap">
            <table className="rs-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Nombre</th>
                  <th>Tipo</th>
                  <th>Mensaje</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {sugerencias.map((row) => (
                  <tr key={row.id}>
                    <td>{fmtFecha(row.fecha_registro)}</td>
                    <td>
                      <div className="rs-nombre">{row.nombre}</div>
                      <div className="rs-muted">{row.email}</div>
                    </td>
                    <td>{row.tipo || '—'}</td>
                    <td>
                      <div className="rs-msg-preview" title={row.mensaje}>
                        {row.mensaje}
                      </div>
                    </td>
                    <td>
                      <BadgeEstado estado={row.estado} />
                    </td>
                    <td>
                      <div className="rs-actions">
                        <button
                          type="button"
                          className="rs-btn rs-btn-ghost rs-btn-sm"
                          title="Ver"
                          onClick={() => abrirSugerencia(row, 'view')}
                        >
                          👁️
                        </button>
                        <button
                          type="button"
                          className="rs-btn rs-btn-ghost rs-btn-sm"
                          title="Editar"
                          onClick={() => abrirSugerencia(row, 'edit')}
                        >
                          ✏️
                        </button>
                        <button
                          type="button"
                          className="rs-btn rs-btn-danger rs-btn-sm"
                          title="Eliminar"
                          onClick={() => eliminarSugerencia(row)}
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
      </div>

      <CorreosModal open={modalCorreos} onClose={() => setModalCorreos(false)} />
      <ModalReclamo
        open={modalReclamo.open}
        mode={modalReclamo.mode}
        item={modalReclamo.item}
        onClose={() => setModalReclamo({ open: false, mode: 'view', item: null })}
        onSaved={cargar}
      />
      <ModalSugerencia
        open={modalSugerencia.open}
        mode={modalSugerencia.mode}
        item={modalSugerencia.item}
        onClose={() => setModalSugerencia({ open: false, mode: 'view', item: null })}
        onSaved={cargar}
      />
    </DashboardLayout>
  );
}
