import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import DashboardLayout from '../../components/DashboardLayout';
import Swal from 'sweetalert2';
import './AdminUsuarios.css';
import './AdminSupervision.css';

/** Iconos outline (Heroicons-style) para el menú Opciones */
function IcoPencil() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}
function IcoClipboard() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
      <path d="M9 14h6" />
      <path d="M9 18h6" />
      <path d="M9 10h4" />
    </svg>
  );
}
function IcoClock() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  );
}
function IcoTrash() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function OpcionesMenuItem({ icon: Icon, label, hint, onClick, danger }) {
  return (
    <li>
      <button
        type="button"
        role="menuitem"
        className={`admin-sup-opciones-item${danger ? ' admin-sup-opcion-danger' : ''}`}
        onClick={onClick}
      >
        <span className="admin-sup-opciones-item-icon" aria-hidden>
          <Icon />
        </span>
        <span className="admin-sup-opciones-item-body">
          <span className="admin-sup-opciones-item-label">{label}</span>
          {hint ? <span className="admin-sup-opciones-item-hint">{hint}</span> : null}
        </span>
      </button>
    </li>
  );
}

export default function AdminSupervision() {
  const { user } = useAuth();
  const [yo, setYo] = useState(null);
  const [loadErr, setLoadErr] = useState(null);

  const isAdmin = user?.tipo === 'ADMINISTRADOR';
  const canConfig = isAdmin;
  const canExecute = yo?.is_admin || yo?.is_supervisor;

  const loadYo = useCallback(async () => {
    try {
      const { data } = await api.get('/supervision/yo');
      setYo(data);
      setLoadErr(null);
    } catch (e) {
      const msg = e.response?.data?.error || e.message;
      setLoadErr(msg);
      setYo({ is_admin: false, is_supervisor: false });
    }
  }, []);

  useEffect(() => {
    loadYo();
  }, [loadYo]);

  const inner = (() => {
    if (loadErr && loadErr.includes('no instalado')) {
      return (
        <div className="admin-usu-wrap">
          <div className="admin-usu-table-card">
            <div className="admin-sup-panel-body" style={{ textAlign: 'center' }}>
              <p><strong>Módulo no instalado en la base de datos.</strong></p>
              <p className="admin-sup-muted">Ejecute en MySQL el archivo <code>database/migrations/016_supervision_mysql.sql</code>.</p>
            </div>
          </div>
        </div>
      );
    }

    if (yo === null && !loadErr) {
      return (
        <div className="admin-usu-wrap">
          <div className="admin-usu-table-card">
            <div className="admin-sup-panel-body" style={{ textAlign: 'center', color: '#6b7280' }}>
              Cargando permisos…
            </div>
          </div>
        </div>
      );
    }

    if (!canConfig && !canExecute) {
      return (
        <div className="admin-usu-wrap">
          <div className="admin-usu-table-card">
            <div className="admin-sup-panel-body" style={{ textAlign: 'center' }}>
              <p>No tienes acceso a Supervisión.</p>
              <p className="admin-sup-muted">El administrador debe asignarte como supervisor en este módulo.</p>
            </div>
          </div>
        </div>
      );
    }

    if (canConfig) {
      return (
        <div className="admin-usu-wrap admin-sup-page admin-sup-root">
          <div className="admin-usu-header">
            <h1>Supervisión</h1>
            <p>
              Rúbricas de supervisión, cierre global, personal autorizado y registro de supervisiones por docente (nivel, grado y aula).
            </p>
          </div>
          <PanelSupervisionAdmin user={user} canExecute={canExecute} loadYo={loadYo} />
        </div>
      );
    }

    return (
      <div className="admin-usu-wrap admin-sup-page admin-sup-root">
        <div className="admin-usu-header">
          <h1>Supervisión</h1>
          <p>
            Registro de supervisiones e historial según el acceso asignado. Use <strong>Opciones</strong> en cada fila o los botones superiores.
          </p>
        </div>
        <PanelSupervisionEjecutor loadYo={loadYo} canExecute={canExecute} />
      </div>
    );
  })();

  return (
    <DashboardLayout>
      <div className="dashboard-container">{inner}</div>
    </DashboardLayout>
  );
}

