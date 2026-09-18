import React, { useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import AlumnoAulaVirtual from './AlumnoAulaVirtual';
import api from '../services/api';

/**
 * Wrapper para AlumnoAulaVirtual que intercepta las llamadas API
 * y las redirige a las rutas proxy para docentes como apoderados
 */
function DocenteHijoAulaVirtual() {
  const { hijoId, asignaturaId } = useParams();
  const interceptorIdRef = useRef(null);
  const hijoIdRef = useRef(hijoId);

  // Actualizar la referencia cuando cambie hijoId
  useEffect(() => {
    hijoIdRef.current = hijoId;
  }, [hijoId]);

  useEffect(() => {
    // Agregar interceptor para modificar las URLs de las llamadas API
    // IMPORTANTE: Este interceptor se ejecuta DESPUÉS del interceptor principal que agrega el token
    // Por lo tanto, el token ya está en config.headers.Authorization
    interceptorIdRef.current = api.interceptors.request.use(
      (config) => {
        const currentHijoId = hijoIdRef.current;
        
        // Asegurarse de que el token esté presente (debería estar por el interceptor principal)
        const token = localStorage.getItem('token');
        if (token && !config.headers.Authorization) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        
        // Modificar URLs que empiecen con /alumno/aula-virtual
        if (config.url && config.url.startsWith('/alumno/aula-virtual')) {
          config.url = config.url.replace('/alumno/aula-virtual', `/docente/hijos/${currentHijoId}/aula-virtual`);
        }
        if (config.url && config.url.startsWith('/alumno/cneb')) {
          config.url = config.url.replace('/alumno/cneb', `/docente/hijos/${currentHijoId}/cneb`);
        }
        // Modificar URLs de mensajes
        if (config.url && config.url.startsWith('/alumno/mensajes')) {
          config.url = config.url.replace('/alumno/mensajes', `/docente/hijos/${currentHijoId}/mensajes`);
        }
        // Modificar URLs de exámenes (para ver resultados)
        // Interceptar tanto /alumno/examenes como /alumno/examen (sin 's')
        if (config.url && (config.url.startsWith('/alumno/examenes') || config.url.startsWith('/alumno/examen'))) {
          // Interceptar rutas de exámenes y redirigirlas a las rutas proxy
          // Ejemplo: /alumno/examenes/123/resultado -> /docente/hijos/799/aula-virtual/examenes/123/resultado
          // Ejemplo: /alumno/examen/123/resultado -> /docente/hijos/799/aula-virtual/examenes/123/resultado
          if (config.url.includes('/resultado')) {
            // Extraer el examenId de la URL (puede ser /examenes o /examen)
            const match = config.url.match(/\/alumno\/examen(es)?\/(\d+)\/resultado/);
            if (match) {
              const examenId = match[2]; // El examenId está en el segundo grupo capturado
              // Si incluye /detalles, usar la ruta de detalles
              if (config.url.includes('/detalles')) {
                config.url = `/docente/hijos/${currentHijoId}/aula-virtual/examenes/${examenId}/resultado/detalles`;
              } else {
                config.url = `/docente/hijos/${currentHijoId}/aula-virtual/examenes/${examenId}/resultado`;
              }
            }
          }
          // Para otras rutas de exámenes, mantenerlas como están por ahora
          // (iniciar examen, guardar respuestas, etc. no se permiten en modo solo lectura)
        }
        // Modificar URLs de cursos (para cargar datos del curso)
        if (config.url && config.url === '/alumno/cursos') {
          // No interceptar esta, se maneja en cargarDatosCurso
          // Pero podemos intentar obtener los datos de otra manera
        }
        
        console.log('🔵 [INTERCEPTOR] URL modificada:', config.url);
        console.log('🔵 [INTERCEPTOR] Token presente:', !!config.headers.Authorization);
        
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

export default DocenteHijoAulaVirtual;

