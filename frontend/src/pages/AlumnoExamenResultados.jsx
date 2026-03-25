import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { createPortal } from 'react-dom';
import DashboardLayout from '../components/DashboardLayout';
import api from '../services/api';
import Swal from 'sweetalert2';
import './DocenteAulaVirtual-gamificado.css';

function AlumnoExamenResultados() {
  const { examenId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [examen, setExamen] = useState(null);
  const [resultado, setResultado] = useState(null);
  const [detalles, setDetalles] = useState(null);
  const [cargandoDetalles, setCargandoDetalles] = useState(false);
  // Detectar si viene de apoderado
  const hijoId = location.state?.hijoId || null;
  const isApoderado = location.state?.isApoderado || false;
  const interceptorIdRef = useRef(null);
  const hijoIdRef = useRef(hijoId);

  // Actualizar la referencia cuando cambie hijoId
  useEffect(() => {
    hijoIdRef.current = hijoId;
  }, [hijoId]);

  // Configurar interceptor si es apoderado
  useEffect(() => {
    if (isApoderado && hijoId) {
      interceptorIdRef.current = api.interceptors.request.use(
        (config) => {
          const currentHijoId = hijoIdRef.current;
          
          // Asegurarse de que el token esté presente
          const token = localStorage.getItem('token');
          if (token && !config.headers.Authorization) {
            config.headers.Authorization = `Bearer ${token}`;
          }
          
          // Modificar URLs de exámenes (para ver resultados)
          if (config.url && (config.url.startsWith('/alumno/examenes') || config.url.startsWith('/alumno/examen'))) {
            if (config.url.includes('/resultado')) {
              const match = config.url.match(/\/alumno\/examen(es)?\/(\d+)\/resultado/);
              if (match) {
                const examenIdFromUrl = match[2];
                if (config.url.includes('/detalles')) {
                  config.url = `/docente/hijos/${currentHijoId}/aula-virtual/examenes/${examenIdFromUrl}/resultado/detalles`;
                } else {
                  config.url = `/docente/hijos/${currentHijoId}/aula-virtual/examenes/${examenIdFromUrl}/resultado`;
                }
              }
            }
          }
          
          return config;
        },
        (error) => Promise.reject(error)
      );
    }

    return () => {
      if (interceptorIdRef.current !== null) {
        api.interceptors.request.eject(interceptorIdRef.current);
      }
    };
  }, [isApoderado, hijoId]);

  useEffect(() => {
    cargarResultado();
  }, [examenId]);

  const cargarResultado = async () => {
    try {
      setLoading(true);
      // Obtener resultado básico del examen
      const response = await api.get(`/alumno/examenes/${examenId}/resultado`);
      setExamen(response.data.examen);
      setResultado(response.data.resultado);
      
      // Cargar detalles automáticamente
      await cargarDetalles(response.data.resultado.id);
    } catch (error) {
      console.error('Error cargando resultado:', error);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: error.response?.data?.error || 'No se pudo cargar el resultado del examen'
      }).then(() => {
        navigate(-1);
      });
    } finally {
      setLoading(false);
    }
  };

  const resNoResult = () => {
    setExamen(null);
    setResultado(null);
    setDetalles(null);
  };

  const cargarDetalles = async (resultadoId) => {
    try {
      setCargandoDetalles(true);
      const response = await api.get(`/alumno/examenes/${examenId}/resultado/detalles`);
      setDetalles(response.data);
    } catch (error) {
      console.error('Error cargando detalles:', error);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: error.response?.data?.error || 'No se pudieron cargar los detalles del examen'
      });
    } finally {
      setCargandoDetalles(false);
    }
  };

  const handleVolver = () => {
    // Si es apoderado, volver a la página de hijos
    if (isApoderado && hijoId) {
      navigate(`/docente/hijos`);
    } else {
      navigate(-1);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div style={{ padding: '2rem', textAlign: 'center' }}>
          <div className="loading-spinner">Cargando resultado del examen...</div>
        </div>
      </DashboardLayout>
    );
  }

  if (!resultado || !examen) {
    return (
      <DashboardLayout>
        <div style={{ padding: '2rem', textAlign: 'center' }}>
          <p>No se encontró resultado para este examen</p>
          <button onClick={handleVolver} className="btn-guardar" style={{ marginTop: '1rem' }}>
            Volver
          </button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
        <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 style={{ margin: 0, color: '#374151' }}>📊 Resultado del Examen</h1>
          <button onClick={handleVolver} className="btn-cancelar">
            ← Volver
          </button>
        </div>

        {/* Información del examen */}
        <div style={{ 
          marginBottom: '2rem', 
          padding: '1.5rem', 
          background: 'linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%)', 
          borderRadius: '12px',
          border: '2px solid #4caf50',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
        }}>
          <h2 style={{ marginTop: 0, marginBottom: '1rem', color: '#2e7d32' }}>{examen.titulo}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            <div>
              <strong style={{ color: '#2e7d32', display: 'block', marginBottom: '0.25rem' }}>PUNTAJE:</strong>
              <span style={{ fontSize: '1.5rem', fontWeight: '700', color: '#1f2937' }}>
                {Math.min(20, Math.round(resultado.puntaje || 0))}
              </span>
            </div>
            <div>
              <strong style={{ color: '#2e7d32', display: 'block', marginBottom: '0.25rem' }}>CORRECTAS:</strong>
              <span style={{ fontSize: '1.5rem', fontWeight: '700', color: '#10b981' }}>
                {resultado.correctas || 0}
              </span>
            </div>
            <div>
              <strong style={{ color: '#2e7d32', display: 'block', marginBottom: '0.25rem' }}>INCORRECTAS:</strong>
              <span style={{ fontSize: '1.5rem', fontWeight: '700', color: '#ef4444' }}>
                {resultado.incorrectas || 0}
              </span>
            </div>
            {examen.tipo_puntaje === 'GENERAL' && (
              <div>
                <strong style={{ color: '#2e7d32', display: 'block', marginBottom: '0.25rem' }}>PUNTAJE POR RESPUESTA:</strong>
                <span style={{ fontSize: '1rem', color: '#1f2937' }}>
                  {examen.puntos_correcta || 0} Punto(s)
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Detalles del examen */}
        {cargandoDetalles ? (
          <div style={{ textAlign: 'center', padding: '3rem' }}>
            <div className="loading-spinner">Cargando detalles...</div>
          </div>
        ) : detalles && detalles.preguntas ? (
          <DetallesExamenModal 
            resultado={resultado}
            detalles={detalles}
            examen={examen}
            onClose={handleVolver}
          />
        ) : (
          <div style={{ textAlign: 'center', padding: '2rem', background: '#f9fafb', borderRadius: '8px' }}>
            <p>No se pudieron cargar los detalles del examen</p>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

// Componente para mostrar los detalles del examen (similar a DetallesResultadoModal del docente)
function DetallesExamenModal({ resultado, detalles, examen, onClose }) {
  const { resultado: resultadoInfo, preguntas, respuestas } = detalles;
  const puntosPorRespuesta = resultadoInfo.tipo_puntaje === 'GENERAL' ? (resultadoInfo.puntos_correcta || 0) : 0;

  // Función para determinar el estado de una alternativa
  const getEstadoAlternativa = (preguntaId, alternativaId, esCorrecta) => {
    const respuestaAlumno = respuestas[preguntaId] || respuestas[preguntaId.toString()];
    const alternativaIdNum = typeof alternativaId === 'number' ? alternativaId : parseInt(alternativaId);
    const respuestaAlumnoNum = typeof respuestaAlumno === 'number' ? respuestaAlumno : parseInt(respuestaAlumno);
    const alumnoMarcó = respuestaAlumnoNum === alternativaIdNum;
    
    if (esCorrecta) {
      if (alumnoMarcó) {
        return 'correcta_marcada';
      } else {
        return 'correcta_no_marcada';
      }
    } else {
      if (alumnoMarcó) {
        return 'incorrecta_marcada';
      } else {
        return 'sin_marcar';
      }
    }
  };

  return (
    <div style={{ background: 'white', borderRadius: '12px', padding: '2rem', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
      {/* Leyenda */}
      <div style={{ 
        marginBottom: '2rem', 
        padding: '1rem', 
        background: '#f9fafb', 
        borderRadius: '8px',
        border: '1px solid #e5e7eb'
      }}>
        <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', justifyContent: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: '#10b981', border: '2px solid #059669' }}></div>
            <span style={{ fontSize: '0.9rem', fontWeight: '500' }}>Marcada correctamente</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: '#ef4444', border: '2px solid #dc2626' }}></div>
            <span style={{ fontSize: '0.9rem', fontWeight: '500' }}>Marcada incorrectamente</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: '#3b82f6', border: '2px solid #2563eb' }}></div>
            <span style={{ fontSize: '0.9rem', fontWeight: '500' }}>Respuesta correcta</span>
          </div>
        </div>
      </div>

      {/* Preguntas */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        {preguntas.map((pregunta, index) => {
          const respuestaAlumno = respuestas[pregunta.id] || respuestas[pregunta.id.toString()];
          const respuestaAlumnoNum = respuestaAlumno ? (typeof respuestaAlumno === 'number' ? respuestaAlumno : parseInt(respuestaAlumno)) : null;
          
          const renderizarPregunta = () => {
            switch (pregunta.tipo) {
              case 'ALTERNATIVAS':
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {pregunta.alternativas && pregunta.alternativas.map((alternativa) => {
                    const estado = getEstadoAlternativa(pregunta.id, alternativa.id, alternativa.correcta);
                    const alternativaIdNum = typeof alternativa.id === 'number' ? alternativa.id : parseInt(alternativa.id);
                    const alumnoMarcó = respuestaAlumnoNum === alternativaIdNum;
                    
                    let estiloCirculo = {
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      border: '2px solid',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      marginRight: '0.75rem',
                      fontWeight: 'bold',
                      fontSize: '14px'
                    };

                    if (estado === 'correcta_marcada') {
                      estiloCirculo.background = '#10b981';
                      estiloCirculo.borderColor = '#059669';
                      estiloCirculo.color = 'white';
                    } else if (estado === 'incorrecta_marcada') {
                      estiloCirculo.background = '#ef4444';
                      estiloCirculo.borderColor = '#dc2626';
                      estiloCirculo.color = 'white';
                    } else if (estado === 'correcta_no_marcada') {
                      estiloCirculo.background = '#3b82f6';
                      estiloCirculo.borderColor = '#2563eb';
                      estiloCirculo.color = 'white';
                    } else {
                      estiloCirculo.background = 'white';
                      estiloCirculo.borderColor = '#d1d5db';
                      estiloCirculo.color = '#9ca3af';
                    }

                    return (
                      <div 
                        key={alternativa.id}
                        style={{ 
                          display: 'flex', 
                          alignItems: 'flex-start',
                          padding: '0.75rem',
                          borderRadius: '8px',
                          background: estado !== 'sin_marcar' ? '#f9fafb' : 'white',
                          border: alumnoMarcó ? '2px solid' : '1px solid #e5e7eb',
                          borderColor: estado === 'correcta_marcada' ? '#10b981' : 
                                     estado === 'incorrecta_marcada' ? '#ef4444' : '#e5e7eb'
                        }}
                      >
                        <div style={estiloCirculo}>
                          {alumnoMarcó && '✓'}
                        </div>
                        <div 
                          style={{ 
                            flex: 1,
                            fontSize: '0.95rem',
                            color: '#1f2937',
                            lineHeight: '1.5'
                          }}
                          dangerouslySetInnerHTML={{ __html: alternativa.descripcion }}
                        />
                      </div>
                    );
                  })}
                </div>
              );

              case 'COMPLETAR':
                let respuestasCompletarAlumno = [];
                if (respuestaAlumno && typeof respuestaAlumno === 'object') {
                  respuestasCompletarAlumno = Object.entries(respuestaAlumno)
                    .map(([index, valor]) => ({
                      num: parseInt(index) + 1,
                      valor: String(valor || '___').trim()
                    }));
                }
                
                const descripcionLimpia = pregunta.descripcion ? pregunta.descripcion.replace(/<[^>]*>/g, '') : '';
                const respuestasCorrectasCompletar = [];
                const regex = /\[\[([^\]]+)\]\]/g;
                let match;
                while ((match = regex.exec(descripcionLimpia)) !== null) {
                  const respuesta = match[1].trim();
                  if (respuesta) {
                    respuestasCorrectasCompletar.push(respuesta);
                  }
                }
                
                let esCorrectaCompletar = false;
                if (respuestasCompletarAlumno.length > 0) {
                  const respuestasAlumnoArray = respuestasCompletarAlumno.map(r => r.valor.toLowerCase());
                  if (respuestasAlumnoArray.length === respuestasCorrectasCompletar.length) {
                    esCorrectaCompletar = respuestasAlumnoArray.every((resp) => 
                      respuestasCorrectasCompletar.includes(resp)
                    );
                  }
                }
                
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{ 
                      padding: '0.75rem', 
                      borderRadius: '8px',
                      background: esCorrectaCompletar ? '#d1fae5' : '#fee2e2',
                      border: `2px solid ${esCorrectaCompletar ? '#10b981' : '#ef4444'}`
                    }}>
                      <div style={{ marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: '600', color: '#6b7280' }}>
                        Respuesta del alumno:
                      </div>
                      <div style={{ fontSize: '0.95rem', color: '#1f2937' }}>
                        {respuestasCompletarAlumno.length > 0 ? (
                          respuestasCompletarAlumno.map((r, idx) => (
                            <span key={idx} style={{ background: '#e0f2fe', padding: '0.25rem 0.5rem', borderRadius: '4px', margin: '0.25rem', display: 'inline-block', border: '1px solid #0ea5e9' }}>
                              {r.num}. {r.valor}
                            </span>
                          ))
                        ) : (
                          <span style={{ color: '#6b7280', fontStyle: 'italic' }}>(sin respuesta)</span>
                        )}
                      </div>
                    </div>
                    <div style={{ 
                      padding: '0.75rem', 
                      borderRadius: '8px',
                      background: '#dbeafe',
                      border: '2px solid #3b82f6'
                    }}>
                      <div style={{ marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: '600', color: '#6b7280' }}>
                        Respuesta correcta:
                      </div>
                      <div style={{ fontSize: '0.95rem', color: '#1f2937' }}>
                        {respuestasCorrectasCompletar.length > 0 ? (
                          respuestasCorrectasCompletar.map((resp, idx) => (
                            <span key={idx} style={{ background: '#dbeafe', padding: '0.25rem 0.5rem', borderRadius: '4px', margin: '0.25rem', display: 'inline-block', border: '1px solid #3b82f6' }}>
                              {idx + 1}. {resp}
                            </span>
                          ))
                        ) : (
                          <span style={{ color: '#6b7280' }}>No definida</span>
                        )}
                      </div>
                    </div>
                  </div>
                );

              case 'VERDADERO_FALSO':
                const respuestaVFAlumno = respuestaAlumnoNum || respuestaAlumno;
                const alternativaVFMarcada = pregunta.alternativas?.find(alt => {
                  const altId = typeof alt.id === 'number' ? alt.id : parseInt(alt.id);
                  return altId === respuestaVFAlumno || altId === respuestaAlumnoNum;
                });
                
                const alternativaVFCorrecta = pregunta.alternativas?.find(alt => alt.correcta === 'SI' || alt.correcta === true);
                const esCorrectaVF = alternativaVFMarcada && alternativaVFCorrecta && 
                                   alternativaVFMarcada.id === alternativaVFCorrecta.id;
                
                let respuestaVFTexto = '(sin respuesta)';
                if (alternativaVFMarcada) {
                  const desc = alternativaVFMarcada.descripcion ? alternativaVFMarcada.descripcion.replace(/<[^>]*>/g, '').trim() : '';
                  respuestaVFTexto = desc || 'Sin descripción';
                } else if (respuestaAlumno === 'VERDADERO' || respuestaAlumno === 'verdadero') {
                  respuestaVFTexto = 'Verdadero';
                } else if (respuestaAlumno === 'FALSO' || respuestaAlumno === 'falso') {
                  respuestaVFTexto = 'Falso';
                }
                
                const respuestaVFCorrectaTexto = alternativaVFCorrecta 
                  ? (alternativaVFCorrecta.descripcion ? alternativaVFCorrecta.descripcion.replace(/<[^>]*>/g, '').trim() : 'Sin descripción')
                  : 'No definida';
                
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{ 
                      padding: '0.75rem', 
                      borderRadius: '8px',
                      background: esCorrectaVF ? '#d1fae5' : '#fee2e2',
                      border: `2px solid ${esCorrectaVF ? '#10b981' : '#ef4444'}`
                    }}>
                      <div style={{ marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: '600', color: '#6b7280' }}>
                        Respuesta del alumno:
                      </div>
                      <div style={{ fontSize: '0.95rem', color: '#1f2937', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {esCorrectaVF ? (
                          <span style={{ color: '#10b981', fontSize: '1.2rem' }}>✓</span>
                        ) : (
                          <span style={{ color: '#ef4444', fontSize: '1.2rem' }}>✗</span>
                        )}
                        <span style={{ fontWeight: esCorrectaVF ? '600' : '400', color: esCorrectaVF ? '#065f46' : '#991b1b' }}>
                          {respuestaVFTexto}
                        </span>
                      </div>
                    </div>
                    <div style={{ 
                      padding: '0.75rem', 
                      borderRadius: '8px',
                      background: '#dbeafe',
                      border: '2px solid #3b82f6'
                    }}>
                      <div style={{ marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: '600', color: '#6b7280' }}>
                        Respuesta correcta:
                      </div>
                      <div style={{ fontSize: '0.95rem', color: '#1f2937', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ color: '#3b82f6', fontSize: '1.2rem' }}>✓</span>
                        <span style={{ fontWeight: '600', color: '#1e40af' }}>
                          {respuestaVFCorrectaTexto}
                        </span>
                      </div>
                    </div>
                  </div>
                );

              case 'RESPUESTA_CORTA':
                const respuestaCortaAlumno = typeof respuestaAlumno === 'string' ? respuestaAlumno : String(respuestaAlumno || '');
                const alternativaCorrecta = pregunta.alternativas && pregunta.alternativas.find(alt => alt.correcta === 'SI' || alt.correcta === true);
                const respuestaCorrecta = alternativaCorrecta ? alternativaCorrecta.descripcion.replace(/<[^>]*>/g, '').trim() : '';
                const esCorrecta = respuestaCortaAlumno.toLowerCase().trim() === respuestaCorrecta.toLowerCase().trim();
                
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{ 
                      padding: '0.75rem', 
                      borderRadius: '8px',
                      background: esCorrecta ? '#d1fae5' : '#fee2e2',
                      border: `2px solid ${esCorrecta ? '#10b981' : '#ef4444'}`
                    }}>
                      <div style={{ marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: '600', color: '#6b7280' }}>
                        Respuesta del alumno:
                      </div>
                      <div style={{ fontSize: '0.95rem', color: '#1f2937' }}>
                        {respuestaCortaAlumno || '(sin respuesta)'}
                      </div>
                    </div>
                    <div style={{ 
                      padding: '0.75rem', 
                      borderRadius: '8px',
                      background: '#dbeafe',
                      border: '2px solid #3b82f6'
                    }}>
                      <div style={{ marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: '600', color: '#6b7280' }}>
                        Respuesta correcta:
                      </div>
                      <div 
                        style={{ 
                          fontSize: '0.95rem',
                          color: '#1f2937'
                        }}
                        dangerouslySetInnerHTML={{ __html: alternativaCorrecta ? alternativaCorrecta.descripcion : 'No definida' }}
                      />
                    </div>
                  </div>
                );

              case 'ORDENAR':
                let ordenAlumnoArray = [];
                let ordenAlumnoTexto = '';
                if (respuestaAlumno && Array.isArray(respuestaAlumno)) {
                  ordenAlumnoArray = respuestaAlumno.map(id => parseInt(id));
                  const alternativasOrdenadas = ordenAlumnoArray
                    .map(id => pregunta.alternativas?.find(alt => alt.id === id))
                    .filter(Boolean);
                  ordenAlumnoTexto = alternativasOrdenadas
                    .map((alt, idx) => `${idx + 1}. ${alt.descripcion}`)
                    .join('\n');
                } else {
                  ordenAlumnoTexto = '(sin respuesta)';
                }
                
                const alternativasCorrectas = pregunta.alternativas
                  ?.filter(alt => alt.orden_posicion !== null && alt.orden_posicion !== undefined)
                  .sort((a, b) => (a.orden_posicion || 0) - (b.orden_posicion || 0)) || [];
                const ordenCorrectoTexto = alternativasCorrectas
                  .map((alt, idx) => `${idx + 1}. ${alt.descripcion}`)
                  .join('\n');
                
                let ordenEsCorrecto = false;
                if (ordenAlumnoArray.length === alternativasCorrectas.length) {
                  ordenEsCorrecto = ordenAlumnoArray.every((altId, idx) => {
                    const alt = alternativasCorrectas[idx];
                    return alt && alt.id === altId;
                  });
                }
                
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{ 
                      padding: '0.75rem', 
                      borderRadius: '8px',
                      background: ordenEsCorrecto ? '#d1fae5' : '#fee2e2',
                      border: `2px solid ${ordenEsCorrecto ? '#10b981' : '#ef4444'}`
                    }}>
                      <div style={{ marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: '600', color: '#6b7280' }}>
                        Orden seleccionado por el alumno:
                      </div>
                      <div 
                        style={{ 
                          fontSize: '0.95rem', 
                          color: '#1f2937',
                          whiteSpace: 'pre-line'
                        }}
                        dangerouslySetInnerHTML={{ __html: ordenAlumnoTexto.replace(/\n/g, '<br>') }}
                      />
                    </div>
                    <div style={{ 
                      padding: '0.75rem', 
                      borderRadius: '8px',
                      background: '#dbeafe',
                      border: '2px solid #3b82f6'
                    }}>
                      <div style={{ marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: '600', color: '#6b7280' }}>
                        Orden correcto:
                      </div>
                      <div 
                        style={{ 
                          fontSize: '0.95rem', 
                          color: '#1f2937',
                          whiteSpace: 'pre-line'
                        }}
                        dangerouslySetInnerHTML={{ __html: ordenCorrectoTexto.replace(/\n/g, '<br>') || 'No definido' }}
                      />
                    </div>
                  </div>
                );

              case 'EMPAREJAR':
                let paresAlumno = [];
                let todosParesCorrectos = true;
                
                if (respuestaAlumno && typeof respuestaAlumno === 'object' && Object.keys(respuestaAlumno).length > 0) {
                  paresAlumno = Object.entries(respuestaAlumno).map(([altId, parId]) => {
                    const origen = pregunta.alternativas?.find(alt => alt.id === parseInt(altId));
                    const destino = pregunta.alternativas?.find(alt => alt.id === parseInt(parId));
                    const origenText = origen?.descripcion?.replace(/<[^>]*>/g, '') || '?';
                    const destinoText = destino?.descripcion?.replace(/<[^>]*>/g, '') || '?';
                    
                    const parEsCorrecto = origen && destino && origen.par_id === parseInt(parId);
                    if (!parEsCorrecto) todosParesCorrectos = false;
                    
                    return { origenText, destinoText, parEsCorrecto };
                  });
                }
                
                const paresCorrectos = pregunta.alternativas
                  ?.filter(alt => alt.par_id !== null && alt.par_id !== undefined)
                  .map(alt => {
                    const destino = pregunta.alternativas?.find(a => a.id === alt.par_id);
                    return {
                      origenText: alt.descripcion?.replace(/<[^>]*>/g, '') || '?',
                      destinoText: destino?.descripcion?.replace(/<[^>]*>/g, '') || '?'
                    };
                  }) || [];
                
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{ 
                      padding: '0.75rem', 
                      borderRadius: '8px',
                      background: todosParesCorrectos && paresAlumno.length > 0 ? '#d1fae5' : '#fee2e2',
                      border: `2px solid ${todosParesCorrectos && paresAlumno.length > 0 ? '#10b981' : '#ef4444'}`
                    }}>
                      <div style={{ marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: '600', color: '#6b7280' }}>
                        Emparejamiento seleccionado por el alumno:
                      </div>
                      {paresAlumno.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          {paresAlumno.map((par, idx) => (
                            <div key={idx} style={{ 
                              background: par.parEsCorrecto ? '#d1fae5' : '#fee2e2',
                              padding: '0.5rem',
                              borderRadius: '6px',
                              borderLeft: `3px solid ${par.parEsCorrecto ? '#10b981' : '#ef4444'}`,
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.5rem'
                            }}>
                              <span style={{ fontWeight: '600', color: '#1e40af' }}>{par.origenText}</span>
                              <span style={{ color: par.parEsCorrecto ? '#10b981' : '#ef4444', fontSize: '1.2rem' }}>→</span>
                              <span style={{ color: par.parEsCorrecto ? '#059669' : '#dc2626' }}>{par.destinoText}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ fontSize: '0.95rem', color: '#6b7280', fontStyle: 'italic' }}>(sin respuesta)</div>
                      )}
                    </div>
                    <div style={{ 
                      padding: '0.75rem', 
                      borderRadius: '8px',
                      background: '#dbeafe',
                      border: '2px solid #3b82f6'
                    }}>
                      <div style={{ marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: '600', color: '#6b7280' }}>
                        Emparejamiento correcto:
                      </div>
                      {paresCorrectos.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          {paresCorrectos.map((par, idx) => (
                            <div key={idx} style={{ 
                              background: '#dbeafe',
                              padding: '0.5rem',
                              borderRadius: '6px',
                              borderLeft: '3px solid #3b82f6',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.5rem'
                            }}>
                              <span style={{ fontWeight: '600', color: '#1e40af' }}>{par.origenText}</span>
                              <span style={{ color: '#3b82f6', fontSize: '1.2rem' }}>→</span>
                              <span style={{ color: '#059669' }}>{par.destinoText}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ fontSize: '0.95rem', color: '#6b7280' }}>No definido</div>
                      )}
                    </div>
                  </div>
                );

              case 'ARRASTRAR_Y_SOLTAR':
                let elementosArrastrados = [];
                let todosCorrectos = true;
                
                if (respuestaAlumno && typeof respuestaAlumno === 'object' && Object.keys(respuestaAlumno).length > 0) {
                  elementosArrastrados = Object.entries(respuestaAlumno).map(([altId, valor]) => {
                    const alt = pregunta.alternativas?.find(a => a.id === parseInt(altId));
                    const altText = alt?.descripcion?.replace(/<[^>]*>/g, '') || '?';
                    const zonaNombre = typeof valor === 'object' && valor.zona ? valor.zona : String(valor || '');
                    const zonaCorrecta = alt?.zona_drop?.trim().toLowerCase() || '';
                    const esCorrecto = zonaNombre.trim().toLowerCase() === zonaCorrecta;
                    if (!esCorrecto) todosCorrectos = false;
                    
                    return { altText, zonaNombre, esCorrecto, zonaCorrecta };
                  });
                }
                
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{ 
                      padding: '0.75rem', 
                      borderRadius: '8px',
                      background: todosCorrectos && elementosArrastrados.length > 0 ? '#d1fae5' : '#fee2e2',
                      border: `2px solid ${todosCorrectos && elementosArrastrados.length > 0 ? '#10b981' : '#ef4444'}`
                    }}>
                      <div style={{ marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: '600', color: '#6b7280' }}>
                        Zona donde soltó el alumno:
                      </div>
                      {elementosArrastrados.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          {elementosArrastrados.map((elem, idx) => (
                            <div key={idx} style={{ 
                              background: elem.esCorrecto ? '#d1fae5' : '#fee2e2',
                              padding: '0.5rem',
                              borderRadius: '6px',
                              borderLeft: `3px solid ${elem.esCorrecto ? '#10b981' : '#ef4444'}`,
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.5rem'
                            }}>
                              <span style={{ background: elem.esCorrecto ? '#10b981' : '#ef4444', color: 'white', padding: '0.25rem 0.5rem', borderRadius: '4px', fontWeight: '600', fontSize: '0.85rem' }}>
                                Zona {elem.zonaNombre}
                              </span>
                              <span style={{ color: elem.esCorrecto ? '#059669' : '#dc2626' }}>{elem.altText}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ fontSize: '0.95rem', color: '#6b7280', fontStyle: 'italic' }}>(sin respuesta)</div>
                      )}
                    </div>
                    <div style={{ 
                      padding: '0.75rem', 
                      borderRadius: '8px',
                      background: '#dbeafe',
                      border: '2px solid #3b82f6'
                    }}>
                      <div style={{ marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: '600', color: '#6b7280' }}>
                        Zona correcta:
                      </div>
                      {pregunta.alternativas && pregunta.alternativas.filter(alt => alt.zona_drop).length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          {pregunta.alternativas
                            .filter(alt => alt.zona_drop)
                            .map((alt, idx) => (
                              <div key={idx} style={{ 
                                background: '#dbeafe',
                                padding: '0.5rem',
                                borderRadius: '6px',
                                borderLeft: '3px solid #3b82f6',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem'
                              }}>
                                <span style={{ background: '#3b82f6', color: 'white', padding: '0.25rem 0.5rem', borderRadius: '4px', fontWeight: '600', fontSize: '0.85rem' }}>
                                  Zona {alt.zona_drop}
                                </span>
                                <span style={{ color: '#059669' }}>{alt.descripcion?.replace(/<[^>]*>/g, '') || '?'}</span>
                              </div>
                            ))}
                        </div>
                      ) : (
                        <div style={{ fontSize: '0.95rem', color: '#6b7280' }}>No definida</div>
                      )}
                    </div>
                  </div>
                );

              default:
                return (
                  <div style={{ padding: '1rem', background: '#fef3c7', borderRadius: '8px', color: '#92400e' }}>
                    Tipo de pregunta no soportado: {pregunta.tipo}
                  </div>
                );
            }
          };
          
          return (
            <div 
              key={pregunta.id} 
              style={{ 
                padding: '1.5rem', 
                background: 'white', 
                borderRadius: '12px',
                border: '2px solid #e5e7eb',
                boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
              }}
            >
              <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: '700',
                  fontSize: '1rem',
                  flexShrink: 0
                }}>
                  {index + 1}
                </div>
                <div style={{ flex: 1 }}>
                  <div 
                    style={{ 
                      fontSize: '1rem', 
                      fontWeight: '600', 
                      color: '#1f2937',
                      marginBottom: '0.5rem'
                    }}
                    dangerouslySetInnerHTML={{ __html: pregunta.descripcion || 'Sin descripción' }}
                  />
                  {pregunta.puntos && pregunta.puntos > 0 && (
                    <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>
                      Puntos: {pregunta.puntos}
                    </div>
                  )}
                </div>
              </div>
              {renderizarPregunta()}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default AlumnoExamenResultados;

