import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Swal from 'sweetalert2';
import DashboardLayout from '../../components/DashboardLayout';
import api from '../../services/api';
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
];

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

function Overlay({ title, onClose, children, footer }) {
  return createPortal(
    <div className="hg-overlay" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="hg-modal" role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
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
      title: '¿Eliminar bloque?',
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
      title: 'Cargar bloques ejemplo (Secundaria)',
      text: 'Solo si la config aún no tiene bloques. No afecta grupos_horarios.',
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
            <p className="hg-eyebrow">Módulo piloto · aislado</p>
            <h1>Generar Horarios</h1>
            <p className="hg-sub">
              Configuración por año y nivel. No modifica el horario actual del sistema (`grupos_horarios`).
            </p>
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

        <div className="hg-banner">
          🧪 Piloto: tablas <code>horario_gen_*</code>. El horario que ven docentes/alumnos hoy no se toca.
        </div>

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
                        <th>Bloques</th>
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
                              Bloques
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
                  Bloques{' '}
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
                      + Bloque
                    </button>
                  </div>
                )}
              </div>

              {!selectedConfig ? (
                <p className="hg-muted">Selecciona un nivel (botón Bloques) para editar su estructura horaria.</p>
              ) : bloques.length === 0 ? (
                <p className="hg-muted">Sin bloques. Agrega manualmente o usa “Seed ejemplo”.</p>
              ) : (
                <div className="hg-blocks">
                  {bloques.map((b) => (
                    <div key={b.id} className={`hg-block hg-block--${String(b.tipo || 'CLASS').toLowerCase()}`}>
                      <div>
                        <strong>{b.nombre}</strong>
                        <span className="hg-block-type">{b.tipo}</span>
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

        <section className="hg-roadmap">
          <h3>Fases del módulo (piloto)</h3>
          <ol>
            <li>✅ Configuración de bloques por año/nivel</li>
            <li>✅ Disponibilidad docente</li>
            <li>✅ Carga semanal (horas por curso/grupo)</li>
            <li>Editor drag &amp; drop</li>
            <li>Solver automático</li>
            <li>Cuando funcione → sincronizar a `grupos_horarios` (opt-in)</li>
          </ol>
        </section>
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

function CargaPanel({ anio, niveles, docentes }) {
  const [nivelId, setNivelId] = useState('');
  const [grupoId, setGrupoId] = useState('');
  const [grupos, setGrupos] = useState([]);
  const [cargas, setCargas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [bloquesDefault, setBloquesDefault] = useState(2);
  const [editId, setEditId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);

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
      setCargas(data.cargas || []);
    } catch (e) {
      setCargas([]);
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

  const importar = async () => {
    const conf = await Swal.fire({
      icon: 'question',
      title: 'Importar desde Asignaturas',
      html: `Trae docente + curso + grupo del catálogo académico del año <b>${anio}</b>.<br/>Bloques por defecto: <b>${bloquesDefault}</b>. No duplica si ya existe.`,
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

  const empezarEdit = (row) => {
    setEditId(row.id);
    setEditForm({
      bloques_semanales: row.bloques_semanales,
      bloques_consecutivos_min: row.bloques_consecutivos_min,
      bloques_consecutivos_max: row.bloques_consecutivos_max,
      personal_id: row.personal_id || '',
      color: row.color || '',
      activo: esActivo(row.activo),
    });
  };

  const guardarEdit = async () => {
    if (!editId) return;
    try {
      setSaving(true);
      await api.put(`${API}/carga/${editId}`, {
        bloques_semanales: Number(editForm.bloques_semanales) || 1,
        bloques_consecutivos_min: Number(editForm.bloques_consecutivos_min) || 1,
        bloques_consecutivos_max: Number(editForm.bloques_consecutivos_max) || 2,
        personal_id: editForm.personal_id ? Number(editForm.personal_id) : null,
        color: editForm.color || null,
        activo: editForm.activo ? 1 : 0,
      });
      setEditId(null);
      await cargarCargas();
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

  const totalBloques = cargas.reduce((s, c) => s + (Number(c.bloques_semanales) || 0), 0);

  return (
    <div>
      <section className="hg-panel" style={{ marginBottom: '1rem' }}>
        <div className="hg-panel-head">
          <h2>Carga semanal · {anio}</h2>
          <div className="hg-actions">
            <label className="hg-inline-field">
              Bloques def.
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
            <button type="button" className="hg-btn hg-btn-light" onClick={cargarCargas}>
              Actualizar
            </button>
          </div>
        </div>
        <p className="hg-muted" style={{ marginTop: 0 }}>
          Cuántos bloques semanales necesita cada curso en cada aula. Se importa desde{' '}
          <strong>Asignaturas</strong> del sistema (no modifica esas tablas).
        </p>
        <div className="hg-filters">
          <label>
            Nivel
            <select
              value={nivelId}
              onChange={(e) => setNivelId(e.target.value)}
            >
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
                  {g.nivel_nombre} {g.grado}
                  {g.seccion ? ` ${g.seccion}` : ''}
                </option>
              ))}
            </select>
          </label>
          <div className="hg-stat">
            <span>{cargas.length} cargas</span>
            <strong>{totalBloques} bloques/semana</strong>
          </div>
        </div>
      </section>

      <section className="hg-panel">
        {loading ? (
          <p className="hg-muted">Cargando…</p>
        ) : cargas.length === 0 ? (
          <p className="hg-muted">
            Sin carga todavía. Usa <strong>Importar asignaturas</strong> o filtra otro nivel/grupo.
          </p>
        ) : (
          <div className="hg-table-wrap">
            <table className="hg-table">
              <thead>
                <tr>
                  <th>Grupo</th>
                  <th>Curso</th>
                  <th>Docente</th>
                  <th>Bloques</th>
                  <th>Consec. min/max</th>
                  <th>Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {cargas.map((c) =>
                  editId === c.id ? (
                    <tr key={c.id} className="hg-row-active">
                      <td>{c.grupo_label}</td>
                      <td>{c.curso_nombre || '—'}</td>
                      <td>
                        <select
                          value={editForm.personal_id}
                          onChange={(e) => setEditForm((f) => ({ ...f, personal_id: e.target.value }))}
                        >
                          <option value="">—</option>
                          {docentes.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.nombre}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          type="number"
                          min={1}
                          style={{ width: 64 }}
                          value={editForm.bloques_semanales}
                          onChange={(e) => setEditForm((f) => ({ ...f, bloques_semanales: e.target.value }))}
                        />
                      </td>
                      <td>
                        <div className="hg-actions">
                          <input
                            type="number"
                            min={1}
                            style={{ width: 52 }}
                            value={editForm.bloques_consecutivos_min}
                            onChange={(e) =>
                              setEditForm((f) => ({ ...f, bloques_consecutivos_min: e.target.value }))
                            }
                          />
                          <input
                            type="number"
                            min={1}
                            style={{ width: 52 }}
                            value={editForm.bloques_consecutivos_max}
                            onChange={(e) =>
                              setEditForm((f) => ({ ...f, bloques_consecutivos_max: e.target.value }))
                            }
                          />
                        </div>
                      </td>
                      <td>
                        <label className="hg-check" style={{ marginTop: 0 }}>
                          <input
                            type="checkbox"
                            checked={editForm.activo}
                            onChange={(e) => setEditForm((f) => ({ ...f, activo: e.target.checked }))}
                          />
                          Activo
                        </label>
                      </td>
                      <td className="hg-actions">
                        <button type="button" className="hg-btn hg-btn-sm hg-btn-primary" disabled={saving} onClick={guardarEdit}>
                          Guardar
                        </button>
                        <button type="button" className="hg-btn hg-btn-sm hg-btn-ghost" onClick={() => setEditId(null)}>
                          Cancelar
                        </button>
                      </td>
                    </tr>
                  ) : (
                    <tr key={c.id}>
                      <td>{c.grupo_label}</td>
                      <td>
                        <strong>{c.curso_nombre || '—'}</strong>
                        {c.color ? (
                          <span className="hg-color-dot" style={{ background: c.color, marginLeft: 6 }} />
                        ) : null}
                      </td>
                      <td>{c.docente_nombre || '—'}</td>
                      <td>
                        <strong>{c.bloques_semanales}</strong>
                      </td>
                      <td>
                        {c.bloques_consecutivos_min}/{c.bloques_consecutivos_max}
                      </td>
                      <td>
                        <span className={`hg-badge ${esActivo(c.activo) ? 'ok' : 'off'}`}>
                          {esActivo(c.activo) ? 'Activo' : 'Off'}
                        </span>
                      </td>
                      <td className="hg-actions">
                        <button type="button" className="hg-btn hg-btn-sm" onClick={() => empezarEdit(c)}>
                          Editar
                        </button>
                        <button type="button" className="hg-btn hg-btn-sm hg-btn-danger" onClick={() => eliminar(c)}>
                          ✕
                        </button>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function DisponibilidadPanel({ anio, docentes }) {
  const [personalId, setPersonalId] = useState('');
  const [dias, setDias] = useState([]);
  const [resumen, setResumen] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

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
      text: 'Solo borra en tablas piloto.',
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
        <p className="hg-muted" style={{ marginTop: 0 }}>
          Define en qué días/horas puede dictar cada docente. Se usa después en el solver (no afecta el horario actual).
        </p>
        <label className="hg-field">
          Docente
          <select value={personalId} onChange={(e) => setPersonalId(e.target.value)}>
            <option value="">— Seleccionar —</option>
            {docentes.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nombre}
              </option>
            ))}
          </select>
        </label>

        {loading ? (
          <p className="hg-muted">Cargando semana…</p>
        ) : !personalId ? (
          <p className="hg-muted">Elige un docente para editar lunes a viernes.</p>
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
          <h2>Ya configurados</h2>
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
                  <tr key={r.personal_id}>
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
      title={mode === 'edit' ? 'Editar bloque' : 'Nuevo bloque'}
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
          <input value={form.nombre} onChange={(e) => set('nombre', e.target.value)} placeholder="Bloque 1" />
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
