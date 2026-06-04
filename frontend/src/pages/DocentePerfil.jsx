import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { suscribirNotificacionesPush, desuscribirNotificacionesPush, verificarEstadoNotificaciones, tieneSuscripcionPushActiva } from '../services/pushNotificationService';
import Swal from 'sweetalert2';
import './DocentePerfil.css';

// Función para obtener iniciales del nombre
function getInitials(nombre) {
  if (!nombre) return 'D';
  const parts = String(nombre).trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase()).join('') || 'D';
}

function DocentePerfil({ apiPrefix = '/docente', dashboardPath = '/docente/dashboard' }) {
  const navigate = useNavigate();
  const { user, setUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [perfil, setPerfil] = useState(null);
  const [formData, setFormData] = useState({
    nombres: '',
    apellidos: '',
    email: '',
    telefono_celular: '',
    direccion: '',
    fecha_nacimiento: ''
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
      const response = await api.get(`${apiPrefix}/perfil`);
      const data = response.data;
      setPerfil(data);
      setFormData({
        nombres: data.nombres || '',
        apellidos: data.apellidos || '',
        email: data.email || '',
        telefono_celular: data.telefono_celular || '',
        direccion: data.direccion || '',
        fecha_nacimiento: data.fecha_nacimiento 
          ? (data.fecha_nacimiento.includes('T') 
              ? data.fecha_nacimiento.split('T')[0] 
              : data.fecha_nacimiento.split(' ')[0])
          : ''
      });
      
      // Cargar foto si existe
      // IMPORTANTE: Usar el mismo dominio del sistema PHP para servir fotos (igual que publicaciones)
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
      
      Object.keys(formData).forEach(key => {
        formDataToSend.append(key, formData[key]);
      });
      
      if (fotoFile) {
        formDataToSend.append('foto', fotoFile);
      }

      const response = await api.put(`${apiPrefix}/perfil`, formDataToSend, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      // Ocultar indicador de subida después de un breve delay (la subida continúa en segundo plano)
      if (fotoFile) {
        setTimeout(() => {
          setUploadingPhoto(false);
        }, 2000); // Ocultar después de 2 segundos (la subida continúa en segundo plano)
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

      // Recargar perfil completo desde el servidor para asegurar datos actualizados
      await cargarPerfil();
      
      // Actualizar usuario en AuthContext para que se refleje en el navbar
      if (response.data.perfil || response.data.docente) {
        const perfilActualizado = response.data.perfil || response.data.docente;
        
        if (user && perfilActualizado) {
          // Construir URL completa de la foto para el contexto
          // IMPORTANTE: Usar el mismo dominio del sistema PHP para servir fotos (igual que publicaciones)
          let fotoUrlForContext = null;
          if (perfilActualizado.foto) {
            if (perfilActualizado.foto.startsWith('http')) {
              // Ya es una URL completa
              fotoUrlForContext = perfilActualizado.foto;
            } else if (perfilActualizado.foto.startsWith('/Static/')) {
              // Es una ruta completa del sistema anterior
              fotoUrlForContext = `https://sistema.vanguardschools.edu.pe${perfilActualizado.foto}`;
            } else if (perfilActualizado.foto.startsWith('/uploads/')) {
              // Es una ruta de uploads (compatibilidad con archivos antiguos)
              const currentProtocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
              const currentHost = window.location.hostname;
              fotoUrlForContext = `${currentProtocol}//${currentHost}${perfilActualizado.foto}`;
            } else {
              // Es solo el nombre del archivo (formato del sistema PHP, igual que publicaciones)
              fotoUrlForContext = `https://sistema.vanguardschools.edu.pe/Static/Image/Fotos/${perfilActualizado.foto}`;
            }
          }
          
          const updatedUser = {
            ...user,
            foto: fotoUrlForContext || user.foto,
            nombres: perfilActualizado.nombres || user.nombres,
            apellidos: perfilActualizado.apellidos || user.apellidos,
            email: perfilActualizado.email || user.email,
            telefono_celular: perfilActualizado.telefono_celular || user.telefono_celular,
            direccion: perfilActualizado.direccion || user.direccion
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
      await api.put(`${apiPrefix}/perfil/password`, {
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
        setTieneSuscripcionPush(false);
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
        <div className="docente-perfil-loading">
          <div className="loading-spinner">Cargando perfil...</div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="docente-perfil">
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
                    {getInitials(formData.nombres && formData.apellidos ? `${formData.nombres} ${formData.apellidos}` : formData.nombres || 'Docente')}
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
                  onChange={handleInputChange}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="apellidos">Apellidos *</label>
                <input
                  type="text"
                  id="apellidos"
                  name="apellidos"
                  value={formData.apellidos}
                  onChange={handleInputChange}
                  required
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
                <label htmlFor="telefono_celular">Teléfono Celular</label>
                <input
                  type="tel"
                  id="telefono_celular"
                  name="telefono_celular"
                  value={formData.telefono_celular}
                  onChange={handleInputChange}
                />
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

              <div className="form-group">
                <label htmlFor="direccion">Dirección</label>
                <input
                  type="text"
                  id="direccion"
                  name="direccion"
                  value={formData.direccion}
                  onChange={handleInputChange}
                />
              </div>
            </div>
          </div>

          {/* Información de Solo Lectura */}
          {perfil && (
            <div className="perfil-section mundo-card">
              <h2 className="section-title">Información del Sistema</h2>
              <div className="info-grid">
                <div className="info-item">
                  <span className="info-label">DNI:</span>
                  <span className="info-value">{perfil.dni || 'N/A'}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">Cargo:</span>
                  <span className="info-value">{perfil.cargo || 'N/A'}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">Profesión:</span>
                  <span className="info-value">{perfil.profesion || 'N/A'}</span>
                </div>
                {perfil.fecha_ingreso && (
                  <div className="info-item">
                    <span className="info-label">Fecha de Ingreso:</span>
                    <span className="info-value">
                      {new Date(perfil.fecha_ingreso).toLocaleDateString('es-PE')}
                    </span>
                  </div>
                )}
                {perfil.hora_entrada && (
                  <div className="info-item">
                    <span className="info-label">Hora de Entrada:</span>
                    <span className="info-value">
                      {perfil.hora_entrada}
                    </span>
                  </div>
                )}
                {perfil.hora_salida && (
                  <div className="info-item">
                    <span className="info-label">Hora de Salida:</span>
                    <span className="info-value">
                      {perfil.hora_salida}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Botones */}
          <div className="form-actions">
            <button type="button" className="btn-cancel" onClick={() => navigate(dashboardPath)}>
              <span className="btn-icon">❌</span>
              Cancelar
            </button>
            <button type="submit" className="btn-save" disabled={saving}>
              <span className="btn-icon">💾</span>
              {saving ? 'Guardando...' : 'Guardar Cambios'}
            </button>
          </div>
        </form>

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

export default DocentePerfil;

