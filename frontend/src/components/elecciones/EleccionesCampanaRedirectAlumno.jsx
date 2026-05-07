import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

/** Alumno usa URL canónica /alumno/elecciones (compatibilidad con enlaces antiguos /elecciones-campana…). */
export default function EleccionesCampanaRedirectAlumno({ children }) {
  const { user } = useAuth();
  const location = useLocation();
  const tipo = String(user?.tipo || '').toUpperCase();
  if (tipo === 'ALUMNO') {
    const prefix = '/elecciones-campana';
    const rest = location.pathname.slice(prefix.length);
    const to = '/alumno/elecciones' + (rest || '');
    return <Navigate to={`${to}${location.search}${location.hash}`} replace />;
  }
  return children;
}
