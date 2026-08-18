import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AvatarWidgetProvider } from './context/AvatarWidgetContext';
import { ColegioProvider } from './context/ColegioContext';
import api from './services/api';
import Login from './pages/Login';
import Dashboard from './pages/admin/Dashboard';
import PsicologaDashboard from './pages/admin/PsicologaDashboard';
import DocenteDashboard from './pages/DocenteDashboard';
import DocenteHerramientas from './pages/DocenteHerramientas';
import DocentePerfil from './pages/DocentePerfil';
import DocenteQR from './pages/DocenteQR';
import DocenteGrupos from './pages/DocenteGrupos';
import DocentePsicologiaMisDerivaciones from './pages/DocentePsicologiaMisDerivaciones';
import DocentePsicologiaDerivar from './pages/DocentePsicologiaDerivar';
import DocentePsicologiaMisPiar from './pages/DocentePsicologiaMisPiar';
import DocentePsicologiaPiarDetalle from './pages/DocentePsicologiaPiarDetalle';
import DocenteConexionesFamiliares from './pages/DocenteConexionesFamiliares';
import DocenteCursos from './pages/DocenteCursos';
import DocenteHorario from './pages/DocenteHorario';
import DocenteComunicados from './pages/DocenteComunicados';
import DocenteActividades from './pages/DocenteActividades';
import DocenteMensajes from './pages/DocenteMensajes';
import DocenteHijos from './pages/DocenteHijos';
import DocenteTutoria from './pages/DocenteTutoria';
import DocenteTutoriaGeneral from './pages/DocenteTutoriaGeneral';
import DocenteTutoriaGeneralAulaVirtual from './pages/DocenteTutoriaGeneralAulaVirtual';
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
import AdminNotificacionesEnvio from './pages/admin/AdminNotificacionesEnvio';
import AdminReclamosSugerencias from './pages/admin/AdminReclamosSugerencias';
import AdminHorarioGen from './pages/admin/AdminHorarioGen';
import AdminHerramientasDinamicas from './pages/admin/AdminHerramientasDinamicas';
import AdminHerramientasAcademicas from './pages/admin/AdminHerramientasAcademicas';
import AdminHerramientasEmocionales from './pages/admin/AdminHerramientasEmocionales';
import AdminVocabularios from './pages/admin/AdminVocabularios';
import DocenteVocabularios from './pages/DocenteVocabularios';
import AlumnoVocabularios from './pages/AlumnoVocabularios';
import AlumnoHerramientasDocumentos from './pages/AlumnoHerramientasDocumentos';
import AlumnoElecciones from './pages/AlumnoElecciones';
import AlumnoEleccionProceso from './pages/AlumnoEleccionProceso';
import AlumnoEleccionLanding from './pages/AlumnoEleccionLanding';
import AlumnoEleccionVotar from './pages/AlumnoEleccionVotar';
import EleccionResultadosLive from './pages/EleccionResultadosLive';
import EleccionesCampanaRedirectAlumno from './components/elecciones/EleccionesCampanaRedirectAlumno';
import AdminIncidencias from './pages/admin/AdminIncidencias';
import HerramientasExamenesLista from './pages/herramientas/HerramientasExamenesLista';
import HerramientasExamenEditor from './pages/herramientas/HerramientasExamenEditor';
import HerramientasExamenEstadisticas from './pages/herramientas/HerramientasExamenEstadisticas';
import MisHerramientasExamenes from './pages/herramientas/MisHerramientasExamenes';
import HerramientasExamenRealizar from './pages/herramientas/HerramientasExamenRealizar';
import HerramientasExamenMiResultado from './pages/herramientas/HerramientasExamenMiResultado';
import DisenadorFichas from './pages/herramientas/DisenadorFichas';
import AdminSupervision from './pages/admin/AdminSupervision';
import AdminTardanzas from './pages/admin/AdminTardanzas';
import AdminEncuestas from './pages/admin/AdminEncuestas';
import AdminEncuestaEditor from './pages/admin/AdminEncuestaEditor';
import AdminEncuestaEstadisticas from './pages/admin/AdminEncuestaEstadisticas';
import AdminEncuestaHistorial from './pages/admin/AdminEncuestaHistorial';
import AdminElecciones from './pages/admin/AdminElecciones';
import AdminEleccionProceso from './pages/admin/AdminEleccionProceso';
import AdminEleccionVotos from './pages/admin/AdminEleccionVotos';
import AdminEventos from './pages/admin/AdminEventos';
import AdminEnConstruccion from './pages/admin/AdminEnConstruccion';
import AdminPagosEscolares from './pages/admin/pagosEscolares/AdminPagosEscolares';
import AdminProductos from './pages/admin/facturacion/AdminProductos';
import AdminVentas from './pages/admin/facturacion/AdminVentas';
import AdminCompras from './pages/admin/facturacion/AdminCompras';
import AdminCajaChica from './pages/admin/facturacion/AdminCajaChica';
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
import MatriculaOnline from './pages/MatriculaOnline';
import ApoderadoDashboard from './pages/ApoderadoDashboard';
import ApoderadoPerfil from './pages/ApoderadoPerfil';
import ApoderadoHijos from './pages/ApoderadoHijos';
import ApoderadoComunicados from './pages/ApoderadoComunicados';
import ApoderadoActividades from './pages/ApoderadoActividades';
import ApoderadoMensajes from './pages/ApoderadoMensajes';
import ApoderadoDocumentos from './pages/ApoderadoDocumentos';
import ApoderadoPsicologia from './pages/ApoderadoPsicologia';
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

