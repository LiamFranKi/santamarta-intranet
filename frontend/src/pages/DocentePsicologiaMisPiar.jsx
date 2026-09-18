import React from 'react';
import { Navigate } from 'react-router-dom';

export default function DocentePsicologiaMisPiar() {
  return <Navigate to="/docente/psicologia?tab=piar" replace />;
}
