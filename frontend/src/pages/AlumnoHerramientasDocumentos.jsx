import React, { useState, useEffect } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import DocenteDocumentosGestionSection from '../components/DocenteDocumentosGestionSection';
import api from '../services/api';

export default function AlumnoHerramientasDocumentos() {
  const [documentos, setDocumentos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get('/alumno/documentos-gestion');
        if (!cancelled) setDocumentos(res.data.documentos || []);
      } catch {
        if (!cancelled) setDocumentos([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <DashboardLayout>
      <div className="docente-dashboard docente-herramientas-page">
        <DocenteDocumentosGestionSection
          documentos={documentos}
          loading={loading}
          heroTitle="Documentos"
          heroSubtitle="Solo lectura: abre cada PDF en una nueva pestaña. Los documentos los publica administración según tu perfil (alumno o todos)."
        />
      </div>
    </DashboardLayout>
  );
}
