import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import GrupoAlumnosListaView from '../components/grupoAlumnos/GrupoAlumnosListaView';
import api from '../services/api';
import './DocenteGrupos.css';

function DocenteGrupos() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [grupos, setGrupos] = useState([]);
  const [filter, setFilter] = useState('');
  const [selectedGrupo, setSelectedGrupo] = useState(null);
  const [grupoInfo, setGrupoInfo] = useState(null);
  const [openDropdownGrupo, setOpenDropdownGrupo] = useState(null);

  useEffect(() => {
    cargarGrupos();
  }, []);

  useEffect(() => {
    if (!openDropdownGrupo) return;
    
    const handleClickOutside = (event) => {
      const target = event.target;
      
      // Verificar si el clic está dentro de cualquier dropdown
      const isDropdownMenu = target.closest('.dropdown-menu');
      const isDropdownButton = target.closest('.btn-opciones-dropdown');
      const isDropdownItem = target.closest('.dropdown-item');
      const isDropdownContainer = target.closest('.dropdown-container');
      
      // También verificar si el clic está en un elemento dentro del dropdown
      const isInsideDropdown = isDropdownMenu || isDropdownButton || isDropdownItem || isDropdownContainer;
      
      // Solo cerrar si el clic NO está dentro del dropdown
      // Usar un delay para permitir que los eventos de los items se procesen primero
      if (!isInsideDropdown) {
        setTimeout(() => {
          setOpenDropdownGrupo(null);
        }, 100);
      }
    };

    const timeoutId = setTimeout(() => {
      document.addEventListener('click', handleClickOutside, false);
    }, 50);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('click', handleClickOutside, false);
    };
  }, [openDropdownGrupo]);


  const ordenarGrupos = (a, b) => {
    const ordenNivel = { Inicial: 0, Primaria: 1, Secundaria: 2 };
    const niv = (x) => ordenNivel[x.nivel_nombre] ?? (x.nivel_id != null ? Number(x.nivel_id) : 999);
    const grad = (x) => (x.grado != null ? Number(x.grado) : 0);
    const sec = (x) => String(x.seccion || '');
    if (niv(a) !== niv(b)) return niv(a) - niv(b);
    if (grad(a) !== grad(b)) return grad(a) - grad(b);
    return sec(a).localeCompare(sec(b), undefined, { sensitivity: 'base', numeric: true });
  };

  const cargarGrupos = async () => {
    try {
      setLoading(true);
      const response = await api.get('/docente/grupos');
      const lista = response.data.grupos || [];
      setGrupos([...lista].sort(ordenarGrupos));
    } catch (error) {
      console.error('Error cargando grupos:', error);
    } finally {
      setLoading(false);
    }
  };

  const cargarAlumnos = async (gid) => {
    const grupo = grupos.find((g) => g.id === gid);
    setGrupoInfo(grupo || null);
    setSelectedGrupo(gid);
    setTimeout(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      const el = document.querySelector('.docente-grupos');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  const volverAGrupos = () => {
    setSelectedGrupo(null);
    setGrupoInfo(null);
  };

  const gruposFiltrados = grupos.filter(grupo => {
    const searchTerm = filter.toLowerCase();
    return (
      grupo.grado?.toString().includes(searchTerm) ||
      grupo.seccion?.toLowerCase().includes(searchTerm) ||
      grupo.nivel_nombre?.toLowerCase().includes(searchTerm) ||
      grupo.turno_nombre?.toLowerCase().includes(searchTerm)
    );
  });

  const gruposOrdenados = [...gruposFiltrados].sort(ordenarGrupos);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="docente-grupos-loading">
          <div className="loading-spinner">Cargando grupos...</div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="docente-grupos">
        <div className="page-header">
          <h1>Grupos Asignados</h1>
          <p className="page-subtitle">Lista de grupos a tu cargo en el año académico actual</p>
        </div>

        {!selectedGrupo ? (
          <div className="grupos-container">
            {/* Debug: selectedGrupo = {String(selectedGrupo)} */}
            <div className="grupos-list-section">
            <div className="section-controls">
              <div className="filter-container">
                <input
                  type="text"
                  placeholder="🔍 Buscar por grado, sección, nivel..."
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  className="filter-input"
                />
              </div>
            </div>

            <div className="grupos-cards-container">
              {gruposOrdenados.length > 0 ? (
                gruposOrdenados.map((grupo, index) => {
                  // Colores pasteles suaves para cada card
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
                  
                  const colorCard = coloresPasteles[grupo.id % coloresPasteles.length];
                  
                  return (
                    <div
                      key={grupo.id}
                      className="grupo-card"
                      style={{ background: colorCard }}
                    >
                      <div className="grupo-card-info">
                        <div className="grupo-card-main">
                          <span className="grupo-grado-seccion">{grupo.grado}° {grupo.seccion}</span>
                          <span className="grupo-nivel">{grupo.nivel_nombre}</span>
                          <span className="grupo-turno">{grupo.turno_nombre}</span>
                        </div>
                        <div className="grupo-card-alumnos">
                          <span className="grupo-alumnos-count">👥 {grupo.total_alumnos || 0} alumnos</span>
                        </div>
                      </div>
                      <div className="grupo-card-actions">
                        <div className="dropdown-container">
                          <button
                            className="btn-opciones-dropdown"
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              
                              const rect = e.currentTarget.getBoundingClientRect();
                              if (openDropdownGrupo?.id === grupo.id) {
                                setOpenDropdownGrupo(null);
                              } else {
                                // Cerrar otros dropdowns primero
                                // Calcular posición: justo debajo del botón
                                const dropdownWidth = 320;
                                let left = rect.left;
                                // Si el dropdown se sale por la derecha, ajustar
                                if (left + dropdownWidth > window.innerWidth) {
                                  left = window.innerWidth - dropdownWidth - 10;
                                }
                                // Asegurar que no se salga por la izquierda
                                if (left < 10) {
                                  left = 10;
                                }
                                setOpenDropdownGrupo({ 
                                  id: grupo.id, 
                                  top: rect.bottom + 2, 
                                  left: left
                                });
                              }
                            }}
                            title="Opciones"
                          >
                            Opciones {openDropdownGrupo?.id === grupo.id ? '▲' : '▼'}
                          </button>
                          {openDropdownGrupo?.id === grupo.id && openDropdownGrupo?.top && 
                            createPortal(
                              <div 
                                className="dropdown-menu dropdown-menu-grupo"
                                style={{
                                  top: `${openDropdownGrupo.top}px`,
                                  left: `${openDropdownGrupo.left}px`,
                                  position: 'fixed',
                                  zIndex: 10001,
                                  transform: 'translateZ(0)',
                                  willChange: 'transform',
                                }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  className="dropdown-item"
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    console.log('✅ Click en Lista de Alumnos, grupo.id:', grupo.id);
                                    const grupoId = grupo.id;
                                    // Cerrar dropdown primero
                                    setOpenDropdownGrupo(null);
                                    // Cargar alumnos inmediatamente
                                    cargarAlumnos(grupoId);
                                  }}
                                >
                                  <span className="dropdown-icon">📋</span>
                                  <span>Lista de Alumnos</span>
                                </button>
                                <button
                                  className="dropdown-item"
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    setOpenDropdownGrupo(null);
                                    navigate(`/docente/grupos/${grupo.id}/conexiones-familiares`, { state: { grupo } });
                                  }}
                                >
                                  <span className="dropdown-icon">👨‍👩‍👧‍👦</span>
                                  <span>Conexiones Familiares</span>
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
                  {filter ? 'No se encontraron grupos con ese filtro' : 'No tienes grupos asignados'}
                </div>
              )}
            </div>
            </div>
          </div>
        ) : (
          <GrupoAlumnosListaView
            grupoId={selectedGrupo}
            grupoInfo={grupoInfo}
            onVolver={volverAGrupos}
            psicologiaLinkMode="docente"
          />
        )}
      </div>

    </DashboardLayout>
  );
}

export default DocenteGrupos;

