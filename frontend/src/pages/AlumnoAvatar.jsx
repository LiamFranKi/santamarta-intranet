import React, { useState, useEffect } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import api from '../services/api';
import Swal from 'sweetalert2';
import './AlumnoAvatar.css';

// Sistema: 'bimestre' = avatares por bimestre con accesorios; 'tienda' = tienda antigua (avatar_shop)
function AlumnoAvatar() {
  const [loading, setLoading] = useState(true);
  const [sistema, setSistema] = useState('tienda'); // 'bimestre' | 'tienda'
  const [avatarActual, setAvatarActual] = useState(null);
  const [avatarImagenUrl, setAvatarImagenUrl] = useState(null);
  const [avatarBase, setAvatarBase] = useState(null);
  const [items, setItems] = useState([]);
  const [accesorios, setAccesorios] = useState([]);
  const [totalEstrellas, setTotalEstrellas] = useState(0);
  const [bimestre, setBimestre] = useState(1);
  const [comprando, setComprando] = useState(null);
  const [equipando, setEquipando] = useState(null);
  const [error, setError] = useState(null);

  const cargar = async () => {
    try {
      setLoading(true);
      setError(null);
      const resBimestre = await api.get('/alumno/avatares-bimestre/resumen').catch(() => null);
      if (resBimestre?.data?.avatar_base != null && resBimestre?.data?.avatar_imagen_url != null) {
        setSistema('bimestre');
        setAvatarImagenUrl(resBimestre.data.avatar_imagen_url);
        setAvatarBase(resBimestre.data.avatar_base);
        setTotalEstrellas(resBimestre.data.total_estrellas ?? 0);
        setBimestre(resBimestre.data.bimestre ?? 1);
        const resAcc = await api.get(`/alumno/avatares-bimestre/bases/${resBimestre.data.avatar_base.id}/accesorios`);
        setAccesorios(resAcc.data.accesorios || []);
        setItems([]);
        setAvatarActual(null);
        setLoading(false);
        return;
      }
      setSistema('tienda');
      const res = await api.get('/alumno/avatares/tienda');
      setAvatarActual(res.data.avatar_actual || null);
      setAvatarImagenUrl(null);
      setAvatarBase(null);
      setAccesorios([]);
      setItems(res.data.items || []);
      setTotalEstrellas(res.data.total_estrellas ?? 0);
    } catch (err) {
      console.error('Error cargando avatar:', err);
      setError(err.response?.data?.error || err.message || 'No se pudo cargar');
      Swal.fire({ icon: 'error', title: 'Error', text: err.response?.data?.error || err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { cargar(); }, []);

  const handleComprar = async (item) => {
    if (item.ya_comprado || !item.puede_comprar) return;
    try {
      setComprando(item.id);
      await api.post(`/alumno/avatares/comprar/${item.id}`);
      await cargar();
      Swal.fire({ icon: 'success', title: '¡Avatar desbloqueado!', timer: 2000, showConfirmButton: false });
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Error', text: err.response?.data?.error || 'No se pudo desbloquear' });
    } finally {
      setComprando(null);
    }
  };

  const handleDesbloquearBimestre = async (accesorio) => {
    if (accesorio.desbloqueado || !accesorio.puede_desbloquear) return;
    try {
      setComprando(accesorio.id);
      await api.post(`/alumno/avatares-bimestre/desbloquear/${accesorio.id}`);
      await cargar();
      Swal.fire({ icon: 'success', title: '¡Accesorio desbloqueado!', timer: 2000, showConfirmButton: false });
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Error', text: err.response?.data?.error || 'No se pudo desbloquear' });
    } finally {
      setComprando(null);
    }
  };

  const handleEquiparBimestre = async (accesorioId) => {
    if (!avatarBase?.id) return;
    try {
      setEquipando(accesorioId);
      await api.put('/alumno/avatares-bimestre/equipar', {
        avatar_base_id: avatarBase.id,
        accesorio_id: accesorioId
      });
      await cargar();
      Swal.fire({ icon: 'success', title: 'Avatar actualizado', timer: 1500, showConfirmButton: false });
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Error', text: err.response?.data?.error || 'No se pudo equipar' });
    } finally {
      setEquipando(null);
    }
  };

  const handleEquiparSoloBase = async () => {
    if (!avatarBase?.id) return;
    try {
      setEquipando(-1);
      await api.put('/alumno/avatares-bimestre/equipar', {
        avatar_base_id: avatarBase.id,
        accesorio_id: null
      });
      await cargar();
      Swal.fire({ icon: 'success', title: 'Avatar actualizado', timer: 1500, showConfirmButton: false });
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Error', text: err.response?.data?.error || 'No se pudo equipar' });
    } finally {
      setEquipando(null);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="avatar-pagina">
          <div className="avatar-cargando">
            <div className="avatar-spinner"></div>
            <p>Cargando...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout>
        <div className="avatar-pagina">
          <div className="avatar-error">
            <p>{error}</p>
            <button type="button" className="avatar-btn-reintentar" onClick={cargar}>
              Reintentar
            </button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const avatar = avatarActual || { name: 'Sin avatar', description: 'Aún no tienes un avatar asignado', price: 0 };
  const precio = avatar.price != null ? avatar.price : 0;
  const descripcion = avatar.description || '—';
  const nivel = avatar.level != null ? String(avatar.level).padStart(2, '0') : '00';

  const imagenMostrar = sistema === 'bimestre' ? avatarImagenUrl : avatarActual?.image_url;
  const nombreMostrar = sistema === 'bimestre' ? (avatarBase?.nombre || 'Mi avatar') : avatar.name;

  return (
    <DashboardLayout>
      <div className="avatar-pagina">
        <h1 className="avatar-titulo-principal">Tu Avatar</h1>
        {sistema === 'bimestre' && (
          <p className="avatar-bimestre-badge">Bimestre {bimestre}</p>
        )}
        <div className="avatar-tarjeta-centro">
          <div className="avatar-tarjeta-contenido">
            <div className="avatar-imagen-container">
              {imagenMostrar ? (
                <img src={imagenMostrar} alt={nombreMostrar} />
              ) : (
                <div className="avatar-imagen-placeholder">🎭</div>
              )}
              {sistema === 'tienda' && <div className="avatar-nivel-badge">Nivel {nivel}</div>}
            </div>
            <div className="avatar-info">
              <h2 className="avatar-nombre">{nombreMostrar}</h2>
              <p className="avatar-descripcion">{sistema === 'bimestre' ? (avatarBase?.nombre ? `Avatar del bimestre ${bimestre}` : '') : descripcion}</p>
              {sistema === 'tienda' && (
                <>
                  <p className="avatar-nivel">Nivel {nivel}</p>
                  <div className="avatar-precio">
                    <span className="avatar-precio-label">Precio:</span>{' '}
                    {precio === 0 ? 'Gratis' : `${precio} estrellas`}
                  </div>
                </>
              )}
              <div className="avatar-estrellas">
                <span className="avatar-estrellas-label">Tus estrellas:</span>{' '}
                <strong>{totalEstrellas}</strong>
              </div>
            </div>
          </div>
        </div>

        {sistema === 'bimestre' ? (
          <>
            <h2 className="avatar-tienda-titulo">Accesorios de tu avatar</h2>
            <div className="avatar-bimestre-sin-accesorio">
              <button
                type="button"
                className={`avatar-tienda-btn ${accesorios.every(a => !a.equipado) ? 'avatar-tienda-btn-comprado' : ''}`}
                onClick={handleEquiparSoloBase}
                disabled={equipando === -1}
              >
                {equipando === -1 ? '...' : 'Usar sin accesorio'}
              </button>
            </div>
            {accesorios.length > 0 ? (
              <div className="avatar-tienda-grid">
                {accesorios.map((acc) => (
                  <div key={acc.id} className={`avatar-tienda-card ${acc.desbloqueado ? 'avatar-tienda-card-comprado' : ''}`}>
                    <div className="avatar-tienda-imagen">
                      {acc.imagen_combinada_url ? (
                        <img src={acc.imagen_combinada_url} alt={acc.nombre} />
                      ) : (
                        <div className="avatar-tienda-placeholder">🎭</div>
                      )}
                      {acc.desbloqueado && <span className="avatar-tienda-badge">✓ Desbloqueado</span>}
                      {acc.equipado && <span className="avatar-tienda-badge equipado">Equipado</span>}
                    </div>
                    <h3 className="avatar-tienda-nombre">{acc.nombre}</h3>
                    <p className="avatar-tienda-descripcion">{acc.descripcion || '—'}</p>
                    <p className="avatar-tienda-precio">⭐ {acc.puntuacion_requerida ?? 0} estrellas</p>
                    <div className="avatar-bimestre-acciones">
                      {!acc.desbloqueado && (
                        <button
                          type="button"
                          className={`avatar-tienda-btn ${acc.puede_desbloquear ? 'avatar-tienda-btn-comprar' : 'avatar-tienda-btn-bloqueado'}`}
                          onClick={() => handleDesbloquearBimestre(acc)}
                          disabled={!acc.puede_desbloquear || comprando === acc.id}
                        >
                          {acc.puede_desbloquear ? (comprando === acc.id ? '...' : 'Desbloquear') : `Necesitas ${acc.puntuacion_requerida ?? 0} ⭐`}
                        </button>
                      )}
                      {acc.desbloqueado && (
                        <button
                          type="button"
                          className={`avatar-tienda-btn ${acc.equipado ? 'avatar-tienda-btn-comprado' : ''}`}
                          onClick={() => handleEquiparBimestre(acc.id)}
                          disabled={acc.equipado || equipando === acc.id}
                        >
                          {acc.equipado ? 'Equipado' : equipando === acc.id ? '...' : 'Equipar'}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="avatar-tienda-vacio">No hay accesorios para este bimestre.</p>
            )}
          </>
        ) : (
          <>
            <h2 className="avatar-tienda-titulo">Tienda de Avatares</h2>
            {items.length > 0 ? (
              <div className="avatar-tienda-grid">
                {[...items].sort((a, b) => (a.level ?? 0) - (b.level ?? 0)).map((item) => (
                  <div key={item.id} className={`avatar-tienda-card ${item.ya_comprado ? 'avatar-tienda-card-comprado' : ''}`}>
                    <div className="avatar-tienda-imagen">
                      {item.image_url ? (
                        <img src={item.image_url} alt={item.name} />
                      ) : (
                        <div className="avatar-tienda-placeholder">🎭</div>
                      )}
                      {item.ya_comprado && <span className="avatar-tienda-badge">✓ Adquirido</span>}
                    </div>
                    <h3 className="avatar-tienda-nombre">{item.name}</h3>
                    <p className="avatar-tienda-descripcion">{item.description || '—'}</p>
                    <p className="avatar-tienda-nivel">Nivel {item.level != null ? String(item.level).padStart(2, '0') : '00'}</p>
                    <p className="avatar-tienda-precio">⭐ {item.price ?? 0} estrellas</p>
                    <button
                      type="button"
                      className={`avatar-tienda-btn ${item.ya_comprado ? 'avatar-tienda-btn-comprado' : item.puede_comprar ? 'avatar-tienda-btn-comprar' : 'avatar-tienda-btn-bloqueado'}`}
                      onClick={() => handleComprar(item)}
                      disabled={item.ya_comprado || !item.puede_comprar || comprando === item.id}
                    >
                      {item.ya_comprado ? 'Adquirido' : item.puede_comprar ? (comprando === item.id ? 'Procesando...' : 'Comprar') : `Necesitas ${item.price ?? 0} ⭐`}
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="avatar-tienda-vacio">No hay avatares disponibles.</p>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}

export default AlumnoAvatar;
