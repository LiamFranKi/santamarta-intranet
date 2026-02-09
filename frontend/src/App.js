import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ColegioProvider } from './context/ColegioContext';
import Login from './pages/Login';
import Dashboard from './pages/admin/Dashboard';
import DocenteDashboard from './pages/DocenteDashboard';
import DocentePerfil from './pages/DocentePerfil';
import DocenteGrupos from './pages/DocenteGrupos';
import DocenteCursos from './pages/DocenteCursos';
import DocenteHorario from './pages/DocenteHorario';
import DocenteComunicados from './pages/DocenteComunicados';
import DocenteActividades from './pages/DocenteActividades';
import DocenteMensajes from './pages/DocenteMensajes';
import AdminActividades from './pages/admin/AdminActividades';
import AdminComunicados from './pages/admin/AdminComunicados';
import AdminConfiguracion from './pages/admin/AdminConfiguracion';
import DocenteAulaVirtual from './pages/DocenteAulaVirtual';
import AlumnoDashboard from './pages/AlumnoDashboard';
import AlumnoPerfil from './pages/AlumnoPerfil';
import AlumnoQR from './pages/AlumnoQR';
import AlumnoAvatar from './pages/AlumnoAvatar';
import AlumnoAulaVirtual from './pages/AlumnoAulaVirtual';
import AlumnoComunicados from './pages/AlumnoComunicados';
import AlumnoActividades from './pages/AlumnoActividades';
import AlumnoMensajes from './pages/AlumnoMensajes';
import AlumnoCursos from './pages/AlumnoCursos';
import AlumnoExamen from './pages/AlumnoExamen';
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
function PrivateRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return <div>Cargando...</div>;
  }

  return isAuthenticated ? children : <Navigate to="/login" />;
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
function NavigateToDashboard() {
  const { user } = useAuth();
  const tipo = user?.tipo;
  
  if (tipo === 'DOCENTE') {
    return <Navigate to="/docente/dashboard" />;
  } else if (tipo === 'ALUMNO') {
    return <Navigate to="/alumno/dashboard" />;
  } else if (tipo === 'ADMINISTRADOR') {
    return <Navigate to="/admin/dashboard" />;
  }
  
  return <Navigate to="/admin/dashboard" />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/admin/dashboard"
        element={
          <PrivateRoute>
            <Dashboard />
          </PrivateRoute>
        }
      />
      {/* Placeholder: Auditoría UI se implementará en la siguiente iteración */}
      <Route
        path="/auditoria"
        element={
          <PrivateRoute>
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
        path="/docente/perfil"
        element={
          <PrivateRoute>
            <DocentePerfil />
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
        path="/alumno/examen/:examenId"
        element={
          <PrivateRoute>
            <AlumnoExamen />
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
        path="/alumno/calificaciones"
        element={
          <PrivateRoute>
            <AlumnoDashboard />
          </PrivateRoute>
        }
      />
      <Route
        path="/alumno/horario"
        element={
          <PrivateRoute>
            <AlumnoDashboard />
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
      {/* Rutas de Administrador */}
      <Route
        path="/admin/matriculas"
        element={
          <PrivateRoute>
            <Dashboard />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/usuarios/administradores"
        element={
          <PrivateRoute>
            <Dashboard />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/usuarios/personal"
        element={
          <PrivateRoute>
            <Dashboard />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/usuarios/alumnos"
        element={
          <PrivateRoute>
            <Dashboard />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/usuarios/apoderados"
        element={
          <PrivateRoute>
            <Dashboard />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/academico/niveles"
        element={
          <PrivateRoute>
            <Dashboard />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/academico/grados"
        element={
          <PrivateRoute>
            <Dashboard />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/academico/cursos"
        element={
          <PrivateRoute>
            <Dashboard />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/academico/asignaturas"
        element={
          <PrivateRoute>
            <Dashboard />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/academico/areas"
        element={
          <PrivateRoute>
            <Dashboard />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/gamificacion/niveles"
        element={
          <PrivateRoute>
            <Dashboard />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/gamificacion/logros"
        element={
          <PrivateRoute>
            <Dashboard />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/gamificacion/avatares"
        element={
          <PrivateRoute>
            <Dashboard />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/gamificacion/ranking"
        element={
          <PrivateRoute>
            <Dashboard />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/actividades"
        element={
          <PrivateRoute>
            <AdminActividades />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/comunicados"
        element={
          <PrivateRoute>
            <AdminComunicados />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/notificaciones"
        element={
          <PrivateRoute>
            <Dashboard />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/vanguarcito"
        element={
          <PrivateRoute>
            <Dashboard />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/reportes/asistencias"
        element={
          <PrivateRoute>
            <Dashboard />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/reportes/notas"
        element={
          <PrivateRoute>
            <Dashboard />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/reportes/estadisticas"
        element={
          <PrivateRoute>
            <Dashboard />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/config/anio-escolar"
        element={
          <PrivateRoute>
            <Dashboard />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/config/general"
        element={
          <PrivateRoute>
            <AdminConfiguracion />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/config/temas"
        element={
          <PrivateRoute>
            <Dashboard />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/config/pwa"
        element={
          <PrivateRoute>
            <Dashboard />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/mensajes"
        element={
          <PrivateRoute>
            <DocenteMensajes />
          </PrivateRoute>
        }
      />
      <Route path="/" element={<NavigateToDashboard />} />
    </Routes>
  );
}

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
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
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
