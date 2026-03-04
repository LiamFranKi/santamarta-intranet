import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useAvatarWidget } from '../context/AvatarWidgetContext';
import './AlumnoAvatarWidget.css';

function AlumnoAvatarWidget() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { avatarWidget: ctxAvatar } = useAvatarWidget();
  const [avatar, setAvatar] = useState(null);
  const [totalEstrellas, setTotalEstrellas] = useState(0);
  const [loading, setLoading] = useState(true);
  const usamosContexto = useRef(false);

  useEffect(() => {
    if (ctxAvatar?.nombre && ctxAvatar?.imagen_url) {
      usamosContexto.current = true;
      let imgUrl = ctxAvatar.imagen_url || '';
      if (imgUrl.startsWith('http:') && window.location.protocol === 'https:') imgUrl = imgUrl.replace(/^http:/, 'https:');
      setAvatar({
        image_url: imgUrl,
        name: ctxAvatar.nombre,
        description: String(ctxAvatar.descripcion || '').trim(),
        level: null
      });
      setTotalEstrellas(ctxAvatar.total_estrellas ?? 0);
      setLoading(false);
      return;
    }
    const cargar = async () => {
      if (usamosContexto.current) return;
      try {
        // Preferir sistema por bimestre (avatar + accesorios por bimestre/género)
        const resBimestre = await api.get('/alumno/avatares-bimestre/resumen').catch(() => null);
        if (resBimestre?.data?.avatar_imagen_url != null && !usamosContexto.current) {
          let base = resBimestre.data.avatar_base || {};
          let desc = String(base.descripcion ?? base.description ?? '').trim();
          if (!desc && base.id) {
            const resBases = await api.get('/alumno/avatares-bimestre/bases', { params: { bimestre: base.bimestre ?? 1 } }).catch(() => null);
            const full = resBases?.data?.bases?.find((b) => b.id === base.id);
            if (full) desc = String(full.descripcion ?? full.Descripcion ?? full.description ?? '').trim();
          }
          let imgUrl = resBimestre.data.avatar_imagen_url || '';
          if (imgUrl.startsWith('http:') && window.location.protocol === 'https:') imgUrl = imgUrl.replace(/^http:/, 'https:');
          if (!usamosContexto.current) {
            setAvatar({
              image_url: imgUrl,
              name: base.nombre || 'Mi avatar',
              description: desc,
              level: base.bimestre ?? null
            });
            setTotalEstrellas(resBimestre.data.total_estrellas ?? 0);
          }
          setLoading(false);
          return;
        }
        const res = await api.get('/alumno/avatares/resumen');
        if (!usamosContexto.current) {
          setAvatar(res.data.avatar_actual);
          setTotalEstrellas(res.data.total_estrellas || 0);
        }
      } catch {
        if (!usamosContexto.current) setAvatar(null);
        if (!usamosContexto.current) setTotalEstrellas(0);
      } finally {
        setLoading(false);
      }
    };
    cargar();
  }, [ctxAvatar]);

  if (loading) return null;
  const esFemenino = user?.sexo === 1 || user?.sexo === '1';

  return (
    <div
      className={`alumno-avatar-widget ${esFemenino ? 'alumno-avatar-widget-femenino' : 'alumno-avatar-widget-masculino'}`}
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
        </div>
      </div>
    </div>
  );
}

export default AlumnoAvatarWidget;
