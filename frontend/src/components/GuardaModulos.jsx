import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useModulos } from '../context/ModulosContext';
import { CLAVES_CONFIG_PAGINA, CLAVES_WEB, claveDeRuta, inicioPorTipo } from '../utils/modulosSistema';

export default function GuardaModulos({ children }) {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const { listo, activo, alguno } = useModulos();

  if (!listo) return children;

  const clave = claveDeRuta(pathname);
  if (!clave) return children;

  let bloqueado = false;
  if (clave === 'config.pagina') bloqueado = !alguno(CLAVES_CONFIG_PAGINA);
  else if (clave === 'web.pagina') bloqueado = !alguno(CLAVES_WEB);
  else bloqueado = !activo(clave);

  if (!bloqueado) return children;
  return <Navigate to={inicioPorTipo(user?.tipo)} replace />;
}
