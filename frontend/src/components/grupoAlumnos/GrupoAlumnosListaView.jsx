import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import api from '../../services/api';
import Swal from 'sweetalert2';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import '../../pages/DocenteGrupos.css';
import { useGrupoAlumnoAccionesAcademicas } from './useGrupoAlumnoAccionesAcademicas';
import GrupoAlumnoAccionesAcademicasModals from './GrupoAlumnoAccionesAcademicasModals';
import { esNivelInicial } from '../../utils/esNivelInicial';
import ConductaRegistrosAlumno from '../ConductaRegistrosAlumno';

const MENU_ACADEMICO_ALUMNO = [
  { key: 'asistencias', label: 'Asistencias', icon: '✅' },
  { key: 'incidencias', label: 'Incidencias', icon: '⚠️' },
  { key: 'imprimir_qr', label: 'Imprimir QR', icon: '🖨️' },
  { key: 'notas_detalladas', label: 'Notas Detalladas', icon: '📊' },
  { key: 'ver_libreta', label: 'Ver Libreta', icon: '📄' },
];

function menuAcademicoAlumnoItems(grupoInfo) {
  if (esNivelInicial(grupoInfo)) {
    return MENU_ACADEMICO_ALUMNO.filter((item) => item.key !== 'notas_detalladas');
  }
  return MENU_ACADEMICO_ALUMNO;
}

/**
 * Lista de alumnos de un grupo (misma UX que Docente → Grupos → Lista de alumnos).
 * psicologiaLinkMode: 'docente' → /docente/psicologia/derivar/... ; 'admin' → /admin/psicologia/alumno/...
 * menuAcademicoAlumno: opciones extra en Opciones (admin → Grados → Lista de alumnos).
 * puedeEliminarIncidencias: ADMINISTRADOR puede borrar incidencias docentes (no tutoría).
 */
