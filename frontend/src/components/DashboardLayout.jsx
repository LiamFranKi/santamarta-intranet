import React, { useMemo, useState, useEffect, useRef } from 'react';
import { NavLink as RouterNavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useModulos } from '../context/ModulosContext';
import { claveDeRuta, CLAVES_CONFIG_PAGINA } from '../utils/modulosSistema';
import { useColegio } from '../context/ColegioContext';
import useIsMobileViewport from '../hooks/useIsMobileViewport';
import api from '../services/api';
import CalendarioWidget from './CalendarioWidget';
import AlumnoAvatarWidget from './AlumnoAvatarWidget';
import PublicacionesWidget from './PublicacionesWidget';
import PublicacionesCardFeed from './PublicacionesCardFeed';
import NotificacionesWidget from './NotificacionesWidget';
import PWAInstallPrompt from './PWAInstallPrompt';
import PWAUpdateNotification from './PWAUpdateNotification';
import ModalAsistencias from './ModalAsistencias';
import BirthdayWelcomeModal from './BirthdayWelcomeModal';
import ComunicadoHomeModal from './ComunicadoHomeModal';
import EncuestaActivacionModal from './EncuestaActivacionModal';
import HerramientasExamenActivacionModal from './HerramientasExamenActivacionModal';
import SgoiFlotante from './SgoiFlotante';
import ChatFlotante, { ChatEnLinea } from './ChatFlotante';
import { usuarioPuedeSgoi } from '../utils/sgoiFormat';
import { esPaqueteCoordinador, esPaqueteAcademico, esCoordinador } from '../utils/coordinadorAcceso';
import '../styles/CumpleMarcoFestivo.css';
import './DashboardLayout.css';

function NavLink(props) {
  const { activo, webActiva, alguno } = useModulos();
  const to = typeof props.to === 'string' ? props.to : '';
  const clave = claveDeRuta(to);
  if (clave === 'web.pagina') {
    if (!webActiva) return null;
  } else if (clave === 'config.pagina') {
    if (!alguno(CLAVES_CONFIG_PAGINA)) return null;
  } else if (clave && !activo(clave)) {
    return null;
  }
  return <RouterNavLink {...props} />;
}

function SiModulo({ id, children }) {
  const { activo } = useModulos();
  if (!activo(id)) return null;
  return children;
}

function SgoiSidebarItem() {
  const { activo } = useModulos();
  if (!activo('sgoi')) return null;
  return (
    <div className="sidebar-item">
      <NavLink
        className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
        to="/admin/gestion-operativa"
      >
        <span className="sidebar-icon">🔔</span>
        <span className="sidebar-label">Gestión operativa</span>
      </NavLink>
    </div>
  );
}

function AgendaInternaSidebarItem() {
  const { activo } = useModulos();
  if (!activo('agenda')) return null;
  return (
    <div className="sidebar-item">
      <NavLink
        className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
        to="/agenda-interna"
      >
        <span className="sidebar-icon">🗓️</span>
        <span className="sidebar-label">Agenda interna</span>
      </NavLink>
    </div>
  );
}

function BibliotecaSidebarItem() {
  const { activo } = useModulos();
  if (!activo('biblioteca')) return null;
  return (
    <div className="sidebar-item">
      <NavLink
        className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
        to="/biblioteca"
      >
        <span className="sidebar-icon">📚</span>
        <span className="sidebar-label">Biblioteca</span>
      </NavLink>
    </div>
  );
}

function ChatVanguardSidebarItem() {
  const { activo } = useModulos();
  if (!activo('comunicaciones.chat')) return null;
  return (
    <div className="sidebar-item">
      <NavLink
        className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
        to="/chat"
      >
        <span className="sidebar-icon">💬</span>
        <span className="sidebar-label">Chat Vanguard</span>
      </NavLink>
    </div>
  );
}

function IconoMascotaMenu() {
  const { mascotaImagen } = useColegio();
  const [falla, setFalla] = useState(false);
  if (!mascotaImagen || falla) {
    return <span className="sidebar-icon" aria-hidden>🤖</span>;
  }
  return (
    <img
      src={mascotaImagen}
      alt=""
      className="sidebar-icon sidebar-icon-mascota"
      onError={() => setFalla(true)}
    />
  );
}

function VanguarcitoSidebarItem() {
  const { activo } = useModulos();
  const { mascotaNombre } = useColegio();
  if (!activo('herramientas.vanguarcito')) return null;
  return (
    <div className="sidebar-item">
      <NavLink
        className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
        to="/vanguarcito"
      >
        <IconoMascotaMenu />
        <span className="sidebar-label">{mascotaNombre}</span>
      </NavLink>
    </div>
  );
}

function getInitials(nombre) {
  if (!nombre) return 'U';
  const parts = String(nombre).trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase()).join('') || 'U';
}

/** Una línea corta para el header: nivel antes del grado, sección y año (aula docente). */
function textoUbicacionAulaDocente(ctx) {
  if (!ctx) return '';
  const nivel = String(ctx.nivel_nombre || '').trim();
  const grado =
    ctx.grado != null && String(ctx.grado).trim() !== '' ? `${String(ctx.grado).trim()}°` : '';
  const seccion = String(ctx.seccion || '').trim();
  const año = ctx.anio != null && String(ctx.anio).trim() !== '' ? String(ctx.anio).trim() : '';
  const ubic = [nivel || null, grado || null, seccion || null].filter(Boolean).join(' ');
  return ubic && año ? `${ubic} · ${año}` : ubic || año || '';
}

function tituloUbicacionAulaDocente(ctx) {
  if (!ctx) return '';
  const curso = String(ctx.curso_nombre || '').trim();
  const u = textoUbicacionAulaDocente(ctx);
  if (curso && u) return `${curso} — ${u}`;
  return curso || u;
}

