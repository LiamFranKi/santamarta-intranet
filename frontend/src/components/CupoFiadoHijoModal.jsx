import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import api from '../services/api';

function soles(n) {
  return `S/ ${Number(n || 0).toFixed(2)}`;
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
    <div className="modal-overlay" onClick={() => !guardando && onClose()}>
      <div className="modal-content cupo-fiado-modal" onClick={(ev) => ev.stopPropagation()}>
        <div className="modal-header">
          <h2>Cupo de fiado</h2>
          <button type="button" className="modal-close-btn" onClick={onClose} disabled={guardando}>✕</button>
        </div>
        <form className="modal-form" onSubmit={guardar}>
          <p className="cupo-fiado-nombre">{nombre}</p>
          <p className="cupo-fiado-nota">
            Este tope es solo para lo fiado. Un pedido pagado no lo usa. Cuando se paga el fiado, esos soles vuelven a quedar libres.
            Si el colegio también puso un tope, vale el más bajo.
          </p>
          {cargando && <p>Cargando el cupo…</p>}
          {error && <p className="cupo-fiado-error">{error}</p>}
          {aviso && <p className="cupo-fiado-ok">{aviso}</p>}
          {cupo && (
            <>
              <p className="cupo-fiado-debe">
                Hoy debe {soles(cupo.debe_dia)}.
                {colegio.dia_activo ? ` El colegio deja deber hasta ${soles(colegio.dia_monto)} por día.` : ''}
              </p>
              {(colegio.general_activo || cupo.papa?.general_activo) && (
                <p className="cupo-fiado-debe">
                  {cupo.papa?.general_activo ? `Tope general de la familia: debe ${soles(cupo.debe_general_papa)} de ${soles(cupo.papa.general_monto)}. ` : ''}
                  {colegio.general_activo ? `Tope general del colegio: debe ${soles(cupo.debe_general_colegio)} de ${soles(colegio.general_monto)}.` : ''}
                </p>
              )}
              {colegio.pedido_activo && (
                <p className="cupo-fiado-debe">Cada fiado, el colegio deja hasta {soles(colegio.pedido_monto)}.</p>
              )}
              {cupo.editable ? (
                <div className="cupo-fiado-form">
                  <label className="cupo-fiado-check">
                    <input
                      type="checkbox"
                      checked={!!form.dia_activo}
                      onChange={(ev) => setForm({ ...form, dia_activo: ev.target.checked })}
                    />
                    <span>Tope por día</span>
                  </label>
                  {form.dia_activo && (
                    <label className="cupo-fiado-soles">
                      <span>S/</span>
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        value={form.dia_monto}
                        onChange={(ev) => setForm({ ...form, dia_monto: ev.target.value })}
                      />
                    </label>
                  )}
                  <label className="cupo-fiado-check">
                    <input
                      type="checkbox"
                      checked={!!form.general_activo}
                      onChange={(ev) => setForm({ ...form, general_activo: ev.target.checked })}
                    />
                    <span>Tope general</span>
                  </label>
                  {form.general_activo && (
                    <label className="cupo-fiado-soles">
                      <span>S/</span>
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        value={form.general_monto}
                        onChange={(ev) => setForm({ ...form, general_monto: ev.target.value })}
                      />
                    </label>
                  )}
                </div>
              ) : (
                <p className="cupo-fiado-error">No puedes cambiar el tope de este alumno.</p>
              )}
            </>
          )}
          <div className="modal-actions">
            <button type="button" className="btn-cancelar" onClick={onClose} disabled={guardando}>Cerrar</button>
            {cupo?.editable && (
              <button type="submit" className="btn-guardar" disabled={guardando || cargando}>
                {guardando ? 'Guardando…' : 'Guardar límite de mi hijo'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
