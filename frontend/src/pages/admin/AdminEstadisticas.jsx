import React from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import './AdminEstadisticas.css';

/**
 * Página de Estadísticas (pagos / pensiones) para el administrador.
 * Contenido se irá añadiendo paso a paso (KPIs, gráficos, deudores, etc.).
 */
function AdminEstadisticas() {
  return (
    <DashboardLayout>
      <div className="admin-estadisticas">
        <div className="admin-estadisticas-header">
          <h1 className="admin-estadisticas-title">📈 Estadísticas</h1>
          <p className="admin-estadisticas-desc">
            Estadísticas de pagos y pensiones. Aquí se mostrarán resúmenes, gráficos y listado de deudores.
          </p>
        </div>
        <div className="admin-estadisticas-content">
          <p className="admin-estadisticas-placeholder">
            Contenido en construcción (Paso 1: revisión de BD completada).
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
}

export default AdminEstadisticas;
