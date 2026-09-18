import React from 'react';
import { Navigate } from 'react-router-dom';

export default function DocentePsicologiaMisDerivaciones() {
  return <Navigate to="/docente/psicologia?tab=derivaciones" replace />;
}
