import React, { useCallback, useEffect, useState } from 'react';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import DashboardLayout from '../../components/DashboardLayout';
import Swal from 'sweetalert2';
import './AdminSupervision.css';

const TABS = {
  instrumentos: 'instrumentos',
  cierre: 'cierre',
  supervisores: 'supervisores',
  registrar: 'registrar',
  historial: 'historial'
};

export default function AdminSupervision() {
  const { user } = useAuth();
  const [yo, setYo] = useState(null);
  const [tab, setTab] = useState(() => (user?.tipo === 'ADMINISTRADOR' ? TABS.instrumentos : TABS.registrar));
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
      <div className="admin-supervision">
        <div className="admin-supervision-panel access-denied">
          <p><strong>Módulo no instalado en la base de datos.</strong></p>
          <p className="muted">Ejecute en MySQL el archivo <code>database/migrations/016_supervision_mysql.sql</code>.</p>
        </div>
      </div>
    );
  }

  if (yo === null && !loadErr) {
    return (
      <div className="admin-supervision">
        <div className="admin-supervision-panel" style={{ padding: '2rem', textAlign: 'center' }}>
          Cargando permisos…
        </div>
      </div>
    );
  }

  if (!canConfig && !canExecute) {
    return (
      <div className="admin-supervision">
        <div className="admin-supervision-panel access-denied">
          <p>No tienes acceso a Supervisión.</p>
          <p className="muted">El administrador debe asignarte como supervisor en este módulo.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-supervision">
      <h1 style={{ marginBottom: '0.5rem', fontSize: '1.5rem' }}>Supervisión</h1>
      <p className="muted" style={{ marginBottom: '1rem' }}>
        Instrumentos tipo rúbrica, supervisores y registro de visitas por docente.
      </p>

      <div className="admin-supervision-tabs">
        {canConfig && (
          <>
            <button type="button" className={tab === TABS.instrumentos ? 'active' : ''} onClick={() => setTab(TABS.instrumentos)}>
              Instrumentos
            </button>
            <button type="button" className={tab === TABS.cierre ? 'active' : ''} onClick={() => setTab(TABS.cierre)}>
              Cierre global
            </button>
            <button type="button" className={tab === TABS.supervisores ? 'active' : ''} onClick={() => setTab(TABS.supervisores)}>
              Supervisores
            </button>
          </>
        )}
        {canExecute && (
          <>
            <button type="button" className={tab === TABS.registrar ? 'active' : ''} onClick={() => setTab(TABS.registrar)}>
              Registrar supervisión
            </button>
            <button type="button" className={tab === TABS.historial ? 'active' : ''} onClick={() => setTab(TABS.historial)}>
              Historial
            </button>
          </>
        )}
      </div>

      <div className="admin-supervision-panel">
        {tab === TABS.instrumentos && canConfig && <PanelInstrumentos />}
        {tab === TABS.cierre && canConfig && <PanelCierreGlobal />}
        {tab === TABS.supervisores && canConfig && <PanelSupervisores />}
        {tab === TABS.registrar && canExecute && <PanelRegistrar onDone={loadYo} />}
        {tab === TABS.historial && canExecute && <PanelHistorial />}
      </div>
    </div>
  );
  })();

  return (
    <DashboardLayout>
      <div className="dashboard-container">{inner}</div>
    </DashboardLayout>
  );
}

