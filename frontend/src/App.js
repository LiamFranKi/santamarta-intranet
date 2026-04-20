import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AvatarWidgetProvider } from './context/AvatarWidgetContext';
import { ColegioProvider } from './context/ColegioContext';
import Login from './pages/Login';
import Dashboard from './pages/admin/Dashboard';
import DocenteDashboard from './pages/DocenteDashboard';
import DocenteHerramientas from './pages/DocenteHerramientas';
import DocentePerfil from './pages/DocentePerfil';
import DocenteQR from './pages/DocenteQR';
import DocenteGrupos from './pages/DocenteGrupos';
import DocenteConexionesFamiliares from './pages/DocenteConexionesFamiliares';
import DocenteCursos from './pages/DocenteCursos';
import DocenteHorario from './pages/DocenteHorario';
import DocenteComunicados from './pages/DocenteComunicados';
import DocenteActividades from './pages/DocenteActividades';
import DocenteMensajes from './pages/DocenteMensajes';
import DocenteHijos from './pages/DocenteHijos';
import DocenteTutoria from './pages/DocenteTutoria';
import DocenteTutoriaOrdenMerito from './pages/DocenteTutoriaOrdenMerito';
import AdminActividades from './pages/admin/AdminActividades';
import AdminAvatares from './pages/admin/AdminAvatares';
import AdminComunicados from './pages/admin/AdminComunicados';
import AdminDocumentosGestion from './pages/admin/AdminDocumentosGestion';
import AdminEstadisticas from './pages/admin/AdminEstadisticas';
import AdminPerfil from './pages/admin/AdminPerfil';
import AdminInstitucional from './pages/admin/AdminInstitucional';
import AdminPublicaciones from './pages/admin/AdminPublicaciones';
import AdminConexiones from './pages/admin/AdminConexiones';
import AdminHerramientasDinamicas from './pages/admin/AdminHerramientasDinamicas';
import AdminHerramientasAcademicas from './pages/admin/AdminHerramientasAcademicas';
import AdminHerramientasEmocionales from './pages/admin/AdminHerramientasEmocionales';
import AdminVocabularios from './pages/admin/AdminVocabularios';
import DocenteVocabularios from './pages/DocenteVocabularios';
import AlumnoVocabularios from './pages/AlumnoVocabularios';
import AdminIncidencias from './pages/admin/AdminIncidencias';
import HerramientasExamenesLista from './pages/herramientas/HerramientasExamenesLista';
import HerramientasExamenEditor from './pages/herramientas/HerramientasExamenEditor';
import HerramientasExamenEstadisticas from './pages/herramientas/HerramientasExamenEstadisticas';
import MisHerramientasExamenes from './pages/herramientas/MisHerramientasExamenes';
import HerramientasExamenRealizar from './pages/herramientas/HerramientasExamenRealizar';
import HerramientasExamenMiResultado from './pages/herramientas/HerramientasExamenMiResultado';
import AdminSupervision from './pages/admin/AdminSupervision';
import AdminEncuestas from './pages/admin/AdminEncuestas';
import AdminEncuestaEditor from './pages/admin/AdminEncuestaEditor';
import AdminEncuestaEstadisticas from './pages/admin/AdminEncuestaEstadisticas';
import AdminEncuestaHistorial from './pages/admin/AdminEncuestaHistorial';
import AdminEventos from './pages/admin/AdminEventos';
import MisEncuestas from './pages/MisEncuestas';
import EncuestaResponder from './pages/EncuestaResponder';
import DocenteAulaVirtual from './pages/DocenteAulaVirtual';
import AlumnoDashboard from './pages/AlumnoDashboard';
import AlumnoPerfil from './pages/AlumnoPerfil';
import AlumnoQR from './pages/AlumnoQR';
import AlumnoAvatar from './pages/AlumnoAvatar';
import AvatarTest from './pages/AvatarTest';
import AvataresDemo from './pages/AvataresDemo';
import AlumnoAulaVirtual from './pages/AlumnoAulaVirtual';
import DocenteHijoAulaVirtual from './pages/DocenteHijoAulaVirtual';
import DocenteTutorAulaVirtual from './pages/DocenteTutorAulaVirtual';
import AlumnoComunicados from './pages/AlumnoComunicados';
import AlumnoActividades from './pages/AlumnoActividades';
import AlumnoMensajes from './pages/AlumnoMensajes';
import AlumnoCursos from './pages/AlumnoCursos';
import AlumnoHorario from './pages/AlumnoHorario';
import AlumnoExamen from './pages/AlumnoExamen';
import AlumnoExamenResultados from './pages/AlumnoExamenResultados';
import AsistenciaEscaneo from './pages/AsistenciaEscaneo';
import EventoPublicoAsistencia from './pages/EventoPublicoAsistencia';
import ApoderadoDashboard from './pages/ApoderadoDashboard';
import ApoderadoPerfil from './pages/ApoderadoPerfil';
import ApoderadoHijos from './pages/ApoderadoHijos';
import ApoderadoComunicados from './pages/ApoderadoComunicados';
import ApoderadoActividades from './pages/ApoderadoActividades';
import ApoderadoMensajes from './pages/ApoderadoMensajes';
import ApoderadoHijoAulaVirtual from './pages/ApoderadoHijoAulaVirtual';
import './App.css';

