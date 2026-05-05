import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CircularProgress } from '@mui/material';
import DashboardLayout from '../components/DashboardLayout';
import EleccionCampanaLayout from '../components/elecciones/EleccionCampanaLayout';
import api from '../services/api';
import { useEleccionPortalPaths } from './elecciones/useEleccionPortalPaths';
import { formatearDuracion, msRestantesHasta, votacionHorarioAbiertoCliente } from './elecciones/eleccionCountdownUtils';
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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`${apiPrefix}/procesos`);
      setProcesos(data.procesos || []);
    } catch {
      setProcesos([]);
    } finally {
      setLoading(false);
    }
  }, [apiPrefix]);

  useEffect(() => {
    load();
  }, [load]);

  const inner = (
    <div className="elcc-alum-hub">
      <header className="elcc-alum-hero">
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
        <div className="elcc-alum-card-grid">
          {procesos.map((p) => {
            const cd = p.countdown_urna;
            const convocado =
              p.puede_participar !== undefined && p.puede_participar !== null ? !!p.puede_participar : !!p.puede_ver;
            const msApertura = msRestantesHasta(cd?.votacion_iso_inicio, now);
            const horarioOk = votacionHorarioAbiertoCliente(cd);
            const etiquetaCuenta =
              p.estado === 'VOTACION' && !horarioOk && msApertura != null && msApertura > 0
                ? `La urna abre en ${formatearDuracion(msApertura)}`
                : p.estado === 'VOTACION' && !horarioOk
                  ? 'Fuera del horario de votación'
                  : null;
            return (
              <article key={p.id} className="elcc-alum-proc-card">
                <div>
                  <h2>{p.titulo}</h2>
                  {!convocado && (
                    <p className="elcc-alum-muted">
                      Podrás ver candidatos y propuestas. Para votar: {p.motivo_bloqueo || 'no estás en la convocatoria de este proceso.'}
                    </p>
                  )}
                  {convocado && p.estado === 'VOTACION' && p.ya_voto && (
                    <p className="elcc-alum-muted">Ya registraste tu voto. ¡Gracias!</p>
                  )}
                  {convocado && p.estado === 'VOTACION' && !p.ya_voto && !p.puede_votar_ahora && etiquetaCuenta && (
                    <p className="elcc-alum-muted" style={{ fontWeight: 600 }}>
                      {etiquetaCuenta}
                    </p>
                  )}
                </div>
                <div className="elcc-alum-btn-row">
                  <Link
                    className="elcc-alum-btn elcc-alum-btn-primary"
                    style={{ textDecoration: 'none' }}
                    to={`${routeBase}/${p.id}`}
                  >
                    Ver convocatoria
                  </Link>
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
