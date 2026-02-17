import React, { useEffect, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import AlumnoAulaVirtual from './AlumnoAulaVirtual';
import api from '../services/api';

/**
 * Wrapper para AlumnoAulaVirtual que intercepta las llamadas API
 * y las redirige a las rutas proxy para tutores (modo solo lectura)
 */
function DocenteTutorAulaVirtual() {
  const { grupoId, asignaturaId } = useParams();
  const [searchParams] = useSearchParams();
  const modoSoloLectura = searchParams.get('modo') === 'solo-lectura';
  const interceptorIdRef = useRef(null);
  const grupoIdRef = useRef(grupoId);

  // Actualizar la referencia cuando cambie grupoId
  useEffect(() => {
    grupoIdRef.current = grupoId;
  }, [grupoId]);

  useEffect(() => {
    // Agregar interceptor para modificar las URLs de las llamadas API
    // IMPORTANTE: Este interceptor se ejecuta DESPUÉS del interceptor principal que agrega el token
    // Por lo tanto, el token ya está en config.headers.Authorization
    interceptorIdRef.current = api.interceptors.request.use(
      (config) => {
        const currentGrupoId = grupoIdRef.current;
        
        // Asegurarse de que el token esté presente SIEMPRE
        const token = localStorage.getItem('token');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        
        // Modificar URLs que empiecen con /alumno/aula-virtual
        if (config.url && config.url.startsWith('/alumno/aula-virtual')) {
          config.url = config.url.replace('/alumno/aula-virtual', `/docente/tutoria/grupos/${currentGrupoId}/aula-virtual`);
        }
        // Modificar URLs de cursos (para cargar datos del curso)
        if (config.url && config.url === '/alumno/cursos') {
          // Interceptar y usar el endpoint de cursos del grupo
          config.url = `/docente/tutoria/grupos/${currentGrupoId}/cursos`;
        }
        // Modificar URLs de mensajes
        if (config.url && config.url.startsWith('/alumno/mensajes')) {
          // Los tutores pueden enviar mensajes, así que no interceptamos esto
          // O podemos interceptarlo si queremos que vaya a una ruta específica de tutores
        }
        // Modificar URLs de exámenes (para ver resultados y listar)
        if (config.url && (config.url.startsWith('/alumno/examenes') || config.url.startsWith('/alumno/examen'))) {
          // Interceptar rutas de exámenes y redirigirlas a las rutas proxy
          if (config.url.includes('/resultado')) {
            const match = config.url.match(/\/alumno\/examen(es)?\/(\d+)\/resultado/);
            if (match) {
              const examenId = match[2];
              if (config.url.includes('/detalles')) {
                config.url = `/docente/tutoria/grupos/${currentGrupoId}/aula-virtual/examenes/${examenId}/resultado/detalles`;
              } else {
                config.url = `/docente/tutoria/grupos/${currentGrupoId}/aula-virtual/examenes/${examenId}/resultado`;
              }
            }
          } else {
            // Para listar exámenes, interceptar también
            config.url = config.url.replace('/alumno/examenes', `/docente/tutoria/grupos/${currentGrupoId}/aula-virtual/examenes`);
            config.url = config.url.replace('/alumno/examen', `/docente/tutoria/grupos/${currentGrupoId}/aula-virtual/examenes`);
          }
        }
        
        console.log('🔵 [TUTOR-INTERCEPTOR] URL modificada:', config.url);
        console.log('🔵 [TUTOR-INTERCEPTOR] Token presente:', !!config.headers.Authorization);
        
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
  // Pasar isApoderado=true para deshabilitar acciones (solo lectura)
  // No pasamos grupoId porque no lo necesita AlumnoAulaVirtual directamente
  return <AlumnoAulaVirtual cursoId={asignaturaId} isApoderado={true} />;
}

export default DocenteTutorAulaVirtual;