/** Personal intranet que puede previsualizar campañas con la misma URL que alumno (usa API portal en cliente). */
const ELECCIONES_PORTAL_STAFF_TIPOS = ['ADMINISTRADOR', 'SECRETARIA', 'PROMOTORIA', 'PSICOLOGA'];
const ELECCIONES_ALUMNO_RUTA_TIPOS = ['ALUMNO', ...ELECCIONES_PORTAL_STAFF_TIPOS];
const ELECCIONES_CAMPANA_RUTA_TIPOS = ['ALUMNO', 'APODERADO', 'DOCENTE', ...ELECCIONES_PORTAL_STAFF_TIPOS];

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
    } else if (user?.tipo === 'SECRETARIA') {
      return <Navigate to="/admin/dashboard" />;
    } else if (user?.tipo === 'ADMINISTRADOR') {
      return <Navigate to="/admin/dashboard" />;
    } else if (user?.tipo === 'PSICOLOGA') {
      return <Navigate to="/admin/psicologa-dashboard" replace />;
    }
    // Si no tiene un tipo válido, redirigir al login
    return <Navigate to="/login" />;
  }

  return children;
}

/** Caja Chica: admin/secretaría/tipo CAJERO, o personal en lista Configuración → Cajero. */
function CajaChicaRoute({ children }) {
  const { isAuthenticated, loading, user } = useAuth();
  const [ok, setOk] = React.useState(null);

  React.useEffect(() => {
    let cancelled = false;
    const tiposDirectos = ['ADMINISTRADOR', 'SECRETARIA', 'CAJERO'];
    if (!isAuthenticated || !user) {
      setOk(false);
      return undefined;
    }
    if (tiposDirectos.includes(user.tipo)) {
      setOk(true);
      return undefined;
    }
    (async () => {
      try {
        const { data } = await api.get('/docente/roles-adicionales');
        if (!cancelled) setOk(!!data.es_cajero_caja_chica);
      } catch {
        if (!cancelled) setOk(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, user]);

  if (loading || ok === null) {
    return <div>Cargando...</div>;
  }
  if (!isAuthenticated) {
    return <Navigate to="/login" />;
  }
  if (!ok) {
    if (user?.tipo === 'DOCENTE') return <Navigate to="/docente/dashboard" />;
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
  } else if (tipo === 'SECRETARIA') {
    return <Navigate to="/admin/dashboard" replace />;
  } else if (tipo === 'PSICOLOGA') {
    return <Navigate to="/admin/psicologa-dashboard" replace />;
  }

  // Tipo desconocido: ir al login en lugar de asumir admin
  return <Navigate to="/login" replace />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/evento/:token" element={<EventoPublicoAsistencia />} />
      <Route path="/matricula_online" element={<MatriculaOnline />} />
      <Route
        path="/admin/dashboard"
        element={
          <PrivateRoute requiredTypes={['ADMINISTRADOR', 'SECRETARIA']}>
            <Dashboard />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/perfil"
        element={
          <PrivateRoute requiredTypes={['ADMINISTRADOR', 'PROMOTORIA', 'SECRETARIA', 'PSICOLOGA']}>
            <AdminPerfil />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/psicologa-dashboard"
        element={
          <PrivateRoute requiredType="PSICOLOGA">
            <PsicologaDashboard />
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
          <PrivateRoute requiredTypes={['ADMINISTRADOR', 'PROMOTORIA', 'PSICOLOGA']}>
            <AdminPublicaciones />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/comunicaciones/conexiones"
        element={
          <PrivateRoute requiredTypes={['ADMINISTRADOR', 'PROMOTORIA', 'PSICOLOGA']}>
            <AdminConexiones />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/reportes/incidencias"
        element={
          <PrivateRoute requiredTypes={['ADMINISTRADOR', 'PROMOTORIA', 'PSICOLOGA']}>
            <AdminIncidencias />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/comunicaciones/incidencias"
        element={<Navigate to="/admin/reportes/incidencias" replace />}
      />
      <Route
        path="/admin/comunicaciones/chat-vanguard"
        element={
          <PrivateRoute requiredTypes={['ADMINISTRADOR', 'PROMOTORIA', 'PSICOLOGA']}>
            <Dashboard />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/comunicaciones/actividades"
        element={
          <PrivateRoute requiredTypes={['ADMINISTRADOR', 'PROMOTORIA', 'PSICOLOGA']}>
            <AdminActividades />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/comunicaciones/comunicados"
        element={
          <PrivateRoute requiredTypes={['ADMINISTRADOR', 'PROMOTORIA', 'PSICOLOGA']}>
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
          <PrivateRoute requiredTypes={['ADMINISTRADOR', 'PROMOTORIA', 'PSICOLOGA']}>
            <AdminNotificacionesEnvio />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/horario-gen"
        element={
          <PrivateRoute requiredType="ADMINISTRADOR">
            <AdminHorarioGen />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/comunicaciones/web"
        element={
          <PrivateRoute requiredType="ADMINISTRADOR">
            <AdminReclamosSugerencias />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/comunicaciones/reclamos-sugerencias"
        element={<Navigate to="/admin/comunicaciones/web" replace />}
      />
      <Route path="/admin/publicaciones" element={<Navigate to="/admin/comunicaciones/publicaciones" replace />} />
      <Route path="/admin/conexiones" element={<Navigate to="/admin/comunicaciones/conexiones" replace />} />
      <Route path="/admin/incidencias" element={<Navigate to="/admin/reportes/incidencias" replace />} />
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
        path="/admin/herramientas/disenador-fichas"
        element={
          <PrivateRoute requiredTypes={['ADMINISTRADOR', 'PROMOTORIA', 'DOCENTE']}>
            <DisenadorFichas />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/herramientas/elecciones"
        element={
          <PrivateRoute requiredTypes={['ADMINISTRADOR', 'SECRETARIA', 'PROMOTORIA']}>
            <AdminElecciones />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/herramientas/elecciones/:procesoId"
        element={
          <PrivateRoute requiredTypes={['ADMINISTRADOR', 'SECRETARIA', 'PROMOTORIA']}>
            <AdminEleccionProceso />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/herramientas/elecciones/:procesoId/votos"
        element={
          <PrivateRoute requiredTypes={['ADMINISTRADOR', 'SECRETARIA', 'PROMOTORIA']}>
            <AdminEleccionVotos />
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
      <Route
        path="/admin/herramientas/tardanzas"
        element={
          <PrivateRoute requiredType="ADMINISTRADOR">
            <AdminTardanzas />
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
          <PrivateRoute requiredTypes={['ASISTENCIA', 'ADMINISTRADOR', 'DOCENTE']}>
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
          <PrivateRoute requiredTypes={['DOCENTE', 'PSICOLOGA']}>
            <DocenteHerramientas />
          </PrivateRoute>
        }
      />
      <Route
        path="/docente/herramientas/examenes"
        element={
          <PrivateRoute requiredTypes={['DOCENTE', 'PSICOLOGA']}>
            <MisHerramientasExamenes />
          </PrivateRoute>
        }
      />
      <Route
        path="/docente/herramientas/examenes/realizar/:id"
        element={
          <PrivateRoute requiredTypes={['DOCENTE', 'PSICOLOGA']}>
            <HerramientasExamenRealizar />
          </PrivateRoute>
        }
      />
      <Route
        path="/docente/herramientas/examenes/resultado/:examenId"
        element={
          <PrivateRoute requiredTypes={['DOCENTE', 'PSICOLOGA']}>
            <HerramientasExamenMiResultado />
          </PrivateRoute>
        }
      />
      <Route
        path="/docente/herramientas/encuestas"
        element={
          <PrivateRoute requiredTypes={['DOCENTE', 'PSICOLOGA']}>
            <MisEncuestas />
          </PrivateRoute>
        }
      />
      <Route
        path="/docente/herramientas/vocabularios"
        element={
          <PrivateRoute requiredTypes={['DOCENTE', 'PSICOLOGA']}>
            <DocenteVocabularios />
          </PrivateRoute>
        }
      />
      <Route
        path="/docente/herramientas/disenador-fichas"
        element={
          <PrivateRoute requiredTypes={['DOCENTE', 'PSICOLOGA', 'ADMINISTRADOR', 'PROMOTORIA']}>
            <DisenadorFichas />
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
        path="/docente/psicologia/derivaciones"
        element={
          <PrivateRoute requiredType="DOCENTE">
            <DocentePsicologiaMisDerivaciones />
          </PrivateRoute>
        }
      />
      <Route
        path="/docente/psicologia/derivar/:alumnoId"
        element={
          <PrivateRoute requiredType="DOCENTE">
            <DocentePsicologiaDerivar />
          </PrivateRoute>
        }
      />
      <Route
        path="/docente/psicologia/piar"
        element={
          <PrivateRoute requiredType="DOCENTE">
            <DocentePsicologiaMisPiar />
          </PrivateRoute>
        }
      />
      <Route
        path="/docente/psicologia/piar/:id"
        element={
          <PrivateRoute requiredType="DOCENTE">
            <DocentePsicologiaPiarDetalle />
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
        path="/docente/tutoria-general"
        element={
          <PrivateRoute>
            <DocenteTutoriaGeneral />
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
        path="/docente/tutoria-general/grupos/:grupoId/aula-virtual/:asignaturaId"
        element={
          <PrivateRoute>
            <DocenteTutoriaGeneralAulaVirtual />
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
      <Route
        path="/alumno/herramientas/documentos"
        element={
          <PrivateRoute requiredType="ALUMNO">
            <AlumnoHerramientasDocumentos />
          </PrivateRoute>
        }
      />
      <Route
        path="/alumno/elecciones"
        element={
          <PrivateRoute requiredTypes={ELECCIONES_ALUMNO_RUTA_TIPOS}>
            <AlumnoElecciones />
          </PrivateRoute>
        }
      />
      <Route
        path="/alumno/elecciones/:procesoId"
        element={
          <PrivateRoute requiredTypes={ELECCIONES_ALUMNO_RUTA_TIPOS}>
            <AlumnoEleccionProceso />
          </PrivateRoute>
        }
      />
      <Route
        path="/alumno/elecciones/:procesoId/lista/:listaId"
        element={
          <PrivateRoute requiredTypes={ELECCIONES_ALUMNO_RUTA_TIPOS}>
            <AlumnoEleccionLanding />
          </PrivateRoute>
        }
      />
      <Route
        path="/alumno/elecciones/:procesoId/votar"
        element={
          <PrivateRoute requiredType="ALUMNO">
            <AlumnoEleccionVotar />
          </PrivateRoute>
        }
      />
      <Route
        path="/alumno/elecciones/:procesoId/resultados"
        element={
          <PrivateRoute requiredTypes={ELECCIONES_ALUMNO_RUTA_TIPOS}>
            <EleccionResultadosLive />
          </PrivateRoute>
        }
      />
      <Route
        path="/elecciones-campana"
        element={
          <PrivateRoute requiredTypes={ELECCIONES_CAMPANA_RUTA_TIPOS}>
            <EleccionesCampanaRedirectAlumno>
              <AlumnoElecciones />
            </EleccionesCampanaRedirectAlumno>
          </PrivateRoute>
        }
      />
      <Route
        path="/elecciones-campana/:procesoId"
        element={
          <PrivateRoute requiredTypes={ELECCIONES_CAMPANA_RUTA_TIPOS}>
            <EleccionesCampanaRedirectAlumno>
              <AlumnoEleccionProceso />
            </EleccionesCampanaRedirectAlumno>
          </PrivateRoute>
        }
      />
      <Route
        path="/elecciones-campana/:procesoId/lista/:listaId"
        element={
          <PrivateRoute requiredTypes={ELECCIONES_CAMPANA_RUTA_TIPOS}>
            <EleccionesCampanaRedirectAlumno>
              <AlumnoEleccionLanding />
            </EleccionesCampanaRedirectAlumno>
          </PrivateRoute>
        }
      />
      <Route
        path="/elecciones-campana/:procesoId/votar"
        element={
          <PrivateRoute requiredTypes={ELECCIONES_CAMPANA_RUTA_TIPOS}>
            <EleccionesCampanaRedirectAlumno>
              <AlumnoEleccionVotar />
            </EleccionesCampanaRedirectAlumno>
          </PrivateRoute>
        }
      />
      <Route
        path="/elecciones-campana/:procesoId/resultados"
        element={
          <PrivateRoute requiredTypes={ELECCIONES_CAMPANA_RUTA_TIPOS}>
            <EleccionesCampanaRedirectAlumno>
              <EleccionResultadosLive />
            </EleccionesCampanaRedirectAlumno>
          </PrivateRoute>
        }
      />
      <Route path="/alumno/herramientas" element={<Navigate to="/alumno/herramientas/documentos" replace />} />
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
        path="/apoderado/documentos"
        element={
          <PrivateRoute>
            <ApoderadoDocumentos />
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
      <Route
        path="/apoderado/psicologia/:alumnoId"
        element={
          <PrivateRoute requiredType="APODERADO">
            <ApoderadoPsicologia />
          </PrivateRoute>
        }
      />
      <Route
        path="/apoderado/psicologia"
        element={
          <PrivateRoute requiredType="APODERADO">
            <ApoderadoPsicologia />
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
        path="/admin/psicologia/alumno/:alumnoId"
        element={
          <PrivateRoute requiredTypes={['ADMINISTRADOR', 'PROMOTORIA', 'SECRETARIA', 'PSICOLOGA']}>
            <Dashboard />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/psicologia"
        element={
          <PrivateRoute requiredTypes={['ADMINISTRADOR', 'PROMOTORIA', 'SECRETARIA', 'PSICOLOGA']}>
            <Dashboard />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/pagos-facturas/buscar-pagos"
        element={
          <PrivateRoute requiredTypes={['ADMINISTRADOR', 'SECRETARIA', 'CAJERO']}>
            <AdminPagosEscolares />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/pagos-facturas/productos"
        element={
          <PrivateRoute requiredTypes={['ADMINISTRADOR', 'SECRETARIA', 'CAJERO']}>
            <AdminProductos />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/pagos-facturas/ventas"
        element={
          <PrivateRoute requiredTypes={['ADMINISTRADOR', 'SECRETARIA', 'CAJERO']}>
            <AdminVentas />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/pagos-facturas/compras"
        element={
          <PrivateRoute requiredTypes={['ADMINISTRADOR', 'SECRETARIA', 'CAJERO']}>
            <AdminCompras />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/pagos-facturas/caja-chica"
        element={
          <CajaChicaRoute>
            <AdminCajaChica />
          </CajaChicaRoute>
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
          <PrivateRoute requiredTypes={['ADMINISTRADOR', 'PSICOLOGA']}>
            <Dashboard />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/usuarios/apoderados"
        element={
          <PrivateRoute requiredTypes={['ADMINISTRADOR', 'PSICOLOGA']}>
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
          <PrivateRoute requiredTypes={['ADMINISTRADOR', 'PSICOLOGA']}>
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
          <PrivateRoute requiredTypes={['ADMINISTRADOR', 'PROMOTORIA', 'PSICOLOGA']}>
            <Dashboard />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/reportes/general"
        element={
          <PrivateRoute requiredTypes={['ADMINISTRADOR', 'PROMOTORIA']}>
            <Dashboard />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/reportes/temas"
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
        path="/admin/reportes/deudores"
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
      <Route
        path="/admin/config/indicadores"
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
          <PrivateRoute requiredTypes={['ADMINISTRADOR', 'PROMOTORIA', 'PSICOLOGA']}>
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
