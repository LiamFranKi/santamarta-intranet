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

export default function AlumnoPerfilExtra() {
  const [contactos, setContactos] = useState([]);
  const [documentos, setDocumentos] = useState([]);
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
        api.get('/alumno/perfil/contactos-emergencia'),
        api.get('/alumno/perfil/documentos')
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
    cargar();
  }, []);

  const guardarContactos = async () => {
    try {
      setSaving(true);
      const { data } = await api.put('/alumno/perfil/contactos-emergencia', { contactos });
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
      const { data } = await api.post('/alumno/perfil/documentos', fd, {
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
      await api.delete(`/alumno/perfil/documentos/${id}`);
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
          <button
            type="button"
            className="pcv-btn-ghost"
            onClick={() => setContactos((p) => [...p, emptyContacto()])}
          >
            + Añadir
          </button>
        </div>
        {contactos.length === 0 && (
          <p className="pcv-empty">Agregá un contacto adicional por si hay una emergencia.</p>
        )}
        {contactos.map((row, i) => (
          <div className="pcv-row" key={`c-${i}`}>
            <input
              placeholder="Nombres"
              value={row.nombres || ''}
              onChange={(e) => {
                const v = e.target.value;
                setContactos((p) => p.map((x, idx) => (idx === i ? { ...x, nombres: v } : x)));
              }}
            />
            <input
              placeholder="Parentesco"
              value={row.parentesco || ''}
              onChange={(e) => {
                const v = e.target.value;
                setContactos((p) => p.map((x, idx) => (idx === i ? { ...x, parentesco: v } : x)));
              }}
            />
            <input
              placeholder="Teléfono"
              value={row.telefono || ''}
              onChange={(e) => {
                const v = e.target.value;
                setContactos((p) => p.map((x, idx) => (idx === i ? { ...x, telefono: v } : x)));
              }}
            />
            <input
              placeholder="Email"
              value={row.email || ''}
              onChange={(e) => {
                const v = e.target.value;
                setContactos((p) => p.map((x, idx) => (idx === i ? { ...x, email: v } : x)));
              }}
            />
            <label className="pcv-check">
              <input
                type="checkbox"
                checked={!!row.es_principal}
                onChange={(e) => {
                  const v = e.target.checked;
                  setContactos((p) =>
                    p.map((x, idx) => ({
                      ...x,
                      es_principal: idx === i ? v : v ? false : x.es_principal
                    }))
                  );
                }}
              />
              Principal
            </label>
            <button
              type="button"
              className="pcv-btn-danger"
              onClick={() => setContactos((p) => p.filter((_, idx) => idx !== i))}
            >
              Quitar
            </button>
          </div>
        ))}
        <button type="button" className="pcv-btn-primary" disabled={saving} onClick={guardarContactos}>
          {saving ? 'Guardando…' : 'Guardar contactos'}
        </button>
      </section>

      <section className="pcv-block">
        <div className="pcv-block-head">
          <h3>Documentos (vacunas / certificados)</h3>
        </div>
        <div className="pcv-upload-bar">
          <input
            placeholder="Título"
            value={docMeta.titulo}
            onChange={(e) => setDocMeta((p) => ({ ...p, titulo: e.target.value }))}
          />
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
          <label className={`pcv-btn-primary pcv-file-label${uploading ? ' is-busy' : ''}`}>
            {uploading ? 'Subiendo…' : 'Subir PDF'}
            <input type="file" accept="application/pdf,.pdf" hidden disabled={uploading} onChange={subirDoc} />
          </label>
        </div>
        {documentos.length === 0 && <p className="pcv-empty">Sin documentos cargados.</p>}
        <ul className="pcv-docs">
          {documentos.map((d) => (
            <li key={d.id}>
              <div>
                <strong>{d.titulo || 'Documento'}</strong>
                <span className="pcv-doc-tipo">{d.tipo}</span>
              </div>
              <div className="pcv-doc-actions">
                <a href={d.url} target="_blank" rel="noopener noreferrer">
                  Abrir
                </a>
                <button type="button" className="pcv-btn-danger" onClick={() => eliminarDoc(d.id)}>
                  Eliminar
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
