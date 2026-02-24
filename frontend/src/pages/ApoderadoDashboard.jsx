import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import api from '../services/api';
import EventoDetalleModal from '../components/EventoDetalleModal';
import PublicacionesCardFeed from '../components/PublicacionesCardFeed';
import { normalizeStaticFileUrl } from '../config/staticFiles';
import './AlumnoDashboard.css';
import './DocenteGrupos.css';

function ApoderadoDashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState(null);
  const [paginaActual, setPaginaActual] = useState(1);
  const [eventoSeleccionado, setEventoSeleccionado] = useState(null);
  const [tipoEventoSeleccionado, setTipoEventoSeleccionado] = useState(null);
  const [mostrarComunicadoHome, setMostrarComunicadoHome] = useState(false);
  const [hijos, setHijos] = useState([]);
  const [loadingHijos, setLoadingHijos] = useState(false);

  const cargarDashboard = async () => {
    try {
      setLoading(true);
      const response = await api.get('/apoderado/dashboard');
      console.log('📊 Dashboard data recibida:', response.data);
      setDashboardData(response.data);
    } catch (error) {
      console.error('❌ Error cargando dashboard:', error);
      console.error('Error details:', error.response?.data || error.message);
      setDashboardData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarDashboard();
  }, []);

  // Extraer datos del dashboard (con valores por defecto para evitar errores)
  const { apoderado, estadisticas, proximosExamenes, proximasTareas, proximasActividades, comunicadoHome } = dashboardData || {};

  // Mostrar modal de comunicado home si existe
  useEffect(() => {
    if (comunicadoHome && !loading) {
      const comunicadoMostrado = sessionStorage.getItem(`comunicado_home_${comunicadoHome.id}`);
      if (!comunicadoMostrado) {
        setMostrarComunicadoHome(true);
      }
    }
  }, [comunicadoHome, loading]);

  const cerrarComunicadoHome = () => {
    if (comunicadoHome) {
      sessionStorage.setItem(`comunicado_home_${comunicadoHome.id}`, 'true');
    }
    setMostrarComunicadoHome(false);
  };

  const formatearFecha = (fechaHora) => {
    if (!fechaHora) return '';
    const fecha = new Date(fechaHora);
    const dia = String(fecha.getDate()).padStart(2, '0');
    const mes = String(fecha.getMonth() + 1).padStart(2, '0');
    const año = fecha.getFullYear();
    let horas = fecha.getHours();
    const minutos = String(fecha.getMinutes()).padStart(2, '0');
    const ampm = horas >= 12 ? 'PM' : 'AM';
    horas = horas % 12;
    horas = horas ? horas : 12;
    return `${dia}-${mes}-${año} ${String(horas).padStart(2, '0')}:${minutos} ${ampm}`;
  };

  const handleVerArchivo = (archivoUrl) => {
    if (archivoUrl) {
      let urlFinal = archivoUrl.trim();
      
      if (!urlFinal.startsWith('http://') && !urlFinal.startsWith('https://')) {
        urlFinal = normalizeStaticFileUrl(archivoUrl);
      }
      
      if (!urlFinal) {
        alert('Error: No se pudo construir la URL del archivo');
        return;
      }
      
      try {
        const urlObj = new URL(urlFinal);
        const nuevaVentana = window.open(urlObj.href, '_blank', 'noopener,noreferrer');
        
        if (!nuevaVentana) {
          const link = document.createElement('a');
          link.href = urlObj.href;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          document.body.appendChild(link);
          link.click();
          setTimeout(() => {
            document.body.removeChild(link);
          }, 100);
        }
      } catch (error) {
        console.error('Error al procesar URL:', error);
        alert(`Error al abrir el archivo.\nURL: ${urlFinal}\n\nError: ${error.message}`);
      }
    }
  };

  // Obtener el mes actual en español
  const meses = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];
  const mesActual = meses[new Date().getMonth()];

  // Función auxiliar para crear fecha desde string (ignora zona horaria, solo usa fecha)
  const crearFechaLima = (fechaString) => {
    if (!fechaString) return null;
    
    if (fechaString instanceof Date) {
      const year = fechaString.getFullYear();
      const month = fechaString.getMonth();
      const day = fechaString.getDate();
      const fecha = new Date(year, month, day);
      fecha.setHours(0, 0, 0, 0);
      return fecha;
    }
    
    const fechaPart = fechaString.toString().split('T')[0].split(' ')[0];
    if (!fechaPart || fechaPart === '') return null;
    
    const [year, month, day] = fechaPart.split('-').map(Number);
    if (isNaN(year) || isNaN(month) || isNaN(day)) return null;
    
    const fecha = new Date(year, month - 1, day);
    fecha.setHours(0, 0, 0, 0);
    return fecha;
  };

  // Función auxiliar para obtener hoy en Lima (UTC-5)
  const obtenerHoyLima = () => {
    const ahora = new Date();
    const offsetLima = -5 * 60;
    const utc = ahora.getTime() + (ahora.getTimezoneOffset() * 60000);
    const lima = new Date(utc + (offsetLima * 60000));
    lima.setHours(0, 0, 0, 0);
    return lima;
  };

  // Combinar todos los eventos en un solo array
  const todosEventos = useMemo(() => {
    const eventos = [];
    const hoy = obtenerHoyLima();

    // Agregar exámenes
    if (proximosExamenes && Array.isArray(proximosExamenes)) {
      proximosExamenes.forEach(examen => {
        const fecha = crearFechaLima(examen.fecha_desde || examen.fecha_evento);
        const fechaFinal = fecha || new Date('9999-12-31');
        if (!fecha || fecha >= hoy) {
          eventos.push({
            ...examen,
            tipo: 'examen',
            fecha: fechaFinal
          });
        }
      });
    }

    // Agregar tareas
    if (proximasTareas && Array.isArray(proximasTareas)) {
      proximasTareas.forEach(tarea => {
        const fecha = crearFechaLima(tarea.fecha_entrega || tarea.fecha_evento);
        if (fecha && fecha >= hoy) {
          eventos.push({
            ...tarea,
            tipo: 'tarea',
            fecha: fecha
          });
        }
      });
    }

    // Agregar actividades
    if (proximasActividades && Array.isArray(proximasActividades)) {
      proximasActividades.forEach(actividad => {
        const fechaActividad = crearFechaLima(actividad.fecha_inicio || actividad.fecha_evento);
        if (fechaActividad) {
          eventos.push({
            ...actividad,
            tipo: 'actividad',
            fecha: fechaActividad
          });
        }
      });
    }

    // Ordenar por fecha (más próximos primero)
    const eventosOrdenados = eventos.sort((a, b) => a.fecha - b.fecha);
    
    return eventosOrdenados;
  }, [proximosExamenes, proximasTareas, proximasActividades]);

  // Resetear página cuando cambian los eventos
  useEffect(() => {
    setPaginaActual(1);
  }, [todosEventos.length]);

  // Ahora sí, los returns condicionales DESPUÉS de todos los hooks
  if (loading) {
    return (
      <DashboardLayout>
        <div className="alumno-dashboard-loading">
          <div className="loading-spinner">Cargando...</div>
        </div>
      </DashboardLayout>
    );
  }

  if (!dashboardData) {
    return (
      <DashboardLayout>
        <div className="alumno-dashboard-error">
          <p>Error al cargar el dashboard</p>
        </div>
      </DashboardLayout>
    );
  }

  // Paginación: 12 eventos por página
  const eventosPorPagina = 12;
  const totalPaginas = Math.ceil(todosEventos.length / eventosPorPagina);
  const inicio = (paginaActual - 1) * eventosPorPagina;
  const fin = inicio + eventosPorPagina;
  const eventosPagina = todosEventos.slice(inicio, fin);

  const handleEventoClick = (evento, tipo) => {
    setEventoSeleccionado(evento);
    setTipoEventoSeleccionado(tipo);
  };

  const getColorCard = (tipo) => {
    switch (tipo) {
      case 'examen':
        return 'evento-card-examen';
      case 'tarea':
        return 'evento-card-tarea';
      case 'actividad':
        return 'evento-card-actividad';
      default:
        return '';
    }
  };

  const getTipoTexto = (tipo) => {
    switch (tipo) {
      case 'examen':
        return 'Examen';
      case 'tarea':
        return 'Proyecto';
      case 'actividad':
        return 'Actividad';
      default:
        return '';
    }
  };

  // Funciones para abrir modales
  const abrirModalHijos = async () => {
    setLoadingHijos(true);
    try {
      const response = await api.get('/apoderado/hijos');
      setHijos(response.data.hijos || []);
    } catch (error) {
      console.error('Error cargando hijos:', error);
      setHijos([]);
    } finally {
      setLoadingHijos(false);
    }
  };

  const irAMensajes = () => {
    navigate('/apoderado/mensajes');
  };

  const irAHijos = () => {
    navigate('/apoderado/hijos');
  };

  // Colores pasteles distintos para cada card del dashboard
  const coloresPastelesDashboard = [
    'linear-gradient(135deg, #ffe0f0 0%, #ffcce5 100%)', // Rosa pastel
    'linear-gradient(135deg, #e0f7fa 0%, #b2ebf2 100%)', // Cyan pastel
    'linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%)', // Verde pastel
    'linear-gradient(135deg, #fff3e0 0%, #ffe0b2 100%)', // Naranja pastel
    'linear-gradient(135deg, #f3e5f5 0%, #e1bee7 100%)', // Púrpura pastel
    'linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%)', // Azul pastel
    'linear-gradient(135deg, #fce4ec 0%, #f8bbd0 100%)', // Rosa claro pastel
  ];

  return (
    <DashboardLayout>
      <div className="alumno-dashboard">
        {/* Tarjetas de estadísticas */}
        <div className="stats-grid-4">
          <div className="stat-card mundo-card" onClick={irAHijos} style={{ cursor: 'pointer', background: coloresPastelesDashboard[0] }}>
            <div className="stat-icon">👨‍👩‍👧‍👦</div>
            <div className="stat-content">
              <div className="stat-number">{estadisticas?.totalHijos || 0}</div>
              <div className="stat-label">Hijos a Cargo</div>
            </div>
          </div>

          <div className="stat-card mundo-card" style={{ background: coloresPastelesDashboard[1] }}>
            <div className="stat-icon">📚</div>
            <div className="stat-content">
              <div className="stat-number">{estadisticas?.totalCursos || 0}</div>
              <div className="stat-label">Total Cursos</div>
            </div>
          </div>

          <div className="stat-card mundo-card" style={{ background: coloresPastelesDashboard[2] }}>
            <div className="stat-icon">📋</div>
            <div className="stat-content">
              <div className="stat-number">{estadisticas?.totalMatriculas || 0}</div>
              <div className="stat-label">Total Matrículas</div>
            </div>
          </div>

          <div className="stat-card mundo-card" onClick={irAMensajes} style={{ cursor: 'pointer', background: coloresPastelesDashboard[3] }}>
            <div className="stat-icon">✉️</div>
            <div className="stat-content">
              <div className="stat-number">{estadisticas?.mensajesNoLeidos || 0}</div>
              <div className="stat-label">Mensajes No Leídos</div>
            </div>
          </div>
        </div>

        {/* Próximos Eventos */}
        <div className="dashboard-section">
          <h2 className="section-title">📅 Próximos Eventos</h2>
          {todosEventos.length > 0 ? (
            <>
              <div className="eventos-grid">
                {eventosPagina.map((evento, index) => {
                  let fecha = evento.fecha;
                  if (evento.tipo === 'actividad' && evento.fecha_inicio) {
                    const fechaPart = evento.fecha_inicio.toString().split('T')[0].split(' ')[0];
                    if (fechaPart) {
                      const [year, month, day] = fechaPart.split('-').map(Number);
                      if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
                        fecha = new Date(year, month - 1, day);
                        fecha.setHours(0, 0, 0, 0);
                      }
                    }
                  }
                  const dia = fecha.getDate();
                  const mes = meses[fecha.getMonth()];
                  let titulo = '';
                  if (evento.tipo === 'examen') {
                    titulo = evento.titulo || 'Examen';
                  } else if (evento.tipo === 'tarea') {
                    titulo = evento.titulo || evento.descripcion || 'Proyecto';
                  } else if (evento.tipo === 'actividad') {
                    titulo = evento.descripcion || 'Actividad';
                  } else {
                    titulo = 'Evento';
                  }
                  
                  let grupoInfo = '';
                  if ((evento.tipo === 'tarea' || evento.tipo === 'examen') && evento.grado && evento.seccion && evento.nivel_nombre) {
                    grupoInfo = `${evento.grado}° ${evento.seccion} - ${evento.nivel_nombre}`;
                  }
                  
                  return (
                    <div
                      key={`${evento.tipo}-${evento.id}-${index}`}
                      className={`evento-card ${getColorCard(evento.tipo)}`}
                      onClick={() => handleEventoClick(evento, evento.tipo)}
                    >
                      <div className="evento-card-fecha">
                        <span className="evento-card-dia">{dia}</span>
                        <span className="evento-card-mes">{mes}</span>
                      </div>
                      <div className="evento-card-contenido">
                        <h3 className="evento-card-titulo">{titulo}</h3>
                        {grupoInfo && (
                          <span className="evento-card-grupo">{grupoInfo}</span>
                        )}
                        <span className="evento-card-tipo">{getTipoTexto(evento.tipo)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Paginación */}
              {totalPaginas > 1 && (
                <div className="eventos-paginacion">
                  <button
                    className="btn-paginacion"
                    onClick={() => setPaginaActual(prev => Math.max(1, prev - 1))}
                    disabled={paginaActual === 1}
                  >
                    ‹ Anterior
                  </button>
                  <span className="paginacion-info">
                    Página {paginaActual} de {totalPaginas}
                  </span>
                  <button
                    className="btn-paginacion"
                    onClick={() => setPaginaActual(prev => Math.min(totalPaginas, prev + 1))}
                    disabled={paginaActual === totalPaginas}
                  >
                    Siguiente ›
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="empty-state">
              <p>No se encontraron eventos próximos</p>
            </div>
          )}
        </div>

        {/* Card amarillo - Solo en móvil */}
        <div className="dashboard-section card-amarillo-section">
          <div className="card-amarillo-vacio">
            <h3 className="card-amarillo-title">Publicaciones</h3>
            <div className="card-amarillo-separator"></div>
            <div className="card-amarillo-feed-container">
              <PublicacionesCardFeed />
            </div>
          </div>
        </div>
      </div>

      {/* Modal de detalle de evento */}
      {eventoSeleccionado && tipoEventoSeleccionado && (
        <EventoDetalleModal
          evento={eventoSeleccionado}
          tipo={tipoEventoSeleccionado}
          onClose={() => {
            setEventoSeleccionado(null);
            setTipoEventoSeleccionado(null);
          }}
        />
      )}

      {/* Modal de Comunicado Home */}
      {mostrarComunicadoHome && comunicadoHome && createPortal(
        <div 
          className="modal-mensaje-overlay" 
          onClick={cerrarComunicadoHome}
          style={{ zIndex: 100001 }}
        >
          <div 
            className="modal-mensaje-container" 
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-comunicado-home-title"
            style={{ maxWidth: '700px' }}
          >
            <div className="modal-mensaje-header">
              <h2 id="modal-comunicado-home-title">
                📢 Comunicado Importante
              </h2>
              <button
                className="modal-mensaje-close"
                onClick={cerrarComunicadoHome}
                type="button"
                aria-label="Cerrar modal"
              >
                ✕
              </button>
            </div>

            <div className="modal-mensaje-body">
              <div style={{ marginBottom: '1.5rem' }}>
                <h3 style={{ 
                  margin: '0 0 1rem 0', 
                  fontSize: '1.5rem', 
                  color: '#1f2937',
                  fontWeight: '700'
                }}>
                  {comunicadoHome.descripcion}
                </h3>
                {comunicadoHome.contenido && (
                  <div 
                    style={{ 
                      marginBottom: '1rem',
                      color: '#374151',
                      lineHeight: '1.6'
                    }}
                    dangerouslySetInnerHTML={{ __html: comunicadoHome.contenido }}
                  />
                )}
                <div style={{ 
                  fontSize: '0.9rem', 
                  color: '#6b7280',
                  marginTop: '1rem'
                }}>
                  📅 {formatearFecha(comunicadoHome.fecha_hora)}
                </div>
              </div>
              {comunicadoHome.archivo_url && (
                <div style={{ 
                  marginTop: '1.5rem',
                  padding: '1rem',
                  background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)',
                  borderRadius: '10px',
                  border: '2px solid #bae6fd'
                }}>
                  <button
                    onClick={() => handleVerArchivo(comunicadoHome.archivo_url)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      padding: '0.75rem 1.5rem',
                      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '1rem',
                      fontWeight: '600',
                      width: '100%',
                      justifyContent: 'center',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => e.target.style.transform = 'translateY(-2px)'}
                    onMouseLeave={(e) => e.target.style.transform = 'translateY(0)'}
                  >
                    <span style={{ fontSize: '1.2rem' }}>📎</span>
                    Ver Archivo Adjunto
                  </button>
                </div>
              )}
              <div style={{ 
                display: 'flex', 
                justifyContent: 'center', 
                marginTop: '1.5rem' 
              }}>
                <button
                  onClick={cerrarComunicadoHome}
                  style={{
                    padding: '0.75rem 2rem',
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '1rem',
                    fontWeight: '600'
                  }}
                >
                  Entendido
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal Hijos */}
      {loadingHijos && createPortal(
        <div 
          className="modal-mensaje-overlay" 
          style={{ zIndex: 100002 }}
        >
          <div 
            className="modal-mensaje-container" 
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            style={{ maxWidth: '900px', maxHeight: '90vh', overflowY: 'auto' }}
          >
            <div className="modal-mensaje-header">
              <h2>👨‍👩‍👧‍👦 Mis Hijos</h2>
              <button
                className="modal-mensaje-close"
                onClick={() => setLoadingHijos(false)}
                type="button"
                aria-label="Cerrar modal"
              >
                ✕
              </button>
            </div>
            <div className="modal-mensaje-body">
              {loadingHijos ? (
                <div style={{ textAlign: 'center', padding: '2rem' }}>Cargando hijos...</div>
              ) : hijos.length > 0 ? (
                <div style={{ display: 'grid', gap: '1rem' }}>
                  {hijos.map((hijo) => (
                    <div 
                      key={hijo.id}
                      style={{
                        background: 'linear-gradient(145deg, #f0f9ff, #ffffff)',
                        borderRadius: '12px',
                        padding: '1.5rem',
                        border: '2px solid #e0f2fe',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '1.5rem',
                        transition: 'all 0.3s'
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.2rem', color: '#1f2937', fontWeight: '700' }}>
                          {hijo.nombres} {hijo.apellido_paterno} {hijo.apellido_materno}
                        </h3>
                        <div style={{ fontSize: '0.9rem', color: '#6b7280' }}>
                          {hijo.grado}° {hijo.seccion} - {hijo.nivel_nombre}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
                  No tienes hijos registrados
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </DashboardLayout>
  );
}

export default ApoderadoDashboard;

