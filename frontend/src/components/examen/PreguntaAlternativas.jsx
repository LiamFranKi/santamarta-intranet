import React from 'react';
import { idsAlternativaExamenIguales } from '../../utils/examenRespuestaIds';

function PreguntaAlternativas({ pregunta, respuesta, onRespuestaChange }) {
  const estaMarcada = (altId) => idsAlternativaExamenIguales(respuesta, altId);

  return (
    <div className="pregunta-alternativas">
      <div 
        className="pregunta-descripcion"
        dangerouslySetInnerHTML={{ __html: pregunta.descripcion }}
      />
      
      <div className="alternativas-lista">
        {pregunta.alternativas && pregunta.alternativas.map((alt) => (
          <label 
            key={alt.id} 
            className={`alternativa-item ${estaMarcada(alt.id) ? 'selected' : ''}`}
          >
            <input
              type="radio"
              name={`pregunta-${pregunta.id}`}
              value={alt.id}
              checked={estaMarcada(alt.id)}
              onChange={(e) => onRespuestaChange(parseInt(e.target.value, 10))}
            />
            <span 
              className="alternativa-texto"
              dangerouslySetInnerHTML={{ __html: alt.descripcion }}
            />
          </label>
        ))}
      </div>
    </div>
  );
}

export default PreguntaAlternativas;

