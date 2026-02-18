import React, { useState, useEffect } from 'react';
import api from '../services/api';
import './ModalAsistencias.css';

function ModalAsistencias({ isOpen, onClose }) {
  const [asistencias, setAsistencias] = useState([]);
  const [loading, setLoading] = useState(false);
  const [mesSeleccionado, setMesSeleccionado] = useState(new Date().getMonth() + 1);
  const [anioSeleccionado, setAnioSeleccionado] = useState(new Date().getFullYear());
  const [totalMinutosTardanza, setTotalMinutosTardanza] = useState(0);
  const [totalDescuento, setTotalDescuento] = useState(0);
  const [horaEntradaConfigurada, setHoraEntradaConfigurada] = useState(null);

  const meses = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

  const cargarAsistencias = async () => {
    if (!isOpen) return;
    
    try {
      setLoading(true);
      const response = await api.get(`/docente/asistencias`, {
        params: {
          mes: mesSeleccionado,
          anio: anioSeleccionado
        }
      });
      
      setAsistencias(response.data.asistencias || []);
      setTotalMinutosTardanza(response.data.total_minutos_tardanza || 0);
      setTotalDescuento(response.data.total_descuento || 0);
      setHoraEntradaConfigurada(response.data.hora_entrada_configurada || null);
    } catch (error) {
      console.error('Error cargando asistencias:', error);
      setAsistencias([]);
      setTotalMinutosTardanza(0);
      setTotalDescuento(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      cargarAsistencias();
    }
  }, [isOpen, mesSeleccionado, anioSeleccionado]);

  const formatearFecha = (fecha) => {
    if (!fecha) return '';
    const date = new Date(fecha);
    const dia = String(date.getDate()).padStart(2, '0');
    const mes = String(date.getMonth() + 1).padStart(2, '0');
    const año = date.getFullYear();
    return `${dia}-${mes}-${año}`;
  };


  if (!isOpen) return null;

  return (
    <div className="modal-asistencias-overlay" onClick={(e) => {
      if (e.target === e.currentTarget) onClose();
    }}>
      <div className="modal-asistencias-container">
        <div className="modal-asistencias-header">
          <h2 className="modal-asistencias-title">📋 Mis Asistencias</h2>
          <button className="modal-asistencias-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-asistencias-filters">
          <div className="filter-group">
            <label htmlFor="mes-select">Mes:</label>
            <select
              id="mes-select"
              value={mesSeleccionado}
              onChange={(e) => setMesSeleccionado(parseInt(e.target.value))}
              className="filter-select"
            >
              {meses.map((mes, index) => (
                <option key={index + 1} value={index + 1}>
                  {mes}
                </option>
              ))}
            </select>
          </div>
          <div className="filter-group">
            <label htmlFor="anio-select">Año:</label>
            <select
              id="anio-select"
              value={anioSeleccionado}
              onChange={(e) => setAnioSeleccionado(parseInt(e.target.value))}
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

        {horaEntradaConfigurada && (
          <div className="modal-asistencias-info">
            <span className="info-badge">
              ⏰ Hora de entrada configurada: <strong>{horaEntradaConfigurada}</strong>
            </span>
          </div>
        )}

        {loading ? (
          <div className="modal-asistencias-loading">
            <div className="loading-spinner"></div>
            <p>Cargando asistencias...</p>
          </div>
        ) : (
          <>
            <div className="modal-asistencias-summary">
              <div className="summary-card">
                <div className="summary-icon">⏰</div>
                <div className="summary-content">
                  <div className="summary-value">{totalMinutosTardanza}</div>
                  <div className="summary-label">Minutos de Tardanza</div>
                </div>
              </div>
              <div className="summary-card highlight">
                <div className="summary-icon">💰</div>
                <div className="summary-content">
                  <div className="summary-value">
                    {new Intl.NumberFormat('es-PE', {
                      style: 'currency',
                      currency: 'PEN',
                      minimumFractionDigits: 2
                    }).format(totalDescuento)}
                  </div>
                  <div className="summary-label">Total Descuento</div>
                </div>
              </div>
            </div>

            <div className="modal-asistencias-table-container">
              <table className="modal-asistencias-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Hora Entrada</th>
                    <th>Hora Salida</th>
                    <th>Tipo</th>
                    <th>Minutos Tardanza</th>
                    <th>Descuento</th>
                  </tr>
                </thead>
                <tbody>
                  {asistencias.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="no-data">
                        No hay registros de asistencia para este mes
                      </td>
                    </tr>
                  ) : (
                    asistencias.map((asistencia, index) => {
                      const minutosTardanza = asistencia.minutos_tardanza || 0;
                      const descuento = minutosTardanza * 1.00;

                      return (
                        <tr key={index} className={minutosTardanza > 0 ? 'row-tardanza' : ''}>
                          <td>{formatearFecha(asistencia.fecha)}</td>
                          <td>{asistencia.hora_entrada || '-'}</td>
                          <td>{asistencia.hora_salida || '-'}</td>
                          <td>
                            <span className={`badge-tipo badge-${asistencia.tipo_registro?.toLowerCase()}`}>
                              {asistencia.tipo_registro || '-'}
                            </span>
                          </td>
                          <td className={minutosTardanza > 0 ? 'text-tardanza' : ''}>
                            {minutosTardanza > 0 ? `${minutosTardanza} min` : '-'}
                          </td>
                          <td className={descuento > 0 ? 'text-descuento' : ''}>
                            {descuento > 0
                              ? new Intl.NumberFormat('es-PE', {
                                  style: 'currency',
                                  currency: 'PEN',
                                  minimumFractionDigits: 2
                                }).format(descuento)
                              : '-'}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default ModalAsistencias;

