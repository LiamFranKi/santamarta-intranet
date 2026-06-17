import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import DashboardLayout from '../../components/DashboardLayout';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import '../DocenteActividades.css';
import '../DocenteGrupos.css';
import Swal from 'sweetalert2';
import { crearFechaLima, datetimeLocalAMysql, mysqlADatetimeLocal } from '../../utils/fechaLima';

const MESES = [
  { num: 1, nombre: 'Enero', nombreCorto: 'Ene', icon: '❄️' },
  { num: 2, nombre: 'Febrero', nombreCorto: 'Feb', icon: '💝' },
  { num: 3, nombre: 'Marzo', nombreCorto: 'Mar', icon: '🌸' },
  { num: 4, nombre: 'Abril', nombreCorto: 'Abr', icon: '🌷' },
  { num: 5, nombre: 'Mayo', nombreCorto: 'May', icon: '🌺' },
  { num: 6, nombre: 'Junio', nombreCorto: 'Jun', icon: '☀️' },
  { num: 7, nombre: 'Julio', nombreCorto: 'Jul', icon: '🔥' },
  { num: 8, nombre: 'Agosto', nombreCorto: 'Ago', icon: '🌻' },
  { num: 9, nombre: 'Septiembre', nombreCorto: 'Sep', icon: '🍂' },
  { num: 10, nombre: 'Octubre', nombreCorto: 'Oct', icon: '🎃' },
  { num: 11, nombre: 'Noviembre', nombreCorto: 'Nov', icon: '🍁' },
  { num: 12, nombre: 'Diciembre', nombreCorto: 'Dic', icon: '🎄' }
];

