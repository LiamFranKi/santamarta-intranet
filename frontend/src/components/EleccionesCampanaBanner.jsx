import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { msRestantesHasta, textoCuentaRegresivaUrna, votacionHorarioAbiertoCliente } from '../pages/elecciones/eleccionCountdownUtils';
import './EleccionesCampanaBanner.css';

function useNowEverySecond() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

function pickBannerModel(procesos, now) {
  if (!procesos?.length) return { kind: 'hidden' };

  let minMs = null;
  for (const p of procesos) {
    const cd = p.countdown_urna;
    const ms = msRestantesHasta(cd?.votacion_iso_inicio, now);
    if (ms != null && ms > 0) {
      if (minMs == null || ms < minMs) minMs = ms;
    }
  }

  if (minMs != null) {
    const t = textoCuentaRegresivaUrna(minMs);
    if (t) return { kind: 'countdown', linea: t.linea };
  }

  const paraVotar = procesos.find(
    (p) =>
      p.estado === 'VOTACION' &&
      p.puede_votar_ahora &&
      !p.ya_voto &&
      votacionHorarioAbiertoCliente(p.countdown_urna)
  );
  if (paraVotar) {
    return { kind: 'vota', procesoId: paraVotar.id };
  }

  return { kind: 'link' };
}

/**
 * CTA en dashboards: procesos activos (CAMPAÑA / VOTACIÓN) vía API portal.
 * Cuenta regresiva hacia apertura de urna (referencia Lima en servidor) y “VOTA AQUÍ” cuando aplica.
 */
export default function EleccionesCampanaBanner() {
  const { user } = useAuth();
  const routeBase = useMemo(() => (user?.tipo === 'ALUMNO' ? '/alumno/elecciones' : '/elecciones-campana'), [user?.tipo]);
  const now = useNowEverySecond();
  const [procesos, setProcesos] = useState([]);
  const refetchAbiertoRef = useRef(new Set());

  useEffect(() => {
    let cancelled = false;
    const fetchPros = async () => {
      try {
        const { data } = await api.get('/elecciones/portal/procesos');
        if (!cancelled) setProcesos(data?.procesos || []);
      } catch {
        if (!cancelled) setProcesos([]);
      }
    };
    fetchPros();
    const interval = window.setInterval(fetchPros, 12000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

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
        (async () => {
          try {
            const { data } = await api.get('/elecciones/portal/procesos');
            setProcesos(data?.procesos || []);
          } catch {
            setProcesos([]);
          }
        })();
      }
    });
  }, [now, procesos]);

  const model = pickBannerModel(procesos, now);

  if (model.kind === 'hidden') return null;

  if (model.kind === 'countdown') {
    return (
      <Link to={routeBase} className="elcc-dash-banner elcc-dash-banner--count">
        <span className="elcc-dash-banner-icon" aria-hidden>
          ⏱️
        </span>
        <span className="elcc-dash-banner-text">
          <strong>Elecciones escolares</strong>
          <span className="elcc-dash-banner-count">{model.linea}</span>
          <span className="elcc-dash-banner-sub">Hora apertura urna: Lima, Perú · Toca para entrar</span>
        </span>
        <span className="elcc-dash-banner-go">Abrir →</span>
      </Link>
    );
  }

  if (model.kind === 'vota') {
    return (
      <div className="elcc-dash-banner elcc-dash-banner--vota">
        <span className="elcc-dash-banner-icon" aria-hidden>
          🗳️
        </span>
        <div className="elcc-dash-banner-text">
          <strong>¡Urna abierta!</strong>
          <span className="elcc-dash-banner-sub">Puedes emitir tu voto ahora (una sola vez por proceso).</span>
        </div>
        <Link to={`${routeBase}/${model.procesoId}/votar`} className="elcc-dash-banner-vota-btn">
          VOTA AQUÍ
        </Link>
      </div>
    );
  }

  return (
    <Link to={routeBase} className="elcc-dash-banner">
      <span className="elcc-dash-banner-icon" aria-hidden>
        🗳️
      </span>
      <span className="elcc-dash-banner-text">
        <strong>Elecciones escolares</strong>
        <span>Entra a la jornada electoral (campañas y votación)</span>
      </span>
      <span className="elcc-dash-banner-go">Abrir →</span>
    </Link>
  );
}
