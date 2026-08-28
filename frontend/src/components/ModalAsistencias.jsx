import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import api from '../services/api';
import './ModalAsistencias.css';

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function fmtFecha(iso) {
  if (!iso) return '—';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  if (!d) return iso;
  return `${d}/${m}/${y}`;
}

function fmtSoles(n) {
  const v = parseFloat(n);
  if (Number.isNaN(v) || v <= 0) return '—';
  return new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency: 'PEN',
    minimumFractionDigits: 2,
  }).format(v);
}

function fmtSolesTotal(n) {
  const v = parseFloat(n);
  const val = Number.isNaN(v) ? 0 : v;
  return new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency: 'PEN',
    minimumFractionDigits: 2,
  }).format(val);
}

function ModalAsistencias({ isOpen, onClose }) {
  const [asistencias, setAsistencias] = useState([]);
  const [loading, setLoading] = useState(false);
  const [mesSeleccionado, setMesSeleccionado] = useState(new Date().getMonth() + 1);
  const [anioSeleccionado, setAnioSeleccionado] = useState(new Date().getFullYear());
  const [resumen, setResumen] = useState(null);

  const cargarAsistencias = useCallback(async () => {
    if (!isOpen) return;

    try {
      setLoading(true);
      const { data } = await api.get('/personal/tardanzas/asistencias', {
        params: { mes: mesSeleccionado, anio: anioSeleccionado },
      });

      setAsistencias(data.asistencias || []);
      setResumen({
        total_minutos_tardanza: data.total_minutos_tardanza || 0,
        total_descuento: data.total_descuento || 0,
        hora_entrada_configurada_fmt: data.hora_entrada_configurada_fmt || '—',
        mes_nombre: data.mes_nombre || MESES[mesSeleccionado - 1],
        tarifa_por_minuto: data.tarifa_por_minuto ?? 0,
        formula_descuento: data.formula_descuento,
      });
    } catch (error) {
      console.error('Error cargando asistencias:', error);
      setAsistencias([]);
      setResumen(null);
    } finally {
      setLoading(false);
    }
  }, [isOpen, mesSeleccionado, anioSeleccionado]);

  useEffect(() => {
    if (isOpen) cargarAsistencias();
  }, [isOpen, cargarAsistencias]);

  if (!isOpen) return null;

  const mesNombre = resumen?.mes_nombre || MESES[mesSeleccionado - 1];

  // Portal a body: el sidebar (z-index 9999) no debe tapar el modal
  return createPortal(
    <div
      className="modal-asistencias-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div
        className="modal-asistencias-container"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-asistencias-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-asistencias-header">
          <h2 id="modal-asistencias-title" className="modal-asistencias-title">
            Detalle de tardanzas — {mesNombre} {anioSeleccionado}
          </h2>
          <button type="button" className="modal-asistencias-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>

        <div className="modal-asistencias-filters">
          <div className="filter-group">
            <label htmlFor="mes-select">Mes</label>
            <select
              id="mes-select"
              value={mesSeleccionado}
              onChange={(e) => setMesSeleccionado(parseInt(e.target.value, 10))}
              className="filter-select"
            >
              {MESES.map((mes, index) => (
                <option key={mes} value={index + 1}>
                  {mes}
                </option>
              ))}
            </select>
          </div>
          <div className="filter-group">
            <label htmlFor="anio-select">Año</label>
            <select
              id="anio-select"
              value={anioSeleccionado}
              onChange={(e) => setAnioSeleccionado(parseInt(e.target.value, 10))}
              className="filter-select"
            >
              {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map((anio) => (
                <option key={anio} value={anio}>
                  {anio}
                </option>
              ))}
            </select>
          </div>
        </div>

        {resumen?.hora_entrada_configurada_fmt && resumen.hora_entrada_configurada_fmt !== '—' && (
          <div className="modal-asistencias-info">
            <span className="info-badge">
              Hora de entrada real: <strong>{resumen.hora_entrada_configurada_fmt}</strong>
              {' · '}
              {resumen.tarifa_por_minuto > 0 ? (
                <>
                  Tarifa: <strong>S/. {Number(resumen.tarifa_por_minuto).toFixed(4)}</strong> por minuto (sueldo ÷ 30 ÷
                  8 ÷ 60)
                </>
              ) : (
                <>
                  Descuento: <strong>S/. 0.00</strong> (sin sueldo en ficha)
                </>
              )}
            </span>
          </div>
        )}

        {loading ? (
          <div className="modal-asistencias-loading">
            <div className="loading-spinner" />
            <p>Cargando detalle…</p>
          </div>
        ) : (
          <>
            <div className="modal-asistencias-summary">
              <div className="summary-card">
                <div className="summary-icon">⏰</div>
                <div className="summary-content">
                  <div className="summary-value">{resumen?.total_minutos_tardanza ?? 0}</div>
                  <div className="summary-label">Minutos de tardanza</div>
                </div>
              </div>
              <div className="summary-card highlight">
                <div className="summary-icon">💰</div>
                <div className="summary-content">
                  <div className="summary-value">{fmtSolesTotal(resumen?.total_descuento ?? 0)}</div>
                  <div className="summary-label">Total descuento</div>
                </div>
              </div>
            </div>

            <div className="modal-asistencias-table-container">
              <table className="modal-asistencias-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Hora entrada real</th>
                    <th>Hora marcación</th>
                    <th>Min. tarde</th>
                    <th>Descuento</th>
                  </tr>
                </thead>
                <tbody>
                  {asistencias.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="no-data">
                        No hay marcaciones registradas para este mes
                      </td>
                    </tr>
                  ) : (
                    asistencias.map((row) => {
                      const min = row.minutos_tardanza || 0;
                      const desc = row.descuento || 0;
                      return (
                        <tr key={row.fecha} className={min > 0 ? 'row-tardanza' : ''}>
                          <td>{fmtFecha(row.fecha)}</td>
                          <td>{row.hora_entrada_real_fmt || '—'}</td>
                          <td>{row.hora_marcacion_fmt || '—'}</td>
                          <td className={min > 0 ? 'text-tardanza' : ''}>{min > 0 ? min : '—'}</td>
                          <td className={desc > 0 ? 'text-descuento' : ''}>{fmtSoles(desc)}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>

              {asistencias.length > 0 && (
                <div className="modal-asistencias-total">
                  <span className="modal-asistencias-total__label">Total descuento</span>
                  <span className="modal-asistencias-total__value">
                    {fmtSolesTotal(resumen?.total_descuento ?? 0)}
                  </span>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}

export default ModalAsistencias;
