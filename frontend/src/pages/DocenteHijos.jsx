import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import DashboardLayout from '../components/DashboardLayout';
import api from '../services/api';
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

  const cargarDatosHijo = async (hijoId) => {
    try {
      console.log('📋 [FRONTEND] Cargando datos del hijo con ID:', hijoId);
      const response = await api.get(`/docente/hijos/${hijoId}/datos`);
      console.log('✅ [FRONTEND] Datos recibidos:', response.data);
      const datos = response.data;
      
      setFormData({
        nombres: datos.nombres || '',
        apellido_paterno: datos.apellido_paterno || '',
        apellido_materno: datos.apellido_materno || '',
        email: datos.email || '',
        sexo: datos.sexo !== undefined ? String(datos.sexo) : '',
        fecha_nacimiento: datos.fecha_nacimiento || ''
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
                    <label htmlFor="email">Email *</label>
                    <input
                      type="email"
                      id="email"
                      name="email"
                      value={formData.email}
                      onChange={handleInputChange}
                      required
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
    </DashboardLayout>
  );
}

export default DocenteHijos;

