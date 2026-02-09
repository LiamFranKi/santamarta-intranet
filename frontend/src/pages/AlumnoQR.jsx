import React from 'react';
import DashboardLayout from '../components/DashboardLayout';
import './AlumnoQR.css';

function AlumnoQR() {
  return (
    <DashboardLayout>
      <div className="alumno-qr">
        <div className="page-header">
          <h1>📱 Mi QR</h1>
          <p>Funcionalidad en desarrollo</p>
        </div>
        <div className="qr-placeholder">
          <div className="qr-icon">📱</div>
          <p>Esta funcionalidad estará disponible próximamente</p>
        </div>
      </div>
    </DashboardLayout>
  );
}

export default AlumnoQR;

