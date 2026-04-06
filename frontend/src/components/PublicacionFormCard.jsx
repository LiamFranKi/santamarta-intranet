import React, { useState, useRef, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import Swal from 'sweetalert2';
import '../components/PublicacionesWidget.css';

function PublicacionFormCard({ onPublicacionCreada, onCancel }) {
  const { user } = useAuth();
  const esAlumno = user?.tipo === 'ALUMNO';
  const [grupos, setGrupos] = useState([]);
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
  const cameraInputRef = useRef(null);

  useEffect(() => {
    if (!esAlumno) {
      cargarGrupos();
    }
  }, [esAlumno, user?.tipo]);

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
      const response = await api.get('/docente/grupos', { params: { alcance: 'publicaciones' } });
      const lista = response.data.grupos || [];
      setGrupos([...lista].sort(ordenarGrupos));
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
    const userAgent = navigator.userAgent || navigator.vendor || window.opera;
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
    const isTablet = /iPad|Android/i.test(userAgent) && !window.MSStream && 
                     (window.screen.width >= 768 || window.screen.height >= 768 || 
                      (window.screen.width >= 600 && window.screen.height >= 600));
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    
    if (isMobile || isTablet || isTouchDevice) {
      if (cameraInputRef.current) {
        cameraInputRef.current.click();
      } else {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.capture = 'environment';
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
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'user' }
      });
      
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setMostrarCamara(true);
      }
    } catch (error) {
      console.error('Error accediendo a la cámara:', error);
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
        formDataToSend.append('imagen', imagenFile);
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

      setFormData({ contenido: '', compartir_con: 'todos', grupos_seleccionados: [] });
      setImagenPreview(null);
      setImagenFile(null);
      setArchivoFile(null);
      setArchivoNombre(null);
      detenerCamara();
      
      if (onPublicacionCreada) {
        // Recargar publicaciones después de un delay
        setTimeout(() => {
          onPublicacionCreada();
        }, 1000);
      }
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

  if (esAlumno) {
    return null;
  }

  const limpiarFormulario = () => {
    setFormData({ contenido: '', compartir_con: 'todos', grupos_seleccionados: [] });
    setImagenPreview(null);
    setImagenFile(null);
    setArchivoFile(null);
    setArchivoNombre(null);
    detenerCamara();
  };

  return (
    <form className="publicacion-form" onSubmit={handleSubmit}>
      <textarea
        placeholder="¿Tienes algo que compartir?"
        value={formData.contenido}
        onChange={(e) => setFormData({ ...formData, contenido: e.target.value })}
        rows="4"
        required
      />
      
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
            limpiarFormulario();
            if (typeof onCancel === 'function') onCancel();
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
  );
}

export default PublicacionFormCard;

