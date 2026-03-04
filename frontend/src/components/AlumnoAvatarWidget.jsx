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
        // Preferir sistema por bimestre (avatar + accesorios por bimestre/género)
        const resBimestre = await api.get('/alumno/avatares-bimestre/resumen').catch(() => null);
        if (resBimestre?.data?.avatar_imagen_url != null) {
          setAvatar({
            image_url: resBimestre.data.avatar_imagen_url,
            name: resBimestre.data.avatar_base?.nombre || 'Mi avatar',
            description: resBimestre.data.mensaje || '',
            level: null
          });
          setTotalEstrellas(resBimestre.data.total_estrellas ?? 0);
          setLoading(false);
          return;
        }
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
      aria-label="Ver mi avatar y desbloquear accesorios"
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
          {avatar?.description ? (
            <p className="alumno-avatar-widget-descripcion">{avatar.description}</p>
          ) : null}
          <div className="alumno-avatar-widget-estrellas-wrap">
            <span className="alumno-avatar-widget-estrellas-icon">⭐</span>
            <span className="alumno-avatar-widget-estrellas-num">{totalEstrellas}</span>
            <span className="alumno-avatar-widget-estrellas-label">estrellas</span>
          </div>
          <span className="alumno-avatar-widget-cta">Toca para personalizar →</span>
        </div>
      </div>
    </div>
  );
}

export default AlumnoAvatarWidget;
