import React from 'react';
import { useLocation } from 'react-router-dom';
import DashboardLayout from '../../components/DashboardLayout';
import HerramientasExamenesDisponiblesPanel from './HerramientasExamenesDisponiblesPanel';
import { HEX_DOCENTE_BASE } from './hexExamenesPaths';
import './HerramientasExamenes.css';

export default function MisHerramientasExamenes() {
  const { pathname } = useLocation();
  const docenteContext = pathname === HEX_DOCENTE_BASE || pathname.startsWith(`${HEX_DOCENTE_BASE}/`);

  return (
    <DashboardLayout>
      <div className="hex-exam-wrap">
        <HerramientasExamenesDisponiblesPanel compact={false} docenteContext={docenteContext} />
      </div>
    </DashboardLayout>
  );
}
