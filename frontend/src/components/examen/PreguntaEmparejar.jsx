import React, { useState } from 'react';
import { idsAlternativaExamenIguales } from '../../utils/examenRespuestaIds';

function valorEmparejadoParaAlt(emparejamientos, altId) {
  return Object.entries(emparejamientos || {}).find(([, v]) =>
    idsAlternativaExamenIguales(v, altId)
  );
}

function PreguntaEmparejar({ pregunta, respuesta, onRespuestaChange }) {
  const alternativas = pregunta.alternativas || [];
  const emparejamientos = respuesta || {};
  const [seleccionadoIzquierda, setSeleccionadoIzquierda] = useState(null);

  // Dividir en dos columnas usando par_id
  // Columna izquierda: alternativas que tienen par_id (son el origen, se emparejan con otras)
  // Columna derecha: alternativas que son referenciadas por par_id de otras (son el destino)
  const columnaIzquierda = alternativas.filter(alt => {
    // Si tiene par_id, va a la izquierda (es el origen)
    return alt.par_id !== null && alt.par_id !== undefined;
  });
  
  // Columna derecha: todas las alternativas que son referenciadas por par_id
  const idsDerecha = new Set(columnaIzquierda.map(alt => alt.par_id).filter(Boolean));
  const columnaDerecha = alternativas.filter(alt => idsDerecha.has(alt.id));
  
  // Si no hay par_id definido, usar división por mitad como fallback
  let colIzqFinal = columnaIzquierda;
  let colDerFinal = columnaDerecha;
  
  if (colIzqFinal.length === 0 || colDerFinal.length === 0) {
    const mitad = Math.ceil(alternativas.length / 2);
    colIzqFinal = alternativas.slice(0, mitad);
    colDerFinal = alternativas.slice(mitad);
  }

  const handleEmparejar = (izquierdaId, derechaId) => {
    const nuevoEmparejamiento = { ...emparejamientos };

    // Clic en la misma pareja: quitar emparejamiento
    if (idsAlternativaExamenIguales(nuevoEmparejamiento[izquierdaId], derechaId)) {
      delete nuevoEmparejamiento[izquierdaId];
      onRespuestaChange(nuevoEmparejamiento);
      setSeleccionadoIzquierda(null);
      return;
    }

    // Si la derecha ya estaba con otra, desemparejar esa otra
    Object.keys(nuevoEmparejamiento).forEach(key => {
      if (nuevoEmparejamiento[key] === derechaId) {
        delete nuevoEmparejamiento[key];
      }
    });

    nuevoEmparejamiento[izquierdaId] = derechaId;
    onRespuestaChange(nuevoEmparejamiento);
    setSeleccionadoIzquierda(null);
  };

  // Deseleccionar: clic de nuevo en el elemento izquierdo ya seleccionado
  const handleClicIzquierda = (altId) => {
    if (seleccionadoIzquierda === altId) {
      setSeleccionadoIzquierda(null);
      return;
    }
    setSeleccionadoIzquierda(altId);
  };

  return (
    <div className="pregunta-emparejar">
      <div 
        className="pregunta-descripcion"
        dangerouslySetInnerHTML={{ __html: pregunta.descripcion }}
      />
      
      <p className="instrucciones-emparejar">
        📌 Clic en un elemento de la izquierda y luego en uno de la derecha para emparejar. Clic de nuevo en el seleccionado para deseleccionar. Clic en la misma pareja para deshacer.
      </p>

      <div className="emparejar-container">
        <div className="emparejar-columna izquierda">
          <h3>Columna A</h3>
          {colIzqFinal.map((alt) => (
            <div
              key={alt.id}
              className={`emparejar-item izquierda ${seleccionadoIzquierda === alt.id ? 'seleccionado' : ''} ${emparejamientos[alt.id] != null || emparejamientos[String(alt.id)] != null ? 'emparejado' : ''}`}
              onClick={() => handleClicIzquierda(alt.id)}
            >
              <div 
                dangerouslySetInnerHTML={{ __html: alt.descripcion }}
              />
            </div>
          ))}
        </div>

        <div className="emparejar-columna derecha">
          <h3>Columna B</h3>
          {colDerFinal.map((alt) => (
            <div
              key={alt.id}
              className={`emparejar-item derecha ${valorEmparejadoParaAlt(emparejamientos, alt.id) ? 'emparejado' : ''} ${seleccionadoIzquierda && idsAlternativaExamenIguales(emparejamientos[seleccionadoIzquierda] ?? emparejamientos[String(seleccionadoIzquierda)], alt.id) ? 'conectado' : ''}`}
              onClick={() => {
                if (seleccionadoIzquierda) {
                  handleEmparejar(seleccionadoIzquierda, alt.id);
                }
              }}
            >
              <div 
                dangerouslySetInnerHTML={{ __html: alt.descripcion }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default PreguntaEmparejar;

