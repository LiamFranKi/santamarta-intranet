import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import Swal from 'sweetalert2';
import DashboardLayout from '../../components/DashboardLayout';
import api from '../../services/api';
import AdminWebCalendarizacion from './AdminWebCalendarizacion';
import AdminWebFaqs from './AdminWebFaqs';
import AdminWebUtiles from './AdminWebUtiles';
import AdminWebDocumentos from './AdminWebDocumentos';
import AdminWebMatricula from './AdminWebMatricula';
import { generarPdfListaVisitasGuiadas } from '../../utils/pdfListaVisitasGuiadas';
import './AdminReclamosSugerencias.css';

const API = '/admin/reclamos-sugerencias';

const ESTADOS = [
  { value: 'nuevo', label: 'Nuevo' },
  { value: 'en_revision', label: 'En revisión' },
  { value: 'atendido', label: 'Atendido' },
  { value: 'cerrado', label: 'Cerrado' },
];

const TABS = [
  { id: 'reclamos', label: '📋 Reclamos' },
  { id: 'sugerencias', label: '💡 Sugerencias' },
  { id: 'contacto', label: '✉️ Contacto' },
  { id: 'visitas', label: '🗓️ Visitas' },
  { id: 'trabaja', label: '💼 Trabaja' },
  { id: 'admision', label: '🎓 Admisión' },
  { id: 'matricula', label: '📝 Matrícula' },
  { id: 'calendarizacion', label: '📆 Calendarización' },
  { id: 'faqs', label: '❓ Preguntas frecuentes' },
  { id: 'utiles', label: '📚 Lista de útiles' },
  { id: 'documentos', label: '📁 Documentos' },
];

const FORM_TAB_IDS = ['reclamos', 'sugerencias', 'contacto', 'visitas', 'trabaja', 'admision'];
const PANEL_TABS = new Set(['calendarizacion', 'faqs', 'utiles', 'documentos', 'matricula']);
const TAB_IDS = TABS.map((t) => t.id);

const CORREO_CANALES = [
  { key: 'recibe_sugerencias', label: 'Sugerencias', badge: 'rs-badge--ok' },
  { key: 'recibe_reclamos', label: 'Reclamos', badge: 'rs-badge--reclamo' },
  { key: 'recibe_contacto', label: 'Contacto', badge: 'rs-badge--ok' },
  { key: 'recibe_visitas', label: 'Visitas', badge: 'rs-badge--ok' },
  { key: 'recibe_trabaja', label: 'Trabaja', badge: 'rs-badge--ok' },
  { key: 'recibe_admision', label: 'Admisión', badge: 'rs-badge--ok' },
  { key: 'recibe_matricula', label: 'Matrícula', badge: 'rs-badge--ok' },
];

const DIAS_SEMANA = [
  { value: 0, label: 'Domingo' },
  { value: 1, label: 'Lunes' },
  { value: 2, label: 'Martes' },
  { value: 3, label: 'Miércoles' },
  { value: 4, label: 'Jueves' },
  { value: 5, label: 'Viernes' },
  { value: 6, label: 'Sábado' },
];

const MESES = [
  { value: 1, label: 'Enero' },
  { value: 2, label: 'Febrero' },
  { value: 3, label: 'Marzo' },
  { value: 4, label: 'Abril' },
  { value: 5, label: 'Mayo' },
  { value: 6, label: 'Junio' },
  { value: 7, label: 'Julio' },
  { value: 8, label: 'Agosto' },
  { value: 9, label: 'Septiembre' },
  { value: 10, label: 'Octubre' },
  { value: 11, label: 'Noviembre' },
  { value: 12, label: 'Diciembre' },
];

const correoFormVacio = () => ({
  email: '',
  etiqueta: '',
  activo: true,
  recibe_sugerencias: false,
  recibe_reclamos: false,
  recibe_contacto: false,
  recibe_visitas: false,
  recibe_trabaja: false,
  recibe_admision: false,
  recibe_matricula: false,
});

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

function ymdPreferida(value) {
  if (!value) return '';
  const m = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : '';
}

