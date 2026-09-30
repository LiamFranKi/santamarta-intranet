import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import api from '../services/api';

function soles(n) {
  return `S/ ${Number(n || 0).toFixed(2)}`;
}

function FilaTope({ titulo, ayuda, activo, onActivo, monto, onMonto }) {
  return (
    <div className={`cupo-fiado-card ${activo ? 'is-on' : ''}`}>
      <div className="cupo-fiado-card-top">
        <div>
          <strong>{titulo}</strong>
          <p>{ayuda}</p>
        </div>
        <label className="cupo-fiado-switch">
          <input type="checkbox" checked={!!activo} onChange={(ev) => onActivo(ev.target.checked)} />
          <i />
        </label>
      </div>
      {activo && (
        <label className="cupo-fiado-monto">
          <span>S/</span>
          <input
            type="number"
            min="0"
            step="0.5"
            inputMode="decimal"
            value={monto}
            onChange={(ev) => onMonto(ev.target.value)}
          />
        </label>
      )}
    </div>
  );
}

export default function CupoFiadoHijoModal({ alumnoId, nombre, onClose }) {
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [cupo, setCupo] = useState(null);
  const [form, setForm] = useState({
    dia_activo: false,
    dia_monto: 0,
    general_activo: false,
    general_monto: 0,
  });

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    setError('');
    setAviso('');
    api.get('/kiosco/cupo', { params: { alumno_id: alumnoId } })
      .then(({ data }) => {
        if (!vivo) return;
        setCupo(data);
        const papa = data?.papa || {};
        setForm({
          dia_activo: !!papa.dia_activo,
          dia_monto: papa.dia_monto || 0,
          general_activo: !!papa.general_activo,
          general_monto: papa.general_monto || 0,
        });
      })
      .catch((e) => {
        if (!vivo) return;
        setError(e.response?.data?.error || 'No se pudo leer el cupo de fiado.');
      })
      .finally(() => {
        if (vivo) setCargando(false);
      });
    return () => { vivo = false; };
  }, [alumnoId]);

  const guardar = async (e) => {
    e.preventDefault();
    if (!cupo?.editable || guardando) return;
    setGuardando(true);
    setError('');
    setAviso('');
    try {
      const { data } = await api.put('/kiosco/cupo', {
        ...form,
        alumno_id: parseInt(alumnoId, 10),
      });
      setCupo(data);
      setAviso('Listo. El tope de este hijo quedó guardado.');
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo guardar el tope.');
    } finally {
      setGuardando(false);
    }
  };

  const colegio = cupo?.colegio || {};

  return createPortal(
    <div className="modal-overlay cupo-fiado-overlay" onClick={() => !guardando && onClose()}>
      <div className="cupo-fiado-modal" onClick={(ev) => ev.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="cupo-fiado-titulo">
        <div className="modal-header">
          <h2 id="cupo-fiado-titulo">Cupo de fiado</h2>
          <button type="button" className="modal-close-btn" onClick={onClose} disabled={guardando} aria-label="Cerrar">✕</button>
        </div>
        <form className="cupo-fiado-body" onSubmit={guardar}>
          <p className="cupo-fiado-nombre">{nombre}</p>
          <p className="cupo-fiado-nota">
            Solo cuenta lo fiado. Un pedido pagado no usa este tope. Cuando se paga, esos soles vuelven a quedar libres. Si el colegio también puso un tope, vale el más bajo.
          </p>
          {cargando && <p className="cupo-fiado-debe">Cargando el cupo…</p>}
          {error && <p className="cupo-fiado-error">{error}</p>}
          {aviso && <p className="cupo-fiado-ok">{aviso}</p>}
          {cupo && (
            <>
              <div className="cupo-fiado-resumen">
                <span>Hoy debe</span>
                <strong>{soles(cupo.debe_dia)}</strong>
              </div>
              {(colegio.dia_activo || colegio.general_activo || colegio.pedido_activo) && (
                <ul className="cupo-fiado-colegio">
                  {colegio.pedido_activo && <li>Cada fiado, el colegio deja hasta {soles(colegio.pedido_monto)}.</li>}
                  {colegio.dia_activo && <li>Por día, el colegio deja deber hasta {soles(colegio.dia_monto)}.</li>}
                  {colegio.general_activo && (
                    <li>En total, el colegio deja deber hasta {soles(colegio.general_monto)}. Lleva {soles(cupo.debe_general_colegio)}.</li>
                  )}
                </ul>
              )}
              {cupo.editable ? (
                <div className="cupo-fiado-form">
                  <FilaTope
                    titulo="Tope por día"
                    ayuda="Cuánto puede quedar debiendo en un mismo día."
                    activo={form.dia_activo}
                    onActivo={(dia_activo) => setForm({ ...form, dia_activo })}
                    monto={form.dia_monto}
                    onMonto={(dia_monto) => setForm({ ...form, dia_monto })}
                  />
                  <FilaTope
                    titulo="Tope general"
                    ayuda="Cuánto puede quedar debiendo en total, hasta que pague."
                    activo={form.general_activo}
                    onActivo={(general_activo) => setForm({ ...form, general_activo })}
                    monto={form.general_monto}
                    onMonto={(general_monto) => setForm({ ...form, general_monto })}
                  />
                </div>
              ) : (
                <p className="cupo-fiado-error">No puedes cambiar el tope de este alumno.</p>
              )}
            </>
          )}
          <div className="cupo-fiado-actions">
            <button type="button" className="btn-cancelar" onClick={onClose} disabled={guardando}>Cerrar</button>
            {cupo?.editable && (
              <button type="submit" className="btn-guardar" disabled={guardando || cargando}>
                {guardando ? 'Guardando…' : 'Guardar límite'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
