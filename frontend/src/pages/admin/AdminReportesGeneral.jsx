import React from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import ReporteListaAlumnosMatriculados from './reportesGeneral/ReporteListaAlumnosMatriculados';
import ReporteResumenAlumnosMatriculados from './reportesGeneral/ReporteResumenAlumnosMatriculados';
import ReporteListaAlumnosRetirados from './reportesGeneral/ReporteListaAlumnosRetirados';
import ReporteAlumnosDeudores from './reportesGeneral/ReporteAlumnosDeudores';
import ReporteAlumnosPagadores from './reportesGeneral/ReporteAlumnosPagadores';
import ReporteResumenIngresos from './reportesGeneral/ReporteResumenIngresos';
import ReporteListaMaestrosPorAula from './reportesGeneral/ReporteListaMaestrosPorAula';
import ReporteListaPersonal from './reportesGeneral/ReporteListaPersonal';
import ReporteAsistenciaMensual from './reportesGeneral/ReporteAsistenciaMensual';
import ReporteMontoPagarReal from './reportesGeneral/ReporteMontoPagarReal';
import ReporteAlumnos from './reportesGeneral/ReporteAlumnos';
import ReporteDeudaAnual from './reportesGeneral/ReporteDeudaAnual';
import ReporteRankingNotas from './reportesGeneral/ReporteRankingNotas';
import ReporteAsistenciaPersonal from './reportesGeneral/ReporteAsistenciaPersonal';
import './AdminEstadisticas.css';
import './AdminReportesGeneral.css';

/**
 * Reportes generales: cada tipo de reporte va en un panel apilado (ReporteGeneralPanel),
 * uno debajo de otro, con tono pastel distinto (tone 0, 1, 2…).
 */
export default function AdminReportesGeneral() {
  return (
    <DashboardLayout>
      <div className="admin-estadisticas-page rg-page">
        <header className="admin-estadisticas-header">
          <h1 className="admin-estadisticas-title">Reportes generales</h1>
          <p className="admin-estadisticas-subtitle">
            Cada reporte aparece en su propia sección, una debajo de otra, con un color pastel distinto.
          </p>
        </header>

        <div className="rg-stack">
          <ReporteListaAlumnosMatriculados />
          <div className="rg-row-2">
            <ReporteResumenAlumnosMatriculados />
            <ReporteListaAlumnosRetirados />
          </div>
          <div className="rg-row-2">
            <ReporteAlumnosDeudores />
            <ReporteAlumnosPagadores />
          </div>
          <ReporteResumenIngresos />
          <div className="rg-row-2">
            <ReporteListaMaestrosPorAula />
            <ReporteListaPersonal />
          </div>
          <ReporteAsistenciaMensual />
          <div className="rg-row-3">
            <ReporteMontoPagarReal />
            <ReporteAlumnos />
            <ReporteDeudaAnual />
          </div>
          <div className="rg-row-2">
            <ReporteRankingNotas />
            <ReporteAsistenciaPersonal />
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
