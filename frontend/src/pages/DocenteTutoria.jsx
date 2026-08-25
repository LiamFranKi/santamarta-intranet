import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import DashboardLayout from '../components/DashboardLayout';
import api from '../services/api';
import Swal from 'sweetalert2';
import SwalSobreModal from '../utils/swalSobreModal';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import { generarPDFNotasTutoria } from '../utils/pdfNotasTutoria';
import jsPDF from 'jspdf';
import './DocenteTutoria.css';
import './DocenteCursos.css';
import './AlumnoCursos.css';
import './AlumnoHorario.css';
import './DocenteHijos.css';
/* Debe ir al final: fuerza .swal2-container por encima de overlays de tutoría */
import './DocenteTutoria-swal-layer.css';
import '../styles/docente-swal-over-modal.css';
import TutoriaModalDeudores from '../components/tutoria/TutoriaModalDeudores';
import { buildOpcionesTutoriaGrupo } from '../utils/opcionesMenuGrupo';
import { abrirVerLibretasGrupo } from '../utils/exportLibretasGrupoPdf';

/** Rango inicial (año calendario del año lectivo hasta hoy) para reportes tutor evidencias */
function rangoFechasReporteGrupo(anioEscolar) {
  const a = Number(anioEscolar) || new Date().getFullYear();
  const desde = `${a}-01-01`;
  const hasta = new Date().toISOString().slice(0, 10);
  return { desde, hasta };
}

function formatearSoloFecha(f) {
  if (f == null || f === '') return '—';
  if (typeof f === 'string' && /^\d{4}-\d{2}-\d{2}/.test(f)) {
    const [y, m, d] = f.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
  }
  try {
    return new Date(f).toLocaleDateString('es-PE');
  } catch {
    return String(f);
  }
}

