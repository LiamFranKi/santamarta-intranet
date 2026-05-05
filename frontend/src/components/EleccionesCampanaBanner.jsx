import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import './EleccionesCampanaBanner.css';

/**
 * CTA en dashboards: solo se muestra si hay procesos en campaña / votación / cerrados.
 */
export default function EleccionesCampanaBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get('/elecciones/portal/procesos');
        const n = (data?.procesos || []).length;
        if (!cancelled) setVisible(n > 0);
      } catch {
        if (!cancelled) setVisible(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!visible) return null;

  return (
    <Link to="/elecciones-campana" className="elcc-dash-banner">
      <span className="elcc-dash-banner-icon" aria-hidden>
        🗳️
      </span>
      <span className="elcc-dash-banner-text">
        <strong>Elecciones escolares</strong>
        <span>Entra a la jornada electoral (campañas y votación)</span>
      </span>
      <span className="elcc-dash-banner-go">Abrir →</span>
    </Link>
  );
}
