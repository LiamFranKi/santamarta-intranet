import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import './AlumnoAvatarWidget.css';

function AlumnoAvatarWidget() {
  const navigate = useNavigate();
  const [avatar, setAvatar] = useState(null);
  const [totalEstrellas, setTotalEstrellas] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const cargar = async () => {
      try {
        const res = await api.get('/alumno/avatares/resumen');
        setAvatar(res.data.avatar_actual);
        setTotalEstrellas(res.data.total_estrellas || 0);
      } catch {
        setAvatar(null);
        setTotalEstrellas(0);
      } finally {
        setLoading(false);
      }
    };
    cargar();
  }, []);

  if (loading) return null;

  return (
    <div
      className="alumno-avatar-widget"
      onClick={() => navigate('/alumno/avatar')}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && navigate('/alumno/avatar')}
    >
      <div className="alumno-avatar-widget-inner">
        <div className="alumno-avatar-widget-imagen">
          {avatar?.image_url ? (
            <img src={avatar.image_url} alt={avatar.name || 'Mi avatar'} />
          ) : (
            <div className="alumno-avatar-widget-placeholder">🎭</div>
          )}
        </div>
        <div className="alumno-avatar-widget-info">
          <p className="alumno-avatar-widget-nombre">{avatar ? avatar.name : 'Mi Avatar'}</p>
          <p className="alumno-avatar-widget-descripcion">{avatar?.description || '—'}</p>
          <p className="alumno-avatar-widget-nivel">Nivel {avatar?.level != null ? String(avatar.level).padStart(2, '0') : '00'}</p>
          <p className="alumno-avatar-widget-estrellas">⭐ {totalEstrellas} estrellas</p>
        </div>
      </div>
    </div>
  );
}

export default AlumnoAvatarWidget;
