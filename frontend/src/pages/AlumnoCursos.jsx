import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import api from '../services/api';
import Swal from 'sweetalert2';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import './AlumnoCursos.css';
import './DocenteCursos.css';
import './DocenteGrupos.css';

function AlumnoCursos() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [cursos, setCursos] = useState([]);
  
  // Estados para modal de mensaje al docente
  const [mostrarModalMensaje, setMostrarModalMensaje] = useState(false);
  const [docenteParaMensaje, setDocenteParaMensaje] = useState(null);
  const [asuntoMensaje, setAsuntoMensaje] = useState('');
  const [contenidoMensaje, setContenidoMensaje] = useState('');
  const [archivosAdjuntos, setArchivosAdjuntos] = useState([]);
  const [enviandoMensaje, setEnviandoMensaje] = useState(false);
  const quillRefMensaje = useRef(null);

  useEffect(() => {
    cargarCursos();
  }, []);

  const cargarCursos = async () => {
    try {
      setLoading(true);
      const response = await api.get('/alumno/cursos');
      // Ordenar cursos por nombre de asignatura (curso_nombre) de forma ascendente
      const cursosOrdenados = (response.data.cursos || []).sort((a, b) => {
        const nombreA = (a.curso_nombre || '').toLowerCase();
        const nombreB = (b.curso_nombre || '').toLowerCase();
        return nombreA.localeCompare(nombreB);
      });
      setCursos(cursosOrdenados);
    } catch (error) {
      console.error('Error cargando cursos:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAulaVirtual = (curso) => {
    navigate(`/alumno/aula-virtual/${curso.asignatura_id}`);
  };

  const handleEnviarMensaje = (curso) => {
    console.log('🔵 handleEnviarMensaje llamado con curso:', curso);
    // Abrir modal de mensaje con el docente pre-seleccionado
    // curso.docente_usuario_id es el usuario_id del docente (necesario para enviar mensaje)
    const docenteData = {
      id: curso.docente_usuario_id || curso.docente_id, // Usar usuario_id si está disponible, sino personal_id
      nombre: curso.docente_nombre,
      curso_nombre: curso.curso_nombre
    };
    console.log('🔵 Datos del docente para mensaje:', docenteData);
    setDocenteParaMensaje(docenteData);
    setMostrarModalMensaje(true);
    console.log('🔵 Modal debería estar abierto ahora');
  };
  
  // Manejar cambio de archivos adjuntos
  const handleArchivoChange = (e) => {
    const archivos = Array.from(e.target.files);
    setArchivosAdjuntos([...archivosAdjuntos, ...archivos]);
    e.target.value = ''; // Limpiar input para permitir seleccionar el mismo archivo de nuevo
  };
  
  // Eliminar archivo adjunto
  const eliminarArchivo = (index) => {
    setArchivosAdjuntos(archivosAdjuntos.filter((_, i) => i !== index));
  };
  
  // Enviar mensaje al docente
  const enviarMensajeAlDocente = async () => {
    if (!docenteParaMensaje) {
      Swal.fire('Error', 'No se ha seleccionado un docente', 'error');
      return;
    }

    if (!asuntoMensaje.trim()) {
      Swal.fire('Error', 'El asunto es requerido', 'error');
      return;
    }

    // Verificar que el contenido no esté vacío (sin HTML vacío)
    const contenidoLimpio = contenidoMensaje.replace(/<[^>]*>/g, '').trim();
    if (!contenidoLimpio) {
      Swal.fire('Error', 'El mensaje es requerido', 'error');
      return;
    }

    // Prevenir doble envío
    if (enviandoMensaje) {
      return;
    }

    setEnviandoMensaje(true);

    try {
      // docenteParaMensaje.id es el usuario_id del docente (ya viene en la respuesta de cursos)
      // Crear FormData para enviar archivos
      const formData = new FormData();
      formData.append('destinatarios', JSON.stringify([docenteParaMensaje.id]));
      formData.append('asunto', asuntoMensaje.trim());
      formData.append('mensaje', contenidoMensaje);

      // Agregar archivos
      archivosAdjuntos.forEach((archivo) => {
        formData.append('archivos', archivo);
      });

      const response = await api.post('/alumno/mensajes/enviar', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      Swal.fire({
        title: '¡Mensaje Enviado!',
        text: response.data.message || 'Mensaje enviado correctamente',
        icon: 'success',
        confirmButtonText: 'Aceptar'
      });
      
      // Limpiar formulario
      setAsuntoMensaje('');
      setContenidoMensaje('');
      setArchivosAdjuntos([]);
      setMostrarModalMensaje(false);
      setDocenteParaMensaje(null);
    } catch (error) {
      console.error('Error enviando mensaje:', error);
      Swal.fire('Error', error.response?.data?.error || 'Error al enviar el mensaje', 'error');
    } finally {
      setEnviandoMensaje(false);
    }
  };
  
  // Configurar ReactQuill para subir imágenes
  useEffect(() => {
    if (mostrarModalMensaje && quillRefMensaje.current) {
      const quill = quillRefMensaje.current.getEditor();
      const toolbar = quill.getModule('toolbar');
      
      toolbar.addHandler('image', () => {
        const input = document.createElement('input');
        input.setAttribute('type', 'file');
        input.setAttribute('accept', 'image/*');
        input.click();
        
        input.onchange = async () => {
          const file = input.files[0];
          if (!file) return;
          
          try {
            const formData = new FormData();
            formData.append('imagen', file);
            
            const response = await api.post('/alumno/mensajes/subir-imagen', formData, {
              headers: {
                'Content-Type': 'multipart/form-data',
              },
            });

            const imagenUrl = response.data.url;
            
            // Insertar la imagen en el editor
            const range = quill.getSelection(true);
            quill.insertEmbed(range.index, 'image', imagenUrl);
            quill.setSelection(range.index + 1);
          } catch (error) {
            console.error('Error subiendo imagen:', error);
            Swal.fire('Error', 'No se pudo subir la imagen', 'error');
          }
        };
      });
    }
  }, [mostrarModalMensaje]);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="alumno-cursos-loading">
          <div className="loading-spinner">Cargando cursos...</div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="alumno-cursos">
        <div className="page-header">
          <h1>📚 Mis Cursos</h1>
          <p>Gestiona tus cursos y accede al aula virtual</p>
        </div>

        {cursos.length > 0 ? (
          <div className="cursos-grid">
            {cursos.map((curso, index) => {
              // Colores pastel suaves para cada card
              const coloresPastel = [
                'linear-gradient(145deg, #fef3f2, #fff5f5)', // Rosa pastel
                'linear-gradient(145deg, #f0fdf4, #f0fff4)', // Verde pastel
                'linear-gradient(145deg, #eff6ff, #f0f9ff)', // Azul pastel
                'linear-gradient(145deg, #faf5ff, #faf5ff)', // Púrpura pastel
                'linear-gradient(145deg, #fff7ed, #fffaf0)', // Naranja pastel
                'linear-gradient(145deg, #f0fdfa, #f0fffe)', // Turquesa pastel
                'linear-gradient(145deg, #fefce8, #fffff0)', // Amarillo pastel
                'linear-gradient(145deg, #fce7f3, #fdf2f8)', // Rosa claro pastel
              ];
              const colorFondo = coloresPastel[index % coloresPastel.length];
              
              return (
              <div 
                key={curso.asignatura_id} 
                className="curso-card-alumno mundo-card"
                style={{ background: colorFondo }}
              >
                {/* Contenido del card */}
                <div className="curso-content">
                  {/* Foto circular del docente arriba */}
                  <div className="docente-foto-container">
                    {curso.docente_foto_url ? (
                      <img 
                        src={curso.docente_foto_url} 
                        alt={curso.docente_nombre}
                        className="docente-foto-circular"
                        onError={(e) => {
                          e.target.style.display = 'none';
                          if (e.target.nextSibling) {
                            e.target.nextSibling.style.display = 'flex';
                          }
                        }}
                      />
                    ) : null}
                    {!curso.docente_foto_url && (
                      <div className="docente-foto-placeholder">
                        <span className="docente-icon-placeholder">👨‍🏫</span>
                      </div>
                    )}
                  </div>
                  
                  {/* Nombre del curso */}
                  <h3 className="curso-nombre-alumno">{curso.curso_nombre}</h3>
                  
                  {/* Nombre del docente */}
                  <div className="curso-docente-nombre">
                    <span className="docente-nombre-text">{curso.docente_nombre || 'Sin docente asignado'}</span>
                  </div>

                  {/* Botones de acción */}
                  <div className="curso-actions-alumno">
                    <button
                      className="btn-aula-virtual"
                      onClick={() => handleAulaVirtual(curso)}
                    >
                      🎓 Aula Virtual
                    </button>
                    <button
                      className="btn-enviar-mensaje"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        console.log('🔵 Botón Enviar Mensaje clickeado');
                        handleEnviarMensaje(curso);
                      }}
                      type="button"
                    >
                      ✉️ Enviar Mensaje
                    </button>
                  </div>
                </div>
              </div>
              );
            })}
          </div>
        ) : (
          <div className="empty-state mundo-card">
            <div className="empty-icon">📚</div>
            <p>No tienes cursos asignados para el año académico actual</p>
          </div>
        )}
        
        {/* Modal de Enviar Mensaje al Docente */}
        {mostrarModalMensaje && docenteParaMensaje && createPortal(
          <div 
            className="modal-mensaje-overlay" 
            onClick={() => setMostrarModalMensaje(false)}
            style={{ zIndex: 100000 }}
          >
            <div 
              className="modal-mensaje-container" 
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="modal-mensaje-docente-title"
            >
              <div className="modal-mensaje-header">
                <h2 id="modal-mensaje-docente-title">✉️ Enviar Mensaje al Docente</h2>
                <button
                  className="modal-mensaje-close"
                  onClick={() => {
                    setMostrarModalMensaje(false);
                    setAsuntoMensaje('');
                    setContenidoMensaje('');
                    setArchivosAdjuntos([]);
                    setDocenteParaMensaje(null);
                  }}
                  type="button"
                  aria-label="Cerrar modal"
                >
                  ✕
                </button>
              </div>

              <div className="modal-mensaje-body">
                {/* Información del docente */}
                <div className="mensaje-grupo-info">
                  <p><strong>Docente:</strong> {docenteParaMensaje.nombre}</p>
                  <p><strong>Curso:</strong> {docenteParaMensaje.curso_nombre}</p>
                  <p className="mensaje-info-text">El mensaje se enviará directamente al docente</p>
                </div>

                {/* Campo Asunto */}
                <div className="form-group">
                  <label htmlFor="asunto-mensaje-docente">Asunto:</label>
                  <input
                    type="text"
                    id="asunto-mensaje-docente"
                    className="form-input"
                    value={asuntoMensaje}
                    onChange={(e) => setAsuntoMensaje(e.target.value)}
                    placeholder="Asunto del mensaje"
                  />
                </div>

                {/* Campo Mensaje con Editor de Texto Enriquecido */}
                <div className="form-group">
                  <label htmlFor="mensaje-editor-docente">Mensaje:</label>
                  <div id="mensaje-editor-wrapper-docente">
                    <ReactQuill
                      ref={quillRefMensaje}
                      theme="snow"
                      value={contenidoMensaje}
                      onChange={setContenidoMensaje}
                      placeholder="Escribe tu mensaje aquí..."
                      modules={{
                        toolbar: [
                          [{ 'header': [1, 2, 3, false] }],
                          ['bold', 'italic', 'underline', 'strike'],
                          [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                          [{ 'color': [] }, { 'background': [] }],
                          [{ 'align': [] }],
                          ['link', 'image'],
                          ['clean']
                        ]
                      }}
                      formats={[
                        'header', 'bold', 'italic', 'underline', 'strike',
                        'list', 'bullet', 'color', 'background', 'align',
                        'link', 'image'
                      ]}
                    />
                  </div>
                </div>

                {/* Campo Archivos Adjuntos */}
                <div className="form-group">
                  <label>Archivos Adjuntos:</label>
                  <div className="archivos-container">
                    <input
                      type="file"
                      id="archivos-input-docente"
                      multiple
                      onChange={handleArchivoChange}
                      style={{ display: 'none' }}
                    />
                    <label htmlFor="archivos-input-docente" className="btn-adjuntar-archivo">
                      📎 Adjuntar Archivos
                    </label>
                    {archivosAdjuntos.length > 0 && (
                      <div className="archivos-lista">
                        {archivosAdjuntos.map((archivo, index) => (
                          <div key={index} className="archivo-item">
                            <span className="archivo-nombre">{archivo.name}</span>
                            <span className="archivo-tamaño">
                              {(archivo.size / 1024).toFixed(2)} KB
                            </span>
                            <button
                              type="button"
                              className="archivo-eliminar"
                              onClick={() => eliminarArchivo(index)}
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Botones */}
                <div className="form-actions">
                  <button
                    className="btn-cancelar"
                    onClick={() => {
                      setMostrarModalMensaje(false);
                      setAsuntoMensaje('');
                      setContenidoMensaje('');
                      setArchivosAdjuntos([]);
                      setDocenteParaMensaje(null);
                    }}
                    type="button"
                  >
                    Cancelar
                  </button>
                  <button
                    className="btn-enviar"
                    onClick={enviarMensajeAlDocente}
                    disabled={enviandoMensaje}
                    type="button"
                  >
                    {enviandoMensaje ? '⏳ Enviando...' : '✉️ Enviar Mensaje'}
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
      </div>
    </DashboardLayout>
  );
}

export default AlumnoCursos;

