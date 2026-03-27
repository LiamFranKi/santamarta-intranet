import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { createPortal } from 'react-dom';
import DashboardLayout from '../components/DashboardLayout';
import api from '../services/api';
import Swal from 'sweetalert2';
import { useAuth } from '../context/AuthContext';
import './DocenteAulaVirtual-gamificado.css';

function AlumnoAulaVirtual({ cursoId: cursoIdProp, isApoderado = false, hijoId = null }) {
  const { cursoId: cursoIdParam } = useParams(); // asignatura_id
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  // Usar prop si está disponible, sino usar parámetro de la URL
  const cursoId = cursoIdProp || cursoIdParam;
  const asignaturaId = parseInt(cursoId);
  
  // Si es apoderado/docente viendo aula virtual del hijo, solo lectura
  const modoSoloLectura = isApoderado;
  const esApoderadoPuro = user?.tipo === 'APODERADO';
  
  const [loading, setLoading] = useState(true);
  const [curso, setCurso] = useState(null);
  const [totalNotas, setTotalNotas] = useState(4);
  
  const [bimestreGlobal, setBimestreGlobal] = useState(1);
  const [archivos, setArchivos] = useState([]);
  const [tareas, setTareas] = useState([]);
  const [examenes, setExamenes] = useState([]);
  const [videos, setVideos] = useState([]);
  const [enlaces, setEnlaces] = useState([]);
  
  // Estado para card expandido
  const [expandedCard, setExpandedCard] = useState(null);
  
  // Estado para modal de tarea
  const [mostrarModalTarea, setMostrarModalTarea] = useState(false);
  const [tareaDetalle, setTareaDetalle] = useState(null);
  const [urlEntrega, setUrlEntrega] = useState('');
  const [enviandoEntrega, setEnviandoEntrega] = useState(false);

  const toggleCard = (cardName) => {
    setExpandedCard(expandedCard === cardName ? null : cardName);
  };
  
  const abrirModalTarea = async (tareaId) => {
    try {
      // Cargar detalles de la tarea
      const response = await api.get(`/alumno/aula-virtual/tareas/${tareaId}`);
      setTareaDetalle(response.data.tarea);
      setMostrarModalTarea(true);
      
      // Marcar como visto (solo si NO es modo solo lectura)
      if (!modoSoloLectura) {
        try {
          await api.post(`/alumno/aula-virtual/tareas/${tareaId}/marcar-visto`);
        } catch (error) {
          console.warn('Error marcando como visto:', error);
        }
      }
    } catch (error) {
      console.error('Error cargando detalles de tarea:', error);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'No se pudieron cargar los detalles del proyecto'
      });
    }
  };
  
  const cerrarModalTarea = () => {
    setMostrarModalTarea(false);
    setTareaDetalle(null);
    setUrlEntrega('');
  };
  
  const handleEnviarEntrega = async (e) => {
    e.preventDefault();
    
    // Si es modo solo lectura, no permitir entregar
    if (modoSoloLectura) {
      Swal.fire({
        icon: 'info',
        title: 'Solo lectura',
        text: 'Como apoderado, solo puedes ver el contenido. El alumno debe entregar los proyectos desde su cuenta.'
      });
      return;
    }

    if (!urlEntrega.trim()) {
      Swal.fire({
        icon: 'warning',
        title: 'URL requerida',
        text: 'Por favor ingresa la URL de tu trabajo'
      });
      return;
    }
    
    setEnviandoEntrega(true);
    try {
      await api.post(`/alumno/aula-virtual/tareas/${tareaDetalle.id}/entregar`, {
        url: urlEntrega.trim()
      });
      
      Swal.fire({
        icon: 'success',
        title: '¡Éxito!',
        text: 'Tu trabajo ha sido enviado correctamente'
      });
      
      // Recargar detalles de la tarea para mostrar la entrega
      const response = await api.get(`/alumno/aula-virtual/tareas/${tareaDetalle.id}`);
      setTareaDetalle(response.data.tarea);
      setUrlEntrega('');
    } catch (error) {
      console.error('Error enviando entrega:', error);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: error.response?.data?.error || 'No se pudo enviar el trabajo'
      });
    } finally {
      setEnviandoEntrega(false);
    }
  };

  const cargarDatosCurso = useCallback(async () => {
    try {
      if (modoSoloLectura && hijoId) {
        // Si es modo solo lectura (apoderado), obtener datos del curso desde la ruta proxy
        // Usar /apoderado/hijos/... si el usuario es APODERADO, sino /docente/hijos/...
        const basePath = esApoderadoPuro ? '/apoderado/hijos' : '/docente/hijos';
        try {
          const response = await api.get(`${basePath}/${hijoId}/aula-virtual/${asignaturaId}`);
          if (response.data && response.data.asignatura) {
            setCurso({
              curso_nombre: response.data.asignatura.curso_nombre,
              docente_nombre: response.data.asignatura.docente_nombre || 'Docente',
              grado: response.data.asignatura.grado,
              seccion: response.data.asignatura.seccion,
              nivel_nombre: response.data.asignatura.nivel_nombre
            });
          }
        } catch (err) {
          console.error('Error cargando datos del curso (modo apoderado):', err);
          // Si falla, intentar obtener desde los cursos del hijo
          try {
            const cursosResponse = await api.get(`${basePath}/${hijoId}/cursos`);
            const cursoEncontrado = cursosResponse.data.cursos.find(c => c.asignatura_id === asignaturaId);
            if (cursoEncontrado) {
              setCurso({
                curso_nombre: cursoEncontrado.curso_nombre,
                docente_nombre: cursoEncontrado.docente_nombre,
                grado: null,
                seccion: null,
                nivel_nombre: null
              });
            }
          } catch (err2) {
            console.error('Error cargando cursos del hijo:', err2);
          }
        }
      } else {
        // Obtener información del curso desde la lista de cursos (modo normal alumno)
        const response = await api.get('/alumno/cursos');
        const cursoEncontrado = response.data.cursos.find(c => c.asignatura_id === asignaturaId);
        setCurso(cursoEncontrado || null);
      }
      setTotalNotas(4); // Por defecto 4 bimestres
    } catch (error) {
      console.error('Error cargando curso:', error);
    }
  }, [asignaturaId, modoSoloLectura, hijoId, esApoderadoPuro]);

  const cargarArchivos = useCallback(async (ciclo) => {
    try {
      const response = await api.get('/alumno/aula-virtual/archivos', {
        params: { asignatura_id: asignaturaId, ciclo: ciclo || bimestreGlobal }
      });
      setArchivos(response.data.archivos || []);
    } catch (error) {
      console.error('Error cargando archivos:', error);
    }
  }, [asignaturaId, bimestreGlobal]);

  const cargarTareas = useCallback(async (ciclo) => {
    try {
      const response = await api.get('/alumno/aula-virtual/tareas', {
        params: { asignatura_id: asignaturaId, ciclo: ciclo || bimestreGlobal }
      });
      setTareas(response.data.tareas || []);
    } catch (error) {
      console.error('Error cargando tareas:', error);
    }
  }, [asignaturaId, bimestreGlobal]);

  const cargarExamenes = useCallback(async (ciclo) => {
    try {
      const response = await api.get('/alumno/aula-virtual/examenes', {
        params: { asignatura_id: asignaturaId, ciclo: ciclo || bimestreGlobal }
      });
      console.log('📝 Exámenes recibidos del backend:', response.data.examenes);
      console.log('📝 Ciclo filtrado:', ciclo || bimestreGlobal);
      setExamenes(response.data.examenes || []);
    } catch (error) {
      console.error('Error cargando exámenes:', error);
      setExamenes([]);
    }
  }, [asignaturaId, bimestreGlobal]);

  const cargarVideos = useCallback(async (ciclo) => {
    try {
      const response = await api.get('/alumno/aula-virtual/videos', {
        params: { asignatura_id: asignaturaId, ciclo: ciclo || bimestreGlobal }
      });
      setVideos(response.data.videos || []);
    } catch (error) {
      console.error('Error cargando videos:', error);
    }
  }, [asignaturaId, bimestreGlobal]);

  const cargarEnlaces = useCallback(async (ciclo) => {
    try {
      const response = await api.get('/alumno/aula-virtual/enlaces', {
        params: { asignatura_id: asignaturaId, ciclo: ciclo || bimestreGlobal }
      });
      setEnlaces(response.data.enlaces || []);
    } catch (error) {
      console.error('Error cargando enlaces:', error);
    }
  }, [asignaturaId, bimestreGlobal]);

  // Cargar datos del curso
  useEffect(() => {
    if (asignaturaId) {
      setLoading(true);
      cargarDatosCurso().finally(() => setLoading(false));
    }
  }, [asignaturaId, cargarDatosCurso]);

  // Cargar todos los datos cuando cambia el bimestre global
  useEffect(() => {
    if (!asignaturaId || loading) return;
    
    cargarArchivos(bimestreGlobal);
    cargarTareas(bimestreGlobal);
    cargarExamenes(bimestreGlobal);
    cargarVideos(bimestreGlobal);
    cargarEnlaces(bimestreGlobal);
  }, [asignaturaId, loading, bimestreGlobal, cargarArchivos, cargarTareas, cargarExamenes, cargarVideos, cargarEnlaces]);

  const renderCardContent = (cardName) => {
    switch(cardName) {
      case 'temas':
        return renderTemasContent();
      case 'tareas':
        return renderTareasContent();
      case 'examenes':
        return renderExamenesContent();
      case 'videos':
        return renderVideosContent();
      case 'enlaces':
        return renderEnlacesContent();
      default:
        return null;
    }
  };

  const renderTemasContent = () => {
    const archivosFiltrados = archivos.filter(archivo => archivo.ciclo === bimestreGlobal);

    return (
      <div className="card-content-expanded">
        {loading ? (
          <div className="empty-state">
            <p>Cargando temas interactivos...</p>
          </div>
        ) : archivosFiltrados.length > 0 ? (
          <table className="tabla-aula-virtual">
            <thead>
              <tr>
                <th>NOMBRE</th>
                <th>FECHA</th>
                <th className="text-center">ACCIONES</th>
              </tr>
            </thead>
            <tbody>
              {archivosFiltrados.map((archivo) => (
                <tr key={archivo.id}>
                  <td>{archivo.nombre}</td>
                  <td>
                    {archivo.fecha_hora ? (
                      new Date(archivo.fecha_hora).toLocaleDateString('es-PE', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric'
                      })
                    ) : (
                      '-'
                    )}
                  </td>
                  <td className="text-center">
                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                      {archivo.archivo_url && (
                        <a 
                          href={archivo.archivo_url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          style={{
                            padding: '0.5rem 1rem',
                            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                            color: 'white',
                            textDecoration: 'none',
                            borderRadius: '8px',
                            fontSize: '0.875rem',
                            fontWeight: '600',
                            transition: 'all 0.2s'
                          }}
                        >
                          📄 Ver Archivo
                        </a>
                      )}
                      {archivo.enlace_url && (
                        <a 
                          href={archivo.enlace_url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          style={{
                            padding: '0.5rem 1rem',
                            background: 'linear-gradient(135deg, #4a83c1 0%, #2d5a8f 100%)',
                            color: 'white',
                            textDecoration: 'none',
                            borderRadius: '8px',
                            fontSize: '0.875rem',
                            fontWeight: '600',
                            transition: 'all 0.2s'
                          }}
                        >
                          🔗 Abrir URL
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty-state">
            <p>No hay temas interactivos para este bimestre</p>
          </div>
        )}
      </div>
    );
  };

  const renderTareasContent = () => {
    const tareasFiltradas = tareas.filter(tarea => tarea.ciclo === bimestreGlobal);

    return (
      <div className="card-content-expanded">
        {loading ? (
          <div className="empty-state">
            <p>Cargando proyectos...</p>
          </div>
        ) : tareasFiltradas.length > 0 ? (
          <table className="tabla-aula-virtual">
            <thead>
              <tr>
                <th>NOMBRE</th>
                <th>FECHA DE REGISTRO</th>
                <th>FECHA DE ENTREGA</th>
                <th className="text-center">ACCIONES</th>
              </tr>
            </thead>
            <tbody>
              {tareasFiltradas.map((tarea) => (
                <tr key={tarea.id}>
                  <td>{tarea.titulo}</td>
                  <td className="text-center">
                    {tarea.fecha_hora ? (
                      new Date(tarea.fecha_hora).toLocaleDateString('es-PE')
                    ) : (
                      '-'
                    )}
                  </td>
                  <td className="text-center">
                    {tarea.fecha_entrega ? (
                      new Date(tarea.fecha_entrega).toLocaleDateString('es-PE')
                    ) : (
                      '-'
                    )}
                  </td>
                  <td className="text-center">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        abrirModalTarea(tarea.id);
                      }}
                      style={{
                        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        padding: '0.4rem 1rem',
                        cursor: 'pointer',
                        fontSize: '0.875rem',
                        fontWeight: '600',
                        transition: 'all 0.2s'
                      }}
                      onMouseEnter={(e) => e.target.style.transform = 'scale(1.05)'}
                      onMouseLeave={(e) => e.target.style.transform = 'scale(1)'}
                    >
                      👁️ VER
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty-state">
            <p>No hay proyectos para este bimestre</p>
          </div>
        )}
      </div>
    );
  };

  const handleIniciarExamen = async (examen) => {
    // Si es modo solo lectura, no permitir iniciar examen
    if (modoSoloLectura) {
      Swal.fire({
        icon: 'info',
        title: 'Solo lectura',
        text: 'Como apoderado, solo puedes ver el contenido. El alumno debe realizar los exámenes desde su cuenta.'
      });
      return;
    }

    const result = await Swal.fire({
      title: '¿Iniciar examen?',
      html: `
        <div style="text-align: left; margin-top: 1rem;">
          <p><strong>${examen.titulo}</strong></p>
          <p style="margin-top: 0.5rem;">Tiempo: ${examen.tiempo > 0 ? `${examen.tiempo} minutos` : 'Ilimitado'}</p>
          <p>Preguntas: ${examen.total_preguntas || 0}</p>
          <p style="margin-top: 0.75rem; color: #dc2626;"><strong>⚠️ Una vez iniciado, no podrás salir del examen.</strong></p>
        </div>
      `,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#10b981',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Sí, iniciar',
      cancelButtonText: 'Cancelar'
    });

    if (result.isConfirmed) {
      navigate(`/alumno/examen/${examen.id}`);
    }
  };

  // Deep link desde notificaciones: ?abrir=tarea&id= / ?abrir=examen&id=
  useEffect(() => {
    if (loading || !asignaturaId) return;
    const abrir = searchParams.get('abrir');
    const idRaw = searchParams.get('id');
    if (!abrir || idRaw == null || idRaw === '') return;
    const id = parseInt(idRaw, 10);
    if (Number.isNaN(id)) return;

    const limpiarQuery = () => {
      const next = new URLSearchParams(searchParams);
      next.delete('abrir');
      next.delete('id');
      setSearchParams(next, { replace: true });
    };

    if (abrir === 'tarea') {
      setExpandedCard('tareas');
      abrirModalTarea(id);
      limpiarQuery();
      return;
    }

    if (abrir === 'examen') {
      if (examenes.length === 0) return;
      setExpandedCard('examenes');
      const ex = examenes.find((e) => Number(e.id) === id);
      limpiarQuery();
      if (ex) handleIniciarExamen(ex);
    }
  }, [loading, asignaturaId, searchParams, examenes, setSearchParams, navigate]);

  const renderExamenesContent = () => {
    // Asegurar comparación correcta de ciclo (puede ser número o cadena)
    const examenesFiltrados = examenes.filter(examen => {
      const examenCiclo = parseInt(examen.ciclo) || examen.ciclo;
      const cicloActual = parseInt(bimestreGlobal) || bimestreGlobal;
      return examenCiclo === cicloActual;
    });
    
    console.log('📝 Todos los exámenes:', examenes);
    console.log('📝 Bimestre actual:', bimestreGlobal, typeof bimestreGlobal);
    console.log('📝 Exámenes filtrados:', examenesFiltrados);

    return (
      <div className="card-content-expanded">
        {loading ? (
          <div className="empty-state">
            <p>Cargando exámenes...</p>
          </div>
        ) : examenesFiltrados.length > 0 ? (
          <table className="tabla-aula-virtual">
            <thead>
              <tr>
                <th>EXAMEN</th>
                <th>TIEMPO (MIN.)</th>
                <th>PREGUNTAS</th>
                <th>ESTADO</th>
                <th className="text-center">ACCIÓN</th>
              </tr>
            </thead>
            <tbody>
              {examenesFiltrados.map((examen) => {
                const puedeIniciar = examen.puede_iniciar || false;
                const estadoNormalizado = (examen.estado || '')
                  .toString()
                  .trim()
                  .toUpperCase();
                const tieneNota =
                  examen.tiene_nota === true ||
                  examen.tiene_nota === 1 ||
                  examen.tiene_nota === '1' ||
                  (examen.tiene_nota || '').toString().trim().toUpperCase() === 'SI';
                return (
                  <tr key={examen.id}>
                    <td>{examen.titulo}</td>
                    <td className="text-center">{examen.tiempo > 0 ? examen.tiempo : 'ILIMITADO'}</td>
                    <td className="text-center">{examen.total_preguntas || 0}</td>
                    <td className="text-center">
                      <span 
                        style={{
                          padding: '0.375rem 0.75rem',
                          borderRadius: '20px',
                          fontSize: '0.75rem',
                          fontWeight: '600',
                          background: estadoNormalizado === 'ACTIVO' 
                            ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' 
                            : 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)',
                          color: 'white',
                          display: 'inline-block'
                        }}
                      >
                        {examen.estado || 'INACTIVO'}
                      </span>
                    </td>
                    <td className="text-center">
                      {modoSoloLectura ? (
                        tieneNota ? (
                          <button
                            onClick={() => navigate(`/alumno/examen/${examen.id}/resultados`, {
                              state: hijoId
                                ? { hijoId, isApoderado: true, asignatura_id: asignaturaId }
                                : null
                            })}
                            style={{
                              padding: '0.5rem 1.25rem',
                              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                              color: 'white',
                              border: 'none',
                              borderRadius: '8px',
                              fontSize: '0.875rem',
                              fontWeight: '600',
                              cursor: 'pointer',
                              transition: 'all 0.2s',
                              boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)'
                            }}
                            onMouseEnter={(e) => {
                              e.target.style.transform = 'scale(1.05)';
                              e.target.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.4)';
                            }}
                            onMouseLeave={(e) => {
                              e.target.style.transform = 'scale(1)';
                              e.target.style.boxShadow = '0 2px 8px rgba(16, 185, 129, 0.3)';
                            }}
                          >
                            📊 Ver Resultado
                          </button>
                        ) : (
                          <span style={{ color: '#9ca3af', fontSize: '0.875rem' }}>
                            No disponible
                          </span>
                        )
                      ) : puedeIniciar ? (
                        <button
                          onClick={() => handleIniciarExamen(examen)}
                          disabled={modoSoloLectura}
                          style={{
                            padding: '0.5rem 1.25rem',
                            background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '8px',
                            fontSize: '0.875rem',
                            fontWeight: '600',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            boxShadow: '0 2px 8px rgba(59, 130, 246, 0.3)'
                          }}
                          onMouseEnter={(e) => {
                            e.target.style.transform = 'scale(1.05)';
                            e.target.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.4)';
                          }}
                          onMouseLeave={(e) => {
                            e.target.style.transform = 'scale(1)';
                            e.target.style.boxShadow = '0 2px 8px rgba(59, 130, 246, 0.3)';
                          }}
                        >
                          ▶️ Iniciar Prueba
                        </button>
                      ) : tieneNota && estadoNormalizado === 'INACTIVO' ? (
                        <button
                          onClick={() => navigate(`/alumno/examen/${examen.id}/resultados`, {
                            state: { asignatura_id: asignaturaId }
                          })}
                          style={{
                            padding: '0.5rem 1.25rem',
                            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '8px',
                            fontSize: '0.875rem',
                            fontWeight: '600',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)'
                          }}
                          onMouseEnter={(e) => {
                            e.target.style.transform = 'scale(1.05)';
                            e.target.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.4)';
                          }}
                          onMouseLeave={(e) => {
                            e.target.style.transform = 'scale(1)';
                            e.target.style.boxShadow = '0 2px 8px rgba(16, 185, 129, 0.3)';
                          }}
                        >
                          📊 Ver Resultado
                        </button>
                      ) : (
                        <span style={{ color: '#9ca3af', fontSize: '0.875rem' }}>
                          {estadoNormalizado === 'ACTIVO' ? 'En proceso...' : 'No disponible'}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="empty-state">
            <p>No hay exámenes para este bimestre</p>
          </div>
        )}
      </div>
    );
  };

  const renderVideosContent = () => {
    const videosFiltrados = videos.filter(v => v.ciclo === bimestreGlobal);

    return (
      <div className="card-content-expanded">
        {loading ? (
          <div className="empty-state">
            <p>Cargando videos...</p>
          </div>
        ) : videosFiltrados.length > 0 ? (
          <table className="tabla-aula-virtual">
            <thead>
              <tr>
                <th>NOMBRE</th>
                <th>FECHA</th>
                <th className="text-center">ACCIONES</th>
              </tr>
            </thead>
            <tbody>
              {videosFiltrados.map((video) => (
                <tr key={video.id}>
                  <td>{video.descripcion}</td>
                  <td>
                    {video.fecha_hora ? (
                      new Date(video.fecha_hora).toLocaleString('es-PE', { 
                        day: '2-digit', 
                        month: '2-digit', 
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })
                    ) : (
                      '-'
                    )}
                  </td>
                  <td className="text-center">
                    {video.enlace && (
                      <a 
                        href={video.enlace} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        style={{
                          padding: '0.5rem 1rem',
                          background: 'linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)',
                          color: 'white',
                          textDecoration: 'none',
                          borderRadius: '8px',
                          fontSize: '0.875rem',
                          fontWeight: '600',
                          transition: 'all 0.2s'
                        }}
                      >
                        🎥 Ver Video
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty-state">
            <p>No hay videos para este bimestre</p>
          </div>
        )}
      </div>
    );
  };

  const renderEnlacesContent = () => {
    const enlacesFiltrados = enlaces.filter(e => e.ciclo === bimestreGlobal);

    return (
      <div className="card-content-expanded">
        {loading ? (
          <div className="empty-state">
            <p>Cargando enlaces...</p>
          </div>
        ) : enlacesFiltrados.length > 0 ? (
          <table className="tabla-aula-virtual">
            <thead>
              <tr>
                <th>NOMBRE</th>
                <th>FECHA</th>
                <th className="text-center">ACCIONES</th>
              </tr>
            </thead>
            <tbody>
              {enlacesFiltrados.map((enlace) => (
                <tr key={enlace.id}>
                  <td>{enlace.descripcion}</td>
                  <td>
                    {enlace.fecha_hora ? (
                      new Date(enlace.fecha_hora).toLocaleString('es-PE', { 
                        day: '2-digit', 
                        month: '2-digit', 
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })
                    ) : (
                      '-'
                    )}
                  </td>
                  <td className="text-center">
                    {enlace.enlace && (
                      <a 
                        href={enlace.enlace} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        style={{
                          padding: '0.5rem 1rem',
                          background: 'linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)',
                          color: 'white',
                          textDecoration: 'none',
                          borderRadius: '8px',
                          fontSize: '0.875rem',
                          fontWeight: '600',
                          transition: 'all 0.2s'
                        }}
                      >
                        🔗 Visitar Enlace
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty-state">
            <p>No hay enlaces para este bimestre</p>
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="docente-aula-loading">
          <div className="loading-spinner">Cargando aula virtual...</div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="docente-aula-virtual">
        <div className="page-header">
          <button className="btn-back" onClick={() => {
            if (modoSoloLectura && hijoId) {
              // Preferir retorno explícito a la pantalla de Cursos Asignados
              // para restaurar el estado local de esa vista.
              const returnTo = location.state?.returnTo;
              if (returnTo) {
                const nextState = {
                  reopenCursos: true,
                  hijoId: location.state?.hijoId || hijoId,
                };
                navigate(returnTo, { state: nextState });
              } else if (window.history.length > 1) {
                navigate(-1);
              } else if (esApoderadoPuro) {
                navigate('/apoderado/hijos');
              } else {
                navigate('/docente/hijos');
              }
            } else {
              navigate('/alumno/cursos');
            }
          }}>
            {modoSoloLectura && hijoId ? '← Volver' : '← Volver a Cursos'}
          </button>
          <h1>🎓 Aula Virtual {modoSoloLectura && <span style={{ fontSize: '0.7em', color: '#6b7280', fontWeight: 'normal' }}>(Solo Lectura)</span>}</h1>
          <p>{curso?.curso_nombre || 'Curso'} - {curso?.docente_nombre || 'Docente'}</p>
          {modoSoloLectura && (
            <div style={{
              marginTop: '0.5rem',
              padding: '0.75rem',
              backgroundColor: '#fef3c7',
              border: '1px solid #fbbf24',
              borderRadius: '6px',
              color: '#92400e',
              fontSize: '0.875rem'
            }}>
              ⚠️ Modo solo lectura: Puedes ver todo el contenido, pero no puedes entregar proyectos ni realizar exámenes. El alumno debe hacerlo desde su cuenta.
            </div>
          )}
        </div>

        {/* Selector Global de Bimestre */}
        <div className="bimestre-selector-global">
          {Array.from({ length: totalNotas }, (_, i) => i + 1).map((bim) => (
            <button
              key={bim}
              className={`bimestre-tab-global ${bimestreGlobal === bim ? 'active' : ''}`}
              onClick={() => setBimestreGlobal(bim)}
            >
              Bimestre {bim}
            </button>
          ))}
            </div>

        {/* Grid de Cards Gamificado */}
        <div className="aula-dashboard-grid">
          {/* Card: TEMAS */}
          <div 
            className={`aula-section-card temas-card ${expandedCard === 'temas' ? 'expanded' : ''}`}
            onClick={() => expandedCard !== 'temas' && toggleCard('temas')}
          >
            <div className="card-header">
              <div className="card-icon">📚</div>
              <div className="card-info">
                <h3 className="card-title">Temas Interactivos</h3>
                <p className="card-count">{archivos.filter(a => a.ciclo === bimestreGlobal).length}</p>
                <p className="card-subtitle">Temas disponibles</p>
              </div>
            </div>
            {expandedCard === 'temas' && renderCardContent('temas')}
            </div>

          {/* Card: TAREAS */}
          <div 
            className={`aula-section-card tareas-card ${expandedCard === 'tareas' ? 'expanded' : ''}`}
            onClick={() => expandedCard !== 'tareas' && toggleCard('tareas')}
          >
            <div className="card-header">
              <div className="card-icon">📝</div>
              <div className="card-info">
                <h3 className="card-title">Proyectos</h3>
                <p className="card-count">{tareas.filter(t => t.ciclo === bimestreGlobal).length}</p>
                <p className="card-subtitle">Proyectos asignados</p>
                        </div>
                    </div>
            {expandedCard === 'tareas' && renderCardContent('tareas')}
                </div>

          {/* Card: EXÁMENES */}
          <div 
            className={`aula-section-card examenes-card ${expandedCard === 'examenes' ? 'expanded' : ''}`}
            onClick={() => expandedCard !== 'examenes' && toggleCard('examenes')}
          >
            <div className="card-header">
              <div className="card-icon">📊</div>
              <div className="card-info">
                <h3 className="card-title">Exámenes</h3>
                <p className="card-count">{examenes.filter(e => e.ciclo === bimestreGlobal).length}</p>
                <p className="card-subtitle">Exámenes creados</p>
                        </div>
                    </div>
            {expandedCard === 'examenes' && renderCardContent('examenes')}
                </div>

          {/* Card: VIDEOTECA */}
          <div 
            className={`aula-section-card videos-card ${expandedCard === 'videos' ? 'expanded' : ''}`}
            onClick={() => expandedCard !== 'videos' && toggleCard('videos')}
          >
            <div className="card-header">
              <div className="card-icon">🎥</div>
              <div className="card-info">
                <h3 className="card-title">Videoteca</h3>
                <p className="card-count">{videos.filter(v => v.ciclo === bimestreGlobal).length}</p>
                <p className="card-subtitle">Videos disponibles</p>
                        </div>
                    </div>
            {expandedCard === 'videos' && renderCardContent('videos')}
                </div>

          {/* Card: ENLACES */}
          <div 
            className={`aula-section-card enlaces-card ${expandedCard === 'enlaces' ? 'expanded' : ''}`}
            onClick={() => expandedCard !== 'enlaces' && toggleCard('enlaces')}
          >
            <div className="card-header">
              <div className="card-icon">🔗</div>
              <div className="card-info">
                <h3 className="card-title">Enlaces de Ayuda</h3>
                <p className="card-count">{enlaces.filter(e => e.ciclo === bimestreGlobal).length}</p>
                <p className="card-subtitle">Enlaces compartidos</p>
              </div>
            </div>
            {expandedCard === 'enlaces' && renderCardContent('enlaces')}
          </div>
        </div>
      </div>
      
      {/* Modal de Detalles del Proyecto */}
      {mostrarModalTarea && tareaDetalle && createPortal(
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: '2rem'
          }}
          onClick={cerrarModalTarea}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              padding: '2rem',
              maxWidth: '800px',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 10px 40px rgba(0, 0, 0, 0.2)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ margin: 0, color: '#374151', fontSize: '1.5rem' }}>Detalles del Proyecto</h2>
              <button
                onClick={cerrarModalTarea}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                  color: '#6b7280',
                  padding: '0.5rem',
                  lineHeight: 1
                }}
              >
                ×
              </button>
            </div>
            
            <div style={{ marginBottom: '1.5rem' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <th style={{ 
                      padding: '0.75rem', 
                      textAlign: 'left', 
                      width: '200px',
                      backgroundColor: '#f0f9ff',
                      fontWeight: '600',
                      color: '#374151'
                    }}>
                      TÍTULO
                    </th>
                    <td style={{ padding: '0.75rem', backgroundColor: 'white' }}>
                      {tareaDetalle.titulo}
                    </td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <th style={{ 
                      padding: '0.75rem', 
                      textAlign: 'left',
                      backgroundColor: '#f0f9ff',
                      fontWeight: '600',
                      color: '#374151'
                    }}>
                      DESCRIPCIÓN
                    </th>
                    <td style={{ padding: '0.75rem', backgroundColor: 'white' }}>
                      <div dangerouslySetInnerHTML={{ __html: tareaDetalle.descripcion?.replace(/\n/g, '<br />') || '-' }} />
                    </td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <th style={{ 
                      padding: '0.75rem', 
                      textAlign: 'left',
                      backgroundColor: '#f0f9ff',
                      fontWeight: '600',
                      color: '#374151'
                    }}>
                      FECHA DE REGISTRO
                    </th>
                    <td style={{ padding: '0.75rem', backgroundColor: 'white' }}>
                      {tareaDetalle.fecha_hora ? (
                        new Date(tareaDetalle.fecha_hora).toLocaleDateString('es-PE', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric'
                        })
                      ) : '-'}
                    </td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <th style={{ 
                      padding: '0.75rem', 
                      textAlign: 'left',
                      backgroundColor: '#f0f9ff',
                      fontWeight: '600',
                      color: '#374151'
                    }}>
                      FECHA DE ENTREGA
                    </th>
                    <td style={{ padding: '0.75rem', backgroundColor: 'white' }}>
                      {tareaDetalle.fecha_entrega ? (
                        new Date(tareaDetalle.fecha_entrega).toLocaleDateString('es-PE', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric'
                        })
                      ) : '-'}
                    </td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <th style={{ 
                      padding: '0.75rem', 
                      textAlign: 'left',
                      backgroundColor: '#f0f9ff',
                      fontWeight: '600',
                      color: '#374151'
                    }}>
                      ENVIADO POR
                    </th>
                    <td style={{ padding: '0.75rem', backgroundColor: 'white' }}>
                      {tareaDetalle.docente_nombre || '-'}
                    </td>
                  </tr>
                  {tareaDetalle.archivos && tareaDetalle.archivos.length > 0 && (
                    <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                      <th style={{ 
                        padding: '0.75rem', 
                        textAlign: 'left',
                        backgroundColor: '#f0f9ff',
                        fontWeight: '600',
                        color: '#374151'
                      }}>
                        ARCHIVOS ADJUNTOS
                      </th>
                      <td style={{ padding: '0.75rem', backgroundColor: 'white' }}>
                        {tareaDetalle.archivos.map((archivo, idx) => (
                          <div key={idx} style={{ marginBottom: '0.5rem' }}>
                            {archivo.archivo_url ? (
                              <a
                                href={archivo.archivo_url}
                                download={archivo.nombre}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  color: '#2563eb',
                                  textDecoration: 'none',
                                  fontWeight: '600'
                                }}
                              >
                                📄 {archivo.nombre}
                              </a>
                            ) : (
                              <span>📄 {archivo.nombre}</span>
                            )}
                          </div>
                        ))}
                      </td>
                    </tr>
                  )}
                  {tareaDetalle.enlace && (
                    <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                      <th style={{ 
                        padding: '0.75rem', 
                        textAlign: 'left',
                        backgroundColor: '#f0f9ff',
                        fontWeight: '600',
                        color: '#374151'
                      }}>
                        URL
                      </th>
                      <td style={{ padding: '0.75rem', backgroundColor: 'white' }}>
                        <a
                          href={tareaDetalle.enlace}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            color: '#2563eb',
                            textDecoration: 'none',
                            wordBreak: 'break-all'
                          }}
                        >
                          {tareaDetalle.enlace}
                        </a>
                      </td>
                    </tr>
                  )}
                  {tareaDetalle.entregas && tareaDetalle.entregas.length > 0 && (
                    <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                      <th style={{ 
                        padding: '0.75rem', 
                        textAlign: 'left',
                        backgroundColor: '#f0f9ff',
                        fontWeight: '600',
                        color: '#374151'
                      }}>
                        ARCHIVO(S) ENVIADO(S)
                      </th>
                      <td style={{ padding: '0.75rem', backgroundColor: 'white' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <tbody>
                            {tareaDetalle.entregas.map((entrega, idx) => (
                              <tr key={idx}>
                                <td style={{ padding: '0.5rem 0' }}>
                                  {entrega.url && (
                                    <a
                                      href={entrega.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      style={{
                                        color: '#2563eb',
                                        textDecoration: 'none',
                                        wordBreak: 'break-all'
                                      }}
                                    >
                                      {entrega.url.length > 50 ? `${entrega.url.substring(0, 50)}...` : entrega.url}
                                    </a>
                                  )}
                                </td>
                                <td style={{ padding: '0.5rem', textAlign: 'center', fontSize: '0.875rem', color: '#6b7280' }}>
                                  {entrega.fecha_hora ? (
                                    new Date(entrega.fecha_hora).toLocaleString('es-PE', {
                                      day: '2-digit',
                                      month: '2-digit',
                                      year: 'numeric',
                                      hour: '2-digit',
                                      minute: '2-digit'
                                    })
                                  ) : '-'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                  <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <th style={{ 
                      padding: '0.75rem', 
                      textAlign: 'left',
                      backgroundColor: '#f0f9ff',
                      fontWeight: '600',
                      color: '#374151'
                    }}>
                      NOTA
                    </th>
                    <td style={{ padding: '0.75rem', backgroundColor: 'white', fontWeight: '700', fontSize: '1.1rem' }}>
                      {tareaDetalle.nota || '-'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            
            {/* Formulario para enviar trabajo */}
            {tareaDetalle.fecha_entrega && new Date(tareaDetalle.fecha_entrega) >= new Date(new Date().setHours(0, 0, 0, 0)) && !modoSoloLectura && (
              <div style={{
                marginTop: '2rem',
                padding: '1.5rem',
                backgroundColor: '#f9fafb',
                borderRadius: '8px',
                border: '1px solid #e5e7eb'
              }}>
                <h3 style={{ marginTop: 0, marginBottom: '1rem', color: '#374151' }}>Enviar Trabajo Realizado</h3>
                <div style={{
                  backgroundColor: '#3b82f6',
                  color: 'white',
                  padding: '0.75rem',
                  borderRadius: '6px',
                  marginBottom: '1rem',
                  textAlign: 'center',
                  fontWeight: '600'
                }}>
                  Ingresa la URL del archivo (Drive, Dropbox, etc).
                </div>
                <form onSubmit={handleEnviarEntrega}>
                  <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <label style={{ fontWeight: '600', color: '#374151', minWidth: '60px' }}>
                      URL:
                    </label>
                    <input
                      type="url"
                      value={urlEntrega}
                      onChange={(e) => setUrlEntrega(e.target.value)}
                      placeholder="https://drive.google.com/..."
                      required
                      style={{
                        flex: 1,
                        padding: '0.75rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '0.875rem'
                      }}
                    />
                    <button
                      type="submit"
                      disabled={enviandoEntrega}
                      style={{
                        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        padding: '0.75rem 1.5rem',
                        cursor: enviandoEntrega ? 'not-allowed' : 'pointer',
                        fontSize: '0.875rem',
                        fontWeight: '600',
                        opacity: enviandoEntrega ? 0.6 : 1,
                        transition: 'all 0.2s'
                      }}
                    >
                      {enviandoEntrega ? 'Enviando...' : 'Enviar'}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </DashboardLayout>
  );
}

export default AlumnoAulaVirtual;
