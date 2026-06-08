import React, { useLayoutEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import DocenteAulaVirtual from './DocenteAulaVirtual';
import api from '../services/api';

/**
 * Aula virtual en modo Tutoría General: misma UI que el docente, rutas bajo
 * /docente/tutoria-general/grupos/:grupoId/aula-virtual/* y solo lectura.
 */
function DocenteTutoriaGeneralAulaVirtual() {
  const { grupoId, asignaturaId } = useParams();
  const interceptorIdRef = useRef(null);
  const grupoIdRef = useRef(grupoId);

  useLayoutEffect(() => {
    grupoIdRef.current = grupoId;
  }, [grupoId]);

  useLayoutEffect(() => {
    interceptorIdRef.current = api.interceptors.request.use((config) => {
      const g = grupoIdRef.current;
      if (g == null || String(g).trim() === '') {
        return config;
      }
      const token = localStorage.getItem('token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      const url = String(config.url || '');
      if (
        url === '/docente/cursos' ||
        url.startsWith('/docente/cursos?') ||
        url === 'docente/cursos' ||
        url.startsWith('docente/cursos?')
      ) {
        config.url = `/docente/tutoria-general/grupos/${g}/cursos`;
        return config;
      }
      if (/^\/?docente\/aula-virtual/.test(url)) {
        config.url = url.replace(
          /^\/?docente\/aula-virtual/,
          `/docente/tutoria-general/grupos/${g}/aula-virtual`
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

export default DocenteTutoriaGeneralAulaVirtual;
