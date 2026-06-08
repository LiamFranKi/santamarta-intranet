import React from 'react';
import DocenteTutoria from './DocenteTutoria';

/** Tutoría General: supervisión transversal de todos los niveles (solo lectura). */
function DocenteTutoriaGeneral() {
  return (
    <DocenteTutoria
      apiPrefix="/docente/tutoria-general"
      basePath="/docente/tutoria-general"
      soloLectura
      titulo="Tutoría General"
      subtitulo="Supervisión de todos los niveles del colegio"
    />
  );
}

export default DocenteTutoriaGeneral;
