import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import './AsistenciaConfirmModal.css';

/** Polo — cuello, mangas cortas, tapeta con botones y bolsillo; estirado en Y para llenar el cuadrado como el icono de cabello. */
function IconShirt() {
  return (
    <svg
      className="asistencia-confirm-modal__svg asistencia-confirm-modal__svg--shirt"
      viewBox="0 0 100 100"
      overflow="visible"
      aria-hidden="true"
    >
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        transform="translate(50 58) scale(1 1.3) translate(-50 -58)"
      >
        <path d="M20 36 L10 42 L10 90 L90 90 L90 42 L80 36" />
        <path d="M36 36 L50 54 L64 36" />
        <path d="M30 36 Q50 26 70 36" />
        <path d="M20 36 L6 40 L6 58 L20 54" />
        <path d="M80 36 L94 40 L94 58 L80 54" />
        <path d="M50 54 L50 82" />
        <circle cx="50" cy="64" r="2.5" fill="currentColor" stroke="none" />
        <circle cx="50" cy="74" r="2.5" fill="currentColor" stroke="none" />
        <rect x="58" y="56" width="22" height="16" rx="3" ry="3" />
      </g>
    </svg>
  );
}

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
