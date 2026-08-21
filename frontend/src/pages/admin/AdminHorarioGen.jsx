import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Swal from 'sweetalert2';
import DashboardLayout from '../../components/DashboardLayout';
import api from '../../services/api';
import { exportarHorarioGenPDF, exportarHorarioGenPDFMultiple } from '../../utils/horarioGenPdf';
import { resolveCursoColor } from '../../utils/horarioGenColors';
import './AdminHorarioGen.css';

const API = '/admin/horario-gen';

const TIPOS = [
  { value: 'CLASS', label: 'Clase' },
  { value: 'BREAK', label: 'Recreo' },
  { value: 'LUNCH', label: 'Almuerzo' },
  { value: 'ACTIVITY', label: 'Actividad' },
];

const DIAS = [
  { value: 1, label: 'Lunes' },
  { value: 2, label: 'Martes' },
  { value: 3, label: 'Miércoles' },
  { value: 4, label: 'Jueves' },
  { value: 5, label: 'Viernes' },
];

const ESTADOS_DISP = [
  { value: 'AVAILABLE', label: 'Disponible' },
  { value: 'UNAVAILABLE', label: 'No disponible' },
  { value: 'AVAILABLE_UNTIL', label: 'Hasta' },
  { value: 'AVAILABLE_FROM', label: 'Desde' },
  { value: 'CUSTOM_INTERVAL', label: 'Intervalo' },
];

const TABS = [
  { id: 'config', label: '1. Configuración', icon: '⚙️', tone: 'blue' },
  { id: 'disponibilidad', label: '2. Disponibilidad', icon: '👤', tone: 'green' },
  { id: 'carga', label: '3. Carga semanal', icon: '📚', tone: 'amber' },
  { id: 'editor', label: '4. Horario', icon: '🗓️', tone: 'violet' },
];

const TIP_HORAS_SEGUIDAS =
  'Cuántas horas juntas el mismo día. Ej.: 2/2 = siempre de a dos seguidas (Inglés 6 h → tres dobles en días distintos). 1/2 = puede ir 1 o hasta 2. 1/1 = solo sueltas. Si no hay hueco seguido, el generador puede partir un doble con el recreo en medio (salvo cursos marcados «No partir»).';

const TIP_NO_PARTIR =
  'Si está marcado, esas horas jamás se separan: van juntas el mismo día y nunca una antes y otra después del recreo (ej. Robótica, Natación).';

const swalOpts = {
  target: document.body,
  customClass: { container: 'hg-swal' },
  didOpen: (popup) => {
    const root = popup?.closest?.('.swal2-container');
    if (root) root.style.setProperty('z-index', '250000', 'important');
  },
};

function esActivo(v) {
  return v === true || v === 1 || v === '1' || Number(v) === 1;
}

function fmtTime(t) {
  if (!t) return '—';
  const s = String(t);
  return s.length >= 5 ? s.slice(0, 5) : s;
}

/** Nunca mostrar BREAK/LUNCH en UI: Recreo / Almuerzo / Clase */
function labelTipoBloque(tipo) {
  const t = String(tipo || '').toUpperCase();
  if (t === 'BREAK') return 'Recreo';
  if (t === 'LUNCH') return 'Almuerzo';
  if (t === 'CLASS') return 'Clase';
  if (t === 'ACTIVITY') return 'Actividad';
  const found = TIPOS.find((x) => x.value === t);
  return found?.label || tipo || '';
}

/** Inicial → "3 Años"; otros → "3º" */
function labelGrado(nivelNombre, grado) {
  if (grado === null || grado === undefined || grado === '') return '';
  if (Number(grado) === -1) return 'Avanzada';
  if (/inicial/i.test(String(nivelNombre || ''))) return `${grado} Años`;
  return `${grado}º`;
}

function labelGrupo(g) {
  if (!g) return '';
  if (g.label) return g.label;
  return [g.nivel_nombre, labelGrado(g.nivel_nombre, g.grado), g.seccion].filter(Boolean).join(' · ');
}

