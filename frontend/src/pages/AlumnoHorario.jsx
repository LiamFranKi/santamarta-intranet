import React, { useState, useEffect, useMemo } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import api from '../services/api';
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

  // Función para imprimir/exportar horario
  const handleImprimir = () => {
    window.print();
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
              <button className="btn-imprimir" onClick={handleImprimir}>
                <span className="btn-icon">🖨️</span>
                <span className="btn-text">Imprimir / Exportar</span>
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

