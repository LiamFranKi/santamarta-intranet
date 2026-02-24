import React from 'react';
import './EventoDetalleModal.css';

// Función para crear fecha desde string interpretándola como hora local (no UTC)
const crearFechaLocal = (fechaString) => {
  if (!fechaString) return null;
  
  // Si es un objeto Date, extraer componentes y recrear en hora local
  if (fechaString instanceof Date) {
    const year = fechaString.getFullYear();
    const month = fechaString.getMonth();
    const day = fechaString.getDate();
    const hours = fechaString.getHours();
    const minutes = fechaString.getMinutes();
    const seconds = fechaString.getSeconds();
    return new Date(year, month, day, hours, minutes, seconds);
  }
  
  // Si viene como string "YYYY-MM-DD HH:mm:ss" o "YYYY-MM-DDTHH:mm:ss"
  // Extraer componentes y crear fecha en hora local
  const fechaPart = fechaString.toString().replace('T', ' ').split(' ')[0];
  const horaPart = fechaString.toString().replace('T', ' ').split(' ')[1] || '00:00:00';
  
  const [year, month, day] = fechaPart.split('-').map(Number);
  const [hours, minutes, seconds] = horaPart.split(':').map(Number);
  
  // Crear fecha en hora local (no UTC)
  return new Date(year, month - 1, day, hours || 0, minutes || 0, seconds || 0);
};

