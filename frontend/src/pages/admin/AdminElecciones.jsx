import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CircularProgress } from '@mui/material';
import DashboardLayout from '../../components/DashboardLayout';
import api from '../../services/api';
import Swal from 'sweetalert2';
import './AdminUsuarios.css';
import './AdminElecciones.css';

const BADGE_CLASS = {
  BORRADOR: 'admin-elcc-badge admin-elcc-badge-borrador',
  CAMPAÑA: 'admin-elcc-badge admin-elcc-badge-campana',
  VOTACION: 'admin-elcc-badge admin-elcc-badge-votacion',
  CERRADA: 'admin-elcc-badge admin-elcc-badge-cerrada'
};

export default function AdminElecciones() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [procesos, setProcesos] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/elecciones/admin/procesos');
      setProcesos(data.procesos || []);
    } catch (e) {
      Swal.fire('Error', e.response?.data?.error || 'No se pudieron cargar los procesos', 'error');
      setProcesos([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const crearProceso = async () => {
    const r = await Swal.fire({
      title: 'Nuevo proceso electoral',
      input: 'text',
      inputLabel: 'Título',
      inputPlaceholder: 'Ej. Alcaldía escolar 2026',
      showCancelButton: true,
      confirmButtonText: 'Crear',
      cancelButtonText: 'Cancelar',
      inputValidator: (v) => (!v?.trim() ? 'Ingresa un título' : null)
    });
    if (!r.isConfirmed || !r.value?.trim()) return;
    try {
      const { data } = await api.post('/elecciones/admin/procesos', {
        titulo: r.value.trim(),
        estado: 'BORRADOR'
      });
      await Swal.fire('Listo', 'Proceso creado. Configura cargos y listas.', 'success');
      navigate(`/admin/herramientas/elecciones/${data.id}`);
    } catch (e) {
      Swal.fire('Error', e.response?.data?.error || 'No se pudo crear', 'error');
    }
  };

  const eliminar = async (p) => {
    const ok = await Swal.fire({
      title: '¿Eliminar proceso?',
      text: `Se borrarán listas, votos y datos de «${p.titulo}».`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    });
    if (!ok.isConfirmed) return;
    try {
      await api.delete(`/elecciones/admin/procesos/${p.id}`);
      await Swal.fire('Eliminado', '', 'success');
      load();
    } catch (e) {
      Swal.fire('Error', e.response?.data?.error || 'No se pudo eliminar', 'error');
    }
  };

  return (
    <DashboardLayout>
      <div className="admin-elcc-wrap">
        <div className="admin-elcc-hero">
          <h1>Elecciones escolares</h1>
          <p>
            Configura alcaldías o procesos similares: cargos de plancha, listas con logo del «partido»,
            foto del candidato a alcalde, propuestas y enlaces. Los alumnos convocados conocen las
            propuestas en campaña y en la urna solo eligen por el rostro del alcalde y el logo.
          </p>
        </div>
        <div className="admin-usu-toolbar" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="admin-usu-btn admin-usu-btn-new" onClick={crearProceso}>
            + Nuevo proceso
          </button>
        </div>

        <div className="admin-elcc-table-card">
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '2.5rem' }}>
              <CircularProgress />
            </div>
          ) : procesos.length === 0 ? (
            <div style={{ padding: '2.5rem', textAlign: 'center', color: '#64748b' }}>
              No hay procesos. Crea uno para empezar.
            </div>
          ) : (
            <table className="admin-elcc-table">
              <thead>
                <tr>
                  <th>Título</th>
                  <th>Estado</th>
                  <th>Modalidad</th>
                  <th style={{ width: 220 }} />
                </tr>
              </thead>
              <tbody>
                {procesos.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.titulo}</strong>
                    </td>
                    <td>
                      <span className={BADGE_CLASS[p.estado] || BADGE_CLASS.BORRADOR}>{p.estado}</span>
                    </td>
                    <td>{p.modalidad}</td>
                    <td>
                      <button
                        type="button"
                        className="admin-usu-btn admin-usu-btn-secondary"
                        style={{ marginRight: 8 }}
                        onClick={() => navigate(`/admin/herramientas/elecciones/${p.id}`)}
                      >
                        Editar
                      </button>
                      <button type="button" className="admin-usu-btn admin-usu-btn-danger-outline" onClick={() => eliminar(p)}>
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
