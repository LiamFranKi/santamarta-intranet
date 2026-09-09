import React, { useMemo } from 'react';
import {
  aclararColor,
  DIAS_SEMANA,
  filasHorario,
  formatearHora,
  getColorForCourse,
  obtenerClase,
} from '../../../utils/horarioDocenteGrid';

export default function HorarioDocenteTabla({ clases }) {
  const { horario, bloques } = useMemo(() => filasHorario(clases), [clases]);

  if (!bloques.length) {
    return <p className="rg-hp-empty">Este docente no tiene bloques de clase en el año seleccionado.</p>;
  }

  return (
    <div className="rg-hp-table-wrap">
      <table className="rg-hp-table">
        <thead>
          <tr>
            <th className="rg-hp-hora-col">Hora</th>
            {DIAS_SEMANA.map((dia) => (
              <th key={dia.id}>{dia.abrev}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {bloques.map((bloque) => (
            <tr key={`${bloque.inicio}-${bloque.fin}`}>
              <td className="rg-hp-hora">
                {formatearHora(bloque.inicio)} - {formatearHora(bloque.fin)}
              </td>
              {DIAS_SEMANA.map((dia) => {
                const clase = obtenerClase(horario, dia.id, bloque.inicio, bloque.fin);
                return (
                  <td
                    key={dia.id}
                    className={`rg-hp-celda ${clase ? '' : 'rg-hp-celda--vacia'}`}
                    style={
                      clase
                        ? { backgroundColor: aclararColor(getColorForCourse(clase.titulo), 0.5) }
                        : undefined
                    }
                  >
                    {clase ? (
                      <>
                        <strong>{clase.titulo || ''}</strong>
                        {clase.grupo ? <small>{clase.grupo}</small> : null}
                      </>
                    ) : null}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
