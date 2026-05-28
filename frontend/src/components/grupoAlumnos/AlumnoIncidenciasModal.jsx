import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  colorIncidenciaPorIndice,
  formatearFechaIncidencia,
  ordenarIncidenciasRecientes,
} from '../../utils/incidenciasAlumnoUi';
import './AlumnoIncidenciasModal.css';

function IncidenciaResumenCard({ incidencia, index, onVer }) {
  const color = colorIncidenciaPorIndice(index);

  const handleClick = () => onVer(incidencia);
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onVer(incidencia);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      className="incidencia-resumen-card"
      style={{
        backgroundColor: color.bg,
        borderColor: color.border,
        color: color.text,
      }}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      <div className="incidencia-resumen-fecha">
        <span aria-hidden>📅</span>
        <span>{formatearFechaIncidencia(incidencia.created_at)}</span>
      </div>
      <div className="incidencia-resumen-row">
        <span className="label">Docente</span>
        <span className="value">{incidencia.docente_nombre || '—'}</span>
      </div>
      <div className="incidencia-resumen-row">
        <span className="label">Curso</span>
        <span className="value">{incidencia.curso_nombre || '—'}</span>
      </div>
      <div className="incidencia-resumen-footer">
        <span className="incidencia-btn-ver" aria-hidden>
          👁️ Ver detalle
        </span>
      </div>
    </div>
  );
}

function IncidenciaDetalleModal({ incidencia, index, onClose }) {
  if (!incidencia) return null;

  const color = colorIncidenciaPorIndice(index);

  return createPortal(
    <div
      className="modal-incidencia-detalle-overlay"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="modal-incidencia-detalle"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="incidencia-detalle-title"
      >
        <div
          className="modal-incidencia-detalle-header"
          style={{
            background: `linear-gradient(135deg, ${color.border} 0%, ${color.text} 100%)`,
          }}
        >
          <h3 id="incidencia-detalle-title">⚠️ Detalle de incidencia</h3>
          <button
            type="button"
            className="modal-incidencias-alumno-close"
            onClick={onClose}
            aria-label="Cerrar detalle"
          >
            ✕
          </button>
        </div>

        <div className="modal-incidencia-detalle-meta">
          <div className="modal-incidencia-detalle-meta-row">
            <span className="label">Fecha</span>
            <span className="value">{formatearFechaIncidencia(incidencia.created_at)}</span>
          </div>
          <div className="modal-incidencia-detalle-meta-row">
            <span className="label">Docente</span>
            <span className="value">{incidencia.docente_nombre || '—'}</span>
          </div>
          <div className="modal-incidencia-detalle-meta-row">
            <span className="label">Curso</span>
            <span className="value">{incidencia.curso_nombre || '—'}</span>
          </div>
        </div>

        <div className="modal-incidencia-detalle-body">
          <p className="detalle-titulo">Registro del docente</p>
          <p className="modal-incidencia-detalle-descripcion">
            {incidencia.description?.trim() || 'Sin descripción registrada.'}
          </p>
        </div>
      </div>
    </div>,
    document.body
  );
}

/**
 * Grilla de incidencias del alumno + modal de detalle al hacer clic.
 */
export default function AlumnoIncidenciasModal({
  open,
  onClose,
  nombreAlumno,
  incidencias,
  loading,
}) {
  const [detalle, setDetalle] = useState(null);
  const [detalleIndex, setDetalleIndex] = useState(0);

  const lista = useMemo(() => ordenarIncidenciasRecientes(incidencias), [incidencias]);

  useEffect(() => {
    if (!open) {
      setDetalle(null);
      setDetalleIndex(0);
    }
  }, [open]);

  const abrirDetalle = (inc) => {
    const idx = lista.findIndex((i) => i.id === inc.id);
    setDetalleIndex(idx >= 0 ? idx : 0);
    setDetalle(inc);
  };

  if (!open) return null;

  return (
    <>
      {createPortal(
        <div
          className="modal-incidencias-alumno-overlay"
          onClick={onClose}
          role="presentation"
        >
          <div
            className="modal-incidencias-alumno-container"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="alumno-incidencias-title"
          >
            <div className="modal-incidencias-alumno-header">
              <h2 id="alumno-incidencias-title">⚠️ Incidencias — {nombreAlumno}</h2>
              <button
                type="button"
                className="modal-incidencias-alumno-close"
                onClick={onClose}
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>

            <div className="modal-incidencias-alumno-body">
              {loading ? (
                <div className="modal-incidencias-alumno-loading">
                  <p>Cargando incidencias…</p>
                </div>
              ) : lista.length === 0 ? (
                <div className="empty-state">
                  <p>No hay incidencias registradas para este alumno.</p>
                </div>
              ) : (
                <>
                  <p className="modal-incidencias-alumno-count">
                    {lista.length} {lista.length === 1 ? 'incidencia' : 'incidencias'} — haga clic en una
                    tarjeta para ver el detalle
                  </p>
                  <div className="incidencias-alumno-grid">
                    {lista.map((inc, index) => (
                      <IncidenciaResumenCard
                        key={inc.id}
                        incidencia={inc}
                        index={index}
                        onVer={abrirDetalle}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="modal-incidencias-alumno-footer">
              <button type="button" className="btn-cerrar-incidencias" onClick={onClose}>
                Cerrar
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      <IncidenciaDetalleModal
        incidencia={detalle}
        index={detalleIndex}
        onClose={() => setDetalle(null)}
      />
    </>
  );
}
