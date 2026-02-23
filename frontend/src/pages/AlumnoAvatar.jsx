import React, { useState, useEffect } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import api from '../services/api';
import Swal from 'sweetalert2';
import './AlumnoAvatar.css';

function AlumnoAvatar() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [totalEstrellas, setTotalEstrellas] = useState(0);
  const [avatarActual, setAvatarActual] = useState(null);
  const [comprando, setComprando] = useState(null);

  const cargarTienda = async () => {
    try {
      setLoading(true);
      const res = await api.get('/alumno/avatares/tienda');
      setItems(res.data.items || []);
      setTotalEstrellas(res.data.total_estrellas || 0);
      setAvatarActual(res.data.avatar_actual || null);
    } catch (error) {
      console.error('Error cargando tienda:', error);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: error.response?.data?.error || 'No se pudo cargar la tienda de avatares'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarTienda();
  }, []);

  const handleComprar = async (item) => {
    if (item.ya_comprado || !item.puede_comprar) return;
    try {
      setComprando(item.id);
      await api.post(`/alumno/avatares/comprar/${item.id}`);
      await cargarTienda();
      Swal.fire({
        icon: 'success',
        title: '¡Avatar desbloqueado!',
        text: `Ya tienes "${item.name}"`,
        timer: 2000,
        showConfirmButton: false
      });
    } catch (error) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: error.response?.data?.error || 'No se pudo desbloquear el avatar'
      });
    } finally {
      setComprando(null);
    }
  };

  return (
    <DashboardLayout>
      <div className="alumno-avatar">
        <div className="avatar-page-header">
          <h1>Tienda de Avatares</h1>
          <p>Desbloquea avatares con las estrellas que ganaste en clase</p>
          <div className="avatar-estrellas-badge">
            <span className="avatar-estrellas-icon">⭐</span>
            <span className="avatar-estrellas-count">{totalEstrellas}</span>
            <span className="avatar-estrellas-label">estrellas</span>
          </div>
        </div>

        {loading ? (
          <div className="avatar-loading">
            <div className="avatar-loading-spinner"></div>
            <p>Cargando tienda...</p>
          </div>
        ) : items.length === 0 ? (
          <div className="avatar-placeholder">
            <div className="avatar-icon">🎭</div>
            <p>No hay avatares disponibles en este momento</p>
          </div>
        ) : (
          <div className="avatar-tienda-grid">
            {items.map((item) => (
              <div
                key={item.id}
                className={`avatar-card ${item.ya_comprado ? 'avatar-card-owned' : ''} ${item.puede_comprar && !item.ya_comprado ? 'avatar-card-can-buy' : ''}`}
              >
                <div className="avatar-card-image">
                  {item.image_url ? (
                    <img src={item.image_url} alt={item.name} />
                  ) : (
                    <div className="avatar-card-placeholder">🎭</div>
                  )}
                  {item.ya_comprado && (
                    <span className="avatar-card-badge">✓ Tu avatar</span>
                  )}
                  {item.price === 0 && !item.ya_comprado && (
                    <span className="avatar-card-badge-free">Gratis</span>
                  )}
                </div>
                <div className="avatar-card-body">
                  <h3>{item.name}</h3>
                  {item.description && <p>{item.description}</p>}
                  <div className="avatar-card-price">
                    {item.price === 0 ? (
                      <span>0 estrellas</span>
                    ) : (
                      <span>⭐ {item.price} estrellas</span>
                    )}
                  </div>
                  <button
                    type="button"
                    className={`btn-avatar-comprar ${item.ya_comprado ? 'btn-avatar-owned' : item.puede_comprar ? 'btn-avatar-can-buy' : 'btn-avatar-locked'}`}
                    onClick={() => handleComprar(item)}
                    disabled={item.ya_comprado || !item.puede_comprar || comprando === item.id}
                  >
                    {item.ya_comprado
                      ? 'Adquirido'
                      : item.puede_comprar
                        ? comprando === item.id ? 'Procesando...' : 'Desbloquear'
                        : `Necesitas ${item.price} ⭐`}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

export default AlumnoAvatar;
