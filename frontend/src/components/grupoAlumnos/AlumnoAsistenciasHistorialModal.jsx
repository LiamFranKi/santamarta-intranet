import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import '../../pages/DocenteTutoria.css';
import '../../pages/DocenteHijos.css';
import './AlumnoAsistenciasHistorialModal.css';
import {
  agruparAsistenciasPorMes,
  colorTipoAsistencia,
  etiquetaTipoAsistencia,
  LEYENDA_TIPOS_ASISTENCIA,
} from '../../utils/asistenciasAlumnoUi';
import { exportAsistenciasAlumnoMesPdf } from '../../utils/exportAsistenciasAlumnoPdf';

function AsistenciaCard({ asistencia }) {
  const tipoColor = colorTipoAsistencia(asistencia.tipo);
  const fechaStr = (() => {
    try {
      const s = String(asistencia.fecha || '').slice(0, 10);
      const d = s.match(/^\d{4}-\d{2}-\d{2}$/) ? new Date(`${s}T12:00:00`) : new Date(asistencia.fecha);
      return d.toLocaleDateString('es-PE', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch {
      return asistencia.fecha || '—';
    }
  })();

  return (
    <div
      className="asistencia-card"
      style={{
        backgroundColor: tipoColor.bg,
        borderColor: tipoColor.border,
        color: tipoColor.text,
      }}
    >
      <div className="card-header-incidencia">
        <div className="card-fecha">
          <span className="icon" aria-hidden>
            📅
          </span>
          <span>{fechaStr}</span>
        </div>
        <div className="card-tipo-asistencia">
          <span className={`badge-tipo badge-${String(asistencia.tipo || '').toLowerCase()}`}>
            {etiquetaTipoAsistencia(asistencia.tipo)}
          </span>
        </div>
      </div>
      <div className="card-body-estrella">
        <div className="card-info-row-labels">
          <span className="label">Entrada:</span>
          {asistencia.hora_salida ? (
            <>
              <span className="separator">|</span>
              <span className="label">Salida:</span>
            </>
          ) : null}
        </div>
        <div className="card-info-row-values">
          <span className="value">{asistencia.hora_entrada || 'N/A'}</span>
          {asistencia.hora_salida ? (
            <>
              <span className="separator">|</span>
              <span className="value">{asistencia.hora_salida}</span>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * Historial de asistencias de un alumno (cabecera estilo tutoría + tarjetas estilo Hijos).
 */
export default function AlumnoAsistenciasHistorialModal({
  open,
  onClose,
  nombreAlumno,
  asistencias,
  loading,
  totalPresentes = 0,
  totalTardanzas = 0,
  totalFaltas = 0,
}) {
  const [filtroMes, setFiltroMes] = useState('TODOS');

  const porMes = useMemo(() => agruparAsistenciasPorMes(asistencias), [asistencias]);
  const meses = useMemo(
    () =>
      Object.keys(porMes).sort((a, b) => {
        try {
          const da = porMes[a][0]?.fecha;
          const db = porMes[b][0]?.fecha;
          return new Date(db) - new Date(da);
        } catch {
          return 0;
        }
      }),
    [porMes]
  );

  const listaFiltrada =
    filtroMes === 'TODOS' ? asistencias : porMes[filtroMes] || [];

  if (!open) return null;

  return createPortal(
    <div
      className="modal-registro-asistencia-overlay"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="modal-registro-asistencia-container modal-registro-asistencia-container--historial"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="alumno-asistencias-historial-title"
      >
        <div className="modal-registro-asistencia-header">
          <h2 id="alumno-asistencias-historial-title">📋 Historial de Asistencia — {nombreAlumno}</h2>
          <button
            type="button"
            className="modal-registro-asistencia-close"
            onClick={onClose}
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        <div className="modal-registro-asistencia-filters modal-registro-asistencia-filters--wrap">
          <div className="alumno-asistencias-leyenda" aria-label="Leyenda de tipos">
            {LEYENDA_TIPOS_ASISTENCIA.map(({ tipo, clase, label }) => (
              <span key={tipo} className={`btn-asistencia-tipo ${clase} active`} style={{ pointerEvents: 'none' }}>
                {label}
              </span>
            ))}
          </div>
        </div>

        <div className="modal-registro-asistencia-historial-body">
          {loading ? (
            <div className="modal-registro-asistencia-loading">
              <div className="loading-spinner" />
              <p>Cargando asistencias...</p>
            </div>
          ) : asistencias.length === 0 ? (
            <div className="empty-state">
              <p>No hay asistencias registradas para este alumno.</p>
            </div>
          ) : (
            <>
              <div className="estadisticas-asistencias">
                <div className="stat-card" style={{ backgroundColor: '#e3f2fd', borderColor: '#2196f3' }}>
                  <span className="stat-label">Presentes</span>
                  <span className="stat-value">{totalPresentes}</span>
                </div>
                <div className="stat-card" style={{ backgroundColor: '#fff3e0', borderColor: '#ff9800' }}>
                  <span className="stat-label">Tardanzas</span>
                  <span className="stat-value">{totalTardanzas}</span>
                </div>
                <div className="stat-card" style={{ backgroundColor: '#ffebee', borderColor: '#f44336' }}>
                  <span className="stat-label">Faltas</span>
                  <span className="stat-value">{totalFaltas}</span>
                </div>
              </div>

              <div className="filtros-exportar-container">
                <div className="filtros-mes">
                  <label htmlFor="filtro-mes-asistencias-alumno">Filtrar por mes:</label>
                  <select
                    id="filtro-mes-asistencias-alumno"
                    className="select-filtro-mes"
                    value={filtroMes}
                    onChange={(e) => setFiltroMes(e.target.value)}
                  >
                    <option value="TODOS">Todos los meses</option>
                    {meses.map((mes) => (
                      <option key={mes} value={mes}>
                        {mes}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="botones-exportar">
                  <button
                    type="button"
                    className="btn-imprimir-asistencia"
                    onClick={() => {
                      if (filtroMes === 'TODOS') {
                        meses.forEach((mes) => {
                          exportAsistenciasAlumnoMesPdf(nombreAlumno, mes, porMes[mes]);
                        });
                      } else {
                        exportAsistenciasAlumnoMesPdf(nombreAlumno, filtroMes, listaFiltrada);
                      }
                    }}
                  >
                    🖨️ {filtroMes === 'TODOS' ? 'Exportar todo a PDF' : 'Exportar mes a PDF'}
                  </button>
                </div>
              </div>

              {filtroMes === 'TODOS' ? (
                meses.map((mes) => (
                  <div key={mes} className="mes-grupo">
                    <div className="mes-header">
                      <h3>{mes}</h3>
                      <button
                        type="button"
                        className="btn-exportar-mes"
                        onClick={() => exportAsistenciasAlumnoMesPdf(nombreAlumno, mes, porMes[mes])}
                      >
                        📄 Exportar PDF
                      </button>
                    </div>
                    <div className="asistencias-grid">
                      {porMes[mes].map((a) => (
                        <AsistenciaCard key={a.id || `${a.fecha}-${a.tipo}`} asistencia={a} />
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <div className="asistencias-grid">
                  {listaFiltrada.map((a) => (
                    <AsistenciaCard key={a.id || `${a.fecha}-${a.tipo}`} asistencia={a} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div className="modal-registro-asistencia-footer modal-registro-asistencia-footer--historial">
          <p className="alumno-asistencias-footer-hint">
            Vista de consulta del historial del alumno. Para registrar asistencia del aula en una fecha, use{' '}
            <strong>Grados → Opciones → Registro de Asistencia</strong>.
          </p>
          <button type="button" className="btn-guardar-asistencias btn-cerrar-historial" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
