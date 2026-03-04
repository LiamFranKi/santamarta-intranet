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
  const descripcionBase = (avatarBase?.descripcion || '').trim();
  const historiaBase = (avatarBase?.historia || '').trim();

  return (
    <DashboardLayout>
      <div className="avatar-pagina">
        {sistema === 'bimestre' ? (
          <>
            {/* Hero: avatar + nombre + estrellas */}
            <div className="avatar-hero">
              <div className="avatar-hero-bg" />
              <div className="avatar-hero-content">
                <span className="avatar-hero-bimestre">Bimestre {bimestre}</span>
                <div className="avatar-hero-imagen-wrap">
                  {imagenMostrar ? (
                    <img src={imagenMostrar} alt={nombreMostrar} className="avatar-hero-imagen" />
                  ) : (
                    <div className="avatar-hero-placeholder">🎭</div>
                  )}
                </div>
                <h1 className="avatar-hero-nombre">{nombreMostrar}</h1>
                <p className="avatar-hero-subtitle">Avatar del bimestre {bimestre}</p>
                {descripcionBase && <p className="avatar-hero-descripcion">{descripcionBase}</p>}
                {historiaBase && (
                  <blockquote className="avatar-hero-historia">{historiaBase}</blockquote>
                )}
                <div className="avatar-hero-estrellas">
                  <span className="avatar-hero-estrellas-icon">⭐</span>
                  <span className="avatar-hero-estrellas-num">{totalEstrellas}</span>
                  <span className="avatar-hero-estrellas-label">Tus estrellas</span>
                </div>
              </div>
            </div>

            {/* Accesorios */}
            <section className="avatar-accesorios-section">
              <h2 className="avatar-accesorios-titulo">Desbloquea accesorios</h2>
              <p className="avatar-accesorios-subtitulo">Gana estrellas con tu esfuerzo y personaliza tu avatar</p>
              <div className="avatar-bimestre-sin-accesorio">
                <button
                  type="button"
                  className={`avatar-btn-base ${accesorios.every(a => !a.equipado) ? 'avatar-btn-base-active' : ''}`}
                  onClick={handleEquiparSoloBase}
                  disabled={equipando === -1}
                >
                  {equipando === -1 ? '...' : '✨ Usar solo avatar (sin accesorio)'}
                </button>
              </div>
              {accesorios.length > 0 ? (
                <div className="avatar-accesorios-grid">
                  {accesorios.map((acc) => {
                    const puede = acc.puede_desbloquear;
                    const desbloqueado = acc.desbloqueado;
                    const equipado = acc.equipado;
                    const estrellasReq = acc.puntuacion_requerida ?? 0;
                    return (
                      <div key={acc.id} className={`avatar-acc-card ${desbloqueado ? 'avatar-acc-card-unlocked' : ''} ${equipado ? 'avatar-acc-card-equipped' : ''}`}>
                        <div className="avatar-acc-imagen">
                          {(acc.imagen_accesorio_url || acc.imagen_combinada_url) ? (
                            <img src={acc.imagen_accesorio_url || acc.imagen_combinada_url} alt={acc.nombre} />
                          ) : (
                            <div className="avatar-acc-placeholder">✨</div>
                          )}
                          {!desbloqueado && <div className="avatar-acc-lock" title={`Necesitas ${estrellasReq} estrellas`}>🔒</div>}
                          {equipado && <span className="avatar-acc-badge-equipado">Equipado</span>}
                          {desbloqueado && !equipado && <span className="avatar-acc-badge-listo">Listo</span>}
                        </div>
                        <h3 className="avatar-acc-nombre">{acc.nombre}</h3>
                        {acc.descripcion && <p className="avatar-acc-descripcion">{acc.descripcion}</p>}
                        <div className="avatar-acc-estrellas-req">
                          <span className="avatar-acc-estrellas-icon">⭐</span>
                          <span>{estrellasReq} estrellas</span>
                          {desbloqueado ? (
                            <span className="avatar-acc-check">✓</span>
                          ) : (
                            <span className={`avatar-acc-progress ${puede ? 'avatar-acc-progress-ok' : ''}`}>
                              {totalEstrellas}/{estrellasReq}
                            </span>
                          )}
                        </div>
                        <div className="avatar-acc-actions">
                          {!desbloqueado && (
                            <button
                              type="button"
                              className={`avatar-acc-btn ${puede ? 'avatar-acc-btn-unlock' : 'avatar-acc-btn-locked'}`}
                              onClick={() => handleDesbloquearBimestre(acc)}
                              disabled={!puede || comprando === acc.id}
                            >
                              {puede ? (comprando === acc.id ? '...' : 'Desbloquear') : `Faltan ${estrellasReq - totalEstrellas} ⭐`}
                            </button>
                          )}
                          {desbloqueado && (
                            <button
                              type="button"
                              className={`avatar-acc-btn avatar-acc-btn-equip ${equipado ? 'avatar-acc-btn-equipped' : ''}`}
                              onClick={() => handleEquiparBimestre(acc.id)}
                              disabled={equipado || equipando === acc.id}
                            >
                              {equipado ? '✓ Equipado' : equipando === acc.id ? '...' : 'Equipar'}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="avatar-tienda-vacio">No hay accesorios para este bimestre. ¡Vuelve pronto!</p>
              )}
            </section>
          </>
        ) : (
          <>
            <h1 className="avatar-titulo-principal">Tu Avatar</h1>
            <div className="avatar-tarjeta-centro">
              <div className="avatar-tarjeta-contenido">
                <div className="avatar-imagen-container">
                  {imagenMostrar ? (
                    <img src={imagenMostrar} alt={nombreMostrar} />
                  ) : (
                    <div className="avatar-imagen-placeholder">🎭</div>
                  )}
                  <div className="avatar-nivel-badge">Nivel {nivel}</div>
                </div>
                <div className="avatar-info">
                  <h2 className="avatar-nombre">{nombreMostrar}</h2>
                  <p className="avatar-descripcion">{descripcion}</p>
                  <p className="avatar-nivel">Nivel {nivel}</p>
                  <div className="avatar-precio">
                    <span className="avatar-precio-label">Precio:</span> {precio === 0 ? 'Gratis' : `${precio} estrellas`}
                  </div>
                  <div className="avatar-estrellas">
                    <span className="avatar-estrellas-label">Tus estrellas:</span> <strong>{totalEstrellas}</strong>
                  </div>
                </div>
              </div>
            </div>
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
