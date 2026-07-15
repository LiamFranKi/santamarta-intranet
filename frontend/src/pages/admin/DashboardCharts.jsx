import React from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell
} from 'recharts';

const COLOR_PAGADO = '#059669';
const COLOR_SALDO = '#ef4444';
const COLOR_AL_DIA = '#0d9488';
const COLOR_DEUDORES = '#ea580c';
const COLORES_NIVEL = ['#1d4ed8', '#0d9488', '#7c3aed', '#ca8a04', '#db2777', '#0891b2'];

function fmtMontoTooltip(value, moneda) {
  if (value == null || Number.isNaN(value)) return '—';
  return `${moneda} ${Number(value).toLocaleString('es-PE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function TooltipMonto({ active, payload, label, moneda }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="admin-charts-tooltip">
      {label ? <div className="admin-charts-tooltip-label">{label}</div> : null}
      {payload.map((entry) => (
        <div key={entry.dataKey || entry.name} className="admin-charts-tooltip-row">
          <span style={{ color: entry.color || entry.fill }}>{entry.name}</span>
          <strong>{fmtMontoTooltip(entry.value, moneda)}</strong>
        </div>
      ))}
    </div>
  );
}

/**
 * Tres gráficos del dashboard admin (Recharts).
 * - Barras por concepto y torta anual: saldos del año (KPIs).
 * - Alumnos y barras por nivel: solo pensiones ya vencidas (hasta hoy).
 */
function DashboardCharts({ kpis, niveles, nivelesMeta, loadingNiveles, moneda = 'S/' }) {
  if (!kpis || !Array.isArray(kpis.conceptos) || kpis.conceptos.length === 0) {
    return null;
  }

  const dataConceptos = kpis.conceptos.map((row) => ({
    concepto: row.concepto,
    Pagado: Math.round((parseFloat(row.pagado) || 0) * 100) / 100,
    'Saldo pendiente': Math.round((parseFloat(row.deuda) || 0) * 100) / 100
  }));

  const totalPagado = parseFloat(kpis.total_cobrado) || 0;
  const totalSaldo = parseFloat(kpis.total_deuda) || 0;
  const dataComposicion = [
    { name: 'Pagado', value: Math.max(0, totalPagado), color: COLOR_PAGADO },
    { name: 'Saldo pendiente', value: Math.max(0, totalSaldo), color: COLOR_SALDO }
  ].filter((d) => d.value > 0);

  const alDia = parseInt(nivelesMeta?.alumnos_al_dia, 10) || 0;
  const deudores = parseInt(nivelesMeta?.cantidad_deudores, 10) || 0;
  const dataAlumnos = [
    { name: 'Al día', value: alDia, color: COLOR_AL_DIA },
    { name: 'Con deuda vencida', value: deudores, color: COLOR_DEUDORES }
  ].filter((d) => d.value > 0);

  const dataNiveles = (niveles || []).map((n) => ({
    nivel: n.nivel,
    'Saldo vencido': Math.round((parseFloat(n.saldo) || 0) * 100) / 100
  }));

  const tickMoney = (v) => {
    if (v >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
    if (v >= 1000) return `${Math.round(v / 1000)}k`;
    return String(Math.round(v));
  };

  return (
    <div className="admin-charts-section">
      <h2 className="admin-estadisticas-subtitle">Gráficos estadísticos</h2>
      <p className="admin-estadisticas-lead">
        Barras por concepto y torta de montos: año completo. Alumnos y saldo por nivel: solo pensiones
        cuya fecha de vencimiento ya pasó (hasta hoy; sin matrícula ni meses futuros).
      </p>

      <div className="admin-charts-grid">
        {/* 1) Pagado vs saldo por concepto / mes */}
        <div className="admin-charts-card admin-charts-card--wide">
          <h3 className="admin-charts-card-title">Pagado vs saldo pendiente por concepto</h3>
          <div className="admin-charts-body admin-charts-body--bar">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dataConceptos} margin={{ top: 8, right: 8, left: 4, bottom: 48 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="concepto"
                  tick={{ fontSize: 11, fill: '#4b5563' }}
                  interval={0}
                  angle={-28}
                  textAnchor="end"
                  height={56}
                />
                <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} tickFormatter={tickMoney} width={48} />
                <Tooltip content={<TooltipMonto moneda={moneda} />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Pagado" fill={COLOR_PAGADO} radius={[4, 4, 0, 0]} maxBarSize={28} />
                <Bar dataKey="Saldo pendiente" fill={COLOR_SALDO} radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 2) Composición financiera + alumnos */}
        <div className="admin-charts-card">
          <h3 className="admin-charts-card-title">Composición del año ({kpis.anio})</h3>
          <div className="admin-charts-pie-pair">
            <div className="admin-charts-body admin-charts-body--pie">
              {dataComposicion.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={dataComposicion}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={48}
                      outerRadius={78}
                      paddingAngle={2}
                    >
                      {dataComposicion.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<TooltipMonto moneda={moneda} />} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="admin-charts-empty">Sin montos para graficar</p>
              )}
            </div>
            <div className="admin-charts-body admin-charts-body--pie">
              <p className="admin-charts-pie-caption">Alumnos: al día vs con deuda vencida</p>
              {loadingNiveles ? (
                <p className="admin-charts-empty">Cargando…</p>
              ) : dataAlumnos.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={dataAlumnos}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={68}
                      paddingAngle={2}
                    >
                      {dataAlumnos.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value) => [
                        `${Number(value).toLocaleString('es-PE')} alumnos`,
                        ''
                      ]}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="admin-charts-empty">Sin alumnos</p>
              )}
            </div>
          </div>
        </div>

        {/* 3) Deuda vencida por nivel */}
        <div className="admin-charts-card">
          <h3 className="admin-charts-card-title">Saldo vencido por nivel</h3>
          <p className="admin-charts-pie-caption">Solo pensiones con fecha de vencimiento pasada</p>
          <div className="admin-charts-body admin-charts-body--bar">
            {loadingNiveles ? (
              <p className="admin-charts-empty">Cargando niveles…</p>
            ) : dataNiveles.length === 0 ? (
              <p className="admin-charts-empty">Sin datos por nivel</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={dataNiveles}
                  margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#6b7280' }} tickFormatter={tickMoney} />
                  <YAxis
                    type="category"
                    dataKey="nivel"
                    width={88}
                    tick={{ fontSize: 12, fill: '#374151' }}
                  />
                  <Tooltip content={<TooltipMonto moneda={moneda} />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Saldo vencido" radius={[0, 4, 4, 0]} maxBarSize={22}>
                    {dataNiveles.map((_, idx) => (
                      <Cell key={`nv-${idx}`} fill={COLORES_NIVEL[idx % COLORES_NIVEL.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default DashboardCharts;
