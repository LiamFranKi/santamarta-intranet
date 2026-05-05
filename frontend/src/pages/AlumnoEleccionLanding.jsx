import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CircularProgress } from '@mui/material';
import DashboardLayout from '../components/DashboardLayout';
import EleccionCampanaLayout from '../components/elecciones/EleccionCampanaLayout';
import api from '../services/api';
import Swal from 'sweetalert2';
import DOMPurify from 'dompurify';
import { useEleccionPortalPaths } from './elecciones/useEleccionPortalPaths';
import './AlumnoElecciones.css';

export default function AlumnoEleccionLanding() {
  const { isCampana, apiPrefix, routeBase } = useEleccionPortalPaths();
  const { procesoId, listaId } = useParams();
  const navigate = useNavigate();
  const pid = parseInt(procesoId, 10);
  const lid = parseInt(listaId, 10);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);

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

  if (loading || !data) {
    const wrap = (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
        <CircularProgress />
      </div>
    );
    return isCampana ? <EleccionCampanaLayout>{wrap}</EleccionCampanaLayout> : <DashboardLayout>{wrap}</DashboardLayout>;
  }

  const { proceso, lista, plancha, propuestas, redes } = data;
  const c1 = lista.color_primario || '#4338ca';
  const c2 = lista.color_secundario || '#6366f1';

  const alcalde = lista.alcalde || {};

  const inner = (
    <div className="elcc-alum-landing">
        <div
          className="elcc-alum-landing-hero"
          style={{
            background: `linear-gradient(145deg, ${c1}, ${c2})`
          }}
        >
          <div className="elcc-alum-landing-inner">
            {lista.logo_url ? <img src={lista.logo_url} alt="" className="elcc-alum-landing-logo" /> : <div className="elcc-alum-landing-logo" />}
            <div>
              <h1 style={{ margin: '0 0 0.25rem', fontSize: '1.85rem', lineHeight: 1.2 }}>{lista.nombre_lista}</h1>
              {lista.eslogan && <p style={{ margin: 0, fontSize: '1rem', opacity: 0.95 }}>{lista.eslogan}</p>}
            </div>
            {alcalde.foto_url ? <img src={alcalde.foto_url} alt="" className="elcc-alum-landing-face" /> : null}
            <div>
              <p style={{ margin: 0, fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.12em', opacity: 0.85 }}>
                Candidato a alcalde
              </p>
              <p style={{ margin: '0.2rem 0 0', fontSize: '1.35rem', fontWeight: 700 }}>{alcalde.nombre_completo}</p>
            </div>
            <Link
              to={`${routeBase}/${pid}`}
              style={{
                marginTop: 8,
                color: '#fff',
                textDecoration: 'underline',
                fontSize: '0.92rem'
              }}
            >
              ← Volver a {proceso.titulo}
            </Link>
          </div>
        </div>

        <section className="elcc-alum-section">
          <h2 style={{ margin: '0 0 0.85rem', color: '#0f172a' }}>Equipo / plancha</h2>
          <div className="elcc-alum-plancha-grid">
            <article className="elcc-alum-plancha-card">
              <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#6366f1', textTransform: 'uppercase', marginBottom: 4 }}>Alcalde</div>
              {alcalde.foto_url ? (
                <img src={alcalde.foto_url} alt="" style={{ width: 88, height: 88, objectFit: 'cover', borderRadius: 14, marginBottom: 6 }} />
              ) : null}
              <div style={{ fontWeight: 700, fontSize: '0.92rem', color: '#0f172a' }}>{alcalde.nombre_completo}</div>
            </article>
            {(plancha || []).map((m, idx) => (
              <article key={`${m.cargo}-${idx}`} className="elcc-alum-plancha-card">
                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#6366f1', textTransform: 'uppercase', marginBottom: 4 }}>{m.cargo}</div>
                {m.foto_url ? <img src={m.foto_url} alt="" /> : <div style={{ width: 72, height: 72, margin: '0 auto 6px', background: '#f1f5f9', borderRadius: 14 }} />}
                <div style={{ fontWeight: 600 }}>{m.nombre_completo}</div>
              </article>
            ))}
          </div>

          <h2 style={{ margin: '2rem 0 0.85rem', color: '#0f172a' }}>Propuestas</h2>
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

          <h2 style={{ margin: '2rem 0 0.85rem', color: '#0f172a' }}>Redes</h2>
          {(redes || []).length === 0 ? (
            <p className="elcc-alum-muted">Sin enlaces adicionales.</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {redes.map((r) => (
                <li key={r.id} style={{ marginBottom: 10 }}>
                  <a href={r.url} target="_blank" rel="noopener noreferrer" className="elcc-alum-btn elcc-alum-btn-secondary" style={{ textDecoration: 'none', display: 'inline-block' }}>
                    {r.tipo}
                    {r.titulo ? ` — ${r.titulo}` : ''}
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
