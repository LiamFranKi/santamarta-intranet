import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { CircularProgress } from '@mui/material';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import DashboardLayout from '../../components/DashboardLayout';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { buildUploadsUrl } from '../../utils/uploadsUrl';
import Swal from 'sweetalert2';
import DOMPurify from 'dompurify';
import './AdminUsuarios.css';
import './AdminElecciones.css';
import { attachQuillImageUploadHandler } from '../herramientas/hexExamenEditorHelpers';
import { apiVotacionToLimaDatetimeLocal, limaDatetimeLocalToApiIso } from '../elecciones/eleccionesLimaTime';

/** Tras subir logo/foto sin guardar identidad, el GET devuelve servidor; preservamos borrador local de la lista en edición. */
function mergeListasPreservandoBorrador(freshListas, prevListas, editingListaId) {
  if (!editingListaId || !Array.isArray(freshListas)) return freshListas || [];
  const old = prevListas.find((x) => x.id === editingListaId);
  if (!old) return freshListas;
  return freshListas.map((L) => {
    if (L.id !== editingListaId) return L;
    return {
      ...L,
      nombre_lista: old.nombre_lista,
      eslogan: old.eslogan,
      color_primario: old.color_primario,
      color_secundario: old.color_secundario,
      estado: old.estado,
      orden_sort: old.orden_sort,
      alcalde_nombres: old.alcalde_nombres,
      alcalde_apellidos: old.alcalde_apellidos,
      alcalde_alumno_id: old.alcalde_alumno_id,
      alcalde_nombre_mostrar: old.alcalde_nombre_mostrar
    };
  });
}

const QUILL_MODULES = {
  toolbar: [
    [{ header: [1, 2, 3, false] }],
    ['bold', 'italic', 'underline', 'strike'],
    [{ list: 'ordered' }, { list: 'bullet' }],
    ['link', 'image'],
    ['clean']
  ]
};

const QUILL_FORMATS = ['header', 'bold', 'italic', 'underline', 'strike', 'list', 'bullet', 'link', 'image'];

