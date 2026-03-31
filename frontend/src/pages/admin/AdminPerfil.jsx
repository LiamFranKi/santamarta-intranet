import React from 'react';
import { useAuth } from '../../context/AuthContext';
import DocentePerfil from '../DocentePerfil';

/**
 * Perfil del personal vinculado (misma UI que docente; API `/api/admin/perfil`).
 */
export default function AdminPerfil() {
  const { user } = useAuth();
  const dashboardPath =
    user?.tipo === 'PROMOTORIA' ? '/promotoria/dashboard' : '/admin/dashboard';
  return <DocentePerfil apiPrefix="/admin" dashboardPath={dashboardPath} />;
}
