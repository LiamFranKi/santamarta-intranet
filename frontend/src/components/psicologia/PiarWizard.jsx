import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import Swal from 'sweetalert2';
import {
  PIAR_CHECKS,
  PIAR_CAT_LABEL,
  PIAR_KPI_LABEL,
  PIAR_ESCALA_LABEL,
} from '../../utils/piarEtiquetas';
import './PiarStudio.css';

const STEPS = [
  { id: 'quien', title: 'Quién acompaña', hint: 'Año, docentes y fechas', lead: 'Asigne responsables y la próxima revisión. El docente aparece en Herramientas → PIAR.' },
  { id: 'retrato', title: 'Retrato', hint: 'Fortalezas y apoyos', lead: 'Describa al estudiante con lenguaje claro: lo que ya hace bien y dónde necesita apoyo.' },
  { id: 'apoyos', title: 'Apoyos en aula', hint: 'Ajustes razonables', lead: 'Marque solo lo que realmente se aplicará en clase. La familia verá estas mismas frases.' },
  { id: 'objetivos', title: 'Objetivos', hint: 'Qué esperamos ver', lead: 'Hasta tres metas concretas, con un indicador observable.' },
  { id: 'aula', title: 'Aula y publicación', hint: 'Bitácora y estado', lead: 'La zona turquesa es del docente. Publicar hace visible el plan a docente y familia.' },
];

const QUILL_PIAR = {
  toolbar: [['bold', 'italic', 'underline'], [{ list: 'ordered' }, { list: 'bullet' }], ['clean']],
};
const QUILL_FORMATS = ['bold', 'italic', 'underline', 'list', 'bullet'];

function CampoRico({ label, value, onChange, full }) {
  return (
    <div className={`piar-studio__field${full ? ' piar-studio__field--full' : ''}`}>
      <span>{label}</span>
      <div className="piar-studio__rich">
        <ReactQuill
          theme="snow"
          value={value || ''}
          onChange={onChange}
          modules={QUILL_PIAR}
          formats={QUILL_FORMATS}
        />
      </div>
    </div>
  );
}

