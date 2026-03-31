import React, { useState } from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import PublicacionFormCard from '../../components/PublicacionFormCard';
import PublicacionesCardFeed from '../../components/PublicacionesCardFeed';
import './AdminDocumentosGestion.css';
import './AdminPublicaciones.css';

export default function AdminPublicaciones() {
  const [refreshPublicaciones, setRefreshPublicaciones] = useState(0);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);

  return (
    <DashboardLayout>
      <div className="dg-page">
        <header className="dg-page-header">
          <h1>Publicaciones</h1>
          <p>
            Comparte avisos con docentes, alumnos y apoderados. El listado usa el mismo feed del
            módulo docente.
          </p>
        </header>

        <section className="dg-section">
          <div className="dg-section-title">
            <span>Gestión de publicaciones</span>
            <button
              type="button"
              className="dg-btn-primary"
              onClick={() => setMostrarFormulario((prev) => !prev)}
            >
              {mostrarFormulario ? 'Cancelar' : 'Crear publicación'}
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
        </section>

        <section className="dg-section">
          <div className="dg-section-title">
            <span>Listado</span>
          </div>
          <div className="admin-publicaciones-feed-card">
            <PublicacionesCardFeed refreshTrigger={refreshPublicaciones} />
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
}
