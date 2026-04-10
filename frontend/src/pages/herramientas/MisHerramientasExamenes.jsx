import React from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import HerramientasExamenesDisponiblesPanel from './HerramientasExamenesDisponiblesPanel';
import './HerramientasExamenes.css';

export default function MisHerramientasExamenes() {
  return (
    <DashboardLayout>
      <div className="hex-exam-wrap">
        <HerramientasExamenesDisponiblesPanel compact={false} />
      </div>
    </DashboardLayout>
  );
}
