import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AvatarWidgetProvider } from './context/AvatarWidgetContext';
import { ColegioProvider } from './context/ColegioContext';
import Login from './pages/Login';
import Dashboard from './pages/admin/Dashboard';
import DocenteDashboard from './pages/DocenteDashboard';
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
import AdminEstadisticas from './pages/admin/AdminEstadisticas';
import DashboardLayout from './components/DashboardLayout';
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
import ApoderadoDashboard from './pages/ApoderadoDashboard';
import ApoderadoPerfil from './pages/ApoderadoPerfil';
import ApoderadoHijos from './pages/ApoderadoHijos';
import ApoderadoComunicados from './pages/ApoderadoComunicados';
import ApoderadoActividades from './pages/ApoderadoActividades';
import ApoderadoMensajes from './pages/ApoderadoMensajes';
import ApoderadoHijoAulaVirtual from './pages/ApoderadoHijoAulaVirtual';
import PromotoriaDashboard from './pages/promotoria/PromotoriaDashboard';
import './App.css';

// Configurar React Router para evitar warnings
const routerConfig = {
  future: {
    v7_startTransition: true,
    v7_relativeSplatPath: true,
  },
};

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
  const { pathname } = useLocation();

  useEffect(() => {
    // Hacer scroll al top cuando cambia la ruta
    window.scrollTo({
      top: 0,
      left: 0,
      behavior: 'smooth' // Scroll suave
    });
  }, [pathname]);

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
  const location = useLocation();
  return (
    <Routes key={location.pathname}>
      <Route path="/login" element={<Login />} />
      <Route
        path="/admin/dashboard"
        element={
          <PrivateRoute requiredType="ADMINISTRADOR">
            <Dashboard />
          </PrivateRoute>
        }
      />
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
            <PromotoriaDashboard />
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
          <PrivateRoute>
            <AlumnoMensajes />
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
        element={
          <PrivateRoute requiredType="ADMINISTRADOR">
            <Dashboard />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/usuarios/personal"
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
        path="/admin/actividades"
        element={
          <PrivateRoute requiredTypes={['ADMINISTRADOR', 'PROMOTORIA']}>
            <AdminActividades />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/comunicados"
        element={
          <PrivateRoute requiredTypes={['ADMINISTRADOR', 'PROMOTORIA']}>
            <AdminComunicados />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/notificaciones"
        element={
          <PrivateRoute requiredTypes={['ADMINISTRADOR', 'PROMOTORIA']}>
            <Dashboard />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/vanguarcito"
        element={
          <PrivateRoute requiredType="ADMINISTRADOR">
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
            <AppRoutes />
          </Router>
        </ColegioProvider>
        </AvatarWidgetProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
