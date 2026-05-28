import React from 'react';
import '../../pages/DocenteHijos.css';
import AlumnoAsistenciasHistorialModal from './AlumnoAsistenciasHistorialModal';
import AlumnoIncidenciasModal from './AlumnoIncidenciasModal';
import AlumnoNotasDetalladasModal from '../notasDetalladas/AlumnoNotasDetalladasModal';

export default function GrupoAlumnoAccionesAcademicasModals({
  nombreAlumno,
  alumnoSel,
  modalIncidencias,
  setModalIncidencias,
  incidencias,
  loadingIncidencias,
  modalAsistencias,
  setModalAsistencias,
  asistencias,
  loadingAsistencias,
  totalesAsistencias,
  modalNotas,
  setModalNotas,
  notasDetalladas,
  cicloNotas,
  setCicloNotas,
  loadingNotas,
}) {
  const titulo = alumnoSel ? nombreAlumno(alumnoSel) : '';

  return (
    <>
      <AlumnoIncidenciasModal
        open={modalIncidencias}
        onClose={() => setModalIncidencias(false)}
        nombreAlumno={titulo}
        incidencias={incidencias}
        loading={loadingIncidencias}
      />

      <AlumnoAsistenciasHistorialModal
        open={modalAsistencias}
        onClose={() => setModalAsistencias(false)}
        nombreAlumno={titulo}
        asistencias={asistencias}
        loading={loadingAsistencias}
        totalPresentes={totalesAsistencias?.presentes ?? 0}
        totalTardanzas={totalesAsistencias?.tardanzas ?? 0}
        totalFaltas={totalesAsistencias?.faltas ?? 0}
      />

      <AlumnoNotasDetalladasModal
        open={modalNotas}
        onClose={() => setModalNotas(false)}
        nombreAlumno={titulo}
        notasDetalladas={notasDetalladas}
        loading={loadingNotas}
        cicloNotas={cicloNotas}
        onCicloChange={setCicloNotas}
      />
    </>
  );
}