// Tema de Material-UI
const theme = createTheme({
  palette: {
    primary: {
      main: '#667eea',
    },
    secondary: {
      main: '#764ba2',
    },
  },
});

// Componente para rutas protegidas
// `requiredTypes` (array): el usuario debe ser uno de esos tipos (p. ej. admin + promotoría comparten rutas).
// `requiredType` (string): un solo tipo; si no se pasa `requiredTypes`, se interpreta como [requiredType].
function PrivateRoute({ children, requiredType = null, requiredTypes = null }) {
  const { isAuthenticated, loading, user } = useAuth();

  if (loading) {
    return <div>Cargando...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" />;
  }

  const allowedTipos = Array.isArray(requiredTypes) && requiredTypes.length
    ? requiredTypes
    : requiredType
      ? [requiredType]
      : null;

  // Si se especifica tipo(s) requerido(s), verificar que el usuario coincida
  if (allowedTipos && (!user?.tipo || !allowedTipos.includes(user.tipo))) {
    // Redirigir al dashboard correspondiente según el tipo de usuario
    if (user?.tipo === 'DOCENTE') {
      return <Navigate to="/docente/dashboard" />;
    } else if (user?.tipo === 'ALUMNO') {
      return <Navigate to="/alumno/dashboard" />;
    } else if (user?.tipo === 'APODERADO') {
      return <Navigate to="/apoderado/dashboard" />;
    } else if (user?.tipo === 'ASISTENCIA') {
      return <Navigate to="/asistencia/escaneo" />;
    } else if (user?.tipo === 'PROMOTORIA') {
      return <Navigate to="/promotoria/dashboard" />;
    } else if (user?.tipo === 'ADMINISTRADOR') {
      return <Navigate to="/admin/dashboard" />;
    }
    // Si no tiene un tipo válido, redirigir al login
    return <Navigate to="/login" />;
  }

  return children;
}

// Componente para hacer scroll al top cuando cambia la ruta
function ScrollToTop() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (hash === '#publicaciones') {
      return;
    }
    window.scrollTo({
      top: 0,
      left: 0,
      behavior: 'smooth'
    });
  }, [pathname, hash]);

  return null;
}

/** Navegación SPA cuando el usuario toca una push y la app ya estaba abierta (postMessage desde service worker). */
function SwNotificationNavigateBridge() {
  const navigate = useNavigate();
  useEffect(() => {
    if (typeof window === 'undefined' || !navigator.serviceWorker?.addEventListener) return undefined;
    const handler = (event) => {
      const d = event.data;
      if (!d || d.type !== 'NAVIGATE_FROM_SW' || typeof d.path !== 'string') return;
      navigate(d.path);
    };
    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }, [navigate]);
  return null;
}

