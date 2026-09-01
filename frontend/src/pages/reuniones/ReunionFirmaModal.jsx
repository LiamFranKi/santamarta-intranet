import React, { useEffect, useRef, useState } from 'react';

export default function ReunionFirmaModal({
  abierto,
  onCerrar,
  onFirmar,
  guardando,
  obligatoria,
  titulo,
  hint,
}) {
  const canvasRef = useRef(null);
  const dibujando = useRef(false);
  const [vacio, setVacio] = useState(true);

  useEffect(() => {
    if (!abierto) return;
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    setVacio(true);
  }, [abierto]);

  const pos = (e) => {
    const c = canvasRef.current;
    const r = c.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return {
      x: ((t.clientX - r.left) / r.width) * c.width,
      y: ((t.clientY - r.top) / r.height) * c.height,
    };
  };

  const start = (e) => {
    e.preventDefault();
    dibujando.current = true;
    const ctx = canvasRef.current.getContext('2d');
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };

  const move = (e) => {
    if (!dibujando.current) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext('2d');
    const p = pos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    setVacio(false);
  };

  const end = () => {
    dibujando.current = false;
  };

  const limpiar = () => {
    const c = canvasRef.current;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    setVacio(true);
  };

  if (!abierto) return null;

  return (
    <div className="re-modal-bg" role="dialog" aria-label="Firmar sesión">
      <div className="re-modal">
        <h3>{titulo || (obligatoria ? 'Firma para salir' : 'Firmar la sesión')}</h3>
        <p className="re-hint">
          {hint ||
            (obligatoria
              ? 'Todos deben firmar antes de salir. Tu firma queda guardada como evidencia en el resumen.'
              : 'Dibuja tu firma. Queda registrada como evidencia en el resumen de la reunión.')}
        </p>
        <canvas
          ref={canvasRef}
          width={520}
          height={180}
          className="re-firma-canvas"
          onMouseDown={start}
          onMouseMove={move}
          onMouseUp={end}
          onMouseLeave={end}
          onTouchStart={start}
          onTouchMove={move}
          onTouchEnd={end}
        />
        <div className="re-actions-row">
          <button type="button" className="re-btn re-btn-ghost" style={{ background: '#e2e8f0', color: '#0f172a' }} onClick={limpiar}>
            Borrar
          </button>
          <button type="button" className="re-btn re-btn-ghost" style={{ background: '#e2e8f0', color: '#0f172a' }} onClick={onCerrar} disabled={guardando}>
            {obligatoria ? 'Seguir en la sala' : 'Seguir en la reunión'}
          </button>
          <button
            type="button"
            className="re-btn re-btn-solid"
            disabled={vacio || guardando}
            onClick={() => onFirmar(canvasRef.current.toDataURL('image/png'))}
          >
            {guardando ? 'Guardando…' : 'Confirmar firma'}
          </button>
        </div>
      </div>
    </div>
  );
}
