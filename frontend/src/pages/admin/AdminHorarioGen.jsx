import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Swal from 'sweetalert2';
import DashboardLayout from '../../components/DashboardLayout';
import api from '../../services/api';
import { exportarHorarioGenPDFMultiple } from '../../utils/horarioGenPdf';
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
  { id: 'editor', label: '4. Editor', icon: '🗓️', tone: 'violet' },
  { id: 'solver', label: '5. Generar', icon: '✨', tone: 'rose' },
  { id: 'resultado', label: '6. Resultado', icon: '👁️', tone: 'teal' },
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
        ) : tab === 'solver' ? (
          <SolverPanel
            anio={anio}
            niveles={meta.niveles || []}
            onOpenEditor={() => setTab('editor')}
            onOpenResultado={() => setTab('resultado')}
          />
        ) : tab === 'resultado' ? (
          <ResultadoPanel anio={anio} niveles={meta.niveles || []} />
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

function ResultadoPanel({ anio, niveles }) {
  const [nivelId, setNivelId] = useState('');
  const [versiones, setVersiones] = useState([]);
  const [versionId, setVersionId] = useState('');
  const [vista, setVista] = useState(null);
  const [modo, setModo] = useState('grupos'); // grupos | docentes
  const [filtroId, setFiltroId] = useState('');
  const [loading, setLoading] = useState(false);
  const [savingEstado, setSavingEstado] = useState(false);

  const cargarVersiones = useCallback(async () => {
    if (!anio) return;
    try {
      const params = { anio };
      if (nivelId) params.nivel_id = nivelId;
      const { data } = await api.get(`${API}/versiones`, { params });
      setVersiones(data.versiones || []);
    } catch {
      setVersiones([]);
    }
  }, [anio, nivelId]);

  const cargarVista = useCallback(async () => {
    if (!versionId) {
      setVista(null);
      return;
    }
    try {
      setLoading(true);
      const { data } = await api.get(`${API}/vista-final`, { params: { version_id: versionId } });
      setVista(data);
      setFiltroId('');
    } catch (e) {
      setVista(null);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: e.response?.data?.error || 'No se pudo cargar el resultado',
        ...swalOpts,
      });
    } finally {
      setLoading(false);
    }
  }, [versionId]);

  useEffect(() => {
    cargarVersiones();
  }, [cargarVersiones]);

  useEffect(() => {
    setVersionId('');
    setVista(null);
  }, [nivelId]);

  useEffect(() => {
    cargarVista();
  }, [cargarVista]);

  const cambiarEstado = async (estado) => {
    if (!versionId) return;
    try {
      setSavingEstado(true);
      const { data } = await api.patch(`${API}/versiones/${versionId}/estado`, { estado });
      await Swal.fire({
        icon: 'success',
        title: 'Estado actualizado',
        text: data.message || estado,
        timer: 1800,
        showConfirmButton: false,
        ...swalOpts,
      });
      await cargarVersiones();
      await cargarVista();
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: e.response?.data?.error || 'No se pudo cambiar el estado',
        ...swalOpts,
      });
    } finally {
      setSavingEstado(false);
    }
  };

  const entradaEn = (entradas, dia, bloqueId) =>
    (entradas || []).find(
      (e) => Number(e.dia_semana) === Number(dia) && Number(e.bloque_id) === Number(bloqueId)
    );

  const items =
    modo === 'grupos'
      ? vista?.grupos || []
      : vista?.docentes || [];

  const publicarPrincipal = async (grupoIdOpt) => {
    if (!versionId) return;
    const filtroLabel =
      grupoIdOpt && modo === 'grupos'
        ? items.find((it) => String(it.grupo_id) === String(grupoIdOpt))?.label
        : null;
    const conf = await Swal.fire({
      icon: 'warning',
      title: '¿Publicar como horario principal?',
      html: filtroLabel
        ? `<p>Se reemplazará el horario del sistema para <strong>${filtroLabel}</strong>.</p>
           <p style="color:#b45309">Escribe <b>PUBLICAR</b> para confirmar.</p>`
        : `<p>Se reemplazará el horario del sistema para <strong>todos los grupos</strong> de este borrador.</p>
           <p style="color:#b45309">Escribe <b>PUBLICAR</b> para confirmar.</p>`,
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
      setSavingEstado(true);
      const body = { confirmar: 'PUBLICAR' };
      if (grupoIdOpt) body.grupo_id = Number(grupoIdOpt);
      const { data } = await api.post(`${API}/versiones/${versionId}/vincular`, body);
      await cargarVersiones();
      await cargarVista();
      await Swal.fire({
        icon: 'success',
        title: 'Horario principal actualizado',
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
    } finally {
      setSavingEstado(false);
    }
  };

  const itemsFiltrados = filtroId
    ? items.filter((it) =>
        modo === 'grupos'
          ? String(it.grupo_id) === String(filtroId)
          : String(it.personal_id || '') === String(filtroId)
      )
    : items;

  const r = vista?.resumen;

  return (
    <div className="hg-resultado">
      <section className="hg-panel hg-no-print" style={{ marginBottom: '1rem' }}>
        <div className="hg-panel-head">
          <h2>Resultado final · {anio}</h2>
          <div className="hg-actions">
            <button type="button" className="hg-btn hg-btn-light hg-btn-sm" onClick={cargarVista} disabled={!versionId}>
              Actualizar
            </button>
            <button
              type="button"
              className="hg-btn hg-btn-primary hg-btn-sm"
              disabled={!vista || !(itemsFiltrados?.length > 0)}
              onClick={() => {
                try {
                  exportarHorarioGenPDFMultiple({
                    anio: vista.version?.anio || anio,
                    bloques: vista.bloques || [],
                    items: itemsFiltrados,
                    modo,
                  });
                  Swal.fire({
                    icon: 'success',
                    title: 'PDF generado',
                    text: 'Se descargó con el formato de horarios del sistema.',
                    timer: 1800,
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
              }}
            >
              Descargar PDF
            </button>
            {versionId && vista?.version?.estado !== 'PUBLISHED' && (
              <button
                type="button"
                className="hg-btn hg-btn-danger hg-btn-sm"
                onClick={async () => {
                  const conf = await Swal.fire({
                    icon: 'warning',
                    title: '¿Eliminar este borrador?',
                    text: 'Se borra la generación/borrador. No toca el horario principal si aún no lo publicaste.',
                    showCancelButton: true,
                    confirmButtonText: 'Sí, eliminar',
                    cancelButtonText: 'Cancelar',
                    confirmButtonColor: '#b91c1c',
                    ...swalOpts,
                  });
                  if (!conf.isConfirmed) return;
                  try {
                    await api.delete(`${API}/versiones/${versionId}`);
                    setVersionId('');
                    setVista(null);
                    await cargarVersiones();
                    Swal.fire({
                      icon: 'success',
                      title: 'Eliminado',
                      timer: 1200,
                      showConfirmButton: false,
                      ...swalOpts,
                    });
                  } catch (e) {
                    Swal.fire({
                      icon: 'error',
                      title: 'Error',
                      text: e.response?.data?.error || 'No se pudo eliminar',
                      ...swalOpts,
                    });
                  }
                }}
              >
                Eliminar borrador
              </button>
            )}
          </div>
        </div>
        <div className="hg-filters">
          <label>
            Nivel
            <select value={nivelId} onChange={(e) => setNivelId(e.target.value)}>
              <option value="">— Todos —</option>
              {niveles.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.nombre}
                </option>
              ))}
            </select>
          </label>
          <label>
            Versión / borrador *
            <select value={versionId} onChange={(e) => setVersionId(e.target.value)}>
              <option value="">— Elegir —</option>
              {versiones.map((v) => (
                <option key={v.id} value={v.id}>
                  #{v.id} · {v.nombre || v.nivel_nombre || 'Borrador'} · {v.estado} · {v.total_entradas || 0} clases
                </option>
              ))}
            </select>
          </label>
          <label>
            Ver por
            <select
              value={modo}
              onChange={(e) => {
                setModo(e.target.value);
                setFiltroId('');
              }}
            >
              <option value="grupos">Grupos</option>
              <option value="docentes">Docentes</option>
            </select>
          </label>
          {vista && (
            <label>
              Filtrar
              <select value={filtroId} onChange={(e) => setFiltroId(e.target.value)}>
                <option value="">— Todos —</option>
                {items.map((it) =>
                  modo === 'grupos' ? (
                    <option key={it.grupo_id} value={it.grupo_id}>
                      {it.label}
                    </option>
                  ) : (
                    <option key={it.personal_id || it.nombre} value={it.personal_id || ''}>
                      {it.nombre}
                    </option>
                  )
                )}
              </select>
            </label>
          )}
        </div>
      </section>

      {loading ? (
        <p className="hg-muted">Cargando resultado…</p>
      ) : !versionId ? (
        <section className="hg-panel">
          <p className="hg-muted" style={{ margin: 0 }}>
            Elige un borrador generado (fase 5) o editado (fase 4) para ver el horario completo.
          </p>
        </section>
      ) : vista ? (
        <>
          <section className="hg-panel hg-resumen-final" style={{ marginBottom: '1rem' }}>
            <div className="hg-panel-head">
              <h2>
                {vista.version?.nombre || 'Borrador'}{' '}
                <span className="hg-muted">
                  · {vista.version?.nivel_nombre || ''} · {vista.version?.anio}
                </span>
              </h2>
              <span
                className={`hg-badge ${
                  vista.version?.estado === 'PUBLISHED' || vista.version?.estado === 'APPROVED' ? 'ok' : 'off'
                }`}
              >
                {vista.version?.estado === 'PUBLISHED' ? 'PRINCIPAL' : vista.version?.estado}
              </span>
            </div>
            <div className="hg-stats">
              <div>
                <strong>{r?.completitud_pct ?? 0}%</strong>
                <span>Completitud</span>
              </div>
              <div>
                <strong>
                  {r?.bloques_colocados ?? 0}/{r?.bloques_esperados ?? 0}
                </strong>
                <span>Horas</span>
              </div>
              <div>
                <strong>{r?.total_grupos ?? 0}</strong>
                <span>Grupos</span>
              </div>
              <div>
                <strong>{r?.total_docentes ?? 0}</strong>
                <span>Docentes</span>
              </div>
            </div>
            <div className="hg-actions hg-no-print" style={{ marginTop: '0.75rem' }}>
              <button
                type="button"
                className="hg-btn hg-btn-sm hg-btn-ghost"
                disabled={savingEstado}
                onClick={() => cambiarEstado('REVIEW')}
              >
                Marcar en revisión
              </button>
              <button
                type="button"
                className="hg-btn hg-btn-sm"
                disabled={savingEstado}
                onClick={() => cambiarEstado('APPROVED')}
              >
                Aprobar borrador
              </button>
              <button
                type="button"
                className="hg-btn hg-btn-sm hg-btn-primary"
                disabled={savingEstado || !(r?.total_entradas > 0)}
                onClick={() =>
                  publicarPrincipal(modo === 'grupos' && filtroId ? Number(filtroId) : undefined)
                }
              >
                {modo === 'grupos' && filtroId
                  ? 'Hacer principal este grupo'
                  : 'Hacer horario principal (todos)'}
              </button>
              <button
                type="button"
                className="hg-btn hg-btn-sm"
                disabled={savingEstado}
                onClick={() => cambiarEstado('DRAFT')}
              >
                Volver a borrador
              </button>
            </div>
            {r?.pendientes?.length > 0 && (
              <div className="hg-diag" style={{ marginTop: '1rem' }}>
                <h4>Pendientes ({r.pendientes.length})</h4>
                <ul>
                  {r.pendientes.slice(0, 12).map((p) => (
                    <li key={p.carga_id}>
                      {p.curso} · {p.grupo}: faltan {p.faltan} ({p.colocados}/{p.necesarios})
                    </li>
                  ))}
                  {r.pendientes.length > 12 && <li>… y {r.pendientes.length - 12} más</li>}
                </ul>
              </div>
            )}
          </section>

          <div className="hg-print-area">
            {itemsFiltrados.length === 0 ? (
              <section className="hg-panel">
                <p className="hg-muted" style={{ margin: 0 }}>
                  Esta versión no tiene clases colocadas todavía.
                </p>
              </section>
            ) : (
              itemsFiltrados.map((it) => {
                const key = modo === 'grupos' ? `g-${it.grupo_id}` : `d-${it.personal_id || it.nombre}`;
                const titulo = modo === 'grupos' ? it.label : it.nombre;
                return (
                  <section key={key} className="hg-panel hg-horario-sheet">
                    <div className="hg-panel-head">
                      <h2>
                        {modo === 'grupos' ? 'Grupo' : 'Docente'}: {titulo}
                      </h2>
                      <span className="hg-muted">{(it.entradas || []).length} clases</span>
                    </div>
                    <div className="hg-grid-wrap">
                      <div
                        className="hg-grid"
                        style={{
                          gridTemplateColumns: `minmax(110px, 1.1fr) repeat(${(vista.dias || DIAS).length}, minmax(90px, 1fr))`,
                        }}
                      >
                        <div className="hg-grid-corner">Hora</div>
                        {(vista.dias || DIAS).map((d) => (
                          <div key={d.value} className="hg-grid-day">
                            {d.label}
                          </div>
                        ))}
                        {(vista.bloques || []).map((b) => (
                          <React.Fragment key={b.id}>
                            <div className="hg-grid-block-label">
                              <strong>{b.nombre}</strong>
                              <em>
                                {fmtTime(b.hora_inicio)}–{fmtTime(b.hora_fin)}
                              </em>
                            </div>
                            {(vista.dias || DIAS).map((d) => {
                              const isBreak = b.tipo === 'BREAK' || b.tipo === 'LUNCH';
                              const e = entradaEn(it.entradas, d.value, b.id);
                              return (
                                <div
                                  key={`${b.id}-${d.value}`}
                                  className={`hg-cell${isBreak ? ' hg-cell--break' : ''}${e ? ' hg-cell--filled' : ''}`}
                                >
                                  {isBreak ? (
                                    <span className="hg-cell-muted">
                                      {b.tipo === 'LUNCH' ? 'Almuerzo' : 'Recreo'}
                                    </span>
                                  ) : e ? (
                                    <div
                                      className="hg-cell-card"
                                      style={
                                        e.carga_color
                                          ? { borderLeft: `3px solid ${e.carga_color}` }
                                          : undefined
                                      }
                                    >
                                      <strong>{e.curso_nombre || 'Curso'}</strong>
                                      <small>
                                        {modo === 'grupos'
                                          ? e.docente_nombre || 'Sin docente'
                                          : e.grupo_label || 'Grupo'}
                                      </small>
                                    </div>
                                  ) : null}
                                </div>
                              );
                            })}
                          </React.Fragment>
                        ))}
                      </div>
                    </div>
                  </section>
                );
              })
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}

function SolverPanel({ anio, niveles, onOpenEditor, onOpenResultado }) {
  const [nivelId, setNivelId] = useState('');
  const [grupoId, setGrupoId] = useState('');
  const [grupos, setGrupos] = useState([]);
  const [maxAlt, setMaxAlt] = useState(1);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [runs, setRuns] = useState([]);

  const cargarRuns = useCallback(async () => {
    if (!anio) return;
    try {
      const { data } = await api.get(`${API}/solver/runs`, { params: { anio } });
      setRuns(data.runs || []);
    } catch {
      setRuns([]);
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

  useEffect(() => {
    cargarRuns();
  }, [cargarRuns]);

  useEffect(() => {
    setGrupoId('');
    cargarGrupos();
  }, [nivelId, cargarGrupos]);

  const generar = async () => {
    if (!nivelId) {
      Swal.fire({ icon: 'info', title: 'Elige un nivel', ...swalOpts });
      return;
    }
    if (!grupoId) {
      Swal.fire({
        icon: 'info',
        title: 'Elige un grado / grupo',
        text: 'Para no generar todo el nivel, selecciona el aula (ej. Primaria · 1º · A).',
        ...swalOpts,
      });
      return;
    }
    const gSel = grupos.find((g) => String(g.id) === String(grupoId));
    const conf = await Swal.fire({
      icon: 'question',
      title: '¿Generar horario?',
      html: `Se generará solo para:<br/><strong>${labelGrupo(gSel) || 'grupo elegido'}</strong>.`,
      showCancelButton: true,
      confirmButtonText: 'Generar',
      cancelButtonText: 'Cancelar',
      ...swalOpts,
    });
    if (!conf.isConfirmed) return;

    try {
      setRunning(true);
      setResult(null);
      const { data } = await api.post(`${API}/solver/generar`, {
        anio,
        nivel_id: Number(nivelId),
        grupo_ids: [Number(grupoId)],
        max_alternatives: Number(maxAlt) || 1,
      });
      setResult(data);
      await cargarRuns();
      if (data.estado === 'COMPLETE') {
        Swal.fire({
          icon: 'success',
          title: 'Horario generado',
          text: data.best
            ? `${data.best.placed}/${data.best.total} horas · score ${data.best.score}%`
            : 'Listo',
          ...swalOpts,
        });
      } else {
        Swal.fire({
          icon: 'warning',
          title: 'Sin solución completa',
          text: 'Revise el diagnóstico. Puede completar en el Editor.',
          ...swalOpts,
        });
      }
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: e.response?.data?.error || 'Falló el solver',
        ...swalOpts,
      });
    } finally {
      setRunning(false);
    }
  };

  const eliminarRun = async (run) => {
    const conf = await Swal.fire({
      icon: 'warning',
      title: '¿Eliminar esta generación?',
      html: `Se borrará la ejecución #${run.id}${
        run.version_id ? ` y el borrador/versión #${run.version_id}` : ''
      }.<br/>Puedes volver a generar después.`,
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#b91c1c',
      ...swalOpts,
    });
    if (!conf.isConfirmed) return;
    try {
      const { data } = await api.delete(`${API}/solver/runs/${run.id}`);
      await cargarRuns();
      Swal.fire({
        icon: 'success',
        title: 'Eliminado',
        text: data.message || 'Listo',
        timer: 1400,
        showConfirmButton: false,
        ...swalOpts,
      });
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'No se pudo eliminar',
        text: e.response?.data?.error || 'Error',
        ...swalOpts,
      });
    }
  };

  return (
    <div>
      <section className="hg-panel" style={{ marginBottom: '1rem' }}>
        <div className="hg-panel-head">
          <h2>Generar automáticamente · {anio}</h2>
          <button type="button" className="hg-btn hg-btn-primary" disabled={running} onClick={generar}>
            {running ? 'Generando…' : '✨ Generar horarios'}
          </button>
        </div>
        <div className="hg-filters">
          <label>
            Nivel *
            <select
              value={nivelId}
              onChange={(e) => {
                setNivelId(e.target.value);
              }}
            >
              <option value="">— Elegir —</option>
              {niveles.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.nombre}
                </option>
              ))}
            </select>
          </label>
          <label>
            Grado / grupo *
            <select
              value={grupoId}
              onChange={(e) => setGrupoId(e.target.value)}
              disabled={!nivelId}
            >
              <option value="">— Elegir aula —</option>
              {grupos.map((g) => (
                <option key={g.id} value={g.id}>
                  {labelGrupo(g)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Alternativas
            <select value={maxAlt} onChange={(e) => setMaxAlt(e.target.value)}>
              <option value={1}>1</option>
              <option value={2}>2</option>
              <option value={3}>3</option>
            </select>
          </label>
        </div>
      </section>

      {result && (
        <section className="hg-panel" style={{ marginBottom: '1rem' }}>
          <h3 style={{ marginTop: 0 }}>
            Resultado:{' '}
            <span className={`hg-badge ${result.estado === 'COMPLETE' ? 'ok' : 'off'}`}>{result.estado}</span>
          </h3>
          {(result.alternatives || []).map((a) => (
            <div key={a.version_id} className="hg-alt-card">
              <div>
                <strong>
                  {a.nombre} · score {a.score}%
                </strong>
                <p className="hg-muted" style={{ margin: '0.25rem 0 0' }}>
                  {a.placed}/{a.total} horas · versión #{a.version_id} · {a.ok ? 'completo' : 'parcial'}
                </p>
              </div>
              <div className="hg-actions">
                <button type="button" className="hg-btn hg-btn-sm" onClick={() => onOpenEditor?.()}>
                  Ver en Editor
                </button>
                <button type="button" className="hg-btn hg-btn-sm hg-btn-primary" onClick={() => onOpenResultado?.()}>
                  Ver resultado
                </button>
              </div>
            </div>
          ))}
          {result.diagnostico?.causas?.length > 0 && (
            <div className="hg-diag">
              <h4>Diagnóstico</h4>
              <ul>
                {result.diagnostico.causas.map((c, i) => (
                  <li key={`c-${i}`}>{c}</li>
                ))}
              </ul>
              {result.diagnostico.sugerencias?.length > 0 && (
                <>
                  <h4>Sugerencias</h4>
                  <ul>
                    {result.diagnostico.sugerencias.map((s, i) => (
                      <li key={`s-${i}`}>{s}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </section>
      )}

      <section className="hg-panel">
        <div className="hg-panel-head">
          <h2>Últimas ejecuciones</h2>
          <button type="button" className="hg-btn hg-btn-light hg-btn-sm" onClick={cargarRuns}>
            Actualizar
          </button>
        </div>
        {runs.length === 0 ? (
          <p className="hg-muted">Aún no hay ejecuciones este año.</p>
        ) : (
          <div className="hg-table-wrap">
            <table className="hg-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Estado</th>
                  <th>Mensaje</th>
                  <th>Versión</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id}>
                    <td>{r.id}</td>
                    <td>
                      <span className={`hg-badge ${r.estado === 'COMPLETE' ? 'ok' : 'off'}`}>{r.estado}</span>
                    </td>
                    <td>{r.mensaje || '—'}</td>
                    <td>{r.version_id || '—'}</td>
                    <td>
                      <button
                        type="button"
                        className="hg-btn hg-btn-sm hg-btn-danger"
                        title="Eliminar generación"
                        onClick={() => eliminarRun(r)}
                      >
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
    </div>
  );
}

function EditorPanel({ anio, niveles }) {
  const [nivelId, setNivelId] = useState('');
  const [versiones, setVersiones] = useState([]);
  const [versionId, setVersionId] = useState('');
  const [grupos, setGrupos] = useState([]);
  const [grupoId, setGrupoId] = useState('');
  const [board, setBoard] = useState(null);
  const [selectedCargaId, setSelectedCargaId] = useState(null);
  const [textoLibrePendiente, setTextoLibrePendiente] = useState('');
  const [modoTextoLibre, setModoTextoLibre] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  const cargarVersiones = useCallback(async () => {
    if (!anio) return;
    try {
      const params = { anio };
      if (nivelId) params.nivel_id = nivelId;
      const { data } = await api.get(`${API}/versiones`, { params });
      setVersiones(data.versiones || []);
    } catch {
      setVersiones([]);
    }
  }, [anio, nivelId]);

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
    cargarVersiones();
  }, [cargarVersiones]);

  useEffect(() => {
    setVersionId('');
    setGrupoId('');
    setBoard(null);
    cargarGrupos();
  }, [nivelId, cargarGrupos]);

  useEffect(() => {
    cargarBoard();
  }, [cargarBoard]);

  const crearVersion = async () => {
    if (!nivelId) {
      Swal.fire({ icon: 'info', title: 'Elige un nivel', ...swalOpts });
      return;
    }
    try {
      const { data } = await api.post(`${API}/versiones`, { anio, nivel_id: Number(nivelId) });
      await cargarVersiones();
      setVersionId(String(data.version.id));
      Swal.fire({
        icon: 'success',
        title: 'Borrador creado',
        text: 'Ahora elige un grupo y coloca cursos en la grilla.',
        timer: 1800,
        showConfirmButton: false,
        ...swalOpts,
      });
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: e.response?.data?.error || 'No se pudo crear',
        ...swalOpts,
      });
    }
  };

  const eliminarVersion = async () => {
    if (!versionId) return;
    const conf = await Swal.fire({
      icon: 'warning',
      title: '¿Eliminar borrador?',
      text: 'Se borran todas las clases de esta versión piloto.',
      showCancelButton: true,
      confirmButtonText: 'Sí',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#b91c1c',
      ...swalOpts,
    });
    if (!conf.isConfirmed) return;
    try {
      await api.delete(`${API}/versiones/${versionId}`);
      setVersionId('');
      setBoard(null);
      await cargarVersiones();
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: e.response?.data?.error || 'No se pudo eliminar',
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
    const cargaId = e.dataTransfer.getData('carga_id') || selectedCargaId;
    if (!cargaId || !versionId || !grupoId) return;
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
      await cargarVersiones();
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

  return (
    <div>
      <section className="hg-panel" style={{ marginBottom: '1rem' }}>
        <div className="hg-panel-head">
          <h2>Editor de horario · {anio}</h2>
          <div className="hg-actions">
            <button type="button" className="hg-btn hg-btn-primary" onClick={crearVersion}>
              + Nuevo borrador
            </button>
            {versionId && (
              <button type="button" className="hg-btn hg-btn-danger hg-btn-sm" onClick={eliminarVersion}>
                Eliminar borrador
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
            Borrador del nivel
            <select value={versionId} onChange={(e) => setVersionId(e.target.value)}>
              <option value="">— Elegir —</option>
              {versiones.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nombre} · {v.nivel_nombre || ''} ({v.estado}) · {v.total_entradas || 0} clases
                </option>
              ))}
            </select>
          </label>
          <label>
            Grupo que estoy editando
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
        {msg && <p className="hg-error">{msg}</p>}
      </section>

      {versionId && grupoSel && (
        <div className="hg-grupo-banner">
          <div>
            <p className="hg-eyebrow">Estás editando el horario de</p>
            <h3>{labelGrupo(grupoSel)}</h3>
            <p className="hg-muted" style={{ margin: '0.25rem 0 0' }}>
              Borrador: {nivelSel?.nombre || 'Nivel'} {anio}
              {versiones.find((v) => String(v.id) === String(versionId))?.estado
                ? ` · ${versiones.find((v) => String(v.id) === String(versionId)).estado}`
                : ''}
            </p>
          </div>
          <button type="button" className="hg-btn hg-btn-primary" onClick={publicarEsteGrupo}>
            Hacer horario principal de este grupo
          </button>
        </div>
      )}

      {!versionId || !grupoId ? (
        <p className="hg-muted">Elige nivel, crea/elige un borrador y un grupo (ej. Inicial · 3 Años) para ver la grilla.</p>
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
              pendientes.map((c) => (
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
                  style={c.color ? { borderLeftColor: c.color } : undefined}
                >
                  <strong>{c.curso_nombre || 'Curso'}</strong>
                  <span>
                    {c.colocados}/{c.bloques_semanales} · faltan {c.faltan}
                  </span>
                  <small>{c.docente_nombre || 'Sin docente'}</small>
                </div>
              ))
            )}
            {completos.length > 0 && (
              <>
                <h3 style={{ marginTop: '1rem' }}>Completos</h3>
                {completos.map((c) => (
                  <div key={c.id} className="hg-carga-chip hg-carga-chip--done">
                    <strong>{c.curso_nombre}</strong>
                    <span>
                      {c.colocados}/{c.bloques_semanales}
                    </span>
                  </div>
                ))}
              </>
            )}
          </aside>

          <div className="hg-panel hg-grid-wrap">
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
                          <div className="hg-cell-card">
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
    </div>
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
        bloques_consecutivos_min: Number(editForm.bloques_consecutivos_min) || 2,
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
            <button type="button" className="hg-btn hg-btn-light" onClick={cargarCargas}>
              Actualizar
            </button>
          </div>
        </div>
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
                  {labelGrupo(g)}
                </option>
              ))}
            </select>
          </label>
          <div className="hg-stat">
            <span>{cargas.length} cargas</span>
            <strong>{totalBloques} horas/semana</strong>
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
                  <th className="hg-col-center">Horas</th>
                  <th className="hg-col-center">Horas seguidas</th>
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
                      <td className="hg-col-center">
                        <input
                          type="number"
                          min={1}
                          style={{ width: 64 }}
                          value={editForm.bloques_semanales}
                          onChange={(e) => setEditForm((f) => ({ ...f, bloques_semanales: e.target.value }))}
                        />
                      </td>
                      <td className="hg-col-center">
                        <div className="hg-actions" style={{ justifyContent: 'center' }}>
                          <input
                            type="number"
                            min={1}
                            style={{ width: 52 }}
                            value={editForm.bloques_consecutivos_min}
                            onChange={(e) =>
                              setEditForm((f) => ({ ...f, bloques_consecutivos_min: e.target.value }))
                            }
                          />
                          /
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
                      <td className="hg-col-center">
                        <strong>{c.bloques_semanales}</strong>
                      </td>
                      <td className="hg-col-center">
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
