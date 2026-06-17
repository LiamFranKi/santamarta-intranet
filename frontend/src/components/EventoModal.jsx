import React, { useState } from 'react';
import './EventoModal.css';
import { crearFechaLima } from '../utils/fechaLima';

function EventoModal({ actividades, fechaSeleccionada, actividadInicial, onClose }) {
  const [actividadSeleccionada, setActividadSeleccionada] = useState(
    actividadInicial || (actividades && actividades.length > 0 ? actividades[0] : null)
  );

  if (!actividades || actividades.length === 0) return null;

  const actividadActual = actividadSeleccionada || actividades[0];

  const fechaInicio = actividadActual ? crearFechaLima(actividadActual.fecha_inicio) : null;
  const fechaFin = actividadActual && actividadActual.fecha_fin ? crearFechaLima(actividadActual.fecha_fin) : null;

  return (
    <div className="evento-modal-overlay" onClick={onClose}>
      <div className="evento-modal" onClick={(e) => e.stopPropagation()}>
        <div className="evento-modal-header">
          <div className="evento-modal-header-content">
            <h2>
              {fechaSeleccionada.toLocaleDateString('es-PE', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric'
              })}
            </h2>
          </div>
          <div className="evento-modal-counter">
            {actividades.length} {actividades.length === 1 ? 'evento' : 'eventos'}
          </div>
          <button className="evento-modal-close" onClick={onClose}>✕</button>
        </div>
        
        <div className="evento-modal-body">
          {/* Lista de todos los eventos del día */}
          <div className="eventos-lista">
            {actividades.map((act, index) => {
              const fechaInicioAct = crearFechaLima(act.fecha_inicio);
              const fechaFinAct = act.fecha_fin ? crearFechaLima(act.fecha_fin) : null;
              const estaSeleccionado = actividadSeleccionada && actividadSeleccionada.id === act.id;
              
              return (
                <div
                  key={act.id}
                  className={`evento-item ${estaSeleccionado ? 'evento-item-seleccionado' : ''}`}
                  onClick={() => setActividadSeleccionada(act)}
                >
                  <div className="evento-item-header">
                    <span className="evento-item-hora">
                      {fechaInicioAct.toLocaleTimeString('es-PE', {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                      {fechaFinAct && (
                        <> - {fechaFinAct.toLocaleTimeString('es-PE', {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}</>
                      )}
                    </span>
                    <h3 className="evento-item-titulo">{act.descripcion || 'Evento'}</h3>
                  </div>
                  
                  {estaSeleccionado && (
                    <div className="evento-item-detalles">
                      {act.lugar && (
                        <div className="evento-detalle-item">
                          <span className="evento-detalle-icon">📍</span>
                          <span>{act.lugar}</span>
                        </div>
                      )}
                      {act.detalles && (
                        <div className="evento-detalle-item">
                          <span className="evento-detalle-icon">📝</span>
                          <p>{act.detalles}</p>
                        </div>
                      )}
                      {fechaInicioAct.getTime() !== (fechaFinAct ? fechaFinAct.getTime() : fechaInicioAct.getTime()) && (
                        <div className="evento-detalle-item">
                          <span className="evento-detalle-icon">📅</span>
                          <span>
                            Hasta: {fechaFinAct.toLocaleDateString('es-PE', {
                              day: 'numeric',
                              month: 'long',
                              year: 'numeric'
                            })}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default EventoModal;