function PanelInstrumentos() {
  const [list, setList] = useState([]);
  const [sel, setSel] = useState(null);
  const [detalle, setDetalle] = useState(null);
  const [formInst, setFormInst] = useState({
    titulo: '',
    descripcion: '',
    anio: '',
    activo: true,
    cierre_usa_global: true
  });

  const loadList = () => api.get('/supervision/instrumentos').then((r) => setList(r.data.instrumentos || []));

  useEffect(() => {
    loadList().catch(() => {});
  }, []);

  const openNew = () => {
    setSel('new');
    setDetalle(null);
    setFormInst({
      titulo: '',
      descripcion: '',
      anio: '',
      activo: true,
      cierre_usa_global: true
    });
  };

  const openEdit = async (row) => {
    setSel(row.id);
    try {
      const { data } = await api.get(`/supervision/instrumentos/${row.id}/detalle`);
      setDetalle(data);
      setFormInst({
        titulo: data.instrumento.titulo,
        descripcion: data.instrumento.descripcion || '',
        anio: data.instrumento.anio != null ? String(data.instrumento.anio) : '',
        activo: !!data.instrumento.activo,
        cierre_usa_global: !!data.instrumento.cierre_usa_global
      });
    } catch (e) {
      Swal.fire('Error', e.response?.data?.error || 'No se pudo cargar', 'error');
    }
  };

  const saveInstrumento = async () => {
    try {
      const payload = {
        titulo: formInst.titulo,
        descripcion: formInst.descripcion || null,
        anio: formInst.anio === '' ? null : parseInt(formInst.anio, 10),
        activo: formInst.activo,
        cierre_usa_global: formInst.cierre_usa_global
      };
      if (sel === 'new') {
        await api.post('/supervision/instrumentos', payload);
        Swal.fire({ icon: 'success', title: 'Creado', timer: 1600, showConfirmButton: false });
        await loadList();
        setSel(null);
        setDetalle(null);
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
      title: '¿Eliminar instrumento?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar'
    });
    if (!c.isConfirmed) return;
    try {
      await api.delete(`/supervision/instrumentos/${id}`);
      await loadList();
      if (sel === id) {
        setSel(null);
        setDetalle(null);
      }
      Swal.fire({ icon: 'success', title: 'Eliminado', timer: 1400, showConfirmButton: false });
    } catch (e) {
      Swal.fire('Error', e.response?.data?.error || 'No se pudo eliminar', 'error');
    }
  };

  return (
    <div className="admin-supervision-grid2">
      <div>
        <div className="row-actions" style={{ marginBottom: '0.75rem' }}>
          <button type="button" className="btn btn-primary" onClick={openNew}>
            Nuevo instrumento
          </button>
        </div>
        <table>
          <thead>
            <tr>
              <th>Título</th>
              <th>Estado</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.id}>
                <td>{r.titulo}</td>
                <td>{r.activo ? 'Activo' : 'Inactivo'}</td>
                <td className="row-actions">
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => openEdit(r)}>
                    Editar
                  </button>
                  <button type="button" className="btn btn-danger btn-sm" onClick={() => deleteInst(r.id)}>
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div>
        {sel == null && <p className="muted">Seleccione o cree un instrumento para configurar preguntas, niveles y rangos.</p>}
        {sel === 'new' && (
          <>
            <h3 style={{ fontSize: '1.05rem', marginBottom: '0.75rem' }}>Nuevo instrumento</h3>
            <label>Título</label>
            <input value={formInst.titulo} onChange={(e) => setFormInst({ ...formInst, titulo: e.target.value })} />
            <label>Descripción (opcional)</label>
            <textarea value={formInst.descripcion} onChange={(e) => setFormInst({ ...formInst, descripcion: e.target.value })} />
            <label>Año (vacío = todos los años)</label>
            <input
              type="number"
              value={formInst.anio}
              onChange={(e) => setFormInst({ ...formInst, anio: e.target.value })}
              placeholder="Ej. 2026"
            />
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="checkbox"
                checked={formInst.activo}
                onChange={(e) => setFormInst({ ...formInst, activo: e.target.checked })}
              />
              Activo
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="checkbox"
                checked={formInst.cierre_usa_global}
                onChange={(e) => setFormInst({ ...formInst, cierre_usa_global: e.target.checked })}
              />
              Usar campos de cierre globales
            </label>
            <button type="button" className="btn btn-primary" onClick={saveInstrumento}>
              Guardar
            </button>
          </>
        )}
        {sel && sel !== 'new' && detalle && (
          <>
            <h3 style={{ fontSize: '1.05rem', marginBottom: '0.75rem' }}>Editar instrumento</h3>
            <label>Título</label>
            <input value={formInst.titulo} onChange={(e) => setFormInst({ ...formInst, titulo: e.target.value })} />
            <label>Descripción</label>
            <textarea value={formInst.descripcion} onChange={(e) => setFormInst({ ...formInst, descripcion: e.target.value })} />
            <label>Año (vacío = todos)</label>
            <input type="number" value={formInst.anio} onChange={(e) => setFormInst({ ...formInst, anio: e.target.value })} />
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="checkbox"
                checked={formInst.activo}
                onChange={(e) => setFormInst({ ...formInst, activo: e.target.checked })}
              />
              Activo
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="checkbox"
                checked={formInst.cierre_usa_global}
                onChange={(e) => setFormInst({ ...formInst, cierre_usa_global: e.target.checked })}
              />
              Cierre global
            </label>
            <button type="button" className="btn btn-primary" onClick={saveInstrumento} style={{ marginBottom: '1.25rem' }}>
              Guardar datos generales
            </button>

            <h4 style={{ fontSize: '1rem', margin: '1rem 0 0.5rem' }}>Preguntas e ítems</h4>
            {(detalle.preguntas || []).map((p) => (
              <div key={p.id} className="card-pregunta">
                <strong>{p.titulo}</strong>
                <div className="muted" style={{ fontSize: '0.8rem' }}>
                  {p.texto_ayuda}
                </div>
                <div style={{ marginTop: '0.5rem' }}>
                  {(p.niveles || []).map((n) => (
                    <div key={n.id} className="muted" style={{ fontSize: '0.8rem' }}>
                      [{n.valor_numerico}] {n.etiqueta || '—'} — {n.descripcion || ''}
                    </div>
                  ))}
                </div>
                <div className="row-actions" style={{ marginTop: '0.5rem' }}>
                  <MiniNivelForm preguntaId={p.id} onAdded={() => openEdit({ id: sel })} />
                </div>
              </div>
            ))}
            <MiniPreguntaForm instrumentoId={sel} onAdded={() => openEdit({ id: sel })} />

            <h4 style={{ fontSize: '1rem', margin: '1.25rem 0 0.5rem' }}>Rangos de resultado (puntaje total)</h4>
            {(detalle.rangos_resultado || []).map((r) => (
              <div key={r.id} className="row-actions" style={{ alignItems: 'center', marginBottom: '0.35rem' }}>
                <span className="muted">
                  {r.puntaje_min} – {r.puntaje_max}: {r.etiqueta}
                </span>
                <button type="button" className="btn btn-danger btn-sm" onClick={() => delRango(r.id).then(() => openEdit({ id: sel }))}>
                  Quitar
                </button>
              </div>
            ))}
            <MiniRangoForm instrumentoId={sel} onAdded={() => openEdit({ id: sel })} />

            {!formInst.cierre_usa_global && (
              <>
                <h4 style={{ fontSize: '1rem', margin: '1.25rem 0 0.5rem' }}>Campos de cierre (solo este instrumento)</h4>
                <CamposCierreInstrumento instrumentoId={sel} />
              </>
            )}
          </>
        )}
      </div>
    </div>
  );

  async function delRango(id) {
    try {
      await api.delete(`/supervision/rangos/${id}`);
    } catch (e) {
      Swal.fire('Error', e.response?.data?.error, 'error');
    }
  }
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
    <div style={{ marginTop: '0.75rem', padding: '0.75rem', border: '1px dashed #d1d5db', borderRadius: 8 }}>
      <label>Nueva pregunta / ítem</label>
      <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Título" />
      <textarea value={ayuda} onChange={(e) => setAyuda(e.target.value)} placeholder="Texto de ayuda (opcional)" />
      <button type="button" className="btn btn-secondary btn-sm" onClick={submit}>
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
    <div>
      <input style={{ width: 72, display: 'inline-block' }} type="number" step="0.01" value={valor} onChange={(e) => setValor(e.target.value)} title="Puntaje" />
      <input style={{ width: 140, display: 'inline-block', marginLeft: 8 }} value={etiq} onChange={(e) => setEtiq(e.target.value)} placeholder="Etiqueta nivel" />
      <input style={{ width: '55%', marginLeft: 8 }} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Descripción" />
      <button type="button" className="btn btn-primary btn-sm" style={{ marginLeft: 8 }} onClick={submit}>
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
    <div style={{ marginTop: '0.5rem' }}>
      <input style={{ width: 90, display: 'inline-block' }} type="number" step="0.01" value={min} onChange={(e) => setMin(e.target.value)} placeholder="Mín" />
      <input style={{ width: 90, display: 'inline-block', marginLeft: 8 }} type="number" step="0.01" value={max} onChange={(e) => setMax(e.target.value)} placeholder="Máx" />
      <input style={{ width: 200, marginLeft: 8 }} value={etiq} onChange={(e) => setEtiq(e.target.value)} placeholder="Etiqueta (ej. En proceso)" />
      <button type="button" className="btn btn-secondary btn-sm" style={{ marginLeft: 8 }} onClick={submit}>
        Añadir rango
      </button>
    </div>
  );
}

