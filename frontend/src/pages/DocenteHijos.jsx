import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import DashboardLayout from '../components/DashboardLayout';
import api from '../services/api';
import './DocenteHijos.css';

function DocenteHijos() {
  const [loading, setLoading] = useState(true);
  const [hijos, setHijos] = useState([]);
  const [esApoderado, setEsApoderado] = useState(false);
  const [openDropdown, setOpenDropdown] = useState(null);
  const dropdownRef = useRef(null);

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

  const handleOpcionClick = (opcion, hijo) => {
    setOpenDropdown(null);
    
    switch (opcion) {
      case 'editar-datos':
        console.log('Editar datos de:', hijo);
        // Implementar después
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
        console.log('Imprimir QR de:', hijo);
        // Implementar después
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
        console.log('Reiniciar contraseña de:', hijo);
        // Implementar después
        break;
      default:
        break;
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
    </DashboardLayout>
  );
}

export default DocenteHijos;

