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

const labelIdioma = (nivel) =>
  NIVELES_IDIOMA.find((n) => n.value === nivel)?.label || nivel || '—';

const labelTipoDoc = (tipo) =>
  TIPOS_DOC.find((t) => t.value === tipo)?.label || tipo || '—';

/**
 * @param {{ apiBase: string, compact?: boolean }} props
 */
export default function PersonalCvEditor({ apiBase, compact = false }) {
  const [loading, setLoading] = useState(true);
  const [estudios, setEstudios] = useState([]);
  const [idiomas, setIdiomas] = useState([]);
  const [experiencia, setExperiencia] = useState([]);
  const [documentos, setDocumentos] = useState([]);
  const [saving, setSaving] = useState(null);
  const [draftEstudio, setDraftEstudio] = useState(emptyEstudio());
  const [draftIdioma, setDraftIdioma] = useState(emptyIdioma());
  const [draftExp, setDraftExp] = useState(emptyExp());
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
          fecha_inicio: x.fecha_inicio ? String(x.fecha_inicio).slice(0, 10) : '',
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

  const agregarEstudio = () => {
    if (!draftEstudio.institucion?.trim() && !draftEstudio.carrera?.trim() && !draftEstudio.nivel?.trim()) {
      toastErr('Completá al menos institución, carrera o nivel');
      return;
    }
    setEstudios((p) => [...p, { ...draftEstudio }]);
    setDraftEstudio(emptyEstudio());
  };

  const agregarIdioma = () => {
    if (!draftIdioma.idioma?.trim()) {
      toastErr('Escribí el idioma');
      return;
    }
    setIdiomas((p) => [...p, { ...draftIdioma }]);
    setDraftIdioma(emptyIdioma());
  };

  const agregarExp = () => {
    if (!draftExp.empresa?.trim() && !draftExp.cargo?.trim()) {
      toastErr('Completá empresa o cargo');
      return;
    }
    setExperiencia((p) => [...p, { ...draftExp }]);
    setDraftExp(emptyExp());
  };

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
      {/* ——— Estudios ——— */}
      <section className="pcv-block">
        <div className="pcv-block-head">
          <h3>Estudios / formación</h3>
        </div>
        <div className="pcv-draft">
          <div className="pcv-draft-grid">
            <div className="pcv-field">
              <label>Nivel</label>
              <input
                placeholder="Univ., Técnico…"
                value={draftEstudio.nivel}
                onChange={(e) => setDraftEstudio((p) => ({ ...p, nivel: e.target.value }))}
              />
            </div>
            <div className="pcv-field">
              <label>Institución</label>
              <input
                placeholder="Nombre de la institución"
                value={draftEstudio.institucion}
                onChange={(e) => setDraftEstudio((p) => ({ ...p, institucion: e.target.value }))}
              />
            </div>
            <div className="pcv-field">
              <label>Carrera / especialidad</label>
              <input
                placeholder="Carrera"
                value={draftEstudio.carrera}
                onChange={(e) => setDraftEstudio((p) => ({ ...p, carrera: e.target.value }))}
              />
            </div>
            <div className="pcv-field">
              <label>Año inicio</label>
              <input
                type="number"
                placeholder="AAAA"
                value={draftEstudio.anio_inicio}
                onChange={(e) => setDraftEstudio((p) => ({ ...p, anio_inicio: e.target.value }))}
              />
            </div>
            <div className="pcv-field">
              <label>Año fin</label>
              <input
                type="number"
                placeholder="AAAA"
                disabled={!!draftEstudio.en_curso}
                value={draftEstudio.anio_fin}
                onChange={(e) => setDraftEstudio((p) => ({ ...p, anio_fin: e.target.value }))}
              />
            </div>
            <label className="pcv-check pcv-check--draft">
              <input
                type="checkbox"
                checked={!!draftEstudio.en_curso}
                onChange={(e) =>
                  setDraftEstudio((p) => ({
                    ...p,
                    en_curso: e.target.checked,
                    anio_fin: e.target.checked ? '' : p.anio_fin
                  }))
                }
              />
              En curso
            </label>
          </div>
          <button type="button" className="pcv-btn pcv-btn--add" onClick={agregarEstudio}>
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
                <th>Nivel</th>
                <th>Institución</th>
                <th>Carrera</th>
                <th>Periodo</th>
                <th className="pcv-th-actions">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {estudios.length === 0 ? (
                <tr>
                  <td colSpan={5} className="pcv-empty-cell">
                    Sin estudios. Completá el formulario y pulsá Agregar.
                  </td>
                </tr>
              ) : (
                estudios.map((row, i) => (
                  <tr key={`est-${i}`}>
                    <td>{row.nivel || '—'}</td>
                    <td>{row.institucion || '—'}</td>
                    <td>{row.carrera || '—'}</td>
                    <td>
                      {row.anio_inicio || '—'}
                      {' – '}
                      {row.en_curso ? 'En curso' : row.anio_fin || '—'}
                    </td>
                    <td>
                      <div className="pcv-td-actions">
                        <button
                          type="button"
                          className="pcv-btn pcv-btn--danger pcv-btn--sm"
                          title="Quitar"
                          onClick={() => setEstudios((p) => p.filter((_, idx) => idx !== i))}
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
        <button
          type="button"
          className="pcv-btn pcv-btn--primary"
          disabled={saving === 'estudios'}
          onClick={guardarEstudios}
        >
          <span className="pcv-btn-ico" aria-hidden="true">
            💾
          </span>
          {saving === 'estudios' ? 'Guardando…' : 'Guardar estudios'}
        </button>
      </section>

      {/* ——— Idiomas ——— */}
      <section className="pcv-block">
        <div className="pcv-block-head">
          <h3>Idiomas</h3>
        </div>
        <div className="pcv-draft">
          <div className="pcv-draft-grid pcv-draft-grid--2">
            <div className="pcv-field">
              <label>Idioma</label>
              <input
                placeholder="Ej. Inglés"
                value={draftIdioma.idioma}
                onChange={(e) => setDraftIdioma((p) => ({ ...p, idioma: e.target.value }))}
              />
            </div>
            <div className="pcv-field">
              <label>Nivel</label>
              <select
                value={draftIdioma.nivel}
                onChange={(e) => setDraftIdioma((p) => ({ ...p, nivel: e.target.value }))}
              >
                {NIVELES_IDIOMA.map((n) => (
                  <option key={n.value} value={n.value}>
                    {n.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <button type="button" className="pcv-btn pcv-btn--add" onClick={agregarIdioma}>
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
                <th>Idioma</th>
                <th>Nivel</th>
                <th className="pcv-th-actions">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {idiomas.length === 0 ? (
                <tr>
                  <td colSpan={3} className="pcv-empty-cell">
                    Sin idiomas. Agregá uno arriba.
                  </td>
                </tr>
              ) : (
                idiomas.map((row, i) => (
                  <tr key={`idi-${i}`}>
                    <td>{row.idioma || '—'}</td>
                    <td>{labelIdioma(row.nivel)}</td>
                    <td>
                      <div className="pcv-td-actions">
                        <button
                          type="button"
                          className="pcv-btn pcv-btn--danger pcv-btn--sm"
                          title="Quitar"
                          onClick={() => setIdiomas((p) => p.filter((_, idx) => idx !== i))}
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
        <button
          type="button"
          className="pcv-btn pcv-btn--primary"
          disabled={saving === 'idiomas'}
          onClick={guardarIdiomas}
        >
          <span className="pcv-btn-ico" aria-hidden="true">
            💾
          </span>
          {saving === 'idiomas' ? 'Guardando…' : 'Guardar idiomas'}
        </button>
      </section>

      {/* ——— Experiencia ——— */}
      <section className="pcv-block">
        <div className="pcv-block-head">
          <h3>Experiencia laboral</h3>
        </div>
        <div className="pcv-draft">
          <div className="pcv-draft-grid">
            <div className="pcv-field">
              <label>Empresa / institución</label>
              <input
                placeholder="Empresa"
                value={draftExp.empresa}
                onChange={(e) => setDraftExp((p) => ({ ...p, empresa: e.target.value }))}
              />
            </div>
            <div className="pcv-field">
              <label>Cargo</label>
              <input
                placeholder="Cargo"
                value={draftExp.cargo}
                onChange={(e) => setDraftExp((p) => ({ ...p, cargo: e.target.value }))}
              />
            </div>
            <div className="pcv-field">
              <label>Fecha inicio</label>
              <input
                type="date"
                value={draftExp.fecha_inicio}
                onChange={(e) => setDraftExp((p) => ({ ...p, fecha_inicio: e.target.value }))}
              />
            </div>
            <div className="pcv-field">
              <label>Fecha fin</label>
              <input
                type="date"
                disabled={!!draftExp.actual}
                value={draftExp.fecha_fin}
                onChange={(e) => setDraftExp((p) => ({ ...p, fecha_fin: e.target.value }))}
              />
            </div>
            <label className="pcv-check pcv-check--draft">
              <input
                type="checkbox"
                checked={!!draftExp.actual}
                onChange={(e) =>
                  setDraftExp((p) => ({
                    ...p,
                    actual: e.target.checked,
                    fecha_fin: e.target.checked ? '' : p.fecha_fin
                  }))
                }
              />
              Trabajo actual
            </label>
            <div className="pcv-field pcv-field--full">
              <label>Descripción breve</label>
              <textarea
                rows={2}
                placeholder="Resumen de funciones"
                value={draftExp.descripcion}
                onChange={(e) => setDraftExp((p) => ({ ...p, descripcion: e.target.value }))}
              />
            </div>
          </div>
          <button type="button" className="pcv-btn pcv-btn--add" onClick={agregarExp}>
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
                <th>Empresa</th>
                <th>Cargo</th>
                <th>Periodo</th>
                <th>Descripción</th>
                <th className="pcv-th-actions">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {experiencia.length === 0 ? (
                <tr>
                  <td colSpan={5} className="pcv-empty-cell">
                    Sin experiencia. Completá el formulario y pulsá Agregar.
                  </td>
                </tr>
              ) : (
                experiencia.map((row, i) => (
                  <tr key={`exp-${i}`}>
                    <td>{row.empresa || '—'}</td>
                    <td>{row.cargo || '—'}</td>
                    <td>
                      {row.fecha_inicio || '—'}
                      {' – '}
                      {row.actual ? 'Actual' : row.fecha_fin || '—'}
                    </td>
                    <td className="pcv-td-desc">{row.descripcion || '—'}</td>
                    <td>
                      <div className="pcv-td-actions">
                        <button
                          type="button"
                          className="pcv-btn pcv-btn--danger pcv-btn--sm"
                          title="Quitar"
                          onClick={() => setExperiencia((p) => p.filter((_, idx) => idx !== i))}
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
        <button
          type="button"
          className="pcv-btn pcv-btn--primary"
          disabled={saving === 'experiencia'}
          onClick={guardarExperiencia}
        >
          <span className="pcv-btn-ico" aria-hidden="true">
            💾
          </span>
          {saving === 'experiencia' ? 'Guardando…' : 'Guardar experiencia'}
        </button>
      </section>

      {/* ——— Documentos ——— */}
      <section className="pcv-block">
        <div className="pcv-block-head">
          <h3>Documentos (PDF)</h3>
        </div>
        <div className="pcv-draft">
          <div className="pcv-draft-grid pcv-draft-grid--doc">
            <div className="pcv-field">
              <label>Título del documento</label>
              <input
                placeholder="Ej. Título profesional"
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
          <label className={`pcv-btn pcv-btn--add${uploadingDoc ? ' is-busy' : ''}`}>
            <span className="pcv-btn-ico" aria-hidden="true">
              📄
            </span>
            {uploadingDoc ? 'Subiendo…' : 'Subir PDF'}
            <input
              type="file"
              accept="application/pdf,.pdf"
              hidden
              disabled={uploadingDoc}
              onChange={subirDocumento}
            />
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
                      <span className="pcv-badge">{labelTipoDoc(d.tipo)}</span>
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
                          onClick={() => eliminarDocumento(d.id)}
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
