import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { suscribirNotificacionesPush, desuscribirNotificacionesPush, verificarEstadoNotificaciones, tieneSuscripcionPushActiva } from '../services/pushNotificationService';
import Swal from 'sweetalert2';
import AlumnoPerfilExtra from '../components/AlumnoPerfilExtra';
import AlumnoSaludFields from '../components/AlumnoSaludFields';
import './AlumnoPerfil.css';

// Función para obtener iniciales del nombre
function getInitials(nombre) {
  if (!nombre) return 'A';
  const parts = String(nombre).trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase()).join('') || 'A';
}

function AlumnoPerfil() {
  const navigate = useNavigate();
  const { user, setUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [perfil, setPerfil] = useState(null);
  const [formData, setFormData] = useState({
    nombres: '',
    apellido_paterno: '',
    apellido_materno: '',
    email: '',
    sexo: '',
    fecha_nacimiento: '',
    alergias: '',
    vacunas: '',
    tipo_sangre: '0',
    enfermedades_sufridas: '',
    otros_controles: '',
    experiencias_traumaticas: ''
  });
  const [fotoPreview, setFotoPreview] = useState(null);
  const [fotoFile, setFotoFile] = useState(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [passwordData, setPasswordData] = useState({
    password_actual: '',
    password_nueva: '',
    password_confirmar: ''
  });
  const [changingPassword, setChangingPassword] = useState(false);
  const [notificacionesEstado, setNotificacionesEstado] = useState(null);
  const [activandoNotificaciones, setActivandoNotificaciones] = useState(false);
  const [desuscribiendoNotificaciones, setDesuscribiendoNotificaciones] = useState(false);
  const [tieneSuscripcionPush, setTieneSuscripcionPush] = useState(null);

  useEffect(() => {
    cargarPerfil();
    verificarNotificaciones();
  }, []);

  const verificarNotificaciones = async () => {
    const estado = verificarEstadoNotificaciones();
    setNotificacionesEstado(estado);
    if (estado.permiso === 'granted') {
      const tiene = await tieneSuscripcionPushActiva();
      setTieneSuscripcionPush(tiene);
    } else {
      setTieneSuscripcionPush(false);
    }
  };

  const cargarPerfil = async () => {
    try {
      setLoading(true);
      const response = await api.get('/alumno/perfil');
      const data = response.data;
      setPerfil(data);
      
      // Formatear fecha de nacimiento para input type="date"
      const formatearFechaParaInput = (fecha) => {
        if (!fecha) return '';
        try {
          if (typeof fecha === 'string') {
            if (fecha === '0000-00-00' || fecha === '0000-00-00 00:00:00' || fecha.trim() === '') {
              return '';
            }
            if (fecha.includes('T')) {
              return fecha.split('T')[0];
            } else if (fecha.includes(' ')) {
              return fecha.split(' ')[0];
            } else if (fecha.match(/^\d{4}-\d{2}-\d{2}$/)) {
              const [año, mes, dia] = fecha.split('-').map(Number);
              if (año > 0 && mes > 0 && dia > 0 && mes <= 12 && dia <= 31) {
                return fecha;
              }
              return '';
            }
          }
          if (fecha instanceof Date && !isNaN(fecha.getTime()) && fecha.getFullYear() > 1900) {
            return fecha.toISOString().split('T')[0];
          }
          return '';
        } catch (error) {
          console.error('Error formateando fecha:', error);
          return '';
        }
      };

      setFormData({
        nombres: data.nombres || '',
        apellido_paterno: data.apellido_paterno || '',
        apellido_materno: data.apellido_materno || '',
        email: data.email || '',
        sexo: data.sexo !== undefined && data.sexo !== null ? String(data.sexo) : '',
        fecha_nacimiento: formatearFechaParaInput(data.fecha_nacimiento),
        alergias: data.alergias || '',
        vacunas: data.vacunas || '',
        tipo_sangre:
          data.tipo_sangre !== undefined && data.tipo_sangre !== null
            ? String(data.tipo_sangre)
            : '0',
        enfermedades_sufridas: data.enfermedades_sufridas || '',
        otros_controles: data.otros_controles || '',
        experiencias_traumaticas: data.experiencias_traumaticas || ''
      });
      
      // Cargar foto si existe (igual que docente)
      if (data.foto && data.foto !== '') {
        let fotoUrl;
        if (data.foto.startsWith('http')) {
          // Ya es una URL completa
          fotoUrl = data.foto;
        } else if (data.foto.startsWith('/Static/')) {
          // Es una ruta completa del sistema anterior
          fotoUrl = `https://sistema.vanguardschools.edu.pe${data.foto}`;
        } else if (data.foto.startsWith('/uploads/')) {
          // Es una ruta de uploads (compatibilidad con archivos antiguos)
          const currentProtocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
          const currentHost = window.location.hostname;
          fotoUrl = `${currentProtocol}//${currentHost}${data.foto}`;
        } else {
          // Es solo el nombre del archivo (formato del sistema PHP, igual que publicaciones)
          fotoUrl = `https://sistema.vanguardschools.edu.pe/Static/Image/Fotos/${data.foto}`;
        }
        setFotoPreview(fotoUrl);
        console.log('📸 Foto de perfil cargada:', fotoUrl);
      }
    } catch (error) {
      console.error('Error cargando perfil:', error);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'No se pudo cargar el perfil',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000
      });
    } finally {
      setLoading(false);
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
      if (file.size > 5 * 1024 * 1024) {
        Swal.fire({
          icon: 'warning',
          title: 'Archivo muy grande',
          text: 'La imagen no debe superar los 5MB',
          toast: true,
          position: 'top-end',
          showConfirmButton: false,
          timer: 3000
        });
        return;
      }
      
      // Validar tipo de archivo
      if (!file.type.startsWith('image/')) {
        Swal.fire({
          icon: 'warning',
          title: 'Tipo de archivo inválido',
          text: 'Por favor selecciona una imagen',
          toast: true,
          position: 'top-end',
          showConfirmButton: false,
          timer: 3000
        });
        return;
      }
      
      setFotoFile(file);
      const reader = new FileReader();
      reader.onerror = () => {
        console.error('Error leyendo archivo');
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: 'No se pudo leer el archivo',
          toast: true,
          position: 'top-end',
          showConfirmButton: false,
          timer: 3000
        });
      };
      reader.onloadend = () => {
        if (reader.result) {
          setFotoPreview(reader.result);
          console.log('✅ Previsualización de foto actualizada');
        }
      };
      reader.readAsDataURL(file);
    } else {
      // Si no se seleccionó archivo, limpiar
      setFotoFile(null);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      setSaving(true);
      
      // Si hay una foto nueva, mostrar indicador de subida
      if (fotoFile) {
        setUploadingPhoto(true);
      }
      
      const formDataToSend = new FormData();
      
      // NO enviar nombres y apellidos ya que son readonly y no deben modificarse
      // formDataToSend.append('nombres', formData.nombres);
      // formDataToSend.append('apellido_paterno', formData.apellido_paterno);
      // formDataToSend.append('apellido_materno', formData.apellido_materno);
      formDataToSend.append('email', formData.email);
      formDataToSend.append('sexo', formData.sexo || '');
      formDataToSend.append('fecha_nacimiento', formData.fecha_nacimiento);
      formDataToSend.append('alergias', formData.alergias || '');
      formDataToSend.append('vacunas', formData.vacunas || '');
      formDataToSend.append('tipo_sangre', formData.tipo_sangre || '0');
      formDataToSend.append('enfermedades_sufridas', formData.enfermedades_sufridas || '');
      formDataToSend.append('otros_controles', formData.otros_controles || '');
      formDataToSend.append('experiencias_traumaticas', formData.experiencias_traumaticas || '');
      
      if (fotoFile) {
        formDataToSend.append('foto', fotoFile);
      }

      const response = await api.put('/alumno/perfil', formDataToSend, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      // Ocultar indicador de subida después de un breve delay
      if (fotoFile) {
        setTimeout(() => {
          setUploadingPhoto(false);
        }, 2000);
      }

      Swal.fire({
        icon: 'success',
        title: '¡Perfil actualizado!',
        text: fotoFile ? 'Tu perfil se ha actualizado. La foto se está subiendo en segundo plano...' : 'Tu perfil se ha actualizado correctamente',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000,
        timerProgressBar: true
      });

      // Recargar perfil completo desde el servidor
      await cargarPerfil();
      
      // Actualizar usuario en AuthContext para que se refleje en el navbar
      if (response.data) {
        const perfilActualizado = response.data;
        
        if (user && perfilActualizado) {
          // Construir URL completa de la foto para el contexto
          let fotoUrlForContext = null;
          if (perfilActualizado.foto) {
            if (perfilActualizado.foto.startsWith('http')) {
              fotoUrlForContext = perfilActualizado.foto;
            } else if (perfilActualizado.foto.startsWith('/Static/')) {
              fotoUrlForContext = `https://sistema.vanguardschools.edu.pe${perfilActualizado.foto}`;
            } else if (perfilActualizado.foto.startsWith('/uploads/')) {
              const currentProtocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
              const currentHost = window.location.hostname;
              fotoUrlForContext = `${currentProtocol}//${currentHost}${perfilActualizado.foto}`;
            } else {
              fotoUrlForContext = `https://sistema.vanguardschools.edu.pe/Static/Image/Fotos/${perfilActualizado.foto}`;
            }
          }
          
          const nombreCompleto = `${perfilActualizado.nombres || ''} ${perfilActualizado.apellido_paterno || ''} ${perfilActualizado.apellido_materno || ''}`.trim();
          
          const updatedUser = {
            ...user,
            foto: fotoUrlForContext || user.foto,
            nombres: perfilActualizado.nombres || user.nombres,
            apellido_paterno: perfilActualizado.apellido_paterno || user.apellido_paterno,
            apellido_materno: perfilActualizado.apellido_materno || user.apellido_materno,
            email: perfilActualizado.email || user.email,
            sexo: perfilActualizado.sexo !== undefined ? perfilActualizado.sexo : (user.sexo !== undefined ? user.sexo : null)
          };
          setUser(updatedUser);
          localStorage.setItem('user', JSON.stringify(updatedUser));
          console.log('✅ Usuario actualizado en contexto y localStorage');
        }
      }
      
      // Limpiar fotoFile después de guardar
      setFotoFile(null);
    } catch (error) {
      console.error('Error actualizando perfil:', error);
      setUploadingPhoto(false);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: error.response?.data?.error || 'No se pudo actualizar el perfil',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000
      });
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordChange = (e) => {
    const { name, value } = e.target;
    setPasswordData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    
    if (passwordData.password_nueva !== passwordData.password_confirmar) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'Las contraseñas no coinciden',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000
      });
      return;
    }

    if (passwordData.password_nueva.length < 6) {
      Swal.fire({
        icon: 'warning',
        title: 'Contraseña muy corta',
        text: 'La contraseña debe tener al menos 6 caracteres',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000
      });
      return;
    }

    try {
      setChangingPassword(true);
      await api.put('/alumno/perfil/password', {
        password_actual: passwordData.password_actual,
        password_nueva: passwordData.password_nueva
      });

      Swal.fire({
        icon: 'success',
        title: '¡Contraseña actualizada!',
        text: 'Tu contraseña se ha cambiado correctamente',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000,
        timerProgressBar: true
      });

      // Limpiar formulario
      setPasswordData({
        password_actual: '',
        password_nueva: '',
        password_confirmar: ''
      });
      setShowPasswordChange(false);
    } catch (error) {
      console.error('Error cambiando contraseña:', error);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: error.response?.data?.error || 'No se pudo cambiar la contraseña',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000
      });
    } finally {
      setChangingPassword(false);
    }
  };

  const handleActivarNotificaciones = async () => {
    try {
      setActivandoNotificaciones(true);
      const resultado = await suscribirNotificacionesPush();
      
      if (resultado.success) {
        setTieneSuscripcionPush(true);
        Swal.fire({
          icon: 'success',
          title: '¡Notificaciones Activadas!',
          text: 'Ahora recibirás notificaciones push en tu dispositivo',
          toast: true,
          position: 'top-end',
          showConfirmButton: false,
          timer: 3000
        });
        verificarNotificaciones();
      } else {
        if (resultado.error === 'Permiso denegado' || resultado.permission === 'denied') {
          Swal.fire({
            icon: 'warning',
            title: 'Permiso Denegado',
            text: 'Has bloqueado las notificaciones. Por favor, habilítalas en la configuración de tu navegador.',
            confirmButtonText: 'Entendido'
          });
        } else if (resultado.retry) {
          Swal.fire({
            icon: 'info',
            title: 'Permiso Requerido',
            text: 'Por favor, haz clic en "Permitir" cuando tu navegador te lo solicite.',
            confirmButtonText: 'Entendido'
          });
        } else {
          Swal.fire({
            icon: 'error',
            title: 'Error',
            text: resultado.error || 'No se pudieron activar las notificaciones',
            confirmButtonText: 'Entendido'
          });
        }
      }
    } catch (error) {
      console.error('Error activando notificaciones:', error);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'No se pudieron activar las notificaciones',
        confirmButtonText: 'Entendido'
      });
    } finally {
      setActivandoNotificaciones(false);
    }
  };

  const handleDesuscribirNotificaciones = async () => {
    try {
      setDesuscribiendoNotificaciones(true);
      const resultado = await desuscribirNotificacionesPush();
      if (resultado.success) {
        Swal.fire({
          icon: 'success',
          title: 'Desuscripción exitosa',
          text: 'Haz clic en "Activar Notificaciones" para volver a suscribirte con una suscripción nueva.',
          toast: true,
          position: 'top-end',
          showConfirmButton: false,
          timer: 4000
        });
        verificarNotificaciones();
      } else {
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: resultado.error || 'No se pudo desuscribir'
        });
      }
    } catch (error) {
      console.error('Error desuscribiendo:', error);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'No se pudo desuscribir'
      });
    } finally {
      setDesuscribiendoNotificaciones(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="alumno-perfil-loading">
          <div className="loading-spinner">Cargando perfil...</div>
        </div>
      </DashboardLayout>
    );
  }

  const nombreCompleto = `${formData.nombres} ${formData.apellido_paterno} ${formData.apellido_materno}`.trim();

  return (
    <DashboardLayout>
      <div className="alumno-perfil">
        <div className="page-header">
          <h1>Mi Perfil</h1>
          <p>Gestiona tu información personal y foto de perfil</p>
        </div>

        <form className="perfil-form" onSubmit={handleSubmit}>
          {/* Sección de Foto */}
          <div className="perfil-section mundo-card">
            <h2 className="section-title">Foto de Perfil</h2>
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
                    {getInitials(nombreCompleto || 'Alumno')}
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
                  disabled={uploadingPhoto}
                />
                📷 Cambiar Foto
              </label>
              <p className="foto-hint">Formatos: JPG, PNG, GIF, WEBP (máx. 5MB)</p>
            </div>
          </div>

          {/* Información Personal */}
          <div className="perfil-section mundo-card">
            <h2 className="section-title">Información Personal</h2>
            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="nombres">Nombres *</label>
                <input
                  type="text"
                  id="nombres"
                  name="nombres"
                  value={formData.nombres}
                  readOnly
                  className="readonly-input"
                  title="Este campo no se puede modificar"
                />
              </div>

              <div className="form-group">
                <label htmlFor="apellido_paterno">Apellido Paterno *</label>
                <input
                  type="text"
                  id="apellido_paterno"
                  name="apellido_paterno"
                  value={formData.apellido_paterno}
                  readOnly
                  className="readonly-input"
                  title="Este campo no se puede modificar"
                />
              </div>

              <div className="form-group">
                <label htmlFor="apellido_materno">Apellido Materno</label>
                <input
                  type="text"
                  id="apellido_materno"
                  name="apellido_materno"
                  value={formData.apellido_materno}
                  readOnly
                  className="readonly-input"
                  title="Este campo no se puede modificar"
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
                />
              </div>

              <div className="form-group">
                <label htmlFor="sexo">Sexo</label>
                <select
                  id="sexo"
                  name="sexo"
                  value={formData.sexo}
                  onChange={handleInputChange}
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
                />
              </div>
            </div>
          </div>

          <div className="perfil-section mundo-card">
            <h2 className="section-title">Salud</h2>
            <AlumnoSaludFields values={formData} onChange={handleInputChange} />
          </div>

          {/* Información de Solo Lectura */}
          {perfil && (
            <div className="perfil-section mundo-card">
              <h2 className="section-title">Información del Sistema</h2>
              <div className="info-grid" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                <div className="info-item" style={{ textAlign: 'center' }}>
                  <span className="info-label">DNI:</span>
                  <span className="info-value">{perfil.dni || 'N/A'}</span>
                </div>
              </div>
              
              {/* Información de Apoderados */}
              {((perfil.apoderados && perfil.apoderados.length > 0) || perfil.padre || perfil.madre) && (
                <div style={{ marginTop: '2rem', paddingTop: '2rem', borderTop: '2px solid #e5e7eb' }}>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: '600', color: '#374151', marginBottom: '1.5rem' }}>
                    👨‍👩‍👧‍👦 Apoderados
                  </h3>

                  <div style={{ display: 'grid', gap: '1.5rem' }}>
                    {(perfil.apoderados && perfil.apoderados.length > 0
                      ? perfil.apoderados
                      : [perfil.padre, perfil.madre].filter(Boolean).map((ap, idx) => ({
                          ...ap,
                          parentesco_nombre: idx === 0 ? 'Padre' : 'Madre'
                        }))
                    ).map((ap, idx) => (
                      <div
                        key={`${ap.id || ap.email || idx}-${idx}`}
                        style={{
                          padding: '1.25rem',
                          background: idx % 2 === 0
                            ? 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)'
                            : 'linear-gradient(135deg, #fdf2f8 0%, #fce7f3 100%)',
                          borderRadius: '12px',
                          border: idx % 2 === 0 ? '2px solid #bae6fd' : '2px solid #fbcfe8'
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            marginBottom: '1rem',
                            fontSize: '1rem',
                            fontWeight: '700',
                            color: idx % 2 === 0 ? '#1e40af' : '#9f1239'
                          }}
                        >
                          👤 {ap.parentesco_nombre || 'Apoderado'}
                        </div>
                        <div style={{ display: 'grid', gap: '0.75rem' }}>
                          <div className="info-item">
                            <span className="info-label">Nombre completo:</span>
                            <span className="info-value">
                              {`${ap.nombres || ''} ${ap.apellido_paterno || ''} ${ap.apellido_materno || ''}`.trim() || 'N/A'}
                            </span>
                          </div>
                          {ap.telefono_celular && (
                            <div className="info-item">
                              <span className="info-label">📱 Teléfono celular:</span>
                              <span className="info-value">{ap.telefono_celular}</span>
                            </div>
                          )}
                          {ap.telefono_fijo && (
                            <div className="info-item">
                              <span className="info-label">☎️ Teléfono fijo:</span>
                              <span className="info-value">{ap.telefono_fijo}</span>
                            </div>
                          )}
                          {ap.email && (
                            <div className="info-item">
                              <span className="info-label">✉️ Email:</span>
                              <span className="info-value">{ap.email}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Botones */}
          <div className="form-actions">
            <button type="button" className="btn-cancel" onClick={() => navigate('/alumno/dashboard')}>
              <span className="btn-icon">❌</span>
              Cancelar
            </button>
            <button type="submit" className="btn-save" disabled={saving}>
              <span className="btn-icon">💾</span>
              {saving ? 'Guardando...' : 'Guardar Cambios'}
            </button>
          </div>
        </form>

        <div className="perfil-section mundo-card">
          <h2 className="section-title">Emergencia y documentos</h2>
          <AlumnoPerfilExtra />
        </div>

        {/* Notificaciones Push */}
        <div className="perfil-section mundo-card">
          <h2 className="section-title">Notificaciones Push</h2>
          <div className="notificaciones-info">
            <p className="notificaciones-descripcion">
              Activa las notificaciones push para recibir alertas importantes en tu dispositivo, incluso cuando la aplicación esté cerrada.
            </p>
            {notificacionesEstado && (
              <div className="notificaciones-estado">
                <div className="estado-item">
                  <span className="estado-label">Estado:</span>
                  <span className={`estado-value estado-${notificacionesEstado.permiso}`}>
                    {notificacionesEstado.permiso === 'granted' ? '✅ Activadas' : 
                     notificacionesEstado.permiso === 'denied' ? '❌ Bloqueadas' : 
                     notificacionesEstado.permiso === 'default' ? '⚠️ No configuradas' : 
                     '❓ No disponible'}
                  </span>
                </div>
                {!notificacionesEstado.disponible && (
                  <p className="estado-mensaje">Tu navegador no soporta notificaciones push</p>
                )}
                {notificacionesEstado.permiso === 'denied' && (
                  <p className="estado-mensaje">
                    Las notificaciones están bloqueadas. Por favor, habilítalas en la configuración de tu navegador.
                  </p>
                )}
              </div>
            )}
            <div className="notificaciones-buttons">
              <button
                type="button"
                className="btn-activar-notificaciones"
                onClick={handleActivarNotificaciones}
                disabled={activandoNotificaciones || (tieneSuscripcionPush === true)}
              >
                {activandoNotificaciones ? (
                  <>
                    <span className="btn-icon">⏳</span>
                    Activando...
                  </>
                ) : tieneSuscripcionPush ? (
                  <>
                    <span className="btn-icon">✅</span>
                    Notificaciones Activadas
                  </>
                ) : (
                  <>
                    <span className="btn-icon">🔔</span>
                    Activar Notificaciones
                  </>
                )}
              </button>
              {notificacionesEstado?.permiso === 'granted' && tieneSuscripcionPush && (
                <button
                  type="button"
                  className="btn-desuscribir-notificaciones"
                  onClick={handleDesuscribirNotificaciones}
                  disabled={desuscribiendoNotificaciones || activandoNotificaciones}
                  title="Si no recibes notificaciones, desuscribir y volver a activar puede solucionarlo"
                >
                  {desuscribiendoNotificaciones ? (
                    <>⏳ Desuscribiendo...</>
                  ) : (
                    <>🔄 Desuscribir y renovar</>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Cambio de Contraseña - Fuera del formulario principal */}
        <div className="perfil-section mundo-card">
          <h2 className="section-title">Cambiar Contraseña</h2>
          {!showPasswordChange ? (
            <button 
              type="button" 
              className="btn-change-password"
              onClick={() => setShowPasswordChange(true)}
            >
              🔒 Cambiar Contraseña
            </button>
          ) : (
            <form onSubmit={handlePasswordSubmit} className="password-form">
              <div className="form-group">
                <label htmlFor="password_actual">Contraseña Actual *</label>
                <input
                  type="password"
                  id="password_actual"
                  name="password_actual"
                  value={passwordData.password_actual}
                  onChange={handlePasswordChange}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="password_nueva">Nueva Contraseña *</label>
                <input
                  type="password"
                  id="password_nueva"
                  name="password_nueva"
                  value={passwordData.password_nueva}
                  onChange={handlePasswordChange}
                  required
                  minLength={6}
                />
              </div>
              <div className="form-group">
                <label htmlFor="password_confirmar">Confirmar Nueva Contraseña *</label>
                <input
                  type="password"
                  id="password_confirmar"
                  name="password_confirmar"
                  value={passwordData.password_confirmar}
                  onChange={handlePasswordChange}
                  required
                  minLength={6}
                />
              </div>
              <div className="password-form-actions">
                <button 
                  type="button" 
                  className="btn-cancel"
                  onClick={() => {
                    setShowPasswordChange(false);
                    setPasswordData({
                      password_actual: '',
                      password_nueva: '',
                      password_confirmar: ''
                    });
                  }}
                >
                  <span className="btn-icon">❌</span>
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="btn-save"
                  disabled={changingPassword}
                >
                  <span className="btn-icon">💾</span>
                  {changingPassword ? 'Cambiando...' : 'Cambiar Contraseña'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

export default AlumnoPerfil;
