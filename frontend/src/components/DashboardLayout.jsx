import React, { useMemo, useState, useEffect, useRef } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import CalendarioWidget from './CalendarioWidget';
import AlumnoAvatarWidget from './AlumnoAvatarWidget';
import PublicacionesWidget from './PublicacionesWidget';
import PublicacionFormCard from './PublicacionFormCard';
import PublicacionesCardFeed from './PublicacionesCardFeed';
import NotificacionesWidget from './NotificacionesWidget';
import PWAInstallPrompt from './PWAInstallPrompt';
import PWAUpdateNotification from './PWAUpdateNotification';
import ModalAsistencias from './ModalAsistencias';
import BirthdayWelcomeModal from './BirthdayWelcomeModal';
import EncuestaActivacionModal from './EncuestaActivacionModal';
import HerramientasExamenActivacionModal from './HerramientasExamenActivacionModal';
import '../styles/CumpleMarcoFestivo.css';
import './DashboardLayout.css';

function getInitials(nombre) {
  if (!nombre) return 'U';
  const parts = String(nombre).trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase()).join('') || 'U';
}

export default function DashboardLayout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [expandedMenus, setExpandedMenus] = useState({});
  const sidebarNavRef = useRef(null);
  const submenuRefs = useRef({
    usuarios: null,
    academico: null,
    reportes: null,
    herramientas: null,
    comunicaciones: null,
    configuracion: null,
    docenteHerramientas: null
  });

  // Mantener abierto el submenú que contiene la ruta actual (evita que se "bloquee" la navegación en Config, etc.)
  useEffect(() => {
    const path = location.pathname || '';
    setExpandedMenus(prev => ({
      ...prev,
      ...(path.startsWith('/admin/usuarios') && { usuarios: true }),
      ...((path.startsWith('/admin/academico') || path.startsWith('/admin/avatares') || path.startsWith('/admin/gamificacion')) && { academico: true }),
      ...(path.startsWith('/admin/reportes') && { reportes: true }),
      ...(
        (
          path.startsWith('/admin/herramientas')
          || path.startsWith('/admin/documentos-gestion')
        ) && { herramientas: true }
      ),
      ...(
        (
          path.startsWith('/admin/comunicaciones')
          || path.startsWith('/admin/vanguarcito')
        ) && { comunicaciones: true }
      ),
      ...(path.startsWith('/admin/config') && { configuracion: true }),
      ...((path.startsWith('/docente/herramientas') || path === '/docente/supervision') && { docenteHerramientas: true }),
    }));
  }, [location.pathname]);

  // Al cambiar de ruta: cerrar sidebar en móvil y mantener visible el ítem activo (evitar que el menú “suba” al hacer clic en Mensajes, etc.)
  useEffect(() => {
    setSidebarOpen(false);
    const nav = sidebarNavRef.current;
    if (nav) {
      const active = nav.querySelector('.sidebar-link.active, .sidebar-sublink.active');
      if (active) {
        requestAnimationFrame(() => {
          active.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
        });
      }
    }
  }, [location.pathname]);
  const [rolesAdicionales, setRolesAdicionales] = useState({
    es_apoderado: false,
    es_tutor: false
  });
  const [tieneAsignaciones, setTieneAsignaciones] = useState({
    tiene_grupos: false,
    tiene_cursos: false
  });
  const [cargandoAsignaciones, setCargandoAsignaciones] = useState(false);
  const [refreshPublicaciones, setRefreshPublicaciones] = useState(0);
  const [mostrarModalAsistencias, setMostrarModalAsistencias] = useState(false);
  const [esSupervisorSupervision, setEsSupervisorSupervision] = useState(false);
  
  // Debug: verificar que el componente se monta
  React.useEffect(() => {
    console.log('✅ [DASHBOARD LAYOUT] Componente montado, user:', user?.tipo);
  }, [user]);

  // Cargar roles adicionales y asignaciones si es docente
  useEffect(() => {
    const cargarDatosDocente = async () => {
      if (user?.tipo === 'DOCENTE') {
        try {
          setCargandoAsignaciones(true);
          
          // Cargar roles adicionales
          const responseRoles = await api.get('/docente/roles-adicionales');
          setRolesAdicionales({
            es_apoderado: responseRoles.data.es_apoderado || false,
            es_tutor: responseRoles.data.es_tutor || false
          });

          // Cargar información de asignaciones (grupos y cursos)
          const responseAsignaciones = await api.get('/docente/tiene-asignaciones');
          setTieneAsignaciones({
            tiene_grupos: responseAsignaciones.data.tiene_grupos || false,
            tiene_cursos: responseAsignaciones.data.tiene_cursos || false
          });

          try {
            const sup = await api.get('/supervision/yo');
            setEsSupervisorSupervision(
              !!(sup.data?.is_supervisor || sup.data?.is_admin)
            );
          } catch {
            setEsSupervisorSupervision(false);
          }
        } catch (error) {
          console.error('Error cargando datos del docente:', error);
          // En caso de error, mantener valores por defecto (ocultar menús)
          setTieneAsignaciones({
            tiene_grupos: false,
            tiene_cursos: false
          });
          setEsSupervisorSupervision(false);
        } finally {
          setCargandoAsignaciones(false);
        }
      } else {
        // Si no es docente, resetear estados
        setTieneAsignaciones({
          tiene_grupos: false,
          tiene_cursos: false
        });
        setEsSupervisorSupervision(false);
        setCargandoAsignaciones(false);
      }
    };

    if (user?.tipo === 'DOCENTE') {
      cargarDatosDocente();
    } else {
      // Resetear si no es docente
      setTieneAsignaciones({
        tiene_grupos: false,
        tiene_cursos: false
      });
      setEsSupervisorSupervision(false);
      setCargandoAsignaciones(false);
    }
  }, [user]);

  // Toggle submenu; en móvil hacer scroll al submenú expandido para que no quede tapado
  const toggleSubmenu = (menuKey) => {
    const isOpening = !expandedMenus[menuKey];
    setExpandedMenus(prev => ({
      ...prev,
      [menuKey]: !prev[menuKey]
    }));
    if (isOpening && submenuRefs.current[menuKey]) {
      requestAnimationFrame(() => {
        setTimeout(() => {
          const el = submenuRefs.current[menuKey];
          if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }, 350);
      });
    }
  };

  // Resolver URL base en tiempo de ejecución (no en compilación)
  const apiBaseUrl = useMemo(() => {
    const hostname = window.location.hostname || '';
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
    
    if (isLocalhost) {
      return 'http://localhost:5000';
    }
    // Producción: usar el mismo dominio
    const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
    return `${protocol}//${hostname}`;
  }, []); // Solo calcular una vez al montar el componente

  // Logo blanco para el sidebar
  const logoUrl = useMemo(() => `${apiBaseUrl}/assets/logos/logoblanco.png`, [apiBaseUrl]);

  // Manejar nombres para alumnos y apoderados (tienen apellido_paterno y apellido_materno separados)
  let displayName = '';
  if (user?.tipo === 'ALUMNO') {
    displayName = user?.nombres && user?.apellido_paterno 
      ? `${user.nombres} ${user.apellido_paterno}${user.apellido_materno ? ' ' + user.apellido_materno : ''}`
      : user?.nombres || user?.usuario || 'Alumno';
  } else if (user?.tipo === 'APODERADO') {
    displayName = user?.nombres && user?.apellido_paterno 
      ? `${user.nombres} ${user.apellido_paterno}${user.apellido_materno ? ' ' + user.apellido_materno : ''}`
      : user?.nombres || user?.usuario || 'Apoderado';
  } else {
    displayName = user?.nombres && user?.apellidos 
      ? `${user.nombres} ${user.apellidos}` 
      : user?.nombres || user?.usuario || 'Usuario';
  }
  const initials = getInitials(displayName);
  const role = user?.tipo || 'USUARIO';
  
  // Debug: verificar el role
  React.useEffect(() => {
    console.log('🔍 [DASHBOARD LAYOUT] Role detectado:', role, 'User tipo:', user?.tipo);
  }, [role, user?.tipo]);
  
  // Construir URL de la foto del usuario
  // La foto debería venir como URL completa del backend, pero manejamos todos los casos por compatibilidad
  const userFotoUrl = useMemo(() => {
    if (!user?.foto) return null;
    
    const currentHost = window.location.hostname;
    const currentProtocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
    
    let fotoUrl;
    
    // Si ya es una URL completa (http/https), normalizarla
    if (user.foto.startsWith('http')) {
      fotoUrl = user.foto;
      // Normalizar: reemplazar dominio antiguo por el actual
      if (fotoUrl.includes('vanguardschools.edu.pe/uploads') || fotoUrl.includes('vanguardschools.edu.pe/Static')) {
        if (fotoUrl.includes('/uploads/')) {
          fotoUrl = fotoUrl.replace(/https?:\/\/vanguardschools\.edu\.pe\/uploads/g, `${currentProtocol}//${currentHost}/uploads`);
        } else if (fotoUrl.includes('/Static/')) {
          fotoUrl = fotoUrl.replace(/https?:\/\/vanguardschools\.edu\.pe\/Static/g, 'https://nuevo.vanguardschools.edu.pe/Static');
        }
      }
      return fotoUrl;
    }
    
    // Si es una ruta relativa que empieza con /, construir URL completa
    if (user.foto.startsWith('/')) {
      return `${currentProtocol}//${currentHost}${user.foto}`;
    }
    
    // Si solo tenemos el nombre del archivo (caso legacy o localStorage antiguo)
    // IMPORTANTE: Las fotos se guardan en Static/Image/Fotos/ (compartido con sistema PHP)
    // Usar el mismo dominio del sistema PHP para servir fotos (igual que publicaciones)
    const fotoNombre = user.foto_nombre || user.foto;
    const phpSystemUrl = 'https://nuevo.vanguardschools.edu.pe';
    const isProduction = currentHost !== 'localhost' && currentHost !== '127.0.0.1';
    
    if (isProduction) {
      // Producción: usar el dominio del sistema PHP
      return `${phpSystemUrl}/Static/Image/Fotos/${fotoNombre}`;
    } else {
      // Desarrollo: usar localhost
      return `http://localhost:5000/Static/Image/Fotos/${fotoNombre}`;
    }
  }, [user?.foto, user?.foto_nombre, role]);

  return (
    <div className="dashboard-layout">
      <div
        className={`dashboard-overlay ${sidebarOpen ? 'open' : ''}`}
        role="button"
        tabIndex={0}
        onClick={() => setSidebarOpen(false)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') setSidebarOpen(false);
        }}
      />

      <aside className={`dashboard-sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-logo" role="button" tabIndex={0} onClick={() => navigate(role === 'DOCENTE' ? '/docente/dashboard' : role === 'ALUMNO' ? '/alumno/dashboard' : role === 'APODERADO' ? '/apoderado/dashboard' : role === 'ADMINISTRADOR' ? '/admin/dashboard' : role === 'PROMOTORIA' ? '/promotoria/dashboard' : '/admin/dashboard')}>
            {logoUrl ? (
              <img className="sidebar-logo-image" src={logoUrl} alt="Logo" />
            ) : (
              <div className="sidebar-logo-fallback">🏫</div>
            )}
            <div className="logo-text">VanguardNet</div>
          </div>

          <button className="sidebar-close-btn" type="button" onClick={() => setSidebarOpen(false)} aria-label="Cerrar menú">
            ✕
          </button>
        </div>

        <nav className="sidebar-nav" ref={sidebarNavRef}>
          {role === 'DOCENTE' ? (
            <>
              <div className="sidebar-item">
                <NavLink className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} to="/docente/dashboard" end>
                  <span className="sidebar-icon">📊</span>
                  <span className="sidebar-label">Dashboard</span>
                </NavLink>
              </div>
              <div className="sidebar-item">
                <NavLink className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} to="/docente/perfil">
                  <span className="sidebar-icon">👤</span>
                  <span className="sidebar-label">Mi Perfil</span>
                </NavLink>
              </div>
              <div className="sidebar-item">
                <NavLink className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} to="/docente/qr">
                  <span className="sidebar-icon">📱</span>
                  <span className="sidebar-label">Mi QR</span>
                </NavLink>
              </div>
              {/* Grupos Asignados - Solo mostrar si tiene grupos */}
              {tieneAsignaciones.tiene_grupos && (
                <div className="sidebar-item">
                  <NavLink className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} to="/docente/grupos">
                    <span className="sidebar-icon">👥</span>
                    <span className="sidebar-label">Grupos Asignados</span>
                  </NavLink>
                </div>
              )}
              {/* Cursos Asignados - Solo mostrar si tiene cursos */}
              {tieneAsignaciones.tiene_cursos && (
                <div className="sidebar-item">
                  <NavLink className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} to="/docente/cursos">
                    <span className="sidebar-icon">📚</span>
                    <span className="sidebar-label">Cursos Asignados</span>
                  </NavLink>
                </div>
              )}
              {/* Mi Horario - Solo mostrar si tiene grupos o cursos */}
              {(tieneAsignaciones.tiene_grupos || tieneAsignaciones.tiene_cursos) && (
                <div className="sidebar-item">
                  <NavLink className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} to="/docente/horario">
                    <span className="sidebar-icon">📅</span>
                    <span className="sidebar-label">Mi Horario</span>
                  </NavLink>
                </div>
              )}
              {/* Mis Asistencias */}
              <div className="sidebar-item">
                <button 
                  className="sidebar-link" 
                  onClick={() => setMostrarModalAsistencias(true)}
                  style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  <span className="sidebar-icon">⏰</span>
                  <span className="sidebar-label">Mis Asistencias</span>
                </button>
              </div>
              <div className="sidebar-menu-item">
                <button
                  type="button"
                  className={`sidebar-menu-toggle ${expandedMenus.docenteHerramientas ? 'expanded' : ''}`}
                  onClick={() => toggleSubmenu('docenteHerramientas')}
                >
                  <div className="sidebar-menu-toggle-content">
                    <span className="sidebar-icon">🧰</span>
                    <span className="sidebar-label">Herramientas</span>
                  </div>
                  <span className="sidebar-menu-arrow">▶</span>
                </button>
                <div
                  ref={(el) => {
                    submenuRefs.current.docenteHerramientas = el;
                  }}
                  className={`sidebar-submenu ${expandedMenus.docenteHerramientas ? 'expanded' : ''}`}
                >
                  <NavLink
                    className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`}
                    to="/docente/herramientas/documentos"
                  >
                    <span className="sidebar-icon" aria-hidden>
                      📄
                    </span>
                    <span className="sidebar-label">Documentos</span>
                  </NavLink>
                  <NavLink
                    className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`}
                    to="/docente/herramientas/examenes"
                  >
                    <span className="sidebar-icon" aria-hidden>
                      📝
                    </span>
                    <span className="sidebar-label">Exámenes</span>
                  </NavLink>
                  <NavLink
                    className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`}
                    to="/herramientas-examenes"
                  >
                    <span className="sidebar-icon" aria-hidden>
                      🎯
                    </span>
                    <span className="sidebar-label">Rendir exámenes</span>
                  </NavLink>
                  <NavLink
                    className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`}
                    to="/docente/herramientas/encuestas"
                  >
                    <span className="sidebar-icon" aria-hidden>
                      📋
                    </span>
                    <span className="sidebar-label">Encuestas</span>
                  </NavLink>
                  <NavLink
                    className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`}
                    to="/docente/herramientas/vocabularios"
                  >
                    <span className="sidebar-icon" aria-hidden>
                      📚
                    </span>
                    <span className="sidebar-label">Vocabularios</span>
                  </NavLink>
                  {esSupervisorSupervision ? (
                    <NavLink
                      className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`}
                      to="/docente/herramientas/supervision"
                    >
                      <span className="sidebar-icon" aria-hidden>
                        🎯
                      </span>
                      <span className="sidebar-label">Supervisión</span>
                    </NavLink>
                  ) : null}
                </div>
              </div>

              {/* Menú Hijos a Cargo (si es apoderado) */}
              {rolesAdicionales.es_apoderado && (
                <>
                  <div className="sidebar-section-divider"></div>
                  <div className="sidebar-section-label" style={{ 
                    fontSize: '0.75rem', 
                    color: '#9ca3af', 
                    fontWeight: '600', 
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    padding: '1rem 1.5rem 0.5rem 1.5rem',
                    marginTop: '0.5rem'
                  }}>
                    Como Apoderado
                  </div>
                  <div className="sidebar-item">
                    <NavLink className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} to="/docente/hijos">
                      <span className="sidebar-icon">👨‍👩‍👧‍👦</span>
                      <span className="sidebar-label">Hijos a Cargo</span>
                    </NavLink>
                  </div>
                </>
              )}

              {/* Menú Tutoría (si es tutor) */}
              {rolesAdicionales.es_tutor && (
                <>
                  {!rolesAdicionales.es_apoderado && <div className="sidebar-section-divider"></div>}
                  <div className="sidebar-section-label" style={{ 
                    fontSize: '0.75rem', 
                    color: '#9ca3af', 
                    fontWeight: '600', 
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    padding: '1rem 1.5rem 0.5rem 1.5rem',
                    marginTop: rolesAdicionales.es_apoderado ? '0' : '0.5rem'
                  }}>
                    Como Tutor
                  </div>
                  <div className="sidebar-item">
                    <NavLink className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} to="/docente/tutoria">
                      <span className="sidebar-icon">🎓</span>
                      <span className="sidebar-label">Tutoría</span>
                    </NavLink>
                  </div>
                </>
              )}

              <div className="sidebar-item">
                <NavLink className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} to="/docente/comunicados">
                  <span className="sidebar-icon">📢</span>
                  <span className="sidebar-label">Comunicados</span>
                </NavLink>
              </div>
              <div className="sidebar-item">
                <NavLink className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} to="/docente/actividades">
                  <span className="sidebar-icon">📆</span>
                  <span className="sidebar-label">Actividades</span>
                </NavLink>
              </div>
              <div className="sidebar-item">
                <NavLink className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} to="/docente/mensajes">
                  <span className="sidebar-icon">✉️</span>
                  <span className="sidebar-label">Mensajes</span>
                </NavLink>
              </div>
            </>
          ) : role === 'ALUMNO' ? (
            <>
              <div className="sidebar-item">
                <NavLink className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} to="/alumno/dashboard" end>
                  <span className="sidebar-icon">📊</span>
                  <span className="sidebar-label">Dashboard</span>
                </NavLink>
              </div>
              <div className="sidebar-item">
                <NavLink className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} to="/alumno/perfil">
                  <span className="sidebar-icon">👤</span>
                  <span className="sidebar-label">Mi Perfil</span>
                </NavLink>
              </div>
              <div className="sidebar-item">
                <NavLink className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} to="/alumno/qr">
                  <span className="sidebar-icon">📱</span>
                  <span className="sidebar-label">Mi QR</span>
                </NavLink>
              </div>
              <div className="sidebar-item">
                <NavLink className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} to="/alumno/cursos">
                  <span className="sidebar-icon">📚</span>
                  <span className="sidebar-label">Mis Cursos</span>
                </NavLink>
              </div>
              <div className="sidebar-item">
                <NavLink className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} to="/alumno/horario">
                  <span className="sidebar-icon">📅</span>
                  <span className="sidebar-label">Mi Horario</span>
                </NavLink>
              </div>
              <div className="sidebar-item">
                <NavLink className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} to="/alumno/avatar">
                  <span className="sidebar-icon">🎭</span>
                  <span className="sidebar-label">Mi Avatar</span>
                </NavLink>
              </div>
              <div className="sidebar-item">
                <NavLink className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} to="/alumno/comunicados">
                  <span className="sidebar-icon">📢</span>
                  <span className="sidebar-label">Comunicados</span>
                </NavLink>
              </div>
              <div className="sidebar-item">
                <NavLink className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} to="/alumno/actividades">
                  <span className="sidebar-icon">📆</span>
                  <span className="sidebar-label">Actividades</span>
                </NavLink>
              </div>
              <div className="sidebar-item">
                <NavLink className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} to="/encuestas">
                  <span className="sidebar-icon">📋</span>
                  <span className="sidebar-label">Encuestas</span>
                </NavLink>
              </div>
              <div className="sidebar-item">
                <NavLink className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} to="/herramientas-examenes">
                  <span className="sidebar-icon">📝</span>
                  <span className="sidebar-label">Exámenes</span>
                </NavLink>
              </div>
              <div className="sidebar-item">
                <NavLink className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} to="/alumno/mensajes">
                  <span className="sidebar-icon">✉️</span>
                  <span className="sidebar-label">Mensajes</span>
                </NavLink>
              </div>
            </>
          ) : role === 'PROMOTORIA' ? (
            <>
              <div className="sidebar-item">
                <NavLink className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} to="/promotoria/dashboard" end>
                  <span className="sidebar-icon">📊</span>
                  <span className="sidebar-label">Dashboard</span>
                </NavLink>
              </div>
              <div className="sidebar-item">
                <NavLink className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} to="/admin/perfil">
                  <span className="sidebar-icon">👤</span>
                  <span className="sidebar-label">Mi Perfil</span>
                </NavLink>
              </div>
              <div className="sidebar-item">
                <NavLink className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} to="/admin/comunicaciones/actividades">
                  <span className="sidebar-icon">📅</span>
                  <span className="sidebar-label">Actividades</span>
                </NavLink>
              </div>
              <div className="sidebar-item">
                <NavLink className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} to="/admin/comunicaciones/comunicados">
                  <span className="sidebar-icon">📢</span>
                  <span className="sidebar-label">Comunicados</span>
                </NavLink>
              </div>
              <div className="sidebar-item">
                <NavLink className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} to="/admin/comunicaciones/publicaciones">
                  <span className="sidebar-icon">📰</span>
                  <span className="sidebar-label">Publicaciones</span>
                </NavLink>
              </div>
              <div className="sidebar-item">
                <NavLink className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} to="/admin/comunicaciones/conexiones">
                  <span className="sidebar-icon">🔗</span>
                  <span className="sidebar-label">Conexiones</span>
                </NavLink>
              </div>
              <div className="sidebar-item">
                <NavLink className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} to="/admin/herramientas/examenes">
                  <span className="sidebar-icon">📝</span>
                  <span className="sidebar-label">Examenes</span>
                </NavLink>
              </div>
              <div className="sidebar-item">
                <NavLink className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} to="/admin/herramientas/encuestas">
                  <span className="sidebar-icon">📋</span>
                  <span className="sidebar-label">Encuestas</span>
                </NavLink>
              </div>
              <div className="sidebar-item">
                <NavLink className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} to="/admin/comunicaciones/notificaciones">
                  <span className="sidebar-icon">🔔</span>
                  <span className="sidebar-label">Notificaciones</span>
                </NavLink>
              </div>
              <div className="sidebar-menu-item">
                <button
                  type="button"
                  className={`sidebar-menu-toggle ${expandedMenus.reportes ? 'expanded' : ''}`}
                  onClick={() => toggleSubmenu('reportes')}
                >
                  <div className="sidebar-menu-toggle-content">
                    <span className="sidebar-icon">📈</span>
                    <span className="sidebar-label">Reportes</span>
                  </div>
                  <span className="sidebar-menu-arrow">▶</span>
                </button>
                <div ref={(el) => { submenuRefs.current.reportes = el; }} className={`sidebar-submenu ${expandedMenus.reportes ? 'expanded' : ''}`}>
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/admin/reportes/asistencias">
                    <span className="sidebar-icon" aria-hidden>✅</span>
                    <span className="sidebar-label">Asistencias</span>
                  </NavLink>
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/admin/reportes/notas">
                    <span className="sidebar-icon" aria-hidden>📊</span>
                    <span className="sidebar-label">Notas</span>
                  </NavLink>
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/admin/reportes/estadisticas">
                    <span className="sidebar-icon" aria-hidden>📈</span>
                    <span className="sidebar-label">Estadísticas</span>
                  </NavLink>
                </div>
              </div>
              <div className="sidebar-item">
                <NavLink className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} to="/admin/mensajes">
                  <span className="sidebar-icon">✉️</span>
                  <span className="sidebar-label">Mensajes</span>
                </NavLink>
              </div>
            </>
          ) : role === 'APODERADO' ? (
            <>
              <div className="sidebar-item">
                <NavLink className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} to="/apoderado/dashboard" end>
                  <span className="sidebar-icon">📊</span>
                  <span className="sidebar-label">Dashboard</span>
                </NavLink>
              </div>
              <div className="sidebar-item">
                <NavLink className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} to="/apoderado/perfil">
                  <span className="sidebar-icon">👤</span>
                  <span className="sidebar-label">Mi Perfil</span>
                </NavLink>
              </div>
              <div className="sidebar-item">
                <NavLink className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} to="/apoderado/hijos">
                  <span className="sidebar-icon">👨‍👩‍👧‍👦</span>
                  <span className="sidebar-label">Hijos a Cargo</span>
                </NavLink>
              </div>
              <div className="sidebar-item">
                <NavLink className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} to="/apoderado/comunicados">
                  <span className="sidebar-icon">📢</span>
                  <span className="sidebar-label">Comunicados</span>
                </NavLink>
              </div>
              <div className="sidebar-item">
                <NavLink className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} to="/apoderado/actividades">
                  <span className="sidebar-icon">📆</span>
                  <span className="sidebar-label">Actividades</span>
                </NavLink>
              </div>
              <div className="sidebar-item">
                <NavLink className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} to="/encuestas">
                  <span className="sidebar-icon">📋</span>
                  <span className="sidebar-label">Encuestas</span>
                </NavLink>
              </div>
              <div className="sidebar-item">
                <NavLink className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} to="/herramientas-examenes">
                  <span className="sidebar-icon">📝</span>
                  <span className="sidebar-label">Exámenes</span>
                </NavLink>
              </div>
              <div className="sidebar-item">
                <NavLink className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} to="/apoderado/mensajes">
                  <span className="sidebar-icon">✉️</span>
                  <span className="sidebar-label">Mensajes</span>
                </NavLink>
              </div>
            </>
          ) : (
            <>
              <div className="sidebar-item">
                <NavLink className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} to="/admin/dashboard" end>
                  <span className="sidebar-icon">📊</span>
                  <span className="sidebar-label">Dashboard</span>
                </NavLink>
              </div>
              <div className="sidebar-item">
                <NavLink className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} to="/admin/perfil">
                  <span className="sidebar-icon">👤</span>
                  <span className="sidebar-label">Mi Perfil</span>
                </NavLink>
              </div>
              {false && (
                <div className="sidebar-item">
                  <NavLink className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} to="/admin/estadisticas">
                    <span className="sidebar-icon">📈</span>
                    <span className="sidebar-label">Estadísticas</span>
                  </NavLink>
                </div>
              )}
              <div className="sidebar-item">
                <NavLink className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} to="/admin/matriculas">
                  <span className="sidebar-icon">📋</span>
                  <span className="sidebar-label">Matrículas</span>
                </NavLink>
              </div>
              <div className="sidebar-menu-item">
                <button
                  className={`sidebar-menu-toggle ${expandedMenus.usuarios ? 'expanded' : ''}`}
                  onClick={() => toggleSubmenu('usuarios')}
                >
                  <div className="sidebar-menu-toggle-content">
                    <span className="sidebar-icon">👥</span>
                    <span className="sidebar-label">Usuarios</span>
                  </div>
                  <span className="sidebar-menu-arrow">▶</span>
                </button>
                <div ref={(el) => { submenuRefs.current.usuarios = el; }} className={`sidebar-submenu ${expandedMenus.usuarios ? 'expanded' : ''}`}>
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/admin/usuarios/equipo">
                    <span className="sidebar-icon" aria-hidden>👔</span>
                    <span className="sidebar-label">Personal</span>
                  </NavLink>
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/admin/usuarios/alumnos">
                    <span className="sidebar-icon" aria-hidden>🎓</span>
                    <span className="sidebar-label">Alumnos</span>
                  </NavLink>
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/admin/usuarios/apoderados">
                    <span className="sidebar-icon" aria-hidden>👨‍👩‍👧</span>
                    <span className="sidebar-label">Apoderados</span>
                  </NavLink>
                </div>
              </div>
              <div className="sidebar-menu-item">
                <button
                  className={`sidebar-menu-toggle ${expandedMenus.academico ? 'expanded' : ''}`}
                  onClick={() => toggleSubmenu('academico')}
                >
                  <div className="sidebar-menu-toggle-content">
                    <span className="sidebar-icon">🎓</span>
                    <span className="sidebar-label">Académico</span>
                  </div>
                  <span className="sidebar-menu-arrow">▶</span>
                </button>
                <div ref={(el) => { submenuRefs.current.academico = el; }} className={`sidebar-submenu ${expandedMenus.academico ? 'expanded' : ''}`}>
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/admin/academico/niveles">
                    <span className="sidebar-icon" aria-hidden>🔢</span>
                    <span className="sidebar-label">Niveles</span>
                  </NavLink>
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/admin/academico/grados">
                    <span className="sidebar-icon" aria-hidden>📑</span>
                    <span className="sidebar-label">Grados</span>
                  </NavLink>
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/admin/academico/cursos">
                    <span className="sidebar-icon" aria-hidden>📚</span>
                    <span className="sidebar-label">Cursos</span>
                  </NavLink>
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/admin/academico/asignaturas">
                    <span className="sidebar-icon" aria-hidden>📖</span>
                    <span className="sidebar-label">Asignaturas</span>
                  </NavLink>
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/admin/academico/areas">
                    <span className="sidebar-icon" aria-hidden>🗂️</span>
                    <span className="sidebar-label">Áreas</span>
                  </NavLink>
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/admin/avatares">
                    <span className="sidebar-icon" aria-hidden>🎮</span>
                    <span className="sidebar-label">Gamificación</span>
                  </NavLink>
                </div>
              </div>
              <div className="sidebar-menu-item">
                <button
                  type="button"
                  className={`sidebar-menu-toggle ${expandedMenus.herramientas ? 'expanded' : ''}`}
                  onClick={() => toggleSubmenu('herramientas')}
                >
                  <div className="sidebar-menu-toggle-content">
                    <span className="sidebar-icon">🧰</span>
                    <span className="sidebar-label">Herramientas</span>
                  </div>
                  <span className="sidebar-menu-arrow">▶</span>
                </button>
                <div ref={(el) => { submenuRefs.current.herramientas = el; }} className={`sidebar-submenu ${expandedMenus.herramientas ? 'expanded' : ''}`}>
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/admin/documentos-gestion">
                    <span className="sidebar-icon" aria-hidden>📄</span>
                    <span className="sidebar-label">Documentos</span>
                  </NavLink>
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/admin/herramientas/examenes">
                    <span className="sidebar-icon" aria-hidden>📝</span>
                    <span className="sidebar-label">Examenes</span>
                  </NavLink>
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/admin/herramientas/encuestas">
                    <span className="sidebar-icon" aria-hidden>📋</span>
                    <span className="sidebar-label">Encuestas</span>
                  </NavLink>
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/admin/herramientas/vocabularios">
                    <span className="sidebar-icon" aria-hidden>📚</span>
                    <span className="sidebar-label">Vocabularios</span>
                  </NavLink>
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/admin/herramientas/supervision">
                    <span className="sidebar-icon" aria-hidden>🎯</span>
                    <span className="sidebar-label">Supervisión</span>
                  </NavLink>
                </div>
              </div>
              <div className="sidebar-menu-item">
                <button
                  type="button"
                  className={`sidebar-menu-toggle ${expandedMenus.comunicaciones ? 'expanded' : ''}`}
                  onClick={() => toggleSubmenu('comunicaciones')}
                >
                  <div className="sidebar-menu-toggle-content">
                    <span className="sidebar-icon">📣</span>
                    <span className="sidebar-label">Comunicaciones</span>
                  </div>
                  <span className="sidebar-menu-arrow">▶</span>
                </button>
                <div ref={(el) => { submenuRefs.current.comunicaciones = el; }} className={`sidebar-submenu ${expandedMenus.comunicaciones ? 'expanded' : ''}`}>
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/admin/comunicaciones/publicaciones">
                    <span className="sidebar-icon" aria-hidden>📰</span>
                    <span className="sidebar-label">Publicaciones</span>
                  </NavLink>
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/admin/comunicaciones/conexiones">
                    <span className="sidebar-icon" aria-hidden>🔗</span>
                    <span className="sidebar-label">Conexiones</span>
                  </NavLink>
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/admin/comunicaciones/incidencias">
                    <span className="sidebar-icon" aria-hidden>⚠️</span>
                    <span className="sidebar-label">Incidencias</span>
                  </NavLink>
                  <NavLink
                    className={({ isActive }) =>
                      `sidebar-sublink ${isActive || location.pathname === '/admin/vanguarcito' ? 'active' : ''}`
                    }
                    to="/admin/comunicaciones/chat-vanguard"
                  >
                    <span className="sidebar-icon" aria-hidden>💬</span>
                    <span className="sidebar-label">Chat Vanguard</span>
                  </NavLink>
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/admin/comunicaciones/actividades">
                    <span className="sidebar-icon" aria-hidden>📅</span>
                    <span className="sidebar-label">Actividades</span>
                  </NavLink>
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/admin/comunicaciones/comunicados">
                    <span className="sidebar-icon" aria-hidden>📢</span>
                    <span className="sidebar-label">Comunicados</span>
                  </NavLink>
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/admin/comunicaciones/notificaciones">
                    <span className="sidebar-icon" aria-hidden>🔔</span>
                    <span className="sidebar-label">Notificaciones</span>
                  </NavLink>
                </div>
              </div>
              <div className="sidebar-item">
                <NavLink className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} to="/admin/vanguarcito">
                  <span className="sidebar-icon">🤖</span>
                  <span className="sidebar-label">Vanguarcito</span>
                </NavLink>
              </div>
              <div className="sidebar-menu-item">
                <button
                  className={`sidebar-menu-toggle ${expandedMenus.reportes ? 'expanded' : ''}`}
                  onClick={() => toggleSubmenu('reportes')}
                >
                  <div className="sidebar-menu-toggle-content">
                    <span className="sidebar-icon">📈</span>
                    <span className="sidebar-label">Reportes</span>
                  </div>
                  <span className="sidebar-menu-arrow">▶</span>
                </button>
                <div ref={(el) => { submenuRefs.current.reportes = el; }} className={`sidebar-submenu ${expandedMenus.reportes ? 'expanded' : ''}`}>
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/admin/reportes/asistencias">
                    <span className="sidebar-icon" aria-hidden>✅</span>
                    <span className="sidebar-label">Asistencias</span>
                  </NavLink>
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/admin/reportes/notas">
                    <span className="sidebar-icon" aria-hidden>📊</span>
                    <span className="sidebar-label">Notas</span>
                  </NavLink>
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/admin/reportes/estadisticas">
                    <span className="sidebar-icon" aria-hidden>📈</span>
                    <span className="sidebar-label">Estadísticas</span>
                  </NavLink>
                </div>
              </div>
              <div className="sidebar-item">
                <NavLink className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} to="/admin/auditoria">
                  <span className="sidebar-icon">🧾</span>
                  <span className="sidebar-label">Auditoría</span>
                </NavLink>
              </div>
              <div className="sidebar-item">
                <NavLink className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} to="/admin/mensajes">
                  <span className="sidebar-icon">✉️</span>
                  <span className="sidebar-label">Mensajes</span>
                </NavLink>
              </div>
              <div className="sidebar-menu-item">
                <button
                  type="button"
                  className={`sidebar-menu-toggle ${expandedMenus.configuracion ? 'expanded' : ''}`}
                  onClick={() => toggleSubmenu('configuracion')}
                >
                  <div className="sidebar-menu-toggle-content">
                    <span className="sidebar-icon">⚙️</span>
                    <span className="sidebar-label">Configuración</span>
                  </div>
                  <span className="sidebar-menu-arrow">▶</span>
                </button>
                <div ref={(el) => { submenuRefs.current.configuracion = el; }} className={`sidebar-submenu ${expandedMenus.configuracion ? 'expanded' : ''}`}>
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/admin/config" end>
                    <span className="sidebar-icon" aria-hidden>📋</span>
                    <span className="sidebar-label">General</span>
                  </NavLink>
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/admin/config/cumpleanos">
                    <span className="sidebar-icon" aria-hidden>🎂</span>
                    <span className="sidebar-label">Cumpleaños</span>
                  </NavLink>
                </div>
              </div>
            </>
          )}

          <div className="sidebar-item">
            <button className="sidebar-link sidebar-link-button" type="button" onClick={logout}>
              <span className="sidebar-icon sidebar-icon-logout" aria-hidden="true">🚪</span>
              <span className="sidebar-label">Cerrar sesión</span>
            </button>
          </div>
        </nav>
      </aside>

      <div className="dashboard-content">
        <header className="dashboard-header">
          <button className="header-menu-btn" type="button" onClick={() => setSidebarOpen(true)} aria-label="Abrir menú">
            ☰
          </button>

          <div className="header-left">
            <div className="header-user">
              <div className="user-avatar">
                {userFotoUrl ? (
                  <img 
                    src={userFotoUrl} 
                    alt={displayName}
                    onError={(e) => {
                      e.target.style.display = 'none';
                      const span = e.target.parentElement.querySelector('span');
                      if (span) span.style.display = 'flex';
                    }}
                  />
                ) : null}
                <span style={{ display: userFotoUrl ? 'none' : 'flex' }}>{initials}</span>
              </div>
              <div className="user-info">
                <div className="user-name">{displayName}</div>
                <div className="user-role">{role}</div>
              </div>
            </div>
          </div>

          <div className="header-actions">
            {(role === 'DOCENTE' || role === 'ALUMNO' || role === 'APODERADO' || role === 'ADMINISTRADOR' || role === 'PROMOTORIA') && <NotificacionesWidget />}
            <button className="header-btn" type="button" title="Mi Perfil" onClick={() => navigate(role === 'DOCENTE' ? '/docente/perfil' : role === 'ALUMNO' ? '/alumno/perfil' : role === 'APODERADO' ? '/apoderado/perfil' : role === 'ADMINISTRADOR' || role === 'PROMOTORIA' ? '/admin/perfil' : '/perfil')}>
              👤
            </button>
            <button className="header-btn header-btn-logout" type="button" title="Cerrar sesión" onClick={logout}>
              <svg className="logout-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="12" r="9" stroke="#ef4444" strokeWidth="2" fill="none"/>
                <line x1="12" y1="3" x2="12" y2="12" stroke="#ef4444" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        </header>

        <div className={`dashboard-main-wrapper ${role === 'ADMINISTRADOR' || role === 'PROMOTORIA' ? 'dashboard-main-wrapper-no-sidebar' : ''}`}>
          <main className="dashboard-main">{children}</main>
          
          {/* Columna derecha (calendario, publicaciones): no se muestra para ADMINISTRADOR */}
          {(role === 'DOCENTE' || role === 'ALUMNO' || role === 'APODERADO') && (
            <aside className="dashboard-sidebar-right">
              {role === 'ALUMNO' && <AlumnoAvatarWidget />}
              <CalendarioWidget />
              {/* PublicacionesWidget anterior - Solo en web/tablet, para DOCENTE */}
              {role === 'DOCENTE' && (
                <div className="publicaciones-widget-sidebar">
                  <PublicacionesWidget />
                </div>
              )}
              {/* PublicacionesCardFeed para ALUMNO y APODERADO en web/tablet (igual diseño) */}
              {(role === 'ALUMNO' || role === 'APODERADO') && (
                <div className="publicaciones-widget-sidebar">
                  <PublicacionesCardFeed />
                </div>
              )}
              {/* Card amarillo de publicaciones - Solo en móvil (oculto en web/tablet) */}
              <div className="dashboard-section card-amarillo-section card-amarillo-sidebar">
                <div className="card-amarillo-vacio">
                  <h3 className="card-amarillo-title">Publicaciones</h3>
                  <div className="card-amarillo-separator"></div>
                  {role === 'DOCENTE' && (
                    <div className="card-amarillo-form-container">
                      <PublicacionFormCard onPublicacionCreada={() => setRefreshPublicaciones(prev => prev + 1)} />
                    </div>
                  )}
                  <div className="card-amarillo-feed-container">
                    <PublicacionesCardFeed refreshTrigger={refreshPublicaciones} />
                  </div>
                </div>
              </div>
            </aside>
          )}
        </div>

        {/* Prompt de instalación PWA */}
        <PWAInstallPrompt />
        
        {/* Notificación de actualización PWA */}
        <PWAUpdateNotification />

        {/* Encuesta activa: aviso una vez por encuesta (z-index sobre cumpleaños) */}
        <EncuestaActivacionModal />

        {/* Examen herramientas activo: mismo estilo; si hay encuesta pendiente, no compite (el otro componente espera) */}
        <HerramientasExamenActivacionModal />

        {/* Modal de bienvenida cumpleaños (plantilla ventana; z-index bajo comunicado home) */}
        <BirthdayWelcomeModal />

        {/* Modal de Asistencias */}
        {user?.tipo === 'DOCENTE' && (
          <ModalAsistencias 
            isOpen={mostrarModalAsistencias} 
            onClose={() => setMostrarModalAsistencias(false)} 
          />
        )}
      </div>
    </div>
  );
}


