import React from 'react';
import { createPortal } from 'react-dom';
import '../../pages/DocenteHijos.css';
import NotasDetalladasAsignaturasList from './NotasDetalladasAsignaturasList';
import { exportNotasDetalladasPdf } from '../../utils/exportNotasDetalladasPdf';

/**
 * Modal de notas detalladas (formato Apoderado: indicadores, promedios por criterio, PROMEDIO final).
 */
export default function AlumnoNotasDetalladasModal({
  open,
  onClose,
  nombreAlumno,
  notasDetalladas,
  loading,
  cicloNotas,
  onCicloChange,
}) {
  if (!open) return null;

  const tieneAsignaturas = notasDetalladas?.asignaturas?.length > 0;

  return createPortal(
    <div className="modal-overlay-qr" onClick={onClose} role="presentation">
      <div
        className="modal-content-notas-detalladas"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="alumno-notas-detalladas-title"
      >
        <div className="modal-header-qr">
          <h2 id="alumno-notas-detalladas-title">📊 Notas Registradas — {nombreAlumno}</h2>
          <button type="button" className="modal-close-qr" onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        </div>

        <div className="modal-body-notas-detalladas">
          {loading ? (
            <div className="qr-loading">
              <div className="loading-spinner">Cargando notas…</div>
            </div>
          ) : !tieneAsignaturas ? (
            <div className="empty-state">
              <p>No hay notas registradas</p>
            </div>
          ) : (
            <>
              <div className="notas-detalladas-controls">
                <div className="bimestre-selector">
                  <label htmlFor="select-bimestre-notas-alumno">Bimestre:</label>
                  <select
                    id="select-bimestre-notas-alumno"
                    value={cicloNotas}
                    onChange={(e) => onCicloChange(parseInt(e.target.value, 10))}
                    className="select-bimestre"
                  >
                    <option value={1}>I Bimestre</option>
                    <option value={2}>II Bimestre</option>
                    <option value={3}>III Bimestre</option>
                    <option value={4}>IV Bimestre</option>
                  </select>
                </div>
                <button
                  type="button"
                  className="btn-exportar-notas-detalladas"
                  onClick={() => exportNotasDetalladasPdf(notasDetalladas, cicloNotas)}
                >
                  🖨️ Exportar Notas
                </button>
              </div>

              <div className="alert alert-danger text-center">
                La información mostrada puede no estar completa al 100%, para cualquier consulta comuníquese
                con el administrador.
              </div>

              <NotasDetalladasAsignaturasList
                asignaturas={notasDetalladas.asignaturas}
                cicloSeleccionado={cicloNotas}
              />
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
