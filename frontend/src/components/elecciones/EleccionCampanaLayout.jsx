import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import './EleccionCampanaLayout.css';

function panelHomePorTipo(tipo) {
  if (tipo === 'DOCENTE') return '/docente/dashboard';
  if (tipo === 'APODERADO') return '/apoderado/dashboard';
  if (tipo === 'ALUMNO') return '/alumno/dashboard';
  return '/admin/dashboard';
}

export default function EleccionCampanaLayout({ children }) {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const home = panelHomePorTipo(user?.tipo);
  const [showResultadosChip, setShowResultadosChip] = useState(false);
  const [procesoId, setProcesoId] = useState(null);

  const apiPrefix = useMemo(() => '/elecciones/portal', []);

  useEffect(() => {
    const m = pathname.match(/^\/elecciones-campana\/(\d+)/);
    if (!m) {
      setProcesoId(null);
      setShowResultadosChip(false);
      return;
    }
    const pid = parseInt(m[1], 10);
    if (!Number.isFinite(pid)) {
      setProcesoId(null);
      setShowResultadosChip(false);
      return;
    }
    setProcesoId(pid);
  }, [pathname]);

  useEffect(() => {
    let mounted = true;
    if (!procesoId) {
      setShowResultadosChip(false);
      return undefined;
    }

    const refresh = async () => {
      try {
        const { data } = await api.get(`${apiPrefix}/procesos/${procesoId}/resultados`);
        const fase = String(data?.fase || '');
        if (mounted) setShowResultadosChip(fase === 'SUSPENSO' || fase === 'GANADOR');
      } catch {
        if (mounted) setShowResultadosChip(false);
      }
    };

    refresh();
    const id = window.setInterval(refresh, 8000);
    return () => {
      mounted = false;
      window.clearInterval(id);
    };
  }, [procesoId, apiPrefix]);

  return (
    <div className="elcc-campana-root">
      <header className="elcc-campana-topbar">
        <div className="elcc-campana-stripes" aria-hidden />
        <div className="elcc-campana-topbar-inner">
          <Link to={home} className="elcc-campana-back">
            ← Volver al intranet
          </Link>
          <div className="elcc-campana-brand">
            <span className="elcc-campana-chip">Elecciones escolares</span>
            <h1 className="elcc-campana-title">Jornada electoral</h1>
          </div>
        </div>
      </header>
      <main className="elcc-campana-main">{children}</main>
      {showResultadosChip && procesoId ? (
        <Link className="elcc-campana-results-chip" to={`/elecciones-campana/${procesoId}/resultados`}>
          Ver resultados en vivo
        </Link>
      ) : null}
      <footer className="elcc-campana-footer">
        <Link to={home}>Cerrar y volver al panel</Link>
      </footer>
    </div>
  );
}