function CamposCierreInstrumento({ instrumentoId }) {
  const [campos, setCampos] = useState([]);
  const load = () =>
    api.get(`/supervision/instrumentos/${instrumentoId}/campos-cierre`).then((r) => setCampos(r.data.campos || []));
  useEffect(() => {
    load().catch(() => {});
  }, [instrumentoId]);
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
        <div key={c.id} className="row-actions" style={{ marginBottom: 6 }}>
          <span>{c.etiqueta}</span>
          <button type="button" className="btn btn-danger btn-sm" onClick={() => del(c.id)}>
            Quitar
          </button>
        </div>
      ))}
      <input value={etiq} onChange={(e) => setEtiq(e.target.value)} placeholder="Nueva etiqueta de campo" />
      <button type="button" className="btn btn-secondary btn-sm" onClick={add}>
        Añadir campo
      </button>
    </div>
  );
}

function PanelCierreGlobal() {
  const [campos, setCampos] = useState([]);
  const [etiq, setEtiq] = useState('');
  const load = () => api.get('/supervision/campos-cierre/global').then((r) => setCampos(r.data.campos || []));
  useEffect(() => {
    load().catch(() => {});
  }, []);
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
      <p className="muted">Estos campos se usan al final de cada supervisión cuando el instrumento tiene &quot;Cierre global&quot; activado.</p>
      <p className="muted">Sugerencia: Fortalezas, Oportunidades de mejora, Acción inmediata.</p>
      <table>
        <thead>
          <tr>
            <th>Etiqueta</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {campos.map((c) => (
            <tr key={c.id}>
              <td>{c.etiqueta}</td>
              <td>
                <button type="button" className="btn btn-danger btn-sm" onClick={() => del(c.id)}>
                  Eliminar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginTop: 12 }}>
        <input value={etiq} onChange={(e) => setEtiq(e.target.value)} placeholder="Nueva etiqueta" />
        <button type="button" className="btn btn-primary" style={{ marginLeft: 8 }} onClick={add}>
          Añadir
        </button>
      </div>
    </div>
  );
}

