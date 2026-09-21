import React, { useMemo, useState } from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import ReporteListaAlumnosMatriculados from './reportesGeneral/ReporteListaAlumnosMatriculados';
import ReporteResumenAlumnosMatriculados from './reportesGeneral/ReporteResumenAlumnosMatriculados';
import ReporteListaAlumnosRetirados from './reportesGeneral/ReporteListaAlumnosRetirados';
import ReporteAlumnosDeudores from './reportesGeneral/ReporteAlumnosDeudores';
import ReporteAlumnosPagadores from './reportesGeneral/ReporteAlumnosPagadores';
import ReporteAlumnosPuntuales from './reportesGeneral/ReporteAlumnosPuntuales';
import ReporteResumenIngresos from './reportesGeneral/ReporteResumenIngresos';
import ReporteListaMaestrosPorAula from './reportesGeneral/ReporteListaMaestrosPorAula';
import ReporteListaPersonal from './reportesGeneral/ReporteListaPersonal';
import ReporteAsistenciaMensual from './reportesGeneral/ReporteAsistenciaMensual';
import ReporteAsistenciaConsolidado from './reportesGeneral/ReporteAsistenciaConsolidado';
import ReporteMontoPagarReal from './reportesGeneral/ReporteMontoPagarReal';
import ReporteAlumnos from './reportesGeneral/ReporteAlumnos';
import ReporteDeudaAnual from './reportesGeneral/ReporteDeudaAnual';
import ReporteRankingNotas from './reportesGeneral/ReporteRankingNotas';
import ReporteAsistenciaPersonal from './reportesGeneral/ReporteAsistenciaPersonal';
import ReporteHorariosPersonal from './reportesGeneral/ReporteHorariosPersonal';
import ReporteConsolidadoPromedios from './reportesGeneral/ReporteConsolidadoPromedios';
import ReporteConsolidadoPromediosDetallado from './reportesGeneral/ReporteConsolidadoPromediosDetallado';
import ReporteExamenesVirtuales from './reportesGeneral/ReporteExamenesVirtuales';
import ReporteNominasAlumnos from './reportesGeneral/ReporteNominasAlumnos';
import './AdminEstadisticas.css';
import './AdminReportesGeneral.css';

const REPORT_CATALOG = [
  {
    id: 'matricula',
    titulo: 'Matrícula',
    icon: '🎒',
    tone: 'matricula',
    resumen: 'Listas, antigüedad, retirados y nóminas.',
    items: [
      {
        id: 'lista-matriculados',
        label: 'Lista matriculados',
        icon: '👥',
        ayuda:
          'Consulte alumnos matriculados por sede, nivel, grado, sección y turno. Puede exportar a PDF con datos del alumno y apoderado.',
        Component: ReporteListaAlumnosMatriculados,
      },
      {
        id: 'resumen-matriculados',
        label: 'Resumen matriculados',
        icon: '📊',
        ayuda: 'Totales por grupo, nivel y sexo para una vista rápida de cobertura.',
        Component: ReporteResumenAlumnosMatriculados,
      },
      {
        id: 'lista-retirados',
        label: 'Lista retirados',
        icon: '🚪',
        ayuda: 'Alumnos retirados del año: útil para seguimiento administrativo.',
        Component: ReporteListaAlumnosRetirados,
      },
      {
        id: 'nominas',
        label: 'Nóminas de alumnos',
        icon: '📝',
        ayuda: 'Registro académico por grado con cuadros para anotaciones; vista previa y PDF.',
        Component: ReporteNominasAlumnos,
      },
      {
        id: 'alumnos-matricula',
        label: 'Reporte de alumnos',
        icon: '🧒',
        ayuda: 'Listado de matriculados con antigüedad (nuevos o antiguos en el colegio).',
        Component: ReporteAlumnos,
      },
    ],
  },
  {
    id: 'pagos',
    titulo: 'Pagos',
    icon: '💳',
    tone: 'pagos',
    resumen: 'Deudas, cobros, ingresos y montos.',
    items: [
      {
        id: 'deudores',
        label: 'Alumnos deudores',
        icon: '💳',
        ayuda: 'Saldo pendiente por concepto (matrícula y mensualidades).',
        Component: ReporteAlumnosDeudores,
      },
      {
        id: 'pagadores',
        label: 'Alumnos pagadores',
        icon: '✅',
        ayuda: 'Conceptos cancelados al 100% (matrícula y mensualidades).',
        Component: ReporteAlumnosPagadores,
      },
      {
        id: 'puntuales',
        label: 'Alumnos puntuales',
        icon: '⏱️',
        ayuda: 'Alumnos al día hasta el mes elegido, sin mora en ningún mes.',
        Component: ReporteAlumnosPuntuales,
      },
      {
        id: 'ingresos',
        label: 'Resumen de ingresos',
        icon: '📈',
        ayuda: 'Ingresos cobrados en un rango de fechas (diario, mensual o anual).',
        Component: ReporteResumenIngresos,
      },
      {
        id: 'monto-real',
        label: 'Monto a pagar real',
        icon: '💰',
        ayuda: 'Montos de matrícula y pensiones asignados, agrupados por aula.',
        Component: ReporteMontoPagarReal,
      },
      {
        id: 'deuda-anual',
        label: 'Deuda anual',
        icon: '📅',
        ayuda: 'Deuda pendiente por alumno: matrícula y pensiones del año.',
        Component: ReporteDeudaAnual,
      },
    ],
  },
  {
    id: 'personal',
    titulo: 'Personal',
    icon: '👨‍🏫',
    tone: 'personal',
    resumen: 'Docentes, personal y asistencia.',
    items: [
      {
        id: 'maestros-aula',
        label: 'Maestros por aula',
        icon: '🏫',
        ayuda: 'Docentes asignados por curso en el grupo seleccionado.',
        Component: ReporteListaMaestrosPorAula,
      },
      {
        id: 'lista-personal',
        label: 'Lista de personal',
        icon: '🪪',
        ayuda: 'Personal del colegio: cargo, contacto y datos básicos.',
        Component: ReporteListaPersonal,
      },
      {
        id: 'asistencia-personal',
        label: 'Asistencia del personal',
        icon: '🕒',
        ayuda: 'Marcaciones, tardanzas y descuentos por rango de fechas.',
        Component: ReporteAsistenciaPersonal,
      },
      {
        id: 'horarios-personal',
        label: 'Horarios',
        icon: '🗓️',
        ayuda: 'Horario de clases de cada docente (lunes a viernes, curso y grado), igual al de «Mi horario».',
        Component: ReporteHorariosPersonal,
      },
    ],
  },
  {
    id: 'academico',
    titulo: 'Académico',
    icon: '📚',
    tone: 'academico',
    resumen: 'Asistencia, rankings, consolidados y exámenes virtuales.',
    items: [
      {
        id: 'asistencia-mensual',
        label: 'Asistencia mensual',
        icon: '📆',
        ayuda: 'Asistencia diaria de alumnos del grupo (lunes a viernes del mes).',
        Component: ReporteAsistenciaMensual,
      },
      {
        id: 'asistencia-consolidado',
        label: 'Consolidado asistencia',
        icon: '📊',
        ayuda: 'Todas las aulas: tardanzas, faltas y no justificadas. Clic para ver alumnos y días. Exporta el consolidado a Excel.',
        Component: ReporteAsistenciaConsolidado,
      },
      {
        id: 'ranking-notas',
        label: 'Ranking de notas',
        icon: '🏆',
        ayuda: 'Orden de mérito del aula por bimestre: puntaje, promedio y puesto.',
        Component: ReporteRankingNotas,
      },
      {
        id: 'consolidado',
        label: 'Consolidado promedios',
        icon: '📐',
        ayuda: 'Promedios por curso o indicador (Inicial) de todas las aulas, por bimestre.',
        Component: ReporteConsolidadoPromedios,
      },
      {
        id: 'consolidado-det',
        label: 'Consolidado detallado',
        icon: '🧮',
        ayuda: 'Indicadores por curso y PROM de cada aula. Solo exportación Excel.',
        Component: ReporteConsolidadoPromediosDetallado,
      },
      {
        id: 'examenes-virtuales',
        label: 'Exámenes virtuales',
        icon: '📝',
        ayuda:
          'Exámenes del aula virtual del bimestre, agrupados por grupo, asignatura y docente, con notas de cada alumno. Filtros opcionales de nivel, grado, docente y fechas. Exportación PDF/Excel.',
        Component: ReporteExamenesVirtuales,
      },
    ],
  },
];