/** Menú desplegable en document.body (evita recorte por overflow del dashboard / tabla). */
function OpcionesMenuLayer({ open, anchorEl, onClose, children }) {
  const [pos, setPos] = useState({ top: 8, left: 8, width: 300, maxH: 420 });

  useLayoutEffect(() => {
    if (!open || !anchorEl) return undefined;
    const place = () => {
      const r = anchorEl.getBoundingClientRect();
      const w = 300;
      let left = r.right - w;
      left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
      const gap = 4;
      // Siempre justo debajo del botón (antes se “volteaba” con altura fija ~360px y quedaba arriba del todo)
      const top = r.bottom + gap;
      const maxH = Math.max(100, Math.min(420, window.innerHeight - top - 8));
      setPos({ top, left, width: w, maxH });
    };
    place();
    const t = window.setTimeout(place, 0);
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      clearTimeout(t);
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, anchorEl]);

  if (!open || !anchorEl) return null;

  return createPortal(
    <>
      <div
        className="admin-sup-opciones-backdrop"
        aria-hidden
        onMouseDown={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <ul
        className="admin-sup-opciones-menu admin-sup-opciones-menu--fixed"
        style={{
          position: 'fixed',
          top: pos.top,
          left: pos.left,
          width: pos.width,
          zIndex: 10050,
          maxHeight: pos.maxH,
          overflowY: 'auto'
        }}
        role="menu"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {children}
      </ul>
    </>,
    document.body
  );
}

function SupervisionModal({ title, children, onClose }) {
  return (
    <div
      className="admin-sup-modal-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="admin-sup-modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-sup-modal-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="admin-sup-modal-header">
          <h2 id="admin-sup-modal-title">{title}</h2>
          <button type="button" className="admin-sup-modal-close" onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        </div>
        <div className="admin-sup-modal-body">{children}</div>
      </div>
    </div>
  );
}

function anioDesdeSeleccion(yearChoice, yearOtro, anioActivo) {
  if (yearChoice === 'activo') return anioActivo;
  if (yearChoice === 'anterior') return anioActivo - 1;
  if (yearChoice === 'todos') return null;
  if (yearChoice === 'otro') {
    const n = parseInt(String(yearOtro || '').trim(), 10);
    return Number.isFinite(n) ? n : null;
  }
  return anioActivo;
}

function inferirYearChoice(anio, anioActivo) {
  if (anio == null || anio === '') return 'todos';
  const n = parseInt(String(anio), 10);
  if (n === anioActivo) return 'activo';
  if (n === anioActivo - 1) return 'anterior';
  return 'otro';
}

function PanelSupervisionAdmin({ user, canExecute, loadYo }) {
  const anioActivo = parseInt(String(user?.anio_activo ?? new Date().getFullYear()), 10);
  const [list, setList] = useState([]);
  const [sel, setSel] = useState(null);
  const [detalle, setDetalle] = useState(null);
  const [modal, setModal] = useState(null); // 'create' | 'edit' | 'cierre' | 'supervisores'
  const [menuRowId, setMenuRowId] = useState(null);
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [registrarModal, setRegistrarModal] = useState(null);
  const [historialModal, setHistorialModal] = useState(null);
  const [yearChoice, setYearChoice] = useState('activo');
  const [yearOtro, setYearOtro] = useState('');
  const [formInst, setFormInst] = useState({
    titulo: '',
    descripcion: '',
    activo: true,
    cierre_usa_global: true
  });

  const loadList = () => api.get('/supervision/instrumentos').then((r) => setList(r.data.instrumentos || []));

  useEffect(() => {
    loadList().catch(() => {});
  }, []);

  const closeMenu = () => {
    setMenuRowId(null);
    setMenuAnchor(null);
  };

  const cerrarEditor = () => {
    setModal(null);
    setSel(null);
    setDetalle(null);
    closeMenu();
  };

  const openNew = () => {
    closeMenu();
    setSel('new');
    setDetalle(null);
    setYearChoice('activo');
    setYearOtro('');
    setFormInst({
      titulo: '',
      descripcion: '',
      activo: true,
      cierre_usa_global: true
    });
    setModal('create');
  };

  const openEdit = async (row) => {
    closeMenu();
    setSel(row.id);
    setDetalle(null);
    setModal('edit');
    try {
      const { data } = await api.get(`/supervision/instrumentos/${row.id}/detalle`);
      setDetalle(data);
      const a = data.instrumento.anio;
      const yc = inferirYearChoice(a, anioActivo);
      setYearChoice(yc);
      setYearOtro(yc === 'otro' && a != null ? String(a) : '');
      setFormInst({
        titulo: data.instrumento.titulo,
        descripcion: data.instrumento.descripcion || '',
        activo: !!data.instrumento.activo,
        cierre_usa_global: !!data.instrumento.cierre_usa_global
      });
    } catch (e) {
      Swal.fire('Error', e.response?.data?.error || 'No se pudo cargar', 'error');
      cerrarEditor();
    }
  };

  const saveInstrumento = async () => {
    try {
      const anio = anioDesdeSeleccion(yearChoice, yearOtro, anioActivo);
      const payload = {
        titulo: formInst.titulo,
        descripcion: formInst.descripcion || null,
        anio,
        activo: formInst.activo,
        cierre_usa_global: formInst.cierre_usa_global
      };
      if (sel === 'new') {
        await api.post('/supervision/instrumentos', payload);
        Swal.fire({ icon: 'success', title: 'Supervisión creada', timer: 1600, showConfirmButton: false });
        await loadList();
        cerrarEditor();
      } else {
        await api.put(`/supervision/instrumentos/${sel}`, payload);
        Swal.fire({ icon: 'success', title: 'Guardado', timer: 1600, showConfirmButton: false });
        await loadList();
        await openEdit({ id: sel });
      }
    } catch (e) {
      Swal.fire('Error', e.response?.data?.error || 'Error al guardar', 'error');
    }
  };

  const deleteInst = async (id) => {
    const c = await Swal.fire({
      title: '¿Eliminar esta supervisión?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar'
    });
    if (!c.isConfirmed) return;
    try {
      await api.delete(`/supervision/instrumentos/${id}`);
      await loadList();
      if (sel === id) cerrarEditor();
      Swal.fire({ icon: 'success', title: 'Eliminado', timer: 1400, showConfirmButton: false });
    } catch (e) {
      Swal.fire('Error', e.response?.data?.error || 'No se pudo eliminar', 'error');
    }
  };

  async function delRango(id) {
    try {
      await api.delete(`/supervision/rangos/${id}`);
    } catch (e) {
      Swal.fire('Error', e.response?.data?.error, 'error');
    }
  }

  const editorTitulo = modal === 'create' ? 'Nueva supervisión' : 'Editar supervisión';

  const formCampos = (
    <>
      <div className="admin-usu-field">
        <label>Título</label>
        <input value={formInst.titulo} onChange={(e) => setFormInst({ ...formInst, titulo: e.target.value })} />
      </div>
      <div className="admin-usu-field">
        <label>Descripción (opcional)</label>
        <textarea
          className="admin-usu-msg-textarea"
          style={{ minHeight: 88 }}
          value={formInst.descripcion}
          onChange={(e) => setFormInst({ ...formInst, descripcion: e.target.value })}
        />
      </div>
      <div className="admin-usu-field">
        <label>Año lectivo</label>
        <select value={yearChoice} onChange={(e) => setYearChoice(e.target.value)}>
          <option value="activo">Año activo ({anioActivo})</option>
          <option value="anterior">Año anterior ({anioActivo - 1})</option>
          <option value="todos">Todos los años</option>
          <option value="otro">Otro año…</option>
        </select>
      </div>
      {yearChoice === 'otro' && (
        <div className="admin-usu-field">
          <label>Especificar año</label>
          <input
            type="number"
            value={yearOtro}
            onChange={(e) => setYearOtro(e.target.value)}
            placeholder={`Ej. ${anioActivo}`}
          />
        </div>
      )}
      <div className="admin-usu-field">
        <label>Estado</label>
        <select value={formInst.activo ? '1' : '0'} onChange={(e) => setFormInst({ ...formInst, activo: e.target.value === '1' })}>
          <option value="1">Activo</option>
          <option value="0">Inactivo</option>
        </select>
      </div>
      <div className="admin-usu-field">
        <label>Tipo de cierre</label>
        <select
          value={formInst.cierre_usa_global ? 'global' : 'propio'}
          onChange={(e) => setFormInst({ ...formInst, cierre_usa_global: e.target.value === 'global' })}
        >
          <option value="global">Cierre global (campos definidos en &quot;Cierre global&quot;)</option>
          <option value="propio">Cierre propio (campos solo para esta supervisión)</option>
        </select>
      </div>
    </>
  );

  const pieEditor = (
    <div className="admin-sup-modal-actions">
      <button type="button" className="admin-usu-btn admin-usu-btn-secondary" onClick={cerrarEditor}>
        Cancelar
      </button>
      <button type="button" className="admin-usu-btn admin-usu-btn-primary" onClick={saveInstrumento}>
        {sel === 'new' ? 'Crear supervisión' : 'Guardar'}
      </button>
    </div>
  );

  const menuRow = menuRowId != null ? list.find((x) => x.id === menuRowId) : null;

  return (
    <>
      <div className="admin-usu-toolbar" style={{ flexWrap: 'wrap' }}>
        <button type="button" className="admin-usu-btn admin-usu-btn-new" onClick={openNew}>
          + Nueva supervisión
        </button>
        <button type="button" className="admin-usu-btn admin-usu-btn-secondary" onClick={() => setModal('cierre')}>
          Cierre global
        </button>
        <button type="button" className="admin-usu-btn admin-usu-btn-secondary" onClick={() => setModal('supervisores')}>
          Supervisores
        </button>
        {canExecute && (
          <>
            <span className="admin-sup-toolbar-gap" aria-hidden />
            <button type="button" className="admin-usu-btn admin-usu-btn-secondary" onClick={() => setRegistrarModal({})}>
              Registrar supervisión
            </button>
            <button type="button" className="admin-usu-btn admin-usu-btn-secondary" onClick={() => setHistorialModal({})}>
              Historial
            </button>
          </>
        )}
      </div>

      <div className="admin-usu-table-card">
        <div className="admin-sup-panel-body">
          <p className="admin-sup-muted" style={{ marginTop: 0 }}>
            Listado de rúbricas de supervisión. <strong>Supervisores</strong> en la barra define quién del colegio puede registrar supervisiones. En <strong>Opciones</strong> por fila: editar la rúbrica, registrar una supervisión con esa rúbrica, historial o eliminar.
          </p>
          <div className="admin-usu-table-scroll">
            <table className="admin-usu-table">
              <thead>
                <tr>
                  <th>Título</th>
                  <th>Estado</th>
                  <th style={{ width: 200 }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.id}>
                    <td style={{ textAlign: 'left' }}>{r.titulo}</td>
                    <td>
                      {r.activo ? (
                        <span className="admin-usu-badge admin-usu-badge-ok">Activo</span>
                      ) : (
                        <span className="admin-usu-badge-off">Inactivo</span>
                      )}
                    </td>
                    <td style={{ position: 'relative', verticalAlign: 'middle' }}>
                      <div className="admin-sup-opciones-wrap">
                        <button
                          type="button"
                          className="admin-usu-btn admin-usu-btn-primary admin-sup-opciones-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (menuRowId === r.id) {
                              closeMenu();
                            } else {
                              setMenuRowId(r.id);
                              setMenuAnchor(e.currentTarget);
                            }
                          }}
                        >
                          Opciones ▼
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {(modal === 'create' || modal === 'edit') && (
        <SupervisionModal title={editorTitulo} onClose={cerrarEditor}>
          {formCampos}
          {modal === 'edit' && sel && sel !== 'new' && detalle && (
            <>
              <h3 className="admin-sup-modal-section-title">Preguntas e ítems</h3>
              {(detalle.preguntas || []).map((p) => (
                <div key={p.id} className="admin-usu-info-item admin-sup-pregunta-block">
                  <span className="admin-usu-info-label">{p.titulo}</span>
                  <div className="admin-sup-muted" style={{ fontSize: '0.85rem', marginTop: 4 }}>
                    {p.texto_ayuda}
                  </div>
                  <div style={{ marginTop: 8 }}>
                    {(p.niveles || []).map((n) => (
                      <div key={n.id} className="admin-sup-muted" style={{ fontSize: '0.82rem' }}>
                        [{n.valor_numerico}] {n.etiqueta || '—'} — {n.descripcion || ''}
                      </div>
                    ))}
                  </div>
                  <MiniNivelForm preguntaId={p.id} onAdded={() => openEdit({ id: sel })} />
                </div>
              ))}
              <MiniPreguntaForm instrumentoId={sel} onAdded={() => openEdit({ id: sel })} />

              <h3 className="admin-sup-modal-section-title">Rangos de resultado (puntaje total)</h3>
              {(detalle.rangos_resultado || []).map((r) => (
                <div key={r.id} className="admin-usu-destino-row" style={{ justifyContent: 'space-between', width: '100%', marginBottom: 8 }}>
                  <span className="admin-sup-muted" style={{ margin: 0 }}>
                    {r.puntaje_min} – {r.puntaje_max}: <strong>{r.etiqueta}</strong>
                  </span>
                  <button type="button" className="admin-usu-btn admin-usu-btn-danger" onClick={() => delRango(r.id).then(() => openEdit({ id: sel }))}>
                    Quitar
                  </button>
                </div>
              ))}
              <MiniRangoForm instrumentoId={sel} onAdded={() => openEdit({ id: sel })} />

              {!formInst.cierre_usa_global && (
                <>
                  <h3 className="admin-sup-modal-section-title">Campos de cierre (solo esta supervisión)</h3>
                  <CamposCierreInstrumento instrumentoId={sel} />
                </>
              )}

              <h3 className="admin-sup-modal-section-title">Personal de referencia (opcional)</h3>
              <p className="admin-sup-muted" style={{ marginTop: 0 }}>
                Quién aparece aquí no es el docente que se evalúa (eso se elige al pulsar <strong>Registrar supervisión</strong>) ni los usuarios con permiso de supervisor (eso se configura con el botón <strong>Supervisores</strong> arriba). Es solo un listado opcional de contactos de coordinación o seguimiento vinculados a esta rúbrica.
              </p>
              <PanelInstrumentoParticipantes instrumentoId={sel} />
            </>
          )}
          {pieEditor}
        </SupervisionModal>
      )}

      {modal === 'cierre' && (
        <SupervisionModal title="Cierre global" onClose={() => setModal(null)}>
          <PanelCierreGlobal />
        </SupervisionModal>
      )}

      {modal === 'supervisores' && (
        <SupervisionModal title="Supervisores del colegio" onClose={() => setModal(null)}>
          <PanelSupervisores />
        </SupervisionModal>
      )}

      {registrarModal != null && canExecute && (
        <SupervisionModal
          title={registrarModal.presetId ? `Registrar supervisión — ${registrarModal.titulo || ''}` : 'Registrar supervisión'}
          onClose={() => setRegistrarModal(null)}
        >
          <PanelRegistrar
            onDone={() => {
              loadYo?.();
              setRegistrarModal(null);
            }}
            instrumentoIdInicial={registrarModal.presetId || null}
            supervisionTitulo={registrarModal.titulo || ''}
            bloquearInstrumento={!!registrarModal.presetId}
            modoModal
          />
        </SupervisionModal>
      )}

      {historialModal != null && canExecute && (
        <SupervisionModal
          title={
            historialModal.instrumentoId
              ? `Historial — ${historialModal.titulo || ''}`
              : 'Historial de supervisiones'
          }
          onClose={() => setHistorialModal(null)}
        >
          <PanelHistorial instrumentoId={historialModal.instrumentoId} tituloFiltro={historialModal.titulo} />
        </SupervisionModal>
      )}

      {menuRow && menuAnchor && (
        <OpcionesMenuLayer open anchorEl={menuAnchor} onClose={closeMenu}>
          <OpcionesMenuItem
            icon={IcoPencil}
            label="Editar"
            hint="Rúbrica, preguntas, rangos, cierre y personal de referencia opcional."
            onClick={() => {
              openEdit(menuRow);
            }}
          />
          {canExecute && (
            <OpcionesMenuItem
              icon={IcoClipboard}
              label="Registrar supervisión"
              hint="Elige docente, aula y aplica esta rúbrica (es la evaluación en sí)."
              onClick={() => {
                setRegistrarModal({ presetId: menuRow.id, titulo: menuRow.titulo });
                closeMenu();
              }}
            />
          )}
          {canExecute && (
            <OpcionesMenuItem
              icon={IcoClock}
              label="Historial de esta supervisión"
              hint="Evaluaciones ya guardadas solo con esta rúbrica."
              onClick={() => {
                setHistorialModal({ instrumentoId: menuRow.id, titulo: menuRow.titulo });
                closeMenu();
              }}
            />
          )}
          <OpcionesMenuItem
            icon={IcoTrash}
            label="Eliminar"
            hint="Quita esta rúbrica (no permitido si ya hay evaluaciones)."
            danger
            onClick={() => {
              deleteInst(menuRow.id);
              closeMenu();
            }}
          />
        </OpcionesMenuLayer>
      )}
    </>
  );
}