function Overlay({ title, onClose, children, footer, size = 'md' }) {
  return createPortal(
    <div className="hg-overlay" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className={`hg-modal${size === 'lg' ? ' hg-modal--lg' : ''}`}
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="hg-modal-header">
          <h2>{title}</h2>
          <button type="button" className="hg-modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <div className="hg-modal-body">{children}</div>
        {footer && <div className="hg-modal-footer">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

export default function AdminHorarioGen() {
  const [meta, setMeta] = useState({ anios: [], niveles: [], docentes: [], anio_activo: null, aviso: '' });
  const [tab, setTab] = useState('config');
  const [anio, setAnio] = useState(null);
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tablesMissing, setTablesMissing] = useState(false);
  const [selectedConfig, setSelectedConfig] = useState(null);
  const [bloques, setBloques] = useState([]);
  const [modalConfig, setModalConfig] = useState({ open: false, item: null });
  const [modalBloque, setModalBloque] = useState({ open: false, mode: 'create', item: null });
  const [saving, setSaving] = useState(false);

  const cargarMeta = useCallback(async () => {
    const { data } = await api.get(`${API}/meta`);
    setMeta(data);
    setAnio((prev) => prev || data.anio_activo || data.anios?.[0] || new Date().getFullYear());
  }, []);

  const cargarConfigs = useCallback(async (anioSel) => {
    if (!anioSel) return;
    try {
      setError('');
      setTablesMissing(false);
      const { data } = await api.get(`${API}/configs`, { params: { anio: anioSel } });
      setConfigs(data.configs || []);
    } catch (e) {
      if (e.response?.data?.code === 'TABLES_MISSING' || e.response?.status === 503) {
        setTablesMissing(true);
        setConfigs([]);
        setError(e.response?.data?.error || 'Faltan tablas SQL');
      } else {
        setError(e.response?.data?.error || 'Error al cargar configuraciones');
      }
    }
  }, []);

  const cargarBloques = useCallback(async (configId) => {
    if (!configId) {
      setBloques([]);
      return;
    }
    const { data } = await api.get(`${API}/configs/${configId}/bloques`);
    setBloques(data.bloques || []);
    setSelectedConfig(data.config || null);
  }, []);

  const boot = useCallback(async () => {
    try {
      setLoading(true);
      await cargarMeta();
    } catch (e) {
      setError(e.response?.data?.error || 'Error al iniciar módulo');
    } finally {
      setLoading(false);
    }
  }, [cargarMeta]);

  useEffect(() => {
    boot();
  }, [boot]);

  useEffect(() => {
    if (anio) cargarConfigs(anio);
  }, [anio, cargarConfigs]);

  const abrirConfig = async (row) => {
    setSelectedConfig(row);
    try {
      await cargarBloques(row.id);
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: e.response?.data?.error || 'No se pudieron cargar bloques',
        ...swalOpts,
      });
    }
  };

  const eliminarConfig = async (row) => {
    const conf = await Swal.fire({
      icon: 'warning',
      title: '¿Eliminar configuración piloto?',
      text: `${row.nivel_nombre || row.nombre} — ${row.anio}. Solo borra tablas horario_gen_*, no el horario actual.`,
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#b91c1c',
      ...swalOpts,
    });
    if (!conf.isConfirmed) return;
    try {
      await api.delete(`${API}/configs/${row.id}`);
      if (selectedConfig?.id === row.id) {
        setSelectedConfig(null);
        setBloques([]);
      }
      await cargarConfigs(anio);
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: e.response?.data?.error || 'No se pudo eliminar',
        ...swalOpts,
      });
    }
  };

  const eliminarBloque = async (row) => {
    const conf = await Swal.fire({
      icon: 'warning',
      title: '¿Eliminar hora?',
      text: row.nombre,
      showCancelButton: true,
      confirmButtonText: 'Sí',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#b91c1c',
      ...swalOpts,
    });
    if (!conf.isConfirmed) return;
    try {
      await api.delete(`${API}/bloques/${row.id}`);
      await cargarBloques(selectedConfig.id);
      await cargarConfigs(anio);
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: e.response?.data?.error || 'No se pudo eliminar',
        ...swalOpts,
      });
    }
  };

  const seedSecundaria = async () => {
    if (!selectedConfig) return;
    const conf = await Swal.fire({
      icon: 'question',
      title: 'Cargar horas de ejemplo (Secundaria)',
      text: 'Solo si la config aún no tiene horas.',
      showCancelButton: true,
      confirmButtonText: 'Cargar seed',
      cancelButtonText: 'Cancelar',
      ...swalOpts,
    });
    if (!conf.isConfirmed) return;
    try {
      await api.post(`${API}/configs/${selectedConfig.id}/bloques/seed-secundaria`);
      await cargarBloques(selectedConfig.id);
      await cargarConfigs(anio);
      Swal.fire({ icon: 'success', title: 'Listo', timer: 1200, showConfirmButton: false, ...swalOpts });
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: e.response?.data?.error || 'No se pudo aplicar seed',
        ...swalOpts,
      });
    }
  };

  return (
    <DashboardLayout>
      <div className="hg-page">
        <header className="hg-hero">
          <div>
            <h1>Generar Horarios</h1>
          </div>
          <div className="hg-hero-actions">
            <label className="hg-anio">
              <span>Año</span>
              <select value={anio || ''} onChange={(e) => setAnio(Number(e.target.value))}>
                {(meta.anios || []).map((a) => (
                  <option key={a} value={a}>
                    {a}
                    {a === meta.anio_activo ? ' (activo)' : ''}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="hg-btn hg-btn-light"
              onClick={() => {
                if (tab === 'config') cargarConfigs(anio);
                else window.location.reload();
              }}
            >
              Actualizar
            </button>
          </div>
        </header>

        <nav className="hg-tabs" aria-label="Fases del módulo">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`hg-tab hg-tab--${t.tone}${tab === t.id ? ' hg-tab--active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              <span className="hg-tab-icon" aria-hidden>
                {t.icon}
              </span>
              <span>{t.label}</span>
            </button>
          ))}
        </nav>

        {loading ? (
          <p className="hg-muted">Cargando…</p>
        ) : tablesMissing ? (
          <div className="hg-alert">
            <strong>Falta crear las tablas en MySQL.</strong>
            <p>{error}</p>
            <p>
              En phpMyAdmin ejecuta el archivo <code>sql/horario_gen_modulo.sql</code> del repo.
            </p>
          </div>
        ) : tab === 'disponibilidad' ? (
          <DisponibilidadPanel anio={anio} docentes={meta.docentes || []} />
        ) : tab === 'carga' ? (
          <CargaPanel anio={anio} niveles={meta.niveles || []} docentes={meta.docentes || []} />
        ) : tab === 'editor' ? (
          <EditorPanel anio={anio} niveles={meta.niveles || []} />
        ) : (
          <div className="hg-layout">
            <section className="hg-panel">
              <div className="hg-panel-head">
                <h2>Niveles del año {anio}</h2>
                <button
                  type="button"
                  className="hg-btn hg-btn-primary"
                  onClick={() => setModalConfig({ open: true, item: null })}
                >
                  + Config nivel
                </button>
              </div>
              {error && !tablesMissing && <p className="hg-error">{error}</p>}
              {configs.length === 0 ? (
                <p className="hg-muted">Aún no hay configuración para este año. Crea una por nivel (Inicial, Primaria, Secundaria).</p>
              ) : (
                <div className="hg-table-wrap">
                  <table className="hg-table">
                    <thead>
                      <tr>
                        <th>Nivel</th>
                        <th>Ingreso</th>
                        <th>Salida</th>
                        <th>Horas</th>
                        <th>Estado</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {configs.map((c) => (
                        <tr key={c.id} className={selectedConfig?.id === c.id ? 'hg-row-active' : ''}>
                          <td>
                            <strong>{c.nivel_nombre || c.nombre}</strong>
                          </td>
                          <td>{fmtTime(c.hora_ingreso)}</td>
                          <td>{fmtTime(c.hora_salida)}</td>
                          <td>{c.total_bloques ?? 0}</td>
                          <td>
                            <span className={`hg-badge ${esActivo(c.activo) ? 'ok' : 'off'}`}>
                              {esActivo(c.activo) ? 'Activo' : 'Inactivo'}
                            </span>
                          </td>
                          <td className="hg-actions">
                            <button type="button" className="hg-btn hg-btn-sm" onClick={() => abrirConfig(c)}>
                              Horas
                            </button>
                            <button
                              type="button"
                              className="hg-btn hg-btn-sm hg-btn-ghost"
                              onClick={() => setModalConfig({ open: true, item: c })}
                            >
                              Editar
                            </button>
                            <button type="button" className="hg-btn hg-btn-sm hg-btn-danger" onClick={() => eliminarConfig(c)}>
                              ✕
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="hg-panel">
              <div className="hg-panel-head">
                <h2>
                  Horas{' '}
                  {selectedConfig ? (
                    <span className="hg-muted">· {selectedConfig.nivel_nombre || selectedConfig.nombre}</span>
                  ) : null}
                </h2>
                {selectedConfig && (
                  <div className="hg-actions">
                    <button type="button" className="hg-btn hg-btn-sm hg-btn-ghost" onClick={seedSecundaria}>
                      Seed ejemplo
                    </button>
                    <button
                      type="button"
                      className="hg-btn hg-btn-primary hg-btn-sm"
                      onClick={() =>
                        setModalBloque({
                          open: true,
                          mode: 'create',
                          item: {
                            nombre: '',
                            hora_inicio: '07:40',
                            hora_fin: '08:20',
                            tipo: 'CLASS',
                            orden: (bloques[bloques.length - 1]?.orden || 0) + 1,
                            activo: 1,
                          },
                        })
                      }
                    >
                      + Hora
                    </button>
                  </div>
                )}
              </div>

              {!selectedConfig ? (
                <p className="hg-muted">Selecciona un nivel (botón Horas) para editar su estructura horaria.</p>
              ) : bloques.length === 0 ? (
                <p className="hg-muted">Sin horas. Agrega manualmente o usa “Seed ejemplo”.</p>
              ) : (
                <div className="hg-blocks">
                  {bloques.map((b) => (
                    <div key={b.id} className={`hg-block hg-block--${String(b.tipo || 'CLASS').toLowerCase()}`}>
                      <div>
                        <strong>{b.nombre}</strong>
                        <span className="hg-block-type">{labelTipoBloque(b.tipo)}</span>
                      </div>
                      <div className="hg-block-time">
                        {fmtTime(b.hora_inicio)} – {fmtTime(b.hora_fin)}
                      </div>
                      <div className="hg-actions">
                        <button
                          type="button"
                          className="hg-btn hg-btn-sm hg-btn-ghost"
                          onClick={() => setModalBloque({ open: true, mode: 'edit', item: b })}
                        >
                          Editar
                        </button>
                        <button type="button" className="hg-btn hg-btn-sm hg-btn-danger" onClick={() => eliminarBloque(b)}>
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

      </div>

      {modalConfig.open && (
        <ConfigModal
          anio={anio}
          niveles={meta.niveles || []}
          item={modalConfig.item}
          saving={saving}
          existingNivelIds={configs.map((c) => Number(c.nivel_id))}
          onClose={() => setModalConfig({ open: false, item: null })}
          onSave={async (payload) => {
            try {
              setSaving(true);
              if (modalConfig.item?.id) {
                await api.put(`${API}/configs/${modalConfig.item.id}`, payload);
              } else {
                await api.post(`${API}/configs`, { ...payload, anio });
              }
              setModalConfig({ open: false, item: null });
              await cargarConfigs(anio);
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

      {modalBloque.open && selectedConfig && (
        <BloqueModal
          mode={modalBloque.mode}
          item={modalBloque.item}
          saving={saving}
          onClose={() => setModalBloque({ open: false, mode: 'create', item: null })}
          onSave={async (payload) => {
            try {
              setSaving(true);
              if (modalBloque.mode === 'edit' && modalBloque.item?.id) {
                await api.put(`${API}/bloques/${modalBloque.item.id}`, payload);
              } else {
                await api.post(`${API}/configs/${selectedConfig.id}/bloques`, payload);
              }
              setModalBloque({ open: false, mode: 'create', item: null });
              await cargarBloques(selectedConfig.id);
              await cargarConfigs(anio);
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
    </DashboardLayout>
  );
}

function EditorPanel({ anio, niveles }) {
  const [nivelId, setNivelId] = useState('');
  const [versionId, setVersionId] = useState('');
  const [grupos, setGrupos] = useState([]);
  const [grupoId, setGrupoId] = useState('');
  const [board, setBoard] = useState(null);
  const [selectedCargaId, setSelectedCargaId] = useState(null);
  const [textoLibrePendiente, setTextoLibrePendiente] = useState('');
  const [modoTextoLibre, setModoTextoLibre] = useState(false);
  const [loading, setLoading] = useState(false);
  const [asegurando, setAsegurando] = useState(false);
  const [msg, setMsg] = useState('');
  const [generando, setGenerando] = useState(false);
  const [genProgress, setGenProgress] = useState(0);
  const [pdfDocenteOpen, setPdfDocenteOpen] = useState(false);
  const [pdfDocenteLoading, setPdfDocenteLoading] = useState(false);
  const [pdfDocenteExporting, setPdfDocenteExporting] = useState(false);
  const [pdfDocenteData, setPdfDocenteData] = useState(null);
  const [pdfDocenteSel, setPdfDocenteSel] = useState('all');

  useEffect(() => {
    if (!generando) return undefined;
    setGenProgress(3);
    const timer = setInterval(() => {
      setGenProgress((p) => {
        if (p >= 90) return p;
        const step = p < 25 ? 4 : p < 55 ? 2.5 : p < 75 ? 1.2 : 0.45;
        return Math.min(90, Math.round((p + step) * 10) / 10);
      });
    }, 320);
    return () => clearInterval(timer);
  }, [generando]);

  const asegurarHorarioNivel = useCallback(async (nivel) => {
    if (!anio || !nivel) {
      setVersionId('');
      return null;
    }
    try {
      setAsegurando(true);
      setMsg('');
      const { data } = await api.post(`${API}/versiones/asegurar`, {
        anio,
        nivel_id: Number(nivel),
      });
      const vid = data.version?.id ? String(data.version.id) : '';
      setVersionId(vid);
      return vid;
    } catch (e) {
      setVersionId('');
      setBoard(null);
      Swal.fire({
        icon: 'error',
        title: 'No se pudo abrir el horario',
        text:
          e.response?.data?.error ||
          'Revisa la pestaña Configuración (bloques de hora del nivel).',
        ...swalOpts,
      });
      return null;
    } finally {
      setAsegurando(false);
    }
  }, [anio]);

  const cargarGrupos = useCallback(async () => {
    if (!anio || !nivelId) {
      setGrupos([]);
      return;
    }
    try {
      const { data } = await api.get(`${API}/grupos`, { params: { anio, nivel_id: nivelId } });
      setGrupos(data.grupos || []);
    } catch {
      setGrupos([]);
    }
  }, [anio, nivelId]);

  const cargarBoard = useCallback(async () => {
    if (!versionId || !grupoId) {
      setBoard(null);
      return;
    }
    try {
      setLoading(true);
      setMsg('');
      const { data } = await api.get(`${API}/editor`, {
        params: { version_id: versionId, grupo_id: grupoId },
      });
      setBoard(data);
    } catch (e) {
      setBoard(null);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: e.response?.data?.error || 'No se pudo cargar el editor',
        ...swalOpts,
      });
    } finally {
      setLoading(false);
    }
  }, [versionId, grupoId]);

  useEffect(() => {
    setGrupoId('');
    setBoard(null);
    setVersionId('');
    cargarGrupos();
    if (nivelId) asegurarHorarioNivel(nivelId);
  }, [nivelId, cargarGrupos, asegurarHorarioNivel]);

  useEffect(() => {
    cargarBoard();
  }, [cargarBoard]);

  const limpiarGrupo = async () => {
    if (!versionId || !grupoId) return;
    const conf = await Swal.fire({
      icon: 'warning',
      title: '¿Limpiar horario de este grupo?',
      text: 'Se quitan las clases de este aula. El esqueleto de horas se mantiene.',
      showCancelButton: true,
      confirmButtonText: 'Sí, limpiar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#b91c1c',
      ...swalOpts,
    });
    if (!conf.isConfirmed) return;
    try {
      await api.delete(`${API}/entradas/grupo`, {
        params: { version_id: Number(versionId), grupo_id: Number(grupoId) },
      });
      await cargarBoard();
      Swal.fire({
        icon: 'success',
        title: 'Grupo limpio',
        timer: 1400,
        showConfirmButton: false,
        ...swalOpts,
      });
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: e.response?.data?.error || 'No se pudo limpiar',
        ...swalOpts,
      });
    }
  };

  const entradaEn = (dia, bloqueId) =>
    (board?.entradas || []).find(
      (e) => Number(e.dia_semana) === Number(dia) && Number(e.bloque_id) === Number(bloqueId)
    );

  const colocar = async (dia, bloque) => {
    if (!versionId || !grupoId) return;
    if (bloque.tipo === 'BREAK' || bloque.tipo === 'LUNCH') {
      setMsg('No se puede colocar en recreo/almuerzo.');
      return;
    }

    const usarLibre = modoTextoLibre && String(textoLibrePendiente || '').trim();
    if (!usarLibre && !selectedCargaId) {
      setMsg('Selecciona un curso pendiente o activa Texto libre.');
      return;
    }

    try {
      const payload = {
        version_id: Number(versionId),
        dia_semana: dia,
        bloque_id: bloque.id,
        grupo_id: Number(grupoId),
      };
      if (usarLibre) {
        payload.texto_libre = String(textoLibrePendiente).trim().slice(0, 120);
      } else {
        payload.carga_id = Number(selectedCargaId);
      }
      await api.post(`${API}/entradas`, payload);
      setMsg('');
      await cargarBoard();
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'No se pudo colocar',
        text: e.response?.data?.error || 'Conflicto de horario',
        ...swalOpts,
      });
    }
  };

  const onDropCelda = async (e, dia, bloque) => {
    e.preventDefault();
    if (bloque.tipo === 'BREAK' || bloque.tipo === 'LUNCH') return;
    if (!versionId || !grupoId) return;

    const entradaId = e.dataTransfer.getData('entrada_id');
    const fromDia = e.dataTransfer.getData('from_dia');
    const fromBloque = e.dataTransfer.getData('from_bloque');
    if (
      entradaId &&
      String(fromDia) === String(dia) &&
      String(fromBloque) === String(bloque.id)
    ) {
      return;
    }

    if (entradaId) {
      const cargaIdDrag = e.dataTransfer.getData('carga_id');
      const textoLibreDrag = e.dataTransfer.getData('texto_libre');
      const conf = await Swal.fire({
        icon: 'question',
        title: '¿Mover o copiar?',
        html: 'Arrastraste una clase ya colocada.<br/><b>Mover</b> la cambia de celda.<br/><b>Copiar</b> deja la original y crea otra.',
        showDenyButton: true,
        showCancelButton: true,
        confirmButtonText: 'Mover',
        denyButtonText: 'Copiar',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#2563eb',
        denyButtonColor: '#0f766e',
        ...swalOpts,
      });
      if (conf.isDismissed) return;
      try {
        if (conf.isConfirmed) {
          await api.put(`${API}/entradas/${entradaId}`, {
            dia_semana: dia,
            bloque_id: bloque.id,
          });
        } else if (conf.isDenied) {
          const payload = {
            version_id: Number(versionId),
            dia_semana: dia,
            bloque_id: bloque.id,
            grupo_id: Number(grupoId),
          };
          if (textoLibreDrag && !cargaIdDrag) {
            payload.texto_libre = textoLibreDrag;
          } else if (cargaIdDrag) {
            payload.carga_id = Number(cargaIdDrag);
          } else {
            throw new Error('No se puede copiar esta celda');
          }
          await api.post(`${API}/entradas`, payload);
        }
        await cargarBoard();
      } catch (err) {
        Swal.fire({
          icon: 'error',
          title: conf.isConfirmed ? 'No se pudo mover' : 'No se pudo copiar',
          text: err.response?.data?.error || err.message || 'Conflicto',
          ...swalOpts,
        });
      }
      return;
    }

    const cargaId = e.dataTransfer.getData('carga_id') || selectedCargaId;
    if (!cargaId) return;
    setModoTextoLibre(false);
    setSelectedCargaId(Number(cargaId));
    try {
      await api.post(`${API}/entradas`, {
        version_id: Number(versionId),
        dia_semana: dia,
        bloque_id: bloque.id,
        grupo_id: Number(grupoId),
        carga_id: Number(cargaId),
      });
      await cargarBoard();
    } catch (err) {
      Swal.fire({
        icon: 'error',
        title: 'No se pudo colocar',
        text: err.response?.data?.error || 'Conflicto',
        ...swalOpts,
      });
    }
  };

  const activarTextoLibre = async () => {
    const conf = await Swal.fire({
      icon: 'question',
      title: 'Texto libre',
      html: 'Ejemplos: <b>Tutoría</b>, Asamblea, Orientación…<br/>No crea curso ni aparece en libreta.',
      input: 'text',
      inputValue: textoLibrePendiente || 'Tutoría',
      inputPlaceholder: 'Tutoría',
      showCancelButton: true,
      confirmButtonText: 'Usar este texto',
      cancelButtonText: 'Cancelar',
      ...swalOpts,
      inputValidator: (v) => {
        if (!String(v || '').trim() || String(v).trim().length < 2) return 'Escribe al menos 2 caracteres';
        return null;
      },
    });
    if (!conf.isConfirmed) return;
    setTextoLibrePendiente(String(conf.value).trim().slice(0, 120));
    setModoTextoLibre(true);
    setSelectedCargaId(null);
    setMsg('Texto libre listo: haz clic en una celda vacía de clase.');
  };

  const quitar = async (entrada) => {
    try {
      await api.delete(`${API}/entradas/${entrada.id}`);
      await cargarBoard();
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: e.response?.data?.error || 'No se pudo quitar',
        ...swalOpts,
      });
    }
  };

  const toggleLock = async (entrada) => {
    try {
      await api.patch(`${API}/entradas/${entrada.id}/lock`, {
        locked: esActivo(entrada.locked) ? 0 : 1,
      });
      await cargarBoard();
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: e.response?.data?.error || 'No se pudo bloquear',
        ...swalOpts,
      });
    }
  };

  const pendientes = (board?.cargas || []).filter((c) => c.faltan > 0);
  const completos = (board?.cargas || []).filter((c) => c.faltan <= 0);
  const grupoSel = grupos.find((g) => String(g.id) === String(grupoId));
  const nivelSel = niveles.find((n) => String(n.id) === String(nivelId));

  const publicarEsteGrupo = async () => {
    if (!versionId || !grupoId || !grupoSel) return;
    const conf = await Swal.fire({
      icon: 'warning',
      title: '¿Publicar como horario principal?',
      html: `
        <p>Se reemplazará el horario actual del sistema para:</p>
        <p><strong>${labelGrupo(grupoSel)}</strong></p>
        <p style="margin-top:0.75rem;color:#b45309">Docentes y alumnos verán este horario. Escribe <b>PUBLICAR</b> para confirmar.</p>
      `,
      input: 'text',
      inputPlaceholder: 'PUBLICAR',
      showCancelButton: true,
      confirmButtonText: 'Sí, hacer principal',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#0f766e',
      ...swalOpts,
    });
    if (!conf.isConfirmed) return;
    if (String(conf.value || '').trim().toUpperCase() !== 'PUBLICAR') {
      Swal.fire({ icon: 'info', title: 'Cancelado', text: 'Debes escribir PUBLICAR exactamente.', ...swalOpts });
      return;
    }
    try {
      const { data } = await api.post(`${API}/versiones/${versionId}/vincular`, {
        confirmar: 'PUBLICAR',
        grupo_id: Number(grupoId),
      });
      await cargarBoard();
      await Swal.fire({
        icon: 'success',
        title: 'Ya es horario principal',
        text: data.message || 'Publicado',
        ...swalOpts,
      });
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'No se pudo publicar',
        text: e.response?.data?.error || 'Error',
        ...swalOpts,
      });
    }
  };

  const generarAutomatico = async () => {
    if (!nivelId) {
      Swal.fire({
        icon: 'info',
        title: 'Elige un nivel',
        text: 'Selecciona Primaria, Secundaria, etc.',
        ...swalOpts,
      });
      return;
    }
    const puedeSoloGrupo = Boolean(grupoId && grupoSel);
    const conf = await Swal.fire({
      icon: 'question',
      title: '¿Qué quieres generar?',
      html: `
        <p><b>Todo el nivel</b> (${nivelSel?.nombre || 'nivel'}): arma todos los grados a la vez.</p>
        ${
          puedeSoloGrupo
            ? `<p style="margin-top:0.5rem"><b>Solo este grupo</b> (${labelGrupo(grupoSel)}): regenera solo este aula y respeta lo ya puesto en los demás.</p>`
            : `<p style="margin-top:0.5rem;color:#64748b">Elige un grupo/aula si quieres generar solo uno.</p>`
        }
        <p style="margin-top:0.5rem;color:#64748b;font-size:0.9rem">En ambos casos no choca docentes con otros niveles ni con aulas ya armadas.</p>
      `,
      showDenyButton: puedeSoloGrupo,
      showCancelButton: true,
      confirmButtonText: 'Todo el nivel',
      denyButtonText: 'Solo este grupo',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#2563eb',
      denyButtonColor: '#0f766e',
      ...swalOpts,
    });
    if (conf.isDismissed) return;
    const soloEsteGrupo = conf.isDenied;
    if (soloEsteGrupo && !grupoId) return;
    try {
      setGenerando(true);
      setGenProgress(3);
      let vid = versionId;
      if (!vid) {
        vid = await asegurarHorarioNivel(nivelId);
        if (!vid) {
          setGenerando(false);
          return;
        }
      }
      const payload = {
        anio,
        nivel_id: Number(nivelId),
        max_alternatives: 1,
        version_id: Number(vid),
      };
      if (soloEsteGrupo) payload.grupo_ids = [Number(grupoId)];
      const { data } = await api.post(`${API}/solver/generar`, payload);
      setGenProgress(100);
      const bestId = data.best?.version_id || data.alternatives?.[0]?.version_id;
      if (bestId) setVersionId(String(bestId));
      await new Promise((r) => setTimeout(r, 280));
      setGenerando(false);
      if (data.estado === 'COMPLETE') {
        Swal.fire({
          icon: 'success',
          title: soloEsteGrupo ? 'Grupo generado' : 'Nivel generado',
          text: data.best
            ? `${data.best.placed}/${data.best.total} horas · score ${data.best.score}%`
            : 'Listo. Ya puedes editar o descargar PDF.',
          ...swalOpts,
        });
      } else {
        Swal.fire({
          icon: 'warning',
          title: 'Generación parcial',
          text: 'Completa lo que falte a mano en la grilla.',
          ...swalOpts,
        });
      }
      await cargarBoard();
    } catch (e) {
      setGenerando(false);
      Swal.fire({
        icon: 'error',
        title: 'No se pudo generar',
        text: e.response?.data?.error || 'Error del solver',
        ...swalOpts,
      });
    }
  };

  const descargarPdf = () => {
    if (!board || !grupoSel) return;
    try {
      exportarHorarioGenPDF({
        titulo: labelGrupo(grupoSel),
        anio,
        subtituloExtra: 'Grupo',
        bloques: board.bloques || [],
        entradas: board.entradas || [],
        modo: 'grupo',
      });
      Swal.fire({
        icon: 'success',
        title: 'PDF generado',
        timer: 1400,
        showConfirmButton: false,
        ...swalOpts,
      });
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: e.message || 'No se pudo generar el PDF',
        ...swalOpts,
      });
    }
  };

  const abrirPdfDocente = async () => {
    if (!anio) {
      Swal.fire({
        icon: 'info',
        title: 'Elige un año',
        text: 'Selecciona el año arriba para exportar horarios por docente.',
        ...swalOpts,
      });
      return;
    }
    setPdfDocenteOpen(true);
    setPdfDocenteLoading(true);
    setPdfDocenteData(null);
    setPdfDocenteSel('all');
    try {
      const { data } = await api.get(`${API}/pdf-docentes`, {
        params: { anio },
      });
      const docentes = (data.docentes || []).filter((d) => d.personal_id);
      setPdfDocenteData({
        bloques: data.bloques || [],
        docentes,
        versiones_usadas: data.versiones_usadas || [],
        aviso: data.aviso || '',
      });
      if (docentes.length === 1) {
        setPdfDocenteSel(String(docentes[0].personal_id));
      }
    } catch (e) {
      setPdfDocenteOpen(false);
      Swal.fire({
        icon: 'error',
        title: 'No se pudo cargar',
        text: e.response?.data?.error || 'Error al obtener docentes del año',
        ...swalOpts,
      });
    } finally {
      setPdfDocenteLoading(false);
    }
  };

  const exportarPdfDocente = async () => {
    if (!pdfDocenteData?.docentes?.length) {
      Swal.fire({
        icon: 'info',
        title: 'Sin docentes',
        text: 'No hay clases con docente en las versiones del año.',
        ...swalOpts,
      });
      return;
    }
    try {
      setPdfDocenteExporting(true);
      const { bloques, docentes } = pdfDocenteData;
      if (pdfDocenteSel === 'all') {
        exportarHorarioGenPDFMultiple({
          anio,
          bloques,
          items: docentes,
          modo: 'docente',
        });
      } else {
        const docu = docentes.find((d) => String(d.personal_id) === String(pdfDocenteSel));
        if (!docu) throw new Error('Docente no encontrado');
        exportarHorarioGenPDF({
          titulo: docu.nombre,
          anio,
          subtituloExtra: 'Docente',
          bloques,
          entradas: docu.entradas || [],
          modo: 'docente',
        });
      }
      setPdfDocenteOpen(false);
      Swal.fire({
        icon: 'success',
        title: 'PDF generado',
        timer: 1400,
        showConfirmButton: false,
        ...swalOpts,
      });
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: e.message || 'No se pudo generar el PDF',
        ...swalOpts,
      });
    } finally {
      setPdfDocenteExporting(false);
    }
  };

  return (
    <div>
      {generando &&
        createPortal(
          <div className="hg-gen-overlay" role="status" aria-live="polite" aria-busy="true">
            <div className="hg-gen-card">
              <div className="hg-gen-spinner" aria-hidden />
              <p className="hg-gen-kicker">Generando horario</p>
              <h3>{labelGrupo(grupoSel) || 'Grupo'}</h3>
              <div className="hg-gen-pct">{Math.min(100, Math.round(genProgress))}%</div>
              <div className="hg-gen-bar" aria-hidden>
                <div className="hg-gen-bar-fill" style={{ width: `${Math.min(100, genProgress)}%` }} />
              </div>
              <p className="hg-gen-step">
                {genProgress < 30
                  ? 'Analizando carga y disponibilidad…'
                  : genProgress < 60
                    ? 'Colocando horas seguidas (dobles)…'
                    : genProgress < 90
                      ? 'Ajustando conflictos de docentes…'
                      : genProgress >= 100
                        ? '¡Listo!'
                        : 'Casi terminamos…'}
              </p>
              <p className="hg-gen-hint">No cierres ni recargues la página</p>
            </div>
          </div>,
          document.body
        )}
      <section className="hg-panel" style={{ marginBottom: '1rem' }}>
        <div className="hg-panel-head">
          <h2>Horario · {anio}</h2>
          <div className="hg-actions">
            <button
              type="button"
              className="hg-btn hg-btn-primary"
              disabled={generando || !nivelId}
              onClick={generarAutomatico}
            >
              {generando ? 'Generando…' : '✨ Generar automático'}
            </button>
            {versionId && grupoId && (
              <button type="button" className="hg-btn hg-btn-danger hg-btn-sm" onClick={limpiarGrupo}>
                Limpiar este grupo
              </button>
            )}
            {board && (
              <>
                <button type="button" className="hg-btn hg-btn-sm" onClick={descargarPdf}>
                  Descargar PDF
                </button>
                <button
                  type="button"
                  className="hg-btn hg-btn-sm"
                  onClick={abrirPdfDocente}
                  title="Exporta el horario del docente en todos los niveles del año (Inicial, Primaria, Secundaria…)"
                >
                  PDF por docente
                </button>
              </>
            )}
            {!board && (
              <button
                type="button"
                className="hg-btn hg-btn-sm"
                onClick={abrirPdfDocente}
                title="Exporta el horario del docente en todos los niveles del año (Inicial, Primaria, Secundaria…)"
              >
                PDF por docente
              </button>
            )}
          </div>
        </div>
        <div className="hg-filters">
          <label>
            Nivel *
            <select value={nivelId} onChange={(e) => setNivelId(e.target.value)}>
              <option value="">— Elegir —</option>
              {niveles.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.nombre}
                </option>
              ))}
            </select>
          </label>
          <label>
            Grupo / aula *
            <select value={grupoId} onChange={(e) => setGrupoId(e.target.value)} disabled={!nivelId}>
              <option value="">— Elegir —</option>
              {grupos.map((g) => (
                <option key={g.id} value={g.id}>
                  {labelGrupo(g)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="hg-muted" style={{ margin: '0.5rem 0 0' }}>
          Elige nivel y grupo: se abre el horario automáticamente. Genera todo el nivel o edita a mano
          celda por celda.
        </p>
        {msg && <p className="hg-error">{msg}</p>}
      </section>

      {versionId && grupoSel && (
        <div className="hg-grupo-banner">
          <div>
            <p className="hg-eyebrow">Estás editando el horario de</p>
            <h3>{labelGrupo(grupoSel)}</h3>
            <p className="hg-muted" style={{ margin: '0.25rem 0 0' }}>
              {nivelSel?.nombre || 'Nivel'} · {anio}
            </p>
          </div>
          <button type="button" className="hg-btn hg-btn-primary" onClick={publicarEsteGrupo}>
            Hacer horario principal de este grupo
          </button>
        </div>
      )}

      {!nivelId ? (
        <p className="hg-muted">Elige un nivel para abrir su horario.</p>
      ) : asegurando ? (
        <p className="hg-muted">Preparando horario del nivel…</p>
      ) : !grupoId ? (
        <p className="hg-muted">Elige el grupo/aula para ver la grilla de horas.</p>
      ) : !versionId ? (
        <p className="hg-muted">
          No se pudo abrir el horario. Revisa <strong>1. Configuración</strong> (bloques del nivel).
        </p>
      ) : loading ? (
        <p className="hg-muted">Cargando grilla…</p>
      ) : !board ? null : (
        <div className="hg-editor">
          <aside className="hg-panel hg-sidebar-carga">
            <h3>Pendientes · {labelGrupo(grupoSel)}</h3>
            <div className="hg-actions" style={{ marginBottom: '0.75rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                className={`hg-btn hg-btn-sm${modoTextoLibre ? ' hg-btn-primary' : ''}`}
                onClick={activarTextoLibre}
              >
                ✎ Texto libre
              </button>
              {modoTextoLibre && (
                <button
                  type="button"
                  className="hg-btn hg-btn-sm hg-btn-ghost"
                  onClick={() => {
                    setModoTextoLibre(false);
                    setMsg('');
                  }}
                >
                  Cancelar texto
                </button>
              )}
            </div>
            {modoTextoLibre && (
              <div className="hg-carga-chip hg-carga-chip--sel" style={{ borderLeftColor: '#0f766e' }}>
                <strong>{textoLibrePendiente}</strong>
                <span>Texto libre · no va a libreta</span>
                <small>Clic en una celda vacía para colocar</small>
              </div>
            )}
            {pendientes.length === 0 ? (
              <p className="hg-muted">Todas las cargas de este grupo están colocadas.</p>
            ) : (
              pendientes.map((c) => {
                const chipColor = resolveCursoColor(c.color, c.curso_nombre);
                return (
                <div
                  key={c.id}
                  className={`hg-carga-chip${Number(selectedCargaId) === Number(c.id) && !modoTextoLibre ? ' hg-carga-chip--sel' : ''}`}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('carga_id', String(c.id));
                    setSelectedCargaId(c.id);
                    setModoTextoLibre(false);
                  }}
                  onClick={() => {
                    setSelectedCargaId(c.id);
                    setModoTextoLibre(false);
                  }}
                  style={{
                    background: chipColor,
                    borderLeftColor: chipColor,
                  }}
                >
                  <strong>{c.curso_nombre || 'Curso'}</strong>
                  <span>
                    {c.colocados}/{c.bloques_semanales} · faltan {c.faltan}
                  </span>
                  <small>{c.docente_nombre || 'Sin docente'}</small>
                </div>
                );
              })
            )}
            {completos.length > 0 && (
              <>
                <h3 style={{ marginTop: '1rem' }}>Completos</h3>
                {completos.map((c) => {
                  const chipColor = resolveCursoColor(c.color, c.curso_nombre);
                  return (
                  <div
                    key={c.id}
                    className="hg-carga-chip hg-carga-chip--done"
                    style={{
                      background: chipColor,
                      borderLeftColor: chipColor,
                    }}
                  >
                    <strong>{c.curso_nombre}</strong>
                    <span>
                      {c.colocados}/{c.bloques_semanales}
                    </span>
                  </div>
                  );
                })}
              </>
            )}
          </aside>

          <div className="hg-panel hg-grid-wrap">
            <p className="hg-muted hg-drag-hint">
              Tip: arrastra una clase ya colocada a otra celda → elige <strong>Mover</strong> o <strong>Copiar</strong>.
            </p>
            <div className="hg-grid" style={{ ['--hg-cols']: DIAS.length }}>
              <div className="hg-grid-corner">Hora</div>
              {DIAS.map((d) => (
                <div key={d.value} className="hg-grid-day">
                  {d.label}
                </div>
              ))}
              {(board.bloques || []).map((b) => (
                <React.Fragment key={b.id}>
                  <div className={`hg-grid-block-label hg-block--${String(b.tipo).toLowerCase()}`}>
                    <strong>{b.nombre}</strong>
                    <span>
                      {fmtTime(b.hora_inicio)}–{fmtTime(b.hora_fin)}
                    </span>
                    <em>{labelTipoBloque(b.tipo)}</em>
                  </div>
                  {DIAS.map((d) => {
                    const ent = entradaEn(d.value, b.id);
                    const isBreak = b.tipo === 'BREAK' || b.tipo === 'LUNCH';
                    const cellColor = ent
                      ? resolveCursoColor(
                          ent.carga_color,
                          ent.curso_nombre || ent.texto_libre
                        )
                      : null;
                    return (
                      <div
                        key={`${d.value}-${b.id}`}
                        className={`hg-cell${isBreak ? ' hg-cell--break' : ''}${ent ? ' hg-cell--filled' : ''}`}
                        onDragOver={(e) => {
                          if (!isBreak) e.preventDefault();
                        }}
                        onDrop={(e) => {
                          if (!isBreak) onDropCelda(e, d.value, b);
                        }}
                        onClick={() => {
                          if (isBreak) return;
                          if (ent) return;
                          colocar(d.value, b);
                        }}
                      >
                        {isBreak ? (
                          <span className="hg-cell-muted">{labelTipoBloque(b.tipo)}</span>
                        ) : ent ? (
                          <div
                            className="hg-cell-card"
                            style={cellColor ? { background: cellColor } : undefined}
                            draggable={!esActivo(ent.locked)}
                            title={
                              esActivo(ent.locked)
                                ? 'Bloqueada: desbloquéala para mover'
                                : 'Arrastra para mover o copiar a otra celda'
                            }
                            onDragStart={(e) => {
                              if (esActivo(ent.locked)) {
                                e.preventDefault();
                                return;
                              }
                              e.stopPropagation();
                              e.dataTransfer.setData('entrada_id', String(ent.id));
                              e.dataTransfer.setData('from_dia', String(d.value));
                              e.dataTransfer.setData('from_bloque', String(b.id));
                              if (ent.carga_id) {
                                e.dataTransfer.setData('carga_id', String(ent.carga_id));
                              }
                              if (ent.texto_libre && !ent.carga_id) {
                                e.dataTransfer.setData('texto_libre', String(ent.texto_libre));
                              }
                              e.dataTransfer.effectAllowed = 'copyMove';
                            }}
                          >
                            <strong>{ent.curso_nombre || ent.texto_libre || 'Clase'}</strong>
                            <small>
                              {ent.texto_libre && !ent.carga_id
                                ? 'Texto libre'
                                : ent.docente_nombre || ''}
                            </small>
                            <div className="hg-actions">
                              <button
                                type="button"
                                className="hg-btn hg-btn-sm hg-btn-ghost"
                                title={esActivo(ent.locked) ? 'Desbloquear' : 'Bloquear'}
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  toggleLock(ent);
                                }}
                              >
                                {esActivo(ent.locked) ? '🔒' : '🔓'}
                              </button>
                              {!esActivo(ent.locked) && (
                                <button
                                  type="button"
                                  className="hg-btn hg-btn-sm hg-btn-danger"
                                  onClick={(ev) => {
                                    ev.stopPropagation();
                                    quitar(ent);
                                  }}
                                >
                                  ✕
                                </button>
                              )}
                            </div>
                          </div>
                        ) : (
                          <span className="hg-cell-muted">+</span>
                        )}
                      </div>
                    );
                  })}
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
      )}

      {pdfDocenteOpen && (
        <Overlay
          title="PDF por docente"
          onClose={() => !pdfDocenteExporting && setPdfDocenteOpen(false)}
          footer={
            <>
              <button
                type="button"
                className="hg-btn"
                disabled={pdfDocenteExporting}
                onClick={() => setPdfDocenteOpen(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="hg-btn hg-btn-primary"
                disabled={
                  pdfDocenteLoading ||
                  pdfDocenteExporting ||
                  !pdfDocenteData?.docentes?.length
                }
                onClick={exportarPdfDocente}
              >
                {pdfDocenteExporting ? 'Generando…' : 'Descargar PDF'}
              </button>
            </>
          }
        >
          {pdfDocenteLoading ? (
            <p className="hg-muted">Cargando docentes del año (todos los niveles)…</p>
          ) : !pdfDocenteData?.docentes?.length ? (
            <p className="hg-muted">
              No hay clases con docente en ninguna versión del año {anio}. Genera horarios en
              Inicial, Primaria y/o Secundaria primero.
            </p>
          ) : (
            <div className="hg-field">
              <label>
                Docente
                <select
                  value={pdfDocenteSel}
                  onChange={(e) => setPdfDocenteSel(e.target.value)}
                >
                  <option value="all">
                    Todos los docentes ({pdfDocenteData.docentes.length} hojas)
                  </option>
                  {pdfDocenteData.docentes.map((d) => (
                    <option key={d.personal_id} value={String(d.personal_id)}>
                      {d.nombre} · {(d.entradas || []).length} clases
                    </option>
                  ))}
                </select>
              </label>
              <p className="hg-muted" style={{ marginTop: '0.75rem' }}>
                Incluye <strong>todos los niveles</strong> del año (Inicial, Primaria, Secundaria…):
                si un docente enseña en varios, salen juntos en su hoja. Cada celda muestra curso y
                aula/grado.
              </p>
              {pdfDocenteData.versiones_usadas?.length > 0 && (
                <p className="hg-muted" style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
                  Versiones usadas:{' '}
                  {pdfDocenteData.versiones_usadas
                    .map((v) => `${v.nivel_nombre || 'Nivel'} (${v.estado})`)
                    .join(' · ')}
                </p>
              )}
            </div>
          )}
        </Overlay>
      )}
    </div>
  );
}

function CargaPanel({ anio, niveles, docentes }) {
  const [nivelId, setNivelId] = useState('');
  const [grupoId, setGrupoId] = useState('');
  const [grupos, setGrupos] = useState([]);
  const [cargas, setCargas] = useState([]);
  const [draft, setDraft] = useState([]);
  const [loading, setLoading] = useState(false);
  const [bloquesDefault, setBloquesDefault] = useState(2);
  const [saving, setSaving] = useState(false);
  const [modalCopiar, setModalCopiar] = useState(false);
  const [copiarOrigen, setCopiarOrigen] = useState('');
  const [copiarDestinos, setCopiarDestinos] = useState([]);
  const [copiando, setCopiando] = useState(false);

  const toDraftRow = (c) => ({
    id: c.id,
    grupo_label: c.grupo_label,
    curso_nombre: c.curso_nombre,
    color: c.color || '',
    personal_id: c.personal_id ? String(c.personal_id) : '',
    bloques_semanales: Number(c.bloques_semanales) || 1,
    bloques_consecutivos_min: Number(c.bloques_consecutivos_min) || 1,
    bloques_consecutivos_max: Number(c.bloques_consecutivos_max) || 2,
    no_partir: esActivo(c.no_partir),
    activo: esActivo(c.activo),
  });

  const snapshotKey = (r) =>
    [
      r.personal_id || '',
      Number(r.bloques_semanales) || 0,
      Number(r.bloques_consecutivos_min) || 0,
      Number(r.bloques_consecutivos_max) || 0,
      r.no_partir ? 1 : 0,
      r.activo ? 1 : 0,
    ].join('|');

  const cargarGrupos = useCallback(async () => {
    if (!anio) return;
    try {
      const params = { anio };
      if (nivelId) params.nivel_id = nivelId;
      const { data } = await api.get(`${API}/grupos`, { params });
      setGrupos(data.grupos || []);
    } catch {
      setGrupos([]);
    }
  }, [anio, nivelId]);

  const cargarCargas = useCallback(async () => {
    if (!anio) return;
    try {
      setLoading(true);
      const params = { anio };
      if (nivelId) params.nivel_id = nivelId;
      if (grupoId) params.grupo_id = grupoId;
      const { data } = await api.get(`${API}/carga`, { params });
      const list = data.cargas || [];
      setCargas(list);
      setDraft(list.map(toDraftRow));
    } catch (e) {
      setCargas([]);
      setDraft([]);
      if (e.response?.status !== 503) {
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: e.response?.data?.error || 'No se pudo cargar',
          ...swalOpts,
        });
      }
    } finally {
      setLoading(false);
    }
  }, [anio, nivelId, grupoId]);

  useEffect(() => {
    cargarGrupos();
  }, [cargarGrupos]);

  useEffect(() => {
    setGrupoId('');
  }, [nivelId]);

  useEffect(() => {
    cargarCargas();
  }, [cargarCargas]);

  const updateDraft = (id, patch) => {
    setDraft((rows) => rows.map((r) => (Number(r.id) === Number(id) ? { ...r, ...patch } : r)));
  };

  const dirtyRows = draft.filter((d) => {
    const orig = cargas.find((c) => Number(c.id) === Number(d.id));
    if (!orig) return false;
    return snapshotKey(d) !== snapshotKey(toDraftRow(orig));
  });

  const descartarCambios = () => {
    setDraft(cargas.map(toDraftRow));
  };

  const importar = async () => {
    if (dirtyRows.length) {
      const confDirty = await Swal.fire({
        icon: 'warning',
        title: 'Hay cambios sin guardar',
        text: 'Si importas ahora se perderán. ¿Continuar?',
        showCancelButton: true,
        confirmButtonText: 'Continuar',
        cancelButtonText: 'Cancelar',
        ...swalOpts,
      });
      if (!confDirty.isConfirmed) return;
    }
    const conf = await Swal.fire({
      icon: 'question',
      title: 'Importar desde Asignaturas',
      html: `Trae docente + curso + grupo del catálogo académico del año <b>${anio}</b>.<br/>Horas por defecto: <b>${bloquesDefault}</b>.`,
      showCancelButton: true,
      confirmButtonText: 'Importar',
      cancelButtonText: 'Cancelar',
      ...swalOpts,
    });
    if (!conf.isConfirmed) return;
    try {
      const { data } = await api.post(`${API}/carga/importar-asignaturas`, {
        anio,
        nivel_id: nivelId || undefined,
        grupo_id: grupoId || undefined,
        bloques_default: Number(bloquesDefault) || 2,
      });
      await cargarCargas();
      Swal.fire({
        icon: 'success',
        title: 'Importado',
        text: `Creadas: ${data.creadas} · Omitidas: ${data.omitidas} · Asignaturas: ${data.total_asignaturas}`,
        ...swalOpts,
      });
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: e.response?.data?.error || 'No se pudo importar',
        ...swalOpts,
      });
    }
  };

  const guardarTodo = async () => {
    if (!dirtyRows.length) {
      Swal.fire({ icon: 'info', title: 'Sin cambios', text: 'No hay nada que guardar.', ...swalOpts });
      return;
    }
    try {
      setSaving(true);
      await Promise.all(
        dirtyRows.map((row) => {
          const minC = Math.max(1, Number(row.bloques_consecutivos_min) || 1);
          const maxC = Math.max(minC, Number(row.bloques_consecutivos_max) || minC);
          return api.put(`${API}/carga/${row.id}`, {
            bloques_semanales: Math.max(1, Number(row.bloques_semanales) || 1),
            bloques_consecutivos_min: minC,
            bloques_consecutivos_max: maxC,
            personal_id: row.personal_id ? Number(row.personal_id) : null,
            no_partir: row.no_partir ? 1 : 0,
            activo: row.activo ? 1 : 0,
          });
        })
      );
      await cargarCargas();
      Swal.fire({
        icon: 'success',
        title: 'Guardado',
        text: `${dirtyRows.length} fila(s) actualizada(s).`,
        timer: 1600,
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

  const eliminar = async (row) => {
    const conf = await Swal.fire({
      icon: 'warning',
      title: '¿Eliminar carga?',
      text: `${row.curso_nombre || 'Curso'} · ${row.grupo_label}`,
      showCancelButton: true,
      confirmButtonText: 'Sí',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#b91c1c',
      ...swalOpts,
    });
    if (!conf.isConfirmed) return;
    try {
      await api.delete(`${API}/carga/${row.id}`);
      await cargarCargas();
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: e.response?.data?.error || 'No se pudo eliminar',
        ...swalOpts,
      });
    }
  };

  const abrirCopiarHoras = async () => {
    if (!grupos.length) {
      Swal.fire({
        icon: 'info',
        title: 'Sin grupos',
        text: 'Elige un nivel para ver las aulas disponibles.',
        ...swalOpts,
      });
      return;
    }
    if (dirtyRows.length) {
      const conf = await Swal.fire({
        icon: 'warning',
        title: 'Hay cambios sin guardar',
        text: 'Guarda o descarta antes de copiar horas entre grupos.',
        showCancelButton: true,
        confirmButtonText: 'Descartar y continuar',
        cancelButtonText: 'Cancelar',
        ...swalOpts,
      });
      if (!conf.isConfirmed) return;
      descartarCambios();
    }
    setCopiarOrigen('');
    setCopiarDestinos(grupoId ? [String(grupoId)] : []);
    setModalCopiar(true);
  };

  const ejecutarCopiarHoras = async () => {
    if (!copiarOrigen) {
      Swal.fire({ icon: 'info', title: 'Elige el grupo origen', ...swalOpts });
      return;
    }
    const destinos = copiarDestinos
      .map((id) => Number(id))
      .filter((id) => id && id !== Number(copiarOrigen));
    if (!destinos.length) {
      Swal.fire({
        icon: 'info',
        title: 'Elige al menos un destino',
        text: 'Marca las aulas/grados que recibirán Horas y Horas seguidas (sin docentes).',
        ...swalOpts,
      });
      return;
    }
    const origenLabel = labelGrupo(grupos.find((g) => String(g.id) === String(copiarOrigen)));
    const destLabels = destinos
      .map((id) => labelGrupo(grupos.find((g) => Number(g.id) === id)))
      .filter(Boolean);
    const conf = await Swal.fire({
      icon: 'question',
      title: '¿Copiar horas?',
      html: `
        <p>Se copiarán solo <b>Horas</b> y <b>Horas seguidas</b> (mismo curso).</p>
        <p><b>Origen:</b> ${origenLabel || copiarOrigen}</p>
        <p><b>Destinos (${destLabels.length}):</b> ${destLabels.slice(0, 8).join(', ')}${
          destLabels.length > 8 ? '…' : ''
        }</p>
        <p style="color:#b45309;margin-top:0.5rem">Los docentes de cada aula <b>no</b> se modifican.</p>
      `,
      showCancelButton: true,
      confirmButtonText: 'Sí, copiar',
      cancelButtonText: 'Cancelar',
      ...swalOpts,
    });
    if (!conf.isConfirmed) return;
    try {
      setCopiando(true);
      const { data } = await api.post(`${API}/carga/copiar-horas`, {
        anio,
        grupo_origen_id: Number(copiarOrigen),
        grupo_destino_ids: destinos,
      });
      setModalCopiar(false);
      await cargarCargas();
      Swal.fire({
        icon: 'success',
        title: 'Horas copiadas',
        text: `Actualizadas: ${data.actualizadas}${
          data.sin_match ? ` · Sin match de curso: ${data.sin_match}` : ''
        }`,
        ...swalOpts,
      });
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: e.response?.data?.error || 'No se pudo copiar',
        ...swalOpts,
      });
    } finally {
      setCopiando(false);
    }
  };

  const totalBloques = draft.reduce((sum, c) => sum + (Number(c.bloques_semanales) || 0), 0);
  const dirtyCount = dirtyRows.length;
  const destinosDisponibles = grupos.filter((g) => String(g.id) !== String(copiarOrigen));

  return (
    <div>
      <section className="hg-panel" style={{ marginBottom: '1rem' }}>
        <div className="hg-panel-head">
          <h2>Carga semanal · {anio}</h2>
          <div className="hg-actions">
            <label className="hg-inline-field">
              Horas def.
              <input
                type="number"
                min={1}
                max={20}
                value={bloquesDefault}
                onChange={(e) => setBloquesDefault(e.target.value)}
                style={{ width: 64 }}
              />
            </label>
            <button type="button" className="hg-btn hg-btn-primary" onClick={importar}>
              Importar asignaturas
            </button>
            <button type="button" className="hg-btn" onClick={abrirCopiarHoras} title="Copia Horas y Horas seguidas entre aulas/grados. No toca docentes.">
              Copiar horas…
            </button>
            <button type="button" className="hg-btn hg-btn-light" onClick={cargarCargas}>
              Actualizar
            </button>
          </div>
        </div>
        <div className="hg-filters">
          <label>
            Nivel
            <select value={nivelId} onChange={(e) => setNivelId(e.target.value)}>
              <option value="">Todos</option>
              {niveles.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.nombre}
                </option>
              ))}
            </select>
          </label>
          <label>
            Grupo / aula
            <select value={grupoId} onChange={(e) => setGrupoId(e.target.value)}>
              <option value="">Todos</option>
              {grupos.map((g) => (
                <option key={g.id} value={g.id}>
                  {labelGrupo(g)}
                </option>
              ))}
            </select>
          </label>
          <div className="hg-stat">
            <span>{draft.length} cargas</span>
            <strong>{totalBloques} horas/semana</strong>
          </div>
        </div>
      </section>

      {dirtyCount > 0 && (
        <div className="hg-save-bar">
          <span>
            <strong>{dirtyCount}</strong> cambio{dirtyCount === 1 ? '' : 's'} sin guardar
          </span>
          <div className="hg-actions">
            <button type="button" className="hg-btn hg-btn-ghost hg-btn-sm" disabled={saving} onClick={descartarCambios}>
              Descartar
            </button>
            <button type="button" className="hg-btn hg-btn-primary" disabled={saving} onClick={guardarTodo}>
              {saving ? 'Guardando…' : 'Guardar todo'}
            </button>
          </div>
        </div>
      )}

      <section className="hg-panel">
        {loading ? (
          <p className="hg-muted">Cargando…</p>
        ) : draft.length === 0 ? (
          <p className="hg-muted">
            Sin carga todavía. Usa <strong>Importar asignaturas</strong> o filtra otro nivel/grupo.
          </p>
        ) : (
          <div className="hg-table-wrap">
            <table className="hg-table hg-table--editable">
              <thead>
                <tr>
                  <th>Grupo</th>
                  <th>Curso</th>
                  <th>Docente</th>
                  <th className="hg-col-center">Horas</th>
                  <th className="hg-col-center">
                    <span className="hg-th-tip" title={TIP_HORAS_SEGUIDAS}>
                      Horas seguidas <em aria-hidden>?</em>
                    </span>
                  </th>
                  <th className="hg-col-center">
                    <span className="hg-th-tip" title={TIP_NO_PARTIR}>
                      No partir <em aria-hidden>?</em>
                    </span>
                  </th>
                  <th className="hg-col-center">Activo</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {draft.map((c) => {
                  const dirty = dirtyRows.some((d) => Number(d.id) === Number(c.id));
                  return (
                    <tr key={c.id} className={dirty ? 'hg-row-dirty' : undefined}>
                      <td>{c.grupo_label}</td>
                      <td>
                        <strong>{c.curso_nombre || '—'}</strong>
                        {c.color ? (
                          <span className="hg-color-dot" style={{ background: c.color, marginLeft: 6 }} />
                        ) : null}
                      </td>
                      <td>
                        <select
                          value={c.personal_id}
                          onChange={(e) => updateDraft(c.id, { personal_id: e.target.value })}
                        >
                          <option value="">—</option>
                          {docentes.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.nombre}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="hg-col-center">
                        <input
                          type="number"
                          min={1}
                          style={{ width: 64 }}
                          value={c.bloques_semanales}
                          onChange={(e) => updateDraft(c.id, { bloques_semanales: e.target.value })}
                        />
                      </td>
                      <td className="hg-col-center">
                        <div className="hg-actions" style={{ justifyContent: 'center' }}>
                          <input
                            type="number"
                            min={1}
                            style={{ width: 52 }}
                            value={c.bloques_consecutivos_min}
                            title="Mínimo de horas juntas"
                            onChange={(e) => updateDraft(c.id, { bloques_consecutivos_min: e.target.value })}
                          />
                          <span>/</span>
                          <input
                            type="number"
                            min={1}
                            style={{ width: 52 }}
                            value={c.bloques_consecutivos_max}
                            title="Máximo de horas juntas"
                            onChange={(e) => updateDraft(c.id, { bloques_consecutivos_max: e.target.value })}
                          />
                        </div>
                      </td>
                      <td className="hg-col-center">
                        <input
                          type="checkbox"
                          checked={!!c.no_partir}
                          onChange={(e) => updateDraft(c.id, { no_partir: e.target.checked })}
                          aria-label="No partir"
                          title={TIP_NO_PARTIR}
                        />
                      </td>
                      <td className="hg-col-center">
                        <input
                          type="checkbox"
                          checked={!!c.activo}
                          onChange={(e) => updateDraft(c.id, { activo: e.target.checked })}
                          aria-label="Activo"
                        />
                      </td>
                      <td className="hg-actions">
                        <button type="button" className="hg-btn hg-btn-sm hg-btn-danger" onClick={() => eliminar(c)}>
                          ✕
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {draft.length > 0 && (
          <div className="hg-actions" style={{ marginTop: '1rem', justifyContent: 'flex-end' }}>
            <button type="button" className="hg-btn hg-btn-ghost" disabled={!dirtyCount || saving} onClick={descartarCambios}>
              Descartar
            </button>
            <button type="button" className="hg-btn hg-btn-primary" disabled={!dirtyCount || saving} onClick={guardarTodo}>
              {saving ? 'Guardando…' : dirtyCount ? `Guardar todo (${dirtyCount})` : 'Guardar todo'}
            </button>
          </div>
        )}
      </section>

      {modalCopiar && (
        <Overlay
          title="Copiar horas (sin docentes)"
          size="lg"
          onClose={() => !copiando && setModalCopiar(false)}
          footer={
            <>
              <span className="hg-copiar-footer-meta">
                {copiarDestinos.filter((id) => id !== String(copiarOrigen)).length} destino
                {copiarDestinos.filter((id) => id !== String(copiarOrigen)).length === 1 ? '' : 's'}
              </span>
              <button type="button" className="hg-btn hg-btn-ghost" disabled={copiando} onClick={() => setModalCopiar(false)}>
                Cancelar
              </button>
              <button type="button" className="hg-btn hg-btn-primary" disabled={copiando} onClick={ejecutarCopiarHoras}>
                {copiando ? 'Copiando…' : 'Copiar horas'}
              </button>
            </>
          }
        >
          <div className="hg-copiar">
            <div className="hg-copiar-banner">
              <strong>Qué se copia:</strong> solo Horas y Horas seguidas del mismo curso.
              <br />
              <strong>Qué no:</strong> los docentes de cada aula se mantienen.
            </div>

            <label className="hg-copiar-field">
              <span>Grupo origen</span>
              <select
                value={copiarOrigen}
                onChange={(e) => {
                  const v = e.target.value;
                  setCopiarOrigen(v);
                  setCopiarDestinos((prev) => prev.filter((id) => id !== v));
                }}
              >
                <option value="">— Elegir aula de donde se copian las horas —</option>
                {grupos.map((g) => (
                  <option key={g.id} value={g.id}>
                    {labelGrupo(g)}
                  </option>
                ))}
              </select>
            </label>

            <div className="hg-copiar-destinos">
              <div className="hg-copiar-destinos-head">
                <div>
                  <strong>Grupos destino</strong>
                  <p className="hg-muted">Marca las aulas/grados que recibirán el formato de horas.</p>
                </div>
                <div className="hg-actions">
                  <button
                    type="button"
                    className="hg-btn hg-btn-sm"
                    disabled={!destinosDisponibles.length}
                    onClick={() => setCopiarDestinos(destinosDisponibles.map((g) => String(g.id)))}
                  >
                    Marcar todos
                  </button>
                  <button type="button" className="hg-btn hg-btn-sm hg-btn-ghost" onClick={() => setCopiarDestinos([])}>
                    Ninguno
                  </button>
                </div>
              </div>

              <div className="hg-destino-list">
                {destinosDisponibles.length === 0 ? (
                  <p className="hg-destino-empty">Elige un origen para ver las demás aulas del nivel filtrado.</p>
                ) : (
                  destinosDisponibles.map((g) => {
                    const id = String(g.id);
                    const checked = copiarDestinos.includes(id);
                    return (
                      <label key={g.id} className={`hg-destino-item${checked ? ' hg-destino-item--on' : ''}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setCopiarDestinos((prev) =>
                              checked ? prev.filter((x) => x !== id) : [...prev, id]
                            )
                          }
                        />
                        <span>{labelGrupo(g)}</span>
                      </label>
                    );
                  })
                )}
              </div>
            </div>

            <p className="hg-copiar-tip">
              Tip: filtra por <strong>Nivel</strong> arriba para listar solo Primaria o Secundaria. Ejemplo: origen 1º A →
              destino 1º B (o varios grados a la vez).
            </p>
          </div>
        </Overlay>
      )}
    </div>
  );
}

