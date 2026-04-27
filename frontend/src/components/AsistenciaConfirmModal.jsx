import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import './AsistenciaConfirmModal.css';

function IconShirt() {
  return (
    <svg className="asistencia-confirm-modal__svg" viewBox="0 0 64 64" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M18 24l6-8h16l6 8v4l-4 2v20H22V30l-4-2v-4z M26 20h12 M40 32h6v6h-6"
      />
    </svg>
  );
}

function IconHair() {
  return (
    <svg className="asistencia-confirm-modal__svg" viewBox="0 0 64 64" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M32 28c-8 0-14-5-14-12 0-6 5-11 14-14 9 3 14 8 14 14 0 7-6 12-14 12z M20 40c0 10 5 16 12 16s12-6 12-16"
      />
    </svg>
  );
}

/**
 * Modal de confirmación de asistencia con descuentos opcionales por presentación (solo alumnos, entrada).
 */
export default function AsistenciaConfirmModal({
  open,
  usuario,
  tipoRegistro,
  processing,
  onCancel,
  onConfirm
}) {
  const [uniforme, setUniforme] = useState(false);
  const [cabello, setCabello] = useState(false);

  useEffect(() => {
    if (open) {
      setUniforme(false);
      setCabello(false);
    }
  }, [open, usuario?.usuario_id]);

  if (!open || !usuario) return null;

  const esEntrada = tipoRegistro === 'ENTRADA';
  const esAlumno = usuario.tipo === 'ALUMNO';
  const mostrarPresentacion = esEntrada && esAlumno;

  const tipoTexto = tipoRegistro === 'ENTRADA' ? 'Entrada' : 'Salida';
  const tituloIcono = tipoRegistro === 'ENTRADA' ? '✅' : '👋';

  const toggle = (key) => {
    if (key === 'UNIFORME') setUniforme((v) => !v);
    if (key === 'CABELLO') setCabello((v) => !v);
  };

  const handleConfirm = () => {
    const descuentos = [];
    if (mostrarPresentacion) {
      if (uniforme) descuentos.push('UNIFORME');
      if (cabello) descuentos.push('CABELLO');
    }
    onConfirm(descuentos);
  };

  const modalContent = (
    <div
      className="asistencia-confirm-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="asistencia-confirm-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !processing) onCancel();
      }}
    >
      <div className="asistencia-confirm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="asistencia-confirm-modal__header">
          <h2 id="asistencia-confirm-title" className="asistencia-confirm-modal__title">
            {tituloIcono} {tipoTexto}
          </h2>
        </div>

        <div className="asistencia-confirm-modal__body">
          <div className="asistencia-confirm-modal__datos">
            <p>
              <strong>Nombre:</strong> {usuario.nombres} {usuario.apellidos}
            </p>
            <p>
              <strong>Tipo:</strong> {usuario.tipo}
            </p>
            <p>
              <strong>DNI:</strong> {usuario.nro_documento || 'N/A'}
            </p>
          </div>

          {mostrarPresentacion && (
            <div className="asistencia-confirm-modal__presentacion">
              <p className="asistencia-confirm-modal__presentacion-title">Descontar por presentación escolar</p>
              <p className="asistencia-confirm-modal__presentacion-hint">
                Opcional: toca solo si aplica. Puedes elegir uno o ambos antes de registrar.
              </p>
              <div className="asistencia-confirm-modal__botones-grid">
                <button
                  type="button"
                  className={`asistencia-confirm-modal__btn-moto asistencia-confirm-modal__btn--uniforme ${uniforme ? 'is-active' : ''}`}
                  onClick={() => toggle('UNIFORME')}
                  disabled={processing}
                  aria-pressed={uniforme}
                >
                  <span className="asistencia-confirm-modal__btn-icon-wrap" aria-hidden="true">
                    <IconShirt />
                  </span>
                </button>
                <button
                  type="button"
                  className={`asistencia-confirm-modal__btn-moto asistencia-confirm-modal__btn--cabello ${cabello ? 'is-active' : ''}`}
                  onClick={() => toggle('CABELLO')}
                  disabled={processing}
                  aria-pressed={cabello}
                >
                  <span className="asistencia-confirm-modal__btn-icon-wrap" aria-hidden="true">
                    <IconHair />
                  </span>
                </button>
              </div>
              <div className="asistencia-confirm-modal__labels-row">
                <span className="asistencia-confirm-modal__label-text">Uniforme −1</span>
                <span className="asistencia-confirm-modal__label-text">Cabello −1</span>
              </div>
            </div>
          )}
        </div>

        <div className="asistencia-confirm-modal__footer">
          <button
            type="button"
            className="asistencia-confirm-modal__btn-secondary"
            onClick={onCancel}
            disabled={processing}
          >
            Cancelar
          </button>
          <button
            type="button"
            className={
              tipoRegistro === 'ENTRADA'
                ? 'asistencia-confirm-modal__btn-primary asistencia-confirm-modal__btn-primary--entrada'
                : 'asistencia-confirm-modal__btn-primary asistencia-confirm-modal__btn-primary--salida'
            }
            onClick={handleConfirm}
            disabled={processing}
          >
            {processing ? 'Registrando…' : `Registrar ${tipoTexto}`}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