function formatearFechaHoraPeru(iso) {
  if (iso == null || iso === '') return '—';
  try {
    return new Date(iso).toLocaleString('es-PE', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return String(iso);
  }
}

/** Fondos pastel alternados por tarjeta (alumnos tutor reportes). */
const PASTEL_TUTOR_EVIDENCIA = [
  { bg: 'linear-gradient(145deg,#fff7ed 0%, #ffedd5 100%)', border: '#fdba74', accent: '#9a3412' },
  { bg: 'linear-gradient(145deg,#eff6ff 0%, #dbeafe 100%)', border: '#93c5fd', accent: '#1e40af' },
  { bg: 'linear-gradient(145deg,#f0fdf4 0%, #dcfce7 100%)', border: '#86efac', accent: '#166534' },
  { bg: 'linear-gradient(145deg,#fdf4ff 0%, #fae8ff 100%)', border: '#e879f9', accent: '#86198f' },
  { bg: 'linear-gradient(145deg,#ecfeff 0%, #cffafe 100%)', border: '#22d3ee', accent: '#0e7490' },
  { bg: 'linear-gradient(145deg,#fefce8 0%,#fef08a 65%)', border: '#eab308', accent: '#854d0e' },
];

/** Ancho máximo típico de “móvil” para menús anclados vs panel centrado */
const VIEWPORT_MOBILE_MAX = 768;

function getVisualViewportHeight() {
  if (typeof window === 'undefined') return 800;
  const vv = window.visualViewport;
  return vv && vv.height > 0 ? vv.height : window.innerHeight;
}

function calcularPosicionMenuAnclado(rect, menuWidth, menuHeight) {
  const gap = 8;
  const edge = 12;
  const viewportH = getVisualViewportHeight();
  const viewportW = window.innerWidth;

  const spaceBelow = viewportH - rect.bottom;
  const spaceAbove = rect.top;

  let top = rect.bottom + gap;
  if (spaceBelow < menuHeight && spaceAbove > spaceBelow) {
    top = rect.top - menuHeight - gap;
  }
  top = Math.max(edge, Math.min(top, viewportH - menuHeight - edge));

  let left = rect.left;
  if (left + menuWidth > viewportW - edge) {
    left = viewportW - menuWidth - edge;
  }
  if (left < edge) left = edge;

  return { top, left };
}

function DocenteTutoria({
  apiPrefix = '/docente/tutoria',
  basePath = '/docente/tutoria',
  soloLectura = false,
  titulo = 'Tutoría',
  subtitulo = 'Gestiona tus grupos como tutor',
} = {}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [esTutor, setEsTutor] = useState(false);
  const [gruposTutor, setGruposTutor] = useState([]);
  const [openDropdown, setOpenDropdown] = useState(null); // { grupoId, layout:'sheet'|'anchor', top?, left? }
  const [selectedGrupo, setSelectedGrupo] = useState(null);
  const [grupoInfo, setGrupoInfo] = useState(null); // Información del grupo seleccionado
  const [alumnos, setAlumnos] = useState([]);
  const [loadingAlumnos, setLoadingAlumnos] = useState(false);
  const [openDropdownAlumno, setOpenDropdownAlumno] = useState(null); // { id, layout:'sheet'|'anchor', top?, left? }
  const [alumnoInfo, setAlumnoInfo] = useState(null); // Información completa del alumno seleccionado
  const [loadingAlumnoInfo, setLoadingAlumnoInfo] = useState(false);
  const dropdownRef = useRef(null);
  const alumnoDropdownRef = useRef(null);

  // Estados para Cursos Asignados
  const [mostrarCursos, setMostrarCursos] = useState(false);
  const [cursos, setCursos] = useState([]);
  const [loadingCursos, setLoadingCursos] = useState(false);
  const [grupoSeleccionadoCursos, setGrupoSeleccionadoCursos] = useState(null);
  
  // Estados para modal de mensaje al docente
  const [mostrarModalMensajeDocente, setMostrarModalMensajeDocente] = useState(false);
  const [docenteParaMensaje, setDocenteParaMensaje] = useState(null);
  const [asuntoMensajeDocente, setAsuntoMensajeDocente] = useState('');
  const [contenidoMensajeDocente, setContenidoMensajeDocente] = useState('');
  const [archivosAdjuntosMensajeDocente, setArchivosAdjuntosMensajeDocente] = useState([]);
  const [enviandoMensajeDocente, setEnviandoMensajeDocente] = useState(false);
  const quillRefMensajeDocente = useRef(null);
  
  // Estados para modal de mensaje al grupo
  const [mostrarModalMensajeGrupo, setMostrarModalMensajeGrupo] = useState(false);
  const [grupoParaMensaje, setGrupoParaMensaje] = useState(null); // Grupo seleccionado para enviar mensaje
  const [asuntoMensajeGrupo, setAsuntoMensajeGrupo] = useState('');
  const [contenidoMensajeGrupo, setContenidoMensajeGrupo] = useState('');
  const [archivosAdjuntosMensajeGrupo, setArchivosAdjuntosMensajeGrupo] = useState([]);
  const [enviandoMensajeGrupo, setEnviandoMensajeGrupo] = useState(false);
  const [enviarAMensajeGrupo, setEnviarAMensajeGrupo] = useState('todos'); // 'todos' | 'apoderados' | 'alumnos'
  const quillRefMensajeGrupo = useRef(null);
  
  // Estados para modal de asistencias (tutoría)
  const [mostrarModalAsistencias, setMostrarModalAsistencias] = useState(false);
  const [grupoParaAsistencias, setGrupoParaAsistencias] = useState(null);
  const [asistenciaFecha, setAsistenciaFecha] = useState(new Date().toISOString().slice(0, 10));
  const [asistenciaAlumnos, setAsistenciaAlumnos] = useState([]);
  const [loadingAsistencias, setLoadingAsistencias] = useState(false);
  const [guardandoAsistencia, setGuardandoAsistencia] = useState(null);

  // Estados para modal Recomendaciones
  const [mostrarModalRecomendaciones, setMostrarModalRecomendaciones] = useState(false);
  const [grupoParaRecomendaciones, setGrupoParaRecomendaciones] = useState(null);
  const [recomendacionesCiclo, setRecomendacionesCiclo] = useState(1);
  const [recomendacionesAlumnos, setRecomendacionesAlumnos] = useState([]);
  const [loadingRecomendaciones, setLoadingRecomendaciones] = useState(false);
  const [guardandoRecomendaciones, setGuardandoRecomendaciones] = useState(false);

  // Modal Deudores (tutoría)
  const [mostrarModalDeudores, setMostrarModalDeudores] = useState(false);
  const [grupoParaDeudores, setGrupoParaDeudores] = useState(null);

  // Estados para modal Conducta (automática: 20 − incidencias del bimestre)
  const [mostrarModalConducta, setMostrarModalConducta] = useState(false);
  const [grupoParaConducta, setGrupoParaConducta] = useState(null);
  const [conductaCiclo, setConductaCiclo] = useState(1);
  const [conductaAlumnos, setConductaAlumnos] = useState([]);
  const [conductaRango, setConductaRango] = useState({ desde: '', hasta: '' });
  const [loadingConducta, setLoadingConducta] = useState(false);
  const [recalculandoConducta, setRecalculandoConducta] = useState(false);

  const [fechaIncDesde, setFechaIncDesde] = useState('');
  const [fechaIncHasta, setFechaIncHasta] = useState('');
  const [incidenciasReporteCiclo, setIncidenciasReporteCiclo] = useState(1);
  const [usarFiltroBimestreInc, setUsarFiltroBimestreInc] = useState(true);
  const [modalIncidenciasGrupoAbierto, setModalIncidenciasGrupoAbierto] = useState(false);
  const [dataIncidenciasPorAlumno, setDataIncidenciasPorAlumno] = useState([]);
  const [loadingIncidenciasRep, setLoadingIncidenciasRep] = useState(false);
  const [detalleConductaAlumno, setDetalleConductaAlumno] = useState(null);
  const [loadingDetalleConducta, setLoadingDetalleConducta] = useState(false);

  // Estados para modal Ver Horario (del grupo, como lo ve el alumno)
  const [mostrarModalHorario, setMostrarModalHorario] = useState(false);
  const [grupoParaHorario, setGrupoParaHorario] = useState(null);
  const [horarioGrupo, setHorarioGrupo] = useState([]);
  const [loadingHorario, setLoadingHorario] = useState(false);

  // Estados para modal de mensaje a alumno individual
  const [mostrarModalMensajeAlumno, setMostrarModalMensajeAlumno] = useState(false);
  const [alumnoParaMensaje, setAlumnoParaMensaje] = useState(null); // Alumno seleccionado para enviar mensaje
  const [asuntoMensajeAlumno, setAsuntoMensajeAlumno] = useState('');
  const [contenidoMensajeAlumno, setContenidoMensajeAlumno] = useState('');
  const [archivosAdjuntosMensajeAlumno, setArchivosAdjuntosMensajeAlumno] = useState([]);
  const [enviandoMensajeAlumno, setEnviandoMensajeAlumno] = useState(false);
  const quillRefMensajeAlumno = useRef(null);

  // Estados para modal de mensaje exclusivo a apoderados (por alumno seleccionado)
  const [mostrarModalMensajeApoderados, setMostrarModalMensajeApoderados] = useState(false);
  const [alumnoParaMensajeApoderados, setAlumnoParaMensajeApoderados] = useState(null);
  const [cargandoDestinatariosApoderados, setCargandoDestinatariosApoderados] = useState(false);
  const [destinatariosApoderadosPreview, setDestinatariosApoderadosPreview] = useState([]);
  const [usuarioIdsApoderadosMensaje, setUsuarioIdsApoderadosMensaje] = useState([]);

  const [asuntoMensajeApoderados, setAsuntoMensajeApoderados] = useState('');
  const [contenidoMensajeApoderados, setContenidoMensajeApoderados] = useState('');
  const [archivosAdjuntosMensajeApoderados, setArchivosAdjuntosMensajeApoderados] = useState([]);
  const [enviandoMensajeApoderados, setEnviandoMensajeApoderados] = useState(false);
  const quillRefMensajeApoderados = useRef(null);

  // Incidencias y Estrellas (Tutoría — mismo flujo que Cursos asignados)
  const [showModalIncidenciasTutoria, setShowModalIncidenciasTutoria] = useState(false);
  const [showModalEstrellasTutoria, setShowModalEstrellasTutoria] = useState(false);
  const [alumnoSeleccionadoTutoria, setAlumnoSeleccionadoTutoria] = useState(null);
  const [incidenciasTutoria, setIncidenciasTutoria] = useState([]);
  const [estrellasTutoria, setEstrellasTutoria] = useState([]);
  const [totalIncidenciasTutoria, setTotalIncidenciasTutoria] = useState(0);
  const [totalEstrellasTutoria, setTotalEstrellasTutoria] = useState(0);
  const [loadingIncidenciasTutoria, setLoadingIncidenciasTutoria] = useState(false);
  const [loadingEstrellasTutoria, setLoadingEstrellasTutoria] = useState(false);
  const [formEstrellasTutoria, setFormEstrellasTutoria] = useState({ points: '', description: '' });
  const [formIncidenciasTutoria, setFormIncidenciasTutoria] = useState({ description: '' });
  const [guardandoEstrellasTutoria, setGuardandoEstrellasTutoria] = useState(false);
  const [guardandoIncidenciasTutoria, setGuardandoIncidenciasTutoria] = useState(false);

  const cursoInfoTutoriaPDF = useMemo(() => {
    if (!grupoInfo) return null;
    return {
      curso_nombre: 'Tutoría',
      grado: grupoInfo.grado ?? '',
      seccion: grupoInfo.seccion || '',
      nivel_nombre: grupoInfo.nivel_nombre || '',
      turno_nombre: grupoInfo.turno_nombre || 'N/A'
    };
  }, [grupoInfo]);

  const getGrupoIdTutoria = () =>
    typeof selectedGrupo === 'object' && selectedGrupo !== null ? selectedGrupo.id : selectedGrupo;

  const nombreCompletoAlumnoTutoria = (a) => {
    if (!a) return '';
    if (a.nombre_completo) return a.nombre_completo;
    return [a.apellido_paterno, a.apellido_materno, a.nombres].filter(Boolean).join(' ');
  };

  useEffect(() => {
    cargarGruposTutor();
  }, []);

  /* SweetAlert2: otras páginas (p. ej. AdminElecciones.css) fijan body.swal2-shown .swal2-container a ~13050;
     eso queda por debajo del modal tutoría (100000). Esta clase sube la especificidad del override en
     DocenteTutoria-swal-layer.css */
  useEffect(() => {
    document.body.classList.add('docente-tutoria-route');
    return () => document.body.classList.remove('docente-tutoria-route');
  }, []);

  // Cerrar dropdowns al hacer clic fuera
  useEffect(() => {
    if (!openDropdown && !openDropdownAlumno) return;
    
    const handleClickOutside = (event) => {
      const t = event.target;
      const inGrupo = dropdownRef.current?.contains(t);
      const inAlumno = alumnoDropdownRef.current?.contains(t);
      if (inGrupo || inAlumno) return;
      const isDropdownButton = t.closest('.btn-opciones, .btn-opciones-dropdown');
      if (!isDropdownButton) {
        setOpenDropdown(null);
        setOpenDropdownAlumno(null);
      }
    };
    
    const timeoutId = setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
    }, 50);
    
    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('click', handleClickOutside);
    };
  }, [openDropdown, openDropdownAlumno]);

  // Configurar handler de imágenes para ReactQuill en modal de mensaje al grupo
  useEffect(() => {
    if (quillRefMensajeGrupo.current && mostrarModalMensajeGrupo) {
      // Pequeño delay para asegurar que el editor esté completamente inicializado
      const timeoutId = setTimeout(() => {
        const quill = quillRefMensajeGrupo.current?.getEditor();
        if (!quill) return;
        
        const toolbar = quill.getModule('toolbar');
        if (!toolbar) return;
        
        // Handler para subir imágenes
        const imageHandler = async () => {
        const input = document.createElement('input');
        input.setAttribute('type', 'file');
        input.setAttribute('accept', 'image/*');
        input.click();

        input.onchange = async () => {
          const file = input.files[0];
          if (!file) return;

          // Validar tamaño (máximo 5MB)
          if (file.size > 5 * 1024 * 1024) {
            Swal.fire('Error', 'La imagen no puede ser mayor a 5MB', 'error');
            return;
          }

          // Validar tipo
          if (!file.type.startsWith('image/')) {
            Swal.fire('Error', 'Solo se permiten archivos de imagen', 'error');
            return;
          }

          try {
            const formData = new FormData();
            formData.append('imagen', file);

            const response = await api.post('/docente/mensajes/subir-imagen', formData, {
              headers: {
                'Content-Type': 'multipart/form-data',
              },
            });

            // El backend ya devuelve la URL completa (con dominio del sistema PHP)
            const imagenUrl = response.data.url;
            
            console.log('✅ [TUTORIA-GRUPO] Imagen subida, URL:', imagenUrl);
            
            // Insertar la imagen en el editor
            const range = quill.getSelection(true);
            quill.insertEmbed(range.index, 'image', imagenUrl);
            quill.setSelection(range.index + 1);
          } catch (error) {
            console.error('❌ [TUTORIA-GRUPO] Error subiendo imagen:', error);
            Swal.fire('Error', 'No se pudo subir la imagen', 'error');
          }
        };
      };
      
        // Agregar el handler
        toolbar.addHandler('image', imageHandler);
        console.log('✅ [TUTORIA-GRUPO] Handler de imágenes configurado');
      }, 100);
      
      // Cleanup
      return () => {
        clearTimeout(timeoutId);
      };
    }
  }, [mostrarModalMensajeGrupo]);

  // Configurar handler de imágenes para ReactQuill en modal de mensaje a alumno
  useEffect(() => {
    if (quillRefMensajeAlumno.current && mostrarModalMensajeAlumno) {
      // Pequeño delay para asegurar que el editor esté completamente inicializado
      const timeoutId = setTimeout(() => {
        const quill = quillRefMensajeAlumno.current?.getEditor();
        if (!quill) return;
        
        const toolbar = quill.getModule('toolbar');
        if (!toolbar) return;
        
        // Handler para subir imágenes
        const imageHandler = async () => {
        const input = document.createElement('input');
        input.setAttribute('type', 'file');
        input.setAttribute('accept', 'image/*');
        input.click();

        input.onchange = async () => {
          const file = input.files[0];
          if (!file) return;

          // Validar tamaño (máximo 5MB)
          if (file.size > 5 * 1024 * 1024) {
            Swal.fire('Error', 'La imagen no puede ser mayor a 5MB', 'error');
            return;
          }

          // Validar tipo
          if (!file.type.startsWith('image/')) {
            Swal.fire('Error', 'Solo se permiten archivos de imagen', 'error');
            return;
          }

          try {
            const formData = new FormData();
            formData.append('imagen', file);

            const response = await api.post('/docente/mensajes/subir-imagen', formData, {
              headers: {
                'Content-Type': 'multipart/form-data',
              },
            });

            // El backend ya devuelve la URL completa (con dominio del sistema PHP)
            const imagenUrl = response.data.url;
            
            console.log('✅ [TUTORIA-ALUMNO] Imagen subida, URL:', imagenUrl);
            
            // Insertar la imagen en el editor
            const range = quill.getSelection(true);
            quill.insertEmbed(range.index, 'image', imagenUrl);
            quill.setSelection(range.index + 1);
          } catch (error) {
            console.error('❌ [TUTORIA-ALUMNO] Error subiendo imagen:', error);
            Swal.fire('Error', 'No se pudo subir la imagen', 'error');
          }
        };
      };
      
        // Agregar el handler
        toolbar.addHandler('image', imageHandler);
        console.log('✅ [TUTORIA-ALUMNO] Handler de imágenes configurado');
      }, 100);
      
      // Cleanup
      return () => {
        clearTimeout(timeoutId);
      };
    }
  }, [mostrarModalMensajeAlumno]);

  // Configurar handler de imágenes para ReactQuill en modal de mensaje a apoderados
  useEffect(() => {
    if (quillRefMensajeApoderados.current && mostrarModalMensajeApoderados) {
      const timeoutId = setTimeout(() => {
        const quill = quillRefMensajeApoderados.current?.getEditor();
        if (!quill) return;

        const toolbar = quill.getModule('toolbar');
        if (!toolbar) return;

        const imageHandler = async () => {
          const input = document.createElement('input');
          input.setAttribute('type', 'file');
          input.setAttribute('accept', 'image/*');
          input.click();

          input.onchange = async () => {
            const file = input.files[0];
            if (!file) return;

            // Validar tamaño (máximo 5MB)
            if (file.size > 5 * 1024 * 1024) {
              Swal.fire('Error', 'La imagen no puede ser mayor a 5MB', 'error');
              return;
            }

            // Validar tipo
            if (!file.type.startsWith('image/')) {
              Swal.fire('Error', 'Solo se permiten archivos de imagen', 'error');
              return;
            }

            try {
              const formData = new FormData();
              formData.append('imagen', file);

              const response = await api.post('/docente/mensajes/subir-imagen', formData, {
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
              console.error('❌ [TUTORIA-APODERADOS] Error subiendo imagen:', error);
              Swal.fire('Error', 'No se pudo subir la imagen', 'error');
            }
          };
        };

        toolbar.addHandler('image', imageHandler);
      }, 100);

      return () => {
        clearTimeout(timeoutId);
      };
    }
  }, [mostrarModalMensajeApoderados]);

  // Configurar handler de imágenes para ReactQuill en modal de mensaje al docente
  useEffect(() => {
    if (quillRefMensajeDocente.current && mostrarModalMensajeDocente) {
      // Pequeño delay para asegurar que el editor esté completamente inicializado
      const timeoutId = setTimeout(() => {
        const quill = quillRefMensajeDocente.current?.getEditor();
        if (!quill) return;
        
        const toolbar = quill.getModule('toolbar');
        if (!toolbar) return;
        
        // Handler para subir imágenes
        const imageHandler = async () => {
          const input = document.createElement('input');
          input.setAttribute('type', 'file');
          input.setAttribute('accept', 'image/*');
          input.click();

          input.onchange = async () => {
            const file = input.files[0];
            if (!file) return;

            // Validar tamaño (máximo 5MB)
            if (file.size > 5 * 1024 * 1024) {
              Swal.fire('Error', 'La imagen no puede ser mayor a 5MB', 'error');
              return;
            }

            // Validar tipo
            if (!file.type.startsWith('image/')) {
              Swal.fire('Error', 'Solo se permiten archivos de imagen', 'error');
              return;
            }

            try {
              const formData = new FormData();
              formData.append('imagen', file);

              const response = await api.post('/docente/mensajes/subir-imagen', formData, {
                headers: {
                  'Content-Type': 'multipart/form-data',
                },
              });

              // El backend ya devuelve la URL completa (con dominio del sistema PHP)
              const imagenUrl = response.data.url;
              
              console.log('✅ [TUTORIA-DOCENTE] Imagen subida, URL:', imagenUrl);
              
              // Insertar la imagen en el editor
              const range = quill.getSelection(true);
              quill.insertEmbed(range.index, 'image', imagenUrl);
              quill.setSelection(range.index + 1);
            } catch (error) {
              console.error('❌ [TUTORIA-DOCENTE] Error subiendo imagen:', error);
              Swal.fire('Error', 'No se pudo subir la imagen', 'error');
            }
          };
        };
        
        // Agregar el handler
        toolbar.addHandler('image', imageHandler);
        console.log('✅ [TUTORIA-DOCENTE] Handler de imágenes configurado');
      }, 100);
      
      // Cleanup
      return () => {
        clearTimeout(timeoutId);
      };
    }
  }, [mostrarModalMensajeDocente]);

  const cargarGruposTutor = async () => {
    try {
      setLoading(true);
      const response = await api.get(apiPrefix);
      setEsTutor(response.data.es_tutoria_general || response.data.es_tutor);
      setGruposTutor(response.data.grupos || []);
    } catch (error) {
      console.error('Error cargando grupos de tutoría:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpcionesClick = (e, grupoId) => {
    e.stopPropagation();
    setOpenDropdownAlumno(null);
    if (openDropdown?.grupoId === grupoId && openDropdown?.layout === 'sheet') {
      setOpenDropdown(null);
      return;
    }
    if (openDropdown?.grupoId === grupoId && openDropdown?.layout === 'anchor') {
      setOpenDropdown(null);
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const isMobile = window.innerWidth <= VIEWPORT_MOBILE_MAX;

    if (isMobile) {
      setOpenDropdown({ grupoId, layout: 'sheet' });
      return;
    }

    const menuApproxHeight = 400;
    const menuApproxWidth = 520;
    const { top, left } = calcularPosicionMenuAnclado(rect, menuApproxWidth, menuApproxHeight);
    setOpenDropdown({
      grupoId,
      layout: 'anchor',
      top,
      left,
      anchorRect: {
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left
      }
    });
  };

  const handleToggleAlumnoOpciones = (e, alumno) => {
    e.stopPropagation();
    e.preventDefault();
    if (openDropdownAlumno?.id === alumno.id) {
      setOpenDropdownAlumno(null);
      return;
    }
    setOpenDropdown(null);

    const rect = e.currentTarget.getBoundingClientRect();
    const isMobile = window.innerWidth <= VIEWPORT_MOBILE_MAX;
    if (isMobile) {
      setOpenDropdownAlumno({ id: alumno.id, layout: 'sheet' });
      return;
    }

    const dropdownWidth = Math.min(280, window.innerWidth - 24);
    const menuApproxHeight = 300;
    const { top, left } = calcularPosicionMenuAnclado(rect, dropdownWidth, menuApproxHeight);
    setOpenDropdownAlumno({
      id: alumno.id,
      layout: 'anchor',
      top,
      left,
      anchorRect: {
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left
      }
    });
  };

  // Desktop: segunda pasada con tamaño real del menú para evitar que quede "muy arriba".
  useEffect(() => {
    if (!openDropdown || openDropdown.layout !== 'anchor' || !openDropdown.anchorRect || !dropdownRef.current) return;
    const menuRect = dropdownRef.current.getBoundingClientRect();
    if (!menuRect.width || !menuRect.height) return;
    const { top, left } = calcularPosicionMenuAnclado(openDropdown.anchorRect, menuRect.width, menuRect.height);
    if (Math.abs((openDropdown.top ?? 0) - top) < 1 && Math.abs((openDropdown.left ?? 0) - left) < 1) return;
    setOpenDropdown((prev) => {
      if (!prev || prev.layout !== 'anchor') return prev;
      return { ...prev, top, left };
    });
  }, [openDropdown]);

  useEffect(() => {
    if (!openDropdownAlumno || openDropdownAlumno.layout !== 'anchor' || !openDropdownAlumno.anchorRect || !alumnoDropdownRef.current) return;
    const menuRect = alumnoDropdownRef.current.getBoundingClientRect();
    if (!menuRect.width || !menuRect.height) return;
    const { top, left } = calcularPosicionMenuAnclado(openDropdownAlumno.anchorRect, menuRect.width, menuRect.height);
    if (Math.abs((openDropdownAlumno.top ?? 0) - top) < 1 && Math.abs((openDropdownAlumno.left ?? 0) - left) < 1) return;
    setOpenDropdownAlumno((prev) => {
      if (!prev || prev.layout !== 'anchor') return prev;
      return { ...prev, top, left };
    });
  }, [openDropdownAlumno]);

  const handleOpcionClick = async (opcion, grupo) => {
    setOpenDropdown(null);
    
    // Solo establecer selectedGrupo si realmente necesitamos cambiar la vista
    const opcionesQueCambianVista = ['lista-alumnos', 'cursos-asignados'];

    if (opcionesQueCambianVista.includes(opcion)) {
    setSelectedGrupo(grupo);
    }

    switch (opcion) {
      case 'lista-alumnos':
        await cargarAlumnos(grupo.id);
        break;
      case 'notas-asistencia':
        await handleVerNotasPDF(grupo);
        break;
      case 'ver-libretas':
        await abrirVerLibretasGrupo(grupo, {
          alumnosApiUrl: `${apiPrefix}/grupos/${grupo.id}/alumnos`,
          anioEsperado: grupo.anio != null ? parseInt(grupo.anio, 10) : undefined,
        });
        break;
      case 'conexiones-familiares':
        navigate(`/docente/grupos/${grupo.id}/conexiones-familiares`, { state: { grupo } });
        break;
      case 'registrar-asistencia':
        await handleAbrirAsistencias(grupo);
        break;
      case 'apreciaciones-recomendaciones':
        await handleAbrirRecomendaciones(grupo);
        break;
      case 'cursos-asignados':
        await handleVerCursos(grupo);
        break;
      case 'registrar-conducta':
        await handleAbrirConducta(grupo);
        break;
      case 'ver-horario':
        await handleVerHorarioGrupo(grupo);
        break;
      case 'ver-nomina':
        await handleExportarNominaGrupo(grupo);
        break;
      case 'orden-merito':
        await handleOrdenMeritoPDF(grupo);
        break;
      case 'deudores':
        setGrupoParaDeudores(grupo);
        setMostrarModalDeudores(true);
        break;
      default:
        break;
    }
  };

  const cargarAlumnos = async (grupoId) => {
    try {
      setLoadingAlumnos(true);
      const response = await api.get(`${apiPrefix}/grupos/${grupoId}/alumnos`);
      setAlumnos(response.data.alumnos || []);
      
      // Guardar información del grupo seleccionado
      const grupo = gruposTutor.find(g => g.id === grupoId);
      setGrupoInfo(grupo);
      setSelectedGrupo(grupoId);
      
      // Hacer scroll al inicio de la página cuando se carga la lista de alumnos
      setTimeout(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        const tutoriaContainer = document.querySelector('.docente-tutoria');
        if (tutoriaContainer) {
          tutoriaContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
    } catch (error) {
      console.error('Error cargando alumnos:', error);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: error.response?.data?.error || 'No se pudieron cargar los alumnos',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000
      });
    } finally {
      setLoadingAlumnos(false);
    }
  };

  const cargarInfoAlumno = async (alumnoId) => {
    setLoadingAlumnoInfo(true);
    try {
      const response = await api.get(`/docente/alumnos/${alumnoId}/info`);
      setAlumnoInfo(response.data);
    } catch (error) {
      console.error('Error cargando información del alumno:', error);
      setAlumnoInfo(null);
    } finally {
      setLoadingAlumnoInfo(false);
    }
  };

  const cerrarModalAlumno = () => {
    setAlumnoInfo(null);
  };

  const cerrarModalIncidenciasTutoria = () => {
    setShowModalIncidenciasTutoria(false);
    setAlumnoSeleccionadoTutoria(null);
    setIncidenciasTutoria([]);
    setTotalIncidenciasTutoria(0);
    setFormIncidenciasTutoria({ description: '' });
  };

  const cerrarModalEstrellasTutoria = () => {
    setShowModalEstrellasTutoria(false);
    setAlumnoSeleccionadoTutoria(null);
    setEstrellasTutoria([]);
    setTotalEstrellasTutoria(0);
    setFormEstrellasTutoria({ points: '', description: '' });
  };

  const handleVerIncidenciasTutoria = async (alumno) => {
    const gid = getGrupoIdTutoria();
    if (!gid) return;
    setAlumnoSeleccionadoTutoria(alumno);
    setFormIncidenciasTutoria({ description: '' });
    setLoadingIncidenciasTutoria(true);
    setShowModalIncidenciasTutoria(true);
    try {
      const res = await api.get(`${apiPrefix}/grupos/${gid}/alumnos/${alumno.id}/incidencias`);
      setIncidenciasTutoria(res.data.incidencias || []);
      setTotalIncidenciasTutoria(res.data.total_incidencias ?? (res.data.incidencias || []).length);
    } catch (err) {
      console.error('Error cargando incidencias (tutoría):', err);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: err.response?.data?.error || 'No se pudieron cargar las incidencias',
        zIndex: 100001
      });
      setIncidenciasTutoria([]);
      setTotalIncidenciasTutoria(0);
    } finally {
      setLoadingIncidenciasTutoria(false);
    }
    setOpenDropdownAlumno(null);
  };

  const handleVerEstrellasTutoria = async (alumno) => {
    const gid = getGrupoIdTutoria();
    if (!gid) return;
    setAlumnoSeleccionadoTutoria(alumno);
    setFormEstrellasTutoria({ points: '', description: '' });
    setLoadingEstrellasTutoria(true);
    setShowModalEstrellasTutoria(true);
    try {
      const res = await api.get(`${apiPrefix}/grupos/${gid}/alumnos/${alumno.id}/estrellas`);
      setEstrellasTutoria(res.data.estrellas || []);
      setTotalEstrellasTutoria(res.data.total_estrellas || 0);
    } catch (err) {
      console.error('Error cargando estrellas (tutoría):', err);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: err.response?.data?.error || 'No se pudieron cargar las estrellas',
        zIndex: 100001
      });
      setEstrellasTutoria([]);
      setTotalEstrellasTutoria(0);
    } finally {
      setLoadingEstrellasTutoria(false);
    }
    setOpenDropdownAlumno(null);
  };

  const formatearFechaIncEstTutoria = (fecha) => {
    if (!fecha) return '';
    const date = new Date(fecha);
    const dia = String(date.getDate()).padStart(2, '0');
    const mes = String(date.getMonth() + 1).padStart(2, '0');
    const año = date.getFullYear();
    let horas = date.getHours();
    const minutos = String(date.getMinutes()).padStart(2, '0');
    const ampm = horas >= 12 ? 'PM' : 'AM';
    horas = horas % 12;
    horas = horas || 12;
    return `${dia}-${mes}-${año} ${String(horas).padStart(2, '0')}:${minutos} ${ampm}`;
  };

  const formatearFechaPDFIncEstTutoria = (fecha) => {
    if (!fecha) return '';
    const date = new Date(fecha);
    const dia = String(date.getDate()).padStart(2, '0');
    const mes = String(date.getMonth() + 1).padStart(2, '0');
    const año = date.getFullYear();
    let horas = date.getHours();
    const minutos = String(date.getMinutes()).padStart(2, '0');
    const ampm = horas >= 12 ? 'PM' : 'AM';
    horas = horas % 12;
    horas = horas || 12;
    return `${dia}/${mes}/${año} ${String(horas).padStart(2, '0')}:${minutos} ${ampm}`;
  };

  const recargarIncidenciasTutoria = async () => {
    const gid = getGrupoIdTutoria();
    const alumno = alumnoSeleccionadoTutoria;
    if (!gid || !alumno?.id) return;
    try {
      setLoadingIncidenciasTutoria(true);
      const res = await api.get(`${apiPrefix}/grupos/${gid}/alumnos/${alumno.id}/incidencias`);
      setIncidenciasTutoria(res.data.incidencias || []);
      setTotalIncidenciasTutoria(res.data.total_incidencias ?? (res.data.incidencias || []).length);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingIncidenciasTutoria(false);
    }
  };

  const recargarEstrellasTutoria = async () => {
    const gid = getGrupoIdTutoria();
    const alumno = alumnoSeleccionadoTutoria;
    if (!gid || !alumno?.id) return;
    try {
      setLoadingEstrellasTutoria(true);
      const res = await api.get(`${apiPrefix}/grupos/${gid}/alumnos/${alumno.id}/estrellas`);
      setEstrellasTutoria(res.data.estrellas || []);
      setTotalEstrellasTutoria(res.data.total_estrellas || 0);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingEstrellasTutoria(false);
    }
  };

  const handleRegistrarIncidenciaTutoria = async (e) => {
    e.preventDefault();
    const gid = getGrupoIdTutoria();
    if (!gid || !alumnoSeleccionadoTutoria?.id) return;
    if (!formIncidenciasTutoria.description?.trim()) {
      SwalSobreModal.fire({ title: 'Error', text: 'La descripción es requerida', icon: 'error' });
      return;
    }
    try {
      setGuardandoIncidenciasTutoria(true);
      await api.post(
        `${apiPrefix}/grupos/${gid}/alumnos/${alumnoSeleccionadoTutoria.id}/incidencias`,
        { description: formIncidenciasTutoria.description.trim() }
      );
      SwalSobreModal.fire({ title: '¡Éxito!', text: 'Incidencia registrada correctamente', icon: 'success' });
      setFormIncidenciasTutoria({ description: '' });
      await recargarIncidenciasTutoria();
    } catch (error) {
      console.error(error);
      SwalSobreModal.fire({
        title: 'Error',
        text: error.response?.data?.error || 'No se pudo registrar la incidencia',
        icon: 'error',
      });
    } finally {
      setGuardandoIncidenciasTutoria(false);
    }
  };

  const handleEliminarIncidenciaTutoria = async (incidentId) => {
    const gid = getGrupoIdTutoria();
    if (!gid || !alumnoSeleccionadoTutoria?.id) return;
    const result = await SwalSobreModal.fire({
      title: '¿Estás seguro?',
      text: 'Se eliminará esta incidencia. Esta acción no se puede deshacer.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
    });
    if (!result.isConfirmed) return;
    try {
      await api.delete(
        `${apiPrefix}/grupos/${gid}/alumnos/${alumnoSeleccionadoTutoria.id}/incidencias/${incidentId}`
      );
      SwalSobreModal.fire({ title: '¡Eliminado!', text: 'La incidencia ha sido eliminada correctamente', icon: 'success' });
      await recargarIncidenciasTutoria();
    } catch (error) {
      console.error(error);
      SwalSobreModal.fire({
        title: 'Error',
        text: error.response?.data?.error || 'No se pudo eliminar la incidencia',
        icon: 'error',
      });
    }
  };

  const handleDarEstrellasTutoria = async (e) => {
    e.preventDefault();
    const gid = getGrupoIdTutoria();
    if (!gid || !alumnoSeleccionadoTutoria?.id) return;
    const pts = parseInt(formEstrellasTutoria.points, 10);
    if (!pts || pts <= 0) {
      SwalSobreModal.fire({ title: 'Error', text: 'La cantidad de estrellas debe ser mayor a 0', icon: 'error' });
      return;
    }
    if (!formEstrellasTutoria.description?.trim()) {
      SwalSobreModal.fire({ title: 'Error', text: 'La descripción es requerida', icon: 'error' });
      return;
    }
    try {
      setGuardandoEstrellasTutoria(true);
      await api.post(`${apiPrefix}/grupos/${gid}/alumnos/${alumnoSeleccionadoTutoria.id}/estrellas`, {
        points: pts,
        description: formEstrellasTutoria.description.trim()
      });
      SwalSobreModal.fire({ title: '¡Éxito!', text: `${pts} estrella(s) asignada(s) correctamente`, icon: 'success' });
      setFormEstrellasTutoria({ points: '', description: '' });
      await recargarEstrellasTutoria();
    } catch (error) {
      console.error(error);
      SwalSobreModal.fire({
        title: 'Error',
        text: error.response?.data?.error || 'No se pudieron asignar las estrellas',
        icon: 'error',
      });
    } finally {
      setGuardandoEstrellasTutoria(false);
    }
  };

  const handleEliminarEstrellasTutoria = async (incidentId, points) => {
    const gid = getGrupoIdTutoria();
    if (!gid || !alumnoSeleccionadoTutoria?.id) return;
    const result = await SwalSobreModal.fire({
      title: '¿Estás seguro?',
      text: `Se eliminarán ${points} estrella(s). Esta acción no se puede deshacer.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
    });
    if (!result.isConfirmed) return;
    try {
      await api.delete(
        `${apiPrefix}/grupos/${gid}/alumnos/${alumnoSeleccionadoTutoria.id}/estrellas/${incidentId}`
      );
      SwalSobreModal.fire({ title: '¡Eliminado!', text: 'Las estrellas han sido eliminadas correctamente', icon: 'success' });
      await recargarEstrellasTutoria();
    } catch (error) {
      console.error(error);
      SwalSobreModal.fire({
        title: 'Error',
        text: error.response?.data?.error || 'No se pudieron eliminar las estrellas',
        icon: 'error',
      });
    }
  };

  const exportarPDFEstrellasTutoria = () => {
    if (!alumnoSeleccionadoTutoria || estrellasTutoria.length === 0) {
      Swal.fire({ title: 'Sin datos', text: 'No hay estrellas para exportar', icon: 'info', zIndex: 100001 });
      return;
    }
    const nombreAlumno = nombreCompletoAlumnoTutoria(alumnoSeleccionadoTutoria);
    const doc = new jsPDF('p', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 15;
    const contentWidth = pageWidth - margin * 2;
    let yPosition = margin;
    const colorHeader = [96, 165, 250];
    const colorBorder = [59, 130, 246];
    const colorText = [30, 41, 59];
    const colorLight = [219, 234, 254];
    const colorDark = [30, 64, 175];

    doc.setFillColor(...colorHeader);
    doc.rect(margin, yPosition, contentWidth, 30, 'F');
    doc.setDrawColor(...colorBorder);
    doc.setLineWidth(0.5);
    doc.rect(margin, yPosition, contentWidth, 30);
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('REPORTE DE ESTRELLAS', margin + 5, yPosition + 12);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(`Alumno: ${nombreAlumno}`, margin + 5, yPosition + 22);
    yPosition += 35;

    if (cursoInfoTutoriaPDF) {
      doc.setFillColor(...colorLight);
      doc.rect(margin, yPosition, contentWidth, 25, 'F');
      doc.setDrawColor(...colorBorder);
      doc.setLineWidth(0.3);
      doc.rect(margin, yPosition, contentWidth, 25);
      doc.setFillColor(...colorHeader);
      doc.rect(margin, yPosition, contentWidth, 7, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('INFORMACIÓN DEL CURSO', margin + 5, yPosition + 5);
      yPosition += 10;
      doc.setTextColor(...colorText);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(`Curso: ${cursoInfoTutoriaPDF.curso_nombre}`, margin + 5, yPosition);
      yPosition += 5;
      doc.text(`Grado: ${cursoInfoTutoriaPDF.grado}° ${cursoInfoTutoriaPDF.seccion}`, margin + 5, yPosition);
      yPosition += 5;
      doc.text(`Nivel: ${cursoInfoTutoriaPDF.nivel_nombre} - Turno: ${cursoInfoTutoriaPDF.turno_nombre}`, margin + 5, yPosition);
      yPosition += 5;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(...colorDark);
      doc.text(`Total de Estrellas: ${totalEstrellasTutoria}`, margin + 5, yPosition - 2);
      yPosition += 12;
    }

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...colorText);
    doc.text('HISTORIAL DE ESTRELLAS', margin, yPosition);
    yPosition += 8;
    doc.setFillColor(...colorHeader);
    doc.rect(margin, yPosition, contentWidth, 9, 'F');
    doc.setDrawColor(...colorBorder);
    doc.setLineWidth(0.3);
    doc.rect(margin, yPosition, contentWidth, 9);
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(0.2);
    doc.line(margin + 50, yPosition, margin + 50, yPosition + 9);
    doc.line(margin + 75, yPosition, margin + 75, yPosition + 9);
    doc.line(margin + 135, yPosition, margin + 135, yPosition + 9);
    doc.text('DOCENTE', margin + 25, yPosition + 6, { align: 'center' });
    doc.text('ESTRELLAS', margin + 62.5, yPosition + 6, { align: 'center' });
    doc.text('DESCRIPCIÓN', margin + 105, yPosition + 6, { align: 'center' });
    doc.text('FECHA', margin + 157.5, yPosition + 6, { align: 'center' });
    yPosition += 11;
    doc.setTextColor(...colorText);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setDrawColor(...colorBorder);

    estrellasTutoria.forEach((item, index) => {
      if (yPosition > pageHeight - 35) {
        doc.addPage();
        yPosition = margin;
        doc.setFillColor(...colorHeader);
        doc.rect(margin, yPosition, contentWidth, 9, 'F');
        doc.setDrawColor(...colorBorder);
        doc.rect(margin, yPosition, contentWidth, 9);
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setDrawColor(255, 255, 255);
        doc.line(margin + 50, yPosition, margin + 50, yPosition + 9);
        doc.line(margin + 75, yPosition, margin + 75, yPosition + 9);
        doc.line(margin + 135, yPosition, margin + 135, yPosition + 9);
        doc.line(margin + 160, yPosition, margin + 160, yPosition + 9);
        doc.text('DOCENTE', margin + 25, yPosition + 6, { align: 'center' });
        doc.text('ESTRELLAS', margin + 62.5, yPosition + 6, { align: 'center' });
        doc.text('DESCRIPCIÓN', margin + 105, yPosition + 6, { align: 'center' });
        doc.text('FECHA', margin + 147.5, yPosition + 6, { align: 'center' });
        yPosition += 11;
        doc.setTextColor(...colorText);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setDrawColor(...colorBorder);
      }
      doc.setTextColor(...colorText);
      const docente = item.docente_nombre || 'N/A';
      const descripcion = item.description || '-';
      const fecha = formatearFechaPDFIncEstTutoria(item.created_at);
      const maxWidth = 65;
      const descripcionLines = doc.splitTextToSize(descripcion, maxWidth);
      const alturaDescripcion = descripcionLines.length * 4;
      const alturaFila = Math.max(9, alturaDescripcion + 2);
      if (index % 2 === 0) {
        doc.setFillColor(...colorLight);
        doc.rect(margin, yPosition - 3, contentWidth, alturaFila, 'F');
      }
      doc.setDrawColor(...colorBorder);
      doc.setLineWidth(0.2);
      doc.rect(margin, yPosition - 3, contentWidth, alturaFila);
      doc.setLineWidth(0.1);
      doc.line(margin + 50, yPosition - 3, margin + 50, yPosition - 3 + alturaFila);
      doc.line(margin + 75, yPosition - 3, margin + 75, yPosition - 3 + alturaFila);
      doc.line(margin + 135, yPosition - 3, margin + 135, yPosition - 3 + alturaFila);
      const centroDocente = margin + 25;
      const centroEstrellas = margin + 62.5;
      const centroDescripcion = margin + 105;
      const centroFecha = margin + 157.5;
      const anchoDocente = 45;
      const anchoDescripcion = 60;
      const docenteLines = doc.splitTextToSize(docente, anchoDocente);
      let docenteY = yPosition + 2.5;
      docenteLines.forEach((line, lineIndex) => {
        if (lineIndex === 0) doc.text(line, centroDocente, docenteY, { align: 'center' });
        else {
          docenteY += 4;
          doc.text(line, centroDocente, docenteY, { align: 'center' });
        }
      });
      doc.setFont('helvetica', 'bold');
      doc.text(`${item.points}`, centroEstrellas, yPosition + 2.5, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      let descY = yPosition + 2.5;
      descripcionLines.forEach((line, lineIndex) => {
        if (lineIndex === 0) doc.text(line, centroDescripcion, descY, { align: 'center', maxWidth: anchoDescripcion });
        else {
          descY += 4;
          doc.text(line, centroDescripcion, descY, { align: 'center', maxWidth: anchoDescripcion });
        }
      });
      doc.text(fecha, centroFecha, yPosition + 2.5, { align: 'center' });
      yPosition += alturaFila;
    });

    const fechaGeneracion = new Date().toLocaleDateString('es-PE', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.setFont('helvetica', 'italic');
    doc.text(`Generado el: ${fechaGeneracion}`, margin, pageHeight - 10);
    doc.save(`Estrellas_${nombreAlumno.replace(/\s+/g, '_')}_${new Date().getTime()}.pdf`);
    Swal.fire({
      title: '¡PDF Generado!',
      text: 'El reporte de estrellas se ha descargado correctamente',
      icon: 'success',
      zIndex: 100001
    });
  };

  const exportarPDFIncidenciasTutoria = () => {
    if (!alumnoSeleccionadoTutoria || incidenciasTutoria.length === 0) {
      Swal.fire({ title: 'Sin datos', text: 'No hay incidencias para exportar', icon: 'info', zIndex: 100001 });
      return;
    }
    const nombreAlumno = nombreCompletoAlumnoTutoria(alumnoSeleccionadoTutoria);
    const doc = new jsPDF('p', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 15;
    const contentWidth = pageWidth - margin * 2;
    let yPosition = margin;
    const colorHeader = [167, 139, 250];
    const colorBorder = [139, 92, 246];
    const colorText = [30, 41, 59];
    const colorLight = [233, 213, 255];
    const colorDark = [107, 33, 168];

    doc.setFillColor(...colorHeader);
    doc.rect(margin, yPosition, contentWidth, 30, 'F');
    doc.setDrawColor(...colorBorder);
    doc.setLineWidth(0.5);
    doc.rect(margin, yPosition, contentWidth, 30);
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('REPORTE DE INCIDENCIAS', margin + 5, yPosition + 12);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(`Alumno: ${nombreAlumno}`, margin + 5, yPosition + 22);
    yPosition += 35;

    if (cursoInfoTutoriaPDF) {
      doc.setFillColor(...colorLight);
      doc.rect(margin, yPosition, contentWidth, 25, 'F');
      doc.setDrawColor(...colorBorder);
      doc.setLineWidth(0.3);
      doc.rect(margin, yPosition, contentWidth, 25);
      doc.setFillColor(...colorHeader);
      doc.rect(margin, yPosition, contentWidth, 7, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('INFORMACIÓN DEL CURSO', margin + 5, yPosition + 5);
      yPosition += 10;
      doc.setTextColor(...colorText);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(`Curso: ${cursoInfoTutoriaPDF.curso_nombre}`, margin + 5, yPosition);
      yPosition += 5;
      doc.text(`Grado: ${cursoInfoTutoriaPDF.grado}° ${cursoInfoTutoriaPDF.seccion}`, margin + 5, yPosition);
      yPosition += 5;
      doc.text(`Nivel: ${cursoInfoTutoriaPDF.nivel_nombre} - Turno: ${cursoInfoTutoriaPDF.turno_nombre}`, margin + 5, yPosition);
      yPosition += 5;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(...colorDark);
      doc.text(`Total de Incidencias: ${totalIncidenciasTutoria}`, margin + 5, yPosition - 2);
      yPosition += 12;
    }

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...colorText);
    doc.text('HISTORIAL DE INCIDENCIAS', margin, yPosition);
    yPosition += 8;
    doc.setFillColor(...colorHeader);
    doc.rect(margin, yPosition, contentWidth, 9, 'F');
    doc.setDrawColor(...colorBorder);
    doc.setLineWidth(0.3);
    doc.rect(margin, yPosition, contentWidth, 9);
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(0.2);
    doc.line(margin + 45, yPosition, margin + 45, yPosition + 9);
    doc.line(margin + 75, yPosition, margin + 75, yPosition + 9);
    doc.line(margin + 140, yPosition, margin + 140, yPosition + 9);
    doc.text('DOCENTE', margin + 22.5, yPosition + 6, { align: 'center' });
    doc.text('CURSO', margin + 60, yPosition + 6, { align: 'center' });
    doc.text('DESCRIPCIÓN', margin + 107.5, yPosition + 6, { align: 'center' });
    doc.text('FECHA', margin + 157.5, yPosition + 6, { align: 'center' });
    yPosition += 11;
    doc.setTextColor(...colorText);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setDrawColor(...colorBorder);

    incidenciasTutoria.forEach((item, index) => {
      if (yPosition > pageHeight - 35) {
        doc.addPage();
        yPosition = margin;
        doc.setFillColor(...colorHeader);
        doc.rect(margin, yPosition, contentWidth, 9, 'F');
        doc.setDrawColor(...colorBorder);
        doc.rect(margin, yPosition, contentWidth, 9);
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setDrawColor(255, 255, 255);
        doc.line(margin + 45, yPosition, margin + 45, yPosition + 9);
        doc.line(margin + 75, yPosition, margin + 75, yPosition + 9);
        doc.line(margin + 140, yPosition, margin + 140, yPosition + 9);
        doc.text('DOCENTE', margin + 22.5, yPosition + 6, { align: 'center' });
        doc.text('CURSO', margin + 60, yPosition + 6, { align: 'center' });
        doc.text('DESCRIPCIÓN', margin + 107.5, yPosition + 6, { align: 'center' });
        doc.text('FECHA', margin + 157.5, yPosition + 6, { align: 'center' });
        yPosition += 11;
        doc.setTextColor(...colorText);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setDrawColor(...colorBorder);
      }
      doc.setTextColor(...colorText);
      const docente = item.docente_nombre || 'N/A';
      const curso = item.curso_nombre || 'N/A';
      const descripcion = item.description || '-';
      const fecha = formatearFechaPDFIncEstTutoria(item.created_at);
      const maxWidth = 65;
      const descripcionLines = doc.splitTextToSize(descripcion, maxWidth);
      const alturaDescripcion = descripcionLines.length * 4;
      const alturaFila = Math.max(9, alturaDescripcion + 2);
      if (index % 2 === 0) {
        doc.setFillColor(...colorLight);
        doc.rect(margin, yPosition - 3, contentWidth, alturaFila, 'F');
      }
      doc.setDrawColor(...colorBorder);
      doc.setLineWidth(0.2);
      doc.rect(margin, yPosition - 3, contentWidth, alturaFila);
      doc.setLineWidth(0.1);
      doc.line(margin + 45, yPosition - 3, margin + 45, yPosition - 3 + alturaFila);
      doc.line(margin + 75, yPosition - 3, margin + 75, yPosition - 3 + alturaFila);
      doc.line(margin + 140, yPosition - 3, margin + 140, yPosition - 3 + alturaFila);
      const centroDocente = margin + 22.5;
      const centroCurso = margin + 60;
      const centroDescripcion = margin + 107.5;
      const centroFecha = margin + 157.5;
      const anchoDocente = 40;
      const anchoCurso = 55;
      const anchoDescripcion = 60;
      const docenteLines = doc.splitTextToSize(docente, anchoDocente);
      let docenteY = yPosition + 2.5;
      docenteLines.forEach((line, lineIndex) => {
        if (lineIndex === 0) doc.text(line, centroDocente, docenteY, { align: 'center' });
        else {
          docenteY += 4;
          doc.text(line, centroDocente, docenteY, { align: 'center' });
        }
      });
      const cursoLines = doc.splitTextToSize(curso, anchoCurso);
      let cursoY = yPosition + 2.5;
      cursoLines.forEach((line, lineIndex) => {
        if (lineIndex === 0) doc.text(line, centroCurso, cursoY, { align: 'center' });
        else {
          cursoY += 4;
          doc.text(line, centroCurso, cursoY, { align: 'center' });
        }
      });
      let descY = yPosition + 2.5;
      descripcionLines.forEach((line, lineIndex) => {
        if (lineIndex === 0) doc.text(line, centroDescripcion, descY, { align: 'center', maxWidth: anchoDescripcion });
        else {
          descY += 4;
          doc.text(line, centroDescripcion, descY, { align: 'center', maxWidth: anchoDescripcion });
        }
      });
      doc.text(fecha, centroFecha, yPosition + 2.5, { align: 'center' });
      yPosition += alturaFila;
    });

    const fechaGeneracion = new Date().toLocaleDateString('es-PE', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.setFont('helvetica', 'italic');
    doc.text(`Generado el: ${fechaGeneracion}`, margin, pageHeight - 10);
    doc.save(`Incidencias_${nombreAlumno.replace(/\s+/g, '_')}_${new Date().getTime()}.pdf`);
    Swal.fire({
      title: '¡PDF Generado!',
      text: 'El reporte de incidencias se ha descargado correctamente',
      icon: 'success',
      zIndex: 100001
    });
  };

  const volverAGrupos = () => {
    setSelectedGrupo(null);
    setGrupoInfo(null);
    setAlumnos([]);
    setOpenDropdownAlumno(null);
  };

  // Ver Notas PDF - descarga PDF con notas de todos los cursos del grupo (hoja por curso)
  const handleVerNotasPDF = async (grupo) => {
    try {
      const { value: ciclo } = await Swal.fire({
        title: 'Exportar Notas',
        text: 'Seleccione el bimestre a exportar',
        icon: 'question',
        input: 'select',
        inputOptions: { 1: 'I Bimestre', 2: 'II Bimestre', 3: 'III Bimestre', 4: 'IV Bimestre' },
        inputValue: 1,
        showCancelButton: true,
        confirmButtonText: 'Generar PDF',
        cancelButtonText: 'Cancelar'
      });
      if (!ciclo) return;

      const cicloNum = parseInt(ciclo) || 1;
      const response = await api.get(`${apiPrefix}/grupos/${grupo.id}/notas-todos`, {
        params: { ciclo: cicloNum }
      });

      const cursosData = response.data?.cursos || [];
      const grupoInfo = response.data?.grupo || grupo;

      if (cursosData.length === 0) {
        Swal.fire({
          icon: 'info',
          title: 'Sin datos',
          text: 'No hay cursos con notas para este grupo',
          confirmButtonText: 'Entendido'
        });
        return;
      }

      const ok = generarPDFNotasTutoria(cursosData, grupoInfo);
      if (ok) {
      Swal.fire({
        icon: 'success',
          title: '¡PDF Generado!',
          text: `Se descargó el reporte de notas de ${cursosData.length} curso(s)`,
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
          timer: 3000
        });
      }
    } catch (error) {
      console.error('Error generando PDF de notas:', error);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: error.response?.data?.error || 'No se pudo generar el PDF de notas',
        confirmButtonText: 'Entendido'
      });
    }
  };

  // Abrir modal de Asistencias
  const handleAbrirAsistencias = async (grupo) => {
    setGrupoParaAsistencias(grupo);
    setMostrarModalAsistencias(true);
    setAsistenciaFecha(new Date().toISOString().slice(0, 10));
    await cargarAsistencias(grupo.id, new Date().toISOString().slice(0, 10));
  };

  const cargarAsistencias = async (grupoId, fecha) => {
    if (!grupoId) return;
    try {
      setLoadingAsistencias(true);
      const res = await api.get(`${apiPrefix}/grupos/${grupoId}/asistencia`, {
        params: { fecha: fecha || asistenciaFecha }
      });
      setAsistenciaAlumnos(res.data.alumnos || []);
    } catch (error) {
      console.error('Error cargando asistencias:', error);
      Swal.fire({ icon: 'error', title: 'Error', text: error.response?.data?.error || 'No se pudieron cargar las asistencias' });
      setAsistenciaAlumnos([]);
    } finally {
      setLoadingAsistencias(false);
    }
  };

  const handleCambiarFechaAsistencia = (nuevaFecha) => {
    setAsistenciaFecha(nuevaFecha);
    if (grupoParaAsistencias) cargarAsistencias(grupoParaAsistencias.id, nuevaFecha);
  };

  const handleAsistenciaClick = async (matriculaId, tipo) => {
    if (!grupoParaAsistencias || guardandoAsistencia) return;
    setGuardandoAsistencia(matriculaId);
    try {
      const now = new Date();
      const hora_dispositivo = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
      await api.post(`${apiPrefix}/grupos/${grupoParaAsistencias.id}/asistencia`, {
        matricula_id: matriculaId,
        fecha: asistenciaFecha,
        tipo,
        hora_dispositivo
      });
      setAsistenciaAlumnos(prev =>
        prev.map(a =>
          a.matricula_id === matriculaId ? { ...a, tipo } : a
        )
      );
    } catch (error) {
      console.error('Error guardando asistencia:', error);
      Swal.fire({ icon: 'error', title: 'Error', text: error.response?.data?.error || 'No se pudo guardar' });
    } finally {
      setGuardandoAsistencia(null);
    }
  };

  const handleGuardarAsistencias = async () => {
    if (!grupoParaAsistencias) return;
    try {
      setLoadingAsistencias(true);
      const now = new Date();
      const hora_dispositivo = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
      const res = await api.post(`${apiPrefix}/grupos/${grupoParaAsistencias.id}/asistencia/guardar-todo`, {
        fecha: asistenciaFecha,
        hora_dispositivo
      });
      await cargarAsistencias(grupoParaAsistencias.id, asistenciaFecha);
      const n = res.data?.marcados_como_falta || 0;
      if (n > 0) {
        Swal.fire({ icon: 'success', title: 'Guardado', text: `${n} alumno(s) marcado(s) como falta. Se enviaron notificaciones.`, timer: 2500, showConfirmButton: false });
      } else {
        Swal.fire({ icon: 'success', title: 'Guardado', text: 'No había alumnos pendientes de marcar.', timer: 2000, showConfirmButton: false });
      }
    } catch (error) {
      console.error('Error guardando asistencias:', error);
      Swal.fire({ icon: 'error', title: 'Error', text: error.response?.data?.error || 'No se pudo guardar' });
    } finally {
      setLoadingAsistencias(false);
    }
  };

  // Recomendaciones
  const handleAbrirRecomendaciones = async (grupo) => {
    setGrupoParaRecomendaciones(grupo);
    setMostrarModalRecomendaciones(true);
    setRecomendacionesCiclo(1);
    await cargarRecomendaciones(grupo.id, 1);
  };

  const cargarRecomendaciones = async (grupoId, ciclo) => {
    if (!grupoId) return;
    try {
      setLoadingRecomendaciones(true);
      const res = await api.get(`${apiPrefix}/grupos/${grupoId}/recomendaciones`, { params: { ciclo } });
      setRecomendacionesAlumnos(res.data.alumnos || []);
    } catch (error) {
      console.error('Error cargando recomendaciones:', error);
      Swal.fire({ icon: 'error', title: 'Error', text: error.response?.data?.error || 'No se pudieron cargar' });
      setRecomendacionesAlumnos([]);
    } finally {
      setLoadingRecomendaciones(false);
    }
  };

  const handleCambiarCicloRecomendaciones = (ciclo) => {
    setRecomendacionesCiclo(ciclo);
    if (grupoParaRecomendaciones) cargarRecomendaciones(grupoParaRecomendaciones.id, ciclo);
  };

  const handleRecomendacionChange = (matriculaId, valor) => {
    setRecomendacionesAlumnos(prev =>
      prev.map(a => a.matricula_id === matriculaId ? { ...a, recomendacion: valor } : a)
    );
  };

  const handleGuardarRecomendaciones = async () => {
    if (!grupoParaRecomendaciones) return;
    try {
      setGuardandoRecomendaciones(true);
      const rec = {};
      recomendacionesAlumnos.forEach(a => { rec[a.matricula_id] = a.recomendacion || ''; });
      await api.post(`${apiPrefix}/grupos/${grupoParaRecomendaciones.id}/recomendaciones`, {
        ciclo: recomendacionesCiclo,
        recomendaciones: rec
      });
      Swal.fire({
        icon: 'success',
        title: 'Guardado',
        text: 'Recomendaciones guardadas correctamente',
        timer: 2000,
        showConfirmButton: false,
      });
    } catch (error) {
      console.error('Error guardando recomendaciones:', error);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: error.response?.data?.error || 'No se pudo guardar',
      });
    } finally {
      setGuardandoRecomendaciones(false);
    }
  };

  const exportarPDFRecomendaciones = async () => {
    if (!recomendacionesAlumnos.length) {
      Swal.fire({ icon: 'info', title: 'Sin datos', text: 'No hay alumnos para exportar' });
      return;
    }
    const doc = new jsPDF('p', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 14;
    const grupoNombre = grupoParaRecomendaciones ? `${grupoParaRecomendaciones.grado}° ${grupoParaRecomendaciones.seccion} - ${grupoParaRecomendaciones.nivel_nombre}` : '';
    let yPos = 0;
    const colorPrimario = [102, 126, 234];
    const colorBlanco = [255, 255, 255];

    try {
      const logoRes = await fetch('/icons/logoboleta.png');
      if (logoRes.ok) {
        const blob = await logoRes.blob();
        const dataUrl = await new Promise((res) => { const r = new FileReader(); r.onloadend = () => res(r.result); r.readAsDataURL(blob); });
        doc.addImage(dataUrl, 'PNG', margin, 4, 24, 24);
      }
    } catch (e) { /* ignore */ }

    doc.setFillColor(...colorPrimario);
    doc.rect(0, 0, pageWidth, 36, 'F');
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...colorBlanco);
    doc.text('APRECIACIONES / RECOMENDACIONES', margin + 30, 14);
    doc.setFontSize(10);
    doc.setTextColor(240, 240, 240);
    doc.text(`Grupo: ${grupoNombre}  |  Bimestre: ${recomendacionesCiclo}  |  Año: ${grupoParaRecomendaciones?.anio || ''}`, margin + 30, 24);
    yPos = 42;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    recomendacionesAlumnos.forEach((a, i) => {
      if (yPos > pageHeight - 35) { doc.addPage(); yPos = margin; }
      doc.setFont('helvetica', 'bold');
      doc.text(`${a.numero}. ${a.nombre_completo}`, margin, yPos);
      yPos += 5;
      doc.setFont('helvetica', 'normal');
      const texto = (a.recomendacion || '').trim() || '(Sin recomendación)';
      const lineas = doc.splitTextToSize(texto, pageWidth - 2 * margin);
      lineas.forEach(l => { doc.text(l, margin + 5, yPos); yPos += 5; });
      yPos += 5;
    });

    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(`Generado: ${new Date().toLocaleString('es-PE')}`, margin, pageHeight - 8);
    doc.save(`Recomendaciones_${grupoNombre.replace(/\s+/g, '_')}_B${recomendacionesCiclo}.pdf`);
    Swal.fire({
      icon: 'success',
      title: 'PDF generado',
      text: 'El reporte se descargó correctamente',
      timer: 2000,
      showConfirmButton: false,
    });
  };

  // Conducta automática (+ reporte unificado incidencias / presentación)
  const handleAbrirConducta = async (grupo) => {
    const rango = rangoFechasReporteGrupo(grupo.anio);
    setFechaIncDesde(rango.desde);
    setFechaIncHasta(rango.hasta);
    setGrupoParaConducta(grupo);
    setMostrarModalConducta(true);
    setConductaCiclo(1);
    setIncidenciasReporteCiclo(1);
    setUsarFiltroBimestreInc(true);
    setModalIncidenciasGrupoAbierto(false);
    setDataIncidenciasPorAlumno([]);
    setDetalleConductaAlumno(null);
    await cargarConducta(grupo.id, 1);
  };

  // Exportar Nómina PDF o Excel
  const handleExportarNominaGrupo = async (grupo) => {
    try {
      const { elegirFormatoExportNomina, exportarExcelNominaGrupo } = await import(
        '../utils/excelNominaAlumnosGrupo'
      );
      const formato = await elegirFormatoExportNomina(Swal);
      if (!formato) return;

      const res = await api.get(`${apiPrefix}/grupos/${grupo.id}/alumnos`);
      const alumnos = res.data.alumnos || [];
      if (alumnos.length === 0) {
        Swal.fire({ icon: 'info', title: 'Sin alumnos', text: 'No hay alumnos en este grupo' });
        return;
      }
      const alumnosConNombre = alumnos.map(a => ({
        ...a,
        nombre_completo: a.nombre_completo || `${(a.apellido_paterno || '')} ${(a.apellido_materno || '')}, ${(a.nombres || '')}`.trim()
      }));
      const grupoNombre = `${grupo.grado}° ${grupo.seccion} - ${grupo.nivel_nombre || ''} - ${grupo.turno_nombre || ''}`.replace(/\s*-\s*$/, '').trim();

      if (formato === 'excel') {
        await exportarExcelNominaGrupo({
          titulo: 'REGISTRO ACADÉMICO',
          subtitulo: grupoNombre,
          filas: alumnosConNombre,
          filename: `Nomina_${grupoNombre.replace(/\s+/g, '_')}`,
        });
        Swal.fire({
          title: '¡Excel generado!',
          text: 'La nómina se ha descargado correctamente',
          icon: 'success',
          timer: 2000,
          showConfirmButton: false,
        });
        return;
      }

      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 12;
      const colNombresWidth = 76;
      const numCols = 25;
      const colNumWidth = 12;
      const usableWidth = pageWidth - 2 * margin;
      const colCuadroWidth = (usableWidth - colNumWidth - colNombresWidth) / numCols;
      const totalTableWidth = colNumWidth + colNombresWidth + numCols * colCuadroWidth;
      const leftOffset = margin;

      const logoUrl = process.env.REACT_APP_API_URL
        ? `${process.env.REACT_APP_API_URL.replace(/\/api\/?$/, '')}/assets/logos/logo.png`
        : `${window.location.origin}/assets/logos/logo.png`;
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const logoImg = new Image();
        logoImg.crossOrigin = 'anonymous';
        await new Promise((resolve, reject) => {
          logoImg.onload = resolve;
          logoImg.onerror = reject;
          logoImg.src = logoUrl;
        });
        canvas.width = logoImg.width;
        canvas.height = logoImg.height;
        ctx.drawImage(logoImg, 0, 0);
        const logoData = canvas.toDataURL('image/png');
        const logoW = 16;
        const logoH = (logoImg.height / logoImg.width) * logoW;
        doc.addImage(logoData, 'PNG', pageWidth - margin - logoW, 4, logoW, logoH);
      } catch (e) { console.warn('Logo no cargado:', e); }

      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text('REGISTRO ACADÉMICO', pageWidth / 2, 12, { align: 'center' });
      doc.setFontSize(12);
      doc.setFont('helvetica', 'normal');
      doc.text(grupoNombre, pageWidth / 2, 20, { align: 'center' });

      let y = 28;
      const headerHeight = 7;
      doc.setFillColor(74, 131, 193);
      doc.rect(leftOffset, y - 5, totalTableWidth, headerHeight, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      const headerTextY = y - 5 + headerHeight / 2 + 1.2;
      doc.text('Nº', leftOffset + colNumWidth / 2, headerTextY, { align: 'center' });
      doc.text('Apellidos y Nombres', leftOffset + colNumWidth + colNombresWidth / 2, headerTextY, { align: 'center' });
      doc.setTextColor(0, 0, 0);

      const rowHeight = 5.5;
      const cuadroHeight = 4.2;
      y = 36;
      alumnosConNombre.forEach((alumno, idx) => {
        if (y > pageHeight - 20) {
          doc.addPage('landscape', 'a4');
          y = 12;
        }
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setFillColor(74, 131, 193);
        doc.rect(leftOffset, y - 0.5, colNumWidth, cuadroHeight + 0.5, 'F');
        doc.setTextColor(255, 255, 255);
        doc.text(String(idx + 1), leftOffset + colNumWidth / 2, y + cuadroHeight / 2 + 1, { align: 'center' });
        doc.setTextColor(0, 0, 0);
        let x = leftOffset + colNumWidth;
        doc.text((alumno.nombre_completo || '').substring(0, 45), x + 2, y + cuadroHeight / 2 + 1);
        x += colNombresWidth;
        for (let c = 0; c < numCols; c++) {
          doc.rect(x, y, colCuadroWidth - 0.2, cuadroHeight, 'S');
          x += colCuadroWidth;
        }
        y += rowHeight;
      });

      const nombreArchivo = `Nomina_${grupoNombre.replace(/\s+/g, '_')}_${Date.now()}.pdf`;
      doc.save(nombreArchivo);
      Swal.fire({ title: '¡PDF Generado!', text: 'La nómina se ha descargado correctamente', icon: 'success', timer: 2000, showConfirmButton: false });
    } catch (err) {
      console.error('Error exportando nómina:', err);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: err.response?.data?.error || err.message || 'No se pudo generar la nómina',
      });
    }
  };

  // Orden de Mérito: modal solo bimestre (año siempre el activo del grupo)
  const handleOrdenMeritoPDF = async (grupo) => {
    const { value: result } = await Swal.fire({
      title: 'Reporte de Orden de Mérito',
      html: `
        <p style="margin-bottom: 1rem;">Seleccione el bimestre.</p>
        <label style="display:block; text-align:left; margin-bottom: 0.25rem; font-weight: 600;">Bimestre</label>
        <select id="swal-ciclo-om" class="swal2-input" style="width: 100%;">
          <option value="1">Bimestre I</option>
          <option value="2">Bimestre II</option>
          <option value="3">Bimestre III</option>
          <option value="4">Bimestre IV</option>
        </select>
      `,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Descargar PDF',
      cancelButtonText: 'Cancelar',
      preConfirm: () => {
        const ciclo = parseInt(document.getElementById('swal-ciclo-om').value, 10);
        return { ciclo };
      }
    });
    if (!result) return;
    try {
      const res = await api.get(`${apiPrefix}/grupos/${grupo.id}/orden-merito`);
      const { grupo: grupoRes, detalle } = res.data;
      const list = (detalle && detalle[`b${result.ciclo}`]) || [];
      const bimestresLabel = ['I', 'II', 'III', 'IV'];
      const doc = new jsPDF('p', 'mm', 'a4');
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 5;
      const colPuesto = 18;
      const colPromedio = 28;
      const colNombres = pageWidth - margin * 2 - colPuesto - colPromedio;
      const colorLabel = [100, 149, 237];
      const colorData = [255, 255, 255];

      let yP = margin + 12;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text(`Reporte de Orden de Mérito — Bimestre ${bimestresLabel[result.ciclo - 1]}`, margin, yP);
      yP += 4;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      const grado = grupoRes?.grado ?? grupo.grado;
      const seccion = grupoRes?.seccion ?? grupo.seccion;
      const nivel = grupoRes?.nivel_nombre ?? grupo.nivel_nombre ?? '';
      const anio = grupoRes?.anio ?? grupo.anio;
      doc.text(`${grado}° ${seccion || ''} — ${nivel} — ${anio || ''}`, margin, yP);
      yP += 8;
      doc.setFillColor(...colorLabel);
      doc.rect(margin, yP, colPuesto, 6, 'FD');
      doc.rect(margin + colPuesto, yP, colNombres, 6, 'FD');
      doc.rect(margin + colPuesto + colNombres, yP, colPromedio, 6, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(255, 255, 255);
      doc.text('Puesto', margin + colPuesto / 2, yP + 4, { align: 'center' });
      doc.text('Apellidos y Nombres', margin + colPuesto + colNombres / 2, yP + 4, { align: 'center' });
      doc.text('Promedio', margin + colPuesto + colNombres + colPromedio / 2, yP + 4, { align: 'center' });
      doc.setTextColor(0, 0, 0);
      yP += 6;
      doc.setFont('helvetica', 'normal');
      list.forEach((row) => {
        if (yP > pageHeight - 20) { doc.addPage(); yP = margin; }
        const nombreCompleto = `${row.apellido_paterno || ''} ${row.apellido_materno || ''} ${row.nombres || ''}`.trim() || '-';
        doc.setFillColor(...colorData);
        doc.rect(margin, yP, colPuesto, 5, 'FD');
        doc.rect(margin + colPuesto, yP, colNombres, 5, 'FD');
        doc.rect(margin + colPuesto + colNombres, yP, colPromedio, 5, 'FD');
        doc.text(String(row.puesto), margin + colPuesto / 2, yP + 3.5, { align: 'center' });
        doc.text(nombreCompleto, margin + colPuesto + 2, yP + 3.5);
        doc.text(typeof row.promedio === 'number' ? row.promedio.toFixed(2) : String(row.promedio || ''), margin + colPuesto + colNombres + colPromedio / 2, yP + 3.5, { align: 'center' });
        yP += 5;
      });

      const nombreArchivo = `OrdenMerito_${grado}°_${seccion}_Bim${bimestresLabel[result.ciclo - 1]}_${Date.now()}.pdf`;
      doc.save(nombreArchivo);
      Swal.fire({ title: '¡PDF Generado!', text: 'El reporte de orden de mérito se ha descargado correctamente', icon: 'success', timer: 2000, showConfirmButton: false });
    } catch (err) {
      console.error('Error generando orden de mérito:', err);
      Swal.fire({ icon: 'error', title: 'Error', text: err.response?.data?.error || 'No se pudo generar el PDF' });
    }
  };

  // Ver Horario del grupo (como lo ve el alumno)
  const handleVerHorarioGrupo = async (grupo) => {
    setGrupoParaHorario(grupo);
    setMostrarModalHorario(true);
    setLoadingHorario(true);
    setHorarioGrupo([]);
    try {
      const res = await api.get(`${apiPrefix}/grupos/${grupo.id}/horario`);
      const horariosRecibidos = res.data.horario || [];
      const dias = horariosRecibidos.map(c => typeof c.dia === 'number' ? c.dia : null).filter(d => d !== null);
      const minDia = dias.length ? Math.min(...dias) : 1;
      const maxDia = dias.length ? Math.max(...dias) : 5;
      const usaCeroCuatro = minDia === 0 && maxDia <= 4;
      const normalizado = horariosRecibidos.map(c => ({
        ...c,
        diaNormalizado: usaCeroCuatro ? (typeof c.dia === 'number' ? c.dia + 1 : c.dia) : c.dia
      }));
      setHorarioGrupo(normalizado);
    } catch (error) {
      console.error('Error cargando horario:', error);
      Swal.fire({ icon: 'error', title: 'Error', text: error.response?.data?.error || 'No se pudo cargar el horario' });
      setHorarioGrupo([]);
    } finally {
      setLoadingHorario(false);
    }
  };

  const diasSemanaHorario = [
    { id: 1, nombre: 'Lunes', abrev: 'LUNES' },
    { id: 2, nombre: 'Martes', abrev: 'MARTES' },
    { id: 3, nombre: 'Miércoles', abrev: 'MIÉRCOLES' },
    { id: 4, nombre: 'Jueves', abrev: 'JUEVES' },
    { id: 5, nombre: 'Viernes', abrev: 'VIERNES' }
  ];

  const formatearHoraGrupo = (hora) => {
    if (!hora) return '';
    const h = hora.toUpperCase().trim();
    if (h.includes('AM') || h.includes('PM')) return hora.trim();
    const partes = hora.split(':');
    if (partes.length < 2) return hora;
    const hr = parseInt(partes[0], 10);
    const m = (partes[1] ? partes[1].split(' ')[0] : '00').padStart(2, '0');
    if (isNaN(hr)) return hora;
    if (hr === 0) return `12:${m} AM`;
    if (hr < 12) return `${hr}:${m} AM`;
    if (hr === 12) return `12:${m} PM`;
    return `${hr - 12}:${m} PM`;
  };

  const horaAMinutosGrupo = (hora) => {
    if (!hora) return 0;
    const h = hora.toUpperCase().trim();
    if (h.includes('AM') || h.includes('PM')) {
      const partes = hora.split(':');
      if (partes.length < 2) return 0;
      let hr = parseInt(partes[0], 10);
      const minStr = partes[1].replace(/[^0-9]/g, '');
      const min = parseInt(minStr || 0, 10);
      if (h.includes('PM') && hr !== 12) hr += 12;
      if (h.includes('AM') && hr === 12) hr = 0;
      return hr * 60 + min;
    }
    const partes = hora.split(':');
    if (partes.length < 2) return 0;
    const hr = parseInt(partes[0], 10);
    const min = parseInt(partes[1] ? partes[1].split(' ')[0] : 0, 10);
    return (isNaN(hr) || isNaN(min)) ? 0 : hr * 60 + min;
  };

  const horariosUnicosGrupo = useMemo(() => {
    if (!horarioGrupo || horarioGrupo.length === 0) return [];
    const bloques = horarioGrupo.map(c => ({
      inicio: c.inicio || c.hora_inicio || '',
      fin: c.fin || c.hora_final || ''
    })).filter(b => b.inicio && b.fin);
    const unicos = {};
    bloques.forEach(b => { const k = `${b.inicio}-${b.fin}`; if (!unicos[k]) unicos[k] = b; });
    return Object.values(unicos).sort((a, b) => horaAMinutosGrupo(a.inicio) - horaAMinutosGrupo(b.inicio));
  }, [horarioGrupo]);

  const obtenerClaseGrupo = (dia, horaInicio, horaFin) => {
    if (!horarioGrupo || horarioGrupo.length === 0) return null;
    return horarioGrupo.find(c => {
      const d = c.diaNormalizado ?? c.dia ?? 0;
      const i = c.inicio || c.hora_inicio || '';
      const f = c.fin || c.hora_final || '';
      return d === dia && i === horaInicio && f === horaFin;
    }) || null;
  };

  const formatearClaseGrupo = (clase) => {
    if (!clase) return null;
    const t = clase.titulo || '';
    const doc = clase.docente_nombre || '';
    if (!t) return null;
    return doc ? `${t} - ${doc}` : t;
  };

  const colorPaletteGrupo = ['#FFF9C4','#BBDEFB','#F3E5F5','#C8E6C9','#E0F7FA','#FFF3E0','#FCE4EC','#E1F5FE','#F1F8E9','#FFEBEE','#E8EAF6','#E0F2F1','#E1BEE7','#FFE0B2','#FFCCBC','#D1C4E9','#F8BBD0','#B2DFDB','#C5E1A5','#FFE082','#BCAAA4','#90CAF9','#A5D6A7','#CE93D8','#FFAB91','#80CBC4','#FFCC80','#B39DDB','#81C784','#64B5F6'];
  const hashStringGrupo = (str) => {
    let h = 0;
    const s = (str || '').trim().toLowerCase();
    for (let i = 0; i < s.length; i++) {
      h = ((h << 5) - h) + s.charCodeAt(i);
      h = h + (h << 10); h = h ^ (h >> 6);
      h = h + (h << 3); h = h ^ (h >> 11); h = h + (h << 15);
    }
    return Math.abs(h);
  };
  const getColorForCourseGrupo = (titulo) => titulo && titulo.trim() ? colorPaletteGrupo[hashStringGrupo(titulo) % colorPaletteGrupo.length] : '#ffffff';
  const aclararColorGrupo = (colorHex, factor = 0.4) => {
    if (!colorHex) return '#ffffff';
    const r = parseInt(colorHex.slice(1, 3), 16);
    const g = parseInt(colorHex.slice(3, 5), 16);
    const b = parseInt(colorHex.slice(5, 7), 16);
    return `#${Math.round(r + (255 - r) * factor).toString(16).padStart(2, '0')}${Math.round(g + (255 - g) * factor).toString(16).padStart(2, '0')}${Math.round(b + (255 - b) * factor).toString(16).padStart(2, '0')}`;
  };
  const hexToRgbGrupo = (hex) => {
    const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return r ? { r: parseInt(r[1], 16), g: parseInt(r[2], 16), b: parseInt(r[3], 16) } : null;
  };

  const detalleHorarioGrupo = useMemo(() => {
    if (!horarioGrupo || horarioGrupo.length === 0) return [];
    const map = {};
    horarioGrupo.forEach(clase => {
      if (!clase.titulo) return;
      const clave = `${clase.titulo.trim()}|||${clase.docente_nombre || ''}`;
      if (!map[clave]) map[clave] = { titulo: clase.titulo.trim(), docente: clase.docente_nombre || '', horarios: [] };
      const d = clase.diaNormalizado ?? clase.dia ?? 0;
      const ini = clase.inicio || clase.hora_inicio || '';
      const fin = clase.fin || clase.hora_final || '';
      if (ini && fin && !map[clave].horarios.some(h => h.dia === d && h.inicio === ini && h.fin === fin)) {
        map[clave].horarios.push({
          dia: d,
          diaNombre: diasSemanaHorario.find(x => x.id === d)?.nombre || `Día ${d}`,
          inicio: ini,
          fin
        });
      }
    });
    const arr = Object.values(map).sort((a, b) => a.titulo.localeCompare(b.titulo));
    arr.forEach(c => c.horarios.sort((a, b) => a.dia !== b.dia ? a.dia - b.dia : horaAMinutosGrupo(a.inicio) - horaAMinutosGrupo(b.inicio)));
    return arr;
  }, [horarioGrupo, diasSemanaHorario]);

  const exportarHorarioGrupoPDF = () => {
    if (!horarioGrupo || horarioGrupo.length === 0) {
      Swal.fire({ title: 'Sin datos', text: 'No hay horario para exportar', icon: 'info' });
      return;
    }
    try {
      const doc = new jsPDF('l', 'mm', 'a4');
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 15;
      const contentWidth = pageWidth - 2 * margin;
      let yPosition = margin;
      const colorHeader = [59, 130, 246];
      const colorBorder = [30, 64, 175];
      const colorText = [30, 41, 59];
      const tituloGrupo = grupoParaHorario ? `${grupoParaHorario.grado}° ${grupoParaHorario.seccion} - ${grupoParaHorario.nivel_nombre}` : 'Horario';

      doc.setFillColor(...colorHeader);
      doc.rect(margin, yPosition, contentWidth, 25, 'F');
      doc.setDrawColor(...colorBorder);
      doc.setLineWidth(0.5);
      doc.rect(margin, yPosition, contentWidth, 25);
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(20);
      doc.setFont('helvetica', 'bold');
      doc.text('MI HORARIO DE CLASES', margin + contentWidth / 2, yPosition + 15, { align: 'center' });
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`${tituloGrupo} - Año Académico Actual`, margin + contentWidth / 2, yPosition + 22, { align: 'center' });
      yPosition += 30;

      const colWidth = contentWidth / 6;
      const rowHeight = 15;
      const headerHeight = 12;

      doc.setFillColor(...colorHeader);
      doc.rect(margin, yPosition, colWidth, headerHeight, 'F');
      doc.setDrawColor(...colorBorder);
      doc.rect(margin, yPosition, colWidth, headerHeight);
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('HORA', margin + colWidth / 2, yPosition + headerHeight / 2 + 3, { align: 'center' });
      diasSemanaHorario.forEach((dia, idx) => {
        const x = margin + colWidth + idx * colWidth;
        doc.setFillColor(...colorHeader);
        doc.rect(x, yPosition, colWidth, headerHeight, 'F');
        doc.setDrawColor(...colorBorder);
        doc.rect(x, yPosition, colWidth, headerHeight);
        doc.text(dia.abrev, x + colWidth / 2, yPosition + headerHeight / 2 + 3, { align: 'center' });
      });
      yPosition += headerHeight;

      horariosUnicosGrupo.forEach((bloque) => {
        const c1 = obtenerClaseGrupo(1, bloque.inicio, bloque.fin);
        const c2 = obtenerClaseGrupo(2, bloque.inicio, bloque.fin);
        const c3 = obtenerClaseGrupo(3, bloque.inicio, bloque.fin);
        const c4 = obtenerClaseGrupo(4, bloque.inicio, bloque.fin);
        const c5 = obtenerClaseGrupo(5, bloque.inicio, bloque.fin);
        if (!c1 && !c2 && !c3 && !c4 && !c5) return;
        if (yPosition + rowHeight > pageHeight - margin - 10) { doc.addPage(); yPosition = margin; }

        doc.setDrawColor(200, 200, 200);
        doc.rect(margin, yPosition, colWidth, rowHeight);
        doc.setTextColor(...colorText);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text(`${formatearHoraGrupo(bloque.inicio)} - ${formatearHoraGrupo(bloque.fin)}`, margin + colWidth / 2, yPosition + rowHeight / 2 + 3, { align: 'center', maxWidth: colWidth - 4 });

        [c1, c2, c3, c4, c5].forEach((clase, idx) => {
          const x = margin + colWidth + idx * colWidth;
          doc.setDrawColor(200, 200, 200);
          doc.rect(x, yPosition, colWidth, rowHeight);
          if (clase) {
            const rgb = hexToRgbGrupo(getColorForCourseGrupo(clase.titulo));
            if (rgb) { doc.setFillColor(rgb.r, rgb.g, rgb.b); doc.rect(x + 0.5, yPosition + 0.5, colWidth - 1, rowHeight - 1, 'F'); }
            doc.setTextColor(...colorText);
            doc.setFontSize(9);
            doc.setFont('helvetica', 'normal');
            const texto = formatearClaseGrupo(clase);
            if (texto) {
              const lineas = doc.splitTextToSize(texto, colWidth - 6);
              const numLineas = lineas.length;
              const yInicio = yPosition + (rowHeight - numLineas * 4) / 2 + 3;
              lineas.forEach((l, i) => doc.text(l, x + colWidth / 2, yInicio + i * 4, { align: 'center', maxWidth: colWidth - 6 }));
            }
          }
        });
        yPosition += rowHeight;
      });

      if (detalleHorarioGrupo.length > 0) {
        if (yPosition + 20 > pageHeight - margin - 10) { doc.addPage(); yPosition = margin; }
        yPosition += 10;
        doc.setDrawColor(...colorBorder);
        doc.line(margin, yPosition, margin + contentWidth, yPosition);
        yPosition += 5;
        doc.setTextColor(...colorText);
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('DETALLE DE HORARIO', margin, yPosition);
        yPosition += 8;

        detalleHorarioGrupo.forEach((curso) => {
          const cardHeight = 28;
          if (yPosition + cardHeight > pageHeight - margin - 10) { doc.addPage(); yPosition = margin; }
          const rgb = hexToRgbGrupo(getColorForCourseGrupo(curso.titulo));
          if (rgb) { doc.setFillColor(rgb.r, rgb.g, rgb.b); doc.roundedRect(margin, yPosition, contentWidth, cardHeight, 3, 3, 'F'); }
          doc.setDrawColor(200, 200, 200);
          doc.roundedRect(margin, yPosition, contentWidth, cardHeight, 3, 3);
          const centro = yPosition + cardHeight / 2;
          doc.setTextColor(...colorText);
          doc.setFontSize(14);
          doc.setFont('helvetica', 'bold');
          doc.text(doc.splitTextToSize(curso.titulo, contentWidth - 20), margin + contentWidth / 2, centro - 8, { align: 'center', maxWidth: contentWidth - 20 });
          if (curso.docente) {
            doc.setFontSize(11);
            doc.setFont('helvetica', 'normal');
            doc.text(`Docente: ${curso.docente}`, margin + contentWidth / 2, centro - 1, { align: 'center', maxWidth: contentWidth - 20 });
          }
          if (curso.horarios && curso.horarios.length > 0) {
            const texto = curso.horarios.map(h => `${h.diaNombre}: ${formatearHoraGrupo(h.inicio)} - ${formatearHoraGrupo(h.fin)}`).join(' | ');
            doc.setFontSize(10);
            doc.text(doc.splitTextToSize(texto, contentWidth - 20), margin + contentWidth / 2, centro + 6, { align: 'center', maxWidth: contentWidth - 20 });
          }
          yPosition += cardHeight + 4;
        });
      }

      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.setFont('helvetica', 'italic');
      doc.text(`Generado el: ${new Date().toLocaleDateString('es-PE', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`, margin, pageHeight - 10);
      doc.save(`Mi_Horario_${tituloGrupo.replace(/\s+/g, '_')}_${Date.now()}.pdf`);
      Swal.fire({ title: '¡PDF Generado!', text: 'El horario se ha exportado correctamente', icon: 'success' });
    } catch (err) {
      console.error(err);
      Swal.fire({ title: 'Error', text: 'No se pudo generar el PDF', icon: 'error' });
    }
  };

  const cargarConducta = async (grupoId, ciclo) => {
    if (!grupoId) return;
    try {
      setLoadingConducta(true);
      const res = await api.get(`${apiPrefix}/grupos/${grupoId}/conducta`, { params: { ciclo } });
      setConductaAlumnos(res.data.alumnos || []);
      setConductaRango({
        desde: res.data.fecha_desde || '',
        hasta: res.data.fecha_hasta || '',
      });
    } catch (error) {
      console.error('Error cargando conducta:', error);
      Swal.fire({ icon: 'error', title: 'Error', text: error.response?.data?.error || 'No se pudieron cargar' });
      setConductaAlumnos([]);
    } finally {
      setLoadingConducta(false);
    }
  };

  const handleCambiarCicloConducta = (ciclo) => {
    setConductaCiclo(ciclo);
    setIncidenciasReporteCiclo(ciclo);
    if (grupoParaConducta) cargarConducta(grupoParaConducta.id, ciclo);
  };

  const handleRecalcularConducta = async () => {
    if (!grupoParaConducta) return;
    try {
      setRecalculandoConducta(true);
      const res = await api.post(`${apiPrefix}/grupos/${grupoParaConducta.id}/conducta`, {
        ciclo: conductaCiclo,
      });
      setConductaAlumnos(res.data.alumnos || []);
      setConductaRango({
        desde: res.data.fecha_desde || '',
        hasta: res.data.fecha_hasta || '',
      });
      Swal.fire({
        icon: 'success',
        title: 'Recalculado',
        text: 'Nota = 20 − incidencias del bimestre (máx. 20, mín. 0)',
        timer: 2200,
        showConfirmButton: false,
      });
    } catch (error) {
      console.error('Error recalculando conducta:', error);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: error.response?.data?.error || 'No se pudo recalcular',
      });
    } finally {
      setRecalculandoConducta(false);
    }
  };

  const exportarPDFConducta = async () => {
    if (!conductaAlumnos.length) {
      Swal.fire({ icon: 'info', title: 'Sin datos', text: 'No hay alumnos para exportar' });
      return;
    }
    const doc = new jsPDF('l', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 14;
    const rowH = 7;
    const footerReserve = 14;
    const yContentMax = pageHeight - footerReserve;
    const grupoNombre = grupoParaConducta ? `${grupoParaConducta.grado}° ${grupoParaConducta.seccion} - ${grupoParaConducta.nivel_nombre}` : '';
    const colorPrimario = [102, 126, 234];
    const colorBlanco = [255, 255, 255];

    try {
      const logoRes = await fetch('/icons/logoboleta.png');
      if (logoRes.ok) {
        const blob = await logoRes.blob();
        const dataUrl = await new Promise((res) => {
          const r = new FileReader();
          r.onloadend = () => res(r.result);
          r.readAsDataURL(blob);
        });
        doc.addImage(dataUrl, 'PNG', margin, 4, 24, 24);
      }
    } catch (e) { /* ignore */ }

    const dibujarBannerConducta = (esContinuacion) => {
      doc.setFillColor(...colorPrimario);
      doc.rect(0, 0, pageWidth, esContinuacion ? 22 : 32, 'F');
      doc.setFontSize(esContinuacion ? 11 : 14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...colorBlanco);
      doc.text(esContinuacion ? 'REGISTRO DE CONDUCTA (continúa)' : 'REGISTRO DE CONDUCTA', margin + (esContinuacion ? 4 : 30), esContinuacion ? 10 : 14);
      if (!esContinuacion) {
        doc.setFontSize(10);
        doc.setTextColor(240, 240, 240);
        doc.text(`Grupo: ${grupoNombre}  |  Bimestre: ${conductaCiclo}  |  Año: ${grupoParaConducta?.anio || ''}`, margin + 30, 22);
      }
    };

    const dibujarCabeceraTablaConducta = (yStart) => {
      let y = yStart;
      doc.setDrawColor(200, 200, 200);
      doc.setFillColor(234, 234, 234);
      doc.rect(margin, y, 18, 8, 'FD');
      doc.rect(margin + 18, y, pageWidth - 2 * margin - 70, 8, 'FD');
      doc.rect(pageWidth - margin - 52, y, 22, 8, 'FD');
      doc.rect(pageWidth - margin - 30, y, 30, 8, 'FD');
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(55, 65, 81);
      doc.text('N°', margin + 9, y + 5.5, { align: 'center' });
      doc.text('APELLIDOS Y NOMBRES', margin + 18 + (pageWidth - 2 * margin - 70) / 2, y + 5.5, { align: 'center' });
      doc.text('Incid.', pageWidth - margin - 41, y + 5.5, { align: 'center' });
      doc.text('NOTA', pageWidth - margin - 15, y + 5.5, { align: 'center' });
      y += 8;
      return y;
    };

    dibujarBannerConducta(false);
    let yPos = dibujarCabeceraTablaConducta(38);

    doc.setFont('helvetica', 'normal');
    conductaAlumnos.forEach((a, i) => {
      if (yPos + rowH > yContentMax) {
        doc.addPage();
        dibujarBannerConducta(true);
        yPos = dibujarCabeceraTablaConducta(26);
      }
      const zebra = i % 2 === 0 ? [248, 250, 252] : [255, 255, 255];
      doc.setFillColor(...zebra);
      doc.setDrawColor(220, 220, 220);
      doc.rect(margin, yPos, 18, rowH, 'FD');
      doc.rect(margin + 18, yPos, pageWidth - 2 * margin - 70, rowH, 'FD');
      doc.rect(pageWidth - margin - 52, yPos, 22, rowH, 'FD');
      doc.rect(pageWidth - margin - 30, yPos, 30, rowH, 'FD');
      doc.setTextColor(30, 41, 59);
      doc.text(String(i + 1), margin + 9, yPos + 4.5, { align: 'center' });
      doc.text((a.nombre_completo || '').slice(0, 72), margin + 21, yPos + 4.5);
      doc.text(String(a.total_incidencias ?? 0), pageWidth - margin - 41, yPos + 4.5, { align: 'center' });
      doc.text(a.nota_conducta || '20', pageWidth - margin - 15, yPos + 4.5, { align: 'center' });
      yPos += rowH;
    });

    const totalP = doc.internal.getNumberOfPages();
    const genTxt = `Generado: ${new Date().toLocaleString('es-PE')}`;
    for (let p = 1; p <= totalP; p += 1) {
      doc.setPage(p);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text(genTxt, margin, pageHeight - 6);
      doc.text(`Pág. ${p} / ${totalP}`, pageWidth - margin - 28, pageHeight - 6, { align: 'right' });
    }

    doc.save(`Conducta_${grupoNombre.replace(/\s+/g, '_')}_B${conductaCiclo}.pdf`);
    Swal.fire({
      icon: 'success',
      title: 'PDF generado',
      text: 'El reporte se descargó correctamente',
      timer: 2000,
      showConfirmButton: false,
    });
  };

  /** Reporte unificado: incidencias + presentación (vestimenta QR) por bimestre */
  const cerrarConductaLimpiando = () => {
    setMostrarModalConducta(false);
    setGrupoParaConducta(null);
    setConductaAlumnos([]);
    setConductaRango({ desde: '', hasta: '' });
    setModalIncidenciasGrupoAbierto(false);
    setDataIncidenciasPorAlumno([]);
    setDetalleConductaAlumno(null);
  };

  const paramsReporteIncidencias = (extra = {}) => {
    if (usarFiltroBimestreInc) {
      return { ciclo: incidenciasReporteCiclo, ...extra };
    }
    return { fecha_desde: fechaIncDesde, fecha_hasta: fechaIncHasta, ...extra };
  };

  const cargarReporteIncidenciasGrupo = async () => {
    if (!grupoParaConducta) return;
    setLoadingIncidenciasRep(true);
    try {
      const { data } = await api.get(`${apiPrefix}/grupos/${grupoParaConducta.id}/reporte-incidencias-grupo`, {
        params: paramsReporteIncidencias(),
      });
      setDataIncidenciasPorAlumno(data.alumnos || []);
      if (data.fecha_desde) setFechaIncDesde(data.fecha_desde);
      if (data.fecha_hasta) setFechaIncHasta(data.fecha_hasta);
      return data;
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'Error', text: e.response?.data?.error || 'No se pudieron cargar incidencias' });
      setDataIncidenciasPorAlumno([]);
    } finally {
      setLoadingIncidenciasRep(false);
    }
  };

  const abrirModalIncidenciasGrupo = async () => {
    setIncidenciasReporteCiclo(conductaCiclo);
    setUsarFiltroBimestreInc(true);
    setDetalleConductaAlumno(null);
    setModalIncidenciasGrupoAbierto(true);
    setLoadingIncidenciasRep(true);
    try {
      const { data } = await api.get(`${apiPrefix}/grupos/${grupoParaConducta.id}/reporte-incidencias-grupo`, {
        params: { ciclo: conductaCiclo },
      });
      setDataIncidenciasPorAlumno(data.alumnos || []);
      if (data.fecha_desde) setFechaIncDesde(data.fecha_desde);
      if (data.fecha_hasta) setFechaIncHasta(data.fecha_hasta);
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'Error', text: e.response?.data?.error || 'No se pudieron cargar incidencias' });
      setDataIncidenciasPorAlumno([]);
    } finally {
      setLoadingIncidenciasRep(false);
    }
  };

  const abrirDetalleConductaAlumno = async (alumno) => {
    if (!grupoParaConducta || !alumno?.matricula_id) return;
    setLoadingDetalleConducta(true);
    setDetalleConductaAlumno({
      alumno,
      incidencias: [],
      fecha_desde: conductaRango.desde,
      fecha_hasta: conductaRango.hasta,
    });
    try {
      const { data } = await api.get(`${apiPrefix}/grupos/${grupoParaConducta.id}/reporte-incidencias-grupo`, {
        params: { ciclo: conductaCiclo, matricula_id: alumno.matricula_id },
      });
      const bloque = (data.alumnos || [])[0] || { incidencias: [] };
      setDetalleConductaAlumno({
        alumno,
        incidencias: bloque.incidencias || [],
        fecha_desde: data.fecha_desde || conductaRango.desde,
        fecha_hasta: data.fecha_hasta || conductaRango.hasta,
      });
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'Error', text: e.response?.data?.error || 'No se pudo cargar el detalle' });
      setDetalleConductaAlumno(null);
    } finally {
      setLoadingDetalleConducta(false);
    }
  };

  const aplicarFiltrosIncidenciasYResumen = async () => {
    await cargarReporteIncidenciasGrupo();
  };

  const exportPdfIncidenciasGrupoReporte = () => {
    if (!grupoParaConducta || !dataIncidenciasPorAlumno?.length) {
      Swal.fire({ icon: 'info', title: 'Sin registros', text: 'No hay incidencias ni descuentos por presentación en el periodo.' });
      return;
    }
    const doc = new jsPDF('p', 'mm', 'a4');
    const pw = doc.internal.pageSize.getWidth();
    const ph = doc.internal.pageSize.getHeight();
    const mm = 14;
    const innerW = pw - 2 * mm;
    const footerReserve = 12;
    const yBottom = () => ph - footerReserve;
    const lineStep = 4;
    const tituloGrupo = `${grupoParaConducta.grado}° ${grupoParaConducta.seccion} - ${grupoParaConducta.nivel_nombre}`;
    const periodoTxt = usarFiltroBimestreInc
      ? `Bimestre ${incidenciasReporteCiclo} · ${formatearSoloFecha(fechaIncDesde)} → ${formatearSoloFecha(fechaIncHasta)}`
      : `Periodo: ${formatearSoloFecha(fechaIncDesde)} → ${formatearSoloFecha(fechaIncHasta)}`;

    const paletasInc = [
      { f: [250, 245, 255], b: [216, 180, 254], t: [107, 33, 168] },
      { f: [239, 246, 255], b: [165, 180, 252], t: [67, 56, 202] },
      { f: [255, 247, 237], b: [251, 207, 232], t: [157, 23, 77] },
      { f: [240, 253, 250], b: [153, 246, 228], t: [15, 118, 110] },
      { f: [254, 252, 232], b: [253, 224, 71], t: [113, 63, 18] },
      { f: [248, 250, 252], b: [203, 213, 225], t: [51, 65, 85] },
    ];

    let y = 0;
    const pintarCabeceraPrincipalInc = () => {
      doc.setFillColor(243, 232, 255);
      doc.rect(0, 0, pw, 28, 'F');
      doc.setDrawColor(192, 132, 252);
      doc.setLineWidth(0.4);
      doc.rect(0, 0, pw, 28, 'S');
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(91, 33, 182);
      doc.text('Incidencias y presentación (tutoría)', mm + 2, 11);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(88, 28, 135);
      doc.text(`${tituloGrupo} · Año ${grupoParaConducta.anio || ''}`, mm + 2, 18);
      doc.setTextColor(71, 85, 105);
      doc.text(periodoTxt, mm + 2, 24);
      y = 34;
    };

    const nuevaPaginaInc = () => {
      doc.addPage();
      doc.setFillColor(243, 232, 255);
      doc.rect(0, 0, pw, 16, 'F');
      doc.setDrawColor(192, 132, 252);
      doc.rect(0, 0, pw, 16, 'S');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(91, 33, 182);
      doc.text('Incidencias y presentación (continúa)', mm + 2, 9);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(71, 85, 105);
      doc.text(periodoTxt, mm + 2, 14);
      y = 20;
    };

    pintarCabeceraPrincipalInc();

    dataIncidenciasPorAlumno.forEach((al, idxAl) => {
      const pal = paletasInc[idxAl % paletasInc.length];
      const bloques = [];
      (al.incidencias || []).forEach((inc) => {
        const tipo = inc.origen === 'vestimenta' ? 'Presentación' : 'Incidencia';
        const cab = `${formatearFechaHoraPeru(inc.created_at)}  ·  ${tipo}  ·  ${inc.docente_nombre || '—'}  ·  ${inc.curso_nombre || '—'}`;
        const det = (inc.description || '').trim();
        const lineasCab = doc.splitTextToSize(cab, innerW - 10);
        const lineasDet = det ? doc.splitTextToSize(det, innerW - 10) : [];
        bloques.push({ lineasCab, lineasDet });
      });

      let alturaEst = 7;
      bloques.forEach((b) => {
        alturaEst += b.lineasCab.length * lineStep + 1 + b.lineasDet.length * lineStep + 3;
      });
      const pad = 5;
      const bloqueH = pad + alturaEst + pad;

      if (y + bloqueH > yBottom()) {
        nuevaPaginaInc();
      }

      const y0 = y;
      doc.setFillColor(...pal.f);
      doc.setDrawColor(...pal.b);
      doc.setLineWidth(0.25);
      doc.rect(mm, y0, innerW, bloqueH, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(...pal.t);
      doc.text(String(al.alumno_nombre || 'Alumno'), mm + pad, y0 + pad + 5);

      let yLine = y0 + pad + 8;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.3);
      bloques.forEach((b) => {
        doc.setTextColor(30, 41, 59);
        b.lineasCab.forEach((ln) => {
          if (yLine > y0 + bloqueH - pad) return;
          doc.text(ln, mm + pad + 2, yLine);
          yLine += lineStep;
        });
        doc.setTextColor(71, 85, 105);
        b.lineasDet.forEach((ln) => {
          if (yLine > y0 + bloqueH - pad) return;
          doc.text(ln, mm + pad + 3, yLine);
          yLine += lineStep;
        });
        yLine += 2;
      });

      y = y0 + bloqueH + 4;
    });

    const genTxt = `Generado: ${new Date().toLocaleString('es-PE')}`;
    const totalP = doc.internal.getNumberOfPages();
    for (let p = 1; p <= totalP; p += 1) {
      doc.setPage(p);
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text(genTxt, mm, ph - 5);
      doc.text(`Pág. ${p} / ${totalP}`, pw - mm, ph - 5, { align: 'right' });
    }

    doc.save(`${tituloGrupo.replace(/\s+/g, '_')}_incidencias_B${incidenciasReporteCiclo}.pdf`);
    Swal.fire({ icon: 'success', title: 'PDF generado', timer: 1800, showConfirmButton: false });
  };

  const exportarPDFAsistencia = async () => {
    if (!asistenciaAlumnos.length) {
      Swal.fire({ icon: 'info', title: 'Sin datos', text: 'No hay alumnos para exportar' });
      return;
    }
    const doc = new jsPDF('l', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 14;
    const grupoNombre = grupoParaAsistencias ? `${grupoParaAsistencias.grado}° ${grupoParaAsistencias.seccion} - ${grupoParaAsistencias.nivel_nombre}` : '';
    let yPos = 0;

    const colorPrimario = [102, 126, 234];
    const colorBlanco = [255, 255, 255];
    const colorGrisOscuro = [55, 65, 81];

    const dibujarHeader = async () => {
      yPos = 0;
      doc.setFillColor(...colorPrimario);
      doc.rect(0, 0, pageWidth, 32, 'F');

      try {
        const logoResponse = await fetch('/icons/logoboleta.png');
        if (logoResponse.ok) {
          const logoBlob = await logoResponse.blob();
          const logoReader = new FileReader();
          await new Promise((resolve) => {
            logoReader.onloadend = () => {
              try {
                doc.addImage(logoReader.result, 'PNG', margin, 4, 24, 24);
              } catch (e) { /* ignorar si falla */ }
              resolve();
            };
            logoReader.readAsDataURL(logoBlob);
          });
        }
      } catch (e) { /* continuar sin logo */ }

      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...colorBlanco);
      doc.text('REGISTRO DE ASISTENCIA', margin + 30, 14);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(240, 240, 240);
      doc.text(`Grupo: ${grupoNombre}  |  Fecha: ${asistenciaFecha}`, margin + 30, 22);

      yPos = 36;
      doc.setFillColor(234, 234, 234);
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.3);
      doc.rect(margin, yPos, 22, 10, 'FD');
      doc.rect(margin + 22, yPos, 125, 10, 'FD');
      doc.rect(margin + 147, yPos, 45, 10, 'FD');
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...colorGrisOscuro);
      doc.text('N°', margin + 11, yPos + 6.5, { align: 'center' });
      doc.text('APELLIDOS Y NOMBRES', margin + 84, yPos + 6.5, { align: 'center' });
      doc.text('REGISTRO', margin + 169, yPos + 6.5, { align: 'center' });
      yPos += 10;
    };

    await dibujarHeader();
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);

    for (let i = 0; i < asistenciaAlumnos.length; i++) {
      const a = asistenciaAlumnos[i];
      if (yPos + 8 > pageHeight - 18) {
        doc.addPage('l', 'a4');
        await dibujarHeader();
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
      }
      doc.setDrawColor(220, 220, 220);
      doc.rect(margin, yPos, 22, 7, 'S');
      doc.rect(margin + 22, yPos, 125, 7, 'S');
      doc.rect(margin + 147, yPos, 45, 7, 'S');
      doc.setTextColor(...colorGrisOscuro);
      doc.text(String(i + 1), margin + 11, yPos + 4.5, { align: 'center' });
      doc.text((a.nombre_completo || '').slice(0, 55), margin + 24, yPos + 4.5);
      const tipoTexto = a.tipo ? a.tipo.replace(/_/g, ' ') : '-';
      if (a.tipo === 'FALTA' || a.tipo === 'FALTA_JUSTIFICADA') {
        doc.setTextColor(185, 28, 28);
      }
      doc.text(tipoTexto, margin + 169, yPos + 4.5, { align: 'center' });
      doc.setTextColor(...colorGrisOscuro);
      yPos += 7;
    }

    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(`Generado: ${new Date().toLocaleString('es-PE')}`, margin, pageHeight - 8);
    const fechaFormato = new Date(asistenciaFecha).toLocaleDateString('es-PE');
    doc.save(`Asistencia_${grupoNombre.replace(/\s+/g, '_')}_${fechaFormato.replace(/\//g, '-')}.pdf`);
    Swal.fire({ icon: 'success', title: 'PDF generado', text: 'El reporte se descargó correctamente', timer: 2000, showConfirmButton: false });
  };

  // Cargar cursos del grupo
  const handleVerCursos = async (grupo) => {
    try {
      setLoadingCursos(true);
      setGrupoSeleccionadoCursos(grupo);
      
      // Cargar cursos del grupo
      const response = await api.get(`${apiPrefix}/grupos/${grupo.id}/cursos`);
      const cursosOrdenados = (response.data.cursos || []).sort((a, b) => {
        const nombreA = (a.curso_nombre || '').toLowerCase();
        const nombreB = (b.curso_nombre || '').toLowerCase();
        return nombreA.localeCompare(nombreB);
      });
      setCursos(cursosOrdenados);
      setMostrarCursos(true);
    } catch (error) {
      console.error('Error cargando cursos:', error);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: error.response?.data?.error || 'No se pudieron cargar los cursos',
        confirmButtonText: 'Entendido'
      });
    } finally {
      setLoadingCursos(false);
    }
  };

  // Navegar al aula virtual (modo solo lectura para tutor)
  const handleAulaVirtual = (curso) => {
    if (grupoSeleccionadoCursos && curso.asignatura_id) {
      // Navegar a una ruta especial para tutores (modo solo lectura)
      // Pasamos estado de retorno para reabrir "Cursos Asignados" al volver.
      navigate(`${apiPrefix}/grupos/${grupoSeleccionadoCursos.id}/aula-virtual/${curso.asignatura_id}?modo=solo-lectura`, {
        state: {
          returnTo: basePath,
          reopenCursos: true,
          grupoId: grupoSeleccionadoCursos.id
        }
      });
    } else {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'No se ha seleccionado un grupo o el curso no tiene asignatura_id',
        confirmButtonText: 'Entendido'
      });
    }
  };

  // Restaurar "Cursos Asignados" al volver desde Aula Virtual del tutor
  useEffect(() => {
    const state = location.state;
    if (!state?.reopenCursos || !state?.grupoId || gruposTutor.length === 0) return;
    const grupo = gruposTutor.find((g) => Number(g.id) === Number(state.grupoId));
    if (!grupo) return;
    handleVerCursos(grupo);
    navigate(basePath, { replace: true, state: null });
  }, [location.state, gruposTutor]);

  // Abrir modal para enviar mensaje al docente
  const handleEnviarMensajeDocente = (curso) => {
    const docenteData = {
      id: curso.docente_usuario_id || curso.docente_id,
      nombre: curso.docente_nombre,
      curso_nombre: curso.curso_nombre
    };
    setDocenteParaMensaje(docenteData);
    setMostrarModalMensajeDocente(true);
  };

  // Manejar cambio de archivos adjuntos para mensaje al docente
  const handleArchivoChangeMensajeDocente = (e) => {
    const archivos = Array.from(e.target.files);
    setArchivosAdjuntosMensajeDocente([...archivosAdjuntosMensajeDocente, ...archivos]);
    e.target.value = '';
  };

  // Eliminar archivo adjunto
  const eliminarArchivoMensajeDocente = (index) => {
    setArchivosAdjuntosMensajeDocente(archivosAdjuntosMensajeDocente.filter((_, i) => i !== index));
  };

  // Enviar mensaje al docente
  const enviarMensajeAlDocente = async () => {
    if (!docenteParaMensaje) {
      Swal.fire('Error', 'No se ha seleccionado un docente', 'error');
      return;
    }

    if (!asuntoMensajeDocente.trim()) {
      Swal.fire('Error', 'El asunto es requerido', 'error');
      return;
    }

    const contenidoLimpio = contenidoMensajeDocente.replace(/<[^>]*>/g, '').trim();
    if (!contenidoLimpio) {
      Swal.fire('Error', 'El mensaje es requerido', 'error');
      return;
    }

    if (enviandoMensajeDocente) {
      return;
    }

    setEnviandoMensajeDocente(true);

    try {
      const formData = new FormData();
      formData.append('destinatarios', JSON.stringify([docenteParaMensaje.id]));
      formData.append('asunto', asuntoMensajeDocente.trim());
      formData.append('mensaje', contenidoMensajeDocente);

      archivosAdjuntosMensajeDocente.forEach((archivo) => {
        formData.append('archivos', archivo);
      });

      const response = await api.post('/docente/mensajes/enviar', formData, {
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
      
      setAsuntoMensajeDocente('');
      setContenidoMensajeDocente('');
      setArchivosAdjuntosMensajeDocente([]);
      setMostrarModalMensajeDocente(false);
      setDocenteParaMensaje(null);
    } catch (error) {
      console.error('Error enviando mensaje:', error);
      Swal.fire('Error', error.response?.data?.error || 'Error al enviar el mensaje', 'error');
    } finally {
      setEnviandoMensajeDocente(false);
    }
  };

  // Obtener usuario_id del alumno (necesario para enviar mensaje)
  const obtenerUsuarioDelAlumno = async (alumnoId) => {
    try {
      const response = await api.get(`/docente/mensajes/alumno/${alumnoId}/usuario`);
      return response.data.usuario?.usuario_id || null;
    } catch (error) {
      console.error('Error obteniendo usuario del alumno:', error);
      return null;
    }
  };

  // Manejar selección de archivos para mensaje al grupo
  const handleArchivoChangeMensajeGrupo = (e) => {
    const files = Array.from(e.target.files);
    setArchivosAdjuntosMensajeGrupo([...archivosAdjuntosMensajeGrupo, ...files]);
  };

  // Eliminar archivo adjunto del mensaje al grupo
  const eliminarArchivoMensajeGrupo = (index) => {
    setArchivosAdjuntosMensajeGrupo(archivosAdjuntosMensajeGrupo.filter((_, i) => i !== index));
  };

  // Manejar selección de archivos para mensaje a alumno
  const handleArchivoChangeMensajeAlumno = (e) => {
    const files = Array.from(e.target.files);
    setArchivosAdjuntosMensajeAlumno([...archivosAdjuntosMensajeAlumno, ...files]);
  };

  // Eliminar archivo adjunto del mensaje a alumno
  const eliminarArchivoMensajeAlumno = (index) => {
    setArchivosAdjuntosMensajeAlumno(archivosAdjuntosMensajeAlumno.filter((_, i) => i !== index));
  };

  // Manejar selección de archivos para mensaje a apoderados
  const handleArchivoChangeMensajeApoderados = (e) => {
    const files = Array.from(e.target.files);
    setArchivosAdjuntosMensajeApoderados([...archivosAdjuntosMensajeApoderados, ...files]);
  };

  // Eliminar archivo adjunto del mensaje a apoderados
  const eliminarArchivoMensajeApoderados = (index) => {
    setArchivosAdjuntosMensajeApoderados(archivosAdjuntosMensajeApoderados.filter((_, i) => i !== index));
  };

  // Cerrar modal mensaje apoderados y reset
  const cerrarModalMensajeApoderados = () => {
    setMostrarModalMensajeApoderados(false);
    setAlumnoParaMensajeApoderados(null);
    setDestinatariosApoderadosPreview([]);
    setUsuarioIdsApoderadosMensaje([]);
    setAsuntoMensajeApoderados('');
    setContenidoMensajeApoderados('');
    setArchivosAdjuntosMensajeApoderados([]);
  };

  // Abrir modal: cargar apoderados con cuenta activa (incluye docentes que también son apoderados)
  const abrirModalMensajeApoderados = async (alumno) => {
    if (!alumno) return;

    setCargandoDestinatariosApoderados(true);
    try {
      // Siempre limpiar formularios al abrir
      setAlumnoParaMensajeApoderados(alumno);
      setDestinatariosApoderadosPreview([]);
      setUsuarioIdsApoderadosMensaje([]);
      setAsuntoMensajeApoderados('');
      setContenidoMensajeApoderados('');
      setArchivosAdjuntosMensajeApoderados([]);

      const response = await api.get(`/docente/mensajes/alumno/${alumno.id}/apoderados-destinatarios`);
      const lista = response.data.destinatarios || [];

      if (!lista.length) {
        Swal.fire({
          icon: 'info',
          title: 'Sin apoderados con cuenta activa',
          text: 'No se encontraron apoderados vinculados con usuario activo para este alumno.',
          confirmButtonText: 'Entendido',
        });
        return;
      }

      setDestinatariosApoderadosPreview(lista);
      setUsuarioIdsApoderadosMensaje(lista.map((d) => d.usuario_id));
      setMostrarModalMensajeApoderados(true);
    } catch (error) {
      console.error('Error cargando apoderados destinatarios:', error);
      Swal.fire('Error', error.response?.data?.error || 'No se pudo cargar apoderados', 'error');
    } finally {
      setCargandoDestinatariosApoderados(false);
    }
  };

  // Enviar mensaje exclusivo a apoderados del alumno
  const enviarMensajeApoderadosAlumno = async () => {
    if (!alumnoParaMensajeApoderados) {
      Swal.fire('Error', 'No se ha seleccionado un alumno', 'error');
      return;
    }

    if (!asuntoMensajeApoderados.trim()) {
      Swal.fire('Error', 'El asunto es requerido', 'error');
      return;
    }

    const contenidoLimpio = contenidoMensajeApoderados.replace(/<[^>]*>/g, '').trim();
    if (!contenidoLimpio) {
      Swal.fire('Error', 'El mensaje es requerido', 'error');
      return;
    }

    if (enviandoMensajeApoderados) return;

    if (!usuarioIdsApoderadosMensaje.length) {
      Swal.fire('Error', 'No hay destinatarios (apoderados)', 'error');
      return;
    }

    setEnviandoMensajeApoderados(true);
    try {
      const formData = new FormData();
      formData.append('destinatarios', JSON.stringify(usuarioIdsApoderadosMensaje));
      formData.append('grupos', JSON.stringify([]));
      // Asegurar que si un apoderado también es docente (mismo usuario), aparezca en la bandeja DOCENTE también
      formData.append('expand_apoderados_roles', 'true');
      if (alumnoParaMensajeApoderados?.id) {
        formData.append('contexto_alumno_id', String(alumnoParaMensajeApoderados.id));
      }
      const grupoCtxId =
        typeof selectedGrupo === 'object' && selectedGrupo !== null ? selectedGrupo.id : selectedGrupo;
      if (grupoCtxId != null && grupoCtxId !== '') {
        formData.append('contexto_grupo_id', String(grupoCtxId));
      }
      formData.append('mensaje_desde_tutoria', 'true');
      formData.append('asunto', asuntoMensajeApoderados.trim());
      formData.append('mensaje', contenidoMensajeApoderados);

      archivosAdjuntosMensajeApoderados.forEach((archivo) => {
        formData.append('archivos', archivo);
      });

      await api.post('/docente/mensajes/enviar', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      Swal.fire({
        title: '¡Mensaje enviado!',
        html: `Se envió a <strong>${usuarioIdsApoderadosMensaje.length}</strong> apoderado(s) vinculados a <strong>${alumnoParaMensajeApoderados.apellido_paterno} ${alumnoParaMensajeApoderados.apellido_materno}, ${alumnoParaMensajeApoderados.nombres}</strong>.`,
        icon: 'success',
        confirmButtonText: 'Aceptar',
      });

      cerrarModalMensajeApoderados();
    } catch (error) {
      console.error('Error enviando mensaje a apoderados:', error);
      Swal.fire('Error', error.response?.data?.error || 'Error al enviar el mensaje', 'error');
    } finally {
      setEnviandoMensajeApoderados(false);
    }
  };

  // Enviar mensaje al grupo
  const enviarMensajeAlGrupo = async () => {
    if (!grupoParaMensaje) {
      Swal.fire('Error', 'No se ha seleccionado un grupo', 'error');
      return;
    }

    if (!asuntoMensajeGrupo.trim()) {
      Swal.fire('Error', 'El asunto es requerido', 'error');
      return;
    }

    // Verificar que el contenido no esté vacío (sin HTML vacío)
    const contenidoLimpio = contenidoMensajeGrupo.replace(/<[^>]*>/g, '').trim();
    if (!contenidoLimpio) {
      Swal.fire('Error', 'El mensaje es requerido', 'error');
      return;
    }

    // Prevenir doble envío
    if (enviandoMensajeGrupo) {
      return;
    }

    setEnviandoMensajeGrupo(true);

    try {
      // Crear FormData para enviar archivos
      const formData = new FormData();
      formData.append('destinatarios', JSON.stringify([])); // Sin destinatarios directos
      formData.append('grupos', JSON.stringify([grupoParaMensaje.id])); // Enviar al grupo
      formData.append('alcance', 'grupos');
      formData.append('asunto', asuntoMensajeGrupo.trim());
      formData.append('mensaje', contenidoMensajeGrupo);
      formData.append('enviar_a', enviarAMensajeGrupo);
      formData.append('mensaje_desde_tutoria', 'true');

      // Agregar archivos
      archivosAdjuntosMensajeGrupo.forEach((archivo) => {
        formData.append('archivos', archivo);
      });

      console.log(`📎 [TUTORIA-ENVIAR MENSAJE GRUPO] Enviando mensaje al grupo ID: ${grupoParaMensaje.id}`);
      console.log(`📎 [TUTORIA-ENVIAR MENSAJE GRUPO] Contenido HTML (primeros 500 caracteres):`, contenidoMensajeGrupo.substring(0, 500));
      console.log(`📎 [TUTORIA-ENVIAR MENSAJE GRUPO] ¿Contiene imágenes?:`, contenidoMensajeGrupo.includes('<img'));
      const response = await api.post('/docente/mensajes/enviar', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      Swal.fire({
        title: '¡Mensaje Enviado!',
        text: response.data.message || 'El mensaje se ha enviado correctamente al grupo',
        icon: 'success',
        confirmButtonText: 'Aceptar'
      });
      
      // Limpiar formulario y cerrar modal
      setAsuntoMensajeGrupo('');
      setContenidoMensajeGrupo('');
      setArchivosAdjuntosMensajeGrupo([]);
      setEnviarAMensajeGrupo('todos');
      setMostrarModalMensajeGrupo(false);
      setGrupoParaMensaje(null);
    } catch (error) {
      console.error('Error enviando mensaje:', error);
      Swal.fire('Error', error.response?.data?.error || 'Error al enviar el mensaje', 'error');
    } finally {
      setEnviandoMensajeGrupo(false);
    }
  };

  // Enviar mensaje a alumno individual
  const enviarMensajeAlAlumno = async () => {
    if (!alumnoParaMensaje) {
      Swal.fire('Error', 'No se ha seleccionado un alumno', 'error');
      return;
    }

    if (!asuntoMensajeAlumno.trim()) {
      Swal.fire('Error', 'El asunto es requerido', 'error');
      return;
    }

    // Verificar que el contenido no esté vacío (sin HTML vacío)
    const contenidoLimpio = contenidoMensajeAlumno.replace(/<[^>]*>/g, '').trim();
    if (!contenidoLimpio) {
      Swal.fire('Error', 'El mensaje es requerido', 'error');
      return;
    }

    // Prevenir doble envío
    if (enviandoMensajeAlumno) {
      return;
    }

    setEnviandoMensajeAlumno(true);

    try {
      // Obtener usuario_id del alumno
      const usuarioId = await obtenerUsuarioDelAlumno(alumnoParaMensaje.id);
      
      if (!usuarioId) {
        Swal.fire('Error', 'No se pudo obtener el usuario del alumno. El alumno puede no tener una cuenta activa.', 'error');
        setEnviandoMensajeAlumno(false);
        return;
      }

      // Crear FormData para enviar archivos
      const formData = new FormData();
      formData.append('destinatarios', JSON.stringify([usuarioId])); // Enviar al alumno
      formData.append('grupos', JSON.stringify([])); // Sin grupos
      formData.append('asunto', asuntoMensajeAlumno.trim());
      formData.append('mensaje', contenidoMensajeAlumno);

      // Agregar archivos
      archivosAdjuntosMensajeAlumno.forEach((archivo) => {
        formData.append('archivos', archivo);
      });

      console.log(`📎 [TUTORIA-ENVIAR MENSAJE ALUMNO] Contenido HTML (primeros 500 caracteres):`, contenidoMensajeAlumno.substring(0, 500));
      console.log(`📎 [TUTORIA-ENVIAR MENSAJE ALUMNO] ¿Contiene imágenes?:`, contenidoMensajeAlumno.includes('<img'));
      const response = await api.post('/docente/mensajes/enviar', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      Swal.fire({
        title: '¡Mensaje Enviado!',
        text: response.data.message || 'El mensaje se ha enviado correctamente al alumno',
        icon: 'success',
        confirmButtonText: 'Aceptar'
      });
      
      // Limpiar formulario y cerrar modal
      setAsuntoMensajeAlumno('');
      setContenidoMensajeAlumno('');
      setArchivosAdjuntosMensajeAlumno([]);
      setMostrarModalMensajeAlumno(false);
      setAlumnoParaMensaje(null);
    } catch (error) {
      console.error('Error enviando mensaje:', error);
      Swal.fire('Error', error.response?.data?.error || 'Error al enviar el mensaje', 'error');
    } finally {
      setEnviandoMensajeAlumno(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="docente-tutoria-loading">
          <div className="loading-spinner">Cargando...</div>
        </div>
      </DashboardLayout>
    );
  }

  if (!esTutor) {
    return (
      <DashboardLayout>
        <div className="docente-tutoria">
          <div className="no-tutor mundo-card">
            <h2>No eres tutor</h2>
            <p>No estás asignado como tutor de ningún grupo en el año académico actual.</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // Vista de Cursos Asignados
  if (mostrarCursos) {
  return (
    <DashboardLayout>
        <div className="alumno-cursos">
          <div className="page-header">
            <div className="header-content">
              <div>
                <h1>📚 Cursos Asignados</h1>
                <p>Cursos del grupo {grupoSeleccionadoCursos?.nombre}</p>
              </div>
              <button 
                className="btn-volver"
                onClick={() => {
                  // Guardar el ID del grupo antes de limpiar el estado
                  const grupoIdCursos = grupoSeleccionadoCursos?.id;
                  
                  // Limpiar todos los estados relacionados con cursos
                  setMostrarCursos(false);
                  setGrupoSeleccionadoCursos(null);
                  setCursos([]);
                  setLoadingCursos(false);
                  
                  // Limpiar selectedGrupo solo si corresponde al grupo de cursos
                  // Esto evita que se pierda el estado si hay otra vista activa
                  if (grupoIdCursos) {
                    if (selectedGrupo && typeof selectedGrupo === 'object' && selectedGrupo.id === grupoIdCursos) {
                      setSelectedGrupo(null);
                      setGrupoInfo(null);
                    } else if (selectedGrupo === grupoIdCursos) {
                      // Si selectedGrupo es solo el ID
                      setSelectedGrupo(null);
                      setGrupoInfo(null);
                    }
                  }
                }}
                type="button"
              >
                ← Volver
              </button>
            </div>
          </div>

          {loadingCursos ? (
            <div className="alumno-cursos-loading">
              <div className="loading-spinner">Cargando cursos...</div>
            </div>
          ) : cursos.length > 0 ? (
            <div className="cursos-grid">
              {cursos.map((curso, index) => {
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
                      
                      {/* Nombre del docente */}
                      <div className="curso-docente-nombre">
                        <span className="docente-nombre-text">{curso.docente_nombre || 'Sin docente asignado'}</span>
                      </div>
                      
                      {/* Nombre del curso */}
                      <h3 className="curso-nombre-alumno">{curso.curso_nombre}</h3>

                      {/* Botones de acción */}
                      <div className="curso-actions-alumno">
                        <button
                          className="btn-aula-virtual"
                          onClick={() => handleAulaVirtual(curso)}
                        >
                          🎓 Aula Virtual
                        </button>
                        <button
                          className="btn-enviar-mensaje"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleEnviarMensajeDocente(curso);
                          }}
                          type="button"
                        >
                          ✉️ Enviar Mensaje
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="empty-state mundo-card">
              <div className="empty-icon">📚</div>
              <p>No hay cursos asignados para este grupo</p>
            </div>
          )}

          {/* Modal de Enviar Mensaje al Docente */}
          {mostrarModalMensajeDocente && docenteParaMensaje && createPortal(
            <div 
              className="modal-mensaje-overlay" 
              onClick={() => {
                setMostrarModalMensajeDocente(false);
                setAsuntoMensajeDocente('');
                setContenidoMensajeDocente('');
                setArchivosAdjuntosMensajeDocente([]);
                setDocenteParaMensaje(null);
              }}
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
                      setMostrarModalMensajeDocente(false);
                      setAsuntoMensajeDocente('');
                      setContenidoMensajeDocente('');
                      setArchivosAdjuntosMensajeDocente([]);
                      setDocenteParaMensaje(null);
                    }}
                    type="button"
                    aria-label="Cerrar modal"
                  >
                    ✕
                  </button>
                </div>

                <div className="modal-mensaje-body">
                  <div className="mensaje-grupo-info">
                    <p><strong>Docente:</strong> {docenteParaMensaje.nombre}</p>
                    <p><strong>Curso:</strong> {docenteParaMensaje.curso_nombre}</p>
                    <p className="mensaje-info-text">El mensaje se enviará directamente al docente</p>
                  </div>

                  <div className="form-group">
                    <label htmlFor="asunto-mensaje-docente-tutoria">Asunto:</label>
                    <input
                      type="text"
                      id="asunto-mensaje-docente-tutoria"
                      name="asunto-mensaje-docente-tutoria"
                      className="form-input"
                      value={asuntoMensajeDocente}
                      onChange={(e) => setAsuntoMensajeDocente(e.target.value)}
                      placeholder="Asunto del mensaje"
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="mensaje-editor-docente-tutoria">Mensaje:</label>
                    <div id="mensaje-editor-wrapper-docente-tutoria">
                      <ReactQuill
                        ref={quillRefMensajeDocente}
                        theme="snow"
                        value={contenidoMensajeDocente}
                        onChange={setContenidoMensajeDocente}
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

                  <div className="form-group">
                    <label htmlFor="archivos-input-docente-tutoria">Archivos Adjuntos:</label>
                    <div className="archivos-container">
                      <input
                        type="file"
                        id="archivos-input-docente-tutoria"
                        name="archivos-docente-tutoria"
                        multiple
                        onChange={handleArchivoChangeMensajeDocente}
                        style={{ display: 'none' }}
                      />
                      <label htmlFor="archivos-input-docente-tutoria" className="btn-adjuntar-archivo">
                        📎 Adjuntar Archivos
                      </label>
                      {archivosAdjuntosMensajeDocente.length > 0 && (
                        <div className="archivos-list">
                          {archivosAdjuntosMensajeDocente.map((archivo, index) => (
                            <div key={index} className="archivo-item">
                              <span className="archivo-nombre">{archivo.name}</span>
                              <button
                                type="button"
                                className="btn-eliminar-archivo"
                                onClick={() => eliminarArchivoMensajeDocente(index)}
                              >
                                ✕
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="modal-mensaje-footer">
                    <button
                      className="btn-cancelar"
                      onClick={() => {
                        setMostrarModalMensajeDocente(false);
                        setAsuntoMensajeDocente('');
                        setContenidoMensajeDocente('');
                        setArchivosAdjuntosMensajeDocente([]);
                        setDocenteParaMensaje(null);
                      }}
                      type="button"
                    >
                      Cancelar
                    </button>
                    <button
                      className="btn-enviar"
                      onClick={enviarMensajeAlDocente}
                      disabled={enviandoMensajeDocente}
                      type="button"
                    >
                      {enviandoMensajeDocente ? 'Enviando...' : 'Enviar Mensaje'}
                    </button>
                  </div>
                </div>
              </div>
            </div>,
            document.body
          )}
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      {/* Modal de Registro de Asistencia - siempre disponible */}
      {mostrarModalAsistencias && grupoParaAsistencias && createPortal(
        <div
          className="modal-registro-asistencia-overlay"
          onClick={() => {
            setMostrarModalAsistencias(false);
            setGrupoParaAsistencias(null);
            setAsistenciaAlumnos([]);
          }}
        >
          <div
            className="modal-registro-asistencia-container"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-asistencia-title"
          >
            <div className="modal-registro-asistencia-header">
              <h2 id="modal-asistencia-title">📋 Registro de Asistencia</h2>
              <button
                className="modal-registro-asistencia-close"
                onClick={() => {
                  setMostrarModalAsistencias(false);
                  setGrupoParaAsistencias(null);
                  setAsistenciaAlumnos([]);
                }}
                type="button"
                aria-label="Cerrar modal"
              >
                ✕
              </button>
            </div>
            <div className="modal-registro-asistencia-filters">
              <label htmlFor="asistencia-fecha">Seleccione Fecha:</label>
              <input
                id="asistencia-fecha"
                type="date"
                value={asistenciaFecha}
                onChange={(e) => handleCambiarFechaAsistencia(e.target.value)}
                disabled={loadingAsistencias}
              />
              <button
                type="button"
                className="btn-imprimir-asistencia"
                onClick={exportarPDFAsistencia}
                disabled={loadingAsistencias || !asistenciaAlumnos.length}
              >
                🖨️ Imprimir Asistencia
              </button>
            </div>
            <div className="modal-registro-asistencia-table-wrap">
              {loadingAsistencias ? (
                <div className="modal-registro-asistencia-loading">
                  <div className="loading-spinner" />
                  <p>Cargando asistencias...</p>
                </div>
              ) : (
                <table className="tabla-registro-asistencia">
                  <thead>
                    <tr>
                      <th style={{ width: 50 }}>N°</th>
                      <th>APELLIDOS Y NOMBRES</th>
                      <th style={{ textAlign: 'center', minWidth: 380 }}>REGISTRO</th>
                    </tr>
                  </thead>
                  <tbody>
                    {asistenciaAlumnos.map((alumno) => (
                      <tr key={alumno.matricula_id}>
                        <td style={{ textAlign: 'center', fontWeight: 600 }}>{alumno.numero}</td>
                        <td>{alumno.nombre_completo}</td>
                        <td>
                          <div className="botones-asistencia-row">
                            {[
                              { tipo: 'PRESENTE', clase: 'btn-presente', label: 'Presente' },
                              { tipo: 'TARDANZA', clase: 'btn-tardanza', label: 'Tardanza' },
                              { tipo: 'TARDANZA_JUSTIFICADA', clase: 'btn-tj', label: 'TJ' },
                              { tipo: 'FALTA', clase: 'btn-falta', label: 'Falta' },
                              { tipo: 'FALTA_JUSTIFICADA', clase: 'btn-fj', label: 'FJ' }
                            ].map(({ tipo, clase, label }) => {
                              const isActive = alumno.tipo === tipo;
                              return (
                                <button
                                  key={tipo}
                                  type="button"
                                  className={`btn-asistencia-tipo ${clase} ${isActive ? 'active' : ''}`}
                                  disabled={soloLectura || guardandoAsistencia === alumno.matricula_id}
                                  onClick={() => handleAsistenciaClick(alumno.matricula_id, tipo)}
                                >
                                  {label}
                                </button>
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            {!soloLectura && (
            <div className="modal-registro-asistencia-footer">
              <button
                type="button"
                className="btn-guardar-asistencias"
                onClick={handleGuardarAsistencias}
                disabled={loadingAsistencias}
              >
                {loadingAsistencias ? 'Guardando...' : 'Guardar (marcar sin registro como Falta)'}
              </button>
            </div>
            )}
          </div>
        </div>,
        document.body
      )}

      <TutoriaModalDeudores
        open={mostrarModalDeudores}
        grupo={grupoParaDeudores}
        apiPrefix={apiPrefix}
        soloLectura={soloLectura}
        onClose={() => {
          setMostrarModalDeudores(false);
          setGrupoParaDeudores(null);
        }}
      />

      {/* Modal Recomendaciones */}
      {mostrarModalRecomendaciones && grupoParaRecomendaciones && createPortal(
        <div className="modal-registro-asistencia-overlay" onClick={() => { setMostrarModalRecomendaciones(false); setGrupoParaRecomendaciones(null); setRecomendacionesAlumnos([]); }}>
          <div className="modal-registro-asistencia-container" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="modal-registro-asistencia-header">
              <h2>💬 Apreciaciones / Recomendaciones</h2>
              <button className="modal-registro-asistencia-close" onClick={() => { setMostrarModalRecomendaciones(false); setGrupoParaRecomendaciones(null); setRecomendacionesAlumnos([]); }} type="button">✕</button>
            </div>
            <div className="modal-registro-asistencia-filters">
              <label>Bimestre:</label>
              <select value={recomendacionesCiclo} onChange={(e) => handleCambiarCicloRecomendaciones(parseInt(e.target.value))} disabled={loadingRecomendaciones} style={{ padding: '0.5rem 1rem', border: '2px solid #e5e7eb', borderRadius: 8, fontSize: '1rem', background: 'white', minWidth: 100 }}>
                {[1, 2, 3, 4].map(b => <option key={b} value={b}>Bimestre {b}</option>)}
              </select>
              <button type="button" className="btn-imprimir-asistencia" onClick={exportarPDFRecomendaciones} disabled={loadingRecomendaciones || !recomendacionesAlumnos.length}>🖨️ Exportar PDF</button>
            </div>
            <div className="modal-registro-asistencia-table-wrap">
              {loadingRecomendaciones ? (
                <div className="modal-registro-asistencia-loading"><div className="loading-spinner" /><p>Cargando...</p></div>
              ) : (
                <table className="tabla-registro-asistencia">
                  <thead><tr><th style={{ width: 50 }}>N°</th><th>APELLIDOS Y NOMBRES</th><th>RECOMENDACIÓN</th></tr></thead>
                  <tbody>
                    {recomendacionesAlumnos.map(a => (
                      <tr key={a.matricula_id}>
                        <td style={{ textAlign: 'center', fontWeight: 600 }}>{a.numero}</td>
                        <td>{a.nombre_completo}</td>
                        <td><textarea className="input-recomendacion" value={a.recomendacion || ''} onChange={(e) => handleRecomendacionChange(a.matricula_id, e.target.value)} rows={3} placeholder="Escribe la recomendación..." readOnly={soloLectura} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            {!soloLectura && (
            <div className="modal-registro-asistencia-footer">
              <button type="button" className="btn-guardar-asistencias" onClick={handleGuardarRecomendaciones} disabled={loadingRecomendaciones || guardandoRecomendaciones}>{guardandoRecomendaciones ? 'Guardando...' : 'Guardar Datos'}</button>
            </div>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* Modal Conducta (automática) */}
      {mostrarModalConducta && grupoParaConducta && createPortal(
        <div className="modal-registro-asistencia-overlay" onClick={cerrarConductaLimpiando}>
          <div className="modal-registro-asistencia-container" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="modal-registro-asistencia-header">
              <h2>📝 Conducta del bimestre</h2>
              <button className="modal-registro-asistencia-close" onClick={cerrarConductaLimpiando} type="button">✕</button>
            </div>
            <div className="modal-registro-asistencia-filters modal-registro-asistencia-filters--wrap">
              <label>Bimestre:</label>
              <select value={conductaCiclo} onChange={(e) => handleCambiarCicloConducta(parseInt(e.target.value))} disabled={loadingConducta} style={{ padding: '0.5rem 1rem', border: '2px solid #e5e7eb', borderRadius: 8, fontSize: '1rem', background: 'white', minWidth: 100 }}>
                {[1, 2, 3, 4].map(b => <option key={b} value={b}>Bimestre {b}</option>)}
              </select>
              {(conductaRango.desde || conductaRango.hasta) && (
                <span className="conducta-rango-hint">
                  {formatearSoloFecha(conductaRango.desde)} → {formatearSoloFecha(conductaRango.hasta)}
                </span>
              )}
              <button type="button" className="btn-imprimir-asistencia" onClick={exportarPDFConducta} disabled={loadingConducta || !conductaAlumnos.length}>🖨️ Exportar PDF</button>
              <button type="button" className="btn-tutor-evid-incidencias" onClick={abrirModalIncidenciasGrupo}>
                📌 Ver incidencias y presentación
              </button>
            </div>
            <p className="conducta-auto-aviso">
              Nota automática: parte de 20; −1 por cada incidencia o descuento de presentación del bimestre (mín. 0). No se edita a mano.
            </p>
            <div className="modal-registro-asistencia-table-wrap">
              {loadingConducta ? (
                <div className="modal-registro-asistencia-loading"><div className="loading-spinner" /><p>Cargando...</p></div>
              ) : (
                <table className="tabla-registro-asistencia">
                  <thead>
                    <tr>
                      <th style={{ width: 50 }}>N°</th>
                      <th>APELLIDOS Y NOMBRES</th>
                      <th style={{ width: 70, textAlign: 'center' }}>Incid.</th>
                      <th style={{ width: 90, textAlign: 'center' }}>NOTA (0-20)</th>
                      <th style={{ width: 70, textAlign: 'center' }}>Ver</th>
                    </tr>
                  </thead>
                  <tbody>
                    {conductaAlumnos.map(a => (
                      <tr key={a.matricula_id}>
                        <td style={{ textAlign: 'center', fontWeight: 600 }}>{a.numero}</td>
                        <td>{a.nombre_completo}</td>
                        <td style={{ textAlign: 'center' }}>{a.total_incidencias ?? 0}</td>
                        <td style={{ textAlign: 'center' }}>
                          <span className="input-conducta input-conducta--readonly">{a.nota_conducta ?? '20'}</span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <button
                            type="button"
                            className="btn-conducta-ver"
                            title="Ver incidencias del bimestre"
                            onClick={() => abrirDetalleConductaAlumno(a)}
                          >
                            👁️
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="modal-registro-asistencia-footer">
              <button
                type="button"
                className="btn-guardar-asistencias"
                onClick={handleRecalcularConducta}
                disabled={loadingConducta || recalculandoConducta}
              >
                {recalculandoConducta ? 'Recalculando...' : '↻ Recalcular'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal detalle conducta de un alumno */}
      {detalleConductaAlumno && grupoParaConducta && createPortal(
        <div className="tutor-evidencias-overlay" onClick={() => setDetalleConductaAlumno(null)} role="presentation">
          <div className="tutor-evidencias-panel tutor-evidencias-panel--inci" onClick={(e) => e.stopPropagation()} role="dialog">
            <header className="tutor-evidencias-panel-header tutor-evidencias-panel-header--incidencias">
              <div>
                <h2>Detalle bimestre {conductaCiclo}</h2>
                <p className="tutor-evidencias-panel-sub">
                  <strong>{detalleConductaAlumno.alumno?.nombre_completo}</strong>
                  {' · '}Nota {detalleConductaAlumno.alumno?.nota_conducta ?? '—'}
                  {' · '}{formatearSoloFecha(detalleConductaAlumno.fecha_desde)} → {formatearSoloFecha(detalleConductaAlumno.fecha_hasta)}
                </p>
              </div>
              <button type="button" className="tutor-evidencias-close" onClick={() => setDetalleConductaAlumno(null)} aria-label="Cerrar">✕</button>
            </header>
            <div className="tutor-evidencias-body">
              {loadingDetalleConducta ? (
                <div className="modal-registro-asistencia-loading"><div className="loading-spinner" /><p>Cargando…</p></div>
              ) : !(detalleConductaAlumno.incidencias || []).length ? (
                <p className="tutor-evidencias-empty tutor-evidencias-empty--destacado">Sin incidencias ni descuentos de presentación en este bimestre</p>
              ) : (
                <ul className="tutor-evidencia-lineas tutor-evidencia-lineas--inci">
                  {(detalleConductaAlumno.incidencias || []).map((inc) => (
                    <li key={inc.id}>
                      <div className="tutor-inc-fila-super">
                        <span>{formatearFechaHoraPeru(inc.created_at)}</span>
                        <span className={`tutor-inc-origen ${inc.origen === 'vestimenta' ? 'es-vestimenta' : 'es-incidencia'}`}>
                          {inc.origen === 'vestimenta' ? 'Presentación' : 'Incidencia'}
                        </span>
                        <span className="tutor-inc-doc">{inc.docente_nombre || '—'}</span>
                        <span className="tutor-inc-cur">{inc.curso_nombre || '—'}</span>
                      </div>
                      {(inc.description || '').trim() ? (
                        <p className="tutor-inc-detalle">{inc.description}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal: incidencias + presentación del grupo (imprimible por bimestre) */}
      {modalIncidenciasGrupoAbierto &&
        grupoParaConducta &&
        createPortal(
          <div className="tutor-evidencias-overlay" onClick={() => setModalIncidenciasGrupoAbierto(false)} role="presentation">
            <div className="tutor-evidencias-panel tutor-evidencias-panel--inci" onClick={(e) => e.stopPropagation()} role="dialog" aria-labelledby="titulo-inci-evid">
              <header className="tutor-evidencias-panel-header tutor-evidencias-panel-header--incidencias">
                <div>
                  <h2 id="titulo-inci-evid">Incidencias y presentación</h2>
                  <p className="tutor-evidencias-panel-sub">
                    <strong>
                      {grupoParaConducta.grado}° {grupoParaConducta.seccion}
                    </strong>
                    {' '}— incidencias de docentes y descuentos por vestimenta (QR)
                  </p>
                </div>
                <button
                  type="button"
                  className="tutor-evidencias-close"
                  onClick={() => setModalIncidenciasGrupoAbierto(false)}
                  aria-label="Cerrar"
                >
                  ✕
                </button>
              </header>
              <div className="tutor-evidencias-toolbar">
                <label className="tutor-evidencias-date">
                  Bimestre{' '}
                  <select
                    value={incidenciasReporteCiclo}
                    onChange={(e) => {
                      setIncidenciasReporteCiclo(parseInt(e.target.value, 10));
                      setUsarFiltroBimestreInc(true);
                    }}
                  >
                    {[1, 2, 3, 4].map((b) => (
                      <option key={b} value={b}>Bimestre {b}</option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="tutor-evidencias-btn aplicar"
                  onClick={() => {
                    setUsarFiltroBimestreInc(true);
                    aplicarFiltrosIncidenciasYResumen();
                  }}
                >
                  Aplicar bimestre
                </button>
                <button type="button" className="tutor-evidencias-btn pdf" onClick={exportPdfIncidenciasGrupoReporte}>
                  📄 Exportar PDF
                </button>
              </div>
              {(fechaIncDesde || fechaIncHasta) && (
                <p className="conducta-rango-hint" style={{ padding: '0 1rem' }}>
                  Periodo: {formatearSoloFecha(fechaIncDesde)} → {formatearSoloFecha(fechaIncHasta)}
                </p>
              )}
              <div className="tutor-evidencias-body">
                {loadingIncidenciasRep ? (
                  <div className="modal-registro-asistencia-loading">
                    <div className="loading-spinner" />
                    <p>Cargando…</p>
                  </div>
                ) : !dataIncidenciasPorAlumno.length ? (
                  <p className="tutor-evidencias-empty tutor-evidencias-empty--destacado">Sin registros en este bimestre</p>
                ) : (
                  <div className="tutor-evidencia-cards-scroll">
                    {dataIncidenciasPorAlumno.map((alu, idx) => {
                      const pastel = PASTEL_TUTOR_EVIDENCIA[(idx + 2) % PASTEL_TUTOR_EVIDENCIA.length];
                      return (
                        <article
                          key={alu.alumno_id || idx}
                          className="tutor-evidencia-alumno-card tutor-evidencia-alumno-card--inci"
                          style={{
                            border: `1px solid ${pastel.border}`,
                            background: pastel.bg,
                          }}
                        >
                          <div className="tutor-evidencia-alumno-card-head" style={{ color: pastel.accent }}>
                            <span className="tutor-evidencia-alumno-nombre">{alu.alumno_nombre}</span>
                            <span className="tutor-evidencia-alumno-meta">
                              {(alu.incidencias || []).length} registro{(alu.incidencias || []).length !== 1 ? 's' : ''}
                            </span>
                          </div>
                          <ul className="tutor-evidencia-lineas tutor-evidencia-lineas--inci">
                            {(alu.incidencias || []).map((inc) => (
                              <li key={inc.id}>
                                <div className="tutor-inc-fila-super">
                                  <span>{formatearFechaHoraPeru(inc.created_at)}</span>
                                  <span className={`tutor-inc-origen ${inc.origen === 'vestimenta' ? 'es-vestimenta' : 'es-incidencia'}`}>
                                    {inc.origen === 'vestimenta' ? 'Presentación' : 'Incidencia'}
                                  </span>
                                  <span className="tutor-inc-doc">{inc.docente_nombre || '—'}</span>
                                  <span className="tutor-inc-cur">{inc.curso_nombre || '—'}</span>
                                </div>
                                {(inc.description || '').trim() ? (
                                  <p className="tutor-inc-detalle">{inc.description}</p>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Modal Ver Horario (igual diseño que Mi Horario del alumno) */}
      {mostrarModalHorario && grupoParaHorario && createPortal(
        <div className="modal-overlay-qr" onClick={() => { setMostrarModalHorario(false); setGrupoParaHorario(null); setHorarioGrupo([]); }} style={{ zIndex: 100000 }}>
          <div className="modal-content-horario alumno-horario" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '95%', maxHeight: '95vh', overflow: 'auto', padding: '1.5rem 2rem' }}>
            <div className="page-header">
              <div className="header-content">
                <div>
                  <h1>📅 Mi Horario</h1>
                  <p>Horario de {grupoParaHorario.grado}° {grupoParaHorario.seccion} - {grupoParaHorario.nivel_nombre} - Año académico actual</p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  {horarioGrupo && horarioGrupo.length > 0 && (
                    <button className="btn-imprimir" onClick={exportarHorarioGrupoPDF}>
                      <span className="btn-icon">📄</span>
                      <span className="btn-text">Exportar</span>
                    </button>
                  )}
                  <button className="modal-close-qr" onClick={() => { setMostrarModalHorario(false); setGrupoParaHorario(null); setHorarioGrupo([]); }}>×</button>
                </div>
              </div>
            </div>
            {loadingHorario ? (
              <div className="alumno-horario-loading">
                <div className="loading-spinner">Cargando horario...</div>
              </div>
            ) : !horarioGrupo || horarioGrupo.length === 0 ? (
              <div className="empty-state">
                <p>No se encontró horario para este grado</p>
              </div>
            ) : (
              <>
                <div className="horario-container">
                  <div className="horario-table-wrapper">
                    <table className="horario-table">
                      <thead>
                        <tr>
                          <th className="horario-hora-col">Hora</th>
                          {diasSemanaHorario.map((dia) => (
                            <th key={dia.id} className="horario-dia-col">{dia.abrev}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {horariosUnicosGrupo.map((bloque, idx) => {
                          const claseLunes = obtenerClaseGrupo(1, bloque.inicio, bloque.fin);
                          const claseMartes = obtenerClaseGrupo(2, bloque.inicio, bloque.fin);
                          const claseMiercoles = obtenerClaseGrupo(3, bloque.inicio, bloque.fin);
                          const claseJueves = obtenerClaseGrupo(4, bloque.inicio, bloque.fin);
                          const claseViernes = obtenerClaseGrupo(5, bloque.inicio, bloque.fin);
                          if (!claseLunes && !claseMartes && !claseMiercoles && !claseJueves && !claseViernes) return null;
                          return (
                            <tr key={idx}>
                              <td className="horario-hora-cell">{formatearHoraGrupo(bloque.inicio)} - {formatearHoraGrupo(bloque.fin)}</td>
                              <td className={`horario-clase-cell ${!claseLunes ? 'horario-cell-empty' : ''}`} style={claseLunes ? { backgroundColor: aclararColorGrupo(getColorForCourseGrupo(claseLunes.titulo), 0.5) } : {}}>{formatearClaseGrupo(claseLunes) || ''}</td>
                              <td className={`horario-clase-cell ${!claseMartes ? 'horario-cell-empty' : ''}`} style={claseMartes ? { backgroundColor: aclararColorGrupo(getColorForCourseGrupo(claseMartes.titulo), 0.5) } : {}}>{formatearClaseGrupo(claseMartes) || ''}</td>
                              <td className={`horario-clase-cell ${!claseMiercoles ? 'horario-cell-empty' : ''}`} style={claseMiercoles ? { backgroundColor: aclararColorGrupo(getColorForCourseGrupo(claseMiercoles.titulo), 0.5) } : {}}>{formatearClaseGrupo(claseMiercoles) || ''}</td>
                              <td className={`horario-clase-cell ${!claseJueves ? 'horario-cell-empty' : ''}`} style={claseJueves ? { backgroundColor: aclararColorGrupo(getColorForCourseGrupo(claseJueves.titulo), 0.5) } : {}}>{formatearClaseGrupo(claseJueves) || ''}</td>
                              <td className={`horario-clase-cell ${!claseViernes ? 'horario-cell-empty' : ''}`} style={claseViernes ? { backgroundColor: aclararColorGrupo(getColorForCourseGrupo(claseViernes.titulo), 0.5) } : {}}>{formatearClaseGrupo(claseViernes) || ''}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
                {detalleHorarioGrupo.length > 0 && (
                  <div className="detalle-horario-container">
                    <h2 className="detalle-horario-title">Detalle de Horario</h2>
                    <div className="detalle-horario-list">
                      {detalleHorarioGrupo.map((curso, idx) => (
                        <div key={idx} className="detalle-curso-card" style={{ backgroundColor: aclararColorGrupo(getColorForCourseGrupo(curso.titulo), 0.5) }}>
                          <div className="detalle-curso-header">
                            <div className="detalle-curso-color-indicator" style={{ backgroundColor: getColorForCourseGrupo(curso.titulo) }}></div>
                            <div className="detalle-curso-info">
                              <h3 className="detalle-curso-titulo">{curso.titulo}</h3>
                              {curso.docente && <p className="detalle-curso-docente">👨‍🏫 {curso.docente}</p>}
                            </div>
                          </div>
                          <div className="detalle-curso-horarios">
                            {curso.horarios.map((h, hIdx) => (
                              <div key={hIdx} className="detalle-horario-item">
                                <span className="detalle-horario-dia">{h.diaNombre}</span>
                                <span className="detalle-horario-hora">{formatearHoraGrupo(h.inicio)} - {formatearHoraGrupo(h.fin)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>,
        document.body
      )}

      <div className="docente-tutoria">
        {!selectedGrupo ? (
          <>
            <div className="page-header">
              <h1>🎓 {titulo}</h1>
              <p>{subtitulo}</p>
              {soloLectura && (
                <p className="tutoria-solo-lectura-aviso" style={{ marginTop: '0.5rem', color: '#6b7280', fontSize: '0.9rem' }}>
                  Modo supervisión: solo lectura en todos los niveles.
                </p>
              )}
            </div>

            <div className="tutoria-content mundo-card">
              <h2>Grupos a Cargo</h2>

              {gruposTutor.length > 0 && !soloLectura && (
                <div className="tutoria-escaneo-cta" role="region" aria-label="Escanear asistencia">
                  <div className="tutoria-escaneo-cta__text">
                    <span className="tutoria-escaneo-cta__title">Escanear asistencia</span>
                    <span className="tutoria-escaneo-cta__sub">
                      Misma pantalla que usa el personal de asistencia: QR de alumnos y personal.
                    </span>
                  </div>
                  <button
                    type="button"
                    className="tutoria-escaneo-cta__btn"
                    onClick={() => navigate('/asistencia/escaneo')}
                  >
                    Escanear asistencia
                  </button>
                </div>
              )}
              
              {gruposTutor.length > 0 ? (
                <div className="grupos-cards-container">
                  {gruposTutor.map((grupo, index) => {
                // Colores pasteles suaves para cada card
                const coloresPasteles = [
                  { bg: 'linear-gradient(145deg, #fef3f2, #fff5f5)', border: '#fecaca', text: '#991b1b' },
                  { bg: 'linear-gradient(145deg, #f0fdf4, #f0fdf4)', border: '#bbf7d0', text: '#166534' },
                  { bg: 'linear-gradient(145deg, #eff6ff, #eff6ff)', border: '#bfdbfe', text: '#1e40af' },
                  { bg: 'linear-gradient(145deg, #fefce8, #fefce8)', border: '#fde68a', text: '#854d0e' },
                  { bg: 'linear-gradient(145deg, #f5f3ff, #f5f3ff)', border: '#ddd6fe', text: '#6b21a8' },
                  { bg: 'linear-gradient(145deg, #f0f9ff, #f0f9ff)', border: '#bae6fd', text: '#0c4a6e' },
                  { bg: 'linear-gradient(145deg, #fdf2f8, #fdf2f8)', border: '#fbcfe8', text: '#9f1239' },
                  { bg: 'linear-gradient(145deg, #ecfdf5, #ecfdf5)', border: '#a7f3d0', text: '#14532d' }
                ];
                
                const colorCard = coloresPasteles[index % coloresPasteles.length];
                
                return (
                  <div
                    key={grupo.id}
                    className="grupo-card"
                    style={{
                      background: colorCard.bg,
                      borderColor: colorCard.border
                    }}
                  >
                    <div className="grupo-card-info">
                      <div className="grupo-card-texto">
                        <span className="grupo-grado-seccion-nivel">
                          {grupo.grado}° {grupo.seccion} - {grupo.nivel_nombre}
                        </span>
                        <span className="grupo-turno-anio">
                          {grupo.turno_nombre} • {grupo.anio}
                        </span>
                      </div>
                    </div>
                    <div className="grupo-card-acciones">
                      <button
                        className="btn-opciones"
                        onClick={(e) => handleOpcionesClick(e, grupo.id)}
                      >
                        Opciones <span className="dropdown-arrow">▼</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="empty-state">
              <p>{soloLectura ? 'No hay grupos disponibles para supervisión' : 'No tienes grupos asignados como tutor'}</p>
            </div>
          )}

              {/* Dropdown de Opciones */}
              {openDropdown && createPortal(
                <div
                  ref={dropdownRef}
                  className={`dropdown-menu dropdown-menu-tutoria-grupo${openDropdown.layout === 'sheet' ? ' dropdown-menu--mobile-sheet' : ''}`}
                  style={
                    openDropdown.layout === 'sheet'
                      ? { position: 'fixed', zIndex: 100000 }
                      : {
                          position: 'fixed',
                          top: `${openDropdown.top}px`,
                          left: `${openDropdown.left}px`,
                          zIndex: 10000
                        }
                  }
                >
                  {(() => {
                    const grupo = gruposTutor.find(g => g.id === openDropdown.grupoId);
                    if (!grupo) return null;

                    const opciones = buildOpcionesTutoriaGrupo(grupo, { soloLectura });

                    return opciones.map((opcion) => (
                      <div
                        key={opcion.id}
                        className="dropdown-item"
                        onClick={() => handleOpcionClick(opcion.id, grupo)}
                      >
                        <span className="dropdown-icon">{opcion.icon}</span>
                        <span className="dropdown-label">{opcion.label}</span>
                      </div>
                    ));
                  })()}
                </div>,
                document.body
              )}
            </div>
          </>
          ) : (
            <div className="alumnos-container">
              <div className="alumnos-header-section mundo-card">
                <button className="btn-regresar" onClick={volverAGrupos}>
                  <span className="btn-icon">←</span>
                  Volver
                </button>
                <div className="grupo-info">
                  <h2 className="section-title-blue">
                    Lista de Alumnos - {grupoInfo?.grado}° {grupoInfo?.seccion}
                  </h2>
                  <p className="grupo-subtitle">{grupoInfo?.nivel_nombre} - {grupoInfo?.turno_nombre}</p>
                </div>
              </div>
              
              <div className="alumnos-list-section mundo-card">
                {loadingAlumnos ? (
                  <div className="loading-alumnos">Cargando alumnos...</div>
                ) : (
                  <div className="alumnos-cards-container">
                    {alumnos.length > 0 ? (
                      alumnos.map((alumno, index) => {
                        // Colores pasteles suaves para cada card de alumno
                        const coloresPasteles = [
                          'linear-gradient(135deg, #e0f7fa 0%, #b2ebf2 100%)', // Light Cyan
                          'linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%)', // Light Green
                          'linear-gradient(135deg, #f3e5f5 0%, #e1bee7 100%)', // Light Purple
                          'linear-gradient(135deg, #fff3e0 0%, #ffe0b2 100%)', // Light Orange
                          'linear-gradient(135deg, #fbe9e7 0%, #ffccbc 100%)', // Light Red
                          'linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%)', // Light Blue
                          'linear-gradient(135deg, #fce4ec 0%, #f8bbd0 100%)', // Light Pink
                          'linear-gradient(135deg, #f1f8e9 0%, #dcedc8 100%)', // Lighter Green
                        ];
                        
                        const colorCard = coloresPasteles[alumno.id % coloresPasteles.length];
                        
                        return (
                          <div
                            key={`alumno-${alumno.id}-${index}-${alumno.telefono || ''}`}
                            className="alumno-card"
                            style={{ background: colorCard }}
                          >
                            <div className="alumno-card-info">
                              <div className="alumno-card-main">
                                <span className="alumno-nombre">
                                  {alumno.apellido_paterno} {alumno.apellido_materno}, {alumno.nombres}
                                </span>
                                <div className="alumno-card-details">
                                  <span className="alumno-fecha">
                                    📅 {alumno.fecha_nacimiento 
                                      ? new Date(alumno.fecha_nacimiento).toLocaleDateString('es-PE')
                                      : 'N/A'}
                                  </span>
                                  <span className="alumno-telefono">
                                    📞 {alumno.telefono || 'N/A'}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="alumno-card-actions">
                              <div className="dropdown-container">
                                <button
                                  className="btn-opciones-dropdown"
                                  type="button"
                                  onClick={(e) => handleToggleAlumnoOpciones(e, alumno)}
                                  title="Opciones"
                                >
                                  Opciones {openDropdownAlumno?.id === alumno.id ? '▲' : '▼'}
                                </button>
                                {openDropdownAlumno?.id === alumno.id &&
                                  createPortal(
                                    <div
                                      ref={alumnoDropdownRef}
                                      className={`dropdown-menu dropdown-menu-alumno${openDropdownAlumno.layout === 'sheet' ? ' dropdown-menu--mobile-sheet' : ''}`}
                                      style={
                                        openDropdownAlumno.layout === 'sheet'
                                          ? { position: 'fixed', zIndex: 100000 }
                                          : {
                                              top: `${openDropdownAlumno.top}px`,
                                              left: `${openDropdownAlumno.left}px`,
                                              position: 'fixed',
                                              zIndex: 99999
                                            }
                                      }
                                      onClick={(e) => e.stopPropagation()}
                                    >
                              {!soloLectura && (
                              <button
                                        className="dropdown-item"
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          e.preventDefault();
                                          setAlumnoParaMensaje(alumno);
                                          setMostrarModalMensajeAlumno(true);
                                          setAsuntoMensajeAlumno('');
                                          setContenidoMensajeAlumno('');
                                          setArchivosAdjuntosMensajeAlumno([]);
                                          setOpenDropdownAlumno(null);
                                        }}
                                      >
                                        <span className="dropdown-icon">✉️</span>
                                        <span>Enviar Mensaje</span>
                              </button>
                              )}
                                      <button
                                        className="dropdown-item"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          cargarInfoAlumno(alumno.id);
                                          setOpenDropdownAlumno(null);
                                        }}
                                      >
                                        <span className="dropdown-icon">ℹ️</span>
                                        <span>Ver Información</span>
                                      </button>
                                      <button
                                        className="dropdown-item"
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleVerIncidenciasTutoria(alumno);
                                        }}
                                      >
                                        <span className="dropdown-icon">⚠️</span>
                                        <span>Incidencias</span>
                                      </button>
                                      <button
                                        className="dropdown-item"
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleVerEstrellasTutoria(alumno);
                                        }}
                                      >
                                        <span className="dropdown-icon">⭐</span>
                                        <span>Estrellas</span>
                                      </button>
                                      {!soloLectura && (
                                      <button
                                        className="dropdown-item"
                                        type="button"
                                        disabled={cargandoDestinatariosApoderados}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          e.preventDefault();
                                          setOpenDropdownAlumno(null);
                                          abrirModalMensajeApoderados(alumno);
                                        }}
                                      >
                                        <span className="dropdown-icon">👨‍👩‍👧</span>
                                        <span>{cargandoDestinatariosApoderados ? 'Cargando…' : 'Mensaje Apoderados'}</span>
                                      </button>
                                      )}
                                    </div>,
                                    document.body
                                  )
                                }
                              </div>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="empty-state">
                        No hay alumnos en este grupo
                      </div>
                    )}
                  </div>
                )}
              </div>

            </div>
          )}
      </div>

      {/* Modal de Enviar Mensaje al Grupo */}
      {mostrarModalMensajeGrupo && grupoParaMensaje && createPortal(
          <div 
            className="modal-mensaje-overlay" 
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setMostrarModalMensajeGrupo(false);
                setAsuntoMensajeGrupo('');
                setContenidoMensajeGrupo('');
                setArchivosAdjuntosMensajeGrupo([]);
                setEnviarAMensajeGrupo('todos');
                setGrupoParaMensaje(null);
              }
            }}
            style={{ zIndex: 100000 }}
          >
          <div 
            className="modal-mensaje-container" 
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-mensaje-grupo-title"
          >
            <div className="modal-mensaje-header">
              <h2 id="modal-mensaje-grupo-title">✉️ Enviar Mensaje al Grupo</h2>
                    <button
                className="modal-mensaje-close"
                      onClick={() => {
                  setMostrarModalMensajeGrupo(false);
                  setAsuntoMensajeGrupo('');
                  setContenidoMensajeGrupo('');
                  setArchivosAdjuntosMensajeGrupo([]);
                  setEnviarAMensajeGrupo('todos');
                  setGrupoParaMensaje(null);
                }}
                type="button"
                aria-label="Cerrar modal"
                    >
                      ✕
                    </button>
                  </div>

            <div className="modal-mensaje-body">
              {/* Información del grupo */}
              <div className="mensaje-grupo-info">
                <p><strong>Grupo:</strong> {grupoParaMensaje.grado}° {grupoParaMensaje.seccion}</p>
                <p><strong>Nivel:</strong> {grupoParaMensaje.nivel_nombre} - {grupoParaMensaje.turno_nombre}</p>
                <p><strong>Alumnos:</strong> {grupoParaMensaje.total_alumnos || 0}</p>
              </div>

              {/* Enviar mensaje a */}
              <div className="form-group cf-enviar-a">
                <label htmlFor="enviar-a-select-tutoria">Enviar mensaje a:</label>
                <select
                  id="enviar-a-select-tutoria"
                  value={enviarAMensajeGrupo}
                  onChange={(e) => setEnviarAMensajeGrupo(e.target.value)}
                  className="cf-enviar-a-select"
                >
                  <option value="todos">👥 Todos (Apoderados y Alumnos)</option>
                  <option value="apoderados">👨‍👩‍👧 Solo Apoderados</option>
                  <option value="alumnos">🎓 Solo Alumnos</option>
                </select>
              </div>

              {/* Campo Asunto */}
                  <div className="form-group">
                <label htmlFor="asunto-mensaje-grupo">Asunto:</label>
                <input
                  type="text"
                  id="asunto-mensaje-grupo"
                  name="asunto-mensaje-grupo"
                  className="form-input"
                  value={asuntoMensajeGrupo}
                  onChange={(e) => setAsuntoMensajeGrupo(e.target.value)}
                  placeholder="Asunto del mensaje"
                />
              </div>

              {/* Campo Mensaje con Editor de Texto Enriquecido */}
              <div className="form-group">
                <label htmlFor="mensaje-editor-grupo">Mensaje:</label>
                <div id="mensaje-editor-wrapper-grupo">
                  <ReactQuill
                    ref={quillRefMensajeGrupo}
                    theme="snow"
                    value={contenidoMensajeGrupo}
                    onChange={setContenidoMensajeGrupo}
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
                <label htmlFor="archivos-input-grupo">Archivos Adjuntos:</label>
                <div className="archivos-container">
                  <input
                    type="file"
                    id="archivos-input-grupo"
                    name="archivos-input-grupo"
                    multiple
                    onChange={handleArchivoChangeMensajeGrupo}
                    style={{ display: 'none' }}
                  />
                  <label htmlFor="archivos-input-grupo" className="btn-adjuntar-archivo">
                    📎 Adjuntar Archivos
                  </label>
                  {archivosAdjuntosMensajeGrupo.length > 0 && (
                    <div className="archivos-lista">
                      {archivosAdjuntosMensajeGrupo.map((archivo, index) => (
                        <div key={index} className="archivo-item">
                          <span className="archivo-nombre">{archivo.name}</span>
                          <span className="archivo-tamaño">
                            {(archivo.size / 1024).toFixed(2)} KB
                          </span>
                          <button
                            type="button"
                            className="archivo-eliminar"
                            onClick={() => eliminarArchivoMensajeGrupo(index)}
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
                    setMostrarModalMensajeGrupo(false);
                    setAsuntoMensajeGrupo('');
                    setContenidoMensajeGrupo('');
                    setArchivosAdjuntosMensajeGrupo([]);
                    setEnviarAMensajeGrupo('todos');
                    setGrupoParaMensaje(null);
                  }}
                  type="button"
                    >
                      Cancelar
                    </button>
                    <button
                  className="btn-enviar"
                  onClick={enviarMensajeAlGrupo}
                  disabled={enviandoMensajeGrupo}
                      type="button"
                    >
                  {enviandoMensajeGrupo ? '⏳ Enviando...' : '✉️ Enviar Mensaje'}
                    </button>
                  </div>
                </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal de Información del Alumno */}
      {alumnoInfo && (
        <div className="alumno-info-modal-overlay" onClick={cerrarModalAlumno}>
          <div className="alumno-info-modal" onClick={(e) => e.stopPropagation()}>
            {loadingAlumnoInfo ? (
              <div className="alumno-info-loading">
                <div className="loading-spinner">Cargando información...</div>
            </div>
            ) : (
              <>
                <div className="alumno-info-header">
                  <h2 className="alumno-info-title">Información del Alumno</h2>
                  <button className="alumno-info-close" onClick={cerrarModalAlumno}>✕</button>
                </div>
                
                <div className="alumno-info-content">
                  {/* Card de Datos Personales del Alumno - Similar a apoderados */}
                  <div className="alumno-datos-personales-card alumno-apoderado-card">
                    <h3 className="alumno-apoderado-tipo">📋 Datos del Alumno</h3>
                    <table className="alumno-apoderado-table">
                      <tbody>
                        <tr>
                          <th>APELLIDOS Y NOMBRES</th>
                          <td>{alumnoInfo.alumno.apellido_paterno} {alumnoInfo.alumno.apellido_materno}, {alumnoInfo.alumno.nombres}</td>
                        </tr>
                        <tr>
                          <th>FECHA DE NACIMIENTO</th>
                          <td>
                            {alumnoInfo.alumno.fecha_nacimiento 
                              ? new Date(alumnoInfo.alumno.fecha_nacimiento).toLocaleDateString('es-PE')
                              : 'N/A'}
                          </td>
                        </tr>
                        <tr>
                          <th>Nº DE DOCUMENTO</th>
                          <td>{alumnoInfo.alumno.nro_documento || 'N/A'}</td>
                        </tr>
                        <tr>
                          <th>SEXO</th>
                          <td>
                            {alumnoInfo.alumno.sexo === 0 || alumnoInfo.alumno.sexo === '0' ? 'Masculino' : 
                             alumnoInfo.alumno.sexo === 1 || alumnoInfo.alumno.sexo === '1' ? 'Femenino' : 'N/A'}
                          </td>
                        </tr>
                        {alumnoInfo.alumno.nivel_actual && (
                          <tr>
                            <th>NIVEL ACTUAL</th>
                            <td>
                              {alumnoInfo.alumno.nivel_actual.nivel_nombre} - {alumnoInfo.alumno.nivel_actual.grado}° {alumnoInfo.alumno.nivel_actual.seccion}
                            </td>
                          </tr>
                        )}
                        {alumnoInfo.alumno.avatar && (
                          <>
                            <tr>
                              <th>AVATAR / NIVEL</th>
                              <td>
                                {alumnoInfo.alumno.avatar.name || 'N/A'}
                                {alumnoInfo.alumno.avatar.level !== undefined && alumnoInfo.alumno.avatar.level !== null && ` - Nivel ${String(alumnoInfo.alumno.avatar.level).padStart(2, '0')}`}
                              </td>
                            </tr>
                            {alumnoInfo.alumno.avatar.description && (
                              <tr>
                                <th>DESCRIPCIÓN</th>
                                <td>{alumnoInfo.alumno.avatar.description}</td>
                              </tr>
                            )}
                            {alumnoInfo.alumno.avatar.historia && (
                              <tr>
                                <th>HISTORIA</th>
                                <td>{alumnoInfo.alumno.avatar.historia}</td>
                              </tr>
                            )}
                            {alumnoInfo.alumno.estrellas !== undefined && (
                              <tr>
                                <th>ESTRELLAS</th>
                                <td>⭐ {alumnoInfo.alumno.estrellas || 0}</td>
                              </tr>
                            )}
                          </>
                        )}
                      </tbody>
                    </table>
      </div>

                  {/* 3 Círculos medianos: Foto, Avatar y QR horizontalmente */}
                  <div className="alumno-medios-container">
                    {/* Foto del alumno */}
                    <div className="alumno-medio-circle">
                      {alumnoInfo.alumno.foto_url ? (
                        <>
                          <img 
                            src={alumnoInfo.alumno.foto_url} 
                            alt="Foto del alumno"
                            className="alumno-medio-img"
                            onError={(e) => {
                              e.target.style.display = 'none';
                              const placeholder = e.target.parentElement.querySelector('.alumno-medio-placeholder-fallback');
                              if (placeholder) {
                                placeholder.style.display = 'flex';
                              }
                            }}
                          />
                          <div className="alumno-medio-placeholder alumno-medio-placeholder-fallback" style={{display: 'none'}}>
                            {alumnoInfo.alumno.nombres?.charAt(0)?.toUpperCase() || 'A'}
                            {alumnoInfo.alumno.apellido_paterno?.charAt(0)?.toUpperCase() || 'A'}
                          </div>
                        </>
                      ) : (
                        <div className="alumno-medio-placeholder">
                          {alumnoInfo.alumno.nombres?.charAt(0)?.toUpperCase() || 'A'}
                          {alumnoInfo.alumno.apellido_paterno?.charAt(0)?.toUpperCase() || 'A'}
                        </div>
                      )}
                      <p className="alumno-medio-label">Foto</p>
                    </div>

                    {/* Avatar del alumno */}
                    {alumnoInfo.alumno.avatar?.image_url ? (
                      <div className="alumno-medio-circle">
                        <div className="alumno-medio-avatar-wrapper">
                          <img 
                            src={alumnoInfo.alumno.avatar.image_url} 
                            alt={alumnoInfo.alumno.avatar.name || "Avatar del alumno"}
                            className="alumno-medio-img"
                          />
                          {alumnoInfo.alumno.avatar.level > 0 && (
                            <div className="alumno-medio-level-badge">
                              Nv.{alumnoInfo.alumno.avatar.level}
                            </div>
                          )}
                        </div>
                        <p className="alumno-medio-label">Avatar</p>
                      </div>
                    ) : null}

                    {/* QR Code */}
                    {alumnoInfo.qr_code && (
                      <div className="alumno-medio-circle">
                        <div className="alumno-medio-qr">
                          <QRCodeSVG 
                            value={alumnoInfo.qr_code}
                            size={120}
                            level="H"
                          />
                        </div>
                        <p className="alumno-medio-label">Código QR</p>
                      </div>
                    )}
                  </div>

                  {/* Datos de Apoderados */}
                  {(alumnoInfo.apoderados?.padre || alumnoInfo.apoderados?.madre) && (
                    <div className="alumno-apoderados-section">
                      <h3 className="alumno-apoderados-title">Datos de Apoderados</h3>
                      <div className="alumno-apoderados-grid">
                        {alumnoInfo.apoderados.padre && (
                          <div className="alumno-apoderado-card">
                            <h4 className="alumno-apoderado-tipo">👨 Padre</h4>
                            <table className="alumno-apoderado-table">
                              <tbody>
                                <tr>
                                  <th>NOMBRES COMPLETOS</th>
                                  <td>{alumnoInfo.apoderados.padre.nombres} {alumnoInfo.apoderados.padre.apellido_paterno} {alumnoInfo.apoderados.padre.apellido_materno}</td>
                                </tr>
                                {alumnoInfo.apoderados.padre.nro_documento && (
                                  <tr>
                                    <th>Nº DE DOCUMENTO</th>
                                    <td>{alumnoInfo.apoderados.padre.nro_documento}</td>
                                  </tr>
                                )}
                                {alumnoInfo.apoderados.padre.telefono_celular && (
                                  <tr>
                                    <th>TELÉFONO CELULAR</th>
                                    <td>{alumnoInfo.apoderados.padre.telefono_celular}</td>
                                  </tr>
                                )}
                                {alumnoInfo.apoderados.padre.telefono_fijo && (
                                  <tr>
                                    <th>TELÉFONO FIJO</th>
                                    <td>{alumnoInfo.apoderados.padre.telefono_fijo}</td>
                                  </tr>
                                )}
                                {alumnoInfo.apoderados.padre.email && (
                                  <tr>
                                    <th>EMAIL</th>
                                    <td>{alumnoInfo.apoderados.padre.email}</td>
                                  </tr>
                                )}
                                {alumnoInfo.apoderados.padre.direccion && (
                                  <tr>
                                    <th>DIRECCIÓN</th>
                                    <td>{alumnoInfo.apoderados.padre.direccion}</td>
                                  </tr>
                                )}
                                {alumnoInfo.apoderados.padre.ocupacion && (
                                  <tr>
                                    <th>OCUPACIÓN</th>
                                    <td>{alumnoInfo.apoderados.padre.ocupacion}</td>
                                  </tr>
                                )}
                                {alumnoInfo.apoderados.padre.centro_trabajo_direccion && (
                                  <tr>
                                    <th>CENTRO DE TRABAJO</th>
                                    <td>{alumnoInfo.apoderados.padre.centro_trabajo_direccion}</td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        )}
                        
                        {alumnoInfo.apoderados.madre && (
                          <div className="alumno-apoderado-card">
                            <h4 className="alumno-apoderado-tipo">👩 Madre</h4>
                            <table className="alumno-apoderado-table">
                              <tbody>
                                <tr>
                                  <th>NOMBRES COMPLETOS</th>
                                  <td>{alumnoInfo.apoderados.madre.nombres} {alumnoInfo.apoderados.madre.apellido_paterno} {alumnoInfo.apoderados.madre.apellido_materno}</td>
                                </tr>
                                {alumnoInfo.apoderados.madre.nro_documento && (
                                  <tr>
                                    <th>Nº DE DOCUMENTO</th>
                                    <td>{alumnoInfo.apoderados.madre.nro_documento}</td>
                                  </tr>
                                )}
                                {alumnoInfo.apoderados.madre.telefono_celular && (
                                  <tr>
                                    <th>TELÉFONO CELULAR</th>
                                    <td>{alumnoInfo.apoderados.madre.telefono_celular}</td>
                                  </tr>
                                )}
                                {alumnoInfo.apoderados.madre.telefono_fijo && (
                                  <tr>
                                    <th>TELÉFONO FIJO</th>
                                    <td>{alumnoInfo.apoderados.madre.telefono_fijo}</td>
                                  </tr>
                                )}
                                {alumnoInfo.apoderados.madre.email && (
                                  <tr>
                                    <th>EMAIL</th>
                                    <td>{alumnoInfo.apoderados.madre.email}</td>
                                  </tr>
                                )}
                                {alumnoInfo.apoderados.madre.direccion && (
                                  <tr>
                                    <th>DIRECCIÓN</th>
                                    <td>{alumnoInfo.apoderados.madre.direccion}</td>
                                  </tr>
                                )}
                                {alumnoInfo.apoderados.madre.ocupacion && (
                                  <tr>
                                    <th>OCUPACIÓN</th>
                                    <td>{alumnoInfo.apoderados.madre.ocupacion}</td>
                                  </tr>
                                )}
                                {alumnoInfo.apoderados.madre.centro_trabajo_direccion && (
                                  <tr>
                                    <th>CENTRO DE TRABAJO</th>
                                    <td>{alumnoInfo.apoderados.madre.centro_trabajo_direccion}</td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Historial de Matrículas */}
                  {alumnoInfo.matriculas_por_nivel && alumnoInfo.matriculas_por_nivel.length > 0 && (
                    <div className="alumno-matriculas-section">
                      <h3 className="alumno-matriculas-title">Historial de Matrículas</h3>
                      <div className="alumno-matriculas-grid">
                        {alumnoInfo.matriculas_por_nivel.map((nivel) => (
                          <div key={nivel.nivel_id} className="alumno-nivel-group">
                            <h4 className="alumno-nivel-name">{nivel.nivel_nombre}</h4>
                            <div className="alumno-matriculas-list">
                              {nivel.matriculas.map((matricula) => (
                                <div key={matricula.id} className="alumno-matricula-badge">
                                  {matricula.grado}° {matricula.seccion} ({matricula.anio})
                                  {matricula.turno_nombre && ` - ${matricula.turno_nombre}`}
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Modal de Enviar Mensaje a Alumno Individual */}
      {mostrarModalMensajeAlumno && alumnoParaMensaje && createPortal(
        <div 
          className="modal-mensaje-overlay" 
          onClick={() => setMostrarModalMensajeAlumno(false)}
          style={{ zIndex: 100000 }}
        >
          <div 
            className="modal-mensaje-container" 
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-mensaje-alumno-title"
          >
            <div className="modal-mensaje-header">
              <h2 id="modal-mensaje-alumno-title">✉️ Enviar Mensaje al Alumno</h2>
              <button
                className="modal-mensaje-close"
                onClick={() => setMostrarModalMensajeAlumno(false)}
                type="button"
                aria-label="Cerrar modal"
              >
                ✕
              </button>
            </div>

            <div className="modal-mensaje-body">
              {/* Información del alumno */}
              <div className="mensaje-grupo-info">
                <p><strong>Alumno:</strong> {alumnoParaMensaje.apellido_paterno} {alumnoParaMensaje.apellido_materno}, {alumnoParaMensaje.nombres}</p>
                {alumnoParaMensaje.fecha_nacimiento && (
                  <p><strong>Fecha de Nacimiento:</strong> {new Date(alumnoParaMensaje.fecha_nacimiento).toLocaleDateString('es-PE')}</p>
                )}
                {alumnoParaMensaje.telefono && (
                  <p><strong>Teléfono:</strong> {alumnoParaMensaje.telefono}</p>
                )}
                <p className="mensaje-info-text">El mensaje se enviará directamente al alumno</p>
              </div>

              {/* Campo Asunto */}
              <div className="form-group">
                <label htmlFor="asunto-mensaje-alumno">Asunto:</label>
                <input
                  type="text"
                  id="asunto-mensaje-alumno"
                  name="asunto-mensaje-alumno"
                  className="form-input"
                  value={asuntoMensajeAlumno}
                  onChange={(e) => setAsuntoMensajeAlumno(e.target.value)}
                  placeholder="Asunto del mensaje"
                />
              </div>

              {/* Campo Mensaje con Editor de Texto Enriquecido */}
              <div className="form-group">
                <label htmlFor="mensaje-editor-alumno">Mensaje:</label>
                <div id="mensaje-editor-wrapper-alumno">
                  <ReactQuill
                    ref={quillRefMensajeAlumno}
                    theme="snow"
                    value={contenidoMensajeAlumno}
                    onChange={setContenidoMensajeAlumno}
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
                <label htmlFor="archivos-input-alumno">Archivos Adjuntos:</label>
                <div className="archivos-container">
                  <input
                    type="file"
                    id="archivos-input-alumno"
                    name="archivos-input-alumno"
                    multiple
                    onChange={handleArchivoChangeMensajeAlumno}
                    style={{ display: 'none' }}
                  />
                  <label htmlFor="archivos-input-alumno" className="btn-adjuntar-archivo">
                    📎 Adjuntar Archivos
                  </label>
                  {archivosAdjuntosMensajeAlumno.length > 0 && (
                    <div className="archivos-lista">
                      {archivosAdjuntosMensajeAlumno.map((archivo, index) => (
                        <div key={index} className="archivo-item">
                          <span className="archivo-nombre">{archivo.name}</span>
                          <span className="archivo-tamaño">
                            {(archivo.size / 1024).toFixed(2)} KB
                          </span>
                          <button
                            type="button"
                            className="archivo-eliminar"
                            onClick={() => eliminarArchivoMensajeAlumno(index)}
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
                    setMostrarModalMensajeAlumno(false);
                    setAsuntoMensajeAlumno('');
                    setContenidoMensajeAlumno('');
                    setArchivosAdjuntosMensajeAlumno([]);
                    setAlumnoParaMensaje(null);
                  }}
                  type="button"
                >
                  Cancelar
                </button>
                <button
                  className="btn-enviar"
                  onClick={enviarMensajeAlAlumno}
                  disabled={enviandoMensajeAlumno}
                  type="button"
                >
                  {enviandoMensajeAlumno ? '⏳ Enviando...' : '✉️ Enviar Mensaje'}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal Mensaje Apoderados (Tutoría) */}
      {mostrarModalMensajeApoderados && alumnoParaMensajeApoderados && createPortal(
        <div
          className="modal-mensaje-overlay"
          onClick={() => cerrarModalMensajeApoderados()}
          style={{ zIndex: 100000 }}
        >
          <div
            className="modal-mensaje-container"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-mensaje-apoderados-title"
          >
            <div className="modal-mensaje-header">
              <h2 id="modal-mensaje-apoderados-title">✉️ Mensaje Apoderados</h2>
              <button
                className="modal-mensaje-close"
                onClick={() => cerrarModalMensajeApoderados()}
                type="button"
                aria-label="Cerrar modal"
              >
                ✕
              </button>
            </div>

            <div className="modal-mensaje-body">
              <div className="mensaje-grupo-info">
                <p>
                  <strong>Alumno:</strong>{' '}
                  {alumnoParaMensajeApoderados.apellido_paterno} {alumnoParaMensajeApoderados.apellido_materno}, {alumnoParaMensajeApoderados.nombres}
                </p>
                <p className="mensaje-info-text">
                  Este mensaje se enviará exclusivamente a los <strong>apoderados</strong> del alumno seleccionado.
                </p>
                <p>
                  <strong>Destinatarios apoderados:</strong> {destinatariosApoderadosPreview.length}
                </p>
                {destinatariosApoderadosPreview.length > 0 && (
                  <div style={{ marginTop: '0.75rem' }}>
                    {destinatariosApoderadosPreview.slice(0, 6).map((d) => (
                      <div key={d.usuario_id} style={{ fontSize: '0.9rem', color: '#374151' }}>
                        • {d.nombre_completo} {d.tipo === 'docente_apoderado' ? '(Docente)' : ''}
                      </div>
                    ))}
                    {destinatariosApoderadosPreview.length > 6 && (
                      <div style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: '0.25rem' }}>
                        +{destinatariosApoderadosPreview.length - 6} más…
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="asunto-mensaje-apoderados">Asunto:</label>
                <input
                  type="text"
                  id="asunto-mensaje-apoderados"
                  name="asunto-mensaje-apoderados"
                  className="form-input"
                  value={asuntoMensajeApoderados}
                  onChange={(e) => setAsuntoMensajeApoderados(e.target.value)}
                  placeholder="Asunto del mensaje"
                />
              </div>

              <div className="form-group">
                <label htmlFor="mensaje-editor-apoderados">Mensaje:</label>
                <div id="mensaje-editor-wrapper-apoderados">
                  <ReactQuill
                    ref={quillRefMensajeApoderados}
                    theme="snow"
                    value={contenidoMensajeApoderados}
                    onChange={setContenidoMensajeApoderados}
                    placeholder="Escribe tu mensaje aquí..."
                    modules={{
                      toolbar: [
                        [{ 'header': [1, 2, 3, false] }],
                        ['bold', 'italic', 'underline', 'strike'],
                        [{ 'list': 'ordered' }, { 'list': 'bullet' }],
                        [{ 'color': [] }, { 'background': [] }],
                        [{ 'align': [] }],
                        ['link', 'image'],
                        ['clean'],
                      ],
                    }}
                    formats={[
                      'header', 'bold', 'italic', 'underline', 'strike',
                      'list', 'bullet', 'color', 'background', 'align',
                      'link', 'image',
                    ]}
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="archivos-input-apoderados">Archivos Adjuntos:</label>
                <div className="archivos-container">
                  <input
                    type="file"
                    id="archivos-input-apoderados"
                    name="archivos-input-apoderados"
                    multiple
                    onChange={handleArchivoChangeMensajeApoderados}
                    style={{ display: 'none' }}
                  />
                  <label htmlFor="archivos-input-apoderados" className="btn-adjuntar-archivo">
                    📎 Adjuntar Archivos
                  </label>
                  {archivosAdjuntosMensajeApoderados.length > 0 && (
                    <div className="archivos-lista">
                      {archivosAdjuntosMensajeApoderados.map((archivo, index) => (
                        <div key={index} className="archivo-item">
                          <span className="archivo-nombre">{archivo.name}</span>
                          <span className="archivo-tamaño">
                            {(archivo.size / 1024).toFixed(2)} KB
                          </span>
                          <button
                            type="button"
                            className="archivo-eliminar"
                            onClick={() => eliminarArchivoMensajeApoderados(index)}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="form-actions">
                <button
                  className="btn-cancelar"
                  onClick={cerrarModalMensajeApoderados}
                  type="button"
                >
                  Cancelar
                </button>
                <button
                  className="btn-enviar"
                  onClick={enviarMensajeApoderadosAlumno}
                  disabled={enviandoMensajeApoderados}
                  type="button"
                >
                  {enviandoMensajeApoderados ? '⏳ Enviando...' : '✉️ Enviar Mensaje'}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal Incidencias (Tutoría — igual que Cursos asignados) */}
      {showModalIncidenciasTutoria && alumnoSeleccionadoTutoria && createPortal(
        <div className="modal-incidencias-overlay" onClick={cerrarModalIncidenciasTutoria}>
          <div className="modal-incidencias-container" onClick={(e) => e.stopPropagation()}>
            <div className="modal-incidencias-header">
              <div className="modal-incidencias-title-section">
                <h2 className="modal-incidencias-title">📋 Gestión de Incidencias</h2>
                <p className="modal-incidencias-subtitle">
                  {nombreCompletoAlumnoTutoria(alumnoSeleccionadoTutoria)}
                </p>
                <div className="modal-incidencias-total">
                  <span className="total-label">Total de Incidencias:</span>
                  <span className="total-value">{totalIncidenciasTutoria}</span>
                </div>
              </div>
              <div className="modal-incidencias-actions">
                <button
                  className="btn-exportar-pdf-incidencias"
                  onClick={exportarPDFIncidenciasTutoria}
                  type="button"
                  title="Exportar todo a PDF"
                >
                  📄 Exportar PDF
                </button>
                <button className="modal-incidencias-close" onClick={cerrarModalIncidenciasTutoria} type="button">
                  ✕
                </button>
              </div>
            </div>

            <div className="modal-incidencias-body">
              {!soloLectura && (
              <div className="incidencias-form-section">
                <h3 className="section-title-incidencias">Registrar Incidencia</h3>
                <form onSubmit={handleRegistrarIncidenciaTutoria} className="form-incidencias">
                  <div className="form-group-incidencias">
                    <label htmlFor="description-incidencia-tutoria">Descripción de la Incidencia *</label>
                    <textarea
                      id="description-incidencia-tutoria"
                      value={formIncidenciasTutoria.description}
                      onChange={(e) =>
                        setFormIncidenciasTutoria({ ...formIncidenciasTutoria, description: e.target.value })
                      }
                      className="form-textarea-incidencias"
                      placeholder="Ej: Comportamiento o situación observada en tutoría..."
                      rows="4"
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    className="btn-registrar-incidencia"
                    disabled={guardandoIncidenciasTutoria}
                  >
                    {guardandoIncidenciasTutoria ? 'Guardando...' : '📋 Registrar Incidencia'}
                  </button>
                </form>
              </div>
              )}

              <div className="incidencias-historial-section">
                <h3 className="section-title-incidencias">Historial de Incidencias</h3>
                {loadingIncidenciasTutoria ? (
                  <div className="loading-incidencias">Cargando historial...</div>
                ) : incidenciasTutoria.length > 0 ? (
                  <div className="historial-table-container">
                    <table className="historial-table-incidencias">
                      <thead>
                        <tr>
                          <th>Docente</th>
                          <th>Curso</th>
                          <th>Descripción</th>
                          <th>Fecha</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {incidenciasTutoria.map((item) => (
                          <tr key={item.id}>
                            <td>{item.docente_nombre || 'N/A'}</td>
                            <td>
                              <span className="curso-badge-incidencia">{item.curso_nombre || 'N/A'}</span>
                            </td>
                            <td className="descripcion-cell">{item.description || '-'}</td>
                            <td>{formatearFechaIncEstTutoria(item.created_at)}</td>
                            <td>
                              {!soloLectura && item.puede_eliminar ? (
                                <button
                                  className="btn-eliminar-incidencia"
                                  onClick={() => handleEliminarIncidenciaTutoria(item.id)}
                                  type="button"
                                  title="Eliminar esta incidencia"
                                >
                                  🗑️
                                </button>
                              ) : (
                                <span className="no-eliminar">-</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="empty-historial">
                    <p>No hay incidencias registradas aún</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal Estrellas (Tutoría — igual que Cursos asignados) */}
      {showModalEstrellasTutoria && alumnoSeleccionadoTutoria && createPortal(
        <div className="modal-estrellas-overlay" onClick={cerrarModalEstrellasTutoria}>
          <div className="modal-estrellas-container" onClick={(e) => e.stopPropagation()}>
            <div className="modal-estrellas-header">
              <div className="modal-estrellas-title-section">
                <h2 className="modal-estrellas-title">⭐ Gestión de Estrellas</h2>
                <p className="modal-estrellas-subtitle">
                  {nombreCompletoAlumnoTutoria(alumnoSeleccionadoTutoria)}
                </p>
                <div className="modal-estrellas-total">
                  <span className="total-label">Total de Estrellas:</span>
                  <span className="total-value">{totalEstrellasTutoria}</span>
                </div>
              </div>
              <div className="modal-estrellas-actions">
                <button
                  className="btn-exportar-pdf"
                  onClick={exportarPDFEstrellasTutoria}
                  type="button"
                  title="Exportar todo a PDF"
                >
                  📄 Exportar PDF
                </button>
                <button className="modal-estrellas-close" onClick={cerrarModalEstrellasTutoria} type="button">
                  ✕
                </button>
              </div>
            </div>

            <div className="modal-estrellas-body">
              {!soloLectura && (
              <div className="estrellas-form-section">
                <h3 className="section-title-estrellas">Dar Estrellas</h3>
                <form onSubmit={handleDarEstrellasTutoria} className="form-estrellas">
                  <div className="form-group-estrellas">
                    <label htmlFor="points-tutoria">Cantidad de Estrellas *</label>
                    <select
                      id="points-tutoria"
                      value={formEstrellasTutoria.points}
                      onChange={(e) =>
                        setFormEstrellasTutoria({ ...formEstrellasTutoria, points: e.target.value })
                      }
                      className="form-select-estrellas"
                      required
                    >
                      <option value="">Seleccione cantidad</option>
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                        <option key={num} value={num}>
                          {num} estrella{num > 1 ? 's' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group-estrellas">
                    <label htmlFor="description-estrellas-tutoria">Descripción *</label>
                    <textarea
                      id="description-estrellas-tutoria"
                      value={formEstrellasTutoria.description}
                      onChange={(e) =>
                        setFormEstrellasTutoria({ ...formEstrellasTutoria, description: e.target.value })
                      }
                      className="form-textarea-estrellas"
                      placeholder="Ej: Comportamiento ejemplar, ayuda a sus compañeros..."
                      rows="3"
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    className="btn-dar-estrellas"
                    disabled={guardandoEstrellasTutoria}
                  >
                    {guardandoEstrellasTutoria ? 'Guardando...' : '⭐ Dar Estrellas'}
                  </button>
                </form>
              </div>
              )}

              <div className="estrellas-historial-section">
                <h3 className="section-title-estrellas">Historial de Estrellas</h3>
                {loadingEstrellasTutoria ? (
                  <div className="loading-estrellas">Cargando historial...</div>
                ) : estrellasTutoria.length > 0 ? (
                  <div className="historial-table-container">
                    <table className="historial-table">
                      <thead>
                        <tr>
                          <th>Docente</th>
                          <th>Estrellas</th>
                          <th>Descripción</th>
                          <th>Fecha</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {estrellasTutoria.map((item) => (
                          <tr key={item.id}>
                            <td>{item.docente_nombre || 'N/A'}</td>
                            <td>
                              <span className="estrellas-badge-small">⭐ {item.points}</span>
                            </td>
                            <td className="descripcion-cell">{item.description || '-'}</td>
                            <td>{formatearFechaIncEstTutoria(item.created_at)}</td>
                            <td>
                              {!soloLectura && item.puede_eliminar ? (
                                <button
                                  className="btn-eliminar-estrella"
                                  onClick={() => handleEliminarEstrellasTutoria(item.id, item.points)}
                                  type="button"
                                  title="Eliminar estas estrellas"
                                >
                                  🗑️
                                </button>
                              ) : (
                                <span className="no-eliminar">-</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="empty-historial">
                    <p>No hay estrellas registradas aún</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </DashboardLayout>
  );
}

export default DocenteTutoria;
