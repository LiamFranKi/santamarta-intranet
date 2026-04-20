import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import api from '../../services/api';
import Swal from 'sweetalert2';
import './AdminDocumentosGestion.css';
import './AdminAcademico.css';

/** Evita que el sidebar (z-index 9999) cubra el modal: render fuera de .dashboard-content. */
function ModalRoot({ open, onClose, children, wide }) {
  if (!open) return null;
  return createPortal(
    <div className="admin-academico-modal-overlay" onClick={onClose}>
      <div
        className={`admin-academico-modal${wide ? ' admin-academico-modal--wide' : ''}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {children}
      </div>
    </div>,
    document.body
  );
}

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

  useEffect(() => {
    document.body.classList.add('admin-academico-page');
    return () => document.body.classList.remove('admin-academico-page');
  }, []);

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
      {section === 'cursos' && <CursosPanel meta={meta} />}
      {section === 'areas' && <AreasPanel meta={meta} />}
      {section === 'asignaturas' && <AsignaturasPanel meta={meta} />}
    </div>
  );
}

const NIVEL_FORM_DEFAULT = {
  nombre: '',
  abreviatura: '',
  codigo_modular: '',
  definicion_grado: '',
  grado_minimo: '',
  grado_maximo: '',
  tipo_calificacion: '',
  tipo_calificacion_final: '',
  nota_maxima: '',
  nota_minima: '',
  nota_aprobatoria: '',
  hora_entrada: '',
  tolerancia_minutos: ''
};

function nivelFormFromRow(r) {
  const o = { ...NIVEL_FORM_DEFAULT };
  if (!r) return o;
  for (const k of Object.keys(NIVEL_FORM_DEFAULT)) {
    if (r[k] === undefined || r[k] === null) continue;
    o[k] = String(r[k]);
  }
  return o;
}

function NivelesPanel({ onRefreshMeta }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(() => ({ ...NIVEL_FORM_DEFAULT }));

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
    setForm({
      ...NIVEL_FORM_DEFAULT,
      hora_entrada: '08:00:00',
      tolerancia_minutos: '5'
    });
    setModal('new');
  };

  const openEdit = (r) => {
    setForm(nivelFormFromRow(r));
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
                <th>Abrev.</th>
                <th>Nota aprob.</th>
                <th>Tipo cal.</th>
                <th>Tipo cal. final</th>
                <th>Hora entrada</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.id}</td>
                  <td>{r.nombre}</td>
                  <td>{r.abreviatura ?? '—'}</td>
                  <td>{r.nota_aprobatoria != null ? r.nota_aprobatoria : '—'}</td>
                  <td>{r.tipo_calificacion != null && r.tipo_calificacion !== '' ? r.tipo_calificacion : '—'}</td>
                  <td>{r.tipo_calificacion_final != null && r.tipo_calificacion_final !== '' ? r.tipo_calificacion_final : '—'}</td>
                  <td>{r.hora_entrada || '—'}</td>
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

      <ModalRoot open={!!modal} onClose={() => setModal(null)} wide>
        <>
          <h3>{modal?.edit ? 'Editar nivel' : 'Nuevo nivel'}</h3>
          <p className="admin-academico-hint">
            Campos alineados al sistema anterior (calificaciones, grados, código modular). La hora y tolerancia se usan en asistencia cuando existen en la base de datos.
          </p>
          <div className="admin-academico-modal-grid">
            <div className="admin-academico-field">
              <label>Nombre *</label>
              <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
            </div>
            <div className="admin-academico-field">
              <label>Abreviatura</label>
              <input value={form.abreviatura} onChange={(e) => setForm({ ...form, abreviatura: e.target.value })} placeholder="ej. PRIM" />
            </div>
            <div className="admin-academico-field">
              <label>Código modular</label>
              <input value={form.codigo_modular} onChange={(e) => setForm({ ...form, codigo_modular: e.target.value })} />
            </div>
            <div className="admin-academico-field admin-academico-field--full">
              <label>Definición de grado</label>
              <input value={form.definicion_grado} onChange={(e) => setForm({ ...form, definicion_grado: e.target.value })} />
            </div>
            <div className="admin-academico-field">
              <label>Grado mínimo</label>
              <input type="number" value={form.grado_minimo} onChange={(e) => setForm({ ...form, grado_minimo: e.target.value })} />
            </div>
            <div className="admin-academico-field">
              <label>Grado máximo</label>
              <input type="number" value={form.grado_maximo} onChange={(e) => setForm({ ...form, grado_maximo: e.target.value })} />
            </div>
            <div className="admin-academico-field">
              <label>Tipo calificación (0 cualitativo / 1 cuantitativo)</label>
              <input value={form.tipo_calificacion} onChange={(e) => setForm({ ...form, tipo_calificacion: e.target.value })} placeholder="0 o 1" />
            </div>
            <div className="admin-academico-field">
              <label>Tipo calificación final (0 promedio / 1 porcentual)</label>
              <input value={form.tipo_calificacion_final} onChange={(e) => setForm({ ...form, tipo_calificacion_final: e.target.value })} placeholder="0 o 1" />
            </div>
            <div className="admin-academico-field">
              <label>Nota máxima</label>
              <input value={form.nota_maxima} onChange={(e) => setForm({ ...form, nota_maxima: e.target.value })} />
            </div>
            <div className="admin-academico-field">
              <label>Nota mínima</label>
              <input value={form.nota_minima} onChange={(e) => setForm({ ...form, nota_minima: e.target.value })} />
            </div>
            <div className="admin-academico-field">
              <label>Nota aprobatoria</label>
              <input value={form.nota_aprobatoria} onChange={(e) => setForm({ ...form, nota_aprobatoria: e.target.value })} />
            </div>
            <div className="admin-academico-field">
              <label>Hora entrada (asistencia)</label>
              <input placeholder="08:00:00" value={form.hora_entrada} onChange={(e) => setForm({ ...form, hora_entrada: e.target.value })} />
            </div>
            <div className="admin-academico-field">
              <label>Tolerancia (minutos)</label>
              <input type="number" value={form.tolerancia_minutos} onChange={(e) => setForm({ ...form, tolerancia_minutos: e.target.value })} />
            </div>
          </div>
          <div className="admin-academico-modal-actions">
            <Btn variant="ghost" onClick={() => setModal(null)}>Cancelar</Btn>
            <Btn onClick={guardar}>Guardar</Btn>
          </div>
        </>
      </ModalRoot>
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
      tutor_id: '',
      enlace_archivos: '',
      aula_virtual: '',
      horario_virtual: ''
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
      tutor_id: r.tutor_id || '',
      enlace_archivos: r.enlace_archivos || '',
      aula_virtual: r.aula_virtual || '',
      horario_virtual: r.horario_virtual || ''
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

      <ModalRoot open={!!(modal && meta)} onClose={() => setModal(null)} wide>
        <>
          <h3>{modal?.edit ? 'Editar grupo' : 'Nuevo grupo'}</h3>
          <p className="admin-academico-hint">Sede, nivel, grado, sección, turno y año definen el aula-grupo (equivalente al registro de grupos del sistema anterior).</p>
          <div className="admin-academico-modal-grid">
            <div className="admin-academico-field">
              <label>Año</label>
              <input type="number" value={form.anio} onChange={(e) => setForm({ ...form, anio: e.target.value })} />
            </div>
            <div className="admin-academico-field">
              <label>Nivel</label>
              <select value={form.nivel_id} onChange={(e) => setForm({ ...form, nivel_id: e.target.value })}>
                {(meta?.niveles || []).map((n) => (
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
                {(meta?.turnos || []).map((t) => (
                  <option key={t.id} value={t.id}>{t.nombre}</option>
                ))}
              </select>
            </div>
            <div className="admin-academico-field">
              <label>Sede</label>
              <select value={form.sede_id} onChange={(e) => setForm({ ...form, sede_id: e.target.value })}>
                {(meta?.sedes || []).map((s) => (
                  <option key={s.id} value={s.id}>{s.nombre}</option>
                ))}
              </select>
            </div>
            <div className="admin-academico-field admin-academico-field--full">
              <label>Tutor (opcional)</label>
              <select value={form.tutor_id} onChange={(e) => setForm({ ...form, tutor_id: e.target.value })}>
                <option value="">—</option>
                {(meta?.docentes || []).map((d) => (
                  <option key={d.id} value={d.id}>{d.nombre}</option>
                ))}
              </select>
            </div>
            <div className="admin-academico-field admin-academico-field--full">
              <label>Dirección de archivos (opcional)</label>
              <input value={form.enlace_archivos} onChange={(e) => setForm({ ...form, enlace_archivos: e.target.value })} placeholder="URL o ruta" />
            </div>
            <div className="admin-academico-field">
              <label>Link aula virtual (opcional)</label>
              <input value={form.aula_virtual} onChange={(e) => setForm({ ...form, aula_virtual: e.target.value })} />
            </div>
            <div className="admin-academico-field">
              <label>Horario aula virtual (opcional)</label>
              <input value={form.horario_virtual} onChange={(e) => setForm({ ...form, horario_virtual: e.target.value })} />
            </div>
          </div>
          <div className="admin-academico-modal-actions">
            <Btn variant="ghost" onClick={() => setModal(null)}>Cancelar</Btn>
            <Btn onClick={guardar}>Guardar</Btn>
          </div>
        </>
      </ModalRoot>
    </section>
  );
}

function CursosPanel({ meta }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({
    nivel_id: '',
    nombre: '',
    abreviatura: '',
    descripcion: '',
    imagen: '',
    link_libro: ''
  });

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

  const cursoTieneNivel =
    meta?.schema?.cursos_nivel_id ??
    (rows.length === 0 || rows.some((r) => Object.prototype.hasOwnProperty.call(r, 'nivel_id')));

  const guardar = async () => {
    if (!form.nombre.trim()) {
      Swal.fire({ icon: 'warning', title: 'Nombre requerido' });
      return;
    }
    if (cursoTieneNivel && !String(form.nivel_id || '').trim()) {
      Swal.fire({ icon: 'warning', title: 'Seleccione el nivel del curso' });
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
        <Btn
          onClick={() => {
            setForm({
              nivel_id: meta?.niveles?.[0]?.id || '',
              nombre: '',
              abreviatura: '',
              descripcion: '',
              imagen: '',
              link_libro: ''
            });
            setModal('new');
          }}
        >
          + Nuevo curso
        </Btn>
      </div>
      {loading ? (
        <p>Cargando…</p>
      ) : (
        <div className="admin-academico-table-wrap">
          <table className="admin-academico-table">
            <thead>
              <tr>
                <th>ID</th>
                {cursoTieneNivel && <th>Nivel</th>}
                <th>Nombre</th>
                <th>Abrev.</th>
                <th>Imagen</th>
                <th>Link libro</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.id}</td>
                  {cursoTieneNivel && <td>{r.nivel_nombre || '—'}</td>}
                  <td>{r.nombre}</td>
                  <td>{r.abreviatura || '—'}</td>
                  <td style={{ fontSize: '0.8rem', color: '#64748b' }}>{r.imagen || '—'}</td>
                  <td style={{ fontSize: '0.8rem', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis' }} title={r.link_libro || ''}>
                    {r.link_libro || '—'}
                  </td>
                  <td>
                    <div className="admin-academico-actions">
                      <Btn
                        variant="ghost"
                        onClick={() => {
                          setForm({
                            nivel_id: r.nivel_id != null ? String(r.nivel_id) : meta?.niveles?.[0]?.id || '',
                            nombre: r.nombre || '',
                            abreviatura: r.abreviatura || '',
                            descripcion: r.descripcion || '',
                            imagen: r.imagen || '',
                            link_libro: r.link_libro || ''
                          });
                          setModal({ edit: r });
                        }}
                      >
                        Editar
                      </Btn>
                      <Btn variant="ghost" onClick={() => eliminar(r)}>Eliminar</Btn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ModalRoot open={!!modal} onClose={() => setModal(null)} wide>
        <>
          <h3>{modal?.edit ? 'Editar curso' : 'Nuevo curso'}</h3>
          <p className="admin-academico-hint">En el sistema anterior cada curso pertenece a un nivel. Descripción y link del libro son opcionales.</p>
          <div className="admin-academico-modal-grid">
            {cursoTieneNivel && (
              <div className="admin-academico-field admin-academico-field--full">
                <label>Nivel *</label>
                <select value={form.nivel_id} onChange={(e) => setForm({ ...form, nivel_id: e.target.value })}>
                  {(meta?.niveles || []).map((n) => (
                    <option key={n.id} value={n.id}>{n.nombre}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="admin-academico-field admin-academico-field--full">
              <label>Nombre *</label>
              <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
            </div>
            <div className="admin-academico-field">
              <label>Abreviatura</label>
              <input value={form.abreviatura} onChange={(e) => setForm({ ...form, abreviatura: e.target.value })} />
            </div>
            <div className="admin-academico-field admin-academico-field--full">
              <label>Descripción</label>
              <textarea
                className="admin-academico-textarea"
                rows={2}
                value={form.descripcion}
                onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
              />
            </div>
            <div className="admin-academico-field">
              <label>Imagen (archivo en /Static/Archivos)</label>
              <input value={form.imagen} onChange={(e) => setForm({ ...form, imagen: e.target.value })} placeholder="ej. curso-mate.png" />
            </div>
            <div className="admin-academico-field">
              <label>Link libro</label>
              <input value={form.link_libro} onChange={(e) => setForm({ ...form, link_libro: e.target.value })} placeholder="https://…" />
            </div>
          </div>
          <div className="admin-academico-modal-actions">
            <Btn variant="ghost" onClick={() => setModal(null)}>Cancelar</Btn>
            <Btn onClick={guardar}>Guardar</Btn>
          </div>
        </>
      </ModalRoot>
    </section>
  );
}

function AreasPanel({ meta }) {
  const [areas, setAreas] = useState([]);
  const [cursos, setCursos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalArea, setModalArea] = useState(null);
  const [areaForm, setAreaForm] = useState({ nombre: '', nivel_id: '' });
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

  const areaTieneNivel =
    meta?.schema?.areas_nivel_id ??
    (areas.length === 0 || areas.some((a) => Object.prototype.hasOwnProperty.call(a, 'nivel_id')));

  const guardarArea = async () => {
    if (!areaForm.nombre.trim()) return;
    if (areaTieneNivel && !String(areaForm.nivel_id || '').trim()) {
      Swal.fire({ icon: 'warning', title: 'Seleccione el nivel del área' });
      return;
    }
    try {
      const body = { nombre: areaForm.nombre.trim(), nivel_id: areaForm.nivel_id };
      if (modalArea?.edit) {
        await api.put(`/admin/academico/areas/${modalArea.edit.id}`, body);
      } else {
        await api.post('/admin/academico/areas', body);
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
        <Btn
          onClick={() => {
            setAreaForm({ nombre: '', nivel_id: meta?.niveles?.[0]?.id != null ? String(meta.niveles[0].id) : '' });
            setModalArea('new');
          }}
        >
          + Nueva área
        </Btn>
      </div>
      {loading ? (
        <p>Cargando…</p>
      ) : (
        <div className="admin-academico-table-wrap">
          <table className="admin-academico-table">
            <thead>
              <tr>
                <th>ID</th>
                {areaTieneNivel && <th>Nivel</th>}
                <th>Nombre</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {areas.map((a) => (
                <tr key={a.id}>
                  <td>{a.id}</td>
                  {areaTieneNivel && <td>{a.nivel_nombre || '—'}</td>}
                  <td>{a.nombre}</td>
                  <td>
                    <div className="admin-academico-actions">
                      <Btn
                        variant="ghost"
                        onClick={() => {
                          setAreaForm({
                            nombre: a.nombre || '',
                            nivel_id: a.nivel_id != null ? String(a.nivel_id) : meta?.niveles?.[0]?.id != null ? String(meta.niveles[0].id) : ''
                          });
                          setModalArea({ edit: a });
                        }}
                      >
                        Editar
                      </Btn>
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

      <ModalRoot open={!!modalArea} onClose={() => setModalArea(null)}>
        <>
          <h3>{modalArea?.edit ? 'Editar área' : 'Nueva área'}</h3>
          <p className="admin-academico-hint">En el sistema anterior cada área está asociada a un nivel.</p>
          {areaTieneNivel && (
            <div className="admin-academico-field">
              <label>Nivel *</label>
              <select value={areaForm.nivel_id} onChange={(e) => setAreaForm({ ...areaForm, nivel_id: e.target.value })}>
                {(meta?.niveles || []).map((n) => (
                  <option key={n.id} value={n.id}>{n.nombre}</option>
                ))}
              </select>
            </div>
          )}
          <div className="admin-academico-field">
            <label>Nombre *</label>
            <input value={areaForm.nombre} onChange={(e) => setAreaForm({ ...areaForm, nombre: e.target.value })} />
          </div>
          <div className="admin-academico-modal-actions">
            <Btn variant="ghost" onClick={() => setModalArea(null)}>Cancelar</Btn>
            <Btn onClick={guardarArea}>Guardar</Btn>
          </div>
        </>
      </ModalRoot>

      <ModalRoot open={!!linkModal} onClose={() => setLinkModal(null)} wide>
        <>
          <h3>Cursos en: {linkModal?.nombre}</h3>
          <p className="admin-academico-hint">Vincule cursos del área para libretas y reportes (tabla areas_cursos).</p>
          <ul className="admin-academico-link-list">
            {vinculados.map((c) => (
              <li key={c.id}>
                <span>{c.nombre}</span>
                <Btn variant="ghost" onClick={() => quitarVinculo(c.id)}>Quitar</Btn>
              </li>
            ))}
            {vinculados.length === 0 && <li className="admin-academico-link-empty">Ningún curso vinculado.</li>}
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
        </>
      </ModalRoot>
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

      <ModalRoot open={!!(modal && meta)} onClose={() => setModal(null)} wide>
        <>
          <h3>{modal?.edit ? 'Editar asignatura' : 'Nueva asignatura'}</h3>
          <p className="admin-academico-hint">Equivale al formulario legacy: grupo (sede, nivel, grado, sección, turno, año) + curso + docente.</p>
          <div className="admin-academico-modal-grid">
            <div className="admin-academico-field admin-academico-field--full">
              <label>Grupo</label>
              <select value={form.grupo_id} onChange={(e) => setForm({ ...form, grupo_id: e.target.value })}>
                {grupos.map((g) => (
                  <option key={g.id} value={g.id}>{g.nivel_nombre} {g.grado}° {g.seccion}</option>
                ))}
              </select>
            </div>
            <div className="admin-academico-field admin-academico-field--full">
              <label>Curso</label>
              <select value={form.curso_id} onChange={(e) => setForm({ ...form, curso_id: e.target.value })}>
                {cursosList.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
            </div>
            <div className="admin-academico-field admin-academico-field--full">
              <label>Docente</label>
              <select value={form.personal_id} onChange={(e) => setForm({ ...form, personal_id: e.target.value })}>
                {(meta?.docentes || []).map((d) => (
                  <option key={d.id} value={d.id}>{d.nombre}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="admin-academico-modal-actions">
            <Btn variant="ghost" onClick={() => setModal(null)}>Cancelar</Btn>
            <Btn onClick={guardar}>Guardar</Btn>
          </div>
        </>
      </ModalRoot>
    </section>
  );
}