function Modal({ title, children, onClose, wide, stack }) {
  const node = (
    <div className={`admin-elcc-modal-backdrop${stack ? ' admin-elcc-modal-stack2' : ''}`} role="presentation" onClick={onClose}>
      <div
        className={`admin-elcc-modal ${wide ? 'admin-elcc-modal-wide' : ''}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="admin-elcc-modal-head">
          <h2>{title}</h2>
          <button type="button" className="admin-elcc-modal-x" onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        </div>
        <div className="admin-elcc-modal-body">{children}</div>
      </div>
    </div>
  );
  return typeof document !== 'undefined' ? createPortal(node, document.body) : node;
}

export default function AdminEleccionProceso() {
  const { procesoId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [proceso, setProceso] = useState(null);
  const [form, setForm] = useState({});
  const [cargos, setCargos] = useState([]);
  const [newCargoNombre, setNewCargoNombre] = useState('');
  const [listas, setListas] = useState([]);
  const [gruposOpciones, setGruposOpciones] = useState([]);
  const [grupoSeleccion, setGrupoSeleccion] = useState([]);
  const [detalleLista, setDetalleLista] = useState({});
  const [loadingDetalle, setLoadingDetalle] = useState(false);
  const [resultados, setResultados] = useState(null);

  const [modal, setModal] = useState(null);
  const [listaEditId, setListaEditId] = useState(null);

  const idNum = parseInt(procesoId, 10);
  const anio = user?.anio_activo;

  const cargarTodo = useCallback(async () => {
    if (!idNum || Number.isNaN(idNum)) return;
    setLoading(true);
    try {
      const [rPro, rCar, rLis] = await Promise.all([
        api.get(`/elecciones/admin/procesos/${idNum}`),
        api.get(`/elecciones/admin/procesos/${idNum}/cargos`),
        api.get(`/elecciones/admin/procesos/${idNum}/listas`)
      ]);
      const pr = rPro.data.proceso;
      setProceso(pr);
      const perfilArr =
        Array.isArray(pr.perfiles_voto) && pr.perfiles_voto.length
          ? pr.perfiles_voto.map((x) => String(x).toUpperCase())
          : ['ALUMNO'];
      const gvArr = Array.isArray(pr.grados_voto) ? pr.grados_voto.map((x) => Number(x)).filter((n) => !Number.isNaN(n)) : [];
      setForm({
        titulo: pr.titulo || '',
        descripcion: pr.descripcion || '',
        estado: pr.estado || 'BORRADOR',
        modalidad: pr.modalidad || 'VIRTUAL',
        grado_min: pr.grado_min ?? '',
        grado_max: pr.grado_max ?? '',
        votacion_inicio: apiVotacionToLimaDatetimeLocal(pr.votacion_inicio),
        votacion_fin: apiVotacionToLimaDatetimeLocal(pr.votacion_fin),
        perfiles_voto: perfilArr,
        grados_voto_arr: gvArr
      });
      const gids = Array.isArray(pr.grupo_ids) ? pr.grupo_ids.map(Number).filter(Boolean) : [];
      setGrupoSeleccion(gids);

      setCargos(rCar.data.cargos || []);
      setListas(rLis.data.listas || []);
      setDetalleLista({});

      if (anio) {
        try {
          const gr = await api.get('/elecciones/admin/meta-grupos', { params: { anio } });
          setGruposOpciones(gr.data.grupos || []);
        } catch {
          setGruposOpciones([]);
        }
      }

      try {
        const rs = await api.get(`/elecciones/admin/procesos/${idNum}/resultados`);
        setResultados(rs.data);
      } catch {
        setResultados(null);
      }
    } catch (e) {
      Swal.fire('Error', e.response?.data?.error || 'No se pudo cargar', 'error');
      navigate('/admin/herramientas/elecciones');
    } finally {
      setLoading(false);
    }
  }, [idNum, navigate, anio]);

  useEffect(() => {
    cargarTodo();
  }, [cargarTodo]);

  /** Desde el listado: `/elecciones/:id?panel=cargos|listas|resultados` abre el modal correspondiente. */
  useEffect(() => {
    const panel = searchParams.get('panel');
    if (panel === 'resultados' || panel === 'cargos' || panel === 'listas') {
      setModal(panel);
      const next = new URLSearchParams(searchParams);
      next.delete('panel');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const cargarDetalleLista = async (listaId) => {
    setLoadingDetalle(true);
    try {
      const [m, pr, rd] = await Promise.all([
        api.get(`/elecciones/admin/listas/${listaId}/miembros`),
        api.get(`/elecciones/admin/listas/${listaId}/propuestas`),
        api.get(`/elecciones/admin/listas/${listaId}/redes`)
      ]);
      setDetalleLista((d) => ({
        ...d,
        [listaId]: {
          miembros: m.data.miembros || [],
          propuestas: pr.data.propuestas || [],
          redes: rd.data.redes || []
        }
      }));
    } finally {
      setLoadingDetalle(false);
    }
  };

  useEffect(() => {
    if (!listaEditId) return;
    if (detalleLista[listaEditId]) return;
    cargarDetalleLista(listaEditId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- evitar bucle: detalle se hidrata tras cargarDetalleLista
  }, [listaEditId, detalleLista]);

  const guardarProceso = async () => {
    try {
      const gv = Array.isArray(form.grados_voto_arr) ? form.grados_voto_arr.map((n) => Number(n)).filter((n) => !Number.isNaN(n)) : [];
      await api.put(`/elecciones/admin/procesos/${idNum}`, {
        ...form,
        grado_min: form.grado_min === '' ? null : form.grado_min,
        grado_max: form.grado_max === '' ? null : form.grado_max,
        grupo_ids: grupoSeleccion.length ? grupoSeleccion : [],
        votacion_inicio: limaDatetimeLocalToApiIso(form.votacion_inicio),
        votacion_fin: limaDatetimeLocalToApiIso(form.votacion_fin),
        perfiles_voto: Array.isArray(form.perfiles_voto) && form.perfiles_voto.length ? form.perfiles_voto : ['ALUMNO'],
        grados_voto: gv.length ? gv : []
      });
      await Swal.fire('Guardado', '', 'success');
      cargarTodo();
    } catch (e) {
      Swal.fire('Error', e.response?.data?.error || 'No se pudo guardar', 'error');
    }
  };

  const agregarCargo = async () => {
    const n = newCargoNombre.trim();
    if (!n) return;
    try {
      await api.post(`/elecciones/admin/procesos/${idNum}/cargos`, { nombre: n });
      setNewCargoNombre('');
      const r = await api.get(`/elecciones/admin/procesos/${idNum}/cargos`);
      setCargos(r.data.cargos || []);
    } catch (e) {
      Swal.fire('Error', e.response?.data?.error || 'No se pudo agregar', 'error');
    }
  };

  const borrarCargo = async (cid) => {
    try {
      await api.delete(`/elecciones/admin/cargos/${cid}`);
      const r = await api.get(`/elecciones/admin/procesos/${idNum}/cargos`);
      setCargos(r.data.cargos || []);
    } catch (e) {
      Swal.fire('Error', e.response?.data?.error || 'No se pudo borrar', 'error');
    }
  };

  const nuevaLista = async () => {
    const rnom = await Swal.fire({
      title: 'Nueva lista',
      input: 'text',
      inputLabel: 'Nombre de la lista',
      inputPlaceholder: 'Ej. Lista Unidos por el cole',
      showCancelButton: true,
      confirmButtonText: 'Crear lista',
      cancelButtonText: 'Cancelar',
      inputValidator: (v) => (!v?.trim() ? 'Escribe un nombre para crear la lista' : null)
    });
    if (!rnom.isConfirmed || !rnom.value?.trim()) return;
    try {
      const { data } = await api.post(`/elecciones/admin/procesos/${idNum}/listas`, {
        nombre_lista: rnom.value.trim(),
        estado: 'BORRADOR'
      });
      const r = await api.get(`/elecciones/admin/procesos/${idNum}/listas`);
      setListas(r.data.listas || []);
      setListaEditId(data.id);
      setDetalleLista((prev) => {
        const n = { ...prev };
        delete n[data.id];
        return n;
      });
      await cargarDetalleLista(data.id);
    } catch (e) {
      Swal.fire('Error', e.response?.data?.error || 'No se pudo crear lista', 'error');
    }
  };

  const actualizarLista = async (lista, patch = {}, opts = {}) => {
    const silent = Boolean(opts.silent);
    try {
      await api.put(`/elecciones/admin/listas/${lista.id}`, {
        nombre_lista: lista.nombre_lista,
        eslogan: lista.eslogan,
        color_primario: lista.color_primario,
        color_secundario: lista.color_secundario,
        alcalde_nombres: lista.alcalde_nombres,
        alcalde_apellidos: lista.alcalde_apellidos,
        alcalde_alumno_id: lista.alcalde_alumno_id ?? null,
        estado: lista.estado,
        orden_sort: lista.orden_sort,
        ...patch
      });
      if (!silent) await Swal.fire('Lista guardada', '', 'success');
      const r = await api.get(`/elecciones/admin/procesos/${idNum}/listas`);
      setListas(r.data.listas || []);
    } catch (e) {
      Swal.fire('Error', e.response?.data?.error || 'No se pudo guardar', 'error');
    }
  };

  const borrarLista = async (lid) => {
    const ok = await Swal.fire({
      title: '¿Eliminar lista?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    });
    if (!ok.isConfirmed) return;
    try {
      await api.delete(`/elecciones/admin/listas/${lid}`);
      if (listaEditId === lid) setListaEditId(null);
      cargarTodo();
    } catch (e) {
      Swal.fire('Error', e.response?.data?.error || 'No se pudo borrar', 'error');
    }
  };

  const subirListaFile = async (listaId, field, file) => {
    if (!file) return;
    const fd = new FormData();
    fd.append(field === 'logo' ? 'logo' : 'foto', file);
    const ep =
      field === 'logo'
        ? `/elecciones/admin/listas/${listaId}/logo`
        : `/elecciones/admin/listas/${listaId}/foto-alcalde`;
    try {
      await api.post(ep, fd);
      const r = await api.get(`/elecciones/admin/procesos/${idNum}/listas`);
      setListas((prev) => mergeListasPreservandoBorrador(r.data.listas || [], prev, listaEditId));
      await Swal.fire({ title: 'Archivo subido', icon: 'success', timer: 1600, showConfirmButton: false });
    } catch (e) {
      Swal.fire('Error', e.response?.data?.error || 'Error al subir', 'error');
    }
  };

  const toggleGrupo = (gid) => {
    setGrupoSeleccion((prev) => {
      const n = new Set(prev);
      if (n.has(gid)) n.delete(gid);
      else n.add(gid);
      return [...n];
    });
  };

  const togglePerfilVoto = (codigo) => {
    setForm((f) => {
      const cur = Array.isArray(f.perfiles_voto) ? [...f.perfiles_voto] : [];
      const set = new Set(cur.map((x) => String(x).toUpperCase()));
      const c = String(codigo).toUpperCase();
      if (set.has(c)) set.delete(c);
      else set.add(c);
      let arr = [...set];
      if (arr.length === 0) arr = ['ALUMNO'];
      return { ...f, perfiles_voto: arr };
    });
  };

  const listaEnEdicion = useMemo(() => listas.find((l) => l.id === listaEditId) || null, [listas, listaEditId]);

  if (loading && !proceso) {
    return (
      <DashboardLayout>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
          <CircularProgress />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="admin-elcc-detalle-layout">
        <div className="admin-elcc-proceso-toolbar">
          <button type="button" className="admin-elcc-btn admin-elcc-btn-ghost" onClick={() => navigate('/admin/herramientas/elecciones')}>
            ← Volver al listado
          </button>
        </div>

        <div className="admin-elcc-proceso-stack">
          <section className="admin-elcc-panel admin-elcc-card-surface admin-elcc-surf-mint">
            <h2>Datos del proceso</h2>
            <p className="admin-elcc-muted admin-elcc-lead">
              Título, estado, modalidad, fechas y descripción breve. Resultados, cargos y listas están en los botones inferiores.
            </p>

            <div className="admin-elcc-grid-proceso-3x2">
              <label className="admin-elcc-label">
                Título
                <input className="admin-elcc-input" value={form.titulo || ''} onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))} />
              </label>
              <label className="admin-elcc-label">
                Estado
                <select className="admin-elcc-select" value={form.estado || ''} onChange={(e) => setForm((f) => ({ ...f, estado: e.target.value }))}>
                  <option value="BORRADOR">BORRADOR (solo admin)</option>
                  <option value="CAMPAÑA">CAMPAÑA (propuestas y planchas)</option>
                  <option value="VOTACION">VOTACIÓN (urna disponible si cumple fecha)</option>
                  <option value="CERRADA">CERRADA</option>
                </select>
              </label>
              <label className="admin-elcc-label">
                Modalidad
                <select className="admin-elcc-select" value={form.modalidad || 'VIRTUAL'} onChange={(e) => setForm((f) => ({ ...f, modalidad: e.target.value }))}>
                  <option value="VIRTUAL">Virtual</option>
                  <option value="PRESENCIAL">Presencial</option>
                  <option value="MIXTO">Mixto</option>
                </select>
              </label>
              <label className="admin-elcc-label">
                Inicio votación — fecha y hora (Lima, Perú)
                <input type="datetime-local" className="admin-elcc-input" value={form.votacion_inicio || ''} onChange={(e) => setForm((f) => ({ ...f, votacion_inicio: e.target.value }))} />
                <small className="admin-elcc-muted">Se interpreta siempre en hora oficial de Lima, no la del servidor ni la de tu PC.</small>
              </label>
              <label className="admin-elcc-label">
                Fin votación — fecha y hora (Lima, Perú)
                <input type="datetime-local" className="admin-elcc-input" value={form.votacion_fin || ''} onChange={(e) => setForm((f) => ({ ...f, votacion_fin: e.target.value }))} />
                <small className="admin-elcc-muted">Misma referencia: Lima (UTC−05).</small>
              </label>
              <label className="admin-elcc-label">
                Descripción
                <input
                  type="text"
                  className="admin-elcc-input"
                  value={form.descripcion || ''}
                  onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
                  placeholder="Texto corto visible en campaña (una línea)"
                />
              </label>
            </div>
          </section>

          <section className="admin-elcc-panel admin-elcc-card-surface admin-elcc-surf-lavender">
            <h3 className="admin-elcc-perfil-title">¿Quién puede votar?</h3>
            <p className="admin-elcc-perfil-desc">
              Elige perfiles con derecho a urna. La <strong>campaña</strong> la puede ver cualquier usuario autenticado; la <strong>votación</strong> solo quien coincida con estos perfiles y con la convocatoria por aula.
            </p>
            <div className="admin-elcc-perfil-pills">
              {['ALUMNO', 'APODERADO', 'DOCENTE'].map((cod) => {
                const on = (form.perfiles_voto || []).map((x) => String(x).toUpperCase()).includes(cod);
                const label = cod === 'ALUMNO' ? 'Alumnos' : cod === 'APODERADO' ? 'Apoderados' : 'Docentes';
                return (
                  <label key={cod} className={`admin-elcc-perfil-pill ${on ? 'on' : ''}`}>
                    <input type="checkbox" checked={on} onChange={() => togglePerfilVoto(cod)} />
                    <span>{label}</span>
                  </label>
                );
              })}
            </div>
          </section>

          <section className="admin-elcc-panel admin-elcc-card-surface admin-elcc-surf-peach">
            <h3>Convocatoria por aula</h3>
            <p className="admin-elcc-muted admin-elcc-convoc-intro">
              <strong>Convocatoria</strong> = aulas concretas (grado · sección · nivel). Sin ninguna marca = <strong>todas</strong> las aulas del año lectivo. Con marcas = solo las elegidas.
            </p>
            <div className="admin-elcc-convoc-grid">
              {gruposOpciones.length === 0 ? (
                <span className="admin-elcc-muted">No hay grupos para este año lectivo.</span>
              ) : (
                gruposOpciones.map((g) => (
                  <label key={g.id} className="admin-elcc-convoc-cell">
                    <input type="checkbox" checked={grupoSeleccion.includes(g.id)} onChange={() => toggleGrupo(g.id)} />
                    <span>
                      {g.grado ?? '—'}° {g.seccion ?? ''}
                      {g.nivel_nombre ? ` · ${g.nivel_nombre}` : ''}
                    </span>
                  </label>
                ))
              )}
            </div>
          </section>

          <div className="admin-elcc-save-bar">
            <button type="button" className="admin-elcc-btn admin-elcc-btn-primary" onClick={guardarProceso}>
              Guardar datos del proceso
            </button>
          </div>
        </div>

        <div className="admin-elcc-big-actions">
          <button type="button" className="admin-elcc-big-btn admin-elcc-big-mint" onClick={() => setModal('resultados')}>
            <span className="admin-elcc-big-icon">📊</span>
            <span className="admin-elcc-big-text">Resultados</span>
            <small>Conteo de votos por lista</small>
          </button>
          <button type="button" className="admin-elcc-big-btn admin-elcc-big-lavender" onClick={() => setModal('cargos')}>
            <span className="admin-elcc-big-icon">📋</span>
            <span className="admin-elcc-big-text">Cargos de plancha</span>
            <small>Tesorero, vocal… (incluye “Alcalde” si quieres buscarlo en listas)</small>
          </button>
          <button type="button" className="admin-elcc-big-btn admin-elcc-big-peach" onClick={() => setModal('listas')}>
            <span className="admin-elcc-big-icon">🗳️</span>
            <span className="admin-elcc-big-text">Listas y candidatos</span>
            <small>Logos, alcalde por DNI, plancha y propuestas</small>
          </button>
        </div>

        {modal === 'resultados' && (
          <Modal title="Resultados (conteo)" onClose={() => setModal(null)}>
            {resultados && resultados.totales ? (
              <>
                <p className="admin-elcc-muted">Participación registrada: {resultados.votos_registrados}</p>
                <table className="admin-elcc-table">
                  <thead>
                    <tr>
                      <th>Lista</th>
                      <th>Votos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resultados.totales.map((t) => (
                      <tr key={t.lista_id}>
                        <td>{t.nombre_lista}</td>
                        <td>{t.votos}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            ) : (
              <p className="admin-elcc-muted">Sin datos aún.</p>
            )}
            <button type="button" className="admin-elcc-btn admin-elcc-btn-ghost" style={{ marginTop: 12 }} onClick={() => cargarTodo()}>
              Actualizar conteo
            </button>
          </Modal>
        )}

        {modal === 'cargos' && (
          <Modal title="Cargos de plancha" onClose={() => setModal(null)}>
            <p className="admin-elcc-muted">
              Define los cargos que cada lista debe cubrir (ej. Tesorero). Para el alcalde puedes crear un cargo “Alcalde” o asignar al alcalde al buscar al alumno en la lista. Los miembros pueden enlazarse por DNI desde el editor de lista.
            </p>
            <div className="admin-elcc-inline-add">
              <input
                className="admin-elcc-input"
                placeholder="Nombre del cargo"
                value={newCargoNombre}
                onChange={(e) => setNewCargoNombre(e.target.value)}
              />
              <button type="button" className="admin-elcc-btn admin-elcc-btn-primary" onClick={agregarCargo}>
                Agregar
              </button>
            </div>
            <ul className="admin-elcc-cargo-list">
              {cargos.map((c) => (
                <li key={c.id}>
                  <span>{c.nombre}</span>
                  <button type="button" className="admin-elcc-btn admin-elcc-btn-danger admin-elcc-btn-xs" onClick={() => borrarCargo(c.id)}>
                    Quitar
                  </button>
                </li>
              ))}
            </ul>
          </Modal>
        )}

        {modal === 'listas' && (
          <Modal title="Listas y candidaturas" onClose={() => setModal(null)} wide>
            {!listaEditId ? (
              <>
                <div className="admin-elcc-modal-toolbar">
                  <button type="button" className="admin-elcc-btn admin-elcc-btn-primary" onClick={nuevaLista}>
                    + Nueva lista
                  </button>
                </div>
                <div className="admin-elcc-lista-grid">
                  {listas.map((lista) => (
                    <div key={lista.id} className="admin-elcc-lista-tile">
                      <div className="admin-elcc-lista-tile-head">
                        {lista.logo_path ? (
                          <img className="admin-elcc-tile-logo" src={buildUploadsUrl(lista.logo_path)} alt="" />
                        ) : (
                          <div className="admin-elcc-tile-logo-ph">Logo</div>
                        )}
                        <div>
                          <strong>{lista.nombre_lista}</strong>
                          <div className="admin-elcc-muted small">{lista.estado}</div>
                        </div>
                      </div>
                      <div className="admin-elcc-tile-actions">
                        <button type="button" className="admin-elcc-btn admin-elcc-btn-primary admin-elcc-btn-sm" onClick={() => setListaEditId(lista.id)}>
                          Editar lista
                        </button>
                        <button type="button" className="admin-elcc-btn admin-elcc-btn-danger admin-elcc-btn-sm" onClick={() => borrarLista(lista.id)}>
                          Eliminar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                {listas.length === 0 && <p className="admin-elcc-muted">No hay listas. Crea una para la campaña.</p>}
              </>
            ) : (
              listaEnEdicion && (
                <ListaEditor
                  lista={listaEnEdicion}
                  procesoId={idNum}
                  listas={listas}
                  setListas={setListas}
                  anio={anio}
                  cargos={cargos}
                  detalle={detalleLista[listaEditId]}
                  loadingDetalle={loadingDetalle}
                  onRecargarDetalle={() => cargarDetalleLista(listaEditId)}
                  actualizarLista={actualizarLista}
                  subirListaFile={subirListaFile}
                  onVolver={() => setListaEditId(null)}
                />
              )
            )}
          </Modal>
        )}
      </div>
    </DashboardLayout>
  );
}

function ListaEditor({
  lista,
  procesoId,
  listas,
  setListas,
  anio,
  cargos,
  detalle,
  loadingDetalle,
  onRecargarDetalle,
  actualizarLista,
  subirListaFile,
  onVolver
}) {
  const patch = (field, value) => {
    setListas((L) => L.map((x) => (x.id === lista.id ? { ...x, [field]: value } : x)));
  };

  const listaLocal = listas.find((l) => l.id === lista.id) || lista;
  const logoSrc = listaLocal.logo_path ? buildUploadsUrl(listaLocal.logo_path) : '';
  const landingAlumno = `${window.location.origin}/alumno/elecciones/${procesoId}/lista/${lista.id}`;
  const landingCampana = `${window.location.origin}/elecciones-campana/${procesoId}/lista/${lista.id}`;

  return (
    <div className="admin-elcc-lista-editor">
      <button type="button" className="admin-elcc-btn admin-elcc-btn-ghost admin-elcc-back-list" onClick={onVolver}>
        ← Volver a las listas
      </button>

      <div className="admin-elcc-vista-publica admin-elcc-card-surface admin-elcc-surf-peach">
        <h4 className="admin-elcc-vista-publica-title">Vista pública (landing de esta lista)</h4>
        <p className="admin-elcc-muted admin-elcc-vista-desc">
          Lo que verá el electorado es la página de campaña con logo, alcalde, propuestas y enlaces. La lista debe estar en estado{' '}
          <strong>PUBLICADA</strong> y el proceso en <strong>CAMPAÑA</strong> o posterior para que los alumnos la vean en su menú de elecciones.
        </p>
        <p className="admin-elcc-muted admin-elcc-vista-desc" style={{ marginTop: 8 }}>
          <strong>Ruta alumno</strong>: mismo menú y marco que el alumno en la intranet.{' '}
          <strong>Elecciones-campaña</strong>: vista pensada para familia y docentes (menú distinto, mismo contenido de campaña y urna).
        </p>
        <div className="admin-elcc-vista-links">
          <a className="admin-elcc-btn admin-elcc-btn-primary admin-elcc-btn-sm" href={landingAlumno} target="_blank" rel="noreferrer">
            Abrir vista (ruta alumno)
          </a>
          <a className="admin-elcc-btn admin-elcc-btn-ghost admin-elcc-btn-sm" href={landingCampana} target="_blank" rel="noreferrer">
            Abrir vista (elecciones-campaña)
          </a>
        </div>
      </div>

      <div className="admin-elcc-lista-card-compact admin-elcc-card-surface admin-elcc-surf-mint">
        <h3>Identidad de la lista</h3>
        <div className="admin-elcc-identidad-layout">
          <div className="admin-elcc-identidad-main">
            <div className="admin-elcc-identidad-row1">
              <label className="admin-elcc-label">
                Nombre
                <input className="admin-elcc-input" value={listaLocal.nombre_lista} onChange={(e) => patch('nombre_lista', e.target.value)} />
              </label>
              <label className="admin-elcc-label">
                Orden en urna
                <input type="number" className="admin-elcc-input" value={listaLocal.orden_sort} onChange={(e) => patch('orden_sort', parseInt(e.target.value, 10) || 0)} />
              </label>
              <label className="admin-elcc-label">
                Estado público
                <select className="admin-elcc-select" value={listaLocal.estado} onChange={(e) => patch('estado', e.target.value)}>
                  <option value="BORRADOR">BORRADOR</option>
                  <option value="PUBLICADA">PUBLICADA</option>
                </select>
              </label>
              <div className="admin-elcc-color-pair">
                <label className="admin-elcc-label">
                  Color 1
                  <input type="color" className="admin-elcc-input admin-elcc-color-inp" value={listaLocal.color_primario || '#4f46e5'} onChange={(e) => patch('color_primario', e.target.value)} />
                </label>
                <label className="admin-elcc-label">
                  Color 2
                  <input type="color" className="admin-elcc-input admin-elcc-color-inp" value={listaLocal.color_secundario || '#0ea5e9'} onChange={(e) => patch('color_secundario', e.target.value)} />
                </label>
              </div>
            </div>
            <label className="admin-elcc-label">
              Eslogan
              <input className="admin-elcc-input" value={listaLocal.eslogan || ''} onChange={(e) => patch('eslogan', e.target.value)} placeholder="Frase corta de campaña" />
            </label>
          </div>
          <div className="admin-elcc-identidad-aside">
            <div className="admin-elcc-logo-preview-wrap">
              {logoSrc ? (
                <img className="admin-elcc-logo-preview" src={logoSrc} alt="Logo lista" />
              ) : (
                <div className="admin-elcc-logo-preview-ph">Vista previa del logo</div>
              )}
            </div>
            <input
              type="file"
              accept="image/*"
              className="admin-elcc-file-hidden"
              id={`logo-lista-${lista.id}`}
              onChange={(e) => {
                subirListaFile(lista.id, 'logo', e.target.files?.[0]);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              className="admin-elcc-btn admin-elcc-btn-ghost admin-elcc-btn-block"
              onClick={() => document.getElementById(`logo-lista-${lista.id}`)?.click()}
            >
              Elegir imagen
            </button>
            <button type="button" className="admin-elcc-btn admin-elcc-btn-primary admin-elcc-btn-block" onClick={() => actualizarLista(listaLocal)}>
              Guardar identidad
            </button>
          </div>
        </div>
      </div>

      <ListaDetalleEditor
        listaId={lista.id}
        listaLocal={listaLocal}
        anio={anio}
        cargos={cargos}
        loadingDetalle={loadingDetalle}
        detalle={detalle}
        onRecargar={onRecargarDetalle}
        actualizarLista={actualizarLista}
        subirListaFile={subirListaFile}
      />
    </div>
  );
}

const ALCALDE_VALUE = '__ALCALDE__';

function ListaDetalleEditor({
  listaId,
  listaLocal,
  anio,
  cargos,
  loadingDetalle,
  detalle,
  onRecargar,
  actualizarLista,
  subirListaFile
}) {
  const [mCargoId, setMCargoId] = useState('');
  const [busq, setBusq] = useState('');
  const [resAlu, setResAlu] = useState([]);
  const [loadingAlu, setLoadingAlu] = useState(false);
  const [propT, setPropT] = useState('');
  const [propC, setPropC] = useState('');
  const [propEdit, setPropEdit] = useState(null);
  const propQuillRef = useRef(null);
  const propEditQuillRef = useRef(null);
  const [redTipo, setRedTipo] = useState('YOUTUBE');
  const [redTitulo, setRedTitulo] = useState('');
  const [redUrl, setRedUrl] = useState('');

  const thumbAlcalde =
    listaLocal.alcalde_foto_url ||
    (listaLocal.alcalde_foto_path ? buildUploadsUrl(listaLocal.alcalde_foto_path) : '');
  const tieneAlcalde = Boolean(
    listaLocal.alcalde_alumno_id || (listaLocal.alcalde_nombre_mostrar && String(listaLocal.alcalde_nombre_mostrar).trim() !== '')
  );

  useEffect(() => {
    if (!busq || busq.trim().length < 2) {
      setResAlu([]);
      return undefined;
    }
    const t = window.setTimeout(async () => {
      setLoadingAlu(true);
      try {
        const { data } = await api.get('/elecciones/admin/meta-alumnos', {
          params: { q: busq.trim(), anio, limit: 24 }
        });
        const raw = data.alumnos || [];
        const byId = new Map();
        raw.forEach((a) => {
          if (a?.id != null && !byId.has(a.id)) byId.set(a.id, a);
        });
        setResAlu([...byId.values()]);
      } catch {
        setResAlu([]);
      } finally {
        setLoadingAlu(false);
      }
    }, 300);
    return () => window.clearTimeout(t);
  }, [busq, anio]);

  useEffect(() => {
    if (!listaId) return undefined;
    const url = `/elecciones/admin/listas/${listaId}/propuestas/subir-imagen`;
    const t = window.setTimeout(() => {
      const q = propQuillRef.current?.getEditor?.();
      if (q) attachQuillImageUploadHandler(q, api, url);
    }, 200);
    return () => window.clearTimeout(t);
  }, [listaId]);

  useEffect(() => {
    if (!propEdit || !listaId) return undefined;
    const url = `/elecciones/admin/listas/${listaId}/propuestas/subir-imagen`;
    const t = window.setTimeout(() => {
      const q = propEditQuillRef.current?.getEditor?.();
      if (q) attachQuillImageUploadHandler(q, api, url);
    }, 250);
    return () => window.clearTimeout(t);
  }, [propEdit?.id, listaId]);

  const agregarPlanchaDesdeAlumno = async (alu) => {
    if (!mCargoId) {
      Swal.fire('Selecciona un cargo', '', 'warning');
      return;
    }
    try {
      if (mCargoId === ALCALDE_VALUE) {
        await actualizarLista(
          { ...listaLocal, alcalde_alumno_id: alu.id },
          {
            alcalde_alumno_id: alu.id,
            alcalde_nombres: alu.nombres,
            alcalde_apellidos: `${alu.apellido_paterno || ''} ${alu.apellido_materno || ''}`.trim()
          },
          { silent: true }
        );
      } else {
        await api.post(`/elecciones/admin/listas/${listaId}/miembros`, {
          cargo_id: parseInt(mCargoId, 10),
          alumno_id: alu.id
        });
        await onRecargar();
      }
      setBusq('');
      setResAlu([]);
    } catch (e) {
      Swal.fire('No se pudo agregar', e.response?.data?.error || e.message, 'error');
    }
  };

  const quitarAlcalde = async () => {
    try {
      await actualizarLista(
        { ...listaLocal, alcalde_alumno_id: null, alcalde_nombres: '', alcalde_apellidos: '' },
        { alcalde_alumno_id: null, alcalde_nombres: '', alcalde_apellidos: '' },
        { silent: true }
      );
    } catch (e) {
      Swal.fire('Error', e.response?.data?.error || e.message, 'error');
    }
  };

  const subirMiembroFoto = async (mid, file) => {
    if (!file) return;
    try {
      const fd = new FormData();
      fd.append('foto', file);
      await api.post(`/elecciones/admin/miembros/${mid}/foto`, fd);
      await onRecargar();
    } catch (e) {
      Swal.fire('No se pudo subir la foto', e.response?.data?.error || e.message, 'error');
    }
  };

  const borrarMiembro = async (mid) => {
    try {
      await api.delete(`/elecciones/admin/miembros/${mid}`);
      await onRecargar();
    } catch (e) {
      Swal.fire('Error', e.response?.data?.error || e.message, 'error');
    }
  };

  const agregarProp = async () => {
    if (!propT || !propC || propC.replace(/<[^>]+>/g, '').trim() === '') {
      Swal.fire('Completa título y detalle', '', 'warning');
      return;
    }
    try {
      await api.post(`/elecciones/admin/listas/${listaId}/propuestas`, { titulo: propT, cuerpo: propC });
      setPropT('');
      setPropC('');
      await onRecargar();
    } catch (e) {
      Swal.fire('Error', e.response?.data?.error || e.message, 'error');
    }
  };

  const borrarProp = async (pid) => {
    try {
      await api.delete(`/elecciones/admin/propuestas/${pid}`);
      await onRecargar();
    } catch (e) {
      Swal.fire('Error', e.response?.data?.error || e.message, 'error');
    }
  };

  const guardarPropEdit = async () => {
    if (!propEdit) return;
    try {
      await api.put(`/elecciones/admin/propuestas/${propEdit.id}`, {
        titulo: propEdit.titulo,
        cuerpo: propEdit.cuerpo
      });
      setPropEdit(null);
      await onRecargar();
      await Swal.fire({ title: 'Propuesta actualizada', icon: 'success', timer: 1400, showConfirmButton: false });
    } catch (e) {
      Swal.fire('Error', e.response?.data?.error || e.message, 'error');
    }
  };

  const agregarRed = async () => {
    if (!redUrl || !String(redUrl).trim()) {
      Swal.fire('URL requerida', '', 'warning');
      return;
    }
    try {
      await api.post(`/elecciones/admin/listas/${listaId}/redes`, {
        tipo: redTipo,
        titulo: redTitulo || null,
        url: String(redUrl).trim()
      });
      setRedUrl('');
      setRedTitulo('');
      await onRecargar();
    } catch (e) {
      Swal.fire('No se pudo guardar el enlace', e.response?.data?.error || e.message, 'error');
    }
  };

  const borrarRed = async (rid) => {
    try {
      await api.delete(`/elecciones/admin/redes/${rid}`);
      await onRecargar();
    } catch (e) {
      Swal.fire('Error', e.response?.data?.error || e.message, 'error');
    }
  };

  if (loadingDetalle && !detalle) {
    return (
      <div style={{ padding: '1rem' }}>
        <CircularProgress size={22} />
      </div>
    );
  }
  if (!detalle) return null;

  return (
    <div className="admin-elcc-plancha-wrap">
      <div className="admin-elcc-lista-card-compact admin-elcc-card-surface admin-elcc-surf-lavender">
        <h3>Plancha electoral (alcalde y cargos)</h3>
        <p className="admin-elcc-muted">
          Elige el <strong>cargo</strong> (incluida la opción <strong>Alcalde</strong> para la cara de la lista en la urna), escribe DNI o apellidos y pulsa un resultado para añadirlo a la tabla. Puedes <strong>quitar</strong> filas o subir una <strong>foto de campaña</strong> si hiciera falta.
        </p>
        <div className="admin-elcc-plancha-add admin-elcc-row-cargo-search">
          <label className="admin-elcc-label">
            Cargo
            <select className="admin-elcc-select" value={mCargoId} onChange={(e) => setMCargoId(e.target.value)}>
              <option value="">— Elige —</option>
              <option value={ALCALDE_VALUE}>Alcalde (cara de la lista / urna)</option>
              {cargos.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="admin-elcc-label flex-1">
            Buscar alumno
            <input
              className="admin-elcc-input"
              value={busq}
              onChange={(e) => setBusq(e.target.value)}
              placeholder="DNI, apellido o nombre (mín. 2 caracteres)"
            />
          </label>
        </div>
        {loadingAlu && <span className="admin-elcc-muted">Buscando…</span>}
        {resAlu.length > 0 && (
          <ul className="admin-elcc-search-inline">
            {resAlu.map((a) => (
              <li key={a.id}>
                <button type="button" className="admin-elcc-pick-row" onClick={() => agregarPlanchaDesdeAlumno(a)}>
                  Añadir: <strong>{a.nombre_completo}</strong> <span className="admin-elcc-muted">DNI {a.dni || '—'}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="admin-elcc-table-scroll">
          <table className="admin-elcc-plancha-table">
            <thead>
              <tr>
                <th>Foto</th>
                <th>Cargo</th>
                <th>Nombre</th>
                <th title="Imagen opcional solo para campaña (si no subes nada, se usa la foto de perfil del alumno).">
                  Foto campaña
                </th>
                <th />
              </tr>
            </thead>
            <tbody>
              {tieneAlcalde ? (
                <tr>
                  <td>
                    {thumbAlcalde ? <img src={thumbAlcalde} alt="" className="admin-elcc-plancha-face" /> : <span className="admin-elcc-muted">—</span>}
                  </td>
                  <td>
                    <strong>Alcalde</strong>
                    {listaLocal.alcalde_alumno_id ? <span className="admin-elcc-tag ok">Matrícula</span> : null}
                  </td>
                  <td>{listaLocal.alcalde_nombre_mostrar || [listaLocal.alcalde_nombres, listaLocal.alcalde_apellidos].filter(Boolean).join(' ')}</td>
                  <td>
                    <input
                      type="file"
                      accept="image/*"
                      className="admin-elcc-file-hidden"
                      id={`foto-alcalde-${listaId}`}
                      onChange={(e) => {
                        subirListaFile(listaId, 'alcalde', e.target.files?.[0]);
                        e.target.value = '';
                      }}
                    />
                    <button type="button" className="admin-elcc-uploadfake" onClick={() => document.getElementById(`foto-alcalde-${listaId}`)?.click()}>
                      Subir foto campaña
                    </button>
                  </td>
                  <td>
                    <button type="button" className="admin-elcc-btn admin-elcc-btn-danger admin-elcc-btn-xs" onClick={() => quitarAlcalde()}>
                      Quitar
                    </button>
                  </td>
                </tr>
              ) : null}
              {(detalle.miembros || []).map((m) => {
                const face = m.foto_display_url || (m.foto_path ? buildUploadsUrl(m.foto_path) : '');
                return (
                  <tr key={m.id}>
                    <td>
                      {face ? <img src={face} alt="" className="admin-elcc-plancha-face" /> : <span className="admin-elcc-muted">—</span>}
                    </td>
                    <td>
                      <strong>{m.cargo_nombre}</strong>
                      {m.alumno_id ? <span className="admin-elcc-tag ok"> Perfil</span> : null}
                    </td>
                    <td>
                      {m.nombres} {m.apellidos}
                    </td>
                    <td>
                      <input
                        type="file"
                        accept="image/*"
                        className="admin-elcc-file-hidden"
                        id={`foto-miembro-${m.id}`}
                        onChange={(e) => {
                          subirMiembroFoto(m.id, e.target.files?.[0]);
                          e.target.value = '';
                        }}
                      />
                      <button type="button" className="admin-elcc-uploadfake" onClick={() => document.getElementById(`foto-miembro-${m.id}`)?.click()}>
                        Subir / cambiar
                      </button>
                    </td>
                    <td>
                      <button type="button" className="admin-elcc-btn admin-elcc-btn-danger admin-elcc-btn-xs" onClick={() => borrarMiembro(m.id)}>
                        Quitar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!tieneAlcalde && (detalle.miembros || []).length === 0 ? (
          <p className="admin-elcc-muted">Aún no hay filas. Elige cargo + alumno arriba.</p>
        ) : null}
      </div>

      <div className="admin-elcc-lista-card-compact admin-elcc-card-surface admin-elcc-surf-peach" style={{ marginTop: '1rem' }}>
        <h3>Propuestas (texto enriquecido)</h3>
        <label className="admin-elcc-label">
          Título
          <input className="admin-elcc-input" value={propT} onChange={(e) => setPropT(e.target.value)} />
        </label>
        <div className="admin-elcc-quill-wrap">
          <ReactQuill
            ref={propQuillRef}
            theme="snow"
            value={propC}
            onChange={setPropC}
            modules={QUILL_MODULES}
            formats={QUILL_FORMATS}
            placeholder="Detalle con formato, listas, enlaces e imágenes…"
          />
        </div>
        <button type="button" className="admin-elcc-btn admin-elcc-btn-primary" style={{ marginTop: 8 }} onClick={agregarProp}>
          Añadir propuesta
        </button>
        <ul className="admin-elcc-prop-list admin-elcc-prop-rich">
          {(detalle.propuestas || []).map((p) => (
            <li key={p.id} className="admin-elcc-prop-item">
              <div className="admin-elcc-prop-head">
                <strong>{p.titulo}</strong>
                <span className="admin-elcc-prop-actions">
                  <button type="button" className="admin-elcc-btn admin-elcc-btn-ghost admin-elcc-btn-xs" onClick={() => setPropEdit({ id: p.id, titulo: p.titulo || '', cuerpo: p.cuerpo || '' })}>
                    Editar
                  </button>
                  <button type="button" className="admin-elcc-btn admin-elcc-btn-danger admin-elcc-btn-xs" onClick={() => borrarProp(p.id)}>
                    Eliminar
                  </button>
                </span>
              </div>
              <details className="admin-elcc-prop-details">
                <summary>Vista previa del texto</summary>
                <div
                  className="admin-elcc-prop-html"
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(p.cuerpo || '') }}
                />
              </details>
            </li>
          ))}
        </ul>
      </div>

      {propEdit ? (
        <Modal title="Editar propuesta" wide stack onClose={() => setPropEdit(null)}>
          <label className="admin-elcc-label">
            Título
            <input className="admin-elcc-input" value={propEdit.titulo} onChange={(e) => setPropEdit((x) => ({ ...x, titulo: e.target.value }))} />
          </label>
          <p className="admin-elcc-muted">Detalle (formato enriquecido)</p>
          <div className="admin-elcc-quill-wrap">
            <ReactQuill
              ref={propEditQuillRef}
              key={propEdit.id}
              theme="snow"
              value={propEdit.cuerpo}
              onChange={(html) => setPropEdit((x) => ({ ...x, cuerpo: html }))}
              modules={QUILL_MODULES}
              formats={QUILL_FORMATS}
            />
          </div>
          <div className="admin-elcc-row-btns" style={{ marginTop: 12 }}>
            <button type="button" className="admin-elcc-btn admin-elcc-btn-primary" onClick={guardarPropEdit}>
              Guardar cambios
            </button>
            <button type="button" className="admin-elcc-btn admin-elcc-btn-ghost" onClick={() => setPropEdit(null)}>
              Cancelar
            </button>
          </div>
        </Modal>
      ) : null}

      <div className="admin-elcc-lista-card-compact admin-elcc-card-surface admin-elcc-surf-mint" style={{ marginTop: '1rem' }}>
        <h3>Videos y redes</h3>
        <p className="admin-elcc-muted">Enlaces a YouTube, TikTok, Instagram o web de la campaña.</p>
        <div className="admin-elcc-red-row">
          <select className="admin-elcc-select" value={redTipo} onChange={(e) => setRedTipo(e.target.value)}>
            <option value="YOUTUBE">YouTube</option>
            <option value="TIKTOK">TikTok</option>
            <option value="INSTAGRAM">Instagram</option>
            <option value="WEB">Web</option>
            <option value="OTRO">Otro</option>
          </select>
          <input className="admin-elcc-input" value={redTitulo} placeholder="Etiqueta (opcional)" onChange={(e) => setRedTitulo(e.target.value)} />
          <input className="admin-elcc-input flex-1" value={redUrl} placeholder="https://..." onChange={(e) => setRedUrl(e.target.value)} />
          <button type="button" className="admin-elcc-btn admin-elcc-btn-primary" onClick={agregarRed}>
            Añadir
          </button>
        </div>
        <ul className="admin-elcc-red-list">
          {(detalle.redes || []).map((r) => (
            <li key={r.id}>
              <strong>{r.tipo}</strong>
              {r.titulo ? ` — ${r.titulo}` : ''}:{' '}
              <a href={r.url} target="_blank" rel="noreferrer">
                {r.url}
              </a>
              <button type="button" className="admin-elcc-btn admin-elcc-btn-danger admin-elcc-btn-xs" onClick={() => borrarRed(r.id)}>
                Quitar
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
