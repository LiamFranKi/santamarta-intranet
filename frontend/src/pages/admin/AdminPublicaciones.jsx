import React, { useState } from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import PublicacionFormCard from '../../components/PublicacionFormCard';
import PublicacionesCardFeed from '../../components/PublicacionesCardFeed';
import './AdminUsuarios.css';
import './AdminPublicaciones.css';

export default function AdminPublicaciones() {
  const [refreshPublicaciones, setRefreshPublicaciones] = useState(0);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);

  return (
    <DashboardLayout>
      <div className="admin-usu-wrap">
        <div className="admin-usu-header">
          <h1>Publicaciones</h1>
          <p>
            Comparte avisos con docentes, alumnos y apoderados. El listado usa el mismo feed del
            módulo docente.
          </p>
        </div>

        <div className="admin-usu-toolbar">
          <button
            type="button"
            className="admin-usu-btn admin-usu-btn-primary"
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
            />
          </div>
        )}

        <div className="admin-publicaciones-feed-card">
          <PublicacionesCardFeed refreshTrigger={refreshPublicaciones} />
        </div>
      </div>
    </DashboardLayout>
  );
}
