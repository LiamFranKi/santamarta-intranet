import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import EventoModal from './EventoModal';
import './CalendarioWidget.css';

function CalendarioWidget() {
  const { user } = useAuth();
  // Calendario muestra TODAS las actividades de TODOS los años (sin restricción)
  // Usar año actual para la visualización inicial
  const [fechaActual, setFechaActual] = useState(new Date());
  const [fechaSeleccionada, setFechaSeleccionada] = useState(new Date());
  const [actividades, setActividades] = useState([]);
  const [actividadesDelDiaSeleccionado, setActividadesDelDiaSeleccionado] = useState([]);
  const [mostrarModal, setMostrarModal] = useState(false);
  const [actividadSeleccionada, setActividadSeleccionada] = useState(null);
  const [isMobile, setIsMobile] = useState(false);

  const mesActual = fechaActual.getMonth();
  const añoActual = fechaActual.getFullYear();

  const primerDiaMes = new Date(añoActual, mesActual, 1).getDay();
  const diasEnMes = new Date(añoActual, mesActual + 1, 0).getDate();

  const diasSemana = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const meses = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

  // Detectar si es móvil
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Cargar TODAS las actividades de TODOS los años (sin restricción de año)
  useEffect(() => {
    cargarActividades();
  }, [añoActual, mesActual]);

  const cargarActividades = async () => {
    try {
      // Usar ruta según el tipo de usuario
      let ruta;
      if (user?.tipo === 'ALUMNO') {
        ruta = '/alumno/actividades';
      } else if (user?.tipo === 'APODERADO') {
        ruta = '/apoderado/actividades';
      } else {
        ruta = '/docente/actividades';
      }
      const response = await api.get(ruta, {
        params: { anio: añoActual }
      });
      const actividadesData = response.data.actividades || [];
      
      console.log(`📅 Calendario - Actividades del año ${añoActual}:`, actividadesData.length);
      
      if (actividadesData.length > 0) {
        console.log('📅 Primeras actividades:', actividadesData.slice(0, 3).map(a => ({
          id: a.id,
          descripcion: a.descripcion,
          fecha_inicio: a.fecha_inicio,
          fecha_fin: a.fecha_fin,
          año: new Date(a.fecha_inicio).getFullYear()
        })));
      }
      
      setActividades(actividadesData);
    } catch (error) {
      console.error('❌ Error cargando actividades:', error);
      console.error('❌ Error details:', error.response?.data || error.message);
      setActividades([]);
    }
  };

  const cambiarMes = (direccion) => {
    const nuevoMes = mesActual + direccion;
    let nuevoAño = añoActual;
    
    // Si se sale del rango de meses, ajustar el año
    if (nuevoMes < 0) {
      nuevoAño = añoActual - 1;
      setFechaActual(new Date(nuevoAño, 11, 1)); // Diciembre del año anterior
    } else if (nuevoMes > 11) {
      nuevoAño = añoActual + 1;
      setFechaActual(new Date(nuevoAño, 0, 1)); // Enero del año siguiente
    } else {
      setFechaActual(new Date(añoActual, nuevoMes, 1));
    }
  };

  const irAHoy = () => {
    const hoy = new Date();
    setFechaActual(hoy);
    setFechaSeleccionada(hoy);
  };

  const esHoy = (dia) => {
    const hoy = new Date();
    return (
      dia === hoy.getDate() &&
      mesActual === hoy.getMonth() &&
      añoActual === hoy.getFullYear()
    );
  };

  const esSeleccionado = (dia) => {
    return (
      dia === fechaSeleccionada.getDate() &&
      mesActual === fechaSeleccionada.getMonth() &&
      añoActual === fechaSeleccionada.getFullYear()
    );
  };

  // Obtener actividades de un día específico
  const obtenerActividadesDelDia = (dia) => {
    if (!dia || actividades.length === 0) return [];
    
    // Crear fecha del día usando el año actual del calendario
    const fechaDia = new Date(añoActual, mesActual, dia);
    const añoDia = fechaDia.getFullYear();
    const mesDia = fechaDia.getMonth();
    const diaDia = fechaDia.getDate();
    
    return actividades.filter(act => {
      if (!act.fecha_inicio) {
        console.log('⚠️ Actividad sin fecha_inicio:', act);
        return false;
      }
      
      try {
        const fechaInicio = new Date(act.fecha_inicio);
        const fechaFin = act.fecha_fin ? new Date(act.fecha_fin) : new Date(act.fecha_inicio);
        
        // Extraer año, mes, día de las fechas del evento
        const añoInicio = fechaInicio.getFullYear();
        const mesInicio = fechaInicio.getMonth();
        const diaInicio = fechaInicio.getDate();
        
        const añoFin = fechaFin.getFullYear();
        const mesFin = fechaFin.getMonth();
        const diaFin = fechaFin.getDate();
        
        // Crear objetos Date para comparar solo fechas (sin hora)
        const inicioEvento = new Date(añoInicio, mesInicio, diaInicio);
        const finEvento = new Date(añoFin, mesFin, diaFin);
        const fechaComparar = new Date(añoDia, mesDia, diaDia);
        
        // Verificar si el día está dentro del rango del evento
        const estaEnRango = fechaComparar >= inicioEvento && fechaComparar <= finEvento;
        
        if (estaEnRango) {
          console.log(`✅ Actividad encontrada para día ${dia}:`, act.descripcion, {
            fechaComparar: fechaComparar.toISOString().split('T')[0],
            inicioEvento: inicioEvento.toISOString().split('T')[0],
            finEvento: finEvento.toISOString().split('T')[0]
          });
        }
        
        return estaEnRango;
      } catch (error) {
        console.error('❌ Error procesando actividad:', act, error);
        return false;
      }
    });
  };

  // Verificar si un día tiene actividades
  const tieneActividades = (dia) => {
    if (!dia || actividades.length === 0) return false;
    const actividadesDelDia = obtenerActividadesDelDia(dia);
    return actividadesDelDia.length > 0;
  };

  const handleDiaClick = (dia) => {
    if (dia) {
      const nuevaFecha = new Date(añoActual, mesActual, dia);
      setFechaSeleccionada(nuevaFecha);
      
      // Obtener actividades del día seleccionado
      const actividadesDelDia = obtenerActividadesDelDia(dia);
      setActividadesDelDiaSeleccionado(actividadesDelDia);
      
      // Si hay actividades, abrir modal con la primera
      if (actividadesDelDia.length > 0) {
        setActividadSeleccionada(actividadesDelDia[0]);
        setMostrarModal(true);
      }
    }
  };

  const handleActividadClick = (actividad) => {
    setActividadSeleccionada(actividad);
    setMostrarModal(true);
  };

  const dias = [];
  // Días del mes anterior (para completar la primera semana)
  for (let i = 0; i < primerDiaMes; i++) {
    dias.push(null);
  }
  // Días del mes actual
  for (let dia = 1; dia <= diasEnMes; dia++) {
    dias.push(dia);
  }

  // Filtrar días para móvil: solo Lunes a Viernes (índices 1-5)
  const diasSemanaMobile = isMobile ? diasSemana.slice(1, 6) : diasSemana; // ['Lun', 'Mar', 'Mié', 'Jue', 'Vie']
  
  // Filtrar días del mes para móvil: solo los que caen en Lunes (1) a Viernes (5)
  const diasFiltrados = isMobile 
    ? dias.map((dia, index) => {
        if (dia === null) return null;
        const fechaDia = new Date(añoActual, mesActual, dia);
        const diaSemana = fechaDia.getDay(); // 0=Domingo, 1=Lunes, ..., 6=Sábado
        // Solo incluir si es Lunes (1) a Viernes (5)
        return (diaSemana >= 1 && diaSemana <= 5) ? dia : null;
      })
    : dias;

  return (
    <>
      <div className="calendario-widget">
        <div className="calendario-header">
          <button className="btn-nav" onClick={() => cambiarMes(-1)}>‹</button>
          <div className="mes-ano">
            <span>{meses[mesActual]} {añoActual}</span>
            <button className="btn-hoy" onClick={irAHoy}>Hoy</button>
          </div>
          <button className="btn-nav" onClick={() => cambiarMes(1)}>›</button>
        </div>

        <div className="calendario-dias-semana">
          {diasSemanaMobile.map((dia) => (
            <div key={dia} className="dia-semana">
              {dia}
            </div>
          ))}
        </div>

        <div className="calendario-grid">
          {diasFiltrados.map((dia, index) => {
            const tieneAct = dia && tieneActividades(dia);
            return (
              <div
                key={index}
                className={`calendario-dia ${dia === null ? 'empty' : ''} ${dia && esHoy(dia) ? 'hoy' : ''} ${dia && esSeleccionado(dia) ? 'seleccionado' : ''} ${tieneAct ? 'tiene-actividades' : ''}`}
                onClick={() => handleDiaClick(dia)}
                title={tieneAct ? `${obtenerActividadesDelDia(dia).length} actividad(es)` : ''}
              >
                {dia}
                {tieneAct && (
                  <span className="actividad-indicador"></span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {mostrarModal && actividadesDelDiaSeleccionado.length > 0 && createPortal(
        <EventoModal
          actividades={actividadesDelDiaSeleccionado}
          fechaSeleccionada={fechaSeleccionada}
          actividadInicial={actividadSeleccionada}
          onClose={() => {
            setMostrarModal(false);
            setActividadSeleccionada(null);
          }}
        />,
        document.body
      )}
    </>
  );
}

export default CalendarioWidget;

