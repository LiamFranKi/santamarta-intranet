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
  const [error, setError] = useState(null);

  const cargarTienda = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get('/alumno/avatares/tienda');
      setItems(res.data.items || []);
      setTotalEstrellas(res.data.total_estrellas || 0);
      setAvatarActual(res.data.avatar_actual || null);
    } catch (err) {
      console.error('Error cargando tienda:', err);
      const msg = err.response?.data?.error || err.message || 'No se pudo cargar la tienda de avatares';
      setError(msg);
      setItems([]);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: msg
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
        {/* Sección superior: Avatar actual + Estrellas */}
        <div className="avatar-seccion-actual">
          <div className="avatar-actual-container">
            {avatarActual?.image_url ? (
              <img src={avatarActual.image_url} alt={avatarActual.name || 'Mi avatar'} className="avatar-actual-imagen" />
            ) : (
              <div className="avatar-actual-placeholder">🎭</div>
            )}
          </div>
          <p className="avatar-actual-nombre">{avatarActual ? avatarActual.name : 'Sin avatar'}</p>
          <div className="avatar-actual-estrellas">
            <span className="avatar-actual-estrellas-icon">⭐</span>
            <span className="avatar-actual-estrellas-count">{totalEstrellas}</span>
            <span>estrellas</span>
          </div>
        </div>

        <h2 className="avatar-tienda-titulo">Tienda de Avatares</h2>

        {loading ? (
          <div className="avatar-loading">
            <div className="avatar-loading-spinner"></div>
            <p>Cargando tienda...</p>
          </div>
        ) : error ? (
          <div className="avatar-placeholder avatar-error">
            <div className="avatar-icon">⚠️</div>
            <p>{error}</p>
            <button type="button" className="btn-reintentar" onClick={cargarTienda}>
              Reintentar
            </button>
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
                <div className="avatar-card-imagen">
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
                <h3 className="avatar-card-nombre">{item.name}</h3>
                {item.description && <p className="avatar-card-descripcion">{item.description}</p>}
                <div className="avatar-card-precio">⭐ {item.price} estrellas</div>
                <button
                  type="button"
                  className={`btn-avatar-comprar ${item.ya_comprado ? 'btn-avatar-owned' : item.puede_comprar ? 'btn-avatar-can-buy' : 'btn-avatar-locked'}`}
                  onClick={() => handleComprar(item)}
                  disabled={item.ya_comprado || !item.puede_comprar || comprando === item.id}
                >
                  {item.ya_comprado
                    ? 'Adquirido'
                    : item.puede_comprar
                      ? comprando === item.id ? 'Procesando...' : 'Escoger'
                      : `Necesitas ${item.price} ⭐`}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

export default AlumnoAvatar;
