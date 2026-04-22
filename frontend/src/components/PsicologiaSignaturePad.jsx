import React, { useRef, useEffect, useCallback } from 'react';

/**
 * Lienzo de firma manuscrita; devuelve data URL PNG al guardar.
 */
export default function PsicologiaSignaturePad({ width = 320, height = 120, onChange, disabled }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);

  const getCtx = () => canvasRef.current?.getContext('2d');

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = '#1e3a5f';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
  }, [width, height]);

  const pos = (e) => {
    const c = canvasRef.current;
    const r = c.getBoundingClientRect();
    const x = (e.clientX - r.left) * (c.width / r.width);
    const y = (e.clientY - r.top) * (c.height / r.height);
    return { x, y };
  };

  const start = (e) => {
    if (disabled) return;
    drawing.current = true;
    const ctx = getCtx();
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const move = (e) => {
    if (!drawing.current || disabled) return;
    const ctx = getCtx();
    const { x, y } = pos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const end = useCallback(() => {
    if (!drawing.current) return;
    drawing.current = false;
    const c = canvasRef.current;
    if (c && onChange) onChange(c.toDataURL('image/png'));
  }, [onChange]);

  const clear = () => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    if (onChange) onChange('');
  };

  return (
    <div className="psi-sig-wrap">
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="psi-sig-canvas"
        style={{ opacity: disabled ? 0.5 : 1, touchAction: 'none' }}
        onMouseDown={start}
        onMouseMove={move}
        onMouseUp={end}
        onMouseLeave={end}
      />
      <button type="button" className="psi-sig-clear" onClick={clear} disabled={disabled}>
        Limpiar firma
      </button>
    </div>
  );
}
