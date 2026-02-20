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

function ApoderadoHijos() {
  console.log('[FRONTEND] ========== APODERADOHIJOS COMPONENTE RENDERIZADO ==========');
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [hijos, setHijos] = useState([]);
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
  const [showModalNotasDetalladas, setShowModalNotasDetalladas] = useState(false);
  const [notasDetalladas, setNotasDetalladas] = useState(null);
  const [loadingNotasDetalladas, setLoadingNotasDetalladas] = useState(false);
  const [cicloSeleccionadoNotas, setCicloSeleccionadoNotas] = useState(1);
  const [showModalHorario, setShowModalHorario] = useState(false);
  const [horario, setHorario] = useState([]);
  const [loadingHorario, setLoadingHorario] = useState(false);
  const [showModalPagos, setShowModalPagos] = useState(false);
  const [pagos, setPagos] = useState([]);
  const [loadingPagos, setLoadingPagos] = useState(false);
  const [tabAnioActivo, setTabAnioActivo] = useState(null);
  const [tieneDeudasBloqueadas, setTieneDeudasBloqueadas] = useState(false);

  useEffect(() => {
    console.log('[FRONTEND] ApoderadoHijos useEffect ejecutado - Iniciando carga de hijos y verificación de deudas');
    cargarHijos();
    verificarDeudasBloqueadas();
  }, []);

  // Verificar si el usuario tiene deudas bloqueadas
  const verificarDeudasBloqueadas = async () => {
    try {
      console.log('[FRONTEND] ========== VERIFICAR DEUDAS BLOQUEADAS ==========');
      console.log('[FRONTEND] Llamando a /auth/verificar-deudas');
      const response = await api.get('/auth/verificar-deudas');
      console.log('[FRONTEND] Respuesta completa:', response);
      console.log('[FRONTEND] Respuesta de verificar-deudas:', response.data);
      const tieneDeudas = response.data?.tiene_deudas || false;
      console.log('[FRONTEND] tieneDeudas extraído:', tieneDeudas);
      setTieneDeudasBloqueadas(tieneDeudas);
      console.log('[FRONTEND] tieneDeudasBloqueadas establecido a:', tieneDeudas);
      console.log('[FRONTEND] ========== FIN VERIFICAR DEUDAS ==========');
    } catch (error) {
      console.error('[FRONTEND] ========== ERROR VERIFICAR DEUDAS ==========');
      console.error('[FRONTEND] Error completo:', error);
      console.error('[FRONTEND] Error message:', error.message);
      console.error('[FRONTEND] Error response:', error.response);
      console.error('[FRONTEND] Error response data:', error.response?.data);
      console.error('[FRONTEND] Error response status:', error.response?.status);
      console.error('[FRONTEND] ========== FIN ERROR ==========');
      setTieneDeudasBloqueadas(false); // En caso de error, no bloquear
    }
  };

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
      const response = await api.get('/apoderado/hijos');
      console.log('[FRONTEND] Respuesta completa de apoderado/hijos:', response.data);
      console.log('[FRONTEND] Hijos recibidos:', response.data.hijos);
      if (response.data.hijos && response.data.hijos.length > 0) {
        console.log('[FRONTEND] Primer hijo completo:', response.data.hijos[0]);
        console.log('[FRONTEND] DNI del primer hijo:', response.data.hijos[0].dni || response.data.hijos[0].nro_documento || 'NO DISPONIBLE');
      }
      setHijos(response.data.hijos || []);
    } catch (error) {
      console.error('Error cargando hijos:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpcionesClick = (e, hijoId) => {
    e.stopPropagation();
    console.log('[FRONTEND] ========== HANDLE OPCIONES CLICK ==========');
    console.log('[FRONTEND] handleOpcionesClick llamado para hijoId:', hijoId);
    console.log('[FRONTEND] openDropdown actual:', openDropdown);
    console.log('[FRONTEND] openDropdown?.hijoId:', openDropdown?.hijoId);
    const rect = e.currentTarget.getBoundingClientRect();
    console.log('[FRONTEND] Rect del botón:', rect);
    
    // CORRECCIÓN: openDropdown es un objeto {hijoId, top, left}, no un número
    if (openDropdown?.hijoId === hijoId) {
      console.log('[FRONTEND] Cerrando dropdown (ya estaba abierto)');
      setOpenDropdown(null);
    } else {
      console.log('[FRONTEND] Abriendo dropdown para hijoId:', hijoId);
      // Calcular posición del dropdown (12 opciones: Editar Datos, Cursos, Horario, etc.)
      const dropdownWidth = 220;
      const dropdownMaxHeight = Math.min(420, window.innerHeight - 40); // Scroll si hay muchas opciones
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
      if (top + dropdownMaxHeight > window.innerHeight - 10) {
        top = rect.top - dropdownMaxHeight - 2;
      }
      
      // CRÍTICO: Evitar que "Editar Datos" (primer ítem) quede cortado arriba
      if (top < 10) {
        top = 10;
      }
      
      const newDropdown = {
        hijoId,
        top,
        left,
        maxHeight: dropdownMaxHeight
      };
      console.log('[FRONTEND] Nuevo openDropdown configurado:', newDropdown);
      setOpenDropdown(newDropdown);
      console.log('[FRONTEND] ========== FIN HANDLE OPCIONES CLICK ==========');
    }
  };

  // Función para diagnosticar deudas de un hijo
  const diagnosticarDeudas = async (hijo) => {
    try {
      console.log('[FRONTEND] Iniciando diagnóstico de deudas para:', hijo);
      console.log('[FRONTEND] Hijo completo (todas las propiedades):', Object.keys(hijo));
      console.log('[FRONTEND] DNI del hijo (dni):', hijo.dni);
      console.log('[FRONTEND] DNI del hijo (nro_documento):', hijo.nro_documento);
      console.log('[FRONTEND] DNI del hijo (cualquiera):', hijo.dni || hijo.nro_documento || 'NO DISPONIBLE');
      
      // Usar dni o nro_documento como fallback
      const dniHijo = hijo.dni || hijo.nro_documento;
      if (!dniHijo) {
        console.error('[FRONTEND] ERROR: No se pudo obtener el DNI del hijo. Objeto completo:', JSON.stringify(hijo, null, 2));
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: 'No se pudo obtener el DNI del alumno. Por favor, contacte al administrador.',
          confirmButtonText: 'Entendido'
        });
        return;
      }
      
      const response = await api.get(`/auth/diagnostico-deudas/${dniHijo}`);
      console.log('[FRONTEND] Resultado del diagnóstico:', response.data);
      
      // Mostrar resultado en un modal
      const resultado = response.data;
      let mensaje = `<h3>Diagnóstico de Deudas - ${hijo.nombres} ${hijo.apellido_paterno}</h3>`;
      mensaje += `<p><strong>DNI:</strong> ${resultado.alumno?.dni || 'N/A'}</p>`;
      mensaje += `<p><strong>Configuración:</strong></p>`;
      mensaje += `<ul>`;
      mensaje += `<li>Bloquear Deudores: ${resultado.configuracion?.bloquear_deudores || 'N/A'}</li>`;
      mensaje += `<li>Días Tolerancia: ${resultado.configuracion?.dias_tolerancia || 0}</li>`;
      mensaje += `<li>Inicio Pensiones: ${resultado.configuracion?.inicio_pensiones || 'N/A'}</li>`;
      mensaje += `</ul>`;
      mensaje += `<p><strong>Resultado:</strong></p>`;
      mensaje += `<ul>`;
      mensaje += `<li>Tiene Deudas: ${resultado.resultado?.tiene_deudas ? '✅ SÍ' : '❌ NO'}</li>`;
      mensaje += `<li>Debe Bloquear: ${resultado.resultado?.debe_bloquear ? '✅ SÍ' : '❌ NO'}</li>`;
      mensaje += `</ul>`;
      
      if (resultado.pensiones && resultado.pensiones.length > 0) {
        mensaje += `<p><strong>Detalles de Pensiones:</strong></p>`;
        mensaje += `<table style="width: 100%; border-collapse: collapse; margin-top: 10px;">`;
        mensaje += `<tr style="background: #f0f0f0;"><th style="padding: 8px; border: 1px solid #ddd;">Pensión</th><th style="padding: 8px; border: 1px solid #ddd;">Fecha Vencimiento</th><th style="padding: 8px; border: 1px solid #ddd;">Vencida</th><th style="padding: 8px; border: 1px solid #ddd;">Tiene Pago</th><th style="padding: 8px; border: 1px solid #ddd;">Tiene Deuda</th></tr>`;
        resultado.pensiones.forEach(p => {
          mensaje += `<tr>`;
          mensaje += `<td style="padding: 8px; border: 1px solid #ddd;">${p.nro_pension}</td>`;
          mensaje += `<td style="padding: 8px; border: 1px solid #ddd;">${p.fecha_vencimiento}</td>`;
          mensaje += `<td style="padding: 8px; border: 1px solid #ddd;">${p.esta_vencida ? '✅ SÍ' : '❌ NO'}</td>`;
          mensaje += `<td style="padding: 8px; border: 1px solid #ddd;">${p.tiene_pago ? '✅ SÍ' : '❌ NO'}</td>`;
          mensaje += `<td style="padding: 8px; border: 1px solid #ddd; ${p.tiene_deuda ? 'background: #ffcccc;' : ''}">${p.tiene_deuda ? '🔴 SÍ' : '✅ NO'}</td>`;
          mensaje += `</tr>`;
        });
        mensaje += `</table>`;
      }
      
      mensaje += `<p style="margin-top: 20px;"><strong>Datos completos en consola (F12)</strong></p>`;
      
      Swal.fire({
        icon: resultado.resultado?.tiene_deudas ? 'warning' : 'success',
        title: resultado.resultado?.tiene_deudas ? 'Tiene Deudas' : 'Sin Deudas',
        html: mensaje,
        width: '800px',
        confirmButtonText: 'Entendido'
      });
    } catch (error) {
      console.error('[FRONTEND] Error en diagnóstico:', error);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: error.response?.data?.error || 'Error al obtener diagnóstico',
        confirmButtonText: 'Entendido'
      });
    }
  };

  const handleOpcionClick = async (opcion, hijo) => {
    setOpenDropdown(null);
    
    switch (opcion) {
      case 'editar-datos':
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
      case 'horario':
        await handleVerHorario(hijo);
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
      case 'notas-detalladas':
        console.log('[FRONTEND] handleOpcionClick - notas-detalladas, tieneDeudasBloqueadas:', tieneDeudasBloqueadas);
        if (tieneDeudasBloqueadas) {
          console.log('[FRONTEND] BLOQUEANDO acceso a Notas Detalladas por deudas');
          Swal.fire({
            icon: 'warning',
            title: 'Acceso Bloqueado',
            text: 'No puede acceder a esta opción debido a deudas pendientes de pensión. Por favor, cancele las pensiones vencidas.',
            confirmButtonText: 'Entendido'
          });
          return;
        }
        console.log('[FRONTEND] PERMITIENDO acceso a Notas Detalladas');
        await handleVerNotasDetalladas(hijo);
        break;
      case 'imprimir-notas':
        console.log('[FRONTEND] handleOpcionClick - imprimir-notas, tieneDeudasBloqueadas:', tieneDeudasBloqueadas);
        if (tieneDeudasBloqueadas) {
          console.log('[FRONTEND] BLOQUEANDO acceso a Ver Libreta por deudas');
          Swal.fire({
            icon: 'warning',
            title: 'Acceso Bloqueado',
            text: 'No puede acceder a esta opción debido a deudas pendientes de pensión. Por favor, cancele las pensiones vencidas.',
            confirmButtonText: 'Entendido'
          });
          return;
        }
        console.log('[FRONTEND] PERMITIENDO acceso a Ver Libreta');
        await handleVerLibreta(hijo);
        break;
      case 'pagos-realizados':
        // Permitir acceso a Pagos Realizados siempre (puede ver lo que pagó y lo que tiene pendiente)
        // El botón "IMPRIMIR BOLETA" solo aparecerá si el pago está cancelado
        await handleVerPagos(hijo);
        break;
      case 'psicologia':
        console.log('Psicología de:', hijo);
        // Implementar después
        break;
      case 'diagnostico-deudas':
        await diagnosticarDeudas(hijo);
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
      const response = await api.get(`/apoderado/hijos/${hijoId}/datos`);
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
      const response = await api.post(`/apoderado/hijos/${hijo.id}/reiniciar-contrasena`);

      // Mostrar mensaje de éxito
      Swal.fire({
        icon: 'success',
        title: '¡Contraseña reiniciada!',
        text: response.data?.message || 'Se volvió a poner el DNI del estudiante como contraseña',
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
      const response = await api.get(`/apoderado/hijos/${hijo.id}/qr`);
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
      const response = await api.get(`/apoderado/hijos/${hijo.id}/incidencias`);
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
      const response = await api.get(`/apoderado/hijos/${hijo.id}/estrellas`);
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
      const response = await api.get(`/apoderado/hijos/${hijo.id}/asistencias`);
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
      const response = await api.get(`/apoderado/hijos/${hijo.id}/cursos`);
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
      // Navegar a una ruta especial para apoderados
      navigate(`/apoderado/hijos/${hijoSeleccionado.id}/aula-virtual/${curso.asignatura_id}`);
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
      const response = await api.post(`/apoderado/hijos/${hijoSeleccionado.id}/mensajes/enviar`, formData, {
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
            const response = await api.post(`/apoderado/hijos/${hijoSeleccionado.id}/mensajes/subir-imagen`, formData, {
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

  // ========== FUNCIONES PARA HORARIO ==========
  const diasSemana = [
    { id: 1, nombre: 'Lunes', abrev: 'LUNES' },
    { id: 2, nombre: 'Martes', abrev: 'MARTES' },
    { id: 3, nombre: 'Miércoles', abrev: 'MIÉRCOLES' },
    { id: 4, nombre: 'Jueves', abrev: 'JUEVES' },
    { id: 5, nombre: 'Viernes', abrev: 'VIERNES' }
  ];

  // Función para formatear hora
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

  // Convertir hora a minutos para ordenar
  const horaAMinutos = (hora) => {
    if (!hora) return 0;
    
    const horaUpper = hora.toUpperCase().trim();
    let hora24h = hora;
    
    if (horaUpper.includes('AM') || horaUpper.includes('PM')) {
      const partes = hora.split(':');
      if (partes.length < 2) return 0;
      
      let h = parseInt(partes[0], 10);
      const m = parseInt(partes[1] ? partes[1].split(' ')[0] : 0, 10);
      
      if (horaUpper.includes('PM') && h !== 12) {
        h += 12;
      } else if (horaUpper.includes('AM') && h === 12) {
        h = 0;
      }
      
      return h * 60 + m;
    } else {
      const partes = hora.split(':');
      if (partes.length < 2) return 0;
      
      const h = parseInt(partes[0], 10);
      const m = parseInt(partes[1] ? partes[1].split(' ')[0] : 0, 10);
      
      if (isNaN(h) || isNaN(m)) return 0;
      
      return h * 60 + m;
    }
  };

  // Obtener bloques de horarios únicos
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

  // Obtener clase en un día y bloque específico
  const obtenerClase = (dia, horaInicio, horaFin, horarioData) => {
    if (!horarioData || horarioData.length === 0) return null;
    const clase = horarioData.find(c => {
      const diaNormalizado = c.diaNormalizado || c.dia || 0;
      if (diaNormalizado !== dia) return false;
      
      const inicioClase = c.inicio || c.hora_inicio || '';
      const finClase = c.fin || c.hora_final || '';
      
      return inicioClase === horaInicio && finClase === horaFin;
    });
    
    return clase;
  };

  // Formatear texto de la clase
  const formatearClase = (clase) => {
    if (!clase) return null;
    const titulo = clase.titulo || clase.curso_nombre || '';
    const docente = clase.docente_nombre || '';
    
    if (!titulo) return null;
    if (!docente) return titulo;
    
    return `${titulo} - ${docente}`;
  };

  // Paleta de colores para cursos
  const colorPalette = [
    '#FFF9C4', '#BBDEFB', '#F3E5F5', '#C8E6C9', '#E0F7FA',
    '#FFF3E0', '#FCE4EC', '#E1F5FE', '#F1F8E9', '#FFEBEE',
    '#E8EAF6', '#E0F2F1', '#E1BEE7', '#FFE0B2', '#FFCCBC',
    '#D1C4E9', '#F8BBD0', '#B2DFDB', '#C5E1A5', '#FFE082',
    '#BCAAA4', '#90CAF9', '#A5D6A7', '#CE93D8', '#FFAB91',
    '#80CBC4', '#FFCC80', '#B39DDB', '#81C784', '#64B5F6',
  ];

  // Hash para asignar colores consistentes
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

  // Obtener color para curso
  const getColorForCourse = (titulo) => {
    if (!titulo || !titulo.trim()) return null;
    
    const tituloNormalizado = titulo.trim();
    const hash = hashString(tituloNormalizado);
    const index = hash % colorPalette.length;
    
    return colorPalette[index];
  };

  // Aclarar color
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

  // Convertir hex a RGB
  const hexToRgb = (hex) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
  };

  // Procesar horario para detalle
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
      const diaNombre = diasSemana.find(d => d.id === diaNormalizado)?.nombre || `Día ${diaNormalizado}`;
      const inicio = clase.inicio || clase.hora_inicio || '';
      const fin = clase.fin || clase.hora_final || '';

      const existeHorario = cursosMap[clave].horarios.some(h => 
        h.dia === diaNormalizado && h.inicio === inicio && h.fin === fin
      );

      if (!existeHorario && inicio && fin) {
        cursosMap[clave].horarios.push({
          dia: diaNormalizado,
          diaNombre,
          inicio,
          fin
        });
      }
    });

    const cursosArray = Object.values(cursosMap).sort((a, b) => {
      return a.titulo.localeCompare(b.titulo);
    });

    cursosArray.forEach(curso => {
      curso.horarios.sort((a, b) => {
        if (a.dia !== b.dia) {
          return a.dia - b.dia;
        }
        return horaAMinutos(a.inicio) - horaAMinutos(b.inicio);
      });
    });

    return cursosArray;
  };

  // Cargar horario del hijo
  const cargarHorarioHijo = async (hijoId) => {
    try {
      setLoadingHorario(true);
      const response = await api.get(`/apoderado/hijos/${hijoId}/horario`);
      const horariosRecibidos = response.data.horario || [];
      
      // Normalizar días
      const dias = horariosRecibidos
        .map((c) => typeof c.dia === 'number' ? c.dia : null)
        .filter((d) => d !== null);

      if (dias.length > 0) {
        const minDia = Math.min(...dias);
        const maxDia = Math.max(...dias);
        const usaCeroCuatroComoLunesViernes = minDia === 0 && maxDia <= 4;

        const normalizado = horariosRecibidos.map((c) => ({
          ...c,
          titulo: c.curso_nombre || c.titulo,
          inicio: c.hora_inicio || c.inicio,
          fin: c.hora_final || c.fin,
          diaNormalizado: usaCeroCuatroComoLunesViernes
            ? (typeof c.dia === 'number' ? c.dia + 1 : c.dia)
            : c.dia
        }));

        setHorario(normalizado);
      } else {
        setHorario(horariosRecibidos);
      }
    } catch (error) {
      console.error('Error cargando horario:', error);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'No se pudo cargar el horario',
        confirmButtonText: 'Entendido'
      });
    } finally {
      setLoadingHorario(false);
    }
  };

  // Manejar ver horario

  // Exportar horario a PDF
  const handleExportarHorarioPDF = () => {
    if (!horario || horario.length === 0) {
      Swal.fire({
        title: 'Sin datos',
        text: 'No hay horario para exportar',
        icon: 'info'
      });
      return;
    }

    try {
      const doc = new jsPDF('l', 'mm', 'a4');
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 15;
      const contentWidth = pageWidth - (margin * 2);
      let yPosition = margin;

      const colorHeader = [59, 130, 246];
      const colorBorder = [30, 64, 175];
      const colorText = [30, 41, 59];

      // Header
      doc.setFillColor(...colorHeader);
      doc.rect(margin, yPosition, contentWidth, 25, 'F');
      doc.setDrawColor(...colorBorder);
      doc.setLineWidth(0.5);
      doc.rect(margin, yPosition, contentWidth, 25);
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(20);
      doc.setFont('helvetica', 'bold');
      doc.text('HORARIO DE CLASES', margin + contentWidth / 2, yPosition + 15, { align: 'center' });
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`${hijoSeleccionado?.nombres} ${hijoSeleccionado?.apellido_paterno}`, margin + contentWidth / 2, yPosition + 22, { align: 'center' });
      yPosition += 30;

      // Tabla de horario
      const colWidth = contentWidth / 6;
      const rowHeight = 15;
      const headerHeight = 12;

      // Encabezados
      doc.setFillColor(...colorHeader);
      doc.rect(margin, yPosition, colWidth, headerHeight, 'F');
      doc.setDrawColor(...colorBorder);
      doc.setLineWidth(0.3);
      doc.rect(margin, yPosition, colWidth, headerHeight);
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('HORA', margin + colWidth / 2, yPosition + headerHeight / 2 + 3, { align: 'center' });

      diasSemana.forEach((dia, idx) => {
        const xPos = margin + colWidth + (idx * colWidth);
        doc.setFillColor(...colorHeader);
        doc.rect(xPos, yPosition, colWidth, headerHeight, 'F');
        doc.setDrawColor(...colorBorder);
        doc.rect(xPos, yPosition, colWidth, headerHeight);
        doc.text(dia.abrev, xPos + colWidth / 2, yPosition + headerHeight / 2 + 3, { align: 'center' });
      });

      yPosition += headerHeight;

      // Filas de horarios
      const horariosUnicos = obtenerHorariosUnicos(horario);
      horariosUnicos.forEach((bloque) => {
        const claseLunes = obtenerClase(1, bloque.inicio, bloque.fin, horario);
        const claseMartes = obtenerClase(2, bloque.inicio, bloque.fin, horario);
        const claseMiercoles = obtenerClase(3, bloque.inicio, bloque.fin, horario);
        const claseJueves = obtenerClase(4, bloque.inicio, bloque.fin, horario);
        const claseViernes = obtenerClase(5, bloque.inicio, bloque.fin, horario);

        const tieneClase = claseLunes || claseMartes || claseMiercoles || claseJueves || claseViernes;
        if (!tieneClase) return;

        if (yPosition + rowHeight > pageHeight - margin - 10) {
          doc.addPage();
          yPosition = margin;
        }

        // Celda de hora
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.3);
        doc.rect(margin, yPosition, colWidth, rowHeight);
        doc.setTextColor(...colorText);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        const horaTexto = `${formatearHora(bloque.inicio)} - ${formatearHora(bloque.fin)}`;
        doc.text(horaTexto, margin + colWidth / 2, yPosition + rowHeight / 2 + 3, { align: 'center', maxWidth: colWidth - 4 });

        // Celdas de días
        const clases = [claseLunes, claseMartes, claseMiercoles, claseJueves, claseViernes];
        clases.forEach((clase, diaIdx) => {
          const xPos = margin + colWidth + (diaIdx * colWidth);
          doc.setDrawColor(200, 200, 200);
          doc.setLineWidth(0.3);
          doc.rect(xPos, yPosition, colWidth, rowHeight);
          
          if (clase) {
            const colorCurso = getColorForCourse(clase.titulo || clase.curso_nombre || '');
            const rgb = hexToRgb(colorCurso);
            if (rgb) {
              doc.setFillColor(rgb.r, rgb.g, rgb.b);
              doc.rect(xPos + 0.5, yPosition + 0.5, colWidth - 1, rowHeight - 1, 'F');
            }
            
            doc.setTextColor(...colorText);
            doc.setFontSize(9);
            doc.setFont('helvetica', 'normal');
            const textoClase = formatearClase(clase);
            if (textoClase) {
              const lineas = doc.splitTextToSize(textoClase, colWidth - 6);
              const numLineas = lineas.length;
              const alturaTexto = numLineas * 4;
              const yInicio = yPosition + (rowHeight - alturaTexto) / 2 + 3;
              lineas.forEach((linea, lineIdx) => {
                doc.text(linea, xPos + colWidth / 2, yInicio + (lineIdx * 4), { align: 'center', maxWidth: colWidth - 6 });
              });
            }
          }
        });

        yPosition += rowHeight;
      });

      // Detalle de horario
      const detalleHorario = procesarDetalleHorario(horario);
      if (detalleHorario.length > 0) {
        if (yPosition + 20 > pageHeight - margin - 10) {
          doc.addPage();
          yPosition = margin;
        }

        yPosition += 10;
        doc.setDrawColor(...colorBorder);
        doc.setLineWidth(0.5);
        doc.line(margin, yPosition, margin + contentWidth, yPosition);
        yPosition += 5;

        doc.setTextColor(...colorText);
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('DETALLE DE HORARIO', margin, yPosition);
        yPosition += 8;

        detalleHorario.forEach((curso) => {
          const cardHeight = 28;
          
          if (yPosition + cardHeight > pageHeight - margin - 10) {
            doc.addPage();
            yPosition = margin;
          }

          const colorCurso = getColorForCourse(curso.titulo);
          const rgb = hexToRgb(colorCurso);
          
          if (rgb) {
            doc.setFillColor(rgb.r, rgb.g, rgb.b);
            doc.roundedRect(margin, yPosition, contentWidth, cardHeight, 3, 3, 'F');
          }
          
          doc.setDrawColor(200, 200, 200);
          doc.setLineWidth(0.3);
          doc.roundedRect(margin, yPosition, contentWidth, cardHeight, 3, 3);
          
          const centroVertical = yPosition + cardHeight / 2;
          
          doc.setTextColor(...colorText);
          doc.setFontSize(14);
          doc.setFont('helvetica', 'bold');
          const tituloLines = doc.splitTextToSize(curso.titulo, contentWidth - 20);
          const tituloY = centroVertical - 8;
          doc.text(tituloLines, margin + contentWidth / 2, tituloY, { align: 'center', maxWidth: contentWidth - 20 });
          
          if (curso.docente) {
            doc.setFontSize(11);
            doc.setFont('helvetica', 'normal');
            const docenteY = centroVertical - 1;
            doc.text(`Docente: ${curso.docente}`, margin + contentWidth / 2, docenteY, { align: 'center', maxWidth: contentWidth - 20 });
          }
          
          if (curso.horarios && curso.horarios.length > 0) {
            let horariosTexto = curso.horarios.map(h => 
              `${h.diaNombre}: ${formatearHora(h.inicio)} - ${formatearHora(h.fin)}`
            ).join(' | ');
            
            doc.setFontSize(10);
            const horariosLines = doc.splitTextToSize(horariosTexto, contentWidth - 20);
            const horariosY = centroVertical + 6;
            doc.text(horariosLines, margin + contentWidth / 2, horariosY, { align: 'center', maxWidth: contentWidth - 20 });
          }
          
          yPosition += cardHeight + 4;
        });
      }

      // Pie de página
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

      const nombreArchivo = `Horario_${hijoSeleccionado?.nombres}_${hijoSeleccionado?.apellido_paterno}_${new Date().getTime()}.pdf`;
      doc.save(nombreArchivo);

      Swal.fire({
        title: '¡PDF Generado!',
        text: 'El horario se ha exportado correctamente',
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

      // Luego: Cards de asistencias en 3 columnas (formato igual al modal)
      const cardsPorFila = 3;
      const cardWidth = (contentWidth - (10 * (cardsPorFila - 1))) / cardsPorFila;
      const cardHeight = 35;
      let filaActual = 0;
      let columnaActual = 0;
      let yPosInicialFila = yPos;

      asistenciasMes.forEach((asistencia, index) => {
        // Si es el inicio de una nueva fila (primera columna)
        if (columnaActual === 0 && index > 0) {
          yPosInicialFila += cardHeight + 5;
          // Si no cabe en la página actual, nueva página
          if (yPosInicialFila + cardHeight > pageHeight - 20) {
            doc.addPage();
            yPosInicialFila = margin;
            filaActual = 0;
          }
        }

        // Calcular posición del card
        const xPos = margin + (columnaActual * (cardWidth + 10));
        const yPosCard = yPosInicialFila;

        const tipoColor = {
          'PRESENTE': { bg: [232, 245, 233], border: [76, 175, 80], text: [46, 125, 50] },
          'TARDANZA': { bg: [255, 243, 224], border: [255, 152, 0], text: [230, 81, 0] },
          'TARDANZA_JUSTIFICADA': { bg: [227, 242, 253], border: [33, 150, 243], text: [21, 101, 192] },
          'FALTA': { bg: [255, 235, 238], border: [244, 67, 54], text: [198, 40, 40] },
          'FALTA_JUSTIFICADA': { bg: [243, 229, 245], border: [156, 39, 176], text: [106, 27, 154] }
        }[asistencia.tipo] || { bg: [245, 245, 245], border: [158, 158, 158], text: [66, 66, 66] };

        // Fondo del card
        doc.setFillColor(tipoColor.bg[0], tipoColor.bg[1], tipoColor.bg[2]);
        doc.roundedRect(xPos, yPosCard, cardWidth, cardHeight, 3, 3, 'F');

        // Borde
        doc.setDrawColor(tipoColor.border[0], tipoColor.border[1], tipoColor.border[2]);
        doc.setLineWidth(1);
        doc.roundedRect(xPos, yPosCard, cardWidth, cardHeight, 3, 3);

        // Contenido
        doc.setTextColor(tipoColor.text[0], tipoColor.text[1], tipoColor.text[2]);
        
        // Fecha y Estado en la misma fila (arriba)
        doc.setFontSize(7);
        doc.setFont('helvetica', 'bold');
        const fechaFormateada = new Date(asistencia.fecha).toLocaleDateString('es-PE', {
          day: 'numeric',
          month: 'short'
        });
        doc.text(fechaFormateada, xPos + 2, yPosCard + 5);
        
        // Estado al costado
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6);
        const tipoTexto = asistencia.tipo.replace('_', ' ');
        const estadoX = xPos + cardWidth - 25;
        doc.text(tipoTexto, estadoX, yPosCard + 5, { align: 'right' });

        // Labels "Entrada:" y "Salida:" en la misma fila
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6);
        doc.text('Entrada:', xPos + 2, yPosCard + 12);
        if (asistencia.hora_salida) {
          doc.text('Salida:', xPos + cardWidth / 2 + 2, yPosCard + 12);
        }

        // Horas en la siguiente fila
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.text(asistencia.hora_entrada || 'N/A', xPos + 2, yPosCard + 19);
        if (asistencia.hora_salida) {
          doc.text(asistencia.hora_salida, xPos + cardWidth / 2 + 2, yPosCard + 19);
        }

        // Avanzar columna
        columnaActual++;
        if (columnaActual >= cardsPorFila) {
          columnaActual = 0;
          filaActual++;
        }
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

  const handleVerNotasDetalladas = async (hijo) => {
    try {
      setHijoSeleccionado(hijo);
      setCicloSeleccionadoNotas(1);
      setNotasDetalladas(null);
      setShowModalNotasDetalladas(true);
      await cargarNotasDetalladas(hijo.id);
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

  const handleVerLibreta = async (hijo) => {
    try {
      setHijoSeleccionado(hijo);
      await generarPDFLibreta(hijo.id);
    } catch (error) {
      console.error('Error generando libreta:', error);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'No se pudo generar la libreta',
        confirmButtonText: 'Entendido'
      });
    }
  };

  const handleVerHorario = async (hijo) => {
    try {
      setHijoSeleccionado(hijo);
      setShowModalHorario(true);
      setLoadingHorario(true);
      setHorario([]);
      
      const response = await api.get(`/apoderado/hijos/${hijo.id}/horario`);
      const horariosRecibidos = response.data.horario || [];
      
      // Normalizar días (igual que en AlumnoHorario)
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

  // Cargar pagos del hijo
  const cargarPagosHijo = async (hijoId) => {
    try {
      setLoadingPagos(true);
      const response = await api.get(`/apoderado/hijos/${hijoId}/pagos`);
      setPagos(response.data.matriculas || []);
    } catch (error) {
      console.error('Error cargando pagos:', error);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'No se pudieron cargar los pagos',
        confirmButtonText: 'Entendido'
      });
    } finally {
      setLoadingPagos(false);
    }
  };

  // Manejar ver pagos
  const handleVerPagos = async (hijo) => {
    try {
      setHijoSeleccionado(hijo);
      setShowModalPagos(true);
      setTabAnioActivo(null);
      await cargarPagosHijo(hijo.id);
      // Establecer el primer año como activo
      const response = await api.get(`/apoderado/hijos/${hijo.id}/pagos`);
      const matriculas = response.data.matriculas || [];
      if (matriculas.length > 0) {
        setTabAnioActivo(matriculas[0].anio);
      }
    } catch (error) {
      console.error('Error abriendo modal de pagos:', error);
    }
  };

  // Formatear monto
  const formatearMonto = (monto) => {
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: 'PEN',
      minimumFractionDigits: 2
    }).format(monto);
  };

  // Formatear fecha
  const formatearFechaPago = (fecha) => {
    if (!fecha) return 'N/A';
    try {
      const date = new Date(fecha);
      return date.toLocaleDateString('es-PE', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
    } catch (error) {
      return fecha;
    }
  };

  // Función para convertir número a letras (basada en sistema anterior)
  const numeroALetras = (num) => {
    const matuni = {
      1: 'uno', 2: 'dos', 3: 'tres', 4: 'cuatro', 5: 'cinco',
      6: 'seis', 7: 'siete', 8: 'ocho', 9: 'nueve', 10: 'diez',
      11: 'once', 12: 'doce', 13: 'trece', 14: 'catorce', 15: 'quince',
      16: 'dieciséis', 17: 'diecisiete', 18: 'dieciocho', 19: 'diecinueve', 20: 'veinte'
    };
    const matdec = {
      2: 'veinte', 3: 'treinta', 4: 'cuarenta', 5: 'cincuenta',
      6: 'sesenta', 7: 'setenta', 8: 'ochenta', 9: 'noventa'
    };
    const matcent = {
      1: 'ciento', 2: 'doscientos', 3: 'trescientos', 4: 'cuatrocientos',
      5: 'quinientos', 6: 'seiscientos', 7: 'setecientos', 8: 'ochocientos', 9: 'novecientos'
    };

    if (num === 0) return 'cero';
    if (num < 0) return 'menos ' + numeroALetras(-num);

    let resultado = '';
    const millones = Math.floor(num / 1000000);
    const miles = Math.floor((num % 1000000) / 1000);
    const unidades = num % 1000;

    if (millones > 0) {
      if (millones === 1) {
        resultado += 'un millón ';
      } else {
        resultado += numeroALetras(millones) + ' millones ';
      }
    }

    if (miles > 0) {
      if (miles === 1) {
        resultado += 'mil ';
      } else {
        resultado += numeroALetras(miles) + ' mil ';
      }
    }

    if (unidades > 0) {
      if (unidades === 100) {
        resultado += 'cien';
      } else if (unidades < 100) {
        if (unidades <= 20) {
          resultado += matuni[unidades];
        } else {
          const decenas = Math.floor(unidades / 10);
          const unidadesNum = unidades % 10;
          if (decenas === 2 && unidadesNum > 0) {
            resultado += 'veinti' + matuni[unidadesNum];
          } else {
            resultado += matdec[decenas];
            if (unidadesNum > 0) {
              resultado += ' y ' + matuni[unidadesNum];
            }
          }
        }
      } else {
        const centenas = Math.floor(unidades / 100);
        const resto = unidades % 100;
        resultado += matcent[centenas];
        if (resto > 0) {
          resultado += ' ' + numeroALetras(resto);
        }
      }
    }

    return resultado.trim();
  };

  // Función para generar PDF de boleta
  const generarPDFBoleta = async (pago) => {
    try {
      // IMPORTANTE: Solo se puede imprimir boleta si el pago está cancelado
      if (!pago.id || !pago.boleta) {
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: 'No se puede generar la boleta: el pago no tiene boleta asociada',
          confirmButtonText: 'Entendido'
        });
        return;
      }

      // Verificar que el pago esté cancelado
      if (pago.estado_pago !== 'CANCELADO') {
        Swal.fire({
          icon: 'warning',
          title: 'Pago No Cancelado',
          text: 'Solo se puede imprimir la boleta de pagos que han sido cancelados. Este pago aún no ha sido cancelado.',
          confirmButtonText: 'Entendido'
        });
        return;
      }

      // Obtener datos de la boleta desde el backend
      const response = await api.get(`/apoderado/pagos/${pago.id}/boleta`);
      const datosBoleta = response.data;

      const { pago: pagoData, alumno, facturacion, boleta } = datosBoleta;
      
      // Construir nombre completo si no viene del backend
      if (!alumno.nombre_completo) {
        alumno.nombre_completo = `${alumno.apellido_paterno || ''} ${alumno.apellido_materno || ''}, ${alumno.nombres || ''}`.trim().replace(/^,\s*|,\s*$/g, '');
      }
      
      // Usar datos de boleta si están disponibles
      if (boleta && boleta.numero && boleta.serie) {
        pagoData.boleta_numero = boleta.numero;
        pagoData.boleta_serie = boleta.serie;
      }

      // Crear PDF
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      let yPos = 8;

      // Paleta de colores profesional y moderna
      const colorPrimario = [33, 150, 243]; // Azul vibrante
      const colorSecundario = [76, 175, 80]; // Verde éxito
      const colorAcento = [255, 152, 0]; // Naranja
      const colorRojo = [244, 67, 54];
      const colorGrisOscuro = [66, 66, 66];
      const colorGrisMedio = [158, 158, 158];
      const colorGrisClaro = [245, 245, 245];
      const colorBlanco = [255, 255, 255];
      const colorNegro = [0, 0, 0];

      // ========== HEADER ELEGANTE CON FONDO AZUL ==========
      // Barra superior azul - más pequeña
      doc.setFillColor(...colorPrimario);
      doc.rect(0, 0, pageWidth, 36, 'F');
      
      // Logo de alta calidad - más pequeño
      // IMPORTANTE: El logo debe estar en frontend/public/icons/logoboleta.png
      // Este archivo está en .gitignore para evitar conflictos, pero debe existir en el VPS
      try {
        console.log('[PDF] 🔍 Intentando cargar logo desde /icons/logoboleta.png');
        const logoResponse = await fetch('/icons/logoboleta.png');
        console.log('[PDF] 📥 Respuesta del logo - Status:', logoResponse.status, 'OK:', logoResponse.ok);
        if (logoResponse.ok) {
          const logoBlob = await logoResponse.blob();
          console.log('[PDF] ✅ Logo blob obtenido, tamaño:', logoBlob.size, 'bytes');
          const logoReader = new FileReader();
          await new Promise((resolve) => {
            logoReader.onloadend = () => {
              try {
                // Logo más pequeño
                doc.addImage(logoReader.result, 'PNG', 12, 5, 26, 26);
                console.log('[PDF] ✅ Logo agregado correctamente al PDF');
                resolve();
              } catch (err) {
                console.error('[PDF] ❌ Error agregando logo al PDF:', err);
                console.error('[PDF] ❌ Stack:', err.stack);
                resolve();
              }
            };
            logoReader.onerror = () => {
              console.error('[PDF] ❌ Error en FileReader al leer logo');
              resolve();
            };
            logoReader.readAsDataURL(logoBlob);
          });
        } else {
          console.warn('[PDF] ⚠️ Logo no encontrado (status:', logoResponse.status, ')');
          console.warn('[PDF] ⚠️ Verificar que logoboleta.png existe en frontend/public/icons/ en el VPS');
        }
      } catch (err) {
        console.error('[PDF] ❌ Error cargando logo:', err);
        console.error('[PDF] ❌ Stack:', err.stack);
      }

      // Razón Social en header - mejor posicionada
      doc.setFontSize(17);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...colorBlanco);
      doc.text(facturacion.razon_social || 'EMPRESA', 45, 15);

      // RUC en header
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(240, 240, 240);
      doc.text(`R.U.C. ${facturacion.ruc || 'N/A'}`, 45, 22);

      // BOLETA DE VENTA - Caja blanca elegante en header - menos alto
      const boletaCajaX = pageWidth - 68;
      const boletaCajaY = 3;
      const boletaCajaW = 53;
      const boletaCajaH = 28; // Reducido de 34 a 28
      
      doc.setFillColor(...colorBlanco);
      doc.setDrawColor(220, 220, 220);
      doc.setLineWidth(0.5);
      doc.roundedRect(boletaCajaX, boletaCajaY, boletaCajaW, boletaCajaH, 4, 4, 'FD');
      
      // Centrar verticalmente: calcular posición centrada
      const centroVertical = boletaCajaY + boletaCajaH / 2;
      
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...colorPrimario);
      const boletaText = 'BOLETA DE VENTA';
      const boletaWidth = doc.getTextWidth(boletaText);
      // Centrar horizontal y verticalmente (subir un poco para compensar el espacio entre líneas)
      doc.text(boletaText, boletaCajaX + (boletaCajaW - boletaWidth) / 2, centroVertical - 4);
      
      const numeroBoleta = `${String(pagoData.boleta_serie || '001').padStart(3, '0')}-${String(pagoData.boleta_numero || '0000000').padStart(7, '0')}`;
      doc.setFontSize(13); // Aumentado de 11 a 13
      doc.setFont('helvetica', 'bold'); // En negrita
      doc.setTextColor(...colorRojo);
      const numWidth = doc.getTextWidth(`N°. ${numeroBoleta}`);
      // Centrar horizontal y verticalmente (bajar un poco para compensar el espacio entre líneas)
      doc.text(`N°. ${numeroBoleta}`, boletaCajaX + (boletaCajaW - numWidth) / 2, centroVertical + 4);

      // ========== SECCIÓN DE INFORMACIÓN COMPACTA Y ELEGANTE ==========
      yPos = 42;

      // Card: Fecha - Color naranja elegante
      const fechaCardX = 15;
      const fechaCardY = yPos;
      const fechaCardW = 58;
      const fechaCardH = 18;
      
      doc.setFillColor(255, 243, 224); // Naranja claro
      doc.setDrawColor(...colorAcento);
      doc.setLineWidth(1.2);
      doc.roundedRect(fechaCardX, fechaCardY, fechaCardW, fechaCardH, 3, 3, 'FD');
      
      const fechaPago = pagoData.fecha_cancelado ? new Date(pagoData.fecha_cancelado) : new Date();
      const dia = fechaPago.getDate();
      const mes = fechaPago.getMonth() + 1;
      const año = fechaPago.getFullYear();
      
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...colorAcento);
      doc.text('FECHA DE PAGO', fechaCardX + fechaCardW / 2, fechaCardY + 6, { align: 'center' });
      
      // Solo una fecha, más grande y en negrita
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...colorGrisOscuro);
      doc.text(`${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}/${año}`, fechaCardX + fechaCardW / 2, fechaCardY + 14, { align: 'center' });

      // Card: Cliente - Color azul elegante
      const clienteCardX = 78;
      const clienteCardY = yPos;
      const clienteCardW = pageWidth - 93;
      const clienteCardH = 18;
      
      doc.setFillColor(227, 242, 253); // Azul claro
      doc.setDrawColor(...colorPrimario);
      doc.setLineWidth(1.2);
      doc.roundedRect(clienteCardX, clienteCardY, clienteCardW, clienteCardH, 3, 3, 'FD');
      
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...colorPrimario);
      doc.text('CLIENTE', clienteCardX + 3, clienteCardY + 6);
      
      doc.setFontSize(9.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...colorGrisOscuro);
      const nombreCliente = alumno.nombre_completo.toUpperCase();
      // Truncar si es muy largo
      const nombreMaxWidth = clienteCardW - 6;
      let nombreDisplay = nombreCliente;
      if (doc.getTextWidth(nombreDisplay) > nombreMaxWidth) {
        while (doc.getTextWidth(nombreDisplay + '...') > nombreMaxWidth && nombreDisplay.length > 0) {
          nombreDisplay = nombreDisplay.slice(0, -1);
        }
        nombreDisplay += '...';
      }
      doc.text(nombreDisplay, clienteCardX + 3, clienteCardY + 12);
      
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...colorGrisOscuro);
      doc.text(`DNI: ${alumno.dni || 'N/A'}`, clienteCardX + 3, clienteCardY + 15);

      // ========== TABLA DE ITEMS ELEGANTE ==========
      // Más espacio entre los cards y la tabla
      yPos += 32;
      
      // Encabezado con fondo azul sólido
      doc.setFillColor(...colorPrimario);
      doc.setDrawColor(...colorPrimario);
      doc.setLineWidth(0.5);
      doc.roundedRect(15, yPos - 6, pageWidth - 30, 8, 2, 2, 'FD');
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...colorBlanco);
      doc.text('N°.', 18, yPos);
      doc.text('DESCRIPCIÓN', 35, yPos);
      doc.text('IMPORTE', pageWidth - 22, yPos, { align: 'right' });

      // Item con fondo blanco y borde sutil
      yPos += 8;
      doc.setFillColor(...colorBlanco);
      doc.setDrawColor(220, 220, 220);
      doc.setLineWidth(0.3);
      doc.roundedRect(15, yPos - 5, pageWidth - 30, 7, 1, 1, 'FD');
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...colorGrisOscuro);
      doc.text('1', 18, yPos);
      doc.text(pagoData.tipo_descripcion || 'PAGO', 35, yPos);
      const importe = pagoData.total.toFixed(2);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...colorPrimario);
      doc.text(`S/ ${importe}`, pageWidth - 22, yPos, { align: 'right' });

      // ========== SECCIÓN TOTAL ELEGANTE ==========
      yPos += 12;
      
      // Card: Total en letras - Color verde suave
      const letrasCardX = 15;
      const letrasCardY = yPos;
      const letrasCardW = pageWidth - 98;
      const letrasCardH = 10;
      
      doc.setFillColor(232, 245, 233); // Verde claro
      doc.setDrawColor(...colorSecundario);
      doc.setLineWidth(1);
      doc.roundedRect(letrasCardX, letrasCardY, letrasCardW, letrasCardH, 2, 2, 'FD');
      
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      const totalEntero = Math.floor(pagoData.total);
      const totalDecimal = Math.round((pagoData.total - totalEntero) * 100);
      const totalLetras = numeroALetras(totalEntero).toUpperCase() + ` CON ${String(totalDecimal).padStart(2, '0')}/100 SOLES`;
      doc.setTextColor(...colorGrisOscuro);
      // Ajustar texto si es muy largo
      const letrasMaxWidth = letrasCardW - 6;
      let letrasDisplay = totalLetras;
      if (doc.getTextWidth(letrasDisplay) > letrasMaxWidth) {
        doc.setFontSize(8);
        if (doc.getTextWidth(letrasDisplay) > letrasMaxWidth) {
          while (doc.getTextWidth(letrasDisplay) > letrasMaxWidth && letrasDisplay.length > 0) {
            letrasDisplay = letrasDisplay.slice(0, -1);
          }
        }
      }
      doc.text(letrasDisplay, letrasCardX + 3, letrasCardY + 6.5);

      // Card: Total numérico - Color azul destacado
      const totalCardX = pageWidth - 78;
      const totalCardY = yPos;
      const totalCardW = 63;
      const totalCardH = 10;
      
      doc.setFillColor(...colorPrimario);
      doc.setDrawColor(...colorPrimario);
      doc.setLineWidth(1);
      doc.roundedRect(totalCardX, totalCardY, totalCardW, totalCardH, 3, 3, 'FD');
      
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...colorBlanco);
      doc.text('TOTAL', totalCardX + totalCardW / 2, totalCardY + 4.5, { align: 'center' });
      
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text(`S/ ${importe}`, totalCardX + totalCardW / 2, totalCardY + 8.5, { align: 'center' });

      // ========== SECCIÓN PAGO Y ESTADO ELEGANTE ==========
      yPos += 16;
      
      // Card: Forma de pago - Color gris elegante
      const pagoCardX = 15;
      const pagoCardY = yPos;
      const pagoCardW = 52;
      const pagoCardH = 10;
      
      doc.setFillColor(...colorGrisClaro);
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(1);
      doc.roundedRect(pagoCardX, pagoCardY, pagoCardW, pagoCardH, 2, 2, 'FD');
      
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...colorGrisOscuro);
      doc.text('FORMA DE PAGO', pagoCardX + pagoCardW / 2, pagoCardY + 4.5, { align: 'center' });
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...colorGrisOscuro);
      doc.text('EFECTIVO', pagoCardX + pagoCardW / 2, pagoCardY + 8.5, { align: 'center' });
      
      // Card: Estado - Color verde vibrante
      const estadoCardX = pageWidth - 78;
      const estadoCardY = yPos;
      const estadoCardW = 63;
      const estadoCardH = 10;
      
      doc.setFillColor(...colorSecundario);
      doc.setDrawColor(...colorSecundario);
      doc.setLineWidth(1);
      doc.roundedRect(estadoCardX, estadoCardY, estadoCardW, estadoCardH, 3, 3, 'FD');
      
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...colorBlanco);
      doc.text('ESTADO', estadoCardX + estadoCardW / 2, estadoCardY + 4.5, { align: 'center' });
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('CANCELADO', estadoCardX + estadoCardW / 2, estadoCardY + 8.5, { align: 'center' });

      // ========== FOOTER ELEGANTE ==========
      yPos = pageHeight - 16;
      doc.setFillColor(250, 250, 250);
      doc.rect(0, yPos - 4, pageWidth, 16, 'F');
      
      // Línea separadora
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.3);
      doc.line(15, yPos - 4, pageWidth - 15, yPos - 4);
      
      doc.setTextColor(120, 120, 120);
      doc.setFontSize(6.5);
      doc.setFont('helvetica', 'normal');
      const footerText = 'NO ES VÁLIDO PARA CRÉDITO FISCAL. PUEDE SER CANJEADO POR BOLETA DE VENTA SI ES REQUERIDO.';
      doc.text(footerText, pageWidth / 2, yPos + 2, { align: 'center', maxWidth: pageWidth - 30 });
      
      yPos += 6;
      doc.setFontSize(7);
      doc.text(`${facturacion.razon_social || 'EMPRESA'} ©${new Date().getFullYear()}`, pageWidth / 2, yPos, { align: 'center' });

      // Guardar PDF
      const nombreArchivo = `Boleta_${numeroBoleta.replace(/-/g, '_')}_${alumno.dni || 'N/A'}.pdf`;
      doc.save(nombreArchivo);

      Swal.fire({
        icon: 'success',
        title: 'Boleta generada',
        text: 'La boleta se ha generado correctamente',
        timer: 2000,
        showConfirmButton: false
      });
    } catch (error) {
      console.error('Error generando boleta:', error);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'No se pudo generar la boleta. Por favor, intente nuevamente.',
        confirmButtonText: 'Entendido'
      });
    }
  };

  const generarPDFLibreta = async (hijoId) => {
    try {
      setLoadingNotasDetalladas(true);
      const response = await api.get(`/apoderado/hijos/${hijoId}/libreta`);
      const datosLibreta = response.data;

      if (!datosLibreta || !datosLibreta.alumno) {
        Swal.fire({
          icon: 'info',
          title: 'Sin datos',
          text: 'No hay datos disponibles para generar la libreta',
          confirmButtonText: 'Entendido'
        });
        return;
      }

      // Generar PDF
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 5;
      const paddingVertical = 20; // Padding superior e inferior aumentado
      const contentWidth = pageWidth - (margin * 2);
      let yPos = margin + paddingVertical;

      // Logo en la esquina superior izquierda
      let logoData = null;
      let logoImg = null;
      let logoWidth = 0;
      let logoHeight = 0;
      try {
        const logoUrl = 'https://sistema.vanguardschools.edu.pe/assets/logos/logo.png';
        logoImg = new Image();
        logoImg.crossOrigin = 'anonymous';
        await new Promise((resolve, reject) => {
          logoImg.onload = () => resolve();
          logoImg.onerror = () => reject();
          logoImg.src = logoUrl;
        });
        
        const canvas = document.createElement('canvas');
        canvas.width = logoImg.width;
        canvas.height = logoImg.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(logoImg, 0, 0);
        logoData = canvas.toDataURL('image/png');
        
        // Logo de 20mm de ancho (proporcional en altura)
        logoWidth = 20;
        logoHeight = (logoImg.height / logoImg.width) * logoWidth;
        doc.addImage(logoData, 'PNG', margin, margin, logoWidth, logoHeight);
      } catch (error) {
        console.log('No se pudo cargar el logo, continuando sin él');
      }

      // Título de la intranet en la esquina superior derecha
      const tituloIntranet = datosLibreta.titulo_intranet || 'INTRANET VANGUARD SCHOOLS';
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 0, 0); // Color negro explícito
      const tituloX = pageWidth - margin - 5; // 5mm desde el borde derecho
      doc.text(tituloIntranet.toUpperCase(), tituloX, margin + 5, { align: 'right' });

      // Logo como watermark de fondo (opacidad 20%)
      if (logoData && logoImg) {
        try {
          // Crear canvas con opacidad reducida
          const watermarkCanvas = document.createElement('canvas');
          watermarkCanvas.width = logoImg.width;
          watermarkCanvas.height = logoImg.height;
          const watermarkCtx = watermarkCanvas.getContext('2d');
          watermarkCtx.globalAlpha = 0.2; // 20% de opacidad
          watermarkCtx.drawImage(logoImg, 0, 0);
          const watermarkData = watermarkCanvas.toDataURL('image/png');
          
          // Tamaño grande para el watermark (aproximadamente 150mm de ancho)
          const watermarkWidth = 150;
          const watermarkHeight = (logoImg.height / logoImg.width) * watermarkWidth;
          const watermarkX = (pageWidth - watermarkWidth) / 2; // Centrado horizontal
          const watermarkY = (pageHeight - watermarkHeight) / 2; // Centrado vertical
          
          doc.addImage(watermarkData, 'PNG', watermarkX, watermarkY, watermarkWidth, watermarkHeight);
        } catch (error) {
          console.log('No se pudo agregar el watermark del logo');
        }
      }

      // Header con título
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('BOLETA DE INFORMACIÓN ACADÉMICA', pageWidth / 2, yPos + 10, { align: 'center' });
      yPos += 20; // 10mm más de espacio entre título y cuadro

      // Datos del alumno
      const headerHeight = 5;
      doc.setFontSize(9);
      const borderWidth = 0.5; // Borde de 0.5mm
      doc.setLineWidth(borderWidth);
      doc.setDrawColor(0, 0, 0); // Borde negro
      
      // Azul más puro para labels: RGB(100, 149, 237) - azul cornflower
      const colorLabel = [100, 149, 237];
      const colorData = [255, 255, 255]; // Blanco para datos
      
      // Fila 1: ALUMNO y CÓDIGO
      // Label ALUMNO (azul)
      doc.setFillColor(...colorLabel);
      doc.rect(margin, yPos, 40, headerHeight, 'FD');
      // Datos ALUMNO (blanco)
      doc.setFillColor(...colorData);
      doc.rect(margin + 40, yPos, 95, headerHeight, 'FD');
      // Label CÓDIGO (azul)
      doc.setFillColor(...colorLabel);
      doc.rect(margin + 135, yPos, 30, headerHeight, 'FD');
      // Datos CÓDIGO (blanco)
      doc.setFillColor(...colorData);
      doc.rect(margin + 165, yPos, 35, headerHeight, 'FD');
      
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 0, 0);
      doc.text('ALUMNO', margin + 20, yPos + 3.5, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.text(datosLibreta.alumno.nombre_completo || '-', margin + 87.5, yPos + 3.5, { align: 'center' });
      doc.setFont('helvetica', 'bold');
      doc.text('CÓDIGO', margin + 150, yPos + 3.5, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.text(datosLibreta.alumno.codigo || '-', margin + 182.5, yPos + 3.5, { align: 'center' });
      yPos += headerHeight;

      // Fila 2: GRADO/SECCIÓN, NIVEL, TURNO
      // Label GRADO/SECCIÓN (azul)
      doc.setFillColor(...colorLabel);
      doc.rect(margin, yPos, 40, headerHeight, 'FD');
      // Datos GRADO/SECCIÓN (blanco)
      doc.setFillColor(...colorData);
      doc.rect(margin + 40, yPos, 30, headerHeight, 'FD');
      // Label NIVEL (azul)
      doc.setFillColor(...colorLabel);
      doc.rect(margin + 70, yPos, 30, headerHeight, 'FD');
      // Datos NIVEL (blanco)
      doc.setFillColor(...colorData);
      doc.rect(margin + 100, yPos, 35, headerHeight, 'FD');
      // Label TURNO (azul)
      doc.setFillColor(...colorLabel);
      doc.rect(margin + 135, yPos, 30, headerHeight, 'FD');
      // Datos TURNO (blanco)
      doc.setFillColor(...colorData);
      doc.rect(margin + 165, yPos, 35, headerHeight, 'FD');
      
      doc.setFont('helvetica', 'bold');
      doc.text('GRADO / SECCIÓN', margin + 20, yPos + 3.5, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.text(`${datosLibreta.alumno.grado}° ${datosLibreta.alumno.seccion || ''}`, margin + 55, yPos + 3.5, { align: 'center' });
      doc.setFont('helvetica', 'bold');
      doc.text('NIVEL', margin + 85, yPos + 3.5, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.text(datosLibreta.alumno.nivel_nombre || '-', margin + 117.5, yPos + 3.5, { align: 'center' });
      doc.setFont('helvetica', 'bold');
      doc.text('TURNO', margin + 150, yPos + 3.5, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.text(datosLibreta.alumno.turno_nombre || '-', margin + 182.5, yPos + 3.5, { align: 'center' });
      yPos += headerHeight;

      // Fila 3: PROFESOR/TUTOR y AÑO
      // Label PROFESOR/TUTOR (azul)
      doc.setFillColor(...colorLabel);
      doc.rect(margin, yPos, 40, headerHeight, 'FD');
      // Datos PROFESOR/TUTOR (blanco)
      doc.setFillColor(...colorData);
      doc.rect(margin + 40, yPos, 95, headerHeight, 'FD');
      // Label AÑO (azul)
      doc.setFillColor(...colorLabel);
      doc.rect(margin + 135, yPos, 30, headerHeight, 'FD');
      // Datos AÑO (blanco)
      doc.setFillColor(...colorData);
      doc.rect(margin + 165, yPos, 35, headerHeight, 'FD');
      
      doc.setFont('helvetica', 'bold');
      doc.text('TUTOR', margin + 20, yPos + 3.5, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.text(datosLibreta.alumno.tutor_nombre || 'NO SE ASIGNÓ TUTOR', margin + 87.5, yPos + 3.5, { align: 'center' });
      doc.setFont('helvetica', 'bold');
      doc.text('AÑO', margin + 150, yPos + 3.5, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.text(datosLibreta.alumno.anio?.toString() || '-', margin + 182.5, yPos + 3.5, { align: 'center' });
      yPos += headerHeight + 5; // 5mm de espacio entre cuadros

      // Tabla de áreas curriculares
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setLineWidth(borderWidth);
      
      const colAreaWidth = 80;
      const colBimestreWidth = (contentWidth - colAreaWidth) / 5; // 4 bimestres + PF
      
      // Header de la tabla (todos azules)
      doc.setFillColor(...colorLabel);
      doc.rect(margin, yPos, colAreaWidth, headerHeight, 'FD');
      doc.text('ÁREAS CURRICULARES', margin + colAreaWidth / 2, yPos + 3.5, { align: 'center' });
      
      let xPos = margin + colAreaWidth;
      // Asegurar que todas las columnas del header tengan fondo azul
      doc.setFillColor(...colorLabel);
      doc.rect(xPos, yPos, colBimestreWidth, headerHeight, 'FD');
      doc.text('B - 1', xPos + colBimestreWidth / 2, yPos + 3.5, { align: 'center' });
      xPos += colBimestreWidth;
      doc.setFillColor(...colorLabel);
      doc.rect(xPos, yPos, colBimestreWidth, headerHeight, 'FD');
      doc.text('B - 2', xPos + colBimestreWidth / 2, yPos + 3.5, { align: 'center' });
      xPos += colBimestreWidth;
      doc.setFillColor(...colorLabel);
      doc.rect(xPos, yPos, colBimestreWidth, headerHeight, 'FD');
      doc.text('B - 3', xPos + colBimestreWidth / 2, yPos + 3.5, { align: 'center' });
      xPos += colBimestreWidth;
      doc.setFillColor(...colorLabel);
      doc.rect(xPos, yPos, colBimestreWidth, headerHeight, 'FD');
      doc.text('B - 4', xPos + colBimestreWidth / 2, yPos + 3.5, { align: 'center' });
      xPos += colBimestreWidth;
      doc.setFillColor(...colorLabel);
      doc.rect(xPos, yPos, colBimestreWidth, headerHeight, 'FD');
      doc.text('PF', xPos + colBimestreWidth / 2, yPos + 3.5, { align: 'center' });
      
      yPos += headerHeight;

      // Áreas y asignaturas
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      
      datosLibreta.areas.forEach(area => {
        // Verificar si necesitamos nueva página
        if (yPos > pageHeight - 60) {
          doc.addPage();
          yPos = margin;
        }

        // Fila del área (en negrita) - toda la fila en azul (área + columnas de notas)
        doc.setFont('helvetica', 'bold');
        doc.setFillColor(...colorLabel);
        // Área en azul
        doc.rect(margin, yPos, colAreaWidth, headerHeight, 'FD');
        doc.text(area.area_nombre.toUpperCase(), margin + 2, yPos + 3.5);
        
        // Columnas de notas también en azul
        xPos = margin + colAreaWidth;
        [area.promedio_b1, area.promedio_b2, area.promedio_b3, area.promedio_b4, area.promedio_final].forEach((promedio, index) => {
          doc.setFillColor(...colorLabel); // Fondo azul para toda la fila del área
          doc.rect(xPos, yPos, colBimestreWidth, headerHeight, 'FD');
          const valor = promedio !== null && promedio !== '' && promedio !== '-' ? promedio.toString() : '-';
          doc.text(valor, xPos + colBimestreWidth / 2, yPos + 3.5, { align: 'center' });
          xPos += colBimestreWidth;
        });
        
        yPos += headerHeight;

        // Asignaturas del área - asignatura en blanco, datos en blanco
        doc.setFont('helvetica', 'normal');
        area.asignaturas.forEach(asignatura => {
          if (yPos > pageHeight - 60) {
            doc.addPage();
            yPos = margin + paddingVertical;
          }

          doc.setFillColor(...colorData);
          doc.rect(margin, yPos, colAreaWidth, headerHeight, 'FD');
          doc.text(asignatura.curso_nombre.toUpperCase(), margin + 2, yPos + 3.5);
          
          xPos = margin + colAreaWidth;
          [asignatura.promedio_b1, asignatura.promedio_b2, asignatura.promedio_b3, asignatura.promedio_b4, asignatura.promedio_final].forEach((promedio, index) => {
            doc.setFillColor(...colorData); // Asegurar fondo blanco en cada celda
            doc.rect(xPos, yPos, colBimestreWidth, headerHeight, 'FD');
            const valor = promedio !== null && promedio !== '' && promedio !== '-' ? promedio.toString() : '-';
            doc.text(valor, xPos + colBimestreWidth / 2, yPos + 3.5, { align: 'center' });
            xPos += colBimestreWidth;
          });
          
          yPos += headerHeight;
        });
      });

      // Asignaturas sin área - todas en blanco
      if (datosLibreta.asignaturas_sin_area && datosLibreta.asignaturas_sin_area.length > 0) {
        datosLibreta.asignaturas_sin_area.forEach(asignatura => {
          if (yPos > pageHeight - 60) {
            doc.addPage();
            yPos = margin + paddingVertical;
          }

          doc.setFillColor(...colorData); // Asegurar fondo blanco
          doc.rect(margin, yPos, colAreaWidth, headerHeight, 'FD');
          doc.text(asignatura.curso_nombre.toUpperCase(), margin + 2, yPos + 3.5);
          
          xPos = margin + colAreaWidth;
          [asignatura.promedio_b1, asignatura.promedio_b2, asignatura.promedio_b3, asignatura.promedio_b4, asignatura.promedio_final].forEach((promedio, index) => {
            doc.setFillColor(...colorData); // Asegurar fondo blanco en cada celda
            doc.rect(xPos, yPos, colBimestreWidth, headerHeight, 'FD');
            const valor = promedio !== null && promedio !== '' && promedio !== '-' ? promedio.toString() : '-';
            doc.text(valor, xPos + colBimestreWidth / 2, yPos + 3.5, { align: 'center' });
            xPos += colBimestreWidth;
          });
          
          yPos += headerHeight;
        });
      }

      yPos += 5; // 5mm de espacio antes del cuadro resumen

      // Cuadro Resumen
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setFillColor(...colorLabel); // Azul cielo pastel
      const resumenWidth = colAreaWidth + (colBimestreWidth * 5); // Incluir todas las columnas hasta PF
      doc.rect(margin, yPos, resumenWidth, headerHeight, 'FD');
      doc.text('CUADRO RESUMEN', margin + resumenWidth / 2, yPos + 3.5, { align: 'center' });
      yPos += headerHeight;

      doc.setFont('helvetica', 'normal');
      const resumen = datosLibreta.resumen;

      // CANTIDAD DE CURSOS
      doc.setFillColor(...colorLabel); // Label en azul
      doc.rect(margin, yPos, colAreaWidth, headerHeight, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.text('CANTIDAD DE CURSOS', margin + 2, yPos + 3.5);
      doc.setFont('helvetica', 'normal');
      xPos = margin + colAreaWidth;
      [resumen.cantidad_cursos.b1, resumen.cantidad_cursos.b2, resumen.cantidad_cursos.b3, resumen.cantidad_cursos.b4].forEach((cantidad, index) => {
        doc.setFillColor(...colorData); // Datos en blanco
        doc.rect(xPos, yPos, colBimestreWidth, headerHeight, 'FD');
        doc.text(cantidad !== null ? cantidad.toString() : '-', xPos + colBimestreWidth / 2, yPos + 3.5, { align: 'center' });
        xPos += colBimestreWidth;
      });
      doc.setFillColor(...colorData);
      doc.rect(xPos, yPos, colBimestreWidth, headerHeight, 'FD');
      doc.text('-', xPos + colBimestreWidth / 2, yPos + 3.5, { align: 'center' });
      yPos += headerHeight;

      // SUMA DE NOTAS
      doc.setFillColor(...colorLabel); // Label en azul
      doc.rect(margin, yPos, colAreaWidth, headerHeight, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.text('SUMA DE NOTAS', margin + 2, yPos + 3.5);
      doc.setFont('helvetica', 'normal');
      xPos = margin + colAreaWidth;
      [resumen.suma_notas.b1, resumen.suma_notas.b2, resumen.suma_notas.b3, resumen.suma_notas.b4].forEach((suma, index) => {
        doc.setFillColor(...colorData); // Datos en blanco
        doc.rect(xPos, yPos, colBimestreWidth, headerHeight, 'FD');
        doc.text(suma !== null ? suma.toString() : '-', xPos + colBimestreWidth / 2, yPos + 3.5, { align: 'center' });
        xPos += colBimestreWidth;
      });
      doc.setFillColor(...colorData);
      doc.rect(xPos, yPos, colBimestreWidth, headerHeight, 'FD');
      doc.text('-', xPos + colBimestreWidth / 2, yPos + 3.5, { align: 'center' });
      yPos += headerHeight;

      // PROMEDIO
      doc.setFillColor(...colorLabel); // Label en azul
      doc.rect(margin, yPos, colAreaWidth, headerHeight, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.text('PROMEDIO', margin + 2, yPos + 3.5);
      doc.setFont('helvetica', 'normal');
      xPos = margin + colAreaWidth;
      [resumen.promedio.b1, resumen.promedio.b2, resumen.promedio.b3, resumen.promedio.b4].forEach((promedio, index) => {
        doc.setFillColor(...colorData); // Datos en blanco
        doc.rect(xPos, yPos, colBimestreWidth, headerHeight, 'FD');
        doc.text(promedio !== null ? promedio.toString() : '-', xPos + colBimestreWidth / 2, yPos + 3.5, { align: 'center' });
        xPos += colBimestreWidth;
      });
      doc.setFillColor(...colorData);
      doc.rect(xPos, yPos, colBimestreWidth, headerHeight, 'FD');
      doc.text(resumen.promedio.final !== null ? resumen.promedio.final.toString() : '-', xPos + colBimestreWidth / 2, yPos + 3.5, { align: 'center' });
      yPos += headerHeight;

      // PROMEDIO CONDUCTA
      doc.setFillColor(...colorLabel); // Label en azul
      doc.rect(margin, yPos, colAreaWidth, headerHeight, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.text('PROMEDIO CONDUCTA', margin + 2, yPos + 3.5);
      doc.setFont('helvetica', 'normal');
      xPos = margin + colAreaWidth;
      [resumen.promedio_conducta.b1, resumen.promedio_conducta.b2, resumen.promedio_conducta.b3, resumen.promedio_conducta.b4].forEach((promedio, index) => {
        doc.setFillColor(...colorData); // Datos en blanco
        doc.rect(xPos, yPos, colBimestreWidth, headerHeight, 'FD');
        doc.text(promedio !== null ? promedio.toString() : '20', xPos + colBimestreWidth / 2, yPos + 3.5, { align: 'center' });
        xPos += colBimestreWidth;
      });
      doc.setFillColor(...colorData);
      doc.rect(xPos, yPos, colBimestreWidth, headerHeight, 'FD');
      doc.text('20', xPos + colBimestreWidth / 2, yPos + 3.5, { align: 'center' });
      yPos += headerHeight;

      // ORDEN DE MÉRITO
      doc.setFillColor(...colorLabel); // Label en azul
      doc.rect(margin, yPos, colAreaWidth, headerHeight, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.text('ORDEN DE MÉRITO', margin + 2, yPos + 3.5);
      doc.setFont('helvetica', 'normal');
      xPos = margin + colAreaWidth;
      [resumen.orden_merito.b1, resumen.orden_merito.b2, resumen.orden_merito.b3, resumen.orden_merito.b4].forEach((orden, index) => {
        doc.setFillColor(...colorData); // Datos en blanco
        doc.rect(xPos, yPos, colBimestreWidth, headerHeight, 'FD');
        doc.text(orden !== null ? orden.toString() : '-', xPos + colBimestreWidth / 2, yPos + 3.5, { align: 'center' });
        xPos += colBimestreWidth;
      });
      doc.setFillColor(...colorData);
      doc.rect(xPos, yPos, colBimestreWidth, headerHeight, 'FD');
      doc.text('-', xPos + colBimestreWidth / 2, yPos + 3.5, { align: 'center' });
      yPos += headerHeight;

      // N° DE INASISTENCIAS
      doc.setFillColor(...colorLabel); // Label en azul
      doc.rect(margin, yPos, colAreaWidth, headerHeight, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.text('N° DE INASISTENCIAS', margin + 2, yPos + 3.5);
      doc.setFont('helvetica', 'normal');
      xPos = margin + colAreaWidth;
      [resumen.inasistencias.b1, resumen.inasistencias.b2, resumen.inasistencias.b3, resumen.inasistencias.b4].forEach((inasistencias, index) => {
        doc.setFillColor(...colorData); // Datos en blanco
        doc.rect(xPos, yPos, colBimestreWidth, headerHeight, 'FD');
        doc.text(inasistencias !== null ? inasistencias.toString() : '0', xPos + colBimestreWidth / 2, yPos + 3.5, { align: 'center' });
        xPos += colBimestreWidth;
      });
      doc.setFillColor(...colorData);
      doc.rect(xPos, yPos, colBimestreWidth, headerHeight, 'FD');
      doc.text('0', xPos + colBimestreWidth / 2, yPos + 3.5, { align: 'center' });
      yPos += headerHeight;

      // N° DE TARDANZAS
      doc.setFillColor(...colorLabel); // Label en azul
      doc.rect(margin, yPos, colAreaWidth, headerHeight, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.text('N° DE TARDANZAS', margin + 2, yPos + 3.5);
      doc.setFont('helvetica', 'normal');
      xPos = margin + colAreaWidth;
      [resumen.tardanzas.b1, resumen.tardanzas.b2, resumen.tardanzas.b3, resumen.tardanzas.b4].forEach((tardanzas, index) => {
        doc.setFillColor(...colorData); // Datos en blanco
        doc.rect(xPos, yPos, colBimestreWidth, headerHeight, 'FD');
        doc.text(tardanzas !== null ? tardanzas.toString() : '0', xPos + colBimestreWidth / 2, yPos + 3.5, { align: 'center' });
        xPos += colBimestreWidth;
      });
      doc.setFillColor(...colorData);
      doc.rect(xPos, yPos, colBimestreWidth, headerHeight, 'FD');
      doc.text('0', xPos + colBimestreWidth / 2, yPos + 3.5, { align: 'center' });
      yPos += 20; // 20mm de espacio después del cuadro resumen (5mm original + 15mm adicionales)

      // Footer: Recomendaciones
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('Recomendaciones:', margin, yPos);
      yPos += 5;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text('', margin, yPos); // Espacio para recomendaciones
      yPos += 15;

      // Firma solo de Dirección Académica (centrada)
      doc.setFontSize(8);
      const firmaWidth = 70;
      const firmaX = (pageWidth - firmaWidth) / 2; // Centrar
      doc.setLineWidth(0.5); // Grosor de línea de 0.5mm
      doc.setDrawColor(0, 0, 0);
      doc.line(firmaX, yPos, firmaX + firmaWidth, yPos); // Línea de firma con grosor 0.5mm
      yPos += 5;

      doc.setFont('helvetica', 'bold'); // Texto en negrita
      doc.text('Dirección Académica', firmaX + firmaWidth / 2, yPos, { align: 'center' });

      const nombreArchivo = `Libreta_${datosLibreta.alumno.apellido_paterno?.replace(/\s+/g, '_')}_${new Date().getTime()}.pdf`;
      doc.save(nombreArchivo);

      Swal.fire({
        title: '¡PDF Generado!',
        text: 'La libreta se ha exportado correctamente',
        icon: 'success'
      });
    } catch (error) {
      console.error('Error generando PDF de libreta:', error);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: error.response?.data?.error || 'No se pudo generar la libreta',
        confirmButtonText: 'Entendido'
      });
    } finally {
      setLoadingNotasDetalladas(false);
    }
  };

  const cargarNotasDetalladas = async (hijoId) => {
    try {
      setLoadingNotasDetalladas(true);
      const response = await api.get(`/apoderado/hijos/${hijoId}/notas-detalladas`);
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
      setLoadingNotasDetalladas(false);
    }
  };

  const handleExportarNotasDetalladasPDF = () => {
    if (!notasDetalladas || !notasDetalladas.asignaturas || notasDetalladas.asignaturas.length === 0) {
      Swal.fire({
        icon: 'info',
        title: 'Sin datos',
        text: 'No hay notas para exportar',
        confirmButtonText: 'Entendido'
      });
      return;
    }

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
      doc.text('NOTAS REGISTRADAS', pageWidth / 2, 12, { align: 'center' });
      doc.setFontSize(12);
      doc.text(`${notasDetalladas.alumno?.nombre_completo || 'Alumno'}`, pageWidth / 2, 20, { align: 'center' });
      doc.setFontSize(10);
      const nombresBimestres = ['I', 'II', 'III', 'IV'];
      doc.text(`Bimestre ${nombresBimestres[cicloSeleccionadoNotas - 1]}`, pageWidth / 2, 26, { align: 'center' });

      yPos = 40;

      // Advertencia
      doc.setFillColor(255, 235, 238);
      doc.roundedRect(margin, yPos, contentWidth, 10, 2, 2, 'F');
      doc.setDrawColor(244, 67, 54);
      doc.setLineWidth(0.5);
      doc.roundedRect(margin, yPos, contentWidth, 10, 2, 2);
      doc.setTextColor(198, 40, 40);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text('La información mostrada puede no estar completa al 100%, para cualquier consulta comuníquese con el administrador.', margin + 2, yPos + 6, { maxWidth: contentWidth - 4 });

      yPos += 15;

      // Colores pastel para asignaturas
      const coloresPastelPDF = [
        { bg: [232, 245, 233], border: [76, 175, 80], text: [46, 125, 50] }, // Verde
        { bg: [227, 242, 253], border: [33, 150, 243], text: [21, 101, 192] }, // Azul
        { bg: [255, 243, 224], border: [255, 152, 0], text: [230, 81, 0] }, // Naranja
        { bg: [243, 229, 245], border: [156, 39, 176], text: [106, 27, 154] }, // Morado
        { bg: [255, 235, 238], border: [244, 67, 54], text: [198, 40, 40] }, // Rojo
        { bg: [255, 245, 238], border: [255, 183, 77], text: [230, 126, 34] }, // Amarillo
        { bg: [224, 242, 241], border: [0, 150, 136], text: [0, 105, 92] }, // Turquesa
        { bg: [251, 233, 231], border: [233, 30, 99], text: [194, 24, 91] } // Rosa
      ];

      notasDetalladas.asignaturas.forEach((asignatura, index) => {
        // Verificar si necesitamos nueva página
        if (yPos > pageHeight - 80) {
          doc.addPage();
          yPos = margin;
        }

        const color = coloresPastelPDF[index % coloresPastelPDF.length];
        
        // Calcular altura del card - diseño simple y seguro
        let lineasTotales = 1; // Título
        lineasTotales += asignatura.criterios.length; // Criterios
        if (asignatura.examen_mensual) lineasTotales += 1; // Examen mensual
        lineasTotales += 1; // Promedio final
        
        // Altura base + espacio por línea (más generoso para evitar desbordes)
        const cardHeight = 10 + (lineasTotales * 7);

        // Fondo del card
        doc.setFillColor(color.bg[0], color.bg[1], color.bg[2]);
        doc.roundedRect(margin, yPos, contentWidth, cardHeight, 3, 3, 'F');

        // Borde
        doc.setDrawColor(color.border[0], color.border[1], color.border[2]);
        doc.setLineWidth(1);
        doc.roundedRect(margin, yPos, contentWidth, cardHeight, 3, 3);

        // Título del curso
        doc.setTextColor(color.text[0], color.text[1], color.text[2]);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text(asignatura.curso_nombre, margin + 3, yPos + 6);

        let yPosInterno = yPos + 10;

        // Tabla de criterios - diseño simple
        asignatura.criterios.forEach((criterio) => {
          const tieneIndicadores = criterio.indicadores && criterio.indicadores.length > 0;
          const notaCriterio = criterio.notas?.[cicloSeleccionadoNotas] || null;

          // Nombre del criterio con peso (izquierda)
          doc.setFontSize(7);
          doc.setFont('helvetica', 'normal');
          let criterioTexto = criterio.descripcion;
          if (asignatura.nivel.tipo_calificacion_final === 1) {
            criterioTexto += ` (${criterio.peso}%)`;
          }
          // Limitar ancho del texto del criterio
          const criterioMaxWidth = 70;
          const criterioLines = doc.splitTextToSize(criterioTexto, criterioMaxWidth);
          doc.text(criterioLines[0], margin + 3, yPosInterno);

          // Notas de indicadores o nota directa (derecha)
          const notasX = margin + 75; // Posición fija para notas
          const notasMaxWidth = contentWidth - 80; // Ancho máximo disponible
          
          if (tieneIndicadores) {
            const notasIndicadores = [];
            criterio.indicadores.forEach((indicador) => {
              const cuadros = indicador.cuadros || 1;
              for (let i = 0; i < cuadros; i++) {
                const nota = asignatura.notas?.[cicloSeleccionadoNotas]?.[criterio.id]?.[indicador.id]?.[i] || '-';
                notasIndicadores.push(nota);
              }
            });
            const notasTexto = notasIndicadores.join('  ');
            doc.setFontSize(7);
            // Asegurar que las notas no se salgan
            const notasLines = doc.splitTextToSize(notasTexto, notasMaxWidth);
            doc.text(notasLines[0], notasX, yPosInterno);
            
            // Promedio del criterio en la misma línea, al final
            if (notaCriterio) {
              const promedioX = margin + contentWidth - 15; // Al final del card
              doc.setFillColor(253, 233, 217);
              doc.roundedRect(promedioX, yPosInterno - 2.5, 10, 4, 1, 1, 'F');
              doc.setDrawColor(color.border[0], color.border[1], color.border[2]);
              doc.setLineWidth(0.5);
              doc.roundedRect(promedioX, yPosInterno - 2.5, 10, 4, 1, 1);
              doc.setFont('helvetica', 'bold');
              doc.setFontSize(7);
              doc.setTextColor(color.text[0], color.text[1], color.text[2]);
              doc.text(notaCriterio.toString(), promedioX + 5, yPosInterno, { align: 'center' });
              doc.setFont('helvetica', 'normal');
            }
          } else {
            // Nota directa
            if (notaCriterio) {
              doc.setFont('helvetica', 'bold');
              doc.setFontSize(8);
              doc.text(notaCriterio.toString(), notasX, yPosInterno);
              doc.setFont('helvetica', 'normal');
            } else {
              doc.setFontSize(7);
              doc.text('-', notasX, yPosInterno);
            }
          }

          yPosInterno += 7; // Espaciado entre líneas
        });

        // Examen Mensual (si aplica)
        if (asignatura.examen_mensual) {
          const examenes = asignatura.notas?.[cicloSeleccionadoNotas]?.examen_mensual || {};
          const examen1 = examenes[1] || null;
          const examen2 = examenes[2] || null;
          // Calcular promedio del examen mensual
          let promedioExamen = null;
          if (examen1 && examen2) {
            const e1 = parseFloat(examen1);
            const e2 = parseFloat(examen2);
            if (!isNaN(e1) && !isNaN(e2) && e1 > 0 && e2 > 0) {
              promedioExamen = Math.round((e1 + e2) / 2);
            }
          }

          doc.setFontSize(7);
          doc.setFont('helvetica', 'normal');
          doc.text(`Examen Mensual (${asignatura.peso_examen_mensual}%)`, margin + 3, yPosInterno);
          doc.text(`${examen1 || '-'}  ${examen2 || '-'}`, margin + 75, yPosInterno);
          
          // Promedio del examen mensual al final
          if (promedioExamen) {
            const promedioX = margin + contentWidth - 15;
            doc.setFillColor(253, 233, 217);
            doc.roundedRect(promedioX, yPosInterno - 2.5, 10, 4, 1, 1, 'F');
            doc.setDrawColor(color.border[0], color.border[1], color.border[2]);
            doc.setLineWidth(0.5);
            doc.roundedRect(promedioX, yPosInterno - 2.5, 10, 4, 1, 1);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(7);
            doc.setTextColor(color.text[0], color.text[1], color.text[2]);
            doc.text(promedioExamen.toString(), promedioX + 5, yPosInterno, { align: 'center' });
            doc.setFont('helvetica', 'normal');
          }
          yPosInterno += 7;
        }

        // Promedio Final - ajustado para que quepa dentro del card
        const promedioFinal = asignatura.notas?.[cicloSeleccionadoNotas]?.promedio_final || null;
        // Reducir la posición Y para que quepa mejor dentro del card
        yPosInterno -= 3; // Bajar 3mm
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.text('PROMEDIO', margin + 3, yPosInterno);
        if (promedioFinal) {
          const promedioX = margin + 75;
          doc.setFillColor(249, 249, 249);
          doc.roundedRect(promedioX, yPosInterno - 2.5, 12, 5, 1, 1, 'F');
          doc.setDrawColor(color.border[0], color.border[1], color.border[2]);
          doc.setLineWidth(1);
          doc.roundedRect(promedioX, yPosInterno - 2.5, 12, 5, 1, 1);
          doc.setFontSize(9);
          doc.setTextColor(color.text[0], color.text[1], color.text[2]);
          doc.text(promedioFinal.toString(), promedioX + 6, yPosInterno, { align: 'center' });
        } else {
          doc.setFontSize(7);
          doc.text('-', margin + 75, yPosInterno);
        }

        yPos += cardHeight + 8; // Espacio entre cards
      });

      const nombreArchivo = `Notas_Detalladas_${notasDetalladas.alumno?.apellido_paterno?.replace(/\s+/g, '_')}_${nombresBimestres[cicloSeleccionadoNotas - 1]}_${new Date().getTime()}.pdf`;
      doc.save(nombreArchivo);

      Swal.fire({
        title: '¡PDF Generado!',
        text: 'Las notas detalladas se han exportado correctamente',
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

      await api.put(`/apoderado/hijos/${hijoSeleccionado.id}/datos`, formDataToSend, {
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

  console.log('[FRONTEND] DocenteHijos: Es apoderado, renderizando lista de hijos. Total hijos:', hijos.length);
  console.log('[FRONTEND] DocenteHijos: Hijos data:', hijos);

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
                          
                          {openDropdown?.hijoId === hijo.id && openDropdown?.top && (() => {
                            console.log('[FRONTEND] ========== RENDERIZANDO DROPDOWN ==========');
                            console.log('[FRONTEND] Hijo ID:', hijo.id);
                            console.log('[FRONTEND] Hijo DNI:', hijo.dni || hijo.nro_documento || 'NO DISPONIBLE');
                            console.log('[FRONTEND] Hijo completo:', hijo);
                            console.log('[FRONTEND] tieneDeudasBloqueadas en render:', tieneDeudasBloqueadas);
                            return null;
                          })()}
                          {openDropdown?.hijoId === hijo.id && openDropdown?.top && 
                            createPortal(
                              <div 
                                ref={dropdownRef}
                                className="dropdown-menu dropdown-menu-hijo"
                                style={{
                                  top: `${openDropdown.top}px`,
                                  left: `${openDropdown.left}px`,
                                  position: 'fixed',
                                  zIndex: 99999,
                                  maxHeight: openDropdown.maxHeight ? `${openDropdown.maxHeight}px` : '420px',
                                  overflowY: 'auto'
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
                                    handleOpcionClick('horario', hijo);
                                  }}
                                >
                                  <span className="dropdown-icon">📅</span>
                                  <span>Horario</span>
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
                                  className={`dropdown-item ${tieneDeudasBloqueadas ? 'disabled' : ''}`}
                                  type="button"
                                  disabled={tieneDeudasBloqueadas}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    console.log('[FRONTEND] onClick Notas Detalladas - tieneDeudasBloqueadas:', tieneDeudasBloqueadas);
                                    if (tieneDeudasBloqueadas) {
                                      console.log('[FRONTEND] BLOQUEANDO en onClick - Notas Detalladas');
                                      Swal.fire({
                                        icon: 'warning',
                                        title: 'Acceso Bloqueado',
                                        text: 'No puede acceder a esta opción debido a deudas pendientes de pensión. Por favor, cancele las pensiones vencidas.',
                                        confirmButtonText: 'Entendido'
                                      });
                                      return;
                                    }
                                    console.log('[FRONTEND] PERMITIENDO en onClick - Notas Detalladas');
                                    handleOpcionClick('notas-detalladas', hijo);
                                  }}
                                  title={tieneDeudasBloqueadas ? 'Bloqueado por deudas pendientes' : ''}
                                >
                                  <span className="dropdown-icon">📊</span>
                                  <span>Notas Detalladas</span>
                                  {tieneDeudasBloqueadas && <span className="bloqueado-badge">🔒</span>}
                                </button>
                                <button
                                  className={`dropdown-item ${tieneDeudasBloqueadas ? 'disabled' : ''}`}
                                  type="button"
                                  disabled={tieneDeudasBloqueadas}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    console.log('[FRONTEND] onClick Ver Libreta - tieneDeudasBloqueadas:', tieneDeudasBloqueadas);
                                    if (tieneDeudasBloqueadas) {
                                      console.log('[FRONTEND] BLOQUEANDO en onClick - Ver Libreta');
                                      Swal.fire({
                                        icon: 'warning',
                                        title: 'Acceso Bloqueado',
                                        text: 'No puede acceder a esta opción debido a deudas pendientes de pensión. Por favor, cancele las pensiones vencidas.',
                                        confirmButtonText: 'Entendido'
                                      });
                                      return;
                                    }
                                    console.log('[FRONTEND] PERMITIENDO en onClick - Ver Libreta');
                                    handleOpcionClick('imprimir-notas', hijo);
                                  }}
                                  title={tieneDeudasBloqueadas ? 'Bloqueado por deudas pendientes' : ''}
                                >
                                  <span className="dropdown-icon">📄</span>
                                  <span>Ver Libreta</span>
                                  {tieneDeudasBloqueadas && <span className="bloqueado-badge">🔒</span>}
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
                                    handleOpcionClick('reiniciar-contrasena', hijo);
                                  }}
                                >
                                  <span className="dropdown-icon">🔑</span>
                                  <span>Reiniciar Contraseña</span>
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
                                {/* Botón Diagnosticar Deudas - OCULTO (no eliminado por si acaso) */}
                                {false && (
                                  <button
                                    className="dropdown-item"
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleOpcionClick('diagnostico-deudas', hijo);
                                    }}
                                    style={{ backgroundColor: '#fff3cd', color: '#856404', fontWeight: 'bold' }}
                                  >
                                    <span className="dropdown-icon">🔍</span>
                                    <span>Diagnosticar Deudas</span>
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

      {/* Modal Horario */}
      {showModalHorario && createPortal(
        <div className="modal-overlay-qr" onClick={() => setShowModalHorario(false)}>
          <div className="modal-content-horario" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '95%', maxHeight: '95vh', overflow: 'auto' }}>
            <div className="modal-header-qr">
              <h2>📅 Horario de {hijoSeleccionado?.nombres} {hijoSeleccionado?.apellido_paterno}</h2>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                {horario && horario.length > 0 && (
                  <button className="btn-imprimir" onClick={handleExportarHorarioPDF} style={{ padding: '8px 16px', fontSize: '14px' }}>
                    <span className="btn-icon">📄</span>
                    <span className="btn-text">Exportar</span>
                  </button>
                )}
                <button className="modal-close-qr" onClick={() => setShowModalHorario(false)}>×</button>
              </div>
            </div>

            <div className="modal-body-horario" style={{ padding: '20px' }}>
              {loadingHorario ? (
                <div className="qr-loading">
                  <div className="loading-spinner">Cargando horario...</div>
                </div>
              ) : !horario || horario.length === 0 ? (
                <div className="empty-state">
                  <p>No se encontró horario para el año académico actual</p>
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

      {/* Modal Pagos Realizados */}
      {showModalPagos && createPortal(
        <div className="modal-overlay-qr" onClick={() => setShowModalPagos(false)}>
          <div className="modal-content-pagos" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '95%', maxHeight: '95vh', overflow: 'auto' }}>
            <div className="modal-header-qr">
              <h2>💳 Pagos Realizados - {hijoSeleccionado?.nombres} {hijoSeleccionado?.apellido_paterno}</h2>
              <button className="modal-close-qr" onClick={() => setShowModalPagos(false)}>×</button>
            </div>

            <div className="modal-body-pagos" style={{ padding: '20px' }}>
              {loadingPagos ? (
                <div className="qr-loading">
                  <div className="loading-spinner">Cargando pagos...</div>
                </div>
              ) : !pagos || pagos.length === 0 ? (
                <div className="empty-state">
                  <p>No se encontraron pagos registrados</p>
                </div>
              ) : (
                <div className="pagos-container" style={{ 
                  backgroundColor: '#fff', 
                  borderRadius: '8px', 
                  border: '1px solid #dee2e6',
                  overflow: 'hidden'
                }}>
                  {/* TABS por año */}
                  <div className="pagos-tabs-container" style={{
                    display: 'flex',
                    borderBottom: '2px solid #dee2e6',
                    backgroundColor: '#f8f9fa'
                  }}>
                    {pagos.map((matricula, matIndex) => (
                      <button
                        key={matricula.anio}
                        onClick={() => setTabAnioActivo(matricula.anio)}
                        style={{
                          flex: 1,
                          padding: '15px 20px',
                          border: 'none',
                          backgroundColor: tabAnioActivo === matricula.anio ? '#3b82f6' : 'transparent',
                          color: tabAnioActivo === matricula.anio ? 'white' : '#495057',
                          fontWeight: tabAnioActivo === matricula.anio ? 'bold' : 'normal',
                          cursor: 'pointer',
                          fontSize: '14px',
                          transition: 'all 0.2s',
                          borderBottom: tabAnioActivo === matricula.anio ? '3px solid #2563eb' : '3px solid transparent'
                        }}
                        onMouseEnter={(e) => {
                          if (tabAnioActivo !== matricula.anio) {
                            e.target.style.backgroundColor = '#e9ecef';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (tabAnioActivo !== matricula.anio) {
                            e.target.style.backgroundColor = 'transparent';
                          }
                        }}
                      >
                        {matricula.anio}
                      </button>
                    ))}
                  </div>

                  {/* Contenido de cada año */}
                  {pagos.map((matricula, matIndex) => (
                    <div 
                      key={matricula.matricula_id} 
                      className="matricula-pagos-section" 
                      style={{ 
                        display: tabAnioActivo === matricula.anio ? 'block' : 'none',
                        padding: '20px'
                      }}
                    >
                      {/* Header de la matrícula */}
                      <div className="matricula-header" style={{
                        backgroundColor: '#3b82f6',
                        color: 'white',
                        padding: '15px',
                        borderRadius: '8px 8px 0 0',
                        marginBottom: '0'
                      }}>
                        <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold' }}>
                          {matricula.grupo_texto}
                        </h3>
                      </div>

                      {/* Resumen de la matrícula */}
                      <div className="matricula-resumen" style={{
                        backgroundColor: '#f8f9fa',
                        padding: '15px',
                        border: '1px solid #dee2e6',
                        borderTop: 'none',
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                        gap: '15px'
                      }}>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: '12px', color: '#6c757d', marginBottom: '5px' }}>Monto a Pagar</div>
                          <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#495057' }}>
                            {formatearMonto(matricula.total_pagar || 0)}
                          </div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: '12px', color: '#6c757d', marginBottom: '5px' }}>Monto Pagado</div>
                          <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#28a745' }}>
                            {formatearMonto(matricula.total_pagado || 0)}
                          </div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: '12px', color: '#6c757d', marginBottom: '5px' }}>Monto que Adeuda</div>
                          <div style={{ fontSize: '16px', fontWeight: 'bold', color: (matricula.total_pendiente || 0) > 0 ? '#dc3545' : '#28a745' }}>
                            {formatearMonto(matricula.total_pendiente || 0)}
                          </div>
                        </div>
                      </div>

                      {/* Cards de pagos */}
                      {matricula.pagos && matricula.pagos.length > 0 ? (
                        <div className="pagos-cards-container" style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                          gap: '15px',
                          padding: '15px',
                          backgroundColor: '#fff',
                          border: '1px solid #dee2e6',
                          borderTop: 'none',
                          borderRadius: '0 0 8px 8px'
                        }}>
                          {matricula.pagos.map((pago, pagoIndex) => {
                            const esCancelado = pago.estado_pago === 'CANCELADO';
                            
                            // Colores según estado: verde pastel para cancelados, rojo pastel para pendientes
                            const colorCard = esCancelado 
                              ? { bg: '#E8F5E9', border: '#4CAF50', text: '#2E7D32' } // Verde pastel
                              : { bg: '#FFEBEE', border: '#F44336', text: '#C62828' }; // Rojo pastel
                            
                            return (
                              <div
                                key={pago.id || `pago-${pago.tipo}-${pago.nro_pago}`}
                                className="pago-card"
                                style={{
                                  backgroundColor: colorCard.bg,
                                  border: `2px solid ${colorCard.border}`,
                                  borderRadius: '8px',
                                  padding: '15px',
                                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                                  opacity: 1
                                }}
                              >
                                <div className="pago-card-header" style={{ marginBottom: '12px' }}>
                                  <h4 style={{ 
                                    margin: 0, 
                                    fontSize: '16px', 
                                    fontWeight: 'bold',
                                    color: colorCard.text,
                                    marginBottom: '5px'
                                  }}>
                                    {pago.tipo_descripcion}
                                  </h4>
                                  <div style={{ 
                                    fontSize: '12px', 
                                    color: esCancelado ? '#28a745' : '#dc3545',
                                    fontWeight: 'bold'
                                  }}>
                                    {esCancelado ? '✓ CANCELADO' : '⏳ PENDIENTE'}
                                  </div>
                                </div>

                                <div className="pago-card-body" style={{ marginBottom: '12px' }}>
                                  {/* Campos ocultos: Monto, Fecha, Fecha Emisión */}
                                  {/* Solo mostramos: Total, Nº Operación, Serie/Número, Fecha Cancelado, Fecha Vencimiento, Mora */}
                                  <div style={{ marginBottom: '8px' }}>
                                    <span style={{ fontSize: '12px', color: colorCard.text, fontWeight: 'bold' }}>Total: </span>
                                    <span style={{ fontSize: '16px', color: colorCard.text, fontWeight: 'bold' }}>
                                      {formatearMonto(pago.total)}
                                    </span>
                                  </div>
                                  {pago.fecha_vencimiento_formateada && (
                                    <div style={{ marginBottom: '8px' }}>
                                      <span style={{ fontSize: '12px', color: colorCard.text, fontWeight: 'bold' }}>Fecha Vencimiento: </span>
                                      <span style={{ fontSize: '12px', color: colorCard.text }}>
                                        {pago.fecha_vencimiento_formateada}
                                      </span>
                                    </div>
                                  )}
                                  {pago.hubo_mora && (
                                    <div style={{ marginBottom: '8px', padding: '6px 10px', backgroundColor: '#ffebee', borderRadius: '4px', border: '1px solid #f44336' }}>
                                      <span style={{ fontSize: '12px', color: '#c62828', fontWeight: 'bold' }}>⚠️ MORA: </span>
                                      <span style={{ fontSize: '12px', color: '#c62828', fontWeight: 'bold' }}>
                                        {pago.dias_mora > 0 ? `${pago.dias_mora} día${pago.dias_mora > 1 ? 's' : ''} de mora` : 'Con mora'}
                                      </span>
                                      {(pago.mora_final > 0 || pago.mora_calculada > 0) && (
                                        <span style={{ fontSize: '12px', color: '#c62828', fontWeight: 'bold', marginLeft: '8px' }}>
                                          ({formatearMonto(pago.mora_final || pago.mora_calculada || 0)})
                                        </span>
                                      )}
                                    </div>
                                  )}
                                  {esCancelado && pago.nro_movimiento_banco && (
                                    <div style={{ marginBottom: '8px' }}>
                                      <span style={{ fontSize: '12px', color: colorCard.text, fontWeight: 'bold' }}>Nº Operación: </span>
                                      <span style={{ fontSize: '12px', color: colorCard.text }}>
                                        {pago.nro_movimiento_banco}{pago.nro_movimiento_importado ? ` | ${pago.nro_movimiento_importado}` : ''}
                                      </span>
                                    </div>
                                  )}
                                  {esCancelado && pago.boleta && (
                                    <div style={{ marginBottom: '8px' }}>
                                      <span style={{ fontSize: '12px', color: colorCard.text, fontWeight: 'bold' }}>Serie/Número: </span>
                                      <span style={{ fontSize: '12px', color: colorCard.text }}>
                                        {pago.boleta.serie_numero}
                                      </span>
                                    </div>
                                  )}
                                  {esCancelado && pago.fecha_cancelado && (
                                    <div style={{ marginBottom: '8px' }}>
                                      <span style={{ fontSize: '12px', color: colorCard.text, fontWeight: 'bold' }}>Fecha Cancelado: </span>
                                      <span style={{ fontSize: '12px', color: colorCard.text }}>
                                        {formatearFechaPago(pago.fecha_cancelado)}
                                      </span>
                                    </div>
                                  )}
                                </div>

                                {esCancelado && pago.boleta && (
                                  <div className="pago-card-footer" style={{ marginTop: '12px', paddingTop: '12px', borderTop: `1px solid ${colorCard.border}` }}>
                                    <button
                                      className="btn-imprimir-boleta"
                                      onClick={() => generarPDFBoleta(pago)}
                                      style={{
                                        width: '100%',
                                        padding: '8px 16px',
                                        backgroundColor: '#3b82f6',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                        fontSize: '14px',
                                        fontWeight: 'bold',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '8px',
                                        transition: 'background-color 0.2s'
                                      }}
                                      onMouseEnter={(e) => e.target.style.backgroundColor = '#2563eb'}
                                      onMouseLeave={(e) => e.target.style.backgroundColor = '#3b82f6'}
                                    >
                                      <span>🖨️</span>
                                      <span>Imprimir Boleta</span>
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div style={{
                          padding: '20px',
                          textAlign: 'center',
                          backgroundColor: '#fff',
                          border: '1px solid #dee2e6',
                          borderTop: 'none',
                          borderRadius: '0 0 8px 8px'
                        }}>
                          <p style={{ margin: 0, color: '#6c757d' }}>NO HA REGISTRADO NINGÚN PAGO</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal Notas Detalladas */}
      {showModalNotasDetalladas && createPortal(
        <div className="modal-overlay-qr" onClick={() => setShowModalNotasDetalladas(false)}>
          <div className="modal-content-notas-detalladas" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-qr">
              <h2>📊 Notas Registradas - {hijoSeleccionado?.nombres} {hijoSeleccionado?.apellido_paterno}</h2>
              <button className="modal-close-qr" onClick={() => setShowModalNotasDetalladas(false)}>×</button>
            </div>

            <div className="modal-body-notas-detalladas">
              {loadingNotasDetalladas ? (
                <div className="qr-loading">
                  <div className="loading-spinner">Cargando notas...</div>
                </div>
              ) : !notasDetalladas || !notasDetalladas.asignaturas || notasDetalladas.asignaturas.length === 0 ? (
                <div className="empty-state">
                  <p>No hay notas registradas</p>
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
                    <button 
                      className="btn-exportar-notas-detalladas"
                      onClick={handleExportarNotasDetalladasPDF}
                    >
                      🖨️ Exportar Notas
                    </button>
                  </div>

                  <div className="alert alert-danger text-center">
                    La información mostrada puede no estar completa al 100%, para cualquier consulta comuníquese con el administrador.
                  </div>

                  <div className="asignaturas-notas-container">
                    {notasDetalladas.asignaturas.map((asignatura, index) => {
                      const coloresPastelNotas = [
                        { bg: 'linear-gradient(145deg, #e8f5e9, #f1f8e9)', border: '#4caf50', text: '#2e7d32' }, // Verde
                        { bg: 'linear-gradient(145deg, #e3f2fd, #e8f4fd)', border: '#2196f3', text: '#1565c0' }, // Azul
                        { bg: 'linear-gradient(145deg, #fff3e0, #fff8e1)', border: '#ff9800', text: '#e65100' }, // Naranja
                        { bg: 'linear-gradient(145deg, #f3e5f5, #f5e6f7)', border: '#9c27b0', text: '#6a1b9a' }, // Morado
                        { bg: 'linear-gradient(145deg, #ffebee, #fce4ec)', border: '#f44336', text: '#c62828' }, // Rojo
                        { bg: 'linear-gradient(145deg, #fff9e6, #fffde7)', border: '#ffc107', text: '#f57c00' }, // Amarillo
                        { bg: 'linear-gradient(145deg, #e0f2f1, #e8f5f3)', border: '#009688', text: '#00695c' }, // Turquesa
                        { bg: 'linear-gradient(145deg, #fce4ec, #fce8ed)', border: '#e91e63', text: '#c2185b' } // Rosa
                      ];
                      const color = coloresPastelNotas[index % coloresPastelNotas.length];

                      return (
                        <div 
                          key={asignatura.asignatura_id} 
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
                                        {asignatura.nivel.tipo_calificacion_final === 1 && (
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
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </DashboardLayout>
  );
}

export default ApoderadoHijos;