export default function PiarWizard({
  open,
  editing,
  form,
  setForm,
  meta,
  alumnoNombre,
  seguimientoItems,
  seguimientoNuevo,
  setSeguimientoNuevo,
  onAgregarNota,
  onClose,
  onGuardar,
  guardando,
  formatLimaLine,
}) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (open) setStep(0);
  }, [open, editing?.id]);

  const pedirSalir = async () => {
    const r = await Swal.fire({
      icon: 'question',
      title: '¿Salir del PIAR?',
      text: 'Si no guardó, se perderán los cambios de esta ventana.',
      showCancelButton: true,
      confirmButtonText: 'Salir',
      cancelButtonText: 'Seguir editando',
      reverseButtons: true,
      didOpen: () => {
        const c = document.querySelector('.swal2-container');
        if (c) c.style.zIndex = '200000';
      },
    });
    if (r.isConfirmed) onClose();
  };

  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => {
      if (e.key === 'Escape') pedirSalir();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const pct = Math.round(((step + 1) / STEPS.length) * 100);
  const current = STEPS[step];

  const toggleCheck = (cat, key) => {
    setForm((f) => {
      const arr = f.ajustes[cat] || [];
      const next = arr.includes(key) ? arr.filter((k) => k !== key) : [...arr, key];
      return { ...f, ajustes: { ...f.ajustes, [cat]: next } };
    });
  };

  return createPortal(
    <div className="piar-studio-overlay" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && pedirSalir()}>
      <div className="piar-studio" role="dialog" aria-modal="true" aria-labelledby="piar-studio-title">
        <aside className="piar-studio__rail">
          <p className="piar-studio__kicker">Psicología · inclusivo</p>
          <h2 id="piar-studio-title">{editing ? 'Editar PIAR' : 'Nuevo PIAR'}</h2>
          <p className="piar-studio__alumno">{alumnoNombre}</p>
          <ol className="piar-studio__steps">
            {STEPS.map((s, i) => (
              <li key={s.id}>
                <button
                  type="button"
                  className={`piar-studio__step${i === step ? ' is-active' : ''}${i < step ? ' is-done' : ''}`}
                  onClick={() => setStep(i)}
                >
                  <span className="piar-studio__num">{i < step ? '✓' : i + 1}</span>
                  <span>
                    <span className="piar-studio__step-label">{s.title}</span>
                    <span className="piar-studio__step-hint">{s.hint}</span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </aside>

        <section className="piar-studio__stage">
          <header className="piar-studio__top">
            <div className="piar-studio__progress">
              <div className="piar-studio__progress-label">
                Paso {step + 1} de {STEPS.length}
              </div>
              <div className="piar-studio__bar" aria-hidden>
                <span style={{ width: `${pct}%` }} />
              </div>
            </div>
            <button type="button" className="piar-studio__close" onClick={pedirSalir}>
              Cancelar
            </button>
          </header>

          <div className="piar-studio__body">
            <div className="piar-studio__panel">
              <h3>{current.title}</h3>
              <p className="piar-studio__lead">{current.lead}</p>

              {step === 0 && (
                <div className="piar-studio__grid">
                  {!editing && (
                    <div className="piar-studio__field">
                      <span>Año escolar</span>
                      <input type="number" value={form.anio} onChange={(e) => set({ anio: e.target.value })} />
                    </div>
                  )}
                  <div className="piar-studio__field">
                    <span>Docente responsable</span>
                    <select
                      value={form.docente_responsable_personal_id != null ? String(form.docente_responsable_personal_id) : ''}
                      onChange={(e) => set({ docente_responsable_personal_id: e.target.value })}
                    >
                      <option value="">(No indicado)</option>
                      {(meta?.docentes || []).map((d) => (
                        <option key={d.id} value={String(d.id)}>
                          {d.nombre}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="piar-studio__field">
                    <span>Coordinación</span>
                    <select
                      value={form.coordinador_personal_id != null ? String(form.coordinador_personal_id) : ''}
                      onChange={(e) => set({ coordinador_personal_id: e.target.value })}
                    >
                      <option value="">(No indicado)</option>
                      {(meta?.personal || []).map((d) => (
                        <option key={d.id} value={String(d.id)}>
                          {d.nombre}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="piar-studio__field">
                    <span>Próxima revisión</span>
                    <input
                      type="date"
                      value={form.fecha_revision ? String(form.fecha_revision).slice(0, 10) : ''}
                      onChange={(e) => set({ fecha_revision: e.target.value })}
                    />
                  </div>
                  <CampoRico
                    full
                    label="Ajustes tras la revisión"
                    value={form.ajustes_necesarios_revision}
                    onChange={(html) => set({ ajustes_necesarios_revision: html })}
                  />
                </div>
              )}

              {step === 1 && (
                <div className="piar-studio__grid">
                  <CampoRico full label="Fortalezas" value={form.fortalezas} onChange={(html) => set({ fortalezas: html })} />
                  <CampoRico
                    full
                    label="Áreas de apoyo"
                    value={form.areas_dificultad}
                    onChange={(html) => set({ areas_dificultad: html })}
                  />
                  <div className="piar-studio__field">
                    <span>Estilo de aprendizaje</span>
                    <input value={form.estilo_aprendizaje} onChange={(e) => set({ estilo_aprendizaje: e.target.value })} />
                  </div>
                  <div className="piar-studio__field">
                    <span>Diagnóstico (si aplica)</span>
                    <input value={form.diagnostico} onChange={(e) => set({ diagnostico: e.target.value })} />
                  </div>
                  <CampoRico
                    full
                    label="Observaciones"
                    value={form.observaciones_relevantes}
                    onChange={(html) => set({ observaciones_relevantes: html })}
                  />
                </div>
              )}

              {step === 2 &&
                Object.entries(PIAR_CHECKS).map(([cat, items]) => (
                  <div key={cat} className="piar-studio__cat">
                    <h4>{PIAR_CAT_LABEL[cat] || cat}</h4>
                    <div className="piar-studio__tiles">
                      {items.map((it) => {
                        const on = (form.ajustes[cat] || []).includes(it.key);
                        return (
                          <button
                            key={it.key}
                            type="button"
                            className={`piar-studio__tile${on ? ' is-on' : ''}`}
                            onClick={() => toggleCheck(cat, it.key)}
                          >
                            <span className="piar-studio__check">{on ? '✓' : ''}</span>
                            {it.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}

              {step === 3 && (
                <>
                  {(form.objetivos || []).map((o, i) => (
                    <div key={i} className="piar-studio__obj">
                      <div className="piar-studio__field">
                        <span>Objetivo {i + 1}</span>
                        <input
                          value={o.objetivo}
                          onChange={(e) => {
                            const next = [...form.objetivos];
                            next[i] = { ...next[i], objetivo: e.target.value };
                            set({ objetivos: next });
                          }}
                        />
                      </div>
                      <div className="piar-studio__field">
                        <span>Indicador</span>
                        <input
                          value={o.indicador}
                          onChange={(e) => {
                            const next = [...form.objetivos];
                            next[i] = { ...next[i], indicador: e.target.value };
                            set({ objetivos: next });
                          }}
                        />
                      </div>
                    </div>
                  ))}
                  <p className="piar-studio__lead" style={{ marginTop: '0.5rem' }}>
                    Indicadores de seguimiento
                  </p>
                  <div className="piar-studio__kpi">
                    {Object.entries(PIAR_KPI_LABEL).map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        className={form.evaluacion_kpi[key] ? 'is-on' : ''}
                        onClick={() =>
                          setForm((f) => ({
                            ...f,
                            evaluacion_kpi: { ...f.evaluacion_kpi, [key]: !f.evaluacion_kpi[key] },
                          }))
                        }
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="piar-studio__field">
                    <span>Escala de progreso</span>
                    <select
                      value={form.evaluacion_kpi.escala || 'en_proceso'}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          evaluacion_kpi: { ...f.evaluacion_kpi, escala: e.target.value },
                        }))
                      }
                    >
                      {Object.entries(PIAR_ESCALA_LABEL).map(([k, lab]) => (
                        <option key={k} value={k}>
                          {lab}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              {step === 4 && (
                <>
                  <div className="piar-studio__aula">
                    <h4>Seguimiento en aula (docente)</h4>
                    <p>
                      El docente completa habitualmente estos campos desde su menú. Aquí puede dejar un borrador o
                      consensuarlo.
                    </p>
                    <CampoRico
                      label="Estrategias en aula"
                      value={form.estrategias_docentes}
                      onChange={(html) => set({ estrategias_docentes: html })}
                    />
                    <div style={{ height: '0.7rem' }} />
                    <CampoRico
                      label="Frecuencia"
                      value={form.frecuencia_aplicacion}
                      onChange={(html) => set({ frecuencia_aplicacion: html })}
                    />
                    <div style={{ height: '0.7rem' }} />
                    <CampoRico
                      label="Avances observados"
                      value={form.avances_observados}
                      onChange={(html) => set({ avances_observados: html })}
                    />
                  </div>

                  {editing?.id ? (
                    <>
                      <h4 style={{ margin: '0 0 0.5rem', color: '#5b21b6' }}>Bitácora</h4>
                      <div className="piar-studio__bit">
                        {seguimientoItems.map((s) => (
                          <div key={s.id} className={`piar-studio__note${s.autor_tipo === 'DOCENTE' ? ' is-doc' : ''}`}>
                            <small>
                              {s.autor_tipo === 'DOCENTE' ? 'Docente' : 'Psicología'} ·{' '}
                              {formatLimaLine ? formatLimaLine(s.created_at) : s.created_at}
                            </small>
                            <div style={{ whiteSpace: 'pre-wrap' }}>{s.contenido}</div>
                          </div>
                        ))}
                        {!seguimientoItems.length && <p className="piar-studio__lead">Aún no hay notas.</p>}
                      </div>
                      <div className="piar-studio__field">
                        <span>Nueva nota</span>
                        <textarea value={seguimientoNuevo} onChange={(e) => setSeguimientoNuevo(e.target.value)} />
                      </div>
                      <button
                        type="button"
                        className="piar-studio__btn piar-studio__btn--ghost"
                        style={{ marginTop: '0.55rem' }}
                        disabled={!String(seguimientoNuevo || '').trim()}
                        onClick={onAgregarNota}
                      >
                        Registrar nota
                      </button>
                    </>
                  ) : (
                    <p className="piar-studio__lead">La bitácora se habilita al guardar la primera versión.</p>
                  )}
                </>
              )}
            </div>
          </div>

          <footer className="piar-studio__foot">
            <div className="piar-studio__nav">
              <button type="button" className="piar-studio__btn piar-studio__btn--cancel" onClick={pedirSalir}>
                Cancelar
              </button>
              <button
                type="button"
                className="piar-studio__btn piar-studio__btn--ghost"
                disabled={step === 0}
                onClick={() => setStep((s) => Math.max(0, s - 1))}
              >
                Atrás
              </button>
              <button
                type="button"
                className="piar-studio__btn piar-studio__btn--ghost"
                disabled={step === STEPS.length - 1}
                onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
              >
                Siguiente
              </button>
            </div>
            <div className="piar-studio__nav">
              <button
                type="button"
                className="piar-studio__btn piar-studio__btn--draft"
                disabled={guardando}
                onClick={() => onGuardar('BORRADOR')}
              >
                {guardando ? 'Guardando…' : 'Guardar borrador'}
              </button>
              {editing?.id ? (
                <button
                  type="button"
                  className="piar-studio__btn piar-studio__btn--ghost"
                  disabled={guardando}
                  onClick={() => onGuardar('ARCHIVADO')}
                >
                  Archivar
                </button>
              ) : null}
              <button
                type="button"
                className="piar-studio__btn piar-studio__btn--pub"
                disabled={guardando}
                onClick={() => onGuardar('ACTIVO')}
              >
                {guardando ? 'Guardando…' : editing && form.estado === 'ACTIVO' ? 'Guardar publicado' : 'Publicar'}
              </button>
            </div>
          </footer>
        </section>
      </div>
    </div>,
    document.body
  );
}
