import React, { useState, useEffect } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import api from '../services/api';
import Swal from 'sweetalert2';
import './AlumnoAvatar.css';

function AlumnoAvatar() {
  const [loading, setLoading] = useState(true);
  const [avatarActual, setAvatarActual] = useState(null);
  const [totalEstrellas, setTotalEstrellas] = useState(0);
  const [error, setError] = useState(null);

  useEffect(() => {
    const cargar = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await api.get('/alumno/avatares/tienda');
        setAvatarActual(res.data.avatar_actual || null);
        setTotalEstrellas(res.data.total_estrellas || 0);
      } catch (err) {
        console.error('Error cargando avatar:', err);
        setError(err.response?.data?.error || err.message || 'No se pudo cargar');
        Swal.fire({ icon: 'error', title: 'Error', text: err.response?.data?.error || err.message });
      } finally {
        setLoading(false);
      }
    };
    cargar();
  }, []);

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
            <button type="button" className="avatar-btn-reintentar" onClick={() => window.location.reload()}>
              Reintentar
            </button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const avatar = avatarActual || { name: 'Sin avatar', description: 'Aún no tienes un avatar asignado', price: 0 };

  return (
    <DashboardLayout>
      <div className="avatar-pagina">
        <div className="avatar-tarjeta-centro">
          <div className="avatar-tarjeta-contenido">
            <div className="avatar-imagen-container">
              {avatarActual?.image_url ? (
                <img src={avatarActual.image_url} alt={avatar.name || 'Avatar'} />
              ) : (
                <div className="avatar-imagen-placeholder">🎭</div>
              )}
            </div>
            <div className="avatar-info">
              <h1 className="avatar-nombre">{avatar.name}</h1>
              <p className="avatar-descripcion">{avatar.description || '—'}</p>
              <p className="avatar-precio">
                <span className="avatar-precio-label">Precio:</span>{' '}
                {avatar.price === 0 ? 'Gratis' : `${avatar.price} estrellas`}
              </p>
              <p className="avatar-estrellas">
                <span className="avatar-estrellas-label">Tus estrellas:</span>{' '}
                <strong>{totalEstrellas}</strong>
              </p>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

export default AlumnoAvatar;
