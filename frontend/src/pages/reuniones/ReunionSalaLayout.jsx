import React from 'react';
import ReunionCronometro from './ReunionCronometro';
import './ReunionSalaLayout.css';

export default function ReunionSalaLayout({ titulo, iniciadaEn, onVolver, actions, children }) {
  return (
    <div className="vr-sala-root">
      <header className="vr-sala-topbar">
        <div className="vr-sala-stripes" aria-hidden />
        <div className="vr-sala-topbar-inner">
          <button type="button" className="vr-sala-back" onClick={onVolver}>
            ← Volver al intranet
          </button>
          <div className="vr-sala-brand">
            <p className="vr-sala-word">
              Vanguard<span>Room</span>
            </p>
            <p className="vr-sala-kicker">Sala de videollamada</p>
            <h1 className="vr-sala-title">{titulo || 'Reunión'}</h1>
            <ReunionCronometro iniciadaEn={iniciadaEn} />
          </div>
          <div className="vr-sala-actions">{actions}</div>
        </div>
      </header>
      <main className="vr-sala-main">{children}</main>
      <footer className="vr-sala-footer">
        <button type="button" onClick={onVolver}>
          Cerrar y volver al panel
        </button>
      </footer>
    </div>
  );
}
