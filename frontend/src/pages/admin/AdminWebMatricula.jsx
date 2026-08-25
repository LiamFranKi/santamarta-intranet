import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Swal from 'sweetalert2';
import api from '../../services/api';

const API_WEB = '/admin/reclamos-sugerencias';

const swalOpts = {
  target: document.body,
  customClass: { container: 'rs-swal-over-modal' },
  didOpen: (popup) => {
    const root = popup?.closest?.('.swal2-container');
    if (root) root.style.setProperty('z-index', '250000', 'important');
  },
};

function esCategoriaMatricula(nombre) {
  const n = String(nombre || '')
    .toUpperCase()
    .trim();
  return n.includes('MATRICUL') || n === 'MATRICULA';
}

function htmlATextoPlano(html) {
  const t = String(html ?? '').trim();
  if (!t) return '';
  if (!/<[a-z]/i.test(t)) return t;
  return t
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function baseArchivoUrl(rutaRelativa) {
  if (!rutaRelativa) return '';
  const base = (api.defaults.baseURL || '').replace(/\/api\/?$/, '');
  const p = rutaRelativa.startsWith('/') ? rutaRelativa : `/${rutaRelativa}`;
  return `${base}${p}`;
}

function Overlay({ title, onClose, children, footer }) {
  return createPortal(
    <div className="rs-overlay" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="rs-modal" role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
        <div className="rs-modal-header">
          <div>
            <h2>{title}</h2>
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

/**
 * Gestión unificada de Matrícula online en el menú Web:
 * habilitar formulario, intros opcionales de correo, documentos a aceptar.
 * Destinatarios: Correos de envío → canal Matrícula.
 */
export default function AdminWebMatricula({ onOpenCorreos }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    enable_enrollment_form: 'NO',
    remitente_emails: '',
    email_matricula_apoderado: '',
    email_matricula_interno: '',
    email_matricula_interno_asunto: '',
  });
  const [categoriaId, setCategoriaId] = useState(null);
  const [docs, setDocs] = useState([]);
  const [modalDoc, setModalDoc] = useState(false);
  const [docEdit, setDocEdit] = useState(null);
  const [docForm, setDocForm] = useState({ titulo: '', fecha_publicacion: '', fecha_vencimiento: '' });
  const [archivo, setArchivo] = useState(null);

  const asegurarCategoriaYDocs = useCallback(async () => {
    const { data } = await api.get('/admin/institucional/categorias');
    const cats = data.categorias || [];
    let cat = cats.find((c) => esCategoriaMatricula(c.nombre));
    if (!cat) {
      const created = await api.post('/admin/institucional/categorias', {
        nombre: 'Matrícula',
        descripcion: 'Documentos que el apoderado debe aceptar en matrícula online',
        orden: 0,
      });
      const id = created.data?.id;
      if (id) {
        setCategoriaId(id);
        setDocs([]);
        return id;
      }
      const again = await api.get('/admin/institucional/categorias');
      cat = (again.data.categorias || []).find((c) => esCategoriaMatricula(c.nombre));
    }
    const id = cat?.id || null;
    setCategoriaId(id);
    if (id) {
      const dRes = await api.get('/admin/institucional/documentos', { params: { categoria_id: id } });
      setDocs(dRes.data.documentos || []);
    } else {
      setDocs([]);
    }
    return id;
  }, []);

  const cargar = useCallback(async () => {
    try {
      setLoading(true);
      // Migra en silencio los correos que estaban en Configuración → canal Matrícula
      try {
        await api.post(`${API_WEB}/matricula-online/sync-correos-legacy`);
      } catch (syncErr) {
        console.warn('[web-matricula] sync correos:', syncErr.response?.data?.error || syncErr.message);
      }
      const { data } = await api.get('/admin/configuracion');
      setForm({
        enable_enrollment_form: data.enable_enrollment_form || 'NO',
        remitente_emails: data.remitente_emails || '',
        email_matricula_apoderado: htmlATextoPlano(data.email_matricula_apoderado || ''),
        email_matricula_interno: htmlATextoPlano(data.email_matricula_interno || ''),
        email_matricula_interno_asunto: data.email_matricula_interno_asunto || '',
      });
      await asegurarCategoriaYDocs();
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: e.response?.data?.error || 'No se pudo cargar matrícula online',
        ...swalOpts,
      });
    } finally {
      setLoading(false);
    }
  }, [asegurarCategoriaYDocs]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const guardarConfig = async () => {
    try {
      setSaving(true);
      const fd = new FormData();
      fd.append('enable_enrollment_form', form.enable_enrollment_form);
      fd.append('remitente_emails', form.remitente_emails);
      fd.append('email_matricula_apoderado', form.email_matricula_apoderado);
      fd.append('email_matricula_interno', form.email_matricula_interno);
      fd.append('email_matricula_interno_asunto', form.email_matricula_interno_asunto);
      await api.put('/admin/configuracion', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      await Swal.fire({
        icon: 'success',
        title: 'Guardado',
        timer: 1500,
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
  };

  const abrirDoc = (doc = null) => {
    setDocEdit(doc);
    setArchivo(null);
    setDocForm(
      doc
        ? {
            titulo: doc.titulo || '',
            fecha_publicacion: doc.fecha_publicacion ? String(doc.fecha_publicacion).slice(0, 10) : '',
            fecha_vencimiento: doc.fecha_vencimiento ? String(doc.fecha_vencimiento).slice(0, 10) : '',
          }
        : { titulo: '', fecha_publicacion: '', fecha_vencimiento: '' }
    );
    setModalDoc(true);
  };

  const guardarDoc = async () => {
    if (!docForm.titulo.trim()) {
      Swal.fire({ icon: 'warning', title: 'Título requerido', ...swalOpts });
      return;
    }
    let catId = categoriaId;
    if (!catId) {
      catId = await asegurarCategoriaYDocs();
    }
    if (!catId) {
      Swal.fire({ icon: 'error', title: 'No hay categoría Matrícula', ...swalOpts });
      return;
    }
    if (!docEdit && !archivo) {
      Swal.fire({ icon: 'warning', title: 'Suba un PDF', ...swalOpts });
      return;
    }
    try {
      const fd = new FormData();
      fd.append('titulo', docForm.titulo.trim());
      fd.append('categoria_id', String(catId));
      if (docForm.fecha_publicacion) fd.append('fecha_publicacion', docForm.fecha_publicacion);
      if (docForm.fecha_vencimiento) fd.append('fecha_vencimiento', docForm.fecha_vencimiento);
      if (archivo) fd.append('archivo', archivo);
      if (docEdit?.id) {
        await api.put(`/admin/institucional/documentos/${docEdit.id}`, fd);
      } else {
        await api.post('/admin/institucional/documentos', fd);
      }
      setModalDoc(false);
      await asegurarCategoriaYDocs();
      Swal.fire({ icon: 'success', title: 'Documento guardado', timer: 1400, showConfirmButton: false, ...swalOpts });
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: e.response?.data?.error || 'No se pudo guardar el documento',
        ...swalOpts,
      });
    }
  };

  const eliminarDoc = async (doc) => {
    const conf = await Swal.fire({
      icon: 'warning',
      title: '¿Eliminar documento?',
      text: doc.titulo,
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#b91c1c',
      ...swalOpts,
    });
    if (!conf.isConfirmed) return;
    try {
      await api.delete(`/admin/institucional/documentos/${doc.id}`);
      await asegurarCategoriaYDocs();
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: e.response?.data?.error || 'No se pudo eliminar',
        ...swalOpts,
      });
    }
  };

  if (loading) {
    return <p className="rs-loading">Cargando matrícula online…</p>;
  }

  return (
    <div className="rs-matricula-panel">
      <section className="rs-card" style={{ marginBottom: '1.25rem' }}>
        <h3 style={{ margin: '0 0 0.35rem' }}>Formulario público</h3>
        <p className="rs-muted" style={{ marginTop: 0 }}>
          Ruta: <strong>/matricula_online</strong>. Al enviar se crea matrícula <strong>Temporal</strong>. El año
          académico se toma de Configuración → Año (Año Matrículas).
        </p>
        <div className="rs-form-grid">
          <div className="rs-field">
            <label>Habilitar formulario</label>
            <select
              value={form.enable_enrollment_form}
              onChange={(e) => setForm((f) => ({ ...f, enable_enrollment_form: e.target.value }))}
            >
              <option value="NO">NO</option>
              <option value="SI">SI</option>
            </select>
          </div>
          <div className="rs-field">
            <label>Nombre remitente (correos)</label>
            <input
              type="text"
              value={form.remitente_emails}
              onChange={(e) => setForm((f) => ({ ...f, remitente_emails: e.target.value }))}
              placeholder="Vanguard Schools"
            />
          </div>
        </div>
      </section>

      <section className="rs-card" style={{ marginBottom: '1.25rem' }}>
        <h3 style={{ margin: '0 0 0.35rem' }}>Correos (diseño del sistema)</h3>
        <p className="rs-muted" style={{ marginTop: 0 }}>
          El sistema arma siempre el correo profesional (logo, campos del estudiante/apoderado, pie). Aquí solo
          puede dejar un <strong>texto intro opcional</strong>; si queda en blanco se usa el mensaje
          predeterminado. Los destinatarios del aviso interno se configuran en{' '}
          <strong>Correos de envío → canal Matrícula</strong> (no en Admisión).
        </p>
        <div className="rs-form-grid">
          <div className="rs-field rs-field--full">
            <label>Intro correo al apoderado (opcional)</label>
            <textarea
              rows={5}
              value={form.email_matricula_apoderado}
              onChange={(e) => setForm((f) => ({ ...f, email_matricula_apoderado: e.target.value }))}
              placeholder={
                'Estimado/a {{nombre_apoderado}},\n\nHemos recibido su pre-matrícula…\n\n(Deje vacío para usar el texto del sistema)'
              }
            />
            <small className="rs-muted">
              Etiquetas: {'{{nombre_apoderado}}'}, {'{{nombre_alumno}}'}, {'{{nivel}}'}, {'{{grado}}'},{' '}
              {'{{anio_matricula}}'}, {'{{fecha_registro}}'}, {'{{colegio}}'}
            </small>
          </div>
          <div className="rs-field rs-field--full">
            <label>Asunto correo interno (opcional)</label>
            <input
              type="text"
              value={form.email_matricula_interno_asunto}
              onChange={(e) => setForm((f) => ({ ...f, email_matricula_interno_asunto: e.target.value }))}
              placeholder="Nueva matrícula online — {{nombre_alumno}} ({{anio_matricula}})"
            />
          </div>
          <div className="rs-field rs-field--full">
            <label>Intro correo interno (opcional)</label>
            <textarea
              rows={3}
              value={form.email_matricula_interno}
              onChange={(e) => setForm((f) => ({ ...f, email_matricula_interno: e.target.value }))}
              placeholder="Nueva pre-matrícula online registrada… (vacío = texto del sistema)"
            />
          </div>
        </div>
        <div className="rs-actions" style={{ marginTop: '0.85rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <button type="button" className="rs-btn rs-btn-primary" onClick={guardarConfig} disabled={saving}>
            {saving ? 'Guardando…' : '💾 Guardar configuración'}
          </button>
          {typeof onOpenCorreos === 'function' && (
            <button type="button" className="rs-btn rs-btn-light" onClick={onOpenCorreos}>
              📧 Correos de envío
            </button>
          )}
        </div>
        <p className="rs-muted" style={{ marginTop: '0.75rem', marginBottom: 0 }}>
          Los avisos internos llegan a quienes tengan el canal <strong>Matrícula</strong> activo en Correos de
          envío. Si antes tenía correos en Configuración, el sistema los pasa solo a ese canal al abrir esta
          pantalla (o al enviarse una pre-matrícula).
        </p>
      </section>

      <section className="rs-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ margin: '0 0 0.35rem' }}>Documentos a aceptar</h3>
            <p className="rs-muted" style={{ margin: 0 }}>
              PDF que el apoderado debe marcar en el formulario. Gestionados aquí (ocultos en Institucional).
            </p>
          </div>
          <button type="button" className="rs-btn rs-btn-primary" onClick={() => abrirDoc(null)}>
            ➕ Nuevo documento
          </button>
        </div>

        {docs.length === 0 ? (
          <p className="rs-empty" style={{ marginTop: '1rem' }}>
            No hay documentos. Agregue al menos uno si el formulario debe exigir aceptación.
          </p>
        ) : (
          <div className="rs-table-wrap" style={{ marginTop: '1rem' }}>
            <table className="rs-table">
              <thead>
                <tr>
                  <th>Título</th>
                  <th>Archivo</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {docs.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <div className="rs-nombre">{d.titulo}</div>
                    </td>
                    <td>
                      <a href={baseArchivoUrl(d.archivo_url)} target="_blank" rel="noopener noreferrer">
                        {d.nombre_archivo_original || 'Ver PDF'}
                      </a>
                    </td>
                    <td>
                      <div className="rs-actions">
                        <button type="button" className="rs-btn rs-btn-ghost rs-btn-sm" onClick={() => abrirDoc(d)}>
                          ✏️
                        </button>
                        <button
                          type="button"
                          className="rs-btn rs-btn-danger rs-btn-sm"
                          onClick={() => eliminarDoc(d)}
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
      </section>

      {modalDoc && (
        <Overlay
          title={docEdit ? 'Editar documento' : 'Nuevo documento'}
          onClose={() => setModalDoc(false)}
          footer={
            <>
              <button type="button" className="rs-btn rs-btn-ghost" onClick={() => setModalDoc(false)}>
                Cancelar
              </button>
              <button type="button" className="rs-btn rs-btn-primary" onClick={guardarDoc}>
                Guardar
              </button>
            </>
          }
        >
          <div className="rs-form-grid">
            <div className="rs-field rs-field--full">
              <label>Título *</label>
              <input
                type="text"
                value={docForm.titulo}
                onChange={(e) => setDocForm((f) => ({ ...f, titulo: e.target.value }))}
              />
            </div>
            <div className="rs-field">
              <label>Fecha publicación</label>
              <input
                type="date"
                value={docForm.fecha_publicacion}
                onChange={(e) => setDocForm((f) => ({ ...f, fecha_publicacion: e.target.value }))}
              />
            </div>
            <div className="rs-field">
              <label>Fecha vencimiento</label>
              <input
                type="date"
                value={docForm.fecha_vencimiento}
                onChange={(e) => setDocForm((f) => ({ ...f, fecha_vencimiento: e.target.value }))}
              />
            </div>
            <div className="rs-field rs-field--full">
              <label>PDF {docEdit ? '(opcional si no cambia)' : '*'}</label>
              <input type="file" accept="application/pdf,.pdf" onChange={(e) => setArchivo(e.target.files?.[0] || null)} />
            </div>
          </div>
        </Overlay>
      )}
    </div>
  );
}
