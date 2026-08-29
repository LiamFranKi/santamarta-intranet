import React, { useCallback, useEffect, useRef, useState } from 'react';
import api from '../../services/api';

const COLORES = ['#0f172a', '#dc2626', '#2563eb', '#16a34a', '#d97706', '#7c3aed', '#ffffff'];

function parseStrokes(raw) {
  if (!raw) return [];
  try {
    const v = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export default function ReunionPizarra({ reunionId, inicial, soloLectura, onCerrar, onGuardada }) {
  const canvasRef = useRef(null);
  const [strokes, setStrokes] = useState(() => parseStrokes(inicial));
  const [tool, setTool] = useState('lapiz');
  const [color, setColor] = useState('#0f172a');
  const [size, setSize] = useState(3);
  const actual = useRef(null);
  const strokesRef = useRef(strokes);
  const dirty = useRef(false);

  useEffect(() => {
    strokesRef.current = strokes;
  }, [strokes]);

  const redraw = useCallback((list) => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, c.width, c.height);
    (list || []).forEach((s) => {
      if (!s.points || s.points.length < 1) return;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.size || 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalCompositeOperation = s.tool === 'goma' ? 'destination-out' : 'source-over';
      ctx.beginPath();
      if (s.tool === 'rect' && s.points.length >= 2) {
        const a = s.points[0];
        const b = s.points[s.points.length - 1];
        ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
      } else if (s.tool === 'circulo' && s.points.length >= 2) {
        const a = s.points[0];
        const b = s.points[s.points.length - 1];
        const rx = (b.x - a.x) / 2;
        const ry = (b.y - a.y) / 2;
        ctx.ellipse(a.x + rx, a.y + ry, Math.abs(rx), Math.abs(ry), 0, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.moveTo(s.points[0].x, s.points[0].y);
        s.points.forEach((p, i) => {
          if (i) ctx.lineTo(p.x, p.y);
        });
        ctx.stroke();
      }
    });
    ctx.globalCompositeOperation = 'source-over';
  }, []);

  useEffect(() => {
    redraw(strokes);
  }, [strokes, redraw]);

  useEffect(() => {
    if (soloLectura) return undefined;
    const t = setInterval(async () => {
      if (dirty.current) {
        dirty.current = false;
        try {
          await api.patch(`/reuniones/${reunionId}/pizarra`, { json: JSON.stringify(strokesRef.current) });
        } catch {
          dirty.current = true;
        }
        return;
      }
      try {
        const { data } = await api.get(`/reuniones/${reunionId}`);
        const remote = parseStrokes(data.pizarra?.json);
        if (remote.length !== strokesRef.current.length) {
          setStrokes(remote);
        }
      } catch {
        /* silencio */
      }
    }, 2200);
    return () => clearInterval(t);
  }, [reunionId, soloLectura]);

  const punto = (e) => {
    const c = canvasRef.current;
    const r = c.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return {
      x: ((t.clientX - r.left) / r.width) * c.width,
      y: ((t.clientY - r.top) / r.height) * c.height,
    };
  };

  const start = (e) => {
    if (soloLectura) return;
    e.preventDefault();
    const p = punto(e);
    actual.current = { tool, color, size: tool === 'goma' ? 16 : size, points: [p] };
  };

  const move = (e) => {
    if (!actual.current) return;
    e.preventDefault();
    actual.current.points.push(punto(e));
    redraw([...strokesRef.current, actual.current]);
  };

  const end = () => {
    if (!actual.current) return;
    const next = [...strokesRef.current, actual.current];
    actual.current = null;
    setStrokes(next);
    dirty.current = true;
  };

  const deshacer = () => {
    setStrokes((prev) => {
      const n = prev.slice(0, -1);
      dirty.current = true;
      return n;
    });
  };

  const guardarImagen = async () => {
    const c = canvasRef.current;
    try {
      await api.patch(`/reuniones/${reunionId}/pizarra`, { json: JSON.stringify(strokesRef.current) });
      const { data } = await api.post(`/reuniones/${reunionId}/pizarra/guardar`, { imagen: c.toDataURL('image/png') });
      if (onGuardada) onGuardada(data);
    } catch {
      /* el padre muestra error si hace falta */
    }
  };

  return (
    <div className="re-pizarra">
      <div className="re-pizarra-bar">
        <strong>Pizarra</strong>
        {!soloLectura ? (
          <>
            <button type="button" className={tool === 'lapiz' ? 'active' : ''} onClick={() => setTool('lapiz')}>Lápiz</button>
            <button type="button" className={tool === 'rect' ? 'active' : ''} onClick={() => setTool('rect')}>Rectángulo</button>
            <button type="button" className={tool === 'circulo' ? 'active' : ''} onClick={() => setTool('circulo')}>Círculo</button>
            <button type="button" className={tool === 'goma' ? 'active' : ''} onClick={() => setTool('goma')}>Goma</button>
            <span className="re-pizarra-cols">
              {COLORES.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`re-pizarra-col ${color === c ? 'on' : ''}`}
                  style={{ background: c }}
                  onClick={() => { setColor(c); setTool('lapiz'); }}
                  aria-label={c}
                />
              ))}
            </span>
            <input type="range" min="1" max="10" value={size} onChange={(e) => setSize(Number(e.target.value))} />
            <button type="button" onClick={deshacer}>Deshacer</button>
            <button type="button" onClick={guardarImagen}>Guardar</button>
          </>
        ) : null}
        <button type="button" className="re-pizarra-cerrar" onClick={onCerrar}>Cerrar</button>
      </div>
      <canvas
        ref={canvasRef}
        width={1100}
        height={620}
        className="re-pizarra-canvas"
        onMouseDown={start}
        onMouseMove={move}
        onMouseUp={end}
        onMouseLeave={end}
        onTouchStart={start}
        onTouchMove={move}
        onTouchEnd={end}
      />
    </div>
  );
}
