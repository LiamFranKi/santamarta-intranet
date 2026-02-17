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
    // IMPORTANTE: Configurar el interceptor ANTES de que AlumnoAulaVirtual haga cualquier petición
    // Este interceptor debe estar activo desde el momento en que el componente se monta
    interceptorIdRef.current = api.interceptors.request.use(
      (config) => {
        const currentGrupoId = grupoIdRef.current;
        
        // Asegurarse de que el token esté presente SIEMPRE
        const token = localStorage.getItem('token');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
          console.log('🔵 [TUTOR-INTERCEPTOR] Token agregado desde localStorage');
        } else {
          console.warn('⚠️ [TUTOR-INTERCEPTOR] No se encontró token en localStorage');
        }
        
        // Modificar URLs que empiecen con /alumno/aula-virtual
        if (config.url && config.url.startsWith('/alumno/aula-virtual')) {
          const nuevaUrl = config.url.replace('/alumno/aula-virtual', `/docente/tutoria/grupos/${currentGrupoId}/aula-virtual`);
          console.log('🔵 [TUTOR-INTERCEPTOR] URL modificada de /alumno/aula-virtual:', config.url, '->', nuevaUrl);
          config.url = nuevaUrl;
        }
        // Modificar URLs de cursos (para cargar datos del curso)
        if (config.url && config.url === '/alumno/cursos') {
          // Interceptar y usar el endpoint de cursos del grupo
          const nuevaUrl = `/docente/tutoria/grupos/${currentGrupoId}/cursos`;
          console.log('🔵 [TUTOR-INTERCEPTOR] URL modificada de /alumno/cursos:', config.url, '->', nuevaUrl);
          config.url = nuevaUrl;
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
        
        console.log('🔵 [TUTOR-INTERCEPTOR] URL final:', config.url);
        console.log('🔵 [TUTOR-INTERCEPTOR] Token presente:', !!config.headers.Authorization);
        console.log('🔵 [TUTOR-INTERCEPTOR] Headers:', JSON.stringify(config.headers));
        
        return config;
      },
      (error) => {
        console.error('❌ [TUTOR-INTERCEPTOR] Error en interceptor:', error);
        return Promise.reject(error);
      }
    );

    console.log('✅ [TUTOR-INTERCEPTOR] Interceptor configurado para grupoId:', grupoId);

    return () => {
      // Limpiar interceptor al desmontar
      if (interceptorIdRef.current !== null) {
        api.interceptors.request.eject(interceptorIdRef.current);
        console.log('🧹 [TUTOR-INTERCEPTOR] Interceptor limpiado');
      }
    };
  }, [grupoId]); // Agregar grupoId como dependencia para reconfigurar si cambia

  // Usar asignaturaId como cursoId para AlumnoAulaVirtual
  // Pasar isApoderado=true para deshabilitar acciones (solo lectura)
  // Pasar grupoId para que pueda obtener los datos del curso
  return <AlumnoAulaVirtual cursoId={asignaturaId} isApoderado={true} grupoId={grupoId} />;
}

export default DocenteTutorAulaVirtual;

