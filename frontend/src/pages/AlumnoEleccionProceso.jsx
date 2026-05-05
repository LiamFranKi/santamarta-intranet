import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CircularProgress } from '@mui/material';
import DashboardLayout from '../components/DashboardLayout';
import EleccionCampanaLayout from '../components/elecciones/EleccionCampanaLayout';
import EleccionUrnaAviso from '../components/elecciones/EleccionUrnaAviso';
import api from '../services/api';
import Swal from 'sweetalert2';
import { useEleccionPortalPaths } from './elecciones/useEleccionPortalPaths';
import { msRestantesHasta, votacionHorarioAbiertoCliente } from './elecciones/eleccionCountdownUtils';
import './AlumnoElecciones.css';

function useTickMs() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

export default function AlumnoEleccionProceso() {
  const { isCampana, apiPrefix, routeBase } = useEleccionPortalPaths();
  const now = useTickMs();
  const { procesoId } = useParams();
  const navigate = useNavigate();
  const pid = parseInt(procesoId, 10);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);

  const load = useCallback(async () => {
    if (!pid || Number.isNaN(pid)) return;
    setLoading(true);
    try {
      const { data: d } = await api.get(`${apiPrefix}/procesos/${pid}`);
      setData(d);
    } catch (e) {
      Swal.fire('Elección', e.response?.data?.error || 'No se pudo cargar', 'error');
      navigate(routeBase);
    } finally {
      setLoading(false);
    }
  }, [pid, navigate, apiPrefix, routeBase]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading || !data) {
    const wrap = (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
        <CircularProgress />
      </div>
    );
    return isCampana ? <EleccionCampanaLayout>{wrap}</EleccionCampanaLayout> : <DashboardLayout>{wrap}</DashboardLayout>;
  }

  const { proceso, listas, puede_participar, motivo_bloqueo, ya_voto, puede_votar_ahora, countdown_urna } = data;
  const cd = countdown_urna;
  const msApertura = msRestantesHasta(cd?.votacion_iso_inicio, now);
  const horarioOk = votacionHorarioAbiertoCliente(cd);

  let bloqueoUrnaTxt = null;
  if (proceso.estado === 'VOTACION') {
    if (!puede_participar) bloqueoUrnaTxt = motivo_bloqueo || 'No estás convocado/a para votar en este proceso.';
    else if (ya_voto) bloqueoUrnaTxt = null;
    else if (!horarioOk && msApertura != null && msApertura > 0) bloqueoUrnaTxt = null;
    else if (!horarioOk) bloqueoUrnaTxt = 'Fuera del horario de votación.';
  }

  const inner = (
    <div className="elcc-alum-hub">
      <button type="button" className="elcc-alum-btn elcc-alum-btn-secondary" style={{ marginBottom: '1rem' }} onClick={() => navigate(routeBase)}>
        ← Todas las elecciones
      </button>

      <header className="elcc-alum-hero">
        <h1>{proceso.titulo}</h1>
        {proceso.descripcion && <p>{proceso.descripcion}</p>}
        {!puede_participar && (
          <p style={{ opacity: 0.95 }}>Información de campaña visible para toda la comunidad. Para votar: {motivo_bloqueo}</p>
        )}
        {proceso.estado === 'CERRADA' && <p>Este proceso está cerrado. Puedes revisar las listas solo como archivo.</p>}
      </header>

      {(proceso.estado === 'CAMPAÑA' || proceso.estado === 'VOTACION') && (
        <EleccionUrnaAviso
          countdown_urna={cd}
          procesoEstado={proceso.estado}
          puedeVotarAhora={!!puede_votar_ahora}
          yaVoto={!!ya_voto}
          routeVotar={`${routeBase}/${pid}/votar`}
          now={now}
          mensajeAlterno={bloqueoUrnaTxt}
        />
      )}

      <h2 style={{ fontSize: '1.08rem', color: '#0f172a', marginBottom: '0.75rem' }}>Candidatos y propuestas</h2>
      <p className="elcc-alum-muted" style={{ marginBottom: '1rem' }}>
        Pulsa cada lista para ver la plancha completa, propuestas y enlaces.
      </p>

      <div className="elcc-alum-card-grid">
        {(listas || []).map((L) => (
          <article key={L.id} className="elcc-alum-proc-card">
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              {L.logo_url ? (
                <img src={L.logo_url} alt="" style={{ width: 56, height: 56, objectFit: 'contain', borderRadius: 12, background: '#f8fafc' }} />
              ) : (
                <div style={{ width: 56, height: 56, borderRadius: 12, background: '#e2e8f0' }} />
              )}
              <div>
                <h2 style={{ margin: 0 }}>{L.nombre_lista}</h2>
                {L.eslogan && <p className="elcc-alum-muted" style={{ margin: '6px 0 0' }}>{L.eslogan}</p>}
              </div>
            </div>
            <div className="elcc-alum-btn-row">
              <Link
                className="elcc-alum-btn elcc-alum-btn-primary"
                style={{ textDecoration: 'none', flex: 1 }}
                to={`${routeBase}/${pid}/lista/${L.id}`}
              >
                Ver página de campaña
              </Link>
            </div>
          </article>
        ))}
      </div>
    </div>
  );

  return isCampana ? <EleccionCampanaLayout>{inner}</EleccionCampanaLayout> : <DashboardLayout>{inner}</DashboardLayout>;
}
