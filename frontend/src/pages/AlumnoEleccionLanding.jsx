import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CircularProgress } from '@mui/material';
import YouTube from '@mui/icons-material/YouTube';
import Instagram from '@mui/icons-material/Instagram';
import Language from '@mui/icons-material/Language';
import LinkOutlined from '@mui/icons-material/LinkOutlined';
import OpenInNew from '@mui/icons-material/OpenInNew';
import OndemandVideo from '@mui/icons-material/OndemandVideo';
import DashboardLayout from '../components/DashboardLayout';
import EleccionCampanaLayout from '../components/elecciones/EleccionCampanaLayout';
import EleccionUrnaAviso from '../components/elecciones/EleccionUrnaAviso';
import api from '../services/api';
import Swal from 'sweetalert2';
import DOMPurify from 'dompurify';
import { useEleccionPortalPaths } from './elecciones/useEleccionPortalPaths';
import { msRestantesHasta, votacionHorarioAbiertoCliente } from './elecciones/eleccionCountdownUtils';
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

function normalizeHex(c) {
  const s = String(c || '').trim();
  if (!s) return '';
  if (/^#[a-f\d]{6}$/i.test(s)) return s;
  if (/^#[a-f\d]{3}$/i.test(s)) {
    const x = s.slice(1);
    return `#${x[0]}${x[0]}${x[1]}${x[1]}${x[2]}${x[2]}`.toLowerCase();
  }
  return s;
}

/** Aclara un hex hacia blanco para cabeceras pastel legibles con texto oscuro. */
function mixWithWhite(hex, t = 0.78) {
  const h = normalizeHex(hex).replace('#', '');
  if (h.length !== 6) return '#e0e7ff';
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const mix = (c) => Math.round(255 * t + c * (1 - t));
  return `#${[mix(r), mix(g), mix(b)].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}

/** Si primario y secundario son iguales, oscurece uno para que el degradado se note. */
function coloresListaParaHero(lista) {
  let c1 = normalizeHex(lista?.color_primario) || '#4338ca';
  let c2 = normalizeHex(lista?.color_secundario) || '#6366f1';
  if (c1.toLowerCase() === c2.toLowerCase()) {
    const m = c1.replace('#', '');
    if (m.length === 6) {
      const n = parseInt(m, 16);
      const r = Math.max(0, Math.round(((n >> 16) & 255) * 0.72));
      const g = Math.max(0, Math.round(((n >> 8) & 255) * 0.72));
      const b = Math.max(0, Math.round((n & 255) * 0.72));
      c2 = `#${[r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
    }
  }
  return { c1, c2 };
}

function RedSocialIcon({ tipo }) {
  const t = String(tipo || '').toUpperCase();
  const sx = { fontSize: 28 };
  if (t === 'YOUTUBE') return <YouTube sx={sx} />;
  if (t === 'INSTAGRAM') return <Instagram sx={sx} />;
  if (t === 'TIKTOK') return <OndemandVideo sx={sx} />;
  if (t === 'WEB') return <Language sx={sx} />;
  return <LinkOutlined sx={sx} />;
}

function etiquetaRed(tipo) {
  const t = String(tipo || '').toUpperCase();
  if (t === 'YOUTUBE') return 'YouTube';
  if (t === 'INSTAGRAM') return 'Instagram';
  if (t === 'TIKTOK') return 'TikTok';
  if (t === 'WEB') return 'Web';
  return t || 'Enlace';
}

