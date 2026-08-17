import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Swal from 'sweetalert2';
import api from '../../services/api';

const API = '/admin/documentos-web';

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

async function abrirPdfApi(apiPath, ruta) {
  try {
    const res = await api.get(apiPath, { params: { ruta }, responseType: 'blob' });
    const blob = new Blob([res.data], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener,noreferrer');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (e) {
    Swal.fire({
      icon: 'error',
      title: 'No se pudo abrir el PDF',
      text: e.response?.data?.error || 'Verifique que el archivo exista en web-vanguard/public',
      ...swalOpts,
    });
  }
}

function PdfOpenButton({ onClick, title }) {
  return (
    <button type="button" className="rs-pdf-open" onClick={onClick} title={title || 'Abrir PDF'}>
      <span className="rs-pdf-open__icon" aria-hidden>
        📄
      </span>
      <span className="rs-pdf-open__label">PDF</span>
    </button>
  );
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

export default function AdminWebDocumentos() {
  const [subTab, setSubTab] = useState('documentos');
  const [categorias, setCategorias] = useState([]);
  const [documentos, setDocumentos] = useState([]);
  const [preview, setPreview] = useState([]);
  const [catFiltro, setCatFiltro] = useState('');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [modalCat, setModalCat] = useState({ open: false, mode: 'create', item: null });
  const [modalDoc, setModalDoc] = useState({ open: false, mode: 'create', item: null });

  const cargarCategorias = useCallback(async () => {
    const { data } = await api.get(`${API}/categorias`);
    setCategorias(data.categorias || []);
  }, []);

  const cargarDocumentos = useCallback(async () => {
    const params = {};
    if (catFiltro) params.categoria_id = catFiltro;
    if (q.trim()) params.q = q.trim();
    const { data } = await api.get(`${API}/items`, { params });
    setDocumentos(data.documentos || []);
  }, [catFiltro, q]);

  const cargarPreview = useCallback(async () => {
    const { data } = await api.get(`${API}/preview`);
    setPreview(data.grupos || []);
  }, []);

  const cargar = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      await cargarCategorias();
      if (subTab === 'documentos') await cargarDocumentos();
      if (subTab === 'preview') await cargarPreview();
    } catch (e) {
      setError(e.response?.data?.error || 'Error al cargar documentos');
    } finally {
      setLoading(false);
    }
  }, [subTab, cargarCategorias, cargarDocumentos, cargarPreview]);

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

  const eliminarDoc = async (row) => {
    const conf = await Swal.fire({
      icon: 'warning',
      title: '¿Eliminar documento?',
      text: `${row.nombre} — también puede borrar el PDF en disco`,
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#b91c1c',
      ...swalOpts,
    });
    if (!conf.isConfirmed) return;
    try {
      await api.delete(`${API}/items/${row.id}`);
      await cargarDocumentos();
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
    for (const d of documentos) {
      const key = d.categoria_id;
      if (!map[key]) {
        map[key] = {
          id: key,
          etiqueta: d.categoria_etiqueta,
          orden: d.categoria_orden,
          items: [],
        };
      }
      map[key].items.push(d);
    }
    return Object.values(map).sort((a, b) => (a.orden || 0) - (b.orden || 0));
  }, [documentos]);

  if (loading && !categorias.length) return <p className="rs-loading">Cargando documentos…</p>;
  if (error) return <p className="rs-error">{error}</p>;

  return (
    <div>
      <nav className="rs-tabs" aria-label="Documentos internas" style={{ marginBottom: '1rem' }}>
        {[
          { id: 'documentos', label: '📄 Documentos' },
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

      {subTab === 'documentos' && (
        <>
          <div className="rs-toolbar" style={{ marginTop: 0 }}>
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
              <label>Buscar</label>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre, código, archivo…" />
            </div>
            <button type="button" className="rs-btn rs-btn-primary" onClick={cargarDocumentos}>
              Filtrar
            </button>
            <button
              type="button"
              className="rs-btn rs-btn-primary"
              onClick={() =>
                setModalDoc({
                  open: true,
                  mode: 'create',
                  item: {
                    categoria_id: catFiltro || categorias[0]?.id,
                    codigo: '',
                    nombre: '',
                    tipo: 'PDF',
                    archivo: '',
                    ruta: '',
                    orden: (documentos[documentos.length - 1]?.orden || 0) + 1,
                    activo: 1,
                  },
                })
              }
            >
              ➕ Nuevo documento
            </button>
          </div>
          <p className="rs-muted" style={{ marginBottom: '0.75rem' }}>
            Los PDF se guardan en web-vanguard/public/documentos/ y la ruta en BD queda /documentos/archivo.pdf
          </p>

          {documentos.length === 0 ? (
            <p className="rs-empty">No hay documentos con esos filtros.</p>
          ) : (
            agrupados.map((g) => (
              <div key={g.id} className="rs-detail-block" style={{ marginBottom: '1rem' }}>
                <h3 style={{ textAlign: 'center' }}>{g.etiqueta}</h3>
                <div className="rs-table-wrap">
                  <table className="rs-table">
                    <thead>
                      <tr>
                        <th>Orden</th>
                        <th>Código</th>
                        <th>Nombre</th>
                        <th>Tipo</th>
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
                          <td>{row.tipo}</td>
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
                                onClick={() => setModalDoc({ open: true, mode: 'edit', item: row })}
                              >
                                ✏️
                              </button>
                              <button type="button" className="rs-btn rs-btn-danger rs-btn-sm" onClick={() => eliminarDoc(row)}>
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

      {subTab === 'categorias' && (
        <>
          <div style={{ marginBottom: '0.75rem' }}>
            <button
              type="button"
              className="rs-btn rs-btn-primary rs-btn-sm"
              onClick={() =>
                setModalCat({
                  open: true,
                  mode: 'create',
                  item: {
                    codigo: '',
                    etiqueta: '',
                    orden: (categorias[categorias.length - 1]?.orden || 0) + 1,
                    activo: 1,
                  },
                })
              }
            >
              ➕ Nueva categoría
            </button>
          </div>
          <div className="rs-table-wrap">
            <table className="rs-table">
              <thead>
                <tr>
                  <th>Orden</th>
                  <th>Código</th>
                  <th>Etiqueta</th>
                  <th>Docs</th>
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
                    <td>{c.total_docs ?? '—'}</td>
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
                          onClick={() => setModalCat({ open: true, mode: 'edit', item: c })}
                        >
                          ✏️
                        </button>
                        <button type="button" className="rs-btn rs-btn-danger rs-btn-sm" onClick={() => eliminarCat(c)}>
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
            Si una categoría tiene documentos, no se puede borrar (FK). Desactívela para ocultarla en la web.
          </p>
        </>
      )}

      {subTab === 'preview' && (
        <div>
          <p className="rs-muted" style={{ marginBottom: '1rem' }}>
            Vista agrupada como en /documentos (solo activos). Clic en el icono PDF para abrir.
          </p>
          {preview.length === 0 ? (
            <p className="rs-empty">No hay categorías/documentos activos.</p>
          ) : (
            preview.map((g) => (
              <div key={g.id} className="rs-detail-block" style={{ marginBottom: '1.25rem' }}>
                <h3 style={{ textAlign: 'center', marginBottom: '1rem' }}>{g.etiqueta}</h3>
                <div className="rs-preview-grid">
                  {(g.documentos || []).map((d) => (
                    <div key={d.id} className="rs-pdf-card">
                      <div className="rs-pdf-card__body">
                        <p className="rs-pdf-card__title">{d.nombre}</p>
                        <p className="rs-pdf-card__hint">{d.tipo || 'PDF'} · Abrir archivo</p>
                      </div>
                      <PdfOpenButton
                        title={`Abrir ${d.archivo || d.nombre}`}
                        onClick={() => abrirPdfApi(`${API}/archivo`, d.ruta)}
                      />
                    </div>
                  ))}
                </div>
                {!g.documentos?.length && <p className="rs-muted">Sin documentos activos.</p>}
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

      {modalDoc.open && (
        <DocModal
          mode={modalDoc.mode}
          item={modalDoc.item}
          categorias={categorias}
          saving={saving}
          onClose={() => setModalDoc({ open: false, mode: 'create', item: null })}
          onSave={async (payload, file) => {
            try {
              setSaving(true);
              const fd = buildFormData(payload, file);
              if (modalDoc.mode === 'edit' && modalDoc.item?.id) {
                await api.put(`${API}/items/${modalDoc.item.id}`, fd);
              } else {
                await api.post(`${API}/items`, fd);
              }
              setModalDoc({ open: false, mode: 'create', item: null });
              await cargarDocumentos();
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

  return (
    <Overlay
      title={mode === 'edit' ? '✏️ Editar categoría' : '➕ Nueva categoría'}
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
                etiqueta: form.etiqueta,
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
          <input value={form.codigo} onChange={(e) => set('codigo', e.target.value)} placeholder="admision" />
        </div>
        <div className="rs-field">
          <label>Etiqueta *</label>
          <input value={form.etiqueta} onChange={(e) => set('etiqueta', e.target.value)} placeholder="Admisión" />
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
    </Overlay>
  );
}

function DocModal({ mode, item, categorias, saving, onClose, onSave }) {
  const [form, setForm] = useState(() => ({
    categoria_id: item?.categoria_id || categorias[0]?.id || '',
    codigo: item?.codigo || '',
    nombre: item?.nombre || '',
    tipo: item?.tipo || 'PDF',
    archivo: item?.archivo || '',
    ruta: item?.ruta || '',
    orden: item?.orden ?? 0,
    activo: esActivo(item?.activo ?? 1),
  }));
  const [file, setFile] = useState(null);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Overlay
      title={mode === 'edit' ? '✏️ Editar documento' : '➕ Nuevo documento'}
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
                  categoria_id: Number(form.categoria_id),
                  codigo: form.codigo,
                  nombre: form.nombre,
                  tipo: form.tipo,
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
          <label>Código *</label>
          <input
            value={form.codigo}
            onChange={(e) => set('codigo', e.target.value)}
            placeholder="proceso-admision-2026"
          />
        </div>
        <div className="rs-field">
          <label>Tipo</label>
          <input value={form.tipo} onChange={(e) => set('tipo', e.target.value)} placeholder="PDF" />
        </div>
        <div className="rs-field rs-field--full">
          <label>Nombre *</label>
          <input value={form.nombre} onChange={(e) => set('nombre', e.target.value)} />
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
          <input value={form.archivo} onChange={(e) => set('archivo', e.target.value)} placeholder="RI2026.pdf" />
        </div>
        <div className="rs-field">
          <label>Ruta pública</label>
          <input
            value={form.ruta}
            onChange={(e) => set('ruta', e.target.value)}
            placeholder="/documentos/RI2026.pdf"
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
