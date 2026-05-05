import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CircularProgress } from '@mui/material';
import DashboardLayout from '../../components/DashboardLayout';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { buildUploadsUrl } from '../../utils/uploadsUrl';
import Swal from 'sweetalert2';
import './AdminUsuarios.css';
import './AdminElecciones.css';

export default function AdminEleccionProceso() {
  const { procesoId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [proceso, setProceso] = useState(null);
  const [form, setForm] = useState({});
  const [cargos, setCargos] = useState([]);
  const [newCargoNombre, setNewCargoNombre] = useState('');
  const [listas, setListas] = useState([]);
  const [gruposOpciones, setGruposOpciones] = useState([]);
  const [grupoSeleccion, setGrupoSeleccion] = useState([]);
  const [expandedLista, setExpandedLista] = useState(null);
  const [detalleLista, setDetalleLista] = useState({});
  const [loadingDetalle, setLoadingDetalle] = useState(false);
  const [resultados, setResultados] = useState(null);

  const idNum = parseInt(procesoId, 10);

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
      const gvArr = Array.isArray(pr.grados_voto) ? pr.grados_voto : [];
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
        grados_voto_texto: gvArr.length ? gvArr.join(', ') : ''
      });
      const gids = Array.isArray(pr.grupo_ids) ? pr.grupo_ids.map(Number).filter(Boolean) : [];
      setGrupoSeleccion(gids);

      setCargos(rCar.data.cargos || []);
      setListas(rLis.data.listas || []);
      setExpandedLista(null);
      setDetalleLista({});

      const anio = user?.anio_activo;
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
  }, [idNum, navigate, user?.anio_activo]);

  useEffect(() => {
    cargarTodo();
  }, [cargarTodo]);

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
    if (!expandedLista) return;
    if (detalleLista[expandedLista]) return;
    cargarDetalleLista(expandedLista);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cache check arriba
  }, [expandedLista]);

  const guardarProceso = async () => {
    try {
      const gradosParseados = String(form.grados_voto_texto || '')
        .split(/[,;\s]+/)
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !Number.isNaN(n));
      await api.put(`/elecciones/admin/procesos/${idNum}`, {
        ...form,
        grado_min: form.grado_min === '' ? null : form.grado_min,
        grado_max: form.grado_max === '' ? null : form.grado_max,
        grupo_ids: grupoSeleccion.length ? grupoSeleccion : [],
        votacion_inicio: form.votacion_inicio || null,
        votacion_fin: form.votacion_fin || null,
        perfiles_voto: Array.isArray(form.perfiles_voto) && form.perfiles_voto.length ? form.perfiles_voto : ['ALUMNO'],
        grados_voto: gradosParseados.length ? gradosParseados : []
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
      setExpandedLista(data.id);
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

  const actualizarLista = async (lista) => {
    try {
      await api.put(`/elecciones/admin/listas/${lista.id}`, {
        nombre_lista: lista.nombre_lista,
        eslogan: lista.eslogan,
        color_primario: lista.color_primario,
        color_secundario: lista.color_secundario,
        alcalde_nombres: lista.alcalde_nombres,
        alcalde_apellidos: lista.alcalde_apellidos,
        estado: lista.estado,
        orden_sort: lista.orden_sort
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
        <div style={{ marginBottom: '1rem' }}>
          <button type="button" className="admin-elcc-btn admin-elcc-btn-ghost" onClick={() => navigate('/admin/herramientas/elecciones')}>
            ← Volver
          </button>
        </div>

        <div className="admin-elcc-panel">
          <h2>Datos del proceso</h2>
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
              Grado mín. (vacío = todos)
              <input type="number" className="admin-elcc-input" value={form.grado_min ?? ''} onChange={(e) => setForm((f) => ({ ...f, grado_min: e.target.value }))} />
            </label>
            <label className="admin-elcc-label">
              Grado máx. (vacío = todos)
              <input type="number" className="admin-elcc-input" value={form.grado_max ?? ''} onChange={(e) => setForm((f) => ({ ...f, grado_max: e.target.value }))} />
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
          <div
            style={{
              marginTop: '1rem',
              padding: '0.85rem 1rem',
              background: '#f8fafc',
              borderRadius: 10,
              border: '1px solid #e2e8f0'
            }}
          >
            <h3 style={{ margin: '0 0 0.5rem', fontSize: '0.95rem', color: '#0f172a' }}>Quién puede votar (perfil)</h3>
            <p style={{ margin: '0 0 0.65rem', fontSize: '0.82rem', color: '#64748b' }}>
              Define si votan solo alumnos, también apoderados o docentes. La campaña y las listas las puede ver cualquier usuario
              autenticado; la urna solo se habilita para quien cumpla perfil más grados/aulas.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.85rem 1.25rem' }}>
              {['ALUMNO', 'APODERADO', 'DOCENTE'].map((cod) => (
                <label key={cod} style={{ cursor: 'pointer', fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="checkbox"
                    checked={(form.perfiles_voto || []).map((x) => String(x).toUpperCase()).includes(cod)}
                    onChange={() => togglePerfilVoto(cod)}
                  />{' '}
                  {cod === 'ALUMNO' ? 'Alumnos' : cod === 'APODERADO' ? 'Apoderados' : 'Docentes'}
                </label>
              ))}
            </div>
            <h3 style={{ margin: '0.85rem 0 0.4rem', fontSize: '0.95rem', color: '#0f172a' }}>Grados que pueden votar (opcional)</h3>
            <p style={{ margin: '0 0 0.45rem', fontSize: '0.82rem', color: '#64748b' }}>
              Lista separada por comas (ej. <strong>3, 4, 5</strong>). Si lo dejas vacío, se usan solo «Grado mín/máx» de arriba.
            </p>
            <input
              type="text"
              className="admin-elcc-input"
              placeholder="Ej. 3, 4, 5"
              value={form.grados_voto_texto || ''}
              onChange={(e) => setForm((f) => ({ ...f, grados_voto_texto: e.target.value }))}
              style={{ maxWidth: '100%', width: 360 }}
            />
          </div>
          <p style={{ marginTop: '1rem', fontSize: '0.85rem', color: '#64748b' }}>
            Convocatoria por aula: sin selección abajo = todas las secciones. Con selección = solo grupos marcados.
          </p>
          <div className="admin-elcc-grupos-box" style={{ marginTop: 8 }}>
            {gruposOpciones.length === 0 ? (
              <span style={{ color: '#94a3b8' }}>No hay grupos para este año.</span>
            ) : (
              gruposOpciones.map((g) => (
                <label key={g.id} style={{ display: 'block', cursor: 'pointer', marginBottom: 4 }}>
                  <input type="checkbox" checked={grupoSeleccion.includes(g.id)} onChange={() => toggleGrupo(g.id)} />{' '}
                  {g.grado ?? '—'}° {g.seccion ?? ''}
                  {(g.nivel_nombre && ` · ${g.nivel_nombre}`) || ''}
                </label>
              ))
            )}
          </div>
          <div style={{ marginTop: '1rem' }}>
            <button type="button" className="admin-elcc-btn admin-elcc-btn-primary" onClick={guardarProceso}>
              Guardar proceso
            </button>
          </div>
        </div>

        <div className="admin-elcc-panel">
          <h2>Resultados (conteo)</h2>
          {resultados && resultados.totales ? (
            <>
              <p style={{ color: '#64748b', fontSize: '0.9rem' }}>Participación registrada: {resultados.votos_registrados}</p>
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
            <p style={{ color: '#94a3b8' }}>Sin datos aún.</p>
          )}
          <button type="button" className="admin-elcc-btn admin-elcc-btn-ghost" style={{ marginTop: 8 }} onClick={cargarTodo}>
            Actualizar conteo
          </button>
        </div>

        <div className="admin-elcc-panel">
          <h2>Cargos de plancha</h2>
          <p style={{ fontSize: '0.85rem', color: '#64748b' }}>Ej. Tesorero, Vocal. El candidato a alcalde se carga aparte en cada lista.</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
            <input className="admin-elcc-input" placeholder="Nombre del cargo" value={newCargoNombre} onChange={(e) => setNewCargoNombre(e.target.value)} style={{ maxWidth: 280 }} />
            <button type="button" className="admin-elcc-btn admin-elcc-btn-primary" onClick={agregarCargo}>
              Agregar
            </button>
          </div>
          <ul style={{ paddingLeft: 18, margin: 0 }}>
            {cargos.map((c) => (
              <li key={c.id} style={{ marginBottom: 6 }}>
                <strong>{c.nombre}</strong>{' '}
                <button type="button" className="admin-elcc-btn admin-elcc-btn-danger" style={{ padding: '0.2rem 0.45rem', fontSize: '0.75rem' }} onClick={() => borrarCargo(c.id)}>
                  Quitar
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="admin-elcc-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2>Listas / candidaturas</h2>
            <button type="button" className="admin-elcc-btn admin-elcc-btn-primary" onClick={nuevaLista}>
              + Lista
            </button>
          </div>
          {listas.map((lista) => (
            <div key={lista.id} className="admin-elcc-lista-card">
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                {lista.logo_path ? (
                  <img className="admin-elcc-mini-img" src={buildUploadsUrl(lista.logo_path)} alt="" />
                ) : (
                  <div className="admin-elcc-mini-img" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10 }}>Logo</div>
                )}
                {lista.alcalde_foto_path ? (
                  <img className="admin-elcc-mini-img" src={buildUploadsUrl(lista.alcalde_foto_path)} alt="" />
                ) : (
                  <div className="admin-elcc-mini-img" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10 }}>Alcalde</div>
                )}
                <div style={{ flex: 1, minWidth: 200 }}>
                  <label className="admin-elcc-label">
                    Nombre lista
                    <input className="admin-elcc-input" value={lista.nombre_lista} onChange={(e) => setListas((L) => L.map((x) => (x.id === lista.id ? { ...x, nombre_lista: e.target.value } : x)))} />
                  </label>
                </div>
              </div>
              <div className="admin-elcc-form-grid" style={{ marginTop: '0.85rem' }}>
                <label className="admin-elcc-label admin-elcc-form-grid full">
                  Eslogan
                  <input className="admin-elcc-input" value={lista.eslogan || ''} onChange={(e) => setListas((L) => L.map((x) => (x.id === lista.id ? { ...x, eslogan: e.target.value } : x)))} />
                </label>
                <label className="admin-elcc-label">
                  Color primario
                  <input type="color" className="admin-elcc-input" style={{ height: 42 }} value={lista.color_primario || '#4f46e5'} onChange={(e) => setListas((L) => L.map((x) => (x.id === lista.id ? { ...x, color_primario: e.target.value } : x)))} />
                </label>
                <label className="admin-elcc-label">
                  Color secundario
                  <input type="color" className="admin-elcc-input" style={{ height: 42 }} value={lista.color_secundario || '#0ea5e9'} onChange={(e) => setListas((L) => L.map((x) => (x.id === lista.id ? { ...x, color_secundario: e.target.value } : x)))} />
                </label>
                <label className="admin-elcc-label">
                  Orden urna
                  <input type="number" className="admin-elcc-input" value={lista.orden_sort} onChange={(e) => setListas((L) => L.map((x) => (x.id === lista.id ? { ...x, orden_sort: parseInt(e.target.value, 10) || 0 } : x)))} />
                </label>
                <label className="admin-elcc-label">
                  Estado público
                  <select className="admin-elcc-select" value={lista.estado} onChange={(e) => setListas((L) => L.map((x) => (x.id === lista.id ? { ...x, estado: e.target.value } : x)))}>
                    <option value="BORRADOR">BORRADOR</option>
                    <option value="PUBLICADA">PUBLICADA</option>
                  </select>
                </label>
                <label className="admin-elcc-label">
                  Alcalde — nombres
                  <input className="admin-elcc-input" value={lista.alcalde_nombres || ''} onChange={(e) => setListas((L) => L.map((x) => (x.id === lista.id ? { ...x, alcalde_nombres: e.target.value } : x)))} />
                </label>
                <label className="admin-elcc-label">
                  Alcalde — apellidos
                  <input className="admin-elcc-input" value={lista.alcalde_apellidos || ''} onChange={(e) => setListas((L) => L.map((x) => (x.id === lista.id ? { ...x, alcalde_apellidos: e.target.value } : x)))} />
                </label>
              </div>
              <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <button type="button" className="admin-elcc-btn admin-elcc-btn-primary" onClick={() => actualizarLista(lista)}>
                  Guardar datos
                </button>
                <label className="admin-elcc-btn admin-elcc-btn-ghost" style={{ cursor: 'pointer' }}>
                  Subir logo
                  <input type="file" accept="image/*" hidden onChange={(e) => subirListaFile(lista.id, 'logo', e.target.files?.[0])} />
                </label>
                <label className="admin-elcc-btn admin-elcc-btn-ghost" style={{ cursor: 'pointer' }}>
                  Foto alcalde
                  <input type="file" accept="image/*" hidden onChange={(e) => subirListaFile(lista.id, 'alcalde', e.target.files?.[0])} />
                </label>
                <button type="button" className="admin-elcc-btn admin-elcc-btn-danger" onClick={() => borrarLista(lista.id)}>
                  Eliminar lista
                </button>
                <button
                  type="button"
                  className="admin-elcc-btn admin-elcc-btn-ghost"
                  onClick={() => setExpandedLista((x) => (x === lista.id ? null : lista.id))}
                >
                  {expandedLista === lista.id ? '▲ Ocultar plancha / propuestas' : '▼ Plancha, propuestas y redes'}
                </button>
              </div>

              {expandedLista === lista.id && (
                <ListaDetalleEditor
                  listaId={lista.id}
                  cargos={cargos}
                  loadingDetalle={loadingDetalle}
                  detalle={detalleLista[lista.id]}
                  onRecargar={() => cargarDetalleLista(lista.id)}
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}

function ListaDetalleEditor({ listaId, procesoId, cargos, loadingDetalle, detalle, onRecargar }) {
  const [mCargoId, setMCargoId] = useState('');
  const [mNom, setMNom] = useState('');
  const [mApe, setMApe] = useState('');
  const [propT, setPropT] = useState('');
  const [propC, setPropC] = useState('');
  const [redTipo, setRedTipo] = useState('TIKTOK');
  const [redTitulo, setRedTitulo] = useState('');
  const [redUrl, setRedUrl] = useState('');

  const agregarMiembro = async () => {
    if (!mCargoId || !mNom || !mApe) {
      Swal.fire('Completa cargo, nombres y apellidos', '', 'warning');
      return;
    }
    await api.post(`/elecciones/admin/listas/${listaId}/miembros`, {
      cargo_id: parseInt(mCargoId, 10),
      nombres: mNom,
      apellidos: mApe
    });
    setMNom('');
    setMApe('');
    await onRecargar();
    await Swal.fire('Listo', 'Miembro agregado', 'success');
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
    if (!propT || !propC) {
      Swal.fire('Título y texto requeridos', '', 'warning');
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
    <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px dashed #e2e8f0' }}>
      <h3 style={{ fontSize: '0.95rem', margin: '0 0 0.6rem' }}>Plancha (sin alcalde)</h3>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8, alignItems: 'flex-end' }}>
        <label className="admin-elcc-label">
          Cargo
          <select className="admin-elcc-select" value={mCargoId} onChange={(e) => setMCargoId(e.target.value)}>
            <option value="">—</option>
            {cargos.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="admin-elcc-label">
          Nombres
          <input className="admin-elcc-input" value={mNom} onChange={(e) => setMNom(e.target.value)} />
        </label>
        <label className="admin-elcc-label">
          Apellidos
          <input className="admin-elcc-input" value={mApe} onChange={(e) => setMApe(e.target.value)} />
        </label>
        <button type="button" className="admin-elcc-btn admin-elcc-btn-primary" onClick={agregarMiembro}>
          Agregar
        </button>
      </div>
      <ul style={{ paddingLeft: 16, margin: '0 0 1rem' }}>
        {(detalle.miembros || []).map((m) => (
          <li key={m.id} style={{ marginBottom: 8 }}>
            <strong>{m.cargo_nombre}</strong>: {m.nombres} {m.apellidos}{' '}
            <label style={{ cursor: 'pointer', fontSize: '0.8rem', color: '#6366f1' }}>
              Foto
              <input type="file" accept="image/*" hidden onChange={(e) => subirMiembroFoto(m.id, e.target.files?.[0])} />
            </label>{' '}
            {m.foto_path && <img alt="" src={buildUploadsUrl(m.foto_path)} style={{ width: 36, height: 36, objectFit: 'cover', verticalAlign: 'middle', marginLeft: 6, borderRadius: 8 }} />}
            <button type="button" className="admin-elcc-btn admin-elcc-btn-danger" style={{ marginLeft: 8 }} onClick={() => borrarMiembro(m.id)}>
              Quitar
            </button>
          </li>
        ))}
      </ul>

      <h3 style={{ fontSize: '0.95rem', margin: '0 0 0.6rem' }}>Propuestas</h3>
      <label className="admin-elcc-label admin-elcc-form-grid full">
        Título
        <input className="admin-elcc-input" value={propT} onChange={(e) => setPropT(e.target.value)} />
      </label>
      <label className="admin-elcc-label admin-elcc-form-grid full">
        Detalle
        <textarea className="admin-elcc-textarea" value={propC} onChange={(e) => setPropC(e.target.value)} rows={3} />
      </label>
      <button type="button" className="admin-elcc-btn admin-elcc-btn-primary" onClick={agregarProp} style={{ marginBottom: 12 }}>
        Añadir propuesta
      </button>
      <ul style={{ paddingLeft: 16 }}>
        {(detalle.propuestas || []).map((p) => (
          <li key={p.id}>
            <strong>{p.titulo}</strong> — {String(p.cuerpo || '').slice(0, 80)}
            {(p.cuerpo || '').length > 80 ? '…' : ''}
            <button type="button" className="admin-elcc-btn admin-elcc-btn-danger" style={{ marginLeft: 8 }} onClick={() => borrarProp(p.id)}>
              Eliminar
            </button>
          </li>
        ))}
      </ul>

      <h3 style={{ fontSize: '0.95rem', margin: '1rem 0 0.6rem' }}>Redes / enlaces</h3>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end', marginBottom: 8 }}>
        <label className="admin-elcc-label">
          Tipo
          <select className="admin-elcc-select" value={redTipo} onChange={(e) => setRedTipo(e.target.value)}>
            <option value="TIKTOK">TikTok</option>
            <option value="INSTAGRAM">Instagram</option>
            <option value="YOUTUBE">YouTube</option>
            <option value="WEB">Web</option>
            <option value="OTRO">Otro</option>
          </select>
        </label>
        <label className="admin-elcc-label">
          Etiqueta
          <input className="admin-elcc-input" value={redTitulo} placeholder="Ej. Campaña día 1" onChange={(e) => setRedTitulo(e.target.value)} />
        </label>
        <label className="admin-elcc-label" style={{ minWidth: 220 }}>
          URL
          <input className="admin-elcc-input" value={redUrl} placeholder="https://..." onChange={(e) => setRedUrl(e.target.value)} />
        </label>
        <button type="button" className="admin-elcc-btn admin-elcc-btn-primary" onClick={agregarRed}>
          Añadir
        </button>
      </div>
      <ul style={{ paddingLeft: 16 }}>
        {(detalle.redes || []).map((r) => (
          <li key={r.id}>
            <strong>{r.tipo}</strong>
            {r.titulo ? ` — ${r.titulo}` : ''}: <a href={r.url} target="_blank" rel="noreferrer">{r.url}</a>
            <button type="button" className="admin-elcc-btn admin-elcc-btn-danger" style={{ marginLeft: 8 }} onClick={() => borrarRed(r.id)}>
              Eliminar
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
