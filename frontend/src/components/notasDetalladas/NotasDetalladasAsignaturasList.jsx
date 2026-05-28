import React from 'react';
import { colorNotasPorIndice } from './notasDetalladasUi';

function PromedioExamenMensual({ asignatura, ciclo }) {
  const examenes = asignatura.notas?.[ciclo]?.examen_mensual || {};
  const examen1 = examenes[1];
  const examen2 = examenes[2];
  if (!examen1 || !examen2) return null;
  const e1 = parseFloat(examen1);
  const e2 = parseFloat(examen2);
  if (Number.isNaN(e1) || Number.isNaN(e2) || e1 <= 0 || e2 <= 0) return null;
  return <span className="nota-promedio-criterio">{Math.round((e1 + e2) / 2)}</span>;
}

/**
 * Listado de cursos con criterios, cuadros de indicadores, promedios y PROMEDIO final.
 * Misma estructura que Apoderado → Opciones → Notas detalladas.
 */
export default function NotasDetalladasAsignaturasList({ asignaturas, cicloSeleccionado }) {
  if (!asignaturas?.length) return null;

  return (
    <div className="asignaturas-notas-container">
      {asignaturas.map((asignatura, index) => {
        const color = colorNotasPorIndice(index);
        const muestraPeso = asignatura.nivel?.tipo_calificacion_final === 1;

        return (
          <div
            key={asignatura.asignatura_id}
            className="asignatura-notas-card"
            style={{
              background: color.bg,
              borderColor: color.border,
              color: color.text,
            }}
          >
            <div className="asignatura-notas-header">
              <h3>{asignatura.curso_nombre}</h3>
            </div>
            <div className="asignatura-notas-body">
              <table className="notas-detalladas-table">
                <tbody>
                  {(asignatura.criterios || []).map((criterio) => {
                    const tieneIndicadores = criterio.indicadores?.length > 0;
                    const notaCriterio = criterio.notas?.[cicloSeleccionado] ?? null;

                    return (
                      <tr key={criterio.id}>
                        <th className="criterio-label">
                          {criterio.descripcion}
                          {muestraPeso && criterio.peso != null && (
                            <span className="criterio-peso"> ({criterio.peso}%)</span>
                          )}
                        </th>
                        <td className="criterio-notas">
                          {tieneIndicadores ? (
                            <div className="indicadores-container">
                              <div className="indicadores-notas">
                                {criterio.indicadores.map((indicador) => {
                                  const cuadros = indicador.cuadros || 1;
                                  return Array.from({ length: cuadros }, (_, i) => {
                                    const nota =
                                      asignatura.notas?.[cicloSeleccionado]?.[criterio.id]?.[indicador.id]?.[i] ??
                                      '-';
                                    return (
                                      <span key={`${indicador.id}-${i}`} className="nota-indicador">
                                        {nota}
                                      </span>
                                    );
                                  });
                                })}
                              </div>
                              {notaCriterio != null && notaCriterio !== '' && (
                                <span className="nota-promedio-criterio">{notaCriterio}</span>
                              )}
                            </div>
                          ) : (
                            <span className="nota-directa">{notaCriterio ?? '-'}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}

                  {asignatura.examen_mensual && (
                    <tr>
                      <th className="criterio-label">
                        Examen Mensual ({asignatura.peso_examen_mensual}%)
                      </th>
                      <td className="criterio-notas">
                        <div className="indicadores-container">
                          <div className="indicadores-notas">
                            <span className="nota-indicador">
                              {asignatura.notas?.[cicloSeleccionado]?.examen_mensual?.[1] ?? '-'}
                            </span>
                            <span className="nota-indicador">
                              {asignatura.notas?.[cicloSeleccionado]?.examen_mensual?.[2] ?? '-'}
                            </span>
                          </div>
                          <PromedioExamenMensual asignatura={asignatura} ciclo={cicloSeleccionado} />
                        </div>
                      </td>
                    </tr>
                  )}

                  <tr className="promedio-final-row">
                    <th className="criterio-label">PROMEDIO</th>
                    <td className="criterio-notas">
                      <span className="nota-promedio-final">
                        {asignatura.notas?.[cicloSeleccionado]?.promedio_final ?? '-'}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
