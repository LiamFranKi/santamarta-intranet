import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Swal from 'sweetalert2';
import api from '../../services/api';

const API = '/admin/utiles';
const COLORES = [
  { value: 'pink', label: 'Rosa (Inicial)' },
  { value: 'blue', label: 'Azul (Primaria)' },
  { value: 'purple', label: 'Morado (Secundaria)' },
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

function buildFormData(payload, file) {
  const fd = new FormData();
  Object.entries(payload).forEach(([k, v]) => {
    if (v === undefined || v === null) return;
    fd.append(k, String(v));
  });
  if (file) fd.append('pdf', file);
  return fd;
}

export default function AdminWebUtiles() {
  const [subTab, setSubTab] = useState('grados');
  const [niveles, setNiveles] = useState([]);
  const [grados, setGrados] = useState([]);
  const [preview, setPreview] = useState([]);
  const [nivelFiltro, setNivelFiltro] = useState('');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [modalNivel, setModalNivel] = useState({ open: false, mode: 'create', item: null });
  const [modalGrado, setModalGrado] = useState({ open: false, mode: 'create', item: null });

  const cargarNiveles = useCallback(async () => {
    const { data } = await api.get(`${API}/niveles`);
    setNiveles(data.niveles || []);
  }, []);

  const cargarGrados = useCallback(async () => {
    const params = {};
    if (nivelFiltro) params.nivel_id = nivelFiltro;
    if (q.trim()) params.q = q.trim();
    const { data } = await api.get(`${API}/grados`, { params });
    setGrados(data.grados || []);
  }, [nivelFiltro, q]);

  const cargarPreview = useCallback(async () => {
    const { data } = await api.get(`${API}/preview`);
    setPreview(data.grupos || []);
  }, []);

  const cargar = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      await cargarNiveles();
      if (subTab === 'grados') await cargarGrados();
      if (subTab === 'preview') await cargarPreview();
    } catch (e) {
      setError(e.response?.data?.error || 'Error al cargar lista de útiles');
    } finally {
      setLoading(false);
    }
  }, [subTab, cargarNiveles, cargarGrados, cargarPreview]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const eliminarNivel = async (row) => {
    const conf = await Swal.fire({
      icon: 'warning',
      title: '¿Eliminar nivel?',
      text: row.nombre,
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#b91c1c',
      ...swalOpts,
    });
    if (!conf.isConfirmed) return;
    try {
      await api.delete(`${API}/niveles/${row.id}`);
      await cargar();
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'No se pudo eliminar',
        text: e.response?.data?.error || 'Error',
        ...swalOpts,
      });
    }
  };

  const eliminarGrado = async (row) => {
    const conf = await Swal.fire({
      icon: 'warning',
      title: '¿Eliminar grado?',
      text: `${row.nombre} — también puede borrar el PDF en disco`,
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#b91c1c',
      ...swalOpts,
    });
    if (!conf.isConfirmed) return;
    try {
      await api.delete(`${API}/grados/${row.id}`);
      await cargarGrados();
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: e.response?.data?.error || 'No se pudo eliminar',
        ...swalOpts,
      });
    }
  };

  const agrupados = useMemo(() => {
    const map = {};
    for (const g of grados) {
      const key = g.nivel_id;
      if (!map[key]) {
        map[key] = {
          id: key,
          nombre: g.nivel_nombre,
          color: g.nivel_color,
          orden: g.nivel_orden,
          items: [],
        };
      }
      map[key].items.push(g);
    }
    return Object.values(map).sort((a, b) => (a.orden || 0) - (b.orden || 0));
  }, [grados]);

  if (loading && !niveles.length) return <p className="rs-loading">Cargando lista de útiles…</p>;
  if (error) return <p className="rs-error">{error}</p>;

  return (
    <div>
      <nav className="rs-tabs" aria-label="Útiles internas" style={{ marginBottom: '1rem' }}>
        {[
          { id: 'grados', label: '📄 Grados / PDFs' },
          { id: 'niveles', label: '🏫 Niveles' },
          { id: 'preview', label: '👁️ Vista previa' },
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

      {subTab === 'grados' && (
        <>
          <div className="rs-toolbar" style={{ marginTop: 0 }}>
            <div className="rs-field">
              <label>Nivel</label>
              <select value={nivelFiltro} onChange={(e) => setNivelFiltro(e.target.value)}>
                <option value="">Todos</option>
                {niveles.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div className="rs-field">
              <label>Buscar</label>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Grado, código, archivo…" />
            </div>
            <button type="button" className="rs-btn rs-btn-primary" onClick={cargarGrados}>
              Filtrar
            </button>
            <button
              type="button"
              className="rs-btn rs-btn-primary"
              onClick={() =>
                setModalGrado({
                  open: true,
                  mode: 'create',
                  item: {
                    nivel_id: nivelFiltro || niveles[0]?.id,
                    codigo: '',
                    nombre: '',
                    archivo: '',
                    ruta: '',
                    orden: (grados[grados.length - 1]?.orden || 0) + 1,
                    activo: 1,
                  },
                })
              }
            >
              ➕ Nuevo grado
            </button>
          </div>
          <p className="rs-muted" style={{ marginBottom: '0.75rem' }}>
            Los PDF se guardan en web-vanguard/public/utiles/ y la ruta en BD queda /utiles/archivo.pdf
          </p>

          {grados.length === 0 ? (
            <p className="rs-empty">No hay grados con esos filtros.</p>
          ) : (
            agrupados.map((g) => (
              <div key={g.id} className="rs-detail-block" style={{ marginBottom: '1rem' }}>
                <h3 style={{ textAlign: 'center' }}>
                  {g.nombre}{' '}
                  <span className="rs-muted" style={{ fontWeight: 500, fontSize: '0.85rem' }}>
                    ({g.color})
                  </span>
                </h3>
                <div className="rs-table-wrap">
                  <table className="rs-table">
                    <thead>
                      <tr>
                        <th>Orden</th>
                        <th>Código</th>
                        <th>Nombre</th>
                        <th>Archivo / Ruta</th>
                        <th>Estado</th>
                        <th>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.items.map((row) => (
                        <tr key={row.id}>
                          <td>{row.orden}</td>
                          <td>{row.codigo}</td>
                          <td className="rs-nombre">{row.nombre}</td>
                          <td>
                            <div className="rs-msg-preview">
                              {row.archivo}
                              <br />
                              <span className="rs-muted">{row.ruta}</span>
                            </div>
                          </td>
                          <td>
                            <span className={`rs-badge ${esActivo(row.activo) ? 'rs-badge--ok' : 'rs-badge--off'}`}>
                              {esActivo(row.activo) ? 'Activo' : 'Inactivo'}
                            </span>
                          </td>
                          <td>
                            <div className="rs-actions">
                              <button
                                type="button"
                                className="rs-btn rs-btn-ghost rs-btn-sm"
                                onClick={() => setModalGrado({ open: true, mode: 'edit', item: row })}
                              >
                                ✏️
                              </button>
                              <button type="button" className="rs-btn rs-btn-danger rs-btn-sm" onClick={() => eliminarGrado(row)}>
                                🗑️
                              </button>
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

      {subTab === 'niveles' && (
        <>
          <div style={{ marginBottom: '0.75rem' }}>
            <button
              type="button"
              className="rs-btn rs-btn-primary rs-btn-sm"
              onClick={() =>
                setModalNivel({
                  open: true,
                  mode: 'create',
                  item: {
                    codigo: '',
                    nombre: '',
                    color: 'blue',
                    orden: (niveles[niveles.length - 1]?.orden || 0) + 1,
                    activo: 1,
                  },
                })
              }
            >
              ➕ Nuevo nivel
            </button>
          </div>
          <div className="rs-table-wrap">
            <table className="rs-table">
              <thead>
                <tr>
                  <th>Orden</th>
                  <th>Código</th>
                  <th>Nombre</th>
                  <th>Color</th>
                  <th>Grados</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {niveles.map((n) => (
                  <tr key={n.id}>
                    <td>{n.orden}</td>
                    <td>{n.codigo}</td>
                    <td className="rs-nombre">{n.nombre}</td>
                    <td>{n.color}</td>
                    <td>{n.total_grados ?? '—'}</td>
                    <td>
                      <span className={`rs-badge ${esActivo(n.activo) ? 'rs-badge--ok' : 'rs-badge--off'}`}>
                        {esActivo(n.activo) ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td>
                      <div className="rs-actions">
                        <button
                          type="button"
                          className="rs-btn rs-btn-ghost rs-btn-sm"
                          onClick={() => setModalNivel({ open: true, mode: 'edit', item: n })}
                        >
                          ✏️
                        </button>
                        <button type="button" className="rs-btn rs-btn-danger rs-btn-sm" onClick={() => eliminarNivel(n)}>
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="rs-muted" style={{ marginTop: '0.75rem' }}>
            Si un nivel tiene grados, no se puede borrar (FK). Desactívelo para ocultarlo en la web.
          </p>
        </>
      )}

      {subTab === 'preview' && (
        <div>
          <p className="rs-muted" style={{ marginBottom: '1rem' }}>
            Vista agrupada como en /lista-utiles (solo activos).
          </p>
          {preview.length === 0 ? (
            <p className="rs-empty">No hay niveles/grados activos.</p>
          ) : (
            preview.map((n) => (
              <div key={n.id} className="rs-detail-block" style={{ marginBottom: '1.25rem' }}>
                <h3 style={{ textAlign: 'center', marginBottom: '0.85rem' }}>
                  {n.nombre} <span className="rs-muted">({n.color})</span>
                </h3>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                    gap: '0.75rem',
                  }}
                >
                  {(n.grados || []).map((g) => (
                    <div
                      key={g.id}
                      style={{
                        border: '1px solid #e2e8f0',
                        borderRadius: 10,
                        padding: '0.85rem',
                        background: '#fff',
                      }}
                    >
                      <strong>{g.nombre}</strong>
                      <p className="rs-muted" style={{ margin: '0.35rem 0 0', fontSize: '0.85rem' }}>
                        {g.ruta}
                      </p>
                    </div>
                  ))}
                </div>
                {!n.grados?.length && <p className="rs-muted">Sin grados activos.</p>}
              </div>
            ))
          )}
        </div>
      )}

      {modalNivel.open && (
        <NivelModal
          mode={modalNivel.mode}
          item={modalNivel.item}
          saving={saving}
          onClose={() => setModalNivel({ open: false, mode: 'create', item: null })}
          onSave={async (payload) => {
            try {
              setSaving(true);
              if (modalNivel.mode === 'edit' && modalNivel.item?.id) {
                await api.put(`${API}/niveles/${modalNivel.item.id}`, payload);
              } else {
                await api.post(`${API}/niveles`, payload);
              }
              setModalNivel({ open: false, mode: 'create', item: null });
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
          }}
        />
      )}

      {modalGrado.open && (
        <GradoModal
          mode={modalGrado.mode}
          item={modalGrado.item}
          niveles={niveles}
          saving={saving}
          onClose={() => setModalGrado({ open: false, mode: 'create', item: null })}
          onSave={async (payload, file) => {
            try {
              setSaving(true);
              const fd = buildFormData(payload, file);
              if (modalGrado.mode === 'edit' && modalGrado.item?.id) {
                await api.put(`${API}/grados/${modalGrado.item.id}`, fd);
              } else {
                await api.post(`${API}/grados`, fd);
              }
              setModalGrado({ open: false, mode: 'create', item: null });
              await cargarGrados();
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
    </div>
  );
}

function NivelModal({ mode, item, saving, onClose, onSave }) {
  const [form, setForm] = useState(() => ({
    codigo: item?.codigo || '',
    nombre: item?.nombre || '',
    color: item?.color || 'blue',
    orden: item?.orden ?? 0,
    activo: esActivo(item?.activo ?? 1),
  }));
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Overlay
      title={mode === 'edit' ? '✏️ Editar nivel' : '➕ Nuevo nivel'}
      onClose={onClose}
      footer={
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
                codigo: form.codigo,
                nombre: form.nombre,
                color: form.color,
                orden: Number(form.orden) || 0,
                activo: form.activo ? 1 : 0,
              })
            }
          >
            {saving ? 'Guardando…' : '💾 Guardar'}
          </button>
        </>
      }
    >
      <div className="rs-form-grid">
        <div className="rs-field">
          <label>Código *</label>
          <input value={form.codigo} onChange={(e) => set('codigo', e.target.value)} placeholder="inicial" />
        </div>
        <div className="rs-field">
          <label>Nombre *</label>
          <input value={form.nombre} onChange={(e) => set('nombre', e.target.value)} placeholder="Educación Inicial" />
        </div>
        <div className="rs-field">
          <label>Color (diseño web) *</label>
          <select value={form.color} onChange={(e) => set('color', e.target.value)}>
            {COLORES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
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
      </div>
    </Overlay>
  );
}

function GradoModal({ mode, item, niveles, saving, onClose, onSave }) {
  const [form, setForm] = useState(() => ({
    nivel_id: item?.nivel_id || niveles[0]?.id || '',
    codigo: item?.codigo || '',
    nombre: item?.nombre || '',
    archivo: item?.archivo || '',
    ruta: item?.ruta || '',
    orden: item?.orden ?? 0,
    activo: esActivo(item?.activo ?? 1),
  }));
  const [file, setFile] = useState(null);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Overlay
      title={mode === 'edit' ? '✏️ Editar grado' : '➕ Nuevo grado'}
      wide
      onClose={onClose}
      footer={
        <>
          <button type="button" className="rs-btn rs-btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="rs-btn rs-btn-primary"
            disabled={saving}
            onClick={() =>
              onSave(
                {
                  nivel_id: Number(form.nivel_id),
                  codigo: form.codigo,
                  nombre: form.nombre,
                  archivo: form.archivo,
                  ruta: form.ruta,
                  orden: Number(form.orden) || 0,
                  activo: form.activo ? 1 : 0,
                },
                file
              )
            }
          >
            {saving ? 'Guardando…' : '💾 Guardar'}
          </button>
        </>
      }
    >
      <div className="rs-form-grid">
        <div className="rs-field rs-field--full">
          <label>Nivel *</label>
          <select value={form.nivel_id} onChange={(e) => set('nivel_id', e.target.value)}>
            {niveles.map((n) => (
              <option key={n.id} value={n.id}>
                {n.nombre}
              </option>
            ))}
          </select>
        </div>
        <div className="rs-field">
          <label>Código *</label>
          <input value={form.codigo} onChange={(e) => set('codigo', e.target.value)} placeholder="primaria-1" />
        </div>
        <div className="rs-field">
          <label>Nombre *</label>
          <input value={form.nombre} onChange={(e) => set('nombre', e.target.value)} placeholder="1° Grado" />
        </div>
        <div className="rs-field rs-field--full">
          <label>PDF {mode === 'create' ? '*' : '(opcional si ya existe)'}</label>
          <input
            type="file"
            accept="application/pdf,.pdf"
            onChange={(e) => {
              const f = e.target.files?.[0] || null;
              setFile(f);
              if (f && !form.archivo) set('archivo', f.name);
            }}
          />
        </div>
        <div className="rs-field">
          <label>Nombre archivo descarga</label>
          <input
            value={form.archivo}
            onChange={(e) => set('archivo', e.target.value)}
            placeholder="utiles-1grado.pdf"
          />
        </div>
        <div className="rs-field">
          <label>Ruta pública</label>
          <input
            value={form.ruta}
            onChange={(e) => set('ruta', e.target.value)}
            placeholder="/utiles/utiles-1grado.pdf"
          />
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
      </div>
    </Overlay>
  );
}
