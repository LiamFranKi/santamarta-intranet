import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import DashboardLayout from '../../components/DashboardLayout';
import BirthdayWidget from '../../components/BirthdayWidget';
import './Dashboard.css';

function Dashboard() {
  const { user } = useAuth();
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
    '/admin/config/anio-escolar': {
      title: '📅 Año Escolar',
      description: 'Gestiona los años escolares',
      icon: '📅'
    },
    '/admin/config/general': {
      title: '⚙️ Configuración General',
      description: 'Configuración general del sistema',
      icon: '⚙️'
    },
    '/admin/config/temas': {
      title: '🎨 Temas y Colores',
      description: 'Personaliza los temas y colores del sistema',
      icon: '🎨'
    },
    '/admin/config/pwa': {
      title: '📱 PWA',
      description: 'Configuración de Progressive Web App',
      icon: '📱'
    },
    '/auditoria': {
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

  // Si es una ruta específica de admin (pero NO el dashboard principal ni configuración), mostrar contenido específico
  const isAdminRoute = (location.pathname.startsWith('/admin/') && location.pathname !== '/admin/dashboard' && location.pathname !== '/admin/config/general') || location.pathname === '/auditoria';
  
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

  return (
    <DashboardLayout>
      <BirthdayWidget comunicadoAbierto={false} />
      <div className="dashboard-container">
        {/* Stat Cards */}
        <div className="stats-grid">
          <div className="stat-card" style={{ '--card-color': '#667eea' }}>
            <div className="stat-icon">👨‍🎓</div>
            <div className="stat-content">
              <h3 className="stat-title">Total Alumnos</h3>
              <div className="stat-value">—</div>
            </div>
          </div>

          <div className="stat-card" style={{ '--card-color': '#f093fb' }}>
            <div className="stat-icon">👨‍🏫</div>
            <div className="stat-content">
              <h3 className="stat-title">Total Docentes</h3>
              <div className="stat-value">—</div>
            </div>
          </div>

          <div className="stat-card" style={{ '--card-color': '#4facfe' }}>
            <div className="stat-icon">📚</div>
            <div className="stat-content">
              <h3 className="stat-title">Total Grados</h3>
              <div className="stat-value">—</div>
            </div>
          </div>

          <div className="stat-card" style={{ '--card-color': '#43e97b' }}>
            <div className="stat-icon">💰</div>
            <div className="stat-content">
              <h3 className="stat-title">Total Ingresos</h3>
              <div className="stat-value">—</div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

export default Dashboard;

