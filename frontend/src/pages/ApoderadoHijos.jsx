import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import api from '../services/api';
import { QRCodeSVG } from 'qrcode.react';
import { jsPDF } from 'jspdf';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import Swal from 'sweetalert2';
import { generarPDFBoletaDesdeDatos, MSG_NO_IMPRESION_BOLETA } from '../utils/generarPDFBoletaPago';
import { getLibretaPdfLabelFillRgb } from '../utils/libretaPdfColors';
import { renderLibretaInicialBoleta } from '../utils/libretaInicialPdf';
import {
  buildValoresFilaLibreta,
  dibujarFilaValoresLibreta,
  dibujarCeldaNotaLibreta,
} from '../utils/libretaCuantitativaPdf';
import { normalizarRangosLetras } from '../utils/notaLetraConversion';
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
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [hijos, setHijos] = useState([]);
  const [openDropdown, setOpenDropdown] = useState(null);
  const dropdownRef = useRef(null);
  const dropdownButtonRef = useRef(null);
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
  const [aniosHistoricoDisponibles, setAniosHistoricoDisponibles] = useState([]);
  const [anioHistoricoSeleccionado, setAnioHistoricoSeleccionado] = useState(null);
  const [modoHistorico, setModoHistorico] = useState(false);

  useEffect(() => {
    console.log('[FRONTEND] ApoderadoHijos useEffect ejecutado - Iniciando carga de hijos y verificación de deudas');
    const init = async () => {
      try {
        await cargarHijosConHistorico();
      } finally {
        // Si estamos en modo histórico, no bloqueamos opciones por deudas del año activo.
        const userRaw = localStorage.getItem('user');
        const anioConsultaStored = localStorage.getItem('anio_consulta_apoderado');
        const user = userRaw ? JSON.parse(userRaw) : null;
        const anioToken = user?.anio_activo != null ? parseInt(String(user.anio_activo), 10) : null;
        const anioConsultaNum = anioConsultaStored ? parseInt(String(anioConsultaStored), 10) : null;
        const esHistoricoInicial =
          anioToken != null && anioConsultaNum != null && !Number.isNaN(anioToken) && !Number.isNaN(anioConsultaNum) && anioConsultaNum !== anioToken;

        if (!esHistoricoInicial) {
          verificarDeudasBloqueadas();
        } else {
          setTieneDeudasBloqueadas(false);
        }
      }
    };
    init();
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
          dropdownButtonRef.current = null;
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
      const hijosCargados = response.data.hijos || [];
      setHijos(hijosCargados);
      return hijosCargados;
    } catch (error) {
      console.error('Error cargando hijos:', error);
      setHijos([]);
      return [];
    } finally {
      setLoading(false);
    }
  };

  const cargarHijosConHistorico = async () => {
    // 1) Intenta cargar para el año actual del token o el año seleccionado (si existe en localStorage)
    const hijosCargados = await cargarHijos();

    const userRaw = localStorage.getItem('user');
    const user = userRaw ? JSON.parse(userRaw) : null;
    const anioToken = user?.anio_activo != null ? parseInt(String(user.anio_activo), 10) : null;
    const anioConsultaStored = localStorage.getItem('anio_consulta_apoderado');
    const anioConsultaNum = anioConsultaStored ? parseInt(String(anioConsultaStored), 10) : null;

    const esHistoricoInicial =
      anioToken != null && anioConsultaNum != null && !Number.isNaN(anioToken) && !Number.isNaN(anioConsultaNum) && anioConsultaNum !== anioToken;

    setModoHistorico(Boolean(esHistoricoInicial));
    setAnioHistoricoSeleccionado(esHistoricoInicial ? anioConsultaNum : null);

    // 2) Si no hay hijos en ese año, intentamos con el modo histórico sin deuda
    if (!hijosCargados || hijosCargados.length === 0) {
      try {
        const response = await api.get('/apoderado/hijos/anios-historico');
        const anios = Array.isArray(response.data?.anios) ? response.data.anios : [];
        setAniosHistoricoDisponibles(anios);

        if (anios.length > 0) {
          const anioSeleccionar = Math.max(...anios.map((a) => parseInt(String(a), 10)));
          setAnioHistoricoSeleccionado(anioSeleccionar);
          setModoHistorico(true);
          localStorage.setItem('anio_consulta_apoderado', String(anioSeleccionar));
          setTieneDeudasBloqueadas(false);
          await cargarHijos();
        } else {
          localStorage.removeItem('anio_consulta_apoderado');
          setAnioHistoricoSeleccionado(null);
          setModoHistorico(false);
        }
      } catch (e) {
        console.error('Error cargando anios historico apoderado:', e);
      }
    }
  };

  const seleccionarAnioHistorico = async (anio) => {
    if (!anio || isNaN(parseInt(anio, 10))) return;
    const anioNum = parseInt(String(anio), 10);
    localStorage.setItem('anio_consulta_apoderado', String(anioNum));
    setAnioHistoricoSeleccionado(anioNum);
    setModoHistorico(true);
    setTieneDeudasBloqueadas(false);
    // Recargar hijos para ese año (backend aplicará la validación sin deuda)
    await cargarHijos();
  };

  const handleOpcionesClick = (e, hijoId) => {
    e.stopPropagation();
    if (openDropdown?.hijoId === hijoId) {
      dropdownButtonRef.current = null;
      setOpenDropdown(null);
      return;
    }
    const btn = e.currentTarget;
    dropdownButtonRef.current = btn;
    setOpenDropdown({ hijoId, rect: btn.getBoundingClientRect() });
  };

  // Actualizar posición del dropdown en portal al hacer scroll o resize
  useEffect(() => {
    if (!openDropdown || !dropdownButtonRef.current) return;
    const updateRect = () => {
      if (dropdownButtonRef.current) {
        setOpenDropdown(prev => prev ? { ...prev, rect: dropdownButtonRef.current.getBoundingClientRect() } : null);
      }
    };
    window.addEventListener('scroll', updateRect, true);
    window.addEventListener('resize', updateRect);
    return () => {
      window.removeEventListener('scroll', updateRect, true);
      window.removeEventListener('resize', updateRect);
    };
  }, [openDropdown?.hijoId]);

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
      const resultado = response.data;
      console.log('[FRONTEND] Diagnóstico técnico (consola):', JSON.stringify(resultado, null, 2));

      Swal.fire({
        icon: 'info',
        title: 'Problemas con el servidor',
        text: 'Se está solucionando. Si es personal de soporte, revise la consola del navegador (F12) para el informe técnico.',
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
          console.log('[FRONTEND] BLOQUEANDO acceso a Notas Detalladas (restricción interna)');
          Swal.fire({
            icon: 'info',
            title: 'Problemas con el servidor',
            text: 'Se está solucionando.',
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
          console.log('[FRONTEND] BLOQUEANDO acceso a Ver Libreta (restricción interna)');
          Swal.fire({
            icon: 'info',
            title: 'Problemas con el servidor',
            text: 'Se está solucionando.',
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
    // Filtro previo: el alumno debe tener foto subida para poder imprimir el QR (carnet)
    const tieneFoto = hijo.foto != null && String(hijo.foto).trim() !== '';
    if (!tieneFoto) {
      Swal.fire({
        icon: 'info',
        title: 'Foto requerida',
        html: 'Para poder ver e imprimir el código QR del alumno, primero debe <strong>subir su foto</strong> en la opción <strong>Editar datos del hijo</strong>.',
        confirmButtonText: 'Entendido'
      });
      return;
    }

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
      navigate(`/apoderado/hijos/${hijoSeleccionado.id}/aula-virtual/${curso.asignatura_id}`, {
        state: {
          returnTo: '/apoderado/hijos',
          reopenCursos: true,
          hijoId: hijoSeleccionado.id
        }
      });
    } else {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'No se ha seleccionado un hijo',
        confirmButtonText: 'Entendido'
      });
    }
  };

  // Restaurar "Cursos Asignados" al volver desde Aula Virtual
  useEffect(() => {
    const state = location.state;
    if (!state?.reopenCursos || !state?.hijoId || hijos.length === 0) return;
    const hijo = hijos.find((h) => Number(h.id) === Number(state.hijoId));
    if (!hijo) return;
    handleVerCursos(hijo);
    navigate('/apoderado/hijos', { replace: true, state: null });
  }, [location.state, hijos]);

  const handleEnviarMensaje = (curso) => {
    const docenteData = {
      id: curso.docente_usuario_id || curso.docente_id,
      nombre: curso.docente_nombre,
      curso_nombre: curso.curso_nombre,
      esTutor: false
    };
    setDocenteParaMensaje(docenteData);
    setMostrarModalMensaje(true);
  };

  const handleMensajeAlTutor = (hijo) => {
    const uid = hijo.tutor_usuario_id != null ? Number(hijo.tutor_usuario_id) : null;
    if (!uid) {
      Swal.fire({
        icon: 'info',
        title: 'Sin tutor',
        text: 'No hay tutor asignado al aula de este grupo. Consulte en secretaría si necesita contacto.',
        confirmButtonText: 'Entendido'
      });
      return;
    }
    setHijoSeleccionado(hijo);
    setDocenteParaMensaje({
      id: uid,
      nombre: (hijo.tutor_nombre_completo || '').trim() || 'Tutor',
      curso_nombre: 'Tutor del aula',
      esTutor: true
    });
    setAsuntoMensaje('');
    setContenidoMensaje('');
    setArchivosAdjuntos([]);
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
    if (!hijoSeleccionado?.id) {
      Swal.fire('Error', 'No se pudo identificar al alumno para el envío.', 'error');
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
      formData.append('destinatarios', JSON.stringify([Number(docenteParaMensaje.id)]));
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
  }, [mostrarModalMensaje, hijoSeleccionado?.id]);

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
      const resAnios = await api.get(`/apoderado/hijos/${hijo.id}/libreta-anios`);
      const anios = resAnios.data?.anios || [];
      if (anios.length === 0) {
        Swal.fire({
          icon: 'info',
          title: 'Sin datos',
          text: 'No hay años con matrícula para este alumno',
          confirmButtonText: 'Entendido'
        });
        return;
      }
      const anioDefault = anios[0];
      const { value: result } = await Swal.fire({
        title: 'Exportar Libreta',
        html: `
          <p style="margin-bottom: 1rem;">Seleccione el año y el bimestre hasta el cual desea ver datos.</p>
          <label style="display:block; text-align:left; margin-bottom: 0.25rem; font-weight: 600;">Año</label>
          <select id="swal-anio" class="swal2-input" style="width: 100%; margin-bottom: 1rem;">
            ${anios.map((a) => `<option value="${a}" ${a === anioDefault ? 'selected' : ''}>${a}</option>`).join('')}
          </select>
          <label style="display:block; text-align:left; margin-bottom: 0.25rem; font-weight: 600;">Bimestre</label>
          <select id="swal-ciclo" class="swal2-input" style="width: 100%;">
            <option value="1">Bimestre 1</option>
            <option value="2">Bimestre 2</option>
            <option value="3">Bimestre 3</option>
            <option value="4">Bimestre 4</option>
          </select>
        `,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Descargar',
        cancelButtonText: 'Cancelar',
        preConfirm: () => {
          const anio = parseInt(document.getElementById('swal-anio').value, 10);
          const ciclo = parseInt(document.getElementById('swal-ciclo').value, 10);
          return { anio, ciclo };
        }
      });
      if (!result) return;
      setHijoSeleccionado(hijo);
      await generarPDFLibreta(hijo.id, result.ciclo, result.anio);
    } catch (error) {
      console.error('Error generando libreta:', error);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: error.response?.data?.error || 'No se pudo generar la libreta',
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

  const generarPDFBoleta = async (pago) => {
    try {
      if (!pago.id || !pago.boleta) {
        Swal.fire({
          icon: 'warning',
          title: 'Sin impresión',
          text: MSG_NO_IMPRESION_BOLETA,
          confirmButtonText: 'Entendido'
        });
        return;
      }

      if (pago.estado_pago !== 'CANCELADO') {
        Swal.fire({
          icon: 'warning',
          title: 'Pago No Cancelado',
          text: 'Solo se puede imprimir la boleta de pagos que han sido cancelados. Este pago aún no ha sido cancelado.',
          confirmButtonText: 'Entendido'
        });
        return;
      }

      const response = await api.get(`/apoderado/pagos/${pago.id}/boleta`);
      await generarPDFBoletaDesdeDatos(response.data);
      Swal.fire({
        icon: 'success',
        title: 'Boleta generada',
        text: 'La boleta se ha generado correctamente',
        timer: 2000,
        showConfirmButton: false
      });
    } catch (error) {
      console.error('Error generando boleta:', error);
      const msg = error.response?.data?.error;
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: msg || 'No se pudo generar la boleta. Por favor, intente nuevamente.',
        confirmButtonText: 'Entendido'
      });
    }
  };

  const generarPDFLibreta = async (hijoId, ciclo = 1, anio = null) => {
    try {
      setLoadingNotasDetalladas(true);
      const params = { ciclo };
      if (anio != null && anio > 0) params.anio = anio;
      const response = await api.get(`/apoderado/hijos/${hijoId}/libreta`, { params });
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

      const cicloSel = datosLibreta.ciclo || ciclo || 1;
      const esInicial = datosLibreta.es_cualitativa && datosLibreta.cursos_cualitativos;
      const headerHeight = 5;
      const borderWidth = 0.5;
      const colorLabel = getLibretaPdfLabelFillRgb(datosLibreta);
      const colorData = [255, 255, 255];

      if (esInicial) {
        const yBanner = Math.max(margin + 12, margin + (logoHeight || 18) + 1);
        await renderLibretaInicialBoleta(doc, {
          datosLibreta,
          pageWidth,
          pageHeight,
          margin,
          contentWidth,
          borderWidth,
          colorLabel,
          colorData,
          cicloSel,
          yStart: yBanner,
          logoHeightMm: logoHeight || 0
        });
      } else {
      let yPos = margin + paddingVertical;
      // Header con título (Primaria / Secundaria)
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('BOLETA DE INFORMACIÓN ACADÉMICA', pageWidth / 2, yPos + 10, { align: 'center' });
      yPos += 20;

      doc.setFontSize(9);
      doc.setLineWidth(borderWidth);
      doc.setDrawColor(0, 0, 0);

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

      const numCols = 5;
      const colAreaWidth = 80;
      const colBimestreWidth = (contentWidth - colAreaWidth) / numCols;
      const rangosLetras = normalizarRangosLetras(datosLibreta.rangos_letras);

        // ========== LAYOUT CUANTITATIVO (PRIMARIA/SECUNDARIA) ==========
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setLineWidth(borderWidth);
      
      doc.setFillColor(...colorLabel);
      doc.rect(margin, yPos, colAreaWidth, headerHeight, 'FD');
      doc.text('ÁREAS CURRICULARES', margin + colAreaWidth / 2, yPos + 3.5, { align: 'center' });
      let xPos = margin + colAreaWidth;
      for (let c = 1; c <= 4; c++) {
        doc.setFillColor(...colorLabel);
        doc.rect(xPos, yPos, colBimestreWidth, headerHeight, 'FD');
        doc.text(`B - ${c}`, xPos + colBimestreWidth / 2, yPos + 3.5, { align: 'center' });
        xPos += colBimestreWidth;
      }
      doc.setFillColor(...colorLabel);
      doc.rect(xPos, yPos, colBimestreWidth, headerHeight, 'FD');
      doc.text('PF', xPos + colBimestreWidth / 2, yPos + 3.5, { align: 'center' });
      yPos += headerHeight;

      // Áreas y asignaturas
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      
      datosLibreta.areas.forEach(area => {
        if (yPos > pageHeight - 60) {
          doc.addPage();
          yPos = margin;
        }
        const areaValores = buildValoresFilaLibreta(area, cicloSel);

        doc.setFont('helvetica', 'bold');
        doc.setFillColor(...colorLabel);
        doc.rect(margin, yPos, colAreaWidth, headerHeight, 'FD');
        doc.text(area.area_nombre.toUpperCase(), margin + 2, yPos + 3.5);
        dibujarFilaValoresLibreta(doc, {
          xStart: margin + colAreaWidth,
          y: yPos,
          colWidth: colBimestreWidth,
          rowHeight: headerHeight,
          valores: areaValores,
          fillRgb: colorLabel,
          rangosLetras,
          cicloSel,
        });
        yPos += headerHeight;

        doc.setFont('helvetica', 'normal');
        area.asignaturas.forEach(asignatura => {
          if (yPos > pageHeight - 60) {
            doc.addPage();
            yPos = margin + paddingVertical;
          }
          const asigValores = buildValoresFilaLibreta(asignatura, cicloSel);

          doc.setFillColor(...colorData);
          doc.rect(margin, yPos, colAreaWidth, headerHeight, 'FD');
          doc.text(asignatura.curso_nombre.toUpperCase(), margin + 2, yPos + 3.5);
          dibujarFilaValoresLibreta(doc, {
            xStart: margin + colAreaWidth,
            y: yPos,
            colWidth: colBimestreWidth,
            rowHeight: headerHeight,
            valores: asigValores,
            fillRgb: colorData,
            rangosLetras,
            cicloSel,
          });
          yPos += headerHeight;
        });
      });

      if (datosLibreta.asignaturas_sin_area && datosLibreta.asignaturas_sin_area.length > 0) {
        datosLibreta.asignaturas_sin_area.forEach(asignatura => {
          if (yPos > pageHeight - 60) {
            doc.addPage();
            yPos = margin + paddingVertical;
          }
          const asigValores = buildValoresFilaLibreta(asignatura, cicloSel);

          doc.setFillColor(...colorData);
          doc.rect(margin, yPos, colAreaWidth, headerHeight, 'FD');
          doc.text(asignatura.curso_nombre.toUpperCase(), margin + 2, yPos + 3.5);
          dibujarFilaValoresLibreta(doc, {
            xStart: margin + colAreaWidth,
            y: yPos,
            colWidth: colBimestreWidth,
            rowHeight: headerHeight,
            valores: asigValores,
            fillRgb: colorData,
            rangosLetras,
            cicloSel,
          });
          yPos += headerHeight;
        });
      }

      yPos += 5;

      const resumen = datosLibreta.resumen;
      const resumenWidth = colAreaWidth + (colBimestreWidth * numCols);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setFillColor(...colorLabel);
      doc.rect(margin, yPos, resumenWidth, headerHeight, 'FD');
      doc.text('CUADRO RESUMEN', margin + resumenWidth / 2, yPos + 3.5, { align: 'center' });
      yPos += headerHeight;

      doc.setFont('helvetica', 'normal');
      const cantB = []; for (let c = 1; c <= 4; c++) cantB.push(c <= cicloSel ? resumen.cantidad_cursos[`b${c}`] : null);
      const sumaB = []; for (let c = 1; c <= 4; c++) sumaB.push(c <= cicloSel ? resumen.suma_notas[`b${c}`] : null);
      const promB = []; for (let c = 1; c <= 4; c++) promB.push(c <= cicloSel ? resumen.promedio[`b${c}`] : null);
      const condB = []; for (let c = 1; c <= 4; c++) condB.push(c <= cicloSel ? resumen.promedio_conducta[`b${c}`] : null);
      const ordB = []; for (let c = 1; c <= 4; c++) ordB.push(c <= cicloSel ? resumen.orden_merito[`b${c}`] : null);
      const inasB = []; for (let c = 1; c <= 4; c++) inasB.push(c <= cicloSel ? resumen.inasistencias[`b${c}`] : null);
      const tardB = []; for (let c = 1; c <= 4; c++) tardB.push(c <= cicloSel ? resumen.tardanzas[`b${c}`] : null);

      const dibFila = (label, arr, def = '-') => {
        doc.setFillColor(...colorLabel);
        doc.rect(margin, yPos, colAreaWidth, headerHeight, 'FD');
        doc.setFont('helvetica', 'bold');
        doc.text(label, margin + 2, yPos + 3.5);
        doc.setFont('helvetica', 'normal');
        xPos = margin + colAreaWidth;
        arr.forEach((v) => {
          doc.setFillColor(...colorData);
          doc.rect(xPos, yPos, colBimestreWidth, headerHeight, 'FD');
          doc.text(v !== null && v !== undefined && v !== '' ? String(v) : def, xPos + colBimestreWidth / 2, yPos + 3.5, { align: 'center' });
          xPos += colBimestreWidth;
        });
        let col5Val = '-';
        if (label === 'PROMEDIO') {
          col5Val = promB.filter(p => p != null && p !== '').length > 0
            ? String(Math.round(promB.filter(p => p != null && p !== '').map(Number).reduce((a, b) => a + (isNaN(b) ? 0 : b), 0) / promB.filter(p => p != null && p !== '').length))
            : (resumen.promedio?.final != null ? String(resumen.promedio.final) : '-');
        } else if (label === 'PROMEDIO CONDUCTA') {
          col5Val = resumen.promedio_conducta?.final != null && resumen.promedio_conducta.final !== ''
            ? String(resumen.promedio_conducta.final) : (condB.filter(c => c != null && c !== '').length > 0
              ? String(Math.round(condB.filter(c => c != null && c !== '').map(Number).reduce((a, b) => a + (isNaN(b) ? 0 : b), 0) / condB.filter(c => c != null && c !== '').length))
              : '-');
        }
        doc.setFillColor(...colorData);
        if (label === 'PROMEDIO' && col5Val !== '-') {
          dibujarCeldaNotaLibreta(doc, {
            x: xPos,
            y: yPos,
            w: colBimestreWidth,
            h: headerHeight,
            valor: col5Val,
            fillRgb: colorData,
            esPf: true,
            rangosLetras,
          });
        } else {
          doc.rect(xPos, yPos, colBimestreWidth, headerHeight, 'FD');
          doc.text(
            (label === 'PROMEDIO' || label === 'PROMEDIO CONDUCTA') && col5Val !== '-'
              ? col5Val
              : '-',
            xPos + colBimestreWidth / 2,
            yPos + 3.5,
            { align: 'center' }
          );
        }
        yPos += headerHeight;
      };

      dibFila('CANTIDAD DE CURSOS', cantB);
      dibFila('SUMA DE NOTAS', sumaB);
      dibFila('PROMEDIO', promB, '-');
      dibFila('PROMEDIO CONDUCTA', condB, '-');
      dibFila('ORDEN DE MÉRITO', ordB);
      dibFila('N° DE INASISTENCIAS', inasB, '0');
      dibFila('N° DE TARDANZAS', tardB, '0');

      yPos += 20;

      // Footer: Recomendaciones
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('Recomendaciones:', margin, yPos);
      yPos += 5;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      const textoRecomendaciones = (datosLibreta.recomendaciones || '').trim() || '(Sin recomendaciones)';
      const lineasRecom = doc.splitTextToSize(textoRecomendaciones, pageWidth - 2 * margin);
      lineasRecom.forEach((linea) => {
        if (yPos > pageHeight - 25) {
          doc.addPage();
          yPos = margin;
        }
        doc.text(linea, margin, yPos);
        yPos += 5;
      });
      yPos += 25; // Más espacio entre Recomendaciones y la firma

      // Firma solo de Dirección Académica (centrada)
      doc.setFontSize(8);
      const firmaWidth = 70;
      const firmaX = (pageWidth - firmaWidth) / 2; // Centrar
      doc.setLineWidth(0.5); // Grosor de línea de 0.5mm
      doc.setDrawColor(0, 0, 0);
      doc.line(firmaX, yPos, firmaX + firmaWidth, yPos); // Línea de firma
      yPos += 12; // Más espacio entre línea y texto "Dirección Académica"

      doc.setFont('helvetica', 'bold'); // Texto en negrita
      doc.text('Dirección Académica', firmaX + firmaWidth / 2, yPos, { align: 'center' });

      // Sección Detalle de Notas (explicaciones del docente por curso) — antes del Reporte de Orden de Mérito
      let detalleNotas = datosLibreta.detalle_notas || [];
      if (detalleNotas.length === 0 && datosLibreta.areas) {
        const items = [];
        (datosLibreta.areas || []).forEach(ar => {
          (ar.asignaturas || []).forEach(as => {
            const prom = as[`promedio_b${cicloSel}`];
            items.push({ curso_nombre: as.curso_nombre || '-', docente_nombre: '-', promedio: prom != null && prom !== '' ? prom : '-', explicacion: '-' });
          });
        });
        (datosLibreta.asignaturas_sin_area || []).forEach(as => {
          const prom = as[`promedio_b${cicloSel}`];
          items.push({ curso_nombre: as.curso_nombre || '-', docente_nombre: '-', promedio: prom != null && prom !== '' ? prom : '-', explicacion: '-' });
        });
        detalleNotas = items;
      }
      if (detalleNotas.length > 0) {
        doc.addPage();
        let yDet = margin + 12;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.text('Detalle de Notas — Explicaciones por Curso', margin, yDet);
        yDet += 5;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.text(
          datosLibreta.es_cualitativa
            ? `DESCRIPCIÓN DE LA NOTA — ${datosLibreta.alumno?.grado}° ${datosLibreta.alumno?.seccion || ''}`
            : `Bimestre ${['I', 'II', 'III', 'IV'][(cicloSel || 1) - 1]} — ${datosLibreta.alumno?.grado}° ${datosLibreta.alumno?.seccion || ''}`,
          margin,
          yDet
        );
        yDet += 10;

        const colCurso = 45;
        const colDocente = 50;
        const colProm = 18;
        const colExp = pageWidth - margin * 2 - colCurso - colDocente - colProm;
        doc.setFillColor(...colorLabel);
        doc.rect(margin, yDet, colCurso, 6, 'FD');
        doc.rect(margin + colCurso, yDet, colDocente, 6, 'FD');
        doc.rect(margin + colCurso + colDocente, yDet, colProm, 6, 'FD');
        doc.rect(margin + colCurso + colDocente + colProm, yDet, colExp, 6, 'FD');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.text('Curso', margin + colCurso / 2, yDet + 4, { align: 'center' });
        doc.text('Docente', margin + colCurso + colDocente / 2, yDet + 4, { align: 'center' });
        doc.text('Prom.', margin + colCurso + colDocente + colProm / 2, yDet + 4, { align: 'center' });
        doc.text('Explicación', margin + colCurso + colDocente + colProm + colExp / 2, yDet + 4, { align: 'center' });
        yDet += 6;
        doc.setFont('helvetica', 'normal');
        detalleNotas.forEach((row) => {
          const expl = (row.explicacion || '').trim() || '-';
          const curso = (row.curso_nombre || '-').trim();
          const docente = (row.docente_nombre || '-').trim();
          const lineasExp = doc.splitTextToSize(expl, colExp - 4);
          const lineasCurso = doc.splitTextToSize(curso, colCurso - 4);
          const lineasDocente = doc.splitTextToSize(docente, colDocente - 4);
          const filaAlt = Math.max(6, Math.max(lineasExp.length, lineasCurso.length, lineasDocente.length) * 4) + 4;
          if (yDet + filaAlt > pageHeight - 25) { doc.addPage(); yDet = margin; }
          doc.setFillColor(240, 247, 255);
          doc.rect(margin, yDet, colCurso, filaAlt, 'FD');
          doc.rect(margin + colCurso, yDet, colDocente, filaAlt, 'FD');
          doc.rect(margin + colCurso + colDocente, yDet, colProm, filaAlt, 'FD');
          doc.rect(margin + colCurso + colDocente + colProm, yDet, colExp, filaAlt, 'FD');
          let yyCurso = yDet + 4;
          lineasCurso.forEach((l) => { doc.text(l, margin + 2, yyCurso); yyCurso += 4; });
          let yyDocente = yDet + 4;
          lineasDocente.forEach((l) => { doc.text(l, margin + colCurso + 2, yyDocente); yyDocente += 4; });
          doc.text(String(row.promedio || '-'), margin + colCurso + colDocente + colProm / 2, yDet + filaAlt / 2 + 1.5, { align: 'center' });
          let yy = yDet + 4;
          lineasExp.forEach((l) => { doc.text(l, margin + colCurso + colDocente + colProm + 2, yy); yy += 4; });
          yDet += filaAlt;
        });
      }

      // Segunda hoja(s): lista de verificación orden de mérito por bimestre (solo libretas numéricas)
      const ordenMeritoDetalle = datosLibreta.resumen?.orden_merito_detalle;
      if (ordenMeritoDetalle && cicloSel >= 1) {
        const bimestresLabel = ['I', 'II', 'III', 'IV'];
        const colPuesto = 18;
        const colPromedio = 28;
        const colNombres = pageWidth - margin * 2 - colPuesto - colPromedio;
        for (let b = 1; b <= cicloSel; b++) {
          doc.addPage();
          let yP = margin + 12;
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(11);
          doc.text(`Reporte de Orden de Mérito — Bimestre ${bimestresLabel[b - 1]}`, margin, yP);
          yP += 4;
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
          doc.text(`${datosLibreta.alumno.grado}° ${datosLibreta.alumno.seccion || ''} — ${datosLibreta.alumno.nivel_nombre || ''} — ${datosLibreta.alumno.anio || ''}`, margin, yP);
          yP += 8;
          const list = ordenMeritoDetalle[`b${b}`] || [];
          doc.setFillColor(...colorLabel);
          doc.rect(margin, yP, colPuesto, 6, 'FD');
          doc.rect(margin + colPuesto, yP, colNombres, 6, 'FD');
          doc.rect(margin + colPuesto + colNombres, yP, colPromedio, 6, 'FD');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8);
          doc.text('Puesto', margin + colPuesto / 2, yP + 4, { align: 'center' });
          doc.text('Apellidos y Nombres', margin + colPuesto + colNombres / 2, yP + 4, { align: 'center' });
          doc.text('Promedio', margin + colPuesto + colNombres + colPromedio / 2, yP + 4, { align: 'center' });
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
            doc.text(typeof row.promedio === 'number' ? row.promedio.toFixed(2) : String(row.promedio), margin + colPuesto + colNombres + colPromedio / 2, yP + 3.5, { align: 'center' });
            yP += 5;
          });
        }
      }
      } // fin else layout cuantitativo

      const nombreArchivo = `Libreta_${datosLibreta.alumno.apellido_paterno?.replace(/\s+/g, '_') || 'libreta'}_${new Date().getTime()}.pdf`;
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

  // Cargar imagen desde URL y devolver data URL (para PDF)
  const loadImageAsDataUrl = (url) => {
    if (!url || typeof url !== 'string') return Promise.resolve(null);
    return fetch(url, { mode: 'cors' })
      .then((r) => r.blob())
      .then((blob) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      }))
      .catch(() => null);
  };

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
      // Carnet horizontal 9x6 cm = 90x60 mm (landscape)
      const width = 90;
      const height = 60;
      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: [width, height]
      });

      // Colores: azul fondo (degradado), borde verde, logo sin fondo (logoboleta.png)
      const blueBg = [41, 65, 114];        // #294172 azul actual (referencia)
      const blueDark = [28, 48, 95];       // azul más oscuro (parte superior del degradado)
      const blueLight = [52, 82, 138];     // azul un poco más claro (parte inferior) para que se note el degradado
      const greenBorder = [34, 197, 94];   // #22c55e borde verde
      const white = [255, 255, 255];
      const orangeAccent = [251, 191, 36]; // #fbbf24 grado/sección
      const cardRadius = 3; // mm - esquinas redondeadas del carnet

      // Fondo con degradado (azul más oscuro → azul actual, más énfasis en el azul)
      const scale = 4;
      const gradCanvas = document.createElement('canvas');
      gradCanvas.width = width * scale;
      gradCanvas.height = height * scale;
      const gctx = gradCanvas.getContext('2d');
      const r = cardRadius * scale;
      gctx.beginPath();
      if (gctx.roundRect) {
        gctx.roundRect(0, 0, gradCanvas.width, gradCanvas.height, r);
      } else {
        gctx.rect(0, 0, gradCanvas.width, gradCanvas.height);
      }
      gctx.closePath();
      gctx.clip();
      const gradient = gctx.createLinearGradient(0, 0, 0, gradCanvas.height);
      gradient.addColorStop(0, `rgb(${blueDark[0]}, ${blueDark[1]}, ${blueDark[2]})`);
      gradient.addColorStop(0.5, `rgb(${blueBg[0]}, ${blueBg[1]}, ${blueBg[2]})`);
      gradient.addColorStop(1, `rgb(${blueLight[0]}, ${blueLight[1]}, ${blueLight[2]})`);
      gctx.fillStyle = gradient;
      gctx.fillRect(0, 0, gradCanvas.width, gradCanvas.height);
      // Ondas verdes suaves sobre el fondo (como referencia del carnet)
      const W = gradCanvas.width;
      const H = gradCanvas.height;
      gctx.globalAlpha = 0.07;
      // Onda 1: curva desde la derecha hacia el centro (sutil para que se vea más el azul)
      gctx.beginPath();
      gctx.moveTo(W + 20, H * 0.3);
      gctx.bezierCurveTo(W * 0.85, H * 0.2, W * 0.6, H * 0.5, W * 0.35, H * 0.4);
      gctx.bezierCurveTo(W * 0.15, H * 0.32, -20, H * 0.5, -20, H * 0.6);
      gctx.lineTo(-20, H + 20);
      gctx.lineTo(W + 20, H + 20);
      gctx.closePath();
      gctx.fillStyle = 'rgb(34, 197, 94)';
      gctx.fill();
      // Onda 2: más abajo, tono verde más oscuro
      gctx.globalAlpha = 0.05;
      gctx.beginPath();
      gctx.moveTo(W + 30, H * 0.75);
      gctx.bezierCurveTo(W * 0.7, H * 0.7, W * 0.4, H * 0.85, W * 0.2, H * 0.75);
      gctx.bezierCurveTo(0, H * 0.65, -20, H * 0.8, -20, H + 20);
      gctx.lineTo(W + 30, H + 20);
      gctx.closePath();
      gctx.fillStyle = 'rgb(22, 163, 74)';
      gctx.fill();
      // Onda 3: muy sutil arriba
      gctx.globalAlpha = 0.04;
      gctx.beginPath();
      gctx.moveTo(W * 0.9, 0);
      gctx.bezierCurveTo(W * 0.6, -H * 0.1, W * 0.3, H * 0.25, 0, H * 0.15);
      gctx.lineTo(-20, H + 20);
      gctx.lineTo(W + 20, H + 20);
      gctx.lineTo(W + 20, -20);
      gctx.closePath();
      gctx.fillStyle = 'rgb(74, 222, 128)';
      gctx.fill();
      gctx.globalAlpha = 1;
      try {
        doc.addImage(gradCanvas.toDataURL('image/png'), 'PNG', 0, 0, width, height);
      } catch (e) {
        doc.setFillColor(...blueBg);
        doc.roundedRect(0, 0, width, height, cardRadius, cardRadius, 'F');
      }
      // Borde verde a todo el cuadro del carnet
      doc.setDrawColor(...greenBorder);
      doc.setLineWidth(0.8);
      doc.roundedRect(0, 0, width, height, cardRadius, cardRadius);

      // Logo: logoboleta.png del frontend (sin fondo) para el carnet
      const logoSize = 10;
      const logoX = 3;
      const logoY = 2;
      const logoUrlLocal = typeof window !== 'undefined' ? `${window.location.origin}/icons/logoboleta.png` : '';
      let logoData = logoUrlLocal ? await loadImageAsDataUrl(logoUrlLocal) : null;
      if (!logoData) logoData = qrData.logo_base64 || null;
      if (!logoData && qrData.logo_url) logoData = await loadImageAsDataUrl(qrData.logo_url);
      if (logoData) {
        try {
          const logoFormat = logoData.indexOf('image/png') !== -1 ? 'PNG' : 'JPEG';
          doc.addImage(logoData, logoFormat, logoX, logoY, logoSize, logoSize);
        } catch (e) { /* ignorar */ }
      }

      // Nombre del colegio: COLEGIO y VANGUARD SCHOOLS mismo formato y tamaño (izq) — Intranet Escolar (derecha)
      const colegioNombre = (qrData.colegio_nombre || 'Vanguard Schools').trim();
      const partes = colegioNombre.toUpperCase().split(/\s+/);
      const titulo = partes[0] || 'COLEGIO';
      const subtitulo = partes.slice(1).join(' ') || 'VANGUARD SCHOOLS';
      doc.setTextColor(...white);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text(titulo, logoX + logoSize + 4, logoY + 4);
      doc.text(subtitulo, logoX + logoSize + 4, logoY + 9.5); // 2mm padding entre COLEGIO y VANGUARD SCHOOLS
      doc.setFontSize(8);
      doc.setTextColor(...orangeAccent);
      doc.text('Intranet Escolar', width - 4, logoY + 5.5, { align: 'right' });
      doc.setTextColor(...white);

      // Zona central: foto (izq, más ancha y redondeada, sin borde), datos (más separados), QR (derecha)
      const bodyY = 16;
      const photoW = 29;   // foto más ancha
      const photoH = 28;
      const photoX = 3;
      const photoRadius = 6;  // redondeado moderado (no tan circular)
      const centerX = 35;  // más espacio entre foto y datos del alumno
      const centerW = 50;
      const qrBoxSize = 24;   // recuadro blanco
      const qrY = 30;         // QR abajo a la derecha (con su texto debajo)
      const qrX = width - qrBoxSize - 5;

      // Foto del alumno: recortada dentro del contenedor, pegada al borde (sin padding)
      const photoInset = 0;
      const photoInnerW = photoW - photoInset * 2;
      const photoInnerH = photoH - photoInset * 2;
      let photoData = qrData.foto_base64 || null;
      if (!photoData && qrData.foto_url) photoData = await loadImageAsDataUrl(qrData.foto_url);
      if (photoData) {
        try {
          doc.setFillColor(...blueBg);
          doc.roundedRect(photoX, bodyY, photoW, photoH, photoRadius, photoRadius, 'F');
          const photoClipped = await new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
              const scale = 6;
              const c = document.createElement('canvas');
              c.width = photoInnerW * scale;
              c.height = photoInnerH * scale;
              const ctx = c.getContext('2d');
              ctx.imageSmoothingEnabled = true;
              ctx.imageSmoothingQuality = 'high';
              const r = Math.max(1, photoRadius * scale);
              ctx.beginPath();
              if (ctx.roundRect) ctx.roundRect(0, 0, c.width, c.height, r);
              else ctx.rect(0, 0, c.width, c.height);
              ctx.closePath();
              ctx.clip();
              const boxAspect = c.width / c.height;
              const imgAspect = img.width / img.height;
              let sx = 0, sy = 0, sw = img.width, sh = img.height;
              if (imgAspect > boxAspect) {
                sw = img.height * boxAspect;
                sx = (img.width - sw) / 2;
              } else {
                sh = img.width / boxAspect;
                sy = (img.height - sh) / 2;
              }
              ctx.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
              resolve(c.toDataURL('image/png'));
            };
            img.onerror = () => resolve(null);
            img.src = photoData;
          });
          if (photoClipped) {
            doc.addImage(photoClipped, 'PNG', photoX + photoInset, bodyY + photoInset, photoInnerW, photoInnerH);
          } else {
            doc.addImage(photoData, photoData.indexOf('image/png') !== -1 ? 'PNG' : 'JPEG', photoX + photoInset, bodyY + photoInset, photoInnerW, photoInnerH);
          }
        } catch (e) {
          doc.setFillColor(60, 70, 90);
          doc.roundedRect(photoX, bodyY, photoW, photoH, photoRadius, photoRadius, 'F');
        }
      } else {
        doc.setFillColor(60, 70, 90);
        doc.roundedRect(photoX, bodyY, photoW, photoH, photoRadius, photoRadius, 'F');
      }
      // Borde naranja suave a la foto (igual que el contenedor del QR)
      doc.setDrawColor(...orangeAccent);
      doc.setLineWidth(0.35);
      doc.roundedRect(photoX, bodyY, photoW, photoH, photoRadius, photoRadius, 'S');

      // Debajo de la foto: 4mm padding; Apoderado, Cel. Apoderado, Dirección (labels amarillo; datos con más espacio, se ve todo)
      const paddingFotoApoderado = 4;   // 4mm entre foto y datos del apoderado
      const filaY0 = bodyY + photoH + paddingFotoApoderado;
      const labelW = 20;
      const valorX = photoX + labelW;
      const valorMaxW = qrX - valorX - 2;   // ancho hasta antes del QR para que se vea todo
      const filaH = 3.5;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(5.5);
      doc.setTextColor(...orangeAccent);
      doc.text('Apoderado', photoX, filaY0 + 1.2);
      doc.setFontSize(5.5);
      doc.setTextColor(...white);
      const apoderadoNombre = (qrData.apoderado_nombre || '-').trim();
      const lineasNombre = doc.splitTextToSize(apoderadoNombre, valorMaxW);
      lineasNombre.slice(0, 2).forEach((line, i) => doc.text(line, valorX, filaY0 + 1.2 + i * 2.2));
      doc.setFontSize(5.5);
      doc.setTextColor(...orangeAccent);
      doc.text('Cel. Apoderado', photoX, filaY0 + filaH + 1.2);
      doc.setTextColor(...white);
      const cel = (qrData.apoderado_celular || '-').trim();
      const lineasCel = doc.splitTextToSize(cel, valorMaxW);
      lineasCel.slice(0, 2).forEach((line, i) => doc.text(line, valorX, filaY0 + filaH + 1.2 + i * 2.2));
      doc.setTextColor(...orangeAccent);
      doc.text('Dirección', photoX, filaY0 + filaH * 2 + 1.2);
      doc.setTextColor(...white);
      const dir = (qrData.direccion || '-').trim();
      const lineasDir = doc.splitTextToSize(dir, valorMaxW);
      lineasDir.slice(0, 2).forEach((line, i) => doc.text(line, valorX, filaY0 + filaH * 2 + 1.2 + i * 2.2));

      // Nombre en una línea, apellidos debajo (blanco, bold)
      const nombres = (qrData.nombres || '').trim();
      const apellidos = `${(qrData.apellido_paterno || '')} ${(qrData.apellido_materno || '')}`.trim();
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(...white);
      let textY = bodyY + 6;
      if (nombres) {
        const nombresLines = doc.splitTextToSize(nombres, centerW - 2);
        doc.text(nombresLines[0], centerX, textY);
        textY += 5;
      }
      if (apellidos) {
        const apellidosLines = doc.splitTextToSize(apellidos, centerW - 2);
        doc.text(apellidosLines[0], centerX, textY);
        textY += 5;
      }

      // Grado / Sección (naranja/amarillo)
      if (qrData.grupo) {
        doc.setFontSize(8);
        doc.setTextColor(...orangeAccent);
        doc.setFont('helvetica', 'bold');
        const grupoLines = doc.splitTextToSize(qrData.grupo, centerW - 2);
        grupoLines.slice(0, 2).forEach((line) => {
          doc.text(line, centerX, textY);
          textY += 4.5;
        });
      }

      // DNI
      const dni = qrData.nro_documento || '';
      if (dni) {
        textY += 2;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(...white);
        doc.text(`DNI: ${dni}`, centerX, textY);
      }

      // QR Code: recuadro blanco con borde naranja suave; imagen QR completa y centrada (sin recorte)
      const qrPadding = 0.6;
      const qrElement = document.querySelector('#qr-card-modal-print .qr-code-wrapper svg');
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(qrX, qrY, qrBoxSize, qrBoxSize, 1, 1, 'F');
      doc.setDrawColor(...orangeAccent);
      doc.setLineWidth(0.35);
      doc.roundedRect(qrX, qrY, qrBoxSize, qrBoxSize, 1, 1, 'S');
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
              canvas.width = 1024;
              canvas.height = 1024;
              if (!ctx) {
                reject(new Error('No se pudo crear contexto canvas para QR'));
                return;
              }
              ctx.imageSmoothingEnabled = false;
              ctx.fillStyle = '#ffffff';
              ctx.fillRect(0, 0, canvas.width, canvas.height);
              const scaleFit = Math.min(canvas.width / img.width, canvas.height / img.height);
              const drawW = img.width * scaleFit;
              const drawH = img.height * scaleFit;
              const drawX = (canvas.width - drawW) / 2;
              const drawY = (canvas.height - drawH) / 2;
              ctx.drawImage(img, drawX, drawY, drawW, drawH);
              const imgData = canvas.toDataURL('image/png');
              const qrDrawSize = qrBoxSize - qrPadding * 2;
              doc.addImage(imgData, 'PNG', qrX + qrPadding, qrY + qrPadding, qrDrawSize, qrDrawSize);
              URL.revokeObjectURL(url);
              resolve();
            };
            img.onerror = (e) => {
              URL.revokeObjectURL(url);
              reject(e);
            };
            img.src = url;
          });
        } catch (err) {
          doc.setFillColor(240, 240, 240);
          doc.roundedRect(qrX, qrY, qrBoxSize, qrBoxSize, 1, 1, 'F');
        }
      }

      // Texto bajo el QR (un poco más arriba)
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(5);
      doc.setTextColor(...white);
      const instruccion = 'Acerca el código QR a la cámara para registrar tu asistencia';
      doc.text(instruccion, qrX + qrBoxSize / 2, qrY + qrBoxSize + 2, { align: 'center', maxWidth: qrBoxSize + 4 });

      const nombreArchivo = `Carnet_${(qrData.nombre_completo || 'Alumno').replace(/\s+/g, '_')}_${new Date().getTime()}.pdf`;
      doc.save(nombreArchivo);

      Swal.fire({
        title: '¡PDF Generado!',
        text: 'El carnet se ha exportado correctamente (9×6 cm).',
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

  const renderMensajeDocenteModal = () => {
    if (!mostrarModalMensaje || !docenteParaMensaje || !hijoSeleccionado) return null;
    const esTutor = !!docenteParaMensaje.esTutor;
    return createPortal(
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
            <h2 id="modal-mensaje-docente-title">
              {esTutor ? '✉️ Mensaje al tutor del aula' : '✉️ Enviar Mensaje al Docente'}
            </h2>
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
              <p>
                <strong>{esTutor ? 'Tutor' : 'Docente'}:</strong> {docenteParaMensaje.nombre}
              </p>
              <p>
                <strong>{esTutor ? 'Ámbito' : 'Curso'}:</strong> {docenteParaMensaje.curso_nombre}
              </p>
              <p className="mensaje-info-text">
                {esTutor
                  ? 'El mensaje se enviará al tutor asignado a esta aula (referencia a tu hijo/a incluida en el envío).'
                  : 'El mensaje se enviará directamente al docente'}
              </p>
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
                      [{ header: [1, 2, 3, false] }],
                      ['bold', 'italic', 'underline', 'strike'],
                      [{ list: 'ordered' }, { list: 'bullet' }],
                      [{ color: [] }, { background: [] }],
                      [{ align: [] }],
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
                        <span className="archivo-tamaño">{(archivo.size / 1024).toFixed(2)} KB</span>
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
    );
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

          {renderMensajeDocenteModal()}
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
                      className={`hijo-card ${openDropdown?.hijoId === hijo.id ? 'hijo-card-dropdown-abierto' : ''}`}
                      style={{
                        background: colorCard.bg,
                        borderColor: colorCard.border
                      }}
                    >
                      <div className="hijo-card-header">
                        <h3 className="hijo-nombre-alumno">{nombreCompleto}</h3>
                      </div>
                      <div className="hijo-card-main">
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
                        <div className="hijo-details-column">
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
                            <p className="hijo-tutor">
                              <span className="label">Tutor:</span>
                              <span className="value hijo-tutor-line">
                                {hijo.tutor_usuario_id ? (
                                  <button
                                    type="button"
                                    className="hijo-tutor-nombre-link"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleMensajeAlTutor(hijo);
                                    }}
                                    title="Enviar mensaje al tutor"
                                    aria-label={`Enviar mensaje al tutor: ${(hijo.tutor_nombre_completo || '').trim() || 'tutor'}`}
                                  >
                                    {(hijo.tutor_nombre_completo || '').trim() || 'Tutor'}
                                  </button>
                                ) : (
                                  <span className="hijo-tutor-texto-plano">
                                    {(hijo.tutor_nombre_completo || '').trim() || 'Sin tutor asignado'}
                                  </span>
                                )}
                              </span>
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="hijo-actions">
                        <div className="dropdown-container">
                          <button 
                            ref={(el) => { if (openDropdown?.hijoId === hijo.id && el) dropdownButtonRef.current = el; }}
                            className="btn-opciones-hijo"
                            onClick={(e) => handleOpcionesClick(e, hijo.id)}
                            title="Opciones"
                          >
                            Opciones {openDropdown?.hijoId === hijo.id ? '▲' : '▼'}
                          </button>
                          {/* El dropdown se renderiza en portal para evitar corte por overflow */}
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
              {aniosHistoricoDisponibles.length > 0 ? (
                <>
                  <p>
                    No se encontraron hijos en el año activo. Puedes consultar tu historial
                    (solo años habilitados para consulta).
                  </p>
                  <label style={{ display: 'block', textAlign: 'left', marginBottom: '0.25rem', fontWeight: 600 }}>
                    Año histórico:
                  </label>
                  <select
                    value={anioHistoricoSeleccionado || ''}
                    onChange={(e) => seleccionarAnioHistorico(e.target.value)}
                    style={{
                      width: '100%',
                      maxWidth: '420px',
                      padding: '0.6rem 0.75rem',
                      border: '1px solid #e5e7eb',
                      borderRadius: 8,
                      background: 'white'
                    }}
                  >
                    {aniosHistoricoDisponibles.map((anio) => (
                      <option key={anio} value={anio}>
                        {anio}
                      </option>
                    ))}
                  </select>
                </>
              ) : (
                <p>No se encontraron hijos registrados.</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Dropdown Opciones en portal (evita corte por overflow de la sección derecha) */}
      {openDropdown?.rect && (() => {
        const hijo = hijos.find(h => h.id === openDropdown.hijoId);
        if (!hijo) return null;
        const rect = openDropdown.rect;
        const maxDropHeight = window.innerHeight - 100;
        const spaceBelow = window.innerHeight - rect.bottom - 20;
        const openAbove = window.innerWidth <= 768 && spaceBelow < Math.min(400, maxDropHeight * 0.6);
        const top = openAbove ? Math.max(20, rect.top - maxDropHeight - 4) : rect.bottom + 4;
        return createPortal(
          <div
            ref={dropdownRef}
            className="dropdown-menu dropdown-menu-hijo dropdown-menu-hijo-portal"
            style={{
              position: 'fixed',
              top,
              left: window.innerWidth <= 768 ? 16 : rect.left,
              right: window.innerWidth <= 768 ? 16 : undefined,
              zIndex: 10001
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button className="dropdown-item" type="button" onClick={(e) => { e.stopPropagation(); handleOpcionClick('editar-datos', hijo); }}>
              <span className="dropdown-icon">✏️</span><span>Editar Datos</span>
            </button>
            <button className="dropdown-item" type="button" onClick={(e) => { e.stopPropagation(); handleOpcionClick('cursos-asignados', hijo); }}>
              <span className="dropdown-icon">📚</span><span>Cursos Asignados</span>
            </button>
            <button className="dropdown-item" type="button" onClick={(e) => { e.stopPropagation(); handleOpcionClick('horario', hijo); }}>
              <span className="dropdown-icon">📅</span><span>Horario</span>
            </button>
            <button className="dropdown-item" type="button" onClick={(e) => { e.stopPropagation(); handleOpcionClick('incidencias', hijo); }}>
              <span className="dropdown-icon">⚠️</span><span>Incidencias</span>
            </button>
            <button className="dropdown-item" type="button" onClick={(e) => { e.stopPropagation(); handleOpcionClick('estrellas', hijo); }}>
              <span className="dropdown-icon">⭐</span><span>Estrellas</span>
            </button>
            <button className="dropdown-item" type="button" onClick={(e) => { e.stopPropagation(); handleOpcionClick('asistencias', hijo); }}>
              <span className="dropdown-icon">✅</span><span>Asistencias</span>
            </button>
            <button className="dropdown-item" type="button" onClick={(e) => { e.stopPropagation(); handleOpcionClick('imprimir-qr', hijo); }}>
              <span className="dropdown-icon">🖨️</span><span>Imprimir QR</span>
            </button>
            <button className={`dropdown-item ${tieneDeudasBloqueadas ? 'disabled' : ''}`} type="button" disabled={tieneDeudasBloqueadas}
              onClick={(e) => { e.stopPropagation(); if (tieneDeudasBloqueadas) { Swal.fire({ icon: 'info', title: 'Problemas con el servidor', text: 'Se está solucionando.', confirmButtonText: 'Entendido' }); return; } handleOpcionClick('notas-detalladas', hijo); }}
              title={tieneDeudasBloqueadas ? 'Temporalmente no disponible' : ''}>
              <span className="dropdown-icon">📊</span><span>Notas Detalladas</span>{tieneDeudasBloqueadas && <span className="bloqueado-badge">🔒</span>}
            </button>
            <button className={`dropdown-item ${tieneDeudasBloqueadas ? 'disabled' : ''}`} type="button" disabled={tieneDeudasBloqueadas}
              onClick={(e) => { e.stopPropagation(); if (tieneDeudasBloqueadas) { Swal.fire({ icon: 'info', title: 'Problemas con el servidor', text: 'Se está solucionando.', confirmButtonText: 'Entendido' }); return; } handleOpcionClick('imprimir-notas', hijo); }}
              title={tieneDeudasBloqueadas ? 'Temporalmente no disponible' : ''}>
              <span className="dropdown-icon">📄</span><span>Ver Libreta</span>{tieneDeudasBloqueadas && <span className="bloqueado-badge">🔒</span>}
            </button>
            <button className="dropdown-item" type="button" onClick={(e) => { e.stopPropagation(); handleOpcionClick('pagos-realizados', hijo); }}>
              <span className="dropdown-icon">💳</span><span>Pagos Realizados</span>
            </button>
            <button className="dropdown-item" type="button" onClick={(e) => { e.stopPropagation(); handleOpcionClick('reiniciar-contrasena', hijo); }}>
              <span className="dropdown-icon">🔑</span><span>Reiniciar Contraseña</span>
            </button>
            <button className="dropdown-item" type="button" onClick={(e) => { e.stopPropagation(); handleOpcionClick('psicologia', hijo); }}>
              <span className="dropdown-icon">🧠</span><span>Psicología</span>
            </button>
          </div>,
          document.body
        );
      })()}

      {renderMensajeDocenteModal()}

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

                  <div className="qr-card-container-modal qr-preview-simple">
                    <div className="qr-card-modal qr-card-solo-qr" id="qr-card-modal-print">
                      <div className="qr-code-wrapper">
                        <QRCodeSVG
                          value={qrData.qr_data || qrData.nro_documento || 'ALUMNO'}
                          size={260}
                          level="H"
                          includeMargin={false}
                        />
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
                        gridTemplateColumns: 'repeat(2, minmax(220px, 1fr))',
                        gap: '12px 18px',
                        alignItems: 'center'
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
                        <div style={{ textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={() => window.open('https://sfe.bizlinks.com.pe/sfeperu/public/loginAnonimo.jsf', '_blank', 'noopener,noreferrer')}
                            style={{
                              backgroundColor: '#1d4ed8',
                              color: '#fff',
                              border: 'none',
                              borderRadius: '6px',
                              fontSize: '12px',
                              fontWeight: 'bold',
                              padding: '7px 12px',
                              cursor: 'pointer'
                            }}
                          >
                            Boleta Electrónica
                          </button>
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
                                  {esCancelado && (
                                    <div style={{ marginBottom: '8px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px' }}>
                                      <div>
                                        <span style={{ fontSize: '12px', color: colorCard.text, fontWeight: 'bold' }}>Fecha Vencimiento: </span>
                                        <span style={{ fontSize: '12px', color: colorCard.text }}>
                                          {pago.fecha_vencimiento_formateada || '—'}
                                        </span>
                                      </div>
                                      <div>
                                        <span style={{ fontSize: '12px', color: colorCard.text, fontWeight: 'bold' }}>Fecha Emisión: </span>
                                        <span style={{ fontSize: '12px', color: colorCard.text }}>
                                          {pago.boleta?.fecha_impresion ? formatearFechaPago(pago.boleta.fecha_impresion) : '—'}
                                        </span>
                                      </div>
                                      <div>
                                        <span style={{ fontSize: '12px', color: colorCard.text, fontWeight: 'bold' }}>Serie/Número: </span>
                                        <span style={{ fontSize: '12px', color: colorCard.text }}>
                                          {pago.boleta?.serie_numero || '—'}
                                        </span>
                                      </div>
                                      <div>
                                        <span style={{ fontSize: '12px', color: colorCard.text, fontWeight: 'bold' }}>Fecha Cancelado: </span>
                                        <span style={{ fontSize: '12px', color: colorCard.text }}>
                                          {pago.fecha_cancelado ? formatearFechaPago(pago.fecha_cancelado) : '—'}
                                        </span>
                                      </div>
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