/** Vista docente/supervisor (sin configuración): misma UX que admin — tabla, Opciones, modales. */
function PanelSupervisionEjecutor({ loadYo, canExecute }) {
  const [list, setList] = useState([]);
  const [menuRowId, setMenuRowId] = useState(null);
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [registrarModal, setRegistrarModal] = useState(null);
  const [historialModal, setHistorialModal] = useState(null);

  const loadList = () => api.get('/supervision/instrumentos/activos').then((r) => setList(r.data.instrumentos || []));

  useEffect(() => {
    loadList().catch(() => {});
  }, []);

  const closeMenu = () => {
    setMenuRowId(null);
    setMenuAnchor(null);
  };

  const menuRow = menuRowId != null ? list.find((x) => x.id === menuRowId) : null;

  return (
    <>
      <div className="admin-usu-toolbar" style={{ flexWrap: 'wrap' }}>
        {canExecute && (
          <>
            <button type="button" className="admin-usu-btn admin-usu-btn-secondary" onClick={() => setRegistrarModal({})}>
              Registrar supervisión
            </button>
            <button type="button" className="admin-usu-btn admin-usu-btn-secondary" onClick={() => setHistorialModal({})}>
              Historial
            </button>
          </>
        )}
      </div>

      <div className="admin-usu-table-card">
        <div className="admin-sup-panel-body">
          <p className="admin-sup-muted" style={{ marginTop: 0 }}>
            Rúbricas activas para el año lectivo. En <strong>Opciones</strong>: registrar una supervisión (elige docente y aula) o ver el historial filtrado por esa rúbrica. Quién puede usar el módulo lo define el administrador con el botón <strong>Supervisores</strong> en Herramientas.
          </p>
          <div className="admin-usu-table-scroll">
            <table className="admin-usu-table">
              <thead>
                <tr>
                  <th>Título</th>
                  <th style={{ width: 200 }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.id}>
                    <td style={{ textAlign: 'left' }}>{r.titulo}</td>
                    <td style={{ position: 'relative', verticalAlign: 'middle' }}>
                      <div className="admin-sup-opciones-wrap">
                        <button
                          type="button"
                          className="admin-usu-btn admin-usu-btn-primary admin-sup-opciones-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (menuRowId === r.id) {
                              closeMenu();
                            } else {
                              setMenuRowId(r.id);
                              setMenuAnchor(e.currentTarget);
                            }
                          }}
                        >
                          Opciones ▼
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {list.length === 0 && (
            <p className="admin-sup-muted" style={{ marginBottom: 0 }}>
              No hay supervisiones activas para el año actual. El administrador debe activar una rúbrica o asignarla al año lectivo.
            </p>
          )}
        </div>
      </div>

      {menuRow && menuAnchor && (
        <OpcionesMenuLayer open anchorEl={menuAnchor} onClose={closeMenu}>
          {canExecute && (
            <OpcionesMenuItem
              icon={IcoClipboard}
              label="Registrar supervisión"
              hint="Elige docente, aula y completa la evaluación con esta rúbrica."
              onClick={() => {
                setRegistrarModal({ presetId: menuRow.id, titulo: menuRow.titulo });
                closeMenu();
              }}
            />
          )}
          {canExecute && (
            <OpcionesMenuItem
              icon={IcoClock}
              label="Historial de esta supervisión"
              hint="Evaluaciones ya guardadas solo con esta rúbrica."
              onClick={() => {
                setHistorialModal({ instrumentoId: menuRow.id, titulo: menuRow.titulo });
                closeMenu();
              }}
            />
          )}
        </OpcionesMenuLayer>
      )}

      {registrarModal != null && canExecute && (
        <SupervisionModal
          title={registrarModal.presetId ? `Registrar supervisión — ${registrarModal.titulo || ''}` : 'Registrar supervisión'}
          onClose={() => setRegistrarModal(null)}
        >
          <PanelRegistrar
            onDone={() => {
              loadYo?.();
              setRegistrarModal(null);
            }}
            instrumentoIdInicial={registrarModal.presetId || null}
            supervisionTitulo={registrarModal.titulo || ''}
            bloquearInstrumento={!!registrarModal.presetId}
            modoModal
          />
        </SupervisionModal>
      )}

      {historialModal != null && canExecute && (
        <SupervisionModal
          title={
            historialModal.instrumentoId ? `Historial — ${historialModal.titulo || ''}` : 'Historial de supervisiones'
          }
          onClose={() => setHistorialModal(null)}
        >
          <PanelHistorial instrumentoId={historialModal.instrumentoId} tituloFiltro={historialModal.titulo} />
        </SupervisionModal>
      )}

    </>
  );
}

