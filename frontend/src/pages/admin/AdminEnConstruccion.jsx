import React from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import './AdminUsuarios.css';

export default function AdminEnConstruccion({ titulo }) {
  return (
    <DashboardLayout>
      <div className="admin-usu-wrap">
        <div className="admin-usu-header">
          <h1>{titulo}</h1>
          <p>Esta sección está en construcción.</p>
        </div>
        <div className="admin-usu-table-card" style={{ padding: '1.25rem' }}>
          <div className="admin-conexiones-empty">En construcción...</div>
        </div>
      </div>
    </DashboardLayout>
  );
}
