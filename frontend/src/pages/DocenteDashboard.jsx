import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import api from '../services/api';
import EventoDetalleModal from '../components/EventoDetalleModal';
import PublicacionFormCard from '../components/PublicacionFormCard';
import PublicacionesCardFeed from '../components/PublicacionesCardFeed';
import BirthdayWidget from '../components/BirthdayWidget';
import { normalizeStaticFileUrl } from '../config/staticFiles';
import './DocenteDashboard.css';
import './DocenteGrupos.css';

function gestionPdfFullUrl(rutaRelativa) {
  if (!rutaRelativa) return '';
  const base = (api.defaults.baseURL || '').replace(/\/api\/?$/, '');
  const p = rutaRelativa.startsWith('/') ? rutaRelativa : `/${rutaRelativa}`;
  return `${base}${p}`;
}

function DocenteDashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState(null);
  const [paginaActual, setPaginaActual] = useState(1);
  const [eventoSeleccionado, setEventoSeleccionado] = useState(null);
  const [tipoEventoSeleccionado, setTipoEventoSeleccionado] = useState(null);
  const [mostrarComunicadoHome, setMostrarComunicadoHome] = useState(false);
  const [tieneAsignaciones, setTieneAsignaciones] = useState({
    tiene_grupos: true,
    tiene_cursos: true
  });
  const [refreshPublicaciones, setRefreshPublicaciones] = useState(0);
  const [docsGestion, setDocsGestion] = useState([]);
  const [loadingDocsGestion, setLoadingDocsGestion] = useState(true);

  const cargarDashboard = async () => {
    try {
      setLoading(true);
      const response = await api.get('/docente/dashboard');
      console.log('📊 Dashboard data recibida:', response.data);
      
      // Debug: Log detallado de eventos recibidos
      if (response.data.actividades) {
        console.log('📅 Actividades recibidas:', response.data.actividades.length);
        if (response.data.actividades.length > 0) {
          console.log('📅 Primeras actividades:', response.data.actividades.slice(0, 5).map(a => ({
            id: a.id,
            descripcion: a.descripcion,
            fecha_inicio: a.fecha_inicio,
            fecha_fin: a.fecha_fin,
            año: new Date(a.fecha_inicio).getFullYear()
          })));
        } else {
          console.warn('⚠️ No hay actividades en el dashboard (año activo filtrado)');
        }
      }
      if (response.data.proximosExamenes) {
        console.log('📝 Exámenes recibidos:', response.data.proximosExamenes.length);
        if (response.data.proximosExamenes.length > 0) {
          console.log('📝 Primeros exámenes:', response.data.proximosExamenes.slice(0, 3));
        }
      }
      if (response.data.proximasTareas) {
        console.log('📋 Tareas recibidas:', response.data.proximasTareas.length);
        if (response.data.proximasTareas.length > 0) {
          console.log('📋 Primeras tareas:', response.data.proximasTareas.slice(0, 3));
        }
      }
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
    
    // Cargar información de asignaciones
    const cargarAsignaciones = async () => {
      try {
        const response = await api.get('/docente/tiene-asignaciones');
        setTieneAsignaciones({
          tiene_grupos: response.data.tiene_grupos || false,
          tiene_cursos: response.data.tiene_cursos || false
        });
      } catch (error) {
        console.error('Error cargando asignaciones:', error);
        // En caso de error, mantener valores por defecto (mostrar cards)
        setTieneAsignaciones({
          tiene_grupos: true,
          tiene_cursos: true
        });
      }
    };
    
    cargarAsignaciones();
  }, []);

  useEffect(() => {
    if (location.hash !== '#publicaciones') return;
    const t = window.setTimeout(() => {
      document.getElementById('dashboard-publicaciones')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    }, 300);
    return () => window.clearTimeout(t);
  }, [location.hash, location.pathname, loading]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get('/docente/documentos-gestion');
        if (!cancelled) setDocsGestion(res.data.documentos || []);
      } catch {
        if (!cancelled) setDocsGestion([]);
      } finally {
        if (!cancelled) setLoadingDocsGestion(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const docsGestionPorCategoria = useMemo(() => {
    const map = new Map();
    (docsGestion || []).forEach((d) => {
      const nombre = d.categoria_nombre || 'General';
      const orden = Number(d.categoria_orden);
      const ordenCat = Number.isFinite(orden) ? orden : 0;
      if (!map.has(nombre)) {
        map.set(nombre, { orden: ordenCat, items: [] });
      }
      const entry = map.get(nombre);
      entry.items.push(d);
      entry.orden = Math.min(entry.orden, ordenCat);
    });
    return Array.from(map.entries())
      .sort((a, b) => a[1].orden - b[1].orden || a[0].localeCompare(b[0], 'es'))
      .map(([nombre, v]) => ({ nombre, orden: v.orden, items: v.items }));
  }, [docsGestion]);

  // Extraer datos del dashboard (con valores por defecto para evitar errores)
  const { docente, estadisticas, proximosExamenes, proximasTareas, actividades, comunicadoHome } = dashboardData || {};

  // Mostrar modal de comunicado home si existe
  useEffect(() => {
    if (comunicadoHome && !loading) {
      // Verificar si ya se mostró este comunicado en esta sesión
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
  // SOLO para usar en "Próximos Eventos" del dashboard
  const crearFechaLima = (fechaString) => {
    if (!fechaString) return null;
    
    // Si es un objeto Date, extraer solo año, mes, día
    if (fechaString instanceof Date) {
      const year = fechaString.getFullYear();
      const month = fechaString.getMonth();
      const day = fechaString.getDate();
      const fecha = new Date(year, month, day);
      fecha.setHours(0, 0, 0, 0);
      return fecha;
    }
    
    // Si viene como string "YYYY-MM-DD" o "YYYY-MM-DD HH:MM:SS"
    // Extraer solo la parte de la fecha (YYYY-MM-DD)
    const fechaPart = fechaString.toString().split('T')[0].split(' ')[0];
    if (!fechaPart || fechaPart === '') return null;
    
    const [year, month, day] = fechaPart.split('-').map(Number);
    if (isNaN(year) || isNaN(month) || isNaN(day)) return null;
    
    // Crear fecha local (sin considerar zona horaria para comparación)
    const fecha = new Date(year, month - 1, day);
    fecha.setHours(0, 0, 0, 0);
    return fecha;
  };

  // Función auxiliar para obtener hoy en Lima (UTC-5)
  // SOLO para usar en "Próximos Eventos" del dashboard
  const getHoyLima = () => {
    try {
      // Obtener la fecha actual en zona horaria de Lima como string YYYY-MM-DD
      const ahora = new Date();
      const hoyLimaString = ahora.toLocaleDateString('en-CA', { 
        timeZone: 'America/Lima'
      });
      
      // Parsear la fecha en formato YYYY-MM-DD
      const [year, month, day] = hoyLimaString.split('-').map(Number);
      if (isNaN(year) || isNaN(month) || isNaN(day)) {
        throw new Error('Error parseando fecha de Lima');
      }
      
      const hoyLima = new Date(year, month - 1, day);
      hoyLima.setHours(0, 0, 0, 0);
      
      // Log para debug
      console.log('🗓️ Fecha de hoy en Lima:', hoyLimaString, '->', hoyLima.toISOString());
      
      return hoyLima;
    } catch (error) {
      console.error('Error obteniendo fecha de Lima:', error);
      // Fallback: usar fecha actual local
      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);
      console.log('🗓️ Usando fecha local como fallback:', hoy.toISOString());
      return hoy;
    }
  };
  
  // Función auxiliar para comparar solo fechas (sin horas) - SOLO para dashboard
  const compararSoloFechas = (fecha1, fecha2) => {
    if (!fecha1 || !fecha2) return false;
    const d1 = new Date(fecha1.getFullYear(), fecha1.getMonth(), fecha1.getDate());
    const d2 = new Date(fecha2.getFullYear(), fecha2.getMonth(), fecha2.getDate());
    return d1.getTime() - d2.getTime();
  };

  // Combinar y ordenar todos los eventos
  // IMPORTANTE: El backend ya filtra por año activo y fecha >= hoy
  // Solo mostramos TODO lo que viene del backend sin restricciones adicionales
  const todosEventos = useMemo(() => {
    const eventos = [];

    // Agregar exámenes (vienen ya filtrados del backend por año activo y fecha >= hoy)
    if (proximosExamenes && Array.isArray(proximosExamenes)) {
      proximosExamenes.forEach(examen => {
        // Usar fecha_desde o fecha_evento si está disponible
        const fechaExamen = crearFechaLima(examen.fecha_desde || examen.fecha_evento);
        if (fechaExamen) {
          eventos.push({
            ...examen,
            tipo: 'examen',
            fecha: fechaExamen
          });
        }
      });
    }

    // Agregar tareas (vienen ya filtradas del backend por año activo y fecha >= hoy)
    if (proximasTareas && Array.isArray(proximasTareas)) {
      proximasTareas.forEach(tarea => {
        // Las tareas tienen fecha_entrega (NO fecha_fin) - vienen de asignaturas_tareas
        const fechaTarea = crearFechaLima(tarea.fecha_entrega || tarea.fecha_evento);
        if (fechaTarea) {
          eventos.push({
            ...tarea,
            tipo: 'tarea',
            fecha: fechaTarea
          });
        }
      });
    }

    // Agregar actividades (vienen ya filtradas del backend por año activo y fecha >= hoy)
    if (actividades && Array.isArray(actividades)) {
      console.log('📅 Procesando actividades para Próximos Eventos:', actividades.length);
      actividades.forEach(actividad => {
        // Usar fecha_inicio o fecha_evento si está disponible
        const fechaActividad = crearFechaLima(actividad.fecha_inicio || actividad.fecha_evento);
        console.log('📅 Actividad procesada:', {
          id: actividad.id,
          descripcion: actividad.descripcion,
          fecha_inicio: actividad.fecha_inicio,
          fecha_evento: actividad.fecha_evento,
          fechaProcesada: fechaActividad ? fechaActividad.toISOString() : 'null'
        });
        if (fechaActividad) {
          eventos.push({
            ...actividad,
            tipo: 'actividad',
            fecha: fechaActividad
          });
        } else {
          console.warn('⚠️ Actividad sin fecha válida:', actividad);
        }
      });
    } else {
      console.warn('⚠️ actividades no es un array válido:', actividades);
    }

    // Ordenar por fecha (más próximos primero)
    const eventosOrdenados = eventos.sort((a, b) => a.fecha - b.fecha);
    
    console.log('📊 Total eventos combinados:', eventosOrdenados.length);
    console.log('📊 Eventos por tipo:', {
      examenes: eventosOrdenados.filter(e => e.tipo === 'examen').length,
      tareas: eventosOrdenados.filter(e => e.tipo === 'tarea').length,
      actividades: eventosOrdenados.filter(e => e.tipo === 'actividad').length
    });
    
    return eventosOrdenados;
  }, [proximosExamenes, proximasTareas, actividades]);

  // Resetear página cuando cambian los eventos
  useEffect(() => {
    setPaginaActual(1);
  }, [todosEventos.length]);

  // Ahora sí, los returns condicionales DESPUÉS de todos los hooks
  if (loading) {
    return (
      <DashboardLayout>
        <div className="docente-dashboard-loading">
          <div className="loading-spinner">Cargando...</div>
        </div>
      </DashboardLayout>
    );
  }

  if (!dashboardData) {
    return (
      <DashboardLayout>
        <div className="docente-dashboard-error">
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

  const truncarTexto = (texto, maxLength = 10) => {
    if (!texto) return '';
    if (texto.length <= maxLength) return texto;
    return texto.substring(0, maxLength) + '...';
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
        return 'Tarea';
      case 'actividad':
        return 'Actividad';
      default:
        return '';
    }
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
      <div className="docente-dashboard">
        {/* Tarjetas de estadísticas */}
        <div className="stats-grid">
          {/* Card Grupos Asignados - Solo mostrar si tiene grupos */}
          {tieneAsignaciones.tiene_grupos && (
            <div 
              className="stat-card mundo-card stat-card-clickable" 
              onClick={() => navigate('/docente/grupos')}
              style={{ cursor: 'pointer', background: coloresPastelesDashboard[0] }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  navigate('/docente/grupos');
                }
              }}
            >
              <div className="stat-icon">🎓</div>
              <div className="stat-content">
                <div className="stat-number">{estadisticas?.gruposAsignados || 0}</div>
                <div className="stat-label">Grupos Asignados</div>
              </div>
            </div>
          )}

          {/* Card Cursos Asignados - Solo mostrar si tiene cursos */}
          {tieneAsignaciones.tiene_cursos && (
            <div 
              className="stat-card mundo-card stat-card-clickable" 
              onClick={() => navigate('/docente/cursos')}
              style={{ cursor: 'pointer', background: coloresPastelesDashboard[1] }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  navigate('/docente/cursos');
                }
              }}
            >
              <div className="stat-icon">📚</div>
              <div className="stat-content">
                <div className="stat-number">{estadisticas?.cursosAsignados || 0}</div>
                <div className="stat-label">Cursos Asignados</div>
              </div>
            </div>
          )}

          {/* Card Estudiantes - Solo mostrar si tiene grupos o cursos */}
          {(tieneAsignaciones.tiene_grupos || tieneAsignaciones.tiene_cursos) && (
            <div className="stat-card mundo-card" style={{ background: coloresPastelesDashboard[2] }}>
              <div className="stat-icon">👥</div>
              <div className="stat-content">
                <div className="stat-number">{estadisticas?.estudiantes || 0}</div>
                <div className="stat-label">Estudiantes</div>
              </div>
            </div>
          )}

          <div className="stat-card mundo-card" style={{ background: coloresPastelesDashboard[3] }}>
            <div className="stat-icon">⏰</div>
            <div className="stat-content">
              <div className="stat-number">{estadisticas?.tardanzasMesActual || 0}</div>
              <div className="stat-label">Tardanzas de {mesActual} (min)</div>
            </div>
          </div>

          <div className="stat-card mundo-card" style={{ background: coloresPastelesDashboard[4] }}>
            <div className="stat-icon">💰</div>
            <div className="stat-content">
              <div className="stat-number">
                {estadisticas?.descuentoMesActual 
                  ? new Intl.NumberFormat('es-PE', {
                      style: 'currency',
                      currency: 'PEN',
                      minimumFractionDigits: 2
                    }).format(estadisticas.descuentoMesActual)
                  : 'S/. 0.00'}
              </div>
              <div className="stat-label">Descuento de {mesActual}</div>
            </div>
          </div>

          <div 
            className="stat-card mundo-card stat-card-clickable" 
            onClick={() => navigate('/docente/mensajes')}
            style={{ cursor: 'pointer', background: coloresPastelesDashboard[5] }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                navigate('/docente/mensajes');
              }
            }}
          >
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
                  const fecha = evento.fecha;
                  const dia = fecha.getDate();
                  const mes = meses[fecha.getMonth()];
                  // Obtener título según el tipo de evento
                  let titulo = '';
                  if (evento.tipo === 'examen') {
                    titulo = evento.titulo || 'Examen';
                  } else if (evento.tipo === 'tarea') {
                    // Las tareas tienen 'titulo' en la tabla asignaturas_tareas
                    titulo = evento.titulo || evento.descripcion || 'Tarea';
                  } else if (evento.tipo === 'actividad') {
                    titulo = evento.descripcion || 'Actividad';
                  } else {
                    titulo = 'Evento';
                  }
                  
                  // Obtener información del grupo (grado, sección, nivel) para tareas y exámenes
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

        {/* Herramientas — debajo de Próximos Eventos */}
        <div className="dashboard-section docs-gestion-wrap">
          <div className="docs-gestion-hero mundo-card">
            <div className="docs-gestion-hero-inner">
              <div className="docs-gestion-hero-icon" aria-hidden="true">
                📑
              </div>
              <div className="docs-gestion-hero-text">
                <h2 className="section-title docs-gestion-hero-title">Herramientas</h2>
                <p className="docs-gestion-hero-sub">
                  Documentos institucionales disponibles para tu perfil. Abre cada PDF en una nueva pestaña.
                </p>
              </div>
            </div>
          </div>

          {loadingDocsGestion ? (
            <div className="docs-gestion-loading mundo-card">
              <div className="docs-gestion-skeleton-row" />
              <div className="docs-gestion-skeleton-row short" />
              <div className="docs-gestion-skeleton-row" />
            </div>
          ) : docsGestionPorCategoria.length === 0 ? (
            <div className="docs-gestion-empty mundo-card">
              <span className="docs-gestion-empty-icon" aria-hidden="true">📭</span>
              <p>No hay documentos de gestión asignados a tu perfil por ahora.</p>
            </div>
          ) : (
            <div className="docs-gestion-categorias">
              {docsGestionPorCategoria.map((grupo, gi) => (
                <div
                  key={grupo.nombre}
                  className={`docs-gestion-categoria mundo-card docs-gestion-categoria--tone-${gi % 5}`}
                >
                  <div className="docs-gestion-categoria-head">
                    <div className="docs-gestion-categoria-title-wrap">
                      <span className="docs-gestion-categoria-chip" aria-hidden="true">
                        {grupo.items.length}
                      </span>
                      <h3 className="docs-gestion-categoria-title">{grupo.nombre}</h3>
                    </div>
                    <span className="docs-gestion-categoria-hint">PDF</span>
                  </div>
                  <div className="docs-gestion-doc-grid">
                    {grupo.items.map((d, di) => {
                      const fechaStr = d.fecha_publicacion
                        ? new Date(d.fecha_publicacion).toLocaleDateString('es-PE', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric'
                          })
                        : d.created_at
                          ? new Date(d.created_at).toLocaleDateString('es-PE', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric'
                            })
                          : '';
                      const pastelIdx = (gi * 3 + di) % 6;
                      return (
                        <a
                          key={d.id}
                          className={`docs-gestion-doc-card docs-gestion-doc-card--pastel-${pastelIdx}`}
                          href={gestionPdfFullUrl(d.archivo_url)}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={d.titulo}
                          aria-label={`Ver PDF: ${d.titulo}`}
                        >
                          <div className="docs-gestion-doc-icon-wrap" aria-hidden="true">
                            <span className="docs-gestion-doc-icon">PDF</span>
                          </div>
                          <div className="docs-gestion-doc-text">
                            <span className="docs-gestion-doc-titulo">{d.titulo}</span>
                            {fechaStr ? (
                              <span className="docs-gestion-doc-meta">{fechaStr}</span>
                            ) : null}
                          </div>
                          <span className="docs-gestion-doc-view" aria-hidden="true">
                            <svg
                              className="docs-gestion-doc-view-svg"
                              viewBox="0 0 24 24"
                              fill="none"
                              xmlns="http://www.w3.org/2000/svg"
                            >
                              <path
                                d="M1 12s4.5-7 11-7 11 7 11 7-4.5 7-11 7S1 12 1 12z"
                                stroke="currentColor"
                                strokeWidth="1.65"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                              <circle
                                cx="12"
                                cy="12"
                                r="3.25"
                                stroke="currentColor"
                                strokeWidth="1.65"
                              />
                            </svg>
                          </span>
                        </a>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Card amarillo - Solo en móvil */}
        <div id="dashboard-publicaciones" className="dashboard-section card-amarillo-section">
          <div className="card-amarillo-vacio">
            <h3 className="card-amarillo-title">Publicaciones</h3>
            <div className="card-amarillo-separator"></div>
            <div className="card-amarillo-form-container">
              <PublicacionFormCard onPublicacionCreada={() => setRefreshPublicaciones(prev => prev + 1)} />
            </div>
            <div className="card-amarillo-feed-container">
              <PublicacionesCardFeed refreshTrigger={refreshPublicaciones} />
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

      {/* Widget flotante de cumpleaños (z-index menor que comunicado para evitar conflictos) */}
      <BirthdayWidget comunicadoAbierto={mostrarComunicadoHome} />
    </DashboardLayout>
  );
}

export default DocenteDashboard;



