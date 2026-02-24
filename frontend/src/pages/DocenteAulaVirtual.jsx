import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate } from 'react-router-dom';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import DashboardLayout from '../components/DashboardLayout';
import api from '../services/api';
import Swal from 'sweetalert2';
import './DocenteAulaVirtual-gamificado.css';

// Componente SortableItem para drag and drop
function SortableItem({ archivo, onEdit, onDelete, openDropdown, toggleDropdown, dropdownPosition, buttonRef }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: archivo.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    cursor: 'grab',
  };

  return (
    <tr 
      ref={setNodeRef} 
      style={style}
      className={isDragging ? 'dragging' : ''}
    >
      <td 
        {...attributes} 
        {...listeners}
        className="drag-handle"
        style={{ cursor: 'grab', userSelect: 'none' }}
      >
        {archivo.nombre}
      </td>
      <td className="text-center">
        {archivo.fecha_hora ? (
          new Date(archivo.fecha_hora).toLocaleDateString('es-PE', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
          })
        ) : (
          '-'
        )}
      </td>
      <td className="text-center">
        <div className="btn-group-opciones">
          <button 
            className="btn-opciones"
            ref={(el) => (buttonRef.current[`archivo-${archivo.id}`] = el)}
            onClick={(e) => toggleDropdown(archivo.id, e, 'archivo')}
          >
            Opciones {openDropdown === `archivo-${archivo.id}` ? '▲' : '▼'}
          </button>
          {openDropdown === `archivo-${archivo.id}` && dropdownPosition && createPortal(
            <div 
              className="dropdown-menu-portal-aula"
              style={{
                position: 'fixed',
                top: `${dropdownPosition.top}px`,
                right: `${dropdownPosition.right}px`,
                width: `${dropdownPosition.width}px`,
                zIndex: 10000
              }}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="dropdown-menu-opciones">
                {archivo.archivo_url && (
                  <a href={archivo.archivo_url} target="_blank" rel="noopener noreferrer">
                    📄 Ver Archivo
                  </a>
                )}
                {archivo.enlace_url && (
                  <a href={archivo.enlace_url} target="_blank" rel="noopener noreferrer">
                    🔗 Abrir URL
                  </a>
                )}
                <a href="#" onClick={(e) => { e.preventDefault(); onEdit(archivo); }}>
                  ✏️ Editar Tema
                </a>
                <a href="#" onClick={(e) => { e.preventDefault(); onDelete(archivo); }}>
                  🗑️ Borrar Tema
                </a>
              </div>
            </div>,
            document.body
          )}
        </div>
      </td>
    </tr>
  );
}

