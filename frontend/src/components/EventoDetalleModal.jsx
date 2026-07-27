import React from 'react';
import { useNavigate } from 'react-router-dom';
import './EventoDetalleModal.css';
import { crearFechaLima } from '../utils/fechaLima';
import { HEX_DOCENTE_BASE, HEX_ROOT } from '../pages/herramientas/hexExamenesPaths';

function EventoDetalleModal({ evento, tipo, onClose }) {
  const navigate = useNavigate();
  if (!evento) return null;

  const esHex = tipo === 'hex_examen';

  const getFechaEvento = () => {
    if (tipo === 'examen') {
      return evento.fecha_desde ? crearFechaLima(evento.fecha_desde) : null;
    }
    if (tipo === 'hex_examen') {
      return evento.fecha_inicio
        ? crearFechaLima(evento.fecha_inicio)
        : evento.fecha_fin
          ? crearFechaLima(evento.fecha_fin)
          : evento.fecha || null;
    }
    if (tipo === 'tarea') {
      return evento.fecha_entrega ? crearFechaLima(evento.fecha_entrega) : null;
    }
    if (tipo === 'actividad') {
      return evento.fecha_inicio ? crearFechaLima(evento.fecha_inicio) : null;
    }
    return null;
  };

  const fechaEvento = getFechaEvento();
  const fechaFin =
    (tipo === 'actividad' || tipo === 'hex_examen') && evento.fecha_fin
      ? crearFechaLima(evento.fecha_fin)
      : null;

  const irAHex = () => {
    let role = '';
    try {
      const u = JSON.parse(localStorage.getItem('user') || '{}');
      role = String(u.tipo || '').toUpperCase();
    } catch {
      role = '';
    }
    const base = role === 'DOCENTE' ? HEX_DOCENTE_BASE : HEX_ROOT;
    onClose?.();
    if (evento.puede_intentar !== false) {
      navigate(`${base}/realizar/${evento.id}`);
    } else {
      navigate(`${base}/resultado/${evento.id}`);
    }
  };

  return (
    <div className="evento-detalle-modal-overlay" onClick={onClose}>
      <div className="evento-detalle-modal" onClick={(e) => e.stopPropagation()}>
        <div className={`evento-detalle-modal-header evento-tipo-${esHex ? 'examen' : tipo}`}>
          <h2>
            {tipo === 'examen' && '📋 Examen'}
            {tipo === 'hex_examen' && '📝 Evaluación (Herramientas)'}
            {tipo === 'tarea' && '📝 Proyecto'}
            {tipo === 'actividad' && '📅 Actividad'}
          </h2>
          <button className="evento-detalle-modal-close" onClick={onClose}>✕</button>
        </div>
        
        <div className="evento-detalle-modal-body">
          <div className="evento-detalle-item">
            <span className="evento-detalle-icon">📌</span>
            <div className="evento-detalle-content">
              <strong>Título:</strong>
              <span>
                {(tipo === 'examen' || tipo === 'hex_examen') && (evento.titulo || 'Examen')}
                {tipo === 'tarea' && (evento.titulo || evento.descripcion || 'Proyecto')}
                {tipo === 'actividad' && (evento.descripcion || 'Actividad')}
              </span>
            </div>
          </div>

          {fechaEvento && (
            <div className="evento-detalle-item">
              <span className="evento-detalle-icon">📅</span>
              <div className="evento-detalle-content">
                <strong>
                  {tipo === 'examen' && 'Fecha del Examen:'}
                  {tipo === 'hex_examen' && (evento.fecha_inicio || evento.fecha_fin ? 'Vigencia:' : 'Disponible:')}
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
                  {fechaFin && fechaEvento.getTime() !== fechaFin.getTime() && (
                    <>
                      {' '}
                      –{' '}
                      {fechaFin.toLocaleDateString('es-PE', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric'
                      })}
                    </>
                  )}
                  {tipo === 'hex_examen' && !evento.fecha_inicio && !evento.fecha_fin && (
                    <> (hasta que se deshabilite)</>
                  )}
                </span>
              </div>
            </div>
          )}

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

          {tipo === 'examen' && evento.tiempo && evento.tiempo > 0 && (
            <div className="evento-detalle-item">
              <span className="evento-detalle-icon">⏱️</span>
              <div className="evento-detalle-content">
                <strong>Duración:</strong>
                <span>{evento.tiempo} minutos</span>
              </div>
            </div>
          )}

          {(tipo === 'examen' || tipo === 'tarea') && evento.asignatura_nombre && (
            <div className="evento-detalle-item">
              <span className="evento-detalle-icon">📚</span>
              <div className="evento-detalle-content">
                <strong>Asignatura:</strong>
                <span>{evento.asignatura_nombre}</span>
              </div>
            </div>
          )}

          {tipo === 'hex_examen' && (
            <div className="evento-detalle-item">
              <span className="evento-detalle-icon">📚</span>
              <div className="evento-detalle-content">
                <strong>Módulo:</strong>
                <span>Herramientas / Evaluaciones</span>
              </div>
            </div>
          )}

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

          {(tipo === 'examen' || tipo === 'tarea') && evento.docente_nombre && (
            <div className="evento-detalle-item">
              <span className="evento-detalle-icon">👨‍🏫</span>
              <div className="evento-detalle-content">
                <strong>Docente:</strong>
                <span>{evento.docente_nombre}</span>
              </div>
            </div>
          )}

          {tipo === 'examen' && evento.tipo === 'PDF' && evento.archivo_pdf && (
            <div className="evento-detalle-item">
              <span className="evento-detalle-icon">📄</span>
              <div className="evento-detalle-content">
                <strong>Archivo PDF:</strong>
                <span>
                  <a 
                    href={evento.archivo_pdf.startsWith('http') 
                      ? evento.archivo_pdf 
                      : `https://sistema.vanguardschools.edu.pe/Static/Archivos/${evento.archivo_pdf}`}
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

          {tipo === 'actividad' && evento.lugar && (
            <div className="evento-detalle-item">
              <span className="evento-detalle-icon">📍</span>
              <div className="evento-detalle-content">
                <strong>Lugar:</strong>
                <span>{evento.lugar}</span>
              </div>
            </div>
          )}

          {((tipo === 'actividad' && evento.detalles) ||
            (tipo === 'tarea' && evento.descripcion) ||
            ((tipo === 'examen' || tipo === 'hex_examen') && evento.descripcion)) && (
            <div className="evento-detalle-item evento-detalle-detalles">
              <span className="evento-detalle-icon">📝</span>
              <div className="evento-detalle-content">
                <strong>{tipo === 'examen' || tipo === 'hex_examen' ? 'Descripción:' : 'Detalles:'}</strong>
                <p>
                  {tipo === 'actividad' && evento.detalles}
                  {tipo === 'tarea' && evento.descripcion}
                  {(tipo === 'examen' || tipo === 'hex_examen') && evento.descripcion}
                </p>
              </div>
            </div>
          )}

          {tipo === 'hex_examen' && (
            <div style={{ marginTop: '1.25rem' }}>
              <button
                type="button"
                onClick={irAHex}
                style={{
                  width: '100%',
                  padding: '0.85rem 1rem',
                  border: 'none',
                  borderRadius: 10,
                  fontWeight: 800,
                  cursor: 'pointer',
                  color: '#fff',
                  background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)'
                }}
              >
                {evento.puede_intentar !== false ? 'Ir a la evaluación' : 'Ver resultado'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default EventoDetalleModal;
