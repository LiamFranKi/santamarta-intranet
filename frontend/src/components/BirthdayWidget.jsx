import React, { useState, useEffect } from 'react';
import api from '../services/api';
import './BirthdayWidget.css';

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

/**
 * Widget flotante de cumpleaños del mes.
 * - Siempre se muestra al ingresar al dashboard (expanded=true).
 * - Al cerrar, se convierte en icono flotante; al hacer click en el icono se vuelve a abrir.
 * - Respeta config "Mostrar Ventana Cumpleaños" (SI/NO) en Configuración.
 */
function BirthdayWidget({ visibleDefault = true, comunicadoAbierto = false }) {
  const [showConfig, setShowConfig] = useState(null);
  const [expanded, setExpanded] = useState(true);
  const [loading, setLoading] = useState(true);
  const [cumpleanos, setCumpleanos] = useState([]);
  const [mes, setMes] = useState(new Date().getMonth() + 1);
  const [perfil, setPerfil] = useState('TODOS');

  useEffect(() => {
    api.get('/cumpleanos/config').then((res) => {
      setShowConfig((res.data?.show_birthday_window || 'NO').toUpperCase() === 'SI');
    }).catch(() => setShowConfig(false));
  }, []);

  const cargarCumpleanos = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/cumpleanos?mes=${mes}&perfil=${perfil}`);
      setCumpleanos(res.data.cumpleanos || []);
    } catch (err) {
      console.error('Error cargando cumpleaños:', err);
      setCumpleanos([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (showConfig && expanded) cargarCumpleanos();
  }, [showConfig, expanded, mes, perfil]);

  if (showConfig === false || !visibleDefault) return null;

  if (showConfig === null) return null;

  if (!expanded) {
    return (
      <button
        type="button"
        className="birthday-widget-icon"
        onClick={() => setExpanded(true)}
        aria-label="Ver cumpleaños del mes"
        style={{ zIndex: comunicadoAbierto ? 9990 : 9999 }}
      >
        🎂
      </button>
    );
  }

  // Cuando hay comunicado abierto: z-index menor (9990) para quedar detrás del modal (100001)
  // Una vez cerrado el comunicado, el widget se ve normalmente (9999)
  return (
    <div
      className="birthday-widget"
      style={{ zIndex: comunicadoAbierto ? 9990 : 9999 }}
      aria-label="Cumpleaños del mes"
    >
      <div className="birthday-widget-header">
        <h3 className="birthday-widget-title">🎂 Cumpleaños del mes</h3>
        <button
          type="button"
          className="birthday-widget-close"
          onClick={() => setExpanded(false)}
          aria-label="Minimizar"
        >
          ×
        </button>
      </div>

      <div className="birthday-widget-filters">
        <select
          value={mes}
          onChange={(e) => setMes(parseInt(e.target.value, 10))}
          className="birthday-widget-select"
        >
          {MESES.map((m, i) => (
            <option key={m} value={i + 1}>{m}</option>
          ))}
        </select>
        <select
          value={perfil}
          onChange={(e) => setPerfil(e.target.value)}
          className="birthday-widget-select"
        >
          <option value="TODOS">Todos los perfiles</option>
          <option value="PERSONAL">Personal</option>
          <option value="ALUMNO">Alumnos</option>
          <option value="APODERADO">Apoderados</option>
        </select>
      </div>

      <div className="birthday-widget-body">
        {loading ? (
          <p className="birthday-widget-loading">Cargando...</p>
        ) : cumpleanos.length === 0 ? (
          <p className="birthday-widget-empty">No hay cumpleaños este mes</p>
        ) : (
          <table className="birthday-widget-table">
            <thead>
              <tr>
                <th>FECHA</th>
                <th>NOMBRE</th>
                <th>PERFIL</th>
              </tr>
            </thead>
            <tbody>
              {cumpleanos.map((c) => (
                <tr key={c.id}>
                  <td>{c.fecha}</td>
                  <td>{c.nombre}</td>
                  <td>
                    <span className={`birthday-badge birthday-badge-${c.perfil.toLowerCase()}`}>
                      {c.perfil}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default BirthdayWidget;
