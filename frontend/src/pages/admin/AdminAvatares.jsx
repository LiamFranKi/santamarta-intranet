import React, { useState, useEffect } from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import api from '../../services/api';
import Swal from 'sweetalert2';
import './AdminAvatares.css';

const BIMESTRES = [1, 2, 3, 4];
const SEXO_OPTS = [{ value: 0, label: 'Masculino' }, { value: 1, label: 'Femenino' }];

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
  const [previewBaseUrl, setPreviewBaseUrl] = useState(null); // vista previa imagen base
  const [accesoriosPorBase, setAccesoriosPorBase] = useState({}); // { [baseId]: [accesorios] }
  const [baseParaAccesorio, setBaseParaAccesorio] = useState(null); // base id al abrir "Nuevo accesorio"
  const [guardandoBase, setGuardandoBase] = useState(false);
  const [accesorioEditando, setAccesorioEditando] = useState(null); // id del accesorio al editar
  const [formAccesorio, setFormAccesorio] = useState({
    nombre: '',
    descripcion: '',
    puntuacion_requerida: 0,
    orden: 0
  });
  const [archivoSoloAccesorio, setArchivoSoloAccesorio] = useState(null);
  const [previewSoloAccesorioUrl, setPreviewSoloAccesorioUrl] = useState(null);
  const [archivoAccesorio, setArchivoAccesorio] = useState(null);
  const [previewAccesorioUrl, setPreviewAccesorioUrl] = useState(null);
  const [guardandoAccesorio, setGuardandoAccesorio] = useState(false);
  const [mostrarModalAccesorio, setMostrarModalAccesorio] = useState(false);

  const cargarBases = async () => {
    try {
      setLoading(true);
      const res = await api.get('/admin/avatares/bases');
      const list = res.data.bases || [];
      setBases(list);
      if (list.length > 0) {
        const resAcc = await Promise.all(list.map((b) => api.get(`/admin/avatares/bases/${b.id}/accesorios`)));
        const map = {};
        list.forEach((b, i) => {
          map[b.id] = resAcc[i]?.data?.accesorios || [];
        });
        setAccesoriosPorBase(map);
      } else {
        setAccesoriosPorBase({});
      }
    } catch (e) {
      console.error(e);
      Swal.fire({ icon: 'error', title: 'Error', text: e.response?.data?.error || 'No se pudieron cargar los avatares' });
      setBases([]);
      setAccesoriosPorBase({});
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { cargarBases(); }, []);

  const refrescarAccesoriosDeBase = async (baseId) => {
    if (!baseId) return;
    try {
      const res = await api.get(`/admin/avatares/bases/${baseId}/accesorios`);
      setAccesoriosPorBase((prev) => ({ ...prev, [baseId]: res.data.accesorios || [] }));
    } catch (e) {
      setAccesoriosPorBase((prev) => ({ ...prev, [baseId]: [] }));
    }
  };

  const getAccesorioById = (id) => {
    if (!id) return null;
    for (const arr of Object.values(accesoriosPorBase)) {
      const a = arr.find((x) => x.id === id);
      if (a) return a;
    }
    return null;
  };

  const abrirFormulario = (base) => {
    if (previewBaseUrl) URL.revokeObjectURL(previewBaseUrl);
    setPreviewBaseUrl(null);
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
    } else {
      setBaseEditando(null);
      setFormBase({ bimestre: 1, sexo: 0, nombre: '', descripcion: '', historia: '', orden: 0 });
      setArchivoBase(null);
    }
    setMostrarModalBase(true);
  };

  const cerrarModalBase = () => {
    if (previewBaseUrl) URL.revokeObjectURL(previewBaseUrl);
    setPreviewBaseUrl(null);
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
        refrescarAccesoriosDeBase(baseEditando);
      } else {
        await api.post('/admin/avatares/bases', fd);
        Swal.fire({ icon: 'success', title: 'Listo', text: 'Avatar base creado correctamente' });
        if (previewBaseUrl) URL.revokeObjectURL(previewBaseUrl);
        setPreviewBaseUrl(null);
        setArchivoBase(null);
        cerrarModalBase();
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

  const abrirModalAccesorio = (acc, baseId) => {
    if (previewSoloAccesorioUrl) URL.revokeObjectURL(previewSoloAccesorioUrl);
    if (previewAccesorioUrl) URL.revokeObjectURL(previewAccesorioUrl);
    setPreviewSoloAccesorioUrl(null);
    setPreviewAccesorioUrl(null);
    if (acc) {
      setAccesorioEditando(acc.id);
      setBaseParaAccesorio(acc.avatar_base_id);
      setFormAccesorio({
        nombre: acc.nombre || '',
        descripcion: acc.descripcion || '',
        puntuacion_requerida: acc.puntuacion_requerida ?? 0,
        orden: acc.orden ?? 0
      });
      setArchivoSoloAccesorio(null);
      setArchivoAccesorio(null);
    } else {
      setAccesorioEditando(null);
      setBaseParaAccesorio(baseId);
      setFormAccesorio({ nombre: '', descripcion: '', puntuacion_requerida: 0, orden: 0 });
      setArchivoSoloAccesorio(null);
      setArchivoAccesorio(null);
    }
    setMostrarModalAccesorio(true);
  };

  const guardarAccesorio = async (e) => {
    e.preventDefault();
    const baseId = baseParaAccesorio || (accesorioEditando && getAccesorioById(accesorioEditando)?.avatar_base_id);
    if (!baseId) return;
    setGuardandoAccesorio(true);
    try {
      const fd = new FormData();
      fd.append('nombre', formAccesorio.nombre.trim());
      fd.append('descripcion', (formAccesorio.descripcion || '').trim());
      fd.append('puntuacion_requerida', formAccesorio.puntuacion_requerida);
      fd.append('orden', formAccesorio.orden);
      if (archivoSoloAccesorio) fd.append('imagen_accesorio', archivoSoloAccesorio);
      if (archivoAccesorio) fd.append('imagen_combinada', archivoAccesorio);
      if (accesorioEditando) {
        await api.put(`/admin/avatares/accesorios/${accesorioEditando}`, fd);
        Swal.fire({ icon: 'success', title: 'Listo', text: 'Accesorio actualizado' });
      } else {
        await api.post(`/admin/avatares/bases/${baseId}/accesorios`, fd);
        Swal.fire({ icon: 'success', title: 'Listo', text: 'Accesorio creado' });
      }
      if (previewSoloAccesorioUrl) URL.revokeObjectURL(previewSoloAccesorioUrl);
      if (previewAccesorioUrl) URL.revokeObjectURL(previewAccesorioUrl);
      setPreviewSoloAccesorioUrl(null);
      setPreviewAccesorioUrl(null);
      setMostrarModalAccesorio(false);
      refrescarAccesoriosDeBase(baseId);
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Error', text: err.response?.data?.error || 'No se pudo guardar' });
    } finally {
      setGuardandoAccesorio(false);
    }
  };

  const eliminarAccesorio = async (accesorioId, baseId) => {
    const { isConfirmed } = await Swal.fire({
      title: '¿Eliminar este accesorio?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar'
    });
    if (!isConfirmed) return;
    try {
      await api.delete(`/admin/avatares/accesorios/${accesorioId}`);
      Swal.fire({ icon: 'success', title: 'Eliminado' });
      refrescarAccesoriosDeBase(baseId);
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
                <div className="admin-avatares-acc-grid-wrap">
                  <div className="admin-avatares-acc-grid" style={{ '--cols': 3 }}>
                    {(accesoriosPorBase[b.id] || []).map((a) => (
                      <div key={a.id} className="admin-avatares-acc-mini">
                        <div className="admin-avatares-acc-mini-img" onClick={() => abrirModalAccesorio(a, b.id)} title={a.nombre}>
                          {(a.imagen_accesorio_url || a.imagen_combinada_url) ? (
                            <img src={a.imagen_accesorio_url || a.imagen_combinada_url} alt={a.nombre} />
                          ) : (
                            <span>✨</span>
                          )}
                        </div>
                        <button type="button" className="admin-avatares-acc-mini-delete" onClick={(ev) => { ev.stopPropagation(); eliminarAccesorio(a.id, b.id); }} aria-label="Eliminar accesorio">✕</button>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="admin-avatares-card-info">
                  <h3>{b.nombre || `Bimestre ${b.bimestre} ${SEXO_OPTS.find(s => s.value === b.sexo)?.label || ''}`}</h3>
                  <p className="admin-avatares-card-meta">Bimestre {b.bimestre} · {SEXO_OPTS.find(s => s.value === b.sexo)?.label}</p>
                </div>
                <div className="admin-avatares-card-actions">
                  <button type="button" className="admin-avatares-btn small" onClick={() => abrirFormulario(b)}>Editar</button>
                  <button type="button" className="admin-avatares-btn small danger" onClick={() => eliminarBase(b.id)}>Eliminar</button>
                  <button type="button" className="admin-avatares-btn small primary admin-avatares-btn-accesorio" onClick={() => abrirModalAccesorio(null, b.id)}>＋ Nuevo accesorio</button>
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
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/jpg"
                      onChange={(e) => {
                        const file = e.target.files?.[0] || null;
                        if (previewBaseUrl) URL.revokeObjectURL(previewBaseUrl);
                        setPreviewBaseUrl(file ? URL.createObjectURL(file) : null);
                        setArchivoBase(file);
                      }}
                    />
                    {(previewBaseUrl || (baseActual?.imagen_base_url && !archivoBase)) && (
                      <div className="admin-avatares-preview-wrap">
                        <img src={previewBaseUrl || baseActual?.imagen_base_url} alt="Vista previa" className="admin-avatares-preview-img" />
                      </div>
                    )}
                    {baseActual?.imagen_base_url && !archivoBase && <small className="form-hint">Se muestra la imagen actual. Sube otra para reemplazar. Máx. 15 MB.</small>}
                    {!baseEditando && !previewBaseUrl && <small className="form-hint">Opcional. Puedes añadirla después al editar. Tamaño máximo: 15 MB.</small>}
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
              </div>
            </div>
          </div>
        )}

        {/* Modal Nuevo / Editar accesorio */}
        {mostrarModalAccesorio && (
          <div className="admin-avatares-modal-overlay admin-avatares-modal-accesorio-overlay" onClick={() => { if (previewSoloAccesorioUrl) URL.revokeObjectURL(previewSoloAccesorioUrl); if (previewAccesorioUrl) URL.revokeObjectURL(previewAccesorioUrl); setPreviewSoloAccesorioUrl(null); setPreviewAccesorioUrl(null); setMostrarModalAccesorio(false); }}>
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
                  <label>Imagen del accesorio (solo) — para tienda/listado</label>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/jpg"
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null;
                      if (previewSoloAccesorioUrl) URL.revokeObjectURL(previewSoloAccesorioUrl);
                      setPreviewSoloAccesorioUrl(file ? URL.createObjectURL(file) : null);
                      setArchivoSoloAccesorio(file);
                    }}
                  />
                  {(previewSoloAccesorioUrl || (accesorioEditando && getAccesorioById(accesorioEditando)?.imagen_accesorio_url && !archivoSoloAccesorio)) && (
                    <div className="admin-avatares-preview-wrap">
                      <img src={previewSoloAccesorioUrl || getAccesorioById(accesorioEditando)?.imagen_accesorio_url} alt="Vista previa solo accesorio" className="admin-avatares-preview-img" />
                    </div>
                  )}
                  {accesorioEditando && !archivoSoloAccesorio && <small className="form-hint">Dejar vacío para mantener la actual.</small>}
                  <small className="form-hint">Solo el accesorio (ej. casco). Se muestra en la tienda antes de canjear. Máx. 15 MB.</small>
                </div>
                <div className="form-group">
                  <label>Imagen combinada (personaje + este accesorio)</label>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/jpg"
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null;
                      if (previewAccesorioUrl) URL.revokeObjectURL(previewAccesorioUrl);
                      setPreviewAccesorioUrl(file ? URL.createObjectURL(file) : null);
                      setArchivoAccesorio(file);
                    }}
                  />
                  {(previewAccesorioUrl || (accesorioEditando && getAccesorioById(accesorioEditando)?.imagen_combinada_url && !archivoAccesorio)) && (
                    <div className="admin-avatares-preview-wrap">
                      <img src={previewAccesorioUrl || getAccesorioById(accesorioEditando)?.imagen_combinada_url} alt="Vista previa combinada" className="admin-avatares-preview-img" />
                    </div>
                  )}
                  {accesorioEditando && !archivoAccesorio && <small className="form-hint">Dejar vacío para mantener la actual.</small>}
                  <small className="form-hint">Avatar completo con el accesorio equipado. Se muestra cuando el alumno lo canjea. Máx. 15 MB.</small>
                </div>
                <div className="admin-avatares-modal-actions">
                  <button type="button" className="admin-avatares-btn secondary" onClick={() => { if (previewSoloAccesorioUrl) URL.revokeObjectURL(previewSoloAccesorioUrl); if (previewAccesorioUrl) URL.revokeObjectURL(previewAccesorioUrl); setPreviewSoloAccesorioUrl(null); setPreviewAccesorioUrl(null); setMostrarModalAccesorio(false); }}>Cancelar</button>
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
