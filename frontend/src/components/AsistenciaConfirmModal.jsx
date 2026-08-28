import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import './AsistenciaConfirmModal.css';

/** Cabeza + orejas + pelo en capas (silueta reconocible “cabello / presentación”). */
function IconHair() {
  return (
    <svg className="asistencia-confirm-modal__svg" viewBox="0 0 100 100" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        {/* Orejas */}
        <path d="M18 50 Q10 46 10 56 Q10 66 20 70" />
        <path d="M82 50 Q90 46 90 56 Q90 66 80 70" />
        {/* Cara / barbilla (interior vacío) */}
        <path d="M20 50 Q18 70 28 78 Q50 86 72 78 Q82 70 80 50" />
        {/* Cuello y hombros */}
        <path d="M32 78 L32 88 M68 78 L68 88 M26 92 H74" />
        {/* Pelo: contorno superior amplio */}
        <path d="M12 48 Q12 18 32 10 Q50 4 68 10 Q88 18 88 48" />
        {/* Mechón / volumen frontal */}
        <path d="M24 38 Q34 20 50 16 Q66 20 76 38" />
        <path d="M30 32 Q42 14 50 12 Q58 14 70 32" />
      </g>
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
  aplicarOlvidoQr = false,
  onCancel,
  onConfirm
}) {
  const [presentacion, setPresentacion] = useState(false);

  useEffect(() => {
    if (open) {
      setPresentacion(false);
    }
  }, [open, usuario?.usuario_id]);

  if (!open || !usuario) return null;

  const esEntrada = tipoRegistro === 'ENTRADA';
  const esAlumno = usuario.tipo === 'ALUMNO';
  const mostrarPresentacion = esEntrada && esAlumno;
  const mostrarOlvidoQr = esEntrada && esAlumno && aplicarOlvidoQr;

  const tipoTexto = tipoRegistro === 'ENTRADA' ? 'Entrada' : 'Salida';
  const tituloIcono = tipoRegistro === 'ENTRADA' ? '✅' : '👋';

  const handleConfirm = () => {
    const descuentos = [];
    if (mostrarOlvidoQr) descuentos.push('OLVIDO_QR');
    if (mostrarPresentacion) {
      if (presentacion) descuentos.push('PRESENTACION');
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

          {mostrarOlvidoQr && (
            <div className="asistencia-confirm-modal__olvido" role="status">
              <strong>Olvido QR.</strong> Al confirmar se descontará conducta por no traer el QR.
              La presentación sigue siendo opcional abajo.
            </div>
          )}

          {mostrarPresentacion && (
            <div className="asistencia-confirm-modal__presentacion">
              <p className="asistencia-confirm-modal__presentacion-title">Descontar por presentación escolar</p>
              <p className="asistencia-confirm-modal__presentacion-hint">
                Opcional: toca solo si aplica.
              </p>
              <div className="asistencia-confirm-modal__botones-grid">
                <button
                  type="button"
                  className={`asistencia-confirm-modal__btn-moto asistencia-confirm-modal__btn--cabello ${presentacion ? 'is-active' : ''}`}
                  onClick={() => setPresentacion((v) => !v)}
                  disabled={processing}
                  aria-pressed={presentacion}
                >
                  <span className="asistencia-confirm-modal__btn-icon-wrap" aria-hidden="true">
                    <IconHair />
                  </span>
                </button>
              </div>
              <div className="asistencia-confirm-modal__labels-row">
                <span className="asistencia-confirm-modal__label-text">Descuento por presentación</span>
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
