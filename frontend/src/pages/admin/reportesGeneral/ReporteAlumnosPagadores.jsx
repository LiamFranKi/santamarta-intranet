import React from 'react';
import useReporteDeudoresPagadores from './useReporteDeudoresPagadores';

export default function ReporteAlumnosPagadores() {
  const { panel, modal } = useReporteDeudoresPagadores({
    modo: 'pagador',
    tone: 4,
    icon: '✅',
    title: 'Alumnos pagadores',
    description: 'Conceptos de pago cancelados al 100% (matrícula y mensualidades).',
    endpoint: '/admin/reportes/general/alumnos-pagadores',
  });

  return (
    <>
      {panel}
      {modal}
    </>
  );
}
