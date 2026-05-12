import React from 'react';
import { idsAlternativaExamenIguales } from '../../utils/examenRespuestaIds';

function PreguntaVerdaderoFalso({ pregunta, respuesta, onRespuestaChange }) {
  if (!pregunta) {
    return <div>Error: No se pudo cargar la pregunta</div>;
  }

  // Buscar las alternativas "Verdadero" y "Falso"
  const alternativas = pregunta.alternativas || [];
  
  // Buscar alternativas de forma más flexible
  const alternativaVerdadero = alternativas.find(alt => {
    if (!alt || !alt.descripcion) return false;
    const desc = alt.descripcion.replace(/<[^>]*>/g, '').trim().toLowerCase();
    return desc === 'verdadero' || desc.includes('verdadero') || desc === 'true';
  });
  
  const alternativaFalso = alternativas.find(alt => {
    if (!alt || !alt.descripcion) return false;
    const desc = alt.descripcion.replace(/<[^>]*>/g, '').trim().toLowerCase();
    return desc === 'falso' || desc.includes('falso') || desc === 'false';
  });

  // Verificar selección (IDs pueden ser number o string desde la API)
  const estaSeleccionadoVerdadero = alternativaVerdadero
    ? idsAlternativaExamenIguales(respuesta, alternativaVerdadero.id) ||
      respuesta === 'VERDADERO' ||
      respuesta === 'verdadero'
    : respuesta === 'VERDADERO' || respuesta === 'verdadero';

  const estaSeleccionadoFalso = alternativaFalso
    ? idsAlternativaExamenIguales(respuesta, alternativaFalso.id) ||
      respuesta === 'FALSO' ||
      respuesta === 'falso'
    : respuesta === 'FALSO' || respuesta === 'falso';

  const handleSeleccionar = (alternativa, fallbackValue) => {
    const idRaw = alternativa?.id;
    if (alternativa != null && idRaw !== null && idRaw !== '' && Number.isFinite(Number(idRaw))) {
      onRespuestaChange(Number(idRaw));
    } else if (fallbackValue) {
      // Fallback: guardar como string si no hay alternativa
      onRespuestaChange(fallbackValue);
    }
  };

  return (
    <div className="pregunta-verdadero-falso">
      <div 
        className="pregunta-descripcion"
        dangerouslySetInnerHTML={{ __html: pregunta.descripcion || 'Sin descripción' }}
      />
      
      <div className="vf-opciones">
        <button
          type="button"
          className={`vf-btn ${estaSeleccionadoVerdadero ? 'selected' : ''}`}
          onClick={() => handleSeleccionar(alternativaVerdadero, 'VERDADERO')}
        >
          ✅ Verdadero
        </button>
        
        <button
          type="button"
          className={`vf-btn ${estaSeleccionadoFalso ? 'selected' : ''}`}
          onClick={() => handleSeleccionar(alternativaFalso, 'FALSO')}
        >
          ❌ Falso
        </button>
      </div>
    </div>
  );
}

export default PreguntaVerdaderoFalso;

