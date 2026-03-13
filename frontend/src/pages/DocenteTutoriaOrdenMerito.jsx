import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import api from '../services/api';
import './DocenteTutoria.css';

const BIMESTRES_LABEL = ['I', 'II', 'III', 'IV'];

function DocenteTutoriaOrdenMerito() {
  const { grupoId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [grupo, setGrupo] = useState(null);
  const [detalle, setDetalle] = useState({ b1: [], b2: [], b3: [], b4: [] });
  const [error, setError] = useState(null);

  useEffect(() => {
    const cargar = async () => {
      if (!grupoId) return;
      try {
        setLoading(true);
        setError(null);
        const res = await api.get(`/docente/tutoria/grupos/${grupoId}/orden-merito`);
        setGrupo(res.data.grupo || null);
        setDetalle(res.data.detalle || { b1: [], b2: [], b3: [], b4: [] });
      } catch (err) {
        setError(err.response?.data?.error || 'Error al cargar el reporte');
      } finally {
        setLoading(false);
      }
    };
    cargar();
  }, [grupoId]);

  const volver = () => navigate('/docente/tutoria');

  return (
    <DashboardLayout>
      <div className="docente-tutoria docente-tutoria-orden-merito">
        <div className="tutoria-content mundo-card">
          <button type="button" className="btn-regresar" onClick={volver}>
            <span className="btn-icon">←</span>
            Volver a Tutoría
          </button>
          <h1 className="section-title-blue">Reporte de Orden de Mérito</h1>
          {grupo && (
            <p className="grupo-subtitle">
              {grupo.grado}° {grupo.seccion} — {grupo.nivel_nombre} — Año {grupo.anio}
            </p>
          )}

          {loading && <div className="docente-tutoria-loading">Cargando...</div>}
          {error && (
            <div className="error-orden-merito" style={{ color: '#b91c1c', marginTop: '1rem' }}>
              {error}
            </div>
          )}
          {!loading && !error && (
            <div className="orden-merito-tabs">
              {[1, 2, 3, 4].map((b) => {
                const list = detalle[`b${b}`] || [];
                return (
                  <div key={b} className="orden-merito-bimestre">
                    <h2 className="orden-merito-bimestre-title">Bimestre {BIMESTRES_LABEL[b - 1]}</h2>
                    <div className="orden-merito-table-wrap">
                      <table className="orden-merito-table">
                        <thead>
                          <tr>
                            <th>Puesto</th>
                            <th>Apellidos y Nombres</th>
                            <th>Promedio</th>
                          </tr>
                        </thead>
                        <tbody>
                          {list.map((row) => (
                            <tr key={`b${b}-${row.puesto}-${row.apellido_paterno}-${row.nombres}`}>
                              <td>{row.puesto}</td>
                              <td>{[row.apellido_paterno, row.apellido_materno, row.nombres].filter(Boolean).join(' ')}</td>
                              <td>{typeof row.promedio === 'number' ? row.promedio.toFixed(2) : row.promedio}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

export default DocenteTutoriaOrdenMerito;