function AdminActividades() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [loadingMes, setLoadingMes] = useState(false);
  const [todasLasActividades, setTodasLasActividades] = useState([]);
  const [actividadesFiltradas, setActividadesFiltradas] = useState([]);
  const [mesSeleccionado, setMesSeleccionado] = useState(null);
  const [anio, setAnio] = useState(new Date().getFullYear());
  const [actividadesAgrupadas, setActividadesAgrupadas] = useState({});
  const [mostrarModal, setMostrarModal] = useState(false);
  const [actividadEditando, setActividadEditando] = useState(null);
  const [formulario, setFormulario] = useState({
    descripcion: '',
    lugar: '',
    detalles: '',
    fecha_inicio: '',
    fecha_fin: ''
  });

  const filtrarYAgruparActividades = useCallback((actividadesData, mes) => {
    let actividadesFiltradas = actividadesData;
    if (mes !== null) {
      actividadesFiltradas = actividadesData.filter(a => {
        const fecha = crearFechaLima(a.fecha_inicio);
        return fecha && fecha.getMonth() + 1 === mes;
      });
    }
    
    setActividadesFiltradas(actividadesFiltradas);

    const agrupadas = {};
    actividadesFiltradas.forEach(actividad => {
      const fechaInicio = crearFechaLima(actividad.fecha_inicio);
      const fechaFin = actividad.fecha_fin ? crearFechaLima(actividad.fecha_fin) : fechaInicio;
      
      if (!fechaInicio) return;
      
      const fechaActual = new Date(fechaInicio);
      while (fechaActual <= fechaFin) {
        // Usar formato YYYY-MM-DD en hora local
        const year = fechaActual.getFullYear();
        const month = String(fechaActual.getMonth() + 1).padStart(2, '0');
        const day = String(fechaActual.getDate()).padStart(2, '0');
        const fechaKey = `${year}-${month}-${day}`;
        
        if (!agrupadas[fechaKey]) {
          agrupadas[fechaKey] = [];
        }
        if (!agrupadas[fechaKey].some(a => a.id === actividad.id)) {
          agrupadas[fechaKey].push(actividad);
        }
        fechaActual.setDate(fechaActual.getDate() + 1);
      }
    });
    
    setActividadesAgrupadas(agrupadas);
  }, []);

  const cargarTodasLasActividades = useCallback(async () => {
    try {
      setLoading(true);
      const añoActual = new Date().getFullYear();
      const response = await api.get('/docente/actividades', {
        params: { anio: añoActual }
      });
      const actividadesData = response.data.actividades || [];
      setTodasLasActividades(actividadesData);
      
      if (response.data.anio) {
        setAnio(response.data.anio);
      } else {
        setAnio(añoActual);
      }

      filtrarYAgruparActividades(actividadesData, null);
    } catch (error) {
      console.error('Error cargando actividades:', error);
    } finally {
      setLoading(false);
    }
  }, [filtrarYAgruparActividades]);

  useEffect(() => {
    cargarTodasLasActividades();
  }, [cargarTodasLasActividades]);

  useEffect(() => {
    if (todasLasActividades.length > 0) {
      setLoadingMes(true);
      const timeoutId = setTimeout(() => {
        filtrarYAgruparActividades(todasLasActividades, mesSeleccionado);
        setLoadingMes(false);
      }, 100);
      
      return () => clearTimeout(timeoutId);
    }
  }, [mesSeleccionado, todasLasActividades, filtrarYAgruparActividades]);

  const abrirModalCrear = () => {
    setActividadEditando(null);
    setFormulario({
      descripcion: '',
      lugar: '',
      detalles: '',
      fecha_inicio: '',
      fecha_fin: ''
    });
    setMostrarModal(true);
  };

  const abrirModalEditar = (actividad) => {
    setActividadEditando(actividad);
    setFormulario({
      descripcion: actividad.descripcion || '',
      lugar: actividad.lugar || '',
      detalles: actividad.detalles || '',
      fecha_inicio: mysqlADatetimeLocal(actividad.fecha_inicio),
      fecha_fin: mysqlADatetimeLocal(actividad.fecha_fin || actividad.fecha_inicio)
    });
    setMostrarModal(true);
  };

  const cerrarModal = () => {
    setMostrarModal(false);
    setActividadEditando(null);
    setFormulario({
      descripcion: '',
      lugar: '',
      detalles: '',
      fecha_inicio: '',
      fecha_fin: ''
    });
  };

  const handleGuardarActividad = async (e) => {
    e.preventDefault();
    
    try {
      const datosEnviar = {
        ...formulario,
        fecha_inicio: datetimeLocalAMysql(formulario.fecha_inicio),
        fecha_fin: formulario.fecha_fin ? datetimeLocalAMysql(formulario.fecha_fin) : null
      };

      if (actividadEditando) {
        // Editar
        const response = await api.put(`/docente/actividades/${actividadEditando.id}`, datosEnviar);
        
        if (response.data.success) {
          Swal.fire({
            icon: 'success',
            title: '¡Éxito!',
            text: 'Actividad actualizada correctamente',
            timer: 2000,
            showConfirmButton: false
          });
          cerrarModal();
          cargarTodasLasActividades();
        }
      } else {
        // Crear
        const response = await api.post('/docente/actividades', datosEnviar);
        
        if (response.data.success) {
          Swal.fire({
            icon: 'success',
            title: '¡Éxito!',
            text: 'Actividad creada correctamente',
            timer: 2000,
            showConfirmButton: false
          });
          cerrarModal();
          cargarTodasLasActividades();
        }
      }
    } catch (error) {
      console.error('Error guardando actividad:', error);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: error.response?.data?.error || 'Error al guardar actividad'
      });
    }
  };

  const handleEliminarActividad = async (actividad) => {
    const result = await Swal.fire({
      title: '¿Estás seguro?',
      text: `¿Deseas eliminar la actividad "${actividad.descripcion}"?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    });

    if (result.isConfirmed) {
      try {
        const response = await api.delete(`/docente/actividades/${actividad.id}`);
        
        if (response.data.success) {
          Swal.fire({
            icon: 'success',
            title: '¡Eliminado!',
            text: 'Actividad eliminada correctamente',
            timer: 2000,
            showConfirmButton: false
          });
          cargarTodasLasActividades();
        }
      } catch (error) {
        console.error('Error eliminando actividad:', error);
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: error.response?.data?.error || 'Error al eliminar actividad'
        });
      }
    }
  };

  const obtenerDiasConActividades = () => {
    const dias = Object.keys(actividadesAgrupadas).sort();
    if (!mesSeleccionado) return dias;
    return dias.filter(fecha => {
      const fechaObj = new Date(fecha);
      return fechaObj.getMonth() + 1 === mesSeleccionado;
    });
  };

  const formatearFecha = (fechaStr) => {
    // Interpretar fecha como hora local (no UTC)
    const fecha = crearFechaLima(fechaStr);
    if (!fecha) return { diaSemana: '', dia: 0, mes: '', anio: 0, fechaCompleta: null };
    
    const diasSemana = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
                   'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    
    return {
      diaSemana: diasSemana[fecha.getDay()],
      dia: fecha.getDate(),
      mes: meses[fecha.getMonth()],
      anio: fecha.getFullYear(),
      fechaCompleta: fecha
    };
  };

  const obtenerColorActividad = (index) => {
    const colores = [
      'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
      'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
      'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
      'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
      'linear-gradient(135deg, #30cfd0 0%, #330867 100%)',
      'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)',
      'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)'
    ];
    return colores[index % colores.length];
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="actividades-loading">
          <div className="loading-spinner-actividades">
            <div className="spinner-ring"></div>
            <div className="spinner-ring"></div>
            <div className="spinner-ring"></div>
          </div>
          <p>Cargando actividades...</p>
        </div>
      </DashboardLayout>
    );
  }

  const diasConActividades = obtenerDiasConActividades();
  const mesActual = new Date().getMonth() + 1;

  return (
    <DashboardLayout>
      <div className="docente-actividades">
        <div className="actividades-header">
          <div className="header-content" style={{ width: '100%', textAlign: 'center' }}>
            <h1 className="actividades-title">
              <span className="title-icon">📅</span>
              Calendario de Actividades
            </h1>
            <p className="actividades-subtitle" style={{
              fontSize: '1.5rem',
              fontWeight: '700',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              marginTop: '0.5rem',
              textAlign: 'center'
            }}>
              Año Académico {anio}
            </p>
          </div>
          <button 
            className="btn-crear-actividad"
            onClick={abrirModalCrear}
            style={{
              padding: '0.75rem 1.5rem',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '10px',
              cursor: 'pointer',
              fontSize: '1rem',
              fontWeight: '600',
              boxShadow: '0 4px 12px rgba(102, 126, 234, 0.3)'
            }}
          >
            ➕ Crear Actividad
          </button>
        </div>

        <div className="actividades-main-container">
          <div className="meses-sidebar">
            <div className="sidebar-header">
              <h3>Filtrar por Mes</h3>
            </div>
            <div className="meses-list">
              <button
                className={`mes-item ${mesSeleccionado === null ? 'active' : ''}`}
                onClick={() => setMesSeleccionado(null)}
              >
                <span className="mes-icon">📆</span>
                <span className="mes-nombre">Todos</span>
                <span className="mes-count">
                  {todasLasActividades.length}
                </span>
              </button>
              {MESES.map((mes) => {
                const actividadesDelMes = todasLasActividades.filter(a => {
                  const fecha = crearFechaLima(a.fecha_inicio);
                  return fecha && fecha.getMonth() + 1 === mes.num;
                });
                const tieneActividades = actividadesDelMes.length > 0;
                const esMesActual = mes.num === mesActual;
                
                return (
                  <button
                    key={mes.num}
                    className={`mes-item ${mesSeleccionado === mes.num ? 'active' : ''} ${!tieneActividades ? 'sin-actividades' : ''} ${esMesActual ? 'mes-actual' : ''}`}
                    onClick={() => setMesSeleccionado(mes.num)}
                    disabled={!tieneActividades}
                  >
                    <span className="mes-icon">{mes.icon}</span>
                    <span className="mes-nombre">{mes.nombreCorto}</span>
                    <span className="mes-count">
                      {actividadesDelMes.length}
                    </span>
                    {esMesActual && <span className="mes-badge">Hoy</span>}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="actividades-content">
            {diasConActividades.length > 0 ? (
              <div className="timeline-container">
                {diasConActividades.map((fechaKey, index) => {
                  const fechaInfo = formatearFecha(fechaKey);
                  const actividadesDelDia = actividadesAgrupadas[fechaKey];
                  
                  // Comparar con hoy en hora local
                  const hoy = new Date();
                  const hoyKey = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
                  const esHoy = fechaKey === hoyKey;
                  
                  return (
                    <div key={fechaKey} className="timeline-day">
                      <div className="day-header">
                        <div className="day-marker">
                          <div className="marker-dot"></div>
                          {index < diasConActividades.length - 1 && (
                            <div className="marker-line"></div>
                          )}
                        </div>
                        <div className="day-info">
                          <div className={`day-date ${esHoy ? 'hoy' : ''}`}>
                            <span className="day-number">{fechaInfo.dia}</span>
                            <div className="day-month-year">
                              <span className="day-month">{fechaInfo.mes}</span>
                              <span className="day-year">{fechaInfo.anio}</span>
                            </div>
                          </div>
                          <div className="day-weekday">{fechaInfo.diaSemana}</div>
                          {esHoy && <span className="hoy-badge">Hoy</span>}
                        </div>
                      </div>
                      
                      <div className="actividades-del-dia">
                        {actividadesDelDia.map((actividad, actIndex) => {
                          const fechaInicio = crearFechaLima(actividad.fecha_inicio);
                          const fechaFin = actividad.fecha_fin ? crearFechaLima(actividad.fecha_fin) : fechaInicio;
                          
                          if (!fechaInicio) return null;
                          
                          // Comparar fechas en formato local
                          const fechaInicioKey = `${fechaInicio.getFullYear()}-${String(fechaInicio.getMonth() + 1).padStart(2, '0')}-${String(fechaInicio.getDate()).padStart(2, '0')}`;
                          const fechaFinKey = `${fechaFin.getFullYear()}-${String(fechaFin.getMonth() + 1).padStart(2, '0')}-${String(fechaFin.getDate()).padStart(2, '0')}`;
                          const esRango = fechaInicioKey !== fechaFinKey;
                          
                          const horaInicio = fechaInicio.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
                          
                          return (
                            <div
                              key={`${actividad.id}-${actIndex}`}
                              className="actividad-card"
                              style={{ background: obtenerColorActividad(actIndex), position: 'relative' }}
                            >
                              <div style={{ position: 'absolute', top: '0.5rem', right: '0.5rem', display: 'flex', gap: '0.5rem' }}>
                                <button
                                  onClick={() => abrirModalEditar(actividad)}
                                  style={{
                                    background: 'rgba(255, 255, 255, 0.9)',
                                    border: 'none',
                                    borderRadius: '6px',
                                    padding: '0.4rem 0.6rem',
                                    cursor: 'pointer',
                                    fontSize: '0.9rem',
                                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                                  }}
                                  title="Editar"
                                >
                                  ✏️
                                </button>
                                <button
                                  onClick={() => handleEliminarActividad(actividad)}
                                  style={{
                                    background: 'rgba(239, 68, 68, 0.9)',
                                    border: 'none',
                                    borderRadius: '6px',
                                    padding: '0.4rem 0.6rem',
                                    cursor: 'pointer',
                                    fontSize: '0.9rem',
                                    color: 'white',
                                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                                  }}
                                  title="Eliminar"
                                >
                                  🗑️
                                </button>
                              </div>
                              <div className="actividad-time">
                                <span className="time-icon">🕐</span>
                                {horaInicio}
                              </div>
                              <h3 className="actividad-titulo">{actividad.descripcion}</h3>
                              {actividad.lugar && (
                                <div className="actividad-lugar">
                                  <span className="lugar-icon">📍</span>
                                  {actividad.lugar}
                                </div>
                              )}
                              {actividad.detalles && (
                                <p className="actividad-detalles">{actividad.detalles}</p>
                              )}
                              {esRango && (
                                <div className="actividad-rango">
                                  <span className="rango-icon">📆</span>
                                  Del {fechaInicio.toLocaleDateString('es-PE', { year: 'numeric', month: 'long', day: 'numeric' })} al {fechaFin.toLocaleDateString('es-PE', { year: 'numeric', month: 'long', day: 'numeric' })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="empty-state-actividades">
                <div className="empty-icon">📅</div>
                <h3>No hay actividades</h3>
                <p>
                  {mesSeleccionado 
                    ? `No hay actividades programadas para ${MESES.find(m => m.num === mesSeleccionado)?.nombre || 'este mes'}`
                    : 'No hay actividades programadas para el año académico actual'}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal de Crear/Editar Actividad */}
      {mostrarModal && createPortal(
        <div 
          className="modal-mensaje-overlay" 
          onClick={cerrarModal}
          style={{ zIndex: 100000 }}
        >
          <div 
            className="modal-mensaje-container" 
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-actividad-title"
            style={{ maxWidth: '700px' }}
          >
            <div className="modal-mensaje-header">
              <h2 id="modal-actividad-title">
                {actividadEditando ? '✏️ Editar Actividad' : '➕ Crear Nueva Actividad'}
              </h2>
              <button
                className="modal-mensaje-close"
                onClick={cerrarModal}
                type="button"
                aria-label="Cerrar modal"
              >
                ✕
              </button>
            </div>

            <div className="modal-mensaje-body">
              <form onSubmit={handleGuardarActividad}>
                <div className="form-group">
                  <label>Descripción *</label>
                  <input
                    type="text"
                    required
                    value={formulario.descripcion}
                    onChange={(e) => setFormulario({...formulario, descripcion: e.target.value})}
                    className="form-input"
                    placeholder="Ej: Reunión de padres de familia"
                  />
                </div>
                <div className="form-group">
                  <label>Lugar</label>
                  <input
                    type="text"
                    value={formulario.lugar}
                    onChange={(e) => setFormulario({...formulario, lugar: e.target.value})}
                    className="form-input"
                    placeholder="Ej: Auditorio principal"
                  />
                </div>
                <div className="form-group">
                  <label>Detalles</label>
                  <textarea
                    value={formulario.detalles}
                    onChange={(e) => setFormulario({...formulario, detalles: e.target.value})}
                    rows="4"
                    className="form-input"
                    placeholder="Información adicional sobre la actividad..."
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group">
                    <label>Fecha Inicio *</label>
                    <input
                      type="datetime-local"
                      required
                      value={formulario.fecha_inicio}
                      onChange={(e) => setFormulario({...formulario, fecha_inicio: e.target.value})}
                      className="form-input"
                    />
                  </div>
                  <div className="form-group">
                    <label>Fecha Fin</label>
                    <input
                      type="datetime-local"
                      value={formulario.fecha_fin}
                      onChange={(e) => setFormulario({...formulario, fecha_fin: e.target.value})}
                      className="form-input"
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
                  <button
                    type="button"
                    onClick={cerrarModal}
                    style={{
                      padding: '0.75rem 1.5rem',
                      background: '#f3f4f6',
                      color: '#374151',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '1rem',
                      fontWeight: '600'
                    }}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    style={{
                      padding: '0.75rem 1.5rem',
                      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '1rem',
                      fontWeight: '600'
                    }}
                  >
                    {actividadEditando ? 'Guardar Cambios' : 'Crear Actividad'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>,
        document.body
      )}
    </DashboardLayout>
  );
}

export default AdminActividades;
