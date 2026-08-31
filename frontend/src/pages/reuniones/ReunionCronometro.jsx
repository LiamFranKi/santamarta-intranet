import React, { useEffect, useState } from 'react';
import { crearFechaLima } from '../../utils/fechaLima';

function pad(n) {
  return String(n).padStart(2, '0');
}

function fmtDuracion(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export default function ReunionCronometro({ iniciadaEn }) {
  const inicio = crearFechaLima(iniciadaEn);
  const [ahora, setAhora] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (!inicio) return null;

  return (
    <div className="re-crono" title="Tiempo desde que se abrió la reunión. La hora de fin del formulario no cierra la sala.">
      <span className="re-crono-dot" aria-hidden />
      <span className="re-crono-label">En sesión</span>
      <time className="re-crono-time" dateTime={`PT${Math.max(0, Math.floor((ahora - inicio.getTime()) / 1000))}S`}>
        {fmtDuracion(ahora - inicio.getTime())}
      </time>
    </div>
  );
}
