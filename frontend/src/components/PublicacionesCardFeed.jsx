import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import Swal from 'sweetalert2';
import PublicacionContenido from './PublicacionContenido';
import '../components/PublicacionesWidget.css';

function PublicacionesCardFeed({ onPublicacionEliminada, refreshTrigger, layout = 'list' }) {
  const { user } = useAuth();
  const esAlumno = user?.tipo === 'ALUMNO';
  const esAdmin =
    user?.tipo === 'ADMINISTRADOR' || user?.tipo === 'PROMOTORIA' || user?.tipo === 'PSICOLOGA';
  const isGrid = layout === 'grid';
  const [publicaciones, setPublicaciones] = useState([]);
  const [publicacionesMostradas, setPublicacionesMostradas] = useState(20);
  const [imagenModal, setImagenModal] = useState(null);

  const cargarPublicaciones = useCallback(async () => {
    try {
      let ruta;
      if (esAlumno) {
        ruta = '/alumno/publicaciones';
      } else if (user?.tipo === 'APODERADO') {
        ruta = '/apoderado/publicaciones';
      } else {
        ruta = '/docente/publicaciones';
      }
      const response = await api.get(ruta);
      const publicacionesData = response.data.publicaciones || [];
      setPublicaciones(publicacionesData);
      if (publicacionesData.length > 0) {
        setPublicacionesMostradas(esAdmin ? 20 : 5);
      }
    } catch (error) {
      console.error('Error cargando publicaciones:', error);
    }
  }, [esAdmin, esAlumno, user?.tipo]);

  useEffect(() => {
    if (user) {
      cargarPublicaciones();
    }
  }, [refreshTrigger, cargarPublicaciones, user]);

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


  return (
    <>
      <div
        className={`publicaciones-feed card-amarillo-feed${isGrid ? ' publicaciones-feed--grid' : ''}`}
      >
        {publicaciones.slice(0, publicacionesMostradas).map((pub) => (
          <div key={pub.id} className={`publicacion-item card-amarillo-publicacion-item${isGrid ? ' publicacion-item--grid' : ''}`}>
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
              {/* Botón eliminar: autor o administrador/promotoría */}
              {user && (esAdmin || pub.autor_id === user.id) && (
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
            
            <PublicacionContenido
              pub={pub}
              onImageClick={setImagenModal}
              collapsible={isGrid}
              clampLines={5}
            />
            
            {/* "Para: [quién]" al final */}
            <div className="publicacion-para-container">
              <span className="publicacion-para">Para: {pub.para_texto || 'Todos'}</span>
            </div>
          </div>
        ))}
        
        {/* Botón "Cargar Más" (admin/promotoría: bloques de 20) */}
        {publicaciones.length > publicacionesMostradas && (
          <button 
            className={`btn-cargar-mas btn-outline btn-block${isGrid ? ' btn-cargar-mas--grid-span' : ''}`}
            onClick={() => setPublicacionesMostradas(prev => prev + (esAdmin ? 20 : 5))}
          >
            <span className="btn-icon">📄</span>
            <span>Cargar Más</span>
          </button>
        )}
      </div>

      {/* Modal para ver imagen en grande */}
      {imagenModal &&
        createPortal(
          <div
            className="imagen-modal-overlay imagen-modal-overlay--portal"
            onClick={() => setImagenModal(null)}
            role="presentation"
          >
            <div className="imagen-modal-content" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
              <button
                type="button"
                className="imagen-modal-close"
                onClick={() => setImagenModal(null)}
                title="Cerrar"
              >
                ✕
              </button>
              <img src={imagenModal} alt="Imagen ampliada" className="imagen-modal-img" />
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

export default PublicacionesCardFeed;

