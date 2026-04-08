import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import api from '../services/api';
import Swal from 'sweetalert2';
import EventoDetalleModal from '../components/EventoDetalleModal';
import PublicacionesCardFeed from '../components/PublicacionesCardFeed';
import BirthdayWidget from '../components/BirthdayWidget';
import { useAvatarWidget } from '../context/AvatarWidgetContext';
import { normalizeStaticFileUrl } from '../config/staticFiles';
import './AlumnoDashboard.css';
import './DocenteGrupos.css';

function AlumnoDashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const { setAvatarWidget } = useAvatarWidget();
  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState(null);
  const [paginaActual, setPaginaActual] = useState(1);
  const [eventoSeleccionado, setEventoSeleccionado] = useState(null);
  const [tipoEventoSeleccionado, setTipoEventoSeleccionado] = useState(null);
  const [mostrarComunicadoHome, setMostrarComunicadoHome] = useState(false);
  
  // Estados para modales
  const [mostrarModalCursos, setMostrarModalCursos] = useState(false);
  const [mostrarModalDocentes, setMostrarModalDocentes] = useState(false);
  const [mostrarModalMatriculas, setMostrarModalMatriculas] = useState(false);
  const [cursos, setCursos] = useState([]);
  const [docentes, setDocentes] = useState([]);
  const [matriculas, setMatriculas] = useState([]);
  const [loadingCursos, setLoadingCursos] = useState(false);
  const [loadingDocentes, setLoadingDocentes] = useState(false);
  const [loadingMatriculas, setLoadingMatriculas] = useState(false);

  const [modalMensajeTutor, setModalMensajeTutor] = useState(false);
  const [asuntoTutor, setAsuntoTutor] = useState('');
  const [cuerpoMensajeTutor, setCuerpoMensajeTutor] = useState('');
  const [enviandoMensajeTutor, setEnviandoMensajeTutor] = useState(false);
  const [tutorFotoError, setTutorFotoError] = useState(false);

  const cargarDashboard = async () => {
    try {
      setLoading(true);
      const response = await api.get('/alumno/dashboard');
      console.log('📊 Dashboard data recibida:', response.data);
      
      // Debug: Log detallado de eventos recibidos
      if (response.data.proximasActividades) {
        console.log('📅 Actividades recibidas:', response.data.proximasActividades.length);
        if (response.data.proximasActividades.length > 0) {
          console.log('📅 Primeras actividades:', response.data.proximasActividades.slice(0, 5).map(a => ({
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
  }, []);

  useEffect(() => {
    setTutorFotoError(false);
  }, [dashboardData?.tutor?.foto]);

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
    if (dashboardData?.avatar_widget && setAvatarWidget) setAvatarWidget(dashboardData.avatar_widget);
  }, [dashboardData?.avatar_widget, setAvatarWidget]);

  // Extraer datos del dashboard (con valores por defecto para evitar errores)
  const { alumno, matricula, tutor, estadisticas, asignaturas, proximosExamenes, proximasTareas, proximasActividades, comunicadoHome } = dashboardData || {};

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
  // IGUAL QUE EN DOCENTEDASHBOARD - Extrae solo la fecha y crea Date directamente en hora local
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
    // IMPORTANTE: new Date(year, month - 1, day) crea la fecha directamente en hora local
    const fecha = new Date(year, month - 1, day);
    fecha.setHours(0, 0, 0, 0);
    return fecha;
  };

  // Función auxiliar para obtener hoy en Lima (UTC-5)
  const obtenerHoyLima = () => {
    const ahora = new Date();
    // Ajustar a UTC-5 (Lima)
    const offsetLima = -5 * 60; // -5 horas en minutos
    const utc = ahora.getTime() + (ahora.getTimezoneOffset() * 60000);
    const lima = new Date(utc + (offsetLima * 60000));
    // Solo usar la fecha (sin hora) para comparación
    lima.setHours(0, 0, 0, 0);
    return lima;
  };

  // Combinar todos los eventos en un solo array
  const todosEventos = useMemo(() => {
    const eventos = [];
    const hoy = obtenerHoyLima();

    // Agregar exámenes
    if (proximosExamenes && Array.isArray(proximosExamenes)) {
      console.log('📝 Procesando exámenes:', proximosExamenes.length);
      proximosExamenes.forEach(examen => {
        const fecha = crearFechaLima(examen.fecha_desde || examen.fecha_evento);
        // Si no tiene fecha, usar una fecha futura para que aparezca
        const fechaFinal = fecha || new Date('9999-12-31');
        // Incluir si no tiene fecha o si la fecha es >= hoy
        if (!fecha || fecha >= hoy) {
          eventos.push({
            ...examen,
            tipo: 'examen',
            fecha: fechaFinal
          });
          console.log('✅ Examen agregado:', examen.titulo || examen.id, 'fecha:', fechaFinal);
        } else {
          console.log('⚠️ Examen filtrado (fecha pasada):', examen.titulo || examen.id, 'fecha:', fecha);
        }
      });
      console.log('📝 Total exámenes agregados:', eventos.filter(e => e.tipo === 'examen').length);
    } else {
      console.warn('⚠️ proximosExamenes no es un array válido:', proximosExamenes);
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
    } else {
      console.warn('⚠️ proximasTareas no es un array válido:', proximasTareas);
    }

    // Agregar actividades (igual que en DocenteDashboard)
    if (proximasActividades && Array.isArray(proximasActividades)) {
      console.log('📅 Procesando actividades para Próximos Eventos:', proximasActividades.length);
      proximasActividades.forEach(actividad => {
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
          console.log('⚠️ Actividad sin fecha válida:', actividad.id);
        }
      });
      console.log('📅 Total actividades agregadas:', eventos.filter(e => e.tipo === 'actividad').length);
    } else {
      console.warn('⚠️ proximasActividades no es un array válido:', proximasActividades);
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
        return 'Proyecto';
      case 'actividad':
        return 'Actividad';
      default:
        return '';
    }
  };

  // Combinar nombre completo del alumno
  const nombreCompleto = alumno?.nombres && alumno?.apellido_paterno 
    ? `${alumno.nombres} ${alumno.apellido_paterno}${alumno.apellido_materno ? ' ' + alumno.apellido_materno : ''}`
    : alumno?.nombres || 'Alumno';

  // Funciones para abrir modales
  const abrirModalCursos = async () => {
    setMostrarModalCursos(true);
    setLoadingCursos(true);
    try {
      const response = await api.get('/alumno/cursos');
      setCursos(response.data.cursos || []);
    } catch (error) {
      console.error('Error cargando cursos:', error);
      setCursos([]);
    } finally {
      setLoadingCursos(false);
    }
  };

  const abrirModalDocentes = async () => {
    setMostrarModalDocentes(true);
    setLoadingDocentes(true);
    try {
      const response = await api.get('/alumno/docentes');
      setDocentes(response.data.docentes || []);
    } catch (error) {
      console.error('Error cargando docentes:', error);
      setDocentes([]);
    } finally {
      setLoadingDocentes(false);
    }
  };

  const abrirModalMatriculas = async () => {
    setMostrarModalMatriculas(true);
    setLoadingMatriculas(true);
    try {
      const response = await api.get('/alumno/matriculas');
      setMatriculas(response.data.matriculas || []);
    } catch (error) {
      console.error('Error cargando matrículas:', error);
      setMatriculas([]);
    } finally {
      setLoadingMatriculas(false);
    }
  };

  const irAMensajes = () => {
    navigate('/alumno/mensajes');
  };

  const abrirModalMensajeTutor = () => {
    setAsuntoTutor('');
    setCuerpoMensajeTutor('');
    setModalMensajeTutor(true);
  };

  const cerrarModalMensajeTutor = () => {
    if (enviandoMensajeTutor) return;
    setModalMensajeTutor(false);
  };

  const enviarMensajeAlTutor = async () => {
    if (!tutor?.usuario_id || enviandoMensajeTutor) return;
    const asunto = asuntoTutor.trim();
    const texto = cuerpoMensajeTutor.trim();
    if (!asunto) {
      Swal.fire('Error', 'El asunto es obligatorio.', 'error');
      return;
    }
    if (!texto) {
      Swal.fire('Error', 'Escribe el mensaje.', 'error');
      return;
    }
    setEnviandoMensajeTutor(true);
    try {
      const formData = new FormData();
      formData.append('destinatarios', JSON.stringify([tutor.usuario_id]));
      formData.append('asunto', asunto);
      const esc = (s) =>
        s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      formData.append('mensaje', `<p>${esc(texto).replace(/\n/g, '<br/>')}</p>`);

      await api.post('/alumno/mensajes/enviar', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      Swal.fire({
        title: 'Mensaje enviado',
        text: 'Tu tutor recibirá el mensaje en su bandeja.',
        icon: 'success',
        confirmButtonText: 'Aceptar',
      });
      setModalMensajeTutor(false);
      setAsuntoTutor('');
      setCuerpoMensajeTutor('');
      cargarDashboard();
    } catch (err) {
      console.error(err);
      Swal.fire('Error', err.response?.data?.error || 'No se pudo enviar el mensaje.', 'error');
    } finally {
      setEnviandoMensajeTutor(false);
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

  const anioLectivo = matricula?.anio_lectivo ?? new Date().getFullYear();
  const textoUbicacionGrado =
    matricula &&
    [
      matricula.nivel_nombre,
      matricula.grado != null && matricula.grado !== '' ? `${matricula.grado}°` : null,
      matricula.seccion ? `Sección ${matricula.seccion}` : null,
      matricula.turno_nombre ? `${matricula.turno_nombre}` : null
    ]
      .filter(Boolean)
      .join(' · ');

  return (
    <DashboardLayout>
      <div className="alumno-dashboard">
        <div
          className={`alumno-dashboard-top-row${matricula ? '' : ' alumno-dashboard-top-row--solo-aviso'}`}
        >
          <div
            className={`alumno-dashboard-pastel-card alumno-dashboard-pastel-card--aula${matricula ? '' : ' alumno-dashboard-pastel-card--full'}`}
            role="region"
            aria-label="Año y grado escolar"
          >
            {matricula ? (
              <>
                <div className="alumno-dashboard-pastel-card__badge" aria-hidden="true">
                  <span className="alumno-dashboard-pastel-card__badge-label">Año lectivo</span>
                  <span className="alumno-dashboard-pastel-card__badge-year">{anioLectivo}</span>
                </div>
                <div className="alumno-dashboard-pastel-card__body">
                  <p className="alumno-dashboard-pastel-card__kicker">Tu aula este año</p>
                  <p className="alumno-dashboard-pastel-card__line">
                    {textoUbicacionGrado || 'Tu grupo aparecerá aquí cuando la matrícula esté completa.'}
                  </p>
                </div>
              </>
            ) : (
              <div className="alumno-dashboard-pastel-card__body">
                <p className="alumno-dashboard-pastel-card__kicker">Matrícula</p>
                <p className="alumno-dashboard-pastel-card__line alumno-dashboard-pastel-card__line--muted">
                  No hay matrícula activa para el año lectivo {anioLectivo}. Si crees que es un error, avisa en
                  secretaría.
                </p>
              </div>
            )}
          </div>

          {matricula && (
            <div
              className="alumno-dashboard-pastel-card alumno-dashboard-pastel-card--tutor"
              role="region"
              aria-label="Tutor del grupo"
            >
              {tutor?.usuario_id ? (
                <>
                  <div className="alumno-dashboard-tutor__photo-wrap">
                    {tutor.foto && !tutorFotoError ? (
                      <img
                        src={tutor.foto}
                        alt=""
                        className="alumno-dashboard-tutor__photo"
                        onError={() => setTutorFotoError(true)}
                      />
                    ) : (
                      <div className="alumno-dashboard-tutor__photo alumno-dashboard-tutor__photo--placeholder" aria-hidden>
                        👤
                      </div>
                    )}
                  </div>
                  <div className="alumno-dashboard-tutor__info">
                    <p className="alumno-dashboard-pastel-card__kicker">Tutor del grupo</p>
                    <p className="alumno-dashboard-tutor__name">{tutor.nombre_completo}</p>
                    <button
                      type="button"
                      className="alumno-dashboard-tutor__btn-msg"
                      onClick={abrirModalMensajeTutor}
                    >
                      Enviar mensaje
                    </button>
                  </div>
                </>
              ) : (
                <div className="alumno-dashboard-pastel-card__body alumno-dashboard-tutor__empty">
                  <p className="alumno-dashboard-pastel-card__kicker">Tutor del grupo</p>
                  <p className="alumno-dashboard-pastel-card__line alumno-dashboard-pastel-card__line--muted">
                    Aún no hay tutor asignado a tu aula. Consulta en secretaría si necesitas ayuda.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {modalMensajeTutor &&
          tutor?.usuario_id &&
          createPortal(
            <div
              className="alumno-tutor-msg-modal-overlay"
              role="presentation"
              onClick={(e) => e.target === e.currentTarget && cerrarModalMensajeTutor()}
            >
              <div
                className="alumno-tutor-msg-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="alumno-tutor-msg-titulo"
              >
                <div className="alumno-tutor-msg-modal__head">
                  <h2 id="alumno-tutor-msg-titulo">Mensaje al tutor</h2>
                  <button
                    type="button"
                    className="alumno-tutor-msg-modal__close"
                    onClick={cerrarModalMensajeTutor}
                    aria-label="Cerrar"
                  >
                    ×
                  </button>
                </div>
                <p className="alumno-tutor-msg-modal__dest">
                  Para: <strong>{tutor.nombre_completo}</strong>
                </p>
                <label className="alumno-tutor-msg-modal__label">
                  Asunto
                  <input
                    type="text"
                    className="alumno-tutor-msg-modal__input"
                    value={asuntoTutor}
                    onChange={(e) => setAsuntoTutor(e.target.value)}
                    maxLength={200}
                    placeholder="Ej. Consulta sobre el grupo"
                    autoFocus
                  />
                </label>
                <label className="alumno-tutor-msg-modal__label">
                  Mensaje
                  <textarea
                    className="alumno-tutor-msg-modal__textarea"
                    value={cuerpoMensajeTutor}
                    onChange={(e) => setCuerpoMensajeTutor(e.target.value)}
                    rows={5}
                    placeholder="Escribe tu mensaje..."
                  />
                </label>
                <div className="alumno-tutor-msg-modal__actions">
                  <button
                    type="button"
                    className="alumno-tutor-msg-modal__btn-cancel"
                    onClick={cerrarModalMensajeTutor}
                    disabled={enviandoMensajeTutor}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="alumno-tutor-msg-modal__btn-send"
                    onClick={enviarMensajeAlTutor}
                    disabled={enviandoMensajeTutor}
                  >
                    {enviandoMensajeTutor ? 'Enviando…' : 'Enviar'}
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )}

        {/* Tarjetas de estadísticas - 4 columnas */}
        <div className="stats-grid-4">
          <div className="stat-card mundo-card" onClick={abrirModalCursos} style={{ cursor: 'pointer', background: coloresPastelesDashboard[0] }}>
            <div className="stat-icon">📚</div>
            <div className="stat-content">
              <div className="stat-number">{estadisticas?.cursosAsignados || 0}</div>
              <div className="stat-label">Mis Cursos</div>
            </div>
          </div>

          <div className="stat-card mundo-card" onClick={abrirModalDocentes} style={{ cursor: 'pointer', background: coloresPastelesDashboard[1] }}>
            <div className="stat-icon">👨‍🏫</div>
            <div className="stat-content">
              <div className="stat-number">{estadisticas?.totalDocentes || 0}</div>
              <div className="stat-label">Total Docentes</div>
            </div>
          </div>

          <div className="stat-card mundo-card" onClick={abrirModalMatriculas} style={{ cursor: 'pointer', background: coloresPastelesDashboard[2] }}>
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
                  // IMPORTANTE: Para actividades, recrear la fecha desde el string original
                  // para evitar problemas de zona horaria
                  let fecha = evento.fecha;
                  if (evento.tipo === 'actividad' && evento.fecha_inicio) {
                    // Recrear la fecha desde el string original para asegurar que sea correcta
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
                  // Obtener título según el tipo de evento
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
                  
                  // Obtener información del grupo (grado, sección, nivel) para tareas y exámenes
                  let grupoInfo = '';
                  if ((evento.tipo === 'tarea' || evento.tipo === 'examen') && evento.grado && evento.seccion && evento.nivel_nombre) {
                    grupoInfo = `${evento.grado}° ${evento.seccion} - ${evento.nivel_nombre}`;
                  }
                  // Curso (asignatura) y docente: backend los envía en tareas y exámenes
                  const cursoNombre = evento.asignatura_nombre || evento.curso_nombre || '';
                  const docenteNombre = evento.docente_nombre || '';
                  
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
                        {cursoNombre && (
                          <span className="evento-card-curso">📚 {cursoNombre}</span>
                        )}
                        {docenteNombre && (
                          <span className="evento-card-docente">👨‍🏫 {docenteNombre}</span>
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
        <div id="dashboard-publicaciones" className="dashboard-section card-amarillo-section">
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

      {/* Modal Mis Cursos */}
      {mostrarModalCursos && createPortal(
        <div 
          className="modal-mensaje-overlay" 
          onClick={() => setMostrarModalCursos(false)}
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
              <h2>📚 Mis Cursos</h2>
              <button
                className="modal-mensaje-close"
                onClick={() => setMostrarModalCursos(false)}
                type="button"
                aria-label="Cerrar modal"
              >
                ✕
              </button>
            </div>
            <div className="modal-mensaje-body">
              {loadingCursos ? (
                <div style={{ textAlign: 'center', padding: '2rem' }}>Cargando cursos...</div>
              ) : cursos.length > 0 ? (
                <div style={{ display: 'grid', gap: '1rem' }}>
                  {cursos.map((curso) => (
                    <div 
                      key={curso.asignatura_id}
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
                      {curso.curso_imagen_url ? (
                        <img 
                          src={curso.curso_imagen_url} 
                          alt={curso.curso_nombre}
                          style={{
                            width: '60px',
                            height: '60px',
                            borderRadius: '12px',
                            objectFit: 'cover',
                            border: '2px solid #667eea',
                            flexShrink: 0
                          }}
                          onError={(e) => {
                            e.target.style.display = 'none';
                            if (e.target.nextSibling) {
                              e.target.nextSibling.style.display = 'flex';
                            }
                          }}
                        />
                      ) : null}
                      {!curso.curso_imagen_url && (
                        <div style={{
                          width: '60px',
                          height: '60px',
                          borderRadius: '12px',
                          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '2rem',
                          flexShrink: 0
                        }}>
                          📚
                        </div>
                      )}
                      <div style={{ flex: 1 }}>
                        <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.2rem', color: '#1f2937', fontWeight: '700' }}>
                          {curso.curso_nombre}
                        </h3>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#4a83c1', fontWeight: '600' }}>
                          <span>👨‍🏫</span>
                          <span>{curso.docente_nombre || 'Sin docente asignado'}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
                  No tienes cursos asignados
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal Total Docentes */}
      {mostrarModalDocentes && createPortal(
        <div 
          className="modal-mensaje-overlay" 
          onClick={() => setMostrarModalDocentes(false)}
          style={{ zIndex: 100003 }}
        >
          <div 
            className="modal-mensaje-container" 
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            style={{ maxWidth: '900px', maxHeight: '90vh', overflowY: 'auto' }}
          >
            <div className="modal-mensaje-header">
              <h2>👨‍🏫 Total Docentes</h2>
              <button
                className="modal-mensaje-close"
                onClick={() => setMostrarModalDocentes(false)}
                type="button"
                aria-label="Cerrar modal"
              >
                ✕
              </button>
            </div>
            <div className="modal-mensaje-body">
              {loadingDocentes ? (
                <div style={{ textAlign: 'center', padding: '2rem' }}>Cargando docentes...</div>
              ) : docentes.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  {docentes.map((docente) => (
                    <div 
                      key={docente.docente_id}
                      style={{
                        background: 'linear-gradient(145deg, #fef3f2, #ffffff)',
                        borderRadius: '12px',
                        padding: '1.5rem',
                        border: '2px solid #fbcfe8',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                        {docente.docente_foto_url ? (
                          <img 
                            src={docente.docente_foto_url} 
                            alt={docente.docente_nombre}
                            style={{
                              width: '60px',
                              height: '60px',
                              borderRadius: '50%',
                              objectFit: 'cover',
                              border: '3px solid #667eea'
                            }}
                            onError={(e) => {
                              e.target.style.display = 'none';
                              if (e.target.nextSibling) {
                                e.target.nextSibling.style.display = 'flex';
                              }
                            }}
                          />
                        ) : null}
                        {!docente.docente_foto_url && (
                          <div style={{
                            width: '60px',
                            height: '60px',
                            borderRadius: '50%',
                            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '2rem',
                            color: 'white'
                          }}>
                            👨‍🏫
                          </div>
                        )}
                        <h3 style={{ margin: 0, fontSize: '1.3rem', color: '#1f2937', fontWeight: '700' }}>
                          {docente.docente_nombre}
                        </h3>
                      </div>
                      <div style={{ marginTop: '1rem' }}>
                        <div style={{ fontSize: '0.9rem', color: '#6b7280', marginBottom: '0.75rem', fontWeight: '600' }}>
                          Cursos:
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                          {docente.cursos.map((curso) => (
                            <div 
                              key={curso.curso_id}
                              style={{
                                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                color: 'white',
                                padding: '0.5rem 1rem',
                                borderRadius: '8px',
                                fontSize: '0.9rem',
                                fontWeight: '600',
                                boxShadow: '0 2px 8px rgba(102, 126, 234, 0.3)'
                              }}
                            >
                              {curso.curso_nombre}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
                  No tienes docentes asignados
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal Total Matrículas */}
      {mostrarModalMatriculas && createPortal(
        <div 
          className="modal-mensaje-overlay" 
          onClick={() => setMostrarModalMatriculas(false)}
          style={{ zIndex: 100004 }}
        >
          <div 
            className="modal-mensaje-container" 
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            style={{ maxWidth: '900px', maxHeight: '90vh', overflowY: 'auto' }}
          >
            <div className="modal-mensaje-header">
              <h2>📋 Historial de Matrículas</h2>
              <button
                className="modal-mensaje-close"
                onClick={() => setMostrarModalMatriculas(false)}
                type="button"
                aria-label="Cerrar modal"
              >
                ✕
              </button>
            </div>
            <div className="modal-mensaje-body">
              {loadingMatriculas ? (
                <div style={{ textAlign: 'center', padding: '2rem' }}>Cargando matrículas...</div>
              ) : matriculas.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {matriculas.map((matricula, index) => (
                    <div 
                      key={matricula.id}
                      style={{
                        background: 'linear-gradient(145deg, #f0fdf4, #ffffff)',
                        borderRadius: '12px',
                        padding: '1.5rem',
                        border: '2px solid #bbf7d0',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                        position: 'relative',
                        overflow: 'hidden'
                      }}
                    >
                      {index === 0 && (
                        <div style={{
                          position: 'absolute',
                          top: '10px',
                          right: '10px',
                          background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                          color: 'white',
                          padding: '0.25rem 0.75rem',
                          borderRadius: '20px',
                          fontSize: '0.75rem',
                          fontWeight: '700',
                          textTransform: 'uppercase'
                        }}>
                          Actual
                        </div>
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.75rem' }}>
                        <div style={{
                          width: '50px',
                          height: '50px',
                          borderRadius: '50%',
                          background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '1.5rem',
                          color: 'white',
                          flexShrink: 0
                        }}>
                          📅
                        </div>
                        <div style={{ flex: 1 }}>
                          <h3 style={{ margin: '0 0 0.25rem 0', fontSize: '1.2rem', color: '#1f2937', fontWeight: '700' }}>
                            Año {matricula.anio}
                          </h3>
                          <div style={{ fontSize: '0.9rem', color: '#6b7280' }}>
                            {matricula.nivel_nombre} - {matricula.grado}° {matricula.seccion} - {matricula.turno_nombre}
                          </div>
                        </div>
                      </div>
                      {matricula.fecha_registro && (
                        <div style={{ 
                          fontSize: '0.85rem', 
                          color: '#10b981', 
                          fontWeight: '600',
                          marginTop: '0.5rem',
                          paddingTop: '0.75rem',
                          borderTop: '1px solid #d1fae5'
                        }}>
                          📝 Fecha de registro: {new Date(matricula.fecha_registro).toLocaleDateString('es-PE', { 
                            year: 'numeric', 
                            month: 'long', 
                            day: 'numeric' 
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
                  No se encontraron matrículas
                </div>
              )}
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

export default AlumnoDashboard;