export default function AdminReportesGeneral() {
  const [activeCat, setActiveCat] = useState(REPORT_CATALOG[0].id);
  const [activeReportId, setActiveReportId] = useState(REPORT_CATALOG[0].items[0].id);

  const categoria = useMemo(
    () => REPORT_CATALOG.find((c) => c.id === activeCat) || REPORT_CATALOG[0],
    [activeCat]
  );

  const informe = useMemo(
    () => categoria.items.find((i) => i.id === activeReportId) || categoria.items[0],
    [categoria, activeReportId]
  );

  const seleccionarCategoria = (catId) => {
    const cat = REPORT_CATALOG.find((c) => c.id === catId);
    if (!cat) return;
    setActiveCat(catId);
    setActiveReportId(cat.items[0].id);
  };

  const ActiveComponent = informe.Component;

  return (
    <DashboardLayout>
      <div className="admin-estadisticas-page rg-page">
        <header className="rg-hero">
          <div className="rg-hero-icon" aria-hidden="true">
            🗂️
          </div>
          <div className="rg-hero-text">
            <h1>Reportes generales</h1>
            <p>
              Elija una categoría y luego el informe. Todos los reportes anteriores siguen disponibles; solo cambia
              la navegación para encontrarlos más rápido.
            </p>
          </div>
        </header>

        <nav className="rg-tabs-cat" aria-label="Categorías de reportes">
          {REPORT_CATALOG.map((cat) => (
            <button
              key={cat.id}
              type="button"
              className={`rg-tab-cat rg-tab-cat--${cat.tone} ${activeCat === cat.id ? 'is-active' : ''}`}
              onClick={() => seleccionarCategoria(cat.id)}
            >
              <span className="rg-tab-cat-icon" aria-hidden="true">
                {cat.icon}
              </span>
              <span className="rg-tab-cat-body">
                <strong>{cat.titulo}</strong>
                <small>{cat.resumen}</small>
              </span>
            </button>
          ))}
        </nav>

        <div className={`rg-shell rg-shell--${categoria.tone}`}>
          <nav className="rg-tabs-report" aria-label={`Informes de ${categoria.titulo}`}>
            {categoria.items.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`rg-tab-report ${activeReportId === item.id ? 'is-active' : ''}`}
                onClick={() => setActiveReportId(item.id)}
              >
                <span aria-hidden="true">{item.icon}</span>
                {item.label}
              </button>
            ))}
          </nav>

          <div className={`rg-help rg-help--${categoria.tone}`}>
            <div className="rg-help-icon" aria-hidden="true">
              {informe.icon}
            </div>
            <div>
              <h2>{informe.label}</h2>
              <p>{informe.ayuda}</p>
            </div>
          </div>

          <div className="rg-active-panel" key={informe.id}>
            <ActiveComponent />
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
