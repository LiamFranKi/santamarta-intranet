import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { QRCodeSVG } from 'qrcode.react';
import DashboardLayout from '../components/DashboardLayout';
import api from '../services/api';
import Swal from 'sweetalert2';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import './DocenteTutoria.css';

function DocenteTutoria() {
  const [loading, setLoading] = useState(true);
  const [esTutor, setEsTutor] = useState(false);
  const [gruposTutor, setGruposTutor] = useState([]);
  const [openDropdown, setOpenDropdown] = useState(null); // { grupoId, top, left }
  const [selectedGrupo, setSelectedGrupo] = useState(null);
  const [grupoInfo, setGrupoInfo] = useState(null); // Información del grupo seleccionado
  const [alumnos, setAlumnos] = useState([]);
  const [loadingAlumnos, setLoadingAlumnos] = useState(false);
  const [openDropdownAlumno, setOpenDropdownAlumno] = useState(null); // { id, top, left } o null
  const [alumnoInfo, setAlumnoInfo] = useState(null); // Información completa del alumno seleccionado
  const [loadingAlumnoInfo, setLoadingAlumnoInfo] = useState(false);
  const [mostrarRecomendacion, setMostrarRecomendacion] = useState(false);
  const [alumnoSeleccionado, setAlumnoSeleccionado] = useState(null);
  const [recomendacion, setRecomendacion] = useState('');
  const dropdownRef = useRef(null);
  
  // Estados para modal de mensaje al grupo
  const [mostrarModalMensajeGrupo, setMostrarModalMensajeGrupo] = useState(false);
  const [grupoParaMensaje, setGrupoParaMensaje] = useState(null); // Grupo seleccionado para enviar mensaje
  const [asuntoMensajeGrupo, setAsuntoMensajeGrupo] = useState('');
  const [contenidoMensajeGrupo, setContenidoMensajeGrupo] = useState('');
  const [archivosAdjuntosMensajeGrupo, setArchivosAdjuntosMensajeGrupo] = useState([]);
  const [enviandoMensajeGrupo, setEnviandoMensajeGrupo] = useState(false);
  const quillRefMensajeGrupo = useRef(null);
  
  // Estados para modal de mensaje a alumno individual
  const [mostrarModalMensajeAlumno, setMostrarModalMensajeAlumno] = useState(false);
  const [alumnoParaMensaje, setAlumnoParaMensaje] = useState(null); // Alumno seleccionado para enviar mensaje
  const [asuntoMensajeAlumno, setAsuntoMensajeAlumno] = useState('');
  const [contenidoMensajeAlumno, setContenidoMensajeAlumno] = useState('');
  const [archivosAdjuntosMensajeAlumno, setArchivosAdjuntosMensajeAlumno] = useState([]);
  const [enviandoMensajeAlumno, setEnviandoMensajeAlumno] = useState(false);
  const quillRefMensajeAlumno = useRef(null);

  useEffect(() => {
    cargarGruposTutor();
  }, []);

  // Cerrar dropdowns al hacer clic fuera
  useEffect(() => {
    if (!openDropdown && !openDropdownAlumno) return;
    
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        const isDropdownButton = event.target.closest('.btn-opciones, .btn-opciones-dropdown');
        if (!isDropdownButton) {
          setOpenDropdown(null);
          setOpenDropdownAlumno(null);
        }
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

  const cargarGruposTutor = async () => {
    try {
      setLoading(true);
      const response = await api.get('/docente/tutoria');
      setEsTutor(response.data.es_tutor);
      setGruposTutor(response.data.grupos || []);
    } catch (error) {
      console.error('Error cargando grupos de tutoría:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpcionesClick = (e, grupoId) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setOpenDropdown({
      grupoId,
      top: rect.bottom + 5,
      left: rect.left
    });
  };

  const handleOpcionClick = async (opcion, grupo) => {
    setOpenDropdown(null);
    setSelectedGrupo(grupo);

    switch (opcion) {
      case 'lista-alumnos':
        await cargarAlumnos(grupo.id);
        break;
      case 'notas-asistencia':
        // Implementar después
        Swal.fire({
          icon: 'info',
          title: 'Próximamente',
          text: 'Esta funcionalidad se implementará próximamente',
          toast: true,
          position: 'top-end',
          showConfirmButton: false,
          timer: 3000
        });
        break;
      case 'enviar-comunicado':
        // Abrir modal de mensaje al grupo
        setGrupoParaMensaje(grupo);
        setMostrarModalMensajeGrupo(true);
        setAsuntoMensajeGrupo('');
        setContenidoMensajeGrupo('');
        setArchivosAdjuntosMensajeGrupo([]);
        break;
      case 'registrar-asistencia':
        // Implementar después
        Swal.fire({
          icon: 'info',
          title: 'Próximamente',
          text: 'Esta funcionalidad se implementará próximamente',
          toast: true,
          position: 'top-end',
          showConfirmButton: false,
          timer: 3000
        });
        break;
      case 'apreciaciones-recomendaciones':
        await cargarAlumnos(grupo.id);
        setMostrarRecomendacion(true);
        break;
      case 'lista-asignaturas':
        // Implementar después
        Swal.fire({
          icon: 'info',
          title: 'Próximamente',
          text: 'Esta funcionalidad se implementará próximamente',
          toast: true,
          position: 'top-end',
          showConfirmButton: false,
          timer: 3000
        });
        break;
      case 'registrar-conducta':
        // Implementar después
        Swal.fire({
          icon: 'info',
          title: 'Próximamente',
          text: 'Esta funcionalidad se implementará próximamente',
          toast: true,
          position: 'top-end',
          showConfirmButton: false,
          timer: 3000
        });
        break;
      default:
        break;
    }
  };

  const cargarAlumnos = async (grupoId) => {
    try {
      setLoadingAlumnos(true);
      const response = await api.get(`/docente/tutoria/grupos/${grupoId}/alumnos`);
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

  const volverAGrupos = () => {
    setSelectedGrupo(null);
    setGrupoInfo(null);
    setAlumnos([]);
    setOpenDropdownAlumno(null);
    setMostrarRecomendacion(false);
    setAlumnoSeleccionado(null);
    setRecomendacion('');
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
      formData.append('asunto', asuntoMensajeGrupo.trim());
      formData.append('mensaje', contenidoMensajeGrupo);

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

  const handleEnviarRecomendacion = async () => {
    if (!alumnoSeleccionado || !recomendacion.trim()) {
      return;
    }

    try {
      const matriculaId = alumnoSeleccionado.matricula_id || alumnoSeleccionado.id;
      
      await api.post('/docente/tutoria/recomendaciones', {
        matricula_id: matriculaId,
        recomendacion: recomendacion
      });

      Swal.fire({
        icon: 'success',
        title: '¡Recomendación enviada!',
        text: 'La recomendación se ha enviado correctamente',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000,
        timerProgressBar: true
      });

      setMostrarRecomendacion(false);
      setAlumnoSeleccionado(null);
      setRecomendacion('');
    } catch (error) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: error.response?.data?.error || 'No se pudo enviar la recomendación',
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

  return (
    <DashboardLayout>
      <div className="docente-tutoria">
        {!selectedGrupo ? (
          <>
            <div className="page-header">
              <h1>🎓 Tutoría</h1>
              <p>Gestiona tus grupos como tutor</p>
            </div>

            <div className="tutoria-content mundo-card">
              <h2>Grupos a Cargo</h2>
              
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
              <p>No tienes grupos asignados como tutor</p>
            </div>
          )}

              {/* Dropdown de Opciones */}
              {openDropdown && createPortal(
                <div
                  ref={dropdownRef}
                  className="dropdown-menu"
                  style={{
                    position: 'fixed',
                    top: `${openDropdown.top}px`,
                    left: `${openDropdown.left}px`,
                    zIndex: 10000
                  }}
                >
                  {(() => {
                    const grupo = gruposTutor.find(g => g.id === openDropdown.grupoId);
                    if (!grupo) return null;

                    const opciones = [
                      { id: 'lista-alumnos', label: 'Lista de Alumnos', icon: '📋' },
                      { id: 'notas-asistencia', label: 'Ver Notas', icon: '📊' },
                      { id: 'enviar-comunicado', label: 'Enviar Mensaje', icon: '✉️' },
                      { id: 'registrar-asistencia', label: 'Asistencias', icon: '✅' },
                      { id: 'apreciaciones-recomendaciones', label: 'Recomendaciones', icon: '💬' },
                      { id: 'lista-asignaturas', label: 'Lista de Asignaturas', icon: '📚' },
                      { id: 'registrar-conducta', label: 'Registrar Conducta', icon: '📝' }
                    ];

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
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    
                                    // Cerrar otros dropdowns primero
                                    if (openDropdownAlumno?.id !== alumno.id) {
                                      setOpenDropdown(null);
                                    }
                                    
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    if (openDropdownAlumno?.id === alumno.id) {
                                      setOpenDropdownAlumno(null);
                                    } else {
                                      // Calcular posición del dropdown
                                      const dropdownWidth = 180;
                                      const dropdownHeight = 90; // Aproximado
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
                                      
                                      setOpenDropdownAlumno({ 
                                        id: alumno.id, 
                                        top: top, 
                                        left: left
                                      });
                                    }
                                  }}
                                  title="Opciones"
                                >
                                  Opciones {openDropdownAlumno?.id === alumno.id ? '▲' : '▼'}
                                </button>
                                {openDropdownAlumno?.id === alumno.id && openDropdownAlumno?.top && 
                                  createPortal(
                                    <div 
                                      className="dropdown-menu dropdown-menu-alumno"
                                      style={{
                                        top: `${openDropdownAlumno.top}px`,
                                        left: `${openDropdownAlumno.left}px`,
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
                                          e.preventDefault();
                                          // Abrir modal de mensaje para el alumno
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

              {/* Formulario de Recomendación */}
              {mostrarRecomendacion && (
                <div className="recomendacion-form mundo-card">
                  <div className="recomendacion-header">
                    <h3>Recomendaciones</h3>
                    <button
                      className="btn-cerrar-form"
                      onClick={() => {
                        setMostrarRecomendacion(false);
                        setAlumnoSeleccionado(null);
                        setRecomendacion('');
                      }}
                    >
                      ✕
                    </button>
                  </div>
                  <div className="form-group">
                    <label>Alumno</label>
                    <select
                      value={alumnoSeleccionado?.id || ''}
                      onChange={(e) => {
                        const alumno = alumnos.find(a => a.id === parseInt(e.target.value));
                        setAlumnoSeleccionado(alumno);
                      }}
                    >
                      <option value="">Selecciona un alumno</option>
                      {alumnos.map((alumno) => (
                        <option key={alumno.id} value={alumno.id}>
                          {alumno.apellido_paterno} {alumno.apellido_materno}, {alumno.nombres}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Recomendación</label>
                    <textarea
                      value={recomendacion}
                      onChange={(e) => setRecomendacion(e.target.value)}
                      rows="5"
                      placeholder="Escribe la recomendación para el alumno..."
                    />
                  </div>
                  <div className="form-actions">
                    <button
                      type="button"
                      className="btn-cancelar"
                      onClick={() => {
                        setMostrarRecomendacion(false);
                        setAlumnoSeleccionado(null);
                        setRecomendacion('');
                      }}
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      className="btn-guardar"
                      onClick={handleEnviarRecomendacion}
                      disabled={!alumnoSeleccionado || !recomendacion.trim()}
                    >
                      Enviar Recomendación
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
      </div>

      {/* Modal de Enviar Mensaje al Grupo */}
      {mostrarModalMensajeGrupo && grupoParaMensaje && createPortal(
        <div 
          className="modal-mensaje-overlay" 
          onClick={() => setMostrarModalMensajeGrupo(false)}
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
                onClick={() => setMostrarModalMensajeGrupo(false)}
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
                <p className="mensaje-info-text">El mensaje se enviará a todos los alumnos del grupo</p>
              </div>

              {/* Campo Asunto */}
              <div className="form-group">
                <label htmlFor="asunto-mensaje-grupo">Asunto:</label>
                <input
                  type="text"
                  id="asunto-mensaje-grupo"
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
                <label>Archivos Adjuntos:</label>
                <div className="archivos-container">
                  <input
                    type="file"
                    id="archivos-input-grupo"
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
                                <th>DESCRIPCIÓN AVATAR</th>
                                <td>{alumnoInfo.alumno.avatar.description}</td>
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
                <label>Archivos Adjuntos:</label>
                <div className="archivos-container">
                  <input
                    type="file"
                    id="archivos-input-alumno"
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
    </DashboardLayout>
  );
}

export default DocenteTutoria;
