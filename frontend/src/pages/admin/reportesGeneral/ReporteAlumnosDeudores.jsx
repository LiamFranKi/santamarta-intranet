import React from 'react';
import useReporteDeudoresPagadores from './useReporteDeudoresPagadores';

export default function ReporteAlumnosDeudores() {
  const { panel, modal } = useReporteDeudoresPagadores({
    modo: 'deudor',
    tone: 3,
    icon: '💳',
    title: 'Alumnos deudores',
    description: 'Saldo pendiente por concepto de pago (matrícula y mensualidades).',
    endpoint: '/admin/reportes/general/alumnos-deudores',
  });

  return (
    <>
      {panel}
      {modal}
    </>
  );
}
