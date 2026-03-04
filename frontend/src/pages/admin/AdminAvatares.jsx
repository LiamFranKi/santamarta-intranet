import React, { useState, useEffect } from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import api from '../../services/api';
import Swal from 'sweetalert2';
import './AdminAvatares.css';

const BIMESTRES = [1, 2, 3, 4];
const SEXO_OPTS = [{ value: 0, label: 'Femenino' }, { value: 1, label: 'Masculino' }];

function AdminAvatares() {
  const [bases, setBases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [vista, setVista] = useState('lista'); // 'lista' | 'formulario'
  const [baseEditando, setBaseEditando] = useState(null); // id o null (nuevo)
  const [formBase, setFormBase] = useState({
    bimestre: 1,
    sexo: 0,
    nombre: '',
    descripcion: '',
    historia: '',
    orden: 0
  });
  const [archivoBase, setArchivoBase] = useState(null);
  const [accesorios, setAccesorios] = useState([]);
  const [guardandoBase, setGuardandoBase] = useState(false);
  const [accesorioEditando, setAccesorioEditando] = useState(null);
  const [formAccesorio, setFormAccesorio] = useState({
    nombre: '',
    descripcion: '',
    puntuacion_requerida: 0,
    orden: 0
  });
  const [archivoAccesorio, setArchivoAccesorio] = useState(null);
  const [guardandoAccesorio, setGuardandoAccesorio] = useState(false);
  const [mostrarModalAccesorio, setMostrarModalAccesorio] = useState(false);

  const cargarBases = async () => {
    try {
      setLoading(true);
      const res = await api.get('/admin/avatares/bases');
      setBases(res.data.bases || []);
    } catch (e) {
      console.error(e);
      Swal.fire({ icon: 'error', title: 'Error', text: e.response?.data?.error || 'No se pudieron cargar los avatares' });
      setBases([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { cargarBases(); }, []);

  const cargarAccesorios = async (baseId) => {
    if (!baseId) return;
    try {
      const res = await api.get(`/admin/avatares/bases/${baseId}/accesorios`);
      setAccesorios(res.data.accesorios || []);
    } catch (e) {
      setAccesorios([]);
    }
  };

  const abrirFormulario = (base) => {
    if (base) {
      setBaseEditando(base.id);
      setFormBase({
        bimestre: base.bimestre,
        sexo: base.sexo,
        nombre: base.nombre || '',
        descripcion: base.descripcion || '',
        historia: base.historia || '',
        orden: base.orden ?? 0
      });
      setArchivoBase(null);
      cargarAccesorios(base.id);
    } else {
      setBaseEditando(null);
      setFormBase({ bimestre: 1, sexo: 0, nombre: '', descripcion: '', historia: '', orden: 0 });
      setArchivoBase(null);
      setAccesorios([]);
    }
    setVista('formulario');
  };

  const cerrarFormulario = () => {
    setVista('lista');
    setBaseEditando(null);
    setAccesorioEditando(null);
    setMostrarModalAccesorio(false);
    cargarBases();
  };

  const guardarBase = async (e) => {
    e.preventDefault();
    setGuardandoBase(true);
    try {
      const fd = new FormData();
      fd.append('bimestre', formBase.bimestre);
      fd.append('sexo', formBase.sexo);
      fd.append('nombre', formBase.nombre);
      fd.append('descripcion', formBase.descripcion);
      fd.append('historia', formBase.historia);
      fd.append('orden', formBase.orden);
      if (archivoBase) fd.append('imagen_base', archivoBase);
      if (baseEditando) {
        await api.put(`/admin/avatares/bases/${baseEditando}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        Swal.fire({ icon: 'success', title: 'Avatar base actualizado' });
      } else {
        await api.post('/admin/avatares/bases', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        Swal.fire({ icon: 'success', title: 'Avatar base creado' });
      }
      cargarBases();
      if (!baseEditando) cerrarFormulario();
      else cargarAccesorios(baseEditando);
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Error', text: err.response?.data?.error || 'No se pudo guardar' });
    } finally {
      setGuardandoBase(false);
    }
  };

  const eliminarBase = async (id) => {
    const { isConfirmed } = await Swal.fire({
      title: '¿Eliminar este avatar base?',
      text: 'Se eliminarán también todos sus accesorios.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar'
    });
    if (!isConfirmed) return;
    try {
      await api.delete(`/admin/avatares/bases/${id}`);
      Swal.fire({ icon: 'success', title: 'Eliminado' });
      if (baseEditando === id) cerrarFormulario();
      else cargarBases();
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Error', text: err.response?.data?.error || 'No se pudo eliminar' });
    }
  };

  const abrirModalAccesorio = (acc) => {
    if (acc) {
      setAccesorioEditando(acc.id);
      setFormAccesorio({
        nombre: acc.nombre || '',
        descripcion: acc.descripcion || '',
        puntuacion_requerida: acc.puntuacion_requerida ?? 0,
        orden: acc.orden ?? 0
      });
      setArchivoAccesorio(null);
    } else {
      setAccesorioEditando(null);
      setFormAccesorio({ nombre: '', descripcion: '', puntuacion_requerida: 0, orden: 0 });
      setArchivoAccesorio(null);
    }
    setMostrarModalAccesorio(true);
  };

  const guardarAccesorio = async (e) => {
    e.preventDefault();
    if (!baseEditando) return;
    setGuardandoAccesorio(true);
    try {
      const fd = new FormData();
      fd.append('nombre', formAccesorio.nombre);
      fd.append('descripcion', formAccesorio.descripcion);
      fd.append('puntuacion_requerida', formAccesorio.puntuacion_requerida);
      fd.append('orden', formAccesorio.orden);
      if (archivoAccesorio) fd.append('imagen_combinada', archivoAccesorio);
      if (accesorioEditando) {
        await api.put(`/admin/avatares/accesorios/${accesorioEditando}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        Swal.fire({ icon: 'success', title: 'Accesorio actualizado' });
      } else {
        await api.post(`/admin/avatares/bases/${baseEditando}/accesorios`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        Swal.fire({ icon: 'success', title: 'Accesorio creado' });
      }
      setMostrarModalAccesorio(false);
      cargarAccesorios(baseEditando);
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Error', text: err.response?.data?.error || 'No se pudo guardar' });
    } finally {
      setGuardandoAccesorio(false);
    }
  };

  const eliminarAccesorio = async (id) => {
    const { isConfirmed } = await Swal.fire({
      title: '¿Eliminar este accesorio?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar'
    });
    if (!isConfirmed) return;
    try {
      await api.delete(`/admin/avatares/accesorios/${id}`);
      Swal.fire({ icon: 'success', title: 'Eliminado' });
      setMostrarModalAccesorio(false);
      cargarAccesorios(baseEditando);
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Error', text: err.response?.data?.error || 'No se pudo eliminar' });
    }
  };

  const baseActual = bases.find(b => b.id === baseEditando);

  return (
    <DashboardLayout>
      <div className="admin-avatares">
        <h1 className="admin-avatares-titulo">Avatares por bimestre</h1>
        <p className="admin-avatares-descripcion">
          Cada avatar es por bimestre y género. En una sola pantalla editas el avatar base y sus accesorios (imagen combinada = personaje + accesorio).
        </p>

        {vista === 'lista' && (
          <>
            <div className="admin-avatares-actions">
              <button type="button" className="admin-avatares-btn primary" onClick={() => abrirFormulario(null)}>
                + Nuevo avatar base
              </button>
            </div>
            {loading ? (
              <p>Cargando...</p>
            ) : bases.length === 0 ? (
              <div className="admin-avatares-empty">
                <p>No hay avatares base. Crea uno para Bimestre 1, 2, 3 o 4 y género Femenino/Masculino.</p>
              </div>
            ) : (
              <div className="admin-avatares-grid">
                {bases.map((b) => (
                  <div key={b.id} className="admin-avatares-card">
                    <div className="admin-avatares-card-imagen">
                      {b.imagen_base_url ? (
                        <img src={b.imagen_base_url} alt={b.nombre} />
                      ) : (
                        <div className="admin-avatares-card-placeholder">🎭</div>
                      )}
                    </div>
                    <div className="admin-avatares-card-info">
                      <h3>{b.nombre || `Bimestre ${b.bimestre} ${SEXO_OPTS.find(s => s.value === b.sexo)?.label || ''}`}</h3>
                      <p>Bimestre {b.bimestre} · {SEXO_OPTS.find(s => s.value === b.sexo)?.label}</p>
                    </div>
                    <div className="admin-avatares-card-actions">
                      <button type="button" className="admin-avatares-btn small" onClick={() => abrirFormulario(b)}>Editar</button>
                      <button type="button" className="admin-avatares-btn small danger" onClick={() => eliminarBase(b.id)}>Eliminar</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {vista === 'formulario' && (
          <div className="admin-avatares-form-wrap">
            <button type="button" className="admin-avatares-btn back" onClick={cerrarFormulario}>← Volver a la lista</button>

            <form onSubmit={guardarBase} className="admin-avatares-form">
              <h2>{baseEditando ? 'Editar avatar base' : 'Nuevo avatar base'}</h2>
              <div className="admin-avatares-form-grid">
                <label>Bimestre</label>
                <select value={formBase.bimestre} onChange={(e) => setFormBase({ ...formBase, bimestre: parseInt(e.target.value, 10) })}>
                  {BIMESTRES.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
                <label>Género</label>
                <select value={formBase.sexo} onChange={(e) => setFormBase({ ...formBase, sexo: parseInt(e.target.value, 10) })}>
                  {SEXO_OPTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
                <label>Nombre</label>
                <input type="text" value={formBase.nombre} onChange={(e) => setFormBase({ ...formBase, nombre: e.target.value })} placeholder="Ej. Avatar Bimestre 1 Masculino" />
                <label>Descripción</label>
                <input type="text" value={formBase.descripcion} onChange={(e) => setFormBase({ ...formBase, descripcion: e.target.value })} placeholder="Opcional" />
                <label>Orden</label>
                <input type="number" value={formBase.orden} onChange={(e) => setFormBase({ ...formBase, orden: parseInt(e.target.value, 10) || 0 })} min={0} />
                <label>Imagen base (sin accesorios)</label>
                <input type="file" accept="image/png,image/jpeg,image/jpg" onChange={(e) => setArchivoBase(e.target.files?.[0] || null)} />
                {baseActual?.imagen_base_url && !archivoBase && <p className="admin-avatares-hint">Actual: se muestra la imagen ya guardada. Sube otra para reemplazar.</p>}
                <label className="full">Historia / texto (opcional)</label>
                <textarea className="full" value={formBase.historia} onChange={(e) => setFormBase({ ...formBase, historia: e.target.value })} rows={3} />
              </div>
              <button type="submit" className="admin-avatares-btn primary" disabled={guardandoBase}>
                {guardandoBase ? 'Guardando...' : 'Guardar avatar base'}
              </button>
            </form>

            {baseEditando && (
              <div className="admin-avatares-accesorios">
                <h2>Accesorios de este avatar</h2>
                <p className="admin-avatares-hint">Cada accesorio tiene su imagen combinada (personaje + accesorio). Los alumnos desbloquean por estrellas y eligen cuál equipar.</p>
                <button type="button" className="admin-avatares-btn primary" onClick={() => abrirModalAccesorio(null)}>+ Añadir accesorio</button>
                <ul className="admin-avatares-accesorios-list">
                  {accesorios.map((a) => (
                    <li key={a.id}>
                      <div className="admin-avatares-acc-imagen">
                        {a.imagen_combinada_url ? <img src={a.imagen_combinada_url} alt={a.nombre} /> : <span>🎭</span>}
                      </div>
                      <span>{a.nombre} — ⭐ {a.puntuacion_requerida} estrellas</span>
                      <div>
                        <button type="button" className="admin-avatares-btn small" onClick={() => abrirModalAccesorio(a)}>Editar</button>
                        <button type="button" className="admin-avatares-btn small danger" onClick={() => eliminarAccesorio(a.id)}>Eliminar</button>
                      </div>
                    </li>
                  ))}
                </ul>
                {accesorios.length === 0 && <p className="admin-avatares-empty-list">Aún no hay accesorios. Añade uno.</p>}
              </div>
            )}

            {mostrarModalAccesorio && (
              <div className="admin-avatares-modal-overlay" onClick={() => setMostrarModalAccesorio(false)}>
                <div className="admin-avatares-modal" onClick={(e) => e.stopPropagation()}>
                  <h3>{accesorioEditando ? 'Editar accesorio' : 'Nuevo accesorio'}</h3>
                  <form onSubmit={guardarAccesorio}>
                    <label>Nombre</label>
                    <input type="text" value={formAccesorio.nombre} onChange={(e) => setFormAccesorio({ ...formAccesorio, nombre: e.target.value })} placeholder="Ej. Gorro, Capa" required />
                    <label>Descripción</label>
                    <input type="text" value={formAccesorio.descripcion} onChange={(e) => setFormAccesorio({ ...formAccesorio, descripcion: e.target.value })} />
                    <label>Estrellas necesarias para desbloquear</label>
                    <input type="number" value={formAccesorio.puntuacion_requerida} onChange={(e) => setFormAccesorio({ ...formAccesorio, puntuacion_requerida: parseInt(e.target.value, 10) || 0 })} min={0} />
                    <label>Orden</label>
                    <input type="number" value={formAccesorio.orden} onChange={(e) => setFormAccesorio({ ...formAccesorio, orden: parseInt(e.target.value, 10) || 0 })} min={0} />
                    <label>Imagen combinada (personaje + este accesorio)</label>
                    <input type="file" accept="image/png,image/jpeg,image/jpg" onChange={(e) => setArchivoAccesorio(e.target.files?.[0] || null)} />
                    {accesorioEditando && !archivoAccesorio && <p className="admin-avatares-hint">Dejar vacío para mantener la actual.</p>}
                    <div className="admin-avatares-modal-actions">
                      <button type="button" className="admin-avatares-btn" onClick={() => setMostrarModalAccesorio(false)}>Cancelar</button>
                      <button type="submit" className="admin-avatares-btn primary" disabled={guardandoAccesorio}>{guardandoAccesorio ? 'Guardando...' : 'Guardar'}</button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

export default AdminAvatares;
