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
  const heroBackground = `linear-gradient(128deg, ${c1} 0%, ${c2} 42%, ${c1} 88%, ${c2} 100%)`;

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
        <div className="elcc-alum-landing-hero" style={{ background: heroBackground }}>
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
          </div>
        </div>

        <section className="elcc-alum-section">
          <h2 className="elcc-alum-section-title">Equipo / plancha</h2>
          <div className="elcc-alum-plancha-grid">
            <article className="elcc-alum-plancha-card">
              <div className="elcc-alum-plancha-role">Alcalde</div>
              {alcalde.foto_url ? (
                <img src={alcalde.foto_url} alt="" style={{ width: 88, height: 88, objectFit: 'cover', borderRadius: 14, marginBottom: 6 }} />
              ) : null}
              <div style={{ fontWeight: 700, fontSize: '0.92rem', color: '#0f172a' }}>{alcalde.nombre_completo}</div>
            </article>
            {(plancha || []).map((m, idx) => (
              <article key={`${m.cargo}-${idx}`} className="elcc-alum-plancha-card">
                <div className="elcc-alum-plancha-role">{m.cargo}</div>
                {m.foto_url ? <img src={m.foto_url} alt="" /> : <div style={{ width: 72, height: 72, margin: '0 auto 6px', background: '#f1f5f9', borderRadius: 14 }} />}
                <div style={{ fontWeight: 600 }}>{m.nombre_completo}</div>
              </article>
            ))}
          </div>

          <h2 className="elcc-alum-section-title elcc-alum-section-title-spaced">Propuestas</h2>
          {(propuestas || []).length === 0 ? (
            <p className="elcc-alum-muted">Las propuestas se publicarán pronto.</p>
          ) : (
            propuestas.map((p) => (
              <div key={p.id} className="elcc-alum-prop">
                <strong style={{ color: '#1e293b', display: 'block', marginBottom: 6 }}>{p.titulo}</strong>
                <div
                  className="elcc-alum-prop-body"
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(p.cuerpo || '') }}
                />
              </div>
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
