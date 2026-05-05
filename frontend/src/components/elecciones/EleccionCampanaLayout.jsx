import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import './EleccionCampanaLayout.css';

function panelHomePorTipo(tipo) {
  if (tipo === 'DOCENTE') return '/docente/dashboard';
  if (tipo === 'APODERADO') return '/apoderado/dashboard';
  if (tipo === 'ALUMNO') return '/alumno/dashboard';
  return '/admin/dashboard';
}

export default function EleccionCampanaLayout({ children }) {
  const { user } = useAuth();
  const home = panelHomePorTipo(user?.tipo);

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
      <footer className="elcc-campana-footer">
        <Link to={home}>Cerrar y volver al panel</Link>
      </footer>
    </div>
  );
}