function DisponibilidadPanel({ anio, docentes }) {
  const [personalId, setPersonalId] = useState('');
  const [dias, setDias] = useState([]);
  const [resumen, setResumen] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Una sola fila por personal_id (por si meta trae duplicados)
  const docentesUnicos = [];
  const seenDoc = new Set();
  for (const d of docentes || []) {
    const id = Number(d.id);
    if (!id || seenDoc.has(id)) continue;
    seenDoc.add(id);
    docentesUnicos.push(d);
  }

  const configuradosIds = new Set(
    (resumen || []).map((r) => Number(r.personal_id)).filter(Boolean)
  );
  // Combobox: solo pendientes; si estás editando uno ya configurado, lo incluye
  const docentesCombo = docentesUnicos.filter(
    (d) => !configuradosIds.has(Number(d.id)) || String(d.id) === String(personalId)
  );
  const docentesPendientes = docentesUnicos.filter((d) => !configuradosIds.has(Number(d.id)));
  const docenteActual =
    docentesUnicos.find((d) => String(d.id) === String(personalId)) ||
    resumen.find((r) => String(r.personal_id) === String(personalId));

  const cargarResumen = useCallback(async () => {
    if (!anio) return;
    try {
      const { data } = await api.get(`${API}/disponibilidad`, { params: { anio } });
      setResumen(data.resumen || []);
    } catch {
      setResumen([]);
    }
  }, [anio]);

  const cargarDocente = useCallback(async (pid) => {
    if (!anio || !pid) {
      setDias([]);
      return;
    }
    try {
      setLoading(true);
      const { data } = await api.get(`${API}/disponibilidad`, {
        params: { anio, personal_id: pid },
      });
      setDias(
        (data.dias || []).map((d) => ({
          ...d,
          hora_desde: fmtTime(d.hora_desde) === '—' ? '' : fmtTime(d.hora_desde),
          hora_hasta: fmtTime(d.hora_hasta) === '—' ? '' : fmtTime(d.hora_hasta),
        }))
      );
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: e.response?.data?.error || 'No se pudo cargar',
        ...swalOpts,
      });
    } finally {
      setLoading(false);
    }
  }, [anio]);

  useEffect(() => {
    cargarResumen();
  }, [cargarResumen]);

  useEffect(() => {
    if (personalId) cargarDocente(personalId);
    else setDias([]);
  }, [personalId, cargarDocente]);

  const setDia = (diaSemana, patch) => {
    setDias((prev) => prev.map((d) => (Number(d.dia_semana) === Number(diaSemana) ? { ...d, ...patch } : d)));
  };

  const aplicarLunesATodos = () => {
    const lun = dias.find((d) => Number(d.dia_semana) === 1);
    if (!lun) return;
    setDias((prev) =>
      prev.map((d) =>
        Number(d.dia_semana) === 1
          ? d
          : {
              ...d,
              estado: lun.estado,
              hora_desde: lun.hora_desde,
              hora_hasta: lun.hora_hasta,
            }
      )
    );
  };

  const guardar = async () => {
    if (!personalId) return;
    try {
      setSaving(true);
      await api.put(`${API}/disponibilidad`, {
        anio,
        personal_id: Number(personalId),
        dias: dias.map((d) => ({
          dia_semana: d.dia_semana,
          estado: d.estado,
          hora_desde: d.hora_desde || null,
          hora_hasta: d.hora_hasta || null,
          notas: d.notas || null,
        })),
      });
      await cargarResumen();
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
  };

  const limpiar = async () => {
    if (!personalId) return;
    const conf = await Swal.fire({
      icon: 'warning',
      title: '¿Quitar disponibilidad de este docente?',
      text: 'Solo borra en tablas piloto. Volverá a aparecer en el listado pendiente.',
      showCancelButton: true,
      confirmButtonText: 'Sí',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#b91c1c',
      ...swalOpts,
    });
    if (!conf.isConfirmed) return;
    try {
      await api.delete(`${API}/disponibilidad`, { params: { anio, personal_id: personalId } });
      setPersonalId('');
      setDias([]);
      await cargarResumen();
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: e.response?.data?.error || 'No se pudo eliminar',
        ...swalOpts,
      });
    }
  };

  return (
    <div className="hg-layout hg-layout--disp">
      <section className="hg-panel">
        <div className="hg-panel-head">
          <h2>Disponibilidad docente · {anio}</h2>
        </div>
        <label className="hg-field">
          Docente pendiente
          <select value={personalId} onChange={(e) => setPersonalId(e.target.value)}>
            <option value="">— Seleccionar —</option>
            {docentesCombo.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nombre}
                {configuradosIds.has(Number(d.id)) ? ' (editando)' : ''}
              </option>
            ))}
          </select>
        </label>
        <p className="hg-muted" style={{ marginTop: '0.35rem' }}>
          Solo aparecen quienes faltan por configurar ({docentesPendientes.length}). Cada docente tiene{' '}
          <strong>una</strong> disponibilidad por año: los ya guardados se editan desde la tabla de la derecha
          (no se crean configuraciones duplicadas).
        </p>
        {personalId && docenteActual && configuradosIds.has(Number(personalId)) && (
          <p className="hg-muted" style={{ marginTop: '0.25rem' }}>
            Editando: <strong>{docenteActual.nombre}</strong>
          </p>
        )}

        {loading ? (
          <p className="hg-muted">Cargando semana…</p>
        ) : !personalId ? (
          <p className="hg-muted">Elige un docente pendiente, o pulsa «Editar» en la tabla de la derecha.</p>
        ) : (
          <>
            <div className="hg-actions" style={{ marginBottom: '0.75rem' }}>
              <button type="button" className="hg-btn hg-btn-sm hg-btn-ghost" onClick={aplicarLunesATodos}>
                Copiar lunes → todos
              </button>
              <button type="button" className="hg-btn hg-btn-sm hg-btn-primary" disabled={saving} onClick={guardar}>
                {saving ? 'Guardando…' : 'Guardar semana'}
              </button>
              <button type="button" className="hg-btn hg-btn-sm hg-btn-danger" onClick={limpiar}>
                Limpiar
              </button>
            </div>
            <div className="hg-table-wrap">
              <table className="hg-table">
                <thead>
                  <tr>
                    <th>Día</th>
                    <th>Estado</th>
                    <th>Desde</th>
                    <th>Hasta</th>
                  </tr>
                </thead>
                <tbody>
                  {dias.map((d) => {
                    const needDesde =
                      d.estado === 'AVAILABLE' || d.estado === 'CUSTOM_INTERVAL' || d.estado === 'AVAILABLE_FROM';
                    const needHasta =
                      d.estado === 'AVAILABLE' || d.estado === 'CUSTOM_INTERVAL' || d.estado === 'AVAILABLE_UNTIL';
                    return (
                      <tr key={d.dia_semana}>
                        <td>
                          <strong>{DIAS.find((x) => x.value === Number(d.dia_semana))?.label || d.dia_semana}</strong>
                        </td>
                        <td>
                          <select value={d.estado} onChange={(e) => setDia(d.dia_semana, { estado: e.target.value })}>
                            {ESTADOS_DISP.map((e) => (
                              <option key={e.value} value={e.value}>
                                {e.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <input
                            type="time"
                            disabled={!needDesde}
                            value={needDesde ? d.hora_desde || '' : ''}
                            onChange={(e) => setDia(d.dia_semana, { hora_desde: e.target.value })}
                          />
                        </td>
                        <td>
                          <input
                            type="time"
                            disabled={!needHasta}
                            value={needHasta ? d.hora_hasta || '' : ''}
                            onChange={(e) => setDia(d.dia_semana, { hora_hasta: e.target.value })}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section className="hg-panel">
        <div className="hg-panel-head">
          <h2>Ya configurados ({resumen.length})</h2>
        </div>
        {resumen.length === 0 ? (
          <p className="hg-muted">Ningún docente tiene disponibilidad guardada este año.</p>
        ) : (
          <div className="hg-table-wrap">
            <table className="hg-table">
              <thead>
                <tr>
                  <th>Docente</th>
                  <th>Días</th>
                  <th>No disp.</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {resumen.map((r) => (
                  <tr
                    key={r.personal_id}
                    className={String(r.personal_id) === String(personalId) ? 'hg-row-active' : undefined}
                  >
                    <td className="rs-nombre">{r.nombre || r.personal_id}</td>
                    <td>{r.dias_configurados}</td>
                    <td>{r.dias_no_disponibles}</td>
                    <td>
                      <button
                        type="button"
                        className="hg-btn hg-btn-sm"
                        onClick={() => setPersonalId(String(r.personal_id))}
                      >
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function ConfigModal({ anio, niveles, item, saving, existingNivelIds, onClose, onSave }) {
  const isEdit = Boolean(item?.id);
  const disponibles = isEdit
    ? niveles
    : niveles.filter((n) => !existingNivelIds.includes(Number(n.id)));
  const [form, setForm] = useState(() => ({
    nivel_id: item?.nivel_id || disponibles[0]?.id || '',
    nombre: item?.nombre || '',
    hora_ingreso: fmtTime(item?.hora_ingreso) === '—' ? '07:40' : fmtTime(item?.hora_ingreso) || '07:40',
    hora_salida: fmtTime(item?.hora_salida) === '—' ? '14:00' : fmtTime(item?.hora_salida) || '14:00',
    activo: esActivo(item?.activo ?? 1),
    notas: item?.notas || '',
  }));
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Overlay
      title={isEdit ? 'Editar configuración' : `Nueva config · ${anio}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="hg-btn hg-btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="hg-btn hg-btn-primary"
            disabled={saving || !form.nivel_id}
            onClick={() =>
              onSave({
                nivel_id: Number(form.nivel_id),
                nombre: form.nombre,
                hora_ingreso: form.hora_ingreso,
                hora_salida: form.hora_salida,
                activo: form.activo ? 1 : 0,
                notas: form.notas,
              })
            }
          >
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </>
      }
    >
      <div className="hg-form">
        <label>
          Nivel *
          <select
            value={form.nivel_id}
            disabled={isEdit}
            onChange={(e) => {
              const id = e.target.value;
              const nv = niveles.find((n) => String(n.id) === String(id));
              set('nivel_id', id);
              if (!form.nombre && nv) set('nombre', nv.nombre);
            }}
          >
            {disponibles.map((n) => (
              <option key={n.id} value={n.id}>
                {n.nombre}
              </option>
            ))}
          </select>
        </label>
        <label>
          Nombre
          <input value={form.nombre} onChange={(e) => set('nombre', e.target.value)} />
        </label>
        <label>
          Hora ingreso
          <input type="time" value={form.hora_ingreso} onChange={(e) => set('hora_ingreso', e.target.value)} />
        </label>
        <label>
          Hora salida
          <input type="time" value={form.hora_salida} onChange={(e) => set('hora_salida', e.target.value)} />
        </label>
        <label className="hg-check">
          <input type="checkbox" checked={form.activo} onChange={(e) => set('activo', e.target.checked)} />
          Activo
        </label>
        <label className="hg-full">
          Notas
          <textarea rows={2} value={form.notas} onChange={(e) => set('notas', e.target.value)} />
        </label>
      </div>
    </Overlay>
  );
}

function BloqueModal({ mode, item, saving, onClose, onSave }) {
  const [form, setForm] = useState(() => ({
    nombre: item?.nombre || '',
    hora_inicio: fmtTime(item?.hora_inicio) === '—' ? '07:40' : fmtTime(item?.hora_inicio),
    hora_fin: fmtTime(item?.hora_fin) === '—' ? '08:20' : fmtTime(item?.hora_fin),
    tipo: item?.tipo || 'CLASS',
    orden: item?.orden ?? 1,
    activo: esActivo(item?.activo ?? 1),
  }));
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Overlay
      title={mode === 'edit' ? 'Editar hora' : 'Nueva hora'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="hg-btn hg-btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="hg-btn hg-btn-primary"
            disabled={saving}
            onClick={() =>
              onSave({
                nombre: form.nombre,
                hora_inicio: form.hora_inicio,
                hora_fin: form.hora_fin,
                tipo: form.tipo,
                orden: Number(form.orden) || 0,
                activo: form.activo ? 1 : 0,
              })
            }
          >
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </>
      }
    >
      <div className="hg-form">
        <label className="hg-full">
          Nombre *
          <input value={form.nombre} onChange={(e) => set('nombre', e.target.value)} placeholder="Primera Hora" />
        </label>
        <label>
          Inicio *
          <input type="time" value={form.hora_inicio} onChange={(e) => set('hora_inicio', e.target.value)} />
        </label>
        <label>
          Fin *
          <input type="time" value={form.hora_fin} onChange={(e) => set('hora_fin', e.target.value)} />
        </label>
        <label>
          Tipo *
          <select value={form.tipo} onChange={(e) => set('tipo', e.target.value)}>
            {TIPOS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Orden
          <input type="number" value={form.orden} onChange={(e) => set('orden', e.target.value)} />
        </label>
        <label className="hg-check">
          <input type="checkbox" checked={form.activo} onChange={(e) => set('activo', e.target.checked)} />
          Activo
        </label>
      </div>
    </Overlay>
  );
}