export default function DashboardLayout({ children }) {
  const { user, logout } = useAuth();
  const { activo, alguno, webActiva, configActiva } = useModulos();
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobileViewport();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [expandedMenus, setExpandedMenus] = useState({});
  const sidebarNavRef = useRef(null);
  const submenuRefs = useRef({
    usuarios: null,
    academico: null,
    reportes: null,
    herramientas: null,
    comunicaciones: null,
    pagosFacturas: null,
    configuracion: null,
    docenteHerramientas: null,
    alumnoHerramientas: null,
    psicologaCom: null,
    psicologaUsuarios: null,
    psicologaAcademico: null,
    psicologaHerramientas: null,
    coordinadorUsuarios: null,
    coordinadorAcademico: null,
    coordinadorHerramientas: null,
    coordinadorCom: null,
  });

  // Mantener abierto el submenú que contiene la ruta actual (evita que se "bloquee" la navegación en Config, etc.)
  useEffect(() => {
    const path = location.pathname || '';
    setExpandedMenus(prev => ({
      ...prev,
      ...(path.startsWith('/admin/usuarios') && { usuarios: true }),
      ...((path.startsWith('/admin/academico') || path.startsWith('/admin/cneb') || path.startsWith('/admin/avatares') || path.startsWith('/admin/gamificacion') || path.startsWith('/admin/horario-gen')) && { academico: true }),
      ...(path.startsWith('/admin/reportes') && { reportes: true }),
      ...(
        (
          path.startsWith('/admin/herramientas')
          || path.startsWith('/admin/documentos-gestion')
          || path.startsWith('/vanguarcito')
          || path.startsWith('/admin/vanguarcito')
        ) && { herramientas: true }
      ),
      ...(path.startsWith('/admin/comunicaciones') && !path.startsWith('/admin/comunicaciones/web') && { comunicaciones: true }),
      ...(path.startsWith('/admin/pagos-facturas') && { pagosFacturas: true }),
      ...(path.startsWith('/admin/config') && { configuracion: true }),
      ...(
        (
          path.startsWith('/docente/herramientas')
          || path === '/docente/supervision'
          || path.startsWith('/elecciones-campana')
        ) && { docenteHerramientas: true }
      ),
      ...(((path.startsWith('/admin/comunicaciones') && !path.startsWith('/admin/comunicaciones/web'))
        || path.startsWith('/admin/reportes/incidencias'))
        && user?.tipo === 'PSICOLOGA'
        ? { psicologaCom: true }
        : {}),
      ...(path.startsWith('/admin/usuarios/alumnos') || path.startsWith('/admin/usuarios/apoderados')
        ? { psicologaUsuarios: true }
        : {}),
      ...(path.startsWith('/admin/academico/grados') ? { psicologaAcademico: true } : {}),
      ...(
        (
          path.startsWith('/docente/herramientas')
          || path.startsWith('/herramientas-examenes')
          || path.startsWith('/encuestas')
          || path.startsWith('/admin/herramientas/reuniones')
        ) && user?.tipo === 'PSICOLOGA'
          ? { psicologaHerramientas: true }
          : {}
      ),
      ...(path.startsWith('/admin/usuarios') && esPaqueteCoordinador(user?.tipo) ? { coordinadorUsuarios: true } : {}),
      ...((path.startsWith('/admin/academico') || path.startsWith('/admin/cneb')) && esPaqueteAcademico(user?.tipo) ? { coordinadorAcademico: true } : {}),
      ...(
        (
          path.startsWith('/admin/documentos-gestion')
          || path.startsWith('/docente/herramientas')
          || path.startsWith('/admin/herramientas')
          || path.startsWith('/herramientas-examenes')
          || path.startsWith('/encuestas')
          || path.startsWith('/elecciones-campana')
        ) && esPaqueteCoordinador(user?.tipo)
          ? { coordinadorHerramientas: true }
          : {}
      ),
      ...(path.startsWith('/admin/comunicaciones') && !path.startsWith('/admin/comunicaciones/web') && esPaqueteCoordinador(user?.tipo)
        ? { coordinadorCom: true }
        : {}),
      ...(
        (
          path.startsWith('/alumno/herramientas') ||
          path.startsWith('/alumno/vocabularios') ||
          path.startsWith('/alumno/elecciones') ||
          path.startsWith('/herramientas-examenes') ||
          path.startsWith('/encuestas')
        ) && { alumnoHerramientas: true }
      ),
    }));
  }, [location.pathname, user?.tipo]);

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
    es_tutor: false,
    es_tutoria_general: false,
    es_cajero_caja_chica: false,
  });
  const [tieneAsignaciones, setTieneAsignaciones] = useState({
    tiene_grupos: false,
    tiene_cursos: false
  });
  const [mostrarModalAsistencias, setMostrarModalAsistencias] = useState(false);
  const [tienePersonalAsistencias, setTienePersonalAsistencias] = useState(false);
  const [esSupervisorSupervision, setEsSupervisorSupervision] = useState(false);
  /** Contexto del aula (solo docente en rutas /docente/cursos/:id/aula o tutor aula-virtual). */
  const [docenteAulaUbicacion, setDocenteAulaUbicacion] = useState(null);
  
  // Debug: verificar que el componente se monta
  React.useEffect(() => {
    console.log('✅ [DASHBOARD LAYOUT] Componente montado, user:', user?.tipo);
  }, [user]);

  const tiposConPosiblePersonal = [
    'DOCENTE',
    'ADMINISTRADOR',
    'SECRETARIA',
    'PROMOTORIA',
    'PSICOLOGA',
    'DIRECTOR',
    'ASISTENCIA',
    'COORDINADOR',
    'CONTADOR',
  ];

  useEffect(() => {
    const abrirAsistencias = () => setMostrarModalAsistencias(true);
    window.addEventListener('vanguard:abrir-asistencias', abrirAsistencias);
    return () => window.removeEventListener('vanguard:abrir-asistencias', abrirAsistencias);
  }, []);

  // Notificación de tardanza propia (o link con #mis-asistencias)
  useEffect(() => {
    const openIfHash = () => {
      if (typeof window === 'undefined') return;
      if (window.location.hash === '#mis-asistencias') {
        setMostrarModalAsistencias(true);
      }
    };
    openIfHash();
    window.addEventListener('hashchange', openIfHash);
    return () => window.removeEventListener('hashchange', openIfHash);
  }, []);

  useEffect(() => {
    if (!user?.tipo || !tiposConPosiblePersonal.includes(user.tipo)) {
      setTienePersonalAsistencias(false);
      return undefined;
    }
    let cancelled = false;
    api
      .get('/personal/tardanzas/mi-mes')
      .then((res) => {
        if (!cancelled) setTienePersonalAsistencias(!!res.data?.tiene_personal);
      })
      .catch(() => {
        if (!cancelled) setTienePersonalAsistencias(user.tipo === 'DOCENTE');
      });
    return () => {
      cancelled = true;
    };
  }, [user?.tipo]);

  // Docente: roles + asignaciones + supervisión. Admin/Promotoría con personal_id: solo roles-adicionales (apoderado/tutor vía DNI).
  useEffect(() => {
    let cancelled = false;

    /** No usar user.personal_id del frontend: login/me no lo enviaban hasta reciente; el JWT sí lleva personal_id y la API lo resuelve. */
    const cargarRolesAdicionalesSolo = async () => {
      try {
        const responseRoles = await api.get('/docente/roles-adicionales');
        if (cancelled) return;
        setRolesAdicionales({
          es_apoderado: responseRoles.data.es_apoderado || false,
          es_tutor: responseRoles.data.es_tutor || false,
          es_tutoria_general: responseRoles.data.es_tutoria_general || false,
          es_cajero_caja_chica: responseRoles.data.es_cajero_caja_chica || false,
        });
      } catch {
        if (!cancelled) {
          setRolesAdicionales({
            es_apoderado: false,
            es_tutor: false,
            es_tutoria_general: false,
            es_cajero_caja_chica: false,
          });
        }
      }
    };

    const cargarDatosDocente = async () => {
      if (user?.tipo !== 'DOCENTE') return;
      try {
        const [responseRoles, responseAsignaciones, sup] = await Promise.all([
          api.get('/docente/roles-adicionales'),
          api.get('/docente/tiene-asignaciones'),
          api.get('/supervision/yo').catch(() => ({ data: {} })),
        ]);
        if (cancelled) return;
        setRolesAdicionales({
          es_apoderado: responseRoles.data.es_apoderado || false,
          es_tutor: responseRoles.data.es_tutor || false,
          es_tutoria_general: responseRoles.data.es_tutoria_general || false,
          es_cajero_caja_chica: responseRoles.data.es_cajero_caja_chica || false,
        });
        setTieneAsignaciones({
          tiene_grupos: responseAsignaciones.data.tiene_grupos || false,
          tiene_cursos: responseAsignaciones.data.tiene_cursos || false
        });
        setEsSupervisorSupervision(!!(sup.data?.is_supervisor || sup.data?.is_admin || sup.data?.is_supervisado));
      } catch (error) {
        console.error('Error cargando datos del docente:', error);
        if (!cancelled) {
          setTieneAsignaciones({ tiene_grupos: false, tiene_cursos: false });
          setEsSupervisorSupervision(false);
        }
      }
    };

    const resetNoDocenteAcademico = () => {
      setTieneAsignaciones({ tiene_grupos: false, tiene_cursos: false });
      setEsSupervisorSupervision(false);
    };

    if (user?.tipo === 'DOCENTE') {
      cargarDatosDocente();
    } else if (
      user?.tipo === 'ADMINISTRADOR'
      || user?.tipo === 'PROMOTORIA'
      || user?.tipo === 'SECRETARIA'
      || user?.tipo === 'PSICOLOGA'
      || user?.tipo === 'COORDINADOR'
      || user?.tipo === 'DIRECTOR'
      || user?.tipo === 'CONTADOR'
    ) {
      resetNoDocenteAcademico();
      cargarRolesAdicionalesSolo();
    } else {
      setRolesAdicionales({
        es_apoderado: false,
        es_tutor: false,
        es_tutoria_general: false,
        es_cajero_caja_chica: false,
      });
      resetNoDocenteAcademico();
    }

    return () => {
      cancelled = true;
    };
  }, [user]);

  // Docente: en el aula virtual, una línea bajo el rol con nivel + grado + sección + año (y nombre de curso en title).
  useEffect(() => {
    if (user?.tipo !== 'DOCENTE') {
      setDocenteAulaUbicacion(null);
      return undefined;
    }
    const path = location.pathname || '';
    const matchCursos = path.match(/^\/docente\/cursos\/(\d+)\/aula$/);
    const matchTutor = path.match(/^\/docente\/tutoria\/grupos\/(\d+)\/aula-virtual\/(\d+)/);
    const matchTutoriaGeneral = path.match(/^\/docente\/tutoria-general\/grupos\/(\d+)\/aula-virtual\/(\d+)/);
    if (!matchCursos && !matchTutor && !matchTutoriaGeneral) {
      setDocenteAulaUbicacion(null);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        let found = null;
        if (matchCursos) {
          const asigId = matchCursos[1];
          const { data } = await api.get('/docente/cursos');
          const lista = data.cursos || [];
          found = lista.find(
            (c) =>
              String(c.id) === String(asigId) || String(c.asignatura_id) === String(asigId)
          );
        } else if (matchTutor || matchTutoriaGeneral) {
          const [, grupoId, asigId] = matchTutor || matchTutoriaGeneral;
          const apiBase = matchTutoriaGeneral ? '/docente/tutoria-general' : '/docente/tutoria';
          const { data } = await api.get(`${apiBase}/grupos/${grupoId}/cursos`);
          const lista = data.cursos || [];
          found = lista.find(
            (c) =>
              String(c.id) === String(asigId) || String(c.asignatura_id) === String(asigId)
          );
        }
        if (cancelled) return;
        setDocenteAulaUbicacion(
          found
            ? {
                curso_nombre: found.curso_nombre,
                nivel_nombre: found.nivel_nombre,
                grado: found.grado,
                seccion: found.seccion,
                anio: found.anio,
              }
            : null
        );
      } catch (e) {
        if (!cancelled) setDocenteAulaUbicacion(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.tipo, location.pathname]);

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

  const { logoBlanco, textoIntranet, mascotaNombre } = useColegio();
  const marcaIntranet = (textoIntranet || '').trim() || 'VanguardNet';
  const logoUrl = useMemo(() => {
    if (logoBlanco) {
      const raw = String(logoBlanco);
      if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
      return `${apiBaseUrl}${raw.startsWith('/') ? raw : `/${raw}`}`;
    }
    return `${apiBaseUrl}/assets/logos/logoblanco.png`;
  }, [apiBaseUrl, logoBlanco]);

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
  const puedeVerSgoi = usuarioPuedeSgoi(role);
  const docenteLineaUbicacionAula =
    user?.tipo === 'DOCENTE' ? textoUbicacionAulaDocente(docenteAulaUbicacion) : '';
  const docenteTituloUbicacionAula =
    user?.tipo === 'DOCENTE' ? tituloUbicacionAulaDocente(docenteAulaUbicacion) : '';
  
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
      fotoUrl = user.foto
        .replace(/https?:\/\/nuevo\.vanguardschools\.edu\.pe/gi, 'https://sistema.vanguardschools.edu.pe')
        .replace(/https?:\/\/(www\.)?vanguardschools\.edu\.pe/gi, 'https://sistema.vanguardschools.edu.pe');
      if (fotoUrl.includes('/uploads/')) {
        fotoUrl = fotoUrl.replace(
          /https?:\/\/[^/]+\/uploads/g,
          `${currentProtocol}//${currentHost}/uploads`
        );
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
    const phpSystemUrl = 'https://sistema.vanguardschools.edu.pe';
    const isProduction = currentHost !== 'localhost' && currentHost !== '127.0.0.1';
    
    if (isProduction) {
      // Producción: usar el dominio del sistema PHP
      return `${phpSystemUrl}/Static/Image/Fotos/${fotoNombre}`;
    } else {
      // Desarrollo: usar localhost
      return `http://localhost:5000/Static/Image/Fotos/${fotoNombre}`;
    }
  }, [user?.foto, user?.foto_nombre]);

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
          <div
            className="sidebar-logo"
            role="button"
            tabIndex={0}
            onClick={() =>
              navigate(
                role === 'DOCENTE'
                  ? '/docente/dashboard'
                  : role === 'ALUMNO'
                    ? '/alumno/dashboard'
                    : role === 'APODERADO'
                      ? '/apoderado/dashboard'
                      : role === 'PSICOLOGA'
                        ? '/admin/psicologa-dashboard'
                        : role === 'ADMINISTRADOR'
                          ? '/admin/dashboard'
                          : role === 'PROMOTORIA'
                            ? '/promotoria/dashboard'
                            : esPaqueteCoordinador(role)
                              ? '/docente/dashboard'
                            : role === 'SECRETARIA'
                              ? '/admin/dashboard'
                              : '/admin/dashboard'
              )
            }
          >
            {logoUrl ? (
              <img className="sidebar-logo-image" src={logoUrl} alt="Logo" />
            ) : (
              <div className="sidebar-logo-fallback">🏫</div>
            )}
            <div className="logo-text">{marcaIntranet}</div>
          </div>

          <button className="sidebar-close-btn" type="button" onClick={() => setSidebarOpen(false)} aria-label="Cerrar menú">
            ✕
          </button>
        </div>

        <nav className="sidebar-nav" ref={sidebarNavRef}>
          {role === 'KIOSCO' ? (
            <>
              <div className="sidebar-item">
                <NavLink className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} to="/kiosco">
                  <span className="sidebar-icon">☕</span>
                  <span className="sidebar-label">Kiosco cafetín</span>
                </NavLink>
              </div>
            </>
          ) : role === 'DOCENTE' ? (
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
              <VanguarcitoSidebarItem />
              {activo('mis-asistencias') && (
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
              )}
              <div className="sidebar-item">
                <NavLink
                  className={() =>
                    `sidebar-link ${location.pathname.startsWith('/docente/psicologia') ? 'active' : ''}`
                  }
                  to="/docente/psicologia"
                >
                  <span className="sidebar-icon">🧠</span>
                  <span className="sidebar-label">Psicología</span>
                </NavLink>
              </div>
              {alguno(['herramientas.documentos', 'herramientas.examenes', 'herramientas.encuestas', 'herramientas.vocabularios', 'herramientas.fichas', 'herramientas.supervision', 'herramientas.reuniones', 'herramientas.elecciones']) && (
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
                      🎯
                    </span>
                    <span className="sidebar-label">Exámenes</span>
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
                  <NavLink
                    className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`}
                    to="/docente/herramientas/disenador-fichas"
                  >
                    <span className="sidebar-icon" aria-hidden>
                      ✨
                    </span>
                    <span className="sidebar-label">Fichas IA</span>
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
                  <NavLink
                    className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`}
                    to="/docente/herramientas/reuniones"
                  >
                    <span className="sidebar-icon" aria-hidden>
                      🤝
                    </span>
                    <span className="sidebar-label">Reuniones</span>
                  </NavLink>
                  <NavLink
                    className={({ isActive }) =>
                      `sidebar-sublink ${isActive || location.pathname.startsWith('/elecciones-campana') ? 'active' : ''}`
                    }
                    to="/elecciones-campana"
                  >
                    <span className="sidebar-icon" aria-hidden>
                      🗳️
                    </span>
                    <span className="sidebar-label">Elecciones</span>
                  </NavLink>
                </div>
              </div>
              )}
              {activo('kiosco') && (
              <div className="sidebar-item">
                <NavLink className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} to="/kiosco">
                  <span className="sidebar-icon">☕</span>
                  <span className="sidebar-label">Kiosco cafetín</span>
                </NavLink>
              </div>
              )}

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
                      <span className="sidebar-label">Estudiantes a Cargo</span>
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

              {rolesAdicionales.es_tutoria_general && (
                <>
                  {!rolesAdicionales.es_apoderado && !rolesAdicionales.es_tutor && (
                    <div className="sidebar-section-divider"></div>
                  )}
                  <div className="sidebar-section-label" style={{
                    fontSize: '0.75rem',
                    color: '#9ca3af',
                    fontWeight: '600',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    padding: '1rem 1.5rem 0.5rem 1.5rem',
                    marginTop: (rolesAdicionales.es_apoderado || rolesAdicionales.es_tutor) ? '0' : '0.5rem'
                  }}>
                    Supervisión
                  </div>
                  <div className="sidebar-item">
                    <NavLink className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} to="/docente/tutoria-general">
                      <span className="sidebar-icon">👁️</span>
                      <span className="sidebar-label">Tutoría General</span>
                    </NavLink>
                  </div>
                </>
              )}

              {rolesAdicionales.es_cajero_caja_chica && activo('pagos.caja') && (
                <>
                  <div className="sidebar-section-divider"></div>
                  <div
                    className="sidebar-section-label"
                    style={{
                      fontSize: '0.75rem',
                      color: '#9ca3af',
                      fontWeight: '600',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      padding: '1rem 1.5rem 0.5rem 1.5rem',
                      marginTop: '0.5rem',
                    }}
                  >
                    Caja
                  </div>
                  <div className="sidebar-item">
                    <NavLink
                      className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
                      to="/admin/pagos-facturas/caja-chica"
                    >
                      <span className="sidebar-icon">💵</span>
                      <span className="sidebar-label">Caja Chica</span>
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
              <AgendaInternaSidebarItem />
              <BibliotecaSidebarItem />
              <ChatVanguardSidebarItem />
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
              <BibliotecaSidebarItem />
              <ChatVanguardSidebarItem />
              <div className="sidebar-item">
                <NavLink className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} to="/alumno/horario">
                  <span className="sidebar-icon">📅</span>
                  <span className="sidebar-label">Mi Horario</span>
                </NavLink>
              </div>
              <VanguarcitoSidebarItem />
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
              {alguno(['herramientas.encuestas', 'herramientas.examenes', 'herramientas.vocabularios', 'herramientas.elecciones', 'herramientas.documentos']) && (
              <div className="sidebar-menu-item">
                <button
                  type="button"
                  className={`sidebar-menu-toggle ${expandedMenus.alumnoHerramientas ? 'expanded' : ''}`}
                  onClick={() => toggleSubmenu('alumnoHerramientas')}
                >
                  <div className="sidebar-menu-toggle-content">
                    <span className="sidebar-icon">🧰</span>
                    <span className="sidebar-label">Herramientas</span>
                  </div>
                  <span className="sidebar-menu-arrow">▶</span>
                </button>
                <div
                  ref={(el) => {
                    submenuRefs.current.alumnoHerramientas = el;
                  }}
                  className={`sidebar-submenu ${expandedMenus.alumnoHerramientas ? 'expanded' : ''}`}
                >
                  <NavLink
                    className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`}
                    to="/encuestas"
                  >
                    <span className="sidebar-icon" aria-hidden>
                      📋
                    </span>
                    <span className="sidebar-label">Encuestas</span>
                  </NavLink>
                  <NavLink
                    className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`}
                    to="/herramientas-examenes"
                  >
                    <span className="sidebar-icon" aria-hidden>
                      📝
                    </span>
                    <span className="sidebar-label">Exámenes</span>
                  </NavLink>
                  <NavLink
                    className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`}
                    to="/alumno/vocabularios"
                  >
                    <span className="sidebar-icon" aria-hidden>
                      📚
                    </span>
                    <span className="sidebar-label">Vocabularios</span>
                  </NavLink>
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/alumno/elecciones">
                    <span className="sidebar-icon" aria-hidden>
                      🗳️
                    </span>
                    <span className="sidebar-label">Elecciones</span>
                  </NavLink>
                  <NavLink
                    className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`}
                    to="/alumno/herramientas/documentos"
                  >
                    <span className="sidebar-icon" aria-hidden>
                      📄
                    </span>
                    <span className="sidebar-label">Documentos</span>
                  </NavLink>
                </div>
              </div>
              )}
              {activo('kiosco') && (
              <div className="sidebar-item">
                <NavLink className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} to="/kiosco">
                  <span className="sidebar-icon">☕</span>
                  <span className="sidebar-label">Kiosco cafetín</span>
                </NavLink>
              </div>
              )}
              <div className="sidebar-item">
                <NavLink className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} to="/alumno/actividades">
                  <span className="sidebar-icon">📆</span>
                  <span className="sidebar-label">Actividades</span>
                </NavLink>
              </div>
              <div className="sidebar-item">
                <NavLink className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} to="/alumno/reuniones">
                  <span className="sidebar-icon">🤝</span>
                  <span className="sidebar-label">Reuniones</span>
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
              {puedeVerSgoi && <SgoiSidebarItem />}
              <AgendaInternaSidebarItem />
              <BibliotecaSidebarItem />
              <ChatVanguardSidebarItem />
              <VanguarcitoSidebarItem />
              <SiModulo id="psicologia">
              <div className="sidebar-item">
                <NavLink className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} to="/admin/psicologia">
                  <span className="sidebar-icon">🧠</span>
                  <span className="sidebar-label">Psicología</span>
                </NavLink>
              </div>
              </SiModulo>
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
                <NavLink className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} to="/admin/comunicaciones/eventos">
                  <span className="sidebar-icon">🎪</span>
                  <span className="sidebar-label">Eventos</span>
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
                <NavLink className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} to="/admin/herramientas/reuniones">
                  <span className="sidebar-icon">🤝</span>
                  <span className="sidebar-label">Reuniones</span>
                </NavLink>
              </div>
              <div className="sidebar-item">
                <NavLink className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} to="/admin/herramientas/elecciones">
                  <span className="sidebar-icon">🗳️</span>
                  <span className="sidebar-label">Elecciones</span>
                </NavLink>
              </div>
              <div className="sidebar-item">
                <NavLink className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} to="/admin/comunicaciones/notificaciones">
                  <span className="sidebar-icon">🔔</span>
                  <span className="sidebar-label">Notificaciones</span>
                </NavLink>
              </div>
              {alguno(['reportes.general', 'reportes.temas', 'reportes.notas', 'reportes.deudores', 'reportes.asistencias', 'reportes.estadisticas', 'reportes.incidencias']) && (
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
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/admin/reportes/general">
                    <span className="sidebar-icon" aria-hidden>🗂️</span>
                    <span className="sidebar-label">General</span>
                  </NavLink>
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/admin/reportes/temas">
                    <span className="sidebar-icon" aria-hidden>📚</span>
                    <span className="sidebar-label">Temas</span>
                  </NavLink>
                  {activo('reportes.asistencias') && (
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/admin/reportes/asistencias">
                    <span className="sidebar-icon" aria-hidden>✅</span>
                    <span className="sidebar-label">Asistencias</span>
                  </NavLink>
                  )}
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/admin/reportes/notas">
                    <span className="sidebar-icon" aria-hidden>📊</span>
                    <span className="sidebar-label">Notas</span>
                  </NavLink>
                  {activo('reportes.estadisticas') && (
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/admin/reportes/estadisticas">
                    <span className="sidebar-icon" aria-hidden>📈</span>
                    <span className="sidebar-label">Estadísticas</span>
                  </NavLink>
                  )}
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/admin/reportes/deudores">
                    <span className="sidebar-icon" aria-hidden>📋</span>
                    <span className="sidebar-label">Deudores</span>
                  </NavLink>
                  {activo('reportes.incidencias') && (
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/admin/reportes/incidencias">
                    <span className="sidebar-icon" aria-hidden>⚠️</span>
                    <span className="sidebar-label">Incidencias</span>
                  </NavLink>
                  )}
                </div>
              </div>
              )}
              {activo('kiosco') && (
              <div className="sidebar-item">
                <NavLink className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} to="/kiosco">
                  <span className="sidebar-icon">☕</span>
                  <span className="sidebar-label">Kiosco cafetín</span>
                </NavLink>
              </div>
              )}
              {rolesAdicionales.es_apoderado && (
                <>
                  <div className="sidebar-section-divider"></div>
                  <div
                    className="sidebar-section-label"
                    style={{
                      fontSize: '0.75rem',
                      color: '#9ca3af',
                      fontWeight: '600',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      padding: '1rem 1.5rem 0.5rem 1.5rem',
                      marginTop: '0.5rem'
                    }}
                  >
                    Como Apoderado
                  </div>
                  <div className="sidebar-item">
                    <NavLink className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} to="/docente/hijos">
                      <span className="sidebar-icon">👨‍👩‍👧‍👦</span>
                      <span className="sidebar-label">Estudiantes a Cargo</span>
                    </NavLink>
                  </div>
                </>
              )}
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
                  <span className="sidebar-label">Mi perfil</span>
                </NavLink>
              </div>
              <div className="sidebar-item">
                <NavLink className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} to="/apoderado/hijos">
                  <span className="sidebar-icon">👨‍👩‍👧‍👦</span>
                  <span className="sidebar-label">Estudiantes a Cargo</span>
                </NavLink>
              </div>
              <BibliotecaSidebarItem />
              <ChatVanguardSidebarItem />
              <div className="sidebar-item">
                <NavLink className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} to="/apoderado/psicologia">
                  <span className="sidebar-icon">🧠</span>
                  <span className="sidebar-label">Psicología</span>
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
                <NavLink className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} to="/apoderado/reuniones">
                  <span className="sidebar-icon">🤝</span>
                  <span className="sidebar-label">Reuniones</span>
                </NavLink>
              </div>
              <div className="sidebar-item">
                <NavLink className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} to="/apoderado/documentos">
                  <span className="sidebar-icon">📄</span>
                  <span className="sidebar-label">Documentos</span>
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
                <NavLink
                  className={({ isActive }) =>
                    `sidebar-link ${isActive || location.pathname.startsWith('/elecciones-campana') ? 'active' : ''}`
                  }
                  to="/elecciones-campana"
                >
                  <span className="sidebar-icon">🗳️</span>
                  <span className="sidebar-label">Elecciones</span>
                </NavLink>
              </div>
              {activo('kiosco') && (
              <div className="sidebar-item">
                <NavLink className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} to="/kiosco">
                  <span className="sidebar-icon">☕</span>
                  <span className="sidebar-label">Kiosco cafetín</span>
                </NavLink>
              </div>
              )}
              <div className="sidebar-item">
                <NavLink className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} to="/apoderado/mensajes">
                  <span className="sidebar-icon">✉️</span>
                  <span className="sidebar-label">Mensajes</span>
                </NavLink>
              </div>
            </>
          ) : role === 'PSICOLOGA' ? (
            <>
              <div className="sidebar-item">
                <NavLink className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} to="/admin/psicologa-dashboard" end>
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
              {tienePersonalAsistencias && activo('mis-asistencias') && (
                <div className="sidebar-item">
                  <button
                    type="button"
                    className="sidebar-link"
                    onClick={() => setMostrarModalAsistencias(true)}
                    style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }}
                  >
                    <span className="sidebar-icon">⏰</span>
                    <span className="sidebar-label">Mis Asistencias</span>
                  </button>
                </div>
              )}
              <div className="sidebar-item">
                <NavLink className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} to="/admin/psicologia" end>
                  <span className="sidebar-icon">🧠</span>
                  <span className="sidebar-label">Psicología</span>
                </NavLink>
              </div>
              <BibliotecaSidebarItem />
              <ChatVanguardSidebarItem />
              <VanguarcitoSidebarItem />
              {alguno(['usuarios.alumnos', 'usuarios.apoderados']) && (
              <div className="sidebar-menu-item">
                <button
                  type="button"
                  className={`sidebar-menu-toggle ${expandedMenus.psicologaUsuarios ? 'expanded' : ''}`}
                  onClick={() => toggleSubmenu('psicologaUsuarios')}
                >
                  <div className="sidebar-menu-toggle-content">
                    <span className="sidebar-icon">👥</span>
                    <span className="sidebar-label">Usuarios</span>
                  </div>
                  <span className="sidebar-menu-arrow">▶</span>
                </button>
                <div
                  ref={(el) => {
                    submenuRefs.current.psicologaUsuarios = el;
                  }}
                  className={`sidebar-submenu ${expandedMenus.psicologaUsuarios ? 'expanded' : ''}`}
                >
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/admin/usuarios/alumnos">
                    <span className="sidebar-icon" aria-hidden>
                      🎓
                    </span>
                    <span className="sidebar-label">Alumnos</span>
                  </NavLink>
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/admin/usuarios/apoderados">
                    <span className="sidebar-icon" aria-hidden>
                      👨‍👩‍👧
                    </span>
                    <span className="sidebar-label">Apoderados</span>
                  </NavLink>
                </div>
              </div>
              )}
              {activo('academico.grados') && (
              <div className="sidebar-menu-item">
                <button
                  type="button"
                  className={`sidebar-menu-toggle ${expandedMenus.psicologaAcademico ? 'expanded' : ''}`}
                  onClick={() => toggleSubmenu('psicologaAcademico')}
                >
                  <div className="sidebar-menu-toggle-content">
                    <span className="sidebar-icon">🎓</span>
                    <span className="sidebar-label">Académico</span>
                  </div>
                  <span className="sidebar-menu-arrow">▶</span>
                </button>
                <div
                  ref={(el) => {
                    submenuRefs.current.psicologaAcademico = el;
                  }}
                  className={`sidebar-submenu ${expandedMenus.psicologaAcademico ? 'expanded' : ''}`}
                >
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/admin/academico/grados">
                    <span className="sidebar-icon" aria-hidden>
                      📑
                    </span>
                    <span className="sidebar-label">Grados</span>
                  </NavLink>
                </div>
              </div>
              )}
              {alguno(['herramientas.documentos', 'herramientas.examenes', 'herramientas.encuestas', 'herramientas.vocabularios', 'herramientas.reuniones']) && (
              <div className="sidebar-menu-item">
                <button
                  type="button"
                  className={`sidebar-menu-toggle ${expandedMenus.psicologaHerramientas ? 'expanded' : ''}`}
                  onClick={() => toggleSubmenu('psicologaHerramientas')}
                >
                  <div className="sidebar-menu-toggle-content">
                    <span className="sidebar-icon">🧰</span>
                    <span className="sidebar-label">Herramientas</span>
                  </div>
                  <span className="sidebar-menu-arrow">▶</span>
                </button>
                <div
                  ref={(el) => {
                    submenuRefs.current.psicologaHerramientas = el;
                  }}
                  className={`sidebar-submenu ${expandedMenus.psicologaHerramientas ? 'expanded' : ''}`}
                >
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/docente/herramientas/documentos">
                    <span className="sidebar-icon" aria-hidden>
                      📄
                    </span>
                    <span className="sidebar-label">Documentos</span>
                  </NavLink>
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/docente/herramientas/examenes">
                    <span className="sidebar-icon" aria-hidden>
                      🎯
                    </span>
                    <span className="sidebar-label">Exámenes</span>
                  </NavLink>
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/docente/herramientas/encuestas">
                    <span className="sidebar-icon" aria-hidden>
                      📋
                    </span>
                    <span className="sidebar-label">Encuestas</span>
                  </NavLink>
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/docente/herramientas/vocabularios">
                    <span className="sidebar-icon" aria-hidden>
                      📚
                    </span>
                    <span className="sidebar-label">Vocabularios</span>
                  </NavLink>
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/admin/herramientas/reuniones">
                    <span className="sidebar-icon" aria-hidden>
                      🤝
                    </span>
                    <span className="sidebar-label">Reuniones</span>
                  </NavLink>
                </div>
              </div>
              )}
              {activo('kiosco') && (
              <div className="sidebar-item">
                <NavLink className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} to="/kiosco">
                  <span className="sidebar-icon">☕</span>
                  <span className="sidebar-label">Kiosco cafetín</span>
                </NavLink>
              </div>
              )}
              {alguno(['comunicaciones.actividades', 'comunicaciones.publicaciones', 'comunicaciones.conexiones', 'comunicaciones.comunicados', 'comunicaciones.notificaciones', 'comunicaciones.chat', 'reportes.incidencias']) && (
              <div className="sidebar-menu-item">
                <button
                  type="button"
                  className={`sidebar-menu-toggle ${expandedMenus.psicologaCom ? 'expanded' : ''}`}
                  onClick={() => toggleSubmenu('psicologaCom')}
                >
                  <div className="sidebar-menu-toggle-content">
                    <span className="sidebar-icon">📣</span>
                    <span className="sidebar-label">Comunicaciones</span>
                  </div>
                  <span className="sidebar-menu-arrow">▶</span>
                </button>
                <div
                  ref={(el) => {
                    submenuRefs.current.psicologaCom = el;
                  }}
                  className={`sidebar-submenu ${expandedMenus.psicologaCom ? 'expanded' : ''}`}
                >
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/admin/comunicaciones/actividades">
                    <span className="sidebar-icon" aria-hidden>
                      📅
                    </span>
                    <span className="sidebar-label">Actividades</span>
                  </NavLink>
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/admin/comunicaciones/publicaciones">
                    <span className="sidebar-icon" aria-hidden>
                      📰
                    </span>
                    <span className="sidebar-label">Publicaciones</span>
                  </NavLink>
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/admin/comunicaciones/conexiones">
                    <span className="sidebar-icon" aria-hidden>
                      🔗
                    </span>
                    <span className="sidebar-label">Conexiones</span>
                  </NavLink>
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/admin/reportes/incidencias">
                    <span className="sidebar-icon" aria-hidden>
                      ⚠️
                    </span>
                    <span className="sidebar-label">Incidencias</span>
                  </NavLink>
                  {activo('comunicaciones.chat') && (
                  <NavLink
                    className={({ isActive }) =>
                      `sidebar-sublink ${isActive || location.pathname === '/chat' ? 'active' : ''}`
                    }
                    to="/chat"
                  >
                    <span className="sidebar-icon" aria-hidden>
                      💬
                    </span>
                    <span className="sidebar-label">Chat Vanguard</span>
                  </NavLink>
                  )}
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/admin/comunicaciones/comunicados">
                    <span className="sidebar-icon" aria-hidden>
                      📢
                    </span>
                    <span className="sidebar-label">Comunicados</span>
                  </NavLink>
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/admin/comunicaciones/notificaciones">
                    <span className="sidebar-icon" aria-hidden>
                      🔔
                    </span>
                    <span className="sidebar-label">Notificaciones</span>
                  </NavLink>
                </div>
              </div>
              )}
              <div className="sidebar-item">
                <NavLink className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} to="/admin/mensajes">
                  <span className="sidebar-icon">✉️</span>
                  <span className="sidebar-label">Mensajes</span>
                </NavLink>
              </div>
            </>
          ) : esPaqueteCoordinador(role) ? (
            <>
              <div className="sidebar-item">
                <NavLink className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} to="/docente/dashboard" end>
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
              <SgoiSidebarItem />
              {tienePersonalAsistencias && activo('mis-asistencias') && (
                <div className="sidebar-item">
                  <button
                    type="button"
                    className="sidebar-link"
                    onClick={() => setMostrarModalAsistencias(true)}
                    style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }}
                  >
                    <span className="sidebar-icon">⏰</span>
                    <span className="sidebar-label">Mis Asistencias</span>
                  </button>
                </div>
              )}
              {webActiva && (
              <div className="sidebar-item">
                <NavLink className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} to="/admin/comunicaciones/web">
                  <span className="sidebar-icon">🌐</span>
                  <span className="sidebar-label">Web</span>
                </NavLink>
              </div>
              )}
              <SiModulo id="institucional">
              <div className="sidebar-item">
                <NavLink className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} to="/admin/institucional">
                  <span className="sidebar-icon">🏛️</span>
                  <span className="sidebar-label">Institucional</span>
                </NavLink>
              </div>
              </SiModulo>
              <AgendaInternaSidebarItem />
              <BibliotecaSidebarItem />
              <ChatVanguardSidebarItem />
              <VanguarcitoSidebarItem />
              {alguno(['usuarios.personal', 'usuarios.alumnos', 'usuarios.apoderados']) && (
              <div className="sidebar-menu-item">
                <button
                  type="button"
                  className={`sidebar-menu-toggle ${expandedMenus.coordinadorUsuarios ? 'expanded' : ''}`}
                  onClick={() => toggleSubmenu('coordinadorUsuarios')}
                >
                  <div className="sidebar-menu-toggle-content">
                    <span className="sidebar-icon">👥</span>
                    <span className="sidebar-label">Usuarios</span>
                  </div>
                  <span className="sidebar-menu-arrow">▶</span>
                </button>
                <div
                  ref={(el) => { submenuRefs.current.coordinadorUsuarios = el; }}
                  className={`sidebar-submenu ${expandedMenus.coordinadorUsuarios ? 'expanded' : ''}`}
                >
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
              )}
              {esPaqueteAcademico(role) && alguno(['academico.cneb', 'academico.niveles', 'academico.grados', 'academico.cursos', 'academico.asignaturas', 'academico.areas']) && (
              <div className="sidebar-menu-item">
                <button
                  type="button"
                  className={`sidebar-menu-toggle ${expandedMenus.coordinadorAcademico ? 'expanded' : ''}`}
                  onClick={() => toggleSubmenu('coordinadorAcademico')}
                >
                  <div className="sidebar-menu-toggle-content">
                    <span className="sidebar-icon">🎓</span>
                    <span className="sidebar-label">Académico</span>
                  </div>
                  <span className="sidebar-menu-arrow">▶</span>
                </button>
                <div
                  ref={(el) => { submenuRefs.current.coordinadorAcademico = el; }}
                  className={`sidebar-submenu ${expandedMenus.coordinadorAcademico ? 'expanded' : ''}`}
                >
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/admin/cneb">
                    <span className="sidebar-icon" aria-hidden>📗</span>
                    <span className="sidebar-label">CNEB</span>
                  </NavLink>
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/admin/academico/niveles">
                    <span className="sidebar-icon" aria-hidden>🏫</span>
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
                    <span className="sidebar-icon" aria-hidden>🧩</span>
                    <span className="sidebar-label">Áreas</span>
                  </NavLink>
                </div>
              </div>
              )}
              {alguno(['herramientas.documentos', 'herramientas.examenes', 'herramientas.encuestas', 'herramientas.elecciones', 'herramientas.vocabularios', 'herramientas.supervision', 'herramientas.tardanzas', 'herramientas.reuniones']) && (
              <div className="sidebar-menu-item">
                <button
                  type="button"
                  className={`sidebar-menu-toggle ${expandedMenus.coordinadorHerramientas ? 'expanded' : ''}`}
                  onClick={() => toggleSubmenu('coordinadorHerramientas')}
                >
                  <div className="sidebar-menu-toggle-content">
                    <span className="sidebar-icon">🧰</span>
                    <span className="sidebar-label">Herramientas</span>
                  </div>
                  <span className="sidebar-menu-arrow">▶</span>
                </button>
                <div
                  ref={(el) => { submenuRefs.current.coordinadorHerramientas = el; }}
                  className={`sidebar-submenu ${expandedMenus.coordinadorHerramientas ? 'expanded' : ''}`}
                >
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/admin/documentos-gestion">
                    <span className="sidebar-icon" aria-hidden>📄</span>
                    <span className="sidebar-label">Documentos</span>
                  </NavLink>
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/docente/herramientas/examenes">
                    <span className="sidebar-icon" aria-hidden>🎯</span>
                    <span className="sidebar-label">Exámenes</span>
                  </NavLink>
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/docente/herramientas/encuestas">
                    <span className="sidebar-icon" aria-hidden>📋</span>
                    <span className="sidebar-label">Encuestas</span>
                  </NavLink>
                  <NavLink
                    className={({ isActive }) =>
                      `sidebar-sublink ${isActive || location.pathname.startsWith('/elecciones-campana') ? 'active' : ''}`
                    }
                    to="/elecciones-campana"
                  >
                    <span className="sidebar-icon" aria-hidden>🗳️</span>
                    <span className="sidebar-label">Elecciones</span>
                  </NavLink>
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/admin/herramientas/vocabularios">
                    <span className="sidebar-icon" aria-hidden>📚</span>
                    <span className="sidebar-label">Vocabulario</span>
                  </NavLink>
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/docente/herramientas/supervision">
                    <span className="sidebar-icon" aria-hidden>👁️</span>
                    <span className="sidebar-label">Supervisión</span>
                  </NavLink>
                  {esCoordinador(role) && (
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/admin/herramientas/tardanzas">
                    <span className="sidebar-icon" aria-hidden>⏱️</span>
                    <span className="sidebar-label">Tardanzas</span>
                  </NavLink>
                  )}
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/admin/herramientas/reuniones">
                    <span className="sidebar-icon" aria-hidden>🤝</span>
                    <span className="sidebar-label">Reuniones</span>
                  </NavLink>
                </div>
              </div>
              )}
              {activo('kiosco') && (
              <div className="sidebar-item">
                <NavLink className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} to="/kiosco">
                  <span className="sidebar-icon">☕</span>
                  <span className="sidebar-label">Kiosco cafetín</span>
                </NavLink>
              </div>
              )}
              {alguno(['comunicaciones.publicaciones', 'comunicaciones.conexiones', 'comunicaciones.comunicados', 'comunicaciones.actividades', 'comunicaciones.eventos', 'comunicaciones.notificaciones', 'comunicaciones.chat']) && (
              <div className="sidebar-menu-item">
                <button
                  type="button"
                  className={`sidebar-menu-toggle ${expandedMenus.coordinadorCom ? 'expanded' : ''}`}
                  onClick={() => toggleSubmenu('coordinadorCom')}
                >
                  <div className="sidebar-menu-toggle-content">
                    <span className="sidebar-icon">📣</span>
                    <span className="sidebar-label">Comunicaciones</span>
                  </div>
                  <span className="sidebar-menu-arrow">▶</span>
                </button>
                <div
                  ref={(el) => { submenuRefs.current.coordinadorCom = el; }}
                  className={`sidebar-submenu ${expandedMenus.coordinadorCom ? 'expanded' : ''}`}
                >
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/admin/comunicaciones/publicaciones">
                    <span className="sidebar-icon" aria-hidden>📰</span>
                    <span className="sidebar-label">Publicaciones</span>
                  </NavLink>
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/admin/comunicaciones/conexiones">
                    <span className="sidebar-icon" aria-hidden>🔗</span>
                    <span className="sidebar-label">Conexiones</span>
                  </NavLink>
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/admin/comunicaciones/comunicados">
                    <span className="sidebar-icon" aria-hidden>📢</span>
                    <span className="sidebar-label">Comunicados</span>
                  </NavLink>
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/admin/comunicaciones/actividades">
                    <span className="sidebar-icon" aria-hidden>📅</span>
                    <span className="sidebar-label">Actividades</span>
                  </NavLink>
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/admin/comunicaciones/eventos">
                    <span className="sidebar-icon" aria-hidden>🎉</span>
                    <span className="sidebar-label">Eventos</span>
                  </NavLink>
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/admin/comunicaciones/notificaciones">
                    <span className="sidebar-icon" aria-hidden>🔔</span>
                    <span className="sidebar-label">Notificaciones</span>
                  </NavLink>
                  {activo('comunicaciones.chat') && (
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/chat">
                    <span className="sidebar-icon" aria-hidden>💬</span>
                    <span className="sidebar-label">Chat Vanguard</span>
                  </NavLink>
                  )}
                </div>
              </div>
              )}
              {rolesAdicionales.es_apoderado && (
                <div className="sidebar-item">
                  <NavLink className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} to="/docente/hijos">
                    <span className="sidebar-icon">👨‍👩‍👧‍👦</span>
                    <span className="sidebar-label">Estudiantes a cargo</span>
                  </NavLink>
                </div>
              )}
              {alguno(['reportes.general', 'reportes.temas', 'reportes.notas', 'reportes.deudores', 'reportes.asistencias', 'reportes.estadisticas', 'reportes.incidencias']) && (
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
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/admin/reportes/general">
                    <span className="sidebar-icon" aria-hidden>🗂️</span>
                    <span className="sidebar-label">General</span>
                  </NavLink>
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/admin/reportes/temas">
                    <span className="sidebar-icon" aria-hidden>📚</span>
                    <span className="sidebar-label">Temas</span>
                  </NavLink>
                  {activo('reportes.asistencias') && (
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/admin/reportes/asistencias">
                    <span className="sidebar-icon" aria-hidden>✅</span>
                    <span className="sidebar-label">Asistencias</span>
                  </NavLink>
                  )}
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/admin/reportes/notas">
                    <span className="sidebar-icon" aria-hidden>📊</span>
                    <span className="sidebar-label">Notas</span>
                  </NavLink>
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/admin/reportes/deudores">
                    <span className="sidebar-icon" aria-hidden>📋</span>
                    <span className="sidebar-label">Deudores</span>
                  </NavLink>
                  {activo('reportes.estadisticas') && (
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/admin/reportes/estadisticas">
                    <span className="sidebar-icon" aria-hidden>📈</span>
                    <span className="sidebar-label">Estadísticas</span>
                  </NavLink>
                  )}
                  {activo('reportes.incidencias') && (
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/admin/reportes/incidencias">
                    <span className="sidebar-icon" aria-hidden>⚠️</span>
                    <span className="sidebar-label">Incidencias</span>
                  </NavLink>
                  )}
                </div>
              </div>
              )}
              {esCoordinador(role) && activo('config.pagos') && (
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
                </div>
              </div>
              )}
              <div className="sidebar-item">
                <NavLink className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} to="/admin/mensajes">
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
              {puedeVerSgoi && <SgoiSidebarItem />}
              {tienePersonalAsistencias && activo('mis-asistencias') && (
                <div className="sidebar-item">
                  <button
                    type="button"
                    className="sidebar-link"
                    onClick={() => setMostrarModalAsistencias(true)}
                    style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }}
                  >
                    <span className="sidebar-icon">⏰</span>
                    <span className="sidebar-label">Mis Asistencias</span>
                  </button>
                </div>
              )}
              <SiModulo id="institucional">
              <div className="sidebar-item">
                <NavLink className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} to="/admin/institucional">
                  <span className="sidebar-icon">🏛️</span>
                  <span className="sidebar-label">Institucional</span>
                </NavLink>
              </div>
              </SiModulo>
              {webActiva && (
              <div className="sidebar-item">
                <NavLink className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} to="/admin/comunicaciones/web">
                  <span className="sidebar-icon">🌐</span>
                  <span className="sidebar-label">Web</span>
                </NavLink>
              </div>
              )}
              {role === 'ADMINISTRADOR' && <AgendaInternaSidebarItem />}
              <BibliotecaSidebarItem />
              <ChatVanguardSidebarItem />
              {role !== 'ADMINISTRADOR' && <VanguarcitoSidebarItem />}
              {activo('reportes.estadisticas') && (
                <div className="sidebar-item">
                  <NavLink className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} to="/admin/estadisticas">
                    <span className="sidebar-icon">📈</span>
                    <span className="sidebar-label">Estadísticas</span>
                  </NavLink>
                </div>
              )}
              {role === 'ADMINISTRADOR' && activo('kiosco') && (
              <div className="sidebar-item">
                <NavLink className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} to="/kiosco">
                  <span className="sidebar-icon">☕</span>
                  <span className="sidebar-label">Kiosco cafetín</span>
                </NavLink>
              </div>
              )}
              <SiModulo id="matriculas">
              <div className="sidebar-item">
                <NavLink className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} to="/admin/matriculas">
                  <span className="sidebar-icon">📋</span>
                  <span className="sidebar-label">Matrículas</span>
                </NavLink>
              </div>
              </SiModulo>
              {alguno(['usuarios.personal', 'usuarios.alumnos', 'usuarios.apoderados']) && (
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
              )}
              {alguno(['academico.cneb', 'academico.niveles', 'academico.grados', 'academico.cursos', 'academico.asignaturas', 'academico.areas', 'academico.horario-gen', 'academico.gamificacion']) && (
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
                  <SiModulo id="academico.cneb">
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/admin/cneb">
                    <span className="sidebar-icon" aria-hidden>📗</span>
                    <span className="sidebar-label">CNEB</span>
                  </NavLink>
                  </SiModulo>
                  <SiModulo id="academico.niveles">
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/admin/academico/niveles">
                    <span className="sidebar-icon" aria-hidden>🔢</span>
                    <span className="sidebar-label">Niveles</span>
                  </NavLink>
                  </SiModulo>
                  <SiModulo id="academico.grados">
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/admin/academico/grados">
                    <span className="sidebar-icon" aria-hidden>📑</span>
                    <span className="sidebar-label">Grados</span>
                  </NavLink>
                  </SiModulo>
                  <SiModulo id="academico.cursos">
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/admin/academico/cursos">
                    <span className="sidebar-icon" aria-hidden>📚</span>
                    <span className="sidebar-label">Cursos</span>
                  </NavLink>
                  </SiModulo>
                  <SiModulo id="academico.asignaturas">
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/admin/academico/asignaturas">
                    <span className="sidebar-icon" aria-hidden>📖</span>
                    <span className="sidebar-label">Asignaturas</span>
                  </NavLink>
                  </SiModulo>
                  <SiModulo id="academico.areas">
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/admin/academico/areas">
                    <span className="sidebar-icon" aria-hidden>🗂️</span>
                    <span className="sidebar-label">Áreas</span>
                  </NavLink>
                  </SiModulo>
                  {activo('academico.horario-gen') && (
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/admin/horario-gen">
                    <span className="sidebar-icon" aria-hidden>🗓️</span>
                    <span className="sidebar-label">Generar Horarios</span>
                  </NavLink>
                  )}
                  <SiModulo id="academico.gamificacion">
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/admin/avatares">
                    <span className="sidebar-icon" aria-hidden>🎮</span>
                    <span className="sidebar-label">Gamificación</span>
                  </NavLink>
                  </SiModulo>
                </div>
              </div>
              )}
              {alguno(['herramientas.documentos', 'herramientas.examenes', 'herramientas.encuestas', 'herramientas.elecciones', 'herramientas.vocabularios', 'herramientas.fichas', 'herramientas.supervision', 'herramientas.tardanzas', 'herramientas.reuniones', 'herramientas.vanguarcito']) && (
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
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/admin/herramientas/elecciones">
                    <span className="sidebar-icon" aria-hidden>🗳️</span>
                    <span className="sidebar-label">Elecciones</span>
                  </NavLink>
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/admin/herramientas/vocabularios">
                    <span className="sidebar-icon" aria-hidden>📚</span>
                    <span className="sidebar-label">Vocabularios</span>
                  </NavLink>
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/admin/herramientas/disenador-fichas">
                    <span className="sidebar-icon" aria-hidden>✨</span>
                    <span className="sidebar-label">Fichas IA</span>
                  </NavLink>
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/admin/herramientas/supervision">
                    <span className="sidebar-icon" aria-hidden>🎯</span>
                    <span className="sidebar-label">Supervisión</span>
                  </NavLink>
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/admin/herramientas/tardanzas">
                    <span className="sidebar-icon" aria-hidden>⏱️</span>
                    <span className="sidebar-label">Tardanzas</span>
                  </NavLink>
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/admin/herramientas/reuniones">
                    <span className="sidebar-icon" aria-hidden>🤝</span>
                    <span className="sidebar-label">Reuniones</span>
                  </NavLink>
                  {role === 'ADMINISTRADOR' && activo('herramientas.vanguarcito') && (
                  <NavLink
                    className={({ isActive }) =>
                      `sidebar-sublink ${isActive || location.pathname === '/vanguarcito' ? 'active' : ''}`
                    }
                    to="/vanguarcito"
                  >
                    <IconoMascotaMenu />
                    <span className="sidebar-label">{mascotaNombre}</span>
                  </NavLink>
                  )}
                </div>
              </div>
              )}
              {role !== 'ADMINISTRADOR' && activo('kiosco') && (
              <div className="sidebar-item">
                <NavLink className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} to="/kiosco">
                  <span className="sidebar-icon">☕</span>
                  <span className="sidebar-label">Kiosco cafetín</span>
                </NavLink>
              </div>
              )}
              {alguno(['comunicaciones.publicaciones', 'comunicaciones.conexiones', 'comunicaciones.comunicados', 'comunicaciones.actividades', 'comunicaciones.eventos', 'comunicaciones.notificaciones', 'comunicaciones.chat']) && (
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
                  {activo('comunicaciones.chat') && (
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/chat">
                    <span className="sidebar-icon" aria-hidden>💬</span>
                    <span className="sidebar-label">Chat Vanguard</span>
                  </NavLink>
                  )}
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/admin/comunicaciones/comunicados">
                    <span className="sidebar-icon" aria-hidden>📢</span>
                    <span className="sidebar-label">Comunicados</span>
                  </NavLink>
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/admin/comunicaciones/actividades">
                    <span className="sidebar-icon" aria-hidden>📅</span>
                    <span className="sidebar-label">Actividades</span>
                  </NavLink>
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/admin/comunicaciones/eventos">
                    <span className="sidebar-icon" aria-hidden>🎪</span>
                    <span className="sidebar-label">Eventos (Ver todo)</span>
                  </NavLink>
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/admin/comunicaciones/notificaciones">
                    <span className="sidebar-icon" aria-hidden>🔔</span>
                    <span className="sidebar-label">Notificaciones</span>
                  </NavLink>
                </div>
              </div>
              )}
              {alguno(['pagos.escolares', 'pagos.productos', 'pagos.ventas', 'pagos.compras', 'pagos.caja']) && (
              <div className="sidebar-menu-item">
                <button
                  type="button"
                  className={`sidebar-menu-toggle ${expandedMenus.pagosFacturas ? 'expanded' : ''}`}
                  onClick={() => toggleSubmenu('pagosFacturas')}
                >
                  <div className="sidebar-menu-toggle-content">
                    <span className="sidebar-icon">💳</span>
                    <span className="sidebar-label">Pagos/Facturas</span>
                  </div>
                  <span className="sidebar-menu-arrow">▶</span>
                </button>
                <div
                  ref={(el) => {
                    submenuRefs.current.pagosFacturas = el;
                  }}
                  className={`sidebar-submenu ${expandedMenus.pagosFacturas ? 'expanded' : ''}`}
                >
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/admin/pagos-facturas/buscar-pagos">
                    <span className="sidebar-icon" aria-hidden>💳</span>
                    <span className="sidebar-label">Pagos escolares</span>
                  </NavLink>
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/admin/pagos-facturas/productos">
                    <span className="sidebar-icon" aria-hidden>📦</span>
                    <span className="sidebar-label">Productos</span>
                  </NavLink>
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/admin/pagos-facturas/ventas">
                    <span className="sidebar-icon" aria-hidden>🛒</span>
                    <span className="sidebar-label">Ventas</span>
                  </NavLink>
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/admin/pagos-facturas/compras">
                    <span className="sidebar-icon" aria-hidden>🧾</span>
                    <span className="sidebar-label">Compras</span>
                  </NavLink>
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/admin/pagos-facturas/caja-chica">
                    <span className="sidebar-icon" aria-hidden>💵</span>
                    <span className="sidebar-label">Caja Chica</span>
                  </NavLink>
                </div>
              </div>
              )}
              <SiModulo id="psicologia">
              <div className="sidebar-item">
                <NavLink className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} to="/admin/psicologia">
                  <span className="sidebar-icon">🧠</span>
                  <span className="sidebar-label">Psicología</span>
                </NavLink>
              </div>
              </SiModulo>
              {rolesAdicionales.es_apoderado && (
                <>
                  <div className="sidebar-section-divider"></div>
                  <div
                    className="sidebar-section-label"
                    style={{
                      fontSize: '0.75rem',
                      color: '#9ca3af',
                      fontWeight: '600',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      padding: '1rem 1.5rem 0.5rem 1.5rem',
                      marginTop: '0.5rem'
                    }}
                  >
                    Como Apoderado
                  </div>
                  <div className="sidebar-item">
                    <NavLink className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} to="/docente/hijos">
                      <span className="sidebar-icon">👨‍👩‍👧‍👦</span>
                      <span className="sidebar-label">Estudiantes a Cargo</span>
                    </NavLink>
                  </div>
                </>
              )}
              {alguno(['reportes.general', 'reportes.temas', 'reportes.notas', 'reportes.deudores', 'reportes.asistencias', 'reportes.estadisticas', 'reportes.incidencias']) && (
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
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/admin/reportes/general">
                    <span className="sidebar-icon" aria-hidden>🗂️</span>
                    <span className="sidebar-label">General</span>
                  </NavLink>
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/admin/reportes/temas">
                    <span className="sidebar-icon" aria-hidden>📚</span>
                    <span className="sidebar-label">Temas</span>
                  </NavLink>
                  {activo('reportes.asistencias') && (
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/admin/reportes/asistencias">
                    <span className="sidebar-icon" aria-hidden>✅</span>
                    <span className="sidebar-label">Asistencias</span>
                  </NavLink>
                  )}
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/admin/reportes/notas">
                    <span className="sidebar-icon" aria-hidden>📊</span>
                    <span className="sidebar-label">Notas</span>
                  </NavLink>
                  {activo('reportes.estadisticas') && (
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/admin/reportes/estadisticas">
                    <span className="sidebar-icon" aria-hidden>📈</span>
                    <span className="sidebar-label">Estadísticas</span>
                  </NavLink>
                  )}
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/admin/reportes/deudores">
                    <span className="sidebar-icon" aria-hidden>📋</span>
                    <span className="sidebar-label">Deudores</span>
                  </NavLink>
                  {activo('reportes.incidencias') && (
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/admin/reportes/incidencias">
                    <span className="sidebar-icon" aria-hidden>⚠️</span>
                    <span className="sidebar-label">Incidencias</span>
                  </NavLink>
                  )}
                </div>
              </div>
              )}
              {activo('auditoria') && (
              <div className="sidebar-item">
                <NavLink className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} to="/admin/auditoria">
                  <span className="sidebar-icon">🧾</span>
                  <span className="sidebar-label">Auditoría</span>
                </NavLink>
              </div>
              )}
              {configActiva && (
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
                  <NavLink className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`} to="/admin/config/indicadores">
                    <span className="sidebar-icon" aria-hidden>📊</span>
                    <span className="sidebar-label">Indicadores</span>
                  </NavLink>
                </div>
              </div>
              )}
              <div className="sidebar-item">
                <NavLink className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} to="/admin/mensajes">
                  <span className="sidebar-icon">✉️</span>
                  <span className="sidebar-label">Mensajes</span>
                </NavLink>
              </div>
            </>
          )}

          {user?.es_superadmin && (
          <div className="sidebar-item">
            <NavLink className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} to="/admin/modulos">
              <span className="sidebar-icon" aria-hidden>🧩</span>
              <span className="sidebar-label">Módulos</span>
            </NavLink>
          </div>
          )}
          <div className="sidebar-item">
            <button className="sidebar-link sidebar-link-button" type="button" onClick={() => logout()}>
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
                {docenteLineaUbicacionAula ? (
                  <div className="user-docente-aula-ubicacion" title={docenteTituloUbicacionAula || undefined}>
                    {docenteLineaUbicacionAula}
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="header-actions">
            {(role === 'DOCENTE'
              || role === 'ALUMNO'
              || role === 'APODERADO'
              || role === 'ADMINISTRADOR'
              || role === 'PROMOTORIA'
              || role === 'SECRETARIA'
              || role === 'PSICOLOGA'
              || role === 'DIRECTOR'
              || role === 'COORDINADOR'
              || role === 'CONTADOR') && activo('comunicaciones.notificaciones') && <NotificacionesWidget />}
            <button
              className="header-btn"
              type="button"
              title="Mi Perfil"
              onClick={() =>
                navigate(
                  role === 'DOCENTE'
                    ? '/docente/perfil'
                    : role === 'ALUMNO'
                      ? '/alumno/perfil'
                      : role === 'APODERADO'
                        ? '/apoderado/perfil'
                        : role === 'ADMINISTRADOR' || role === 'PROMOTORIA' || role === 'SECRETARIA' || role === 'PSICOLOGA' || role === 'DIRECTOR' || role === 'COORDINADOR' || role === 'CONTADOR'
                          ? '/admin/perfil'
                          : '/perfil'
                )
              }
            >
              👤
            </button>
            <button className="header-btn header-btn-logout" type="button" title="Cerrar sesión" onClick={() => logout()}>
              <svg className="logout-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="12" r="9" stroke="#ef4444" strokeWidth="2" fill="none"/>
                <line x1="12" y1="3" x2="12" y2="12" stroke="#ef4444" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        </header>

        <div
          className={`dashboard-main-wrapper ${
            location.pathname === '/chat' || location.pathname.startsWith('/chat/')
              || role === 'ADMINISTRADOR' || role === 'PROMOTORIA' || role === 'SECRETARIA' || role === 'PSICOLOGA'
              || role === 'COORDINADOR' || role === 'DIRECTOR'
              ? 'dashboard-main-wrapper-no-sidebar'
              : ''
          }`}
        >
          <main className="dashboard-main">{children}</main>
          
          {/* Columna derecha: solo se monta en web/tablet para evitar requests ocultos en móvil */}
          {!isMobile && location.pathname !== '/chat' && !location.pathname.startsWith('/chat/') && (role === 'DOCENTE' || role === 'CONTADOR' || role === 'ALUMNO' || role === 'APODERADO') && (
            <aside className="dashboard-sidebar-right">
              {role === 'ALUMNO' && activo('academico.gamificacion') && <AlumnoAvatarWidget />}
              <CalendarioWidget />
              {(role === 'DOCENTE' || role === 'CONTADOR') && activo('comunicaciones.publicaciones') && (
                <div id="dashboard-publicaciones" className="publicaciones-widget-sidebar">
                  <PublicacionesWidget />
                </div>
              )}
              {(role === 'ALUMNO' || role === 'APODERADO') && activo('comunicaciones.publicaciones') && (
                <div id="dashboard-publicaciones" className="publicaciones-widget-sidebar">
                  <PublicacionesCardFeed />
                </div>
              )}
            </aside>
          )}
        </div>

        {/* Prompt de instalación PWA */}
        <PWAInstallPrompt />
        
        {/* Notificación de actualización PWA */}
        <PWAUpdateNotification />

        {/* Encuesta activa: aviso una vez por encuesta (z-index sobre cumpleaños) */}
        {activo('herramientas.encuestas') && <EncuestaActivacionModal />}

        {/* Examen herramientas activo: mismo estilo; si hay encuesta pendiente, no compite (el otro componente espera) */}
        {activo('herramientas.examenes') && <HerramientasExamenActivacionModal />}

        {/* Comunicados con "Mostrar en inicio" (puede haber varios; z-index sobre encuesta/cumpleaños) */}
        <ComunicadoHomeModal />

        {/* Modal de bienvenida cumpleaños (plantilla ventana; z-index bajo comunicado home) */}
        {activo('config.cumpleanos') && <BirthdayWelcomeModal />}

        {/* Modal de Asistencias */}
        {(user?.tipo === 'DOCENTE' || tienePersonalAsistencias) && (
          <ModalAsistencias
            isOpen={mostrarModalAsistencias}
            onClose={() => setMostrarModalAsistencias(false)}
          />
        )}

        {puedeVerSgoi && activo('sgoi') && <SgoiFlotante />}
        {activo('comunicaciones.chat') && role !== 'ASISTENCIA' && (
          <>
            <ChatEnLinea />
            <ChatFlotante levantado={puedeVerSgoi && activo('sgoi')} />
          </>
        )}
      </div>
    </div>
  );
}


