import React, { useState } from 'react';
import AdminMatriculasInscripcion from './AdminMatriculasInscripcion';
import AdminMatriculasConFirma from './AdminMatriculasConFirma';
import './AdminMatriculas.css';

export default function AdminMatriculas() {
  const [tab, setTab] = useState('inscripcion');

  return (
    <div className="admin-mat-shell">
      <div className="admin-mat-tabs" role="tablist" aria-label="Matrículas">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'inscripcion'}
          className={tab === 'inscripcion' ? 'is-active' : ''}
          onClick={() => setTab('inscripcion')}
        >
          Inscripción de alumno nuevo
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'enviadas'}
          className={tab === 'enviadas' ? 'is-active' : ''}
          onClick={() => setTab('enviadas')}
        >
          Enviadas por el padre
        </button>
      </div>
      {tab === 'inscripcion' ? <AdminMatriculasInscripcion /> : <AdminMatriculasConFirma />}
    </div>
  );
}
