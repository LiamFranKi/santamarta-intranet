import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import DashboardLayout from '../../components/DashboardLayout';
import BirthdayWidget from '../../components/BirthdayWidget';
import api from '../../services/api';
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
          <div className="admin-estadisticas-content" style={{ marginTop: '1.5rem' }}>
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
                    <h2 className="admin-estadisticas-subtitle">Estadísticas por Matrícula y Meses</h2>
                    <div className="admin-estadisticas-table-card">
                      <table className="admin-estadisticas-table">
                        <thead>
                          <tr>
                            <th>Concepto</th>
                            <th>Total a Pagar</th>
                            <th>Pagado</th>
                            <th>Deuda</th>
                          </tr>
                        </thead>
                        <tbody>
                          {kpis.conceptos.map((row) => (
                            <tr key={row.tipo}>
                              <td>{row.concepto}</td>
                              <td>{fmtMonto(row.total_pagar, kpis.moneda)}</td>
                              <td>{fmtMonto(row.pagado, kpis.moneda)}</td>
                              <td>{fmtMonto(row.deuda, kpis.moneda)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
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