export default function AlumnoEleccionLanding() {
  const { isCampana, apiPrefix, routeBase } = useEleccionPortalPaths();
  const { procesoId, listaId } = useParams();
  const navigate = useNavigate();
  const pid = parseInt(procesoId, 10);
  const lid = parseInt(listaId, 10);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const now = useTickMs();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: d } = await api.get(`${apiPrefix}/procesos/${pid}/listas/${lid}`);
      setData(d);
    } catch (e) {
      Swal.fire('', e.response?.data?.error || 'No disponible', 'warning');
      navigate(`${routeBase}/${pid}`);
    } finally {
      setLoading(false);
    }
  }, [pid, lid, navigate, apiPrefix, routeBase]);

  useEffect(() => {
    load();
  }, [load]);

  const { c1, c2 } = coloresListaParaHero(data?.lista);
  const c1p = mixWithWhite(c1, 0.82);
  const c2p = mixWithWhite(c2, 0.76);
  const heroBackground = `linear-gradient(128deg, ${c1p} 0%, ${c2p} 42%, #faf5ff 78%, #ecfeff 100%)`;

  if (loading || !data) {
    const wrap = (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
        <CircularProgress />
      </div>
    );
    return isCampana ? <EleccionCampanaLayout>{wrap}</EleccionCampanaLayout> : <DashboardLayout>{wrap}</DashboardLayout>;
  }

  const {
    proceso,
    lista,
    plancha,
    propuestas,
    redes,
    countdown_urna,
    puede_votar_ahora,
    ya_voto,
    puede_participar,
    motivo_bloqueo
  } = data;
  const alcalde = lista.alcalde || {};

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
    <div
      className="elcc-alum-landing"
      style={
        {
          '--elcc-c1': c1,
          '--elcc-c2': c2
        }
      }
    >
        <div className="elcc-alum-landing-hero elcc-alum-landing-hero--pastelTone" style={{ background: heroBackground }}>
          <div className="elcc-alum-landing-inner">
            {lista.logo_url ? <img src={lista.logo_url} alt="" className="elcc-alum-landing-logo" /> : <div className="elcc-alum-landing-logo" />}
            <div className="elcc-alum-landing-headlines">
              <h1 className="elcc-alum-landing-nombre">{lista.nombre_lista}</h1>
              {lista.eslogan ? <p className="elcc-alum-landing-slogan">{lista.eslogan}</p> : null}
            </div>
            <div className="elcc-alum-landing-alcalde">
              {alcalde.foto_url ? (
                <img src={alcalde.foto_url} alt="" className="elcc-alum-landing-face" />
              ) : (
                <div className="elcc-alum-landing-face elcc-alum-landing-face-ph" aria-hidden />
              )}
              <p className="elcc-alum-landing-role">Candidato a alcalde</p>
              <p className="elcc-alum-landing-alcalde-nombre">{alcalde.nombre_completo}</p>
            </div>
            {(proceso.estado === 'CAMPAÑA' || proceso.estado === 'VOTACION') && (
              <EleccionUrnaAviso
                countdown_urna={cd}
                procesoEstado={proceso.estado}
                puedeVotarAhora={!!puede_votar_ahora}
                yaVoto={!!ya_voto}
                routeVotar={`${routeBase}/${pid}/votar`}
                now={now}
                mensajeAlterno={bloqueoUrnaTxt}
                compact
              />
            )}
            <Link to={`${routeBase}/${pid}`} className="elcc-alum-landing-backlink">
              ← Volver a {proceso.titulo}
            </Link>
            <Link to={`${routeBase}/${pid}/resultados`} className="elcc-alum-landing-backlink">
              Ver resultados en vivo
            </Link>
          </div>
        </div>

        <section className="elcc-alum-section elcc-alum-section--wide">
          <h2 className="elcc-alum-section-title">Equipo / plancha</h2>
          <div className="elcc-alum-plancha-grid elcc-alum-plancha-grid--centered">
            <article className={`elcc-alum-plancha-card ${elccPastelClass(0)}`}>
              <div className="elcc-alum-plancha-role">Alcalde</div>
              {alcalde.foto_url ? (
                <img src={alcalde.foto_url} alt="" className="elcc-alum-plancha-face elcc-alum-plancha-face--lg" />
              ) : (
                <div className="elcc-alum-plancha-face elcc-alum-plancha-face--lg elcc-alum-plancha-face-ph" aria-hidden />
              )}
              <div className="elcc-alum-plancha-nombre">{alcalde.nombre_completo}</div>
            </article>
            {(plancha || []).map((m, idx) => (
              <article key={`${m.cargo}-${idx}`} className={`elcc-alum-plancha-card ${elccPastelClass(idx + 1)}`}>
                <div className="elcc-alum-plancha-role">{m.cargo}</div>
                {m.foto_url ? (
                  <img src={m.foto_url} alt="" className="elcc-alum-plancha-face elcc-alum-plancha-face--lg" />
                ) : (
                  <div className="elcc-alum-plancha-face elcc-alum-plancha-face--lg elcc-alum-plancha-face-ph" aria-hidden />
                )}
                <div className="elcc-alum-plancha-nombre">{m.nombre_completo}</div>
              </article>
            ))}
          </div>

          <h2 className="elcc-alum-section-title elcc-alum-section-title-spaced">Propuestas</h2>
          {(propuestas || []).length === 0 ? (
            <p className="elcc-alum-muted">Las propuestas se publicarán pronto.</p>
          ) : (
            propuestas.map((p, i) => (
              <details key={p.id} className={`elcc-alum-prop-details ${elccPastelClass(i)}`}>
                <summary className="elcc-alum-prop-summary">{p.titulo}</summary>
                <div
                  className="elcc-alum-prop-body elcc-alum-prop-body--pad"
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(p.cuerpo || '') }}
                />
              </details>
            ))
          )}

          <h2 className="elcc-alum-section-title elcc-alum-section-title-spaced">Redes y enlaces</h2>
          {(redes || []).length === 0 ? (
            <p className="elcc-alum-muted">Sin enlaces adicionales.</p>
          ) : (
            <ul className="elcc-alum-redes-list">
              {redes.map((r) => (
                <li key={r.id}>
                  <a href={r.url} target="_blank" rel="noopener noreferrer" className="elcc-alum-redes-card">
                    <span className="elcc-alum-redes-icon" aria-hidden>
                      <RedSocialIcon tipo={r.tipo} />
                    </span>
                    <span className="elcc-alum-redes-text">
                      <span className="elcc-alum-redes-tipo">{etiquetaRed(r.tipo)}</span>
                      {r.titulo ? <span className="elcc-alum-redes-sub">{r.titulo}</span> : null}
                      <span className="elcc-alum-redes-url">{r.url.replace(/^https?:\/\//i, '')}</span>
                    </span>
                    <OpenInNew className="elcc-alum-redes-external" fontSize="small" aria-hidden />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
  );

  return isCampana ? <EleccionCampanaLayout>{inner}</EleccionCampanaLayout> : <DashboardLayout>{inner}</DashboardLayout>;
}