// Componente para redirigir al dashboard correcto según el tipo de usuario
// IMPORTANTE: Espera a que termine loading para evitar bucles de navegación y redirecciones incorrectas
function NavigateToDashboard() {
  const { user, loading, isAuthenticated } = useAuth();
  const tipo = user?.tipo;

  // No redirigir hasta que se termine de verificar el token (evita ir a /admin por defecto)
  if (loading) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>Cargando...</div>;
  }

  // Usuario no autenticado: ir al login
  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  if (tipo === 'DOCENTE') {
    return <Navigate to="/docente/dashboard" replace />;
  } else if (tipo === 'ALUMNO') {
    return <Navigate to="/alumno/dashboard" replace />;
  } else if (tipo === 'APODERADO') {
    return <Navigate to="/apoderado/dashboard" replace />;
  } else if (tipo === 'ADMINISTRADOR') {
    return <Navigate to="/admin/dashboard" replace />;
  } else if (tipo === 'ASISTENCIA') {
    return <Navigate to="/asistencia/escaneo" replace />;
  } else if (tipo === 'PROMOTORIA') {
    return <Navigate to="/promotoria/dashboard" replace />;
  }

  // Tipo desconocido: ir al login en lugar de asumir admin
  return <Navigate to="/login" replace />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/evento/:token" element={<EventoPublicoAsistencia />} />
      <Route
        path="/admin/dashboard"
        element={
          <PrivateRoute requiredType="ADMINISTRADOR">
            <Dashboard />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/perfil"
        element={
          <PrivateRoute requiredTypes={['ADMINISTRADOR', 'PROMOTORIA']}>
            <AdminPerfil />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/institucional"
        element={
          <PrivateRoute requiredType="ADMINISTRADOR">
            <AdminInstitucional />
          </PrivateRoute>
        }
      />
      {/* Comunicaciones — rutas canónicas bajo /admin/comunicaciones/ */}
      <Route
        path="/admin/comunicaciones/publicaciones"
        element={
          <PrivateRoute requiredTypes={['ADMINISTRADOR', 'PROMOTORIA']}>
            <AdminPublicaciones />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/comunicaciones/conexiones"
        element={
          <PrivateRoute requiredTypes={['ADMINISTRADOR', 'PROMOTORIA']}>
            <AdminConexiones />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/comunicaciones/incidencias"
        element={
          <PrivateRoute requiredTypes={['ADMINISTRADOR', 'PROMOTORIA']}>
            <AdminIncidencias />
          </PrivateRoute>
        }
      />
      <Route path="/admin/comunicaciones/chat-vanguard" element={<Navigate to="/admin/vanguarcito" replace />} />
      <Route
        path="/admin/comunicaciones/actividades"
        element={
          <PrivateRoute requiredTypes={['ADMINISTRADOR', 'PROMOTORIA']}>
            <AdminActividades />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/comunicaciones/comunicados"
        element={
          <PrivateRoute requiredTypes={['ADMINISTRADOR', 'PROMOTORIA']}>
            <AdminComunicados />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/comunicaciones/eventos"
        element={
          <PrivateRoute requiredTypes={['ADMINISTRADOR', 'PROMOTORIA']}>
            <AdminEventos />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/comunicaciones/notificaciones"
        element={
          <PrivateRoute requiredTypes={['ADMINISTRADOR', 'PROMOTORIA']}>
            <Dashboard />
          </PrivateRoute>
        }
      />
      <Route path="/admin/publicaciones" element={<Navigate to="/admin/comunicaciones/publicaciones" replace />} />
      <Route path="/admin/conexiones" element={<Navigate to="/admin/comunicaciones/conexiones" replace />} />
      <Route path="/admin/incidencias" element={<Navigate to="/admin/comunicaciones/incidencias" replace />} />
      <Route path="/admin/actividades" element={<Navigate to="/admin/comunicaciones/actividades" replace />} />
      <Route path="/admin/comunicados" element={<Navigate to="/admin/comunicaciones/comunicados" replace />} />
      <Route path="/admin/notificaciones" element={<Navigate to="/admin/comunicaciones/notificaciones" replace />} />
      <Route
        path="/admin/herramientas-dinamicas"
        element={
          <PrivateRoute requiredTypes={['ADMINISTRADOR', 'PROMOTORIA']}>
            <AdminHerramientasDinamicas />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/herramientas/examenes"
        element={
          <PrivateRoute requiredTypes={['ADMINISTRADOR', 'PROMOTORIA']}>
            <HerramientasExamenesLista variant="admin" />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/herramientas/examenes/nueva"
        element={
          <PrivateRoute requiredTypes={['ADMINISTRADOR', 'PROMOTORIA']}>
            <HerramientasExamenEditor variant="admin" />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/herramientas/examenes/:id/editar"
        element={
          <PrivateRoute requiredTypes={['ADMINISTRADOR', 'PROMOTORIA']}>
            <HerramientasExamenEditor variant="admin" />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/herramientas/examenes/:id/estadisticas"
        element={
          <PrivateRoute requiredTypes={['ADMINISTRADOR', 'PROMOTORIA']}>
            <HerramientasExamenEstadisticas variant="admin" />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/herramientas/examenes/resultado/:examenId"
        element={
          <PrivateRoute requiredTypes={['ADMINISTRADOR', 'PROMOTORIA']}>
            <HerramientasExamenMiResultado />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/herramientas/examenes/realizar/:id"
        element={
          <PrivateRoute requiredTypes={['ADMINISTRADOR', 'PROMOTORIA']}>
            <HerramientasExamenRealizar />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/herramientas/encuestas"
        element={
          <PrivateRoute requiredTypes={['ADMINISTRADOR', 'PROMOTORIA']}>
            <AdminEncuestas />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/herramientas/encuestas/nueva"
        element={
          <PrivateRoute requiredTypes={['ADMINISTRADOR', 'PROMOTORIA']}>
            <AdminEncuestaEditor />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/herramientas/encuestas/:id/editar"
        element={
          <PrivateRoute requiredTypes={['ADMINISTRADOR', 'PROMOTORIA']}>
            <AdminEncuestaEditor />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/herramientas/encuestas/:id/estadisticas"
        element={
          <PrivateRoute requiredTypes={['ADMINISTRADOR', 'PROMOTORIA']}>
            <AdminEncuestaEstadisticas />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/herramientas/encuestas/:id/historial"
        element={
          <PrivateRoute requiredTypes={['ADMINISTRADOR', 'PROMOTORIA']}>
            <AdminEncuestaHistorial />
          </PrivateRoute>
        }
      />
      <Route
        path="/encuestas"
        element={
          <PrivateRoute>
            <MisEncuestas />
          </PrivateRoute>
        }
      />
      <Route
        path="/encuestas/responder/:id"
        element={
          <PrivateRoute>
            <EncuestaResponder />
          </PrivateRoute>
        }
      />
      <Route
        path="/herramientas-examenes"
        element={
          <PrivateRoute>
            <MisHerramientasExamenes />
          </PrivateRoute>
        }
      />
      <Route
        path="/herramientas-examenes/realizar/:id"
        element={
          <PrivateRoute>
            <HerramientasExamenRealizar />
          </PrivateRoute>
        }
      />
      <Route
        path="/herramientas-examenes/resultado/:examenId"
        element={
          <PrivateRoute>
            <HerramientasExamenMiResultado />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/herramientas/vocabularios"
        element={
          <PrivateRoute requiredTypes={['ADMINISTRADOR', 'PROMOTORIA']}>
            <AdminVocabularios />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/herramientas/supervision"
        element={
          <PrivateRoute requiredType="ADMINISTRADOR">
            <AdminSupervision />
          </PrivateRoute>
        }
      />
      <Route path="/admin/supervision" element={<Navigate to="/admin/herramientas/supervision" replace />} />
      <Route path="/admin/examenes-personal" element={<Navigate to="/admin/herramientas/examenes" replace />} />
      <Route path="/admin/encuestas" element={<Navigate to="/admin/herramientas/encuestas" replace />} />
      <Route path="/admin/vocabularios" element={<Navigate to="/admin/herramientas/vocabularios" replace />} />
      <Route path="/admin/chat-vanguard" element={<Navigate to="/admin/comunicaciones/chat-vanguard" replace />} />
      <Route
        path="/admin/estadisticas"
        element={
          <PrivateRoute requiredType="ADMINISTRADOR">
            <AdminEstadisticas />
          </PrivateRoute>
        }
      />
      {/* Placeholder: Auditoría UI se implementará en la siguiente iteración */}
      <Route
        path="/admin/auditoria"
        element={
          <PrivateRoute requiredType="ADMINISTRADOR">
            <Dashboard />
          </PrivateRoute>
        }
      />
      <Route
        path="/asistencia/escaneo"
        element={
          <PrivateRoute>
            <AsistenciaEscaneo />
          </PrivateRoute>
        }
      />
      <Route
        path="/promotoria/dashboard"
        element={
          <PrivateRoute requiredType="PROMOTORIA">
            <Dashboard />
          </PrivateRoute>
        }
      />
      <Route
        path="/docente/dashboard"
        element={
          <PrivateRoute>
            <DocenteDashboard />
          </PrivateRoute>
        }
      />
      <Route
        path="/docente/herramientas/documentos"
        element={
          <PrivateRoute requiredType="DOCENTE">
            <DocenteHerramientas />
          </PrivateRoute>
        }
      />
      <Route
        path="/docente/herramientas/examenes"
        element={
          <PrivateRoute requiredType="DOCENTE">
            <MisHerramientasExamenes />
          </PrivateRoute>
        }
      />
      <Route
        path="/docente/herramientas/examenes/realizar/:id"
        element={
          <PrivateRoute requiredType="DOCENTE">
            <HerramientasExamenRealizar />
          </PrivateRoute>
        }
      />
      <Route
        path="/docente/herramientas/examenes/resultado/:examenId"
        element={
          <PrivateRoute requiredType="DOCENTE">
            <HerramientasExamenMiResultado />
          </PrivateRoute>
        }
      />
      <Route
        path="/docente/herramientas/encuestas"
        element={
          <PrivateRoute requiredType="DOCENTE">
            <MisEncuestas />
          </PrivateRoute>
        }
      />
      <Route
        path="/docente/herramientas/vocabularios"
        element={
          <PrivateRoute requiredType="DOCENTE">
            <DocenteVocabularios />
          </PrivateRoute>
        }
      />
      <Route
        path="/docente/herramientas/supervision"
        element={
          <PrivateRoute requiredType="DOCENTE">
            <AdminSupervision />
          </PrivateRoute>
        }
      />
      <Route path="/docente/herramientas" element={<Navigate to="/docente/herramientas/documentos" replace />} />
      <Route path="/docente/supervision" element={<Navigate to="/docente/herramientas/supervision" replace />} />
      <Route
        path="/docente/perfil"
        element={
          <PrivateRoute>
            <DocentePerfil />
          </PrivateRoute>
        }
      />
      <Route
        path="/docente/qr"
        element={
          <PrivateRoute>
            <DocenteQR />
          </PrivateRoute>
        }
      />
      <Route
        path="/docente/grupos"
        element={
          <PrivateRoute>
            <DocenteGrupos />
          </PrivateRoute>
        }
      />
      <Route
        path="/docente/grupos/:grupoId/conexiones-familiares"
        element={
          <PrivateRoute>
            <DocenteConexionesFamiliares />
          </PrivateRoute>
        }
      />
      <Route
        path="/docente/cursos"
        element={
          <PrivateRoute>
            <DocenteCursos />
          </PrivateRoute>
        }
      />
      <Route
        path="/docente/horario"
        element={
          <PrivateRoute>
            <DocenteHorario />
          </PrivateRoute>
        }
      />
      <Route
        path="/docente/comunicados"
        element={
          <PrivateRoute>
            <DocenteComunicados />
          </PrivateRoute>
        }
      />
      <Route
        path="/docente/actividades"
        element={
          <PrivateRoute>
            <DocenteActividades />
          </PrivateRoute>
        }
      />
      <Route
        path="/docente/mensajes"
        element={
          <PrivateRoute>
            <DocenteMensajes />
          </PrivateRoute>
        }
      />
      <Route
        path="/docente/hijos"
        element={
          <PrivateRoute>
            <DocenteHijos />
          </PrivateRoute>
        }
      />
      <Route
        path="/docente/tutoria"
        element={
          <PrivateRoute>
            <DocenteTutoria />
          </PrivateRoute>
        }
      />
      <Route
        path="/docente/cursos/:cursoId/aula"
        element={
          <PrivateRoute>
            <DocenteAulaVirtual />
          </PrivateRoute>
        }
      />
      {/* Rutas de Alumno */}
      <Route
        path="/alumno/dashboard"
        element={
          <PrivateRoute>
            <AlumnoDashboard />
          </PrivateRoute>
        }
      />
      <Route
        path="/alumno/perfil"
        element={
          <PrivateRoute>
            <AlumnoPerfil />
          </PrivateRoute>
        }
      />
      <Route
        path="/alumno/qr"
        element={
          <PrivateRoute>
            <AlumnoQR />
          </PrivateRoute>
        }
      />
      <Route
        path="/alumno/aula-virtual/:cursoId"
        element={
          <PrivateRoute>
            <AlumnoAulaVirtual />
          </PrivateRoute>
        }
      />
      <Route
        path="/docente/hijos/:hijoId/aula-virtual/:asignaturaId"
        element={
          <PrivateRoute>
            <DocenteHijoAulaVirtual />
          </PrivateRoute>
        }
      />
      <Route
        path="/docente/tutoria/grupos/:grupoId/orden-merito"
        element={
          <PrivateRoute>
            <DocenteTutoriaOrdenMerito />
          </PrivateRoute>
        }
      />
      <Route
        path="/docente/tutoria/grupos/:grupoId/aula-virtual/:asignaturaId"
        element={
          <PrivateRoute>
            <DocenteTutorAulaVirtual />
          </PrivateRoute>
        }
      />
      <Route
        path="/alumno/examen/:examenId"
        element={
          <PrivateRoute>
            <AlumnoExamen />
          </PrivateRoute>
        }
      />
      <Route
        path="/alumno/examen/:examenId/resultados"
        element={
          <PrivateRoute>
            <AlumnoExamenResultados />
          </PrivateRoute>
        }
      />
      {/* Rutas de Alumno */}
      <Route
        path="/alumno/cursos"
        element={
          <PrivateRoute>
            <AlumnoCursos />
          </PrivateRoute>
        }
      />
      <Route
        path="/alumno/horario"
        element={
          <PrivateRoute>
            <AlumnoHorario />
          </PrivateRoute>
        }
      />
      <Route
        path="/alumno/avatar"
        element={
          <PrivateRoute>
            <AlumnoAvatar />
          </PrivateRoute>
        }
      />
      <Route
        path="/test-avatar"
        element={
          <PrivateRoute>
            <AvatarTest />
          </PrivateRoute>
        }
      />
      <Route
        path="/demo-avatares"
        element={
          <PrivateRoute>
            <AvataresDemo />
          </PrivateRoute>
        }
      />
      <Route
        path="/alumno/comunicados"
        element={
          <PrivateRoute>
            <AlumnoComunicados />
          </PrivateRoute>
        }
      />
      <Route
        path="/alumno/actividades"
        element={
          <PrivateRoute>
            <AlumnoActividades />
          </PrivateRoute>
        }
      />
      <Route
        path="/alumno/mensajes"
        element={
          <PrivateRoute requiredType="ALUMNO">
            <AlumnoMensajes />
          </PrivateRoute>
        }
      />
      <Route
        path="/alumno/vocabularios"
        element={
          <PrivateRoute requiredType="ALUMNO">
            <AlumnoVocabularios />
          </PrivateRoute>
        }
      />
      {/* Rutas de Apoderado */}
      <Route
        path="/apoderado/dashboard"
        element={
          <PrivateRoute>
            <ApoderadoDashboard />
          </PrivateRoute>
        }
      />
      <Route
        path="/apoderado/perfil"
        element={
          <PrivateRoute>
            <ApoderadoPerfil />
          </PrivateRoute>
        }
      />
      <Route
        path="/apoderado/hijos"
        element={
          <PrivateRoute>
            <ApoderadoHijos />
          </PrivateRoute>
        }
      />
      <Route
        path="/apoderado/comunicados"
        element={
          <PrivateRoute>
            <ApoderadoComunicados />
          </PrivateRoute>
        }
      />
      <Route
        path="/apoderado/actividades"
        element={
          <PrivateRoute>
            <ApoderadoActividades />
          </PrivateRoute>
        }
      />
      <Route
        path="/apoderado/mensajes"
        element={
          <PrivateRoute>
            <ApoderadoMensajes />
          </PrivateRoute>
        }
      />
      <Route
        path="/apoderado/hijos/:hijoId/aula-virtual/:asignaturaId"
        element={
          <PrivateRoute>
            <ApoderadoHijoAulaVirtual />
          </PrivateRoute>
        }
      />
      {/* Rutas de Administrador */}
      <Route
        path="/admin/matriculas"
        element={
          <PrivateRoute requiredType="ADMINISTRADOR">
            <Dashboard />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/usuarios/administradores"
        element={<Navigate to="/admin/usuarios/equipo?perfil=ADMINISTRADOR" replace />}
      />
      <Route
        path="/admin/usuarios/personal"
        element={<Navigate to="/admin/usuarios/equipo" replace />}
      />
      <Route
        path="/admin/usuarios/equipo"
        element={
          <PrivateRoute requiredType="ADMINISTRADOR">
            <Dashboard />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/usuarios/alumnos"
        element={
          <PrivateRoute requiredType="ADMINISTRADOR">
            <Dashboard />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/usuarios/apoderados"
        element={
          <PrivateRoute requiredType="ADMINISTRADOR">
            <Dashboard />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/academico/niveles"
        element={
          <PrivateRoute requiredType="ADMINISTRADOR">
            <Dashboard />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/academico/grados"
        element={
          <PrivateRoute requiredType="ADMINISTRADOR">
            <Dashboard />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/academico/cursos"
        element={
          <PrivateRoute requiredType="ADMINISTRADOR">
            <Dashboard />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/academico/asignaturas"
        element={
          <PrivateRoute requiredType="ADMINISTRADOR">
            <Dashboard />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/academico/areas"
        element={
          <PrivateRoute requiredType="ADMINISTRADOR">
            <Dashboard />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/gamificacion/niveles"
        element={
          <PrivateRoute requiredType="ADMINISTRADOR">
            <Navigate to="/admin/avatares" replace />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/gamificacion/logros"
        element={
          <PrivateRoute requiredType="ADMINISTRADOR">
            <Navigate to="/admin/avatares" replace />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/avatares"
        element={
          <PrivateRoute requiredType="ADMINISTRADOR">
            <AdminAvatares />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/gamificacion/avatares"
        element={
          <PrivateRoute requiredType="ADMINISTRADOR">
            <Navigate to="/admin/avatares" replace />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/gamificacion/ranking"
        element={
          <PrivateRoute requiredType="ADMINISTRADOR">
            <Navigate to="/admin/avatares" replace />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/documentos-gestion"
        element={
          <PrivateRoute requiredType="ADMINISTRADOR">
            <AdminDocumentosGestion />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/herramientas/academicas"
        element={
          <PrivateRoute requiredType="ADMINISTRADOR">
            <AdminHerramientasAcademicas />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/herramientas/emocionales"
        element={
          <PrivateRoute requiredType="ADMINISTRADOR">
            <AdminHerramientasEmocionales />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/vanguarcito"
        element={
          <PrivateRoute requiredTypes={['ADMINISTRADOR', 'PROMOTORIA']}>
            <Dashboard />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/reportes/asistencias"
        element={
          <PrivateRoute requiredTypes={['ADMINISTRADOR', 'PROMOTORIA']}>
            <Dashboard />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/reportes/notas"
        element={
          <PrivateRoute requiredTypes={['ADMINISTRADOR', 'PROMOTORIA']}>
            <Dashboard />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/reportes/estadisticas"
        element={
          <PrivateRoute requiredTypes={['ADMINISTRADOR', 'PROMOTORIA']}>
            <Dashboard />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/config"
        element={
          <PrivateRoute requiredType="ADMINISTRADOR">
            <Dashboard />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/config/cumpleanos"
        element={
          <PrivateRoute requiredType="ADMINISTRADOR">
            <Dashboard />
          </PrivateRoute>
        }
      />
      <Route path="/admin/config/anio-escolar" element={<Navigate to="/admin/config" replace />} />
      <Route path="/admin/config/general" element={<Navigate to="/admin/config" replace />} />
      <Route path="/admin/config/temas" element={<Navigate to="/admin/config" replace />} />
      <Route path="/admin/config/pwa" element={<Navigate to="/admin/config" replace />} />
      <Route
        path="/admin/mensajes"
        element={
          <PrivateRoute requiredTypes={['ADMINISTRADOR', 'PROMOTORIA']}>
            <DocenteMensajes />
          </PrivateRoute>
        }
      />
      <Route path="/dashboard" element={<NavigateToDashboard />} />
      <Route path="/" element={<NavigateToDashboard />} />
    </Routes>
  );
}

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
        <AvatarWidgetProvider>
        <ColegioProvider colegioId={1}>
          <Router
            future={{
              v7_startTransition: true,
              v7_relativeSplatPath: true,
            }}
          >
            <ScrollToTop />
            <SwNotificationNavigateBridge />
            <AppRoutes />
          </Router>
        </ColegioProvider>
        </AvatarWidgetProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
