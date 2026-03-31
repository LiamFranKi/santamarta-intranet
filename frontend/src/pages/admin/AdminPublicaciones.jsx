import React, { useState } from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import PublicacionFormCard from '../../components/PublicacionFormCard';
import PublicacionesCardFeed from '../../components/PublicacionesCardFeed';

export default function AdminPublicaciones() {
  const [refreshPublicaciones, setRefreshPublicaciones] = useState(0);

  return (
    <DashboardLayout>
      <div className="dashboard-container" style={{ maxWidth: 920, margin: '0 auto' }}>
        <h1 style={{ fontSize: '1.75rem', marginBottom: '0.5rem' }}>Publicaciones</h1>
        <p style={{ color: '#6b7280', marginBottom: '1.25rem', fontSize: '1rem' }}>
          Comparte avisos con docentes, alumnos y apoderados. El listado usa el mismo feed que el
          módulo docente.
        </p>
        <PublicacionFormCard onPublicacionCreada={() => setRefreshPublicaciones((n) => n + 1)} />
        <div style={{ marginTop: '1.25rem' }}>
          <PublicacionesCardFeed refreshTrigger={refreshPublicaciones} />
        </div>
      </div>
    </DashboardLayout>
  );
}
