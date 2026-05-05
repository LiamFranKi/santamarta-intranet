import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { CircularProgress } from '@mui/material';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import DashboardLayout from '../../components/DashboardLayout';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { buildUploadsUrl } from '../../utils/uploadsUrl';
import Swal from 'sweetalert2';
import './AdminUsuarios.css';
import './AdminElecciones.css';

const QUILL_MODULES = {
  toolbar: [
    [{ header: [1, 2, 3, false] }],
    ['bold', 'italic', 'underline', 'strike'],
    [{ list: 'ordered' }, { list: 'bullet' }],
    ['link'],
    ['clean']
  ]
};

function Modal({ title, children, onClose, wide }) {
  return (
    <div className="admin-elcc-modal-backdrop" role="presentation" onClick={onClose}>
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
}

/** Búsqueda de alumno vía /elecciones/admin/meta-alumnos */
function AlumnoSearch({
  anio,
  onElegir,
  label,
  hint
}) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const tref = useRef(null);

  useEffect(() => {
    if (!q || q.trim().length < 2) {
      setResults([]);
      return undefined;
    }
    const t = window.setTimeout(async () => {
      setLoading(true);
      try {
        const { data } = await api.get('/elecciones/admin/meta-alumnos', {
          params: { q: q.trim(), anio, limit: 20 }
        });
        setResults(data.alumnos || []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 320);
    return () => window.clearTimeout(t);
  }, [q, anio]);

  return (
    <div className="admin-elcc-alu-search">
      <label className="admin-elcc-label">
        {label}
        <input
          className="admin-elcc-input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="DNI o apellidos / nombre (mín. 2 caracteres)"
          autoComplete="off"
        />
      </label>
      {hint && <p className="admin-elcc-hint">{hint}</p>}
      {loading && <span className="admin-elcc-muted">Buscando…</span>}
      {results.length > 0 && (
        <ul className="admin-elcc-alu-results" ref={tref}>
          {results.map((a) => (
            <li key={a.id}>
              <button type="button" className="admin-elcc-alu-pick" onClick={() => onElegir(a)}>
                <strong>{a.nombre_completo}</strong>
                <span className="admin-elcc-muted"> DNI {a.dni || '—'}</span>
                {a.etiqueta_grupo && <span className="admin-elcc-tag">{a.etiqueta_grupo}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
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

  const gradosNumericosUnicos = useMemo(() => {
    const s = new Set();
    (gruposOpciones || []).forEach((g) => {
      if (g.grado != null && g.grado !== '') s.add(Number(g.grado));
    });
    return [...s].filter((n) => !Number.isNaN(n)).sort((a, b) => a - b);
  }, [gruposOpciones]);

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
        votacion_inicio: pr.votacion_inicio ? String(pr.votacion_inicio).slice(0, 16) : '',
        votacion_fin: pr.votacion_fin ? String(pr.votacion_fin).slice(0, 16) : '',
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
        votacion_inicio: form.votacion_inicio || null,
        votacion_fin: form.votacion_fin || null,
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
    try {
      const { data } = await api.post(`/elecciones/admin/procesos/${idNum}/listas`, {
        nombre_lista: 'Nueva lista',
        estado: 'BORRADOR'
      });
      await cargarTodo();
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

  const actualizarLista = async (lista, patch = {}) => {
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
      await Swal.fire('Lista guardada', '', 'success');
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
      showCancelButton: true
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
      setListas(r.data.listas || []);
      await Swal.fire('Archivo subido', '', 'success');
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

  const toggleGradoVoto = (num) => {
    setForm((f) => {
      const arr = Array.isArray(f.grados_voto_arr) ? [...f.grados_voto_arr] : [];
      const i = arr.indexOf(num);
      if (i >= 0) arr.splice(i, 1);
      else arr.push(num);
      return { ...f, grados_voto_arr: arr.sort((a, b) => a - b) };
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

        <section className="admin-elcc-panel admin-elcc-panel-hero">
          <h2>Datos del proceso</h2>
          <p className="admin-elcc-muted admin-elcc-lead">
            Aquí defines título, estado, ventana de votación y reglas de <strong>quién puede votar</strong>. Los demás apartados (resultados, cargos, listas) están en los botones de abajo para no saturar la pantalla.
          </p>

          <div className="admin-elcc-form-grid">
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
              Inicio votación (opc.)
              <input type="datetime-local" className="admin-elcc-input" value={form.votacion_inicio || ''} onChange={(e) => setForm((f) => ({ ...f, votacion_inicio: e.target.value }))} />
            </label>
            <label className="admin-elcc-label">
              Fin votación (opc.)
              <input type="datetime-local" className="admin-elcc-input" value={form.votacion_fin || ''} onChange={(e) => setForm((f) => ({ ...f, votacion_fin: e.target.value }))} />
            </label>
            <label className="admin-elcc-label admin-elcc-form-grid full" style={{ gridColumn: '1 / -1' }}>
              Descripción
              <textarea className="admin-elcc-textarea" value={form.descripcion || ''} onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))} rows={3} />
            </label>
          </div>

          <div className="admin-elcc-callout">
            <h3>¿Quién puede votar? (perfil)</h3>
            <p>
              Marca si votan <strong>solo alumnos</strong>, también <strong>apoderados</strong> y/o <strong>docentes</strong>. La campaña la puede ver cualquier usuario de la intranet; la urna solo para quien cumpla estas casillas{' '}
              <em>y además</em> las reglas de grado/aula de abajo.
            </p>
            <div className="admin-elcc-check-row">
              {['ALUMNO', 'APODERADO', 'DOCENTE'].map((cod) => (
                <label key={cod} className="admin-elcc-check">
                  <input
                    type="checkbox"
                    checked={(form.perfiles_voto || []).map((x) => String(x).toUpperCase()).includes(cod)}
                    onChange={() => togglePerfilVoto(cod)}
                  />
                  {cod === 'ALUMNO' ? 'Alumnos' : cod === 'APODERADO' ? 'Apoderados' : 'Docentes'}
                </label>
              ))}
            </div>
          </div>

          <div className="admin-elcc-callout admin-elcc-callout-pastel">
            <h3>Filtrar por grado numérico (opcional)</h3>
            <p>
              Son los <strong>números de grado</strong> del colegio (1°, 2°, 3°…). Si marcas algunos, solo los alumnos de esos grados podrán votar (además del filtro de aulas, si lo usas). Si no marcas ninguno aquí, no se restringe por número de grado en este bloque.
            </p>
            {gradosNumericosUnicos.length === 0 ? (
              <p className="admin-elcc-muted">No hay grupos cargados para este año; revisa meta-grupos o el año activo.</p>
            ) : (
              <div className="admin-elcc-check-wrap">
                {gradosNumericosUnicos.map((g) => (
                  <label key={g} className="admin-elcc-check admin-elcc-chip-check">
                    <input
                      type="checkbox"
                      checked={(form.grados_voto_arr || []).includes(g)}
                      onChange={() => toggleGradoVoto(g)}
                    />
                    {g}°
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="admin-elcc-callout">
            <h3>Convocatoria por aula (recomendado)</h3>
            <p>
              <strong>Convocatoria</strong> = qué <em>aulas concretas</em> (grado + sección + nivel) pueden participar. Equivale a elegir “esta lista de grupos del colegio”.
              <br />
              Si <strong>no marcas ninguna aula</strong>, se entiende <strong>todas las aulas del año</strong>. Si marcas una o más, <strong>solo esas aulas</strong> podrán votar.
            </p>
            <div className="admin-elcc-grupos-box admin-elcc-grupos-scroll">
              {gruposOpciones.length === 0 ? (
                <span className="admin-elcc-muted">No hay grupos para este año lectivo.</span>
              ) : (
                gruposOpciones.map((g) => (
                  <label key={g.id} className="admin-elcc-grupo-line">
                    <input type="checkbox" checked={grupoSeleccion.includes(g.id)} onChange={() => toggleGrupo(g.id)} />
                    <span>
                      {g.grado ?? '—'}° {g.seccion ?? ''}
                      {g.nivel_nombre ? ` · ${g.nivel_nombre}` : ''}
                    </span>
                  </label>
                ))
              )}
            </div>
          </div>

          <details className="admin-elcc-details">
            <summary>Opción avanzada: rango numérico de grados</summary>
            <p className="admin-elcc-muted">
              Solo úsalo si necesitas un rango tipo “del 3 al 5” sin marcar casillas. Si ya usaste grados marcados o aulas arriba, normalmente esto va vacío.
            </p>
            <div className="admin-elcc-form-grid" style={{ maxWidth: 480 }}>
              <label className="admin-elcc-label">
                Grado mínimo (número)
                <input type="number" className="admin-elcc-input" value={form.grado_min ?? ''} onChange={(e) => setForm((f) => ({ ...f, grado_min: e.target.value }))} />
              </label>
              <label className="admin-elcc-label">
                Grado máximo (número)
                <input type="number" className="admin-elcc-input" value={form.grado_max ?? ''} onChange={(e) => setForm((f) => ({ ...f, grado_max: e.target.value }))} />
              </label>
            </div>
          </details>

          <div style={{ marginTop: '1rem' }}>
            <button type="button" className="admin-elcc-btn admin-elcc-btn-primary" onClick={guardarProceso}>
              Guardar datos del proceso
            </button>
          </div>
        </section>

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
                  listas={listas}
                  setListas={setListas}
                  idNum={idNum}
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
  listas,
  setListas,
  idNum,
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

  return (
    <div className="admin-elcc-lista-editor">
      <button type="button" className="admin-elcc-btn admin-elcc-btn-ghost admin-elcc-back-list" onClick={onVolver}>
        ← Volver a las listas
      </button>

      <div className="admin-elcc-lista-card-compact">
        <h3>Identidad de la lista</h3>
        <div className="admin-elcc-form-grid">
          <label className="admin-elcc-label">
            Nombre
            <input className="admin-elcc-input" value={listaLocal.nombre_lista} onChange={(e) => patch('nombre_lista', e.target.value)} />
          </label>
          <label className="admin-elcc-label">
            Eslogan
            <input className="admin-elcc-input" value={listaLocal.eslogan || ''} onChange={(e) => patch('eslogan', e.target.value)} />
          </label>
          <label className="admin-elcc-label">
            Color primario
            <input type="color" className="admin-elcc-input" style={{ height: 42 }} value={listaLocal.color_primario || '#4f46e5'} onChange={(e) => patch('color_primario', e.target.value)} />
          </label>
          <label className="admin-elcc-label">
            Color secundario
            <input type="color" className="admin-elcc-input" style={{ height: 42 }} value={listaLocal.color_secundario || '#0ea5e9'} onChange={(e) => patch('color_secundario', e.target.value)} />
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
        </div>
        <div className="admin-elcc-row-btns">
          <label className="admin-elcc-btn admin-elcc-btn-ghost" style={{ cursor: 'pointer' }}>
            Subir logo lista
            <input type="file" accept="image/*" hidden onChange={(e) => subirListaFile(lista.id, 'logo', e.target.files?.[0])} />
          </label>
          <button type="button" className="admin-elcc-btn admin-elcc-btn-primary" onClick={() => actualizarLista(listaLocal)}>
            Guardar identidad
          </button>
        </div>
      </div>

      <div className="admin-elcc-lista-card-compact">
        <h3>Candidato a alcalde (buscar alumno)</h3>
        <p className="admin-elcc-muted">
          Vincula al alumno del colegio: se mostrará su nombre y la foto del perfil del sistema en la campaña. Opcionalmente puedes subir una foto extra solo si en algún caso no hubiera foto en el perfil.
        </p>
        {listaLocal.alcalde_nombre_mostrar && (
          <p>
            <strong>Actual:</strong> {listaLocal.alcalde_nombre_mostrar}
            {listaLocal.alcalde_alumno_id ? <span className="admin-elcc-tag ok">Enlazado a matrícula</span> : null}
          </p>
        )}
        <AlumnoSearch
          anio={anio}
          label="Buscar por DNI o nombre"
          hint="Elige un resultado para asignarlo como alcalde de esta lista."
          onElegir={async (alu) => {
            await actualizarLista(
              { ...listaLocal, alcalde_alumno_id: alu.id },
              {
                alcalde_alumno_id: alu.id,
                alcalde_nombres: alu.nombres,
                alcalde_apellidos: `${alu.apellido_paterno || ''} ${alu.apellido_materno || ''}`.trim()
              }
            );
          }}
        />
        <label className="admin-elcc-btn admin-elcc-btn-ghost" style={{ cursor: 'pointer', display: 'inline-block', marginTop: 8 }}>
          Foto alcalde (opcional, sobre perfil)
          <input type="file" accept="image/*" hidden onChange={(e) => subirListaFile(lista.id, 'alcalde', e.target.files?.[0])} />
        </label>
      </div>

      <ListaDetalleEditor
        listaId={lista.id}
        anio={anio}
        cargos={cargos}
        loadingDetalle={loadingDetalle}
        detalle={detalle}
        onRecargar={onRecargarDetalle}
      />
    </div>
  );
}

function ListaDetalleEditor({ listaId, anio, cargos, loadingDetalle, detalle, onRecargar }) {
  const [mCargoId, setMCargoId] = useState('');
  const [busq, setBusq] = useState('');
  const [resAlu, setResAlu] = useState([]);
  const [loadingAlu, setLoadingAlu] = useState(false);
  const [propT, setPropT] = useState('');
  const [propC, setPropC] = useState('');
  const [redTipo, setRedTipo] = useState('YOUTUBE');
  const [redTitulo, setRedTitulo] = useState('');
  const [redUrl, setRedUrl] = useState('');

  useEffect(() => {
    if (!busq || busq.trim().length < 2) {
      setResAlu([]);
      return undefined;
    }
    const t = window.setTimeout(async () => {
      setLoadingAlu(true);
      try {
        const { data } = await api.get('/elecciones/admin/meta-alumnos', {
          params: { q: busq.trim(), anio, limit: 16 }
        });
        setResAlu(data.alumnos || []);
      } catch {
        setResAlu([]);
      } finally {
        setLoadingAlu(false);
      }
    }, 300);
    return () => window.clearTimeout(t);
  }, [busq, anio]);

  const agregarMiembroDesdeAlumno = async (alu) => {
    if (!mCargoId) {
      Swal.fire('Selecciona un cargo', '', 'warning');
      return;
    }
    await api.post(`/elecciones/admin/listas/${listaId}/miembros`, {
      cargo_id: parseInt(mCargoId, 10),
      alumno_id: alu.id
    });
    setBusq('');
    setResAlu([]);
    await onRecargar();
    await Swal.fire('Listo', 'Integrante agregado (foto desde perfil del alumno)', 'success');
  };

  const subirMiembroFoto = async (mid, file) => {
    if (!file) return;
    const fd = new FormData();
    fd.append('foto', file);
    await api.post(`/elecciones/admin/miembros/${mid}/foto`, fd);
    await onRecargar();
  };

  const borrarMiembro = async (mid) => {
    await api.delete(`/elecciones/admin/miembros/${mid}`);
    await onRecargar();
  };

  const agregarProp = async () => {
    if (!propT || !propC || propC.replace(/<[^>]+>/g, '').trim() === '') {
      Swal.fire('Completa título y detalle', '', 'warning');
      return;
    }
    await api.post(`/elecciones/admin/listas/${listaId}/propuestas`, { titulo: propT, cuerpo: propC });
    setPropT('');
    setPropC('');
    await onRecargar();
  };

  const borrarProp = async (pid) => {
    await api.delete(`/elecciones/admin/propuestas/${pid}`);
    await onRecargar();
  };

  const agregarRed = async () => {
    if (!redUrl) {
      Swal.fire('URL requerida', '', 'warning');
      return;
    }
    await api.post(`/elecciones/admin/listas/${listaId}/redes`, {
      tipo: redTipo,
      titulo: redTitulo || null,
      url: redUrl
    });
    setRedUrl('');
    setRedTitulo('');
    await onRecargar();
  };

  const borrarRed = async (rid) => {
    await api.delete(`/elecciones/admin/redes/${rid}`);
    await onRecargar();
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
      <h3>Plancha (miembros)</h3>
      <p className="admin-elcc-muted">El mismo buscador por DNI o nombre. La foto sale del perfil del alumno si está enlazado.</p>
      <div className="admin-elcc-plancha-add">
        <label className="admin-elcc-label">
          Cargo
          <select className="admin-elcc-select" value={mCargoId} onChange={(e) => setMCargoId(e.target.value)}>
            <option value="">— Elige —</option>
            {cargos.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="admin-elcc-label flex-1">
          Buscar alumno
          <input className="admin-elcc-input" value={busq} onChange={(e) => setBusq(e.target.value)} placeholder="DNI o apellido" />
        </label>
      </div>
      {loadingAlu && <span className="admin-elcc-muted">Buscando…</span>}
      {resAlu.length > 0 && (
        <ul className="admin-elcc-mini-res">
          {resAlu.map((a) => (
            <li key={a.id}>
              <button type="button" className="admin-elcc-mini-pick" onClick={() => agregarMiembroDesdeAlumno(a)}>
                + {a.nombre_completo} <span className="admin-elcc-muted">({a.dni})</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <ul className="admin-elcc-miemb-grid">
        {(detalle.miembros || []).map((m) => (
          <li key={m.id} className="admin-elcc-miem-card">
            <div>
              <strong>{m.cargo_nombre}</strong>
              <div>
                {m.nombres} {m.apellidos}
              </div>
              {m.alumno_id && <span className="admin-elcc-tag ok">Perfil</span>}
            </div>
            {!m.alumno_id && (
              <label className="admin-elcc-link-file">
                Subir foto
                <input type="file" accept="image/*" hidden onChange={(e) => subirMiembroFoto(m.id, e.target.files?.[0])} />
              </label>
            )}
            {m.foto_path && <img src={buildUploadsUrl(m.foto_path)} alt="" className="admin-elcc-miem-thumb" />}
            <button type="button" className="admin-elcc-btn admin-elcc-btn-danger admin-elcc-btn-xs" onClick={() => borrarMiembro(m.id)}>
              Quitar
            </button>
          </li>
        ))}
      </ul>

      <h3 style={{ marginTop: '1.25rem' }}>Propuestas (texto enriquecido)</h3>
      <label className="admin-elcc-label">
        Título
        <input className="admin-elcc-input" value={propT} onChange={(e) => setPropT(e.target.value)} />
      </label>
      <div className="admin-elcc-quill-wrap">
        <ReactQuill theme="snow" value={propC} onChange={setPropC} modules={QUILL_MODULES} placeholder="Detalle con formato, listas y enlaces…" />
      </div>
      <button type="button" className="admin-elcc-btn admin-elcc-btn-primary" style={{ marginTop: 8 }} onClick={agregarProp}>
        Añadir propuesta
      </button>
      <ul className="admin-elcc-prop-list">
        {(detalle.propuestas || []).map((p) => (
          <li key={p.id}>
            <strong>{p.titulo}</strong>
            <button type="button" className="admin-elcc-btn admin-elcc-btn-danger admin-elcc-btn-xs" onClick={() => borrarProp(p.id)}>
              Eliminar
            </button>
          </li>
        ))}
      </ul>

      <h3 style={{ marginTop: '1.25rem' }}>Videos y redes</h3>
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
      <ul>
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
  );
}
