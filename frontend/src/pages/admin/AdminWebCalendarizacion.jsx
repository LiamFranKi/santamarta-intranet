import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Swal from 'sweetalert2';
import api from '../../services/api';

const API = '/admin/calendarizacion';

const MESES = [
  { value: 0, label: 'Todos' },
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

const swalOpts = {
  target: document.body,
  customClass: { container: 'rs-swal-over-modal' },
  didOpen: (popup) => {
    const root = popup?.closest?.('.swal2-container');
    if (root) root.style.setProperty('z-index', '250000', 'important');
  },
};

function esActivo(v) {
  return v === true || v === 1 || v === '1' || Number(v) === 1;
}

function Overlay({ title, subtitle, onClose, children, footer, wide }) {
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
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button type="button" className="rs-modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <div className="rs-modal-body">{children}</div>
        {footer && <div className="rs-modal-footer">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

function labelMes(n) {
  return MESES.find((m) => m.value === Number(n))?.label || `Mes ${n}`;
}

/**
 * Panel Calendarización — tab dentro de Comunicaciones / Web
 */
export default function AdminWebCalendarizacion({ soloLectura = false }) {
  const [anios, setAnios] = useState([]);
  const [anioSel, setAnioSel] = useState(null);
  const [conceptos, setConceptos] = useState([]);
  const [eventos, setEventos] = useState([]);
  const [mesFiltro, setMesFiltro] = useState(0);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [subTab, setSubTab] = useState('eventos'); // eventos | conceptos | anios
  const [modalEv, setModalEv] = useState({ open: false, mode: 'create', item: null });
  const [modalCon, setModalCon] = useState({ open: false, mode: 'create', item: null });
  const [saving, setSaving] = useState(false);

  const cargarAnios = useCallback(async () => {
    const { data } = await api.get(`${API}/anios`);
    const list = data.anios || [];
    setAnios(list);
    setAnioSel((prev) => {
      if (prev && list.some((a) => a.anio === prev)) return prev;
      const activo = list.find((a) => esActivo(a.activo));
      return activo?.anio || list[0]?.anio || null;
    });
  }, []);

  const cargarConceptos = useCallback(async () => {
    const { data } = await api.get(`${API}/conceptos`);
    setConceptos(data.conceptos || []);
  }, []);

  const cargarEventos = useCallback(async () => {
    if (!anioSel) {
      setEventos([]);
      return;
    }
    const params = { anio: anioSel };
    if (mesFiltro) params.mes = mesFiltro;
    if (q.trim()) params.q = q.trim();
    const { data } = await api.get(`${API}/eventos`, { params });
    setEventos(data.eventos || []);
  }, [anioSel, mesFiltro, q]);

  const cargarTodo = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      await Promise.all([cargarAnios(), cargarConceptos()]);
    } catch (e) {
      setError(e.response?.data?.error || 'Error al cargar calendarización');
    } finally {
      setLoading(false);
    }
  }, [cargarAnios, cargarConceptos]);

  useEffect(() => {
    cargarTodo();
  }, [cargarTodo]);

  useEffect(() => {
    if (!anioSel) return;
    cargarEventos().catch((e) => {
      setError(e.response?.data?.error || 'Error al cargar eventos');
    });
  }, [anioSel, cargarEventos]);

  const toggleAnioActivo = async (row) => {
    try {
      await api.put(`${API}/anios/${row.id}`, {
        activo: esActivo(row.activo) ? 0 : 1,
        unico_activo: !esActivo(row.activo),
      });
      await cargarAnios();
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: e.response?.data?.error || 'No se pudo actualizar el año',
        ...swalOpts,
      });
    }
  };

  const crearAnio = async () => {
    const { value } = await Swal.fire({
      title: 'Nuevo año',
      input: 'number',
      inputLabel: 'Año académico',
      inputValue: new Date().getFullYear() + 1,
      showCancelButton: true,
      confirmButtonText: 'Crear',
      cancelButtonText: 'Cancelar',
      ...swalOpts,
    });
    if (!value) return;
    try {
      await api.post(`${API}/anios`, { anio: Number(value), activo: 0 });
      await cargarAnios();
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: e.response?.data?.error || 'No se pudo crear',
        ...swalOpts,
      });
    }
  };

  const eliminarEvento = async (row) => {
    const conf = await Swal.fire({
      icon: 'warning',
      title: '¿Eliminar evento?',
      text: row.texto?.slice(0, 80),
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#b91c1c',
      ...swalOpts,
    });
    if (!conf.isConfirmed) return;
    try {
      await api.delete(`${API}/eventos/${row.id}`);
      await cargarEventos();
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: e.response?.data?.error || 'No se pudo eliminar',
        ...swalOpts,
      });
    }
  };

  const eliminarConcepto = async (row) => {
    const conf = await Swal.fire({
      icon: 'warning',
      title: '¿Eliminar concepto?',
      text: row.etiqueta,
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#b91c1c',
      ...swalOpts,
    });
    if (!conf.isConfirmed) return;
    try {
      await api.delete(`${API}/conceptos/${row.id}`);
      await cargarConceptos();
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: e.response?.data?.error || 'No se pudo eliminar',
        ...swalOpts,
      });
    }
  };

  const eventosPorMes = useMemo(() => {
    const map = {};
    for (const ev of eventos) {
      const k = Number(ev.mes);
      if (!map[k]) map[k] = [];
      map[k].push(ev);
    }
    return map;
  }, [eventos]);

  if (loading) return <p className="rs-loading">Cargando calendarización…</p>;
  if (error) return <p className="rs-error">{error}</p>;

  return (
    <div>
      <div className="rs-toolbar" style={{ marginTop: 0 }}>
        <div className="rs-field">
          <label>Año</label>
          <select value={anioSel || ''} onChange={(e) => setAnioSel(Number(e.target.value))}>
            {anios.map((a) => (
              <option key={a.id} value={a.anio}>
                {a.anio}
                {esActivo(a.activo) ? ' (activo web)' : ''}
              </option>
            ))}
          </select>
        </div>
        {subTab === 'eventos' && (
          <>
            <div className="rs-field">
              <label>Mes</label>
              <select value={mesFiltro} onChange={(e) => setMesFiltro(Number(e.target.value))}>
                {MESES.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="rs-field">
              <label>Buscar</label>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Texto o tipo…" />
            </div>
          </>
        )}
        <button type="button" className="rs-btn rs-btn-primary" onClick={() => (subTab === 'eventos' ? cargarEventos() : cargarTodo())}>
          Filtrar / Actualizar
        </button>
      </div>

      <nav className="rs-tabs" aria-label="Calendarización" style={{ marginBottom: '1rem' }}>
        {[
          { id: 'eventos', label: '📅 Eventos' },
          { id: 'conceptos', label: '🎨 Conceptos' },
          { id: 'anios', label: '📆 Años' },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            className={`rs-tab${subTab === t.id ? ' rs-tab--active' : ''}`}
            onClick={() => setSubTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {subTab === 'anios' && (
        <>
          {!soloLectura && (
            <div style={{ marginBottom: '0.75rem' }}>
              <button type="button" className="rs-btn rs-btn-primary rs-btn-sm" onClick={crearAnio}>
                ➕ Nuevo año
              </button>
            </div>
          )}
          <div className="rs-table-wrap">
            <table className="rs-table">
              <thead>
                <tr>
                  <th>Año</th>
                  <th>Estado en web</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {anios.map((a) => (
                  <tr key={a.id}>
                    <td className="rs-nombre">{a.anio}</td>
                    <td>
                      <span className={`rs-badge ${esActivo(a.activo) ? 'rs-badge--ok' : 'rs-badge--off'}`}>
                        {esActivo(a.activo) ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td>
                      {soloLectura ? (
                        <span className="rs-muted">—</span>
                      ) : (
                        <button type="button" className="rs-btn rs-btn-ghost rs-btn-sm" onClick={() => toggleAnioActivo(a)}>
                          {esActivo(a.activo) ? 'Desactivar' : 'Activar (único)'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="rs-muted" style={{ marginTop: '0.75rem' }}>
            La web publica el año marcado como activo. Si no hay eventos activos, usa el JSON de respaldo.
          </p>
        </>
      )}

      {subTab === 'conceptos' && (
        <>
          {!soloLectura && (
            <div style={{ marginBottom: '0.75rem' }}>
              <button
                type="button"
                className="rs-btn rs-btn-primary rs-btn-sm"
                onClick={() => setModalCon({ open: true, mode: 'create', item: null })}
              >
                ➕ Nuevo concepto
              </button>
            </div>
          )}
          <div className="rs-table-wrap">
            <table className="rs-table">
              <thead>
                <tr>
                  <th>Color</th>
                  <th>Código</th>
                  <th>Etiqueta</th>
                  <th>Orden</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {conceptos.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '0.25rem 0.55rem',
                          borderRadius: 8,
                          background: c.color,
                          color: c.color_texto || '#fff',
                          fontSize: '0.8rem',
                          fontWeight: 700,
                        }}
                      >
                        Aa
                      </span>
                    </td>
                    <td>{c.codigo}</td>
                    <td className="rs-nombre">{c.etiqueta}</td>
                    <td>{c.orden}</td>
                    <td>
                      <span className={`rs-badge ${esActivo(c.activo) ? 'rs-badge--ok' : 'rs-badge--off'}`}>
                        {esActivo(c.activo) ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td>
                      <div className="rs-actions">
                        <button
                          type="button"
                          className="rs-btn rs-btn-ghost rs-btn-sm"
                          title={soloLectura ? 'Ver' : 'Editar'}
                          onClick={() =>
                            setModalCon({ open: true, mode: soloLectura ? 'view' : 'edit', item: c })
                          }
                        >
                          {soloLectura ? '👁️' : '✏️'}
                        </button>
                        {!soloLectura && (
                          <button type="button" className="rs-btn rs-btn-danger rs-btn-sm" onClick={() => eliminarConcepto(c)}>
                            🗑️
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {subTab === 'eventos' && (
        <>
          <div style={{ marginBottom: '0.75rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {!soloLectura && (
              <button
                type="button"
                className="rs-btn rs-btn-primary rs-btn-sm"
                disabled={!anioSel}
                onClick={() =>
                  setModalEv({
                    open: true,
                    mode: 'create',
                    item: {
                      anio: anioSel,
                      mes: mesFiltro || 3,
                      modo: 'dia',
                      dia: 1,
                      tipo: conceptos.find((c) => esActivo(c.activo))?.codigo || 'evento',
                      color: '#3b82f6',
                      color_texto: '#ffffff',
                      texto: '',
                      orden: (eventos[eventos.length - 1]?.orden || 0) + 1,
                      activo: 1,
                    },
                  })
                }
              >
                ➕ Nuevo evento
              </button>
            )}
            <span className="rs-muted" style={{ alignSelf: 'center' }}>
              {eventos.length} evento(s) · año {anioSel}
            </span>
          </div>

          {eventos.length === 0 ? (
            <p className="rs-empty">No hay eventos con esos filtros.</p>
          ) : (
            Object.keys(eventosPorMes)
              .map(Number)
              .sort((a, b) => a - b)
              .map((mes) => (
                <div key={mes} className="rs-detail-block" style={{ marginBottom: '1rem' }}>
                  <h3>{labelMes(mes)}</h3>
                  <div className="rs-table-wrap">
                    <table className="rs-table">
                      <thead>
                        <tr>
                          <th>Vista</th>
                          <th>Cuándo</th>
                          <th>Tipo</th>
                          <th>Texto</th>
                          <th>Orden</th>
                          <th>Estado</th>
                          <th>Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {eventosPorMes[mes].map((ev) => (
                          <tr key={ev.id}>
                            <td>
                              <div
                                style={{
                                  background: ev.color,
                                  color: ev.color_texto || '#fff',
                                  borderRadius: 8,
                                  padding: '0.4rem 0.5rem',
                                  fontSize: '0.75rem',
                                  fontWeight: 700,
                                  whiteSpace: 'pre-line',
                                  maxWidth: 140,
                                  lineHeight: 1.25,
                                }}
                              >
                                {ev.texto}
                              </div>
                            </td>
                            <td>
                              {ev.dia != null
                                ? `Día ${ev.dia}`
                                : `Rango ${ev.rango_inicio}–${ev.rango_fin}`}
                            </td>
                            <td>{ev.tipo}</td>
                            <td>
                              <div className="rs-msg-preview" style={{ whiteSpace: 'pre-line' }} title={ev.texto}>
                                {ev.texto}
                              </div>
                            </td>
                            <td>{ev.orden}</td>
                            <td>
                              <span className={`rs-badge ${esActivo(ev.activo) ? 'rs-badge--ok' : 'rs-badge--off'}`}>
                                {esActivo(ev.activo) ? 'Activo' : 'Inactivo'}
                              </span>
                            </td>
                            <td>
                              <div className="rs-actions">
                                <button
                                  type="button"
                                  className="rs-btn rs-btn-ghost rs-btn-sm"
                                  title={soloLectura ? 'Ver' : 'Editar'}
                                  onClick={() =>
                                    setModalEv({
                                      open: true,
                                      mode: soloLectura ? 'view' : 'edit',
                                      item: {
                                        ...ev,
                                        modo: ev.dia != null ? 'dia' : 'rango',
                                      },
                                    })
                                  }
                                >
                                  {soloLectura ? '👁️' : '✏️'}
                                </button>
                                {!soloLectura && (
                                  <button
                                    type="button"
                                    className="rs-btn rs-btn-danger rs-btn-sm"
                                    onClick={() => eliminarEvento(ev)}
                                  >
                                    🗑️
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))
          )}
        </>
      )}

      {modalEv.open && (
        <EventoModal
          mode={modalEv.mode}
          item={modalEv.item}
          conceptos={conceptos}
          saving={saving}
          onClose={() => setModalEv({ open: false, mode: 'create', item: null })}
          onSave={async (payload) => {
            try {
              setSaving(true);
              if (modalEv.mode === 'edit' && modalEv.item?.id) {
                await api.put(`${API}/eventos/${modalEv.item.id}`, payload);
              } else {
                await api.post(`${API}/eventos`, payload);
              }
              setModalEv({ open: false, mode: 'create', item: null });
              await cargarEventos();
              await Swal.fire({
                icon: 'success',
                title: 'Guardado',
                timer: 1200,
                showConfirmButton: false,
                ...swalOpts,
              });
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
          }}
        />
      )}

      {modalCon.open && (
        <ConceptoModal
          mode={modalCon.mode}
          item={modalCon.item}
          saving={saving}
          onClose={() => setModalCon({ open: false, mode: 'create', item: null })}
          onSave={async (payload) => {
            try {
              setSaving(true);
              if (modalCon.mode === 'edit' && modalCon.item?.id) {
                await api.put(`${API}/conceptos/${modalCon.item.id}`, payload);
              } else {
                await api.post(`${API}/conceptos`, payload);
              }
              setModalCon({ open: false, mode: 'create', item: null });
              await cargarConceptos();
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
          }}
        />
      )}
    </div>
  );
}

function EventoModal({ mode, item, conceptos, saving, onClose, onSave }) {
  const [form, setForm] = useState(() => ({
    anio: item?.anio,
    mes: item?.mes || 3,
    modo: item?.modo || (item?.dia != null ? 'dia' : 'rango'),
    dia: item?.dia ?? 1,
    rango_inicio: item?.rango_inicio ?? 1,
    rango_fin: item?.rango_fin ?? 1,
    tipo: item?.tipo || '',
    color: item?.color || '#3b82f6',
    color_texto: item?.color_texto || '#ffffff',
    texto: item?.texto || '',
    orden: item?.orden ?? 0,
    activo: esActivo(item?.activo ?? 1),
  }));

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const soloVer = mode === 'view';

  const onTipoChange = (codigo) => {
    const c = conceptos.find((x) => x.codigo === codigo);
    setForm((f) => ({
      ...f,
      tipo: codigo,
      color: c?.color || f.color,
      color_texto: c?.color_texto || f.color_texto,
    }));
  };

  return (
    <Overlay
      title={soloVer ? '👁️ Ver evento' : mode === 'edit' ? '✏️ Editar evento' : '➕ Nuevo evento'}
      subtitle={`Año ${form.anio}`}
      wide
      onClose={onClose}
      footer={
        soloVer ? (
          <button type="button" className="rs-btn rs-btn-ghost" onClick={onClose}>
            Cerrar
          </button>
        ) : (
          <>
            <button type="button" className="rs-btn rs-btn-ghost" onClick={onClose}>
              Cancelar
            </button>
            <button
              type="button"
              className="rs-btn rs-btn-primary"
              disabled={saving}
              onClick={() =>
                onSave({
                  anio: form.anio,
                  mes: Number(form.mes),
                  modo: form.modo,
                  dia: form.modo === 'dia' ? Number(form.dia) : null,
                  rango_inicio: form.modo === 'rango' ? Number(form.rango_inicio) : null,
                  rango_fin: form.modo === 'rango' ? Number(form.rango_fin) : null,
                  tipo: form.tipo,
                  color: form.color,
                  color_texto: form.color_texto,
                  texto: form.texto,
                  orden: Number(form.orden) || 0,
                  activo: form.activo ? 1 : 0,
                })
              }
            >
              {saving ? 'Guardando…' : '💾 Guardar'}
            </button>
          </>
        )
      }
    >
      <fieldset disabled={soloVer} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
      <div className="rs-form-grid">
        <div className="rs-field">
          <label>Mes *</label>
          <select value={form.mes} onChange={(e) => set('mes', Number(e.target.value))}>
            {MESES.filter((m) => m.value > 0).map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <div className="rs-field">
          <label>Concepto / tipo *</label>
          <select value={form.tipo} onChange={(e) => onTipoChange(e.target.value)}>
            {conceptos.map((c) => (
              <option key={c.id} value={c.codigo}>
                {c.etiqueta} ({c.codigo})
              </option>
            ))}
          </select>
        </div>
        <div className="rs-field">
          <label>Modo *</label>
          <select value={form.modo} onChange={(e) => set('modo', e.target.value)}>
            <option value="dia">Día único</option>
            <option value="rango">Rango de días</option>
          </select>
        </div>
        {form.modo === 'dia' ? (
          <div className="rs-field">
            <label>Día *</label>
            <input type="number" min={1} max={31} value={form.dia} onChange={(e) => set('dia', e.target.value)} />
          </div>
        ) : (
          <>
            <div className="rs-field">
              <label>Rango inicio *</label>
              <input
                type="number"
                min={1}
                max={31}
                value={form.rango_inicio}
                onChange={(e) => set('rango_inicio', e.target.value)}
              />
            </div>
            <div className="rs-field">
              <label>Rango fin *</label>
              <input
                type="number"
                min={1}
                max={31}
                value={form.rango_fin}
                onChange={(e) => set('rango_fin', e.target.value)}
              />
            </div>
          </>
        )}
        <div className="rs-field">
          <label>Color fondo</label>
          <input type="color" value={form.color} onChange={(e) => set('color', e.target.value)} />
        </div>
        <div className="rs-field">
          <label>Color texto</label>
          <input type="color" value={form.color_texto} onChange={(e) => set('color_texto', e.target.value)} />
        </div>
        <div className="rs-field">
          <label>Orden</label>
          <input type="number" value={form.orden} onChange={(e) => set('orden', e.target.value)} />
        </div>
        <div className="rs-field">
          <label>Estado</label>
          <div className="rs-checks">
            <label>
              <input type="checkbox" checked={form.activo} onChange={(e) => set('activo', e.target.checked)} />
              Activo en la web
            </label>
          </div>
        </div>
        <div className="rs-field rs-field--full">
          <label>Texto del cuadro * (Enter = salto de línea en la web)</label>
          <textarea
            rows={4}
            value={form.texto}
            onChange={(e) => set('texto', e.target.value)}
            placeholder={'Línea 1\nLínea 2'}
          />
        </div>
        <div className="rs-field rs-field--full">
          <label>Vista previa</label>
          <div
            style={{
              background: form.color,
              color: form.color_texto,
              borderRadius: 10,
              padding: '0.75rem 1rem',
              fontWeight: 700,
              whiteSpace: 'pre-line',
              maxWidth: 280,
            }}
          >
            {form.texto || '…'}
          </div>
        </div>
      </div>
      </fieldset>
    </Overlay>
  );
}

function ConceptoModal({ mode, item, saving, onClose, onSave }) {
  const [form, setForm] = useState(() => ({
    codigo: item?.codigo || '',
    etiqueta: item?.etiqueta || '',
    color: item?.color || '#3b82f6',
    color_texto: item?.color_texto || '#ffffff',
    orden: item?.orden ?? 0,
    activo: esActivo(item?.activo ?? 1),
  }));
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const soloVer = mode === 'view';

  return (
    <Overlay
      title={soloVer ? '👁️ Ver concepto' : mode === 'edit' ? '✏️ Editar concepto' : '➕ Nuevo concepto'}
      onClose={onClose}
      footer={
        soloVer ? (
          <button type="button" className="rs-btn rs-btn-ghost" onClick={onClose}>
            Cerrar
          </button>
        ) : (
          <>
            <button type="button" className="rs-btn rs-btn-ghost" onClick={onClose}>
              Cancelar
            </button>
            <button
              type="button"
              className="rs-btn rs-btn-primary"
              disabled={saving}
              onClick={() =>
                onSave({
                  ...form,
                  activo: form.activo ? 1 : 0,
                  orden: Number(form.orden) || 0,
                })
              }
            >
              {saving ? 'Guardando…' : '💾 Guardar'}
            </button>
          </>
        )
      }
    >
      <fieldset disabled={soloVer} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
      <div className="rs-form-grid">
        <div className="rs-field">
          <label>Código *</label>
          <input
            value={form.codigo}
            onChange={(e) => set('codigo', e.target.value)}
            placeholder="feriado"
            disabled={mode === 'edit' || soloVer}
          />
        </div>
        <div className="rs-field">
          <label>Etiqueta *</label>
          <input value={form.etiqueta} onChange={(e) => set('etiqueta', e.target.value)} placeholder="Feriado" />
        </div>
        <div className="rs-field">
          <label>Color fondo</label>
          <input type="color" value={form.color} onChange={(e) => set('color', e.target.value)} />
        </div>
        <div className="rs-field">
          <label>Color texto</label>
          <input type="color" value={form.color_texto} onChange={(e) => set('color_texto', e.target.value)} />
        </div>
        <div className="rs-field">
          <label>Orden</label>
          <input type="number" value={form.orden} onChange={(e) => set('orden', e.target.value)} />
        </div>
        <div className="rs-field">
          <label>Estado</label>
          <div className="rs-checks">
            <label>
              <input type="checkbox" checked={form.activo} onChange={(e) => set('activo', e.target.checked)} />
              Activo
            </label>
          </div>
        </div>
      </div>
      </fieldset>
    </Overlay>
  );
}
