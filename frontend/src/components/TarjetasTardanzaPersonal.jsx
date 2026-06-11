import React, { useEffect, useState } from 'react';
import api from '../services/api';
import '../pages/DocenteDashboard.css';

const coloresPasteles = [
  'linear-gradient(135deg, #fff8e1 0%, #ffecb3 100%)',
  'linear-gradient(135deg, #f3e5f5 0%, #e1bee7 100%)',
];

function TarjetasTardanzaPersonal({ onAbrirDetalle }) {
  const [datos, setDatos] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get('/personal/tardanzas/mi-mes')
      .then((res) => {
        if (!cancelled) setDatos(res.data);
      })
      .catch(() => {
        if (!cancelled) setDatos({ tiene_personal: false });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading || !datos?.tiene_personal) return null;

  const mesNombre = datos.mes_nombre || 'este mes';
  const minutos = datos.minutos_tardanza || 0;
  const descuento = datos.descuento || 0;
  const fmtSoles = new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency: 'PEN',
    minimumFractionDigits: 2,
  }).format(descuento);

  const abrir = () => {
    if (typeof onAbrirDetalle === 'function') {
      onAbrirDetalle();
      return;
    }
    window.dispatchEvent(new CustomEvent('vanguard:abrir-asistencias'));
  };

  return (
    <div className="stats-grid" style={{ marginBottom: '1rem' }}>
      <div
        className="stat-card mundo-card stat-card-clickable"
        style={{ background: coloresPasteles[0], cursor: 'pointer' }}
        role="button"
        tabIndex={0}
        title="Ver detalle de mis asistencias"
        onClick={abrir}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            abrir();
          }
        }}
      >
        <div className="stat-icon">⏰</div>
        <div className="stat-content">
          <div className="stat-number">{minutos}</div>
          <div className="stat-label">Tardanzas de {mesNombre} (min)</div>
        </div>
      </div>

      <div
        className="stat-card mundo-card stat-card-clickable"
        style={{ background: coloresPasteles[1], cursor: 'pointer' }}
        role="button"
        tabIndex={0}
        title="Ver detalle de mis asistencias"
        onClick={abrir}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            abrir();
          }
        }}
      >
        <div className="stat-icon">💰</div>
        <div className="stat-content">
          <div className="stat-number">{fmtSoles}</div>
          <div className="stat-label">Descuento de {mesNombre}</div>
        </div>
      </div>
    </div>
  );
}

export default TarjetasTardanzaPersonal;
