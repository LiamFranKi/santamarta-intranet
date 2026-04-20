import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import api from '../../services/api';
import Swal from 'sweetalert2';
import './AdminDocumentosGestion.css';
import './AdminAcademico.css';

function Btn({ children, onClick, variant }) {
  return (
    <button type="button" className={variant === 'ghost' ? 'dg-btn-ghost' : 'dg-btn-primary'} onClick={onClick}>
      {children}
    </button>
  );
}

function useSection() {
  const { pathname } = useLocation();
  return useMemo(() => {
    const m = pathname.match(/\/admin\/academico\/([^/]+)/);
    return m ? m[1] : 'niveles';
  }, [pathname]);
}

export default function AdminAcademico() {
  const section = useSection();
  const [meta, setMeta] = useState(null);
  const [loadingMeta, setLoadingMeta] = useState(true);

  const loadMeta = useCallback(async () => {
    try {
      const { data } = await api.get('/admin/academico/meta');
      setMeta(data);
    } catch (e) {
      console.error(e);
      Swal.fire({ icon: 'error', title: 'Error', text: e.response?.data?.error || 'No se pudo cargar el catálogo base' });
    } finally {
      setLoadingMeta(false);
    }
  }, []);

  useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  const titles = {
    niveles: { title: 'Niveles', desc: 'Niveles de enseñanza (Inicial, Primaria, Secundaria, etc.)' },
    grados: { title: 'Grados', desc: 'Aulas por año: grado, sección, turno, sede y tutor (equivalente a grupos del año activo).' },
    cursos: { title: 'Cursos', desc: 'Cursos o espacios curriculares (Matemática, Comunicación, etc.).' },
    asignaturas: { title: 'Asignaturas', desc: 'Asignación docente por grupo y curso.' },
    areas: { title: 'Áreas', desc: 'Áreas curriculares y su vínculo con cursos (para libretas y reportes).' }
  };
  const info = titles[section] || titles.niveles;

  if (loadingMeta && !meta) {
    return (
      <div className="dg-page">
        <p className="dg-page-header">Cargando catálogo académico…</p>
      </div>
    );
  }

  return (
    <div className="admin-academico-wrap dg-page">
      <header className="dg-page-header">
        <h1>{info.title}</h1>
        <p>{info.desc}</p>
      </header>

      {section === 'niveles' && <NivelesPanel onRefreshMeta={loadMeta} />}
      {section === 'grados' && <GruposPanel meta={meta} />}
      {section === 'cursos' && <CursosPanel />}
      {section === 'areas' && <AreasPanel />}
      {section === 'asignaturas' && <AsignaturasPanel meta={meta} />}
    </div>
  );
}

