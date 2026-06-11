import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import '../pages/DocenteDashboard.css';

const coloresPasteles = [
  'linear-gradient(135deg, #fff8e1 0%, #ffecb3 100%)',
  'linear-gradient(135deg, #f3e5f5 0%, #e1bee7 100%)',
];

function TarjetasTardanzaAdminColegio() {
  const navigate = useNavigate();
  const [datos, setDatos] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get('/admin/tardanzas/resumen-mes')
      .then((res) => {
        if (!cancelled) setDatos(res.data);
      })
      .catch(() => {
        if (!cancelled) {
          const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
          const ahora = new Date();
          setDatos({
            mes_nombre: meses[ahora.getMonth()] || 'este mes',
            minutos_tardanza: 0,
            descuento: 0,
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="stats-grid" style={{ marginBottom: '1rem' }}>
        <div className="stat-card mundo-card" style={{ background: coloresPasteles[0], opacity: 0.7 }}>
          <div className="stat-icon">⏰</div>
          <div className="stat-content">
            <div className="stat-number">—</div>
            <div className="stat-label">Tardanzas del personal</div>
          </div>
        </div>
        <div className="stat-card mundo-card" style={{ background: coloresPasteles[1], opacity: 0.7 }}>
          <div className="stat-icon">💰</div>
          <div className="stat-content">
            <div className="stat-number">—</div>
            <div className="stat-label">Descuento del personal</div>
          </div>
        </div>
      </div>
    );
  }

  if (!datos) return null;

  const mesNombre = datos.mes_nombre || 'este mes';
  const minutos = datos.minutos_tardanza || 0;
  const descuento = datos.descuento || 0;
  const fmtSoles = new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency: 'PEN',
    minimumFractionDigits: 2,
  }).format(descuento);

  const abrir = () => navigate('/admin/herramientas/tardanzas');

  return (
    <div className="stats-grid" style={{ marginBottom: '1rem' }}>
      <div
        className="stat-card mundo-card stat-card-clickable"
        style={{ background: coloresPasteles[0], cursor: 'pointer' }}
        role="button"
        tabIndex={0}
        title="Ver tardanzas del personal"
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
          <div className="stat-label">Tardanzas del personal · {mesNombre} (min)</div>
        </div>
      </div>

      <div
        className="stat-card mundo-card stat-card-clickable"
        style={{ background: coloresPasteles[1], cursor: 'pointer' }}
        role="button"
        tabIndex={0}
        title="Ver tardanzas del personal"
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
          <div className="stat-label">Descuento del personal · {mesNombre}</div>
        </div>
      </div>
    </div>
  );
}

export default TarjetasTardanzaAdminColegio;
