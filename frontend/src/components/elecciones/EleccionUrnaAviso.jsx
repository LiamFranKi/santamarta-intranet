import React from 'react';
import { Link } from 'react-router-dom';
import { msRestantesHasta, textoCuentaRegresivaUrna, votacionHorarioAbiertoCliente } from '../../pages/elecciones/eleccionCountdownUtils';
import './EleccionUrnaAviso.css';

/**
 * Cuenta regresiva hasta apertura (hora Lima vía ISO de API) y CTA “VOTA AQUÍ” cuando corresponde.
 */
export default function EleccionUrnaAviso({
  countdown_urna,
  procesoEstado,
  puedeVotarAhora,
  yaVoto,
  routeVotar,
  now,
  compact,
  mensajeAlterno
}) {
  const cd = countdown_urna;
  const msApertura = msRestantesHasta(cd?.votacion_iso_inicio, now);
  const horarioOk = votacionHorarioAbiertoCliente(cd);
  const antesDeAbrir = msApertura != null && msApertura > 0;
  const cuentaTxt = antesDeAbrir ? textoCuentaRegresivaUrna(msApertura) : null;

  if (procesoEstado === 'VOTACION' && yaVoto) {
    if (compact) return null;
    return (
      <div className="elcc-urna-aviso elcc-urna-aviso--ok" role="status">
        <span className="elcc-urna-aviso__check" aria-hidden>
          ✓
        </span>
        <span>Tu voto ya fue registrado. ¡Gracias por participar!</span>
      </div>
    );
  }

  if (procesoEstado === 'VOTACION' && puedeVotarAhora && horarioOk && !yaVoto && routeVotar) {
    return (
      <div className={`elcc-urna-aviso elcc-urna-aviso--vota${compact ? ' elcc-urna-aviso--compact' : ''}`}>
        <Link to={routeVotar} className="elcc-urna-vota-btn">
          VOTA AQUÍ
        </Link>
        <span className="elcc-urna-aviso__hint">Urna abierta · hora Lima</span>
      </div>
    );
  }

  if (cuentaTxt && antesDeAbrir && (procesoEstado === 'VOTACION' || procesoEstado === 'CAMPAÑA')) {
    return (
      <div className={`elcc-urna-aviso elcc-urna-aviso--cuenta${compact ? ' elcc-urna-aviso--compact' : ''}`} role="timer" aria-live="polite">
        <span className="elcc-urna-aviso__lbl">Para la apertura de la urna</span>
        <span className="elcc-urna-aviso__num">{cuentaTxt.linea}</span>
        <span className="elcc-urna-aviso__sub">Hora oficial: Lima, Perú</span>
      </div>
    );
  }

  if (procesoEstado === 'VOTACION' && !yaVoto && mensajeAlterno) {
    return (
      <div className={`elcc-urna-aviso elcc-urna-aviso--warn${compact ? ' elcc-urna-aviso--compact' : ''}`}>
        <span>{mensajeAlterno}</span>
      </div>
    );
  }

  return null;
}
