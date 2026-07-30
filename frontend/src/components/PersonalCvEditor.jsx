import React, { useEffect, useState } from 'react';
import api from '../services/api';
import Swal from 'sweetalert2';
import './PersonalCvEditor.css';

const NIVELES_IDIOMA = [
  { value: 'BASICO', label: 'Básico' },
  { value: 'INTERMEDIO', label: 'Intermedio' },
  { value: 'AVANZADO', label: 'Avanzado' },
  { value: 'NATIVO', label: 'Nativo' }
];

const TIPOS_DOC = [
  { value: 'TITULO', label: 'Título' },
  { value: 'CERTIFICADO', label: 'Certificado' },
  { value: 'OTRO', label: 'Otro' }
];

const emptyEstudio = () => ({
  nivel: '',
  institucion: '',
  carrera: '',
  anio_inicio: '',
  anio_fin: '',
  en_curso: false
});

const emptyIdioma = () => ({ idioma: '', nivel: 'BASICO' });

const emptyExp = () => ({
  empresa: '',
  cargo: '',
  fecha_inicio: '',
  fecha_fin: '',
  actual: false,
  descripcion: ''
});

/**
 * @param {{ apiBase: string, compact?: boolean }} props
 * apiBase ej: `/docente/perfil/cv` o `/admin/usuarios/equipo/12/cv`
 */