function PanelSupervisores() {
  const [list, setList] = useState([]);
  const [q, setQ] = useState('');
  const [candidatos, setCandidatos] = useState([]);
  const load = () => api.get('/supervision/supervisores').then((r) => setList(r.data.supervisores || []));
  useEffect(() => {
    load().catch(() => {});
  }, []);
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
      <p className="muted">Los supervisores pueden registrar visitas e historial; no reciben el menú de configuración.</p>
      <h4 style={{ fontSize: '1rem' }}>Actuales</h4>
      <table>
        <thead>
          <tr>
            <th>Usuario</th>
            <th>Nombre</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {list.map((s) => (
            <tr key={s.id}>
              <td>{s.dni}</td>
              <td>
                {s.nombres} {s.apellidos}
              </td>
              <td>
                <button type="button" className="btn btn-danger btn-sm" onClick={() => del(s.id)}>
                  Quitar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <h4 style={{ fontSize: '1rem', marginTop: 16 }}>Añadir personal</h4>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por DNI o nombre" />
      <button type="button" className="btn btn-secondary" style={{ marginLeft: 8 }} onClick={buscar}>
        Buscar
      </button>
      <ul style={{ marginTop: 12, paddingLeft: 18 }}>
        {candidatos.map((p) => (
          <li key={p.usuario_id} style={{ marginBottom: 8 }}>
            {p.dni} — {p.nombres} {p.apellidos}{' '}
            <button type="button" className="btn btn-primary btn-sm" onClick={() => add(p.usuario_id)}>
              Asignar
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PanelRegistrar({ onDone }) {
  const [instrumentos, setInstrumentos] = useState([]);
  const [niveles, setNiveles] = useState([]);
  const [grupos, setGrupos] = useState([]);
  const [docentes, setDocentes] = useState([]);
  const [instId, setInstId] = useState('');
  const [nivelId, setNivelId] = useState('');
  const [grupoId, setGrupoId] = useState('');
  const [personalId, setPersonalId] = useState('');
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [detalle, setDetalle] = useState(null);
  const [respuestas, setRespuestas] = useState({});
  const [obs, setObs] = useState({});

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
      Swal.fire('Atención', 'Elija un instrumento', 'warning');
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
      Swal.fire('Error', e.response?.data?.error || 'No se pudo cargar el instrumento', 'error');
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
    <div>
      <div className="admin-supervision-grid2">
        <div>
          <label>Instrumento</label>
          <select value={instId} onChange={(e) => setInstId(e.target.value)}>
            <option value="">— Elegir —</option>
            {instrumentos.map((i) => (
              <option key={i.id} value={i.id}>
                {i.titulo}
              </option>
            ))}
          </select>
          <label>Nivel</label>
          <select value={nivelId} onChange={(e) => setNivelId(e.target.value)}>
            <option value="">— Elegir —</option>
            {niveles.map((n) => (
              <option key={n.id} value={n.id}>
                {n.nombre}
              </option>
            ))}
          </select>
          <label>Grupo / aula</label>
          <select value={grupoId} onChange={(e) => setGrupoId(e.target.value)}>
            <option value="">— Elegir —</option>
            {grupos.map((g) => (
              <option key={g.id} value={g.id}>
                {g.grado}° {g.seccion} — {g.nivel_nombre}
              </option>
            ))}
          </select>
          <label>Docente a supervisar</label>
          <select value={personalId} onChange={(e) => setPersonalId(e.target.value)}>
            <option value="">— Elegir —</option>
            {docentes.map((d) => (
              <option key={d.personal_id} value={d.personal_id}>
                {d.apellidos}, {d.nombres}
              </option>
            ))}
          </select>
          <label>Fecha</label>
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          <button type="button" className="btn btn-primary" onClick={cargarFormulario}>
            Cargar formulario del instrumento
          </button>
        </div>
        <div>
          {detalle && (
            <>
              <p className="muted">
                Puntaje previo: <strong>{puntajePrev.toFixed(2)}</strong> (debe caer en un rango configurado)
              </p>
              {(detalle.preguntas || []).map((p) => (
                <div key={p.id} className="card-pregunta">
                  <strong>{p.titulo}</strong>
                  {(p.niveles || []).map((n) => (
                    <label key={n.id} className="nivel-option">
                      <input
                        type="radio"
                        name={`preg-${p.id}`}
                        checked={respuestas[p.id] === n.id}
                        onChange={() => setRespuestas({ ...respuestas, [p.id]: n.id })}
                      />{' '}
                      <strong>{n.etiqueta || n.valor_numerico}</strong> ({n.valor_numerico} pt.) — {n.descripcion || '—'}
                    </label>
                  ))}
                </div>
              ))}
              <h4 style={{ fontSize: '1rem', marginTop: 16 }}>Observaciones y cierre</h4>
              {(detalle.campos_cierre || []).map((c) => (
                <div key={c.id}>
                  <label>
                    {c.etiqueta}
                    {c.requerido ? ' *' : ''}
                  </label>
                  <textarea
                    value={obs[c.id] || ''}
                    onChange={(e) => setObs({ ...obs, [c.id]: e.target.value })}
                    required={!!c.requerido}
                  />
                </div>
              ))}
              <button type="button" className="btn btn-primary" style={{ marginTop: 12 }} onClick={enviar}>
                Guardar supervisión
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function PanelHistorial() {
  const [rows, setRows] = useState([]);
  const load = () => api.get('/supervision/evaluaciones').then((r) => setRows(r.data.evaluaciones || []));
  useEffect(() => {
    load().catch(() => {});
  }, []);
  return (
    <div style={{ overflowX: 'auto' }}>
      <table>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Instrumento</th>
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
              <td>{e.instrumento_titulo}</td>
              <td>
                {e.evaluado_apellidos}, {e.evaluado_nombres}
              </td>
              <td>
                {e.grado}° {e.seccion} {e.nivel_nombre}
              </td>
              <td>{e.puntaje_total}</td>
              <td>{e.resultado_etiqueta}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
