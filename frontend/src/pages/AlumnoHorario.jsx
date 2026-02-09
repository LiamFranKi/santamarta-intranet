import React, { useState, useEffect, useMemo } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import api from '../services/api';
import { jsPDF } from 'jspdf';
import Swal from 'sweetalert2';
import './AlumnoHorario.css';

function AlumnoHorario() {
  console.log('📅 [ALUMNO HORARIO] Componente montado');
  const [loading, setLoading] = useState(true);
  const [horarioRaw, setHorarioRaw] = useState([]);

  useEffect(() => {
    console.log('📅 [ALUMNO HORARIO] useEffect ejecutado, cargando horario...');
    cargarHorario();
  }, []);

  const cargarHorario = async () => {
    try {
      setLoading(true);
      const response = await api.get('/alumno/horario');
      const horariosRecibidos = response.data.horario || [];
      console.log('📅 Horarios recibidos del backend:', horariosRecibidos.length, horariosRecibidos);
      setHorarioRaw(horariosRecibidos);
    } catch (error) {
      console.error('Error cargando horario:', error);
    } finally {
      setLoading(false);
    }
  };

  const diasSemana = [
    { id: 1, nombre: 'Lunes', abrev: 'LUNES' },
    { id: 2, nombre: 'Martes', abrev: 'MARTES' },
    { id: 3, nombre: 'Miércoles', abrev: 'MIÉRCOLES' },
    { id: 4, nombre: 'Jueves', abrev: 'JUEVES' },
    { id: 5, nombre: 'Viernes', abrev: 'VIERNES' }
  ];

  // Normalizar días por si en la BD se guardó 0-4 (Lunes-Viernes) en vez de 1-5
  const horario = useMemo(() => {
    if (!horarioRaw || horarioRaw.length === 0) return [];

    const dias = horarioRaw
      .map((c) => typeof c.dia === 'number' ? c.dia : null)
      .filter((d) => d !== null);

    if (dias.length === 0) return horarioRaw;

    const minDia = Math.min(...dias);
    const maxDia = Math.max(...dias);

    const usaCeroCuatroComoLunesViernes = minDia === 0 && maxDia <= 4;

    const normalizado = horarioRaw.map((c) => ({
      ...c,
      diaNormalizado: usaCeroCuatroComoLunesViernes
        ? (typeof c.dia === 'number' ? c.dia + 1 : c.dia)
        : c.dia
    }));

    console.log('📅 Días originales en horario:', { minDia, maxDia, dias });
    console.log('📅 Usando esquema de días 0-4 como Lunes-Viernes:', usaCeroCuatroComoLunesViernes);
    return normalizado;
  }, [horarioRaw]);

  // Función para convertir hora a formato HH:MM AM/PM
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

  // Convertir hora HH:MM:SS o HH:MM AM/PM a minutos para ordenar
  const horaAMinutos = (hora) => {
    if (!hora) return 0;
    
    // Si la hora viene en formato AM/PM, convertirla primero
    const horaUpper = hora.toUpperCase().trim();
    let hora24h = hora;
    
    if (horaUpper.includes('AM') || horaUpper.includes('PM')) {
      // Formato AM/PM: "1:00 PM" o "7:00 AM"
      const partes = hora.split(':');
      if (partes.length < 2) return 0;
      
      let h = parseInt(partes[0], 10);
      const minutosStr = partes[1].replace(/[^0-9]/g, ''); // Remover AM/PM y espacios
      const m = parseInt(minutosStr || 0, 10);
      
      if (horaUpper.includes('PM') && h !== 12) {
        h += 12; // Convertir PM a 24h (excepto 12 PM)
      } else if (horaUpper.includes('AM') && h === 12) {
        h = 0; // 12 AM = 00:00
      }
      
      return h * 60 + m;
    } else {
      // Formato 24h: "13:00" o "07:00"
      const partes = hora.split(':');
      if (partes.length < 2) return 0;
      
      const h = parseInt(partes[0], 10);
      const m = parseInt(partes[1] ? partes[1].split(' ')[0] : 0, 10);
      
      if (isNaN(h) || isNaN(m)) return 0;
      
      return h * 60 + m;
    }
  };

  // Obtener todos los bloques de horarios únicos ordenados
  const horariosUnicos = useMemo(() => {
    if (!horario || horario.length === 0) return [];
    
    const bloques = horario.map(c => ({
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
    
    const resultado = Object.values(unicos).sort((a, b) => horaAMinutos(a.inicio) - horaAMinutos(b.inicio));
    console.log('📅 Bloques de horario únicos:', resultado);
    return resultado;
  }, [horario]);

  // Función para obtener clase en un día y bloque de horario específico
  const obtenerClase = (dia, horaInicio, horaFin) => {
    if (!horario || horario.length === 0) return null;
    const clase = horario.find(c => {
      if (c.diaNormalizado !== dia) return false;
      
      const inicioClase = c.inicio || c.hora_inicio || '';
      const finClase = c.fin || c.hora_final || '';
      
      return inicioClase === horaInicio && finClase === horaFin;
    });
    
    return clase;
  };

  // Función para formatear el texto de la clase
  const formatearClase = (clase) => {
    if (!clase) return null;
    const titulo = clase.titulo || '';
    const docente = clase.docente_nombre || '';
    
    if (!titulo) return null;
    if (!docente) return titulo;
    
    return `${titulo} - ${docente}`;
  };

  // Paleta amplia de colores pastel para asignar a los cursos
  const colorPalette = [
    '#FFF9C4', // amarillo suave
    '#BBDEFB', // azul claro
    '#F3E5F5', // lila claro
    '#C8E6C9', // verde claro
    '#E0F7FA', // celeste
    '#FFF3E0', // naranja claro
    '#FCE4EC', // rosado claro
    '#E1F5FE', // azul cielo
    '#F1F8E9', // verde lima
    '#FFEBEE', // rojo muy claro
    '#E8EAF6', // índigo claro
    '#E0F2F1', // teal claro
    '#E1BEE7', // morado claro
    '#FFE0B2', // naranja más intenso
    '#FFCCBC', // naranja melocotón
    '#D1C4E9', // morado lavanda
    '#F8BBD0', // rosado más intenso
    '#B2DFDB', // teal más intenso
    '#C5E1A5', // verde manzana
    '#FFE082', // amarillo más intenso
    '#BCAAA4', // marrón claro
    '#90CAF9', // azul más intenso
    '#A5D6A7', // verde más intenso
    '#CE93D8', // morado más intenso
    '#FFAB91', // naranja coral
    '#80CBC4', // turquesa
    '#FFCC80', // naranja dorado
    '#B39DDB', // morado medio
    '#81C784', // verde esmeralda
    '#64B5F6', // azul cielo más intenso
  ];

  // Función hash determinística para asignar colores de forma consistente
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

  // Generar un color pastel consistente y único por nombre de curso
  const getColorForCourse = (titulo) => {
    if (!titulo || !titulo.trim()) return null;
    
    const tituloNormalizado = titulo.trim();
    const hash = hashString(tituloNormalizado);
    const index = hash % colorPalette.length;
    
    return colorPalette[index];
  };

  // Aclarar un color mezclándolo con blanco
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

  // Procesar horario para crear lista detallada de cursos
  const detalleHorario = useMemo(() => {
    if (!horario || horario.length === 0) return [];

    const cursosMap = {};

    horario.forEach((clase) => {
      if (!clase.titulo) return;

      const titulo = clase.titulo.trim();
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

      const horarioKey = `${diaNormalizado}-${inicio}-${fin}`;
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
  }, [horario, diasSemana]);

  // Función para exportar horario a PDF
  const handleExportarPDF = () => {
    if (!horario || horario.length === 0) {
      Swal.fire({
        title: 'Sin datos',
        text: 'No hay horario para exportar',
        icon: 'info'
      });
      return;
    }

    try {
      const doc = new jsPDF('l', 'mm', 'a4'); // Landscape orientation
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 15;
      const contentWidth = pageWidth - (margin * 2);
      let yPosition = margin;

      // Colores
      const colorHeader = [59, 130, 246]; // Azul
      const colorBorder = [30, 64, 175]; // Azul oscuro
      const colorText = [30, 41, 59]; // Gris oscuro
      const colorLight = [219, 234, 254]; // Azul claro

      // ========== HEADER ==========
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
      doc.text('Año Académico Actual', margin + contentWidth / 2, yPosition + 22, { align: 'center' });
      
      yPosition += 30;

      // ========== TABLA DE HORARIO ==========
      // Usar todo el ancho disponible, con márgenes mínimos
      const colWidth = contentWidth / 6; // 1 columna para hora + 5 días
      const rowHeight = 15; // Filas más altas
      const headerHeight = 12; // Encabezado más alto

      // Encabezados de la tabla
      doc.setFillColor(...colorHeader);
      doc.rect(margin, yPosition, colWidth, headerHeight, 'F');
      doc.setDrawColor(...colorBorder);
      doc.setLineWidth(0.3);
      doc.rect(margin, yPosition, colWidth, headerHeight);
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      // Centrar verticalmente: yPosition + headerHeight/2 + 3 (ajuste para centrado)
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
      horariosUnicos.forEach((bloque, idx) => {
        const claseLunes = obtenerClase(1, bloque.inicio, bloque.fin);
        const claseMartes = obtenerClase(2, bloque.inicio, bloque.fin);
        const claseMiercoles = obtenerClase(3, bloque.inicio, bloque.fin);
        const claseJueves = obtenerClase(4, bloque.inicio, bloque.fin);
        const claseViernes = obtenerClase(5, bloque.inicio, bloque.fin);

        const tieneClase = claseLunes || claseMartes || claseMiercoles || claseJueves || claseViernes;
        if (!tieneClase) return;

        // Verificar si necesitamos una nueva página
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
        // Centrar verticalmente: yPosition + rowHeight/2 + 3
        doc.text(horaTexto, margin + colWidth / 2, yPosition + rowHeight / 2 + 3, { align: 'center', maxWidth: colWidth - 4 });

        // Celdas de días
        const clases = [claseLunes, claseMartes, claseMiercoles, claseJueves, claseViernes];
        clases.forEach((clase, diaIdx) => {
          const xPos = margin + colWidth + (diaIdx * colWidth);
          doc.setDrawColor(200, 200, 200);
          doc.setLineWidth(0.3);
          doc.rect(xPos, yPosition, colWidth, rowHeight);
          
          if (clase) {
            const colorCurso = getColorForCourse(clase.titulo || '');
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
              // Calcular posición vertical centrada
              const numLineas = lineas.length;
              const alturaTexto = numLineas * 4; // Aproximadamente 4mm por línea
              const yInicio = yPosition + (rowHeight - alturaTexto) / 2 + 3;
              lineas.forEach((linea, lineIdx) => {
                doc.text(linea, xPos + colWidth / 2, yInicio + (lineIdx * 4), { align: 'center', maxWidth: colWidth - 6 });
              });
            }
          }
        });

        yPosition += rowHeight;
      });

      // ========== DETALLE DE HORARIO ==========
      if (detalleHorario.length > 0) {
        // Verificar si necesitamos una nueva página
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
          // Altura del card basada en contenido
          const cardHeight = 28; // Cards más altos para mejor visualización
          
          // Verificar si necesitamos una nueva página
          if (yPosition + cardHeight > pageHeight - margin - 10) {
            doc.addPage();
            yPosition = margin;
          }

          const colorCurso = getColorForCourse(curso.titulo);
          const rgb = hexToRgb(colorCurso);
          
          // Fondo del curso
          if (rgb) {
            doc.setFillColor(rgb.r, rgb.g, rgb.b);
            doc.roundedRect(margin, yPosition, contentWidth, cardHeight, 3, 3, 'F');
          }
          
          doc.setDrawColor(200, 200, 200);
          doc.setLineWidth(0.3);
          doc.roundedRect(margin, yPosition, contentWidth, cardHeight, 3, 3);
          
          // Calcular posición centrada verticalmente
          const centroVertical = yPosition + cardHeight / 2;
          
          // Nombre del curso - centrado
          doc.setTextColor(...colorText);
          doc.setFontSize(14);
          doc.setFont('helvetica', 'bold');
          const tituloLines = doc.splitTextToSize(curso.titulo, contentWidth - 20);
          const tituloY = centroVertical - 8; // Más espacio desde el centro
          doc.text(tituloLines, margin + contentWidth / 2, tituloY, { align: 'center', maxWidth: contentWidth - 20 });
          
          // Docente - centrado
          if (curso.docente) {
            doc.setFontSize(11);
            doc.setFont('helvetica', 'normal');
            const docenteY = centroVertical - 1; // Cerca del centro
            doc.text(`Docente: ${curso.docente}`, margin + contentWidth / 2, docenteY, { align: 'center', maxWidth: contentWidth - 20 });
          }
          
          // Horarios - centrado
          if (curso.horarios && curso.horarios.length > 0) {
            let horariosTexto = curso.horarios.map(h => 
              `${h.diaNombre}: ${formatearHora(h.inicio)} - ${formatearHora(h.fin)}`
            ).join(' | ');
            
            doc.setFontSize(10);
            const horariosLines = doc.splitTextToSize(horariosTexto, contentWidth - 20);
            const horariosY = centroVertical + 6; // Más abajo del centro
            doc.text(horariosLines, margin + contentWidth / 2, horariosY, { align: 'center', maxWidth: contentWidth - 20 });
          }
          
          yPosition += cardHeight + 4; // Más espacio entre cards
        });
      }

      // ========== PIE DE PÁGINA ==========
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

      // Guardar PDF
      const nombreArchivo = `Mi_Horario_${new Date().getTime()}.pdf`;
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

  // Función auxiliar para convertir hex a RGB
  const hexToRgb = (hex) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="alumno-horario-loading">
          <div className="loading-spinner">Cargando horario...</div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="alumno-horario">
        <div className="page-header">
          <div className="header-content">
            <div>
              <h1>📅 Mi Horario</h1>
              <p>Horario de clases del año académico actual</p>
            </div>
            {horario && horario.length > 0 && (
              <button className="btn-imprimir" onClick={handleExportarPDF}>
                <span className="btn-icon">📄</span>
                <span className="btn-text">Exportar</span>
              </button>
            )}
          </div>
        </div>

        <div className="horario-container">
          {horario && horario.length > 0 ? (
            <div className="horario-table-wrapper">
              <table className="horario-table">
                <thead>
                  <tr>
                    <th className="horario-hora-col">Hora</th>
                    {diasSemana.map((dia) => (
                      <th key={dia.id} className="horario-dia-col">{dia.abrev}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {horariosUnicos.map((bloque, idx) => {
                    const claseLunes = obtenerClase(1, bloque.inicio, bloque.fin);
                    const claseMartes = obtenerClase(2, bloque.inicio, bloque.fin);
                    const claseMiercoles = obtenerClase(3, bloque.inicio, bloque.fin);
                    const claseJueves = obtenerClase(4, bloque.inicio, bloque.fin);
                    const claseViernes = obtenerClase(5, bloque.inicio, bloque.fin);
                    
                    const tieneClase = claseLunes || claseMartes || claseMiercoles || claseJueves || claseViernes;
                    
                    if (!tieneClase) return null;
                    
                    return (
                      <tr key={idx}>
                        <td className="horario-hora-cell">
                          {formatearHora(bloque.inicio)} - {formatearHora(bloque.fin)}
                        </td>
                        <td
                          className={`horario-clase-cell ${!claseLunes ? 'horario-cell-empty' : ''}`}
                          style={claseLunes ? { backgroundColor: aclararColor(getColorForCourse(claseLunes.titulo), 0.5) } : {}}
                        >
                          {formatearClase(claseLunes) || ''}
                        </td>
                        <td
                          className={`horario-clase-cell ${!claseMartes ? 'horario-cell-empty' : ''}`}
                          style={claseMartes ? { backgroundColor: aclararColor(getColorForCourse(claseMartes.titulo), 0.5) } : {}}
                        >
                          {formatearClase(claseMartes) || ''}
                        </td>
                        <td
                          className={`horario-clase-cell ${!claseMiercoles ? 'horario-cell-empty' : ''}`}
                          style={claseMiercoles ? { backgroundColor: aclararColor(getColorForCourse(claseMiercoles.titulo), 0.5) } : {}}
                        >
                          {formatearClase(claseMiercoles) || ''}
                        </td>
                        <td
                          className={`horario-clase-cell ${!claseJueves ? 'horario-cell-empty' : ''}`}
                          style={claseJueves ? { backgroundColor: aclararColor(getColorForCourse(claseJueves.titulo), 0.5) } : {}}
                        >
                          {formatearClase(claseJueves) || ''}
                        </td>
                        <td
                          className={`horario-clase-cell ${!claseViernes ? 'horario-cell-empty' : ''}`}
                          style={claseViernes ? { backgroundColor: aclararColor(getColorForCourse(claseViernes.titulo), 0.5) } : {}}
                        >
                          {formatearClase(claseViernes) || ''}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state">
              <p>No se encontró horario para el año académico actual</p>
            </div>
          )}
        </div>

        {/* Detalle de Horario */}
        {detalleHorario.length > 0 && (
          <div className="detalle-horario-container">
            <h2 className="detalle-horario-title">Detalle de Horario</h2>
            <div className="detalle-horario-list">
              {detalleHorario.map((curso, idx) => {
                const colorCurso = getColorForCourse(curso.titulo);
                const colorClaro = aclararColor(colorCurso, 0.5);
                
                return (
                  <div 
                    key={idx} 
                    className="detalle-curso-card"
                    style={{ backgroundColor: colorClaro }}
                  >
                    <div className="detalle-curso-header">
                      <div 
                        className="detalle-curso-color-indicator"
                        style={{ backgroundColor: getColorForCourse(curso.titulo) }}
                      ></div>
                      <div className="detalle-curso-info">
                        <h3 className="detalle-curso-titulo">{curso.titulo}</h3>
                        {curso.docente && (
                          <p className="detalle-curso-docente">👨‍🏫 {curso.docente}</p>
                        )}
                      </div>
                    </div>
                    <div className="detalle-curso-horarios">
                      {curso.horarios.map((horarioItem, hIdx) => (
                        <div key={hIdx} className="detalle-horario-item">
                          <span className="detalle-horario-dia">{horarioItem.diaNombre}</span>
                          <span className="detalle-horario-hora">
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
      </div>
    </DashboardLayout>
  );
}

export default AlumnoHorario;

