import React from 'react';
import DashboardLayout from '../components/DashboardLayout';
import './AlumnoAvatar.css';

function AlumnoAvatar() {
  return (
    <DashboardLayout>
      <div className="alumno-avatar">
        <div className="page-header">
          <h1>🎭 Mi Avatar</h1>
          <p>Funcionalidad en desarrollo</p>
        </div>
        <div className="avatar-placeholder">
          <div className="avatar-icon">🎭</div>
          <p>Esta funcionalidad estará disponible próximamente</p>
        </div>
      </div>
    </DashboardLayout>
  );
}

export default AlumnoAvatar;

