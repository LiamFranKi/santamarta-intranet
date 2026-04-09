import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../services/api';
import './EncuestaActivacionModal.css';

/**
 * Modal único por encuesta (backend: encuestas_modal_visto).
 * Se muestra al entrar al dashboard si hay una encuesta activa pendiente para el usuario.
 */
function EncuestaActivacionModal() {
  const navigate = useNavigate();
  const location = useLocation();
  const [encuesta, setEncuesta] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const path = location.pathname || '';
    if (path.startsWith('/login') || path.startsWith('/encuestas/responder')) {
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    const t = setTimeout(() => {
      (async () => {
        try {
          const { data } = await api.get('/encuestas/modal-pendiente');
          if (cancelled) return;
          if (data?.encuesta?.id) setEncuesta(data.encuesta);
        } catch {
          if (!cancelled) setEncuesta(null);
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [location.pathname]);

  const marcarVisto = async (id) => {
    try {
      await api.post(`/encuestas/modal-visto/${id}`);
    } catch {
      /* silencioso */
    }
  };

  const irEncuesta = async () => {
    if (!encuesta?.id) return;
    await marcarVisto(encuesta.id);
    setEncuesta(null);
    navigate(`/encuestas/responder/${encuesta.id}`);
  };

  const masTarde = async () => {
    if (!encuesta?.id) return;
    await marcarVisto(encuesta.id);
    setEncuesta(null);
  };

  if (loading || !encuesta) return null;

  return createPortal(
    <div
      className="encuesta-promo-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="encuesta-promo-title"
      onClick={masTarde}
    >
      <div className="encuesta-promo-modal" onClick={(e) => e.stopPropagation()} role="document">
        <div className="encuesta-promo-modal__hero">
          <span className="encuesta-promo-modal__deco" aria-hidden>
            📋
          </span>
          <div className="encuesta-promo-modal__badge">Nueva encuesta</div>
          <h2 id="encuesta-promo-title" className="encuesta-promo-modal__title">
            {encuesta.titulo}
          </h2>
          {encuesta.descripcion ? (
            <p className="encuesta-promo-modal__desc">{encuesta.descripcion}</p>
          ) : (
            <p className="encuesta-promo-modal__desc">Tu opinión nos importa. Solo te tomará unos minutos.</p>
          )}
        </div>
        <div className="encuesta-promo-modal__body">
          <p className="encuesta-promo-modal__hint">
            Respondes con tu usuario de la intranet — no hace falta escribir tu nombre ni grado.
          </p>
          <div className="encuesta-promo-modal__actions">
            <button type="button" className="encuesta-promo-modal__btn-primary" onClick={irEncuesta}>
              Responder ahora
            </button>
            <button type="button" className="encuesta-promo-modal__btn-secondary" onClick={masTarde}>
              Más tarde
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default EncuestaActivacionModal;
