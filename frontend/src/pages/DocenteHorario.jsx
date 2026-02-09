import React, { useState, useEffect, useMemo } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import api from '../services/api';
import { jsPDF } from 'jspdf';
import Swal from 'sweetalert2';
import './DocenteHorario.css';

function DocenteHorario() {
  const [loading, setLoading] = useState(true);
  const [horarioRaw, setHorarioRaw] = useState([]);

  useEffect(() => {
    cargarHorario();
  }, []);

  const cargarHorario = async () => {
    try {
      setLoading(true);
      const response = await api.get('/docente/horario');
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
  // Maneja tanto formato 24h (HH:MM:SS) como formato 12h (HH:MM AM/PM)
  const formatearHora = (hora) => {
    if (!hora) return '';
    
    // Si ya tiene AM o PM, retornar tal cual (solo limpiar espacios extra)
    const horaUpper = hora.toUpperCase().trim();
    if (horaUpper.includes('AM') || horaUpper.includes('PM')) {
      // Ya tiene formato AM/PM, solo limpiar y retornar
      return hora.trim();
    }
    
    // Si no tiene AM/PM, convertir de formato 24h a 12h
    const partes = hora.split(':');
    if (partes.length < 2) return hora; // Formato desconocido, retornar tal cual
    
    const h = parseInt(partes[0], 10);
    const m = partes[1] ? partes[1].split(' ')[0] : '00'; // Tomar solo los minutos, ignorar segundos si existen
    const minutos = m.padStart(2, '0');
    
    if (isNaN(h)) return hora; // Si no es un número válido, retornar tal cual
    
    if (h === 0) return `12:${minutos} AM`;
    if (h < 12) return `${h}:${minutos} AM`;
    if (h === 12) return `12:${minutos} PM`;
    return `${h - 12}:${minutos} PM`;
  };

  // Convertir hora HH:MM:SS a minutos para ordenar
  const horaAMinutos = (hora) => {
    if (!hora) return 0;
    const [h, m] = hora.split(':');
    return parseInt(h) * 60 + parseInt(m || 0);
  };

  // Obtener todos los bloques de horarios únicos ordenados
  const horariosUnicos = useMemo(() => {
    if (!horario || horario.length === 0) return [];
    
    const bloques = horario.map(c => ({
      inicio: c.inicio || c.hora_inicio || '',
      fin: c.fin || c.hora_final || ''
    })).filter(b => b.inicio && b.fin); // Filtrar bloques inválidos
    
    // Eliminar duplicados y ordenar
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
    const clase = horario.find(c => {
      // El campo día normalizado debe coincidir exactamente
      if (c.diaNormalizado !== dia) return false;
      
      // Comparar inicio (puede venir como 'inicio' o 'hora_inicio')
      const inicioClase = c.inicio || c.hora_inicio || '';
      const finClase = c.fin || c.hora_final || '';
      
      // Comparar como strings para evitar problemas de formato
      return inicioClase === horaInicio && finClase === horaFin;
    });
    
    return clase;
  };

  // Función para formatear el texto de la clase como en el PDF
  // En personal_horario, titulo contiene el nombre del curso y grupo contiene el texto completo del grupo
  // Formato: "titulo - grupo" (ej: "Biología - SECUNDARIA - 4° A - 2025")
  const formatearClase = (clase) => {
    if (!clase) return null;
    const titulo = clase.titulo || '';
    const grupo = clase.grupo || '';
    
    if (!titulo && !grupo) return null;
    if (!grupo) return titulo;
    if (!titulo) return grupo;
    
    return `${titulo} - ${grupo}`;
  };

  // Paleta amplia de colores pastel para asignar a los cursos
  // Estos colores son suaves y diferenciables visualmente
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

  // Función hash determinística mejorada para asignar colores de forma consistente
  // El mismo nombre de curso siempre tendrá el mismo color
  // Usa múltiples operaciones para mejor distribución y reducir colisiones
  const hashString = (str) => {
    let hash = 0;
    const normalized = str.trim().toLowerCase();
    
    // Hash mejorado con múltiples operaciones para mejor distribución
    for (let i = 0; i < normalized.length; i++) {
      const char = normalized.charCodeAt(i);
      // Usar múltiples operaciones para mejor distribución
      hash = ((hash << 5) - hash) + char;
      hash = hash + (hash << 10);
      hash = hash ^ (hash >> 6);
    }
    
    // Operaciones finales para mejorar la distribución
    hash = hash + (hash << 3);
    hash = hash ^ (hash >> 11);
    hash = hash + (hash << 15);
    
    return Math.abs(hash);
  };

  // Generar un color pastel consistente y único por nombre de curso
  // Usa hash determinístico para que el mismo curso siempre tenga el mismo color
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
    
    // Convertir hex a RGB
    const r = parseInt(colorHex.slice(1, 3), 16);
    const g = parseInt(colorHex.slice(3, 5), 16);
    const b = parseInt(colorHex.slice(5, 7), 16);
    
    // Mezclar con blanco (255, 255, 255) según el factor
    // factor 0 = color original, factor 1 = blanco puro
    const rNuevo = Math.round(r + (255 - r) * factor);
    const gNuevo = Math.round(g + (255 - g) * factor);
    const bNuevo = Math.round(b + (255 - b) * factor);
    
    // Convertir de vuelta a hex
    return `#${rNuevo.toString(16).padStart(2, '0')}${gNuevo.toString(16).padStart(2, '0')}${bNuevo.toString(16).padStart(2, '0')}`;
  };

  // Extraer el grado numérico del texto del grupo para ordenar
  const extraerGrado = (grupoTexto) => {
    if (!grupoTexto) return 0;
    // Buscar patrones como "4°", "5°", "1°", etc.
    const match = grupoTexto.match(/(\d+)°/);
    return match ? parseInt(match[1], 10) : 0;
  };

  // Extraer el nivel del texto del grupo (Inicial, Primaria, Secundaria)
  const extraerNivel = (grupoTexto) => {
    if (!grupoTexto) return '';
    const textoUpper = grupoTexto.toUpperCase();
    if (textoUpper.includes('INICIAL')) return 'Inicial';
    if (textoUpper.includes('PRIMARIA')) return 'Primaria';
    if (textoUpper.includes('SECUNDARIA')) return 'Secundaria';
    return '';
  };

  // Obtener orden numérico del nivel para ordenar
  const getOrdenNivel = (nivel) => {
    const orden = {
      'Inicial': 1,
      'Primaria': 2,
      'Secundaria': 3
    };
    return orden[nivel] || 99; // Si no se encuentra, va al final
  };

  // Procesar horario para crear lista detallada de cursos agrupados por curso y grado
  const detalleHorario = useMemo(() => {
    if (!horario || horario.length === 0) return [];

    // Agrupar por curso y grupo (grado)
    const cursosMap = {};

    horario.forEach((clase) => {
      if (!clase.titulo) return;

      const titulo = clase.titulo.trim();
      const grupo = clase.grupo || '';
      const grado = extraerGrado(grupo);
      const nivel = extraerNivel(grupo);
      
      // Crear clave única: curso + grupo
      const clave = `${titulo}|||${grupo}`;

      if (!cursosMap[clave]) {
        cursosMap[clave] = {
          titulo,
          grupo,
          grado,
          nivel,
          horarios: [] // Array de {dia, inicio, fin, diaNombre}
        };
      }

      // Agregar horario si no existe ya
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

    // Convertir a array y ordenar por nivel, luego por grado, luego por título
    const cursosArray = Object.values(cursosMap).sort((a, b) => {
      // Primero ordenar por nivel (Inicial, Primaria, Secundaria)
      const ordenA = getOrdenNivel(a.nivel);
      const ordenB = getOrdenNivel(b.nivel);
      if (ordenA !== ordenB) {
        return ordenA - ordenB;
      }
      // Si mismo nivel, ordenar por grado ascendente
      if (a.grado !== b.grado) {
        return a.grado - b.grado;
      }
      // Si mismo grado, ordenar por título
      return a.titulo.localeCompare(b.titulo);
    });

    // Ordenar horarios dentro de cada curso por día y hora
    cursosArray.forEach(curso => {
      curso.horarios.sort((a, b) => {
        if (a.dia !== b.dia) {
          return a.dia - b.dia; // Ordenar por día
        }
        return horaAMinutos(a.inicio) - horaAMinutos(b.inicio); // Luego por hora
      });
    });

    return cursosArray;
  }, [horario, diasSemana]);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="docente-horario-loading">
          <div className="loading-spinner">Cargando horario...</div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="docente-horario">
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
          {horario.length > 0 ? (
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
                    
                    // Solo mostrar fila si hay al menos una clase en algún día
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
                const colorClaro = aclararColor(colorCurso, 0.5); // Aclarar 50%
                
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
                      <p className="detalle-curso-grupo">{curso.grupo}</p>
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

export default DocenteHorario;

