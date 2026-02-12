import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import api from '../services/api';
import { QRCodeSVG } from 'qrcode.react';
import { jsPDF } from 'jspdf';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import Swal from 'sweetalert2';
import './DocenteHijos.css';
import './AlumnoCursos.css';

// Función para obtener iniciales del nombre
function getInitials(nombre) {
  if (!nombre) return 'A';
  const parts = String(nombre).trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase()).join('') || 'A';
}

function DocenteHijos() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [hijos, setHijos] = useState([]);
  const [esApoderado, setEsApoderado] = useState(false);
  const [openDropdown, setOpenDropdown] = useState(null);
  const dropdownRef = useRef(null);
  const quillRefMensaje = useRef(null);
  const [showModalEditar, setShowModalEditar] = useState(false);
  const [hijoSeleccionado, setHijoSeleccionado] = useState(null);
  const [dniHijo, setDniHijo] = useState('');
  const [formData, setFormData] = useState({
    nombres: '',
    apellido_paterno: '',
    apellido_materno: '',
    email: '',
    sexo: '',
    fecha_nacimiento: ''
  });
  const [fotoPreview, setFotoPreview] = useState(null);
  const [fotoFile, setFotoFile] = useState(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showModalQR, setShowModalQR] = useState(false);
  const [qrData, setQrData] = useState(null);
  const [loadingQR, setLoadingQR] = useState(false);
  const [showModalIncidencias, setShowModalIncidencias] = useState(false);
  const [incidencias, setIncidencias] = useState([]);
  const [loadingIncidencias, setLoadingIncidencias] = useState(false);
  const [showModalEstrellas, setShowModalEstrellas] = useState(false);
  const [estrellas, setEstrellas] = useState([]);
  const [totalEstrellas, setTotalEstrellas] = useState(0);
  const [loadingEstrellas, setLoadingEstrellas] = useState(false);
  const [showModalAsistencias, setShowModalAsistencias] = useState(false);
  const [asistencias, setAsistencias] = useState([]);
  const [totalPresentes, setTotalPresentes] = useState(0);
  const [totalTardanzas, setTotalTardanzas] = useState(0);
  const [totalFaltas, setTotalFaltas] = useState(0);
  const [loadingAsistencias, setLoadingAsistencias] = useState(false);
  const [filtroMesAsistencias, setFiltroMesAsistencias] = useState('TODOS');
  const [mostrarCursos, setMostrarCursos] = useState(false);
  const [cursos, setCursos] = useState([]);
  const [loadingCursos, setLoadingCursos] = useState(false);
  const [mostrarModalMensaje, setMostrarModalMensaje] = useState(false);
  const [docenteParaMensaje, setDocenteParaMensaje] = useState(null);
  const [asuntoMensaje, setAsuntoMensaje] = useState('');
  const [contenidoMensaje, setContenidoMensaje] = useState('');
  const [archivosAdjuntos, setArchivosAdjuntos] = useState([]);
  const [enviandoMensaje, setEnviandoMensaje] = useState(false);

  useEffect(() => {
    cargarHijos();
  }, []);

  // Cerrar dropdown al hacer click fuera
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        const isDropdownButton = event.target.closest('.btn-opciones-hijo');
        if (!isDropdownButton) {
          setOpenDropdown(null);
        }
      }
    };

    if (openDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [openDropdown]);

  const cargarHijos = async () => {
    try {
      setLoading(true);
      const response = await api.get('/docente/roles-adicionales');
      setEsApoderado(response.data.es_apoderado || false);
      setHijos(response.data.hijos || []);
    } catch (error) {
      console.error('Error cargando hijos:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpcionesClick = (e, hijoId) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    
    if (openDropdown === hijoId) {
      setOpenDropdown(null);
    } else {
      // Calcular posición del dropdown
      const dropdownWidth = 200;
      const dropdownHeight = 390; // Aproximado para 10 opciones
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
      }
      
      setOpenDropdown({
        hijoId,
        top,
        left
      });
    }
  };

  const handleOpcionClick = async (opcion, hijo) => {
    setOpenDropdown(null);
    
    switch (opcion) {
      case 'editar-datos':
        // Cargar datos del hijo para editar
        console.log('📋 [FRONTEND] Hijo seleccionado para editar:', hijo);
        console.log('📋 [FRONTEND] Hijo ID:', hijo.id);
        console.log('📋 [FRONTEND] Hijo completo:', JSON.stringify(hijo, null, 2));
        if (!hijo || !hijo.id) {
          Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'No se pudo obtener el ID del alumno',
            confirmButtonText: 'Entendido'
          });
          return;
        }
        await cargarDatosHijo(hijo.id);
        setHijoSeleccionado(hijo);
        setShowModalEditar(true);
        break;
      case 'cursos-asignados':
        await handleVerCursos(hijo);
        break;
      case 'incidencias':
        await handleVerIncidencias(hijo);
        break;
      case 'estrellas':
        await handleVerEstrellas(hijo);
        break;
      case 'asistencias':
        await handleVerAsistencias(hijo);
        break;
      case 'imprimir-qr':
        await handleImprimirQR(hijo);
        break;
      case 'imprimir-notas':
        console.log('Imprimir notas de:', hijo);
        // Implementar después
        break;
      case 'pagos-realizados':
        console.log('Pagos realizados de:', hijo);
        // Implementar después
        break;
      case 'psicologia':
        console.log('Psicología de:', hijo);
        // Implementar después
        break;
      case 'reiniciar-contrasena':
        await handleReiniciarContrasena(hijo);
        break;
      default:
        break;
    }
  };

  const cargarDatosHijo = async (hijoId) => {
    try {
      console.log('📋 [FRONTEND] Cargando datos del hijo con ID:', hijoId);
      const response = await api.get(`/docente/hijos/${hijoId}/datos`);
      console.log('✅ [FRONTEND] Datos recibidos:', response.data);
      const datos = response.data;
      
      // Formatear fecha de nacimiento para input type="date" (YYYY-MM-DD)
      let fechaFormateada = '';
      if (datos.fecha_nacimiento) {
        try {
          // Si viene como string en formato YYYY-MM-DD, usarlo directamente
          // Si viene como Date object o otro formato, convertirlo
          const fecha = new Date(datos.fecha_nacimiento);
          if (!isNaN(fecha.getTime())) {
            const año = fecha.getFullYear();
            const mes = String(fecha.getMonth() + 1).padStart(2, '0');
            const dia = String(fecha.getDate()).padStart(2, '0');
            fechaFormateada = `${año}-${mes}-${dia}`;
          } else if (typeof datos.fecha_nacimiento === 'string' && datos.fecha_nacimiento.match(/^\d{4}-\d{2}-\d{2}/)) {
            // Si ya está en formato YYYY-MM-DD, usarlo directamente
            fechaFormateada = datos.fecha_nacimiento.split('T')[0]; // Remover hora si existe
          }
        } catch (error) {
          console.error('Error formateando fecha:', error);
        }
      }
      
      setFormData({
        nombres: datos.nombres || '',
        apellido_paterno: datos.apellido_paterno || '',
        apellido_materno: datos.apellido_materno || '',
        email: datos.email || '',
        sexo: datos.sexo !== undefined ? String(datos.sexo) : '',
        fecha_nacimiento: fechaFormateada
      });
      
      // Guardar DNI
      setDniHijo(datos.nro_documento || 'N/A');
      
      // Cargar foto preview
      if (datos.foto) {
        const fotoUrl = getFotoUrl(datos.foto);
        setFotoPreview(fotoUrl);
      } else {
        setFotoPreview(null);
      }
      setFotoFile(null);
    } catch (error) {
      console.error('❌ [FRONTEND] Error cargando datos del hijo:', error);
      console.error('❌ [FRONTEND] Error response:', error.response);
      console.error('❌ [FRONTEND] Error status:', error.response?.status);
      console.error('❌ [FRONTEND] Error data:', error.response?.data);
      const errorMessage = error.response?.data?.error || error.message || 'No se pudieron cargar los datos del alumno';
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: errorMessage,
        confirmButtonText: 'Entendido'
      });
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleFotoChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      // Validar tamaño (5MB)
      if (file.size > 5 * 1024 * 1024) {
        Swal.fire({
          icon: 'error',
          title: 'Archivo muy grande',
          text: 'La foto no debe superar los 5MB',
          confirmButtonText: 'Entendido'
        });
        return;
      }
      
      // Validar tipo
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
      if (!allowedTypes.includes(file.type)) {
        Swal.fire({
          icon: 'error',
          title: 'Formato no válido',
          text: 'Solo se permiten imágenes (JPG, PNG, GIF, WEBP)',
          confirmButtonText: 'Entendido'
        });
        return;
      }
      
      setFotoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setFotoPreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleReiniciarContrasena = async (hijo) => {
    try {
      // Mostrar confirmación
      const result = await Swal.fire({
        icon: 'warning',
        title: '¿Estás seguro?',
        text: `¿Deseas reiniciar la contraseña de ${hijo.nombres} ${hijo.apellido_paterno}? Se establecerá su DNI como contraseña.`,
        showCancelButton: true,
        confirmButtonColor: '#3085d6',
        cancelButtonColor: '#d33',
        confirmButtonText: 'Sí, reiniciar',
        cancelButtonText: 'Cancelar'
      });

      if (!result.isConfirmed) {
        return;
      }

      // Mostrar loading
      Swal.fire({
        title: 'Reiniciando contraseña...',
        allowOutsideClick: false,
        didOpen: () => {
          Swal.showLoading();
        }
      });

      // Llamar a la API
      const response = await api.post(`/docente/hijos/${hijo.id}/reiniciar-contrasena`);

      // Mostrar mensaje de éxito
      Swal.fire({
        icon: 'success',
        title: '¡Contraseña reiniciada!',
        text: 'Se volvió a poner el DNI del estudiante como contraseña',
        confirmButtonText: 'Entendido'
      });

    } catch (error) {
      console.error('Error reiniciando contraseña:', error);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: error.response?.data?.error || 'No se pudo reiniciar la contraseña',
        confirmButtonText: 'Entendido'
      });
    }
  };

  const handleImprimirQR = async (hijo) => {
    try {
      setLoadingQR(true);
      setHijoSeleccionado(hijo);
      
      // Cargar datos del QR del hijo
      const response = await api.get(`/docente/hijos/${hijo.id}/qr`);
      setQrData(response.data);
      setShowModalQR(true);
    } catch (error) {
      console.error('Error cargando QR del hijo:', error);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: error.response?.data?.error || 'No se pudieron cargar los datos del QR',
        confirmButtonText: 'Entendido'
      });
    } finally {
      setLoadingQR(false);
    }
  };

  const handleVerIncidencias = async (hijo) => {
    try {
      setLoadingIncidencias(true);
      setHijoSeleccionado(hijo);
      
      // Cargar incidencias del hijo
      const response = await api.get(`/docente/hijos/${hijo.id}/incidencias`);
      setIncidencias(response.data.incidencias || []);
      setShowModalIncidencias(true);
    } catch (error) {
      console.error('Error cargando incidencias:', error);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: error.response?.data?.error || 'No se pudieron cargar las incidencias',
        confirmButtonText: 'Entendido'
      });
    } finally {
      setLoadingIncidencias(false);
    }
  };

  const handleVerEstrellas = async (hijo) => {
    try {
      setLoadingEstrellas(true);
      setHijoSeleccionado(hijo);
      
      // Cargar estrellas del hijo
      const response = await api.get(`/docente/hijos/${hijo.id}/estrellas`);
      setEstrellas(response.data.estrellas || []);
      setTotalEstrellas(response.data.total_estrellas || 0);
      setShowModalEstrellas(true);
    } catch (error) {
      console.error('Error cargando estrellas:', error);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: error.response?.data?.error || 'No se pudieron cargar las estrellas',
        confirmButtonText: 'Entendido'
      });
    } finally {
      setLoadingEstrellas(false);
    }
  };

  const handleVerAsistencias = async (hijo) => {
    try {
      setLoadingAsistencias(true);
      setHijoSeleccionado(hijo);
      
      // Cargar asistencias del hijo
      const response = await api.get(`/docente/hijos/${hijo.id}/asistencias`);
      setAsistencias(response.data.asistencias || []);
      setTotalPresentes(response.data.total_presentes || 0);
      setTotalTardanzas(response.data.total_tardanzas || 0);
      setTotalFaltas(response.data.total_faltas || 0);
      setShowModalAsistencias(true);
    } catch (error) {
      console.error('Error cargando asistencias:', error);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: error.response?.data?.error || 'No se pudieron cargar las asistencias',
        confirmButtonText: 'Entendido'
      });
    } finally {
      setLoadingAsistencias(false);
    }
  };

  const handleVerCursos = async (hijo) => {
    try {
      setLoadingCursos(true);
      setHijoSeleccionado(hijo);
      
      // Cargar cursos del hijo
      const response = await api.get(`/docente/hijos/${hijo.id}/cursos`);
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

  const handleAulaVirtual = (curso) => {
    if (hijoSeleccionado) {
      // Navegar a una ruta especial para docentes como apoderados
      navigate(`/docente/hijos/${hijoSeleccionado.id}/aula-virtual/${curso.asignatura_id}`);
    } else {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'No se ha seleccionado un hijo',
        confirmButtonText: 'Entendido'
      });
    }
  };

  const handleEnviarMensaje = (curso) => {
    const docenteData = {
      id: curso.docente_usuario_id || curso.docente_id,
      nombre: curso.docente_nombre,
      curso_nombre: curso.curso_nombre
    };
    setDocenteParaMensaje(docenteData);
    setMostrarModalMensaje(true);
  };

  // Manejar cambio de archivos adjuntos
  const handleArchivoChange = (e) => {
    const archivos = Array.from(e.target.files);
    setArchivosAdjuntos([...archivosAdjuntos, ...archivos]);
    e.target.value = '';
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

    const contenidoLimpio = contenidoMensaje.replace(/<[^>]*>/g, '').trim();
    if (!contenidoLimpio) {
      Swal.fire('Error', 'El mensaje es requerido', 'error');
      return;
    }

    if (enviandoMensaje) {
      return;
    }

    setEnviandoMensaje(true);

    try {
      const formData = new FormData();
      formData.append('destinatarios', JSON.stringify([docenteParaMensaje.id]));
      formData.append('asunto', asuntoMensaje.trim());
      formData.append('mensaje', contenidoMensaje);

      archivosAdjuntos.forEach((archivo) => {
        formData.append('archivos', archivo);
      });

      // Usar ruta proxy para docentes como apoderados
      const response = await api.post(`/docente/hijos/${hijoSeleccionado.id}/mensajes/enviar`, formData, {
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
            
            // Usar ruta proxy para docentes como apoderados
            const response = await api.post(`/docente/hijos/${hijoSeleccionado.id}/mensajes/subir-imagen`, formData, {
              headers: {
                'Content-Type': 'multipart/form-data',
              },
            });

            const imagenUrl = response.data.url;
            
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

  // Función para formatear fecha
  const formatearFecha = (fecha) => {
    if (!fecha) return 'N/A';
    try {
      const date = new Date(fecha);
      return date.toLocaleDateString('es-PE', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (error) {
      return fecha;
    }
  };

  // Función para obtener mes y año de una fecha
  const obtenerMesAnio = (fecha) => {
    if (!fecha) return 'Sin fecha';
    try {
      const date = new Date(fecha);
      return date.toLocaleDateString('es-PE', {
        year: 'numeric',
        month: 'long'
      });
    } catch (error) {
      return 'Sin fecha';
    }
  };

  // Función para agrupar incidencias por mes
  const agruparIncidenciasPorMes = (incidencias) => {
    const grupos = {};
    incidencias.forEach(incidencia => {
      const mesAnio = obtenerMesAnio(incidencia.created_at);
      if (!grupos[mesAnio]) {
        grupos[mesAnio] = [];
      }
      grupos[mesAnio].push(incidencia);
    });
    return grupos;
  };

  // Función para agrupar estrellas por mes
  const agruparEstrellasPorMes = (estrellas) => {
    const grupos = {};
    estrellas.forEach(estrella => {
      const mesAnio = obtenerMesAnio(estrella.created_at);
      if (!grupos[mesAnio]) {
        grupos[mesAnio] = [];
      }
      grupos[mesAnio].push(estrella);
    });
    return grupos;
  };

  // Función para agrupar asistencias por mes
  const agruparAsistenciasPorMes = (asistencias) => {
    const grupos = {};
    asistencias.forEach(asistencia => {
      const mesAnio = obtenerMesAnio(asistencia.fecha);
      if (!grupos[mesAnio]) {
        grupos[mesAnio] = [];
      }
      grupos[mesAnio].push(asistencia);
    });
    return grupos;
  };

  // Función para exportar incidencias a PDF por mes
  const handleExportarIncidenciasPDF = async (mesAnio, incidenciasMes) => {
    try {
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const margin = 15;
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const contentWidth = pageWidth - (margin * 2);
      let yPos = margin;

      // Header
      doc.setFillColor(79, 70, 229);
      doc.rect(0, 0, pageWidth, 30, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('INCIDENCIAS', pageWidth / 2, 12, { align: 'center' });
      doc.setFontSize(12);
      doc.text(`${hijoSeleccionado?.nombres} ${hijoSeleccionado?.apellido_paterno}`, pageWidth / 2, 20, { align: 'center' });
      doc.setFontSize(10);
      doc.text(mesAnio, pageWidth / 2, 26, { align: 'center' });

      yPos = 40;

      // Cards de incidencias
      incidenciasMes.forEach((incidencia, index) => {
        if (yPos > pageHeight - 50) {
          doc.addPage();
          yPos = margin;
        }

        const color = coloresPastel[index % coloresPastel.length];
        const cardHeight = 35;

        // Fondo del card
        doc.setFillColor(
          parseInt(color.bg.substring(1, 3), 16),
          parseInt(color.bg.substring(3, 5), 16),
          parseInt(color.bg.substring(5, 7), 16)
        );
        doc.roundedRect(margin, yPos, contentWidth, cardHeight, 3, 3, 'F');

        // Borde
        doc.setDrawColor(
          parseInt(color.border.substring(1, 3), 16),
          parseInt(color.border.substring(3, 5), 16),
          parseInt(color.border.substring(5, 7), 16)
        );
        doc.setLineWidth(1);
        doc.roundedRect(margin, yPos, contentWidth, cardHeight, 3, 3);

        // Contenido
        doc.setTextColor(30, 41, 59);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.text('Fecha:', margin + 3, yPos + 6);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.text(formatearFecha(incidencia.created_at), margin + 20, yPos + 6);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.text('Docente:', margin + 3, yPos + 12);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.text(incidencia.docente_nombre || 'N/A', margin + 20, yPos + 12);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.text('Curso:', margin + 3, yPos + 18);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.text(incidencia.curso_nombre || 'N/A', margin + 20, yPos + 18);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        const descY = yPos + 24;
        doc.text('Detalle:', margin + 3, descY);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        const descLines = doc.splitTextToSize(incidencia.description || 'Sin detalle', contentWidth - 25);
        descLines.forEach((line, idx) => {
          doc.text(line, margin + 20, descY + (idx * 4));
        });

        // Ajustar altura del card según el contenido
        const descHeight = descLines.length * 4;
        yPos += Math.max(cardHeight, descY + descHeight - yPos) + 8;
      });

      const nombreArchivo = `Incidencias_${hijoSeleccionado?.nombres?.replace(/\s+/g, '_')}_${mesAnio.replace(/\s+/g, '_')}_${new Date().getTime()}.pdf`;
      doc.save(nombreArchivo);

      Swal.fire({
        title: '¡PDF Generado!',
        text: 'Las incidencias se han exportado correctamente',
        icon: 'success'
      });
    } catch (error) {
      console.error('Error generando PDF:', error);
      Swal.fire({
        title: 'Error',
        text: 'No se pudo generar el PDF',
        icon: 'error'
      });
    }
  };

  // Función para exportar estrellas a PDF por mes
  const handleExportarEstrellasPDF = async (mesAnio, estrellasMes) => {
    try {
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const margin = 15;
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const contentWidth = pageWidth - (margin * 2);
      let yPos = margin;

      // Header
      doc.setFillColor(251, 191, 36);
      doc.rect(0, 0, pageWidth, 30, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('ESTRELLAS', pageWidth / 2, 12, { align: 'center' });
      doc.setFontSize(12);
      doc.text(`${hijoSeleccionado?.nombres} ${hijoSeleccionado?.apellido_paterno}`, pageWidth / 2, 20, { align: 'center' });
      doc.setFontSize(10);
      doc.text(mesAnio, pageWidth / 2, 26, { align: 'center' });

      // Total de estrellas del mes
      const totalMes = estrellasMes.reduce((sum, e) => sum + (e.points || 0), 0);
      yPos = 40;
      doc.setFillColor(251, 191, 36);
      doc.roundedRect(margin, yPos, contentWidth, 10, 3, 3, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text(`Total del mes: ${totalMes} estrellas`, pageWidth / 2, yPos + 7, { align: 'center' });
      yPos += 15;

      // Cards de estrellas
      estrellasMes.forEach((estrella, index) => {
        if (yPos > pageHeight - 50) {
          doc.addPage();
          yPos = margin;
        }

        const color = coloresPastel[index % coloresPastel.length];
        const cardHeight = 35;

        // Fondo del card
        doc.setFillColor(
          parseInt(color.bg.substring(1, 3), 16),
          parseInt(color.bg.substring(3, 5), 16),
          parseInt(color.bg.substring(5, 7), 16)
        );
        doc.roundedRect(margin, yPos, contentWidth, cardHeight, 3, 3, 'F');

        // Borde
        doc.setDrawColor(
          parseInt(color.border.substring(1, 3), 16),
          parseInt(color.border.substring(3, 5), 16),
          parseInt(color.border.substring(5, 7), 16)
        );
        doc.setLineWidth(1);
        doc.roundedRect(margin, yPos, contentWidth, cardHeight, 3, 3);

        // Contenido
        doc.setTextColor(30, 41, 59);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.text('Fecha:', margin + 3, yPos + 6);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.text(formatearFecha(estrella.created_at), margin + 20, yPos + 6);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.text('Estrellas:', margin + 3, yPos + 12);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.text(`${estrella.points || 0}`, margin + 20, yPos + 12);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.text('Docente:', margin + 3, yPos + 18);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.text(estrella.docente_nombre || 'N/A', margin + 20, yPos + 18);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.text('Curso:', margin + 3, yPos + 24);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.text(estrella.curso_nombre || 'N/A', margin + 20, yPos + 24);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        const descY = yPos + 30;
        doc.text('Detalle:', margin + 3, descY);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        const descLines = doc.splitTextToSize(estrella.description || 'Sin detalle', contentWidth - 25);
        descLines.forEach((line, idx) => {
          doc.text(line, margin + 20, descY + (idx * 4));
        });

        // Ajustar altura del card según el contenido
        const descHeight = descLines.length * 4;
        yPos += Math.max(cardHeight, descY + descHeight - yPos) + 8;
      });

      const nombreArchivo = `Estrellas_${hijoSeleccionado?.nombres?.replace(/\s+/g, '_')}_${mesAnio.replace(/\s+/g, '_')}_${new Date().getTime()}.pdf`;
      doc.save(nombreArchivo);

      Swal.fire({
        title: '¡PDF Generado!',
        text: 'Las estrellas se han exportado correctamente',
        icon: 'success'
      });
    } catch (error) {
      console.error('Error generando PDF:', error);
      Swal.fire({
        title: 'Error',
        text: 'No se pudo generar el PDF',
        icon: 'error'
      });
    }
  };

  // Función para exportar asistencias a PDF
  const handleExportarAsistenciasPDF = async (mesAnio, asistenciasMes) => {
    try {
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const margin = 15;
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const contentWidth = pageWidth - (margin * 2);
      let yPos = margin;

      // Header
      doc.setFillColor(33, 150, 243);
      doc.rect(0, 0, pageWidth, 30, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('ASISTENCIAS', pageWidth / 2, 12, { align: 'center' });
      doc.setFontSize(12);
      doc.text(`${hijoSeleccionado?.nombres} ${hijoSeleccionado?.apellido_paterno}`, pageWidth / 2, 20, { align: 'center' });
      doc.setFontSize(10);
      doc.text(mesAnio, pageWidth / 2, 26, { align: 'center' });

      yPos = 40;

      // Primero: Cards de estadísticas (3 cards horizontales)
      const statCardWidth = (contentWidth - (10 * 2)) / 3;
      const statCardHeight = 20;
      const statYPos = yPos;
      
      // Card Presentes
      doc.setFillColor(227, 242, 253);
      doc.roundedRect(margin, statYPos, statCardWidth, statCardHeight, 3, 3, 'F');
      doc.setDrawColor(33, 150, 243);
      doc.setLineWidth(1);
      doc.roundedRect(margin, statYPos, statCardWidth, statCardHeight, 3, 3);
      doc.setTextColor(21, 101, 192);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text('Presentes:', margin + 5, statYPos + 7);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      const totalPresentes = asistenciasMes.filter(a => a.tipo === 'PRESENTE' || a.tipo === 'TARDANZA_JUSTIFICADA').length;
      doc.text(totalPresentes.toString(), margin + 5, statYPos + 15);
      
      // Card Tardanzas
      doc.setFillColor(255, 243, 224);
      doc.roundedRect(margin + statCardWidth + 10, statYPos, statCardWidth, statCardHeight, 3, 3, 'F');
      doc.setDrawColor(255, 152, 0);
      doc.roundedRect(margin + statCardWidth + 10, statYPos, statCardWidth, statCardHeight, 3, 3);
      doc.setTextColor(230, 81, 0);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text('Tardanzas:', margin + statCardWidth + 15, statYPos + 7);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      const totalTardanzas = asistenciasMes.filter(a => a.tipo === 'TARDANZA' || a.tipo === 'TARDANZA_JUSTIFICADA').length;
      doc.text(totalTardanzas.toString(), margin + statCardWidth + 15, statYPos + 15);
      
      // Card Faltas
      doc.setFillColor(255, 235, 238);
      doc.roundedRect(margin + (statCardWidth + 10) * 2, statYPos, statCardWidth, statCardHeight, 3, 3, 'F');
      doc.setDrawColor(244, 67, 54);
      doc.roundedRect(margin + (statCardWidth + 10) * 2, statYPos, statCardWidth, statCardHeight, 3, 3);
      doc.setTextColor(198, 40, 40);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text('Faltas:', margin + (statCardWidth + 10) * 2 + 5, statYPos + 7);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      const totalFaltas = asistenciasMes.filter(a => a.tipo === 'FALTA' || a.tipo === 'FALTA_JUSTIFICADA').length;
      doc.text(totalFaltas.toString(), margin + (statCardWidth + 10) * 2 + 5, statYPos + 15);

      yPos = statYPos + statCardHeight + 15;

      // Luego: Lista de asistencias (formato igual al modal)
      asistenciasMes.forEach((asistencia, index) => {
        // Si no cabe en la página actual, nueva página
        if (yPos > pageHeight - 50) {
          doc.addPage();
          yPos = margin;
        }

        const tipoColor = {
          'PRESENTE': { bg: [232, 245, 233], border: [76, 175, 80], text: [46, 125, 50] },
          'TARDANZA': { bg: [255, 243, 224], border: [255, 152, 0], text: [230, 81, 0] },
          'TARDANZA_JUSTIFICADA': { bg: [227, 242, 253], border: [33, 150, 243], text: [21, 101, 192] },
          'FALTA': { bg: [255, 235, 238], border: [244, 67, 54], text: [198, 40, 40] },
          'FALTA_JUSTIFICADA': { bg: [243, 229, 245], border: [156, 39, 176], text: [106, 27, 154] }
        }[asistencia.tipo] || { bg: [245, 245, 245], border: [158, 158, 158], text: [66, 66, 66] };

        const cardHeight = 35;

        // Fondo del card
        doc.setFillColor(tipoColor.bg[0], tipoColor.bg[1], tipoColor.bg[2]);
        doc.roundedRect(margin, yPos, contentWidth, cardHeight, 3, 3, 'F');

        // Borde
        doc.setDrawColor(tipoColor.border[0], tipoColor.border[1], tipoColor.border[2]);
        doc.setLineWidth(1);
        doc.roundedRect(margin, yPos, contentWidth, cardHeight, 3, 3);

        // Contenido
        doc.setTextColor(tipoColor.text[0], tipoColor.text[1], tipoColor.text[2]);
        
        // Fecha y Estado en la misma fila
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        const fechaFormateada = new Date(asistencia.fecha).toLocaleDateString('es-PE', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
        doc.text(fechaFormateada, margin + 3, yPos + 7);
        
        // Estado al costado
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        const tipoTexto = asistencia.tipo.replace('_', ' ');
        const estadoX = margin + contentWidth - 50;
        doc.text(tipoTexto, estadoX, yPos + 7);

        // Labels "Entrada:" y "Salida:" en la misma fila
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.text('Entrada:', margin + 3, yPos + 16);
        if (asistencia.hora_salida) {
          doc.text('Salida:', margin + 60, yPos + 16);
        }

        // Horas en la siguiente fila
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.text(asistencia.hora_entrada || 'No registrada', margin + 3, yPos + 23);
        if (asistencia.hora_salida) {
          doc.text(asistencia.hora_salida, margin + 60, yPos + 23);
        }

        yPos += cardHeight + 5;
      });

      const nombreArchivo = `Asistencias_${hijoSeleccionado?.nombres?.replace(/\s+/g, '_')}_${hijoSeleccionado?.apellido_paterno?.replace(/\s+/g, '_')}_${mesAnio.replace(/\s+/g, '_')}_${new Date().getTime()}.pdf`;
      doc.save(nombreArchivo);

      Swal.fire({
        title: '¡PDF Generado!',
        text: 'Las asistencias se han exportado correctamente',
        icon: 'success'
      });
    } catch (error) {
      console.error('Error generando PDF:', error);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'No se pudo exportar el PDF',
        confirmButtonText: 'Entendido'
      });
    }
  };

  // Colores pastel para las cards
  const coloresPastel = [
    { bg: '#FFE5E5', border: '#FFB3B3', text: '#8B0000' }, // Rosa pastel
    { bg: '#E5F3FF', border: '#B3D9FF', text: '#003366' }, // Azul pastel
    { bg: '#E5FFE5', border: '#B3FFB3', text: '#006600' }, // Verde pastel
    { bg: '#FFF5E5', border: '#FFD9B3', text: '#8B4500' }, // Naranja pastel
    { bg: '#F0E5FF', border: '#D9B3FF', text: '#4B0082' }, // Morado pastel
    { bg: '#E5FFFF', border: '#B3FFFF', text: '#006666' }, // Cyan pastel
    { bg: '#FFE5F0', border: '#FFB3D9', text: '#8B0040' }, // Rosa claro
    { bg: '#E5FFE5', border: '#B3FFB3', text: '#004D00' }, // Verde claro
  ];

  const handleExportarPDF = async () => {
    if (!qrData) {
      Swal.fire({
        title: 'Sin datos',
        text: 'No hay datos para exportar',
        icon: 'info'
      });
      return;
    }

    try {
      // Tamaño fotocheck vertical: 54mm x 89mm (portrait)
      const width = 54;
      const height = 89;
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: [width, height]
      });

      const margin = 2.5;
      const contentWidth = width - (margin * 2);

      // Fondo con gradiente suave
      doc.setFillColor(255, 255, 255);
      doc.rect(0, 0, width, height, 'F');
      doc.setFillColor(248, 250, 252);
      doc.rect(0, 0, width, height * 0.6, 'F');

      // Header con gradiente púrpura/azul
      const headerHeight = 8;
      doc.setFillColor(79, 70, 229); // #4f46e5
      doc.rect(0, 0, width, headerHeight, 'F');
      
      // Efecto de gradiente en header (simulado con rectángulo más claro)
      doc.setFillColor(99, 102, 241); // #6366f1
      doc.rect(0, headerHeight * 0.5, width, headerHeight * 0.5, 'F');

      // Nombre del colegio - en mayúsculas
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      const colegioNombre = (qrData.colegio_nombre || 'Vanguard Schools').toUpperCase();
      doc.text(colegioNombre, width / 2, 5.5, { align: 'center' });

      // Calcular espacio disponible
      const footerHeight = 6;
      const bodyHeight = height - headerHeight - footerHeight;
      let yPos = headerHeight + 3;

      // QR Code arriba centrado - centrado perfecto vertical y horizontal
      const qrSize = 28; // Tamaño optimizado para formato vertical
      const qrX = (width - qrSize) / 2; // Centrado horizontal perfecto
      const qrY = yPos; // Posición vertical

      // Obtener el elemento QR del DOM y convertirlo a imagen
      const qrElement = document.querySelector('#qr-card-modal-print .qr-code-wrapper svg');
      if (qrElement) {
        try {
          const svgData = new XMLSerializer().serializeToString(qrElement);
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          const img = new Image();
          
          const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
          const url = URL.createObjectURL(svgBlob);
          
          await new Promise((resolve, reject) => {
            img.onload = () => {
              canvas.width = 200;
              canvas.height = 200;
              ctx.drawImage(img, 0, 0);
              const imgData = canvas.toDataURL('image/png');
              
              // Dibujar fondo blanco para el QR - centrado perfecto
              const qrBoxSize = qrSize + 2;
              const qrBoxX = (width - qrBoxSize) / 2; // Centrado horizontal perfecto
              const qrBoxY = qrY - 1;
              doc.setFillColor(255, 255, 255);
              doc.roundedRect(qrBoxX, qrBoxY, qrBoxSize, qrBoxSize, 1, 1, 'F');
              
              // Borde del QR
              doc.setDrawColor(224, 231, 255); // #e0e7ff
              doc.setLineWidth(0.5);
              doc.roundedRect(qrBoxX, qrBoxY, qrBoxSize, qrBoxSize, 1, 1);
              
              // QR centrado perfecto dentro del cuadro
              const qrImageX = qrBoxX + 1; // 1mm de padding desde el borde del cuadro
              const qrImageY = qrBoxY + 1;
              doc.addImage(imgData, 'PNG', qrImageX, qrImageY, qrSize, qrSize);
              
              URL.revokeObjectURL(url);
              resolve();
            };
            img.onerror = reject;
            img.src = url;
          });
        } catch (error) {
          console.warn('Error convirtiendo QR a imagen, usando placeholder:', error);
          const qrBoxSize = qrSize + 2;
          const qrBoxX = (width - qrBoxSize) / 2;
          const qrBoxY = qrY - 1;
          doc.setFillColor(240, 240, 240);
          doc.roundedRect(qrBoxX, qrBoxY, qrBoxSize, qrBoxSize, 1, 1, 'F');
          doc.setDrawColor(200, 200, 200);
          doc.roundedRect(qrBoxX, qrBoxY, qrBoxSize, qrBoxSize, 1, 1);
        }
      } else {
        const qrBoxSize = qrSize + 2;
        const qrBoxX = (width - qrBoxSize) / 2;
        const qrBoxY = qrY - 1;
        doc.setFillColor(240, 240, 240);
        doc.roundedRect(qrBoxX, qrBoxY, qrBoxSize, qrBoxSize, 1, 1, 'F');
        doc.setDrawColor(200, 200, 200);
        doc.roundedRect(qrBoxX, qrBoxY, qrBoxSize, qrBoxSize, 1, 1);
      }

      // Información del alumno debajo del QR - estilo card (2mm más abajo)
      const infoStartY = qrY + qrSize + 6; // 2mm más abajo (de 4 a 6)
      const cardPadding = 1.5;
      const cardSpacing = 2.5;
      let currentY = infoStartY;

      // Card Nombres
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(margin, currentY, contentWidth, 9, 1, 1, 'F');
      doc.setDrawColor(224, 231, 255);
      doc.setLineWidth(0.3);
      doc.roundedRect(margin, currentY, contentWidth, 9, 1, 1);
      
      // Label Nombres - centrado
      const labelWidth = 12;
      const labelX = (width - labelWidth) / 2; // Centrado
      doc.setFillColor(238, 242, 255); // #eef2ff
      doc.roundedRect(labelX, currentY + 0.5, labelWidth, 2.5, 0.5, 0.5, 'F');
      doc.setTextColor(99, 102, 241); // #6366f1
      doc.setFontSize(5);
      doc.setFont('helvetica', 'bold');
      doc.text('NOMBRES:', width / 2, currentY + 2, { align: 'center' });
      
      // Valor Nombres - centrado
      doc.setTextColor(30, 41, 59); // #1e293b
      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      const nombres = qrData.nombres || '';
      const nombresLines = doc.splitTextToSize(nombres, contentWidth - (cardPadding * 2) - 2);
      nombresLines.forEach((line, idx) => {
        doc.text(line, width / 2, currentY + 5.5 + (idx * 3.5), { align: 'center', maxWidth: contentWidth - (cardPadding * 2) });
      });
      currentY += 9 + cardSpacing;

      // Card Apellidos
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(margin, currentY, contentWidth, 9, 1, 1, 'F');
      doc.setDrawColor(224, 231, 255);
      doc.roundedRect(margin, currentY, contentWidth, 9, 1, 1);
      
      // Label Apellidos - centrado
      const labelWidthApellidos = 13;
      const labelXApellidos = (width - labelWidthApellidos) / 2; // Centrado
      doc.setFillColor(238, 242, 255);
      doc.roundedRect(labelXApellidos, currentY + 0.5, labelWidthApellidos, 2.5, 0.5, 0.5, 'F');
      doc.setTextColor(99, 102, 241);
      doc.setFontSize(5);
      doc.setFont('helvetica', 'bold');
      doc.text('APELLIDOS:', width / 2, currentY + 2, { align: 'center' });
      
      doc.setTextColor(30, 41, 59);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      const apellidos = `${qrData.apellido_paterno || ''} ${qrData.apellido_materno || ''}`.trim();
      const apellidosLines = doc.splitTextToSize(apellidos, contentWidth - (cardPadding * 2) - 2);
      apellidosLines.forEach((line, idx) => {
        doc.text(line, width / 2, currentY + 5.5 + (idx * 3.5), { align: 'center', maxWidth: contentWidth - (cardPadding * 2) });
      });
      currentY += 9 + cardSpacing;

      // Card Sección (si existe)
      if (qrData.grupo) {
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(margin, currentY, contentWidth, 9, 1, 1, 'F');
        doc.setDrawColor(224, 231, 255);
        doc.roundedRect(margin, currentY, contentWidth, 9, 1, 1);
        
        // Label Sección - centrado
        const labelWidthSeccion = 11;
        const labelXSeccion = (width - labelWidthSeccion) / 2; // Centrado
        doc.setFillColor(238, 242, 255);
        doc.roundedRect(labelXSeccion, currentY + 0.5, labelWidthSeccion, 2.5, 0.5, 0.5, 'F');
        doc.setTextColor(99, 102, 241);
        doc.setFontSize(5);
        doc.setFont('helvetica', 'bold');
        doc.text('SECCIÓN:', width / 2, currentY + 2, { align: 'center' });
        
        doc.setTextColor(30, 41, 59);
        doc.setFontSize(7);
        doc.setFont('helvetica', 'bold');
        const grupoLines = doc.splitTextToSize(qrData.grupo, contentWidth - (cardPadding * 2) - 2);
        grupoLines.forEach((line, idx) => {
          doc.text(line, width / 2, currentY + 5.5 + (idx * 3.5), { align: 'center', maxWidth: contentWidth - (cardPadding * 2) });
        });
      }

      // Footer con año - gradiente
      const footerY = height - footerHeight;
      doc.setFillColor(79, 70, 229); // #4f46e5
      doc.rect(0, footerY, width, footerHeight, 'F');
      doc.setFillColor(99, 102, 241); // #6366f1
      doc.rect(0, footerY + footerHeight * 0.5, width, footerHeight * 0.5, 'F');
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(255, 255, 255);
      doc.text(qrData.anio?.toString() || '2026', width / 2, footerY + 4, { align: 'center' });

      const nombreArchivo = `Fotocheck_${qrData.nombre_completo?.replace(/\s+/g, '_') || 'Alumno'}_${new Date().getTime()}.pdf`;
      doc.save(nombreArchivo);

      Swal.fire({
        title: '¡PDF Generado!',
        text: 'El fotocheck se ha exportado correctamente',
        icon: 'success'
      });
    } catch (error) {
      console.error('Error generando PDF:', error);
      Swal.fire({
        title: 'Error',
        text: 'No se pudo generar el PDF',
        icon: 'error'
      });
    }
  };

  const handleGuardarDatos = async (e) => {
    e.preventDefault();
    
    try {
      setSaving(true);
      
      if (fotoFile) {
        setUploadingPhoto(true);
      }
      
      const formDataToSend = new FormData();
      formDataToSend.append('nombres', formData.nombres);
      formDataToSend.append('apellido_paterno', formData.apellido_paterno);
      formDataToSend.append('apellido_materno', formData.apellido_materno);
      formDataToSend.append('email', formData.email);
      formDataToSend.append('sexo', formData.sexo || '');
      formDataToSend.append('fecha_nacimiento', formData.fecha_nacimiento);
      
      if (fotoFile) {
        formDataToSend.append('foto', fotoFile);
      }

      await api.put(`/docente/hijos/${hijoSeleccionado.id}/datos`, formDataToSend, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      if (fotoFile) {
        setTimeout(() => {
          setUploadingPhoto(false);
        }, 2000);
      }

      Swal.fire({
        icon: 'success',
        title: '¡Datos actualizados!',
        text: fotoFile ? 'Los datos se han actualizado. La foto se está subiendo...' : 'Los datos se han actualizado correctamente',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000,
        timerProgressBar: true
      });

      // Recargar lista de hijos
      await cargarHijos();
      
      // Cerrar modal
      setShowModalEditar(false);
      setHijoSeleccionado(null);
      setFotoFile(null);
      setFotoPreview(null);
    } catch (error) {
      console.error('Error guardando datos:', error);
      setUploadingPhoto(false);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: error.response?.data?.error || 'No se pudieron actualizar los datos',
        confirmButtonText: 'Entendido'
      });
    } finally {
      setSaving(false);
    }
  };

  // Construir URL de foto del alumno
  const getFotoUrl = (foto) => {
    if (!foto || foto === '') return null;
    
    const currentHost = window.location.hostname;
    const currentProtocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
    
    // Si ya es una URL completa
    if (foto.startsWith('http')) {
      return foto;
    }
    
    // Si es una ruta relativa
    if (foto.startsWith('/')) {
      return `${currentProtocol}//${currentHost}${foto}`;
    }
    
    // Si solo tenemos el nombre del archivo
    const phpSystemUrl = 'https://nuevo.vanguardschools.edu.pe';
    const isProduction = currentHost !== 'localhost' && currentHost !== '127.0.0.1';
    
    if (isProduction) {
      return `${phpSystemUrl}/Static/Image/Fotos/${foto}`;
    } else {
      return `http://localhost:5000/Static/Image/Fotos/${foto}`;
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="docente-hijos-loading">
          <div className="loading-spinner">Cargando...</div>
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
                <p>Cursos de {hijoSeleccionado?.nombres} {hijoSeleccionado?.apellido_paterno}</p>
              </div>
              <button 
                className="btn-volver"
                onClick={() => setMostrarCursos(false)}
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
                            handleEnviarMensaje(curso);
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
              <p>No hay cursos asignados para el año académico actual</p>
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
                  <div className="mensaje-grupo-info">
                    <p><strong>Docente:</strong> {docenteParaMensaje.nombre}</p>
                    <p><strong>Curso:</strong> {docenteParaMensaje.curso_nombre}</p>
                    <p className="mensaje-info-text">El mensaje se enviará directamente al docente</p>
                  </div>

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
        </div>
      </DashboardLayout>
    );
  }

  if (!esApoderado) {
    return (
      <DashboardLayout>
        <div className="docente-hijos">
          <div className="no-apoderado mundo-card">
            <h2>No eres apoderado</h2>
            <p>No tienes hijos registrados estudiando en el colegio en el año académico actual.</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="docente-hijos">
        <div className="page-header">
          <h1>👨‍👩‍👧‍👦 Hijos a Cargo</h1>
          <p>Gestiona la información de tus hijos estudiantes</p>
        </div>

        {hijos.length > 0 ? (
          <div className="hijos-content mundo-card">
            <div className="hijos-list">
              <h2>Mis Hijos ({hijos.length})</h2>
              <div className="hijos-grid">
                {hijos.map((hijo, index) => {
                  const fotoUrl = getFotoUrl(hijo.foto);
                  const nombreCompleto = `${hijo.nombres || ''} ${hijo.apellido_paterno || ''} ${hijo.apellido_materno || ''}`.trim();
                  
                  // Colores pasteles diferentes para cada card
                  const coloresPasteles = [
                    { bg: 'linear-gradient(145deg, #fef3f2, #fff5f5)', border: '#fbcfe8', avatar: '#fee2e2' },
                    { bg: 'linear-gradient(145deg, #f0fdf4, #f0fdf4)', border: '#bbf7d0', avatar: '#dcfce7' },
                    { bg: 'linear-gradient(145deg, #eff6ff, #eff6ff)', border: '#bfdbfe', avatar: '#dbeafe' },
                    { bg: 'linear-gradient(145deg, #fefce8, #fefce8)', border: '#fde68a', avatar: '#fef3c7' },
                    { bg: 'linear-gradient(145deg, #f5f3ff, #f5f3ff)', border: '#ddd6fe', avatar: '#e9d5ff' },
                    { bg: 'linear-gradient(145deg, #f0f9ff, #f0f9ff)', border: '#bae6fd', avatar: '#e0f2fe' },
                    { bg: 'linear-gradient(145deg, #fdf2f8, #fdf2f8)', border: '#fbcfe8', avatar: '#fce7f3' },
                    { bg: 'linear-gradient(145deg, #ecfdf5, #ecfdf5)', border: '#a7f3d0', avatar: '#d1fae5' }
                  ];
                  
                  const colorCard = coloresPasteles[index % coloresPasteles.length];
                  
                  return (
                    <div 
                      key={hijo.id} 
                      className="hijo-card"
                      style={{
                        background: colorCard.bg,
                        borderColor: colorCard.border
                      }}
                    >
                      <div 
                        className="hijo-avatar"
                        style={{ backgroundColor: colorCard.avatar }}
                      >
                        {fotoUrl ? (
                          <img src={fotoUrl} alt={nombreCompleto} />
                        ) : (
                          <span>{hijo.nombres?.[0] || 'A'}</span>
                        )}
                      </div>
                      <div className="hijo-info">
                        <h3>{nombreCompleto}</h3>
                        <div className="hijo-details">
                          <p className="hijo-grupo">
                            <span className="label">Grupo:</span>
                            <span className="value">{hijo.grado}° {hijo.seccion}</span>
                          </p>
                          <p className="hijo-nivel">
                            <span className="label">Nivel:</span>
                            <span className="value">{hijo.nivel_nombre}</span>
                          </p>
                          <p className="hijo-turno">
                            <span className="label">Turno:</span>
                            <span className="value">{hijo.turno_nombre}</span>
                          </p>
                        </div>
                      </div>
                      
                      <div className="hijo-actions">
                        <div className="dropdown-container">
                          <button 
                            className="btn-opciones-hijo"
                            onClick={(e) => handleOpcionesClick(e, hijo.id)}
                            title="Opciones"
                          >
                            Opciones {openDropdown?.hijoId === hijo.id ? '▲' : '▼'}
                          </button>
                          
                          {openDropdown?.hijoId === hijo.id && openDropdown?.top && 
                            createPortal(
                              <div 
                                ref={dropdownRef}
                                className="dropdown-menu dropdown-menu-hijo"
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
                                    handleOpcionClick('editar-datos', hijo);
                                  }}
                                >
                                  <span className="dropdown-icon">✏️</span>
                                  <span>Editar Datos</span>
                                </button>
                                <button
                                  className="dropdown-item"
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpcionClick('cursos-asignados', hijo);
                                  }}
                                >
                                  <span className="dropdown-icon">📚</span>
                                  <span>Cursos Asignados</span>
                                </button>
                                <button
                                  className="dropdown-item"
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpcionClick('incidencias', hijo);
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
                                    handleOpcionClick('estrellas', hijo);
                                  }}
                                >
                                  <span className="dropdown-icon">⭐</span>
                                  <span>Estrellas</span>
                                </button>
                                <button
                                  className="dropdown-item"
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpcionClick('asistencias', hijo);
                                  }}
                                >
                                  <span className="dropdown-icon">✅</span>
                                  <span>Asistencias</span>
                                </button>
                                <button
                                  className="dropdown-item"
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpcionClick('imprimir-qr', hijo);
                                  }}
                                >
                                  <span className="dropdown-icon">🖨️</span>
                                  <span>Imprimir QR</span>
                                </button>
                                <button
                                  className="dropdown-item"
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpcionClick('imprimir-notas', hijo);
                                  }}
                                >
                                  <span className="dropdown-icon">📄</span>
                                  <span>Imprimir Notas</span>
                                </button>
                                <button
                                  className="dropdown-item"
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpcionClick('pagos-realizados', hijo);
                                  }}
                                >
                                  <span className="dropdown-icon">💳</span>
                                  <span>Pagos Realizados</span>
                                </button>
                                <button
                                  className="dropdown-item"
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpcionClick('psicologia', hijo);
                                  }}
                                >
                                  <span className="dropdown-icon">🧠</span>
                                  <span>Psicología</span>
                                </button>
                                <button
                                  className="dropdown-item"
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpcionClick('reiniciar-contrasena', hijo);
                                  }}
                                >
                                  <span className="dropdown-icon">🔑</span>
                                  <span>Reiniciar Contraseña</span>
                                </button>
                              </div>,
                              document.body
                            )
                          }
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="hijos-content mundo-card">
            <div className="empty-state">
              <p>No se encontraron hijos registrados.</p>
            </div>
          </div>
        )}
      </div>

      {/* Modal Editar Datos */}
      {showModalEditar && hijoSeleccionado && createPortal(
        <div className="modal-overlay" onClick={() => !saving && setShowModalEditar(false)}>
          <div className="modal-content modal-editar-hijo" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>✏️ Editar Datos del Alumno</h2>
              <button 
                className="modal-close-btn"
                onClick={() => !saving && setShowModalEditar(false)}
                disabled={saving}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleGuardarDatos} className="modal-form">
              {/* Sección de Foto */}
              <div className="modal-section">
                <h3 className="section-title">Foto de Perfil</h3>
                <div className="foto-upload-container">
                  <div className="foto-preview-wrapper">
                    <div className="foto-preview">
                      {fotoPreview ? (
                        <img 
                          src={fotoPreview} 
                          alt="Foto de perfil"
                          onError={(e) => {
                            e.target.style.display = 'none';
                            const placeholder = e.target.parentElement.querySelector('.foto-placeholder');
                            if (placeholder) placeholder.style.display = 'flex';
                          }}
                        />
                      ) : null}
                      <div className="foto-placeholder" style={{ display: fotoPreview ? 'none' : 'flex' }}>
                        {getInitials(`${formData.nombres} ${formData.apellido_paterno}`)}
                      </div>
                    </div>
                    {uploadingPhoto && (
                      <div className="photo-upload-overlay">
                        <div className="upload-spinner">
                          <div className="spinner-ring"></div>
                          <div className="spinner-ring"></div>
                          <div className="spinner-ring"></div>
                        </div>
                        <p className="upload-text">Subiendo foto...</p>
                      </div>
                    )}
                  </div>
                  <label className="foto-upload-btn" style={{ opacity: uploadingPhoto ? 0.6 : 1, pointerEvents: uploadingPhoto ? 'none' : 'auto' }}>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFotoChange}
                      style={{ display: 'none' }}
                      disabled={uploadingPhoto || saving}
                    />
                    📷 Cambiar Foto
                  </label>
                  <p className="foto-hint">Formatos: JPG, PNG, GIF, WEBP (máx. 5MB)</p>
                </div>
              </div>

              {/* Información Personal */}
              <div className="modal-section">
                <h3 className="section-title">Información Personal</h3>
                <div className="form-grid">
                  <div className="form-group">
                    <label htmlFor="nombres">Nombres *</label>
                    <input
                      type="text"
                      id="nombres"
                      name="nombres"
                      value={formData.nombres}
                      onChange={handleInputChange}
                      required
                      disabled={saving}
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="apellido_paterno">Apellido Paterno *</label>
                    <input
                      type="text"
                      id="apellido_paterno"
                      name="apellido_paterno"
                      value={formData.apellido_paterno}
                      onChange={handleInputChange}
                      required
                      disabled={saving}
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="apellido_materno">Apellido Materno</label>
                    <input
                      type="text"
                      id="apellido_materno"
                      name="apellido_materno"
                      value={formData.apellido_materno}
                      onChange={handleInputChange}
                      disabled={saving}
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="email">Email</label>
                    <input
                      type="email"
                      id="email"
                      name="email"
                      value={formData.email}
                      onChange={handleInputChange}
                      disabled={saving}
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="sexo">Sexo</label>
                    <select
                      id="sexo"
                      name="sexo"
                      value={formData.sexo}
                      onChange={handleInputChange}
                      disabled={saving}
                    >
                      <option value="">Seleccionar...</option>
                      <option value="0">Masculino</option>
                      <option value="1">Femenino</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label htmlFor="fecha_nacimiento">Fecha de Nacimiento</label>
                    <input
                      type="date"
                      id="fecha_nacimiento"
                      name="fecha_nacimiento"
                      value={formData.fecha_nacimiento}
                      onChange={handleInputChange}
                      disabled={saving}
                    />
                  </div>
                </div>
              </div>

              {/* Información de Solo Lectura */}
              <div className="modal-section">
                <h3 className="section-title">Información del Sistema</h3>
                <div className="info-grid">
                  <div className="info-item">
                    <span className="info-label">DNI:</span>
                    <span className="info-value">{dniHijo}</span>
                  </div>
                </div>
              </div>

              {/* Botones */}
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-cancelar"
                  onClick={() => !saving && setShowModalEditar(false)}
                  disabled={saving}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn-guardar"
                  disabled={saving}
                >
                  {saving ? 'Guardando...' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Modal QR del Hijo */}
      {showModalQR && createPortal(
        <div className="modal-overlay-qr" onClick={() => setShowModalQR(false)}>
          <div className="modal-content-qr" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-qr">
              <h2>📱 QR de {hijoSeleccionado?.nombres} {hijoSeleccionado?.apellido_paterno}</h2>
              <button className="modal-close-qr" onClick={() => setShowModalQR(false)}>×</button>
            </div>

            <div className="modal-body-qr">
              {loadingQR ? (
                <div className="qr-loading">
                  <div className="loading-spinner">Cargando datos...</div>
                </div>
              ) : qrData ? (
                <>
                  <div className="qr-header-actions">
                    <button className="btn-exportar-qr" onClick={handleExportarPDF}>
                      <span className="btn-icon">📄</span>
                      <span className="btn-text">Exportar</span>
                    </button>
                  </div>

                  <div className="qr-card-container-modal">
                    <div className="qr-card-modal" id="qr-card-modal-print">
                      {/* Borde superior con nombre del colegio */}
                      <div className="qr-card-header">
                        <h2 className="qr-colegio-nombre">{qrData.colegio_nombre || 'Vanguard Schools'}</h2>
                      </div>

                      {/* Contenido principal - Layout Vertical */}
                      <div className="qr-card-body">
                        {/* QR Code arriba centrado */}
                        <div className="qr-code-section">
                          <div className="qr-code-wrapper">
                            <QRCodeSVG 
                              value={qrData.qr_data || qrData.nro_documento || 'ALUMNO'}
                              size={220}
                              level="H"
                              includeMargin={true}
                            />
                          </div>
                        </div>

                        {/* Información del alumno debajo */}
                        <div className="qr-info-section">
                          <div className="qr-info-item">
                            <label className="qr-info-label">Nombres:</label>
                            <p className="qr-info-value">{qrData.nombres || ''}</p>
                          </div>
                          <div className="qr-info-item">
                            <label className="qr-info-label">Apellidos:</label>
                            <p className="qr-info-value">
                              {`${qrData.apellido_paterno || ''} ${qrData.apellido_materno || ''}`.trim()}
                            </p>
                          </div>
                          {qrData.grupo && (
                            <div className="qr-info-item">
                              <label className="qr-info-label">Sección:</label>
                              <p className="qr-info-value">{qrData.grupo}</p>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Año en la parte inferior */}
                      <div className="qr-card-footer">
                        <span className="qr-anio">{qrData.anio || '2026'}</span>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="qr-error">
                  <p>No se pudieron cargar los datos del QR</p>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal Incidencias */}
      {showModalIncidencias && createPortal(
        <div className="modal-overlay-qr" onClick={() => setShowModalIncidencias(false)}>
          <div className="modal-content-incidencias" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-qr">
              <h2>📋 Incidencias de {hijoSeleccionado?.nombres} {hijoSeleccionado?.apellido_paterno}</h2>
              <button className="modal-close-qr" onClick={() => setShowModalIncidencias(false)}>×</button>
            </div>

            <div className="modal-body-incidencias">
              {loadingIncidencias ? (
                <div className="qr-loading">
                  <div className="loading-spinner">Cargando incidencias...</div>
                </div>
              ) : incidencias.length === 0 ? (
                <div className="empty-state">
                  <p>No hay incidencias registradas</p>
                </div>
              ) : (() => {
                const gruposPorMes = agruparIncidenciasPorMes(incidencias);
                const mesesOrdenados = Object.keys(gruposPorMes).sort((a, b) => {
                  const dateA = new Date(gruposPorMes[a][0].created_at);
                  const dateB = new Date(gruposPorMes[b][0].created_at);
                  return dateB - dateA;
                });

                return (
                  <div className="grupos-mes-container">
                    {mesesOrdenados.map((mesAnio) => {
                      const incidenciasMes = gruposPorMes[mesAnio];
                      return (
                        <div key={mesAnio} className="grupo-mes">
                          <div className="grupo-mes-header">
                            <h3 className="mes-titulo">{mesAnio}</h3>
                            <button 
                              className="btn-exportar-mes"
                              onClick={() => handleExportarIncidenciasPDF(mesAnio, incidenciasMes)}
                            >
                              <span className="btn-icon">📄</span>
                              <span>Exportar PDF</span>
                            </button>
                          </div>
                          <div className="cards-container">
                            {incidenciasMes.map((incidencia, index) => {
                              const color = coloresPastel[index % coloresPastel.length];
                              return (
                                <div 
                                  key={incidencia.id} 
                                  className="incidencia-card"
                                  style={{
                                    backgroundColor: color.bg,
                                    borderColor: color.border,
                                    color: color.text
                                  }}
                                >
                                  <div className="card-header-incidencia">
                                    <div className="card-fecha">
                                      <span className="icon">📅</span>
                                      <span>{formatearFecha(incidencia.created_at)}</span>
                                    </div>
                                  </div>
                                  <div className="card-body-incidencia">
                                    <div className="card-info-row">
                                      <span className="label">Docente:</span>
                                      <span className="value">{incidencia.docente_nombre || 'N/A'}</span>
                                    </div>
                                    <div className="card-info-row">
                                      <span className="label">Curso:</span>
                                      <span className="value">{incidencia.curso_nombre || 'N/A'}</span>
                                    </div>
                                    <div className="card-info-row card-descripcion">
                                      <span className="label">Descripción:</span>
                                      <span className="value">{incidencia.description || 'Sin descripción'}</span>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal Estrellas */}
      {showModalEstrellas && createPortal(
        <div className="modal-overlay-qr" onClick={() => setShowModalEstrellas(false)}>
          <div className="modal-content-estrellas" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-qr">
              <h2>⭐ Estrellas de {hijoSeleccionado?.nombres} {hijoSeleccionado?.apellido_paterno}</h2>
              <button className="modal-close-qr" onClick={() => setShowModalEstrellas(false)}>×</button>
            </div>

            <div className="modal-body-estrellas">
              {loadingEstrellas ? (
                <div className="qr-loading">
                  <div className="loading-spinner">Cargando estrellas...</div>
                </div>
              ) : estrellas.length === 0 ? (
                <div className="empty-state">
                  <p>No hay estrellas registradas</p>
                </div>
              ) : (
                <>
                  <div className="total-estrellas-badge">
                    <span className="total-label">Total de Estrellas:</span>
                    <span className="total-value">{totalEstrellas}</span>
                  </div>
                  {(() => {
                    const gruposPorMes = agruparEstrellasPorMes(estrellas);
                    const mesesOrdenados = Object.keys(gruposPorMes).sort((a, b) => {
                      const dateA = new Date(gruposPorMes[a][0].created_at);
                      const dateB = new Date(gruposPorMes[b][0].created_at);
                      return dateB - dateA;
                    });

                    return (
                      <div className="grupos-mes-container">
                        {mesesOrdenados.map((mesAnio) => {
                          const estrellasMes = gruposPorMes[mesAnio];
                          const totalMes = estrellasMes.reduce((sum, e) => sum + (e.points || 0), 0);
                          return (
                            <div key={mesAnio} className="grupo-mes">
                              <div className="grupo-mes-header">
                                <div>
                                  <h3 className="mes-titulo">{mesAnio}</h3>
                                  <span className="mes-total">Total: {totalMes} estrellas</span>
                                </div>
                                <button 
                                  className="btn-exportar-mes"
                                  onClick={() => handleExportarEstrellasPDF(mesAnio, estrellasMes)}
                                >
                                  <span className="btn-icon">📄</span>
                                  <span>Exportar PDF</span>
                                </button>
                              </div>
                              <div className="cards-container">
                                {estrellasMes.map((estrella, index) => {
                                  const color = coloresPastel[index % coloresPastel.length];
                                  return (
                                    <div 
                                      key={estrella.id} 
                                      className="estrella-card"
                                      style={{
                                        backgroundColor: color.bg,
                                        borderColor: color.border,
                                        color: color.text
                                      }}
                                    >
                                      <div className="card-header-estrella">
                                        <div className="card-fecha">
                                          <span className="icon">📅</span>
                                          <span>{formatearFecha(estrella.created_at)}</span>
                                        </div>
                                        <div className="card-estrellas-count">
                                          <span className="icon">⭐</span>
                                          <span className="count">{estrella.points || 0}</span>
                                        </div>
                                      </div>
                                      <div className="card-body-estrella">
                                        <div className="card-info-row">
                                          <span className="label">Docente:</span>
                                          <span className="value">{estrella.docente_nombre || 'N/A'}</span>
                                        </div>
                                        <div className="card-info-row">
                                          <span className="label">Curso:</span>
                                          <span className="value">{estrella.curso_nombre || 'N/A'}</span>
                                        </div>
                                        <div className="card-info-row card-descripcion">
                                          <span className="label">Descripción:</span>
                                          <span className="value">{estrella.description || 'Sin descripción'}</span>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal Asistencias */}
      {showModalAsistencias && createPortal(
        <div className="modal-overlay-qr" onClick={() => setShowModalAsistencias(false)}>
          <div className="modal-content-estrellas" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-qr">
              <h2>📅 Asistencias de {hijoSeleccionado?.nombres} {hijoSeleccionado?.apellido_paterno}</h2>
              <button className="modal-close-qr" onClick={() => setShowModalAsistencias(false)}>×</button>
            </div>

            <div className="modal-body-estrellas">
              {loadingAsistencias ? (
                <div className="qr-loading">
                  <div className="loading-spinner">Cargando asistencias...</div>
                </div>
              ) : asistencias.length === 0 ? (
                <div className="empty-state">
                  <p>No hay asistencias registradas</p>
                </div>
              ) : (() => {
                const asistenciasPorMes = agruparAsistenciasPorMes(asistencias);
                const meses = Object.keys(asistenciasPorMes).sort((a, b) => {
                  const dateA = new Date(a);
                  const dateB = new Date(b);
                  return dateB - dateA;
                });

                const asistenciasFiltradas = filtroMesAsistencias === 'TODOS' 
                  ? asistencias 
                  : asistenciasPorMes[filtroMesAsistencias] || [];

                return (
                  <>
                    <div className="estadisticas-asistencias">
                      <div className="stat-card" style={{ backgroundColor: '#e3f2fd', borderColor: '#2196f3' }}>
                        <span className="stat-label">Presentes:</span>
                        <span className="stat-value">{totalPresentes}</span>
                      </div>
                      <div className="stat-card" style={{ backgroundColor: '#fff3e0', borderColor: '#ff9800' }}>
                        <span className="stat-label">Tardanzas:</span>
                        <span className="stat-value">{totalTardanzas}</span>
                      </div>
                      <div className="stat-card" style={{ backgroundColor: '#ffebee', borderColor: '#f44336' }}>
                        <span className="stat-label">Faltas:</span>
                        <span className="stat-value">{totalFaltas}</span>
                      </div>
                    </div>

                    {/* Filtros y botones de exportar */}
                    <div className="filtros-exportar-container">
                      <div className="filtros-mes">
                        <label>Filtrar por mes:</label>
                        <select 
                          value={filtroMesAsistencias} 
                          onChange={(e) => setFiltroMesAsistencias(e.target.value)}
                          className="select-filtro-mes"
                        >
                          <option value="TODOS">Todos los meses</option>
                          {meses.map(mes => (
                            <option key={mes} value={mes}>{mes}</option>
                          ))}
                        </select>
                      </div>
                      <div className="botones-exportar">
                        <button 
                          className="btn-exportar-pdf"
                          onClick={() => {
                            if (filtroMesAsistencias === 'TODOS') {
                              meses.forEach(mes => {
                                handleExportarAsistenciasPDF(mes, asistenciasPorMes[mes]);
                              });
                            } else {
                              handleExportarAsistenciasPDF(filtroMesAsistencias, asistenciasFiltradas);
                            }
                          }}
                        >
                          📄 {filtroMesAsistencias === 'TODOS' ? 'Exportar Todo a PDF' : `Exportar ${filtroMesAsistencias} a PDF`}
                        </button>
                      </div>
                    </div>

                    {/* Lista de asistencias agrupadas por mes */}
                    {filtroMesAsistencias === 'TODOS' ? (
                      meses.map(mes => (
                        <div key={mes} className="mes-grupo">
                          <div className="mes-header">
                            <h3>{mes}</h3>
                            <button 
                              className="btn-exportar-mes"
                              onClick={() => handleExportarAsistenciasPDF(mes, asistenciasPorMes[mes])}
                            >
                              📄 Exportar PDF
                            </button>
                          </div>
                          <div className="asistencias-grid">
                            {asistenciasPorMes[mes].map((asistencia, index) => {
                              const tipoColor = {
                                'PRESENTE': { bg: '#e8f5e9', border: '#4caf50', text: '#2e7d32' },
                                'TARDANZA': { bg: '#fff3e0', border: '#ff9800', text: '#e65100' },
                                'TARDANZA_JUSTIFICADA': { bg: '#e3f2fd', border: '#2196f3', text: '#1565c0' },
                                'FALTA': { bg: '#ffebee', border: '#f44336', text: '#c62828' },
                                'FALTA_JUSTIFICADA': { bg: '#f3e5f5', border: '#9c27b0', text: '#6a1b9a' }
                              }[asistencia.tipo] || { bg: '#f5f5f5', border: '#9e9e9e', text: '#424242' };
                              
                              return (
                                <div 
                                  key={asistencia.id} 
                                  className="asistencia-card"
                                  style={{
                                    backgroundColor: tipoColor.bg,
                                    borderColor: tipoColor.border,
                                    color: tipoColor.text
                                  }}
                                >
                                  <div className="card-header-incidencia">
                                    <div className="card-fecha">
                                      <span className="icon">📅</span>
                                      <span>{new Date(asistencia.fecha).toLocaleDateString('es-PE', { 
                                        day: 'numeric',
                                        month: 'short'
                                      })}</span>
                                    </div>
                                    <div className="card-tipo-asistencia">
                                      <span className={`badge-tipo badge-${asistencia.tipo.toLowerCase()}`}>
                                        {asistencia.tipo.replace('_', ' ')}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="card-body-estrella">
                                    <div className="card-info-row-labels">
                                      <span className="label">Entrada:</span>
                                      {asistencia.hora_salida && (
                                        <>
                                          <span className="separator">|</span>
                                          <span className="label">Salida:</span>
                                        </>
                                      )}
                                    </div>
                                    <div className="card-info-row-values">
                                      <span className="value">{asistencia.hora_entrada || 'N/A'}</span>
                                      {asistencia.hora_salida && (
                                        <>
                                          <span className="separator">|</span>
                                          <span className="value">{asistencia.hora_salida}</span>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="asistencias-grid">
                        {asistenciasFiltradas.map((asistencia, index) => {
                          const tipoColor = {
                            'PRESENTE': { bg: '#e8f5e9', border: '#4caf50', text: '#2e7d32' },
                            'TARDANZA': { bg: '#fff3e0', border: '#ff9800', text: '#e65100' },
                            'TARDANZA_JUSTIFICADA': { bg: '#e3f2fd', border: '#2196f3', text: '#1565c0' },
                            'FALTA': { bg: '#ffebee', border: '#f44336', text: '#c62828' },
                            'FALTA_JUSTIFICADA': { bg: '#f3e5f5', border: '#9c27b0', text: '#6a1b9a' }
                          }[asistencia.tipo] || { bg: '#f5f5f5', border: '#9e9e9e', text: '#424242' };
                          
                          return (
                            <div 
                              key={asistencia.id} 
                              className="asistencia-card"
                              style={{
                                backgroundColor: tipoColor.bg,
                                borderColor: tipoColor.border,
                                color: tipoColor.text
                              }}
                            >
                              <div className="card-header-incidencia">
                                <div className="card-fecha">
                                  <span className="icon">📅</span>
                                  <span>{new Date(asistencia.fecha).toLocaleDateString('es-PE', { 
                                    day: 'numeric',
                                    month: 'short'
                                  })}</span>
                                </div>
                                <div className="card-tipo-asistencia">
                                  <span className={`badge-tipo badge-${asistencia.tipo.toLowerCase()}`}>
                                    {asistencia.tipo.replace('_', ' ')}
                                  </span>
                                </div>
                              </div>
                              <div className="card-body-estrella">
                                <div className="card-info-row-labels">
                                  <span className="label">Entrada:</span>
                                  {asistencia.hora_salida && (
                                    <>
                                      <span className="separator">|</span>
                                      <span className="label">Salida:</span>
                                    </>
                                  )}
                                </div>
                                <div className="card-info-row-values">
                                  <span className="value">{asistencia.hora_entrada || 'N/A'}</span>
                                  {asistencia.hora_salida && (
                                    <>
                                      <span className="separator">|</span>
                                      <span className="value">{asistencia.hora_salida}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        </div>,
        document.body
      )}
    </DashboardLayout>
  );
}

export default DocenteHijos;

