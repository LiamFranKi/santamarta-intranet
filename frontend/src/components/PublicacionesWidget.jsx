import React, { useState, useEffect, useRef } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import Swal from 'sweetalert2';
import './PublicacionesWidget.css';

// Función para normalizar URLs de imágenes
function normalizeImageUrl(url) {
  if (!url) return url;
  
  const currentHost = window.location.hostname;
  const currentProtocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
  
  // Si la URL es del dominio antiguo, reemplazarla
  let normalized = url;
  
  // Reemplazar vanguardschools.edu.pe/uploads por el dominio actual
  if (normalized.includes('vanguardschools.edu.pe/uploads')) {
    normalized = normalized.replace(/https?:\/\/vanguardschools\.edu\.pe\/uploads/g, `${currentProtocol}//${currentHost}/uploads`);
  }
  
  // Reemplazar vanguardschools.edu.pe/Static por el dominio del sistema PHP (nuevo.vanguardschools.edu.pe)
  if (normalized.includes('vanguardschools.edu.pe/Static')) {
    normalized = normalized.replace(/https?:\/\/vanguardschools\.edu\.pe\/Static/g, 'https://nuevo.vanguardschools.edu.pe/Static');
  }
  
  // Corregir URLs malformadas (sin barra después del dominio)
  normalized = normalized.replace(/vanguardschools\.com(static|uploads)/gi, (match, path) => {
    return `https://nuevo.vanguardschools.edu.pe/Static${path === 'static' ? '' : ''}`;
  });
  
  return normalized;
}

