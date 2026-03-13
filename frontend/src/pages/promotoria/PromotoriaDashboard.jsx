import React, { useState, useEffect } from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import api from '../../services/api';
import './PromotoriaDashboard.css';

function PromotoriaDashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/promotoria/dashboard')
      .then(res => setStats(res.data))
      .catch(() => setStats(null))
      .finally(() => setLoading(false));
  }, []);

  const moneda = stats?.moneda || 'S/';
  const anio = stats?.anio_activo ?? '—';
  const fmt = (n) => (n == null || n === '' ? '—' : typeof n === 'number' ? n.toLocaleString('es-PE', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : String(n));
  const fmtMonto = (n) => (n == null || n === '' ? '—' : `${moneda} ${parseFloat(n).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

  const kpis = [
    { key: 'ingresos', title: 'Total Ingresos', subtitle: `Año ${anio}`, icon: '💰', value: loading ? '—' : fmtMonto(stats?.total_ingresos), accent: 'ingresos' },
    { key: 'presupuesto', title: 'Presupuesto Anual', subtitle: `Año ${anio}`, icon: '📋', value: loading ? '—' : fmtMonto(stats?.presupuesto_anual), accent: 'presupuesto' },
    { key: 'deuda', title: 'Total Deuda', subtitle: `Año ${anio}`, icon: '⚠️', value: loading ? '—' : fmtMonto(stats?.total_deuda), accent: 'deuda' },
    { key: 'alumnos', title: 'Alumnos Matriculados', subtitle: 'Con matrícula pagada', icon: '👨‍🎓', value: loading ? '—' : fmt(stats?.total_alumnos), accent: 'alumnos' },
    { key: 'sin_pagar', title: 'Matriculados Sin Pagar', subtitle: 'Inscritos, matrícula pendiente', icon: '📌', value: loading ? '—' : fmt(stats?.matriculados_sin_pagar), accent: 'sinpagar' },
    { key: 'trabajadores', title: 'Personal', subtitle: 'Total trabajadores', icon: '👥', value: loading ? '—' : fmt(stats?.total_trabajadores), accent: 'trabajadores' },
    { key: 'apoderados', title: 'Apoderados', subtitle: 'De alumnos pagados', icon: '👨‍👩‍👧‍👦', value: loading ? '—' : fmt(stats?.total_apoderados), accent: 'apoderados' },
    { key: 'grados', title: 'Grados', subtitle: `Año ${anio}`, icon: '📚', value: loading ? '—' : fmt(stats?.total_grados), accent: 'grados' },
  ];

  const ingresosPorMes = stats?.ingresos_por_mes || [];
  const maxIngreso = ingresosPorMes.length ? Math.max(...ingresosPorMes.map(m => parseFloat(m.total || 0))) : 1;

  const alumnosPorNivel = stats?.alumnos_por_nivel || [];
  const maxNivel = alumnosPorNivel.length ? Math.max(...alumnosPorNivel.map(n => n.total)) : 1;

  return (
    <DashboardLayout>
      <div className="promotoria-dashboard">
        <header className="promotoria-header">
          <h1 className="promotoria-title">Panel de Promotoría</h1>
          <p className="promotoria-subtitle">Vista financiera y estadísticas — Año {anio}</p>
        </header>

        <section className="promotoria-kpis">
          {kpis.map((kpi) => (
            <div key={kpi.key} className={`promotoria-kpi-card promotoria-kpi-${kpi.accent}`}>
              <div className="promotoria-kpi-icon">{kpi.icon}</div>
              <div className="promotoria-kpi-content">
                <span className="promotoria-kpi-subtitle">{kpi.subtitle}</span>
                <h3 className="promotoria-kpi-title">{kpi.title}</h3>
                <div className="promotoria-kpi-value">{kpi.value}</div>
              </div>
            </div>
          ))}
        </section>

        <section className="promotoria-charts">
          <div className="promotoria-chart-card">
            <h3 className="promotoria-chart-title">Ingresos por mes</h3>
            {loading ? (
              <div className="promotoria-chart-loading">Cargando...</div>
            ) : ingresosPorMes.length === 0 ? (
              <div className="promotoria-chart-empty">Sin datos de ingresos</div>
            ) : (
              <div className="promotoria-bars">
                {ingresosPorMes.map((item) => {
                  const pct = maxIngreso > 0 ? (parseFloat(item.total || 0) / maxIngreso) * 100 : 0;
                  return (
                    <div key={item.mes} className="promotoria-bar-row">
                      <span className="promotoria-bar-label">{item.mes}</span>
                      <div className="promotoria-bar-track">
                        <div className="promotoria-bar-fill" style={{ width: `${Math.min(100, pct)}%` }} />
                      </div>
                      <span className="promotoria-bar-value">{fmtMonto(parseFloat(item.total || 0))}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="promotoria-chart-card">
            <h3 className="promotoria-chart-title">Alumnos por nivel</h3>
            {loading ? (
              <div className="promotoria-chart-loading">Cargando...</div>
            ) : alumnosPorNivel.length === 0 ? (
              <div className="promotoria-chart-empty">Sin datos por nivel</div>
            ) : (
              <div className="promotoria-bars">
                {alumnosPorNivel.map((item) => {
                  const pct = maxNivel > 0 ? (item.total / maxNivel) * 100 : 0;
                  return (
                    <div key={item.nombre} className="promotoria-bar-row">
                      <span className="promotoria-bar-label">{item.nombre}</span>
                      <div className="promotoria-bar-track">
                        <div className="promotoria-bar-fill promotoria-bar-fill-nivel" style={{ width: `${Math.min(100, pct)}%` }} />
                      </div>
                      <span className="promotoria-bar-value">{item.total}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <section className="promotoria-deudas">
          <div className="promotoria-deuda-card">
            <span className="promotoria-deuda-label">Deudas anteriores</span>
            <span className="promotoria-deuda-value">{loading ? '—' : fmtMonto(stats?.deudas_anteriores)}</span>
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
}

export default PromotoriaDashboard;
