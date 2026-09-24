import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { descargarCurriculumConAviso } from '../utils/descargarCurriculumPersonal';
import './PersonalCvEditor.css';

const NIVELES_IDIOMA = {
  BASICO: 'Básico',
  INTERMEDIO: 'Intermedio',
  AVANZADO: 'Avanzado',
  NATIVO: 'Nativo'
};

const TIPOS_DOC = {
  TITULO: 'Título',
  CERTIFICADO: 'Certificado',
  OTRO: 'Otro'
};

/**
 * Vista de solo lectura del CV de personal (estudios, idiomas, experiencia, docs).
 * @param {{ apiBase: string, exportUrl?: string }} props
 */
export default function PersonalCvViewer({ apiBase, exportUrl }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cv, setCv] = useState({
    estudios: [],
    idiomas: [],
    experiencia: [],
    documentos: []
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!apiBase) return;
      try {
        setLoading(true);
        setError('');
        const { data } = await api.get(apiBase);
        if (cancelled) return;
        setCv({
          estudios: data.estudios || [],
          idiomas: data.idiomas || [],
          experiencia: (data.experiencia || []).map((x) => ({
            ...x,
            fecha_inicio: x.fecha_inicio ? String(x.fecha_inicio).slice(0, 10) : '',
            fecha_fin: x.fecha_fin ? String(x.fecha_fin).slice(0, 10) : ''
          })),
          documentos: data.documentos || []
        });
      } catch (e) {
        if (!cancelled) {
          setError(e.response?.data?.error || 'No se pudo cargar el CV');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiBase]);

  if (loading) return <div className="pcv-loading">Cargando CV…</div>;
  if (error) return <p className="pcv-empty">{error}</p>;

  return (
    <div className="pcv-editor pcv-editor--compact">
      {exportUrl ? (
        <div className="pcv-export-bar">
          <p className="pcv-export-hint">PDF profesional con foto, contacto y formación.</p>
          <button
            type="button"
            className="pcv-btn pcv-btn--export"
            onClick={() => descargarCurriculumConAviso(exportUrl)}
          >
            <span className="pcv-btn-ico" aria-hidden="true">📄</span>
            Descargar currículum
          </button>
        </div>
      ) : null}
      <section className="pcv-block">
        <div className="pcv-block-head">
          <h3>Estudios / formación</h3>
        </div>
        <div className="pcv-table-wrap">
          <table className="pcv-table">
            <thead>
              <tr>
                <th>Nivel</th>
                <th>Institución</th>
                <th>Carrera</th>
                <th>Periodo</th>
              </tr>
            </thead>
            <tbody>
              {cv.estudios.length === 0 ? (
                <tr>
                  <td colSpan={4} className="pcv-empty-cell">
                    Sin estudios registrados
                  </td>
                </tr>
              ) : (
                cv.estudios.map((row, i) => (
                  <tr key={`est-${row.id || i}`}>
                    <td>{row.nivel || '—'}</td>
                    <td>{row.institucion || '—'}</td>
                    <td>{row.carrera || '—'}</td>
                    <td>
                      {row.anio_inicio || '—'} – {row.en_curso ? 'En curso' : row.anio_fin || '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="pcv-block">
        <div className="pcv-block-head">
          <h3>Idiomas</h3>
        </div>
        <div className="pcv-table-wrap">
          <table className="pcv-table">
            <thead>
              <tr>
                <th>Idioma</th>
                <th>Nivel</th>
              </tr>
            </thead>
            <tbody>
              {cv.idiomas.length === 0 ? (
                <tr>
                  <td colSpan={2} className="pcv-empty-cell">
                    Sin idiomas registrados
                  </td>
                </tr>
              ) : (
                cv.idiomas.map((row, i) => (
                  <tr key={`idi-${row.id || i}`}>
                    <td>{row.idioma || '—'}</td>
                    <td>{NIVELES_IDIOMA[row.nivel] || row.nivel || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="pcv-block">
        <div className="pcv-block-head">
          <h3>Experiencia laboral</h3>
        </div>
        <div className="pcv-table-wrap">
          <table className="pcv-table">
            <thead>
              <tr>
                <th>Empresa</th>
                <th>Cargo</th>
                <th>Periodo</th>
                <th>Descripción</th>
              </tr>
            </thead>
            <tbody>
              {cv.experiencia.length === 0 ? (
                <tr>
                  <td colSpan={4} className="pcv-empty-cell">
                    Sin experiencia registrada
                  </td>
                </tr>
              ) : (
                cv.experiencia.map((row, i) => (
                  <tr key={`exp-${row.id || i}`}>
                    <td>{row.empresa || '—'}</td>
                    <td>{row.cargo || '—'}</td>
                    <td>
                      {row.fecha_inicio || '—'} – {row.actual ? 'Actual' : row.fecha_fin || '—'}
                    </td>
                    <td className="pcv-td-desc">{row.descripcion || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="pcv-block">
        <div className="pcv-block-head">
          <h3>Documentos (PDF)</h3>
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
              {cv.documentos.length === 0 ? (
                <tr>
                  <td colSpan={3} className="pcv-empty-cell">
                    Sin documentos
                  </td>
                </tr>
              ) : (
                cv.documentos.map((d) => (
                  <tr key={d.id}>
                    <td>{d.titulo || 'Documento'}</td>
                    <td>
                      <span className="pcv-badge">{TIPOS_DOC[d.tipo] || d.tipo}</span>
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