export default function PersonalCvEditor({ apiBase, compact = false }) {
  const [loading, setLoading] = useState(true);
  const [estudios, setEstudios] = useState([]);
  const [idiomas, setIdiomas] = useState([]);
  const [experiencia, setExperiencia] = useState([]);
  const [documentos, setDocumentos] = useState([]);
  const [saving, setSaving] = useState(null);
  const [docMeta, setDocMeta] = useState({ titulo: '', tipo: 'CERTIFICADO' });
  const [uploadingDoc, setUploadingDoc] = useState(false);

  const cargar = async () => {
    try {
      setLoading(true);
      const { data } = await api.get(apiBase);
      setEstudios(
        (data.estudios || []).map((e) => ({
          ...e,
          anio_inicio: e.anio_inicio || '',
          anio_fin: e.anio_fin || '',
          en_curso: !!e.en_curso
        }))
      );
      setIdiomas(data.idiomas || []);
      setExperiencia(
        (data.experiencia || []).map((x) => ({
          ...x,
          fecha_inicio: x.fecha_inicio
            ? String(x.fecha_inicio).slice(0, 10)
            : '',
          fecha_fin: x.fecha_fin ? String(x.fecha_fin).slice(0, 10) : '',
          actual: !!x.actual
        }))
      );
      setDocumentos(data.documentos || []);
    } catch (e) {
      console.error(e);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: e.response?.data?.error || 'No se pudo cargar el CV',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (apiBase) cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBase]);

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

  const guardarEstudios = async () => {
    try {
      setSaving('estudios');
      const { data } = await api.put(`${apiBase}/estudios`, { estudios });
      setEstudios(
        (data.estudios || []).map((e) => ({
          ...e,
          anio_inicio: e.anio_inicio || '',
          anio_fin: e.anio_fin || '',
          en_curso: !!e.en_curso
        }))
      );
      toastOk('Estudios guardados');
    } catch (e) {
      toastErr(e.response?.data?.error || 'No se pudo guardar');
    } finally {
      setSaving(null);
    }
  };

  const guardarIdiomas = async () => {
    try {
      setSaving('idiomas');
      const { data } = await api.put(`${apiBase}/idiomas`, { idiomas });
      setIdiomas(data.idiomas || []);
      toastOk('Idiomas guardados');
    } catch (e) {
      toastErr(e.response?.data?.error || 'No se pudo guardar');
    } finally {
      setSaving(null);
    }
  };

  const guardarExperiencia = async () => {
    try {
      setSaving('experiencia');
      const { data } = await api.put(`${apiBase}/experiencia`, { experiencia });
      setExperiencia(
        (data.experiencia || []).map((x) => ({
          ...x,
          fecha_inicio: x.fecha_inicio ? String(x.fecha_inicio).slice(0, 10) : '',
          fecha_fin: x.fecha_fin ? String(x.fecha_fin).slice(0, 10) : '',
          actual: !!x.actual
        }))
      );
      toastOk('Experiencia guardada');
    } catch (e) {
      toastErr(e.response?.data?.error || 'No se pudo guardar');
    } finally {
      setSaving(null);
    }
  };

  const subirDocumento = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) {
      toastErr('Solo PDF');
      return;
    }
    try {
      setUploadingDoc(true);
      const fd = new FormData();
      fd.append('archivo', file);
      fd.append('titulo', docMeta.titulo || file.name);
      fd.append('tipo', docMeta.tipo);
      const { data } = await api.post(`${apiBase}/documentos`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setDocumentos((prev) => [data, ...prev]);
      setDocMeta({ titulo: '', tipo: 'CERTIFICADO' });
      toastOk('Documento subido');
    } catch (err) {
      toastErr(err.response?.data?.error || 'No se pudo subir');
    } finally {
      setUploadingDoc(false);
    }
  };

  const eliminarDocumento = async (id) => {
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

  if (loading) {
    return <div className="pcv-loading">Cargando CV…</div>;
  }

  return (
    <div className={`pcv-editor${compact ? ' pcv-editor--compact' : ''}`}>
      <section className="pcv-block">
        <div className="pcv-block-head">
          <h3>Estudios / formación</h3>
          <button type="button" className="pcv-btn-ghost" onClick={() => setEstudios((p) => [...p, emptyEstudio()])}>
            + Añadir
          </button>
        </div>
        {estudios.length === 0 && <p className="pcv-empty">Sin registros. Añadí tu formación académica.</p>}
        {estudios.map((row, i) => (
          <div className="pcv-row" key={`est-${i}`}>
            <input
              placeholder="Nivel (Univ., Técnico…)"
              value={row.nivel || ''}
              onChange={(e) => {
                const v = e.target.value;
                setEstudios((p) => p.map((x, idx) => (idx === i ? { ...x, nivel: v } : x)));
              }}
            />
            <input
              placeholder="Institución"
              value={row.institucion || ''}
              onChange={(e) => {
                const v = e.target.value;
                setEstudios((p) => p.map((x, idx) => (idx === i ? { ...x, institucion: v } : x)));
              }}
            />
            <input
              placeholder="Carrera / especialidad"
              value={row.carrera || ''}
              onChange={(e) => {
                const v = e.target.value;
                setEstudios((p) => p.map((x, idx) => (idx === i ? { ...x, carrera: v } : x)));
              }}
            />
            <input
              type="number"
              placeholder="Año inicio"
              value={row.anio_inicio || ''}
              onChange={(e) => {
                const v = e.target.value;
                setEstudios((p) => p.map((x, idx) => (idx === i ? { ...x, anio_inicio: v } : x)));
              }}
            />
            <input
              type="number"
              placeholder="Año fin"
              disabled={!!row.en_curso}
              value={row.anio_fin || ''}
              onChange={(e) => {
                const v = e.target.value;
                setEstudios((p) => p.map((x, idx) => (idx === i ? { ...x, anio_fin: v } : x)));
              }}
            />
            <label className="pcv-check">
              <input
                type="checkbox"
                checked={!!row.en_curso}
                onChange={(e) => {
                  const v = e.target.checked;
                  setEstudios((p) =>
                    p.map((x, idx) => (idx === i ? { ...x, en_curso: v, anio_fin: v ? '' : x.anio_fin } : x))
                  );
                }}
              />
              En curso
            </label>
            <button
              type="button"
              className="pcv-btn-danger"
              onClick={() => setEstudios((p) => p.filter((_, idx) => idx !== i))}
            >
              Quitar
            </button>
          </div>
        ))}
        <button type="button" className="pcv-btn-primary" disabled={saving === 'estudios'} onClick={guardarEstudios}>
          {saving === 'estudios' ? 'Guardando…' : 'Guardar estudios'}
        </button>
      </section>

      <section className="pcv-block">
        <div className="pcv-block-head">
          <h3>Idiomas</h3>
          <button type="button" className="pcv-btn-ghost" onClick={() => setIdiomas((p) => [...p, emptyIdioma()])}>
            + Añadir
          </button>
        </div>
        {idiomas.length === 0 && <p className="pcv-empty">Sin idiomas registrados.</p>}
        {idiomas.map((row, i) => (
          <div className="pcv-row pcv-row--2" key={`idi-${i}`}>
            <input
              placeholder="Idioma"
              value={row.idioma || ''}
              onChange={(e) => {
                const v = e.target.value;
                setIdiomas((p) => p.map((x, idx) => (idx === i ? { ...x, idioma: v } : x)));
              }}
            />
            <select
              value={row.nivel || 'BASICO'}
              onChange={(e) => {
                const v = e.target.value;
                setIdiomas((p) => p.map((x, idx) => (idx === i ? { ...x, nivel: v } : x)));
              }}
            >
              {NIVELES_IDIOMA.map((n) => (
                <option key={n.value} value={n.value}>
                  {n.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="pcv-btn-danger"
              onClick={() => setIdiomas((p) => p.filter((_, idx) => idx !== i))}
            >
              Quitar
            </button>
          </div>
        ))}
        <button type="button" className="pcv-btn-primary" disabled={saving === 'idiomas'} onClick={guardarIdiomas}>
          {saving === 'idiomas' ? 'Guardando…' : 'Guardar idiomas'}
        </button>
      </section>

      <section className="pcv-block">
        <div className="pcv-block-head">
          <h3>Experiencia laboral</h3>
          <button type="button" className="pcv-btn-ghost" onClick={() => setExperiencia((p) => [...p, emptyExp()])}>
            + Añadir
          </button>
        </div>
        {experiencia.length === 0 && <p className="pcv-empty">Sin experiencia registrada.</p>}
        {experiencia.map((row, i) => (
          <div className="pcv-row pcv-row--exp" key={`exp-${i}`}>
            <input
              placeholder="Empresa / institución"
              value={row.empresa || ''}
              onChange={(e) => {
                const v = e.target.value;
                setExperiencia((p) => p.map((x, idx) => (idx === i ? { ...x, empresa: v } : x)));
              }}
            />
            <input
              placeholder="Cargo"
              value={row.cargo || ''}
              onChange={(e) => {
                const v = e.target.value;
                setExperiencia((p) => p.map((x, idx) => (idx === i ? { ...x, cargo: v } : x)));
              }}
            />
            <input
              type="date"
              value={row.fecha_inicio || ''}
              onChange={(e) => {
                const v = e.target.value;
                setExperiencia((p) => p.map((x, idx) => (idx === i ? { ...x, fecha_inicio: v } : x)));
              }}
            />
            <input
              type="date"
              disabled={!!row.actual}
              value={row.fecha_fin || ''}
              onChange={(e) => {
                const v = e.target.value;
                setExperiencia((p) => p.map((x, idx) => (idx === i ? { ...x, fecha_fin: v } : x)));
              }}
            />
            <label className="pcv-check">
              <input
                type="checkbox"
                checked={!!row.actual}
                onChange={(e) => {
                  const v = e.target.checked;
                  setExperiencia((p) =>
                    p.map((x, idx) => (idx === i ? { ...x, actual: v, fecha_fin: v ? '' : x.fecha_fin } : x))
                  );
                }}
              />
              Actual
            </label>
            <textarea
              placeholder="Descripción breve"
              rows={2}
              value={row.descripcion || ''}
              onChange={(e) => {
                const v = e.target.value;
                setExperiencia((p) => p.map((x, idx) => (idx === i ? { ...x, descripcion: v } : x)));
              }}
            />
            <button
              type="button"
              className="pcv-btn-danger"
              onClick={() => setExperiencia((p) => p.filter((_, idx) => idx !== i))}
            >
              Quitar
            </button>
          </div>
        ))}
        <button
          type="button"
          className="pcv-btn-primary"
          disabled={saving === 'experiencia'}
          onClick={guardarExperiencia}
        >
          {saving === 'experiencia' ? 'Guardando…' : 'Guardar experiencia'}
        </button>
      </section>

      <section className="pcv-block">
        <div className="pcv-block-head">
          <h3>Documentos (PDF)</h3>
        </div>
        <div className="pcv-upload-bar">
          <input
            placeholder="Título del documento"
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
          <label className={`pcv-btn-primary pcv-file-label${uploadingDoc ? ' is-busy' : ''}`}>
            {uploadingDoc ? 'Subiendo…' : 'Subir PDF'}
            <input type="file" accept="application/pdf,.pdf" hidden disabled={uploadingDoc} onChange={subirDocumento} />
          </label>
        </div>
        {documentos.length === 0 && <p className="pcv-empty">Sin documentos. Subí títulos o certificados en PDF.</p>}
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
                <button type="button" className="pcv-btn-danger" onClick={() => eliminarDocumento(d.id)}>
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
