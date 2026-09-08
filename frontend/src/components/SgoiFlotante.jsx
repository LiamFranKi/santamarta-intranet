import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { formatDuracionSeg, instanteMsLima, notificarCambioSgoi, usuarioPuedeSgoi } from '../utils/sgoiFormat';
import './SgoiFlotante.css';

function IconoBitacora({ size = 26 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="5" y="3.5" width="14" height="17" rx="2.4" stroke="currentColor" strokeWidth="1.75" />
      <path d="M9 3.2h6v3.1H9z" fill="currentColor" opacity="0.95" />
      <path d="M8.4 11h7.2M8.4 14.2h5.4M8.4 17.3h4.2" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" />
    </svg>
  );
}

function segundosDesde(inicioAt) {
  const t = instanteMsLima(inicioAt);
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.round((Date.now() - t) / 1000));
}

export default function SgoiFlotante() {
  const { user } = useAuth();
  const visible = usuarioPuedeSgoi(user?.tipo);
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [tick, setTick] = useState(0);
  const [form, setForm] = useState({ titulo: '', nota: '', tipo: 'DESARROLLO', prioridad: 'NORMAL' });
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    if (!visible) return;
    try {
      const { data } = await api.get('/sgoi/me');
      setActivo(data?.activo || null);
    } catch (e) {
      if (e?.response?.data?.code === 'SGOI_NO_TABLE') {
        setActivo(null);
      }
    }
  }, [visible]);

  useEffect(() => {
    cargar();
    const onChange = () => cargar();
    window.addEventListener('sgoi-changed', onChange);
    window.addEventListener('focus', onChange);
    return () => {
      window.removeEventListener('sgoi-changed', onChange);
      window.removeEventListener('focus', onChange);
    };
  }, [cargar]);

  useEffect(() => {
    if (!activo) return undefined;
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [activo]);

  useEffect(() => {
    if (activo) {
      setForm((prev) => ({
        ...prev,
        titulo: activo.titulo || '',
        tipo: activo.tipo || 'DESARROLLO',
        prioridad: activo.prioridad || 'NORMAL',
      }));
    }
  }, [activo]);

  const transcurrido = useMemo(
    () => (activo ? segundosDesde(activo.inicio_at) : 0),
    [activo, tick]
  );

  if (!visible) return null;

  const iniciarCaso = async () => {
    setError('');
    setCargando(true);
    try {
      const { data } = await api.post('/sgoi/casos/iniciar', {});
      setActivo(data?.activo || null);
      setAbierto(true);
      notificarCambioSgoi();
    } catch (e) {
      setError(e?.response?.data?.error || 'No se pudo iniciar.');
      if (e?.response?.data?.activo) setActivo(e.response.data.activo);
    } finally {
      setCargando(false);
    }
  };

  const cerrar = async (estado) => {
    const nota = String(form.nota || '').trim();
    if (!nota) {
      setError('Escribe qué pasó o qué hiciste.');
      return;
    }
    setError('');
    setCargando(true);
    try {
      await api.post('/sgoi/activo/cerrar', {
        nota,
        estado,
        titulo: form.titulo,
        tipo: form.tipo,
        prioridad: form.prioridad,
      });
      setActivo(null);
      setForm({ titulo: '', nota: '', tipo: 'DESARROLLO', prioridad: 'NORMAL' });
      setAbierto(false);
      notificarCambioSgoi();
    } catch (e) {
      setError(e?.response?.data?.error || 'No se pudo guardar.');
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="sgoi-float" aria-live="polite">
      {abierto && (
        <div className="sgoi-float-panel">
          {!activo ? (
            <>
              <div className="sgoi-float-head">
                <strong>Atender caso</strong>
                <span>El horario del día sigue en Mi día. Aquí solo se registra la interrupción.</span>
              </div>
              {error ? <div className="sgoi-float-error">{error}</div> : null}
              <div className="sgoi-float-actions">
                <button type="button" className="sgoi-float-btn sgoi-float-btn-caso" disabled={cargando} onClick={iniciarCaso}>
                  Atender caso
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="sgoi-float-head">
                <strong>Caso en curso</strong>
                <span className="sgoi-float-timer">{formatDuracionSeg(transcurrido)} · {activo.codigo}</span>
              </div>
              {error ? <div className="sgoi-float-error">{error}</div> : null}
              <label className="sgoi-float-label">
                Título
                <input
                  type="text"
                  value={form.titulo}
                  maxLength={200}
                  onChange={(e) => setForm((p) => ({ ...p, titulo: e.target.value }))}
                  placeholder="Ej. Proyector sin señal"
                />
              </label>
              <label className="sgoi-float-label">
                Prioridad
                <select value={form.prioridad} onChange={(e) => setForm((p) => ({ ...p, prioridad: e.target.value }))}>
                  <option value="NORMAL">Normal</option>
                  <option value="ALTA">Alta</option>
                  <option value="URGENTE">Urgente</option>
                </select>
              </label>
              <label className="sgoi-float-label">
                Qué pasó
                <textarea
                  rows={4}
                  value={form.nota}
                  onChange={(e) => setForm((p) => ({ ...p, nota: e.target.value }))}
                  placeholder="Se resolvió / quedó pendiente / se avanzó…"
                />
              </label>
              <div className="sgoi-float-actions">
                <button type="button" className="sgoi-float-btn sgoi-float-btn-ok" disabled={cargando} onClick={() => cerrar('RESUELTO')}>
                  Resuelto
                </button>
                <button type="button" className="sgoi-float-btn sgoi-float-btn-pend" disabled={cargando} onClick={() => cerrar('PENDIENTE')}>
                  Dejar pendiente
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <button
        type="button"
        className={`sgoi-float-fab ${activo ? 'is-active' : ''} ${abierto ? 'is-open' : ''}`}
        onClick={() => setAbierto((v) => !v)}
        title={activo ? 'Hay algo en curso' : 'Gestión operativa'}
        aria-label={activo ? 'Continuar registro en curso' : 'Abrir gestión operativa'}
      >
        {activo ? (
          <span className="sgoi-float-fab-live">
            <span className="sgoi-float-dot" />
            <IconoBitacora size={18} />
            {formatDuracionSeg(transcurrido)}
          </span>
        ) : (
          <IconoBitacora />
        )}
      </button>
    </div>
  );
}
