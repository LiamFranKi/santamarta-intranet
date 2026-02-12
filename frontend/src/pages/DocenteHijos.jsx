import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import DashboardLayout from '../components/DashboardLayout';
import api from '../services/api';
import { QRCodeSVG } from 'qrcode.react';
import { jsPDF } from 'jspdf';
import Swal from 'sweetalert2';
import './DocenteHijos.css';

// Función para obtener iniciales del nombre
function getInitials(nombre) {
  if (!nombre) return 'A';
  const parts = String(nombre).trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase()).join('') || 'A';
}

function DocenteHijos() {
  const [loading, setLoading] = useState(true);
  const [hijos, setHijos] = useState([]);
  const [esApoderado, setEsApoderado] = useState(false);
  const [openDropdown, setOpenDropdown] = useState(null);
  const dropdownRef = useRef(null);
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
        console.log('Cursos asignados de:', hijo);
        // Implementar después
        break;
      case 'incidencias':
        console.log('Incidencias de:', hijo);
        // Implementar después
        break;
      case 'estrellas':
        console.log('Estrellas de:', hijo);
        // Implementar después
        break;
      case 'asistencias':
        console.log('Asistencias de:', hijo);
        // Implementar después
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
    </DashboardLayout>
  );
}

export default DocenteHijos;

