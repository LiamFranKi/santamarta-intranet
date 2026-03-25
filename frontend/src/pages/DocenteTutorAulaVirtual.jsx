import React, { useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import DocenteAulaVirtual from './DocenteAulaVirtual';
import api from '../services/api';

/**
 * Aula virtual del curso para el tutor: misma UI que el docente (DocenteAulaVirtual),
 * con peticiones redirigidas a /docente/tutoria/grupos/:grupoId/aula-virtual/* y solo lectura.
 */
function DocenteTutorAulaVirtual() {
  const { grupoId, asignaturaId } = useParams();
  const interceptorIdRef = useRef(null);
  const grupoIdRef = useRef(grupoId);

  useEffect(() => {
    grupoIdRef.current = grupoId;
  }, [grupoId]);

  useEffect(() => {
    interceptorIdRef.current = api.interceptors.request.use((config) => {
      const g = grupoIdRef.current;
      const token = localStorage.getItem('token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      const url = config.url || '';
      if (url === '/docente/cursos' || url.startsWith('/docente/cursos?')) {
        config.url = `/docente/tutoria/grupos/${g}/cursos`;
        return config;
      }
      if (url.startsWith('/docente/aula-virtual')) {
        config.url = url.replace(
          '/docente/aula-virtual',
          `/docente/tutoria/grupos/${g}/aula-virtual`
        );
      }
      return config;
    });

    return () => {
      if (interceptorIdRef.current != null) {
        api.interceptors.request.eject(interceptorIdRef.current);
        interceptorIdRef.current = null;
      }
    };
  }, [grupoId]);

  return (
    <DocenteAulaVirtual tutorGrupoId={grupoId} cursoIdTutor={asignaturaId} />
  );
}

export default DocenteTutorAulaVirtual;
