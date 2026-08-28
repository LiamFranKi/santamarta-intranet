import React from 'react';
import DocenteTutoria from './DocenteTutoria';

/** Tutoría General: supervisión de todos los niveles. Puede quitar presentación, tardanza y olvido QR. */
function DocenteTutoriaGeneral() {
  return (
    <DocenteTutoria
      apiPrefix="/docente/tutoria-general"
      basePath="/docente/tutoria-general"
      soloLectura
      puedeQuitarDescuentosConducta
      titulo="Tutoría General"
      subtitulo="Supervisión de todos los niveles del colegio"
    />
  );
}

export default DocenteTutoriaGeneral;
