import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CircularProgress } from '@mui/material';
import DashboardLayout from '../components/DashboardLayout';
import EleccionCampanaLayout from '../components/elecciones/EleccionCampanaLayout';
import api from '../services/api';
import { useEleccionPortalPaths } from './elecciones/useEleccionPortalPaths';
import { msRestantesHasta, textoCuentaRegresivaUrna, votacionHorarioAbiertoCliente } from './elecciones/eleccionCountdownUtils';
import { elccPastelClass } from './elecciones/elccPastel';
import './AlumnoElecciones.css';

function useTickMs() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

export default function AlumnoElecciones() {
  const { isCampana, apiPrefix, routeBase } = useEleccionPortalPaths();
  const now = useTickMs();
  const [loading, setLoading] = useState(true);
  const [procesos, setProcesos] = useState([]);

  const load = useCallback(async (opts) => {
    const silent = opts?.silent === true;
    if (!silent) setLoading(true);
    try {
      const { data } = await api.get(`${apiPrefix}/procesos`);
      setProcesos(data.procesos || []);
    } catch {
      if (!silent) setProcesos([]);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [apiPrefix]);

  useEffect(() => {
    load();
  }, [load]);

  // La cuenta regresiva es local pero el estado (CAMPAÑA→VOTACION) viene del servidor.
  useEffect(() => {
    const id = window.setInterval(() => load({ silent: true }), 12000);
    return () => window.clearInterval(id);
  }, [load]);

  const refetchAbiertoRef = useRef(new Set());
  useEffect(() => {
    procesos.forEach((p) => {
      if (p.estado !== 'CAMPAÑA') {
        refetchAbiertoRef.current.delete(p.id);
        return;
      }
      const iso = p.countdown_urna?.votacion_iso_inicio;
      if (!iso) return;
      const ms = msRestantesHasta(iso, now);
      if ((ms === null || ms <= 0) && !refetchAbiertoRef.current.has(p.id)) {
        refetchAbiertoRef.current.add(p.id);
        load({ silent: true });
      }
    });
  }, [now, procesos, load]);

  const inner = (
    <div className="elcc-alum-hub elcc-alum-hub--flush">
      <header className="elcc-alum-hero elcc-alum-hero--pastel">
        <h1>{isCampana ? 'Jornada electoral' : 'Elecciones en el colegio'}</h1>
        <p>
          {isCampana
            ? 'Revisa las listas y propuestas. El botón de votación solo se habilita si estás convocado y dentro del horario.'
            : 'Conoce las propuestas de cada lista y participa cuando se abra la votación desde tu tablet.'}
        </p>
      </header>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
          <CircularProgress />
        </div>
      ) : procesos.length === 0 ? (
        <p className="elcc-alum-muted" style={{ textAlign: 'center', padding: '2rem' }}>
          No hay elecciones publicadas por ahora.
        </p>
      ) : (
        <div className="elcc-alum-card-grid elcc-alum-card-grid--candidatos elcc-alum-card-grid--hub">
          {procesos.map((p, idx) => {
            const cd = p.countdown_urna;
            const convocado =
              p.puede_participar !== undefined && p.puede_participar !== null ? !!p.puede_participar : !!p.puede_ver;
            const msApertura = msRestantesHasta(cd?.votacion_iso_inicio, now);
            const msCierre = msRestantesHasta(cd?.votacion_iso_fin, now);
            const horarioOk = votacionHorarioAbiertoCliente(cd);
            const puedeVerResultados = p.estado === 'RESULTADOS' || p.estado === 'CERRADA' || (msCierre != null && msCierre <= 0);
            const cuenta =
              (p.estado === 'VOTACION' || p.estado === 'CAMPAÑA') && msApertura != null && msApertura > 0
                ? textoCuentaRegresivaUrna(msApertura)
                : null;
            const etiquetaCuenta =
              cuenta?.linea ||
              (p.estado === 'VOTACION' && !horarioOk && (msApertura == null || msApertura <= 0) ? 'Fuera del horario de votación' : null);
            return (
              <article key={p.id} className={`elcc-alum-proc-card elcc-alum-proc-card--hub ${elccPastelClass(idx)}`}>
                <div className="elcc-alum-proc-card__body">
                  <h2>{p.titulo}</h2>
                  {!convocado && (
                    <p className="elcc-alum-muted">
                      Podrás ver candidatos y propuestas. Para votar: {p.motivo_bloqueo || 'no estás en la convocatoria de este proceso.'}
                    </p>
                  )}
                  {convocado && p.estado === 'VOTACION' && p.ya_voto && (
                    <p className="elcc-alum-muted">Ya registraste tu voto. ¡Gracias!</p>
                  )}
                  {etiquetaCuenta && (
                    <p className="elcc-alum-muted" style={{ fontWeight: 600 }}>
                      {cuenta ? <>Para la urna (Lima): {etiquetaCuenta}</> : etiquetaCuenta}
                    </p>
                  )}
                  {convocado && p.estado === 'VOTACION' && p.puede_votar_ahora && !p.ya_voto && (
                    <div className="elcc-alum-vota-slot">
                      <Link className="elcc-alum-btn-vota" to={`${routeBase}/${p.id}/votar`}>
                        <span className="elcc-alum-btn-vota__glow" aria-hidden />
                        <span className="elcc-alum-btn-vota__shine" aria-hidden />
                        <span className="elcc-alum-btn-vota__content">
                          <span className="elcc-alum-btn-vota__icon" aria-hidden>
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path
                                d="M4 10h16v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V10z"
                                stroke="currentColor"
                                strokeWidth="1.75"
                                strokeLinejoin="round"
                              />
                              <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
                              <path d="M9 15h6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
                            </svg>
                          </span>
                          <span className="elcc-alum-btn-vota__label">Vota aquí</span>
                        </span>
                      </Link>
                    </div>
                  )}
                </div>
                <div className="elcc-alum-btn-row elcc-alum-btn-row--block">
                  <Link className="elcc-alum-btn elcc-alum-btn-primary elcc-alum-btn--centered" to={`${routeBase}/${p.id}`}>
                    Ver página de campaña
                  </Link>
                  {puedeVerResultados && (
                    <Link className="elcc-alum-btn elcc-alum-btn-results elcc-alum-btn--centered" to={`${routeBase}/${p.id}/resultados`}>
                      Ver resultados
                    </Link>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );

  return isCampana ? <EleccionCampanaLayout>{inner}</EleccionCampanaLayout> : <DashboardLayout>{inner}</DashboardLayout>;
}