function EventoDetalleModal({ evento, tipo, onClose }) {
  if (!evento) return null;

  const getFechaEvento = () => {
    if (tipo === 'examen') {
      return evento.fecha_desde ? crearFechaLocal(evento.fecha_desde) : null;
    } else if (tipo === 'tarea') {
      // Las tareas tienen fecha_entrega (NO fecha_fin)
      return evento.fecha_entrega ? crearFechaLocal(evento.fecha_entrega) : null;
    } else if (tipo === 'actividad') {
      return evento.fecha_inicio ? crearFechaLocal(evento.fecha_inicio) : null;
    }
    return null;
  };

  const fechaEvento = getFechaEvento();
  const fechaFin = tipo === 'actividad' && evento.fecha_fin ? crearFechaLocal(evento.fecha_fin) : null;

  return (
    <div className="evento-detalle-modal-overlay" onClick={onClose}>
      <div className="evento-detalle-modal" onClick={(e) => e.stopPropagation()}>
        <div className={`evento-detalle-modal-header evento-tipo-${tipo}`}>
          <h2>
            {tipo === 'examen' && '📋 Examen'}
            {tipo === 'tarea' && '📝 Proyecto'}
            {tipo === 'actividad' && '📅 Actividad'}
          </h2>
          <button className="evento-detalle-modal-close" onClick={onClose}>✕</button>
        </div>
        
        <div className="evento-detalle-modal-body">
          {/* Título/Descripción */}
          <div className="evento-detalle-item">
            <span className="evento-detalle-icon">📌</span>
            <div className="evento-detalle-content">
              <strong>Título:</strong>
              <span>
                {tipo === 'examen' && (evento.titulo || 'Examen')}
                {tipo === 'tarea' && (evento.titulo || evento.descripcion || 'Proyecto')}
                {tipo === 'actividad' && (evento.descripcion || 'Actividad')}
              </span>
            </div>
          </div>

          {/* Fecha */}
          {fechaEvento && (
            <div className="evento-detalle-item">
              <span className="evento-detalle-icon">📅</span>
              <div className="evento-detalle-content">
                <strong>
                  {tipo === 'examen' && 'Fecha del Examen:'}
                  {tipo === 'tarea' && 'Fecha Límite:'}
                  {tipo === 'actividad' && 'Fecha:'}
                </strong>
                <span>
                  {fechaEvento.toLocaleDateString('es-PE', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric'
                  })}
                  {fechaFin && tipo === 'actividad' && fechaEvento.getTime() !== fechaFin.getTime() && (
                    <> - {fechaFin.toLocaleDateString('es-PE', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric'
                    })}</>
                  )}
                </span>
              </div>
            </div>
          )}

          {/* Hora (solo para actividades, NO para exámenes) */}
          {tipo === 'actividad' && evento.fecha_inicio && fechaEvento && (
            <div className="evento-detalle-item">
              <span className="evento-detalle-icon">🕐</span>
              <div className="evento-detalle-content">
                <strong>Hora:</strong>
                <span>
                  {fechaEvento.toLocaleTimeString('es-PE', {
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                  {fechaFin && (
                    <> - {fechaFin.toLocaleTimeString('es-PE', {
                      hour: '2-digit',
                      minute: '2-digit'
                    })}</>
                  )}
                </span>
              </div>
            </div>
          )}

          {/* Tiempo de duración (para exámenes) */}
          {tipo === 'examen' && evento.tiempo && evento.tiempo > 0 && (
            <div className="evento-detalle-item">
              <span className="evento-detalle-icon">⏱️</span>
              <div className="evento-detalle-content">
                <strong>Duración:</strong>
                <span>{evento.tiempo} minutos</span>
              </div>
            </div>
          )}

          {/* Asignatura (para exámenes y tareas) */}
          {(tipo === 'examen' || tipo === 'tarea') && evento.asignatura_nombre && (
            <div className="evento-detalle-item">
              <span className="evento-detalle-icon">📚</span>
              <div className="evento-detalle-content">
                <strong>Asignatura:</strong>
                <span>{evento.asignatura_nombre}</span>
              </div>
            </div>
          )}

          {/* Grupo (solo para actividades, NO para exámenes ni tareas) */}
          {tipo === 'actividad' && (evento.grado || evento.seccion) && (
            <div className="evento-detalle-item">
              <span className="evento-detalle-icon">👥</span>
              <div className="evento-detalle-content">
                <strong>Grupo:</strong>
                <span>
                  {evento.nivel_nombre && `${evento.nivel_nombre} `}
                  {evento.grado && `${evento.grado}°`}
                  {evento.seccion && ` ${evento.seccion}`}
                </span>
              </div>
            </div>
          )}

          {/* Docente (para exámenes y tareas) */}
          {(tipo === 'examen' || tipo === 'tarea') && evento.docente_nombre && (
            <div className="evento-detalle-item">
              <span className="evento-detalle-icon">👨‍🏫</span>
              <div className="evento-detalle-content">
                <strong>Docente:</strong>
                <span>{evento.docente_nombre}</span>
              </div>
            </div>
          )}


          {/* Archivo PDF (para exámenes tipo PDF) */}
          {tipo === 'examen' && evento.tipo === 'PDF' && evento.archivo_pdf && (
            <div className="evento-detalle-item">
              <span className="evento-detalle-icon">📄</span>
              <div className="evento-detalle-content">
                <strong>Archivo PDF:</strong>
                <span>
                  <a 
                    href={evento.archivo_pdf.startsWith('http') 
                      ? evento.archivo_pdf 
                      : `https://nuevo.vanguardschools.edu.pe/Static/Archivos/${evento.archivo_pdf}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: '#4a83c1', textDecoration: 'underline' }}
                  >
                    Ver PDF
                  </a>
                </span>
              </div>
            </div>
          )}

          {/* Lugar (para actividades) */}
          {tipo === 'actividad' && evento.lugar && (
            <div className="evento-detalle-item">
              <span className="evento-detalle-icon">📍</span>
              <div className="evento-detalle-content">
                <strong>Lugar:</strong>
                <span>{evento.lugar}</span>
              </div>
            </div>
          )}

          {/* Detalles/Descripción */}
          {((tipo === 'actividad' && evento.detalles) || (tipo === 'tarea' && evento.descripcion) || (tipo === 'examen' && evento.descripcion)) && (
            <div className="evento-detalle-item evento-detalle-detalles">
              <span className="evento-detalle-icon">📝</span>
              <div className="evento-detalle-content">
                <strong>{tipo === 'examen' ? 'Descripción:' : 'Detalles:'}</strong>
                <p>
                  {tipo === 'actividad' && evento.detalles}
                  {tipo === 'tarea' && evento.descripcion}
                  {tipo === 'examen' && evento.descripcion}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default EventoDetalleModal;

