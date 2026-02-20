import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import api from '../services/api';
import Swal from 'sweetalert2';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import './AlumnoCursos.css';
import './DocenteCursos.css';
import './DocenteGrupos.css';

function AlumnoCursos() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [cursos, setCursos] = useState([]);
  
  // Estados para dropdown de opciones
  const [openDropdown, setOpenDropdown] = useState(null);
  const dropdownRef = useRef(null);
  
  // Estados para modal de mensaje al docente
  const [mostrarModalMensaje, setMostrarModalMensaje] = useState(false);
  const [docenteParaMensaje, setDocenteParaMensaje] = useState(null);
  const [asuntoMensaje, setAsuntoMensaje] = useState('');
  const [contenidoMensaje, setContenidoMensaje] = useState('');
  const [archivosAdjuntos, setArchivosAdjuntos] = useState([]);
  const [enviandoMensaje, setEnviandoMensaje] = useState(false);
  const quillRefMensaje = useRef(null);
  
  // Estados para modal de horario
  const [mostrarModalHorario, setMostrarModalHorario] = useState(false);
  const [cursoSeleccionadoHorario, setCursoSeleccionadoHorario] = useState(null);
  const [horario, setHorario] = useState([]);
  const [loadingHorario, setLoadingHorario] = useState(false);
  
  // Estados para modal de notas detalladas
  const [mostrarModalNotasDetalladas, setMostrarModalNotasDetalladas] = useState(false);
  const [cursoSeleccionadoNotas, setCursoSeleccionadoNotas] = useState(null);
  const [notasDetalladas, setNotasDetalladas] = useState(null);
  const [cicloSeleccionadoNotas, setCicloSeleccionadoNotas] = useState(1);
  const [loadingNotas, setLoadingNotas] = useState(false);

  useEffect(() => {
    cargarCursos();
  }, []);

  const cargarCursos = async () => {
    try {
      setLoading(true);
      const response = await api.get('/alumno/cursos');
      // Ordenar cursos por nombre de asignatura (curso_nombre) de forma ascendente
      const cursosOrdenados = (response.data.cursos || []).sort((a, b) => {
        const nombreA = (a.curso_nombre || '').toLowerCase();
        const nombreB = (b.curso_nombre || '').toLowerCase();
        return nombreA.localeCompare(nombreB);
      });
      setCursos(cursosOrdenados);
    } catch (error) {
      console.error('Error cargando cursos:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAulaVirtual = (curso) => {
    navigate(`/alumno/aula-virtual/${curso.asignatura_id}`);
  };

  // Manejar click en botón Opciones
  const handleOpcionesClick = (e, cursoId) => {
    e.preventDefault();
    e.stopPropagation();
    
    const button = e.currentTarget;
    const rect = button.getBoundingClientRect();
    
    // Si el dropdown ya está abierto para este curso, cerrarlo
    if (openDropdown?.cursoId === cursoId) {
      setOpenDropdown(null);
      return;
    }
    
    // Calcular posición del dropdown debajo del botón
    const dropdownWidth = 200;
    const dropdownHeight = 150; // Aproximadamente 3 items
    let left = rect.left;
    let top = rect.bottom + 2;
    
    // Si el dropdown se sale por la derecha, ajustar
    if (left + dropdownWidth > window.innerWidth - 10) {
      left = window.innerWidth - dropdownWidth - 10;
    }
    
    // Asegurar que no se salga por la izquierda
    if (left < 10) {
      left = 10;
    }
    
    // Si el dropdown se sale por abajo, mostrarlo arriba
    if (top + dropdownHeight > window.innerHeight - 10) {
      top = rect.top - dropdownHeight - 2;
      // Asegurar que no se salga por arriba
      if (top < 10) {
        top = 10;
      }
    }
    
    // Asegurar que top no sea negativo
    if (top < 0) {
      top = rect.bottom + 2;
    }
    
    setOpenDropdown({
      cursoId,
      top: top,
      left: left
    });
  };
  
  // Manejar click en opción del dropdown
  const handleOpcionClick = async (opcion, curso) => {
    setOpenDropdown(null);
    
    switch (opcion) {
      case 'horario':
        await handleVerHorario(curso);
        break;
      case 'notas-detalladas':
        await handleVerNotasDetalladas(curso);
        break;
      case 'enviar-mensaje':
        handleEnviarMensaje(curso);
        break;
      default:
        break;
    }
  };
  
  // Cerrar dropdown al hacer click fuera
  useEffect(() => {
    const handleClickOutside = (event) => {
      // Verificar si el click fue en el botón de opciones
      const isOpcionesButton = event.target.closest('.btn-opciones');
      // Verificar si el click fue dentro del dropdown
      const isInsideDropdown = dropdownRef.current && dropdownRef.current.contains(event.target);
      
      // Solo cerrar si el click NO fue en el botón de opciones ni dentro del dropdown
      if (!isOpcionesButton && !isInsideDropdown) {
        setOpenDropdown(null);
      }
    };
    
    if (openDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [openDropdown]);
  
  const handleVerHorario = async (curso) => {
    try {
      setCursoSeleccionadoHorario(curso);
      setMostrarModalHorario(true);
      setLoadingHorario(true);
      setHorario([]);
      
      const response = await api.get(`/alumno/cursos/${curso.asignatura_id}/horario`);
      const horariosRecibidos = response.data.horario || [];
      
      // Normalizar días
      const dias = horariosRecibidos
        .map((c) => typeof c.dia === 'number' ? c.dia : null)
        .filter((d) => d !== null);
      
      let horarioNormalizado = horariosRecibidos;
      if (dias.length > 0) {
        const minDia = Math.min(...dias);
        const maxDia = Math.max(...dias);
        const usaCeroCuatroComoLunesViernes = minDia === 0 && maxDia <= 4;
        
        horarioNormalizado = horariosRecibidos.map((c) => ({
          ...c,
          diaNormalizado: usaCeroCuatroComoLunesViernes
            ? (typeof c.dia === 'number' ? c.dia + 1 : c.dia)
            : c.dia
        }));
      }
      
      setHorario(horarioNormalizado);
    } catch (error) {
      console.error('Error cargando horario:', error);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: error.response?.data?.error || 'No se pudo cargar el horario',
        confirmButtonText: 'Entendido'
      });
    } finally {
      setLoadingHorario(false);
    }
  };
  
  const handleVerNotasDetalladas = async (curso) => {
    try {
      setCursoSeleccionadoNotas(curso);
      setCicloSeleccionadoNotas(1);
      setNotasDetalladas(null);
      setMostrarModalNotasDetalladas(true);
      await cargarNotasDetalladas(curso.asignatura_id);
    } catch (error) {
      console.error('Error abriendo modal de notas detalladas:', error);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'No se pudo abrir el modal de notas detalladas',
        confirmButtonText: 'Entendido'
      });
    }
  };
  
  const cargarNotasDetalladas = async (asignaturaId) => {
    try {
      setLoadingNotas(true);
      const response = await api.get(`/alumno/cursos/${asignaturaId}/notas-detalladas`);
      setNotasDetalladas(response.data);
    } catch (error) {
      console.error('Error cargando notas detalladas:', error);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: error.response?.data?.error || 'No se pudieron cargar las notas detalladas',
        confirmButtonText: 'Entendido'
      });
    } finally {
      setLoadingNotas(false);
    }
  };
  
  const handleEnviarMensaje = (curso) => {
    console.log('🔵 handleEnviarMensaje llamado con curso:', curso);
    // Abrir modal de mensaje con el docente pre-seleccionado
    // curso.docente_usuario_id es el usuario_id del docente (necesario para enviar mensaje)
    const docenteData = {
      id: curso.docente_usuario_id || curso.docente_id, // Usar usuario_id si está disponible, sino personal_id
      nombre: curso.docente_nombre,
      curso_nombre: curso.curso_nombre
    };
    console.log('🔵 Datos del docente para mensaje:', docenteData);
    setDocenteParaMensaje(docenteData);
    setMostrarModalMensaje(true);
    console.log('🔵 Modal debería estar abierto ahora');
  };
  
  // Manejar cambio de archivos adjuntos
  const handleArchivoChange = (e) => {
    const archivos = Array.from(e.target.files);
    setArchivosAdjuntos([...archivosAdjuntos, ...archivos]);
    e.target.value = ''; // Limpiar input para permitir seleccionar el mismo archivo de nuevo
  };
  
  // Eliminar archivo adjunto
  const eliminarArchivo = (index) => {
    setArchivosAdjuntos(archivosAdjuntos.filter((_, i) => i !== index));
  };
  
  // Enviar mensaje al docente
  const enviarMensajeAlDocente = async () => {
    if (!docenteParaMensaje) {
      Swal.fire('Error', 'No se ha seleccionado un docente', 'error');
      return;
    }

    if (!asuntoMensaje.trim()) {
      Swal.fire('Error', 'El asunto es requerido', 'error');
      return;
    }

    // Verificar que el contenido no esté vacío (sin HTML vacío)
    const contenidoLimpio = contenidoMensaje.replace(/<[^>]*>/g, '').trim();
    if (!contenidoLimpio) {
      Swal.fire('Error', 'El mensaje es requerido', 'error');
      return;
    }

    // Prevenir doble envío
    if (enviandoMensaje) {
      return;
    }

    setEnviandoMensaje(true);

    try {
      // docenteParaMensaje.id es el usuario_id del docente (ya viene en la respuesta de cursos)
      // Crear FormData para enviar archivos
      const formData = new FormData();
      formData.append('destinatarios', JSON.stringify([docenteParaMensaje.id]));
      formData.append('asunto', asuntoMensaje.trim());
      formData.append('mensaje', contenidoMensaje);

      // Agregar archivos
      archivosAdjuntos.forEach((archivo) => {
        formData.append('archivos', archivo);
      });

      const response = await api.post('/alumno/mensajes/enviar', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      Swal.fire({
        title: '¡Mensaje Enviado!',
        text: response.data.message || 'Mensaje enviado correctamente',
        icon: 'success',
        confirmButtonText: 'Aceptar'
      });
      
      // Limpiar formulario
      setAsuntoMensaje('');
      setContenidoMensaje('');
      setArchivosAdjuntos([]);
      setMostrarModalMensaje(false);
      setDocenteParaMensaje(null);
    } catch (error) {
      console.error('Error enviando mensaje:', error);
      Swal.fire('Error', error.response?.data?.error || 'Error al enviar el mensaje', 'error');
    } finally {
      setEnviandoMensaje(false);
    }
  };
  
  // Configurar ReactQuill para subir imágenes
  useEffect(() => {
    if (mostrarModalMensaje && quillRefMensaje.current) {
      const quill = quillRefMensaje.current.getEditor();
      const toolbar = quill.getModule('toolbar');
      
      toolbar.addHandler('image', () => {
        const input = document.createElement('input');
        input.setAttribute('type', 'file');
        input.setAttribute('accept', 'image/*');
        input.click();
        
        input.onchange = async () => {
          const file = input.files[0];
          if (!file) return;
          
          try {
            const formData = new FormData();
            formData.append('imagen', file);
            
            const response = await api.post('/alumno/mensajes/subir-imagen', formData, {
              headers: {
                'Content-Type': 'multipart/form-data',
              },
            });

            const imagenUrl = response.data.url;
            
            // Insertar la imagen en el editor
            const range = quill.getSelection(true);
            quill.insertEmbed(range.index, 'image', imagenUrl);
            quill.setSelection(range.index + 1);
          } catch (error) {
            console.error('Error subiendo imagen:', error);
            Swal.fire('Error', 'No se pudo subir la imagen', 'error');
          }
        };
      });
    }
  }, [mostrarModalMensaje]);
  
  // Funciones auxiliares para horario
  const diasSemana = [
    { id: 1, nombre: 'Lunes', abrev: 'LUNES' },
    { id: 2, nombre: 'Martes', abrev: 'MARTES' },
    { id: 3, nombre: 'Miércoles', abrev: 'MIÉRCOLES' },
    { id: 4, nombre: 'Jueves', abrev: 'JUEVES' },
    { id: 5, nombre: 'Viernes', abrev: 'VIERNES' }
  ];

  const formatearHora = (hora) => {
    if (!hora) return '';
    
    const horaUpper = hora.toUpperCase().trim();
    if (horaUpper.includes('AM') || horaUpper.includes('PM')) {
      return hora.trim();
    }
    
    const partes = hora.split(':');
    if (partes.length < 2) return hora;
    
    const h = parseInt(partes[0], 10);
    const m = partes[1] ? partes[1].split(' ')[0] : '00';
    const minutos = m.padStart(2, '0');
    
    if (isNaN(h)) return hora;
    
    if (h === 0) return `12:${minutos} AM`;
    if (h < 12) return `${h}:${minutos} AM`;
    if (h === 12) return `12:${minutos} PM`;
    return `${h - 12}:${minutos} PM`;
  };

  const horaAMinutos = (hora) => {
    if (!hora) return 0;
    
    const horaUpper = hora.toUpperCase().trim();
    let hora24h = hora;
    
    if (horaUpper.includes('AM') || horaUpper.includes('PM')) {
      const partes = horaUpper.replace(/[AP]M/i, '').trim().split(':');
      if (partes.length < 2) return 0;
      const h = parseInt(partes[0], 10);
      const m = parseInt(partes[1], 10) || 0;
      if (isNaN(h) || isNaN(m)) return 0;
      
      let horas24 = h;
      if (horaUpper.includes('PM') && h !== 12) horas24 = h + 12;
      if (horaUpper.includes('AM') && h === 12) horas24 = 0;
      
      return horas24 * 60 + m;
    }
    
    const partes = hora.split(':');
    if (partes.length < 2) return 0;
    const h = parseInt(partes[0], 10);
    const m = parseInt(partes[1], 10) || 0;
    if (isNaN(h) || isNaN(m)) return 0;
    
    return h * 60 + m;
  };

  const obtenerHorariosUnicos = (horarioData) => {
    if (!horarioData || horarioData.length === 0) return [];
    
    const bloques = horarioData.map(c => ({
      inicio: c.inicio || c.hora_inicio || '',
      fin: c.fin || c.hora_final || ''
    })).filter(b => b.inicio && b.fin);
    
    const unicos = {};
    bloques.forEach(b => {
      const key = `${b.inicio}-${b.fin}`;
      if (!unicos[key]) {
        unicos[key] = b;
      }
    });
    
    return Object.values(unicos).sort((a, b) => horaAMinutos(a.inicio) - horaAMinutos(b.inicio));
  };

  const obtenerClase = (dia, horaInicio, horaFin, horarioData) => {
    if (!horarioData || horarioData.length === 0) return null;
    const clase = horarioData.find(c => {
      const diaNormalizado = c.diaNormalizado || c.dia || 0;
      if (diaNormalizado !== dia) return false;
      
      const inicioClase = c.inicio || c.hora_inicio || '';
      const finClase = c.fin || c.hora_final || '';
      
      return inicioClase === horaInicio && finClase === horaFin;
    });
    
    return clase || null;
  };

  const formatearClase = (clase) => {
    if (!clase) return null;
    const titulo = clase.titulo || clase.curso_nombre || '';
    const docente = clase.docente_nombre || '';
    
    if (!titulo) return null;
    if (!docente) return titulo;
    
    return `${titulo} - ${docente}`;
  };

  const colorPalette = [
    '#FFF9C4', '#BBDEFB', '#F3E5F5', '#C8E6C9', '#E0F7FA',
    '#FFF3E0', '#FCE4EC', '#E1F5FE', '#F1F8E9', '#FFEBEE',
    '#E8EAF6', '#E0F2F1', '#E1BEE7', '#FFE0B2', '#FFCCBC',
    '#D1C4E9', '#F8BBD0', '#B2DFDB', '#C5E1A5', '#FFE082',
    '#BCAAA4', '#90CAF9', '#A5D6A7', '#CE93D8', '#FFAB91',
    '#80CBC4', '#FFCC80', '#B39DDB', '#81C784', '#64B5F6',
  ];

  const hashString = (str) => {
    let hash = 0;
    const normalized = str.trim().toLowerCase();
    
    for (let i = 0; i < normalized.length; i++) {
      const char = normalized.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash + (hash << 10);
      hash = hash ^ (hash >> 6);
    }
    
    hash = hash + (hash << 3);
    hash = hash ^ (hash >> 11);
    hash = hash + (hash << 15);
    
    return Math.abs(hash);
  };

  const getColorForCourse = (titulo) => {
    if (!titulo || !titulo.trim()) return null;
    
    const tituloNormalizado = titulo.trim();
    const hash = hashString(tituloNormalizado);
    const index = hash % colorPalette.length;
    
    return colorPalette[index];
  };

  const aclararColor = (colorHex, factor = 0.4) => {
    if (!colorHex) return '#ffffff';
    
    const r = parseInt(colorHex.slice(1, 3), 16);
    const g = parseInt(colorHex.slice(3, 5), 16);
    const b = parseInt(colorHex.slice(5, 7), 16);
    
    const rNuevo = Math.round(r + (255 - r) * factor);
    const gNuevo = Math.round(g + (255 - g) * factor);
    const bNuevo = Math.round(b + (255 - b) * factor);
    
    return `#${rNuevo.toString(16).padStart(2, '0')}${gNuevo.toString(16).padStart(2, '0')}${bNuevo.toString(16).padStart(2, '0')}`;
  };

  const procesarDetalleHorario = (horarioData) => {
    if (!horarioData || horarioData.length === 0) return [];

    const cursosMap = {};

    horarioData.forEach((clase) => {
      const titulo = (clase.titulo || clase.curso_nombre || '').trim();
      if (!titulo) return;

      const docente = clase.docente_nombre || '';
      const clave = `${titulo}|||${docente}`;

      if (!cursosMap[clave]) {
        cursosMap[clave] = {
          titulo,
          docente,
          horarios: []
        };
      }

      const diaNormalizado = clase.diaNormalizado || clase.dia || 0;
      const diaNombre = diasSemana.find(d => d.id === diaNormalizado)?.nombre || '';

      if (diaNombre) {
        cursosMap[clave].horarios.push({
          dia: diaNormalizado,
          diaNombre,
          inicio: clase.inicio || clase.hora_inicio || '',
          fin: clase.fin || clase.hora_final || ''
        });
      }
    });

    return Object.values(cursosMap);
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="alumno-cursos-loading">
          <div className="loading-spinner">Cargando cursos...</div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="alumno-cursos">
        <div className="page-header">
          <h1>📚 Mis Cursos</h1>
          <p>Gestiona tus cursos y accede al aula virtual</p>
        </div>

        {cursos.length > 0 ? (
          <div className="cursos-grid">
            {cursos.map((curso, index) => {
              // Colores pastel suaves para cada card
              const coloresPastel = [
                'linear-gradient(145deg, #fef3f2, #fff5f5)', // Rosa pastel
                'linear-gradient(145deg, #f0fdf4, #f0fff4)', // Verde pastel
                'linear-gradient(145deg, #eff6ff, #f0f9ff)', // Azul pastel
                'linear-gradient(145deg, #faf5ff, #faf5ff)', // Púrpura pastel
                'linear-gradient(145deg, #fff7ed, #fffaf0)', // Naranja pastel
                'linear-gradient(145deg, #f0fdfa, #f0fffe)', // Turquesa pastel
                'linear-gradient(145deg, #fefce8, #fffff0)', // Amarillo pastel
                'linear-gradient(145deg, #fce7f3, #fdf2f8)', // Rosa claro pastel
              ];
              const colorFondo = coloresPastel[index % coloresPastel.length];
              
              return (
              <div 
                key={curso.asignatura_id} 
                className="curso-card-alumno mundo-card"
                style={{ background: colorFondo }}
              >
                {/* Contenido del card */}
                <div className="curso-content">
                  {/* Foto circular del docente arriba */}
                  <div className="docente-foto-container">
                    {curso.docente_foto_url ? (
                      <img 
                        src={curso.docente_foto_url} 
                        alt={curso.docente_nombre}
                        className="docente-foto-circular"
                        onError={(e) => {
                          e.target.style.display = 'none';
                          if (e.target.nextSibling) {
                            e.target.nextSibling.style.display = 'flex';
                          }
                        }}
                      />
                    ) : null}
                    {!curso.docente_foto_url && (
                      <div className="docente-foto-placeholder">
                        <span className="docente-icon-placeholder">👨‍🏫</span>
                      </div>
                    )}
                  </div>
                  
                  {/* Nombre del curso */}
                  <h3 className="curso-nombre-alumno">{curso.curso_nombre}</h3>
                  
                  {/* Nombre del docente */}
                  <div className="curso-docente-nombre">
                    <span className="docente-nombre-text">{curso.docente_nombre || 'Sin docente asignado'}</span>
                  </div>

                  {/* Botones de acción */}
                  <div className="curso-actions-alumno">
                    <button
                      className="btn-aula-virtual"
                      onClick={() => handleAulaVirtual(curso)}
                    >
                      🎓 Aula Virtual
                    </button>
                    <div className="dropdown-container">
                      <button
                        className="btn-opciones"
                        onClick={(e) => handleOpcionesClick(e, curso.asignatura_id)}
                        type="button"
                      >
                        ⚙️ Opciones {openDropdown?.cursoId === curso.asignatura_id ? '▲' : '▼'}
                      </button>
                      
                      {openDropdown?.cursoId === curso.asignatura_id && openDropdown?.top !== undefined && openDropdown?.left !== undefined && 
                        createPortal(
                          <div 
                            ref={dropdownRef}
                            className="dropdown-menu"
                            style={{
                              top: `${openDropdown.top}px`,
                              left: `${openDropdown.left}px`,
                              position: 'fixed',
                              zIndex: 99999
                            }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              className="dropdown-item"
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpcionClick('horario', curso);
                              }}
                            >
                              <span className="dropdown-icon">📅</span>
                              <span>Ver Horario</span>
                            </button>
                            <button
                              className="dropdown-item"
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpcionClick('notas-detalladas', curso);
                              }}
                            >
                              <span className="dropdown-icon">📊</span>
                              <span>Notas Detalladas</span>
                            </button>
                            <button
                              className="dropdown-item"
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpcionClick('enviar-mensaje', curso);
                              }}
                            >
                              <span className="dropdown-icon">✉️</span>
                              <span>Enviar Mensaje</span>
                            </button>
                          </div>,
                          document.body
                        )}
                    </div>
                  </div>
                </div>
              </div>
              );
            })}
          </div>
        ) : (
          <div className="empty-state mundo-card">
            <div className="empty-icon">📚</div>
            <p>No tienes cursos asignados para el año académico actual</p>
          </div>
        )}
        
        {/* Modal de Enviar Mensaje al Docente */}
        {mostrarModalMensaje && docenteParaMensaje && createPortal(
          <div 
            className="modal-mensaje-overlay" 
            onClick={() => setMostrarModalMensaje(false)}
            style={{ zIndex: 100000 }}
          >
            <div 
              className="modal-mensaje-container" 
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="modal-mensaje-docente-title"
            >
              <div className="modal-mensaje-header">
                <h2 id="modal-mensaje-docente-title">✉️ Enviar Mensaje al Docente</h2>
                <button
                  className="modal-mensaje-close"
                  onClick={() => {
                    setMostrarModalMensaje(false);
                    setAsuntoMensaje('');
                    setContenidoMensaje('');
                    setArchivosAdjuntos([]);
                    setDocenteParaMensaje(null);
                  }}
                  type="button"
                  aria-label="Cerrar modal"
                >
                  ✕
                </button>
              </div>

              <div className="modal-mensaje-body">
                {/* Información del docente */}
                <div className="mensaje-grupo-info">
                  <p><strong>Docente:</strong> {docenteParaMensaje.nombre}</p>
                  <p><strong>Curso:</strong> {docenteParaMensaje.curso_nombre}</p>
                  <p className="mensaje-info-text">El mensaje se enviará directamente al docente</p>
                </div>

                {/* Campo Asunto */}
                <div className="form-group">
                  <label htmlFor="asunto-mensaje-docente">Asunto:</label>
                  <input
                    type="text"
                    id="asunto-mensaje-docente"
                    className="form-input"
                    value={asuntoMensaje}
                    onChange={(e) => setAsuntoMensaje(e.target.value)}
                    placeholder="Asunto del mensaje"
                  />
                </div>

                {/* Campo Mensaje con Editor de Texto Enriquecido */}
                <div className="form-group">
                  <label htmlFor="mensaje-editor-docente">Mensaje:</label>
                  <div id="mensaje-editor-wrapper-docente">
                    <ReactQuill
                      ref={quillRefMensaje}
                      theme="snow"
                      value={contenidoMensaje}
                      onChange={setContenidoMensaje}
                      placeholder="Escribe tu mensaje aquí..."
                      modules={{
                        toolbar: [
                          [{ 'header': [1, 2, 3, false] }],
                          ['bold', 'italic', 'underline', 'strike'],
                          [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                          [{ 'color': [] }, { 'background': [] }],
                          [{ 'align': [] }],
                          ['link', 'image'],
                          ['clean']
                        ]
                      }}
                      formats={[
                        'header', 'bold', 'italic', 'underline', 'strike',
                        'list', 'bullet', 'color', 'background', 'align',
                        'link', 'image'
                      ]}
                    />
                  </div>
                </div>

                {/* Campo Archivos Adjuntos */}
                <div className="form-group">
                  <label>Archivos Adjuntos:</label>
                  <div className="archivos-container">
                    <input
                      type="file"
                      id="archivos-input-docente"
                      multiple
                      onChange={handleArchivoChange}
                      style={{ display: 'none' }}
                    />
                    <label htmlFor="archivos-input-docente" className="btn-adjuntar-archivo">
                      📎 Adjuntar Archivos
                    </label>
                    {archivosAdjuntos.length > 0 && (
                      <div className="archivos-lista">
                        {archivosAdjuntos.map((archivo, index) => (
                          <div key={index} className="archivo-item">
                            <span className="archivo-nombre">{archivo.name}</span>
                            <span className="archivo-tamaño">
                              {(archivo.size / 1024).toFixed(2)} KB
                            </span>
                            <button
                              type="button"
                              className="archivo-eliminar"
                              onClick={() => eliminarArchivo(index)}
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Botones */}
                <div className="form-actions">
                  <button
                    className="btn-cancelar"
                    onClick={() => {
                      setMostrarModalMensaje(false);
                      setAsuntoMensaje('');
                      setContenidoMensaje('');
                      setArchivosAdjuntos([]);
                      setDocenteParaMensaje(null);
                    }}
                    type="button"
                  >
                    Cancelar
                  </button>
                  <button
                    className="btn-enviar"
                    onClick={enviarMensajeAlDocente}
                    disabled={enviandoMensaje}
                    type="button"
                  >
                    {enviandoMensaje ? '⏳ Enviando...' : '✉️ Enviar Mensaje'}
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}

        {/* Modal de Horario */}
        {mostrarModalHorario && cursoSeleccionadoHorario && createPortal(
          <div className="modal-overlay-qr" onClick={() => setMostrarModalHorario(false)}>
            <div className="modal-content-horario" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '95%', maxHeight: '95vh', overflow: 'auto' }}>
              <div className="modal-header-qr">
                <h2>📅 Horario de {cursoSeleccionadoHorario.curso_nombre}</h2>
                <button className="modal-close-qr" onClick={() => setMostrarModalHorario(false)}>×</button>
              </div>

              <div className="modal-body-horario" style={{ padding: '20px' }}>
                {loadingHorario ? (
                  <div className="qr-loading">
                    <div className="loading-spinner">Cargando horario...</div>
                  </div>
                ) : !horario || horario.length === 0 ? (
                  <div className="empty-state">
                    <p>No se encontró horario para este curso</p>
                  </div>
                ) : (
                  <>
                    <div className="horario-container" style={{ marginBottom: '30px' }}>
                      <div className="horario-table-wrapper" style={{ overflowX: 'auto' }}>
                        <table className="horario-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr>
                              <th className="horario-hora-col" style={{ backgroundColor: '#3b82f6', color: 'white', padding: '12px', textAlign: 'center', fontWeight: 'bold' }}>Hora</th>
                              {diasSemana.map((dia) => (
                                <th key={dia.id} className="horario-dia-col" style={{ backgroundColor: '#3b82f6', color: 'white', padding: '12px', textAlign: 'center', fontWeight: 'bold' }}>{dia.abrev}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {obtenerHorariosUnicos(horario).map((bloque, idx) => {
                              const claseLunes = obtenerClase(1, bloque.inicio, bloque.fin, horario);
                              const claseMartes = obtenerClase(2, bloque.inicio, bloque.fin, horario);
                              const claseMiercoles = obtenerClase(3, bloque.inicio, bloque.fin, horario);
                              const claseJueves = obtenerClase(4, bloque.inicio, bloque.fin, horario);
                              const claseViernes = obtenerClase(5, bloque.inicio, bloque.fin, horario);
                              
                              const tieneClase = claseLunes || claseMartes || claseMiercoles || claseJueves || claseViernes;
                              
                              if (!tieneClase) return null;
                              
                              return (
                                <tr key={idx}>
                                  <td className="horario-hora-cell" style={{ padding: '10px', textAlign: 'center', fontWeight: 'bold', border: '1px solid #e5e7eb' }}>
                                    {formatearHora(bloque.inicio)} - {formatearHora(bloque.fin)}
                                  </td>
                                  {[claseLunes, claseMartes, claseMiercoles, claseJueves, claseViernes].map((clase, diaIdx) => (
                                    <td
                                      key={diaIdx}
                                      className={`horario-clase-cell ${!clase ? 'horario-cell-empty' : ''}`}
                                      style={{
                                        padding: '10px',
                                        textAlign: 'center',
                                        border: '1px solid #e5e7eb',
                                        backgroundColor: clase ? aclararColor(getColorForCourse(clase.titulo || clase.curso_nombre || ''), 0.5) : 'transparent',
                                        minHeight: '60px',
                                        verticalAlign: 'middle'
                                      }}
                                    >
                                      {formatearClase(clase) || ''}
                                    </td>
                                  ))}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Detalle de Horario */}
                    {procesarDetalleHorario(horario).length > 0 && (
                      <div className="detalle-horario-container" style={{ marginTop: '30px' }}>
                        <h2 className="detalle-horario-title" style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '20px', color: '#1e293b' }}>Detalle de Horario</h2>
                        <div className="detalle-horario-list" style={{ display: 'grid', gap: '15px' }}>
                          {procesarDetalleHorario(horario).map((curso, idx) => {
                            const colorCurso = getColorForCourse(curso.titulo);
                            const colorClaro = aclararColor(colorCurso, 0.5);
                            
                            return (
                              <div 
                                key={idx} 
                                className="detalle-curso-card"
                                style={{ 
                                  backgroundColor: colorClaro,
                                  padding: '20px',
                                  borderRadius: '8px',
                                  border: `2px solid ${colorCurso || '#e5e7eb'}`,
                                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                                }}
                              >
                                <div className="detalle-curso-header" style={{ display: 'flex', alignItems: 'center', marginBottom: '15px' }}>
                                  <div 
                                    className="detalle-curso-color-indicator"
                                    style={{ 
                                      width: '20px', 
                                      height: '20px', 
                                      backgroundColor: getColorForCourse(curso.titulo) || '#ccc',
                                      borderRadius: '4px',
                                      marginRight: '12px'
                                    }}
                                  ></div>
                                  <div className="detalle-curso-info">
                                    <h3 className="detalle-curso-titulo" style={{ fontSize: '18px', fontWeight: 'bold', margin: 0, color: '#1e293b' }}>{curso.titulo}</h3>
                                    {curso.docente && (
                                      <p className="detalle-curso-docente" style={{ margin: '5px 0 0 0', color: '#64748b' }}>👨‍🏫 {curso.docente}</p>
                                    )}
                                  </div>
                                </div>
                                <div className="detalle-curso-horarios" style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                                  {curso.horarios.map((horarioItem, hIdx) => (
                                    <div key={hIdx} className="detalle-horario-item" style={{ 
                                      backgroundColor: 'white',
                                      padding: '8px 12px',
                                      borderRadius: '6px',
                                      border: '1px solid #e5e7eb',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '8px'
                                    }}>
                                      <span className="detalle-horario-dia" style={{ fontWeight: 'bold', color: '#3b82f6' }}>{horarioItem.diaNombre}</span>
                                      <span className="detalle-horario-hora" style={{ color: '#64748b' }}>
                                        {formatearHora(horarioItem.inicio)} - {formatearHora(horarioItem.fin)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}

        {/* Modal de Notas Detalladas */}
        {mostrarModalNotasDetalladas && cursoSeleccionadoNotas && createPortal(
          <div className="modal-overlay-qr" onClick={() => setMostrarModalNotasDetalladas(false)}>
            <div className="modal-content-notas-detalladas" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '95%', maxHeight: '95vh', overflow: 'auto' }}>
              <div className="modal-header-qr">
                <h2>📊 Notas Detalladas - {cursoSeleccionadoNotas.curso_nombre}</h2>
                <button className="modal-close-qr" onClick={() => setMostrarModalNotasDetalladas(false)}>×</button>
              </div>

              <div className="modal-body-notas-detalladas">
                {loadingNotas ? (
                  <div className="qr-loading">
                    <div className="loading-spinner">Cargando notas...</div>
                  </div>
                ) : !notasDetalladas || !notasDetalladas.asignatura ? (
                  <div className="empty-state">
                    <p>No hay notas registradas para este curso</p>
                  </div>
                ) : (
                  <>
                    <div className="notas-detalladas-controls">
                      <div className="bimestre-selector">
                        <label>Bimestre:</label>
                        <select 
                          value={cicloSeleccionadoNotas} 
                          onChange={(e) => setCicloSeleccionadoNotas(parseInt(e.target.value))}
                          className="select-bimestre"
                        >
                          <option value={1}>I Bimestre</option>
                          <option value={2}>II Bimestre</option>
                          <option value={3}>III Bimestre</option>
                          <option value={4}>IV Bimestre</option>
                        </select>
                      </div>
                    </div>

                    <div className="alert alert-danger text-center">
                      La información mostrada puede no estar completa al 100%, para cualquier consulta comuníquese con el administrador.
                    </div>

                    <div className="asignaturas-notas-container">
                      {(() => {
                        const asignatura = notasDetalladas.asignatura;
                        const coloresPastelNotas = [
                          { bg: 'linear-gradient(145deg, #e8f5e9, #f1f8e9)', border: '#4caf50', text: '#2e7d32' },
                          { bg: 'linear-gradient(145deg, #e3f2fd, #e8f4fd)', border: '#2196f3', text: '#1565c0' },
                          { bg: 'linear-gradient(145deg, #fff3e0, #fff8e1)', border: '#ff9800', text: '#e65100' },
                          { bg: 'linear-gradient(145deg, #f3e5f5, #f5e6f7)', border: '#9c27b0', text: '#6a1b9a' }
                        ];
                        const color = coloresPastelNotas[0];

                        return (
                          <div 
                            className="asignatura-notas-card"
                            style={{
                              background: color.bg,
                              borderColor: color.border,
                              color: color.text
                            }}
                          >
                            <div className="asignatura-notas-header">
                              <h3>{asignatura.curso_nombre}</h3>
                            </div>
                            <div className="asignatura-notas-body">
                              <table className="notas-detalladas-table">
                                <tbody>
                                  {asignatura.criterios.map((criterio) => {
                                    const tieneIndicadores = criterio.indicadores && criterio.indicadores.length > 0;
                                    const notaCriterio = criterio.notas?.[cicloSeleccionadoNotas] || null;

                                    return (
                                      <tr key={criterio.id}>
                                        <th className="criterio-label">
                                          {criterio.descripcion}
                                          {asignatura.nivel?.tipo_calificacion_final === 1 && (
                                            <span className="criterio-peso"> ({criterio.peso}%)</span>
                                          )}
                                        </th>
                                        <td className="criterio-notas">
                                          {tieneIndicadores ? (
                                            <div className="indicadores-container">
                                              <div className="indicadores-notas">
                                                {criterio.indicadores.map((indicador) => {
                                                  const cuadros = indicador.cuadros || 1;
                                                  return Array.from({ length: cuadros }, (_, i) => {
                                                    const nota = asignatura.notas?.[cicloSeleccionadoNotas]?.[criterio.id]?.[indicador.id]?.[i] || '-';
                                                    return (
                                                      <span key={`${indicador.id}-${i}`} className="nota-indicador">
                                                        {nota}
                                                      </span>
                                                    );
                                                  });
                                                })}
                                              </div>
                                              {notaCriterio && (
                                                <span className="nota-promedio-criterio">{notaCriterio}</span>
                                              )}
                                            </div>
                                          ) : (
                                            <span className="nota-directa">{notaCriterio || '-'}</span>
                                          )}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                  {asignatura.examen_mensual && (
                                    <tr>
                                      <th className="criterio-label">
                                        Examen Mensual ({asignatura.peso_examen_mensual}%)
                                      </th>
                                      <td className="criterio-notas">
                                        <div className="indicadores-container">
                                          <div className="indicadores-notas">
                                            {(() => {
                                              const examenes = asignatura.notas?.[cicloSeleccionadoNotas]?.examen_mensual || {};
                                              return (
                                                <>
                                                  <span className="nota-indicador">{examenes[1] || '-'}</span>
                                                  <span className="nota-indicador">{examenes[2] || '-'}</span>
                                                </>
                                              );
                                            })()}
                                          </div>
                                          {(() => {
                                            const examenes = asignatura.notas?.[cicloSeleccionadoNotas]?.examen_mensual || {};
                                            const examen1 = examenes[1];
                                            const examen2 = examenes[2];
                                            if (examen1 && examen2) {
                                              const e1 = parseFloat(examen1);
                                              const e2 = parseFloat(examen2);
                                              if (!isNaN(e1) && !isNaN(e2) && e1 > 0 && e2 > 0) {
                                                const promedio = Math.round((e1 + e2) / 2);
                                                return (
                                                  <span className="nota-promedio-criterio">
                                                    {promedio}
                                                  </span>
                                                );
                                              }
                                            }
                                            return null;
                                          })()}
                                        </div>
                                      </td>
                                    </tr>
                                  )}
                                  <tr className="promedio-final-row">
                                    <th className="criterio-label">PROMEDIO</th>
                                    <td className="criterio-notas">
                                      <span className="nota-promedio-final">
                                        {asignatura.notas?.[cicloSeleccionadoNotas]?.promedio_final || '-'}
                                      </span>
                                    </td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
      </div>
    </DashboardLayout>
  );
}

export default AlumnoCursos;

