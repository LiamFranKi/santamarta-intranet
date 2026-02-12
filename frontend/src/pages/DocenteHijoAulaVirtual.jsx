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

  useEffect(() => {
    // Agregar interceptor para modificar las URLs de las llamadas API
    interceptorIdRef.current = api.interceptors.request.use(
      (config) => {
        // Modificar URLs que empiecen con /alumno/aula-virtual
        if (config.url && config.url.startsWith('/alumno/aula-virtual')) {
          config.url = config.url.replace('/alumno/aula-virtual', `/docente/hijos/${hijoId}/aula-virtual`);
        }
        // Modificar URLs de mensajes
        if (config.url && config.url.startsWith('/alumno/mensajes')) {
          config.url = config.url.replace('/alumno/mensajes', `/docente/hijos/${hijoId}/mensajes`);
        }
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
  }, [hijoId]);

  // Usar asignaturaId como cursoId para AlumnoAulaVirtual
  // Pasar isApoderado=true para deshabilitar acciones (solo lectura)
  return <AlumnoAulaVirtual cursoId={asignaturaId} isApoderado={true} />;
}

export default DocenteHijoAulaVirtual;

