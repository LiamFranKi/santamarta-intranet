import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CircularProgress } from '@mui/material';
import DashboardLayout from '../components/DashboardLayout';
import EleccionCampanaLayout from '../components/elecciones/EleccionCampanaLayout';
import api from '../services/api';
import Swal from 'sweetalert2';
import { useEleccionPortalPaths } from './elecciones/useEleccionPortalPaths';
import { msRestantesHasta } from './elecciones/eleccionCountdownUtils';
import './EleccionResultadosLive.css';

const POLL_MS = 1000;

function useTickMs() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

function confettiPieces(total = 22) {
  return Array.from({ length: total }, (_, i) => i + 1);
}

export default function EleccionResultadosLive() {
  const { isCampana, apiPrefix, routeBase } = useEleccionPortalPaths();
  const { procesoId } = useParams();
  const navigate = useNavigate();
  const now = useTickMs();
  const pid = parseInt(procesoId, 10);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [showWinner, setShowWinner] = useState(true);

  const load = useCallback(async () => {
    if (!pid || Number.isNaN(pid)) return;
    try {
      const { data: d } = await api.get(`${apiPrefix}/procesos/${pid}/resultados`);
      setData(d);
      setLoading(false);
    } catch (e) {
      setLoading(false);
      Swal.fire('Resultados', e.response?.data?.error || 'No disponibles por ahora', 'info');
      navigate(`${routeBase}/${pid}`);
    }
  }, [pid, apiPrefix, navigate, routeBase]);

  useEffect(() => {
    load();
    const id = window.setInterval(load, POLL_MS);
    return () => window.clearInterval(id);
  }, [load]);

  const msCierre = useMemo(() => msRestantesHasta(data?.votacion_iso_fin, now), [data?.votacion_iso_fin, now]);
  const msPublicacion = useMemo(() => msRestantesHasta(data?.publicar_desde_iso, now), [data?.publicar_desde_iso, now]);
  const segundosFinales = msCierre != null ? Math.max(0, Math.ceil(msCierre / 1000)) : null;
  const segundosSuspenso = msPublicacion != null ? Math.max(0, Math.ceil(msPublicacion / 1000)) : 0;

  if (loading || !data) {
    const wrap = (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
        <CircularProgress />
      </div>
    );
    return isCampana ? <EleccionCampanaLayout>{wrap}</EleccionCampanaLayout> : <DashboardLayout>{wrap}</DashboardLayout>;
  }

  const totalVotos = Number(data.votos_registrados || 0);
  const totales = Array.isArray(data.totales) ? data.totales : [];
  const top = Number(totales[0]?.votos || 0);
  const winner = data.ganador || null;
  const fase = String(data.fase || '');

  const showCountdownModal = fase === 'CUENTA_FINAL';
  const showSuspenseModal = fase === 'SUSPENSO';
  const showWinnerModal = fase === 'GANADOR' && showWinner;

  const inner = (
    <div className="elcc-rs-wrap">
      <header className="elcc-rs-hero">
        <h1>Resultados en vivo</h1>
        <p>{data.proceso?.titulo}</p>
        <div className="elcc-rs-meta">
          <span>Hora oficial: Lima, Peru</span>
          <Link to={`${routeBase}/${pid}`}>Volver al proceso</Link>
        </div>
      </header>

      {fase !== 'GANADOR' ? (
        <section className="elcc-rs-card">
          <h2>Esperando cierre oficial de la votacion</h2>
          <p className="elcc-rs-muted">
            Cuando termine el conteo, el sistema mostrara automaticamente al ganador y habilitara los resultados completos.
          </p>
        </section>
      ) : (
        <section className="elcc-rs-card">
          <h2>Conteo oficial</h2>
          <p className="elcc-rs-muted">Total de votos registrados: {totalVotos}</p>
          <div className="elcc-rs-bars">
            {totales.map((t, idx) => {
              const votos = Number(t.votos || 0);
              const pct = top > 0 ? Math.round((votos / top) * 100) : 0;
              return (
                <article key={t.lista_id} className="elcc-rs-bar-card">
                  <div className="elcc-rs-bar-head">
                    {t.alcalde_foto_url ? <img src={t.alcalde_foto_url} alt="" /> : <div className="elcc-rs-face-ph" />}
                    <div>
                      <h3>{t.nombre_lista}</h3>
                      <p>{t.alcalde_nombre_completo || 'Candidato/a'}</p>
                    </div>
                    <strong>{votos} votos</strong>
                  </div>
                  <div className="elcc-rs-bar-track">
                    <div className="elcc-rs-bar-fill" style={{ width: `${pct}%` }} />
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {(showCountdownModal || showSuspenseModal || showWinnerModal) && (
        <div className="elcc-rs-modal-backdrop" role="dialog" aria-modal="true">
          {showCountdownModal && (
            <div className="elcc-rs-modal elcc-rs-modal--count">
              <div className="elcc-rs-kicker">Finalizan las elecciones</div>
              <div className="elcc-rs-big-number">{segundosFinales}</div>
              <p>Preparando resultados oficiales...</p>
            </div>
          )}

          {showSuspenseModal && (
            <div className="elcc-rs-modal elcc-rs-modal--suspense">
              <div className="elcc-rs-spinner" />
              <h2>El ganador es...</h2>
              <p>Procesando conteo final ({segundosSuspenso}s)</p>
            </div>
          )}

          {showWinnerModal && winner && (
            <div className="elcc-rs-modal elcc-rs-modal--winner">
              <div className="elcc-rs-confetti" aria-hidden>
                {confettiPieces().map((n) => (
                  <span key={n} style={{ '--n': n }} />
                ))}
              </div>
              <h2>Nuevo alcalde</h2>
              <p className="elcc-rs-winner-list">{winner.nombre_lista}</p>
              <p className="elcc-rs-winner-name">{winner.alcalde_nombre_completo}</p>
              {winner.alcalde_foto_url ? <img src={winner.alcalde_foto_url} alt="" className="elcc-rs-winner-face" /> : null}
              <p className="elcc-rs-winner-note">Felicidades a la lista ganadora</p>
              <button type="button" className="elcc-rs-btn" onClick={() => setShowWinner(false)}>
                Ver resultados
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );

  return isCampana ? <EleccionCampanaLayout>{inner}</EleccionCampanaLayout> : <DashboardLayout>{inner}</DashboardLayout>;
}