function DocenteAulaVirtual() {
  const { cursoId } = useParams(); // En realidad es asignatura_id
  const navigate = useNavigate();
  const asignaturaId = parseInt(cursoId);
  
  const [loading, setLoading] = useState(true);
  const [curso, setCurso] = useState(null);
  const [totalNotas, setTotalNotas] = useState(4); // Número de bimestres por defecto
  
  // Estados para cada sección con su ciclo activo (bimestre)
  const [cicloArchivos, setCicloArchivos] = useState(1);
  const [cicloTareas, setCicloTareas] = useState(1);
  const [cicloExamenes, setCicloExamenes] = useState(1);
  const [cicloSesiones, setCicloSesiones] = useState(1);
  const [tareas, setTareas] = useState([]);
  const [sesiones, setSesiones] = useState([]);
  const [examenes, setExamenes] = useState([]);
  const [videos, setVideos] = useState([]);
  const [enlaces, setEnlaces] = useState([]);
  const [temas, setTemas] = useState([]);
  const [archivos, setArchivos] = useState([]);

  // Estados para modales/formularios
  const [mostrarFormTema, setMostrarFormTema] = useState(false);
  const [mostrarFormTarea, setMostrarFormTarea] = useState(false);
  const [mostrarFormExamen, setMostrarFormExamen] = useState(false);
  const [mostrarFormVideo, setMostrarFormVideo] = useState(false);
  const [mostrarFormEnlace, setMostrarFormEnlace] = useState(false);
  const [mostrarFormSesion, setMostrarFormSesion] = useState(false);
  const [videoEditando, setVideoEditando] = useState(null);
  const [enlaceEditando, setEnlaceEditando] = useState(null);
  const [sesionEditando, setSesionEditando] = useState(null);
  const [tareaSeleccionada, setTareaSeleccionada] = useState(null);
  const [mostrarDetallesTarea, setMostrarDetallesTarea] = useState(false);
  const [tareaDetalle, setTareaDetalle] = useState(null);
  
  // Estados para preguntas y alternativas
  const [examenSeleccionado, setExamenSeleccionado] = useState(null);
  const [mostrarPreguntasAlternativas, setMostrarPreguntasAlternativas] = useState(false);
  const [preguntas, setPreguntas] = useState([]);
  const [cargandoPreguntas, setCargandoPreguntas] = useState(false);
  const [preguntaEditando, setPreguntaEditando] = useState(null);
  const [mostrarFormPregunta, setMostrarFormPregunta] = useState(false);
  const [alternativas, setAlternativas] = useState([]);
  const [formPregunta, setFormPregunta] = useState({
    descripcion: '',
    tipo: 'ALTERNATIVAS',
    puntos: 0,
    datos_adicionales: null
  });
  
  // Estados para dropdowns con portal
  const [openDropdown, setOpenDropdown] = useState(null);
  const [dropdownPosition, setDropdownPosition] = useState(null);
  const buttonRef = useRef({});
  
  // Estado para card expandido (versión gamificada)
  const [expandedCard, setExpandedCard] = useState(null);
  const [bimestreGlobal, setBimestreGlobal] = useState(1);
  
  // Formularios de video y enlace (después de bimestreGlobal)
  const [formVideo, setFormVideo] = useState({
    descripcion: '',
    enlace: '',
    ciclo: 1
  });
  const [formEnlace, setFormEnlace] = useState({
    descripcion: '',
    enlace: '',
    ciclo: 1
  });
  const [guardandoVideo, setGuardandoVideo] = useState(false);
  const [guardandoEnlace, setGuardandoEnlace] = useState(false);
  const [guardandoSesion, setGuardandoSesion] = useState(false);

  // Formulario de sesión (PDF vinculado a tema)
  const [formSesion, setFormSesion] = useState({
    tema_id: '',
    descripcion: '',
    archivo: null,
    archivoNombre: '',
    ciclo: 1
  });

  // Formulario de tema
  const [formTema, setFormTema] = useState({
    nombre: '',
    archivo: null,
    archivoNombre: '',
    enlace: '',
    ciclo: bimestreGlobal
  });
  const [temaEditando, setTemaEditando] = useState(null);
  const [guardandoTema, setGuardandoTema] = useState(false);
  
  // Drag and Drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Formulario de tarea
  const [formTarea, setFormTarea] = useState({
    titulo: '',
    descripcion: '',
    fecha_entrega: '',
    ciclo: bimestreGlobal,
    archivo: null,
    archivoNombre: '',
    enlace: ''
  });
  const [guardandoTarea, setGuardandoTarea] = useState(false);
  const [tareaEditando, setTareaEditando] = useState(null);
  
  // Estado para modal de Marcar Entregas
  const [mostrarModalEntregas, setMostrarModalEntregas] = useState(false);
  const [tareaParaEntregas, setTareaParaEntregas] = useState(null);
  const [alumnosEntregas, setAlumnosEntregas] = useState([]);
  const [infoTareaEntregas, setInfoTareaEntregas] = useState(null);
  const [notasTemporales, setNotasTemporales] = useState({});
  const [loadingEntregas, setLoadingEntregas] = useState(false);
  
  // Estado para modal Biblioteca (temas, tareas, examenes, videos, enlaces)
  const [mostrarModalBiblioteca, setMostrarModalBiblioteca] = useState(false);
  const [tipoBiblioteca, setTipoBiblioteca] = useState('temas');
  const [loadingBiblioteca, setLoadingBiblioteca] = useState(false);
  const [datosBiblioteca, setDatosBiblioteca] = useState({ porAnio: {}, años: [] });
  const [bibliotecaSeleccionados, setBibliotecaSeleccionados] = useState([]);
  const [añoFiltroBiblioteca, setAñoFiltroBiblioteca] = useState(null);
  const [guardandoBiblioteca, setGuardandoBiblioteca] = useState(false);

  const BIBLIOTECA_CONFIG = {
    temas: { api: 'biblioteca-temas', copyApi: 'copiar-temas-biblioteca', titulo: 'Biblioteca de Temas', labelItem: 'nombre', useCopyTemas: true },
    tareas: { api: 'biblioteca-tareas', copyApi: 'copiar-biblioteca', titulo: 'Biblioteca de Proyectos', labelItem: 'titulo', useCopyTemas: false },
    examenes: { api: 'biblioteca-examenes', copyApi: 'copiar-biblioteca', titulo: 'Biblioteca de Exámenes', labelItem: 'titulo', useCopyTemas: false },
    videos: { api: 'biblioteca-videos', copyApi: 'copiar-biblioteca', titulo: 'Biblioteca de Videos', labelItem: 'descripcion', useCopyTemas: false },
    enlaces: { api: 'biblioteca-enlaces', copyApi: 'copiar-biblioteca', titulo: 'Biblioteca de Enlaces', labelItem: 'descripcion', useCopyTemas: false }
  };

  // Estado para modal de Asignar a Registro (Tareas)
  const [mostrarModalAsignarRegistro, setMostrarModalAsignarRegistro] = useState(false);
  const [tareaParaAsignar, setTareaParaAsignar] = useState(null);
  const [datosAsignarRegistro, setDatosAsignarRegistro] = useState(null);
  const [criterioSeleccionado, setCriterioSeleccionado] = useState('');
  const [cuadroSeleccionado, setCuadroSeleccionado] = useState('0');
  const [loadingAsignarRegistro, setLoadingAsignarRegistro] = useState(false);
  const [guardandoAsignarRegistro, setGuardandoAsignarRegistro] = useState(false);
  
  // Estado para modal de Asignar a Registro (Exámenes)
  const [mostrarModalAsignarRegistroExamen, setMostrarModalAsignarRegistroExamen] = useState(false);
  const [examenParaAsignar, setExamenParaAsignar] = useState(null);
  const [datosAsignarRegistroExamen, setDatosAsignarRegistroExamen] = useState(null);
  const [criterioSeleccionadoExamen, setCriterioSeleccionadoExamen] = useState('');
  const [cuadroSeleccionadoExamen, setCuadroSeleccionadoExamen] = useState('0');
  const [loadingAsignarRegistroExamen, setLoadingAsignarRegistroExamen] = useState(false);
  const [guardandoAsignarRegistroExamen, setGuardandoAsignarRegistroExamen] = useState(false);

  // Formulario de examen
  const [formExamen, setFormExamen] = useState({
    titulo: '',
    tipo: 'VIRTUAL',
    tipo_puntaje: 'GENERAL',
    puntos_correcta: 1,
    penalizar_incorrecta: 'NO',
    penalizacion_incorrecta: 0,
    tiempo: 60,
    intentos: 1,
    orden_preguntas: 'PREDETERMINADO',
    preguntas_max: 1,
    ciclo: 1,
    estado: 'INACTIVO',
    habilitar_fecha_hora: false,
    fecha_desde: '',
    fecha_hasta: '',
    hora_desde: '08:00',
    hora_hasta: '20:00',
    archivo_pdf: null
  });
  const [examenEditando, setExamenEditando] = useState(null);
  const [guardandoExamen, setGuardandoExamen] = useState(false);
  
  // Estados para resultados de exámenes
  const [mostrarResultadosExamen, setMostrarResultadosExamen] = useState(false);
  const [resultadosExamen, setResultadosExamen] = useState([]);
  const [examenParaResultados, setExamenParaResultados] = useState(null);
  const [cargandoResultados, setCargandoResultados] = useState(false);
  
  // Estados para detalles del resultado
  const [mostrarDetallesResultado, setMostrarDetallesResultado] = useState(false);
  const [resultadoParaDetalles, setResultadoParaDetalles] = useState(null);
  const [detallesResultado, setDetallesResultado] = useState(null);
  const [cargandoDetallesResultado, setCargandoDetallesResultado] = useState(false);

  const cargarDatosCurso = useCallback(async () => {
    try {
      // Obtener información del curso/asignatura desde la lista de cursos
      const response = await api.get('/docente/cursos');
      const cursoEncontrado = response.data.cursos.find(c => c.id === asignaturaId);
      setCurso(cursoEncontrado || null);
      
      // Obtener configuración (total_notas)
      const configResponse = await api.get('/docente/aula-virtual/config');
      setTotalNotas(configResponse.data.total_notas || 4);
    } catch (error) {
      console.error('Error cargando curso:', error);
    }
  }, [asignaturaId]);

  // Actualizar ciclo del formulario cuando cambia bimestreGlobal
  useEffect(() => {
    if (!mostrarFormTarea) {
      setFormTarea(prev => ({ ...prev, ciclo: bimestreGlobal }));
    }
  }, [bimestreGlobal, mostrarFormTarea]);

  const cargarArchivos = useCallback(async (ciclo) => {
    try {
      const cicloFiltro = ciclo || cicloArchivos || bimestreGlobal;
      const response = await api.get('/docente/aula-virtual/archivos', {
        params: { asignatura_id: asignaturaId, ciclo: cicloFiltro }
      });
      // Mantener archivos de otros ciclos y actualizar solo los del ciclo actual
      setArchivos(prevArchivos => {
        const otrosCiclos = prevArchivos.filter(a => a.ciclo !== cicloFiltro);
        return [...otrosCiclos, ...(response.data.archivos || [])];
      });
    } catch (error) {
      console.error('Error cargando archivos:', error);
    }
  }, [asignaturaId, cicloArchivos, bimestreGlobal]);

  const cargarTemas = useCallback(async (ciclo) => {
    try {
      const response = await api.get('/docente/aula-virtual/temas', {
        params: { asignatura_id: asignaturaId, ciclo: ciclo || 1 }
      });
      setTemas(response.data.temas || []);
    } catch (error) {
      console.error('Error cargando temas:', error);
    }
  }, [asignaturaId]);

  const cargarTareas = useCallback(async (ciclo) => {
    try {
      const response = await api.get('/docente/aula-virtual/tareas', {
        params: { asignatura_id: asignaturaId, ciclo: ciclo || cicloTareas }
      });
      setTareas(response.data.tareas || []);
    } catch (error) {
      console.error('Error cargando tareas:', error);
    }
  }, [asignaturaId, cicloTareas]);

  const cargarExamenes = useCallback(async (ciclo) => {
    try {
      const response = await api.get('/docente/aula-virtual/examenes', {
        params: { asignatura_id: asignaturaId, ciclo: ciclo || cicloExamenes },
        timeout: 60000
      });
      setExamenes(response.data.examenes || []);
    } catch (error) {
      console.error('Error cargando exámenes:', error);
    }
  }, [asignaturaId, cicloExamenes]);

  const cargarVideos = useCallback(async (ciclo) => {
    try {
      const response = await api.get('/docente/aula-virtual/videos', {
        params: { asignatura_id: asignaturaId, ciclo: ciclo || bimestreGlobal }
      });
      setVideos(response.data.videos || []);
    } catch (error) {
      console.error('Error cargando videos:', error);
    }
  }, [asignaturaId, bimestreGlobal]);

  const cargarEnlaces = useCallback(async (ciclo) => {
    try {
      const response = await api.get('/docente/aula-virtual/enlaces', {
        params: { asignatura_id: asignaturaId, ciclo: ciclo || bimestreGlobal }
      });
      setEnlaces(response.data.enlaces || []);
    } catch (error) {
      console.error('Error cargando enlaces:', error);
    }
  }, [asignaturaId, bimestreGlobal]);

  const cargarSesiones = useCallback(async (ciclo) => {
    try {
      const response = await api.get('/docente/aula-virtual/sesiones', {
        params: { asignatura_id: asignaturaId, ciclo: ciclo ?? bimestreGlobal }
      });
      setSesiones(response.data.sesiones || []);
    } catch (error) {
      console.error('Error cargando sesiones:', error);
    }
  }, [asignaturaId, bimestreGlobal]);

  // Cargar datos del curso y configuración
  useEffect(() => {
    if (asignaturaId) {
      setLoading(true);
      cargarDatosCurso().finally(() => setLoading(false));
    }
  }, [asignaturaId, cargarDatosCurso]);

  // Sincronizar bimestre global con los ciclos individuales
  useEffect(() => {
    setCicloArchivos(bimestreGlobal);
    setCicloTareas(bimestreGlobal);
    setCicloExamenes(bimestreGlobal);
    setCicloSesiones(bimestreGlobal);
    // Actualizar ciclo del formulario cuando cambia el bimestre global
    if (!temaEditando) {
      setFormTema(prev => ({ ...prev, ciclo: bimestreGlobal }));
    }
  }, [bimestreGlobal, temaEditando]);

  // Cargar todos los datos inicialmente con ciclo 1
  useEffect(() => {
    if (!asignaturaId || loading) return;
    
    cargarArchivos(1);
    cargarTareas(1);
    cargarExamenes(1);
    cargarVideos(1);
    cargarEnlaces(1);
    cargarTemas(1);
    cargarSesiones(1);
  }, [asignaturaId, loading]);

  // Cargar datos cuando cambia el ciclo de cada sección
  useEffect(() => {
    if (!asignaturaId) return;
    cargarArchivos(cicloArchivos);
  }, [cicloArchivos, asignaturaId, cargarArchivos]);

  // Cargar archivos cuando cambia el bimestre global
  useEffect(() => {
    if (!asignaturaId) return;
    cargarArchivos(bimestreGlobal);
  }, [bimestreGlobal, asignaturaId, cargarArchivos]);

  useEffect(() => {
    if (!asignaturaId) return;
    cargarTareas(cicloTareas);
  }, [cicloTareas, asignaturaId, cargarTareas]);

  useEffect(() => {
    if (!asignaturaId) return;
    cargarExamenes(cicloExamenes);
  }, [cicloExamenes, asignaturaId, cargarExamenes]);

  // Cargar videos cuando cambia el bimestre global
  useEffect(() => {
    if (!asignaturaId) return;
    cargarVideos(bimestreGlobal);
  }, [bimestreGlobal, asignaturaId, cargarVideos]);

  // Cargar enlaces cuando cambia el bimestre global
  useEffect(() => {
    if (!asignaturaId) return;
    cargarEnlaces(bimestreGlobal);
  }, [bimestreGlobal, asignaturaId, cargarEnlaces]);

  useEffect(() => {
    if (!asignaturaId) return;
    cargarSesiones(bimestreGlobal);
  }, [bimestreGlobal, asignaturaId, cargarSesiones]);

  // Cerrar dropdowns al hacer click fuera
  useEffect(() => {
    const handleClickOutside = (event) => {
      // Solo cerrar si es click del botón izquierdo (button === 0)
      // Ignorar botón del medio (wheel, button === 1) y botón derecho (button === 2)
      if (event.button !== 0) return;
      
      if (openDropdown !== null) {
        const dropdownElement = document.querySelector('.dropdown-menu-portal-aula');
        const buttonElement = buttonRef.current[openDropdown];
        
        // Verificar si el click fue fuera del dropdown y del botón
        if (
          dropdownElement && 
          !dropdownElement.contains(event.target) &&
          buttonElement &&
          !buttonElement.contains(event.target)
        ) {
          setOpenDropdown(null);
          setDropdownPosition(null);
        }
      }
    };

    if (openDropdown !== null) {
      // Usar mousedown en lugar de click para mejor control
      setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside);
      }, 0);
      
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [openDropdown]);

  // Función para toggle dropdown
  const toggleDropdown = (itemId, event, tipo) => {
    event.preventDefault();
    event.stopPropagation();
    if (openDropdown === `${tipo}-${itemId}`) {
      setOpenDropdown(null);
      setDropdownPosition(null);
    } else {
      const button = event.currentTarget;
      const rect = button.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right,
        width: rect.width > 200 ? rect.width : 200
      });
      setOpenDropdown(`${tipo}-${itemId}`);
    }
  };

  // Biblioteca: abrir modal y cargar datos (temas, tareas, examenes, videos, enlaces)
  const abrirModalBiblioteca = async (tipo = 'temas') => {
    setTipoBiblioteca(tipo);
    setMostrarModalBiblioteca(true);
    setBibliotecaSeleccionados([]);
    setAñoFiltroBiblioteca(null);
    setLoadingBiblioteca(true);
    setDatosBiblioteca({ porAnio: {}, años: [] });
    const cfg = BIBLIOTECA_CONFIG[tipo] || BIBLIOTECA_CONFIG.temas;
    try {
      const res = await api.get(`/docente/aula-virtual/${cfg.api}`, {
        params: { asignatura_id: asignaturaId }
      });
      setDatosBiblioteca(res.data);
      if (res.data.años && res.data.años.length > 0) {
        setAñoFiltroBiblioteca(res.data.años[0]);
      }
    } catch (err) {
      console.error('[Biblioteca] Error cargando:', err);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: err.response?.data?.error || 'No se pudo cargar la biblioteca de temas'
      });
    } finally {
      setLoadingBiblioteca(false);
    }
  };

  const toggleBibliotecaItem = (asignatura_origen_id, item_id) => {
    setBibliotecaSeleccionados(prev => {
      const exists = prev.some(p => p.asignatura_origen_id === asignatura_origen_id && (p.tema_id === item_id || p.item_id === item_id));
      if (exists) {
        return prev.filter(p => !(p.asignatura_origen_id === asignatura_origen_id && (p.tema_id === item_id || p.item_id === item_id)));
      }
      const item = tipoBiblioteca === 'temas' ? { asignatura_origen_id, tema_id: item_id } : { asignatura_origen_id, item_id };
      return [...prev, item];
    });
  };

  const isBibliotecaItemSeleccionado = (asignatura_origen_id, item_id) => {
    return bibliotecaSeleccionados.some(
      p => p.asignatura_origen_id === asignatura_origen_id && (p.tema_id === item_id || p.item_id === item_id)
    );
  };

  const seleccionarTodosBiblioteca = (items, select) => {
    const isTemas = tipoBiblioteca === 'temas';
    if (select) {
      const nuevos = items.map(t => isTemas ? { asignatura_origen_id: t.asignatura_id, tema_id: t.id } : { asignatura_origen_id: t.asignatura_id, item_id: t.id });
      setBibliotecaSeleccionados(prev => {
        const merged = [...prev];
        for (const n of nuevos) {
          const key = `${n.asignatura_origen_id}-${n.tema_id ?? n.item_id}`;
          if (!merged.some(p => `${p.asignatura_origen_id}-${p.tema_id ?? p.item_id}` === key)) merged.push(n);
        }
        return merged;
      });
    } else {
      const ids = new Set(items.map(t => `${t.asignatura_id}-${t.id}`));
      setBibliotecaSeleccionados(prev => prev.filter(p => !ids.has(`${p.asignatura_origen_id}-${p.tema_id ?? p.item_id}`)));
    }
  };

  const handleCopiarBiblioteca = async () => {
    if (bibliotecaSeleccionados.length === 0) {
      Swal.fire({
        icon: 'warning',
        title: 'Seleccione elementos',
        text: 'Debe seleccionar al menos un elemento para copiar'
      });
      return;
    }
    setGuardandoBiblioteca(true);
    const cfg = BIBLIOTECA_CONFIG[tipoBiblioteca] || BIBLIOTECA_CONFIG.temas;
    try {
      const payload = cfg.useCopyTemas
        ? { asignatura_id: asignaturaId, items: bibliotecaSeleccionados }
        : { asignatura_id: asignaturaId, tipo: tipoBiblioteca, items: bibliotecaSeleccionados.map(p => ({ asignatura_origen_id: p.asignatura_origen_id, item_id: p.item_id })) };
      const res = cfg.useCopyTemas
        ? await api.post('/docente/aula-virtual/copiar-temas-biblioteca', payload)
        : await api.post('/docente/aula-virtual/copiar-biblioteca', payload);
      Swal.fire({
        icon: 'success',
        title: '¡Copiado!',
        text: `Se copiaron ${res.data.copiados} elemento(s) al año actual (conservando su bimestre)`
      });
      setMostrarModalBiblioteca(false);
      setBibliotecaSeleccionados([]);
      if (tipoBiblioteca === 'temas') cargarArchivos(bimestreGlobal);
      else if (tipoBiblioteca === 'tareas') cargarTareas(bimestreGlobal);
      else if (tipoBiblioteca === 'examenes') cargarExamenes(bimestreGlobal);
      else if (tipoBiblioteca === 'videos') cargarVideos(bimestreGlobal);
      else if (tipoBiblioteca === 'enlaces') cargarEnlaces(bimestreGlobal);
    } catch (err) {
      console.error('[Biblioteca] Error copiando:', err);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: err.response?.data?.error || 'No se pudo copiar los temas'
      });
    } finally {
      setGuardandoBiblioteca(false);
    }
  };

  const handleGuardarTema = async (e) => {
    e.preventDefault();
    
    // Validar que al menos tenga nombre
    if (!formTema.nombre.trim()) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'El nombre del tema es requerido',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000
      });
      return;
    }

    // Validar que tenga al menos archivo o enlace
    // Si está editando, considerar el archivo existente
    const tieneArchivoNuevo = !!formTema.archivo;
    const tieneArchivoExistente = temaEditando && (temaEditando.archivo || temaEditando.archivo_url);
    const tieneEnlace = formTema.enlace.trim() !== '';
    
    if (!tieneArchivoNuevo && !tieneArchivoExistente && !tieneEnlace) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'Debe proporcionar al menos un archivo o una URL',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000
      });
      return;
    }

    setGuardandoTema(true);
    try {
      const formData = new FormData();
      formData.append('asignatura_id', asignaturaId);
      formData.append('nombre', formTema.nombre.trim());
      formData.append('ciclo', formTema.ciclo);
      
      if (formTema.archivo) {
        formData.append('archivo', formTema.archivo);
      }
      
      if (formTema.enlace.trim()) {
        formData.append('enlace', formTema.enlace.trim());
      }

      if (temaEditando) {
        // Editar tema existente
        await api.put(`/docente/aula-virtual/archivos/${temaEditando.id}`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        
        Swal.fire({
          icon: 'success',
          title: '¡Tema actualizado!',
          text: 'El tema se ha actualizado correctamente',
          toast: true,
          position: 'top-end',
          showConfirmButton: false,
          timer: 3000,
          timerProgressBar: true
        });
      } else {
        // Crear nuevo tema
        await api.post('/docente/aula-virtual/archivos', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        
        Swal.fire({
          icon: 'success',
          title: '¡Tema creado!',
          text: 'El tema se ha creado correctamente',
          toast: true,
          position: 'top-end',
          showConfirmButton: false,
          timer: 3000,
          timerProgressBar: true
        });
      }

      setMostrarFormTema(false);
      setTemaEditando(null);
      setFormTema({ nombre: '', archivo: null, archivoNombre: '', enlace: '', ciclo: bimestreGlobal });
      await cargarArchivos(bimestreGlobal);
    } catch (error) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: error.response?.data?.error || (temaEditando ? 'No se pudo actualizar el tema' : 'No se pudo crear el tema'),
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000
      });
    } finally {
      setGuardandoTema(false);
    }
  };

  const handleEditarTema = (archivo) => {
    setTemaEditando(archivo);
    setFormTema({
      nombre: archivo.nombre || '',
      archivo: null,
      archivoNombre: archivo.archivo ? 'Archivo existente' : '',
      enlace: archivo.enlace || '',
      ciclo: archivo.ciclo || bimestreGlobal
    });
    setMostrarFormTema(true);
    setOpenDropdown(null);
  };

  const handleEliminarTema = async (archivo) => {
    const result = await Swal.fire({
      title: '¿Estás seguro?',
      text: `¿Deseas eliminar el tema "${archivo.nombre}"?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    });

    if (result.isConfirmed) {
      try {
        await api.delete(`/docente/aula-virtual/archivos/${archivo.id}`);
        
        Swal.fire({
          icon: 'success',
          title: '¡Tema eliminado!',
          text: 'El tema se ha eliminado correctamente',
          toast: true,
          position: 'top-end',
          showConfirmButton: false,
          timer: 3000,
          timerProgressBar: true
        });

        setOpenDropdown(null);
        await cargarArchivos(bimestreGlobal);
      } catch (error) {
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: error.response?.data?.error || 'No se pudo eliminar el tema',
          toast: true,
          position: 'top-end',
          showConfirmButton: false,
          timer: 3000
        });
      }
    }
  };

  const handleDragEnd = async (event) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      // Filtrar archivos por el bimestre actual
      const archivosFiltrados = archivos.filter(archivo => archivo.ciclo === bimestreGlobal);
      
      const oldIndex = archivosFiltrados.findIndex(item => item.id === active.id);
      const newIndex = archivosFiltrados.findIndex(item => item.id === over.id);

      if (oldIndex === -1 || newIndex === -1) {
        console.error('Índices no encontrados en archivos filtrados');
        return;
      }

      const nuevosArchivosFiltrados = arrayMove(archivosFiltrados, oldIndex, newIndex);
      
      // Actualizar el estado con los nuevos órdenes, manteniendo los archivos de otros bimestres
      const otrosArchivos = archivos.filter(archivo => archivo.ciclo !== bimestreGlobal);
      const nuevosArchivos = [...otrosArchivos, ...nuevosArchivosFiltrados];
      setArchivos(nuevosArchivos);

      // Actualizar orden en el backend
      const ordenes = nuevosArchivosFiltrados
        .filter(archivo => archivo.ciclo === bimestreGlobal) // Asegurar que todos pertenezcan al ciclo
        .map((archivo, index) => ({
          id: parseInt(archivo.id),
          orden: index + 1
        }));

      try {
        if (!asignaturaId || !bimestreGlobal || !ordenes || ordenes.length === 0) {
          throw new Error('Datos incompletos para actualizar orden');
        }

        // Verificar que todos los archivos tengan ID válido
        const archivosInvalidos = ordenes.filter(item => !item.id || isNaN(item.id));
        if (archivosInvalidos.length > 0) {
          throw new Error(`Algunos archivos tienen IDs inválidos: ${JSON.stringify(archivosInvalidos)}`);
        }

        // Asegurar que los datos sean números
        const datosEnviar = {
          asignatura_id: parseInt(asignaturaId),
          ciclo: parseInt(bimestreGlobal),
          ordenes: ordenes
        };

        console.log('Enviando datos para ordenar:', datosEnviar);
        console.log('Cantidad de archivos:', ordenes.length);

        await api.put('/docente/aula-virtual/archivos/ordenar', datosEnviar);
      } catch (error) {
        console.error('Error actualizando orden:', error);
        console.error('Respuesta del servidor:', error.response?.data);
        console.error('Datos enviados:', {
          asignatura_id: asignaturaId,
          ciclo: bimestreGlobal,
          ordenes: ordenes,
          cantidad: ordenes.length
        });
        // Revertir cambios en caso de error
        await cargarArchivos(bimestreGlobal);
        const mensajeError = error.response?.data?.error || error.message || 'No se pudo actualizar el orden de los temas';
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: mensajeError,
          toast: true,
          position: 'top-end',
          showConfirmButton: false,
          timer: 5000
        });
      }
    }
  };

  const handleCrearTarea = async (e) => {
    e.preventDefault();
    
    if (!formTarea.titulo || !formTarea.fecha_entrega || !formTarea.ciclo) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'Título, Fecha de Entrega y Bimestre son requeridos',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000
      });
      return;
    }

    // Validar que tenga al menos archivo o enlace (solo para crear, no para editar)
    if (!tareaEditando && !formTarea.archivo && !formTarea.enlace.trim()) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'Debe proporcionar al menos un archivo o una URL',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000
      });
      return;
    }

    // Para editar, validar que tenga archivo nuevo, enlace nuevo, o que exista archivo/enlace previo
    if (tareaEditando && !formTarea.archivo && !formTarea.enlace.trim()) {
      const tieneArchivoExistente = tareaEditando.archivos && tareaEditando.archivos.length > 0;
      const tieneEnlaceExistente = tareaEditando.enlace_url || tareaEditando.enlace;
      
      if (!tieneArchivoExistente && !tieneEnlaceExistente) {
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: 'Debe proporcionar al menos un archivo o una URL',
          toast: true,
          position: 'top-end',
          showConfirmButton: false,
          timer: 3000
        });
        return;
      }
    }

    setGuardandoTarea(true);
    try {
      const formData = new FormData();
      formData.append('asignatura_id', asignaturaId);
      formData.append('titulo', formTarea.titulo);
      formData.append('descripcion', formTarea.descripcion || '');
      formData.append('fecha_entrega', formTarea.fecha_entrega);
      formData.append('ciclo', formTarea.ciclo);
      
      if (formTarea.archivo) {
        formData.append('archivo', formTarea.archivo);
      }
      
      if (formTarea.enlace.trim()) {
        formData.append('enlace', formTarea.enlace.trim());
      }

      if (tareaEditando) {
        // Editar tarea existente
        await api.put(`/docente/aula-virtual/tareas/${tareaEditando.id}`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        
        Swal.fire({
          icon: 'success',
          title: '¡Proyecto actualizado!',
          text: 'El proyecto se ha actualizado correctamente',
          toast: true,
          position: 'top-end',
          showConfirmButton: false,
          timer: 3000,
          timerProgressBar: true
        });
      } else {
        // Crear nueva tarea
        await api.post('/docente/aula-virtual/tareas', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });

        Swal.fire({
          icon: 'success',
          title: '¡Proyecto creado!',
          text: 'El proyecto se ha creado correctamente',
          toast: true,
          position: 'top-end',
          showConfirmButton: false,
          timer: 3000,
          timerProgressBar: true
        });
      }

      setMostrarFormTarea(false);
      setTareaEditando(null);
      setFormTarea({ 
        titulo: '', 
        descripcion: '', 
        fecha_entrega: '', 
        ciclo: bimestreGlobal,
        archivo: null,
        archivoNombre: '',
        enlace: '' 
      });
      await cargarTareas();
    } catch (error) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: error.response?.data?.error || (tareaEditando ? 'No se pudo actualizar el proyecto' : 'No se pudo crear el proyecto'),
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000
      });
    } finally {
      setGuardandoTarea(false);
    }
  };

  // Función auxiliar para formatear fecha para input date (YYYY-MM-DD)
  const formatearFechaParaInput = (fecha) => {
    if (!fecha) return '';
    try {
      // Si ya está en formato YYYY-MM-DD, retornarlo
      if (typeof fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
        return fecha;
      }
      // Si tiene hora, extraer solo la fecha
      const fechaObj = new Date(fecha);
      if (isNaN(fechaObj.getTime())) return '';
      const año = fechaObj.getFullYear();
      const mes = String(fechaObj.getMonth() + 1).padStart(2, '0');
      const dia = String(fechaObj.getDate()).padStart(2, '0');
      return `${año}-${mes}-${dia}`;
    } catch (error) {
      console.error('Error formateando fecha:', error);
      return '';
    }
  };

  const handleEditarTarea = async (tarea) => {
    try {
      // Cargar tarea completa con archivos
      const response = await api.get('/docente/aula-virtual/tareas', {
        params: { asignatura_id: asignaturaId, ciclo: tarea.ciclo || bimestreGlobal }
      });
      const tareaCompleta = response.data.tareas.find(t => t.id === tarea.id);
      
      const fechaEntrega = tareaCompleta?.fecha_entrega || tarea.fecha_entrega || '';
      
      setTareaEditando(tareaCompleta || tarea);
      setFormTarea({
        titulo: tareaCompleta?.titulo || tarea.titulo || '',
        descripcion: tareaCompleta?.descripcion || tarea.descripcion || '',
        fecha_entrega: formatearFechaParaInput(fechaEntrega),
        ciclo: tareaCompleta?.ciclo || tarea.ciclo || bimestreGlobal,
        archivo: null,
        archivoNombre: tareaCompleta?.archivos && tareaCompleta.archivos.length > 0 ? 'Archivo existente' : '',
        enlace: tareaCompleta?.enlace_url || tareaCompleta?.enlace || tarea.enlace || ''
      });
      setMostrarFormTarea(true);
      setOpenDropdown(null);
    } catch (error) {
      console.error('Error cargando tarea para editar:', error);
      // Si falla, usar los datos básicos de la tarea
      setTareaEditando(tarea);
      setFormTarea({
        titulo: tarea.titulo || '',
        descripcion: tarea.descripcion || '',
        fecha_entrega: formatearFechaParaInput(tarea.fecha_entrega),
        ciclo: tarea.ciclo || bimestreGlobal,
        archivo: null,
        archivoNombre: '',
        enlace: tarea.enlace || ''
      });
      setMostrarFormTarea(true);
      setOpenDropdown(null);
    }
  };

  const handleEliminarTarea = async (tarea) => {
    const result = await Swal.fire({
      title: '¿Estás seguro?',
      text: `¿Deseas eliminar el proyecto "${tarea.titulo}"?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    });

    if (result.isConfirmed) {
      try {
        await api.delete(`/docente/aula-virtual/tareas/${tarea.id}`);
        
        Swal.fire({
          icon: 'success',
          title: '¡Proyecto eliminado!',
          text: 'El proyecto se ha eliminado correctamente',
          toast: true,
          position: 'top-end',
          showConfirmButton: false,
          timer: 3000,
          timerProgressBar: true
        });

        setOpenDropdown(null);
        await cargarTareas();
      } catch (error) {
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: error.response?.data?.error || 'No se pudo eliminar el proyecto',
          toast: true,
          position: 'top-end',
          showConfirmButton: false,
          timer: 3000
        });
      }
    }
  };

  const handleVerDetallesTarea = async (tarea) => {
    try {
      // Cargar tarea completa con archivos
      const response = await api.get('/docente/aula-virtual/tareas', {
        params: { asignatura_id: asignaturaId, ciclo: tarea.ciclo || bimestreGlobal }
      });
      const tareaCompleta = response.data.tareas.find(t => t.id === tarea.id);
      setTareaDetalle(tareaCompleta || tarea);
      setMostrarDetallesTarea(true);
      setOpenDropdown(null);
    } catch (error) {
      console.error('Error cargando detalles de tarea:', error);
      setTareaDetalle(tarea);
      setMostrarDetallesTarea(true);
      setOpenDropdown(null);
    }
  };

  const handleMarcarEntregas = async (tarea) => {
    try {
      setTareaParaEntregas(tarea);
      setLoadingEntregas(true);
      setMostrarModalEntregas(true);
      setOpenDropdown(null);

      const response = await api.get(`/docente/aula-virtual/tareas/${tarea.id}/entregas`);
      
      setAlumnosEntregas(response.data.alumnos || []);
      setInfoTareaEntregas(response.data.tarea);
      
      // Inicializar notas temporales
      const notasIniciales = {};
      response.data.alumnos.forEach(alumno => {
        notasIniciales[alumno.matricula_id] = alumno.nota || '';
      });
      setNotasTemporales(notasIniciales);
    } catch (error) {
      console.error('Error cargando entregas:', error);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: error.response?.data?.error || 'No se pudieron cargar las entregas',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000
      });
    } finally {
      setLoadingEntregas(false);
    }
  };

  const handleGuardarTodasLasNotas = async () => {
    if (!tareaParaEntregas) return;

    const notasAGuardar = Object.keys(notasTemporales).filter(matriculaId => {
      const nota = notasTemporales[matriculaId];
      return nota && nota.trim() !== '';
    });

    if (notasAGuardar.length === 0) {
      Swal.fire({
        icon: 'info',
        title: 'Sin notas',
        text: 'No hay notas para guardar',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 2000
      });
      return;
    }

    try {
      // Guardar todas las notas
      await Promise.all(
        notasAGuardar.map(matriculaId =>
          api.put(`/docente/aula-virtual/tareas/${tareaParaEntregas.id}/entregas/${matriculaId}/nota`, {
            nota: notasTemporales[matriculaId]
          })
        )
      );

      Swal.fire({
        icon: 'success',
        title: '¡Notas guardadas!',
        text: `Se guardaron ${notasAGuardar.length} nota(s) correctamente`,
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000,
        timerProgressBar: true
      });
    } catch (error) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: error.response?.data?.error || 'No se pudieron guardar todas las notas',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000
      });
    }
  };

  const handleAsignarRegistroExamen = async (examen) => {
    try {
      setExamenParaAsignar(examen);
      setLoadingAsignarRegistroExamen(true);
      setMostrarModalAsignarRegistroExamen(true);
      setOpenDropdown(null);

      const response = await api.get(`/docente/aula-virtual/examenes/${examen.id}/asignar-registro`);
      
      setDatosAsignarRegistroExamen(response.data);
      
      // Seleccionar el primer criterio/indicador por defecto si hay
      if (response.data.criterios && response.data.criterios.length > 0) {
        const primerCriterio = response.data.criterios[0];
        if (primerCriterio.indicadores && primerCriterio.indicadores.length > 0) {
          const primerIndicador = primerCriterio.indicadores[0];
          setCriterioSeleccionadoExamen(`${primerCriterio.id}_${primerIndicador.id}`);
          setCuadroSeleccionadoExamen('0');
        }
      }
    } catch (error) {
      console.error('Error cargando datos para asignar registro:', error);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: error.response?.data?.error || 'No se pudieron cargar los datos',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000
      });
    } finally {
      setLoadingAsignarRegistroExamen(false);
    }
  };

  const handleGuardarAsignarRegistroExamen = async () => {
    if (!examenParaAsignar || !criterioSeleccionadoExamen || cuadroSeleccionadoExamen === '') {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'Debe seleccionar un criterio y un cuadro',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000
      });
      return;
    }

    const result = await Swal.fire({
      title: '¿Estás seguro?',
      text: 'Se reemplazarán las notas en el registro del cuadro seleccionado con los mejores puntajes del examen',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#3085d6',
      cancelButtonColor: '#d33',
      confirmButtonText: 'Sí, asignar',
      cancelButtonText: 'Cancelar'
    });

    if (!result.isConfirmed) return;

    setGuardandoAsignarRegistroExamen(true);

    try {
      await api.post(`/docente/aula-virtual/examenes/${examenParaAsignar.id}/asignar-registro`, {
        criterio_id: criterioSeleccionadoExamen,
        cuadro: cuadroSeleccionadoExamen
      });

      Swal.fire({
        icon: 'success',
        title: '¡Notas asignadas!',
        text: 'Las notas se han asignado al registro correctamente',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000,
        timerProgressBar: true
      });

      setMostrarModalAsignarRegistroExamen(false);
      setExamenParaAsignar(null);
      setDatosAsignarRegistroExamen(null);
      setCriterioSeleccionadoExamen('');
      setCuadroSeleccionadoExamen('0');
    } catch (error) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: error.response?.data?.error || 'No se pudieron asignar las notas',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000
      });
    } finally {
      setGuardandoAsignarRegistroExamen(false);
    }
  };

  const handleAsignarRegistro = async (tarea) => {
    try {
      setTareaParaAsignar(tarea);
      setLoadingAsignarRegistro(true);
      setMostrarModalAsignarRegistro(true);
      setOpenDropdown(null);

      const response = await api.get(`/docente/aula-virtual/tareas/${tarea.id}/asignar-registro`);
      
      setDatosAsignarRegistro(response.data);
      
      // Seleccionar el primer criterio/indicador por defecto si hay
      if (response.data.criterios && response.data.criterios.length > 0) {
        const primerCriterio = response.data.criterios[0];
        if (primerCriterio.indicadores && primerCriterio.indicadores.length > 0) {
          const primerIndicador = primerCriterio.indicadores[0];
          setCriterioSeleccionado(`${primerCriterio.id}_${primerIndicador.id}`);
          setCuadroSeleccionado('0');
        }
      }
    } catch (error) {
      console.error('Error cargando datos para asignar registro:', error);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: error.response?.data?.error || 'No se pudieron cargar los datos',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000
      });
    } finally {
      setLoadingAsignarRegistro(false);
    }
  };

  const handleGuardarAsignarRegistro = async () => {
    if (!tareaParaAsignar || !criterioSeleccionado || cuadroSeleccionado === '') {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'Debe seleccionar un criterio y un cuadro',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000
      });
      return;
    }

    const result = await Swal.fire({
      title: '¿Estás seguro?',
      text: 'Se reemplazarán las notas en el registro del cuadro seleccionado',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#3085d6',
      cancelButtonColor: '#d33',
      confirmButtonText: 'Sí, asignar',
      cancelButtonText: 'Cancelar'
    });

    if (!result.isConfirmed) return;

    setGuardandoAsignarRegistro(true);

    try {
      await api.post(`/docente/aula-virtual/tareas/${tareaParaAsignar.id}/asignar-registro`, {
        criterio_id: criterioSeleccionado,
        cuadro: cuadroSeleccionado
      });

      Swal.fire({
        icon: 'success',
        title: '¡Notas asignadas!',
        text: 'Las notas se han asignado al registro correctamente',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000,
        timerProgressBar: true
      });

      setMostrarModalAsignarRegistro(false);
      setTareaParaAsignar(null);
      setDatosAsignarRegistro(null);
      setCriterioSeleccionado('');
      setCuadroSeleccionado('0');
    } catch (error) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: error.response?.data?.error || 'No se pudieron asignar las notas',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000
      });
    } finally {
      setGuardandoAsignarRegistro(false);
    }
  };

  const handleVerEntregas = async (tarea) => {
    try {
      // Cargar entregas de la tarea
      const response = await api.get('/docente/aula-virtual/tareas', {
        params: { asignatura_id: asignaturaId }
      });
      const tareaConEntregas = response.data.tareas.find(t => t.id === tarea.id);
      setTareaSeleccionada(tareaConEntregas || tarea);
    } catch (error) {
      console.error('Error cargando entregas:', error);
      setTareaSeleccionada(tarea);
    }
  };

  const handleCalificarTarea = async (entregaId, nota) => {
    if (!tareaSeleccionada) return;
    
    try {
      await api.put(`/docente/aula-virtual/tareas/${tareaSeleccionada.id}/calificar`, {
        entrega_id: entregaId,
        nota: parseFloat(nota)
      });

      Swal.fire({
        icon: 'success',
        title: '¡Proyecto calificado!',
        text: 'La calificación se ha guardado correctamente',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000,
        timerProgressBar: true
      });

      await cargarTareas();
      // Actualizar entregas de la tarea seleccionada
      if (tareaSeleccionada) {
        await handleVerEntregas(tareaSeleccionada);
      }
    } catch (error) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: error.response?.data?.error || 'No se pudo calificar el proyecto',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000
      });
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="docente-aula-loading">
          <div className="loading-spinner">Cargando aula virtual...</div>
        </div>
      </DashboardLayout>
    );
  }

  const toggleCard = (cardName) => {
    if (expandedCard === cardName) {
      setExpandedCard(null);
    } else {
      setExpandedCard(cardName);
    }
  };

  const renderCardContent = (cardName) => {
    switch(cardName) {
      case 'temas':
        return renderTemasContent();
      case 'tareas':
        return renderTareasContent();
      case 'sesiones':
        return renderSesionesContent();
      case 'examenes':
        return renderExamenesContent();
      case 'videos':
        return renderVideosContent();
      case 'enlaces':
        return renderEnlacesContent();
      default:
        return null;
    }
  };

  const renderTemasContent = () => {
    // Filtrar archivos por el bimestre global
    const archivosFiltrados = archivos.filter(archivo => archivo.ciclo === bimestreGlobal);

    return (
      <div className="card-content-expanded">
        <div className="temas-toolbar">
          <button
            type="button"
            className="btn-biblioteca-inline"
            onClick={(e) => { e.stopPropagation(); abrirModalBiblioteca(); }}
          >
            📖 Biblioteca de temas
          </button>
        </div>
        {loading ? (
          <div className="empty-state">
            <p>Cargando temas interactivos...</p>
          </div>
        ) : archivosFiltrados.length > 0 ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <table>
              <thead>
                <tr>
                  <th>NOMBRE</th>
                  <th>FECHA</th>
                  <th>ACCIONES</th>
                </tr>
              </thead>
              <SortableContext
                items={archivosFiltrados.map(archivo => archivo.id)}
                strategy={verticalListSortingStrategy}
              >
                <tbody>
                  {archivosFiltrados.map((archivo) => (
                    <SortableItem
                      key={archivo.id}
                      archivo={archivo}
                      onEdit={handleEditarTema}
                      onDelete={handleEliminarTema}
                      openDropdown={openDropdown}
                      toggleDropdown={toggleDropdown}
                      dropdownPosition={dropdownPosition}
                      buttonRef={buttonRef}
                    />
                  ))}
                </tbody>
              </SortableContext>
            </table>
          </DndContext>
        ) : (
          <div className="empty-state">
            <p>No hay temas interactivos para este bimestre</p>
          </div>
        )}
      </div>
    );
  };

  const renderTareasContent = () => (
    <div className="card-content-expanded">
      <div className="temas-toolbar">
        <button type="button" className="btn-biblioteca-inline" onClick={(e) => { e.stopPropagation(); abrirModalBiblioteca('tareas'); }}>
          📖 Biblioteca de proyectos
        </button>
      </div>
      {/* Modal de Detalles de Tarea */}
      {mostrarDetallesTarea && tareaDetalle && createPortal(
        <div 
          className="modal-tarea-detalle-overlay"
          onClick={() => {
            setMostrarDetallesTarea(false);
            setTareaDetalle(null);
          }}
        >
          <div 
            className="modal-tarea-detalle-container"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-tarea-detalle-title"
          >
            <div className="modal-tarea-detalle-header">
              <h2 id="modal-tarea-detalle-title">
                📝 Detalles del Proyecto
              </h2>
              <button
                className="modal-tarea-detalle-close"
                onClick={() => {
                  setMostrarDetallesTarea(false);
                  setTareaDetalle(null);
                }}
                aria-label="Cerrar"
              >
                ×
              </button>
            </div>

            <div className="modal-tarea-detalle-body">
              <table className="tarea-detalle-table">
                <tbody>
                  <tr>
                    <td className="tarea-detalle-label">TÍTULO</td>
                    <td className="tarea-detalle-value">{tareaDetalle.titulo || 'Sin título'}</td>
                  </tr>
                  <tr>
                    <td className="tarea-detalle-label">DESCRIPCIÓN</td>
                    <td className="tarea-detalle-value">
                      {tareaDetalle.descripcion || <span className="text-muted">Sin descripción</span>}
                    </td>
                  </tr>
                  <tr>
                    <td className="tarea-detalle-label">FECHA DE REGISTRO</td>
                    <td className="tarea-detalle-value">
                      {new Date(tareaDetalle.fecha_hora).toLocaleDateString('es-PE', { 
                        day: '2-digit', 
                        month: '2-digit', 
                        year: 'numeric' 
                      })}
                    </td>
                  </tr>
                  <tr>
                    <td className="tarea-detalle-label">FECHA DE ENTREGA</td>
                    <td className="tarea-detalle-value">
                      {new Date(tareaDetalle.fecha_entrega).toLocaleDateString('es-PE', { 
                        day: '2-digit', 
                        month: '2-digit', 
                        year: 'numeric' 
                      })}
                    </td>
                  </tr>
                  <tr>
                    <td className="tarea-detalle-label">ENVIADO POR</td>
                    <td className="tarea-detalle-value">
                      {tareaDetalle.docente_nombre || 'Docente'}
                    </td>
                  </tr>
                  <tr>
                    <td className="tarea-detalle-label">ARCHIVOS ADJUNTOS</td>
                    <td className="tarea-detalle-value">
                      {tareaDetalle.archivos && tareaDetalle.archivos.length > 0 ? (
                        <div className="tarea-archivos-list">
                          {tareaDetalle.archivos.map((archivo, idx) => (
                            <a
                              key={idx}
                              href={archivo.archivo_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="tarea-archivo-link"
                            >
                              📎 {archivo.nombre}
                            </a>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted">Sin archivos adjuntos</span>
                      )}
                    </td>
                  </tr>
                  {tareaDetalle.enlace_url && (
                    <tr>
                      <td className="tarea-detalle-label">URL</td>
                      <td className="tarea-detalle-value">
                        <a
                          href={tareaDetalle.enlace_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="tarea-url-link"
                        >
                          🔗 {tareaDetalle.enlace_url}
                        </a>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>,
        document.body
      )}

      {tareas.length > 0 ? (
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Fecha de Registro</th>
              <th>Fecha de Entrega</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {tareas.map((tarea) => (
              <tr key={tarea.id}>
                <td className="text-center">{tarea.titulo}</td>
                <td className="text-center">{new Date(tarea.fecha_hora).toLocaleDateString('es-PE')}</td>
                <td className="text-center">{new Date(tarea.fecha_entrega).toLocaleDateString('es-PE')}</td>
                <td className="text-center">
                  <div className="btn-group-opciones">
                    <button 
                      className="btn-opciones"
                      ref={(el) => (buttonRef.current[`tarea-${tarea.id}`] = el)}
                      onClick={(e) => toggleDropdown(tarea.id, e, 'tarea')}
                    >
                      Opciones {openDropdown === `tarea-${tarea.id}` ? '▲' : '▼'}
                    </button>
                    {openDropdown === `tarea-${tarea.id}` && dropdownPosition && createPortal(
                      <div 
                        className="dropdown-menu-portal-aula"
                        style={{
                          position: 'fixed',
                          top: `${dropdownPosition.top}px`,
                          right: `${dropdownPosition.right}px`,
                          width: `${dropdownPosition.width}px`,
                          zIndex: 10000
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="dropdown-menu-opciones">
                          <a href="#" onClick={(e) => { e.preventDefault(); handleVerDetallesTarea(tarea); }}>
                            ℹ️ Ver Detalles
                          </a>
                          <a href="#" onClick={(e) => { e.preventDefault(); handleMarcarEntregas(tarea); }}>
                            ✓ Marcar Entregas
                          </a>
                          <a href="#" onClick={(e) => { e.preventDefault(); handleAsignarRegistro(tarea); }}>
                            📋 Asignar a Registro
                          </a>
                          <a href="#" onClick={(e) => { e.preventDefault(); handleEditarTarea(tarea); }}>
                            ✏️ Editar Proyecto
                          </a>
                          <a href="#" onClick={(e) => { e.preventDefault(); handleEliminarTarea(tarea); }}>
                            🗑️ Borrar Proyecto
                          </a>
                        </div>
                      </div>,
                      document.body
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="empty-state">
          <p>No hay tareas para este bimestre</p>
        </div>
      )}
    </div>
  );

  const renderSesionesContent = () => {
    const sesionesFiltradas = sesiones.filter(s => s.ciclo === bimestreGlobal);

    return (
      <div className="card-content-expanded">
        {sesionesFiltradas.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>NOMBRE</th>
                <th>FECHA</th>
                <th className="text-center">ACCIONES</th>
              </tr>
            </thead>
            <tbody>
              {sesionesFiltradas.map((sesion) => (
                <tr key={sesion.id}>
                  <td>{sesion.titulo}</td>
                  <td className="text-center">{sesion.fecha_hora ? new Date(sesion.fecha_hora).toLocaleDateString('es-PE') : '-'}</td>
                  <td className="text-center">
                    <div className="btn-group-opciones">
                      <button
                        className="btn-opciones"
                        ref={(el) => (buttonRef.current[`sesion-${sesion.id}`] = el)}
                        onClick={(e) => toggleDropdown(sesion.id, e, 'sesion')}
                      >
                        Opciones {openDropdown === `sesion-${sesion.id}` ? '▲' : '▼'}
                      </button>
                      {openDropdown === `sesion-${sesion.id}` && dropdownPosition && createPortal(
                        <div
                          className="dropdown-menu-portal-aula"
                          style={{
                            position: 'fixed',
                            top: `${dropdownPosition.top}px`,
                            right: `${dropdownPosition.right}px`,
                            width: `${dropdownPosition.width}px`,
                            zIndex: 10000
                          }}
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="dropdown-menu-opciones">
                            {sesion.archivo_url && (
                              <a href={sesion.archivo_url} target="_blank" rel="noopener noreferrer" onClick={() => setOpenDropdown(null)}>
                                📄 Ver Archivo
                              </a>
                            )}
                            <a href="#" onClick={(e) => { e.preventDefault(); setOpenDropdown(null); handleEditarSesion(sesion); }}>
                              ✏️ Editar Sesión
                            </a>
                            <a href="#" onClick={(e) => { e.preventDefault(); setOpenDropdown(null); handleEliminarSesion(sesion); }}>
                              🗑️ Eliminar
                            </a>
                          </div>
                        </div>,
                        document.body
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty-state">
            <p>No hay sesiones para este bimestre</p>
          </div>
        )}
      </div>
    );
  };

  const renderExamenesContent = () => (
    <div className="card-content-expanded">
      <div className="temas-toolbar">
        <button type="button" className="btn-biblioteca-inline" onClick={(e) => { e.stopPropagation(); abrirModalBiblioteca('examenes'); }}>
          📖 Biblioteca de exámenes
        </button>
      </div>
      {examenes.length > 0 ? (
        <table>
          <thead>
            <tr>
              <th>EXAMEN</th>
              <th>TIEMPO (MIN.)</th>
              <th>PREGUNTAS</th>
              <th>ESTADO</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {examenes.map((examen) => (
              <tr key={examen.id}>
                <td>{examen.titulo}</td>
                <td className="text-center">{examen.tiempo === 0 || !examen.tiempo ? 'ILIMITADO' : examen.tiempo}</td>
                <td className="text-center">{examen.total_preguntas || 0}</td>
                <td className="text-center">
                  <span className={`estado-badge ${examen.estado?.toLowerCase() || 'inactivo'}`}>
                    {examen.estado || 'INACTIVO'}
                  </span>
                </td>
                <td className="text-center">
                  <div className="btn-group-opciones">
                    <button 
                      className="btn-opciones"
                      ref={(el) => (buttonRef.current[`examen-${examen.id}`] = el)}
                      onClick={(e) => toggleDropdown(examen.id, e, 'examen')}
                    >
                      Opciones {openDropdown === `examen-${examen.id}` ? '▲' : '▼'}
                    </button>
                    {openDropdown === `examen-${examen.id}` && dropdownPosition && createPortal(
                      <div 
                        className="dropdown-menu-portal-aula"
                        style={{
                          position: 'fixed',
                          top: `${dropdownPosition.top}px`,
                          right: `${dropdownPosition.right}px`,
                          width: `${dropdownPosition.width}px`,
                          zIndex: 10000
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="dropdown-menu-opciones">
                          <a href="#" onClick={(e) => { e.preventDefault(); handlePreguntasAlternativas(examen); }}>
                            📝 Preguntas / Alternativas
                          </a>
                          <a href="#" onClick={(e) => { e.preventDefault(); handleVerResultados(examen); }}>
                            📊 Ver Resultados
                          </a>
                          <a href="#" onClick={(e) => { e.preventDefault(); handleAsignarRegistroExamen(examen); }}>
                            📋 Asignar al Registro
                          </a>
                          <a href="#" onClick={(e) => { e.preventDefault(); handleHabilitarDeshabilitarExamen(examen); }}>
                            🔒 Habilitar / Deshabilitar
                          </a>
                          <a href="#" onClick={(e) => { e.preventDefault(); handleEditarExamen(examen); }}>
                            ✏️ Editar Examen
                          </a>
                          <a href="#" onClick={(e) => { e.preventDefault(); handleEliminarExamen(examen); }}>
                            🗑️ Eliminar Examen
                          </a>
                        </div>
                      </div>,
                      document.body
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="empty-state">
          <p>No hay exámenes para este bimestre</p>
        </div>
      )}
    </div>
  );

  // Funciones para manejar videos
  const handleCrearVideo = async (e) => {
    e.preventDefault();
    
    if (!formVideo.descripcion || !formVideo.enlace || !formVideo.ciclo) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'Descripción, Enlace y Bimestre son requeridos',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000
      });
      return;
    }

    setGuardandoVideo(true);
    try {
      if (videoEditando) {
        await api.put(`/docente/aula-virtual/videos/${videoEditando.id}`, {
          descripcion: formVideo.descripcion,
          enlace: formVideo.enlace,
          ciclo: formVideo.ciclo
        });
        Swal.fire({
          icon: 'success',
          title: '¡Video actualizado!',
          text: 'El video se ha actualizado correctamente',
          toast: true,
          position: 'top-end',
          showConfirmButton: false,
          timer: 3000,
          timerProgressBar: true
        });
      } else {
        await api.post('/docente/aula-virtual/videos', {
          asignatura_id: asignaturaId,
          descripcion: formVideo.descripcion,
          enlace: formVideo.enlace,
          ciclo: formVideo.ciclo
        });
        Swal.fire({
          icon: 'success',
          title: '¡Video creado!',
          text: 'El video se ha creado correctamente',
          toast: true,
          position: 'top-end',
          showConfirmButton: false,
          timer: 3000,
          timerProgressBar: true
        });
      }

      setMostrarFormVideo(false);
      setVideoEditando(null);
      setFormVideo({ descripcion: '', enlace: '', ciclo: bimestreGlobal });
      await cargarVideos(bimestreGlobal);
    } catch (error) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: error.response?.data?.error || 'No se pudo guardar el video',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000
      });
    } finally {
      setGuardandoVideo(false);
    }
  };

  const handleEditarVideo = (video) => {
    setVideoEditando(video);
    setFormVideo({
      descripcion: video.descripcion || '',
      enlace: video.enlace || '',
      ciclo: video.ciclo || bimestreGlobal
    });
    setMostrarFormVideo(true);
    setOpenDropdown(null);
  };

  const handleEliminarVideo = async (video) => {
    const result = await Swal.fire({
      title: '¿Estás seguro?',
      text: `¿Deseas eliminar el video "${video.descripcion}"?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    });

    if (result.isConfirmed) {
      try {
        await api.delete(`/docente/aula-virtual/videos/${video.id}`);
        
        Swal.fire({
          icon: 'success',
          title: '¡Video eliminado!',
          text: 'El video se ha eliminado correctamente',
          toast: true,
          position: 'top-end',
          showConfirmButton: false,
          timer: 3000,
          timerProgressBar: true
        });

        setOpenDropdown(null);
        await cargarVideos(bimestreGlobal);
      } catch (error) {
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: error.response?.data?.error || 'No se pudo eliminar el video',
          toast: true,
          position: 'top-end',
          showConfirmButton: false,
          timer: 3000
        });
      }
    }
  };

  // Funciones para manejar exámenes
  const handleEditarExamen = (examen) => {
    // Formatear fechas para inputs de tipo date (YYYY-MM-DD)
    // Usar el mismo patrón que fecha_nacimiento en Mi Perfil
    const formatearFechaParaInput = (fecha) => {
      if (!fecha) return '';
      try {
        // Si es una fecha en formato string
        if (typeof fecha === 'string') {
          // Verificar si es una fecha inválida de MySQL (0000-00-00)
          if (fecha === '0000-00-00' || fecha === '0000-00-00 00:00:00' || fecha.trim() === '') {
            return '';
          }
          
          // Manejar formato ISO con 'T' o formato con espacio (igual que fecha_nacimiento)
          if (fecha.includes('T')) {
            return fecha.split('T')[0];
          } else if (fecha.includes(' ')) {
            return fecha.split(' ')[0];
          } else if (fecha.match(/^\d{4}-\d{2}-\d{2}$/)) {
            // Ya está en formato YYYY-MM-DD, validar que sea válida
            const [año, mes, dia] = fecha.split('-').map(Number);
            if (año > 0 && mes > 0 && dia > 0 && mes <= 12 && dia <= 31) {
              return fecha;
            }
            return '';
          }
        }
        // Si es un objeto Date
        if (fecha instanceof Date && !isNaN(fecha.getTime()) && fecha.getFullYear() > 1900) {
          return fecha.toISOString().split('T')[0];
        }
        return '';
      } catch (error) {
        console.error('Error formateando fecha:', error, 'Fecha original:', fecha);
        return '';
      }
    };

    // Determinar si tiene fecha y hora habilitada
    // Verificar que tenga fechas válidas (no 0000-00-00) y horas válidas (no 00:00:00)
    const fechaDesdeFormateada = formatearFechaParaInput(examen.fecha_desde);
    const fechaHastaFormateada = formatearFechaParaInput(examen.fecha_hasta);
    const tieneFechaHora = fechaDesdeFormateada && fechaDesdeFormateada !== '' &&
                           fechaHastaFormateada && fechaHastaFormateada !== '' &&
                           examen.hora_desde && examen.hora_desde !== '00:00:00' && examen.hora_desde.trim() !== '' &&
                           examen.hora_hasta && examen.hora_hasta !== '00:00:00' && examen.hora_hasta.trim() !== '' &&
                           examen.hora_desde !== '23:59:59' && examen.hora_hasta !== '23:59:59';

    setExamenEditando(examen);
    setFormExamen({
      titulo: examen.titulo || '',
      tipo: examen.tipo || 'VIRTUAL',
      tipo_puntaje: examen.tipo_puntaje || 'GENERAL',
      puntos_correcta: examen.puntos_correcta || 1,
      penalizar_incorrecta: examen.penalizar_incorrecta || 'NO',
      penalizacion_incorrecta: examen.penalizacion_incorrecta || 0,
      tiempo: examen.tiempo || 60,
      intentos: examen.intentos || 1,
      orden_preguntas: examen.orden_preguntas || 'PREDETERMINADO',
      preguntas_max: examen.preguntas_max || 1,
      ciclo: examen.ciclo || bimestreGlobal,
      estado: examen.estado || 'INACTIVO',
      habilitar_fecha_hora: tieneFechaHora,
      fecha_desde: formatearFechaParaInput(examen.fecha_desde),
      fecha_hasta: formatearFechaParaInput(examen.fecha_hasta),
      hora_desde: examen.hora_desde ? examen.hora_desde.substring(0, 5) : '08:00', // Convertir HH:MM:SS a HH:MM
      hora_hasta: examen.hora_hasta ? examen.hora_hasta.substring(0, 5) : '20:00',
      archivo_pdf: null // No cargamos el archivo existente, solo permitimos reemplazarlo
    });
    setMostrarFormExamen(true);
    setOpenDropdown(null);
  };

  const handleEliminarExamen = async (examen) => {
    const result = await Swal.fire({
      title: '¿Estás seguro?',
      text: `¿Deseas eliminar el examen "${examen.titulo}"? Esta acción también eliminará todas las preguntas y alternativas asociadas.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    });

    if (result.isConfirmed) {
      try {
        await api.delete(`/docente/aula-virtual/examenes/${examen.id}`);
        
        Swal.fire({
          icon: 'success',
          title: '¡Examen eliminado!',
          text: 'El examen y todos sus datos asociados se han eliminado correctamente',
          toast: true,
          position: 'top-end',
          showConfirmButton: false,
          timer: 3000,
          timerProgressBar: true
        });

        setOpenDropdown(null);
        await cargarExamenes();
      } catch (error) {
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: error.response?.data?.error || 'No se pudo eliminar el examen',
          toast: true,
          position: 'top-end',
          showConfirmButton: false,
          timer: 3000
        });
      }
    }
  };

  const handleHabilitarDeshabilitarExamen = async (examen) => {
    const nuevoEstado = examen.estado === 'ACTIVO' ? 'INACTIVO' : 'ACTIVO';
    const accion = nuevoEstado === 'ACTIVO' ? 'habilitar' : 'deshabilitar';
    
    const result = await Swal.fire({
      title: `¿${accion.charAt(0).toUpperCase() + accion.slice(1)} examen?`,
      text: `¿Deseas ${accion} el examen "${examen.titulo}"?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: nuevoEstado === 'ACTIVO' ? '#10b981' : '#ef4444',
      cancelButtonColor: '#6b7280',
      confirmButtonText: `Sí, ${accion}`,
      cancelButtonText: 'Cancelar'
    });

    if (result.isConfirmed) {
      try {
        const response = await api.put(`/docente/aula-virtual/examenes/${examen.id}/estado`, {
          estado: nuevoEstado
        });
        
        Swal.fire({
          icon: 'success',
          title: `¡Examen ${nuevoEstado === 'ACTIVO' ? 'habilitado' : 'deshabilitado'}!`,
          text: response.data.message || `El examen se ha ${accion}do correctamente`,
          toast: true,
          position: 'top-end',
          showConfirmButton: false,
          timer: 3000,
          timerProgressBar: true
        });

        setOpenDropdown(null);
        await cargarExamenes(); // Recargar para actualizar la grilla
      } catch (error) {
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: error.response?.data?.error || `No se pudo ${accion} el examen`,
          toast: true,
          position: 'top-end',
          showConfirmButton: false,
          timer: 3000
        });
      }
    }
  };

  const handleVerResultados = async (examen) => {
    setExamenParaResultados(examen);
    setMostrarResultadosExamen(true);
    setCargandoResultados(true);
    setOpenDropdown(null);
    
    try {
      const response = await api.get(`/docente/aula-virtual/examenes/${examen.id}/resultados`);
      setResultadosExamen(response.data.resultados || []);
    } catch (error) {
      console.error('Error cargando resultados:', error);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: error.response?.data?.error || 'No se pudieron cargar los resultados',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000
      });
    } finally {
      setCargandoResultados(false);
    }
  };

  const handleVerDetallesResultado = async (resultado) => {
    // Si no tiene resultado, mostrar mensaje
    if (!resultado.resultado_id) {
      Swal.fire({
        icon: 'info',
        title: 'Sin resultado',
        text: 'El alumno aún no ha rendido este examen',
        confirmButtonText: 'Cerrar'
      });
      return;
    }

    setCargandoDetallesResultado(true);
    setMostrarDetallesResultado(true);
    setResultadoParaDetalles(resultado);
    
    try {
      const response = await api.get(`/docente/aula-virtual/resultados/${resultado.resultado_id}/detalles`);
      setDetallesResultado(response.data);
    } catch (error) {
      console.error('Error cargando detalles:', error);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: error.response?.data?.error || 'No se pudieron cargar los detalles',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000
      });
      setMostrarDetallesResultado(false);
    } finally {
      setCargandoDetallesResultado(false);
    }
  };

  const handleBorrarResultado = async (resultado) => {
    const result = await Swal.fire({
      title: '¿Estás seguro?',
      text: `¿Deseas eliminar el resultado de ${resultado.nombre_completo}?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    });

    if (result.isConfirmed) {
      try {
        await api.delete(`/docente/aula-virtual/resultados/${resultado.resultado_id}`);
        
        Swal.fire({
          icon: 'success',
          title: '¡Resultado eliminado!',
          text: `El resultado de ${resultado.nombre_completo} ha sido eliminado. El alumno podrá volver a dar el examen si tiene intentos disponibles.`,
          toast: true,
          position: 'top-end',
          showConfirmButton: false,
          timer: 4000,
          timerProgressBar: true
        });

        // Recargar resultados
        await handleVerResultados(examenParaResultados);
      } catch (error) {
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: error.response?.data?.error || 'No se pudo eliminar el resultado',
          toast: true,
          position: 'top-end',
          showConfirmButton: false,
          timer: 3000
        });
      }
    }
  };

  const handleDescargarPDF = async () => {
    if (!examenParaResultados) return;
    
    try {
      // Obtener la URL base del backend (sin /api al final)
      const hostname = window.location.hostname || '';
      const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
      const isDevelopment = isLocalhost;
      
      let apiBaseUrl;
      if (isDevelopment) {
        apiBaseUrl = 'http://localhost:5000';
      } else {
        // Producción: usar el mismo dominio
        const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
        apiBaseUrl = `${protocol}//${hostname}`;
      }
      
      const url = `${apiBaseUrl}/api/docente/aula-virtual/examenes/${examenParaResultados.id}/resultados/pdf`;
      
      // Obtener el token para autenticación
      const token = localStorage.getItem('token');
      
      // Hacer la petición con fetch para obtener el blob
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        throw new Error('Error al generar el PDF');
      }
      
      // Convertir la respuesta a blob
      const blob = await response.blob();
      
      // Crear un enlace temporal para descargar el PDF
      const link = document.createElement('a');
      const blobUrl = window.URL.createObjectURL(blob);
      link.href = blobUrl;
      link.download = `Resultados_${examenParaResultados.titulo.replace(/[^a-z0-9]/gi, '_')}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Limpiar el blob URL
      window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error('Error descargando PDF:', error);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: error.message || 'No se pudo descargar el PDF',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000
      });
    }
  };

  const handleBorrarTodosResultados = async () => {
    if (!examenParaResultados) return;

    // Contar cuántos resultados hay
    const totalResultados = resultadosExamen.filter(r => r.resultado_id !== null && r.resultado_id !== undefined).length;

    if (totalResultados === 0) {
      Swal.fire({
        icon: 'info',
        title: 'Sin resultados',
        text: 'No hay resultados para eliminar',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000
      });
      return;
    }

    const result = await Swal.fire({
      title: '¿Estás seguro?',
      html: `¿Deseas eliminar <strong>todos los resultados</strong> (${totalResultados}) de este examen?<br><br>Esta acción eliminará los resultados de todos los alumnos. Los alumnos podrán volver a dar el examen si tienen intentos disponibles.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Sí, eliminar todos',
      cancelButtonText: 'Cancelar'
    });

    if (result.isConfirmed) {
      try {
        // Mostrar loading
        Swal.fire({
          title: 'Eliminando...',
          text: 'Por favor espera mientras se eliminan los resultados',
          allowOutsideClick: false,
          allowEscapeKey: false,
          didOpen: () => {
            Swal.showLoading();
          }
        });

        const response = await api.delete(`/docente/aula-virtual/examenes/${examenParaResultados.id}/resultados/todos`);
        
        Swal.fire({
          icon: 'success',
          title: '¡Resultados eliminados!',
          text: response.data.message,
          toast: true,
          position: 'top-end',
          showConfirmButton: false,
          timer: 4000,
          timerProgressBar: true
        });

        // Recargar resultados
        await handleVerResultados(examenParaResultados);
      } catch (error) {
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: error.response?.data?.error || 'No se pudieron eliminar los resultados',
          toast: true,
          position: 'top-end',
          showConfirmButton: false,
          timer: 3000
        });
      }
    }
  };

  const handleVolverCalificar = async () => {
    if (!examenParaResultados) return;

    const result = await Swal.fire({
      title: '¿Estás seguro?',
      text: 'Se recalificarán todos los resultados del examen. Se sobreescribirán las calificaciones actuales con los nuevos parámetros del examen.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#3085d6',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Sí, recalificar',
      cancelButtonText: 'Cancelar'
    });

    if (result.isConfirmed) {
      try {
        // Mostrar loading
        Swal.fire({
          title: 'Recalificando...',
          text: 'Por favor espera mientras se recalifican los resultados',
          allowOutsideClick: false,
          allowEscapeKey: false,
          didOpen: () => {
            Swal.showLoading();
          }
        });

        const response = await api.post(`/docente/aula-virtual/examenes/${examenParaResultados.id}/calificar`);
        
        Swal.fire({
          icon: 'success',
          title: '¡Recalificación completada!',
          text: response.data.message,
          confirmButtonText: 'Aceptar'
        });

        // Recargar resultados
        await handleVerResultados(examenParaResultados);
      } catch (error) {
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: error.response?.data?.error || 'No se pudo recalificar el examen',
          confirmButtonText: 'Aceptar'
        });
      }
    }
  };

  // Funciones para manejar preguntas y alternativas
  const handlePreguntasAlternativas = async (examen) => {
    setExamenSeleccionado(examen);
    setMostrarPreguntasAlternativas(true);
    setOpenDropdown(null);
    await cargarPreguntas(examen.id);
  };

  const cargarPreguntas = async (examenId) => {
    setCargandoPreguntas(true);
    try {
      const response = await api.get(`/docente/aula-virtual/examenes/${examenId}/preguntas`);
      setPreguntas(response.data.preguntas || []);
    } catch (error) {
      console.error('Error cargando preguntas:', error);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: error.response?.data?.error || 'No se pudieron cargar las preguntas',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000
      });
    } finally {
      setCargandoPreguntas(false);
    }
  };

  const handleNuevaPregunta = (examen) => {
    setPreguntaEditando(null);
    setFormPregunta({
      descripcion: '',
      tipo: 'ALTERNATIVAS',
      puntos: 0,
      datos_adicionales: null
    });
    setAlternativas([]);
    setMostrarFormPregunta(true);
  };

  const handleEditarPregunta = async (pregunta) => {
    setPreguntaEditando(pregunta);
    setFormPregunta({
      descripcion: pregunta.descripcion || '',
      tipo: pregunta.tipo || 'ALTERNATIVAS',
      puntos: pregunta.puntos || 0,
      datos_adicionales: pregunta.datos_adicionales ? (typeof pregunta.datos_adicionales === 'string' ? JSON.parse(pregunta.datos_adicionales) : pregunta.datos_adicionales) : null
    });
    
    // Cargar alternativas de la pregunta
    try {
      const response = await api.get(`/docente/aula-virtual/preguntas/${pregunta.id}/alternativas`);
      setAlternativas(response.data.alternativas || []);
    } catch (error) {
      console.error('Error cargando alternativas:', error);
      setAlternativas([]);
    }
    
    setMostrarFormPregunta(true);
  };

  const handleEliminarPregunta = async (pregunta) => {
    const result = await Swal.fire({
      title: '¿Estás seguro?',
      text: `¿Deseas eliminar esta pregunta? Esta acción también eliminará todas las alternativas asociadas.`,
      icon: 'warning',
      showCancelButton: true,
      confirmColor: '#d33',
      cancelColor: '#3085d6',
      confirmText: 'Sí, eliminar',
      cancelText: 'Cancelar'
    });

    if (result.isConfirmed) {
      try {
        await api.delete(`/docente/aula-virtual/preguntas/${pregunta.id}`);
        
        Swal.fire({
          icon: 'success',
          title: '¡Pregunta eliminada!',
          text: 'La pregunta y sus alternativas se han eliminado correctamente',
          toast: true,
          position: 'top-end',
          showConfirmButton: false,
          timer: 3000,
          timerProgressBar: true
        });

        await cargarPreguntas(examenSeleccionado.id);
        // Recargar la lista de exámenes para actualizar el contador de preguntas en la grilla
        await cargarExamenes(cicloExamenes);
      } catch (error) {
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: error.response?.data?.error || 'No se pudo eliminar la pregunta',
          toast: true,
          position: 'top-end',
          showConfirmButton: false,
          timer: 3000
        });
      }
    }
  };

  // Funciones para manejar enlaces
  const handleCrearEnlace = async (e) => {
    e.preventDefault();
    
    if (!formEnlace.descripcion || !formEnlace.enlace || !formEnlace.ciclo) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'Descripción, Enlace y Bimestre son requeridos',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000
      });
      return;
    }

    setGuardandoEnlace(true);
    try {
      if (enlaceEditando) {
        await api.put(`/docente/aula-virtual/enlaces/${enlaceEditando.id}`, {
          descripcion: formEnlace.descripcion,
          enlace: formEnlace.enlace,
          ciclo: formEnlace.ciclo
        });
        Swal.fire({
          icon: 'success',
          title: '¡Enlace actualizado!',
          text: 'El enlace se ha actualizado correctamente',
          toast: true,
          position: 'top-end',
          showConfirmButton: false,
          timer: 3000,
          timerProgressBar: true
        });
      } else {
        await api.post('/docente/aula-virtual/enlaces', {
          asignatura_id: asignaturaId,
          descripcion: formEnlace.descripcion,
          enlace: formEnlace.enlace,
          ciclo: formEnlace.ciclo
        });
        Swal.fire({
          icon: 'success',
          title: '¡Enlace creado!',
          text: 'El enlace se ha creado correctamente',
          toast: true,
          position: 'top-end',
          showConfirmButton: false,
          timer: 3000,
          timerProgressBar: true
        });
      }

      setMostrarFormEnlace(false);
      setEnlaceEditando(null);
      setFormEnlace({ descripcion: '', enlace: '', ciclo: bimestreGlobal });
      await cargarEnlaces(bimestreGlobal);
    } catch (error) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: error.response?.data?.error || 'No se pudo guardar el enlace',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000
      });
    } finally {
      setGuardandoEnlace(false);
    }
  };

  const handleEditarEnlace = (enlace) => {
    setEnlaceEditando(enlace);
    setFormEnlace({
      descripcion: enlace.descripcion || '',
      enlace: enlace.enlace || '',
      ciclo: enlace.ciclo || bimestreGlobal
    });
    setMostrarFormEnlace(true);
    setOpenDropdown(null);
  };

  const handleEliminarEnlace = async (enlace) => {
    const result = await Swal.fire({
      title: '¿Estás seguro?',
      text: `¿Deseas eliminar el enlace "${enlace.descripcion}"?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    });

    if (result.isConfirmed) {
      try {
        await api.delete(`/docente/aula-virtual/enlaces/${enlace.id}`);
        
        Swal.fire({
          icon: 'success',
          title: '¡Enlace eliminado!',
          text: 'El enlace se ha eliminado correctamente',
          toast: true,
          position: 'top-end',
          showConfirmButton: false,
          timer: 3000,
          timerProgressBar: true
        });

        setOpenDropdown(null);
        await cargarEnlaces(bimestreGlobal);
      } catch (error) {
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: error.response?.data?.error || 'No se pudo eliminar el enlace',
          toast: true,
          position: 'top-end',
          showConfirmButton: false,
          timer: 3000
        });
      }
    }
  };

  const handleCrearSesion = async (e) => {
    e.preventDefault();
    if (!formSesion.tema_id || !formSesion.archivo || !formSesion.ciclo) {
      Swal.fire({
        icon: 'warning',
        title: 'Campos requeridos',
        text: 'Selecciona un tema y sube un archivo PDF',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000
      });
      return;
    }
    setGuardandoSesion(true);
    try {
      const formData = new FormData();
      formData.append('asignatura_id', asignaturaId);
      formData.append('tema_id', formSesion.tema_id);
      formData.append('descripcion', formSesion.descripcion || '');
      formData.append('ciclo', formSesion.ciclo);
      formData.append('archivo', formSesion.archivo);
      await api.post('/docente/aula-virtual/sesiones', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      Swal.fire({
        icon: 'success',
        title: '¡Sesión creada!',
        text: 'La sesión se ha registrado correctamente',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 2000
      });
      setMostrarFormSesion(false);
      setFormSesion({ tema_id: '', descripcion: '', archivo: null, archivoNombre: '', ciclo: bimestreGlobal });
      await cargarSesiones();
    } catch (error) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: error.response?.data?.error || 'No se pudo crear la sesión',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000
      });
    } finally {
      setGuardandoSesion(false);
    }
  };

  const handleEditarSesion = (sesion) => {
    setSesionEditando(sesion);
    setFormSesion({
      tema_id: String(sesion.tema_id),
      descripcion: sesion.descripcion || '',
      archivo: null,
      archivoNombre: '',
      ciclo: sesion.ciclo ?? bimestreGlobal
    });
    setMostrarFormSesion(true);
  };

  const handleActualizarSesion = async (e) => {
    e.preventDefault();
    if (!sesionEditando || !formSesion.tema_id || !formSesion.ciclo) {
      Swal.fire({
        icon: 'warning',
        title: 'Campos requeridos',
        text: 'Selecciona un tema',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000
      });
      return;
    }
    setGuardandoSesion(true);
    try {
      const formData = new FormData();
      formData.append('asignatura_id', asignaturaId);
      formData.append('tema_id', formSesion.tema_id);
      formData.append('descripcion', formSesion.descripcion || '');
      formData.append('ciclo', formSesion.ciclo);
      if (formSesion.archivo) formData.append('archivo', formSesion.archivo);
      await api.put(`/docente/aula-virtual/sesiones/${sesionEditando.id}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      Swal.fire({
        icon: 'success',
        title: '¡Sesión actualizada!',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 2000
      });
      setMostrarFormSesion(false);
      setSesionEditando(null);
      setFormSesion({ tema_id: '', descripcion: '', archivo: null, archivoNombre: '', ciclo: bimestreGlobal });
      await cargarSesiones();
    } catch (error) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: error.response?.data?.error || 'No se pudo actualizar la sesión',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000
      });
    } finally {
      setGuardandoSesion(false);
    }
  };

  const handleEliminarSesion = async (sesion) => {
    const result = await Swal.fire({
      title: '¿Eliminar sesión?',
      text: `¿Deseas eliminar "${sesion.titulo}"?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Sí, eliminar'
    });
    if (result.isConfirmed) {
      try {
        await api.delete(`/docente/aula-virtual/sesiones/${sesion.id}`);
        Swal.fire({
          icon: 'success',
          title: 'Sesión eliminada',
          toast: true,
          position: 'top-end',
          showConfirmButton: false,
          timer: 2000
        });
        await cargarSesiones();
      } catch (error) {
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: error.response?.data?.error || 'No se pudo eliminar',
          toast: true,
          position: 'top-end',
          showConfirmButton: false,
          timer: 3000
        });
      }
    }
  };

  const renderVideosContent = () => {
    // Obtener videos del ciclo actual (bimestre global)
    const videosCicloActual = videos.filter(v => v.ciclo === bimestreGlobal);
    
    return (
    <div className="card-content-expanded">
        <div className="temas-toolbar">
          <button type="button" className="btn-biblioteca-inline" onClick={(e) => { e.stopPropagation(); abrirModalBiblioteca('videos'); }}>
            📖 Biblioteca de videos
          </button>
        </div>
        {/* Modal de Formulario de Video */}
        {mostrarFormVideo && createPortal(
          <div 
            className="modal-tema-overlay"
            onClick={() => {
              setMostrarFormVideo(false);
              setVideoEditando(null);
              setFormVideo({ descripcion: '', enlace: '', ciclo: bimestreGlobal });
            }}
          >
            <div 
              className="modal-tema-container"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="modal-video-title"
            >
              <div className="modal-tema-header">
                <h2 id="modal-video-title">
                  {videoEditando ? '✏️ Editar Video' : '🎥 Registrar Video'}
                </h2>
                <button
                  className="modal-tema-close"
                  onClick={() => {
                    setMostrarFormVideo(false);
                    setVideoEditando(null);
                    setFormVideo({ descripcion: '', enlace: '', ciclo: bimestreGlobal });
                  }}
                  aria-label="Cerrar"
                >
                  ×
                </button>
              </div>

              <div className="modal-tema-body">
                <form onSubmit={handleCrearVideo}>
                  <div className="form-group">
                    <label htmlFor="video-descripcion">
                      Descripción *
                    </label>
                    <input
                      type="text"
                      id="video-descripcion"
                      className="form-input"
                      value={formVideo.descripcion}
                      onChange={(e) => setFormVideo({ ...formVideo, descripcion: e.target.value })}
                      placeholder="Ej: Video sobre el Sistema Solar"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="video-enlace">
                      Enlace *
                    </label>
                    <input
                      type="url"
                      id="video-enlace"
                      className="form-input"
                      value={formVideo.enlace}
                      onChange={(e) => setFormVideo({ ...formVideo, enlace: e.target.value })}
                      placeholder="https://www.youtube.com/watch?v=..."
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="video-ciclo">
                      Bimestre *
                    </label>
                    <select
                      id="video-ciclo"
                      className="form-input"
                      value={formVideo.ciclo}
                      onChange={(e) => setFormVideo({ ...formVideo, ciclo: parseInt(e.target.value) })}
                      required
                    >
                      {Array.from({ length: totalNotas }, (_, i) => i + 1).map((bim) => (
                        <option key={bim} value={bim}>
                          Bimestre {bim}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-actions">
                    <button
                      type="button"
                      className="btn-cancelar"
                      onClick={() => {
                        setMostrarFormVideo(false);
                        setVideoEditando(null);
                        setFormVideo({ descripcion: '', enlace: '', ciclo: bimestreGlobal });
                      }}
                      disabled={guardandoVideo}
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="btn-guardar"
                      disabled={guardandoVideo}
                    >
                      {guardandoVideo ? '⏳ Guardando...' : '💾 Guardar Datos'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>,
          document.body
        )}

        {/* Tabla de videos */}
        {videosCicloActual.length > 0 ? (
          <table className="tabla-aula-virtual">
          <thead>
            <tr>
                <th>NOMBRE</th>
                <th>FECHA</th>
                <th className="text-center">Opciones</th>
            </tr>
          </thead>
          <tbody>
              {videosCicloActual.map((video) => (
              <tr key={video.id}>
                <td>{video.descripcion}</td>
                  <td>{new Date(video.fecha_hora).toLocaleString('es-PE', { 
                    day: '2-digit', 
                    month: '2-digit', 
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true
                  })}</td>
                <td className="text-center">
                  <div className="btn-group-opciones">
                    <button 
                      className="btn-opciones"
                      ref={(el) => (buttonRef.current[`video-${video.id}`] = el)}
                      onClick={(e) => toggleDropdown(video.id, e, 'video')}
                    >
                      Opciones {openDropdown === `video-${video.id}` ? '▲' : '▼'}
                    </button>
                    {openDropdown === `video-${video.id}` && dropdownPosition && createPortal(
                      <div 
                        className="dropdown-menu-portal-aula"
                        style={{
                          position: 'fixed',
                          top: `${dropdownPosition.top}px`,
                          right: `${dropdownPosition.right}px`,
                          width: `${dropdownPosition.width}px`,
                          zIndex: 10000
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="dropdown-menu-opciones">
                          {video.enlace && (
                            <a href={video.enlace} target="_blank" rel="noopener noreferrer">
                              🎥 Ver Video
                            </a>
                          )}
                            <a href="#" onClick={(e) => { e.preventDefault(); handleEditarVideo(video); }}>
                            ✏️ Editar Video
                          </a>
                            <a href="#" onClick={(e) => { e.preventDefault(); handleEliminarVideo(video); }}>
                            🗑️ Borrar Video
                          </a>
                        </div>
                      </div>,
                      document.body
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="empty-state">
          <p>No hay videos para este bimestre</p>
        </div>
      )}
    </div>
  );
  };

  const renderEnlacesContent = () => {
    // Obtener enlaces del ciclo actual (bimestre global)
    const enlacesCicloActual = enlaces.filter(e => e.ciclo === bimestreGlobal);
    
    return (
    <div className="card-content-expanded">
        <div className="temas-toolbar">
          <button type="button" className="btn-biblioteca-inline" onClick={(e) => { e.stopPropagation(); abrirModalBiblioteca('enlaces'); }}>
            📖 Biblioteca de enlaces
          </button>
        </div>
        {/* Modal de Formulario de Enlace */}
        {mostrarFormEnlace && createPortal(
          <div 
            className="modal-tema-overlay"
            onClick={() => {
              setMostrarFormEnlace(false);
              setEnlaceEditando(null);
              setFormEnlace({ descripcion: '', enlace: '', ciclo: bimestreGlobal });
            }}
          >
            <div 
              className="modal-tema-container"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="modal-enlace-title"
            >
              <div className="modal-tema-header">
                <h2 id="modal-enlace-title">
                  {enlaceEditando ? '✏️ Editar Enlace' : '🔗 Registrar Enlace'}
                </h2>
                <button
                  className="modal-tema-close"
                  onClick={() => {
                    setMostrarFormEnlace(false);
                    setEnlaceEditando(null);
                    setFormEnlace({ descripcion: '', enlace: '', ciclo: bimestreGlobal });
                  }}
                  aria-label="Cerrar"
                >
                  ×
                </button>
              </div>

              <div className="modal-tema-body">
                <form onSubmit={handleCrearEnlace}>
                  <div className="form-group">
                    <label htmlFor="enlace-descripcion">
                      Descripción *
                    </label>
                    <input
                      type="text"
                      id="enlace-descripcion"
                      className="form-input"
                      value={formEnlace.descripcion}
                      onChange={(e) => setFormEnlace({ ...formEnlace, descripcion: e.target.value })}
                      placeholder="Ej: Reto #01: El Universo"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="enlace-url">
                      Enlace *
                    </label>
                    <input
                      type="url"
                      id="enlace-url"
                      className="form-input"
                      value={formEnlace.enlace}
                      onChange={(e) => setFormEnlace({ ...formEnlace, enlace: e.target.value })}
                      placeholder="https://ejemplo.com/reto"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="enlace-ciclo">
                      Bimestre *
                    </label>
                    <select
                      id="enlace-ciclo"
                      className="form-input"
                      value={formEnlace.ciclo}
                      onChange={(e) => setFormEnlace({ ...formEnlace, ciclo: parseInt(e.target.value) })}
                      required
                    >
                      {Array.from({ length: totalNotas }, (_, i) => i + 1).map((bim) => (
                        <option key={bim} value={bim}>
                          Bimestre {bim}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-actions">
                    <button
                      type="button"
                      className="btn-cancelar"
                      onClick={() => {
                        setMostrarFormEnlace(false);
                        setEnlaceEditando(null);
                        setFormEnlace({ descripcion: '', enlace: '', ciclo: bimestreGlobal });
                      }}
                      disabled={guardandoEnlace}
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="btn-guardar"
                      disabled={guardandoEnlace}
                    >
                      {guardandoEnlace ? '⏳ Guardando...' : '💾 Guardar Datos'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>,
          document.body
        )}

        {/* Tabla de enlaces */}
        {enlacesCicloActual.length > 0 ? (
          <table className="tabla-aula-virtual">
          <thead>
            <tr>
                <th>NOMBRE</th>
                <th>FECHA</th>
                <th className="text-center">Opciones</th>
            </tr>
          </thead>
          <tbody>
              {enlacesCicloActual.map((enlace) => (
              <tr key={enlace.id}>
                <td>{enlace.descripcion}</td>
                  <td>{new Date(enlace.fecha_hora).toLocaleString('es-PE', { 
                    day: '2-digit', 
                    month: '2-digit', 
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true
                  })}</td>
                <td className="text-center">
                  <div className="btn-group-opciones">
                    <button 
                      className="btn-opciones"
                      ref={(el) => (buttonRef.current[`enlace-${enlace.id}`] = el)}
                      onClick={(e) => toggleDropdown(enlace.id, e, 'enlace')}
                    >
                      Opciones {openDropdown === `enlace-${enlace.id}` ? '▲' : '▼'}
                    </button>
                    {openDropdown === `enlace-${enlace.id}` && dropdownPosition && createPortal(
                      <div 
                        className="dropdown-menu-portal-aula"
                        style={{
                          position: 'fixed',
                          top: `${dropdownPosition.top}px`,
                          right: `${dropdownPosition.right}px`,
                          width: `${dropdownPosition.width}px`,
                          zIndex: 10000
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="dropdown-menu-opciones">
                          {enlace.enlace && (
                            <a href={enlace.enlace} target="_blank" rel="noopener noreferrer">
                              🔗 Visitar Enlace
                            </a>
                          )}
                            <a href="#" onClick={(e) => { e.preventDefault(); handleEditarEnlace(enlace); }}>
                            ✏️ Editar Enlace
                          </a>
                            <a href="#" onClick={(e) => { e.preventDefault(); handleEliminarEnlace(enlace); }}>
                            🗑️ Borrar Enlace
                          </a>
                        </div>
                      </div>,
                      document.body
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="empty-state">
          <p>No hay enlaces para este bimestre</p>
        </div>
      )}
    </div>
  );
  };

  return (
    <DashboardLayout>
      <div className="docente-aula-virtual">
        <div className="page-header">
          <button className="btn-back" onClick={() => navigate('/docente/cursos')}>
            ← Volver a Cursos
          </button>
          <h1>🎓 Aula Virtual</h1>
          <p>{curso?.curso_nombre || 'Curso'} - {curso?.grado}° {curso?.seccion} - {curso?.anio}</p>
        </div>

        {/* Selector Global de Bimestre */}
        <div className="bimestre-selector-global">
          {Array.from({ length: totalNotas }, (_, i) => i + 1).map((bim) => (
            <button
              key={bim}
              className={`bimestre-tab-global ${bimestreGlobal === bim ? 'active' : ''}`}
              onClick={() => setBimestreGlobal(bim)}
            >
              Bimestre {bim}
            </button>
          ))}
        </div>

        {/* Grid de Cards Gamificado */}
        <div className="aula-dashboard-grid">
          {/* Card: TEMAS */}
          <div 
            className={`aula-section-card temas-card ${expandedCard === 'temas' ? 'expanded' : ''}`}
            onClick={() => expandedCard !== 'temas' && toggleCard('temas')}
          >
            <div className="card-header">
              <div className="card-icon">📚</div>
              <div className="card-info">
                <h3 className="card-title">Temas Interactivos</h3>
                <p className="card-count">{archivos.filter(a => a.ciclo === bimestreGlobal).length}</p>
                <p className="card-subtitle">Temas disponibles</p>
              </div>
              <div className="card-action-btns">
                <button 
                  className="card-action-btn card-action-btn-secondary"
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    abrirModalBiblioteca('temas'); 
                  }}
                  title="Ver temas de años anteriores"
                >
                  📖 Biblioteca
                </button>
                <button 
                  className="card-action-btn"
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    setTemaEditando(null);
                    setFormTema({ nombre: '', archivo: null, archivoNombre: '', enlace: '', ciclo: bimestreGlobal });
                    setMostrarFormTema(true); 
                  }}
                >
                  + Nuevo
                </button>
              </div>
            </div>
            {expandedCard === 'temas' && renderCardContent('temas')}
          </div>

          {/* Card: TAREAS */}
          <div 
            className={`aula-section-card tareas-card ${expandedCard === 'tareas' ? 'expanded' : ''}`}
            onClick={() => expandedCard !== 'tareas' && toggleCard('tareas')}
          >
            <div className="card-header">
              <div className="card-icon">📝</div>
              <div className="card-info">
                <h3 className="card-title">Proyectos</h3>
                <p className="card-count">{tareas.length}</p>
                <p className="card-subtitle">Proyectos asignados</p>
              </div>
              <div className="card-action-btns">
                <button className="card-action-btn card-action-btn-secondary" onClick={(e) => { e.stopPropagation(); abrirModalBiblioteca('tareas'); }} title="Ver proyectos de años anteriores">
                  📖 Biblioteca
                </button>
                <button className="card-action-btn" onClick={(e) => { e.stopPropagation(); setMostrarFormTarea(true); }}>
                  + Nuevo
                </button>
              </div>
            </div>
            {expandedCard === 'tareas' && renderCardContent('tareas')}
          </div>

          {/* Card: SESIONES (solo DOCENTE y ADMIN) */}
          <div 
            className={`aula-section-card sesiones-card ${expandedCard === 'sesiones' ? 'expanded' : ''}`}
            onClick={() => expandedCard !== 'sesiones' && toggleCard('sesiones')}
          >
            <div className="card-header">
              <div className="card-icon">📄</div>
              <div className="card-info">
                <h3 className="card-title">Sesiones</h3>
                <p className="card-count">{sesiones.filter(s => s.ciclo === bimestreGlobal).length}</p>
                <p className="card-subtitle">PDFs vinculados a temas</p>
              </div>
              <div className="card-action-btns" onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}>
                <button 
                  type="button"
                  className="card-action-btn" 
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    e.preventDefault();
                    setSesionEditando(null);
                    setFormSesion({ tema_id: '', descripcion: '', archivo: null, archivoNombre: '', ciclo: bimestreGlobal });
                    setMostrarFormSesion(true); 
                  }}
                >
                  + Nuevo
                </button>
              </div>
            </div>
            {expandedCard === 'sesiones' && renderCardContent('sesiones')}
          </div>

          {/* Card: EXÁMENES */}
          <div 
            className={`aula-section-card examenes-card ${expandedCard === 'examenes' ? 'expanded' : ''}`}
            onClick={() => expandedCard !== 'examenes' && toggleCard('examenes')}
          >
            <div className="card-header">
              <div className="card-icon">📊</div>
              <div className="card-info">
                <h3 className="card-title">Exámenes</h3>
                <p className="card-count">{examenes.length}</p>
                <p className="card-subtitle">Exámenes creados</p>
              </div>
              <div className="card-action-btns">
                <button className="card-action-btn card-action-btn-secondary" onClick={(e) => { e.stopPropagation(); abrirModalBiblioteca('examenes'); }} title="Ver exámenes de años anteriores">
                  📖 Biblioteca
                </button>
                <button 
                  className="card-action-btn"
                onClick={(e) => { 
                  e.stopPropagation(); 
                  setFormExamen({
                    titulo: '',
                    tipo: 'VIRTUAL',
                    tipo_puntaje: 'GENERAL',
                    puntos_correcta: 1,
                    penalizar_incorrecta: 'NO',
                    penalizacion_incorrecta: 0,
                    tiempo: 60,
                    intentos: 1,
                    orden_preguntas: 'PREDETERMINADO',
                    preguntas_max: 1,
                    ciclo: bimestreGlobal,
                    estado: 'INACTIVO',
                    habilitar_fecha_hora: false,
                    fecha_desde: '',
                    fecha_hasta: '',
                    hora_desde: '08:00',
                    hora_hasta: '20:00',
                    archivo_pdf: null
                  });
                  setExamenEditando(null);
                  setMostrarFormExamen(true); 
                }}
              >
                + Nuevo
              </button>
              </div>
            </div>
            {expandedCard === 'examenes' && renderCardContent('examenes')}
          </div>

          {/* Card: VIDEOTECA */}
          <div 
            className={`aula-section-card videos-card ${expandedCard === 'videos' ? 'expanded' : ''}`}
            onClick={() => expandedCard !== 'videos' && toggleCard('videos')}
          >
            <div className="card-header">
              <div className="card-icon">🎥</div>
              <div className="card-info">
                <h3 className="card-title">Videoteca</h3>
                <p className="card-count">{videos.length}</p>
                <p className="card-subtitle">Videos disponibles</p>
              </div>
              <div className="card-action-btns">
                <button className="card-action-btn card-action-btn-secondary" onClick={(e) => { e.stopPropagation(); abrirModalBiblioteca('videos'); }} title="Ver videos de años anteriores">
                  📖 Biblioteca
                </button>
                <button 
                  className="card-action-btn"
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    if (expandedCard !== 'videos') toggleCard('videos');
                    setVideoEditando(null);
                    setFormVideo({ descripcion: '', enlace: '', ciclo: bimestreGlobal });
                    setMostrarFormVideo(true);
                  }}
                >
                  + Nuevo
                </button>
              </div>
            </div>
            {expandedCard === 'videos' && renderCardContent('videos')}
          </div>

          {/* Card: ENLACES */}
          <div 
            className={`aula-section-card enlaces-card ${expandedCard === 'enlaces' ? 'expanded' : ''}`}
            onClick={() => expandedCard !== 'enlaces' && toggleCard('enlaces')}
          >
            <div className="card-header">
              <div className="card-icon">🔗</div>
              <div className="card-info">
                <h3 className="card-title">Enlaces de Ayuda</h3>
                <p className="card-count">{enlaces.length}</p>
                <p className="card-subtitle">Enlaces compartidos</p>
              </div>
              <div className="card-action-btns">
                <button className="card-action-btn card-action-btn-secondary" onClick={(e) => { e.stopPropagation(); abrirModalBiblioteca('enlaces'); }} title="Ver enlaces de años anteriores">
                  📖 Biblioteca
                </button>
                <button 
                  className="card-action-btn"
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    if (expandedCard !== 'enlaces') toggleCard('enlaces');
                    setEnlaceEditando(null);
                    setFormEnlace({ descripcion: '', enlace: '', ciclo: bimestreGlobal });
                    setMostrarFormEnlace(true);
                  }}
                >
                  + Nuevo
                </button>
              </div>
            </div>
            {expandedCard === 'enlaces' && renderCardContent('enlaces')}
          </div>
        </div>

        {/* Modal de Formulario de Tarea - Fuera del renderTareasContent para que funcione siempre */}
        {mostrarFormTarea && createPortal(
          <div 
            className="modal-tema-overlay"
            onClick={() => {
              setMostrarFormTarea(false);
              setTareaEditando(null);
              setFormTarea({ 
                titulo: '', 
                descripcion: '', 
                fecha_entrega: '', 
                ciclo: bimestreGlobal,
                archivo: null,
                archivoNombre: '',
                enlace: '' 
              });
            }}
          >
            <div 
              className="modal-tema-container"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="modal-tarea-title"
            >
              <div className="modal-tema-header">
                <h2 id="modal-tarea-title">
                  {tareaEditando ? '✏️ Editar Proyecto' : '📝 Registrar Proyecto'}
                </h2>
                <button
                  className="modal-tema-close"
                  onClick={() => {
                    setMostrarFormTarea(false);
                    setTareaEditando(null);
                    setFormTarea({ 
                      titulo: '', 
                      descripcion: '', 
                      fecha_entrega: '', 
                      ciclo: bimestreGlobal,
                      archivo: null,
                      archivoNombre: '',
                      enlace: '' 
                    });
                  }}
                  aria-label="Cerrar"
                >
                  ×
                </button>
              </div>

              <div className="modal-tema-body">
                <form onSubmit={handleCrearTarea}>
                  {/* Campo Título */}
                  <div className="form-group">
                    <label htmlFor="tarea-titulo">
                      Título *
                    </label>
                    <input
                      type="text"
                      id="tarea-titulo"
                      className="form-input"
                      value={formTarea.titulo}
                      onChange={(e) => setFormTarea({ ...formTarea, titulo: e.target.value })}
                      placeholder="Ej: Proyecto 1: Investigación sobre..."
                      required
                    />
                  </div>

                  {/* Campo Descripción */}
                  <div className="form-group">
                    <label htmlFor="tarea-descripcion">
                      Descripción
                    </label>
                    <textarea
                      id="tarea-descripcion"
                      className="form-input"
                      value={formTarea.descripcion}
                      onChange={(e) => setFormTarea({ ...formTarea, descripcion: e.target.value })}
                      rows="5"
                      placeholder="Descripción detallada de la tarea..."
                    />
                  </div>

                  {/* Campo Fecha de Entrega */}
                  <div className="form-group">
                    <label htmlFor="tarea-fecha-entrega">
                      Fecha de Entrega *
                    </label>
                    <input
                      type="date"
                      id="tarea-fecha-entrega"
                      className="form-input"
                      value={formTarea.fecha_entrega}
                      onChange={(e) => setFormTarea({ ...formTarea, fecha_entrega: e.target.value })}
                      required
                    />
                  </div>

                  {/* Campo Bimestre */}
                  <div className="form-group">
                    <label htmlFor="tarea-ciclo">
                      Bimestre *
                    </label>
                    <select
                      id="tarea-ciclo"
                      className="form-input"
                      value={formTarea.ciclo}
                      onChange={(e) => setFormTarea({ ...formTarea, ciclo: parseInt(e.target.value) })}
                      required
                    >
                      {Array.from({ length: totalNotas }, (_, i) => i + 1).map((bim) => (
                        <option key={bim} value={bim}>
                          Bimestre {bim}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Campo Archivo */}
                  <div className="form-group">
                    <label htmlFor="tarea-archivo">
                      Archivos Adjuntos (Opcional)
                    </label>
                    <div className="file-input-wrapper">
                      <input
                        type="file"
                        id="tarea-archivo"
                        className="form-input-file"
                        accept=".pdf"
                        onChange={(e) => {
                          const file = e.target.files[0];
                          if (file) {
                            setFormTarea({
                              ...formTarea,
                              archivo: file,
                              archivoNombre: file.name
                            });
                          }
                        }}
                      />
                      <label htmlFor="tarea-archivo" className="file-input-label">
                        {formTarea.archivoNombre || (tareaEditando && tareaEditando.archivos && tareaEditando.archivos.length > 0 ? 'Archivo existente' : 'Elegir archivos')}
                      </label>
                      {formTarea.archivoNombre && (
                        <button
                          type="button"
                          className="file-clear-btn"
                          onClick={() => setFormTarea({ ...formTarea, archivo: null, archivoNombre: '' })}
                        >
                          ×
                        </button>
                      )}
                    </div>
                    <small className="form-help-text">
                      Puedes subir un archivo PDF o proporcionar una URL, o ambos
                    </small>
                  </div>

                  {/* Campo URL */}
                  <div className="form-group">
                    <label htmlFor="tarea-enlace">
                      URL (Opcional)
                    </label>
                    <textarea
                      id="tarea-enlace"
                      className="form-input"
                      value={formTarea.enlace}
                      onChange={(e) => setFormTarea({ ...formTarea, enlace: e.target.value })}
                      rows="2"
                      placeholder="https://ejemplo.com/tarea"
                    />
                    <small className="form-help-text">
                      Enlace externo a la tarea
                    </small>
                  </div>

                  {/* Botones de Acción */}
                  <div className="form-actions">
                    <button
                      type="button"
                      className="btn-cancelar"
                      onClick={() => {
                        setMostrarFormTarea(false);
                        setTareaEditando(null);
                        setFormTarea({ 
                          titulo: '', 
                          descripcion: '', 
                          fecha_entrega: '', 
                          ciclo: bimestreGlobal,
                          archivo: null,
                          archivoNombre: '',
                          enlace: '' 
                        });
                      }}
                      disabled={guardandoTarea}
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="btn-guardar"
                      disabled={guardandoTarea}
                    >
                      {guardandoTarea ? '⏳ Guardando...' : (tareaEditando ? '💾 Actualizar' : '💾 Guardar Datos')}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>,
          document.body
        )}

        {/* Modal de Formulario de Sesión - Fuera del card para que funcione cuando está colapsado */}
        {mostrarFormSesion && (() => {
          const temasDisponibles = archivos.filter(a => a.ciclo === bimestreGlobal);
          return createPortal(
            <div
              className="modal-tema-overlay"
              onClick={() => {
                setMostrarFormSesion(false);
                setSesionEditando(null);
                setFormSesion({ tema_id: '', descripcion: '', archivo: null, archivoNombre: '', ciclo: bimestreGlobal });
              }}
            >
              <div
                className="modal-tema-container"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="modal-sesion-title"
              >
                <div className="modal-tema-header">
                  <h2 id="modal-sesion-title">
                    {sesionEditando ? '✏️ Editar Sesión' : '📄 Nueva Sesión'}
                  </h2>
                  <button
                    className="modal-tema-close"
                    onClick={() => {
                      setMostrarFormSesion(false);
                      setSesionEditando(null);
                      setFormSesion({ tema_id: '', descripcion: '', archivo: null, archivoNombre: '', ciclo: bimestreGlobal });
                    }}
                    aria-label="Cerrar"
                  >
                    ×
                  </button>
                </div>
                <div className="modal-tema-body">
                  <form onSubmit={sesionEditando ? handleActualizarSesion : handleCrearSesion}>
                    <div className="form-group">
                      <label htmlFor="sesion-tema">Tema *</label>
                      <select
                        id="sesion-tema"
                        className="form-input"
                        value={formSesion.tema_id}
                        onChange={(e) => setFormSesion({ ...formSesion, tema_id: e.target.value })}
                        required
                      >
                        <option value="">-- Seleccionar tema --</option>
                        {temasDisponibles.map((t) => (
                          <option key={t.id} value={t.id}>{t.nombre}</option>
                        ))}
                      </select>
                      {temasDisponibles.length === 0 && (
                        <small style={{ color: '#ef4444' }}>No hay temas en este bimestre. Crea temas interactivos primero.</small>
                      )}
                    </div>
                    <div className="form-group">
                      <label htmlFor="sesion-archivo">Archivo PDF {sesionEditando ? '(opcional, deja vacío para mantener el actual)' : '*'}</label>
                      <input
                        type="file"
                        id="sesion-archivo"
                        className="form-input"
                        accept=".pdf,application/pdf"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          setFormSesion({ ...formSesion, archivo: f || null, archivoNombre: f?.name || '' });
                        }}
                        required={!sesionEditando}
                      />
                      {formSesion.archivoNombre && (
                        <small style={{ color: '#10b981' }}>Seleccionado: {formSesion.archivoNombre}</small>
                      )}
                      {sesionEditando && !formSesion.archivoNombre && (
                        <small style={{ color: '#6b7280' }}>Archivo actual se mantendrá</small>
                      )}
                    </div>
                    <div className="form-group">
                      <label htmlFor="sesion-descripcion">Descripción (opcional)</label>
                      <textarea
                        id="sesion-descripcion"
                        className="form-input"
                        rows={3}
                        value={formSesion.descripcion}
                        onChange={(e) => setFormSesion({ ...formSesion, descripcion: e.target.value })}
                        placeholder="Breve descripción de la sesión..."
                      />
                    </div>
                    <div className="form-group">
                      <label>Bimestre *</label>
                      <select
                        className="form-input"
                        value={formSesion.ciclo}
                        onChange={(e) => setFormSesion({ ...formSesion, ciclo: parseInt(e.target.value) })}
                        required
                      >
                        {Array.from({ length: totalNotas }, (_, i) => i + 1).map((bim) => (
                          <option key={bim} value={bim}>Bimestre {bim}</option>
                        ))}
                      </select>
                    </div>
                    <div className="form-actions">
                      <button type="button" className="btn-cancelar" onClick={() => { setMostrarFormSesion(false); setSesionEditando(null); setFormSesion({ tema_id: '', descripcion: '', archivo: null, archivoNombre: '', ciclo: bimestreGlobal }); }}>
                        Cancelar
                      </button>
                      <button type="submit" className="btn-guardar" disabled={guardandoSesion || temasDisponibles.length === 0}>
                        {guardandoSesion ? 'Guardando...' : (sesionEditando ? 'Actualizar' : 'Guardar')}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>,
            document.body
          );
        })()}

        {/* Modal de Formulario de Tema */}
        {mostrarFormTema && createPortal(
          <div 
            className="modal-tema-overlay"
            onClick={() => {
              setMostrarFormTema(false);
              setTemaEditando(null);
              setFormTema({ nombre: '', archivo: null, archivoNombre: '', enlace: '', ciclo: bimestreGlobal });
            }}
          >
            <div 
              className="modal-tema-container"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="modal-tema-title"
            >
              <div className="modal-tema-header">
                <h2 id="modal-tema-title">
                  {temaEditando ? '✏️ Editar Tema Interactivo' : '📚 Nuevo Tema Interactivo'}
                </h2>
                <button
                  className="modal-tema-close"
                  onClick={() => {
                    setMostrarFormTema(false);
                    setTemaEditando(null);
                    setFormTema({ nombre: '', archivo: null, archivoNombre: '', enlace: '', ciclo: bimestreGlobal });
                  }}
                  aria-label="Cerrar"
                >
                  ×
                </button>
              </div>

              <div className="modal-tema-body">
                <form onSubmit={handleGuardarTema}>
                  {/* Campo Nombre */}
                  <div className="form-group">
                    <label htmlFor="tema-nombre">
                      Nombre del Tema *
                    </label>
                    <input
                      type="text"
                      id="tema-nombre"
                      className="form-input"
                      value={formTema.nombre}
                      onChange={(e) => setFormTema({ ...formTema, nombre: e.target.value })}
                      placeholder="Ej: TEMA 1: MÉTODO CIENTÍFICO"
                      required
                    />
                  </div>

                  {/* Campo Bimestre */}
                  <div className="form-group">
                    <label htmlFor="tema-ciclo">
                      Bimestre *
                    </label>
                    <select
                      id="tema-ciclo"
                      className="form-input"
                      value={formTema.ciclo}
                      onChange={(e) => setFormTema({ ...formTema, ciclo: parseInt(e.target.value) })}
                      required
                    >
                      {Array.from({ length: totalNotas }, (_, i) => i + 1).map((bim) => (
                        <option key={bim} value={bim}>
                          Bimestre {bim}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Campo Archivo */}
                  <div className="form-group">
                    <label htmlFor="tema-archivo">
                      Archivo PDF {temaEditando ? '(Opcional - dejar vacío para mantener el actual)' : '(Opcional)'}
                    </label>
                    {temaEditando && (temaEditando.archivo || temaEditando.archivo_url) && (
                      <div style={{ 
                        marginBottom: '0.5rem', 
                        padding: '0.5rem', 
                        backgroundColor: '#e3f2fd', 
                        borderRadius: '4px',
                        fontSize: '0.875rem'
                      }}>
                        📄 Archivo actual: {temaEditando.archivo_url ? 
                          <a href={temaEditando.archivo_url} target="_blank" rel="noopener noreferrer" style={{ color: '#1976d2', textDecoration: 'underline' }}>
                            {temaEditando.archivo_url.split('/').pop()}
                          </a> : 
                          (temaEditando.archivo || 'Archivo existente')
                        }
                      </div>
                    )}
                    <div className="file-input-wrapper">
                      <input
                        type="file"
                        id="tema-archivo"
                        className="form-input-file"
                        accept=".pdf"
                        onChange={(e) => {
                          const file = e.target.files[0];
                          if (file) {
                            setFormTema({
                              ...formTema,
                              archivo: file,
                              archivoNombre: file.name
                            });
                          }
                        }}
                      />
                      <label htmlFor="tema-archivo" className="file-input-label">
                        {formTema.archivoNombre || (temaEditando && (temaEditando.archivo || temaEditando.archivo_url) ? 'Seleccionar nuevo archivo (opcional)' : 'Seleccionar archivo')}
                      </label>
                      {formTema.archivoNombre && (
                        <button
                          type="button"
                          className="file-clear-btn"
                          onClick={() => setFormTema({ ...formTema, archivo: null, archivoNombre: '' })}
                        >
                          ×
                        </button>
                      )}
                    </div>
                    <small className="form-help-text">
                      {temaEditando ? 
                        'Puedes subir un nuevo archivo PDF para reemplazar el actual, o proporcionar una URL, o ambos' :
                        'Puedes subir un archivo PDF o proporcionar una URL, o ambos'
                      }
                    </small>
                  </div>

                  {/* Campo URL */}
                  <div className="form-group">
                    <label htmlFor="tema-enlace">
                      URL (Opcional)
                    </label>
                    <input
                      type="text"
                      id="tema-enlace"
                      className="form-input"
                      value={formTema.enlace}
                      onChange={(e) => setFormTema({ ...formTema, enlace: e.target.value })}
                      placeholder="ejemplo.com o https://ejemplo.com/tema"
                    />
                    <small className="form-help-text">
                      Enlace externo al tema (se agregará https:// automáticamente si falta)
                    </small>
                  </div>

                  {/* Botones de Acción */}
                  <div className="form-actions">
                    <button
                      type="button"
                      className="btn-cancelar-tema"
                      onClick={() => {
                        setMostrarFormTema(false);
                        setTemaEditando(null);
                        setFormTema({ nombre: '', archivo: null, archivoNombre: '', enlace: '', ciclo: bimestreGlobal });
                      }}
                      disabled={guardandoTema}
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="btn-guardar-tema"
                      disabled={guardandoTema}
                    >
                      {guardandoTema ? '⏳ Guardando...' : (temaEditando ? '💾 Actualizar' : '💾 Guardar Datos')}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Modal Biblioteca de Temas */}
      {mostrarModalBiblioteca && createPortal(
        <div 
          className="modal-biblioteca-overlay"
          onClick={() => setMostrarModalBiblioteca(false)}
        >
          <div 
            className="modal-biblioteca-container"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-biblioteca-title"
          >
            <div className="modal-biblioteca-header">
              <h2 id="modal-biblioteca-title">📖 {BIBLIOTECA_CONFIG[tipoBiblioteca]?.titulo || 'Biblioteca'}</h2>
              <button
                className="modal-biblioteca-close"
                onClick={() => setMostrarModalBiblioteca(false)}
                aria-label="Cerrar"
              >
                ×
              </button>
            </div>
            <div className="modal-biblioteca-body">
              <p className="modal-biblioteca-desc">
                Contenido del mismo curso y grado de años anteriores (2024 hasta el año pasado). Selecciona lo que quieras copiar al año actual. Se conserva el bimestre.
              </p>
              {loadingBiblioteca ? (
                <div className="modal-biblioteca-loading">
                  <div className="loading-spinner-small"></div>
                  <p>Cargando biblioteca...</p>
                </div>
              ) : datosBiblioteca.años && datosBiblioteca.años.length === 0 ? (
                <div className="modal-biblioteca-empty">
                  <span className="modal-biblioteca-empty-icon">📚</span>
                  <p>No hay elementos de años anteriores para este curso y grado.</p>
                </div>
              ) : (
                <>
                  <div className="modal-biblioteca-tabs">
                    {datosBiblioteca.años?.map((anio) => (
                      <button
                        key={anio}
                        type="button"
                        className={`modal-biblioteca-tab ${añoFiltroBiblioteca === anio ? 'active' : ''}`}
                        onClick={() => setAñoFiltroBiblioteca(anio)}
                      >
                        {anio}
                      </button>
                    ))}
                  </div>
                  <div className="modal-biblioteca-content">
                    {añoFiltroBiblioteca && datosBiblioteca.porAnio?.[añoFiltroBiblioteca] && (() => {
                      const items = datosBiblioteca.porAnio[añoFiltroBiblioteca];
                      const todosSel = items.every(t => isBibliotecaItemSeleccionado(t.asignatura_id, t.id));
                      return (
                        <>
                          <div className="modal-biblioteca-actions">
                            <button
                              type="button"
                              className="modal-biblioteca-select-all"
                              onClick={() => seleccionarTodosBiblioteca(items, !todosSel)}
                            >
                              {todosSel ? '☑ Deseleccionar todos' : '☐ Seleccionar todos'}
                            </button>
                          </div>
                          <div className="modal-biblioteca-list">
                            {items.map((item) => (
                              <label
                                key={`${item.asignatura_id}-${item.id}`}
                                className={`modal-biblioteca-item ${isBibliotecaItemSeleccionado(item.asignatura_id, item.id) ? 'selected' : ''}`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isBibliotecaItemSeleccionado(item.asignatura_id, item.id)}
                                  onChange={() => toggleBibliotecaItem(item.asignatura_id, item.id)}
                                />
                                <div className="modal-biblioteca-item-content">
                                  <span className="modal-biblioteca-item-name">{item.nombre || item.titulo || item.descripcion}</span>
                                  <span className="modal-biblioteca-item-meta">
                                    B{item.ciclo} • {item.asignatura_label} • {item.docente_nombre}
                                  </span>
                                  <div className="modal-biblioteca-item-links">
                                    {item.archivo_url && (
                                      <a href={item.archivo_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                                        📄 Ver archivo
                                      </a>
                                    )}
                                    {item.enlace_url && (
                                      <a href={item.enlace_url.startsWith('http') ? item.enlace_url : `https://${item.enlace_url}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                                        🔗 Enlace
                                      </a>
                                    )}
                                  </div>
                                </div>
                              </label>
                            ))}
                          </div>
                        </>
                      );
                    })()}
                  </div>
                  <div className="modal-biblioteca-footer">
                    <span className="modal-biblioteca-count">
                      {bibliotecaSeleccionados.length} elemento(s) seleccionado(s)
                    </span>
                    <div className="modal-biblioteca-footer-btns">
                      <button
                        type="button"
                        className="modal-biblioteca-btn-cancel"
                        onClick={() => setMostrarModalBiblioteca(false)}
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        className="modal-biblioteca-btn-copy"
                        onClick={handleCopiarBiblioteca}
                        disabled={bibliotecaSeleccionados.length === 0 || guardandoBiblioteca}
                      >
                        {guardandoBiblioteca ? '⏳ Copiando...' : '📋 Copiar al año actual (conserva bimestre)'}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal de Marcar Entregas */}
      {mostrarModalEntregas && createPortal(
        <div 
          className="modal-tema-overlay"
          onClick={() => {
            setMostrarModalEntregas(false);
            setTareaParaEntregas(null);
            setAlumnosEntregas([]);
            setNotasTemporales({});
          }}
        >
          <div 
            className="modal-tema-container"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-entregas-title"
            style={{ maxWidth: '90%', width: '1200px', maxHeight: '90vh' }}
          >
            <div className="modal-tema-header">
              <h2 id="modal-entregas-title">
                📋 Registrar Entregas
                {infoTareaEntregas && (
                  <span style={{ fontSize: '0.9rem', fontWeight: 'normal', marginLeft: '10px', color: '#ffffff' }}>
                    - {infoTareaEntregas.curso_nombre} - {infoTareaEntregas.grado}° {infoTareaEntregas.seccion}
                  </span>
                )}
              </h2>
              <button
                className="modal-tema-close"
                onClick={() => {
                  setMostrarModalEntregas(false);
                  setTareaParaEntregas(null);
                  setAlumnosEntregas([]);
                  setNotasTemporales({});
                }}
                aria-label="Cerrar"
              >
                ×
              </button>
            </div>

            <div className="modal-tema-body" style={{ padding: '1.5rem', overflowY: 'auto', maxHeight: 'calc(90vh - 120px)' }}>
              {loadingEntregas ? (
                <div style={{ textAlign: 'center', padding: '2rem' }}>
                  <div className="loading-spinner-small"></div>
                  <p>Cargando entregas...</p>
                </div>
              ) : (
                <>
                  {/* Botón Guardar arriba */}
                  <div style={{ marginBottom: '1rem', textAlign: 'right' }}>
                    <button
                      type="button"
                      className="btn-guardar"
                      onClick={handleGuardarTodasLasNotas}
                      style={{ padding: '0.5rem 1.5rem' }}
                    >
                      💾 Guardar Todas las Notas
                    </button>
                  </div>

                  {/* Tabla de alumnos */}
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: '#fff' }}>
                      <thead>
                        <tr style={{ backgroundColor: '#e8f5e9', borderBottom: '2px solid #4caf50' }}>
                          <th style={{ padding: '12px', textAlign: 'center', fontWeight: 'bold', color: '#333', borderRight: '1px solid #ddd' }}>N°</th>
                          <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold', color: '#333', borderRight: '1px solid #ddd' }}>APELLIDOS Y NOMBRES</th>
                          <th style={{ padding: '12px', textAlign: 'center', fontWeight: 'bold', color: '#333', borderRight: '1px solid #ddd', minWidth: '120px' }}>NOTA</th>
                          <th style={{ padding: '12px', textAlign: 'center', fontWeight: 'bold', color: '#333', borderRight: '1px solid #ddd', minWidth: '80px' }}>VISTO</th>
                          <th style={{ padding: '12px', textAlign: 'center', fontWeight: 'bold', color: '#333', minWidth: '200px' }}>ARCHIVO(S)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {alumnosEntregas.map((alumno) => (
                          <tr key={alumno.matricula_id} style={{ borderBottom: '1px solid #eee' }}>
                            <td style={{ padding: '12px', textAlign: 'center', borderRight: '1px solid #ddd' }}>
                              {alumno.numero}
                            </td>
                            <td style={{ padding: '12px', textAlign: 'left', borderRight: '1px solid #ddd', fontWeight: '500' }}>
                              {alumno.nombre_completo}
                            </td>
                            <td style={{ padding: '8px', textAlign: 'center', borderRight: '1px solid #ddd' }}>
                              <input
                                type="text"
                                value={notasTemporales[alumno.matricula_id] || ''}
                                onChange={(e) => {
                                  setNotasTemporales({
                                    ...notasTemporales,
                                    [alumno.matricula_id]: e.target.value
                                  });
                                }}
                                placeholder="0-20"
                                style={{
                                  width: '100px',
                                  padding: '8px',
                                  border: '1px solid #ddd',
                                  borderRadius: '4px',
                                  textAlign: 'center',
                                  fontSize: '0.9rem'
                                }}
                              />
                            </td>
                            <td style={{ padding: '12px', textAlign: 'center', borderRight: '1px solid #ddd' }}>
                              <span style={{
                                padding: '4px 12px',
                                borderRadius: '12px',
                                fontSize: '0.85rem',
                                fontWeight: 'bold',
                                backgroundColor: alumno.visto === 'SI' ? '#e8f5e9' : '#ffebee',
                                color: alumno.visto === 'SI' ? '#2e7d32' : '#c62828'
                              }}>
                                {alumno.visto}
                              </span>
                            </td>
                            <td style={{ padding: '12px', textAlign: 'center' }}>
                              {alumno.archivos && alumno.archivos.length > 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'center' }}>
                                  {alumno.archivos.map((archivo, idx) => (
                                    <a
                                      key={idx}
                                      href={archivo.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      title={archivo.url}
                                      style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        width: '40px',
                                        height: '40px',
                                        backgroundColor: '#2196f3',
                                        color: 'white',
                                        borderRadius: '8px',
                                        textDecoration: 'none',
                                        fontSize: '1.2rem',
                                        margin: '2px',
                                        transition: 'all 0.2s',
                                        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                                      }}
                                      onMouseEnter={(e) => {
                                        e.target.style.backgroundColor = '#1976d2';
                                        e.target.style.transform = 'scale(1.1)';
                                      }}
                                      onMouseLeave={(e) => {
                                        e.target.style.backgroundColor = '#2196f3';
                                        e.target.style.transform = 'scale(1)';
                                      }}
                                    >
                                      📄
                                    </a>
                                  ))}
                                </div>
                              ) : (
                                <span style={{ color: '#999', fontStyle: 'italic' }}>NINGUNO</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Botón Guardar abajo */}
                  <div style={{ marginTop: '1.5rem', textAlign: 'right' }}>
                    <button
                      type="button"
                      className="btn-guardar"
                      onClick={handleGuardarTodasLasNotas}
                      style={{ padding: '0.5rem 1.5rem' }}
                    >
                      💾 Guardar Todas las Notas
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal de Asignar a Registro */}
      {mostrarModalAsignarRegistro && createPortal(
        <div 
          className="modal-tema-overlay"
          onClick={() => {
            setMostrarModalAsignarRegistro(false);
            setTareaParaAsignar(null);
            setDatosAsignarRegistro(null);
            setCriterioSeleccionado('');
            setCuadroSeleccionado('0');
          }}
        >
          <div 
            className="modal-tema-container"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-asignar-registro-title"
            style={{ maxWidth: '600px', width: '90%' }}
          >
            <div className="modal-tema-header">
              <h2 id="modal-asignar-registro-title">
                📋 ASIGNAR A REGISTRO
              </h2>
              <button
                className="modal-tema-close"
                onClick={() => {
                  setMostrarModalAsignarRegistro(false);
                  setTareaParaAsignar(null);
                  setDatosAsignarRegistro(null);
                  setCriterioSeleccionado('');
                  setCuadroSeleccionado('0');
                }}
                aria-label="Cerrar"
              >
                ×
              </button>
            </div>

            <div className="modal-tema-body" style={{ padding: '1.5rem' }}>
              {loadingAsignarRegistro ? (
                <div style={{ textAlign: 'center', padding: '2rem' }}>
                  <div className="loading-spinner-small"></div>
                  <p>Cargando datos...</p>
                </div>
              ) : datosAsignarRegistro ? (
                <>
                  {/* Campos read-only */}
                  <div style={{ marginBottom: '1rem' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: '#fff' }}>
                      <tbody>
                        <tr style={{ borderBottom: '1px solid #eee' }}>
                          <td style={{ padding: '12px', backgroundColor: '#e8f5e9', fontWeight: 'bold', width: '40%', borderRight: '1px solid #ddd' }}>
                            TAREA
                          </td>
                          <td style={{ padding: '12px', backgroundColor: '#fff' }}>
                            {datosAsignarRegistro.tarea.titulo}
                          </td>
                        </tr>
                        <tr style={{ borderBottom: '1px solid #eee' }}>
                          <td style={{ padding: '12px', backgroundColor: '#e8f5e9', fontWeight: 'bold', borderRight: '1px solid #ddd' }}>
                            ASIGNATURA
                          </td>
                          <td style={{ padding: '12px', backgroundColor: '#fff' }}>
                            {datosAsignarRegistro.tarea.curso_nombre}
                          </td>
                        </tr>
                        <tr style={{ borderBottom: '1px solid #eee' }}>
                          <td style={{ padding: '12px', backgroundColor: '#e8f5e9', fontWeight: 'bold', borderRight: '1px solid #ddd' }}>
                            BIMESTRE
                          </td>
                          <td style={{ padding: '12px', backgroundColor: '#fff' }}>
                            {datosAsignarRegistro.tarea.ciclo}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Campo CRITERIO */}
                  <div className="form-group" style={{ marginBottom: '1rem' }}>
                    <label htmlFor="criterio-select" style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                      CRITERIO
                    </label>
                    <select
                      id="criterio-select"
                      className="form-input"
                      value={criterioSeleccionado}
                      onChange={(e) => {
                        setCriterioSeleccionado(e.target.value);
                        // Resetear cuadro cuando cambia el criterio
                        if (e.target.value) {
                          const [criterioId, indicadorId] = e.target.value.split('_');
                          const criterio = datosAsignarRegistro.criterios.find(c => c.id === parseInt(criterioId));
                          if (criterio) {
                            const indicador = criterio.indicadores.find(i => i.id === parseInt(indicadorId));
                            if (indicador && indicador.cuadros > 0) {
                              setCuadroSeleccionado('0');
                            }
                          }
                        }
                      }}
                      style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '4px' }}
                    >
                      <option value="">Seleccionar criterio...</option>
                      {datosAsignarRegistro.criterios.map(criterio => 
                        criterio.indicadores && criterio.indicadores.length > 0 ? (
                          criterio.indicadores.map(indicador => (
                            <option key={`${criterio.id}_${indicador.id}`} value={`${criterio.id}_${indicador.id}`}>
                              {criterio.descripcion} - {indicador.descripcion}
                            </option>
                          ))
                        ) : null
                      )}
                    </select>
                  </div>

                  {/* Campo CUADRO */}
                  {criterioSeleccionado && (() => {
                    const [criterioId, indicadorId] = criterioSeleccionado.split('_');
                    const criterio = datosAsignarRegistro.criterios.find(c => c.id === parseInt(criterioId));
                    if (criterio) {
                      const indicador = criterio.indicadores.find(i => i.id === parseInt(indicadorId));
                      if (indicador && indicador.cuadros > 0) {
                        return (
                          <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                            <label htmlFor="cuadro-select" style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                              CUADRO
                            </label>
                            <select
                              id="cuadro-select"
                              className="form-input"
                              value={cuadroSeleccionado}
                              onChange={(e) => setCuadroSeleccionado(e.target.value)}
                              style={{ width: '100px', padding: '10px', border: '1px solid #ddd', borderRadius: '4px' }}
                            >
                              {Array.from({ length: indicador.cuadros }, (_, i) => (
                                <option key={i} value={i}>{i + 1}</option>
                              ))}
                            </select>
                          </div>
                        );
                      }
                    }
                    return null;
                  })()}

                  {/* Warning */}
                  <div style={{
                    backgroundColor: '#fff3cd',
                    border: '1px solid #ffc107',
                    borderRadius: '4px',
                    padding: '12px',
                    marginBottom: '1.5rem',
                    textAlign: 'center',
                    color: '#856404',
                    fontWeight: '500'
                  }}>
                    Se reemplazarán las notas en el registro del cuadro seleccionado
                  </div>

                  {/* Botones */}
                  <div className="form-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                    <button
                      type="button"
                      className="btn-cancelar"
                      onClick={() => {
                        setMostrarModalAsignarRegistro(false);
                        setTareaParaAsignar(null);
                        setDatosAsignarRegistro(null);
                        setCriterioSeleccionado('');
                        setCuadroSeleccionado('0');
                      }}
                      disabled={guardandoAsignarRegistro}
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      className="btn-guardar"
                      onClick={handleGuardarAsignarRegistro}
                      disabled={guardandoAsignarRegistro || !criterioSeleccionado}
                    >
                      {guardandoAsignarRegistro ? '⏳ Guardando...' : '💾 Guardar Datos'}
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal de Asignar a Registro (Exámenes) */}
      {mostrarModalAsignarRegistroExamen && createPortal(
        <div 
          className="modal-tema-overlay"
          onClick={() => {
            setMostrarModalAsignarRegistroExamen(false);
            setExamenParaAsignar(null);
            setDatosAsignarRegistroExamen(null);
            setCriterioSeleccionadoExamen('');
            setCuadroSeleccionadoExamen('0');
          }}
        >
          <div 
            className="modal-tema-container"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-asignar-registro-examen-title"
            style={{ maxWidth: '600px', width: '90%' }}
          >
            <div className="modal-tema-header">
              <h2 id="modal-asignar-registro-examen-title">
                📋 ASIGNAR A REGISTRO
              </h2>
              <button
                className="modal-tema-close"
                onClick={() => {
                  setMostrarModalAsignarRegistroExamen(false);
                  setExamenParaAsignar(null);
                  setDatosAsignarRegistroExamen(null);
                  setCriterioSeleccionadoExamen('');
                  setCuadroSeleccionadoExamen('0');
                }}
                aria-label="Cerrar"
              >
                ×
              </button>
      </div>

            <div className="modal-tema-body" style={{ padding: '1.5rem' }}>
              {loadingAsignarRegistroExamen ? (
                <div style={{ textAlign: 'center', padding: '2rem' }}>
                  <div className="loading-spinner-small"></div>
                  <p>Cargando datos...</p>
                </div>
              ) : datosAsignarRegistroExamen ? (
                <>
                  {/* Campos read-only */}
                  <div style={{ marginBottom: '1rem' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: '#fff' }}>
                      <tbody>
                        <tr style={{ borderBottom: '1px solid #eee' }}>
                          <td style={{ padding: '12px', backgroundColor: '#e8f5e9', fontWeight: 'bold', width: '40%', borderRight: '1px solid #ddd' }}>
                            EXAMEN
                          </td>
                          <td style={{ padding: '12px', backgroundColor: '#fff' }}>
                            {datosAsignarRegistroExamen.examen.titulo}
                          </td>
                        </tr>
                        <tr style={{ borderBottom: '1px solid #eee' }}>
                          <td style={{ padding: '12px', backgroundColor: '#e8f5e9', fontWeight: 'bold', borderRight: '1px solid #ddd' }}>
                            ASIGNATURA
                          </td>
                          <td style={{ padding: '12px', backgroundColor: '#fff' }}>
                            {datosAsignarRegistroExamen.examen.curso_nombre}
                          </td>
                        </tr>
                        <tr style={{ borderBottom: '1px solid #eee' }}>
                          <td style={{ padding: '12px', backgroundColor: '#e8f5e9', fontWeight: 'bold', borderRight: '1px solid #ddd' }}>
                            BIMESTRE
                          </td>
                          <td style={{ padding: '12px', backgroundColor: '#fff' }}>
                            {datosAsignarRegistroExamen.examen.ciclo}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Campo CRITERIO */}
                  <div className="form-group" style={{ marginBottom: '1rem' }}>
                    <label htmlFor="criterio-select-examen" style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                      CRITERIO
                    </label>
                    <select
                      id="criterio-select-examen"
                      className="form-input"
                      value={criterioSeleccionadoExamen}
                      onChange={(e) => {
                        setCriterioSeleccionadoExamen(e.target.value);
                        // Resetear cuadro cuando cambia el criterio
                        if (e.target.value) {
                          const [criterioId, indicadorId] = e.target.value.split('_');
                          const criterio = datosAsignarRegistroExamen.criterios.find(c => c.id === parseInt(criterioId));
                          if (criterio) {
                            const indicador = criterio.indicadores.find(i => i.id === parseInt(indicadorId));
                            if (indicador && indicador.cuadros > 0) {
                              setCuadroSeleccionadoExamen('0');
                            }
                          }
                        }
                      }}
                      style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '4px' }}
                    >
                      <option value="">Seleccionar criterio...</option>
                      {datosAsignarRegistroExamen.criterios.map(criterio => 
                        criterio.indicadores && criterio.indicadores.length > 0 ? (
                          criterio.indicadores.map(indicador => (
                            <option key={`${criterio.id}_${indicador.id}`} value={`${criterio.id}_${indicador.id}`}>
                              {criterio.descripcion} - {indicador.descripcion}
                            </option>
                          ))
                        ) : null
                      )}
                    </select>
                  </div>

                  {/* Campo CUADRO */}
                  {criterioSeleccionadoExamen && (() => {
                    const [criterioId, indicadorId] = criterioSeleccionadoExamen.split('_');
                    const criterio = datosAsignarRegistroExamen.criterios.find(c => c.id === parseInt(criterioId));
                    if (criterio) {
                      const indicador = criterio.indicadores.find(i => i.id === parseInt(indicadorId));
                      if (indicador && indicador.cuadros > 0) {
                        return (
                          <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                            <label htmlFor="cuadro-select-examen" style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                              CUADRO
                            </label>
                            <select
                              id="cuadro-select-examen"
                              className="form-input"
                              value={cuadroSeleccionadoExamen}
                              onChange={(e) => setCuadroSeleccionadoExamen(e.target.value)}
                              style={{ width: '100px', padding: '10px', border: '1px solid #ddd', borderRadius: '4px' }}
                            >
                              {Array.from({ length: indicador.cuadros }, (_, i) => (
                                <option key={i} value={i}>{i + 1}</option>
                              ))}
                            </select>
                          </div>
                        );
                      }
                    }
                    return null;
                  })()}

                  {/* Warning */}
                  <div style={{
                    backgroundColor: '#fff3cd',
                    border: '1px solid #ffc107',
                    borderRadius: '4px',
                    padding: '12px',
                    marginBottom: '1.5rem',
                    textAlign: 'center',
                    color: '#856404',
                    fontWeight: '500'
                  }}>
                    Se reemplazarán las notas en el registro del cuadro seleccionado con los mejores puntajes del examen
                  </div>

                  {/* Botones */}
                  <div className="form-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                    <button
                      type="button"
                      className="btn-cancelar"
                      onClick={() => {
                        setMostrarModalAsignarRegistroExamen(false);
                        setExamenParaAsignar(null);
                        setDatosAsignarRegistroExamen(null);
                        setCriterioSeleccionadoExamen('');
                        setCuadroSeleccionadoExamen('0');
                      }}
                      disabled={guardandoAsignarRegistroExamen}
                    >
                      ✖️ Cancelar
                    </button>
                    <button
                      type="button"
                      className="btn-guardar"
                      onClick={handleGuardarAsignarRegistroExamen}
                      disabled={guardandoAsignarRegistroExamen || !criterioSeleccionadoExamen}
                    >
                      {guardandoAsignarRegistroExamen ? '⏳ Guardando...' : '💾 Guardar Datos'}
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal de Examen - Fuera del renderExamenesContent para que funcione siempre */}
      {mostrarFormExamen && createPortal(
        <ExamenForm
          asignaturaId={asignaturaId}
          formExamen={formExamen}
          setFormExamen={setFormExamen}
          totalNotas={totalNotas}
          guardandoExamen={guardandoExamen}
          setGuardandoExamen={setGuardandoExamen}
          examenEditando={examenEditando}
          onClose={() => {
            setMostrarFormExamen(false);
            setExamenEditando(null);
            setFormExamen({
              titulo: '',
              tipo: 'VIRTUAL',
              tipo_puntaje: 'GENERAL',
              puntos_correcta: 1,
              penalizar_incorrecta: 'NO',
              penalizacion_incorrecta: 0,
              tiempo: 60,
              intentos: 1,
              orden_preguntas: 'PREDETERMINADO',
              preguntas_max: 1,
              ciclo: bimestreGlobal,
              estado: 'INACTIVO',
              habilitar_fecha_hora: false,
              fecha_desde: '',
              fecha_hasta: '',
              hora_desde: '08:00',
              hora_hasta: '20:00',
              archivo_pdf: null
            });
          }}
          onSuccess={() => {
            const cicloCreado = formExamen.ciclo || cicloExamenes || bimestreGlobal;
            setMostrarFormExamen(false);
            setExamenEditando(null);
            // Sincronizar cicloExamenes con el ciclo del examen creado
            if (cicloCreado !== cicloExamenes) {
              setCicloExamenes(cicloCreado);
            }
            // Recargar usando el ciclo del examen que se acaba de crear
            cargarExamenes(cicloCreado);
          }}
        />,
        document.body
      )}

      {/* Modal de Preguntas y Alternativas */}
      {mostrarPreguntasAlternativas && examenSeleccionado && createPortal(
        <PreguntasAlternativasModal
          examen={examenSeleccionado}
          preguntas={preguntas}
          setPreguntas={setPreguntas}
          cargandoPreguntas={cargandoPreguntas}
          onClose={() => {
            setMostrarPreguntasAlternativas(false);
            setExamenSeleccionado(null);
            setPreguntas([]);
          }}
          onNuevaPregunta={handleNuevaPregunta}
          onEditarPregunta={handleEditarPregunta}
          onEliminarPregunta={handleEliminarPregunta}
          onRecargar={() => cargarPreguntas(examenSeleccionado.id)}
        />,
        document.body
      )}

      {/* Modal de Resultados de Examen */}
      {mostrarResultadosExamen && examenParaResultados && createPortal(
        <ResultadosExamenModal
          examen={examenParaResultados}
          resultados={resultadosExamen}
          cargandoResultados={cargandoResultados}
          onClose={() => {
            setMostrarResultadosExamen(false);
            setExamenParaResultados(null);
            setResultadosExamen([]);
          }}
          onVerDetalles={handleVerDetallesResultado}
          onBorrarResultado={handleBorrarResultado}
          onDescargarPDF={handleDescargarPDF}
          onVolverCalificar={handleVolverCalificar}
          onBorrarTodosResultados={handleBorrarTodosResultados}
        />,
        document.body
      )}

      {/* Modal de Detalles del Resultado */}
      {mostrarDetallesResultado && resultadoParaDetalles && detallesResultado && createPortal(
        <DetallesResultadoModal
          resultado={resultadoParaDetalles}
          detalles={detallesResultado}
          cargando={cargandoDetallesResultado}
          onClose={() => {
            setMostrarDetallesResultado(false);
            setResultadoParaDetalles(null);
            setDetallesResultado(null);
          }}
        />,
        document.body
      )}

      {/* Modal de Formulario de Pregunta */}
      {mostrarFormPregunta && examenSeleccionado && createPortal(
        <PreguntaFormModal
          examen={examenSeleccionado}
          pregunta={preguntaEditando}
          formPregunta={formPregunta}
          setFormPregunta={setFormPregunta}
          alternativas={alternativas}
          setAlternativas={setAlternativas}
          onClose={() => {
            setMostrarFormPregunta(false);
            setPreguntaEditando(null);
            setFormPregunta({ descripcion: '', tipo: 'ALTERNATIVAS', puntos: 0, datos_adicionales: null });
            setAlternativas([]);
          }}
          onSuccess={async () => {
            setMostrarFormPregunta(false);
            setPreguntaEditando(null);
            setFormPregunta({ descripcion: '', tipo: 'ALTERNATIVAS', puntos: 0, datos_adicionales: null });
            setAlternativas([]);
            await cargarPreguntas(examenSeleccionado.id);
            // Recargar la lista de exámenes para actualizar el contador de preguntas en la grilla
            await cargarExamenes(cicloExamenes);
          }}
        />,
        document.body
      )}

      </div>
    </DashboardLayout>
  );
}