function MiniPreguntaForm({ instrumentoId, onAdded }) {
  const [titulo, setTitulo] = useState('');
  const [ayuda, setAyuda] = useState('');
  const submit = async () => {
    if (!titulo.trim()) return;
    try {
      await api.post(`/supervision/instrumentos/${instrumentoId}/preguntas`, { titulo, texto_ayuda: ayuda || null, orden: 0 });
      setTitulo('');
      setAyuda('');
      onAdded();
    } catch (e) {
      Swal.fire('Error', e.response?.data?.error, 'error');
    }
  };
  return (
    <div className="admin-sup-dashed">
      <div className="admin-usu-field">
        <label>Nueva pregunta / ítem</label>
        <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Título" />
      </div>
      <div className="admin-usu-field">
        <label>Texto de ayuda (opcional)</label>
        <textarea className="admin-usu-msg-textarea" style={{ minHeight: 72 }} value={ayuda} onChange={(e) => setAyuda(e.target.value)} />
      </div>
      <button type="button" className="admin-usu-btn admin-usu-btn-secondary" onClick={submit}>
        Añadir pregunta
      </button>
    </div>
  );
}

function MiniNivelForm({ preguntaId, onAdded }) {
  const [valor, setValor] = useState('1');
  const [etiq, setEtiq] = useState('');
  const [desc, setDesc] = useState('');
  const submit = async () => {
    try {
      await api.post(`/supervision/preguntas/${preguntaId}/niveles`, {
        valor_numerico: parseFloat(valor),
        etiqueta: etiq || null,
        descripcion: desc || null,
        orden: 0
      });
      setEtiq('');
      setDesc('');
      onAdded();
    } catch (e) {
      Swal.fire('Error', e.response?.data?.error, 'error');
    }
  };
  return (
    <div className="admin-sup-nivel-inline">
      <div className="admin-usu-field" style={{ maxWidth: 100 }}>
        <label>Puntaje</label>
        <input type="number" step="0.01" value={valor} onChange={(e) => setValor(e.target.value)} />
      </div>
      <div className="admin-usu-field" style={{ flex: '1 1 140px' }}>
        <label>Etiqueta nivel</label>
        <input value={etiq} onChange={(e) => setEtiq(e.target.value)} placeholder="Ej. Alto" />
      </div>
      <div className="admin-usu-field" style={{ flex: '2 1 200px' }}>
        <label>Descripción</label>
        <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Descripción del nivel" />
      </div>
      <button type="button" className="admin-usu-btn admin-usu-btn-primary" style={{ alignSelf: 'flex-end', marginBottom: '0.85rem' }} onClick={submit}>
        + Nivel
      </button>
    </div>
  );
}

