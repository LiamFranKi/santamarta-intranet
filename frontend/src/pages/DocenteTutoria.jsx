import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import DashboardLayout from '../components/DashboardLayout';
import api from '../services/api';
import Swal from 'sweetalert2';
import './DocenteTutoria.css';

function DocenteTutoria() {
  const [loading, setLoading] = useState(true);
  const [esTutor, setEsTutor] = useState(false);
  const [gruposTutor, setGruposTutor] = useState([]);
  const [openDropdown, setOpenDropdown] = useState(null); // { grupoId, top, left }
  const [selectedGrupo, setSelectedGrupo] = useState(null);
  const [alumnos, setAlumnos] = useState([]);
  const [loadingAlumnos, setLoadingAlumnos] = useState(false);
  const [mostrarRecomendacion, setMostrarRecomendacion] = useState(false);
  const [alumnoSeleccionado, setAlumnoSeleccionado] = useState(null);
  const [recomendacion, setRecomendacion] = useState('');
  const dropdownRef = useRef(null);

  useEffect(() => {
    cargarGruposTutor();
  }, []);

  // Cerrar dropdown al hacer clic fuera
  useEffect(() => {
    if (!openDropdown) return;
    
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        const isDropdownButton = event.target.closest('.btn-opciones');
        if (!isDropdownButton) {
          setOpenDropdown(null);
        }
      }
    };
    
    const timeoutId = setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
    }, 50);
    
    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('click', handleClickOutside);
    };
  }, [openDropdown]);

  const cargarGruposTutor = async () => {
    try {
      setLoading(true);
      const response = await api.get('/docente/tutoria');
      setEsTutor(response.data.es_tutor);
      setGruposTutor(response.data.grupos || []);
    } catch (error) {
      console.error('Error cargando grupos de tutoría:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpcionesClick = (e, grupoId) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setOpenDropdown({
      grupoId,
      top: rect.bottom + 5,
      left: rect.left
    });
  };

  const handleOpcionClick = async (opcion, grupo) => {
    setOpenDropdown(null);
    setSelectedGrupo(grupo);

    switch (opcion) {
      case 'lista-alumnos':
        await cargarAlumnos(grupo.id);
        break;
      case 'notas-asistencia':
        // Implementar después
        Swal.fire({
          icon: 'info',
          title: 'Próximamente',
          text: 'Esta funcionalidad se implementará próximamente',
          toast: true,
          position: 'top-end',
          showConfirmButton: false,
          timer: 3000
        });
        break;
      case 'enviar-comunicado':
        // Implementar después
        Swal.fire({
          icon: 'info',
          title: 'Próximamente',
          text: 'Esta funcionalidad se implementará próximamente',
          toast: true,
          position: 'top-end',
          showConfirmButton: false,
          timer: 3000
        });
        break;
      case 'registrar-asistencia':
        // Implementar después
        Swal.fire({
          icon: 'info',
          title: 'Próximamente',
          text: 'Esta funcionalidad se implementará próximamente',
          toast: true,
          position: 'top-end',
          showConfirmButton: false,
          timer: 3000
        });
        break;
      case 'apreciaciones-recomendaciones':
        await cargarAlumnos(grupo.id);
        setMostrarRecomendacion(true);
        break;
      case 'lista-asignaturas':
        // Implementar después
        Swal.fire({
          icon: 'info',
          title: 'Próximamente',
          text: 'Esta funcionalidad se implementará próximamente',
          toast: true,
          position: 'top-end',
          showConfirmButton: false,
          timer: 3000
        });
        break;
      case 'registrar-conducta':
        // Implementar después
        Swal.fire({
          icon: 'info',
          title: 'Próximamente',
          text: 'Esta funcionalidad se implementará próximamente',
          toast: true,
          position: 'top-end',
          showConfirmButton: false,
          timer: 3000
        });
        break;
      default:
        break;
    }
  };

  const cargarAlumnos = async (grupoId) => {
    try {
      setLoadingAlumnos(true);
      const response = await api.get(`/docente/tutoria/grupos/${grupoId}/alumnos`);
      setAlumnos(response.data.alumnos || []);
    } catch (error) {
      console.error('Error cargando alumnos:', error);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: error.response?.data?.error || 'No se pudieron cargar los alumnos',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000
      });
    } finally {
      setLoadingAlumnos(false);
    }
  };

  const handleEnviarRecomendacion = async () => {
    if (!alumnoSeleccionado || !recomendacion.trim()) {
      return;
    }

    try {
      const matriculaId = alumnoSeleccionado.matricula_id || alumnoSeleccionado.id;
      
      await api.post('/docente/tutoria/recomendaciones', {
        matricula_id: matriculaId,
        recomendacion: recomendacion
      });

      Swal.fire({
        icon: 'success',
        title: '¡Recomendación enviada!',
        text: 'La recomendación se ha enviado correctamente',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000,
        timerProgressBar: true
      });

      setMostrarRecomendacion(false);
      setAlumnoSeleccionado(null);
      setRecomendacion('');
    } catch (error) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: error.response?.data?.error || 'No se pudo enviar la recomendación',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000
      });
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="docente-tutoria-loading">
          <div className="loading-spinner">Cargando...</div>
        </div>
      </DashboardLayout>
    );
  }

  if (!esTutor) {
    return (
      <DashboardLayout>
        <div className="docente-tutoria">
          <div className="no-tutor mundo-card">
            <h2>No eres tutor</h2>
            <p>No estás asignado como tutor de ningún grupo en el año académico actual.</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="docente-tutoria">
        <div className="page-header">
          <h1>🎓 Tutoría</h1>
          <p>Gestiona tus grupos como tutor</p>
        </div>

        <div className="tutoria-content mundo-card">
          <h2>Grupos a Cargo</h2>
          
          {gruposTutor.length > 0 ? (
            <div className="grupos-cards-container">
              {gruposTutor.map((grupo, index) => {
                // Colores pasteles suaves para cada card
                const coloresPasteles = [
                  { bg: 'linear-gradient(145deg, #fef3f2, #fff5f5)', border: '#fecaca', text: '#991b1b' },
                  { bg: 'linear-gradient(145deg, #f0fdf4, #f0fdf4)', border: '#bbf7d0', text: '#166534' },
                  { bg: 'linear-gradient(145deg, #eff6ff, #eff6ff)', border: '#bfdbfe', text: '#1e40af' },
                  { bg: 'linear-gradient(145deg, #fefce8, #fefce8)', border: '#fde68a', text: '#854d0e' },
                  { bg: 'linear-gradient(145deg, #f5f3ff, #f5f3ff)', border: '#ddd6fe', text: '#6b21a8' },
                  { bg: 'linear-gradient(145deg, #f0f9ff, #f0f9ff)', border: '#bae6fd', text: '#0c4a6e' },
                  { bg: 'linear-gradient(145deg, #fdf2f8, #fdf2f8)', border: '#fbcfe8', text: '#9f1239' },
                  { bg: 'linear-gradient(145deg, #ecfdf5, #ecfdf5)', border: '#a7f3d0', text: '#14532d' }
                ];
                
                const colorCard = coloresPasteles[index % coloresPasteles.length];
                
                return (
                  <div
                    key={grupo.id}
                    className="grupo-card"
                    style={{
                      background: colorCard.bg,
                      borderColor: colorCard.border
                    }}
                  >
                    <div className="grupo-card-info">
                      <div className="grupo-card-texto">
                        <span className="grupo-grado-seccion-nivel">
                          {grupo.grado}° {grupo.seccion} - {grupo.nivel_nombre}
                        </span>
                        <span className="grupo-turno-anio">
                          {grupo.turno_nombre} • {grupo.anio}
                        </span>
                      </div>
                    </div>
                    <div className="grupo-card-acciones">
                      <button
                        className="btn-opciones"
                        onClick={(e) => handleOpcionesClick(e, grupo.id)}
                      >
                        Opciones <span className="dropdown-arrow">▼</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="empty-state">
              <p>No tienes grupos asignados como tutor</p>
            </div>
          )}

          {/* Dropdown de Opciones */}
          {openDropdown && createPortal(
            <div
              ref={dropdownRef}
              className="dropdown-menu"
              style={{
                position: 'fixed',
                top: `${openDropdown.top}px`,
                left: `${openDropdown.left}px`,
                zIndex: 10000
              }}
            >
              {(() => {
                const grupo = gruposTutor.find(g => g.id === openDropdown.grupoId);
                if (!grupo) return null;

                const opciones = [
                  { id: 'lista-alumnos', label: 'Lista de Alumnos', icon: '📋' },
                  { id: 'notas-asistencia', label: 'Ver Notas', icon: '📊' },
                  { id: 'enviar-comunicado', label: 'Enviar Mensaje', icon: '✉️' },
                  { id: 'registrar-asistencia', label: 'Asistencias', icon: '✅' },
                  { id: 'apreciaciones-recomendaciones', label: 'Recomendaciones', icon: '💬' },
                  { id: 'lista-asignaturas', label: 'Lista de Asignaturas', icon: '📚' },
                  { id: 'registrar-conducta', label: 'Registrar Conducta', icon: '📝' }
                ];

                return opciones.map((opcion) => (
                  <div
                    key={opcion.id}
                    className="dropdown-item"
                    onClick={() => handleOpcionClick(opcion.id, grupo)}
                  >
                    <span className="dropdown-icon">{opcion.icon}</span>
                    <span className="dropdown-label">{opcion.label}</span>
                  </div>
                ));
              })()}
            </div>,
            document.body
          )}

          {/* Lista de Alumnos */}
          {selectedGrupo && alumnos.length > 0 && (
            <div className="alumnos-section">
              <div className="alumnos-header">
                <h3>Alumnos - {selectedGrupo.grado}° {selectedGrupo.seccion}</h3>
                <button
                  className="btn-cerrar-alumnos"
                  onClick={() => {
                    setSelectedGrupo(null);
                    setAlumnos([]);
                    setMostrarRecomendacion(false);
                  }}
                >
                  ✕
                </button>
              </div>
              {loadingAlumnos ? (
                <div className="loading-alumnos">Cargando alumnos...</div>
              ) : (
                <div className="alumnos-grid">
                  {alumnos.map((alumno, index) => {
                    const nombreCompleto = `${alumno.apellido_paterno || ''} ${alumno.apellido_materno || ''}, ${alumno.nombres || ''}`.trim();
                    
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
                        key={alumno.id}
                        className="alumno-card"
                        style={{
                          background: colorCard.bg,
                          borderColor: colorCard.border
                        }}
                      >
                        <div
                          className="alumno-avatar"
                          style={{ backgroundColor: colorCard.avatar }}
                        >
                          {alumno.foto ? (
                            <img src={alumno.foto} alt={nombreCompleto} />
                          ) : (
                            <span>{(alumno.nombres?.[0] || 'A').toUpperCase()}</span>
                          )}
                        </div>
                        <div className="alumno-info">
                          <h4>{nombreCompleto}</h4>
                          <button
                            className="btn-ver-perfil"
                            onClick={() => {
                              setAlumnoSeleccionado(alumno);
                              setMostrarRecomendacion(true);
                            }}
                          >
                            <span className="btn-icon">👁️</span>
                            <span className="btn-text">Ver</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Formulario de Recomendación */}
          {mostrarRecomendacion && selectedGrupo && (
            <div className="recomendacion-form">
              <div className="recomendacion-header">
                <h3>Apreciaciones / Recomendaciones</h3>
                <button
                  className="btn-cerrar-form"
                  onClick={() => {
                    setMostrarRecomendacion(false);
                    setAlumnoSeleccionado(null);
                    setRecomendacion('');
                  }}
                >
                  ✕
                </button>
              </div>
              <div className="form-group">
                <label>Alumno</label>
                <select
                  value={alumnoSeleccionado?.id || ''}
                  onChange={(e) => {
                    const alumno = alumnos.find(a => a.id === parseInt(e.target.value));
                    setAlumnoSeleccionado(alumno);
                  }}
                >
                  <option value="">Selecciona un alumno</option>
                  {alumnos.map((alumno) => (
                    <option key={alumno.id} value={alumno.id}>
                      {alumno.apellido_paterno} {alumno.apellido_materno}, {alumno.nombres}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Recomendación</label>
                <textarea
                  value={recomendacion}
                  onChange={(e) => setRecomendacion(e.target.value)}
                  rows="5"
                  placeholder="Escribe la recomendación para el alumno..."
                />
              </div>
              <div className="form-actions">
                <button
                  type="button"
                  className="btn-cancelar"
                  onClick={() => {
                    setMostrarRecomendacion(false);
                    setAlumnoSeleccionado(null);
                    setRecomendacion('');
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn-guardar"
                  onClick={handleEnviarRecomendacion}
                  disabled={!alumnoSeleccionado || !recomendacion.trim()}
                >
                  Enviar Recomendación
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

export default DocenteTutoria;
