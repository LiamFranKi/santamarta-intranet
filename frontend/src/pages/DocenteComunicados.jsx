import React, { useState, useEffect } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import api from '../services/api';
import { normalizeStaticFileUrl } from '../config/staticFiles';
import Swal from 'sweetalert2';
import './DocenteComunicados.css';

function DocenteComunicados() {
  const [loading, setLoading] = useState(true);
  const [comunicados, setComunicados] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [comunicadosLeidos, setComunicadosLeidos] = useState(new Set());
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    limit: 12,
    totalPages: 1
  });

  // Cargar comunicados leídos desde localStorage
  useEffect(() => {
    const leidosGuardados = localStorage.getItem('comunicados_leidos');
    if (leidosGuardados) {
      try {
        const ids = JSON.parse(leidosGuardados);
        setComunicadosLeidos(new Set(ids));
      } catch (e) {
        console.error('Error cargando comunicados leídos:', e);
      }
    }
  }, []);

  useEffect(() => {
    cargarComunicados();
  }, [currentPage, searchTerm]);

  const cargarComunicados = async () => {
    try {
      setLoading(true);
      const params = {
        page: currentPage,
        limit: 12,
        ...(searchTerm && { search: searchTerm })
      };
      const response = await api.get('/docente/comunicados', { params });
      const comunicadosData = response.data.comunicados || [];
      
      // Log para verificar qué URLs estamos recibiendo
      console.log('📥 Comunicados recibidos del backend:');
      comunicadosData.forEach(com => {
        console.log(`  - ID ${com.id}: archivo_url = "${com.archivo_url}"`);
      });
      
      setComunicados(comunicadosData);
      setPagination(response.data.pagination || pagination);
    } catch (error) {
      console.error('Error cargando comunicados:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    setCurrentPage(1); // Resetear a la primera página al buscar
    // El useEffect se ejecutará automáticamente cuando cambie currentPage o searchTerm
  };

  const marcarComoLeido = (comunicadoId) => {
    const nuevosLeidos = new Set(comunicadosLeidos);
    nuevosLeidos.add(comunicadoId);
    setComunicadosLeidos(nuevosLeidos);
    
    // Guardar en localStorage
    try {
      localStorage.setItem('comunicados_leidos', JSON.stringify(Array.from(nuevosLeidos)));
    } catch (e) {
      console.error('Error guardando comunicados leídos:', e);
    }
  };

  const handleVerArchivo = (comunicadoId, archivoUrl) => {
    if (archivoUrl) {
      // Marcar como leído antes de abrir
      marcarComoLeido(comunicadoId);
      
      console.log('🔍 [COMUNICADOS] handleVerArchivo:');
      console.log('  - comunicadoId:', comunicadoId);
      console.log('  - archivoUrl recibido:', archivoUrl);
      
      // El backend ya devuelve archivo_url como URL completa
      // Asegurarse de que sea una URL absoluta válida
      let urlFinal = archivoUrl.trim();
      
      // Si no es una URL completa, construirla
      if (!urlFinal.startsWith('http://') && !urlFinal.startsWith('https://')) {
        console.log('⚠️ URL no es completa, normalizando...');
        urlFinal = normalizeStaticFileUrl(archivoUrl);
      }
      
      if (!urlFinal) {
        console.error('❌ No se pudo procesar la URL:', archivoUrl);
        alert('Error: No se pudo construir la URL del archivo');
        return;
      }
      
      console.log('✅ URL final:', urlFinal);
      
      try {
        // Validar que la URL sea válida
        const urlObj = new URL(urlFinal);
        console.log('✅ URL validada:', urlObj.href);
        console.log('  - Protocolo:', urlObj.protocol);
        console.log('  - Hostname:', urlObj.hostname);
        console.log('  - Pathname:', urlObj.pathname);
        
        // Abrir directamente con window.open para mejor control
        const nuevaVentana = window.open(urlObj.href, '_blank', 'noopener,noreferrer');
        
        if (!nuevaVentana) {
          // Si el popup fue bloqueado, usar el método del enlace
          const link = document.createElement('a');
          link.href = urlObj.href;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.download = ''; // Forzar descarga si no se puede abrir
          document.body.appendChild(link);
          link.click();
          setTimeout(() => {
            document.body.removeChild(link);
          }, 100);
        }
        
      } catch (error) {
        console.error('❌ Error al procesar URL:', error);
        console.error('URL problemática:', urlFinal);
        alert(`Error al abrir el archivo.\nURL: ${urlFinal}\n\nError: ${error.message}`);
      }
    }
  };

  const esComunicadoNuevo = (comunicadoId, fechaHora) => {
    // Es nuevo si no ha sido leído
    if (!comunicadosLeidos.has(comunicadoId)) {
      // Además, considerar "nuevo" si fue creado en los últimos 7 días
      if (fechaHora) {
        const fechaComunicado = new Date(fechaHora);
        const hace7Dias = new Date();
        hace7Dias.setDate(hace7Dias.getDate() - 7);
        return fechaComunicado >= hace7Dias;
      }
      return true;
    }
    return false;
  };

  const formatearFecha = (fechaHora) => {
    if (!fechaHora) return '';
    const fecha = new Date(fechaHora);
    const dia = String(fecha.getDate()).padStart(2, '0');
    const mes = String(fecha.getMonth() + 1).padStart(2, '0');
    const año = fecha.getFullYear();
    let horas = fecha.getHours();
    const minutos = String(fecha.getMinutes()).padStart(2, '0');
    const ampm = horas >= 12 ? 'PM' : 'AM';
    horas = horas % 12;
    horas = horas ? horas : 12;
    return `${dia}-${mes}-${año} ${String(horas).padStart(2, '0')}:${minutos} ${ampm}`;
  };

  const handleVerComunicado = (comunicado) => {
    marcarComoLeido(comunicado.id);
    const contenidoHtml = comunicado.contenido && String(comunicado.contenido).trim()
      ? comunicado.contenido
      : '<p>Sin contenido adicional.</p>';
    const bloqueArchivo = comunicado.archivo_url
      ? `<div class="comunicado-modal-archivo"><a href="${comunicado.archivo_url}" target="_blank" rel="noopener noreferrer">📎 Ver archivo adjunto</a></div>`
      : '';
    Swal.fire({
      title: comunicado.descripcion || 'Comunicado',
      html: `
        <div class="comunicado-modal-meta">📅 ${formatearFecha(comunicado.fecha_hora)}</div>
        <div class="comunicado-modal-contenido">${contenidoHtml}</div>
        ${bloqueArchivo}
      `,
      width: 760,
      confirmButtonText: 'Cerrar',
      customClass: { popup: 'swal2-comunicado-popup' }
    });
  };

  const renderPagination = () => {
    const pages = [];
    const maxPagesToShow = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxPagesToShow / 2));
    let endPage = Math.min(pagination.totalPages, startPage + maxPagesToShow - 1);

    if (endPage - startPage < maxPagesToShow - 1) {
      startPage = Math.max(1, endPage - maxPagesToShow + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }

    return (
      <div className="comunicados-pagination">
        <button
          className="pagination-btn"
          onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
          disabled={currentPage === 1}
        >
          ← Anterior
        </button>
        <div className="pagination-pages">
          {startPage > 1 && (
            <>
              <button
                className={`pagination-btn ${currentPage === 1 ? 'active' : ''}`}
                onClick={() => setCurrentPage(1)}
              >
                1
              </button>
              {startPage > 2 && <span className="pagination-ellipsis">...</span>}
            </>
          )}
          {pages.map(page => (
            <button
              key={page}
              className={`pagination-btn ${currentPage === page ? 'active' : ''}`}
              onClick={() => setCurrentPage(page)}
            >
              {page}
            </button>
          ))}
          {endPage < pagination.totalPages && (
            <>
              {endPage < pagination.totalPages - 1 && <span className="pagination-ellipsis">...</span>}
              <button
                className={`pagination-btn ${currentPage === pagination.totalPages ? 'active' : ''}`}
                onClick={() => setCurrentPage(pagination.totalPages)}
              >
                {pagination.totalPages}
              </button>
            </>
          )}
        </div>
        <button
          className="pagination-btn"
          onClick={() => setCurrentPage(prev => Math.min(pagination.totalPages, prev + 1))}
          disabled={currentPage === pagination.totalPages}
        >
          Siguiente →
        </button>
      </div>
    );
  };

  if (loading && comunicados.length === 0) {
    return (
      <DashboardLayout>
        <div className="docente-comunicados-loading">
          <div className="loading-spinner">Cargando comunicados...</div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="docente-comunicados">
        <div className="page-header">
          <h1>Comunicados</h1>
          <p>Comunicados y anuncios oficiales del colegio</p>
        </div>

        {/* Barra de búsqueda */}
        <div className="comunicados-search-bar">
          <form onSubmit={handleSearch} className="search-form">
            <input
              type="text"
              placeholder="Buscar comunicados..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
            <button type="submit" className="search-btn">
              🔍 Buscar
            </button>
          </form>
        </div>

        {/* Grid de cards */}
        {comunicados.length > 0 ? (
          <>
            <div className="comunicados-grid">
              {comunicados.map((comunicado, idx) => {
                const esNuevo = esComunicadoNuevo(comunicado.id, comunicado.fecha_hora);
                return (
                <div 
                  key={comunicado.id} 
                  className={`comunicado-card ${esNuevo ? 'comunicado-nuevo' : `comunicado-card--pastel-${idx % 6}`}`}
                >
                  <div className="comunicado-card-header">
                    <div className="comunicado-icon">
                      {comunicado.tipo === 'ARCHIVO' ? '📄' : '📝'}
                    </div>
                    <div className="comunicado-badges">
                      {esNuevo && (
                        <div className="comunicado-badge-nuevo">NUEVO</div>
                      )}
                      <div className="comunicado-badge">
                        {comunicado.estado === 'ACTIVO' ? 'ACTIVO' : 'INACTIVO'}
                      </div>
                    </div>
                  </div>
                  <div className="comunicado-card-body">
                    <h3 className="comunicado-titulo">{comunicado.descripcion}</h3>
                    {comunicado.contenido && (
                      <div 
                        className="comunicado-contenido"
                        dangerouslySetInnerHTML={{ __html: comunicado.contenido }}
                      />
                    )}
                    <div className="comunicado-fecha">
                      📅 {formatearFecha(comunicado.fecha_hora)}
                    </div>
                  </div>
                  <div className="comunicado-card-footer">
                    <button
                      className="btn-ver-archivo"
                      onClick={() => handleVerComunicado(comunicado)}
                    >
                      👁️ Ver
                    </button>
                    {comunicado.archivo_url && (
                      <button
                        className="btn-ver-archivo"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          console.log('🔘 Botón clickeado - comunicado:', comunicado.id);
                          console.log('🔘 archivo_url en el objeto:', comunicado.archivo_url);
                          handleVerArchivo(comunicado.id, comunicado.archivo_url);
                        }}
                      >
                        📎 Archivo
                      </button>
                    )}
                  </div>
                </div>
                );
              })}
            </div>

            {/* Paginación */}
            {pagination.totalPages > 1 && (
              <div className="comunicados-pagination-container">
                <div className="pagination-info">
                  Mostrando {((currentPage - 1) * pagination.limit) + 1} - {Math.min(currentPage * pagination.limit, pagination.total)} de {pagination.total}
                </div>
                {renderPagination()}
              </div>
            )}
          </>
        ) : (
          <div className="empty-state">
            <p>No se encontraron comunicados</p>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

export default DocenteComunicados;
