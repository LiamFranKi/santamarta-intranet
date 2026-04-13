import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { fotoUsuarioAdmin } from '../utils/adminUsuariosFoto';
import { suscribirNotificacionesPush, desuscribirNotificacionesPush, verificarEstadoNotificaciones, tieneSuscripcionPushActiva } from '../services/pushNotificationService';
import Swal from 'sweetalert2';
import './AlumnoPerfil.css';

// Función para obtener iniciales del nombre
function getInitials(nombre) {
  if (!nombre) return 'A';
  const parts = String(nombre).trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase()).join('') || 'A';
}

/** Misma lógica que AlumnoPerfil / navbar: URL usable en `user.foto` para DashboardLayout */
function buildFotoUrlForContext(fotoRaw) {
  if (fotoRaw == null || String(fotoRaw).trim() === '') return null;
  const foto = String(fotoRaw).trim();
  if (foto.startsWith('http')) return foto;
  if (foto.startsWith('/Static/')) {
    return `https://nuevo.vanguardschools.edu.pe${foto}`;
  }
  if (foto.startsWith('/uploads/')) {
    const currentProtocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
    const currentHost = window.location.hostname;
    return `${currentProtocol}//${currentHost}${foto}`;
  }
  return fotoUsuarioAdmin(foto);
}

function ApoderadoPerfil() {
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [perfil, setPerfil] = useState(null);
  const [formData, setFormData] = useState({
    nombres: '',
    apellido_paterno: '',
    apellido_materno: '',
    nro_documento: '',
    estado_civil: '',
    telefono_celular: '',
    direccion: '',
    fecha_nacimiento: '',
    email: ''
  });
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
  const [fotoPreview, setFotoPreview] = useState(null);
  const [fotoFile, setFotoFile] = useState(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

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
      const response = await api.get('/apoderado/perfil');
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
        nro_documento: data.nro_documento || data.dni || '',
        estado_civil: data.estado_civil !== undefined && data.estado_civil !== null ? String(data.estado_civil) : '',
        telefono_celular: data.telefono_celular || '',
        direccion: data.direccion || '',
        fecha_nacimiento: formatearFechaParaInput(data.fecha_nacimiento),
        email: data.email || ''
      });

      if (data.foto && String(data.foto).trim() !== '') {
        setFotoPreview(fotoUsuarioAdmin(data.foto));
      } else {
        setFotoPreview(null);
      }
      setFotoFile(null);

      setUser((prev) => {
        if (!prev || prev.tipo !== 'APODERADO') return prev;
        const fotoUrl = buildFotoUrlForContext(data.foto);
        const next = {
          ...prev,
          foto: fotoUrl || prev.foto,
          foto_nombre:
            data.foto && !String(data.foto).startsWith('http') ? data.foto : prev.foto_nombre,
          nombres: data.nombres ?? prev.nombres,
          apellido_paterno: data.apellido_paterno ?? prev.apellido_paterno,
          apellido_materno: data.apellido_materno ?? prev.apellido_materno,
          email: data.email ?? prev.email,
        };
        try {
          localStorage.setItem('user', JSON.stringify(next));
        } catch (_) {
          /* ignore */
        }
        return next;
      });
      return data;
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
      return null;
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
    const file = e.target.files?.[0];
    if (file) {
      setFotoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        if (reader.result) setFotoPreview(reader.result);
      };
      reader.readAsDataURL(file);
    } else {
      setFotoFile(null);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      setSaving(true);
      const habiaFotoNueva = Boolean(fotoFile);
      if (habiaFotoNueva) {
        setUploadingPhoto(true);
      }

      if (fotoFile) {
        const fd = new FormData();
        fd.append('foto', fotoFile);
        await api.put('/apoderado/perfil/foto', fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        setFotoFile(null);
      }

      await api.put('/apoderado/perfil', {
        nombres: formData.nombres,
        apellido_paterno: formData.apellido_paterno,
        apellido_materno: formData.apellido_materno,
        estado_civil: formData.estado_civil ? parseInt(formData.estado_civil) : null,
        telefono_celular: formData.telefono_celular,
        direccion: formData.direccion,
        fecha_nacimiento: formData.fecha_nacimiento,
        email: formData.email
      });

      Swal.fire({
        icon: 'success',
        title: '¡Perfil actualizado!',
        text: habiaFotoNueva
          ? 'Perfil actualizado. Si cambiaste la foto, también se actualizó en la barra superior.'
          : 'Tu perfil se ha actualizado correctamente',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000,
        timerProgressBar: true
      });

      await cargarPerfil();

      if (habiaFotoNueva) {
        setTimeout(() => setUploadingPhoto(false), 800);
      }
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
      await api.put('/apoderado/perfil/password', {
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
          <div className="perfil-section mundo-card">
            <h2 className="section-title">Foto de perfil</h2>
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
                    {getInitials(nombreCompleto || 'Apoderado')}
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
              <label
                className="foto-upload-btn"
                style={{ opacity: uploadingPhoto ? 0.6 : 1, pointerEvents: uploadingPhoto ? 'none' : 'auto' }}
              >
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFotoChange}
                  style={{ display: 'none' }}
                  disabled={uploadingPhoto}
                />
                📷 Cambiar foto
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
                <label htmlFor="apellido_paterno">Apellido Paterno *</label>
                <input
                  type="text"
                  id="apellido_paterno"
                  name="apellido_paterno"
                  value={formData.apellido_paterno}
                  onChange={handleInputChange}
                  required
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
                />
              </div>

              <div className="form-group">
                <label htmlFor="nro_documento">DNI *</label>
                <input
                  type="text"
                  id="nro_documento"
                  name="nro_documento"
                  value={formData.nro_documento}
                  readOnly
                  className="readonly-input"
                  title="Este campo no se puede modificar"
                />
              </div>

              <div className="form-group">
                <label htmlFor="estado_civil">Estado Civil</label>
                <select
                  id="estado_civil"
                  name="estado_civil"
                  value={formData.estado_civil}
                  onChange={handleInputChange}
                >
                  <option value="">Seleccionar...</option>
                  <option value="0">Soltero</option>
                  <option value="1">Casado</option>
                  <option value="2">Divorciado</option>
                  <option value="3">Conviviente</option>
                  <option value="4">Viudo</option>
                </select>
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
                <label htmlFor="direccion">Dirección</label>
                <input
                  type="text"
                  id="direccion"
                  name="direccion"
                  value={formData.direccion}
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
            </div>
          </div>

          {/* Botones */}
          <div className="form-actions">
            <button type="button" className="btn-cancel" onClick={() => navigate('/apoderado/dashboard')}>
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

        {/* Cambio de Contraseña */}
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

export default ApoderadoPerfil;

