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
  const [mostrarModalBase, setMostrarModalBase] = useState(false);
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
    setMostrarModalBase(true);
  };

  const cerrarModalBase = () => {
    setMostrarModalBase(false);
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
      fd.append('nombre', formBase.nombre.trim());
      fd.append('descripcion', (formBase.descripcion || '').trim());
      fd.append('historia', (formBase.historia || '').trim());
      fd.append('orden', formBase.orden);
      if (archivoBase) fd.append('imagen_base', archivoBase);
      // No enviar Content-Type: axios lo fija con boundary para FormData
      if (baseEditando) {
        await api.put(`/admin/avatares/bases/${baseEditando}`, fd);
        Swal.fire({ icon: 'success', title: 'Listo', text: 'Avatar base actualizado correctamente' });
        cargarBases();
        cargarAccesorios(baseEditando);
      } else {
        const res = await api.post('/admin/avatares/bases', fd);
        const nuevaBase = res.data?.base;
        Swal.fire({ icon: 'success', title: 'Listo', text: 'Avatar base creado. Puedes añadir accesorios abajo.' });
        cargarBases();
        if (nuevaBase?.id) {
          setBaseEditando(nuevaBase.id);
          setFormBase({
            bimestre: nuevaBase.bimestre,
            sexo: nuevaBase.sexo,
            nombre: nuevaBase.nombre || '',
            descripcion: nuevaBase.descripcion || '',
            historia: nuevaBase.historia || '',
            orden: nuevaBase.orden ?? 0
          });
          setArchivoBase(null);
          cargarAccesorios(nuevaBase.id);
        }
      }
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'No se pudo guardar';
      Swal.fire({ icon: 'error', title: 'Error', text: msg });
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
      if (baseEditando === id) cerrarModalBase();
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
      fd.append('nombre', formAccesorio.nombre.trim());
      fd.append('descripcion', (formAccesorio.descripcion || '').trim());
      fd.append('puntuacion_requerida', formAccesorio.puntuacion_requerida);
      fd.append('orden', formAccesorio.orden);
      if (archivoAccesorio) fd.append('imagen_combinada', archivoAccesorio);
      if (accesorioEditando) {
        await api.put(`/admin/avatares/accesorios/${accesorioEditando}`, fd);
        Swal.fire({ icon: 'success', title: 'Listo', text: 'Accesorio actualizado' });
      } else {
        await api.post(`/admin/avatares/bases/${baseEditando}/accesorios`, fd);
        Swal.fire({ icon: 'success', title: 'Listo', text: 'Accesorio creado' });
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
        <div className="admin-avatares-header">
          <h1>🎮 Avatares por bimestre</h1>
          <p>Gestiona los avatares base por bimestre y género, y sus accesorios. Cada accesorio usa una imagen ya combinada (personaje + accesorio).</p>
        </div>

        <div className="admin-avatares-actions">
          <button type="button" className="admin-avatares-btn primary" onClick={() => abrirFormulario(null)}>
            ＋ Nuevo avatar base
          </button>
        </div>
        {loading ? (
          <div className="admin-avatares-loading">
            <div className="admin-avatares-spinner" />
            <p>Cargando avatares...</p>
          </div>
        ) : bases.length === 0 ? (
          <div className="admin-avatares-card admin-avatares-empty-card">
            <div className="admin-avatares-empty-icon">🎭</div>
            <h3>No hay avatares base</h3>
            <p>Crea el primero para Bimestre 1, 2, 3 o 4 y género Femenino o Masculino.</p>
            <button type="button" className="admin-avatares-btn primary" onClick={() => abrirFormulario(null)}>
              ＋ Crear avatar base
            </button>
          </div>
        ) : (
          <div className="admin-avatares-grid">
            {bases.map((b) => (
              <div key={b.id} className="admin-avatares-card admin-avatares-card-base">
                <div className="admin-avatares-card-imagen">
                  {b.imagen_base_url ? (
                    <img src={b.imagen_base_url} alt={b.nombre} />
                  ) : (
                    <div className="admin-avatares-card-placeholder">🎭</div>
                  )}
                </div>
                <div className="admin-avatares-card-info">
                  <h3>{b.nombre || `Bimestre ${b.bimestre} ${SEXO_OPTS.find(s => s.value === b.sexo)?.label || ''}`}</h3>
                  <p className="admin-avatares-card-meta">Bimestre {b.bimestre} · {SEXO_OPTS.find(s => s.value === b.sexo)?.label}</p>
                </div>
                <div className="admin-avatares-card-actions">
                  <button type="button" className="admin-avatares-btn small" onClick={() => abrirFormulario(b)}>Editar</button>
                  <button type="button" className="admin-avatares-btn small danger" onClick={() => eliminarBase(b.id)}>Eliminar</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Modal Nuevo / Editar avatar base */}
        {mostrarModalBase && (
          <div className="admin-avatares-modal-overlay admin-avatares-modal-base-overlay" onClick={cerrarModalBase}>
            <div className="admin-avatares-modal admin-avatares-modal-base" onClick={(e) => e.stopPropagation()}>
              <div className="admin-avatares-modal-base-header">
                <h2 className="admin-avatares-modal-base-title">{baseEditando ? '✏️ Editar avatar base' : '➕ Nuevo avatar base'}</h2>
                <button type="button" className="admin-avatares-modal-close" onClick={cerrarModalBase} aria-label="Cerrar">✕</button>
              </div>
              <div className="admin-avatares-modal-base-body">
                <form onSubmit={guardarBase} className="admin-avatares-form">
                  <div className="admin-avatares-form-grid">
                    <div className="form-group">
                      <label>Bimestre</label>
                      <select value={formBase.bimestre} onChange={(e) => setFormBase({ ...formBase, bimestre: parseInt(e.target.value, 10) })}>
                        {BIMESTRES.map((n) => <option key={n} value={n}>Bimestre {n}</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Género</label>
                      <select value={formBase.sexo} onChange={(e) => setFormBase({ ...formBase, sexo: parseInt(e.target.value, 10) })}>
                        {SEXO_OPTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                      </select>
                    </div>
                    <div className="form-group form-group-full">
                      <label>Nombre del avatar</label>
                      <input type="text" value={formBase.nombre} onChange={(e) => setFormBase({ ...formBase, nombre: e.target.value })} placeholder="Ej. Avatar Bimestre 1 Masculino" />
                    </div>
                    <div className="form-group form-group-full">
                      <label>Descripción (opcional)</label>
                      <input type="text" value={formBase.descripcion} onChange={(e) => setFormBase({ ...formBase, descripcion: e.target.value })} placeholder="Breve descripción" />
                    </div>
                    <div className="form-group">
                      <label>Orden</label>
                      <input type="number" value={formBase.orden} onChange={(e) => setFormBase({ ...formBase, orden: parseInt(e.target.value, 10) || 0 })} min={0} />
                    </div>
                    <div className="form-group">
                      <label>Imagen base (sin accesorios)</label>
                      <input type="file" accept="image/png,image/jpeg,image/jpg" onChange={(e) => setArchivoBase(e.target.files?.[0] || null)} />
                      {baseActual?.imagen_base_url && !archivoBase && <small className="form-hint">Se muestra la imagen actual. Sube otra para reemplazar. Máx. 15 MB.</small>}
                      {!baseEditando && <small className="form-hint">Opcional. Puedes añadirla después al editar. Tamaño máximo: 15 MB.</small>}
                    </div>
                    <div className="form-group form-group-full">
                      <label>Historia o texto (opcional)</label>
                      <textarea value={formBase.historia} onChange={(e) => setFormBase({ ...formBase, historia: e.target.value })} rows={3} placeholder="Texto que verá el alumno" />
                    </div>
                  </div>
                  <div className="admin-avatares-form-actions">
                    <button type="button" className="admin-avatares-btn secondary" onClick={cerrarModalBase}>Cancelar</button>
                    <button type="submit" className="admin-avatares-btn primary" disabled={guardandoBase}>
                      {guardandoBase ? 'Guardando...' : '💾 Guardar avatar base'}
                    </button>
                  </div>
                </form>

                {baseEditando && (
                  <div className="admin-avatares-modal-accesorios">
                    <h3 className="admin-avatares-section-title">✨ Accesorios de este avatar</h3>
                    <p className="admin-avatares-hint-block">Cada accesorio tiene su imagen combinada (personaje + accesorio). Los alumnos desbloquean por estrellas y eligen cuál equipar.</p>
                    <button type="button" className="admin-avatares-btn primary" onClick={() => abrirModalAccesorio(null)}>＋ Añadir accesorio</button>
                    <ul className="admin-avatares-accesorios-list">
                      {accesorios.map((a) => (
                        <li key={a.id} className="admin-avatares-accesorio-item">
                          <div className="admin-avatares-acc-imagen">
                            {a.imagen_combinada_url ? <img src={a.imagen_combinada_url} alt={a.nombre} /> : <span>🎭</span>}
                          </div>
                          <span className="admin-avatares-acc-info">{a.nombre} — ⭐ {a.puntuacion_requerida} estrellas</span>
                          <div className="admin-avatares-acc-actions">
                            <button type="button" className="admin-avatares-btn small" onClick={() => abrirModalAccesorio(a)}>Editar</button>
                            <button type="button" className="admin-avatares-btn small danger" onClick={() => eliminarAccesorio(a.id)}>Eliminar</button>
                          </div>
                        </li>
                      ))}
                    </ul>
                    {accesorios.length === 0 && <p className="admin-avatares-empty-list">Aún no hay accesorios. Añade uno con el botón de arriba.</p>}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Modal Nuevo / Editar accesorio */}
        {mostrarModalAccesorio && (
          <div className="admin-avatares-modal-overlay admin-avatares-modal-accesorio-overlay" onClick={() => setMostrarModalAccesorio(false)}>
            <div className="admin-avatares-modal admin-avatares-modal-accesorio" onClick={(e) => e.stopPropagation()}>
              <h3 className="admin-avatares-modal-title">{accesorioEditando ? '✏️ Editar accesorio' : '➕ Nuevo accesorio'}</h3>
              <form onSubmit={guardarAccesorio} className="admin-avatares-modal-form">
                <div className="form-group">
                  <label>Nombre</label>
                  <input type="text" value={formAccesorio.nombre} onChange={(e) => setFormAccesorio({ ...formAccesorio, nombre: e.target.value })} placeholder="Ej. Gorro, Capa" required />
                </div>
                <div className="form-group">
                  <label>Descripción (opcional)</label>
                  <input type="text" value={formAccesorio.descripcion} onChange={(e) => setFormAccesorio({ ...formAccesorio, descripcion: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Estrellas necesarias para desbloquear</label>
                  <input type="number" value={formAccesorio.puntuacion_requerida} onChange={(e) => setFormAccesorio({ ...formAccesorio, puntuacion_requerida: parseInt(e.target.value, 10) || 0 })} min={0} />
                </div>
                <div className="form-group">
                  <label>Orden</label>
                  <input type="number" value={formAccesorio.orden} onChange={(e) => setFormAccesorio({ ...formAccesorio, orden: parseInt(e.target.value, 10) || 0 })} min={0} />
                </div>
                <div className="form-group">
                  <label>Imagen combinada (personaje + este accesorio)</label>
                  <input type="file" accept="image/png,image/jpeg,image/jpg" onChange={(e) => setArchivoAccesorio(e.target.files?.[0] || null)} />
                  {accesorioEditando && !archivoAccesorio && <small className="form-hint">Dejar vacío para mantener la actual.</small>}
                  <small className="form-hint">Tamaño máximo: 15 MB.</small>
                </div>
                <div className="admin-avatares-modal-actions">
                  <button type="button" className="admin-avatares-btn secondary" onClick={() => setMostrarModalAccesorio(false)}>Cancelar</button>
                  <button type="submit" className="admin-avatares-btn primary" disabled={guardandoAccesorio}>{guardandoAccesorio ? 'Guardando...' : '💾 Guardar'}</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

export default AdminAvatares;
