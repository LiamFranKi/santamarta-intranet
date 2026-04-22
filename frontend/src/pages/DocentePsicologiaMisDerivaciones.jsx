import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import EditIcon from '@mui/icons-material/Edit';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import api from '../services/api';
import Swal from 'sweetalert2';
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

export default function DocentePsicologiaMisDerivaciones() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const cargar = useCallback(() => {
    setLoading(true);
    api
      .get('/docente/psicologia/mis-derivaciones')
      .then(({ data }) => {
        setRows(data.derivaciones || []);
        setErr(null);
      })
      .catch((e) => setErr(e.response?.data?.error || 'No se pudo cargar'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const irEditar = (r) => {
    const mid = r.matricula_id != null ? String(r.matricula_id) : '';
    const q = new URLSearchParams();
    if (mid) q.set('matricula_id', mid);
    q.set('derivacion_id', String(r.id));
    navigate(`/docente/psicologia/derivar/${r.alumno_id}?${q.toString()}`);
  };

  const eliminar = async (r) => {
    if (String(r.estado) !== 'RECIBIDA') {
      Swal.fire({ icon: 'info', title: 'Solo se pueden eliminar derivaciones en estado RECIBIDA.' });
      return;
    }
    const ok = await Swal.fire({
      icon: 'warning',
      title: '¿Eliminar esta derivación?',
      text: 'Si psicología ya la tomó a su cargo, no podrá eliminarla.',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
    });
    if (!ok.isConfirmed) return;
    try {
      await api.delete(`/docente/psicologia/derivaciones/${r.id}`);
      await Swal.fire({ icon: 'success', title: 'Eliminada', timer: 1200, showConfirmButton: false });
      cargar();
    } catch (e) {
      Swal.fire({ icon: 'error', title: e.response?.data?.error || 'No se pudo eliminar' });
    }
  };

  return (
    <DashboardLayout>
      <div className="psi-doc-page">
        <div className="psi-doc-hero">
          <h1>Derivaciones psicológicas</h1>
          <p>
            Fichas que usted envió como docente referente. Para registrar una nueva:{' '}
            <strong>Grupos asignados</strong> → <strong>Opciones</strong> → <strong>Derivación psicológica</strong>.
          </p>
        </div>

        <div className="psi-doc-card">
          <button type="button" className="psi-doc-btn psi-doc-btn-secondary" onClick={() => navigate('/docente/grupos')}>
            Ir a mis grupos
          </button>
        </div>

        {loading && <p className="psi-doc-muted">Cargando…</p>}
        {err && <p className="psi-doc-muted" style={{ color: '#b91c1c' }}>{err}</p>}

        {!loading && !err && (
          <div className="psi-doc-table-wrap">
            <table className="psi-doc-table">
              <thead>
                <tr>
                  <th>Fecha (Lima)</th>
                  <th>Alumno</th>
                  <th>Estado</th>
                  <th>Urgencia</th>
                  <th>Resumen</th>
                  <th style={{ width: 100 }} aria-label="Acciones">
                    {' '}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{formatLimaSoloFecha(r.created_at)}</td>
                    <td>{r.alumno_nombre || `#${r.alumno_id}`}</td>
                    <td>{r.estado}</td>
                    <td>{r.urgencia}</td>
                    <td style={{ maxWidth: 280 }}>
                      {(r.descripcion_caso || '').slice(0, 100)}
                      {(r.descripcion_caso || '').length > 100 ? '…' : ''}
                    </td>
                    <td>
                      <div className="psi-doc-actions">
                        <button
                          type="button"
                          className="psi-doc-icon-btn"
                          title="Editar"
                          disabled={String(r.estado) !== 'RECIBIDA'}
                          onClick={() => irEditar(r)}
                        >
                          <EditIcon fontSize="small" />
                        </button>
                        <button
                          type="button"
                          className="psi-doc-icon-btn danger"
                          title="Eliminar"
                          disabled={String(r.estado) !== 'RECIBIDA'}
                          onClick={() => eliminar(r)}
                        >
                          <DeleteOutlineIcon fontSize="small" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '1.5rem' }} className="psi-doc-muted">
                      Aún no tiene derivaciones registradas.
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
