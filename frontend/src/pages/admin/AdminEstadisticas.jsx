import React, { useState, useEffect } from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import api from '../../services/api';
import './Dashboard.css';
import './AdminEstadisticas.css';

const coloresPasteles = [
  'linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%)',
  'linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%)',
  'linear-gradient(135deg, #fff3e0 0%, #ffe0b2 100%)',
  'linear-gradient(135deg, #fce4ec 0%, #f8bbd9 100%)',
  'linear-gradient(135deg, #f3e5f5 0%, #e1bee7 100%)',
  'linear-gradient(135deg, #ffebee 0%, #ffcdd2 100%)',
];

function fmtMonto(val, moneda = 'S/') {
  if (val == null || val === '' || isNaN(Number(val))) return '—';
  return `${moneda} ${parseFloat(val).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtNum(val) {
  if (val == null || val === '' || isNaN(Number(val))) return '—';
  return Number(val).toLocaleString('es-PE', { maximumFractionDigits: 0 });
}

/**
 * Página de Estadísticas (pagos / pensiones) para el administrador.
 * Paso 2: KPIs desde API /admin/estadisticas/kpis
 */
function AdminEstadisticas() {
  const [kpis, setKpis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get('/admin/estadisticas/kpis')
      .then((res) => setKpis(res.data))
      .catch((err) => setError(err.response?.data?.error || 'Error al cargar KPIs'))
      .finally(() => setLoading(false));
  }, []);

  const cards = kpis
    ? [
        { key: 'total_cobrado', title: 'Total cobrado', subtitle: `Año ${kpis.anio}`, icon: '💰', value: fmtMonto(kpis.total_cobrado, kpis.moneda), color: coloresPasteles[0] },
        { key: 'presupuesto', title: 'Presupuesto anual', subtitle: `Año ${kpis.anio}`, icon: '📋', value: fmtMonto(kpis.presupuesto_anual, kpis.moneda), color: coloresPasteles[1] },
        { key: 'total_deuda', title: 'Total deuda', subtitle: `Año ${kpis.anio}`, icon: '⚠️', value: fmtMonto(kpis.total_deuda, kpis.moneda), color: coloresPasteles[5] },
        { key: 'alumnos_total', title: 'Alumnos (matrícula pagada)', subtitle: `Año ${kpis.anio}`, icon: '👨‍🎓', value: fmtNum(kpis.alumnos_total), color: coloresPasteles[2] },
        { key: 'alumnos_al_dia', title: 'Alumnos al día', subtitle: 'Sin deuda', icon: '✅', value: fmtNum(kpis.alumnos_al_dia), color: coloresPasteles[0] },
        { key: 'deudores', title: 'Deudores', subtitle: 'Con deuda pendiente', icon: '📉', value: fmtNum(kpis.cantidad_deudores), color: coloresPasteles[4] },
      ]
    : [];

  return (
    <DashboardLayout>
      <div className="admin-estadisticas">
        <div className="admin-estadisticas-header">
          <h1 className="admin-estadisticas-title">📈 Estadísticas</h1>
          <p className="admin-estadisticas-desc">
            Estadísticas de pagos y pensiones. Resumen por año (solo alumnos con matrícula pagada).
          </p>
        </div>
        {error && (
          <div className="admin-estadisticas-error">
            {error}
          </div>
        )}
        {loading ? (
          <div className="admin-estadisticas-content">
            <p className="admin-estadisticas-placeholder">Cargando KPIs...</p>
          </div>
        ) : kpis && cards.length > 0 ? (
          <div className="admin-stats-grid admin-estadisticas-grid">
            {cards.map((card) => (
              <div key={card.key} className="admin-stat-card" style={{ background: card.color }}>
                <div className="admin-stat-icon">{card.icon}</div>
                <div className="admin-stat-content">
                  <h3 className="admin-stat-title">{card.title}</h3>
                  {card.subtitle && <span className="admin-stat-subtitle">{card.subtitle}</span>}
                  <div className="admin-stat-value">{card.value}</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="admin-estadisticas-content">
            <p className="admin-estadisticas-placeholder">No hay datos de KPIs disponibles.</p>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

export default AdminEstadisticas;
