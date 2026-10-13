import React from 'react';

export default function ConductaBloquesNota({ bim }) {
  if (!bim || bim.modo !== 'nueva') return null;
  return (
    <div className="hijo-inc-bloques">
      <div>
        <span>Primeras 4 semanas</span>
        <strong>{bim.nota_mes_1 ?? '—'}</strong>
        <small>Restó {bim.descontado_1 ?? '0.00'}</small>
      </div>
      <div>
        <span>Siguientes semanas</span>
        <strong>{bim.nota_mes_2 ?? '—'}</strong>
        <small>Restó {bim.descontado_2 ?? '0.00'}</small>
      </div>
      <div className="es-promedio">
        <span>Promedio del bimestre</span>
        <strong>{bim.nota_conducta ?? '—'}</strong>
        <small>Promedio de los dos</small>
      </div>
    </div>
  );
}
