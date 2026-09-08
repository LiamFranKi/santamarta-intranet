import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import Swal from 'sweetalert2';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import './DocenteMensajes.css';
import DestinatarioSearchField from '../components/mensajes/DestinatarioSearchField';
import AdjuntosPendientes from '../components/mensajes/AdjuntosPendientes';
import {
  procesarHTMLMensaje,
  MARCA_CUMPLEANOS_HTML,
  mensajeTieneMarcaCumpleanos,
  quitarMarcaCumpleanosHtml,
} from '../utils/mensajesHtml';

const MENSAJES_PAGE_SIZE = 50;

// Componente para el contenido del modal (para poder usar useEffect para marcar como leído)
function MensajeModalContent({ mensaje, vista, onClose, onMensajeLeido }) {
  // Marcar mensaje como leído cuando se abre el modal (solo para mensajes recibidos)
  useEffect(() => {
    if (vista === 'recibidos' && mensaje.estado === 'NO_LEIDO') {
      const marcarComoLeido = async () => {
        try {
          await api.put(`/docente/mensajes/${mensaje.id}/marcar-leido`);
          // Actualizar el estado local
          onMensajeLeido(mensaje.id);
        } catch (error) {
          console.error('Error marcando mensaje como leído:', error);
          // No mostrar error al usuario, solo loguear
        }
      };
      marcarComoLeido();
    }
  }, [mensaje.id, mensaje.estado, vista, onMensajeLeido]);

  const esCumple = mensajeTieneMarcaCumpleanos(mensaje);

  return (
    <div className={`mensaje-modal-body${esCumple ? ' mensaje-modal-body-cumpleanos' : ''}`}>
      <div className="mensaje-modal-info">
        <div>
          <strong>{vista === 'recibidos' ? 'De:' : 'Para:'}</strong>{' '}
          {vista === 'recibidos' 
            ? mensaje.remitente_nombre_completo 
            : mensaje.destinatario_nombre_completo}
        </div>
        <div>
          <strong>Fecha:</strong> {new Date(mensaje.fecha_hora).toLocaleString('es-PE')}
        </div>
      </div>
      <div 
        className={`mensaje-modal-contenido${esCumple ? ' mensaje-modal-contenido-cumpleanos' : ''}`}
        dangerouslySetInnerHTML={{
          __html: procesarHTMLMensaje(quitarMarcaCumpleanosHtml(mensaje.mensaje)),
        }}
        style={{
          wordBreak: 'break-word'
        }}
      />
      
      {/* Archivos Adjuntos */}
      {mensaje.archivos && Array.isArray(mensaje.archivos) && mensaje.archivos.length > 0 && (
        <div className="mensaje-archivos">
          <h4>Archivos Adjuntos ({mensaje.archivos.length}):</h4>
          <div className="archivos-lista-modal">
            {mensaje.archivos.map((archivo, index) => {
              // El backend ya devuelve archivo_url como URL completa (con dominio del sistema PHP)
              const archivoUrl = archivo.archivo_url 
                ? (archivo.archivo_url.startsWith('http') 
                    ? archivo.archivo_url 
                    : `${process.env.REACT_APP_PHP_SYSTEM_URL || 'https://sistema.vanguardschools.edu.pe'}${archivo.archivo_url}`)
                : archivo.archivo
                ? `${process.env.REACT_APP_PHP_SYSTEM_URL || 'https://sistema.vanguardschools.edu.pe'}/Static/Archivos/${archivo.archivo}`
                : null;
              
              if (!archivoUrl) {
                return null;
              }
              
              // Determinar si es imagen
              const nombreArchivo = archivo.nombre_archivo || archivo.archivo || '';
              const esImagen = /\.(jpg|jpeg|png|gif|webp)$/i.test(nombreArchivo);
              
              return (
                <div key={archivo.id || `archivo-${index}`} className="archivo-item-modal">
                  {esImagen ? (
                    <div className="archivo-imagen">
                      <img 
                        src={archivoUrl} 
                        alt={nombreArchivo || 'Imagen adjunta'}
                        style={{ maxWidth: '300px', maxHeight: '300px', borderRadius: '8px' }}
                        onError={(e) => {
                          e.target.style.display = 'none';
                        }}
                      />
                      <a
                        href={archivoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="archivo-enlace"
                        download={nombreArchivo}
                      >
                        📎 {nombreArchivo}
                      </a>
                    </div>
                  ) : (
                    <a
                      href={archivoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="archivo-enlace"
                      download={nombreArchivo}
                    >
                      📎 {nombreArchivo}
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function DocenteMensajes() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const esAdmin = user?.tipo === 'ADMINISTRADOR';
  const [vista, setVista] = useState('recibidos'); // 'recibidos', 'enviados', 'nuevo'
  const [mensajesRecibidos, setMensajesRecibidos] = useState([]);
  const [mensajesEnviados, setMensajesEnviados] = useState([]);
  const [loading, setLoading] = useState(false);
  const [mensajeSeleccionado, setMensajeSeleccionado] = useState(null);
  const [mensajesSeleccionados, setMensajesSeleccionados] = useState(new Set());
  const [anioFiltro, setAnioFiltro] = useState(null); // null = todos los años
  const [pageRecibidos, setPageRecibidos] = useState(1);
  const [pageEnviados, setPageEnviados] = useState(1);
  const [filtroRemitenteId, setFiltroRemitenteId] = useState('');
  const [filtroDestinatarioId, setFiltroDestinatarioId] = useState('');
  const [opcionesRemitentes, setOpcionesRemitentes] = useState([]);
  const [opcionesDestinatarios, setOpcionesDestinatarios] = useState([]);
  const [paginationRecibidos, setPaginationRecibidos] = useState({
    page: 1,
    limit: MENSAJES_PAGE_SIZE,
    total: 0,
    totalPages: 0
  });
  const [paginationEnviados, setPaginationEnviados] = useState({
    page: 1,
    limit: MENSAJES_PAGE_SIZE,
    total: 0,
    totalPages: 0
  });
  const quillRef = React.useRef(null);
  const vistaAnteriorRef = React.useRef(vista);
  
  // Estados para nuevo mensaje
  const [busquedaDestinatario, setBusquedaDestinatario] = useState('');
  const [resultadosBusqueda, setResultadosBusqueda] = useState([]);
  const [destinatariosSeleccionados, setDestinatariosSeleccionados] = useState([]);
  const [asunto, setAsunto] = useState('');
  const [contenido, setContenido] = useState('');
  const [archivosAdjuntos, setArchivosAdjuntos] = useState([]);
  const [mostrarResultados, setMostrarResultados] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [mensajeDesdeCumpleanos, setMensajeDesdeCumpleanos] = useState(false);

  useEffect(() => {
    const preC = location.state?.preselectCumpleanos;
    const preA = location.state?.preselectMensajeAlumno;
    if (preC && preC.usuario_id) {
      setVista('nuevo');
      setMensajeDesdeCumpleanos(!!preC.esCumpleanos);
      setDestinatariosSeleccionados([
        {
          usuario_id: preC.usuario_id,
          nombre_completo: String(preC.nombre_completo || ''),
          tipo: String(preC.tipo || 'ALUMNO'),
          info_adicional: preC.info_adicional || null,
        },
      ]);
      setAsunto(preC.asuntoSugerido ? String(preC.asuntoSugerido) : '¡Feliz cumpleaños! 🎂');
      setContenido('');
      setArchivosAdjuntos([]);
      setBusquedaDestinatario('');
      setMostrarResultados(false);
      navigate(location.pathname, { replace: true, state: {} });
    } else if (preA && preA.usuario_id) {
      setMensajeDesdeCumpleanos(false);
      setVista('nuevo');
      setDestinatariosSeleccionados([
        {
          usuario_id: preA.usuario_id,
          nombre_completo: String(preA.nombre_completo || 'Alumno'),
          tipo: 'ALUMNO',
          info_adicional: preA.info_adicional || null,
        },
      ]);
      setBusquedaDestinatario('');
      setMostrarResultados(false);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, location.pathname, navigate]);

  useEffect(() => {
    if (vistaAnteriorRef.current === 'nuevo' && vista !== 'nuevo') {
      setMensajeDesdeCumpleanos(false);
    }
    vistaAnteriorRef.current = vista;
  }, [vista]);

  // Configurar handler de imágenes para ReactQuill
  useEffect(() => {
    if (quillRef.current && vista === 'nuevo') {
      const quill = quillRef.current.getEditor();
      const toolbar = quill.getModule('toolbar');
      
      toolbar.addHandler('image', async () => {
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
            
            console.log('✅ Imagen subida, URL:', imagenUrl);
            
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
  }, [vista]);

  // Cargar mensajes recibidos
  const cargarMensajesRecibidos = useCallback(async () => {
    try {
      setLoading(true);
      const params = { page: pageRecibidos, limit: MENSAJES_PAGE_SIZE };
      if (anioFiltro) {
        params.anio = anioFiltro;
      }
      if (filtroRemitenteId) {
        params.remitente_id = filtroRemitenteId;
      }
      const response = await api.get('/docente/mensajes/recibidos', { params });
      const mensajes = response.data.mensajes || [];
      const pag = response.data.pagination || {};
      setPaginationRecibidos({
        page: pag.page || 1,
        limit: pag.limit || MENSAJES_PAGE_SIZE,
        total: pag.total ?? 0,
        totalPages: pag.totalPages ?? 0
      });
      // Debug: verificar archivos en mensajes
      mensajes.forEach((mensaje, index) => {
        if (mensaje.archivos && mensaje.archivos.length > 0) {
          console.log(`📎 [FRONTEND] Mensaje recibido ${index} (ID: ${mensaje.id}) tiene ${mensaje.archivos.length} archivo(s):`, mensaje.archivos);
        }
      });
      setMensajesRecibidos(mensajes);
      setMensajesSeleccionados(new Set()); // Limpiar selección al cargar

      const total = pag.total ?? 0;
      if (total === 0 && anioFiltro && !filtroRemitenteId) {
        setAnioFiltro(null);
        setPageRecibidos(1);
      }
    } catch (error) {
      console.error('Error cargando mensajes recibidos:', error);
      Swal.fire('Error', 'No se pudieron cargar los mensajes recibidos', 'error');
      setMensajesSeleccionados(new Set());
    } finally {
      setLoading(false);
    }
  }, [anioFiltro, pageRecibidos, filtroRemitenteId]);

  // Cargar mensajes enviados
  const cargarMensajesEnviados = useCallback(async () => {
    try {
      setLoading(true);
      const params = { page: pageEnviados, limit: MENSAJES_PAGE_SIZE };
      if (anioFiltro) {
        params.anio = anioFiltro;
      }
      if (filtroDestinatarioId) {
        params.destinatario_id = filtroDestinatarioId;
      }
      const response = await api.get('/docente/mensajes/enviados', { params });
      const mensajes = response.data.mensajes || [];
      const pag = response.data.pagination || {};
      setPaginationEnviados({
        page: pag.page || 1,
        limit: pag.limit || MENSAJES_PAGE_SIZE,
        total: pag.total ?? 0,
        totalPages: pag.totalPages ?? 0
      });
      // Debug: verificar archivos en mensajes
      mensajes.forEach((mensaje, index) => {
        if (mensaje.archivos && mensaje.archivos.length > 0) {
          console.log(`📎 [FRONTEND] Mensaje ${index} (ID: ${mensaje.id}) tiene ${mensaje.archivos.length} archivo(s):`, mensaje.archivos);
        }
      });
      setMensajesEnviados(mensajes);
      setMensajesSeleccionados(new Set()); // Limpiar selección al cargar

      const total = pag.total ?? 0;
      if (total === 0 && anioFiltro && !filtroDestinatarioId) {
        setAnioFiltro(null);
        setPageEnviados(1);
      }
    } catch (error) {
      console.error('Error cargando mensajes enviados:', error);
      Swal.fire('Error', 'No se pudieron cargar los mensajes enviados', 'error');
      // En caso de error, también limpiar selección
      setMensajesSeleccionados(new Set());
    } finally {
      setLoading(false);
    }
  }, [anioFiltro, pageEnviados, filtroDestinatarioId]);

  // Buscar destinatarios
  const buscarDestinatarios = useCallback(async (termino) => {
    if (!termino || termino.trim().length < 2) {
      setResultadosBusqueda([]);
      setMostrarResultados(false);
      return;
    }

    try {
      const response = await api.get('/docente/mensajes/buscar-destinatarios', {
        params: { q: termino }
      });
      // Asegurarse de que siempre sea un array y que los campos sean strings
      const resultados = Array.isArray(response.data?.resultados) 
        ? response.data.resultados.map(r => ({
            ...r,
            nombre_completo: String(r.nombre_completo || ''),
            tipo: String(r.tipo || ''),
            info_adicional: r.info_adicional ? String(r.info_adicional) : null
          }))
        : [];
      setResultadosBusqueda(resultados);
      setMostrarResultados(true);
    } catch (error) {
      console.error('Error buscando destinatarios:', error);
      setResultadosBusqueda([]);
      setMostrarResultados(false);
      // No mostrar error al usuario si no hay resultados, es normal
    }
  }, []);

  // Efecto para buscar destinatarios cuando cambia el término
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      buscarDestinatarios(busquedaDestinatario);
    }, 400);

    return () => clearTimeout(timeoutId);
  }, [busquedaDestinatario, buscarDestinatarios]);

  const cargarOpcionesRemitentes = useCallback(async () => {
    try {
      const params = {};
      if (anioFiltro) params.anio = anioFiltro;
      const r = await api.get('/docente/mensajes/remitentes-opciones', { params });
      setOpcionesRemitentes(Array.isArray(r.data.opciones) ? r.data.opciones : []);
    } catch (e) {
      console.error('Error cargando remitentes para filtro:', e);
      setOpcionesRemitentes([]);
    }
  }, [anioFiltro]);

  const cargarOpcionesDestinatarios = useCallback(async () => {
    try {
      const params = {};
      if (anioFiltro) params.anio = anioFiltro;
      const r = await api.get('/docente/mensajes/destinatarios-opciones', { params });
      setOpcionesDestinatarios(Array.isArray(r.data.opciones) ? r.data.opciones : []);
    } catch (e) {
      console.error('Error cargando destinatarios para filtro:', e);
      setOpcionesDestinatarios([]);
    }
  }, [anioFiltro]);

  useEffect(() => {
    if (vista === 'recibidos') {
      cargarOpcionesRemitentes();
    }
  }, [vista, cargarOpcionesRemitentes]);

  useEffect(() => {
    if (vista === 'enviados') {
      cargarOpcionesDestinatarios();
    }
  }, [vista, cargarOpcionesDestinatarios]);

  // Cargar mensajes según la vista
  useEffect(() => {
    if (vista === 'recibidos') {
      cargarMensajesRecibidos();
    } else if (vista === 'enviados') {
      cargarMensajesEnviados();
    }
  }, [vista, cargarMensajesRecibidos, cargarMensajesEnviados]);

  // Obtener años únicos de los mensajes para el filtro
  const [aniosDisponibles, setAniosDisponibles] = useState([]);
  
  const cargarAniosDisponibles = useCallback(async () => {
    try {
      const response = await api.get('/docente/mensajes/anios-disponibles');
      const anios = response.data.anios || [];
      setAniosDisponibles(anios);
      
      // Si el año filtrado ya no está disponible, limpiar el filtro
      if (anioFiltro && !anios.includes(anioFiltro)) {
        setAnioFiltro(null);
      }
    } catch (error) {
      console.error('Error cargando años disponibles:', error);
      // Si falla, calcular desde los mensajes ya cargados como fallback
      const todosMensajes = [...mensajesRecibidos, ...mensajesEnviados];
      const anios = new Set();
      todosMensajes.forEach(m => {
        if (m.fecha_hora) {
          anios.add(new Date(m.fecha_hora).getFullYear());
        }
      });
      const aniosArray = Array.from(anios).sort((a, b) => b - a);
      setAniosDisponibles(aniosArray);
      
      // Si el año filtrado ya no está disponible, limpiar el filtro
      if (anioFiltro && !aniosArray.includes(anioFiltro)) {
        setAnioFiltro(null);
      }
    }
  }, [anioFiltro]); // Incluir anioFiltro para verificar si aún existe

  // Cargar años disponibles solo al montar
  useEffect(() => {
    cargarAniosDisponibles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Solo al montar

  const obtenerAniosDisponibles = () => {
    return aniosDisponibles;
  };

  // Manejar selección de mensaje
  const toggleMensajeSeleccionado = (mensajeId) => {
    const nuevosSeleccionados = new Set(mensajesSeleccionados);
    if (nuevosSeleccionados.has(mensajeId)) {
      nuevosSeleccionados.delete(mensajeId);
    } else {
      nuevosSeleccionados.add(mensajeId);
    }
    setMensajesSeleccionados(nuevosSeleccionados);
  };

  // Marcar todos / Desmarcar todos
  const toggleMarcarTodos = () => {
    const mensajes = vista === 'recibidos' ? mensajesRecibidos : mensajesEnviados;
    if (mensajesSeleccionados.size === mensajes.length) {
      setMensajesSeleccionados(new Set());
    } else {
      setMensajesSeleccionados(new Set(mensajes.map(m => m.id)));
    }
  };

  // Eliminar mensajes seleccionados (solo de mi bandeja)
  const eliminarMensajesSeleccionados = async () => {
    if (mensajesSeleccionados.size === 0) {
      Swal.fire('Atención', 'Debe seleccionar al menos un mensaje para eliminar', 'warning');
      return;
    }

    const resultado = await Swal.fire({
      title: '¿Eliminar mensajes?',
      text: `¿Está seguro de eliminar ${mensajesSeleccionados.size} mensaje(s)?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    });

    if (!resultado.isConfirmed) return;

    try {
      const idsArray = Array.from(mensajesSeleccionados);
      const response = await api.delete('/docente/mensajes', {
        data: { mensajesIds: idsArray }
      });

      Swal.fire('Éxito', response.data?.message || `${idsArray.length} mensaje(s) eliminado(s) correctamente`, 'success');
      
      // Limpiar selección
      setMensajesSeleccionados(new Set());
      
      // Recargar años disponibles PRIMERO para actualizar el combo
      // La función cargarAniosDisponibles ya verifica y limpia el filtro si el año ya no existe
      await cargarAniosDisponibles();
      
      // Recargar mensajes de la vista actual
      if (vista === 'recibidos') {
        await cargarMensajesRecibidos();
      } else {
        await cargarMensajesEnviados();
      }
    } catch (error) {
      console.error('Error eliminando mensajes:', error);
      Swal.fire('Error', error.response?.data?.error || 'Error al eliminar mensajes', 'error');
    }
  };

  /** Admin: borra el envío completo (remitente + todos los destinatarios). */
  const eliminarEnvioCompletoAdmin = async () => {
    if (!esAdmin) return;
    if (mensajesSeleccionados.size === 0) {
      Swal.fire('Atención', 'Seleccione al menos un mensaje', 'warning');
      return;
    }

    const resultado = await Swal.fire({
      title: '¿Borrar para TODOS?',
      html:
        `Se eliminará el mensaje de <b>todas las bandejas</b> (quien lo envió y quienes lo recibieron).<br/><br/>` +
        `Seleccionados: <b>${mensajesSeleccionados.size}</b>`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#b91c1c',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Sí, borrar para todos',
      cancelButtonText: 'Cancelar',
    });
    if (!resultado.isConfirmed) return;

    try {
      const idsArray = Array.from(mensajesSeleccionados);
      const { data } = await api.post('/admin/seguridad/mensajes/borrar-lote', {
        mensaje_ids: idsArray,
      });
      Swal.fire(
        'Eliminado',
        data?.message || 'Envío(s) eliminado(s) de todas las bandejas.',
        'success'
      );
      setMensajesSeleccionados(new Set());
      setMensajeSeleccionado(null);
      await cargarAniosDisponibles();
      if (vista === 'recibidos') await cargarMensajesRecibidos();
      else await cargarMensajesEnviados();
    } catch (error) {
      console.error('Error borrado admin mensajes:', error);
      Swal.fire('Error', error.response?.data?.error || 'No se pudo borrar el envío', 'error');
    }
  };

  /** Marcar como leídos los mensajes seleccionados que aún estén NO_LEIDO (solo bandeja recibidos). */
  const marcarLeidosSeleccion = async () => {
    if (vista !== 'recibidos') return;
    if (mensajesSeleccionados.size === 0) {
      Swal.fire('Atención', 'Seleccione al menos un mensaje', 'warning');
      return;
    }
    const idsNoLeidos = mensajesRecibidos
      .filter((m) => mensajesSeleccionados.has(m.id) && m.estado === 'NO_LEIDO')
      .map((m) => m.id);
    if (idsNoLeidos.length === 0) {
      Swal.fire('Información', 'Los mensajes seleccionados ya están leídos.', 'info');
      return;
    }
    try {
      const { data } = await api.put('/docente/mensajes/marcar-leidos', { ids: idsNoLeidos });
      setMensajesRecibidos((prev) =>
        prev.map((m) => (idsNoLeidos.includes(m.id) ? { ...m, estado: 'LEIDO' } : m))
      );
      setMensajeSeleccionado((prev) =>
        prev && idsNoLeidos.includes(prev.id) ? { ...prev, estado: 'LEIDO' } : prev
      );
      setMensajesSeleccionados(new Set());
      Swal.fire({ icon: 'success', title: 'Listo', text: data?.message || 'Mensajes marcados como leídos', timer: 2200, showConfirmButton: true });
    } catch (error) {
      console.error('Error marcando mensajes como leídos:', error);
      Swal.fire('Error', error.response?.data?.error || 'No se pudo marcar como leídos', 'error');
    }
  };

  // Seleccionar destinatario
  const seleccionarDestinatario = (resultado) => {
    const yaSeleccionado = destinatariosSeleccionados.some(
      d => (d.usuario_id && d.usuario_id === resultado.usuario_id) ||
           (d.grupo_id && d.grupo_id === resultado.grupo_id)
    );

    if (!yaSeleccionado) {
      setDestinatariosSeleccionados([...destinatariosSeleccionados, resultado]);
    }
    setBusquedaDestinatario('');
    setMostrarResultados(false);
  };

  // Eliminar destinatario
  const eliminarDestinatario = (index) => {
    setDestinatariosSeleccionados(destinatariosSeleccionados.filter((_, i) => i !== index));
  };

  // Responder a un mensaje recibido: abre redactar con el remitente como destinatario
  const handleResponder = (mensaje) => {
    if (!mensaje || !mensaje.remitente_id) return;
    const destinatario = {
      usuario_id: mensaje.remitente_id,
      nombre_completo: mensaje.remitente_nombre_completo || 'Remitente',
      tipo: mensaje.remitente_tipo || ''
    };
    setDestinatariosSeleccionados([destinatario]);
    setAsunto('Re: ' + (mensaje.asunto || '').trim());
    setContenido('');
    setArchivosAdjuntos([]);
    setMensajeSeleccionado(null);
    setVista('nuevo');
  };

  // Manejar selección de archivos
  const handleArchivoChange = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length) setArchivosAdjuntos((prev) => [...prev, ...files]);
    e.target.value = '';
  };

  const eliminarArchivo = (index) => {
    setArchivosAdjuntos((prev) => prev.filter((_, i) => i !== index));
  };

  // Enviar mensaje
  const enviarMensaje = async () => {
    // Prevenir doble envío
    if (enviando) {
      return;
    }

    if (destinatariosSeleccionados.length === 0) {
      Swal.fire('Error', 'Debe seleccionar al menos un destinatario', 'error');
      return;
    }

    if (!asunto.trim()) {
      Swal.fire('Error', 'El asunto es requerido', 'error');
      return;
    }

    // Verificar que el contenido no esté vacío (sin HTML vacío)
    const contenidoLimpio = contenido.replace(/<[^>]*>/g, '').trim();
    if (!contenidoLimpio) {
      Swal.fire('Error', 'El mensaje es requerido', 'error');
      return;
    }

    setEnviando(true);
    try {
      const usuarios = destinatariosSeleccionados.filter(d => d.usuario_id).map(d => d.usuario_id);
      const grupos = destinatariosSeleccionados.filter(d => d.grupo_id).map(d => d.grupo_id);

      // Crear FormData para enviar archivos
      const formData = new FormData();
      formData.append('destinatarios', JSON.stringify(usuarios));
      formData.append('grupos', JSON.stringify(grupos));
      if (grupos.length > 0) {
        formData.append('alcance', 'grupos');
      }
      formData.append('asunto', asunto.trim());
      const cuerpo =
        mensajeDesdeCumpleanos ? MARCA_CUMPLEANOS_HTML + (contenido || '') : contenido;
      formData.append('mensaje', cuerpo);

      // Agregar archivos
      archivosAdjuntos.forEach((archivo) => {
        formData.append('archivos', archivo);
      });

      const response = await api.post('/docente/mensajes/enviar', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      // Mostrar mensaje detallado
      let mensajeExito = response.data.message;
      if (response.data.grupos > 0) {
        mensajeExito += `\n\n📊 Resumen:\n- ${response.data.grupos} grupo(s) seleccionado(s)\n- ${response.data.alumnosEnGrupos} alumno(s) recibirán el mensaje`;
        if (response.data.destinatariosDirectos > 0) {
          mensajeExito += `\n- ${response.data.destinatariosDirectos} destinatario(s) directo(s)`;
        }
      }
      
      Swal.fire({
        title: '¡Mensaje Enviado!',
        text: mensajeExito,
        icon: 'success',
        confirmButtonText: 'Aceptar'
      });
      
      // Limpiar formulario
      setDestinatariosSeleccionados([]);
      setAsunto('');
      setContenido('');
      setArchivosAdjuntos([]);
      setBusquedaDestinatario('');
      setMensajeDesdeCumpleanos(false);
      setVista('enviados');
      cargarMensajesEnviados();
    } catch (error) {
      console.error('Error enviando mensaje:', error);
      Swal.fire('Error', error.response?.data?.error || 'Error al enviar el mensaje', 'error');
    } finally {
      setEnviando(false);
    }
  };

  // Formatear fecha
  const formatearFecha = (fechaHora) => {
    const fecha = new Date(fechaHora);
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const fechaMsg = new Date(fecha);
    fechaMsg.setHours(0, 0, 0, 0);

    if (fechaMsg.getTime() === hoy.getTime()) {
      return fecha.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
    }

    return fecha.toLocaleDateString('es-PE', {
      day: 'numeric',
      month: 'short',
      year: fecha.getFullYear() !== hoy.getFullYear() ? 'numeric' : undefined
    });
  };

  const mensajes = vista === 'recibidos' ? mensajesRecibidos : mensajesEnviados;
  const tituloLista = vista === 'recibidos' ? 'Mensajes recibidos' : 'Mensajes enviados';
  const paginationLista = vista === 'recibidos' ? paginationRecibidos : paginationEnviados;
  const setPageLista = vista === 'recibidos' ? setPageRecibidos : setPageEnviados;
  const noLeidosEnPagina =
    vista === 'recibidos' ? mensajes.filter((m) => m.estado === 'NO_LEIDO').length : 0;

  const inicialesDe = (nombre) => {
    const parts = String(nombre || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (!parts.length) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  };

  return (
    <DashboardLayout>
      <div className="docente-mensajes">
        <header className="msg-hero">
          <div className="msg-hero-icon" aria-hidden="true">
            ✉
          </div>
          <div className="msg-hero-text">
            <h1>Mensajes</h1>
            <p>
              Bandeja interna del colegio: lee, responde y envía mensajes con adjuntos. Los no leídos se
              destacan en la lista.
            </p>
            <div className="msg-hero-meta">
              {paginationRecibidos.total > 0 && (
                <span className="msg-hero-chip">{paginationRecibidos.total} recibidos</span>
              )}
              {paginationEnviados.total > 0 && (
                <span className="msg-hero-chip">{paginationEnviados.total} enviados</span>
              )}
              {vista === 'recibidos' && noLeidosEnPagina > 0 && (
                <span className="msg-hero-chip msg-hero-chip--alert">
                  {noLeidosEnPagina} no leído(s) en esta página
                </span>
              )}
            </div>
          </div>
        </header>

        <div
          className={`msg-help ${
            vista === 'nuevo'
              ? 'msg-help--nuevo'
              : vista === 'enviados'
                ? 'msg-help--enviados'
                : 'msg-help--recibidos'
          }`}
        >
          <div className="msg-help-icon" aria-hidden="true">
            {vista === 'nuevo' ? '✎' : vista === 'enviados' ? '↑' : '↓'}
          </div>
          <div>
            <h2>
              {vista === 'nuevo'
                ? 'Redactar mensaje'
                : vista === 'enviados'
                  ? 'Bandeja de enviados'
                  : 'Bandeja de recibidos'}
            </h2>
            <p>
              {vista === 'nuevo'
                ? 'Buscá destinatarios, escribí el asunto y el cuerpo. Podés adjuntar archivos antes de enviar.'
                : vista === 'enviados'
                  ? 'Historúalos por año o destinatario. Tocá una tarjeta para ver el detalle.'
                  : 'Filtrá por año o remitente. Marcá varios para leerlos o eliminarlos sin abrirlos uno a uno.'}
            </p>
          </div>
        </div>

        <div className="msg-toolbar">
          <nav className="msg-tabs" role="tablist" aria-label="Bandejas de mensajes">
            <button
              type="button"
              role="tab"
              aria-selected={vista === 'recibidos'}
              className={`msg-tab msg-tab--recibidos${vista === 'recibidos' ? ' is-active' : ''}`}
              onClick={() => setVista('recibidos')}
            >
              <span className="msg-tab-ico" aria-hidden="true">
                ↓
              </span>
              Recibidos
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={vista === 'enviados'}
              className={`msg-tab msg-tab--enviados${vista === 'enviados' ? ' is-active' : ''}`}
              onClick={() => setVista('enviados')}
            >
              <span className="msg-tab-ico" aria-hidden="true">
                ↑
              </span>
              Enviados
            </button>
          </nav>
          <button
            type="button"
            className={`msg-btn-nuevo${vista === 'nuevo' ? ' is-active' : ''}`}
            onClick={() => setVista('nuevo')}
          >
            <span aria-hidden="true">＋</span> Enviar nuevo
          </button>
        </div>

        <div className="msg-main-card">
          <div className="mensajes-content">
            {vista === 'nuevo' ? (
              <div className={`nuevo-mensaje-form${mensajeDesdeCumpleanos ? ' nuevo-mensaje-cumpleanos-wrap' : ''}`}>
                <div className="msg-compose-head">
                  <h2>{mensajeDesdeCumpleanos ? 'Felicitación de cumpleaños' : 'Nuevo mensaje'}</h2>
                  <p>Completá destinatario, asunto y contenido. Guardá adjuntos si hace falta.</p>
                </div>
                <div className="form-group">
                  <label>Para:</label>
                  <DestinatarioSearchField
                    busquedaDestinatario={busquedaDestinatario}
                    onBusquedaChange={setBusquedaDestinatario}
                    destinatariosSeleccionados={destinatariosSeleccionados}
                    onEliminarDestinatario={eliminarDestinatario}
                    resultadosBusqueda={resultadosBusqueda}
                    mostrarResultados={mostrarResultados}
                    onMostrarResultadosChange={setMostrarResultados}
                    onSeleccionarDestinatario={seleccionarDestinatario}
                  />
                </div>

                {/* Campo Asunto */}
                <div className="form-group">
                  <label>Asunto:</label>
                  <input
                    type="text"
                    className="form-input"
                    value={asunto}
                    onChange={(e) => setAsunto(e.target.value)}
                    placeholder="Asunto del mensaje"
                  />
                </div>

                {/* Campo Mensaje con Editor de Texto Enriquecido */}
                <div className="form-group">
                  <label htmlFor="mensaje-editor">Mensaje:</label>
                  <div id="mensaje-editor-wrapper">
                    <ReactQuill
                      ref={quillRef}
                      theme="snow"
                      value={contenido}
                      onChange={setContenido}
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
                      id="archivos-input"
                      multiple
                      onChange={handleArchivoChange}
                      style={{ display: 'none' }}
                    />
                    <label htmlFor="archivos-input" className="btn-adjuntar-archivo">
                      📎 Adjuntar Archivos
                    </label>
                    <AdjuntosPendientes
                      archivos={archivosAdjuntos}
                      onQuitar={eliminarArchivo}
                      inputId="archivos-input"
                    />
                  </div>
                </div>

                {/* Botones */}
                <div className="form-actions">
                  <button
                    className="btn-cancelar"
                    onClick={() => {
                      setVista('recibidos');
                      setDestinatariosSeleccionados([]);
                      setAsunto('');
                      setContenido('');
                      setArchivosAdjuntos([]);
                      setBusquedaDestinatario('');
                    }}
                  >
                    Cancelar
                  </button>
                  <button
                    className="btn-enviar"
                    onClick={enviarMensaje}
                    disabled={enviando}
                  >
                    {enviando ? '⏳ Enviando...' : '✉️ Enviar Mensaje'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="mensajes-lista">
                <div className="lista-header">
                  <div className="lista-header-titulo">
                    <h2>{tituloLista}</h2>
                    {vista === 'recibidos' && mensajes.length > 0 && (
                      <span className="mensajes-contador-no-leidos" title="Mensajes no leídos en esta página">
                        {mensajes.filter((m) => m.estado === 'NO_LEIDO').length} no leído(s) en esta página
                      </span>
                    )}
                  </div>
                  <div className="lista-controls">
                    {/* Filtro por año */}
                    <div className="filtro-anio">
                      <label htmlFor="filtro-anio-select">Filtrar por año:</label>
                      <select
                        id="filtro-anio-select"
                        value={anioFiltro || ''}
                        onChange={(e) => {
                          setAnioFiltro(e.target.value ? parseInt(e.target.value, 10) : null);
                          setFiltroRemitenteId('');
                          setFiltroDestinatarioId('');
                          setPageRecibidos(1);
                          setPageEnviados(1);
                        }}
                        className="select-anio"
                      >
                        <option value="">Todos los años</option>
                        {obtenerAniosDisponibles().map(anio => (
                          <option key={anio} value={anio}>{anio}</option>
                        ))}
                      </select>
                    </div>
                    {vista === 'recibidos' && (
                      <div className="filtro-anio">
                        <label htmlFor="filtro-remitente-select-doc">Remitente:</label>
                        <select
                          id="filtro-remitente-select-doc"
                          value={filtroRemitenteId === '' ? '' : String(filtroRemitenteId)}
                          onChange={(e) => {
                            setFiltroRemitenteId(e.target.value ? parseInt(e.target.value, 10) : '');
                            setPageRecibidos(1);
                          }}
                          className="select-anio"
                        >
                          <option value="">Todos los remitentes</option>
                          {opcionesRemitentes.map((o) => (
                            <option key={o.id} value={o.id}>{o.nombre}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    {vista === 'enviados' && (
                      <div className="filtro-anio">
                        <label htmlFor="filtro-destinatario-select-doc">Destinatario:</label>
                        <select
                          id="filtro-destinatario-select-doc"
                          value={filtroDestinatarioId === '' ? '' : String(filtroDestinatarioId)}
                          onChange={(e) => {
                            setFiltroDestinatarioId(e.target.value ? parseInt(e.target.value, 10) : '');
                            setPageEnviados(1);
                          }}
                          className="select-anio"
                        >
                          <option value="">Todos los destinatarios</option>
                          {opcionesDestinatarios.map((o) => (
                            <option key={o.id} value={o.id}>{o.nombre}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    {/* Botones de acción */}
                    {mensajesSeleccionados.size > 0 && (
                      <>
                        {vista === 'recibidos' && (() => {
                          const nNoLeidos = mensajesRecibidos.filter(
                            (m) => mensajesSeleccionados.has(m.id) && m.estado === 'NO_LEIDO'
                          ).length;
                          return (
                            <button
                              type="button"
                              className="btn-marcar-leidos-lote"
                              onClick={marcarLeidosSeleccion}
                              disabled={nNoLeidos === 0}
                              title={nNoLeidos === 0 ? 'No hay no leídos entre los seleccionados' : 'Marcar como leídos sin abrir'}
                            >
                              ✓ Marcar como leídos ({nNoLeidos})
                            </button>
                          );
                        })()}
                        <button
                          type="button"
                          className="btn-eliminar-seleccionados"
                          onClick={eliminarMensajesSeleccionados}
                        >
                          🗑️ Eliminar ({mensajesSeleccionados.size})
                        </button>
                        {esAdmin && (
                          <button
                            type="button"
                            className="btn-eliminar-seleccionados"
                            style={{ background: '#991b1b' }}
                            onClick={eliminarEnvioCompletoAdmin}
                            title="Borra este mensaje también de las bandejas de todos los destinatarios"
                          >
                            🗑️ Borrar para todos ({mensajesSeleccionados.size})
                          </button>
                        )}
                      </>
                    )}
                    <div className="lista-pagination">
                      {paginationLista.total > 0 && (
                        <span className="pagination-info">
                          Pág. {paginationLista.page} / {Math.max(1, paginationLista.totalPages)} · {paginationLista.total} mensajes
                        </span>
                      )}
                      <button
                        type="button"
                        className="btn-pagination"
                        disabled={paginationLista.total === 0 || paginationLista.page <= 1}
                        onClick={() => setPageLista((p) => Math.max(1, p - 1))}
                        aria-label="Página anterior"
                      >
                        ‹
                      </button>
                      <button
                        type="button"
                        className="btn-pagination"
                        disabled={
                          paginationLista.total === 0 ||
                          paginationLista.page >= Math.max(1, paginationLista.totalPages)
                        }
                        onClick={() => setPageLista((p) => p + 1)}
                        aria-label="Página siguiente"
                      >
                        ›
                      </button>
                    </div>
                  </div>
                </div>

                {loading ? (
                  <div className="loading-mensajes">Cargando mensajes…</div>
                ) : mensajes.length === 0 ? (
                  <div className="empty-mensajes">
                    <div className="empty-icon" aria-hidden="true">
                      ✉
                    </div>
                    <h3>No hay mensajes</h3>
                    <p>No tienes mensajes {vista === 'recibidos' ? 'recibidos' : 'enviados'}</p>
                  </div>
                ) : (
                  <div className="mensajes-table mensajes-cards">
                    {mensajes.length > 0 && (
                      <div className="mensaje-row-header mensaje-card-selectall">
                        <div className="mensaje-checkbox">
                          <input
                            type="checkbox"
                            checked={mensajesSeleccionados.size === mensajes.length && mensajes.length > 0}
                            onChange={toggleMarcarTodos}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                        <div className="mensaje-header-text">
                          {mensajesSeleccionados.size > 0
                            ? `${mensajesSeleccionados.size} seleccionado(s)`
                            : 'Seleccionar todos'}
                        </div>
                      </div>
                    )}
                    {mensajes.map((mensaje) => {
                      const nombre =
                        vista === 'recibidos'
                          ? mensaje.remitente_nombre_completo
                          : mensaje.destinatario_nombre_completo;
                      const esNoLeido = mensaje.estado === 'NO_LEIDO';
                      const estaSeleccionado = mensajesSeleccionados.has(mensaje.id);
                      const tieneArchivos = Array.isArray(mensaje.archivos) && mensaje.archivos.length > 0;

                      const fotoUrl =
                        vista === 'recibidos'
                          ? mensaje.remitente_foto_url
                          : mensaje.destinatario_foto_url;

                      return (
                        <div
                          key={mensaje.id}
                          className={`mensaje-row mensaje-card ${esNoLeido ? 'no-leido' : ''} ${
                            estaSeleccionado ? 'seleccionado' : ''
                          }`}
                          onClick={() => {
                            setMensajeSeleccionado(mensaje);
                          }}
                        >
                          <div className="mensaje-checkbox" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={estaSeleccionado}
                              onChange={() => toggleMensajeSeleccionado(mensaje.id)}
                            />
                          </div>
                          <div className="mensaje-avatar" aria-hidden="true">
                            {fotoUrl ? (
                              <img
                                src={fotoUrl}
                                alt=""
                                className="mensaje-avatar-img"
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                  const fallback = e.currentTarget.nextElementSibling;
                                  if (fallback) fallback.style.display = 'flex';
                                }}
                              />
                            ) : null}
                            <span
                              className="mensaje-avatar-fallback"
                              style={fotoUrl ? { display: 'none' } : undefined}
                            >
                              {inicialesDe(nombre)}
                            </span>
                          </div>
                          <div className="mensaje-info">
                            <div className="mensaje-nombre">{nombre || 'Sin nombre'}</div>
                            <div className="mensaje-asunto">{mensaje.asunto}</div>
                          </div>
                          <div className="mensaje-card-meta">
                            <span
                              className={`mensaje-favorito ${
                                mensaje.favorito === 'SI' ? 'star-filled' : 'star-empty'
                              }`}
                              aria-hidden="true"
                            >
                              ★
                            </span>
                            {tieneArchivos && (
                              <span className="mensaje-attach-pill" title="Con adjuntos">
                                📎
                              </span>
                            )}
                            {esNoLeido && <span className="mensaje-unread-dot" title="No leído" />}
                            <div className="mensaje-fecha">{formatearFecha(mensaje.fecha_hora)}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Modal de detalle de mensaje (Portal para que quede por encima del navbar) */}
        {mensajeSeleccionado && createPortal(
          <div className="mensaje-modal-overlay" onClick={() => setMensajeSeleccionado(null)}>
            <div className="mensaje-modal" onClick={(e) => e.stopPropagation()}>
              <div className="mensaje-modal-header">
                <h3>{mensajeSeleccionado.asunto}</h3>
                <button className="mensaje-modal-close" onClick={() => setMensajeSeleccionado(null)}>
                  ×
                </button>
              </div>
              <MensajeModalContent 
                mensaje={mensajeSeleccionado}
                vista={vista}
                onClose={() => setMensajeSeleccionado(null)}
                onMensajeLeido={(mensajeId) => {
                  // Actualizar el estado del mensaje en la lista
                  if (vista === 'recibidos') {
                    setMensajesRecibidos(prev => 
                      prev.map(m => m.id === mensajeId ? { ...m, estado: 'LEIDO' } : m)
                    );
                  }
                }}
              />
              <div className="mensaje-modal-footer">
                {vista === 'recibidos' && mensajeSeleccionado?.remitente_id && (
                  <button type="button" className="btn-responder-mensaje" onClick={() => handleResponder(mensajeSeleccionado)}>
                    ✉️ Responder
                  </button>
                )}
                <button type="button" className="mensaje-modal-cerrar" onClick={() => setMensajeSeleccionado(null)}>
                  Cerrar
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
      </div>
    </DashboardLayout>
  );
}

export default DocenteMensajes;
