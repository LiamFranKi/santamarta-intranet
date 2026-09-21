import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import AlumnoAulaVirtual from './AlumnoAulaVirtual';
import api from '../services/api';

/**
 * Wrapper para AlumnoAulaVirtual que intercepta las llamadas API
 * y las redirige a las rutas proxy para apoderados
 */
function ApoderadoHijoAulaVirtual() {
  const { hijoId, asignaturaId } = useParams();
  const interceptorIdRef = useRef(null);
  const hijoIdRef = useRef(hijoId);

  // Actualizar la referencia cuando cambie hijoId
  useEffect(() => {
    hijoIdRef.current = hijoId;
  }, [hijoId]);

  useLayoutEffect(() => {
    // Agregar interceptor para modificar las URLs de las llamadas API
    interceptorIdRef.current = api.interceptors.request.use(
      (config) => {
        const currentHijoId = hijoIdRef.current;
        
        // Asegurarse de que el token esté presente
        const token = localStorage.getItem('token');
        if (token && !config.headers.Authorization) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        
        // Modificar URLs que empiecen con /alumno/aula-virtual
        if (config.url && config.url.startsWith('/alumno/aula-virtual')) {
          config.url = config.url.replace('/alumno/aula-virtual', `/apoderado/hijos/${currentHijoId}/aula-virtual`);
        }
        if (config.url && config.url.startsWith('/alumno/cneb')) {
          config.url = config.url.replace('/alumno/cneb', `/apoderado/hijos/${currentHijoId}/cneb`);
        }
        // Modificar URLs de cursos (para cargar datos del curso)
        if (config.url && config.url === '/alumno/cursos') {
          config.url = `/apoderado/hijos/${currentHijoId}/cursos`;
        }
        // Modificar URLs de mensajes
        if (config.url && config.url.startsWith('/alumno/mensajes')) {
          config.url = config.url.replace('/alumno/mensajes', `/apoderado/hijos/${currentHijoId}/mensajes`);
        }
        // Modificar URLs de exámenes (para ver resultados)
        if (config.url && (config.url.startsWith('/alumno/examenes') || config.url.startsWith('/alumno/examen'))) {
          if (config.url.includes('/resultado')) {
            const match = config.url.match(/\/alumno\/examen(es)?\/(\d+)\/resultado/);
            if (match) {
              const examenId = match[2];
              if (config.url.includes('/detalles')) {
                config.url = `/apoderado/hijos/${currentHijoId}/aula-virtual/examenes/${examenId}/resultado/detalles`;
              } else {
                config.url = `/apoderado/hijos/${currentHijoId}/aula-virtual/examenes/${examenId}/resultado`;
              }
            }
          }
        }
        
        console.log('🔵 [INTERCEPTOR APODERADO] URL modificada:', config.url);
        console.log('🔵 [INTERCEPTOR APODERADO] Token presente:', !!config.headers.Authorization);
        
        return config;
      },
      (error) => Promise.reject(error)
    );

    return () => {
      // Limpiar interceptor al desmontar
      if (interceptorIdRef.current !== null) {
        api.interceptors.request.eject(interceptorIdRef.current);
      }
    };
  }, []); // Dependencias vacías porque usamos ref

  // Usar asignaturaId como cursoId para AlumnoAulaVirtual
  // Pasar isApoderado=true y hijoId para deshabilitar acciones (solo lectura)
  return <AlumnoAulaVirtual cursoId={asignaturaId} isApoderado={true} hijoId={hijoId} />;
}

export default ApoderadoHijoAulaVirtual;

