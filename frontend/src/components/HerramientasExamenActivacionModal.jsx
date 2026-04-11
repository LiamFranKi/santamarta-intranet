import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { HEX_ADMIN_BASE, HEX_DOCENTE_BASE, HEX_ROOT } from '../pages/herramientas/hexExamenesPaths';
import './EncuestaActivacionModal.css';

/**
 * Aviso modal por examen de herramientas activo (tras encuestas si aplica).
 * Backend: herramientas_examenes_modal_visto.
 */
function HerramientasExamenActivacionModal() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [examen, setExamen] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const path = location.pathname || '';
    const enRealizar =
      path.includes('/herramientas-examenes/realizar') ||
      path.includes(`${HEX_DOCENTE_BASE}/realizar`) ||
      path.includes(`${HEX_ADMIN_BASE}/realizar`);
    if (path.startsWith('/login') || enRealizar) {
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    const t = setTimeout(() => {
      (async () => {
        try {
          const { data: encData } = await api.get('/encuestas/modal-pendiente');
          if (cancelled) return;
          if (encData?.encuesta?.id) {
            setExamen(null);
            return;
          }
          const { data } = await api.get('/herramientas-examenes/modal-pendiente');
          if (cancelled) return;
          if (data?.examen?.id) setExamen(data.examen);
        } catch {
          if (!cancelled) setExamen(null);
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    }, 500);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [location.pathname]);

  const marcarVisto = async (id) => {
    try {
      await api.post(`/herramientas-examenes/modal-visto/${id}`);
    } catch {
      /* silencioso */
    }
  };

  const irExamen = async () => {
    if (!examen?.id) return;
    await marcarVisto(examen.id);
    setExamen(null);
    const tipo = user?.tipo;
    const base =
      tipo === 'DOCENTE'
        ? HEX_DOCENTE_BASE
        : tipo === 'ADMINISTRADOR' || tipo === 'PROMOTORIA'
          ? HEX_ADMIN_BASE
          : HEX_ROOT;
    navigate(`${base}/realizar/${examen.id}`);
  };

  const masTarde = async () => {
    if (!examen?.id) return;
    await marcarVisto(examen.id);
    setExamen(null);
  };

  if (loading || !examen) return null;

  return createPortal(
    <div
      className="encuesta-promo-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="hex-promo-title"
      onClick={masTarde}
    >
      <div className="encuesta-promo-modal" onClick={(e) => e.stopPropagation()} role="document">
        <div className="encuesta-promo-modal__hero">
          <span className="encuesta-promo-modal__deco" aria-hidden>
            📝
          </span>
          <div className="encuesta-promo-modal__badge">Nuevo examen</div>
          <h2 id="hex-promo-title" className="encuesta-promo-modal__title">
            {examen.titulo}
          </h2>
          {examen.descripcion ? (
            <p className="encuesta-promo-modal__desc">{examen.descripcion}</p>
          ) : (
            <p className="encuesta-promo-modal__desc">Tienes un examen pendiente asignado. Complétalo cuando puedas.</p>
          )}
        </div>
        <div className="encuesta-promo-modal__body">
          <p className="encuesta-promo-modal__hint">
            Entras con tu usuario de la intranet. Podrás ver tu resultado según la configuración del examen.
          </p>
          <div className="encuesta-promo-modal__actions">
            <button type="button" className="encuesta-promo-modal__btn-primary" onClick={irExamen}>
              Realizar examen
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

export default HerramientasExamenActivacionModal;
