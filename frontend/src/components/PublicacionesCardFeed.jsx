import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import Swal from 'sweetalert2';
import '../components/PublicacionesWidget.css';

// Función para normalizar URLs de imágenes
function normalizeImageUrl(url) {
  if (!url) return url;
  
  const currentHost = window.location.hostname;
  const currentProtocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
  
  let normalized = url;
  
  if (normalized.includes('vanguardschools.edu.pe/uploads')) {
    normalized = normalized.replace(/https?:\/\/vanguardschools\.edu\.pe\/uploads/g, `${currentProtocol}//${currentHost}/uploads`);
  }
  
  if (normalized.includes('vanguardschools.edu.pe/Static')) {
    normalized = normalized.replace(/https?:\/\/vanguardschools\.edu\.pe\/Static/g, 'https://nuevo.vanguardschools.edu.pe/Static');
  }
  
  normalized = normalized.replace(/vanguardschools\.com(static|uploads)/gi, (match, path) => {
    return `https://nuevo.vanguardschools.edu.pe/Static${path === 'static' ? '' : ''}`;
  });
  
  return normalized;
}

function PublicacionesCardFeed({ onPublicacionEliminada }) {
  const { user } = useAuth();
  const esAlumno = user?.tipo === 'ALUMNO';
  const [publicaciones, setPublicaciones] = useState([]);
  const [publicacionesMostradas, setPublicacionesMostradas] = useState(5);
  const [imagenModal, setImagenModal] = useState(null);

  useEffect(() => {
    cargarPublicaciones();
  }, []);

  const cargarPublicaciones = async () => {
    try {
      const ruta = esAlumno ? '/alumno/publicaciones' : '/docente/publicaciones';
      const response = await api.get(ruta);
      const publicacionesData = response.data.publicaciones || [];
      setPublicaciones(publicacionesData);
      if (publicacionesData.length > 0) {
        setPublicacionesMostradas(5);
      }
    } catch (error) {
      console.error('Error cargando publicaciones:', error);
    }
  };

  const handleEliminar = async (publicacionId) => {
    const result = await Swal.fire({
      title: '¿Eliminar publicación?',
      text: 'Esta acción no se puede deshacer',
      icon: 'warning',
      showCancelButton: true,
      confirmColor: '#ef4444',
      cancelColor: '#6b7280',
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
        if (onPublicacionEliminada) {
          onPublicacionEliminada();
        }
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

  // Exponer función para recargar desde el componente padre
  useEffect(() => {
    if (window.recargarPublicacionesCard) {
      window.recargarPublicacionesCard = cargarPublicaciones;
    } else {
      window.recargarPublicacionesCard = cargarPublicaciones;
    }
  }, []);

  return (
    <>
      <div className="publicaciones-feed card-amarillo-feed">
        {publicaciones.slice(0, publicacionesMostradas).map((pub) => (
          <div key={pub.id} className="publicacion-item card-amarillo-publicacion-item">
            {/* Nombre del autor con botón eliminar al lado */}
            <div className="publicacion-header-nombre">
              <div className="publicacion-autor-container">
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
                    let urlCompleta;
                    if (imagenUrl.startsWith('http')) {
                      urlCompleta = normalizeImageUrl(imagenUrl);
                    } else {
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
                    let archivoUrl;
                    if (archivo.startsWith('http')) {
                      archivoUrl = archivo;
                    } else if (archivo.startsWith('/Static/')) {
                      archivoUrl = `https://nuevo.vanguardschools.edu.pe${archivo}`;
                    } else {
                      archivoUrl = `https://nuevo.vanguardschools.edu.pe/Static/Archivos/${archivo}`;
                    }
                    
                    const nombreArchivo = archivo.split('/').pop() || `Archivo ${idx + 1}`;
                    const extension = nombreArchivo.split('.').pop()?.toLowerCase() || 'pdf';
                    
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
    </>
  );
}

export default PublicacionesCardFeed;