export default function GrupoAlumnosListaView({
  grupoId,
  grupoInfo,
  onVolver,
  psicologiaLinkMode = 'admin',
  menuAcademicoAlumno = false,
  puedeEliminarIncidencias = false,
}) {
  const navigate = useNavigate();
  const [alumnos, setAlumnos] = useState([]);
  const [loadingAlumnos, setLoadingAlumnos] = useState(false);
  const [openDropdownAlumno, setOpenDropdownAlumno] = useState(null); // { id, top, left } o null
  const [filtroAlumno, setFiltroAlumno] = useState('');
  const [conductaAlumno, setConductaAlumno] = useState(null);
  const [alumnoInfo, setAlumnoInfo] = useState(null); // Información completa del alumno seleccionado
  const [loadingAlumnoInfo, setLoadingAlumnoInfo] = useState(false);

  // Estados para modal de mensaje a alumno individual
  const [mostrarModalMensajeAlumno, setMostrarModalMensajeAlumno] = useState(false);
  const [alumnoParaMensaje, setAlumnoParaMensaje] = useState(null); // Alumno seleccionado para enviar mensaje
  const [asuntoMensajeAlumno, setAsuntoMensajeAlumno] = useState('');
  const [contenidoMensajeAlumno, setContenidoMensajeAlumno] = useState('');
  const [archivosAdjuntosMensajeAlumno, setArchivosAdjuntosMensajeAlumno] = useState([]);
  const [enviandoMensajeAlumno, setEnviandoMensajeAlumno] = useState(false);
  const quillRefMensajeAlumno = useRef(null);

  // Modal mensaje exclusivo a apoderados del alumno (lista de alumnos)
  const [mostrarModalMensajeApoderados, setMostrarModalMensajeApoderados] = useState(false);
  const [alumnoParaMensajeApoderados, setAlumnoParaMensajeApoderados] = useState(null);
  const [destinatariosApoderadosPreview, setDestinatariosApoderadosPreview] = useState([]);
  const [usuarioIdsApoderadosMensaje, setUsuarioIdsApoderadosMensaje] = useState([]);
  const [cargandoApoderadosAlumnoId, setCargandoApoderadosAlumnoId] = useState(null);
  const [asuntoMensajeApoderados, setAsuntoMensajeApoderados] = useState('');
  const [contenidoMensajeApoderados, setContenidoMensajeApoderados] = useState('');
  const [archivosAdjuntosMensajeApoderados, setArchivosAdjuntosMensajeApoderados] = useState([]);
  const [enviandoMensajeApoderados, setEnviandoMensajeApoderados] = useState(false);
  const quillRefMensajeApoderados = useRef(null);

  const accionesAcademicas = useGrupoAlumnoAccionesAcademicas({
    grupoId,
    grupoInfo,
    puedeEliminarIncidencias: Boolean(menuAcademicoAlumno && puedeEliminarIncidencias),
  });

  useEffect(() => {
    if (!grupoId) return undefined;
    let cancelled = false;
    const run = async () => {
      setLoadingAlumnos(true);
      try {
        const response = await api.get(`/docente/grupos/${grupoId}/alumnos`);
        if (!cancelled) {
          setAlumnos(response.data.alumnos || []);
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Error cargando alumnos:', error);
          setAlumnos([]);
          Swal.fire({
            icon: 'error',
            title: 'No se pudo cargar la lista',
            text: error.response?.data?.error || 'Intente de nuevo.',
          });
        }
      } finally {
        if (!cancelled) setLoadingAlumnos(false);
      }
    };
    run();
    setTimeout(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      const el = document.querySelector('.docente-grupos');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
    return () => {
      cancelled = true;
    };
  }, [grupoId]);

  // Cerrar dropdown de alumno al hacer clic fuera
  useEffect(() => {
    if (!openDropdownAlumno) return;

    const handleClickOutside = (event) => {
      const target = event.target;
      const isDropdownMenu = target.closest('.dropdown-menu');
      const isDropdownButton = target.closest('.btn-opciones-dropdown');
      const isDropdownItem = target.closest('.dropdown-item');
      const isDropdownContainer = target.closest('.dropdown-container');
      const isInsideDropdown =
        isDropdownMenu || isDropdownButton || isDropdownItem || isDropdownContainer;
      if (!isInsideDropdown) {
        setTimeout(() => setOpenDropdownAlumno(null), 100);
      }
    };

    const timeoutId = setTimeout(() => {
      document.addEventListener('click', handleClickOutside, false);
    }, 50);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('click', handleClickOutside, false);
    };
  }, [openDropdownAlumno]);

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
            
            console.log('✅ [ALUMNO] Imagen subida, URL:', imagenUrl);
            
            // Insertar la imagen en el editor
            const range = quill.getSelection(true);
            quill.insertEmbed(range.index, 'image', imagenUrl);
            quill.setSelection(range.index + 1);
          } catch (error) {
            console.error('❌ [ALUMNO] Error subiendo imagen:', error);
            Swal.fire('Error', 'No se pudo subir la imagen', 'error');
          }
        };
      };
      
        // Agregar el handler
        toolbar.addHandler('image', imageHandler);
        console.log('✅ [GRUPOS-ALUMNO] Handler de imágenes configurado');
      }, 100);
      
      // Cleanup
      return () => {
        clearTimeout(timeoutId);
      };
    }
  }, [mostrarModalMensajeAlumno]);

  // ReactQuill: imágenes en modal Mensaje a Apoderados
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
            if (file.size > 5 * 1024 * 1024) {
              Swal.fire('Error', 'La imagen no puede ser mayor a 5MB', 'error');
              return;
            }
            if (!file.type.startsWith('image/')) {
              Swal.fire('Error', 'Solo se permiten archivos de imagen', 'error');
              return;
            }
            try {
              const formData = new FormData();
              formData.append('imagen', file);
              const response = await api.post('/docente/mensajes/subir-imagen', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
              });
              const imagenUrl = response.data.url;
              const range = quill.getSelection(true);
              quill.insertEmbed(range.index, 'image', imagenUrl);
              quill.setSelection(range.index + 1);
            } catch (error) {
              console.error('Error subiendo imagen (apoderados):', error);
              Swal.fire('Error', 'No se pudo subir la imagen', 'error');
            }
          };
        };
        toolbar.addHandler('image', imageHandler);
      }, 100);
      return () => clearTimeout(timeoutId);
    }
  }, [mostrarModalMensajeApoderados]);

  const irDerivacionPsicologia = (alumno) => {
    const gid = grupoId != null ? String(grupoId) : '';
    const mid = alumno.matricula_id != null ? String(alumno.matricula_id) : '';
    const q = `grupo_id=${encodeURIComponent(gid)}&matricula_id=${encodeURIComponent(mid)}`;
    if (psicologiaLinkMode === 'docente') {
      navigate(`/docente/psicologia/derivar/${alumno.id}?${q}`);
    } else {
      navigate(`/admin/psicologia/alumno/${alumno.id}?${q}`);
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

  // Manejar selección de archivos para mensaje a alumno
  const handleArchivoChangeMensajeAlumno = (e) => {
    const files = Array.from(e.target.files);
    setArchivosAdjuntosMensajeAlumno([...archivosAdjuntosMensajeAlumno, ...files]);
  };

  // Eliminar archivo adjunto del mensaje a alumno
  const eliminarArchivoMensajeAlumno = (index) => {
    setArchivosAdjuntosMensajeAlumno(archivosAdjuntosMensajeAlumno.filter((_, i) => i !== index));
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

      console.log(`📎 [ENVIAR MENSAJE ALUMNO] Contenido HTML (primeros 500 caracteres):`, contenidoMensajeAlumno.substring(0, 500));
      console.log(`📎 [ENVIAR MENSAJE ALUMNO] ¿Contiene imágenes?:`, contenidoMensajeAlumno.includes('<img'));
      const response = await api.post('/docente/mensajes/enviar', formData);

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

  const abrirModalMensajeApoderados = async (alumno) => {
    setOpenDropdownAlumno(null);
    setCargandoApoderadosAlumnoId(alumno.id);
    try {
      const { data } = await api.get(`/docente/mensajes/alumno/${alumno.id}/apoderados-destinatarios`);
      const lista = data.destinatarios || [];
      if (!lista.length) {
        Swal.fire({
          icon: 'info',
          title: 'Sin apoderados con cuenta',
          text: 'No hay apoderados con usuario activo vinculados a este alumno en el sistema. Verifique la ficha familiar.',
          confirmButtonText: 'Entendido',
        });
        return;
      }
      const idAlumnoConfirmado = data.alumno?.id ?? alumno.id;
      setAlumnoParaMensajeApoderados({ ...alumno, id: idAlumnoConfirmado, contexto_alumno_id: idAlumnoConfirmado });
      setDestinatariosApoderadosPreview(lista);
      setUsuarioIdsApoderadosMensaje(lista.map((d) => d.usuario_id));
      setAsuntoMensajeApoderados('');
      setContenidoMensajeApoderados('');
      setArchivosAdjuntosMensajeApoderados([]);
      setMostrarModalMensajeApoderados(true);
    } catch (error) {
      console.error('Error cargando apoderados destinatarios:', error);
      Swal.fire('Error', error.response?.data?.error || 'No se pudo cargar los apoderados', 'error');
    } finally {
      setCargandoApoderadosAlumnoId(null);
    }
  };

  const handleArchivoChangeMensajeApoderados = (e) => {
    const files = Array.from(e.target.files);
    setArchivosAdjuntosMensajeApoderados([...archivosAdjuntosMensajeApoderados, ...files]);
  };

  const eliminarArchivoMensajeApoderados = (index) => {
    setArchivosAdjuntosMensajeApoderados(archivosAdjuntosMensajeApoderados.filter((_, i) => i !== index));
  };

  const cerrarModalMensajeApoderados = () => {
    setMostrarModalMensajeApoderados(false);
    setAlumnoParaMensajeApoderados(null);
    setDestinatariosApoderadosPreview([]);
    setUsuarioIdsApoderadosMensaje([]);
    setAsuntoMensajeApoderados('');
    setContenidoMensajeApoderados('');
    setArchivosAdjuntosMensajeApoderados([]);
  };

  const enviarMensajeApoderadosAlumno = async () => {
    if (!alumnoParaMensajeApoderados || !usuarioIdsApoderadosMensaje.length) {
      Swal.fire('Error', 'No hay destinatarios (apoderados)', 'error');
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
    setEnviandoMensajeApoderados(true);
    try {
      const formData = new FormData();
      formData.append('destinatarios', JSON.stringify(usuarioIdsApoderadosMensaje));
      // Si el apoderado también tiene cuenta DOCENTE (mismo DNI),
      // asegurar que el mensaje se inserte para la cuenta DOCENTE también.
      formData.append('expand_apoderados_roles', 'true');
      formData.append('grupos', JSON.stringify([]));
      const idCtx =
        alumnoParaMensajeApoderados?.contexto_alumno_id ??
        alumnoParaMensajeApoderados?.alumno_id ??
        alumnoParaMensajeApoderados?.id;
      if (idCtx != null && idCtx !== '' && String(idCtx) !== 'undefined') {
        formData.append('contexto_alumno_id', String(idCtx));
      }
      if (grupoId != null && grupoId !== '') {
        formData.append('contexto_grupo_id', String(grupoId));
      }
      formData.append('asunto', asuntoMensajeApoderados.trim());
      formData.append('mensaje', contenidoMensajeApoderados);
      archivosAdjuntosMensajeApoderados.forEach((archivo) => {
        formData.append('archivos', archivo);
      });
      await api.post('/docente/mensajes/enviar', formData);
      Swal.fire({
        title: '¡Mensaje enviado!',
        html: `Se envió a <strong>${usuarioIdsApoderadosMensaje.length}</strong> apoderado(s) vinculado(s) a <strong>${alumnoParaMensajeApoderados.nombres || ''}</strong>.`,
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

  const qAlumno = filtroAlumno.trim().toLowerCase();
  const alumnosVisibles = !qAlumno
    ? alumnos
    : alumnos.filter((alumno) => {
      const nombre = `${alumno.apellido_paterno || ''} ${alumno.apellido_materno || ''} ${alumno.nombres || ''} ${alumno.nro_documento || ''}`.toLowerCase();
      return nombre.includes(qAlumno);
    });

  return (
      <div className="docente-grupos">
          <div className="alumnos-container">
            {/* Debug: Mostrando lista de alumnos para grupo {selectedGrupo} */}
            <div className="alumnos-header-section mundo-card">
              <button type="button" className="btn-regresar" onClick={onVolver}>
                <span className="btn-icon">←</span>
                Volver
              </button>
              <div className="grupo-info">
                <h2 className="section-title-blue">
                  Lista de Alumnos - {grupoInfo?.grado}° {grupoInfo?.seccion}
                </h2>
                <p className="grupo-subtitle">{grupoInfo?.nivel_nombre} - {grupoInfo?.turno_nombre}</p>
              </div>
              <input
                type="search"
                className="grupo-buscar-alumno"
                value={filtroAlumno}
                onChange={(e) => setFiltroAlumno(e.target.value)}
                placeholder="Buscar por nombre o DNI"
                aria-label="Buscar alumno"
              />
            </div>
            
            <div className="alumnos-list-section mundo-card">
              {loadingAlumnos ? (
                <div className="loading-alumnos">Cargando alumnos...</div>
              ) : (
                <div className="alumnos-cards-container">
                  {alumnosVisibles.length > 0 ? (
                    alumnosVisibles.map((alumno, index) => {
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
                                  
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  if (openDropdownAlumno?.id === alumno.id) {
                                    setOpenDropdownAlumno(null);
                                  } else {
                                    // Calcular posición del dropdown
                                    const dropdownWidth = 250;
                                    const extraItems = (menuAcademicoAlumno ? menuAcademicoAlumnoItems(grupoInfo).length : 0) + (psicologiaLinkMode === 'docente' ? 1 : 0);
                                    const dropdownHeight = 200 + extraItems * 42;
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
                                      type="button"
                                      disabled={cargandoApoderadosAlumnoId === alumno.id}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        e.preventDefault();
                                        abrirModalMensajeApoderados(alumno);
                                      }}
                                    >
                                      <span className="dropdown-icon">👨‍👩‍👧</span>
                                      <span>{cargandoApoderadosAlumnoId === alumno.id ? 'Cargando…' : 'Mensaje Apoderados'}</span>
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
                                    <button
                                      className="dropdown-item"
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        e.preventDefault();
                                        setOpenDropdownAlumno(null);
                                        irDerivacionPsicologia(alumno);
                                      }}
                                    >
                                      <span className="dropdown-icon">🧠</span>
                                      <span>Derivación psicológica</span>
                                    </button>
                                    {psicologiaLinkMode === 'docente' ? (
                                      <button
                                        className="dropdown-item"
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          e.preventDefault();
                                          setOpenDropdownAlumno(null);
                                          setConductaAlumno(alumno);
                                        }}
                                      >
                                        <span className="dropdown-icon">📋</span>
                                        <span>Conducta</span>
                                      </button>
                                    ) : null}
                                    {menuAcademicoAlumno &&
                                      menuAcademicoAlumnoItems(grupoInfo).map((item) => (
                                        <button
                                          key={item.key}
                                          className="dropdown-item"
                                          type="button"
                                          onClick={async (e) => {
                                            e.stopPropagation();
                                            e.preventDefault();
                                            setOpenDropdownAlumno(null);
                                            await accionesAcademicas.ejecutarAccion(item.key, alumno);
                                          }}
                                        >
                                          <span className="dropdown-icon">{item.icon}</span>
                                          <span>{item.label}</span>
                                        </button>
                                      ))}
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
                      {alumnos.length ? 'Ningún alumno coincide con la búsqueda' : 'No hay alumnos en este grupo'}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

      {menuAcademicoAlumno ? <GrupoAlumnoAccionesAcademicasModals {...accionesAcademicas} /> : null}

      {conductaAlumno ? (
        <div className="alumno-info-modal-overlay" onClick={() => setConductaAlumno(null)}>
          <div className="cond-alumno-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Conducta del alumno">
            <header>
              <div>
                <h2>Conducta</h2>
                <p>{conductaAlumno.apellido_paterno} {conductaAlumno.apellido_materno}, {conductaAlumno.nombres}</p>
              </div>
              <button type="button" onClick={() => setConductaAlumno(null)} aria-label="Cerrar">×</button>
            </header>
            <ConductaRegistrosAlumno matriculaId={conductaAlumno.matricula_id} puedeQuitar={puedeEliminarIncidencias} />
          </div>
        </div>
      ) : null}

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

      {/* Modal Mensaje exclusivo a apoderados del alumno */}
      {mostrarModalMensajeApoderados && alumnoParaMensajeApoderados && createPortal(
        <div
          className="modal-mensaje-overlay modal-mensaje-apoderados-overlay"
          onClick={cerrarModalMensajeApoderados}
          style={{ zIndex: 100000 }}
        >
          <div
            className="modal-mensaje-container modal-mensaje-apoderados-container"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-mensaje-apoderados-title"
          >
            <div className="modal-mensaje-header modal-mensaje-apoderados-header">
              <h2 id="modal-mensaje-apoderados-title">👨‍👩‍👧 Mensaje a apoderados</h2>
              <button
                className="modal-mensaje-close"
                onClick={cerrarModalMensajeApoderados}
                type="button"
                aria-label="Cerrar modal"
              >
                ✕
              </button>
            </div>

            <div className="modal-mensaje-body">
              <div className="mensaje-grupo-info mensaje-apoderados-alumno-banner">
                <p>
                  <strong>Alumno:</strong>{' '}
                  {alumnoParaMensajeApoderados.apellido_paterno} {alumnoParaMensajeApoderados.apellido_materno},{' '}
                  {alumnoParaMensajeApoderados.nombres}
                </p>
                <p className="mensaje-info-text mensaje-apoderados-exclusivo">
                  El mensaje <strong>no</strong> llegará al alumno: solo a las cuentas de apoderados vinculadas en el sistema (padres / madres / tutores con usuario activo).
                </p>
              </div>

              <div className="mensaje-apoderados-destinatarios-card">
                <div className="mensaje-apoderados-destinatarios-label">📬 Se enviará a ({destinatariosApoderadosPreview.length})</div>
                <ul className="mensaje-apoderados-chips">
                  {destinatariosApoderadosPreview.map((d) => (
                    <li key={d.usuario_id} className={`mensaje-apoderado-chip mensaje-apoderado-chip--${d.tipo || 'apoderado'}`}>
                      <span className="mensaje-apoderado-chip-nombre">{d.nombre_completo}</span>
                      {(d.tipo === 'docente_apoderado' || d.tipo === 'cuenta_trabajo') && (
                        <span className="mensaje-apoderado-chip-badge">Trabajador</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="form-group">
                <label htmlFor="asunto-mensaje-apoderados">Asunto:</label>
                <input
                  type="text"
                  id="asunto-mensaje-apoderados"
                  className="form-input"
                  value={asuntoMensajeApoderados}
                  onChange={(e) => setAsuntoMensajeApoderados(e.target.value)}
                  placeholder="Asunto del mensaje para los apoderados"
                />
              </div>

              <div className="form-group">
                <label htmlFor="mensaje-editor-apoderados">Mensaje:</label>
                <div id="mensaje-editor-wrapper-apoderados" className="mensaje-editor-apoderados-wrap">
                  <ReactQuill
                    ref={quillRefMensajeApoderados}
                    theme="snow"
                    value={contenidoMensajeApoderados}
                    onChange={setContenidoMensajeApoderados}
                    placeholder="Escribe tu mensaje para los apoderados… Puedes insertar imágenes con el botón de la barra."
                    modules={{
                      toolbar: [
                        [{ header: [1, 2, 3, false] }],
                        ['bold', 'italic', 'underline', 'strike'],
                        [{ list: 'ordered' }, { list: 'bullet' }],
                        [{ color: [] }, { background: [] }],
                        [{ align: [] }],
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
                <label>Archivos adjuntos</label>
                <div className="archivos-container">
                  <input
                    type="file"
                    id="archivos-input-apoderados"
                    multiple
                    onChange={handleArchivoChangeMensajeApoderados}
                    style={{ display: 'none' }}
                  />
                  <label htmlFor="archivos-input-apoderados" className="btn-adjuntar-archivo">
                    📎 Adjuntar archivos
                  </label>
                  {archivosAdjuntosMensajeApoderados.length > 0 && (
                    <div className="archivos-lista">
                      {archivosAdjuntosMensajeApoderados.map((archivo, index) => (
                        <div key={index} className="archivo-item">
                          <span className="archivo-nombre">{archivo.name}</span>
                          <span className="archivo-tamaño">{(archivo.size / 1024).toFixed(2)} KB</span>
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
                <button className="btn-cancelar" type="button" onClick={cerrarModalMensajeApoderados}>
                  Cancelar
                </button>
                <button
                  className="btn-enviar btn-enviar-apoderados"
                  type="button"
                  onClick={enviarMensajeApoderadosAlumno}
                  disabled={enviandoMensajeApoderados}
                >
                  {enviandoMensajeApoderados ? '⏳ Enviando…' : '👨‍👩‍👧 Enviar a apoderados'}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

