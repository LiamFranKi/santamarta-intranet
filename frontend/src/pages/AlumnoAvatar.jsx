import React, { useState, useEffect } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import api from '../services/api';
import Swal from 'sweetalert2';
import './AlumnoAvatar.css';

function AlumnoAvatar() {
  const [loading, setLoading] = useState(true);
  const [avatarActual, setAvatarActual] = useState(null);
  const [items, setItems] = useState([]);
  const [totalEstrellas, setTotalEstrellas] = useState(0);
  const [comprando, setComprando] = useState(null);
  const [error, setError] = useState(null);

  const cargar = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get('/alumno/avatares/tienda');
      setAvatarActual(res.data.avatar_actual || null);
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

  return (
    <DashboardLayout>
      <div className="avatar-pagina">
        <h1 className="avatar-titulo-principal">Tu Avatar</h1>
        <div className="avatar-tarjeta-centro">
          <div className="avatar-tarjeta-contenido">
            <div className="avatar-imagen-container">
              {avatarActual?.image_url ? (
                <img src={avatarActual.image_url} alt={avatar.name || 'Avatar'} />
              ) : (
                <div className="avatar-imagen-placeholder">🎭</div>
              )}
              <div className="avatar-nivel-badge">Nivel {nivel}</div>
            </div>
            <div className="avatar-info">
              <h2 className="avatar-nombre">{avatar.name}</h2>
              <p className="avatar-descripcion">{descripcion}</p>
              <p className="avatar-nivel">Nivel {nivel}</p>
              <div className="avatar-precio">
                <span className="avatar-precio-label">Precio:</span>{' '}
                {precio === 0 ? 'Gratis' : `${precio} estrellas`}
              </div>
              <div className="avatar-estrellas">
                <span className="avatar-estrellas-label">Tus estrellas:</span>{' '}
                <strong>{totalEstrellas}</strong>
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
      </div>
    </DashboardLayout>
  );
}

export default AlumnoAvatar;
