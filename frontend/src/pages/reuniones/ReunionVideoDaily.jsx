import React, { useEffect, useState } from 'react';
import api from '../../services/api';
import VanguardRoomMarca from './VanguardRoomMarca';

export default function ReunionVideoDaily({ reunionId, dailyListo }) {
  const [embed, setEmbed] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setCargando(true);
      setError('');
      try {
        const { data } = await api.get(`/reuniones/${reunionId}/video-token`);
        if (!cancel) setEmbed(data.embed || '');
      } catch (e) {
        if (!cancel) setError(e.response?.data?.error || 'No se pudo abrir la sala de video.');
      } finally {
        if (!cancel) setCargando(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [reunionId]);

  if (cargando) {
    return (
      <div className="re-video-box re-video-empty">
        <VanguardRoomMarca invert compact />
        <p>Conectando la sala de reuniones…</p>
      </div>
    );
  }
  if (error || !embed) {
    return (
      <div className="re-video-box re-video-empty">
        <VanguardRoomMarca invert compact />
        <p>{error || 'La sala aún no está lista.'}</p>
        {!dailyListo ? (
          <p className="re-hint">Cuando Daily esté configurado en el servidor, la videollamada aparece aquí.</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="re-video-box">
      <iframe
        title="Sala de reuniones"
        src={embed}
        allow="camera; microphone; fullscreen; display-capture; autoplay"
        allowFullScreen
      />
    </div>
  );
}
