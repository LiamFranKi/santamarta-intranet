import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import DashboardLayout from '../components/DashboardLayout';
import api from '../services/api';
import './DocentePsicologia.css';
import '../admin/AdminPsicologia.css';

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

function chipClassEstado(estado) {
  const e = String(estado || '').toUpperCase();
  if (e === 'ACTIVO') return 'psi-doc-piar-chip psi-doc-piar-chip--activo';
  if (e === 'BORRADOR') return 'psi-doc-piar-chip psi-doc-piar-chip--borrador';
  if (e === 'ARCHIVADO') return 'psi-doc-piar-chip psi-doc-piar-chip--archivado';
  return 'psi-doc-piar-chip';
}

export default function DocentePsicologiaMisPiar() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  /** Lista desplegada por defecto (pantalla dedicada a PIAR). */
  const [listaAbierta, setListaAbierta] = useState(true);

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
          <h1>PIAR</h1>
          <p>
            Aquí ve los planes PIAR de alumnos que están en <strong>sus grupos o tutorías</strong> (mismo criterio que
            al abrir un expediente). El equipo de Psicología consulta además el listado completo del colegio desde su
            pantalla <strong>Psicología → Buscar alumnos</strong> (acordeón «Lista de alumnos con PIAR»).
          </p>
        </div>

        {err && (
          <div className="psi-doc-alert" role="alert">
            {err}
          </div>
        )}

        <div className="psi-pendientes-card psi-piar-accordion">
          <button
            type="button"
            className="psi-piar-accordion__trigger"
            onClick={() => setListaAbierta((v) => !v)}
            aria-expanded={listaAbierta}
            id="psi-doc-piar-accordion-trigger"
            aria-controls="psi-doc-piar-accordion-panel"
          >
            <div className="psi-piar-accordion__trigger-main">
              <span className="psi-pendientes-title psi-piar-accordion__title">Lista de PIAR</span>
              <span className="psi-piar-accordion__meta" aria-live="polite">
                {loading ? (
                  <CircularProgress size={20} sx={{ color: '#c2410c' }} />
                ) : (
                  <span className="psi-piar-accordion__count">
                    {rows.length === 0
                      ? 'Sin registros'
                      : `${rows.length} registro${rows.length === 1 ? '' : 's'}`}
                  </span>
                )}
              </span>
            </div>
            <span className="psi-piar-accordion__chevron" aria-hidden>
              {listaAbierta ? '▲' : '▼'}
            </span>
          </button>
          <p className="psi-pendientes-sub psi-piar-accordion__sub">
            Mismo tipo de información que en Psicología (alumno, año, versión, estado, actualización), en formato de
            tarjetas. Pulse el encabezado para ocultar o mostrar la lista.
          </p>

          <div
            id="psi-doc-piar-accordion-panel"
            role="region"
            aria-labelledby="psi-doc-piar-accordion-trigger"
            className="psi-piar-accordion__panel"
            hidden={!listaAbierta}
          >
            {loading ? (
              <Box display="flex" justifyContent="center" py={2}>
                <CircularProgress size={28} />
              </Box>
            ) : rows.length === 0 ? (
              <p className="psi-doc-muted" style={{ margin: 0 }}>
                No hay PIAR disponibles para sus grupos o tutorías en este momento.
              </p>
            ) : (
              <div className="psi-doc-piar-list">
                {rows.map((r, i) => (
                  <div key={r.id} className={`psi-doc-piar-item psi-doc-piar-item--${i % 4}`}>
                    <div className="psi-doc-piar-item__main">
                      <div className="psi-doc-piar-item__name">{r.alumno_nombre || `Alumno #${r.alumno_id}`}</div>
                      {r.grupo_aula_etiqueta ? (
                        <div className="psi-doc-piar-item__grupo">{String(r.grupo_aula_etiqueta).trim()}</div>
                      ) : null}
                      <div className="psi-doc-piar-item__chips">
                        <span className="psi-doc-piar-chip">Año {r.anio}</span>
                        <span className="psi-doc-piar-chip">v{r.numero_version}</span>
                        <span className={chipClassEstado(r.estado)}>{r.estado}</span>
                      </div>
                      <div className="psi-doc-piar-item__fecha">
                        Actualización: {formatLimaSoloFecha(r.updated_at || r.created_at)}
                      </div>
                    </div>
                    <div className="psi-doc-piar-item__actions">
                      <button
                        type="button"
                        className="psi-doc-btn psi-doc-btn-primary"
                        onClick={() => navigate(`/docente/psicologia/piar/${r.id}`)}
                      >
                        Abrir
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