// Componente para el formulario de examen
function ExamenForm({ asignaturaId, formExamen, setFormExamen, onClose, onSuccess, totalNotas, guardandoExamen, setGuardandoExamen, examenEditando }) {
  const handleCrearExamen = async (e) => {
    e.preventDefault();
    
    if (!formExamen.titulo || !formExamen.tipo || !formExamen.ciclo || !formExamen.estado) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'Título, Tipo, Bimestre y Estado son requeridos',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000
      });
      return;
    }

    // Si es PDF, debe tener archivo (solo en creación, en edición puede mantener el existente)
    if (formExamen.tipo === 'PDF' && !examenEditando && !formExamen.archivo_pdf) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'Debe subir un archivo PDF para exámenes tipo PDF',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000
      });
      return;
    }

    // Si es VIRTUAL, validar campos requeridos
    if (formExamen.tipo === 'VIRTUAL') {
      if (!formExamen.tipo_puntaje || !formExamen.tiempo) {
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: 'Tipo de Puntaje y Tiempo son requeridos para exámenes virtuales',
          toast: true,
          position: 'top-end',
          showConfirmButton: false,
          timer: 3000
        });
        return;
      }
      // Si es GENERAL, también requiere puntos_correcta
      if (formExamen.tipo_puntaje === 'GENERAL' && !formExamen.puntos_correcta) {
      Swal.fire({
          icon: 'error',
          title: 'Error',
          text: 'Puntos por respuesta correcta es requerido cuando la calificación es GENERAL',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000
      });
      return;
      }
    }

    setGuardandoExamen(true);
    try {
      const formData = new FormData();
      formData.append('asignatura_id', asignaturaId);
      formData.append('titulo', formExamen.titulo);
      formData.append('tipo', formExamen.tipo);
      formData.append('ciclo', formExamen.ciclo);
      formData.append('estado', formExamen.estado);
      formData.append('habilitar_fecha_hora', formExamen.habilitar_fecha_hora ? 'SI' : 'NO');

      if (formExamen.tipo === 'VIRTUAL') {
        formData.append('tipo_puntaje', formExamen.tipo_puntaje);
        // Solo enviar puntos_correcta si es GENERAL
        if (formExamen.tipo_puntaje === 'GENERAL') {
          formData.append('puntos_correcta', formExamen.puntos_correcta);
        } else {
          // Para INDIVIDUAL, enviar un valor por defecto (se asignará en cada pregunta)
          formData.append('puntos_correcta', 0);
        }
        formData.append('penalizar_incorrecta', formExamen.penalizar_incorrecta);
        formData.append('penalizacion_incorrecta', formExamen.penalizacion_incorrecta || 0);
        formData.append('tiempo', formExamen.tiempo);
        formData.append('intentos', formExamen.intentos);
        formData.append('orden_preguntas', formExamen.orden_preguntas);
        formData.append('preguntas_max', formExamen.preguntas_max);
      }

      if (formExamen.habilitar_fecha_hora) {
        if (formExamen.fecha_desde) formData.append('fecha_desde', formExamen.fecha_desde);
        if (formExamen.fecha_hasta) formData.append('fecha_hasta', formExamen.fecha_hasta);
        if (formExamen.hora_desde) formData.append('hora_desde', formExamen.hora_desde);
        if (formExamen.hora_hasta) formData.append('hora_hasta', formExamen.hora_hasta);
      }

      if (formExamen.archivo_pdf) {
        formData.append('archivo_pdf', formExamen.archivo_pdf);
      }

      // Si está editando, usar PUT, si no, usar POST
      if (examenEditando) {
        await api.put(`/docente/aula-virtual/examenes/${examenEditando.id}`, formData, {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        });

        Swal.fire({
          icon: 'success',
          title: '¡Examen actualizado!',
          text: 'El examen se ha actualizado correctamente',
          toast: true,
          position: 'top-end',
          showConfirmButton: false,
          timer: 3000,
          timerProgressBar: true
        });
      } else {
        await api.post('/docente/aula-virtual/examenes', formData, {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        });

      Swal.fire({
        icon: 'success',
        title: '¡Examen creado!',
        text: 'El examen se ha creado correctamente',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000,
        timerProgressBar: true
      });
      }

      onSuccess();
    } catch (error) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: error.response?.data?.error || (examenEditando ? 'No se pudo actualizar el examen' : 'No se pudo crear el examen'),
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000
      });
    } finally {
      setGuardandoExamen(false);
    }
  };

  return (
    <div className="modal-tema-overlay" onClick={onClose}>
      <div className="modal-tema-container" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal-tema-header">
          <h2>{examenEditando ? '✏️ Editar Examen' : '📝 Registrar Examen'}</h2>
          <button className="modal-tema-close" onClick={onClose} aria-label="Cerrar">×</button>
        </div>

        <div className="modal-tema-body">
      <form onSubmit={handleCrearExamen}>
            <div className="form-group">
              <label htmlFor="examen-titulo">Título *</label>
              <input
                type="text"
                id="examen-titulo"
                className="form-input"
                value={formExamen.titulo}
                onChange={(e) => setFormExamen({ ...formExamen, titulo: e.target.value })}
                placeholder="Ej: Práctica N° 1: El Clima"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="examen-tipo">Tipo *</label>
              <select
                id="examen-tipo"
                className="form-input"
                value={formExamen.tipo}
                onChange={(e) => setFormExamen({ ...formExamen, tipo: e.target.value })}
                required
              >
                <option value="VIRTUAL">VIRTUAL</option>
                <option value="PDF">PDF</option>
              </select>
            </div>

            {/* Campos solo para VIRTUAL */}
            {formExamen.tipo === 'VIRTUAL' && (
              <>
                <div className="form-group">
                  <label htmlFor="examen-calificacion">Calificación</label>
                  <select
                    id="examen-calificacion"
                    className="form-input"
                value={formExamen.tipo_puntaje}
                onChange={(e) => setFormExamen({ ...formExamen, tipo_puntaje: e.target.value })}
              >
                    <option value="INDIVIDUAL">INDIVIDUAL</option>
                    <option value="GENERAL">GENERAL</option>
              </select>
            </div>

                {/* Solo mostrar "Puntos por respuesta correcta" si es GENERAL */}
                {formExamen.tipo_puntaje === 'GENERAL' && (
            <div className="form-group">
                    <label htmlFor="examen-puntos-correcta">Puntos por respuesta correcta *</label>
              <input
                type="number"
                      id="examen-puntos-correcta"
                      className="form-input"
                step="1"
                min="0"
                value={formExamen.puntos_correcta}
                      onChange={(e) => setFormExamen({ ...formExamen, puntos_correcta: parseInt(e.target.value) || 1 })}
                required
              />
            </div>
                )}

                {/* Solo mostrar "Penalizar Incorrecta" si es GENERAL */}
                {formExamen.tipo_puntaje === 'GENERAL' && (
                  <>
            <div className="form-group">
                      <label htmlFor="examen-penalizar">Penalizar Incorrecta</label>
              <select
                        id="examen-penalizar"
                        className="form-input"
                value={formExamen.penalizar_incorrecta}
                onChange={(e) => setFormExamen({ ...formExamen, penalizar_incorrecta: e.target.value })}
              >
                        <option value="NO">NO</option>
                        <option value="SI">SI</option>
              </select>
            </div>

            {formExamen.penalizar_incorrecta === 'SI' && (
              <div className="form-group">
                        <label htmlFor="examen-penalizacion">Penalización por Incorrecta</label>
                <input
                  type="number"
                          id="examen-penalizacion"
                          className="form-input"
                  step="1"
                  min="0"
                  value={formExamen.penalizacion_incorrecta}
                          onChange={(e) => setFormExamen({ ...formExamen, penalizacion_incorrecta: parseInt(e.target.value) || 0 })}
                />
              </div>
            )}
                  </>
                )}

            <div className="form-group">
                  <label htmlFor="examen-tiempo">Tiempo *</label>
              <input
                type="number"
                    id="examen-tiempo"
                    className="form-input"
                min="1"
                value={formExamen.tiempo}
                    onChange={(e) => setFormExamen({ ...formExamen, tiempo: parseInt(e.target.value) || 60 })}
                required
              />
            </div>

            <div className="form-group">
                  <label htmlFor="examen-intentos">Intentos</label>
              <input
                type="number"
                    id="examen-intentos"
                    className="form-input"
                min="1"
                value={formExamen.intentos}
                    onChange={(e) => setFormExamen({ ...formExamen, intentos: parseInt(e.target.value) || 1 })}
              />
            </div>

            <div className="form-group">
                  <label htmlFor="examen-orden">Orden de Preguntas</label>
              <select
                    id="examen-orden"
                    className="form-input"
                value={formExamen.orden_preguntas}
                onChange={(e) => setFormExamen({ ...formExamen, orden_preguntas: e.target.value })}
              >
                    <option value="PREDETERMINADO">PREDETERMINADO</option>
                    <option value="ALEATORIO">ALEATORIO</option>
              </select>
            </div>

            <div className="form-group">
                  <label htmlFor="examen-preguntas-max">Preguntas Max. *</label>
              <input
                type="number"
                    id="examen-preguntas-max"
                    className="form-input"
                min="1"
                value={formExamen.preguntas_max}
                    onChange={(e) => setFormExamen({ ...formExamen, preguntas_max: parseInt(e.target.value) || 1 })}
                    required
              />
            </div>
              </>
            )}

            {/* Campo Archivo PDF solo para PDF */}
            {formExamen.tipo === 'PDF' && (
            <div className="form-group">
                <label htmlFor="examen-archivo-pdf">
                  Archivo PDF {examenEditando ? '(Opcional - dejar vacío para mantener el actual)' : '*'}
                </label>
              <input
                  type="file"
                  id="examen-archivo-pdf"
                  className="form-input"
                  accept=".pdf"
                  onChange={(e) => setFormExamen({ ...formExamen, archivo_pdf: e.target.files[0] || null })}
                  required={formExamen.tipo === 'PDF' && !examenEditando}
                />
                {examenEditando && examenEditando.archivo_pdf && (
                  <small style={{ display: 'block', marginTop: '0.5rem', color: '#6b7280' }}>
                    Archivo actual: {examenEditando.archivo_pdf.split('/').pop()}
                  </small>
                )}
              </div>
            )}

            <div className="form-group">
              <label htmlFor="examen-bimestre">Bimestre *</label>
              <select
                id="examen-bimestre"
                className="form-input"
                value={formExamen.ciclo}
                onChange={(e) => setFormExamen({ ...formExamen, ciclo: parseInt(e.target.value) })}
                required
              >
                {Array.from({ length: totalNotas }, (_, i) => i + 1).map((bim) => (
                  <option key={bim} value={bim}>
                    Bimestre {bim}
                  </option>
                ))}
              </select>
            </div>

            {/* Toggle Habilitar fecha y hora */}
            <div className="form-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={formExamen.habilitar_fecha_hora}
                  onChange={(e) => setFormExamen({ ...formExamen, habilitar_fecha_hora: e.target.checked })}
                />
                Habilitar fecha y hora
              </label>
            </div>

            {/* Campos de fecha y hora solo si está habilitado */}
            {formExamen.habilitar_fecha_hora && (
              <>
            <div className="form-group">
                  <label htmlFor="examen-fecha-desde">Desde</label>
              <input
                type="date"
                    id="examen-fecha-desde"
                    className="form-input"
                    value={formExamen.fecha_desde}
                    onChange={(e) => setFormExamen({ ...formExamen, fecha_desde: e.target.value })}
              />
            </div>

            <div className="form-group">
                  <label htmlFor="examen-hora-desde">Hora Desde</label>
              <input
                type="time"
                    id="examen-hora-desde"
                    className="form-input"
                value={formExamen.hora_desde}
                onChange={(e) => setFormExamen({ ...formExamen, hora_desde: e.target.value })}
              />
            </div>

            <div className="form-group">
                  <label htmlFor="examen-fecha-hasta">Hasta</label>
                  <input
                    type="date"
                    id="examen-fecha-hasta"
                    className="form-input"
                    value={formExamen.fecha_hasta}
                    onChange={(e) => setFormExamen({ ...formExamen, fecha_hasta: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="examen-hora-hasta">Hora Hasta</label>
              <input
                type="time"
                    id="examen-hora-hasta"
                    className="form-input"
                value={formExamen.hora_hasta}
                onChange={(e) => setFormExamen({ ...formExamen, hora_hasta: e.target.value })}
              />
            </div>
              </>
            )}

            <div className="form-group">
              <label htmlFor="examen-estado">Estado *</label>
              <select
                id="examen-estado"
                className="form-input"
                value={formExamen.estado}
                onChange={(e) => setFormExamen({ ...formExamen, estado: e.target.value })}
                required
              >
                <option value="ACTIVO">ACTIVO</option>
                <option value="INACTIVO">INACTIVO</option>
              </select>
          </div>

            <div className="form-actions">
              <button
                type="button"
                className="btn-cancelar"
                onClick={onClose}
                disabled={guardandoExamen}
              >
                ✖️ Cancelar
              </button>
              <button
                type="submit"
                className="btn-guardar"
                disabled={guardandoExamen}
              >
                {guardandoExamen ? '⏳ Guardando...' : '💾 Guardar Datos'}
              </button>
        </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// Componente para el modal de Preguntas y Alternativas
function PreguntasAlternativasModal({ examen, preguntas, setPreguntas, cargandoPreguntas, onClose, onNuevaPregunta, onEditarPregunta, onEliminarPregunta, onRecargar }) {
  const [preguntaVistaPrevia, setPreguntaVistaPrevia] = useState(null);
  const [mostrarVistaPrevia, setMostrarVistaPrevia] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = async (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = preguntas.findIndex(p => p.id === active.id);
    const newIndex = preguntas.findIndex(p => p.id === over.id);

    if (oldIndex === -1 || newIndex === -1) return;

    const nuevasPreguntas = arrayMove(preguntas, oldIndex, newIndex);
    setPreguntas(nuevasPreguntas);

    // Actualizar orden en el backend
    try {
      for (let i = 0; i < nuevasPreguntas.length; i++) {
        await api.put(`/docente/aula-virtual/preguntas/${nuevasPreguntas[i].id}`, {
          descripcion: nuevasPreguntas[i].descripcion,
          tipo: nuevasPreguntas[i].tipo,
          puntos: nuevasPreguntas[i].puntos,
          orden: i + 1,
          datos_adicionales: nuevasPreguntas[i].datos_adicionales
        });
      }
      
      Swal.fire({
        icon: 'success',
        title: '¡Orden actualizado!',
        text: 'El orden de las preguntas se ha guardado correctamente',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 2000,
        timerProgressBar: true
      });
    } catch (error) {
      console.error('Error actualizando orden:', error);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'No se pudo actualizar el orden. Recargando...',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 2000
      });
      // Revertir en caso de error
      onRecargar();
    }
  };

  const verVistaPrevia = async (pregunta) => {
    try {
      // Para COMPLETAR y RESPUESTA_CORTA no hay alternativas, no intentar cargarlas
      if (pregunta.tipo === 'COMPLETAR' || pregunta.tipo === 'RESPUESTA_CORTA') {
        setPreguntaVistaPrevia({
          ...pregunta,
          alternativas: []
        });
        setMostrarVistaPrevia(true);
      } else {
        const response = await api.get(`/docente/aula-virtual/preguntas/${pregunta.id}/alternativas`);
        setPreguntaVistaPrevia({
          ...pregunta,
          alternativas: response.data.alternativas || []
        });
        setMostrarVistaPrevia(true);
      }
    } catch (error) {
      console.error('Error cargando alternativas para vista previa:', error);
      setPreguntaVistaPrevia({ ...pregunta, alternativas: [] });
      setMostrarVistaPrevia(true);
    }
  };

  return (
    <>
      <div className="modal-tema-overlay" onClick={onClose}>
        <div className="modal-tema-container" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" style={{ maxWidth: '90%', width: '1200px', maxHeight: '90vh', overflow: 'auto' }}>
          <div className="modal-tema-header" style={{ background: 'linear-gradient(135deg, #a78bfa 0%, #8b5cf6 100%)' }}>
            <h2>📝 Preguntas y Alternativas - {examen.titulo}</h2>
            <button className="modal-tema-close" onClick={onClose} aria-label="Cerrar">×</button>
          </div>

          <div className="modal-tema-body">
            <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <p style={{ margin: 0, color: '#6b7280', fontSize: '0.9rem' }}>
                  Total de preguntas: <strong style={{ color: '#6366f1', fontSize: '1.1rem' }}>{preguntas.length}</strong>
                </p>
              </div>
              <button
                className="btn-nuevo-item"
                onClick={() => onNuevaPregunta(examen)}
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
              >
                <span>➕</span> Registrar Nuevo
              </button>
            </div>

            {cargandoPreguntas ? (
              <div className="empty-state">
                <p>⏳ Cargando preguntas...</p>
              </div>
            ) : preguntas.length > 0 ? (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <table className="tabla-aula-virtual">
                  <thead>
                    <tr>
                      <th style={{ width: '40px' }}></th>
                      <th style={{ textAlign: 'left' }}>DESCRIPCIÓN</th>
                      <th style={{ textAlign: 'center', width: '150px' }}>TIPO</th>
                      <th style={{ textAlign: 'center', width: '100px' }}>PUNTOS</th>
                      <th style={{ textAlign: 'center', width: '200px' }}>ACCIONES</th>
                    </tr>
                  </thead>
                  <SortableContext items={preguntas.map(p => p.id)} strategy={verticalListSortingStrategy}>
                    <tbody>
                      {preguntas.map((pregunta, index) => (
                        <SortablePreguntaRow
                          key={pregunta.id}
                          pregunta={pregunta}
                          examen={examen}
                          index={index}
                          onEditar={onEditarPregunta}
                          onEliminar={onEliminarPregunta}
                          onVistaPrevia={verVistaPrevia}
                        />
                      ))}
                    </tbody>
                  </SortableContext>
                </table>
              </DndContext>
            ) : (
              <div className="empty-state">
                <p>📋 No hay preguntas registradas para este examen</p>
                <button
                  className="btn-nuevo-item"
                  onClick={() => onNuevaPregunta(examen)}
                  style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '1rem auto 0' }}
                >
                  <span>➕</span> Registrar Primera Pregunta
                </button>
            </div>
            )}
            </div>

          <div className="modal-tema-footer" style={{ padding: '1rem 1.5rem', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn-cancelar-tema" onClick={onClose}>
              ✖️ Cerrar
            </button>
          </div>
          </div>
        </div>

      {/* Modal de Vista Previa */}
      {mostrarVistaPrevia && preguntaVistaPrevia && (
        <VistaPreviaPreguntaModal
          pregunta={preguntaVistaPrevia}
          examen={examen}
          onClose={() => {
            setMostrarVistaPrevia(false);
            setPreguntaVistaPrevia(null);
          }}
        />
      )}
    </>
  );
}

// Componente para fila ordenable de pregunta
function SortablePreguntaRow({ pregunta, examen, index, onEditar, onEliminar, onVistaPrevia }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: pregunta.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    cursor: isDragging ? 'grabbing' : 'grab',
  };

  const getTipoColor = (tipo) => {
    const colores = {
      'ALTERNATIVAS': { bg: '#dbeafe', color: '#1e40af' },
      'COMPLETAR': { bg: '#fef3c7', color: '#92400e' },
      'VERDADERO_FALSO': { bg: '#d1fae5', color: '#065f46' },
      'RESPUESTA_CORTA': { bg: '#e0e7ff', color: '#3730a3' },
      'ORDENAR': { bg: '#fce7f3', color: '#831843' },
      'EMPAREJAR': { bg: '#f3e8ff', color: '#6b21a8' },
      'ARRASTRAR_Y_SOLTAR': { bg: '#fef3c7', color: '#78350f' }
    };
    return colores[tipo] || { bg: '#f3f4f6', color: '#374151' };
  };

  const tipoColor = getTipoColor(pregunta.tipo);

  // Calcular puntos según el tipo de calificación del examen
  const puntosMostrar = examen.tipo_puntaje === 'GENERAL' 
    ? (examen.puntos_correcta || 0)  // Si es GENERAL, mostrar puntos_correcta del examen
    : (pregunta.puntos || 0);         // Si es INDIVIDUAL, mostrar puntos de la pregunta

  return (
    <tr ref={setNodeRef} style={style} className={isDragging ? 'dragging' : ''}>
      <td style={{ padding: '0.75rem', textAlign: 'center' }}>
        <div
          {...attributes}
          {...listeners}
          className="drag-handle"
          style={{ cursor: 'grab', fontSize: '1.2rem', userSelect: 'none' }}
        >
          ⋮⋮
        </div>
      </td>
      <td style={{ padding: '0.75rem' }}>
        <div 
          dangerouslySetInnerHTML={{ __html: pregunta.descripcion }} 
          style={{ 
            maxHeight: '60px', 
            overflow: 'hidden',
            lineHeight: '1.5',
            color: '#1f2937'
          }} 
        />
      </td>
      <td style={{ padding: '0.75rem', textAlign: 'center' }}>
        <span style={{ 
          padding: '0.375rem 0.875rem', 
          borderRadius: '12px', 
          fontSize: '0.75rem',
          fontWeight: '600',
          backgroundColor: tipoColor.bg,
          color: tipoColor.color,
          display: 'inline-block'
        }}>
          {pregunta.tipo.replace(/_/g, ' ')}
        </span>
      </td>
      <td style={{ padding: '0.75rem', textAlign: 'center', fontWeight: '600', color: '#6366f1' }}>
        {puntosMostrar}
      </td>
      <td style={{ padding: '0.75rem', textAlign: 'center' }}>
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', alignItems: 'center' }}>
          <button
            className="btn-opciones"
            onClick={() => onVistaPrevia(pregunta)}
            style={{ 
              fontSize: '1.2rem', 
              padding: '0.5rem',
              width: '36px',
              height: '36px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '8px'
            }}
            title="Vista previa"
          >
            👁️
          </button>
          <button
            className="btn-opciones"
            onClick={() => onEditar(pregunta)}
            style={{ 
              fontSize: '1.2rem', 
              padding: '0.5rem',
              width: '36px',
              height: '36px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '8px'
            }}
            title="Editar"
          >
            ✏️
          </button>
          <button
            className="btn-opciones"
            onClick={() => onEliminar(pregunta)}
            style={{ 
              fontSize: '1.2rem', 
              padding: '0.5rem',
              width: '36px',
              height: '36px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
              color: 'white'
            }}
            title="Eliminar"
          >
            🗑️
          </button>
        </div>
      </td>
    </tr>
  );
}

// Componente para vista previa de pregunta
function VistaPreviaPreguntaModal({ pregunta, examen, onClose }) {
  // Calcular puntos según el tipo de calificación del examen
  const puntosMostrar = examen.tipo_puntaje === 'GENERAL' 
    ? (examen.puntos_correcta || 0)  // Si es GENERAL, mostrar puntos_correcta del examen
    : (pregunta.puntos || 0);         // Si es INDIVIDUAL, mostrar puntos de la pregunta

  return (
    <div className="modal-tema-overlay" onClick={onClose}>
      <div className="modal-tema-container" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" style={{ maxWidth: '90%', width: '800px', maxHeight: '90vh', overflow: 'auto' }}>
        <div className="modal-tema-header" style={{ background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)' }}>
          <h2>👁️ Vista Previa de Pregunta</h2>
          <button className="modal-tema-close" onClick={onClose} aria-label="Cerrar">×</button>
        </div>

        <div className="modal-tema-body">
          <div style={{ marginBottom: '1.5rem', padding: '1rem', background: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
            <div style={{ marginBottom: '0.5rem', fontSize: '0.875rem', color: '#6b7280', fontWeight: '600' }}>
              TIPO: <span style={{ color: '#6366f1' }}>{pregunta.tipo.replace(/_/g, ' ')}</span>
            </div>
            <div style={{ marginBottom: '0.5rem', fontSize: '0.875rem', color: '#6b7280', fontWeight: '600' }}>
              PUNTOS: <span style={{ color: '#6366f1' }}>{puntosMostrar}</span>
            </div>
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '700', color: '#374151' }}>
              PREGUNTA:
            </label>
            <div 
              style={{ 
                padding: '1rem', 
                background: 'white', 
                border: '2px solid #e5e7eb', 
                borderRadius: '8px',
                minHeight: '80px'
              }}
              dangerouslySetInnerHTML={{ __html: pregunta.descripcion }} 
            />
          </div>

          {/* Mostrar alternativas solo si NO es COMPLETAR ni RESPUESTA_CORTA */}
          {pregunta.tipo !== 'COMPLETAR' && pregunta.tipo !== 'RESPUESTA_CORTA' && pregunta.alternativas && pregunta.alternativas.length > 0 && (
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '700', color: '#374151' }}>
                ALTERNATIVAS:
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {pregunta.alternativas.map((alt, index) => (
                  <div
                    key={alt.id || index}
                    style={{
                      padding: '0.875rem',
                      background: alt.correcta === 'SI' ? '#d1fae5' : 'white',
                      border: `2px solid ${alt.correcta === 'SI' ? '#10b981' : '#e5e7eb'}`,
                      borderRadius: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem'
                    }}
                  >
                    <div style={{ 
                      width: '24px', 
                      height: '24px', 
                      borderRadius: '50%', 
                      background: alt.correcta === 'SI' ? '#10b981' : '#e5e7eb',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'white',
                      fontWeight: 'bold',
                      fontSize: '0.75rem',
                      flexShrink: 0
                    }}>
                      {alt.correcta === 'SI' ? '✓' : index + 1}
                    </div>
                    <div 
                      style={{ flex: 1 }}
                      dangerouslySetInnerHTML={{ __html: alt.descripcion || '' }} 
                    />
                    {alt.orden_posicion && (
                      <span style={{ 
                        padding: '0.25rem 0.5rem', 
                        background: '#f3f4f6', 
                        borderRadius: '4px', 
                        fontSize: '0.75rem',
                        fontWeight: '600',
                        color: '#6366f1'
                      }}>
                        Pos: {alt.orden_posicion}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Para COMPLETAR, mostrar respuestas correctas extraídas de los placeholders */}
          {pregunta.tipo === 'COMPLETAR' && (
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '700', color: '#374151' }}>
                RESPUESTAS CORRECTAS:
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {(() => {
                  // Extraer respuestas correctas de los placeholders [[...]]
                  const descripcionLimpia = pregunta.descripcion ? pregunta.descripcion.replace(/<[^>]*>/g, '') : '';
                  const respuestasCorrectas = [];
                  const regex = /\[\[([^\]]+)\]\]/g;
                  let match;
                  while ((match = regex.exec(descripcionLimpia)) !== null) {
                    const respuesta = match[1].trim();
                    if (respuesta) {
                      respuestasCorrectas.push(respuesta);
                    }
                  }
                  
                  if (respuestasCorrectas.length === 0) {
                    return (
                      <div style={{ 
                        padding: '0.875rem', 
                        background: '#fef3c7', 
                        border: '2px solid #fbbf24', 
                        borderRadius: '8px',
                        color: '#78350f',
                        fontSize: '0.875rem'
                      }}>
                        ⚠️ No se encontraron respuestas correctas en los placeholders [[...]]
                      </div>
                    );
                  }
                  
                  return respuestasCorrectas.map((respuesta, index) => (
                    <div
                      key={index}
                      style={{
                        padding: '0.875rem',
                        background: '#d1fae5',
                        border: '2px solid #10b981',
                        borderRadius: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem'
                      }}
                    >
                      <div style={{ 
                        width: '24px', 
                        height: '24px', 
                        borderRadius: '50%', 
                        background: '#10b981',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white',
                        fontWeight: 'bold',
                        fontSize: '0.75rem',
                        flexShrink: 0
                      }}>
                        ✓
                      </div>
                      <div style={{ flex: 1, fontWeight: '500', color: '#065f46' }}>
                        {index + 1}. {respuesta}
                      </div>
                    </div>
                  ));
                })()}
              </div>
            </div>
          )}
        </div>

        <div className="modal-tema-footer" style={{ padding: '1rem 1.5rem', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn-cancelar-tema" onClick={onClose}>
            ✖️ Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

// Componente para el formulario de pregunta
function PreguntaFormModal({ examen, pregunta, formPregunta, setFormPregunta, alternativas, setAlternativas, onClose, onSuccess }) {
  const [guardando, setGuardando] = useState(false);
  const quillRefDescripcion = useRef(null);
  const quillRefsAlternativas = useRef({});

  // Cargar alternativas cuando se edita una pregunta
  useEffect(() => {
    if (pregunta && pregunta.id) {
      const cargarAlternativas = async () => {
        try {
          const response = await api.get(`/docente/aula-virtual/preguntas/${pregunta.id}/alternativas`);
          setAlternativas(response.data.alternativas || []);
        } catch (error) {
          console.error('Error cargando alternativas:', error);
          setAlternativas([]);
        }
      };
      cargarAlternativas();
    }
  }, [pregunta]);

  // No usar useEffect para inicializar VERDADERO_FALSO - se maneja en el onChange del select

  const agregarAlternativa = () => {
    const nuevaAlternativa = {
      id: null,
      descripcion: '',
      correcta: 'NO',
      orden_posicion: formPregunta.tipo === 'ORDENAR' ? alternativas.length + 1 : null,
      par_id: null,
      zona_drop: null
    };
    setAlternativas([...alternativas, nuevaAlternativa]);
  };

  const eliminarAlternativa = (index) => {
    const nuevasAlternativas = alternativas.filter((_, i) => i !== index);
    // Reordenar posiciones si es tipo ORDENAR
    if (formPregunta.tipo === 'ORDENAR') {
      nuevasAlternativas.forEach((alt, i) => {
        alt.orden_posicion = i + 1;
      });
    }
    setAlternativas(nuevasAlternativas);
  };

  const actualizarAlternativa = useCallback((index, campo, valor) => {
    // Usar la forma funcional de setState para evitar dependencias y bucles infinitos
    setAlternativas(prevAlternativas => {
      // Verificar si el valor realmente cambió
      if (prevAlternativas[index] && prevAlternativas[index][campo] === valor) {
        return prevAlternativas; // Retornar el mismo array si no hay cambios
      }
      
      const nuevasAlternativas = [...prevAlternativas];
      nuevasAlternativas[index] = { ...nuevasAlternativas[index], [campo]: valor };
      return nuevasAlternativas;
    });
  }, []); // Sin dependencias para evitar recrear la función

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formPregunta.descripcion || formPregunta.descripcion.trim() === '') {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'La descripción es requerida',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000
      });
      return;
    }

    // Validar alternativas según el tipo
    if (formPregunta.tipo === 'ALTERNATIVAS' || formPregunta.tipo === 'VERDADERO_FALSO' || formPregunta.tipo === 'ORDENAR' || formPregunta.tipo === 'EMPAREJAR') {
      if (alternativas.length < 2) {
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: 'Debe agregar al menos 2 alternativas',
          toast: true,
          position: 'top-end',
          showConfirmButton: false,
          timer: 3000
        });
        return;
      }

      // Para ALTERNATIVAS y VERDADERO_FALSO, debe haber al menos una correcta
      if ((formPregunta.tipo === 'ALTERNATIVAS' || formPregunta.tipo === 'VERDADERO_FALSO') && 
          !alternativas.some(alt => alt.correcta === 'SI')) {
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: 'Debe marcar al menos una alternativa como correcta',
          toast: true,
          position: 'top-end',
          showConfirmButton: false,
          timer: 3000
        });
        return;
      }
    }

    setGuardando(true);
    try {
      let preguntaId;

      if (pregunta && pregunta.id) {
        // Editar pregunta existente
        await api.put(`/docente/aula-virtual/preguntas/${pregunta.id}`, {
          descripcion: formPregunta.descripcion,
          tipo: formPregunta.tipo,
          puntos: examen.tipo_puntaje === 'INDIVIDUAL' ? formPregunta.puntos : 0,
          orden: pregunta.orden,
          datos_adicionales: formPregunta.datos_adicionales
        });
        preguntaId = pregunta.id;
      } else {
        // Crear nueva pregunta
        const response = await api.post(`/docente/aula-virtual/examenes/${examen.id}/preguntas`, {
          descripcion: formPregunta.descripcion,
          tipo: formPregunta.tipo,
          puntos: examen.tipo_puntaje === 'INDIVIDUAL' ? formPregunta.puntos : 0,
          datos_adicionales: formPregunta.datos_adicionales
        });
        preguntaId = response.data.pregunta_id;
      }

      // Guardar/actualizar alternativas
      if (formPregunta.tipo !== 'RESPUESTA_CORTA' && formPregunta.tipo !== 'COMPLETAR') {
        // Obtener alternativas existentes para comparar
        const alternativasExistentes = pregunta && pregunta.id 
          ? (await api.get(`/docente/aula-virtual/preguntas/${pregunta.id}/alternativas`)).data.alternativas || []
          : [];

        // Eliminar alternativas que ya no están
        for (const altExistente of alternativasExistentes) {
          if (!alternativas.find(alt => alt.id === altExistente.id)) {
            await api.delete(`/docente/aula-virtual/alternativas/${altExistente.id}`);
          }
        }

        // Crear/actualizar alternativas
        // Primero crear todas las alternativas para obtener sus IDs
        const alternativasConIds = [];
        
        for (let i = 0; i < alternativas.length; i++) {
          const alternativa = alternativas[i];
          if (!alternativa.descripcion || alternativa.descripcion.trim() === '') continue;

          // Para EMPAREJAR, no enviar par_id todavía si es un índice temporal
          let parIdParaGuardar = alternativa.par_id;
          if (formPregunta.tipo === 'EMPAREJAR' && parIdParaGuardar !== null && typeof parIdParaGuardar === 'number' && parIdParaGuardar < alternativas.length) {
            // Es un índice temporal, no enviarlo todavía
            parIdParaGuardar = null;
          }

          const datosAlternativa = {
            descripcion: alternativa.descripcion,
            correcta: alternativa.correcta === 'SI' || alternativa.correcta === true,
            orden_posicion: alternativa.orden_posicion || null,
            par_id: parIdParaGuardar,
            zona_drop: alternativa.zona_drop || null
          };

          if (alternativa.id) {
            // Actualizar alternativa existente
            await api.put(`/docente/aula-virtual/alternativas/${alternativa.id}`, datosAlternativa);
            alternativasConIds.push({ ...alternativa, id: alternativa.id, par_id_temporal: alternativa.par_id });
          } else {
            // Crear nueva alternativa
            const response = await api.post(`/docente/aula-virtual/preguntas/${preguntaId}/alternativas`, datosAlternativa);
            alternativasConIds.push({ ...alternativa, id: response.data.alternativa_id, par_id_temporal: alternativa.par_id });
          }
        }

        // Ahora actualizar los par_id con los IDs reales para tipo EMPAREJAR
        if (formPregunta.tipo === 'EMPAREJAR') {
          for (let i = 0; i < alternativasConIds.length; i++) {
            const alt = alternativasConIds[i];
            if (alt.par_id_temporal !== null && alt.par_id_temporal !== undefined && typeof alt.par_id_temporal === 'number') {
              // Si es un índice, buscar la alternativa correspondiente
              if (alt.par_id_temporal < alternativasConIds.length) {
                const alternativaPar = alternativasConIds[alt.par_id_temporal];
                if (alternativaPar && alternativaPar.id) {
                  // Actualizar con el ID real
                  await api.put(`/docente/aula-virtual/alternativas/${alt.id}`, {
                    descripcion: alt.descripcion,
                    correcta: alt.correcta,
                    orden_posicion: alt.orden_posicion,
                    par_id: alternativaPar.id,
                    zona_drop: alt.zona_drop
                  });
                }
              }
            }
          }
        }
      }

      Swal.fire({
        icon: 'success',
        title: pregunta ? '¡Pregunta actualizada!' : '¡Pregunta creada!',
        text: 'Los datos se han guardado correctamente',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000,
        timerProgressBar: true
      });

      onSuccess();
    } catch (error) {
      console.error('Error guardando pregunta:', error);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: error.response?.data?.error || 'No se pudo guardar la pregunta',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000
      });
    } finally {
      setGuardando(false);
    }
  };

  const requiereAlternativas = ['ALTERNATIVAS', 'VERDADERO_FALSO', 'ORDENAR', 'EMPAREJAR', 'ARRASTRAR_Y_SOLTAR'].includes(formPregunta.tipo);
  const requiereCompletar = formPregunta.tipo === 'COMPLETAR';

  return (
    <div className="modal-tema-overlay" onClick={onClose}>
      <div className="modal-tema-container" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" style={{ maxWidth: '90%', width: '1000px', maxHeight: '90vh', overflow: 'auto' }}>
        <div className="modal-tema-header" style={{ background: 'linear-gradient(135deg, #a78bfa 0%, #8b5cf6 100%)' }}>
          <h2>{pregunta ? '✏️ Editar Pregunta' : '📝 Registrar Pregunta'}</h2>
          <button className="modal-tema-close" onClick={onClose} aria-label="Cerrar">×</button>
        </div>

        <div className="modal-tema-body">
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="pregunta-tipo">
                <span style={{ marginRight: '0.5rem' }}>🎯</span>Tipo de Pregunta *
              </label>
              <select
                id="pregunta-tipo"
                className="form-input"
                value={formPregunta.tipo}
                onChange={(e) => {
                  setFormPregunta({ ...formPregunta, tipo: e.target.value });
                  // Resetear alternativas cuando cambia el tipo
                  if (e.target.value === 'VERDADERO_FALSO') {
                    setAlternativas([
                      { id: null, descripcion: 'Verdadero', correcta: 'NO', orden_posicion: null, par_id: null, zona_drop: null },
                      { id: null, descripcion: 'Falso', correcta: 'NO', orden_posicion: null, par_id: null, zona_drop: null }
                    ]);
                  } else if (e.target.value === 'RESPUESTA_CORTA' || e.target.value === 'COMPLETAR') {
                    setAlternativas([]);
                  } else if (e.target.value === 'ORDENAR') {
                    setAlternativas([]);
                  } else if (e.target.value === 'EMPAREJAR') {
                    setAlternativas([]);
                  } else if (e.target.value === 'ARRASTRAR_Y_SOLTAR') {
                    setAlternativas([]);
                  }
                }}
                  required
              >
                <option value="ALTERNATIVAS">📋 ALTERNATIVAS (Opción Múltiple)</option>
                <option value="COMPLETAR">✏️ COMPLETAR (Completar espacios)</option>
                <option value="VERDADERO_FALSO">✅ VERDADERO_FALSO</option>
                <option value="ORDENAR">🔢 ORDENAR (Ordenar elementos)</option>
                <option value="EMPAREJAR">🔗 EMPAREJAR (Emparejar elementos)</option>
                <option value="ARRASTRAR_Y_SOLTAR">🎯 ARRASTRAR_Y_SOLTAR (Drag & Drop)</option>
              </select>
            </div>

            <div className="form-group">
              <label>Descripción *</label>
              <div id="pregunta-descripcion-wrapper">
                <ReactQuill
                  ref={quillRefDescripcion}
                  theme="snow"
                  value={formPregunta.descripcion}
                  onChange={(value) => setFormPregunta({ ...formPregunta, descripcion: value })}
                placeholder="Escribe la pregunta aquí..."
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
              {requiereCompletar && (
                <small style={{ display: 'block', marginTop: '0.5rem', color: '#6b7280' }}>
                  Coloque los campos a completar de la forma: [[respuesta]]. Ej: La capital del Perú es [[Lima]]
                </small>
            )}
            </div>

            {examen.tipo_puntaje === 'INDIVIDUAL' && (
            <div className="form-group">
                <label>Puntos *</label>
              <input
                type="number"
                  className="form-input"
                  value={formPregunta.puntos}
                  onChange={(e) => setFormPregunta({ ...formPregunta, puntos: parseInt(e.target.value) || 0 })}
                min="0"
                  step="1"
                  required
              />
            </div>
            )}

            {/* Sección de Alternativas */}
            {requiereAlternativas && (
              <div className="form-group" style={{ marginTop: '2rem' }}>
                <div style={{ 
                  background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                  color: 'white', 
                  padding: '1rem 1.25rem', 
                  borderRadius: '12px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '1.5rem',
                  boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)'
                }}>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span>📝</span> Alternativas
                    {formPregunta.tipo === 'EMPAREJAR' && (
                      <span style={{ fontSize: '0.875rem', fontWeight: '400', marginLeft: '1rem', opacity: 0.9 }}>
                        (Crea pares: cada alternativa se empareja con otra)
                      </span>
                    )}
                    {formPregunta.tipo === 'ARRASTRAR_Y_SOLTAR' && (
                      <span style={{ fontSize: '0.875rem', fontWeight: '400', marginLeft: '1rem', opacity: 0.9 }}>
                        (Asigna zona de destino: varias alternativas pueden ir a la misma zona)
                      </span>
                    )}
                  </h3>
                  <button
                    type="button"
                    onClick={agregarAlternativa}
                    className="btn-nuevo-item"
                    style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '0.5rem',
                      fontSize: '0.875rem',
                      padding: '0.5rem 1rem'
                    }}
                  >
                    <span>➕</span> Agregar
                  </button>
                </div>

                {/* Vista de zonas para ARRASTRAR_Y_SOLTAR */}
                {formPregunta.tipo === 'ARRASTRAR_Y_SOLTAR' && alternativas.length > 0 && (
                  <div style={{ 
                    marginBottom: '1.5rem', 
                    padding: '1rem', 
                    background: '#fef3c7', 
                    borderRadius: '8px',
                    border: '1px solid #fbbf24'
                  }}>
                    <h4 style={{ margin: '0 0 1rem 0', fontSize: '0.9rem', fontWeight: '600', color: '#78350f' }}>
                      🎯 Zonas de Destino Creadas:
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      {(() => {
                        // Obtener zonas únicas
                        const zonasUnicas = [...new Set(alternativas
                          .map(alt => alt.zona_drop)
                          .filter(zona => zona && zona.trim() !== ''))];
                        
                        if (zonasUnicas.length === 0) {
                          return (
                            <div style={{ 
                              padding: '1rem', 
                              background: 'white', 
                              borderRadius: '6px',
                              border: '1px dashed #fbbf24'
                            }}>
                              <p style={{ margin: 0, color: '#78350f', fontSize: '0.875rem' }}>
                                <strong>📌 Instrucciones:</strong> Asigna una zona de destino a cada alternativa en la columna "ZONA DROP". 
                                Varias alternativas pueden tener la misma zona (ej: "Mamíferos", "Reptiles", etc.).
                              </p>
                            </div>
                          );
                        }
                        
                        return zonasUnicas.map((zona, idx) => {
                          const alternativasEnZona = alternativas.filter(alt => alt.zona_drop === zona);
                          const descripciones = alternativasEnZona.map(alt => {
                            const texto = alt.descripcion ? alt.descripcion.replace(/<[^>]*>/g, '').trim() : '';
                            return texto || 'Sin descripción';
                          });
                          
                          return (
                            <div key={idx} style={{ 
                              padding: '0.75rem', 
                              background: 'white', 
                              borderRadius: '6px',
                              border: '2px solid #fbbf24',
                              boxShadow: '0 2px 4px rgba(251, 191, 36, 0.1)'
                            }}>
                              <div style={{ fontWeight: '700', color: '#78350f', marginBottom: '0.5rem', fontSize: '0.95rem' }}>
                                🎯 Zona: <span style={{ color: '#92400e' }}>{zona}</span>
                              </div>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                {descripciones.map((desc, i) => (
                                  <span key={i} style={{
                                    padding: '0.375rem 0.75rem',
                                    background: '#fef3c7',
                                    borderRadius: '4px',
                                    fontSize: '0.875rem',
                                    color: '#78350f',
                                    fontWeight: '500'
                                  }}>
                                    {desc.length > 30 ? desc.substring(0, 30) + '...' : desc}
                                  </span>
                                ))}
                              </div>
                              <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#92400e' }}>
                                {alternativasEnZona.length} alternativa(s) en esta zona
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </div>
                )}

                {/* Vista de pares para EMPAREJAR */}
                {formPregunta.tipo === 'EMPAREJAR' && alternativas.length > 0 && (
                  <div style={{ 
                    marginBottom: '1.5rem', 
                    padding: '1rem', 
                    background: '#f3f4f6', 
                    borderRadius: '8px',
                    border: '1px solid #e5e7eb'
                  }}>
                    <h4 style={{ margin: '0 0 1rem 0', fontSize: '0.9rem', fontWeight: '600', color: '#374151' }}>
                      🔗 Pares Creados:
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {(() => {
                        // Mostrar solo una vez cada par (evitar duplicados)
                        const paresMostrados = new Set();
                        const pares = [];
                        
                        alternativas.forEach((alt, i) => {
                          const parIndex = typeof alt.par_id === 'number' && alt.par_id < alternativas.length ? alt.par_id : null;
                          if (parIndex !== null && !paresMostrados.has(`${Math.min(i, parIndex)}-${Math.max(i, parIndex)}`)) {
                            paresMostrados.add(`${Math.min(i, parIndex)}-${Math.max(i, parIndex)}`);
                            const parAlt = alternativas[parIndex];
                            const descripcionAlt = alt.descripcion ? alt.descripcion.replace(/<[^>]*>/g, '').trim() : '';
                            const descripcionPar = parAlt && parAlt.descripcion ? parAlt.descripcion.replace(/<[^>]*>/g, '').trim() : '';
                            
                            pares.push({
                              index1: i,
                              index2: parIndex,
                              desc1: descripcionAlt || `Alternativa ${i + 1}`,
                              desc2: descripcionPar || `Alternativa ${parIndex + 1}`
                            });
                          }
                        });
                        
                        if (pares.length === 0) {
                          return (
                            <div style={{ 
                              padding: '1rem', 
                              background: '#fef3c7', 
                              borderRadius: '6px',
                              border: '1px solid #fbbf24'
                            }}>
                              <p style={{ margin: 0, color: '#78350f', fontSize: '0.875rem' }}>
                                <strong>📌 Instrucciones:</strong> Agrega alternativas y luego selecciona un par para cada una en la columna "EMPAREJAR CON". 
                                Cada alternativa se empareja con otra alternativa de la lista.
                              </p>
                            </div>
                          );
                        }
                        
                        return pares.map((par, idx) => (
                          <div key={idx} style={{ 
                            padding: '0.75rem', 
                            background: 'white', 
                            borderRadius: '6px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '1rem',
                            border: '2px solid #10b981',
                            boxShadow: '0 2px 4px rgba(16, 185, 129, 0.1)'
                          }}>
                            <span style={{ fontWeight: '600', color: '#6366f1', flex: 1, textAlign: 'right' }}>
                              {par.desc1}
                            </span>
                            <span style={{ color: '#10b981', fontSize: '1.2rem' }}>↔️</span>
                            <span style={{ fontWeight: '600', color: '#6366f1', flex: 1, textAlign: 'left' }}>
                              {par.desc2}
                            </span>
                          </div>
                        ));
                      })()}
                    </div>
                  </div>
                )}

                {alternativas.length > 0 ? (
                  <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                    <table className="tabla-aula-virtual" style={{ margin: 0 }}>
                      <thead>
                        <tr>
                          <th style={{ width: formPregunta.tipo === 'EMPAREJAR' || formPregunta.tipo === 'ARRASTRAR_Y_SOLTAR' ? '50px' : 'auto' }}>DESCRIPCIÓN</th>
                          {formPregunta.tipo === 'ORDENAR' && (
                            <th style={{ textAlign: 'center', width: '120px' }}>🔢 POSICIÓN</th>
                          )}
                          {formPregunta.tipo === 'EMPAREJAR' && (
                            <th style={{ textAlign: 'center', width: '200px' }}>🔗 EMPAREJAR CON</th>
                          )}
                          {formPregunta.tipo === 'ARRASTRAR_Y_SOLTAR' && (
                            <th style={{ textAlign: 'center', width: '200px' }}>🎯 ZONA DROP</th>
                          )}
                          {(formPregunta.tipo === 'ALTERNATIVAS' || formPregunta.tipo === 'VERDADERO_FALSO') && (
                            <th style={{ textAlign: 'center', width: '120px' }}>✅ CORRECTA</th>
                          )}
                          <th style={{ textAlign: 'center', width: '80px' }}>🗑️</th>
                        </tr>
                      </thead>
                      <tbody>
                        {alternativas.map((alternativa, index) => (
                          <tr key={index}>
                            <td style={{ padding: '1rem' }}>
                              <div id={`alternativa-${index}-wrapper`} style={{ minHeight: '60px' }}>
                                <ReactQuill
                                  ref={(el) => {
                                    if (el) quillRefsAlternativas.current[index] = el;
                                  }}
                                  theme="snow"
                                  value={alternativa.descripcion || ''}
                                  onChange={(value) => actualizarAlternativa(index, 'descripcion', value)}
                                  placeholder="Escribe la alternativa..."
                                  modules={{
                                    toolbar: [
                                      [{ 'header': [1, 2, 3, false] }],
                                      ['bold', 'italic', 'underline'],
                                      [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                                      ['link', 'image'],
                                      ['clean']
                                    ]
                                  }}
                                  formats={[
                                    'header', 'bold', 'italic', 'underline',
                                    'list', 'bullet', 'link', 'image'
                                  ]}
                                />
                  </div>
                            </td>
                            {formPregunta.tipo === 'ORDENAR' && (
                              <td style={{ padding: '1rem', textAlign: 'center' }}>
                        <input
                                  type="number"
                                  className="form-input"
                                  value={alternativa.orden_posicion || index + 1}
                                  onChange={(e) => actualizarAlternativa(index, 'orden_posicion', parseInt(e.target.value) || index + 1)}
                                  min="1"
                                  style={{ width: '100px', textAlign: 'center', fontWeight: '600', color: '#6366f1' }}
                                />
                              </td>
                            )}
                            {formPregunta.tipo === 'EMPAREJAR' && (
                              <td style={{ padding: '1rem', textAlign: 'center' }}>
                                <select
                                  className="form-input"
                                  value={
                                    alternativa.par_id !== null && alternativa.par_id !== undefined
                                      ? (() => {
                                          // Si par_id es un índice (número menor que el número de alternativas), usarlo directamente
                                          if (typeof alternativa.par_id === 'number' && alternativa.par_id < alternativas.length) {
                                            return alternativa.par_id;
                                          }
                                          // Si es un ID real, buscar el índice de la alternativa con ese ID
                                          if (typeof alternativa.par_id === 'number') {
                                            const indicePar = alternativas.findIndex(alt => alt.id === alternativa.par_id);
                                            return indicePar !== -1 ? indicePar : '';
                                          }
                                          return '';
                                        })()
                                      : ''
                                  }
                          onChange={(e) => {
                                    const valorSeleccionado = e.target.value;
                                    if (valorSeleccionado === '') {
                                      actualizarAlternativa(index, 'par_id', null);
                                    } else {
                                      const indicePar = parseInt(valorSeleccionado);
                                      
                                      // Verificar que no se empareje consigo mismo
                                      if (indicePar === index) {
                                        Swal.fire({
                                          icon: 'warning',
                                          title: 'Error',
                                          text: 'No puedes emparejar una alternativa consigo misma',
                                          toast: true,
                                          position: 'top-end',
                                          showConfirmButton: false,
                                          timer: 2000
                                        });
                                        return;
                                      }
                                      
                                      // Verificar si la alternativa destino ya está emparejada con otra
                                      const destinoYaEmparejada = alternativas[indicePar] && 
                                        alternativas[indicePar].par_id !== null && 
                                        alternativas[indicePar].par_id !== undefined &&
                                        alternativas[indicePar].par_id !== index;
                                      
                                      if (destinoYaEmparejada) {
                                        Swal.fire({
                                          icon: 'warning',
                                          title: 'Ya está emparejada',
                                          text: 'Esta alternativa ya está emparejada con otra. Desempareja primero la otra alternativa.',
                                          toast: true,
                                          position: 'top-end',
                                          showConfirmButton: false,
                                          timer: 3000
                                        });
                                        return;
                                      }
                                      
                                      actualizarAlternativa(index, 'par_id', indicePar);
                                    }
                                  }}
                                  style={{ width: '100%', minWidth: '200px' }}
                                >
                                  <option value="">🔗 Seleccionar par...</option>
                                  {alternativas.map((alt, i) => {
                                    // No mostrar la misma alternativa en el select
                                    if (i === index) return null;
                                    
                                    // Verificar si ya está emparejada con otra alternativa (excepto la actual)
                                    const yaEmparejada = typeof alt.par_id === 'number' && 
                                      alt.par_id < alternativas.length && 
                                      alt.par_id !== index;
                                    
                                    // Obtener una descripción corta de la alternativa para mostrar
                                    let descripcionCorta = `Alternativa ${i + 1}`;
                                    if (alt.descripcion) {
                                      // Remover HTML tags y obtener texto plano
                                      const textoPlano = alt.descripcion.replace(/<[^>]*>/g, '').trim();
                                      if (textoPlano) {
                                        descripcionCorta = textoPlano.length > 35 
                                          ? textoPlano.substring(0, 35) + '...' 
                                          : textoPlano;
                                      }
                                    }
                                    
                                    return (
                                      <option 
                                        key={i} 
                                        value={i}
                                        disabled={yaEmparejada}
                                        style={{ 
                                          color: yaEmparejada ? '#9ca3af' : '#1f2937',
                                          fontStyle: yaEmparejada ? 'italic' : 'normal'
                                        }}
                                      >
                                        {yaEmparejada ? `🔒 ${descripcionCorta} (ya emparejada)` : `✓ ${descripcionCorta}`}
                                      </option>
                                    );
                                  })}
                                </select>
                              </td>
                            )}
                            {formPregunta.tipo === 'ARRASTRAR_Y_SOLTAR' && (
                              <td style={{ padding: '1rem', textAlign: 'center' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                  <input
                                    type="text"
                                    className="form-input"
                                    value={alternativa.zona_drop || ''}
                                    onChange={(e) => actualizarAlternativa(index, 'zona_drop', e.target.value)}
                                    placeholder="Ej: Mamíferos, Reptiles..."
                                    style={{ width: '100%', textAlign: 'center' }}
                                    list={`zonas-sugeridas-${index}`}
                                  />
                                  <datalist id={`zonas-sugeridas-${index}`}>
                                    {(() => {
                                      // Obtener zonas únicas de otras alternativas como sugerencias
                                      const zonasExistentes = [...new Set(alternativas
                                        .map((alt, i) => i !== index ? alt.zona_drop : null)
                                        .filter(zona => zona && zona.trim() !== ''))];
                                      return zonasExistentes.map((zona, i) => (
                                        <option key={i} value={zona} />
                                      ));
                                    })()}
                                  </datalist>
                                  <small style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                                    Puede repetirse (ej: varias alternativas a "Mamíferos")
                                  </small>
                                </div>
                              </td>
                            )}
                            {(formPregunta.tipo === 'ALTERNATIVAS' || formPregunta.tipo === 'VERDADERO_FALSO') && (
                              <td style={{ padding: '1rem', textAlign: 'center' }}>
                                <label className="checkbox-label" style={{ justifyContent: 'center', cursor: 'pointer' }}>
                          <input
                                    type="checkbox"
                                    checked={alternativa.correcta === 'SI' || alternativa.correcta === true}
                  onChange={(e) => {
                                      // Para VERDADERO_FALSO, solo una puede ser correcta
                                      if (formPregunta.tipo === 'VERDADERO_FALSO' && e.target.checked) {
                                        const nuevasAlternativas = alternativas.map((alt, i) => ({
                                          ...alt,
                                          correcta: i === index ? 'SI' : 'NO'
                                        }));
                                        setAlternativas(nuevasAlternativas);
                                      } else {
                                        actualizarAlternativa(index, 'correcta', e.target.checked ? 'SI' : 'NO');
                                      }
                                    }}
                                    style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                                  />
                                  <span style={{ marginLeft: '0.5rem', fontWeight: '600', color: alternativa.correcta === 'SI' ? '#10b981' : '#6b7280' }}>
                                    {alternativa.correcta === 'SI' ? '✓ Correcta' : 'Marcar'}
                                  </span>
                        </label>
                              </td>
                            )}
                            <td style={{ padding: '1rem', textAlign: 'center' }}>
                        <button
                          type="button"
                                onClick={() => eliminarAlternativa(index)}
                                className="btn-opciones"
                                style={{
                                  background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '8px',
                                  padding: '0.5rem 0.75rem',
                                  cursor: 'pointer',
                                  fontSize: '0.875rem',
                                  fontWeight: '600'
                                }}
                                title="Eliminar alternativa"
                              >
                                🗑️
                        </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div style={{ 
                    textAlign: 'center', 
                    padding: '3rem 2rem', 
                    color: '#6b7280',
                    background: '#f9fafb',
                    borderRadius: '12px',
                    border: '2px dashed #e5e7eb'
                  }}>
                    <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📋</div>
                    <p style={{ margin: 0, fontSize: '1rem', fontWeight: '600', marginBottom: '0.5rem' }}>
                      No hay alternativas registradas
                    </p>
                    <p style={{ margin: 0, fontSize: '0.875rem', color: '#9ca3af' }}>
                      Haz clic en "➕ Agregar" para crear la primera alternativa
                    </p>
            </div>
                )}
              </div>
            )}

            <div className="modal-tema-footer" style={{ padding: '1.5rem', borderTop: '1px solid #e5e7eb', display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '2rem' }}>
              <button type="button" className="btn-cancelar-tema" onClick={onClose} disabled={guardando}>
                ✖️ Cancelar
          </button>
              <button type="submit" className="btn-guardar-tema" disabled={guardando}>
                {guardando ? '⏳ Guardando...' : '💾 Guardar Datos'}
          </button>
              </div>
      </form>
        </div>
      </div>
    </div>
  );
}

// Componente Modal de Resultados de Examen
function ResultadosExamenModal({ examen, resultados, cargandoResultados, onClose, onVerDetalles, onBorrarResultado, onDescargarPDF, onVolverCalificar, onBorrarTodosResultados }) {
  const [openDropdown, setOpenDropdown] = useState(null);
  const [dropdownPosition, setDropdownPosition] = useState(null);
  const buttonRef = useRef({});

  const toggleDropdown = (uniqueKey, e, tipo) => {
    e.stopPropagation();
    e.preventDefault();
    
    if (openDropdown === `resultado-${uniqueKey}`) {
      setOpenDropdown(null);
      setDropdownPosition(null);
    } else {
      const button = e.currentTarget;
      const rect = button.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right,
        width: rect.width > 200 ? rect.width : 200
      });
      setOpenDropdown(`resultado-${uniqueKey}`);
    }
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      // Solo cerrar si es click del botón izquierdo (button === 0)
      if (event.button !== 0) return;
      
      if (openDropdown !== null) {
        const dropdownElement = document.querySelector('.dropdown-menu-portal-aula');
        const buttonKey = openDropdown.replace('resultado-', '');
        const buttonElement = buttonRef.current[`resultado-${buttonKey}`];
        
        // Verificar si el click fue fuera del dropdown y del botón
        if (
          dropdownElement && 
          !dropdownElement.contains(event.target) &&
          buttonElement &&
          !buttonElement.contains(event.target)
        ) {
          setOpenDropdown(null);
          setDropdownPosition(null);
        }
      }
    };

    if (openDropdown !== null) {
      // Usar mousedown en lugar de click para mejor control
      setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside);
      }, 0);
      
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [openDropdown]);

  // Calcular puntos por respuesta correcta
  const puntosPorRespuesta = examen.tipo_puntaje === 'GENERAL' ? (examen.puntos_correcta || 0) : 0;

  return createPortal(
    <div className="modal-tema-overlay" onClick={onClose}>
      <div className="modal-tema-container" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '1200px', width: '95%' }}>
        <div className="modal-tema-header" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white' }}>
          <h2>📊 RESULTADOS - {examen.titulo}</h2>
          <button className="modal-tema-close" onClick={onClose} aria-label="Cerrar" style={{ color: 'white' }}>×</button>
              </div>
        
        <div className="modal-tema-body" style={{ padding: '1.5rem' }}>
          {/* Botones de acción */}
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <button 
              className="btn-guardar" 
              onClick={onDescargarPDF}
            >
              📥 Descargar
            </button>
            <button 
              className="btn-cancelar" 
              onClick={onVolverCalificar}
            >
              ✏️ Volver a Calificar
            </button>
            <button 
              className="btn-cancelar" 
              onClick={onBorrarTodosResultados}
              style={{ backgroundColor: '#ef4444', color: 'white', borderColor: '#ef4444' }}
            >
              🗑️ Eliminar Resultados
            </button>
          </div>

          {/* Información del examen */}
          <div style={{ marginBottom: '1.5rem', padding: '1rem', background: '#f3f4f6', borderRadius: '8px' }}>
            <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
              <div>
                <strong>EXAMEN:</strong> {examen.titulo}
              </div>
              {examen.tipo_puntaje === 'GENERAL' && (
                <div>
                  <strong>PUNTAJE POR RESPUESTA CORRECTA:</strong> {puntosPorRespuesta} Punto(s)
              </div>
            )}
            </div>
          </div>

          {/* Tabla de resultados */}
          {cargandoResultados ? (
            <div className="loading-spinner" style={{ textAlign: 'center', padding: '2rem' }}>
              Cargando resultados...
          </div>
          ) : resultados.length > 0 ? (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white' }}>
                    <th style={{ padding: '0.75rem', textAlign: 'left', border: '1px solid rgba(255,255,255,0.3)' }}>N°</th>
                    <th style={{ padding: '0.75rem', textAlign: 'left', border: '1px solid rgba(255,255,255,0.3)' }}>APELLIDOS Y NOMBRES</th>
                    <th style={{ padding: '0.75rem', textAlign: 'center', border: '1px solid rgba(255,255,255,0.3)' }}>PUNTAJE</th>
                    <th style={{ padding: '0.75rem', textAlign: 'center', border: '1px solid rgba(255,255,255,0.3)' }}>CORRECTAS</th>
                    <th style={{ padding: '0.75rem', textAlign: 'center', border: '1px solid rgba(255,255,255,0.3)' }}>INCORRECTAS</th>
                    <th style={{ padding: '0.75rem', textAlign: 'center', border: '1px solid rgba(255,255,255,0.3)' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {resultados.map((resultado, index) => {
                    // Usar matricula_id como key para que todos tengan dropdown, incluso sin resultado
                    const uniqueKey = resultado.matricula_id || `alumno-${index}`;
                    const tieneResultado = resultado.resultado_id !== null && resultado.resultado_id !== undefined;
                    
                    return (
                      <tr key={uniqueKey} style={{ borderBottom: '1px solid #e5e7eb' }}>
                        <td style={{ padding: '0.75rem', textAlign: 'center' }}>{index + 1}</td>
                        <td style={{ padding: '0.75rem' }}>{resultado.nombre_completo}</td>
                        <td style={{ padding: '0.75rem', textAlign: 'center', fontWeight: '600' }}>{tieneResultado ? Math.round(resultado.puntaje || 0) : '-'}</td>
                        <td style={{ padding: '0.75rem', textAlign: 'center', color: tieneResultado ? '#10b981' : '#6b7280', fontWeight: '600' }}>{tieneResultado ? resultado.correctas : '-'}</td>
                        <td style={{ padding: '0.75rem', textAlign: 'center', color: tieneResultado ? '#ef4444' : '#6b7280', fontWeight: '600' }}>{tieneResultado ? resultado.incorrectas : '-'}</td>
                        <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                          <div className="btn-group-opciones" style={{ position: 'relative' }}>
                    <button
                              className="btn-opciones"
                              ref={(el) => {
                                if (el) {
                                  buttonRef.current[`resultado-${uniqueKey}`] = el;
                                }
                              }}
                              onClick={(e) => toggleDropdown(uniqueKey, e, 'resultado')}
                            >
                              Opciones {openDropdown === `resultado-${uniqueKey}` ? '▲' : '▼'}
                    </button>
                            {openDropdown === `resultado-${uniqueKey}` && dropdownPosition && createPortal(
                              <div 
                                className="dropdown-menu-portal-aula"
                                style={{
                                  position: 'fixed',
                                  top: `${dropdownPosition.top}px`,
                                  right: `${dropdownPosition.right}px`,
                                  width: `${dropdownPosition.width}px`,
                                  zIndex: 10000,
                                  backgroundColor: 'white',
                                  boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                                  borderRadius: '8px',
                                  border: '1px solid #e5e7eb'
                                }}
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <div className="dropdown-menu-opciones">
                                  <a href="#" onClick={(e) => { 
                                    e.preventDefault(); 
                                    e.stopPropagation();
                                    onVerDetalles(resultado); 
                                    setOpenDropdown(null); 
                                  }}>
                                    📄 Ver Detalles
                                  </a>
                                  {tieneResultado && (
                                    <a href="#" onClick={(e) => { 
                                      e.preventDefault(); 
                                      e.stopPropagation();
                                      onBorrarResultado(resultado); 
                                      setOpenDropdown(null); 
                                    }}>
                                      🗑️ Borrar Resultados
                                    </a>
                                  )}
            </div>
                              </div>,
                              document.body
          )}
        </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
        </div>
          ) : (
            <div className="empty-state" style={{ textAlign: 'center', padding: '3rem' }}>
              <p>No hay resultados registrados para este examen</p>
    </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

// Componente Modal de Detalles del Resultado
function DetallesResultadoModal({ resultado, detalles, cargando, onClose }) {
  if (!detalles || !detalles.resultado || !detalles.preguntas) {
    return null;
  }

  const { resultado: resultadoInfo, preguntas, respuestas } = detalles;
  const puntosPorRespuesta = resultadoInfo.tipo_puntaje === 'GENERAL' ? (resultadoInfo.puntos_correcta || 0) : 0;

  // Función para determinar el estado de una alternativa
  const getEstadoAlternativa = (preguntaId, alternativaId, esCorrecta) => {
    // Obtener la respuesta del alumno para esta pregunta
    // Las respuestas vienen como: { pregunta_id: alternativa_id }
    const respuestaAlumno = respuestas[preguntaId] || respuestas[preguntaId.toString()];
    
    // Normalizar IDs para comparación (pueden venir como número o string)
    const alternativaIdNum = typeof alternativaId === 'number' ? alternativaId : parseInt(alternativaId);
    const respuestaAlumnoNum = typeof respuestaAlumno === 'number' ? respuestaAlumno : parseInt(respuestaAlumno);
    
    // Verificar si el alumno marcó esta alternativa
    const alumnoMarcó = respuestaAlumnoNum === alternativaIdNum;
    
    if (esCorrecta === 'SI') {
      if (alumnoMarcó) {
        return 'correcta_marcada'; // Verde: marcó correctamente
      } else {
        return 'correcta_no_marcada'; // Azul: es la correcta pero no la marcó
      }
    } else {
      if (alumnoMarcó) {
        return 'incorrecta_marcada'; // Rojo: marcó incorrectamente
      } else {
        return 'sin_marcar'; // Sin color: no la marcó y no es correcta
      }
    }
  };

  return createPortal(
    <div className="modal-tema-overlay" onClick={onClose}>
      <div className="modal-tema-container" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '900px', width: '95%', maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="modal-tema-header" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white' }}>
          <h2>📄 Detalles del Resultado</h2>
          <button className="modal-tema-close" onClick={onClose} aria-label="Cerrar" style={{ color: 'white' }}>×</button>
        </div>
        
        <div className="modal-tema-body" style={{ padding: '1.5rem' }}>
          {cargando ? (
            <div className="loading-spinner" style={{ textAlign: 'center', padding: '2rem' }}>
              Cargando detalles...
            </div>
          ) : (
            <>
              {/* Resumen del Resultado */}
              <div style={{ 
                marginBottom: '1.5rem', 
                padding: '0.75rem 1rem', 
                background: 'linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%)', 
                borderRadius: '8px',
                border: '2px solid #4caf50'
              }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <tbody>
                    <tr>
                      <td style={{ padding: '0.4rem 0.5rem', fontWeight: '600', color: '#2e7d32', width: '40%', fontSize: '0.9rem' }}>ALUMNO:</td>
                      <td style={{ padding: '0.4rem 0.5rem', color: '#1f2937', fontSize: '0.9rem' }}>{resultadoInfo.nombre_completo}</td>
                    </tr>
                    <tr>
                      <td style={{ padding: '0.4rem 0.5rem', fontWeight: '600', color: '#2e7d32', fontSize: '0.9rem' }}>PUNTAJE POR RESPUESTA CORRECTA:</td>
                      <td style={{ padding: '0.4rem 0.5rem', color: '#1f2937', fontSize: '0.9rem' }}>{puntosPorRespuesta} Punto(s)</td>
                    </tr>
                    <tr>
                      <td style={{ padding: '0.4rem 0.5rem', fontWeight: '600', color: '#2e7d32', fontSize: '0.9rem' }}>PUNTAJE:</td>
                      <td style={{ padding: '0.4rem 0.5rem', color: '#1f2937', fontWeight: '700', fontSize: '1rem' }}>{Math.round(resultadoInfo.puntaje || 0)}</td>
                    </tr>
                    <tr>
                      <td style={{ padding: '0.4rem 0.5rem', fontWeight: '600', color: '#2e7d32', fontSize: '0.9rem' }}>CORRECTAS:</td>
                      <td style={{ padding: '0.4rem 0.5rem', color: '#10b981', fontWeight: '700', fontSize: '1rem' }}>{resultadoInfo.correctas}</td>
                    </tr>
                    <tr>
                      <td style={{ padding: '0.4rem 0.5rem', fontWeight: '600', color: '#2e7d32', fontSize: '0.9rem' }}>INCORRECTAS:</td>
                      <td style={{ padding: '0.4rem 0.5rem', color: '#ef4444', fontWeight: '700', fontSize: '1rem' }}>{resultadoInfo.incorrectas}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Leyenda */}
              <div style={{ 
                marginBottom: '2rem', 
                padding: '1rem', 
                background: '#f9fafb', 
                borderRadius: '8px',
                border: '1px solid #e5e7eb'
              }}>
                <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: '#10b981', border: '2px solid #059669' }}></div>
                    <span style={{ fontSize: '0.9rem', fontWeight: '500' }}>Marcada correctamente</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: '#ef4444', border: '2px solid #dc2626' }}></div>
                    <span style={{ fontSize: '0.9rem', fontWeight: '500' }}>Marcada incorrectamente</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: '#3b82f6', border: '2px solid #2563eb' }}></div>
                    <span style={{ fontSize: '0.9rem', fontWeight: '500' }}>Respuesta correcta</span>
                  </div>
                </div>
              </div>

              {/* Preguntas */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                {preguntas.map((pregunta, index) => {
                  // Obtener la respuesta del alumno para esta pregunta
                  const respuestaAlumno = respuestas[pregunta.id] || respuestas[pregunta.id.toString()];
                  const respuestaAlumnoNum = respuestaAlumno ? (typeof respuestaAlumno === 'number' ? respuestaAlumno : parseInt(respuestaAlumno)) : null;
                  
                  // Función para renderizar según el tipo de pregunta
                  const renderizarPregunta = () => {
                    switch (pregunta.tipo) {
                      case 'ALTERNATIVAS':
                        return (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            {pregunta.alternativas && pregunta.alternativas.map((alternativa) => {
                              const estado = getEstadoAlternativa(pregunta.id, alternativa.id, alternativa.correcta);
                              const alternativaIdNum = typeof alternativa.id === 'number' ? alternativa.id : parseInt(alternativa.id);
                              const alumnoMarcó = respuestaAlumnoNum === alternativaIdNum;
                              
                              let estiloCirculo = {
                                width: '24px',
                                height: '24px',
                                borderRadius: '50%',
                                border: '2px solid',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                                marginRight: '0.75rem',
                                fontWeight: 'bold',
                                fontSize: '14px'
                              };

                              if (estado === 'correcta_marcada') {
                                estiloCirculo.background = '#10b981';
                                estiloCirculo.borderColor = '#059669';
                                estiloCirculo.color = 'white';
                              } else if (estado === 'incorrecta_marcada') {
                                estiloCirculo.background = '#ef4444';
                                estiloCirculo.borderColor = '#dc2626';
                                estiloCirculo.color = 'white';
                              } else if (estado === 'correcta_no_marcada') {
                                estiloCirculo.background = '#3b82f6';
                                estiloCirculo.borderColor = '#2563eb';
                                estiloCirculo.color = 'white';
                              } else {
                                estiloCirculo.background = 'white';
                                estiloCirculo.borderColor = '#d1d5db';
                                estiloCirculo.color = '#9ca3af';
                              }

                              return (
                                <div 
                                  key={alternativa.id}
                                  style={{ 
                                    display: 'flex', 
                                    alignItems: 'flex-start',
                                    padding: '0.75rem',
                                    borderRadius: '8px',
                                    background: estado !== 'sin_marcar' ? '#f9fafb' : 'white',
                                    border: alumnoMarcó ? '2px solid' : '1px solid #e5e7eb',
                                    borderColor: estado === 'correcta_marcada' ? '#10b981' : 
                                               estado === 'incorrecta_marcada' ? '#ef4444' : '#e5e7eb'
                                  }}
                                >
                                  <div style={estiloCirculo}>
                                    {alumnoMarcó && '✓'}
                                  </div>
                                  <div 
                                    style={{ 
                                      flex: 1,
                                      fontSize: '0.95rem',
                                      color: '#1f2937',
                                      lineHeight: '1.5'
                                    }}
                                    dangerouslySetInnerHTML={{ __html: alternativa.descripcion }}
                                  />
                                </div>
                              );
                            })}
                          </div>
                        );

                      case 'COMPLETAR':
                        // Para COMPLETAR, la respuesta es un objeto con índices: {0: "lima", 1: "otro"}
                        let respuestasCompletarAlumno = [];
                        if (respuestaAlumno && typeof respuestaAlumno === 'object') {
                          respuestasCompletarAlumno = Object.entries(respuestaAlumno)
                            .map(([index, valor]) => ({
                              num: parseInt(index) + 1,
                              valor: String(valor || '___').trim()
                            }));
                        }
                        
                        // Obtener respuestas correctas para COMPLETAR
                        // Para COMPLETAR, las respuestas correctas están en la descripción de la pregunta con formato [[respuesta]]
                        // Extraer todas las respuestas de los placeholders [[...]]
                        const descripcionLimpia = pregunta.descripcion ? pregunta.descripcion.replace(/<[^>]*>/g, '') : '';
                        const respuestasCorrectasCompletar = [];
                        const regex = /\[\[([^\]]+)\]\]/g;
                        let match;
                        while ((match = regex.exec(descripcionLimpia)) !== null) {
                          const respuesta = match[1].trim();
                          if (respuesta) {
                            respuestasCorrectasCompletar.push(respuesta);
                          }
                        }
                        
                        // Verificar si es correcta (comparar cada respuesta - case insensitive)
                        let esCorrectaCompletar = false;
                        if (respuestasCompletarAlumno.length > 0) {
                          const respuestasAlumnoArray = respuestasCompletarAlumno.map(r => r.valor.toLowerCase().trim());
                          const respuestasCorrectasArray = respuestasCorrectasCompletar.map(r => r.toLowerCase().trim());
                          if (respuestasAlumnoArray.length === respuestasCorrectasArray.length) {
                            esCorrectaCompletar = respuestasAlumnoArray.every((resp) => 
                              respuestasCorrectasArray.includes(resp)
                            );
                          }
                        }
                        
                        return (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div style={{ 
                              padding: '0.75rem', 
                              borderRadius: '8px',
                              background: esCorrectaCompletar ? '#d1fae5' : '#fee2e2',
                              border: `2px solid ${esCorrectaCompletar ? '#10b981' : '#ef4444'}`
                            }}>
                              <div style={{ marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: '600', color: '#6b7280' }}>
                                Respuesta del alumno:
                              </div>
                              <div style={{ fontSize: '0.95rem', color: '#1f2937' }}>
                                {respuestasCompletarAlumno.length > 0 ? (
                                  respuestasCompletarAlumno.map((r, idx) => (
                                    <span key={idx} style={{ background: '#e0f2fe', padding: '0.25rem 0.5rem', borderRadius: '4px', margin: '0.25rem', display: 'inline-block', border: '1px solid #0ea5e9' }}>
                                      {r.num}. {r.valor}
                                    </span>
                                  ))
                                ) : (
                                  <span style={{ color: '#6b7280', fontStyle: 'italic' }}>(sin respuesta)</span>
                                )}
                              </div>
                            </div>
                            <div style={{ 
                              padding: '0.75rem', 
                              borderRadius: '8px',
                              background: '#dbeafe',
                              border: '2px solid #3b82f6'
                            }}>
                              <div style={{ marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: '600', color: '#6b7280' }}>
                                Respuesta correcta:
                              </div>
                              <div style={{ fontSize: '0.95rem', color: '#1f2937' }}>
                                {respuestasCorrectasCompletar.length > 0 ? (
                                  respuestasCorrectasCompletar.map((resp, idx) => (
                                    <span key={idx} style={{ background: '#dbeafe', padding: '0.25rem 0.5rem', borderRadius: '4px', margin: '0.25rem', display: 'inline-block', border: '1px solid #3b82f6' }}>
                                      {idx + 1}. {resp}
                                    </span>
                                  ))
                                ) : (
                                  <span style={{ color: '#6b7280' }}>No definida</span>
                                )}
                              </div>
                            </div>
                          </div>
                        );

                      case 'VERDADERO_FALSO':
                        // Para VERDADERO_FALSO, la respuesta es un ID de alternativa o string 'VERDADERO'/'FALSO'
                        const respuestaVFAlumno = respuestaAlumnoNum || respuestaAlumno;
                        const alternativaVFMarcada = pregunta.alternativas?.find(alt => {
                          const altId = typeof alt.id === 'number' ? alt.id : parseInt(alt.id);
                          return altId === respuestaVFAlumno || altId === respuestaAlumnoNum;
                        });
                        
                        // Buscar la alternativa correcta
                        const alternativaVFCorrecta = pregunta.alternativas?.find(alt => alt.correcta === 'SI');
                        
                        // Determinar si es correcta
                        const esCorrectaVF = alternativaVFMarcada && alternativaVFCorrecta && 
                                           alternativaVFMarcada.id === alternativaVFCorrecta.id;
                        
                        // Obtener texto de la respuesta del alumno
                        let respuestaVFTexto = '(sin respuesta)';
                        if (alternativaVFMarcada) {
                          const desc = alternativaVFMarcada.descripcion ? alternativaVFMarcada.descripcion.replace(/<[^>]*>/g, '').trim() : '';
                          respuestaVFTexto = desc || 'Sin descripción';
                        } else if (respuestaAlumno === 'VERDADERO' || respuestaAlumno === 'verdadero') {
                          respuestaVFTexto = 'Verdadero';
                        } else if (respuestaAlumno === 'FALSO' || respuestaAlumno === 'falso') {
                          respuestaVFTexto = 'Falso';
                        }
                        
                        // Obtener texto de la respuesta correcta
                        const respuestaVFCorrectaTexto = alternativaVFCorrecta 
                          ? (alternativaVFCorrecta.descripcion ? alternativaVFCorrecta.descripcion.replace(/<[^>]*>/g, '').trim() : 'Sin descripción')
                          : 'No definida';
                        
                        return (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div style={{ 
                              padding: '0.75rem', 
                              borderRadius: '8px',
                              background: esCorrectaVF ? '#d1fae5' : '#fee2e2',
                              border: `2px solid ${esCorrectaVF ? '#10b981' : '#ef4444'}`
                            }}>
                              <div style={{ marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: '600', color: '#6b7280' }}>
                                Respuesta del alumno:
                              </div>
                              <div style={{ fontSize: '0.95rem', color: '#1f2937', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                {esCorrectaVF ? (
                                  <span style={{ color: '#10b981', fontSize: '1.2rem' }}>✓</span>
                                ) : (
                                  <span style={{ color: '#ef4444', fontSize: '1.2rem' }}>✗</span>
                                )}
                                <span style={{ fontWeight: esCorrectaVF ? '600' : '400', color: esCorrectaVF ? '#065f46' : '#991b1b' }}>
                                  {respuestaVFTexto}
                                </span>
                              </div>
                            </div>
                            <div style={{ 
                              padding: '0.75rem', 
                              borderRadius: '8px',
                              background: '#dbeafe',
                              border: '2px solid #3b82f6'
                            }}>
                              <div style={{ marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: '600', color: '#6b7280' }}>
                                Respuesta correcta:
                              </div>
                              <div style={{ fontSize: '0.95rem', color: '#1f2937', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span style={{ color: '#3b82f6', fontSize: '1.2rem' }}>✓</span>
                                <span style={{ fontWeight: '600', color: '#1e40af' }}>
                                  {respuestaVFCorrectaTexto}
                                </span>
                              </div>
                            </div>
                          </div>
                        );

                      case 'RESPUESTA_CORTA':
                        // Para RESPUESTA_CORTA, la respuesta es un string
                        const respuestaCortaAlumno = typeof respuestaAlumno === 'string' ? respuestaAlumno : String(respuestaAlumno || '');
                        const alternativaCorrecta = pregunta.alternativas && pregunta.alternativas.find(alt => alt.correcta === 'SI');
                        const respuestaCorrecta = alternativaCorrecta ? alternativaCorrecta.descripcion.replace(/<[^>]*>/g, '').trim() : '';
                        const esCorrecta = respuestaCortaAlumno.toLowerCase().trim() === respuestaCorrecta.toLowerCase().trim();
                        
                        return (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div style={{ 
                              padding: '0.75rem', 
                              borderRadius: '8px',
                              background: esCorrecta ? '#d1fae5' : '#fee2e2',
                              border: `2px solid ${esCorrecta ? '#10b981' : '#ef4444'}`
                            }}>
                              <div style={{ marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: '600', color: '#6b7280' }}>
                                Respuesta del alumno:
                              </div>
                              <div style={{ fontSize: '0.95rem', color: '#1f2937' }}>
                                {respuestaCortaAlumno || '(sin respuesta)'}
                              </div>
                            </div>
                            <div style={{ 
                              padding: '0.75rem', 
                              borderRadius: '8px',
                              background: '#dbeafe',
                              border: '2px solid #3b82f6'
                            }}>
                              <div style={{ marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: '600', color: '#6b7280' }}>
                                Respuesta correcta:
                              </div>
                              <div 
                                style={{ 
                                  fontSize: '0.95rem',
                                  color: '#1f2937'
                                }}
                                dangerouslySetInnerHTML={{ __html: alternativaCorrecta ? alternativaCorrecta.descripcion : 'No definida' }}
                              />
                            </div>
                          </div>
                        );

                      case 'ORDENAR':
                        // Para ORDENAR, la respuesta es un array de IDs: [id1, id2, id3, ...]
                        let ordenAlumnoArray = [];
                        let ordenAlumnoTexto = '';
                        if (respuestaAlumno && Array.isArray(respuestaAlumno)) {
                          ordenAlumnoArray = respuestaAlumno.map(id => parseInt(id));
                          // Obtener las alternativas en el orden del alumno
                          const alternativasOrdenadas = ordenAlumnoArray
                            .map(id => pregunta.alternativas?.find(alt => alt.id === id))
                            .filter(Boolean);
                          ordenAlumnoTexto = alternativasOrdenadas
                            .map((alt, idx) => `${idx + 1}. ${alt.descripcion}`)
                            .join('\n');
                        } else {
                          ordenAlumnoTexto = '(sin respuesta)';
                        }
                        
                        // Obtener orden correcto (ordenar por orden_posicion)
                        const alternativasCorrectas = pregunta.alternativas
                          ?.filter(alt => alt.orden_posicion !== null && alt.orden_posicion !== undefined)
                          .sort((a, b) => (a.orden_posicion || 0) - (b.orden_posicion || 0)) || [];
                        const ordenCorrectoTexto = alternativasCorrectas
                          .map((alt, idx) => `${idx + 1}. ${alt.descripcion}`)
                          .join('\n');
                        
                        // Verificar si el orden es correcto
                        let ordenEsCorrecto = false;
                        if (ordenAlumnoArray.length === alternativasCorrectas.length) {
                          ordenEsCorrecto = ordenAlumnoArray.every((altId, idx) => {
                            const alt = alternativasCorrectas[idx];
                            return alt && alt.id === altId;
                          });
                        }
                        
                        return (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div style={{ 
                              padding: '0.75rem', 
                              borderRadius: '8px',
                              background: ordenEsCorrecto ? '#d1fae5' : '#fee2e2',
                              border: `2px solid ${ordenEsCorrecto ? '#10b981' : '#ef4444'}`
                            }}>
                              <div style={{ marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: '600', color: '#6b7280' }}>
                                Orden seleccionado por el alumno:
                              </div>
                              <div 
                                style={{ 
                                  fontSize: '0.95rem', 
                                  color: '#1f2937',
                                  whiteSpace: 'pre-line'
                                }}
                                dangerouslySetInnerHTML={{ __html: ordenAlumnoTexto.replace(/\n/g, '<br>') }}
                              />
                            </div>
                            <div style={{ 
                              padding: '0.75rem', 
                              borderRadius: '8px',
                              background: '#dbeafe',
                              border: '2px solid #3b82f6'
                            }}>
                              <div style={{ marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: '600', color: '#6b7280' }}>
                                Orden correcto:
                              </div>
                              <div 
                                style={{ 
                                  fontSize: '0.95rem', 
                                  color: '#1f2937',
                                  whiteSpace: 'pre-line'
                                }}
                                dangerouslySetInnerHTML={{ __html: ordenCorrectoTexto.replace(/\n/g, '<br>') || 'No definido' }}
                              />
                            </div>
                          </div>
                        );

                      case 'EMPAREJAR':
                        // Para EMPAREJAR, la respuesta es un objeto: {altId1: parId1, altId2: parId2}
                        let paresAlumno = [];
                        let todosParesCorrectos = true;
                        
                        if (respuestaAlumno && typeof respuestaAlumno === 'object' && Object.keys(respuestaAlumno).length > 0) {
                          paresAlumno = Object.entries(respuestaAlumno).map(([altId, parId]) => {
                            const origen = pregunta.alternativas?.find(alt => alt.id === parseInt(altId));
                            const destino = pregunta.alternativas?.find(alt => alt.id === parseInt(parId));
                            const origenText = origen?.descripcion?.replace(/<[^>]*>/g, '') || '?';
                            const destinoText = destino?.descripcion?.replace(/<[^>]*>/g, '') || '?';
                            
                            // Verificar si el par es correcto
                            const parEsCorrecto = origen && destino && origen.par_id === parseInt(parId);
                            if (!parEsCorrecto) todosParesCorrectos = false;
                            
                            return { origenText, destinoText, parEsCorrecto };
                          });
                        }
                        
                        // Obtener pares correctos
                        const paresCorrectos = pregunta.alternativas
                          ?.filter(alt => alt.par_id !== null && alt.par_id !== undefined)
                          .map(alt => {
                            const destino = pregunta.alternativas?.find(a => a.id === alt.par_id);
                            return {
                              origenText: alt.descripcion?.replace(/<[^>]*>/g, '') || '?',
                              destinoText: destino?.descripcion?.replace(/<[^>]*>/g, '') || '?'
                            };
                          }) || [];
                        
                        return (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div style={{ 
                              padding: '0.75rem', 
                              borderRadius: '8px',
                              background: todosParesCorrectos && paresAlumno.length > 0 ? '#d1fae5' : '#fee2e2',
                              border: `2px solid ${todosParesCorrectos && paresAlumno.length > 0 ? '#10b981' : '#ef4444'}`
                            }}>
                              <div style={{ marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: '600', color: '#6b7280' }}>
                                Emparejamiento seleccionado por el alumno:
                              </div>
                              {paresAlumno.length > 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                  {paresAlumno.map((par, idx) => (
                                    <div key={idx} style={{ 
                                      background: par.parEsCorrecto ? '#d1fae5' : '#fee2e2',
                                      padding: '0.5rem',
                                      borderRadius: '6px',
                                      borderLeft: `3px solid ${par.parEsCorrecto ? '#10b981' : '#ef4444'}`,
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '0.5rem'
                                    }}>
                                      <span style={{ fontWeight: '600', color: '#1e40af' }}>{par.origenText}</span>
                                      <span style={{ color: par.parEsCorrecto ? '#10b981' : '#ef4444', fontSize: '1.2rem' }}>→</span>
                                      <span style={{ color: par.parEsCorrecto ? '#059669' : '#dc2626' }}>{par.destinoText}</span>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div style={{ fontSize: '0.95rem', color: '#6b7280', fontStyle: 'italic' }}>(sin respuesta)</div>
                              )}
                            </div>
                            <div style={{ 
                              padding: '0.75rem', 
                              borderRadius: '8px',
                              background: '#dbeafe',
                              border: '2px solid #3b82f6'
                            }}>
                              <div style={{ marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: '600', color: '#6b7280' }}>
                                Emparejamiento correcto:
                              </div>
                              {paresCorrectos.length > 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                  {paresCorrectos.map((par, idx) => (
                                    <div key={idx} style={{ 
                                      background: '#dbeafe',
                                      padding: '0.5rem',
                                      borderRadius: '6px',
                                      borderLeft: '3px solid #3b82f6',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '0.5rem'
                                    }}>
                                      <span style={{ fontWeight: '600', color: '#1e40af' }}>{par.origenText}</span>
                                      <span style={{ color: '#3b82f6', fontSize: '1.2rem' }}>→</span>
                                      <span style={{ color: '#059669' }}>{par.destinoText}</span>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div style={{ fontSize: '0.95rem', color: '#6b7280' }}>No definido</div>
                              )}
                            </div>
                          </div>
                        );

                      case 'ARRASTRAR_Y_SOLTAR':
                        // Para ARRASTRAR_Y_SOLTAR, la respuesta es un objeto: {altId: {zona: "Zona1"}} o {altId: "Zona1"}
                        let elementosArrastrados = [];
                        let todosCorrectos = true;
                        
                        if (respuestaAlumno && typeof respuestaAlumno === 'object' && Object.keys(respuestaAlumno).length > 0) {
                          elementosArrastrados = Object.entries(respuestaAlumno).map(([altId, valor]) => {
                            const alt = pregunta.alternativas?.find(a => a.id === parseInt(altId));
                            const altText = alt?.descripcion?.replace(/<[^>]*>/g, '') || '?';
                            // La respuesta puede ser { zona: "Zona1" } o directamente "Zona1"
                            const zonaNombre = typeof valor === 'object' && valor.zona ? valor.zona : String(valor || '');
                            
                            // Verificar si la zona es correcta
                            const zonaCorrecta = alt?.zona_drop?.trim().toLowerCase() || '';
                            const esCorrecto = zonaNombre.trim().toLowerCase() === zonaCorrecta;
                            if (!esCorrecto) todosCorrectos = false;
                            
                            return { altText, zonaNombre, esCorrecto, zonaCorrecta };
                          });
                        }
                        
                        return (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div style={{ 
                              padding: '0.75rem', 
                              borderRadius: '8px',
                              background: todosCorrectos && elementosArrastrados.length > 0 ? '#d1fae5' : '#fee2e2',
                              border: `2px solid ${todosCorrectos && elementosArrastrados.length > 0 ? '#10b981' : '#ef4444'}`
                            }}>
                              <div style={{ marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: '600', color: '#6b7280' }}>
                                Zona donde soltó el alumno:
                              </div>
                              {elementosArrastrados.length > 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                  {elementosArrastrados.map((elem, idx) => (
                                    <div key={idx} style={{ 
                                      background: elem.esCorrecto ? '#d1fae5' : '#fee2e2',
                                      padding: '0.5rem',
                                      borderRadius: '6px',
                                      borderLeft: `3px solid ${elem.esCorrecto ? '#10b981' : '#ef4444'}`,
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '0.5rem'
                                    }}>
                                      <span style={{ background: elem.esCorrecto ? '#10b981' : '#ef4444', color: 'white', padding: '0.25rem 0.5rem', borderRadius: '4px', fontWeight: '600', fontSize: '0.85rem' }}>
                                        Zona {elem.zonaNombre}
                                      </span>
                                      <span style={{ color: elem.esCorrecto ? '#059669' : '#dc2626' }}>{elem.altText}</span>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div style={{ fontSize: '0.95rem', color: '#6b7280', fontStyle: 'italic' }}>(sin respuesta)</div>
                              )}
                            </div>
                            <div style={{ 
                              padding: '0.75rem', 
                              borderRadius: '8px',
                              background: '#dbeafe',
                              border: '2px solid #3b82f6'
                            }}>
                              <div style={{ marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: '600', color: '#6b7280' }}>
                                Zona correcta:
                              </div>
                              {pregunta.alternativas && pregunta.alternativas.filter(alt => alt.zona_drop).length > 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                  {pregunta.alternativas
                                    .filter(alt => alt.zona_drop)
                                    .map((alt, idx) => (
                                      <div key={idx} style={{ 
                                        background: '#dbeafe',
                                        padding: '0.5rem',
                                        borderRadius: '6px',
                                        borderLeft: '3px solid #3b82f6',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.5rem'
                                      }}>
                                        <span style={{ background: '#3b82f6', color: 'white', padding: '0.25rem 0.5rem', borderRadius: '4px', fontWeight: '600', fontSize: '0.85rem' }}>
                                          Zona {alt.zona_drop}
                                        </span>
                                        <span style={{ color: '#059669' }}>{alt.descripcion?.replace(/<[^>]*>/g, '') || '?'}</span>
                                      </div>
                                    ))}
                                </div>
                              ) : (
                                <div style={{ fontSize: '0.95rem', color: '#6b7280' }}>No definida</div>
                              )}
                            </div>
                          </div>
                        );

                      default:
                        return (
                          <div style={{ padding: '1rem', background: '#fef3c7', borderRadius: '8px', color: '#92400e' }}>
                            Tipo de pregunta no soportado: {pregunta.tipo}
                          </div>
                        );
                    }
                  };
                  
                  return (
                    <div 
                      key={pregunta.id} 
                      style={{ 
                        padding: '1.5rem', 
                        background: 'white', 
                        borderRadius: '12px',
                        border: '2px solid #e5e7eb',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                      }}
                    >
                      <div style={{ marginBottom: '1rem' }}>
                        <h3 style={{ 
                          margin: 0, 
                          marginBottom: '0.5rem',
                          fontSize: '1.1rem', 
                          fontWeight: '700', 
                          color: '#1f2937' 
                        }}>
                          Pregunta {index + 1}
                        </h3>
                        <div 
                          style={{ 
                            fontSize: '1rem', 
                            color: '#4b5563',
                            lineHeight: '1.6'
                          }}
                          dangerouslySetInnerHTML={{ __html: pregunta.descripcion }}
                        />
                      </div>

                      {renderizarPregunta()}
                    </div>
                  );
                })}
              </div>

              {/* Botón Cerrar */}
              <div style={{ marginTop: '2rem', textAlign: 'center' }}>
                <button 
                  className="btn-cancelar"
                  onClick={onClose}
                >
                  ✖️ Cerrar
          </button>
        </div>
            </>
          )}
    </div>
      </div>
    </div>,
    document.body
  );
}

export default DocenteAulaVirtual;