function MiniRangoForm({ instrumentoId, onAdded }) {
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');
  const [etiq, setEtiq] = useState('');
  const submit = async () => {
    try {
      await api.post(`/supervision/instrumentos/${instrumentoId}/rangos`, {
        puntaje_min: parseFloat(min),
        puntaje_max: parseFloat(max),
        etiqueta: etiq,
        orden: 0
      });
      setMin('');
      setMax('');
      setEtiq('');
      onAdded();
    } catch (e) {
      Swal.fire('Error', e.response?.data?.error, 'error');
    }
  };
  return (
    <div className="admin-sup-nivel-inline" style={{ marginTop: '0.5rem' }}>
      <div className="admin-usu-field" style={{ maxWidth: 110 }}>
        <label>Mín</label>
        <input type="number" step="0.01" value={min} onChange={(e) => setMin(e.target.value)} />
      </div>
      <div className="admin-usu-field" style={{ maxWidth: 110 }}>
        <label>Máx</label>
        <input type="number" step="0.01" value={max} onChange={(e) => setMax(e.target.value)} />
      </div>
      <div className="admin-usu-field" style={{ flex: '1 1 200px' }}>
        <label>Etiqueta</label>
        <input value={etiq} onChange={(e) => setEtiq(e.target.value)} placeholder="Ej. En proceso" />
      </div>
      <button type="button" className="admin-usu-btn admin-usu-btn-secondary" style={{ alignSelf: 'flex-end', marginBottom: '0.85rem' }} onClick={submit}>
        Añadir rango
      </button>
    </div>
  );
}

function CamposCierreInstrumento({ instrumentoId }) {
  const [campos, setCampos] = useState([]);
  const load = useCallback(
    () => api.get(`/supervision/instrumentos/${instrumentoId}/campos-cierre`).then((r) => setCampos(r.data.campos || [])),
    [instrumentoId]
  );
  useEffect(() => {
    load().catch(() => {});
  }, [load]);
  const [etiq, setEtiq] = useState('');
  const add = async () => {
    if (!etiq.trim()) return;
    try {
      await api.post(`/supervision/instrumentos/${instrumentoId}/campos-cierre`, { etiqueta: etiq, tipo: 'textarea', requerido: false, orden: 0 });
      setEtiq('');
      await load();
    } catch (e) {
      Swal.fire('Error', e.response?.data?.error, 'error');
    }
  };
  const del = async (id) => {
    try {
      await api.delete(`/supervision/campos-cierre/${id}`);
      await load();
    } catch (e) {
      Swal.fire('Error', e.response?.data?.error, 'error');
    }
  };
  return (
    <div>
      {campos.map((c) => (
        <div key={c.id} className="admin-usu-destino-row" style={{ justifyContent: 'space-between', marginBottom: 8, width: '100%' }}>
          <span>{c.etiqueta}</span>
          <button type="button" className="admin-usu-btn admin-usu-btn-danger" onClick={() => del(c.id)}>
            Quitar
          </button>
        </div>
      ))}
      <div className="admin-usu-toolbar" style={{ marginTop: 12, padding: 0, boxShadow: 'none', border: 'none', background: 'transparent' }}>
        <input className="admin-usu-grow" type="text" value={etiq} onChange={(e) => setEtiq(e.target.value)} placeholder="Nueva etiqueta de campo" />
        <button type="button" className="admin-usu-btn admin-usu-btn-primary" onClick={add}>
          Añadir campo
        </button>
      </div>
    </div>
  );
}

