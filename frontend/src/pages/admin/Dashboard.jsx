import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import DashboardLayout from '../../components/DashboardLayout';
import BirthdayWidget from '../../components/BirthdayWidget';
import api from '../../services/api';
import Swal from 'sweetalert2';
import './Dashboard.css';
import './AdminEstadisticas.css';

const coloresPasteles = [
  'linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%)',   // Verde menta
  'linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%)',   // Azul cielo
  'linear-gradient(135deg, #fff3e0 0%, #ffe0b2 100%)',   // Naranja suave
  'linear-gradient(135deg, #fce4ec 0%, #f8bbd9 100%)',   // Rosa pastel
  'linear-gradient(135deg, #f3e5f5 0%, #e1bee7 100%)',   // Lavanda
  'linear-gradient(135deg, #e0f7fa 0%, #b2ebf2 100%)',   // Cyan pastel
  'linear-gradient(135deg, #fff8e1 0%, #ffecb3 100%)',   // Ámbar suave
  'linear-gradient(135deg, #efebe9 0%, #d7ccc8 100%)',   // Marrón claro
];

function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [kpis, setKpis] = useState(null);
  const [loadingKpis, setLoadingKpis] = useState(true);
  const [errorKpis, setErrorKpis] = useState(null);

  useEffect(() => {
    api.get('/admin/dashboard').then(res => {
      setStats(res.data);
    }).catch(() => setStats(null)).finally(() => setLoadingStats(false));
  }, []);

  // Cargar KPIs de pagos/pensiones para el cuadro por concepto
  useEffect(() => {
    api.get('/admin/estadisticas/kpis')
      .then((res) => setKpis(res.data))
      .catch((err) => setErrorKpis(err.response?.data?.error || 'Error al cargar estadísticas por concepto'))
      .finally(() => setLoadingKpis(false));
  }, []);

  const navigate = useNavigate();
  const location = useLocation();

  // Mapeo de rutas a títulos y descripciones
  const routeInfo = {
    '/admin/matriculas': {
      title: '📋 Gestión de Matrículas',
      description: 'Administra las matrículas de los alumnos',
      icon: '📋'
    },
    '/admin/usuarios/administradores': {
      title: '👥 Administradores',
      description: 'Gestiona los usuarios administradores del sistema',
      icon: '👥'
    },
    '/admin/usuarios/personal': {
      title: '👨‍🏫 Personal',
      description: 'Gestiona el personal docente y administrativo',
      icon: '👨‍🏫'
    },
    '/admin/usuarios/alumnos': {
      title: '👨‍🎓 Alumnos',
      description: 'Gestiona los alumnos del sistema',
      icon: '👨‍🎓'
    },
    '/admin/usuarios/apoderados': {
      title: '👨‍👩‍👧‍👦 Apoderados',
      description: 'Gestiona los apoderados de los alumnos',
      icon: '👨‍👩‍👧‍👦'
    },
    '/admin/academico/niveles': {
      title: '🎓 Niveles Académicos',
      description: 'Gestiona los niveles académicos (Inicial, Primaria, Secundaria)',
      icon: '🎓'
    },
    '/admin/academico/grados': {
      title: '📚 Grados',
      description: 'Gestiona los grados académicos',
      icon: '📚'
    },
    '/admin/academico/cursos': {
      title: '📖 Cursos',
      description: 'Gestiona los cursos del sistema',
      icon: '📖'
    },
    '/admin/academico/asignaturas': {
      title: '📝 Asignaturas',
      description: 'Gestiona las asignaturas por grupo',
      icon: '📝'
    },
    '/admin/academico/areas': {
      title: '📊 Áreas',
      description: 'Gestiona las áreas académicas',
      icon: '📊'
    },
    '/admin/avatares': {
      title: '🎮 Gamificación',
      description: 'Avatares por bimestre y género con sus accesorios',
      icon: '🎮'
    },
    '/admin/notificaciones': {
      title: '🔔 Notificaciones',
      description: 'Gestiona las notificaciones del sistema',
      icon: '🔔'
    },
    '/admin/vanguarcito': {
      title: '🌟 Vanguarcito',
      description: 'Gestiona el módulo Vanguarcito',
      icon: '🌟'
    },
    '/admin/reportes/asistencias': {
      title: '📊 Reportes de Asistencias',
      description: 'Genera reportes de asistencias',
      icon: '📊'
    },
    '/admin/reportes/notas': {
      title: '📊 Reportes de Notas',
      description: 'Genera reportes de notas y calificaciones',
      icon: '📊'
    },
    '/admin/reportes/estadisticas': {
      title: '📈 Estadísticas',
      description: 'Visualiza estadísticas generales del sistema',
      icon: '📈'
    },
    '/admin/config': {
      title: '⚙️ Configuración',
      description: 'Configuración del sistema (página temporal)',
      icon: '⚙️'
    },
    '/admin/auditoria': {
      title: '🧾 Auditoría',
      description: 'Visualiza los logs de auditoría del sistema',
      icon: '🧾'
    }
  };
  
  const currentRouteInfo = routeInfo[location.pathname] || {
    title: '📊 Dashboard',
    description: 'Aquí tienes un resumen de tu sistema educativo',
    icon: '📊'
  };

  // Si es una ruta específica de admin (pero NO el dashboard principal), mostrar contenido específico (placeholder)
  const isAdminRoute = location.pathname.startsWith('/admin/') && location.pathname !== '/admin/dashboard';
  
  if (isAdminRoute) {
    return (
      <DashboardLayout>
        <div className="dashboard-container">
          <div className="dashboard-welcome">
            <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>
              {currentRouteInfo.icon} {currentRouteInfo.title}
            </h1>
            <p style={{ fontSize: '1.1rem', color: '#6b7280' }}>
              {currentRouteInfo.description}
            </p>
          </div>
          
          <div style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            padding: '3rem',
            marginTop: '2rem',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🚧</div>
            <h2 style={{ color: '#374151', marginBottom: '1rem' }}>
              Módulo en Desarrollo
            </h2>
            <p style={{ color: '#6b7280', fontSize: '1.1rem', maxWidth: '600px', margin: '0 auto' }}>
              Esta funcionalidad está siendo desarrollada. Pronto estará disponible para su uso.
            </p>
            <button
              onClick={() => navigate('/admin/dashboard')}
              style={{
                marginTop: '2rem',
                padding: '0.75rem 2rem',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '1rem',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => e.target.style.transform = 'scale(1.05)'}
              onMouseLeave={(e) => e.target.style.transform = 'scale(1)'}
            >
              Volver al Dashboard Principal
            </button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const handleVerDeudas = async (row) => {
    const moneda = kpis?.moneda || stats?.moneda || 'S/';
    const anio = kpis?.anio || stats?.anio_activo || new Date().getFullYear();

    const fmtM = (n) =>
      n == null || n === '' ? '—' : `${moneda} ${parseFloat(n).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    Swal.fire({ title: 'Cargando...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });
    try {
      const { data } = await api.get('/admin/estadisticas/deudas-por-aula', {
        params: { tipo: row.tipo, anio }
      });
      Swal.close();

      const aulas = (data.aulas || []).slice();
      const titulo = `Saldo Pendiente por Aula - ${data.concepto || row.concepto} (${data.anio || anio})`;

      if (aulas.length === 0) {
        Swal.fire({
          title: titulo,
          html: '<p style="color:#6b7280">No hay datos por aula para este concepto.</p>',
          confirmButtonText: 'Cerrar',
          width: 520,
        });
        return;
      }

      const totalDeuda = aulas.reduce((s, a) => s + (parseFloat(a.deuda_total) || 0), 0);
      const totalPagado = aulas.reduce((s, a) => s + (parseFloat(a.pagado) || 0), 0);
      const totalSaldo = aulas.reduce((s, a) => s + (parseFloat(a.saldo) || 0), 0);
      const maxSaldo = Math.max(...aulas.map(a => parseFloat(a.saldo) || 0), 1);

      const filasTabla = aulas.map(
        (a, i) => {
          const par = i % 2 === 0;
          const rowBg = par ? 'background:linear-gradient(135deg,#faf8fc 0%,#f5f0fa 100%)' : 'background:linear-gradient(135deg,#f5f0fa 0%,#efe8f5 100%)';
          return `<tr style="${rowBg}">
          <td style="text-align:left;padding:12px 14px;border-bottom:1px solid #e8e0e8">${a.aula}</td>
          <td style="text-align:right;padding:12px 14px;border-bottom:1px solid #e8e0e8;font-variant-numeric:tabular-nums">${fmtM(a.deuda_total)}</td>
          <td style="text-align:right;padding:12px 14px;border-bottom:1px solid #e8e0e8;font-variant-numeric:tabular-nums">${fmtM(a.pagado)}</td>
          <td style="text-align:right;padding:12px 14px;border-bottom:1px solid #e8e0e8;font-weight:700;color:#c43e00;font-variant-numeric:tabular-nums">${fmtM(a.saldo)}</td>
        </tr>`;
        }
      ).join('');

      const tablaHtml = `
        <div class="admin-modal-deudas-tabla-wrap">
        <table class="admin-modal-deudas-tabla">
          <thead>
            <tr>
              <th>Aula</th>
              <th>Deuda</th>
              <th>Pagado</th>
              <th>Saldo</th>
            </tr>
          </thead>
          <tbody>
            ${filasTabla}
          </tbody>
          <tfoot>
            <tr>
              <td>Total</td>
              <td>${fmtM(totalDeuda)}</td>
              <td>${fmtM(totalPagado)}</td>
              <td class="admin-modal-deudas-saldo-total">${fmtM(totalSaldo)}</td>
            </tr>
          </tfoot>
        </table>
        </div>
      `;

      // Etiqueta sin año: solo nivel y grado (ej. "SECUNDARIA - 1° UNICA - 2026" → "SECUNDARIA - 1° UNICA")
      const labelSinAnio = (aula) => (aula || '').replace(/\s*-\s*\d{4}\s*$/, '').trim() || aula;

      const barrasChart = aulas.map((a) => {
        const saldo = parseFloat(a.saldo) || 0;
        const pct = maxSaldo > 0 ? (saldo / maxSaldo) * 100 : 2;
        const label = labelSinAnio(a.aula);
        return `<div class="admin-modal-deudas-bar-group" title="${a.aula}: Saldo ${fmtM(a.saldo)}">
          <div class="admin-modal-deudas-bar-wrap">
            <div class="admin-modal-deudas-bar-fill" style="height:${Math.max(pct, 2)}%"></div>
          </div>
          <div class="admin-modal-deudas-bar-label">${label}</div>
        </div>`;
      }).join('');

      const chartHtml = `
        <div class="admin-modal-deudas-chart-section">
          <div class="admin-modal-deudas-chart-title">Saldo pendiente por grado (mayor a menor)</div>
          <div class="admin-modal-deudas-chart-scroll">
            <div class="admin-modal-deudas-chart-bars">
              ${barrasChart}
            </div>
          </div>
        </div>
      `;

      Swal.fire({
        title: titulo,
        html: `<div class="admin-modal-deudas-body">${tablaHtml}${chartHtml}</div>`,
        width: '92%',
        padding: 0,
        showCloseButton: true,
        confirmButtonText: 'Cerrar',
        customClass: { popup: 'admin-modal-deudas-aula', htmlContainer: 'admin-modal-deudas-html' },
      });
    } catch (err) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: err.response?.data?.error || 'No se pudo cargar el detalle por aula.',
        confirmButtonText: 'Cerrar',
      });
    }
  };

  const fmt = (n) => (n == null || n === '' ? '—' : typeof n === 'number' ? n.toLocaleString('es-PE', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) : String(n));
  const fmtMonto = (n, moneda = stats?.moneda || 'S/') => (n == null || n === '' ? '—' : `${moneda} ${parseFloat(n).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

  const anio = stats?.anio_activo ?? '—';
  const cards = [
    { key: 'grados', title: 'Total Grados', icon: '📚', value: loadingStats ? '—' : fmt(stats?.total_grados), color: coloresPasteles[0] },
    { key: 'trabajadores', title: 'Total Trabajadores', icon: '👥', value: loadingStats ? '—' : fmt(stats?.total_trabajadores), color: coloresPasteles[1] },
    { key: 'alumnos', title: 'Total Alumnos', icon: '👨‍🎓', value: loadingStats ? '—' : fmt(stats?.total_alumnos), color: coloresPasteles[2] },
    { key: 'apoderados', title: 'Total Apoderados', icon: '👨‍👩‍👧‍👦', value: loadingStats ? '—' : fmt(stats?.total_apoderados), color: coloresPasteles[3] },
    { key: 'presupuesto', title: `Presupuesto Anual (${anio})`, icon: '📋', value: loadingStats ? '—' : (stats?.presupuesto_anual != null ? fmtMonto(stats.presupuesto_anual) : '—'), color: coloresPasteles[4] },
    { key: 'ingresos', title: `Total Ingresos (${anio})`, icon: '💰', value: loadingStats ? '—' : fmtMonto(stats?.total_ingresos), color: coloresPasteles[5] },
    { key: 'deuda', title: `Total Deuda (${anio})`, icon: '⚠️', value: loadingStats ? '—' : fmtMonto(stats?.total_deuda), color: coloresPasteles[6] },
    { key: 'deudas_ant', title: 'Deudas Anteriores', icon: '📜', value: loadingStats ? '—' : fmtMonto(stats?.deudas_anteriores), color: coloresPasteles[7] },
  ];

  return (
    <DashboardLayout>
      <BirthdayWidget comunicadoAbierto={false} />
      <div className="dashboard-container">
        <div className="admin-stats-grid">
          {cards.map((card) => (
            <div key={card.key} className="admin-stat-card" style={{ background: card.color }}>
              <div className="admin-stat-icon">{card.icon}</div>
              <div className="admin-stat-content">
                <h3 className="admin-stat-title">{card.title}</h3>
                <div className="admin-stat-value">{card.value}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Cuadro de Estadísticas por Matrícula y Meses (pagos/pensiones) */}
        {user?.tipo === 'ADMINISTRADOR' && (
          <div className="admin-estadisticas-content" style={{ marginTop: '0.75rem' }}>
            {errorKpis && (
              <div className="admin-estadisticas-error">
                {errorKpis}
              </div>
            )}
            {loadingKpis ? (
              <p className="admin-estadisticas-placeholder">Cargando estadísticas por concepto...</p>
            ) : (
              <>
                {kpis && Array.isArray(kpis.conceptos) && kpis.conceptos.length > 0 ? (
                  <div className="admin-estadisticas-table-wrapper">
                    <h2 className="admin-estadisticas-subtitle">Estadisticas de Pagos (Matriculas y Pensiones)</h2>
                    <div className="admin-estadisticas-table-card">
                      <table className="admin-estadisticas-table">
                        <thead>
                          <tr>
                            <th>Concepto</th>
                            <th>Total a Pagar</th>
                            <th>Pagado</th>
                            <th>Deuda</th>
                            <th className="admin-estadisticas-deudas-col">Ver</th>
                          </tr>
                        </thead>
                        <tbody>
                          {kpis.conceptos.map((row) => (
                            <tr key={row.tipo}>
                              <td>{row.concepto}</td>
                              <td>{fmtMonto(row.total_pagar, kpis.moneda)}</td>
                              <td>{fmtMonto(row.pagado, kpis.moneda)}</td>
                              <td>{fmtMonto(row.deuda, kpis.moneda)}</td>
                              <td className="admin-estadisticas-deudas-col">
                                <button
                                  className="admin-estadisticas-deudas-btn"
                                  type="button"
                                  onClick={() => handleVerDeudas(row)}
                                  title="Ver Deudas"
                                  aria-label="Ver Deudas"
                                >
                                  👁️
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr>
                            <td><strong>Total</strong></td>
                            <td>{fmtMonto(kpis.conceptos.reduce((s, r) => s + (parseFloat(r.total_pagar) || 0), 0), kpis.moneda)}</td>
                            <td>{fmtMonto(kpis.conceptos.reduce((s, r) => s + (parseFloat(r.pagado) || 0), 0), kpis.moneda)}</td>
                            <td>{fmtMonto(kpis.conceptos.reduce((s, r) => s + (parseFloat(r.deuda) || 0), 0), kpis.moneda)}</td>
                            <td className="admin-estadisticas-deudas-col"></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>

                    {/* Gráfico Pagado vs Deuda por concepto */}
                    <div className="admin-estadisticas-chart-card">
                      <h3 className="admin-estadisticas-chart-title">Pagado vs Deuda por Mes</h3>
                      <div className="admin-estadisticas-chart-legend">
                        <span className="admin-estadisticas-chart-legend-item admin-estadisticas-legend-pagado">Pagado</span>
                        <span className="admin-estadisticas-chart-legend-item admin-estadisticas-legend-deuda">Deuda</span>
                      </div>
                      <div className="admin-estadisticas-chart-wrapper">
                        {(() => {
                          const conceptos = kpis.conceptos;
                          const maxVal = Math.max(
                            ...conceptos.flatMap(r => [parseFloat(r.pagado) || 0, parseFloat(r.deuda) || 0]),
                            1
                          );
                          const step = maxVal <= 0 ? 1 : Math.ceil(maxVal / 5 / 10000) * 10000;
                          const yMax = Math.ceil(maxVal / step) * step || 1;
                          return (
                            <>
                              <div className="admin-estadisticas-chart-y-axis">
                                {[yMax, yMax * 0.8, yMax * 0.6, yMax * 0.4, yMax * 0.2, 0].map((v, i) => (
                                  <div key={i} className="admin-estadisticas-chart-y-tick">
                                    {v.toLocaleString('es-PE', { maximumFractionDigits: 0 })}
                                  </div>
                                ))}
                              </div>
                              <div className="admin-estadisticas-chart-bars-container">
                                {conceptos.map((row) => {
                                  const pagado = parseFloat(row.pagado) || 0;
                                  const deuda = parseFloat(row.deuda) || 0;
                                  const pctPagado = yMax > 0 ? (pagado / yMax) * 100 : 0;
                                  const pctDeuda = yMax > 0 ? (deuda / yMax) * 100 : 0;
                                  return (
                                    <div key={row.tipo} className="admin-estadisticas-chart-group">
                                      <div className="admin-estadisticas-chart-bars">
                                        <div
                                          className="admin-estadisticas-bar admin-estadisticas-bar-pagado"
                                          style={{ height: `${Math.max(pctPagado, 0.5)}%` }}
                                          title={`${row.concepto}: Pagado ${pagado.toLocaleString('es-PE', { minimumFractionDigits: 2 })}`}
                                        />
                                        <div
                                          className="admin-estadisticas-bar admin-estadisticas-bar-deuda"
                                          style={{ height: `${Math.max(pctDeuda, 0.5)}%` }}
                                          title={`${row.concepto}: Deuda ${deuda.toLocaleString('es-PE', { minimumFractionDigits: 2 })}`}
                                        />
                                      </div>
                                      <div className="admin-estadisticas-chart-x-label">{row.concepto}</div>
                                    </div>
                                  );
                                })}
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="admin-estadisticas-placeholder">No hay datos de estadísticas por concepto disponibles.</p>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

export default Dashboard;

