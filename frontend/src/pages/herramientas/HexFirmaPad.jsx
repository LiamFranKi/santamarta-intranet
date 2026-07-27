import React, { useEffect, useRef, useCallback } from 'react';

/**
 * Pad de firma dibujada (mouse / touch). Expone firma como data URL PNG vía onChange.
 */
export default function HexFirmaPad({ value, onChange, disabled = false, height = 150 }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const last = useRef(null);
  const hasStroke = useRef(false);

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    const w = Math.max(280, Math.floor(parent?.clientWidth || 400));
    const h = height;
    const ratio = window.devicePixelRatio || 1;
    const prev = canvas.toDataURL('image/png');
    canvas.width = w * ratio;
    canvas.height = h * ratio;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.2;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    if (hasStroke.current && prev && prev.startsWith('data:image')) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, w, h);
      };
      img.src = prev;
    }
  }, [height]);

  useEffect(() => {
    resizeCanvas();
    const onResize = () => resizeCanvas();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [resizeCanvas]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !value || !value.startsWith('data:image')) return;
    if (hasStroke.current) return;
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      hasStroke.current = true;
    };
    img.src = value;
  }, [value]);

  const posFromEvent = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const src = e.touches?.[0] || e;
    return {
      x: src.clientX - rect.left,
      y: src.clientY - rect.top
    };
  };

  const emitChange = () => {
    const canvas = canvasRef.current;
    if (!canvas || !onChange) return;
    if (!hasStroke.current) {
      onChange(null);
      return;
    }
    onChange(canvas.toDataURL('image/png'));
  };

  const start = (e) => {
    if (disabled) return;
    e.preventDefault();
    drawing.current = true;
    last.current = posFromEvent(e);
  };

  const move = (e) => {
    if (!drawing.current || disabled) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const p = posFromEvent(e);
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    hasStroke.current = true;
  };

  const end = (e) => {
    if (!drawing.current) return;
    e?.preventDefault?.();
    drawing.current = false;
    last.current = null;
    emitChange();
  };

  const clear = () => {
    if (disabled) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    hasStroke.current = false;
    onChange?.(null);
  };

  return (
    <div className="hex-firma-wrap">
      <div className="hex-firma-pad">
        <canvas
          ref={canvasRef}
          className="hex-firma-canvas"
          onMouseDown={start}
          onMouseMove={move}
          onMouseUp={end}
          onMouseLeave={end}
          onTouchStart={start}
          onTouchMove={move}
          onTouchEnd={end}
        />
      </div>
      <div className="hex-firma-actions">
        <button type="button" className="hex-firma-clear" disabled={disabled} onClick={clear}>
          Limpiar firma
        </button>
        <span className="hex-firma-hint">Firme dentro del recuadro con el dedo o el mouse</span>
      </div>
    </div>
  );
}
