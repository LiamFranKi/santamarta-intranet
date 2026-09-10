import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Swal from 'sweetalert2';
import api from '../../services/api';
import './AdminWebFaqs.css';

const API = '/admin/faqs';

const PAGINA_NIVELES = [
  { id: 'todos', label: 'Todos los niveles' },
  { id: 'inicial', label: 'Inicial' },
  { id: 'primaria', label: 'Primaria' },
  { id: 'secundaria', label: 'Secundaria' },
];

function etiquetaNivel(id) {
  return PAGINA_NIVELES.find((n) => n.id === id)?.label || 'Todos los niveles';
}

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

export default function AdminWebFaqs({ soloLectura = false }) {
  const [subTab, setSubTab] = useState('preguntas'); // preguntas | categorias | preview
  const [categorias, setCategorias] = useState([]);
  const [preguntas, setPreguntas] = useState([]);
  const [preview, setPreview] = useState([]);
  const [catFiltro, setCatFiltro] = useState('');
  const [nivelFiltro, setNivelFiltro] = useState('');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [modalCat, setModalCat] = useState({ open: false, mode: 'create', item: null });
  const [modalFaq, setModalFaq] = useState({ open: false, mode: 'create', item: null });

  const cargarCategorias = useCallback(async () => {
    const { data } = await api.get(`${API}/categorias`);
    setCategorias(data.categorias || []);
  }, []);

  const cargarPreguntas = useCallback(async () => {
    const params = {};
    if (catFiltro) params.categoria_id = catFiltro;
    if (nivelFiltro) params.pagina_nivel = nivelFiltro;
    if (q.trim()) params.q = q.trim();
    const { data } = await api.get(`${API}/preguntas`, { params });
    setPreguntas(data.preguntas || []);
  }, [catFiltro, nivelFiltro, q]);

  const cargarPreview = useCallback(async () => {
    const { data } = await api.get(`${API}/preview`);
    setPreview(data.grupos || []);
  }, []);

  const cargar = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      await cargarCategorias();
      if (subTab === 'preguntas') await cargarPreguntas();
      if (subTab === 'preview') await cargarPreview();
    } catch (e) {
      setError(e.response?.data?.error || 'Error al cargar FAQs');
    } finally {
      setLoading(false);
    }
  }, [subTab, cargarCategorias, cargarPreguntas, cargarPreview]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const eliminarCat = async (row) => {
    const conf = await Swal.fire({
      icon: 'warning',
      title: '¿Eliminar categoría?',
      text: row.etiqueta,
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#b91c1c',
      ...swalOpts,
    });
    if (!conf.isConfirmed) return;
    try {
      await api.delete(`${API}/categorias/${row.id}`);
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

  const eliminarFaq = async (row) => {
    const conf = await Swal.fire({
      icon: 'warning',
      title: '¿Eliminar pregunta?',
      text: row.pregunta,
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#b91c1c',
      ...swalOpts,
    });
    if (!conf.isConfirmed) return;
    try {
      await api.delete(`${API}/preguntas/${row.id}`);
      await cargarPreguntas();
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: e.response?.data?.error || 'No se pudo eliminar',
        ...swalOpts,
      });
    }
  };

  const agrupadas = useMemo(() => {
    const map = {};
    for (const p of preguntas) {
      const key = p.categoria_id;
      if (!map[key]) {
        map[key] = {
          id: key,
          etiqueta: p.categoria_etiqueta,
          orden: p.categoria_orden,
          items: [],
        };
      }
      map[key].items.push(p);
    }
    return Object.values(map).sort((a, b) => (a.orden || 0) - (b.orden || 0));
  }, [preguntas]);

  if (loading && !categorias.length) return <p className="rs-loading">Cargando preguntas frecuentes…</p>;
  if (error) return <p className="rs-error">{error}</p>;

  return (
    <div>
      <nav className="rs-tabs" aria-label="FAQs internas" style={{ marginBottom: '1rem' }}>
        {[
          { id: 'preguntas', label: '❓ Preguntas' },
          { id: 'categorias', label: '📂 Categorías' },
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

      {subTab === 'preguntas' && (
        <>
          <div className="rs-toolbar wf-toolbar-grid" style={{ marginTop: 0 }}>
            <div className="rs-field">
              <label>Categoría</label>
              <select value={catFiltro} onChange={(e) => setCatFiltro(e.target.value)}>
                <option value="">Todas</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.etiqueta}
                  </option>
                ))}
              </select>
            </div>
            <div className="rs-field">
              <label>Página de nivel</label>
              <select value={nivelFiltro} onChange={(e) => setNivelFiltro(e.target.value)}>
                <option value="">Todas</option>
                {PAGINA_NIVELES.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="rs-field">
              <label>Buscar</label>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pregunta o respuesta…" />
            </div>
            <button type="button" className="rs-btn rs-btn-primary" onClick={cargarPreguntas}>
              Filtrar
            </button>
            {!soloLectura && (
              <button
                type="button"
                className="rs-btn rs-btn-primary"
                onClick={() =>
                  setModalFaq({
                    open: true,
                    mode: 'create',
                    item: {
                      categoria_id: catFiltro || categorias[0]?.id,
                      pregunta: '',
                      respuesta: '',
                      pagina_nivel: nivelFiltro || 'todos',
                      orden: (preguntas[preguntas.length - 1]?.orden || 0) + 1,
                      activo: 1,
                    },
                  })
                }
              >
                ➕ Nueva pregunta
              </button>
            )}
          </div>

          {preguntas.length === 0 ? (
            <p className="rs-empty">No hay preguntas con esos filtros.</p>
          ) : (
            agrupadas.map((g) => (
              <div key={g.id} className="wf-group">
                <h3>{g.etiqueta}</h3>
                <div className="wf-cards">
                  {g.items.map((p) => (
                    <article key={p.id} className="wf-card">
                      <div className="wf-card__meta">
                        <span className={`wf-chip wf-chip--${p.pagina_nivel || 'todos'}`}>
                          {etiquetaNivel(p.pagina_nivel || 'todos')}
                        </span>
                        <span className={`rs-badge ${esActivo(p.activo) ? 'rs-badge--ok' : 'rs-badge--off'}`}>
                          {esActivo(p.activo) ? 'Activo' : 'Inactivo'}
                        </span>
                      </div>
                      <h4>{p.pregunta}</h4>
                      <p title={p.respuesta}>{p.respuesta}</p>
                      <div className="wf-card__foot">
                        <small className="rs-muted">Orden {p.orden}</small>
                        <div className="rs-actions">
                          <button
                            type="button"
                            className="rs-btn rs-btn-ghost rs-btn-sm"
                            title={soloLectura ? 'Ver' : 'Editar'}
                            onClick={() =>
                              setModalFaq({ open: true, mode: soloLectura ? 'view' : 'edit', item: p })
                            }
                          >
                            {soloLectura ? '👁️' : '✏️'}
                          </button>
                          {!soloLectura && (
                            <button type="button" className="rs-btn rs-btn-danger rs-btn-sm" onClick={() => eliminarFaq(p)}>
                              🗑️
                            </button>
                          )}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ))
          )}
        </>
      )}

      {subTab === 'categorias' && (
        <>
          {!soloLectura && (
            <div style={{ marginBottom: '0.75rem' }}>
              <button
                type="button"
                className="rs-btn rs-btn-primary rs-btn-sm"
                onClick={() =>
                  setModalCat({
                    open: true,
                    mode: 'create',
                    item: { codigo: '', etiqueta: '', orden: (categorias[categorias.length - 1]?.orden || 0) + 1, activo: 1 },
                  })
                }
              >
                ➕ Nueva categoría
              </button>
            </div>
          )}
          <div className="rs-table-wrap">
            <table className="rs-table">
              <thead>
                <tr>
                  <th>Orden</th>
                  <th>Código</th>
                  <th>Etiqueta</th>
                  <th>Preguntas</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {categorias.map((c) => (
                  <tr key={c.id}>
                    <td>{c.orden}</td>
                    <td>{c.codigo}</td>
                    <td className="rs-nombre">{c.etiqueta}</td>
                    <td>{c.total_faqs ?? '—'}</td>
                    <td>
                      <span className={`rs-badge ${esActivo(c.activo) ? 'rs-badge--ok' : 'rs-badge--off'}`}>
                        {esActivo(c.activo) ? 'Activa' : 'Inactiva'}
                      </span>
                    </td>
                    <td>
                      <div className="rs-actions">
                        <button
                          type="button"
                          className="rs-btn rs-btn-ghost rs-btn-sm"
                          title={soloLectura ? 'Ver' : 'Editar'}
                          onClick={() =>
                            setModalCat({ open: true, mode: soloLectura ? 'view' : 'edit', item: c })
                          }
                        >
                          {soloLectura ? '👁️' : '✏️'}
                        </button>
                        {!soloLectura && (
                          <button type="button" className="rs-btn rs-btn-danger rs-btn-sm" onClick={() => eliminarCat(c)}>
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
          <p className="rs-muted" style={{ marginTop: '0.75rem' }}>
            Si una categoría tiene preguntas, no se puede borrar (FK). Desactívela para ocultarla en la web.
          </p>
        </>
      )}

      {subTab === 'preview' && (
        <div>
          <p className="rs-muted" style={{ marginBottom: '1rem' }}>
            Vista agrupada como en la web pública (solo activos).
          </p>
          {preview.length === 0 ? (
            <p className="rs-empty">No hay categorías/preguntas activas.</p>
          ) : (
            preview.map((g) => (
              <div key={g.id} className="rs-detail-block" style={{ marginBottom: '1.25rem' }}>
                <h3 style={{ textAlign: 'center', letterSpacing: '0.06em', marginBottom: '0.85rem' }}>{g.etiqueta}</h3>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                    gap: '0.75rem',
                  }}
                >
                  {(g.preguntas || []).map((p) => (
                    <details
                      key={p.id}
                      style={{
                        border: '1px solid #e2e8f0',
                        borderRadius: 10,
                        padding: '0.65rem 0.85rem',
                        background: '#fff',
                      }}
                    >
                      <summary style={{ fontWeight: 700, cursor: 'pointer' }}>{p.pregunta}</summary>
                      <p style={{ whiteSpace: 'pre-line', margin: '0.65rem 0 0', color: '#334155' }}>{p.respuesta}</p>
                    </details>
                  ))}
                </div>
                {!g.preguntas?.length && <p className="rs-muted">Sin preguntas activas en esta categoría.</p>}
              </div>
            ))
          )}
        </div>
      )}

      {modalCat.open && (
        <CatModal
          mode={modalCat.mode}
          item={modalCat.item}
          saving={saving}
          onClose={() => setModalCat({ open: false, mode: 'create', item: null })}
          onSave={async (payload) => {
            try {
              setSaving(true);
              if (modalCat.mode === 'edit' && modalCat.item?.id) {
                await api.put(`${API}/categorias/${modalCat.item.id}`, payload);
              } else {
                await api.post(`${API}/categorias`, payload);
              }
              setModalCat({ open: false, mode: 'create', item: null });
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

      {modalFaq.open && (
        <FaqModal
          mode={modalFaq.mode}
          item={modalFaq.item}
          categorias={categorias}
          saving={saving}
          onClose={() => setModalFaq({ open: false, mode: 'create', item: null })}
          onSave={async (payload) => {
            try {
              setSaving(true);
              if (modalFaq.mode === 'edit' && modalFaq.item?.id) {
                await api.put(`${API}/preguntas/${modalFaq.item.id}`, payload);
              } else {
                await api.post(`${API}/preguntas`, payload);
              }
              setModalFaq({ open: false, mode: 'create', item: null });
              await cargarPreguntas();
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

function CatModal({ mode, item, saving, onClose, onSave }) {
  const [form, setForm] = useState(() => ({
    codigo: item?.codigo || '',
    etiqueta: item?.etiqueta || '',
    orden: item?.orden ?? 0,
    activo: esActivo(item?.activo ?? 1),
  }));
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const soloVer = mode === 'view';

  return (
    <Overlay
      title={soloVer ? '👁️ Ver categoría' : mode === 'edit' ? '✏️ Editar categoría' : '➕ Nueva categoría'}
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
                  codigo: form.codigo,
                  etiqueta: form.etiqueta,
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
          <label>Código (slug) *</label>
          <input
            value={form.codigo}
            onChange={(e) => set('codigo', e.target.value)}
            placeholder="admision-y-matricula"
          />
        </div>
        <div className="rs-field">
          <label>Etiqueta visible *</label>
          <input
            value={form.etiqueta}
            onChange={(e) => set('etiqueta', e.target.value)}
            placeholder="ADMISIÓN Y MATRÍCULA"
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
              Activa en la web
            </label>
          </div>
        </div>
      </div>
      </fieldset>
    </Overlay>
  );
}

function FaqModal({ mode, item, categorias, saving, onClose, onSave }) {
  const [form, setForm] = useState(() => ({
    categoria_id: item?.categoria_id || categorias[0]?.id || '',
    pregunta: item?.pregunta || '',
    respuesta: item?.respuesta || '',
    pagina_nivel: item?.pagina_nivel || 'todos',
    orden: item?.orden ?? 0,
    activo: esActivo(item?.activo ?? 1),
  }));
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const soloVer = mode === 'view';

  return (
    <Overlay
      title={soloVer ? '👁️ Ver pregunta' : mode === 'edit' ? '✏️ Editar pregunta' : '➕ Nueva pregunta'}
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
                  categoria_id: Number(form.categoria_id),
                  pregunta: form.pregunta,
                  respuesta: form.respuesta,
                  pagina_nivel: form.pagina_nivel,
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
        <div className="rs-field rs-field--full">
          <label>Categoría *</label>
          <select value={form.categoria_id} onChange={(e) => set('categoria_id', e.target.value)}>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.etiqueta}
              </option>
            ))}
          </select>
        </div>
        <div className="rs-field">
          <label>Página de nivel *</label>
          <select value={form.pagina_nivel} onChange={(e) => set('pagina_nivel', e.target.value)}>
            {PAGINA_NIVELES.map((n) => (
              <option key={n.id} value={n.id}>
                {n.label}
              </option>
            ))}
          </select>
          <p className="rs-muted" style={{ margin: '0.35rem 0 0' }}>
            Todos los niveles: sale en Inicial, Primaria y Secundaria. Si elige uno, solo en esa página (también
            aparece en Preguntas frecuentes).
          </p>
        </div>
        <div className="rs-field rs-field--full">
          <label>Pregunta *</label>
          <input value={form.pregunta} onChange={(e) => set('pregunta', e.target.value)} />
        </div>
        <div className="rs-field rs-field--full">
          <label>Respuesta * (Enter = salto de línea)</label>
          <textarea rows={6} value={form.respuesta} onChange={(e) => set('respuesta', e.target.value)} />
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
              Activa en la web
            </label>
          </div>
        </div>
      </div>
      </fieldset>
    </Overlay>
  );
}
