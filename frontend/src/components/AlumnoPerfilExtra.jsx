import React, { useEffect, useState } from 'react';
import api from '../services/api';
import Swal from 'sweetalert2';
import './PersonalCvEditor.css';

const TIPOS_DOC = [
  { value: 'VACUNA', label: 'Vacuna' },
  { value: 'CERTIFICADO_MEDICO', label: 'Certificado médico' },
  { value: 'OTRO', label: 'Otro' }
];

const emptyContacto = () => ({
  nombres: '',
  parentesco: '',
  telefono: '',
  email: '',
  es_principal: false
});

const labelTipo = (t) => TIPOS_DOC.find((x) => x.value === t)?.label || t || '—';

/**
 * Contactos de emergencia + documentos PDF.
 * @param {{ apiBase: string }} props
 * apiBase ej: `/alumno/perfil` | `/apoderado/hijos/12` | `/admin/usuarios/alumnos/12`
 */
export default function AlumnoPerfilExtra({ apiBase = '/alumno/perfil' }) {
  const [contactos, setContactos] = useState([]);
  const [documentos, setDocumentos] = useState([]);
  const [draft, setDraft] = useState(emptyContacto());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [docMeta, setDocMeta] = useState({ titulo: '', tipo: 'VACUNA' });
  const [uploading, setUploading] = useState(false);

  const toastOk = (msg) =>
    Swal.fire({
      icon: 'success',
      title: msg,
      toast: true,
      position: 'top-end',
      showConfirmButton: false,
      timer: 2200
    });
  const toastErr = (msg) =>
    Swal.fire({
      icon: 'error',
      title: 'Error',
      text: msg,
      toast: true,
      position: 'top-end',
      showConfirmButton: false,
      timer: 3200
    });

  const cargar = async () => {
    try {
      setLoading(true);
      const [cRes, dRes] = await Promise.all([
        api.get(`${apiBase}/contactos-emergencia`),
        api.get(`${apiBase}/documentos`)
      ]);
      setContactos(
        (cRes.data.contactos || []).map((c) => ({
          ...c,
          es_principal: !!c.es_principal
        }))
      );
      setDocumentos(dRes.data.documentos || []);
    } catch (e) {
      console.error(e);
      toastErr(e.response?.data?.error || 'No se pudo cargar datos adicionales');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (apiBase) cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBase]);

  const agregarContacto = () => {
    if (!draft.nombres?.trim() && !draft.telefono?.trim()) {
      toastErr('Completá nombre o teléfono');
      return;
    }
    setContactos((p) => {
      const next = [...p, { ...draft }];
      if (draft.es_principal) {
        return next.map((c, i) => ({ ...c, es_principal: i === next.length - 1 }));
      }
      return next;
    });
    setDraft(emptyContacto());
  };

  const guardarContactos = async () => {
    try {
      setSaving(true);
      const { data } = await api.put(`${apiBase}/contactos-emergencia`, { contactos });
      setContactos(
        (data.contactos || []).map((c) => ({
          ...c,
          es_principal: !!c.es_principal
        }))
      );
      toastOk('Contactos guardados');
    } catch (e) {
      toastErr(e.response?.data?.error || 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  const subirDoc = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) {
      toastErr('Solo PDF');
      return;
    }
    try {
      setUploading(true);
      const fd = new FormData();
      fd.append('archivo', file);
      fd.append('titulo', docMeta.titulo || file.name);
      fd.append('tipo', docMeta.tipo);
      const { data } = await api.post(`${apiBase}/documentos`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setDocumentos((prev) => [data, ...prev]);
      setDocMeta({ titulo: '', tipo: 'VACUNA' });
      toastOk('Documento subido');
    } catch (err) {
      toastErr(err.response?.data?.error || 'No se pudo subir');
    } finally {
      setUploading(false);
    }
  };

  const eliminarDoc = async (id) => {
    const conf = await Swal.fire({
      icon: 'warning',
      title: '¿Eliminar documento?',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    });
    if (!conf.isConfirmed) return;
    try {
      await api.delete(`${apiBase}/documentos/${id}`);
      setDocumentos((prev) => prev.filter((d) => d.id !== id));
      toastOk('Eliminado');
    } catch (err) {
      toastErr(err.response?.data?.error || 'No se pudo eliminar');
    }
  };

  if (loading) return <div className="pcv-loading">Cargando…</div>;

  return (
    <div className="pcv-editor">
      <section className="pcv-block">
        <div className="pcv-block-head">
          <h3>Contactos de emergencia</h3>
        </div>
        <div className="pcv-draft">
          <div className="pcv-draft-grid">
            <div className="pcv-field">
              <label>Nombres</label>
              <input
                value={draft.nombres}
                onChange={(e) => setDraft((p) => ({ ...p, nombres: e.target.value }))}
              />
            </div>
            <div className="pcv-field">
              <label>Parentesco</label>
              <input
                value={draft.parentesco}
                onChange={(e) => setDraft((p) => ({ ...p, parentesco: e.target.value }))}
              />
            </div>
            <div className="pcv-field">
              <label>Teléfono</label>
              <input
                value={draft.telefono}
                onChange={(e) => setDraft((p) => ({ ...p, telefono: e.target.value }))}
              />
            </div>
            <div className="pcv-field">
              <label>Email</label>
              <input
                value={draft.email}
                onChange={(e) => setDraft((p) => ({ ...p, email: e.target.value }))}
              />
            </div>
            <label className="pcv-check pcv-check--draft">
              <input
                type="checkbox"
                checked={!!draft.es_principal}
                onChange={(e) => setDraft((p) => ({ ...p, es_principal: e.target.checked }))}
              />
              Principal
            </label>
          </div>
          <button type="button" className="pcv-btn pcv-btn--add" onClick={agregarContacto}>
            <span className="pcv-btn-ico" aria-hidden="true">
              ➕
            </span>
            Agregar
          </button>
        </div>
        <div className="pcv-table-wrap">
          <table className="pcv-table">
            <thead>
              <tr>
                <th>Nombres</th>
                <th>Parentesco</th>
                <th>Teléfono</th>
                <th>Email</th>
                <th>Principal</th>
                <th className="pcv-th-actions">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {contactos.length === 0 ? (
                <tr>
                  <td colSpan={6} className="pcv-empty-cell">
                    Sin contactos. Completá el formulario y pulsá Agregar.
                  </td>
                </tr>
              ) : (
                contactos.map((row, i) => (
                  <tr key={`c-${i}`}>
                    <td>{row.nombres || '—'}</td>
                    <td>{row.parentesco || '—'}</td>
                    <td>{row.telefono || '—'}</td>
                    <td>{row.email || '—'}</td>
                    <td>{row.es_principal ? 'Sí' : 'No'}</td>
                    <td>
                      <div className="pcv-td-actions">
                        <button
                          type="button"
                          className="pcv-btn pcv-btn--danger pcv-btn--sm"
                          onClick={() => setContactos((p) => p.filter((_, idx) => idx !== i))}
                        >
                          <span className="pcv-btn-ico" aria-hidden="true">
                            🗑️
                          </span>
                          Quitar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <button type="button" className="pcv-btn pcv-btn--primary" disabled={saving} onClick={guardarContactos}>
          <span className="pcv-btn-ico" aria-hidden="true">
            💾
          </span>
          {saving ? 'Guardando…' : 'Guardar contactos'}
        </button>
      </section>

      <section className="pcv-block">
        <div className="pcv-block-head">
          <h3>Documentos (vacunas / certificados)</h3>
        </div>
        <div className="pcv-draft">
          <div className="pcv-draft-grid pcv-draft-grid--doc">
            <div className="pcv-field">
              <label>Título</label>
              <input
                value={docMeta.titulo}
                onChange={(e) => setDocMeta((p) => ({ ...p, titulo: e.target.value }))}
              />
            </div>
            <div className="pcv-field">
              <label>Tipo</label>
              <select
                value={docMeta.tipo}
                onChange={(e) => setDocMeta((p) => ({ ...p, tipo: e.target.value }))}
              >
                {TIPOS_DOC.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <label className={`pcv-btn pcv-btn--add${uploading ? ' is-busy' : ''}`}>
            <span className="pcv-btn-ico" aria-hidden="true">
              📄
            </span>
            {uploading ? 'Subiendo…' : 'Subir PDF'}
            <input type="file" accept="application/pdf,.pdf" hidden disabled={uploading} onChange={subirDoc} />
          </label>
        </div>
        <div className="pcv-table-wrap">
          <table className="pcv-table">
            <thead>
              <tr>
                <th>Título</th>
                <th>Tipo</th>
                <th className="pcv-th-actions">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {documentos.length === 0 ? (
                <tr>
                  <td colSpan={3} className="pcv-empty-cell">
                    Sin documentos. Subí un PDF arriba.
                  </td>
                </tr>
              ) : (
                documentos.map((d) => (
                  <tr key={d.id}>
                    <td>{d.titulo || 'Documento'}</td>
                    <td>
                      <span className="pcv-badge">{labelTipo(d.tipo)}</span>
                    </td>
                    <td>
                      <div className="pcv-td-actions">
                        <a
                          className="pcv-btn pcv-btn--ghost pcv-btn--sm"
                          href={d.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <span className="pcv-btn-ico" aria-hidden="true">
                            👁️
                          </span>
                          Abrir
                        </a>
                        <button
                          type="button"
                          className="pcv-btn pcv-btn--danger pcv-btn--sm"
                          onClick={() => eliminarDoc(d.id)}
                        >
                          <span className="pcv-btn-ico" aria-hidden="true">
                            🗑️
                          </span>
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