function PanelCierreGlobal() {
  const [campos, setCampos] = useState([]);
  const [etiq, setEtiq] = useState('');
  const load = useCallback(() => api.get('/supervision/campos-cierre/global').then((r) => setCampos(r.data.campos || [])), []);
  useEffect(() => {
    load().catch(() => {});
  }, [load]);
  const add = async () => {
    if (!etiq.trim()) return;
    try {
      await api.post('/supervision/campos-cierre/global', { etiqueta: etiq, tipo: 'textarea', requerido: false, orden: 0 });
      setEtiq('');
      await load();
    } catch (e) {
      Swal.fire('Error', e.response?.data?.error, 'error');
    }
  };
  const del = async (id) => {
    try {
      await api.delete(`/supervision/campos-cierre/${id}`);
      await load();
    } catch (e) {
      Swal.fire('Error', e.response?.data?.error, 'error');
    }
  };
  return (
    <div>
      <p className="admin-sup-muted">
        Estos campos se usan al final de cada supervisión cuando la rúbrica tiene &quot;Cierre global&quot; activado.
      </p>
      <p className="admin-sup-muted">Sugerencia: Fortalezas, Oportunidades de mejora, Acción inmediata.</p>
      <div className="admin-usu-table-scroll">
        <table className="admin-usu-table">
          <thead>
            <tr>
              <th>Etiqueta</th>
              <th style={{ width: 140 }}>Acción</th>
            </tr>
          </thead>
          <tbody>
            {campos.map((c) => (
              <tr key={c.id}>
                <td style={{ textAlign: 'left' }}>{c.etiqueta}</td>
                <td>
                  <button type="button" className="admin-usu-btn admin-usu-btn-danger" onClick={() => del(c.id)}>
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="admin-usu-toolbar" style={{ marginTop: 16, padding: 0, boxShadow: 'none', border: 'none', background: 'transparent' }}>
        <input className="admin-usu-grow" type="text" value={etiq} onChange={(e) => setEtiq(e.target.value)} placeholder="Nueva etiqueta" />
        <button type="button" className="admin-usu-btn admin-usu-btn-new" onClick={add}>
          Añadir
        </button>
      </div>
    </div>
  );
}

function PanelInstrumentoParticipantes({ instrumentoId, readOnly = false }) {
  const [list, setList] = useState([]);
  const [q, setQ] = useState('');
  const [candidatos, setCandidatos] = useState([]);
  const load = useCallback(
    () => api.get(`/supervision/instrumentos/${instrumentoId}/participantes`).then((r) => setList(r.data.participantes || [])),
    [instrumentoId]
  );
  useEffect(() => {
    load().catch(() => {});
  }, [load]);
  const buscar = () =>
    api.get('/supervision/personal-candidatos', { params: { q } }).then((r) => setCandidatos(r.data.personal || []));
  const add = async (usuario_id) => {
    try {
      await api.post(`/supervision/instrumentos/${instrumentoId}/participantes`, { usuario_id });
      await load();
      Swal.fire({ icon: 'success', title: 'Agregado', timer: 1200, showConfirmButton: false });
    } catch (e) {
      Swal.fire('Error', e.response?.data?.error || 'No se pudo agregar', 'error');
    }
  };
  const del = async (id) => {
    try {
      await api.delete(`/supervision/instrumento-participantes/${id}`);
      await load();
    } catch (e) {
      Swal.fire('Error', e.response?.data?.error, 'error');
    }
  };
  return (
    <div>
      <p className="admin-sup-muted">
        Opcional. Personas de coordinación o seguimiento asociadas a <strong>esta rúbrica</strong> (información interna). No son el docente que se evalúa (eso se elige al registrar la supervisión) ni los usuarios con permiso de supervisor (eso es el botón <strong>Supervisores</strong> en la barra).
      </p>
      {readOnly && (
        <p className="admin-sup-muted" style={{ marginTop: 8 }}>
          Solo consulta. Solo el administrador puede editar este listado desde <strong>Editar</strong> la rúbrica.
        </p>
      )}
      <h3 style={{ fontSize: '1.08rem', fontWeight: 700, color: '#1f2937', margin: '0 0 0.75rem' }}>Personas asignadas</h3>
      <div className="admin-usu-table-scroll">
        <table className="admin-usu-table">
          <thead>
            <tr>
              <th>Usuario (DNI)</th>
              <th>Nombre</th>
              {!readOnly && <th style={{ width: 120 }}>Acción</th>}
            </tr>
          </thead>
          <tbody>
            {list.map((s) => (
              <tr key={s.id}>
                <td>{s.dni}</td>
                <td style={{ textAlign: 'left' }}>
                  {s.nombres} {s.apellidos}
                </td>
                {!readOnly && (
                  <td>
                    <button type="button" className="admin-usu-btn admin-usu-btn-danger" onClick={() => del(s.id)}>
                      Quitar
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!readOnly && (
        <>
          <h3 style={{ fontSize: '1.08rem', fontWeight: 700, color: '#1f2937', margin: '1.25rem 0 0.75rem' }}>Añadir personal</h3>
          <div className="admin-usu-toolbar" style={{ marginBottom: 12 }}>
            <input className="admin-usu-grow" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por DNI o nombre" />
            <button type="button" className="admin-usu-btn admin-usu-btn-search" onClick={buscar}>
              Buscar
            </button>
          </div>
          <ul className="admin-sup-lista-candidatos">
            {candidatos.map((p) => (
              <li key={p.usuario_id}>
                <strong>{p.dni}</strong> — {p.nombres} {p.apellidos}{' '}
                <button type="button" className="admin-usu-btn admin-usu-btn-primary" style={{ marginLeft: 8 }} onClick={() => add(p.usuario_id)}>
                  Añadir
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function PanelSupervisores() {
  const [list, setList] = useState([]);
  const [q, setQ] = useState('');
  const [candidatos, setCandidatos] = useState([]);
  const load = useCallback(() => api.get('/supervision/supervisores').then((r) => setList(r.data.supervisores || [])), []);
  useEffect(() => {
    load().catch(() => {});
  }, [load]);
  const buscar = () =>
    api.get('/supervision/personal-candidatos', { params: { q } }).then((r) => setCandidatos(r.data.personal || []));
  const add = async (usuario_id) => {
    try {
      await api.post('/supervision/supervisores', { usuario_id });
      await load();
      Swal.fire({ icon: 'success', title: 'Asignado', timer: 1200, showConfirmButton: false });
    } catch (e) {
      Swal.fire('Error', e.response?.data?.error, 'error');
    }
  };
  const del = async (id) => {
    try {
      await api.delete(`/supervision/supervisores/${id}`);
      await load();
    } catch (e) {
      Swal.fire('Error', e.response?.data?.error, 'error');
    }
  };
  return (
    <div>
      <p className="admin-sup-muted">
        Los supervisores pueden registrar supervisiones y ver historial; no tienen acceso a la configuración de este módulo.
      </p>
      <h3 style={{ fontSize: '1.08rem', fontWeight: 700, color: '#1f2937', margin: '0 0 0.75rem' }}>Supervisores actuales</h3>
      <div className="admin-usu-table-scroll">
        <table className="admin-usu-table">
          <thead>
            <tr>
              <th>Usuario (DNI)</th>
              <th>Nombre</th>
              <th style={{ width: 120 }}>Acción</th>
            </tr>
          </thead>
          <tbody>
            {list.map((s) => (
              <tr key={s.id}>
                <td>{s.dni}</td>
                <td style={{ textAlign: 'left' }}>
                  {s.nombres} {s.apellidos}
                </td>
                <td>
                  <button type="button" className="admin-usu-btn admin-usu-btn-danger" onClick={() => del(s.id)}>
                    Quitar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3 style={{ fontSize: '1.08rem', fontWeight: 700, color: '#1f2937', margin: '1.25rem 0 0.75rem' }}>Añadir personal</h3>
      <div className="admin-usu-toolbar" style={{ marginBottom: 12 }}>
        <input className="admin-usu-grow" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por DNI o nombre" />
        <button type="button" className="admin-usu-btn admin-usu-btn-search" onClick={buscar}>
          Buscar
        </button>
      </div>
      <ul className="admin-sup-lista-candidatos">
        {candidatos.map((p) => (
          <li key={p.usuario_id}>
            <strong>{p.dni}</strong> — {p.nombres} {p.apellidos}{' '}
            <button type="button" className="admin-usu-btn admin-usu-btn-primary" style={{ marginLeft: 8 }} onClick={() => add(p.usuario_id)}>
              Asignar
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PanelRegistrar({
  onDone,
  instrumentoIdInicial = null,
  supervisionTitulo = '',
  bloquearInstrumento = false,
  modoModal = false
}) {
  const [instrumentos, setInstrumentos] = useState([]);
  const [niveles, setNiveles] = useState([]);
  const [grupos, setGrupos] = useState([]);
  const [docentes, setDocentes] = useState([]);
  const [instId, setInstId] = useState(instrumentoIdInicial ? String(instrumentoIdInicial) : '');
  const [nivelId, setNivelId] = useState('');
  const [grupoId, setGrupoId] = useState('');
  const [personalId, setPersonalId] = useState('');
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [detalle, setDetalle] = useState(null);
  const [respuestas, setRespuestas] = useState({});
  const [obs, setObs] = useState({});

  useEffect(() => {
    if (instrumentoIdInicial) {
      setInstId(String(instrumentoIdInicial));
      setNivelId('');
      setGrupoId('');
      setPersonalId('');
      setDetalle(null);
      setRespuestas({});
      setObs({});
    }
  }, [instrumentoIdInicial]);

  useEffect(() => {
    api.get('/supervision/instrumentos/activos').then((r) => setInstrumentos(r.data.instrumentos || [])).catch(() => {});
    api.get('/supervision/contexto/niveles').then((r) => setNiveles(r.data.niveles || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!nivelId) {
      setGrupos([]);
      return;
    }
    api.get('/supervision/contexto/grupos', { params: { nivel_id: nivelId } }).then((r) => setGrupos(r.data.grupos || [])).catch(() => {});
  }, [nivelId]);

  useEffect(() => {
    if (!grupoId) {
      setDocentes([]);
      return;
    }
    api.get('/supervision/contexto/docentes', { params: { grupo_id: grupoId } }).then((r) => setDocentes(r.data.docentes || [])).catch(() => {});
  }, [grupoId]);

  const cargarFormulario = async () => {
    if (!instId) {
      Swal.fire('Atención', 'Elija una supervisión', 'warning');
      return;
    }
    try {
      const { data } = await api.get(`/supervision/instrumentos/${instId}/detalle`);
      setDetalle(data);
      const r0 = {};
      (data.preguntas || []).forEach((p) => {
        if (p.niveles && p.niveles[0]) r0[p.id] = p.niveles[0].id;
      });
      setRespuestas(r0);
      const o0 = {};
      (data.campos_cierre || []).forEach((c) => {
        o0[c.id] = '';
      });
      setObs(o0);
    } catch (e) {
      Swal.fire('Error', e.response?.data?.error || 'No se pudo cargar la supervisión', 'error');
    }
  };

  const enviar = async () => {
    if (!detalle || !grupoId || !personalId) {
      Swal.fire('Atención', 'Complete nivel, grado/grupo y docente', 'warning');
      return;
    }
    const respuestasArr = Object.keys(respuestas).map((pid) => ({
      pregunta_id: parseInt(pid, 10),
      nivel_id: respuestas[pid]
    }));
    const observaciones = (detalle.campos_cierre || []).map((c) => ({
      campo_cierre_id: c.id,
      valor: obs[c.id] || ''
    }));
    try {
      await api.post('/supervision/evaluaciones', {
        instrumento_id: parseInt(instId, 10),
        grupo_id: parseInt(grupoId, 10),
        personal_id_evaluado: parseInt(personalId, 10),
        fecha_evaluacion: fecha,
        respuestas: respuestasArr,
        observaciones
      });
      Swal.fire({ icon: 'success', title: 'Supervisión registrada', timer: 2000, showConfirmButton: false });
      setDetalle(null);
      setRespuestas({});
      setObs({});
      onDone?.();
    } catch (e) {
      Swal.fire('Error', e.response?.data?.error || 'No se pudo guardar', 'error');
    }
  };

  let puntajePrev = 0;
  if (detalle && detalle.preguntas) {
    for (const p of detalle.preguntas) {
      const nid = respuestas[p.id];
      const n = (p.niveles || []).find((x) => x.id === nid);
      if (n) puntajePrev += parseFloat(n.valor_numerico);
    }
  }

  return (
    <div className={modoModal ? 'admin-sup-registrar-modal' : 'admin-sup-layout-2'}>
      <div className="admin-usu-profile-section">
        <h3>Contexto de la supervisión</h3>
        {modoModal && (
          <p className="admin-sup-muted" style={{ marginTop: 0 }}>
            Elija nivel, grupo y docente. Luego cargue el formulario de la rúbrica y complete observaciones y cierre.
          </p>
        )}
        <div className="admin-usu-field">
          <label>Supervisión</label>
          {bloquearInstrumento ? (
            <div className="admin-sup-instrumento-locked">{supervisionTitulo || `ID ${instId}`}</div>
          ) : (
            <select value={instId} onChange={(e) => setInstId(e.target.value)}>
              <option value="">— Elegir —</option>
              {instrumentos.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.titulo}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="admin-usu-field">
          <label>Nivel</label>
          <select value={nivelId} onChange={(e) => setNivelId(e.target.value)}>
            <option value="">— Elegir —</option>
            {niveles.map((n) => (
              <option key={n.id} value={n.id}>
                {n.nombre}
              </option>
            ))}
          </select>
        </div>
        <div className="admin-usu-field">
          <label>Grupo / aula</label>
          <select value={grupoId} onChange={(e) => setGrupoId(e.target.value)}>
            <option value="">— Elegir —</option>
            {grupos.map((g) => (
              <option key={g.id} value={g.id}>
                {g.grado}° {g.seccion} — {g.nivel_nombre}
              </option>
            ))}
          </select>
        </div>
        <div className="admin-usu-field">
          <label>Docente a supervisar</label>
          <select value={personalId} onChange={(e) => setPersonalId(e.target.value)}>
            <option value="">— Elegir —</option>
            {docentes.map((d) => (
              <option key={d.personal_id} value={d.personal_id}>
                {d.apellidos}, {d.nombres}
              </option>
            ))}
          </select>
        </div>
        <div className="admin-usu-field">
          <label>Fecha</label>
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </div>
        <button type="button" className="admin-usu-btn admin-usu-btn-search" onClick={cargarFormulario}>
          Cargar formulario de la supervisión
        </button>
      </div>
      <div>
        {detalle && (
          <div className="admin-usu-profile-section">
            <p className="admin-sup-muted">
              Puntaje previo: <strong style={{ color: '#1f2937' }}>{puntajePrev.toFixed(2)}</strong> (debe encajar en un rango configurado)
            </p>
            {(detalle.preguntas || []).map((p) => (
              <div key={p.id} className="admin-usu-info-item" style={{ marginBottom: '0.75rem' }}>
                <span className="admin-usu-info-label">{p.titulo}</span>
                <div className="admin-sup-radio-list">
                  {(p.niveles || []).map((n) => (
                    <label key={n.id} className={respuestas[p.id] === n.id ? 'admin-sup-radio-active' : ''}>
                      <input
                        type="radio"
                        name={`preg-${p.id}`}
                        checked={respuestas[p.id] === n.id}
                        onChange={() => setRespuestas({ ...respuestas, [p.id]: n.id })}
                      />
                      <span>
                        <strong>{n.etiqueta || n.valor_numerico}</strong> ({n.valor_numerico} pt.) — {n.descripcion || '—'}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
            <h3 style={{ fontSize: '1.08rem', margin: '1rem 0 0.75rem' }}>Observaciones y cierre</h3>
            {(detalle.campos_cierre || []).map((c) => (
              <div key={c.id} className="admin-usu-field">
                <label>
                  {c.etiqueta}
                  {c.requerido ? ' *' : ''}
                </label>
                <textarea
                  className="admin-usu-msg-textarea"
                  style={{ minHeight: 100 }}
                  value={obs[c.id] || ''}
                  onChange={(e) => setObs({ ...obs, [c.id]: e.target.value })}
                  required={!!c.requerido}
                />
              </div>
            ))}
            <button type="button" className="admin-usu-btn admin-usu-btn-new" style={{ marginTop: 12 }} onClick={enviar}>
              Guardar supervisión
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function PanelHistorial({ instrumentoId: filtroInstrumentoId = null, tituloFiltro = '' }) {
  const [rows, setRows] = useState([]);
  const load = useCallback(() => {
    const params = {};
    if (filtroInstrumentoId) params.instrumento_id = filtroInstrumentoId;
    return api.get('/supervision/evaluaciones', { params }).then((r) => setRows(r.data.evaluaciones || []));
  }, [filtroInstrumentoId]);
  useEffect(() => {
    load().catch(() => {});
  }, [load]);
  return (
    <div>
      {tituloFiltro ? (
        <p className="admin-sup-muted" style={{ marginTop: 0 }}>
          Mostrando supervisiones registradas con la rúbrica: <strong>{tituloFiltro}</strong>
        </p>
      ) : null}
      <div className="admin-usu-table-scroll">
      <table className="admin-usu-table">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Supervisión</th>
            <th>Docente</th>
            <th>Grupo</th>
            <th>Puntaje</th>
            <th>Resultado</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => (
            <tr key={e.id}>
              <td>{e.fecha_evaluacion}</td>
              <td style={{ textAlign: 'left' }}>{e.instrumento_titulo}</td>
              <td style={{ textAlign: 'left' }}>
                {e.evaluado_apellidos}, {e.evaluado_nombres}
              </td>
              <td>
                {e.grado}° {e.seccion} {e.nivel_nombre}
              </td>
              <td>{e.puntaje_total}</td>
              <td>
                <span className="admin-usu-badge">{e.resultado_etiqueta || '—'}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}
