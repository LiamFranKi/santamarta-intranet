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

/** Evita N peticiones/seg por pestaña (muchas pestañas = saturación API/BD). 2,5 s sigue siendo «en vivo». */
const POLL_MS = 2500;

function formatoMmSs(totalSegundos) {
  if (totalSegundos == null || totalSegundos < 0) return '—';
  const m = Math.floor(totalSegundos / 60);
  const s = totalSegundos % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Reloj hasta cierre oficial (solo informativo; el modal «cuenta atrás épica» abre cuando queden 2 min o menos antes del cierre Lima). */
function formatoHastaCierre(ms) {
  if (ms == null || ms <= 0) return null;
  const totalS = Math.floor(ms / 1000);
  const d = Math.floor(totalS / 86400);
  const h = Math.floor((totalS % 86400) / 3600);
  const m = Math.floor((totalS % 3600) / 60);
  const s = totalS % 60;
  if (d >= 1) return `${d} día${d === 1 ? '' : 's'} ${h}h ${String(m).padStart(2, '0')}m`;
  if (h >= 1) return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

function useTickMs() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

function garlandPieces(total = 16) {
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
  const top = Math.max(0, ...totales.map((t) => Number(t.votos || 0)));
  const winner = data.ganador || null;
  const empateListas =
    Array.isArray(data.empate_primer_lugar) && data.empate_primer_lugar.length >= 2 ? data.empate_primer_lugar : null;
  const empateIds = new Set((empateListas || []).map((l) => l.lista_id));
  const fase = String(data.fase || '');

  const showCountdownModal = fase === 'CUENTA_FINAL';
  const showSuspenseModal = fase === 'SUSPENSO';
  const showWinnerModal = fase === 'GANADOR' && showWinner && !!winner;
  const untilCloseLabel = formatoHastaCierre(msCierre);

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
          {fase === 'PREVIA' ? (
            <>
              <h2>Jornada aún sin cierre oficial</h2>
              <p className="elcc-rs-muted">
                Mientras tanto puedes revisar las campañas. La cuenta regresiva a pantalla completa aparece cuando falten hasta 2 minutos para el cierre oficial (hora Lima).
              </p>
              {untilCloseLabel && (
                <p className="elcc-rs-wait-highlight">
                  Faltan <strong>{untilCloseLabel}</strong> para el cierre de las elecciones (hora oficial Lima).
                </p>
              )}
            </>
          ) : fase === 'ESPERA_CIERRE' ? (
            <>
              <h2>Esperando cierre oficial de la votación</h2>
              <p className="elcc-rs-muted">
                La urna está abierta hasta el horario oficial. La ventana de cuenta atrás en grande se abrirá cuando queden hasta{' '}
                <strong className="elcc-rs-wait-strong">2 minutos</strong>
                antes del cierre (Lima). Luego viene el suspenso y el anuncio del ganador.
              </p>
              {untilCloseLabel && (
                <p className="elcc-rs-wait-highlight">
                  Faltan <strong>{untilCloseLabel}</strong> para el cierre de las elecciones (hora oficial Lima).
                </p>
              )}
            </>
          ) : (
            <>
              <h2>Esperando cierre oficial de la votacion</h2>
              <p className="elcc-rs-muted">
                Cuando termine el conteo, el sistema mostrara automaticamente al ganador y habilitara los resultados completos.
              </p>
            </>
          )}
        </section>
      ) : (
        <section className="elcc-rs-card">
          <h2>Conteo oficial</h2>
          <p className="elcc-rs-muted">Total de votos registrados: {totalVotos}</p>
          {!winner && totalVotos === 0 && (
            <p className="elcc-rs-muted" style={{ marginBottom: 12 }}>
              Aún no hay votos en esta jornada. Cuando se registren participaciones, aquí se mostrará el conteo y, si corresponde, al ganador.
            </p>
          )}
          {empateListas && (
            <div className="elcc-rs-tie-panel" role="status" aria-live="polite">
              <div className="elcc-rs-tie-ribbon" aria-hidden="true" />
              <div className="elcc-rs-tie-badge">Empate en primer lugar</div>
              <p className="elcc-rs-tie-lead">
                {empateListas.length} listas con el mismo máximo de votos ({Number(empateListas[0]?.votos || 0)} cada una).
              </p>
              <p className="elcc-rs-tie-hint">
                No se declara ganador único en esta jornada. La institución puede convocar una segunda vuelta entre estas listas; el
                calendario y la urna se configuran desde administración.
              </p>
              <ul className="elcc-rs-tie-grid">
                {empateListas.map((t) => (
                  <li key={t.lista_id} className="elcc-rs-tie-card">
                    {t.alcalde_foto_url ? (
                      <img src={t.alcalde_foto_url} alt="" className="elcc-rs-tie-face" />
                    ) : (
                      <div className="elcc-rs-face-ph elcc-rs-tie-face" />
                    )}
                    <span className="elcc-rs-tie-lista">{t.nombre_lista}</span>
                    <span className="elcc-rs-tie-alcalde">{t.alcalde_nombre_completo || 'Candidato/a'}</span>
                    <span className="elcc-rs-tie-votos">{Number(t.votos || 0)} votos</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {!winner && totalVotos > 0 && !empateListas && (
            <p className="elcc-rs-muted" style={{ marginBottom: 12 }}>
              No se puede declarar un único ganador con el conteo actual.
            </p>
          )}
          <div className="elcc-rs-bars">
            {totales.map((t) => {
              const votos = Number(t.votos || 0);
              const pct = top > 0 ? Math.round((votos / top) * 100) : 0;
              return (
                <article
                  key={t.lista_id}
                  className={`elcc-rs-bar-card${empateIds.has(t.lista_id) ? ' elcc-rs-bar-card--empate' : ''}`}
                >
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
              <div className="elcc-rs-big-mmss">{formatoMmSs(segundosFinales)}</div>
              <p className="elcc-rs-count-sec">{segundosFinales != null ? `${segundosFinales} segundos` : ''}</p>
              <p className="elcc-rs-count-hint">Cuenta atrás hasta el cierre oficial (Lima).</p>
            </div>
          )}

          {showSuspenseModal && (
            <div className="elcc-rs-modal elcc-rs-modal--suspense">
              <div className="elcc-rs-spinner" />
              <h2>El ganador es...</h2>
              <p>Procesando conteo final ({segundosSuspenso}s)</p>
            </div>
          )}

          {showWinnerModal && (
            <div className="elcc-rs-modal elcc-rs-modal--winner">
              <div className="elcc-rs-garland elcc-rs-garland--left" aria-hidden="true">
                {garlandPieces(18).map((n) => (
                  <span key={`L${n}`} className="elcc-rs-pennant elcc-rs-pennant--left" style={{ '--i': n }} />
                ))}
              </div>
              <div className="elcc-rs-garland elcc-rs-garland--right" aria-hidden="true">
                {garlandPieces(18).map((n) => (
                  <span key={`R${n}`} className="elcc-rs-pennant elcc-rs-pennant--right" style={{ '--i': n }} />
                ))}
              </div>
              <div className="elcc-rs-winner-inner">
                <h2>Nuevo alcalde</h2>
                <p className="elcc-rs-winner-list">{winner.nombre_lista}</p>
                {winner.alcalde_foto_url ? (
                  <img src={winner.alcalde_foto_url} alt="" className="elcc-rs-winner-face elcc-rs-winner-face--hero" />
                ) : (
                  <div className="elcc-rs-face-ph elcc-rs-face-ph--hero" />
                )}
                <p className="elcc-rs-winner-name">{winner.alcalde_nombre_completo}</p>
                <p className="elcc-rs-winner-note">Felicidades a la lista ganadora</p>
                <button type="button" className="elcc-rs-btn" onClick={() => setShowWinner(false)}>
                  Ver resultados
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );

  return isCampana ? <EleccionCampanaLayout>{inner}</EleccionCampanaLayout> : <DashboardLayout>{inner}</DashboardLayout>;
}