function NivelesPanel({ onRefreshMeta }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ nombre: '', hora_entrada: '', tolerancia_minutos: '', tipo_calificacion: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/admin/academico/niveles');
      setRows(data.niveles || []);
    } catch (e) {
      Swal.fire({ icon: 'error', text: e.response?.data?.error || 'Error al cargar' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openNew = () => {
    setForm({ nombre: '', hora_entrada: '08:00:00', tolerancia_minutos: '5', tipo_calificacion: '' });
    setModal('new');
  };

  const openEdit = (r) => {
    setForm({
      nombre: r.nombre || '',
      hora_entrada: r.hora_entrada || '',
      tolerancia_minutos: r.tolerancia_minutos != null ? String(r.tolerancia_minutos) : '',
      tipo_calificacion: r.tipo_calificacion || ''
    });
    setModal({ edit: r });
  };

  const guardar = async () => {
    if (!form.nombre.trim()) {
      Swal.fire({ icon: 'warning', title: 'Indique el nombre' });
      return;
    }
    try {
      if (modal?.edit) {
        await api.put(`/admin/academico/niveles/${modal.edit.id}`, form);
        Swal.fire({ icon: 'success', title: 'Actualizado', timer: 1400, showConfirmButton: false });
      } else {
        await api.post('/admin/academico/niveles', form);
        Swal.fire({ icon: 'success', title: 'Creado', timer: 1400, showConfirmButton: false });
      }
      setModal(null);
      await load();
      onRefreshMeta();
    } catch (e) {
      Swal.fire({ icon: 'error', text: e.response?.data?.error || 'No se pudo guardar' });
    }
  };

  const eliminar = async (r) => {
    const ok = await Swal.fire({
      icon: 'question',
      title: '¿Eliminar nivel?',
      text: r.nombre,
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar'
    });
    if (!ok.isConfirmed) return;
    try {
      await api.delete(`/admin/academico/niveles/${r.id}`);
      await load();
      onRefreshMeta();
      Swal.fire({ icon: 'success', timer: 1200, showConfirmButton: false });
    } catch (e) {
      Swal.fire({ icon: 'error', text: e.response?.data?.error || 'No se pudo eliminar' });
    }
  };

  return (
    <section className="dg-section">
      <div className="dg-section-title">
        <span>Listado</span>
        <Btn onClick={openNew}>+ Nuevo nivel</Btn>
      </div>
      {loading ? (
        <p>Cargando…</p>
      ) : (
        <div className="admin-academico-table-wrap">
          <table className="admin-academico-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Nombre</th>
                <th>Hora entrada</th>
                <th>Tolerancia (min)</th>
                <th>Tipo calificación</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.id}</td>
                  <td>{r.nombre}</td>
                  <td>{r.hora_entrada || '—'}</td>
                  <td>{r.tolerancia_minutos != null ? r.tolerancia_minutos : '—'}</td>
                  <td>{r.tipo_calificacion || '—'}</td>
                  <td>
                    <div className="admin-academico-actions">
                      <Btn variant="ghost" onClick={() => openEdit(r)}>Editar</Btn>
                      <Btn variant="ghost" onClick={() => eliminar(r)}>Eliminar</Btn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <div className="admin-academico-modal-overlay" onClick={() => setModal(null)}>
          <div className="admin-academico-modal" onClick={(e) => e.stopPropagation()}>
            <h3>{modal.edit ? 'Editar nivel' : 'Nuevo nivel'}</h3>
            <p className="admin-academico-hint">La hora y tolerancia se usan en asistencia (si la columna existe en BD).</p>
            <div className="admin-academico-field">
              <label>Nombre *</label>
              <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
            </div>
            <div className="admin-academico-field">
              <label>Hora entrada</label>
              <input placeholder="08:00:00" value={form.hora_entrada} onChange={(e) => setForm({ ...form, hora_entrada: e.target.value })} />
            </div>
            <div className="admin-academico-field">
              <label>Tolerancia (minutos)</label>
              <input type="number" value={form.tolerancia_minutos} onChange={(e) => setForm({ ...form, tolerancia_minutos: e.target.value })} />
            </div>
            <div className="admin-academico-field">
              <label>Tipo calificación</label>
              <input value={form.tipo_calificacion} onChange={(e) => setForm({ ...form, tipo_calificacion: e.target.value })} />
            </div>
            <div className="admin-academico-modal-actions">
              <Btn variant="ghost" onClick={() => setModal(null)}>Cancelar</Btn>
              <Btn onClick={guardar}>Guardar</Btn>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function GruposPanel({ meta }) {
  const anioDef = meta?.anio_activo || new Date().getFullYear();
  const [anio, setAnio] = useState(anioDef);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/admin/academico/grupos', { params: { anio } });
      setRows(data.grupos || []);
    } catch (e) {
      Swal.fire({ icon: 'error', text: e.response?.data?.error || 'Error' });
    } finally {
      setLoading(false);
    }
  }, [anio]);

  useEffect(() => {
    load();
  }, [load]);

  const openNew = () => {
    setForm({
      anio,
      nivel_id: meta?.niveles?.[0]?.id || '',
      grado: 1,
      seccion: 'A',
      turno_id: meta?.turnos?.[0]?.id || '',
      sede_id: meta?.sedes?.[0]?.id || '',
      tutor_id: ''
    });
    setModal('new');
  };

  const openEdit = (r) => {
    setForm({
      anio: r.anio,
      nivel_id: r.nivel_id,
      grado: r.grado,
      seccion: r.seccion,
      turno_id: r.turno_id,
      sede_id: r.sede_id,
      tutor_id: r.tutor_id || ''
    });
    setModal({ edit: r });
  };

  const guardar = async () => {
    try {
      const body = { ...form, grado: parseInt(form.grado, 10), anio: parseInt(form.anio, 10) };
      if (modal?.edit) {
        await api.put(`/admin/academico/grupos/${modal.edit.id}`, body);
      } else {
        await api.post('/admin/academico/grupos', body);
      }
      setModal(null);
      await load();
      Swal.fire({ icon: 'success', timer: 1200, showConfirmButton: false });
    } catch (e) {
      Swal.fire({ icon: 'error', text: e.response?.data?.error || 'No se pudo guardar' });
    }
  };

  const eliminar = async (r) => {
    const ok = await Swal.fire({
      icon: 'warning',
      title: '¿Eliminar grupo?',
      text: `${r.nivel_nombre} ${r.grado}° ${r.seccion}`,
      showCancelButton: true
    });
    if (!ok.isConfirmed) return;
    try {
      await api.delete(`/admin/academico/grupos/${r.id}`);
      await load();
      Swal.fire({ icon: 'success', timer: 1200, showConfirmButton: false });
    } catch (e) {
      Swal.fire({ icon: 'error', text: e.response?.data?.error || 'No se pudo eliminar' });
    }
  };

  return (
    <section className="dg-section">
      <div className="dg-filters">
        <label>
          Año
          <input type="number" value={anio} onChange={(e) => setAnio(parseInt(e.target.value, 10) || anioDef)} style={{ marginLeft: 8, width: 100 }} />
        </label>
        <Btn onClick={openNew}>+ Nuevo grupo</Btn>
      </div>
      {loading ? (
        <p>Cargando…</p>
      ) : (
        <div className="admin-academico-table-wrap">
          <table className="admin-academico-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Nivel</th>
                <th>Grado</th>
                <th>Secc.</th>
                <th>Turno</th>
                <th>Sede</th>
                <th>Tutor</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.id}</td>
                  <td>{r.nivel_nombre}</td>
                  <td>{r.grado}°</td>
                  <td>{r.seccion}</td>
                  <td>{r.turno_nombre}</td>
                  <td>{r.sede_nombre || '—'}</td>
                  <td>{r.tutor_nombre || '—'}</td>
                  <td>
                    <div className="admin-academico-actions">
                      <Btn variant="ghost" onClick={() => openEdit(r)}>Editar</Btn>
                      <Btn variant="ghost" onClick={() => eliminar(r)}>Eliminar</Btn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && meta && (
        <div className="admin-academico-modal-overlay" onClick={() => setModal(null)}>
          <div className="admin-academico-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <h3>{modal.edit ? 'Editar grupo' : 'Nuevo grupo'}</h3>
            <div className="admin-academico-field">
              <label>Año</label>
              <input type="number" value={form.anio} onChange={(e) => setForm({ ...form, anio: e.target.value })} />
            </div>
            <div className="admin-academico-field">
              <label>Nivel</label>
              <select value={form.nivel_id} onChange={(e) => setForm({ ...form, nivel_id: e.target.value })}>
                {(meta.niveles || []).map((n) => (
                  <option key={n.id} value={n.id}>{n.nombre}</option>
                ))}
              </select>
            </div>
            <div className="admin-academico-field">
              <label>Grado (número)</label>
              <input type="number" min={1} value={form.grado} onChange={(e) => setForm({ ...form, grado: e.target.value })} />
            </div>
            <div className="admin-academico-field">
              <label>Sección</label>
              <input value={form.seccion} onChange={(e) => setForm({ ...form, seccion: e.target.value })} maxLength={8} />
            </div>
            <div className="admin-academico-field">
              <label>Turno</label>
              <select value={form.turno_id} onChange={(e) => setForm({ ...form, turno_id: e.target.value })}>
                {(meta.turnos || []).map((t) => (
                  <option key={t.id} value={t.id}>{t.nombre}</option>
                ))}
              </select>
            </div>
            <div className="admin-academico-field">
              <label>Sede</label>
              <select value={form.sede_id} onChange={(e) => setForm({ ...form, sede_id: e.target.value })}>
                {(meta.sedes || []).map((s) => (
                  <option key={s.id} value={s.id}>{s.nombre}</option>
                ))}
              </select>
            </div>
            <div className="admin-academico-field">
              <label>Tutor (opcional)</label>
              <select value={form.tutor_id} onChange={(e) => setForm({ ...form, tutor_id: e.target.value })}>
                <option value="">—</option>
                {(meta.docentes || []).map((d) => (
                  <option key={d.id} value={d.id}>{d.nombre}</option>
                ))}
              </select>
            </div>
            <div className="admin-academico-modal-actions">
              <Btn variant="ghost" onClick={() => setModal(null)}>Cancelar</Btn>
              <Btn onClick={guardar}>Guardar</Btn>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function CursosPanel() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ nombre: '', imagen: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/admin/academico/cursos');
      setRows(data.cursos || []);
    } catch (e) {
      Swal.fire({ icon: 'error', text: e.response?.data?.error || 'Error' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const guardar = async () => {
    if (!form.nombre.trim()) {
      Swal.fire({ icon: 'warning', title: 'Nombre requerido' });
      return;
    }
    try {
      if (modal?.edit) {
        await api.put(`/admin/academico/cursos/${modal.edit.id}`, form);
      } else {
        await api.post('/admin/academico/cursos', form);
      }
      setModal(null);
      await load();
      Swal.fire({ icon: 'success', timer: 1200, showConfirmButton: false });
    } catch (e) {
      Swal.fire({ icon: 'error', text: e.response?.data?.error || 'Error' });
    }
  };

  const eliminar = async (r) => {
    const ok = await Swal.fire({ icon: 'question', title: '¿Eliminar curso?', text: r.nombre, showCancelButton: true });
    if (!ok.isConfirmed) return;
    try {
      await api.delete(`/admin/academico/cursos/${r.id}`);
      await load();
      Swal.fire({ icon: 'success', timer: 1200, showConfirmButton: false });
    } catch (e) {
      Swal.fire({ icon: 'error', text: e.response?.data?.error || 'No se pudo eliminar' });
    }
  };

  return (
    <section className="dg-section">
      <div className="dg-section-title">
        <span>Cursos</span>
        <Btn onClick={() => { setForm({ nombre: '', imagen: '' }); setModal('new'); }}>+ Nuevo curso</Btn>
      </div>
      {loading ? (
        <p>Cargando…</p>
      ) : (
        <div className="admin-academico-table-wrap">
          <table className="admin-academico-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Nombre</th>
                <th>Imagen (archivo)</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.id}</td>
                  <td>{r.nombre}</td>
                  <td style={{ fontSize: '0.8rem', color: '#64748b' }}>{r.imagen || '—'}</td>
                  <td>
                    <div className="admin-academico-actions">
                      <Btn variant="ghost" onClick={() => { setForm({ nombre: r.nombre, imagen: r.imagen || '' }); setModal({ edit: r }); }}>Editar</Btn>
                      <Btn variant="ghost" onClick={() => eliminar(r)}>Eliminar</Btn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {modal && (
        <div className="admin-academico-modal-overlay" onClick={() => setModal(null)}>
          <div className="admin-academico-modal" onClick={(e) => e.stopPropagation()}>
            <h3>{modal.edit ? 'Editar curso' : 'Nuevo curso'}</h3>
            <div className="admin-academico-field">
              <label>Nombre *</label>
              <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
            </div>
            <div className="admin-academico-field">
              <label>Imagen (nombre archivo en /Static/Archivos, opcional)</label>
              <input value={form.imagen} onChange={(e) => setForm({ ...form, imagen: e.target.value })} placeholder="ej. curso-mate.png" />
            </div>
            <div className="admin-academico-modal-actions">
              <Btn variant="ghost" onClick={() => setModal(null)}>Cancelar</Btn>
              <Btn onClick={guardar}>Guardar</Btn>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function AreasPanel() {
  const [areas, setAreas] = useState([]);
  const [cursos, setCursos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalArea, setModalArea] = useState(null);
  const [formNombre, setFormNombre] = useState('');
  const [linkModal, setLinkModal] = useState(null);
  const [vinculados, setVinculados] = useState([]);
  const [addCursoId, setAddCursoId] = useState('');

  const loadAreas = useCallback(async () => {
    const { data } = await api.get('/admin/academico/areas');
    setAreas(data.areas || []);
  }, []);

  const loadCursos = useCallback(async () => {
    const { data } = await api.get('/admin/academico/cursos');
    setCursos(data.cursos || []);
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        await Promise.all([loadAreas(), loadCursos()]);
      } catch (e) {
        Swal.fire({ icon: 'error', text: e.response?.data?.error || 'Error' });
      } finally {
        setLoading(false);
      }
    })();
  }, [loadAreas, loadCursos]);

  const guardarArea = async () => {
    if (!formNombre.trim()) return;
    try {
      if (modalArea?.edit) {
        await api.put(`/admin/academico/areas/${modalArea.edit.id}`, { nombre: formNombre });
      } else {
        await api.post('/admin/academico/areas', { nombre: formNombre });
      }
      setModalArea(null);
      await loadAreas();
      Swal.fire({ icon: 'success', timer: 1200, showConfirmButton: false });
    } catch (e) {
      Swal.fire({ icon: 'error', text: e.response?.data?.error || 'Error' });
    }
  };

  const openVinculos = async (area) => {
    setLinkModal(area);
    setAddCursoId('');
    const { data } = await api.get(`/admin/academico/areas/${area.id}/cursos`);
    setVinculados(data.cursos || []);
  };

  const agregarVinculo = async () => {
    if (!addCursoId) return;
    try {
      await api.post(`/admin/academico/areas/${linkModal.id}/cursos`, { curso_id: addCursoId });
      const { data } = await api.get(`/admin/academico/areas/${linkModal.id}/cursos`);
      setVinculados(data.cursos || []);
      setAddCursoId('');
    } catch (e) {
      Swal.fire({ icon: 'error', text: e.response?.data?.error || 'No se pudo vincular' });
    }
  };

  const quitarVinculo = async (cursoId) => {
    try {
      await api.delete(`/admin/academico/areas/${linkModal.id}/cursos/${cursoId}`);
      setVinculados((v) => v.filter((c) => c.id !== cursoId));
    } catch (e) {
      Swal.fire({ icon: 'error', text: e.response?.data?.error || 'Error' });
    }
  };

  const eliminarArea = async (a) => {
    const ok = await Swal.fire({ icon: 'question', title: '¿Eliminar área?', text: a.nombre, showCancelButton: true });
    if (!ok.isConfirmed) return;
    try {
      await api.delete(`/admin/academico/areas/${a.id}`);
      await loadAreas();
      Swal.fire({ icon: 'success', timer: 1200, showConfirmButton: false });
    } catch (e) {
      Swal.fire({ icon: 'error', text: e.response?.data?.error || 'Error' });
    }
  };

  const cursosDisponibles = useMemo(() => {
    if (!linkModal) return [];
    const ids = new Set(vinculados.map((c) => c.id));
    return cursos.filter((c) => !ids.has(c.id));
  }, [cursos, vinculados, linkModal]);

  return (
    <section className="dg-section">
      <div className="dg-section-title">
        <span>Áreas curriculares</span>
        <Btn onClick={() => { setFormNombre(''); setModalArea('new'); }}>+ Nueva área</Btn>
      </div>
      {loading ? (
        <p>Cargando…</p>
      ) : (
        <div className="admin-academico-table-wrap">
          <table className="admin-academico-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Nombre</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {areas.map((a) => (
                <tr key={a.id}>
                  <td>{a.id}</td>
                  <td>{a.nombre}</td>
                  <td>
                    <div className="admin-academico-actions">
                      <Btn variant="ghost" onClick={() => { setFormNombre(a.nombre); setModalArea({ edit: a }); }}>Editar</Btn>
                      <Btn variant="ghost" onClick={() => openVinculos(a)}>Cursos del área</Btn>
                      <Btn variant="ghost" onClick={() => eliminarArea(a)}>Eliminar</Btn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalArea && (
        <div className="admin-academico-modal-overlay" onClick={() => setModalArea(null)}>
          <div className="admin-academico-modal" onClick={(e) => e.stopPropagation()}>
            <h3>{modalArea.edit ? 'Editar área' : 'Nueva área'}</h3>
            <div className="admin-academico-field">
              <label>Nombre *</label>
              <input value={formNombre} onChange={(e) => setFormNombre(e.target.value)} />
            </div>
            <div className="admin-academico-modal-actions">
              <Btn variant="ghost" onClick={() => setModalArea(null)}>Cancelar</Btn>
              <Btn onClick={guardarArea}>Guardar</Btn>
            </div>
          </div>
        </div>
      )}

      {linkModal && (
        <div className="admin-academico-modal-overlay" onClick={() => setLinkModal(null)}>
          <div className="admin-academico-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <h3>Cursos en: {linkModal.nombre}</h3>
            <p className="admin-academico-hint">Vincule cursos del área para libretas y reportes (tabla areas_cursos).</p>
            <ul style={{ margin: '0 0 1rem 1rem', padding: 0 }}>
              {vinculados.map((c) => (
                <li key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span>{c.nombre}</span>
                  <Btn variant="ghost" onClick={() => quitarVinculo(c.id)}>Quitar</Btn>
                </li>
              ))}
              {vinculados.length === 0 && <li style={{ color: '#64748b' }}>Ningún curso vinculado.</li>}
            </ul>
            <div className="admin-academico-field">
              <label>Añadir curso</label>
              <select value={addCursoId} onChange={(e) => setAddCursoId(e.target.value)}>
                <option value="">— Seleccione —</option>
                {cursosDisponibles.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
            </div>
            <div className="admin-academico-modal-actions">
              <Btn variant="ghost" onClick={() => setLinkModal(null)}>Cerrar</Btn>
              <Btn onClick={agregarVinculo} disabled={!addCursoId}>Añadir</Btn>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function AsignaturasPanel({ meta }) {
  const anioDef = meta?.anio_activo || new Date().getFullYear();
  const [anio, setAnio] = useState(anioDef);
  const [grupoId, setGrupoId] = useState('');
  const [rows, setRows] = useState([]);
  const [grupos, setGrupos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});

  const loadGrupos = useCallback(async () => {
    const { data } = await api.get('/admin/academico/grupos', { params: { anio } });
    setGrupos(data.grupos || []);
  }, [anio]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { anio };
      if (grupoId) params.grupo_id = grupoId;
      const { data } = await api.get('/admin/academico/asignaturas', { params });
      setRows(data.asignaturas || []);
    } catch (e) {
      Swal.fire({ icon: 'error', text: e.response?.data?.error || 'Error' });
    } finally {
      setLoading(false);
    }
  }, [anio, grupoId]);

  useEffect(() => {
    loadGrupos().catch(() => {});
  }, [loadGrupos]);

  useEffect(() => {
    load();
  }, [load]);

  const [cursosList, setCursosList] = useState([]);
  useEffect(() => {
    api.get('/admin/academico/cursos').then((r) => setCursosList(r.data.cursos || [])).catch(() => {});
  }, []);

  const openNew = () => {
    setForm({
      grupo_id: grupos[0]?.id || '',
      curso_id: cursosList[0]?.id || '',
      personal_id: meta?.docentes?.[0]?.id || ''
    });
    setModal('new');
  };

  const openEdit = (r) => {
    setForm({
      grupo_id: r.grupo_id,
      curso_id: r.curso_id,
      personal_id: r.personal_id
    });
    setModal({ edit: r });
  };

  const guardar = async () => {
    try {
      const body = {
        grupo_id: parseInt(form.grupo_id, 10),
        curso_id: parseInt(form.curso_id, 10),
        personal_id: parseInt(form.personal_id, 10)
      };
      if (modal?.edit) {
        await api.put(`/admin/academico/asignaturas/${modal.edit.id}`, body);
      } else {
        await api.post('/admin/academico/asignaturas', body);
      }
      setModal(null);
      await load();
      Swal.fire({ icon: 'success', timer: 1200, showConfirmButton: false });
    } catch (e) {
      Swal.fire({ icon: 'error', text: e.response?.data?.error || 'Error' });
    }
  };

  const eliminar = async (r) => {
    const ok = await Swal.fire({
      icon: 'warning',
      title: '¿Eliminar asignatura?',
      html: `${r.nivel_nombre} ${r.grado}° ${r.seccion} — ${r.curso_nombre}`,
      showCancelButton: true
    });
    if (!ok.isConfirmed) return;
    try {
      await api.delete(`/admin/academico/asignaturas/${r.id}`);
      await load();
      Swal.fire({ icon: 'success', timer: 1200, showConfirmButton: false });
    } catch (e) {
      Swal.fire({ icon: 'error', text: e.response?.data?.error || 'No se pudo eliminar (puede haber notas o contenidos).' });
    }
  };

  return (
    <section className="dg-section">
      <div className="dg-filters">
        <label>
          Año
          <input type="number" value={anio} onChange={(e) => setAnio(parseInt(e.target.value, 10) || anioDef)} style={{ marginLeft: 8, width: 100 }} />
        </label>
        <label>
          Filtrar grupo
          <select value={grupoId} onChange={(e) => setGrupoId(e.target.value)} style={{ marginLeft: 8, minWidth: 220 }}>
            <option value="">Todos</option>
            {grupos.map((g) => (
              <option key={g.id} value={g.id}>
                {g.nivel_nombre} {g.grado}° {g.seccion}
              </option>
            ))}
          </select>
        </label>
        <Btn onClick={openNew}>+ Nueva asignatura</Btn>
      </div>
      {loading ? (
        <p>Cargando…</p>
      ) : (
        <div className="admin-academico-table-wrap">
          <table className="admin-academico-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Grupo</th>
                <th>Curso</th>
                <th>Docente</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.id}</td>
                  <td>{r.nivel_nombre} {r.grado}° {r.seccion}</td>
                  <td>{r.curso_nombre}</td>
                  <td>{r.docente_nombre}</td>
                  <td>
                    <div className="admin-academico-actions">
                      <Btn variant="ghost" onClick={() => openEdit(r)}>Editar</Btn>
                      <Btn variant="ghost" onClick={() => eliminar(r)}>Eliminar</Btn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && meta && (
        <div className="admin-academico-modal-overlay" onClick={() => setModal(null)}>
          <div className="admin-academico-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <h3>{modal.edit ? 'Editar asignatura' : 'Nueva asignatura'}</h3>
            <div className="admin-academico-field">
              <label>Grupo</label>
              <select value={form.grupo_id} onChange={(e) => setForm({ ...form, grupo_id: e.target.value })}>
                {grupos.map((g) => (
                  <option key={g.id} value={g.id}>{g.nivel_nombre} {g.grado}° {g.seccion}</option>
                ))}
              </select>
            </div>
            <div className="admin-academico-field">
              <label>Curso</label>
              <select value={form.curso_id} onChange={(e) => setForm({ ...form, curso_id: e.target.value })}>
                {cursosList.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
            </div>
            <div className="admin-academico-field">
              <label>Docente</label>
              <select value={form.personal_id} onChange={(e) => setForm({ ...form, personal_id: e.target.value })}>
                {(meta.docentes || []).map((d) => (
                  <option key={d.id} value={d.id}>{d.nombre}</option>
                ))}
              </select>
            </div>
            <div className="admin-academico-modal-actions">
              <Btn variant="ghost" onClick={() => setModal(null)}>Cancelar</Btn>
              <Btn onClick={guardar}>Guardar</Btn>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