function fmtFechaPreferida(value) {
  const ymd = ymdPreferida(value);
  if (!ymd) return value ? String(value) : '—';
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-PE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function fmtFechaPreferidaLarga(ymd) {
  const [y, m, d] = String(ymd || '').split('-').map(Number);
  if (!d) return ymd || '';
  const txt = new Date(y, m - 1, d).toLocaleDateString('es-PE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  return txt.charAt(0).toUpperCase() + txt.slice(1);
}

function etiquetaEstado(estado) {
  const e = ESTADOS.find((x) => x.value === estado);
  return e?.label || estado || '—';
}

function BadgeEstado({ estado }) {
  const key = String(estado || 'nuevo').replace(/\s+/g, '_');
  return <span className={`rs-badge rs-badge--${key}`}>{etiquetaEstado(estado)}</span>;
}

function tabValido(raw) {
  return TAB_IDS.includes(raw) ? raw : 'reclamos';
}

async function abrirBlob(url, fallbackMsg) {
  try {
    const res = await api.get(url, { responseType: 'blob' });
    const blob = new Blob([res.data], { type: res.headers['content-type'] || 'application/octet-stream' });
    const objUrl = URL.createObjectURL(blob);
    window.open(objUrl, '_blank', 'noopener,noreferrer');
    setTimeout(() => URL.revokeObjectURL(objUrl), 60_000);
  } catch (e) {
    let msg = fallbackMsg;
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
    Swal.fire({ icon: 'error', title: 'Archivo', text: msg, ...swalOpts });
  }
}

function OverlayModal({ title, subtitle, wide, onClose, children, footer }) {
  return createPortal(
    <div className="rs-overlay" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className={`rs-modal${wide ? ' rs-modal--wide' : ''}`}
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="rs-modal-header">
          <div>
            <h2>{title}</h2>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          <button type="button" className="rs-modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <div className="rs-modal-body">{children}</div>
        {footer ? <div className="rs-modal-footer">{footer}</div> : null}
      </div>
    </div>,
    document.body
  );
}

function SelectEstado({ value, onChange }) {
  return (
    <select value={value || 'nuevo'} onChange={(e) => onChange(e.target.value)}>
      {ESTADOS.map((e) => (
        <option key={e.value} value={e.value}>
          {e.label}
        </option>
      ))}
    </select>
  );
}

/* ─── Correos de envío ─────────────────────────────────────────────────────── */

function CorreosModal({ open, onClose }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [edit, setEdit] = useState(null);
  const [form, setForm] = useState(correoFormVacio);

  const cargar = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await api.get(`${API}/correos`);
      setItems(data.correos || []);
      if (data.warning) {
        Swal.fire({ icon: 'warning', title: 'Aviso', text: data.warning, ...swalOpts });
      }
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
      setForm(correoFormVacio());
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
      recibe_contacto: !!row.recibe_contacto,
      recibe_visitas: !!row.recibe_visitas,
      recibe_trabaja: !!row.recibe_trabaja,
      recibe_admision: !!row.recibe_admision,
      recibe_matricula: !!row.recibe_matricula,
    });
  };

  const cancelarForm = () => {
    setEdit(null);
    setForm(correoFormVacio());
  };

  const guardar = async () => {
    const algunCanal = CORREO_CANALES.some((c) => form[c.key]);
    if (!algunCanal) {
      Swal.fire({
        icon: 'warning',
        title: 'Canal requerido',
        text: 'Marque al menos un canal de recepción',
        ...swalOpts,
      });
      return;
    }
    try {
      setSaving(true);
      const payload = {
        email: form.email,
        etiqueta: form.etiqueta,
        activo: form.activo ? 1 : 0,
        recibe_sugerencias: form.recibe_sugerencias ? 1 : 0,
        recibe_reclamos: form.recibe_reclamos ? 1 : 0,
        recibe_contacto: form.recibe_contacto ? 1 : 0,
        recibe_visitas: form.recibe_visitas ? 1 : 0,
        recibe_trabaja: form.recibe_trabaja ? 1 : 0,
        recibe_admision: form.recibe_admision ? 1 : 0,
        recibe_matricula: form.recibe_matricula ? 1 : 0,
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

  return (
    <OverlayModal
      title="📧 Correos de envío"
      subtitle="Destinatarios de avisos por correo de los formularios web."
      wide
      onClose={onClose}
    >
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
            {CORREO_CANALES.map((c) => (
              <label key={c.key}>
                <input
                  type="checkbox"
                  checked={!!form[c.key]}
                  onChange={(e) => setForm((f) => ({ ...f, [c.key]: e.target.checked }))}
                />
                {c.label}
              </label>
            ))}
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
                <th>Canales</th>
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
                      {CORREO_CANALES.filter((c) => row[c.key]).map((c) => (
                        <span key={c.key} className={`rs-badge ${c.badge}`}>
                          {c.label}
                        </span>
                      ))}
                      {!CORREO_CANALES.some((c) => row[c.key]) && (
                        <span className="rs-badge rs-badge--off">Sin canales</span>
                      )}
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
    </OverlayModal>
  );
}

/* ─── Config. visitas ──────────────────────────────────────────────────────── */

function esActivo(v) {
  if (v === true || v === 1 || v === '1') return true;
  if (v && typeof v === 'object' && Array.isArray(v.data)) return Boolean(v.data[0]);
  return Number(v) === 1;
}

function VisitasConfigModal({ open, onClose }) {
  const ahora = new Date();
  const [loading, setLoading] = useState(true);
  const [dias, setDias] = useState([]);
  const [horarios, setHorarios] = useState([]);
  const [horarioForm, setHorarioForm] = useState({ id: null, etiqueta: '', activo: true, orden: 0 });
  const [saving, setSaving] = useState(false);
  const [modo, setModo] = useState('semana');
  const [fechas, setFechas] = useState([]);
  const [fechaSuelta, setFechaSuelta] = useState('');
  const [genAnio, setGenAnio] = useState(ahora.getFullYear());
  const [genMes, setGenMes] = useState(ahora.getMonth() + 1);
  const [genDias, setGenDias] = useState([2, 4]);
  const [necesitaMigracion, setNecesitaMigracion] = useState(false);

  const cargar = useCallback(async () => {
    try {
      setLoading(true);
      const [dRes, hRes, cRes] = await Promise.all([
        api.get(`${API}/visita-config/dias`),
        api.get(`${API}/visita-config/horarios`),
        api.get(`${API}/visita-config/calendario`),
      ]);
      setDias(dRes.data.dias || []);
      setHorarios(hRes.data.horarios || []);
      setModo(cRes.data.modo === 'lista' ? 'lista' : 'semana');
      setFechas(cRes.data.fechas || []);
      setNecesitaMigracion(Boolean(cRes.data.necesita_migracion));
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: e.response?.data?.error || 'No se pudo cargar la configuración de visitas',
        ...swalOpts,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      setHorarioForm({ id: null, etiqueta: '', activo: true, orden: 0 });
      cargar();
    }
  }, [open, cargar]);

  const toggleDia = async (dia) => {
    try {
      const siguiente = esActivo(dia.activo) ? 0 : 1;
      await api.put(`${API}/visita-config/dias/${dia.id}`, { activo: siguiente });
      await cargar();
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: e.response?.data?.error || 'No se pudo actualizar el día',
        ...swalOpts,
      });
    }
  };

  const cambiarModo = async (siguiente) => {
    try {
      setSaving(true);
      await api.put(`${API}/visita-config/modo`, { modo: siguiente });
      setModo(siguiente);
      await cargar();
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: e.response?.data?.error || 'No se pudo cambiar el modo',
        ...swalOpts,
      });
    } finally {
      setSaving(false);
    }
  };

  const agregarFechaSuelta = async () => {
    if (!fechaSuelta) {
      Swal.fire({ icon: 'warning', title: 'Elige una fecha', ...swalOpts });
      return;
    }
    try {
      setSaving(true);
      await api.post(`${API}/visita-config/fechas`, { fecha: fechaSuelta });
      setFechaSuelta('');
      await cargar();
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: e.response?.data?.error || 'No se pudo agregar la fecha',
        ...swalOpts,
      });
    } finally {
      setSaving(false);
    }
  };

  const generarFechasMes = async () => {
    if (!genDias.length) {
      Swal.fire({ icon: 'warning', title: 'Marca al menos un día de la semana', ...swalOpts });
      return;
    }
    try {
      setSaving(true);
      const { data } = await api.post(`${API}/visita-config/fechas/generar`, {
        anio: genAnio,
        mes: genMes,
        dias_semana: genDias,
      });
      await cargar();
      await Swal.fire({
        icon: 'success',
        title: 'Fechas agregadas',
        text: `Se habilitaron ${data.total || 0} fechas en la web.`,
        ...swalOpts,
      });
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: e.response?.data?.error || 'No se pudieron generar las fechas',
        ...swalOpts,
      });
    } finally {
      setSaving(false);
    }
  };

  const quitarFecha = async (row) => {
    try {
      await api.delete(`${API}/visita-config/fechas/${row.id}`);
      await cargar();
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: e.response?.data?.error || 'No se pudo quitar',
        ...swalOpts,
      });
    }
  };

  const toggleGenDia = (n) => {
    setGenDias((prev) => (prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n].sort()));
  };

  const cerrarVisitas = async () => {
    const conf = await Swal.fire({
      icon: 'warning',
      title: '¿Cerrar visitas en la web?',
      text: 'Se desactivarán todos los días de la semana y las fechas concretas. La web no mostrará fechas disponibles.',
      showCancelButton: true,
      confirmButtonText: 'Sí, cerrar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#b91c1c',
      ...swalOpts,
    });
    if (!conf.isConfirmed) return;
    try {
      setSaving(true);
      await api.post(`${API}/visita-config/cerrar`);
      await cargar();
      await Swal.fire({
        icon: 'success',
        title: 'Visitas cerradas',
        text: 'Ningún día activo. Recarga la web pública (Ctrl+Shift+R).',
        ...swalOpts,
      });
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: e.response?.data?.error || 'No se pudo cerrar',
        ...swalOpts,
      });
    } finally {
      setSaving(false);
    }
  };

  const guardarHorario = async () => {
    if (!horarioForm.etiqueta.trim()) {
      Swal.fire({ icon: 'warning', title: 'Etiqueta obligatoria', ...swalOpts });
      return;
    }
    try {
      setSaving(true);
      const payload = {
        etiqueta: horarioForm.etiqueta.trim(),
        activo: horarioForm.activo ? 1 : 0,
        orden: Number(horarioForm.orden) || 0,
      };
      if (horarioForm.id) {
        await api.put(`${API}/visita-config/horarios/${horarioForm.id}`, payload);
      } else {
        await api.post(`${API}/visita-config/horarios`, payload);
      }
      setHorarioForm({ id: null, etiqueta: '', activo: true, orden: 0 });
      await cargar();
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: e.response?.data?.error || 'No se pudo guardar el horario',
        ...swalOpts,
      });
    } finally {
      setSaving(false);
    }
  };

  const eliminarHorario = async (row) => {
    const conf = await Swal.fire({
      icon: 'warning',
      title: '¿Eliminar horario?',
      text: row.etiqueta,
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#b91c1c',
      ...swalOpts,
    });
    if (!conf.isConfirmed) return;
    try {
      await api.delete(`${API}/visita-config/horarios/${row.id}`);
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

  const etiquetaDia = (n) => DIAS_SEMANA.find((d) => d.value === Number(n))?.label || `Día ${n}`;

  const fmtFechaLista = (ymd) => {
    const [y, m, d] = String(ymd || '').split('-').map(Number);
    if (!d) return ymd || '—';
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  };

  const hayAlgoAbierto =
    dias.some((d) => esActivo(d.activo)) || fechas.some((f) => esActivo(f.activo));

  if (!open) return null;

  return (
    <OverlayModal
      title="🗓️ Configuración de visitas"
      subtitle="Define qué fechas y horarios verá quien reserve una visita guiada en la web."
      wide
      onClose={onClose}
      footer={
        <button type="button" className="rs-btn rs-btn-ghost" onClick={onClose}>
          Cerrar
        </button>
      }
    >
      <div className="rs-detail-block" style={{ background: '#f0f9ff', borderColor: '#bae6fd' }}>
        <p className="rs-detail-text" style={{ margin: 0 }}>
          Puedes dejar visitas <strong>cerradas</strong>, abrir <strong>todos los martes/jueves a futuro</strong>, o
          publicar <strong>solo fechas concretas</strong> (por ejemplo el 15 y el 17, o todos los martes de octubre).
        </p>
      </div>

      {loading ? (
        <p className="rs-loading">Cargando configuración…</p>
      ) : (
        <>
          <div className="rs-detail-block">
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
              <h3 style={{ margin: 0 }}>Cómo se eligen las fechas</h3>
              <button
                type="button"
                className="rs-btn rs-btn-danger rs-btn-sm"
                onClick={cerrarVisitas}
                disabled={saving || !hayAlgoAbierto}
              >
                🔒 Cerrar visitas
              </button>
            </div>
            <div className="rs-chip-row" style={{ marginTop: '0.65rem' }}>
              <button
                type="button"
                className={`rs-btn rs-btn-sm ${modo === 'semana' ? 'rs-btn-primary' : 'rs-btn-ghost'}`}
                disabled={saving}
                onClick={() => cambiarModo('semana')}
              >
                Días de la semana (a futuro)
              </button>
              <button
                type="button"
                className={`rs-btn rs-btn-sm ${modo === 'lista' ? 'rs-btn-primary' : 'rs-btn-ghost'}`}
                disabled={saving || necesitaMigracion}
                onClick={() => cambiarModo('lista')}
              >
                Solo fechas que yo elija
              </button>
            </div>
            {necesitaMigracion ? (
              <p className="rs-muted" style={{ marginTop: '0.65rem', marginBottom: 0, color: '#b45309' }}>
                Para fechas concretas hay que ejecutar en MySQL el archivo{' '}
                <code>database/migrations/077_web_visita_fechas_mysql.sql</code>. Mientras tanto use días de la semana.
              </p>
            ) : null}
          </div>

          {modo === 'semana' ? (
            <div className="rs-detail-block">
              <h3 style={{ margin: 0 }}>Días de la semana</h3>
              <p className="rs-muted">La web permitirá cualquier fecha futura de esos días (todos los martes, todos los jueves, etc.).</p>
              <div className="rs-chip-row" style={{ marginTop: '0.5rem' }}>
                {dias.map((d) => {
                  const on = esActivo(d.activo);
                  return (
                    <button
                      key={d.id}
                      type="button"
                      className={`rs-btn rs-btn-sm ${on ? 'rs-btn-primary' : 'rs-btn-ghost'}`}
                      onClick={() => toggleDia(d)}
                      title={on ? 'Desactivar' : 'Activar'}
                    >
                      {d.etiqueta || etiquetaDia(d.dia_semana)} {on ? '✓' : '○'}
                    </button>
                  );
                })}
              </div>
              <p className="rs-muted" style={{ marginTop: '0.65rem', marginBottom: 0 }}>
                Activos ahora:{' '}
                {dias.filter((d) => esActivo(d.activo)).map((d) => d.etiqueta || etiquetaDia(d.dia_semana)).join(', ') ||
                  'ninguno (web cerrada si no hay horarios)'}
              </p>
            </div>
          ) : (
            <div className="rs-detail-block">
              <h3 style={{ margin: 0 }}>Fechas concretas</h3>
              <p className="rs-muted">
                Solo esas fechas salen en el calendario de la web. Puedes generar un mes (todos los martes de octubre) o
                agregar fechas sueltas (el 15 y el 17).
              </p>

              <h4 style={{ margin: '1rem 0 0.4rem', fontSize: '0.95rem' }}>Generar un mes</h4>
              <div className="rs-form-grid">
                <div className="rs-field">
                  <label>Año</label>
                  <select value={genAnio} onChange={(e) => setGenAnio(Number(e.target.value))}>
                    {[0, 1].map((i) => {
                      const y = ahora.getFullYear() + i;
                      return (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      );
                    })}
                  </select>
                </div>
                <div className="rs-field">
                  <label>Mes</label>
                  <select value={genMes} onChange={(e) => setGenMes(Number(e.target.value))}>
                    {MESES.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="rs-chip-row" style={{ marginTop: '0.55rem' }}>
                {DIAS_SEMANA.map((d) => (
                  <button
                    key={d.value}
                    type="button"
                    className={`rs-btn rs-btn-sm ${genDias.includes(d.value) ? 'rs-btn-primary' : 'rs-btn-ghost'}`}
                    onClick={() => toggleGenDia(d.value)}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="rs-btn rs-btn-primary rs-btn-sm"
                style={{ marginTop: '0.65rem' }}
                disabled={saving}
                onClick={generarFechasMes}
              >
                Agregar esas fechas
              </button>

              <h4 style={{ margin: '1.15rem 0 0.4rem', fontSize: '0.95rem' }}>Agregar una fecha</h4>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
                <input
                  type="date"
                  value={fechaSuelta}
                  onChange={(e) => setFechaSuelta(e.target.value)}
                  className="rs-field"
                  style={{ padding: '0.4rem 0.55rem' }}
                />
                <button type="button" className="rs-btn rs-btn-primary rs-btn-sm" disabled={saving} onClick={agregarFechaSuelta}>
                  Agregar fecha
                </button>
              </div>

              {fechas.filter((f) => esActivo(f.activo)).length === 0 ? (
                <p className="rs-empty" style={{ marginTop: '0.85rem' }}>
                  No hay fechas futuras. La web permanece cerrada hasta que agregues al menos una.
                </p>
              ) : (
                <div className="rs-table-wrap" style={{ marginTop: '0.85rem' }}>
                  <table className="rs-table">
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th style={{ width: 90 }}>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fechas
                        .filter((f) => esActivo(f.activo))
                        .map((f) => (
                          <tr key={f.id}>
                            <td className="rs-nombre">{fmtFechaLista(f.fecha)}</td>
                            <td>
                              <button
                                type="button"
                                className="rs-btn rs-btn-danger rs-btn-sm"
                                onClick={() => quitarFecha(f)}
                              >
                                🗑️
                              </button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          <div className="rs-detail-block">
            <h3>Horarios</h3>
            <div className="rs-form-grid" style={{ margin: '0.75rem 0' }}>
              <div className="rs-field">
                <label>Etiqueta *</label>
                <input
                  value={horarioForm.etiqueta}
                  onChange={(e) => setHorarioForm((f) => ({ ...f, etiqueta: e.target.value }))}
                  placeholder="Ej. 10:00 a.m."
                />
              </div>
              <div className="rs-field">
                <label>Orden</label>
                <input
                  type="number"
                  value={horarioForm.orden}
                  onChange={(e) => setHorarioForm((f) => ({ ...f, orden: e.target.value }))}
                />
              </div>
              <div className="rs-field">
                <label>Opciones</label>
                <div className="rs-checks">
                  <label>
                    <input
                      type="checkbox"
                      checked={horarioForm.activo}
                      onChange={(e) => setHorarioForm((f) => ({ ...f, activo: e.target.checked }))}
                    />
                    Activo
                  </label>
                </div>
              </div>
            </div>
            <div style={{ marginBottom: '0.75rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {horarioForm.id && (
                <button
                  type="button"
                  className="rs-btn rs-btn-ghost rs-btn-sm"
                  onClick={() => setHorarioForm({ id: null, etiqueta: '', activo: true, orden: 0 })}
                >
                  Cancelar edición
                </button>
              )}
              <button type="button" className="rs-btn rs-btn-primary rs-btn-sm" onClick={guardarHorario} disabled={saving}>
                {saving ? 'Guardando…' : horarioForm.id ? '💾 Guardar horario' : '➕ Crear horario'}
              </button>
            </div>
            {horarios.length === 0 ? (
              <p className="rs-empty">No hay horarios. Cree el primero arriba.</p>
            ) : (
              <div className="rs-table-wrap">
                <table className="rs-table">
                  <thead>
                    <tr>
                      <th>Etiqueta</th>
                      <th>Orden</th>
                      <th>Estado</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {horarios.map((h) => (
                      <tr key={h.id}>
                        <td className="rs-nombre">{h.etiqueta}</td>
                        <td>{h.orden}</td>
                        <td>
                          <span className={`rs-badge ${esActivo(h.activo) ? 'rs-badge--ok' : 'rs-badge--off'}`}>
                            {esActivo(h.activo) ? 'Activo' : 'Inactivo'}
                          </span>
                        </td>
                        <td>
                          <div className="rs-actions">
                            <button
                              type="button"
                              className="rs-btn rs-btn-ghost rs-btn-sm"
                              onClick={() =>
                                setHorarioForm({
                                  id: h.id,
                                  etiqueta: h.etiqueta || '',
                                  activo: esActivo(h.activo),
                                  orden: h.orden ?? 0,
                                })
                              }
                            >
                              ✏️
                            </button>
                            <button type="button" className="rs-btn rs-btn-danger rs-btn-sm" onClick={() => eliminarHorario(h)}>
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
        </>
      )}
    </OverlayModal>
  );
}

/* ─── Modales de detalle / edición ─────────────────────────────────────────── */

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

  return (
    <OverlayModal
      title={mode === 'edit' ? '✏️ Editar reclamo' : '📋 Detalle del reclamo'}
      subtitle={`N.º ${form.numero || form.id} · ${fmtFecha(form.fecha_registro)}`}
      wide
      onClose={onClose}
      footer={
        <>
          <button type="button" className="rs-btn rs-btn-ghost" onClick={onClose}>
            Cerrar
          </button>
          {mode === 'edit' && (
            <button type="button" className="rs-btn rs-btn-primary" onClick={guardar} disabled={saving}>
              {saving ? 'Guardando…' : '💾 Guardar'}
            </button>
          )}
        </>
      }
    >
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
          {(form.adjunto_nombre || form.adjunto_ruta || form.tiene_adjunto) && (
            <div className="rs-detail-block">
              <h3>Adjunto</h3>
              <button
                type="button"
                className="rs-btn rs-btn-primary rs-btn-sm"
                onClick={() => abrirBlob(`${API}/reclamos/${form.id}/adjunto`, 'No se pudo abrir el adjunto')}
              >
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
            <SelectEstado value={form.estado} onChange={(v) => set('estado', v)} />
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
    </OverlayModal>
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

  return (
    <OverlayModal
      title={mode === 'edit' ? '✏️ Editar sugerencia' : '💡 Detalle de sugerencia'}
      subtitle={fmtFecha(form.fecha_registro)}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="rs-btn rs-btn-ghost" onClick={onClose}>
            Cerrar
          </button>
          {mode === 'edit' && (
            <button type="button" className="rs-btn rs-btn-primary" onClick={guardar} disabled={saving}>
              {saving ? 'Guardando…' : '💾 Guardar'}
            </button>
          )}
        </>
      }
    >
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
            <SelectEstado value={form.estado} onChange={(v) => set('estado', v)} />
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
    </OverlayModal>
  );
}

function ModalContacto({ open, mode, item, onClose, onSaved }) {
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
      await api.put(`${API}/contactenos/${form.id}`, form);
      await Swal.fire({
        icon: 'success',
        title: 'Contacto actualizado',
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

  return (
    <OverlayModal
      title={mode === 'edit' ? '✏️ Editar contacto' : '✉️ Detalle de contacto'}
      subtitle={fmtFecha(form.fecha_registro)}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="rs-btn rs-btn-ghost" onClick={onClose}>
            Cerrar
          </button>
          {mode === 'edit' && (
            <button type="button" className="rs-btn rs-btn-primary" onClick={guardar} disabled={saving}>
              {saving ? 'Guardando…' : '💾 Guardar'}
            </button>
          )}
        </>
      }
    >
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
                <span>Asunto</span>
                <strong>{form.asunto || '—'}</strong>
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
            <SelectEstado value={form.estado} onChange={(v) => set('estado', v)} />
          </div>
          <div className="rs-field rs-field--full">
            <label>Asunto</label>
            <input value={form.asunto || ''} onChange={(e) => set('asunto', e.target.value)} />
          </div>
          <div className="rs-field rs-field--full">
            <label>Mensaje *</label>
            <textarea value={form.mensaje || ''} onChange={(e) => set('mensaje', e.target.value)} />
          </div>
        </div>
      )}
    </OverlayModal>
  );
}

function ModalVisita({ open, mode, item, onClose, onSaved }) {
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && item) {
      setForm({
        ...item,
        fecha_preferida: item.fecha_preferida ? String(item.fecha_preferida).slice(0, 10) : '',
      });
    }
  }, [open, item]);

  if (!open || !form) return null;
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const guardar = async () => {
    try {
      setSaving(true);
      await api.put(`${API}/visitas/${form.id}`, form);
      await Swal.fire({
        icon: 'success',
        title: 'Visita actualizada',
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

  return (
    <OverlayModal
      title={mode === 'edit' ? '✏️ Editar visita' : '🗓️ Detalle de visita'}
      subtitle={fmtFecha(form.fecha_registro)}
      wide
      onClose={onClose}
      footer={
        <>
          <button type="button" className="rs-btn rs-btn-ghost" onClick={onClose}>
            Cerrar
          </button>
          {mode === 'edit' && (
            <button type="button" className="rs-btn rs-btn-primary" onClick={guardar} disabled={saving}>
              {saving ? 'Guardando…' : '💾 Guardar'}
            </button>
          )}
        </>
      }
    >
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
                <span>Nivel de interés</span>
                <strong>{form.nivel_interes || '—'}</strong>
              </div>
              <div className="rs-detail-item">
                <span>Fecha preferida</span>
                <strong>{form.fecha_preferida || '—'}</strong>
              </div>
              <div className="rs-detail-item">
                <span>Horario preferido</span>
                <strong>{form.horario_preferido || '—'}</strong>
              </div>
              <div className="rs-detail-item">
                <span>N° estudiantes</span>
                <strong>{form.numero_estudiantes || '—'}</strong>
              </div>
              <div className="rs-detail-item">
                <span>Estado</span>
                <strong>
                  <BadgeEstado estado={form.estado} />
                </strong>
              </div>
            </div>
          </div>
          {form.mensaje && (
            <div className="rs-detail-block">
              <h3>Mensaje</h3>
              <p className="rs-detail-text">{form.mensaje}</p>
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
            <SelectEstado value={form.estado} onChange={(v) => set('estado', v)} />
          </div>
          <div className="rs-field">
            <label>Nivel de interés</label>
            <input value={form.nivel_interes || ''} onChange={(e) => set('nivel_interes', e.target.value)} />
          </div>
          <div className="rs-field">
            <label>Fecha preferida</label>
            <input
              type="date"
              value={form.fecha_preferida || ''}
              onChange={(e) => set('fecha_preferida', e.target.value)}
            />
          </div>
          <div className="rs-field">
            <label>Horario preferido</label>
            <input value={form.horario_preferido || ''} onChange={(e) => set('horario_preferido', e.target.value)} />
          </div>
          <div className="rs-field">
            <label>N° estudiantes</label>
            <input value={form.numero_estudiantes || ''} onChange={(e) => set('numero_estudiantes', e.target.value)} />
          </div>
          <div className="rs-field rs-field--full">
            <label>Mensaje</label>
            <textarea value={form.mensaje || ''} onChange={(e) => set('mensaje', e.target.value)} />
          </div>
        </div>
      )}
    </OverlayModal>
  );
}

function ModalTrabaja({ open, mode, item, onClose, onSaved }) {
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
      await api.put(`${API}/trabaja/${form.id}`, form);
      await Swal.fire({
        icon: 'success',
        title: 'Postulación actualizada',
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

  return (
    <OverlayModal
      title={mode === 'edit' ? '✏️ Editar postulación' : '💼 Detalle de postulación'}
      subtitle={fmtFecha(form.fecha_registro)}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="rs-btn rs-btn-ghost" onClick={onClose}>
            Cerrar
          </button>
          {mode === 'edit' && (
            <button type="button" className="rs-btn rs-btn-primary" onClick={guardar} disabled={saving}>
              {saving ? 'Guardando…' : '💾 Guardar'}
            </button>
          )}
        </>
      }
    >
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
                <span>Puesto</span>
                <strong>{form.puesto || '—'}</strong>
              </div>
              <div className="rs-detail-item">
                <span>Estado</span>
                <strong>
                  <BadgeEstado estado={form.estado} />
                </strong>
              </div>
            </div>
          </div>
          {form.mensaje && (
            <div className="rs-detail-block">
              <h3>Mensaje</h3>
              <p className="rs-detail-text">{form.mensaje}</p>
            </div>
          )}
          {(form.tiene_cv || form.cv_nombre || form.cv_ruta) && (
            <div className="rs-detail-block">
              <h3>CV</h3>
              <button
                type="button"
                className="rs-btn rs-btn-primary rs-btn-sm"
                onClick={() => abrirBlob(`${API}/trabaja/${form.id}/cv`, 'No se pudo abrir el CV')}
              >
                📄 {form.cv_nombre || 'Abrir CV'}
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
            <SelectEstado value={form.estado} onChange={(v) => set('estado', v)} />
          </div>
          <div className="rs-field rs-field--full">
            <label>Puesto *</label>
            <input value={form.puesto || ''} onChange={(e) => set('puesto', e.target.value)} />
          </div>
          <div className="rs-field rs-field--full">
            <label>Mensaje</label>
            <textarea value={form.mensaje || ''} onChange={(e) => set('mensaje', e.target.value)} />
          </div>
        </div>
      )}
    </OverlayModal>
  );
}

function ModalAdmision({ open, mode, item, onClose, onSaved }) {
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
      await api.put(`${API}/admision/${form.id}`, form);
      await Swal.fire({
        icon: 'success',
        title: 'Admisión actualizada',
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

  return (
    <OverlayModal
      title={mode === 'edit' ? '✏️ Editar admisión' : '🎓 Detalle de admisión'}
      subtitle={fmtFecha(form.fecha_registro)}
      wide
      onClose={onClose}
      footer={
        <>
          <button type="button" className="rs-btn rs-btn-ghost" onClick={onClose}>
            Cerrar
          </button>
          {mode === 'edit' && (
            <button type="button" className="rs-btn rs-btn-primary" onClick={guardar} disabled={saving}>
              {saving ? 'Guardando…' : '💾 Guardar'}
            </button>
          )}
        </>
      }
    >
      {mode === 'view' ? (
        <>
          <div className="rs-detail-block">
            <h3>Estudiante</h3>
            <div className="rs-detail-grid">
              <div className="rs-detail-item">
                <span>Nombres</span>
                <strong>{form.nombres_estudiante}</strong>
              </div>
              <div className="rs-detail-item">
                <span>Apellidos</span>
                <strong>{form.apellidos_estudiante}</strong>
              </div>
              <div className="rs-detail-item">
                <span>Grado</span>
                <strong>{form.grado || '—'}</strong>
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
            <h3>Apoderado</h3>
            <div className="rs-detail-grid">
              <div className="rs-detail-item">
                <span>Nombres</span>
                <strong>{form.nombres_apoderado}</strong>
              </div>
              <div className="rs-detail-item">
                <span>DNI</span>
                <strong>{form.dni_apoderado || '—'}</strong>
              </div>
              <div className="rs-detail-item">
                <span>Teléfono</span>
                <strong>{form.telefono_apoderado || '—'}</strong>
              </div>
              <div className="rs-detail-item">
                <span>Email</span>
                <strong>{form.email_apoderado || '—'}</strong>
              </div>
              <div className="rs-detail-item">
                <span>Dirección</span>
                <strong>{form.direccion_apoderado || '—'}</strong>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="rs-form-grid">
          <div className="rs-field">
            <label>Nombres estudiante *</label>
            <input value={form.nombres_estudiante || ''} onChange={(e) => set('nombres_estudiante', e.target.value)} />
          </div>
          <div className="rs-field">
            <label>Apellidos estudiante *</label>
            <input
              value={form.apellidos_estudiante || ''}
              onChange={(e) => set('apellidos_estudiante', e.target.value)}
            />
          </div>
          <div className="rs-field">
            <label>Grado *</label>
            <input value={form.grado || ''} onChange={(e) => set('grado', e.target.value)} />
          </div>
          <div className="rs-field">
            <label>Estado</label>
            <SelectEstado value={form.estado} onChange={(v) => set('estado', v)} />
          </div>
          <div className="rs-field">
            <label>Nombres apoderado *</label>
            <input value={form.nombres_apoderado || ''} onChange={(e) => set('nombres_apoderado', e.target.value)} />
          </div>
          <div className="rs-field">
            <label>DNI apoderado *</label>
            <input value={form.dni_apoderado || ''} onChange={(e) => set('dni_apoderado', e.target.value)} />
          </div>
          <div className="rs-field">
            <label>Teléfono apoderado</label>
            <input
              value={form.telefono_apoderado || ''}
              onChange={(e) => set('telefono_apoderado', e.target.value)}
            />
          </div>
          <div className="rs-field">
            <label>Email apoderado *</label>
            <input value={form.email_apoderado || ''} onChange={(e) => set('email_apoderado', e.target.value)} />
          </div>
          <div className="rs-field rs-field--full">
            <label>Dirección apoderado</label>
            <input
              value={form.direccion_apoderado || ''}
              onChange={(e) => set('direccion_apoderado', e.target.value)}
            />
          </div>
        </div>
      )}
    </OverlayModal>
  );
}

/* ─── Página principal ─────────────────────────────────────────────────────── */

export default function AdminReclamosSugerencias() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = tabValido(searchParams.get('tab'));

  const [listas, setListas] = useState({
    reclamos: [],
    sugerencias: [],
    contacto: [],
    visitas: [],
    trabaja: [],
    admision: [],
  });
  const [badgeCounts, setBadgeCounts] = useState({
    reclamos: 0,
    sugerencias: 0,
    contacto: 0,
    visitas: 0,
    trabaja: 0,
    admision: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [estado, setEstado] = useState('');
  const [tipoReclamo, setTipoReclamo] = useState('');
  const [fechaVisita, setFechaVisita] = useState('');
  const [horarioVisita, setHorarioVisita] = useState('');
  const [fechasOpciones, setFechasOpciones] = useState([]);
  const [exportandoPdf, setExportandoPdf] = useState(false);
  const [modalCorreos, setModalCorreos] = useState(false);
  const [modalVisitasCfg, setModalVisitasCfg] = useState(false);
  const [modal, setModal] = useState({ tipo: null, open: false, mode: 'view', item: null });

  const cambiarTab = (id) => {
    setSearchParams({ tab: id });
    setQ('');
    setEstado('');
    setTipoReclamo('');
    setFechaVisita('');
    setHorarioVisita('');
  };

  const cargar = useCallback(async () => {
    if (PANEL_TABS.has(tab)) {
      setLoading(false);
      setError('');
      return;
    }
    try {
      setLoading(true);
      setError('');
      const params = {};
      if (q.trim()) params.q = q.trim();
      if (estado) params.estado = estado;
      if (tab === 'reclamos' && tipoReclamo) params.tipo = tipoReclamo;
      if (tab === 'visitas' && fechaVisita) params.fecha = fechaVisita;
      if (tab === 'visitas' && horarioVisita) params.horario = horarioVisita;

      const endpoints = {
        reclamos: { path: '/reclamos', key: 'reclamos' },
        sugerencias: { path: '/sugerencias', key: 'sugerencias' },
        contacto: { path: '/contactenos', key: 'contactenos' },
        visitas: { path: '/visitas', key: 'visitas' },
        trabaja: { path: '/trabaja', key: 'postulaciones' },
        admision: { path: '/admision', key: 'admisiones' },
      };

      const activo = endpoints[tab];
      if (!activo) {
        setLoading(false);
        return;
      }
      const { data } = await api.get(`${API}${activo.path}`, { params });
      const items = data[activo.key] || [];

      const badgeRes = await Promise.all(
        FORM_TAB_IDS.map((id) =>
          api
            .get(`${API}${endpoints[id].path}`, { params: { estado: 'nuevo' } })
            .then((r) => ({ id, n: (r.data[endpoints[id].key] || []).length }))
            .catch(() => ({ id, n: null }))
        )
      );

      setListas((prev) => ({ ...prev, [tab]: items }));
      if (tab === 'visitas') {
        try {
          const opt = await api.get(`${API}/visitas/opciones-filtro`);
          setFechasOpciones(opt.data.fechas || []);
        } catch {
          setFechasOpciones([]);
        }
      }
      setBadgeCounts((prev) => {
        const next = { ...prev };
        for (const br of badgeRes) {
          if (br.n != null) next[br.id] = br.n;
        }
        return next;
      });
    } catch (e) {
      setError(e.response?.data?.error || 'Error al cargar datos');
    } finally {
      setLoading(false);
    }
  }, [tab, q, estado, tipoReclamo, fechaVisita, horarioVisita]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const badges = badgeCounts;

  const marcarVistoYAbrir = async (tipo, row, mode) => {
    const map = {
      reclamos: { path: 'reclamos', respKey: 'reclamo', listKey: 'reclamos' },
      sugerencias: { path: 'sugerencias', respKey: 'sugerencia', listKey: 'sugerencias' },
      contacto: { path: 'contactenos', respKey: 'contacto', listKey: 'contacto' },
      visitas: { path: 'visitas', respKey: 'visita', listKey: 'visitas' },
      trabaja: { path: 'trabaja', respKey: 'postulacion', listKey: 'trabaja' },
      admision: { path: 'admision', respKey: 'admision', listKey: 'admision' },
    };
    const cfg = map[tipo];
    let item = row;
    if (row?.estado === 'nuevo') {
      try {
        const { data } = await api.post(`${API}/${cfg.path}/${row.id}/marcar-visto`);
        if (data?.[cfg.respKey]) {
          item = data[cfg.respKey];
          setListas((prev) => ({
            ...prev,
            [cfg.listKey]: (prev[cfg.listKey] || []).map((r) =>
              r.id === row.id ? { ...r, ...item, estado: item.estado } : r
            ),
          }));
          if (row.estado === 'nuevo' && item.estado !== 'nuevo') {
            setBadgeCounts((prev) => ({
              ...prev,
              [cfg.listKey]: Math.max(0, (prev[cfg.listKey] || 0) - 1),
            }));
          }
        }
      } catch (e) {
        console.warn('No se pudo marcar como visto:', e);
      }
    }
    setModal({ tipo, open: true, mode, item });
  };

  const eliminarRegistro = async (tipo, row, label) => {
    const paths = {
      reclamos: 'reclamos',
      sugerencias: 'sugerencias',
      contacto: 'contactenos',
      visitas: 'visitas',
      trabaja: 'trabaja',
      admision: 'admision',
    };
    const conf = await Swal.fire({
      icon: 'warning',
      title: '¿Eliminar registro?',
      text: label,
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#b91c1c',
      ...swalOpts,
    });
    if (!conf.isConfirmed) return;
    try {
      await api.delete(`${API}/${paths[tipo]}/${row.id}`);
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

  const cerrarModal = () => setModal({ tipo: null, open: false, mode: 'view', item: null });

  const itemsActivos = listas[tab] || [];

  const horariosDeFecha = useMemo(() => {
    const found = fechasOpciones.find((f) => f.fecha === fechaVisita);
    return found?.horarios || [];
  }, [fechasOpciones, fechaVisita]);
  const mostrarFiltroHorario = Boolean(fechaVisita) && horariosDeFecha.length > 1;

  const exportarPdfVisitas = async () => {
    if (!fechaVisita) {
      await Swal.fire({
        icon: 'info',
        title: 'Elige una fecha',
        text: 'Selecciona la fecha de visita para generar la lista de quienes vienen ese día.',
        ...swalOpts,
      });
      return;
    }
    if (!itemsActivos.length) {
      await Swal.fire({
        icon: 'info',
        title: 'Sin visitantes',
        text: 'No hay registros para esa fecha con los filtros actuales.',
        ...swalOpts,
      });
      return;
    }
    try {
      setExportandoPdf(true);
      await generarPdfListaVisitasGuiadas({
        colegioNombre: 'Vanguard Schools',
        fechaYmd: fechaVisita,
        horario: horarioVisita || (horariosDeFecha.length === 1 ? horariosDeFecha[0] : ''),
        filas: itemsActivos,
      });
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'No se pudo exportar',
        text: e?.message || 'Error al generar el PDF',
        ...swalOpts,
      });
    } finally {
      setExportandoPdf(false);
    }
  };

  const placeholderBuscar = {
    reclamos: 'Nombre, N°, email, detalle…',
    sugerencias: 'Nombre, email, mensaje…',
    contacto: 'Nombre, email, asunto…',
    visitas: 'Nombre, email, nivel, horario…',
    trabaja: 'Nombre, email, puesto…',
    admision: 'Estudiante, apoderado, DNI, grado…',
  }[tab];

  return (
    <DashboardLayout>
      <div className="rs-page">
        <header className="rs-hero">
          <div>
            <h1>Web</h1>
            <p>Formularios y calendarización de la web pública Vanguard (gestión desde intranet).</p>
          </div>
          <div className="rs-hero-actions">
            {tab !== 'calendarizacion' && tab !== 'faqs' && tab !== 'utiles' && tab !== 'documentos' && (
              <>
                <button type="button" className="rs-btn rs-btn-light" onClick={() => setModalCorreos(true)}>
                  📧 Correos de envío
                </button>
                {tab !== 'matricula' && (
                  <button type="button" className="rs-btn rs-btn-light" onClick={() => setModalVisitasCfg(true)}>
                    🗓️ Config. visitas
                  </button>
                )}
              </>
            )}
            <button
              type="button"
              className="rs-btn rs-btn-light"
              onClick={() => (PANEL_TABS.has(tab) ? window.location.reload() : cargar())}
            >
              🔄 Actualizar
            </button>
          </div>
        </header>

        <nav className="rs-tabs rs-tabs--grid" aria-label="Secciones">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`rs-tab${tab === t.id ? ' rs-tab--active' : ''}`}
              onClick={() => cambiarTab(t.id)}
            >
              {t.label}
              {badges[t.id] > 0 && <span className="rs-tab-badge">{badges[t.id]}</span>}
            </button>
          ))}
        </nav>

        {tab === 'calendarizacion' ? (
          <AdminWebCalendarizacion />
        ) : tab === 'faqs' ? (
          <AdminWebFaqs />
        ) : tab === 'utiles' ? (
          <AdminWebUtiles />
        ) : tab === 'documentos' ? (
          <AdminWebDocumentos />
        ) : tab === 'matricula' ? (
          <AdminWebMatricula onOpenCorreos={() => setModalCorreos(true)} />
        ) : (
          <>
        <div className="rs-toolbar">
          <div className="rs-field">
            <label>Buscar</label>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholderBuscar} />
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
          {tab === 'visitas' && (
            <>
              <div className="rs-field">
                <label>Fecha de visita</label>
                <select
                  value={fechaVisita}
                  onChange={(e) => {
                    setFechaVisita(e.target.value);
                    setHorarioVisita('');
                  }}
                >
                  <option value="">Todas</option>
                  {fechasOpciones.map((f) => (
                    <option key={f.fecha} value={f.fecha}>
                      {fmtFechaPreferidaLarga(f.fecha)}
                    </option>
                  ))}
                </select>
              </div>
              {mostrarFiltroHorario && (
                <div className="rs-field">
                  <label>Horario</label>
                  <select value={horarioVisita} onChange={(e) => setHorarioVisita(e.target.value)}>
                    <option value="">Todos</option>
                    {horariosDeFecha.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </>
          )}
          <div className="rs-toolbar-btns">
            <button type="button" className="rs-btn rs-btn-primary" onClick={cargar}>
              Filtrar
            </button>
            {tab === 'visitas' && (
              <button
                type="button"
                className="rs-btn rs-btn-pdf"
                onClick={exportarPdfVisitas}
                disabled={exportandoPdf}
              >
                {exportandoPdf ? 'Generando…' : '📄 Exportar PDF'}
              </button>
            )}
          </div>
        </div>

        {tab === 'visitas' && fechaVisita && (
          <p className="rs-visitas-filtro-hint">
            Lista del {fmtFechaPreferidaLarga(fechaVisita)}
            {horarioVisita ? ` · ${horarioVisita}` : ''}
            {itemsActivos.length
              ? ` · ${itemsActivos.length} visitante${itemsActivos.length === 1 ? '' : 's'}`
              : ''}
          </p>
        )}

        {error && <p className="rs-error">{error}</p>}
        {loading ? (
          <p className="rs-loading">Cargando…</p>
        ) : itemsActivos.length === 0 ? (
          <p className="rs-empty">No hay registros con esos filtros.</p>
        ) : (
          <div className="rs-table-wrap">
            {tab === 'reclamos' && (
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
                  {itemsActivos.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <div className="rs-nombre">{row.numero || row.id}</div>
                      </td>
                      <td>{fmtFecha(row.fecha_registro)}</td>
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
                          <button
                            type="button"
                            className="rs-btn rs-btn-ghost rs-btn-sm"
                            onClick={() => abrirBlob(`${API}/reclamos/${row.id}/adjunto`, 'No se pudo abrir el adjunto')}
                          >
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
                            onClick={() => marcarVistoYAbrir('reclamos', row, 'view')}
                          >
                            👁️
                          </button>
                          <button
                            type="button"
                            className="rs-btn rs-btn-ghost rs-btn-sm"
                            title="Editar"
                            onClick={() => marcarVistoYAbrir('reclamos', row, 'edit')}
                          >
                            ✏️
                          </button>
                          <button
                            type="button"
                            className="rs-btn rs-btn-danger rs-btn-sm"
                            title="Eliminar"
                            onClick={() => eliminarRegistro('reclamos', row, `${row.numero || row.id} — ${row.nombre}`)}
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {tab === 'sugerencias' && (
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
                  {itemsActivos.map((row) => (
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
                            onClick={() => marcarVistoYAbrir('sugerencias', row, 'view')}
                          >
                            👁️
                          </button>
                          <button
                            type="button"
                            className="rs-btn rs-btn-ghost rs-btn-sm"
                            onClick={() => marcarVistoYAbrir('sugerencias', row, 'edit')}
                          >
                            ✏️
                          </button>
                          <button
                            type="button"
                            className="rs-btn rs-btn-danger rs-btn-sm"
                            onClick={() => eliminarRegistro('sugerencias', row, row.nombre)}
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {tab === 'contacto' && (
              <table className="rs-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Nombre</th>
                    <th>Asunto</th>
                    <th>Mensaje</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {itemsActivos.map((row) => (
                    <tr key={row.id}>
                      <td>{fmtFecha(row.fecha_registro)}</td>
                      <td>
                        <div className="rs-nombre">{row.nombre}</div>
                        <div className="rs-muted">{row.email}</div>
                      </td>
                      <td>{row.asunto || '—'}</td>
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
                            onClick={() => marcarVistoYAbrir('contacto', row, 'view')}
                          >
                            👁️
                          </button>
                          <button
                            type="button"
                            className="rs-btn rs-btn-ghost rs-btn-sm"
                            onClick={() => marcarVistoYAbrir('contacto', row, 'edit')}
                          >
                            ✏️
                          </button>
                          <button
                            type="button"
                            className="rs-btn rs-btn-danger rs-btn-sm"
                            onClick={() => eliminarRegistro('contacto', row, row.nombre)}
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {tab === 'visitas' && (
              <table className="rs-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Nombre</th>
                    <th>Preferencia</th>
                    <th>Nivel</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {itemsActivos.map((row) => (
                    <tr key={row.id}>
                      <td>{fmtFecha(row.fecha_registro)}</td>
                      <td>
                        <div className="rs-nombre">{row.nombre}</div>
                        <div className="rs-muted">{row.email}</div>
                      </td>
                      <td>
                        <div>{fmtFechaPreferida(row.fecha_preferida)}</div>
                        <div className="rs-muted">{row.horario_preferido || ''}</div>
                      </td>
                      <td>{row.nivel_interes || '—'}</td>
                      <td>
                        <BadgeEstado estado={row.estado} />
                      </td>
                      <td>
                        <div className="rs-actions">
                          <button
                            type="button"
                            className="rs-btn rs-btn-ghost rs-btn-sm"
                            onClick={() => marcarVistoYAbrir('visitas', row, 'view')}
                          >
                            👁️
                          </button>
                          <button
                            type="button"
                            className="rs-btn rs-btn-ghost rs-btn-sm"
                            onClick={() => marcarVistoYAbrir('visitas', row, 'edit')}
                          >
                            ✏️
                          </button>
                          <button
                            type="button"
                            className="rs-btn rs-btn-danger rs-btn-sm"
                            onClick={() => eliminarRegistro('visitas', row, row.nombre)}
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {tab === 'trabaja' && (
              <table className="rs-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Nombre</th>
                    <th>Puesto</th>
                    <th>CV</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {itemsActivos.map((row) => (
                    <tr key={row.id}>
                      <td>{fmtFecha(row.fecha_registro)}</td>
                      <td>
                        <div className="rs-nombre">{row.nombre}</div>
                        <div className="rs-muted">{row.email}</div>
                      </td>
                      <td>{row.puesto || '—'}</td>
                      <td>
                        {row.tiene_cv ? (
                          <button
                            type="button"
                            className="rs-btn rs-btn-ghost rs-btn-sm"
                            onClick={() => abrirBlob(`${API}/trabaja/${row.id}/cv`, 'No se pudo abrir el CV')}
                          >
                            📄 Ver
                          </button>
                        ) : (
                          <span className="rs-muted">—</span>
                        )}
                      </td>
                      <td>
                        <BadgeEstado estado={row.estado} />
                      </td>
                      <td>
                        <div className="rs-actions">
                          <button
                            type="button"
                            className="rs-btn rs-btn-ghost rs-btn-sm"
                            onClick={() => marcarVistoYAbrir('trabaja', row, 'view')}
                          >
                            👁️
                          </button>
                          <button
                            type="button"
                            className="rs-btn rs-btn-ghost rs-btn-sm"
                            onClick={() => marcarVistoYAbrir('trabaja', row, 'edit')}
                          >
                            ✏️
                          </button>
                          <button
                            type="button"
                            className="rs-btn rs-btn-danger rs-btn-sm"
                            onClick={() => eliminarRegistro('trabaja', row, row.nombre)}
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {tab === 'admision' && (
              <table className="rs-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Estudiante</th>
                    <th>Apoderado</th>
                    <th>Grado</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {itemsActivos.map((row) => (
                    <tr key={row.id}>
                      <td>{fmtFecha(row.fecha_registro)}</td>
                      <td>
                        <div className="rs-nombre">
                          {row.nombres_estudiante} {row.apellidos_estudiante}
                        </div>
                      </td>
                      <td>
                        <div className="rs-nombre">{row.nombres_apoderado}</div>
                        <div className="rs-muted">{row.email_apoderado}</div>
                        <div className="rs-muted">DNI: {row.dni_apoderado || '—'}</div>
                      </td>
                      <td>{row.grado || '—'}</td>
                      <td>
                        <BadgeEstado estado={row.estado} />
                      </td>
                      <td>
                        <div className="rs-actions">
                          <button
                            type="button"
                            className="rs-btn rs-btn-ghost rs-btn-sm"
                            onClick={() => marcarVistoYAbrir('admision', row, 'view')}
                          >
                            👁️
                          </button>
                          <button
                            type="button"
                            className="rs-btn rs-btn-ghost rs-btn-sm"
                            onClick={() => marcarVistoYAbrir('admision', row, 'edit')}
                          >
                            ✏️
                          </button>
                          <button
                            type="button"
                            className="rs-btn rs-btn-danger rs-btn-sm"
                            onClick={() =>
                              eliminarRegistro(
                                'admision',
                                row,
                                `${row.nombres_estudiante} ${row.apellidos_estudiante}`
                              )
                            }
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
          </>
        )}
      </div>

      <CorreosModal open={modalCorreos} onClose={() => setModalCorreos(false)} />
      <VisitasConfigModal open={modalVisitasCfg} onClose={() => setModalVisitasCfg(false)} />

      <ModalReclamo
        open={modal.open && modal.tipo === 'reclamos'}
        mode={modal.mode}
        item={modal.item}
        onClose={cerrarModal}
        onSaved={cargar}
      />
      <ModalSugerencia
        open={modal.open && modal.tipo === 'sugerencias'}
        mode={modal.mode}
        item={modal.item}
        onClose={cerrarModal}
        onSaved={cargar}
      />
      <ModalContacto
        open={modal.open && modal.tipo === 'contacto'}
        mode={modal.mode}
        item={modal.item}
        onClose={cerrarModal}
        onSaved={cargar}
      />
      <ModalVisita
        open={modal.open && modal.tipo === 'visitas'}
        mode={modal.mode}
        item={modal.item}
        onClose={cerrarModal}
        onSaved={cargar}
      />
      <ModalTrabaja
        open={modal.open && modal.tipo === 'trabaja'}
        mode={modal.mode}
        item={modal.item}
        onClose={cerrarModal}
        onSaved={cargar}
      />
      <ModalAdmision
        open={modal.open && modal.tipo === 'admision'}
        mode={modal.mode}
        item={modal.item}
        onClose={cerrarModal}
        onSaved={cargar}
      />
    </DashboardLayout>
  );
}