function PublicacionesWidget() {
  const { user } = useAuth();
  const esAlumno = user?.tipo === 'ALUMNO';
  const [publicaciones, setPublicaciones] = useState([]);
  const [publicacionesMostradas, setPublicacionesMostradas] = useState(5);
  const [grupos, setGrupos] = useState([]);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [formData, setFormData] = useState({
    contenido: '',
    compartir_con: 'todos',
    grupos_seleccionados: []
  });
  const [imagenPreview, setImagenPreview] = useState(null);
  const [imagenFile, setImagenFile] = useState(null);
  const [archivoFile, setArchivoFile] = useState(null);
  const [archivoNombre, setArchivoNombre] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [mostrarCamara, setMostrarCamara] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [imagenModal, setImagenModal] = useState(null); // Para el modal de imagen
  const cameraInputRef = useRef(null); // Referencia para input de cámara en móvil

  useEffect(() => {
    cargarPublicaciones();
    cargarGrupos();
  }, []);

  const cargarPublicaciones = async () => {
    try {
      // Usar ruta según el tipo de usuario
      const ruta = esAlumno ? '/alumno/publicaciones' : '/docente/publicaciones';
      const response = await api.get(ruta);
      const publicacionesData = response.data.publicaciones || [];
      console.log('📰 Publicaciones cargadas:', publicacionesData.length);
      
      // Log para depurar imágenes
      publicacionesData.forEach((pub, idx) => {
        if (pub.images && pub.images.length > 0) {
          console.log(`📸 Publicación ${idx + 1} (ID: ${pub.id}) tiene ${pub.images.length} imagen(es):`, pub.images);
        }
      });
      
      setPublicaciones(publicacionesData);
      // Resetear contador cuando se cargan nuevas publicaciones
      if (publicacionesData.length > 0) {
        setPublicacionesMostradas(5);
      }
    } catch (error) {
      console.error('Error cargando publicaciones:', error);
    }
  };

  const cargarGrupos = async () => {
    // Solo cargar grupos si es docente (alumnos no pueden crear publicaciones)
    if (esAlumno) {
      setGrupos([]);
      return;
    }
    try {
      const response = await api.get('/docente/grupos');
      setGrupos(response.data.grupos || []);
    } catch (error) {
      console.error('Error cargando grupos:', error);
    }
  };

  const handleImagenChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        Swal.fire({
          icon: 'warning',
          title: 'Archivo muy grande',
          text: 'La imagen no debe superar los 10MB',
          toast: true,
          position: 'top-end',
          showConfirmButton: false,
          timer: 3000
        });
        return;
      }
      
      setImagenFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagenPreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleArchivoChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 50 * 1024 * 1024) {
        Swal.fire({
          icon: 'warning',
          title: 'Archivo muy grande',
          text: 'El archivo no debe superar los 50MB',
          toast: true,
          position: 'top-end',
          showConfirmButton: false,
          timer: 3000
        });
        return;
      }
      setArchivoFile(file);
      setArchivoNombre(file.name);
    }
  };

  const iniciarCamara = async () => {
    // Detectar si es móvil, tablet o desktop
    // Mejorar detección para incluir tablets Android y otros dispositivos táctiles
    const userAgent = navigator.userAgent || navigator.vendor || window.opera;
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
    // Detectar tablets específicamente (Android tablets, iPad, etc.)
    const isTablet = /iPad|Android/i.test(userAgent) && !window.MSStream && 
                     (window.screen.width >= 768 || window.screen.height >= 768 || 
                      (window.screen.width >= 600 && window.screen.height >= 600));
    // Detectar si es un dispositivo táctil
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    
    // En móviles, tablets o dispositivos táctiles, usar el atributo capture que es más confiable
    if (isMobile || isTablet || isTouchDevice) {
      // Crear o usar input file con capture para abrir cámara directamente
      if (cameraInputRef.current) {
        cameraInputRef.current.click();
      } else {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.capture = 'environment'; // Cámara trasera en móvil/tablet
        input.onchange = (e) => {
          const file = e.target.files[0];
          if (file) {
            handleImagenChange({ target: { files: [file] } });
          }
        };
        cameraInputRef.current = input;
        input.click();
      }
      return;
    }
    
    // En desktop, usar getUserMedia para vista previa
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'user' } // Webcam en desktop
      });
      
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setMostrarCamara(true);
      }
    } catch (error) {
      console.error('Error accediendo a la cámara:', error);
      
      // Si no hay cámara disponible, ofrecer subir imagen
      const result = await Swal.fire({
        icon: 'warning',
        title: 'Cámara no disponible',
        text: 'No se pudo acceder a la cámara. ¿Deseas subir una imagen desde tu dispositivo?',
        showCancelButton: true,
        confirmButtonText: 'Sí, subir imagen',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#4a83c1',
        cancelButtonColor: '#6b7280'
      });
      
      if (result.isConfirmed) {
        // Crear un input file temporal y activarlo
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = (e) => {
          const file = e.target.files[0];
          if (file) {
            handleImagenChange({ target: { files: [file] } });
          }
        };
        input.click();
      }
    }
  };

  const capturarFoto = () => {
    if (videoRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(videoRef.current, 0, 0);
      
      canvas.toBlob((blob) => {
        const file = new File([blob], `foto-${Date.now()}.jpg`, { type: 'image/jpeg' });
        setImagenFile(file);
        setImagenPreview(URL.createObjectURL(blob));
        detenerCamara();
      }, 'image/jpeg', 0.9);
    }
  };

  const detenerCamara = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setMostrarCamara(false);
  };

  const handleEliminar = async (publicacionId) => {
    const result = await Swal.fire({
      title: '¿Eliminar publicación?',
      text: 'Esta acción no se puede deshacer',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    });

    if (result.isConfirmed) {
      try {
        await api.delete(`/docente/publicaciones/${publicacionId}`);
        Swal.fire({
          icon: 'success',
          title: 'Eliminada',
          text: 'La publicación ha sido eliminada',
          toast: true,
          position: 'top-end',
          showConfirmButton: false,
          timer: 2000
        });
        cargarPublicaciones();
      } catch (error) {
        console.error('Error eliminando publicación:', error);
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: 'No se pudo eliminar la publicación',
          toast: true,
          position: 'top-end',
          showConfirmButton: false,
          timer: 3000
        });
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.contenido.trim()) {
      Swal.fire({
        icon: 'warning',
        title: 'Contenido requerido',
        text: 'Por favor escribe algo para compartir',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000
      });
      return;
    }

    if (formData.compartir_con === 'grupos' && formData.grupos_seleccionados.length === 0) {
      Swal.fire({
        icon: 'warning',
        title: 'Selecciona grupos',
        text: 'Por favor selecciona al menos un grupo',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000
      });
      return;
    }

    try {
      setEnviando(true);
      const formDataToSend = new FormData();
      formDataToSend.append('contenido', formData.contenido);
      formDataToSend.append('compartir_con', formData.compartir_con);
      
      if (formData.compartir_con === 'grupos') {
        formDataToSend.append('grupos_ids', JSON.stringify(formData.grupos_seleccionados));
      }
      
      if (imagenFile) {
        console.log('📤 Enviando imagen:', imagenFile.name, imagenFile.type, imagenFile.size, 'bytes');
        formDataToSend.append('imagen', imagenFile);
      } else {
        console.log('⚠️ No hay imagen para enviar');
      }

      if (archivoFile) {
        formDataToSend.append('archivo', archivoFile);
      }

      await api.post('/docente/publicaciones', formDataToSend, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      Swal.fire({
        icon: 'success',
        title: '¡Publicado!',
        text: 'Tu publicación se ha compartido correctamente',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000,
        timerProgressBar: true
      });

      setMostrarFormulario(false);
      setFormData({ contenido: '', compartir_con: 'todos', grupos_seleccionados: [] });
      setImagenPreview(null);
      setImagenFile(null);
      setArchivoFile(null);
      setArchivoNombre(null);
      detenerCamara();
      
      // Recargar publicaciones después de un delay para asegurar que se guardó
      setTimeout(() => {
        cargarPublicaciones();
      }, 1000);
    } catch (error) {
      console.error('Error publicando:', error);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'No se pudo publicar',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000
      });
    } finally {
      setEnviando(false);
    }
  };

  const toggleGrupo = (grupoId) => {
    setFormData(prev => ({
      ...prev,
      grupos_seleccionados: prev.grupos_seleccionados.includes(grupoId)
        ? prev.grupos_seleccionados.filter(id => id !== grupoId)
        : [...prev.grupos_seleccionados, grupoId]
    }));
  };

  return (
    <div className="publicaciones-widget">
      <h3 className="widget-title">Publicaciones</h3>
      
      {/* Solo mostrar botón de crear si es docente o administrador */}
      {!esAlumno && !mostrarFormulario && (
        <button className="btn-nueva-publicacion btn-primary btn-block" onClick={() => setMostrarFormulario(true)}>
          <span className="btn-icon">📝</span>
          <span>¿Tienes algo que compartir?</span>
        </button>
      )}
      
      {/* Formulario de creación */}
      {!esAlumno && mostrarFormulario && (
        <form className="publicacion-form" onSubmit={handleSubmit}>
          <textarea
            placeholder="¿Tienes algo que compartir?"
            value={formData.contenido}
            onChange={(e) => setFormData({ ...formData, contenido: e.target.value })}
            rows="4"
            required
          />
          
          {/* Tres iconos para agregar contenido */}
          <div className="form-icons">
            <label className="icon-btn" title="Agregar imagen">
              <span className="icon-text">📷</span>
              <span className="icon-label">Agregar imagen</span>
              <input
                type="file"
                accept="image/*"
                onChange={handleImagenChange}
                style={{ display: 'none' }}
              />
            </label>
            
            {/* En móviles, tablets o dispositivos táctiles, usar input con capture directamente */}
            {(() => {
              const userAgent = navigator.userAgent || navigator.vendor || window.opera;
              const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
              const isTablet = /iPad|Android/i.test(userAgent) && !window.MSStream && 
                               (window.screen.width >= 768 || window.screen.height >= 768 || 
                                (window.screen.width >= 600 && window.screen.height >= 600));
              const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
              
              return (isMobile || isTablet || isTouchDevice) ? (
                <label className="icon-btn" title="Tomar foto">
                  <span className="icon-text">📸</span>
                  <span className="icon-label">Tomar foto</span>
                  <input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleImagenChange}
                    style={{ display: 'none' }}
                  />
                </label>
              ) : (
                <button 
                  type="button" 
                  className="icon-btn" 
                  onClick={mostrarCamara ? detenerCamara : iniciarCamara}
                  title="Tomar foto"
                >
                  <span className="icon-text">📸</span>
                  <span className="icon-label">Tomar foto</span>
                </button>
              );
            })()}
            
            <label className="icon-btn" title="Agregar archivo">
              <span className="icon-text">📎</span>
              <span className="icon-label">Agregar archivo</span>
              <input
                type="file"
                onChange={handleArchivoChange}
                style={{ display: 'none' }}
              />
            </label>
          </div>

          {/* Vista previa de cámara */}
          {mostrarCamara && (
            <div className="camera-preview">
              <video ref={videoRef} autoPlay playsInline className="camera-video"></video>
              <div className="camera-controls">
                <button type="button" onClick={detenerCamara} className="btn-cancelar-camara">
                  Cancelar
                </button>
                <button type="button" onClick={capturarFoto} className="btn-capturar">
                  Capturar
                </button>
              </div>
            </div>
          )}
          
          {/* Preview de imagen */}
          {imagenPreview && !mostrarCamara && (
            <div className="imagen-preview">
              <img src={imagenPreview} alt="Preview" />
              <button 
                type="button" 
                onClick={() => {
                  setImagenPreview(null);
                  setImagenFile(null);
                }}
                className="btn-eliminar-preview"
              >
                ✕
              </button>
            </div>
          )}

          {/* Preview de archivo */}
          {archivoNombre && (
            <div className="archivo-preview">
              <span>📎 {archivoNombre}</span>
              <button 
                type="button" 
                onClick={() => {
                  setArchivoFile(null);
                  setArchivoNombre(null);
                }}
                className="btn-eliminar-preview"
              >
                ✕
              </button>
            </div>
          )}
          
          {/* Selector de compartir con */}
          <div className="compartir-con">
            <label>Compartir con:</label>
            <div className="compartir-opciones">
              <label className="radio-option">
                <input
                  type="radio"
                  value="todos"
                  checked={formData.compartir_con === 'todos'}
                  onChange={(e) => setFormData({ ...formData, compartir_con: e.target.value, grupos_seleccionados: [] })}
                />
                <span>Todos</span>
              </label>
              
              <label className="radio-option">
                <input
                  type="radio"
                  value="grupos"
                  checked={formData.compartir_con === 'grupos'}
                  onChange={(e) => setFormData({ ...formData, compartir_con: e.target.value })}
                />
                <span>Grupos específicos</span>
              </label>
            </div>

            {/* Selector de grupos (solo si se selecciona "grupos") */}
            {formData.compartir_con === 'grupos' && (
              <div className="grupos-selector">
                {grupos.map(grupo => (
                  <label key={grupo.id} className="grupo-checkbox">
                    <input
                      type="checkbox"
                      checked={formData.grupos_seleccionados.includes(grupo.id)}
                      onChange={() => toggleGrupo(grupo.id)}
                    />
                    <span>{grupo.nivel_nombre} {grupo.grado}° {grupo.seccion}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
          
          <div className="form-actions">
            <button 
              type="button" 
              className="btn-secondary"
              onClick={() => {
                setMostrarFormulario(false);
                setFormData({ contenido: '', compartir_con: 'todos', grupos_seleccionados: [] });
                setImagenPreview(null);
                setImagenFile(null);
                setArchivoFile(null);
                setArchivoNombre(null);
                detenerCamara();
              }}
            >
              <span className="btn-icon">✕</span>
              <span>Cancelar</span>
            </button>
            <button type="submit" className="btn-primary" disabled={enviando}>
              <span className="btn-icon">{enviando ? '⏳' : '📤'}</span>
              <span>{enviando ? 'Compartiendo...' : 'Compartir'}</span>
            </button>
          </div>
        </form>
      )}

      <div className="publicaciones-feed">
        {publicaciones.slice(0, publicacionesMostradas).map((pub) => (
          <div key={pub.id} className="publicacion-item">
            {/* Nombre del autor con botón eliminar al lado */}
            <div className="publicacion-header-nombre">
              <div className="publicacion-autor-container">
                {/* Foto del autor o placeholder con iniciales */}
                {pub.autor_foto_url ? (
                  <img 
                    src={pub.autor_foto_url} 
                    alt={pub.autor_nombre_completo || 'Usuario'}
                    className="publicacion-autor-foto"
                    onError={(e) => {
                      e.target.style.display = 'none';
                      const placeholder = e.target.nextElementSibling;
                      if (placeholder) placeholder.style.display = 'flex';
                    }}
                  />
                ) : null}
                <div 
                  className="publicacion-autor-placeholder"
                  style={{ display: pub.autor_foto_url ? 'none' : 'flex' }}
                >
                  {(() => {
                    const nombre = pub.autor_nombre_completo || pub.autor_usuario || 'Docente';
                    const partes = nombre.trim().split(/\s+/);
                    if (partes.length >= 2) {
                      return (partes[0].charAt(0) + partes[partes.length - 1].charAt(0)).toUpperCase();
                    }
                    return nombre.charAt(0).toUpperCase();
                  })()}
                </div>
                <span className="publicacion-autor">{pub.autor_nombre_completo || pub.autor_usuario || 'Docente'}</span>
              </div>
              {/* Botón eliminar solo para el autor */}
              {user && pub.autor_id === user.id && (
                <button
                  className="btn-eliminar-publicacion"
                  onClick={() => handleEliminar(pub.id)}
                  title="Eliminar publicación"
                >
                  🗑️
                </button>
              )}
            </div>
            
            {/* Fecha debajo del nombre */}
            <div className="publicacion-fecha-container">
              <span className="publicacion-fecha">
                {new Date(pub.fecha_hora).toLocaleDateString('es-PE', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </span>
            </div>
            
            {/* Contenido */}
            <div className="publicacion-contenido">
              <p>{pub.contenido}</p>
              {pub.images && Array.isArray(pub.images) && pub.images.length > 0 && (
                <div className="publicacion-imagenes">
                  {pub.images.slice(0, 3).map((imagenUrl, idx) => {
                    // Normalizar URL: convertir URLs del sistema anterior al dominio correcto
                    let urlCompleta;
                    if (imagenUrl.startsWith('http')) {
                      // Si es una URL completa, normalizarla
                      urlCompleta = normalizeImageUrl(imagenUrl);
                    } else {
                      // Si es relativa, construir URL completa
                      const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
                      urlCompleta = `${protocol}//${window.location.hostname}${imagenUrl.startsWith('/') ? '' : '/'}${imagenUrl}`;
                    }
                    
                    return (
                      <img 
                        key={idx}
                        src={urlCompleta} 
                        alt={`Publicación ${idx + 1}`}
                        className={pub.images.length === 1 ? 'imagen-sola' : 'imagen-multiple'}
                        onClick={() => setImagenModal(urlCompleta)}
                        onError={(e) => {
                          console.error('Error cargando imagen:', imagenUrl, '→', urlCompleta);
                          e.target.style.display = 'none';
                        }}
                        style={{ cursor: 'pointer' }}
                      />
                    );
                  })}
                  {pub.images.length > 3 && (
                    <div className="imagen-mas">+{pub.images.length - 3} más</div>
                  )}
                </div>
              )}
              {pub.archivos && pub.archivos.length > 0 && (
                <div className="publicacion-archivos">
                  {pub.archivos.map((archivo, idx) => {
                    // El sistema PHP guarda solo el nombre del archivo (ej: "archivo.pdf")
                    // IMPORTANTE: Usar el mismo dominio del sistema PHP para servir archivos
                    // Esto asegura que Apache los sirva exactamente igual que el sistema PHP
                    let archivoUrl;
                    if (archivo.startsWith('http')) {
                      // Ya es una URL completa
                      archivoUrl = archivo;
                    } else if (archivo.startsWith('/Static/')) {
                      // Es una ruta completa del sistema antiguo (compatibilidad)
                      // Usar el dominio del sistema PHP para servir archivos
                      archivoUrl = `https://nuevo.vanguardschools.edu.pe${archivo}`;
                    } else {
                      // Es solo el nombre del archivo (formato del sistema PHP)
                      // Usar el dominio del sistema PHP para servir archivos (igual que el sistema anterior)
                      archivoUrl = `https://nuevo.vanguardschools.edu.pe/Static/Archivos/${archivo}`;
                    }
                    
                    // Obtener el nombre del archivo y su extensión
                    const nombreArchivo = archivo.split('/').pop() || `Archivo ${idx + 1}`;
                    const extension = nombreArchivo.split('.').pop()?.toLowerCase() || 'pdf';
                    
                    // Mostrar nombre más corto y legible
                    const nombreMostrar = extension === 'pdf' ? 'Archivo.pdf' : 
                                         extension === 'doc' || extension === 'docx' ? 'Archivo.docx' :
                                         extension === 'xls' || extension === 'xlsx' ? 'Archivo.xlsx' :
                                         extension === 'ppt' || extension === 'pptx' ? 'Archivo.pptx' :
                                         `Archivo.${extension}`;
                    
                    return (
                      <a 
                        key={idx}
                        href={archivoUrl}
                        download
                        target="_blank"
                        rel="noopener noreferrer"
                        className="archivo-link"
                      >
                        📎 {nombreMostrar}
                      </a>
                    );
                  })}
                </div>
              )}
            </div>
            
            {/* "Para: [quién]" al final */}
            <div className="publicacion-para-container">
              <span className="publicacion-para">Para: {pub.para_texto || 'Todos'}</span>
            </div>
          </div>
        ))}
        
        {/* Botón "Cargar Más" cada 5 publicaciones */}
        {publicaciones.length > publicacionesMostradas && (
          <button 
            className="btn-cargar-mas btn-outline btn-block"
            onClick={() => setPublicacionesMostradas(prev => prev + 5)}
          >
            <span className="btn-icon">📄</span>
            <span>Cargar Más</span>
          </button>
        )}
      </div>

      {/* Modal para ver imagen en grande */}
      {imagenModal && (
        <div className="imagen-modal-overlay" onClick={() => setImagenModal(null)}>
          <div className="imagen-modal-content" onClick={(e) => e.stopPropagation()}>
            <button 
              className="imagen-modal-close"
              onClick={() => setImagenModal(null)}
              title="Cerrar"
            >
              ✕
            </button>
            <img 
              src={imagenModal} 
              alt="Imagen ampliada"
              className="imagen-modal-img"
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default PublicacionesWidget;
