import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import api from '../services/api';
import './DocentePsicologia.css';

const LIMA_TZ = 'America/Lima';

function formatLimaSoloFecha(iso) {
  if (iso == null || iso === '') return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-PE', {
    timeZone: LIMA_TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export default function DocentePsicologiaMisPiar() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const cargar = useCallback(() => {
    setLoading(true);
    api
      .get('/docente/psicologia/mis-piar')
      .then(({ data }) => {
        setRows(data.piar_lista || []);
        setErr(null);
      })
      .catch((e) => setErr(e.response?.data?.error || 'No se pudo cargar'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return (
    <DashboardLayout>
      <div className="psi-doc-page">
        <div className="psi-doc-hero">
          <h1>PIAR a mi cargo</h1>
          <p>
            Solo aparecen planes donde psicología o administración lo asignaron como <strong>docente responsable</strong> del seguimiento en
            aula. Complete estrategias, avances y la bitácora desde <strong>Abrir</strong>.
          </p>
        </div>
        {loading && <p className="psi-doc-muted">Cargando…</p>}
        {err && <p className="psi-doc-muted" style={{ color: '#b91c1c' }}>{err}</p>}
        {!loading && !err && (
          <div className="psi-doc-table-wrap">
            <table className="psi-doc-table">
              <thead>
                <tr>
                  <th style={{ textAlign: 'center' }}>Alumno</th>
                  <th>Año</th>
                  <th>Versión</th>
                  <th>Estado</th>
                  <th>Actualización</th>
                  <th style={{ width: 100 }}> </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td style={{ textAlign: 'center' }}>
                      <div>{r.alumno_nombre || `#${r.alumno_id}`}</div>
                      {r.grupo_aula_etiqueta ? (
                        <div className="psi-doc-grupo-sub">{String(r.grupo_aula_etiqueta).trim()}</div>
                      ) : null}
                    </td>
                    <td>{r.anio}</td>
                    <td>{r.numero_version}</td>
                    <td>{r.estado}</td>
                    <td>{formatLimaSoloFecha(r.updated_at || r.created_at)}</td>
                    <td>
                      <button type="button" className="psi-doc-btn psi-doc-btn-primary" onClick={() => navigate(`/docente/psicologia/piar/${r.id}`)}>
                        Abrir
                      </button>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '1.5rem' }} className="psi-doc-muted">
                      No tiene PIAR asignados. El equipo debe elegirlo en el expediente del alumno (campo docente responsable).
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
