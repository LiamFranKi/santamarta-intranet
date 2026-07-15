import React, { useState } from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import PublicacionFormCard from '../../components/PublicacionFormCard';
import PublicacionesCardFeed from '../../components/PublicacionesCardFeed';
import '../DocenteGrupos.css';
import './AdminPublicaciones.css';

export default function AdminPublicaciones() {
  const [refreshPublicaciones, setRefreshPublicaciones] = useState(0);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);

  return (
    <DashboardLayout>
      <div className="docente-grupos admin-publicaciones-page">
        <div className="page-header">
          <h1>Publicaciones</h1>
          <p className="grupo-subtitle">
            Comparte avisos con docentes, alumnos y apoderados. El listado usa el mismo feed del
            módulo docente.
          </p>
        </div>

        <div className="grupos-list-section mundo-card">
          <div
            className="section-controls"
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}
          >
            <h2 className="section-title-blue">Gestión de publicaciones</h2>
            <button
              type="button"
              className="admin-publicaciones-btn"
              onClick={() => setMostrarFormulario((prev) => !prev)}
            >
              {mostrarFormulario ? 'Cancelar' : 'Nueva Publicacion'}
            </button>
          </div>

          {mostrarFormulario && (
            <div className="admin-publicaciones-form-card">
              <PublicacionFormCard
                onPublicacionCreada={() => {
                  setRefreshPublicaciones((n) => n + 1);
                  setMostrarFormulario(false);
                }}
                onCancel={() => setMostrarFormulario(false)}
              />
            </div>
          )}
        </div>

        <div className="grupos-list-section mundo-card admin-publicaciones-listado">
          <div className="section-controls" style={{ marginBottom: '1rem' }}>
            <h2 className="section-title-blue">Listado</h2>
          </div>
          <div className="admin-publicaciones-feed-card">
            <PublicacionesCardFeed refreshTrigger={refreshPublicaciones} layout="grid" />
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
