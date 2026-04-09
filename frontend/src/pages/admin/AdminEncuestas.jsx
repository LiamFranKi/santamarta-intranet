import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CircularProgress } from '@mui/material';
import DashboardLayout from '../../components/DashboardLayout';
import api from '../../services/api';
import Swal from 'sweetalert2';
import './AdminUsuarios.css';
import './AdminEncuestas.css';

export default function AdminEncuestas() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [encuestas, setEncuestas] = useState([]);

  const loadEncuestas = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/encuestas/admin/lista');
      setEncuestas(data.encuestas || []);
    } catch (e) {
      Swal.fire('Error', e.response?.data?.error || 'No se pudo cargar la lista', 'error');
      setEncuestas([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEncuestas();
  }, [loadEncuestas]);

  const fmt = (d) => (d ? String(d).slice(0, 10) : '—');

  const eliminarEncuesta = async (e) => {
    const r = await Swal.fire({
      title: '¿Desactivar encuesta?',
      text: 'Dejará de mostrarse a los usuarios (quedará como inactiva en el listado).',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, desactivar',
      cancelButtonText: 'Cancelar'
    });
    if (!r.isConfirmed) return;
    try {
      await api.delete(`/encuestas/admin/${e.id}`);
      await Swal.fire('Listo', 'Encuesta desactivada.', 'success');
      loadEncuestas();
    } catch (err) {
      Swal.fire('Error', err.response?.data?.error || 'No se pudo desactivar', 'error');
    }
  };

  return (
    <DashboardLayout>
      <div className="admin-encuestas-wrap">
        <div className="admin-encuestas-hero">
          <h1>Encuestas</h1>
          <p>
            Crea encuestas con varias audiencias, tipos de pregunta (marcar, lista, texto, escala) y revisa estadísticas
            por rol. Las respuestas se registran con el usuario de la intranet — sin pedir nombre ni grado en el
            formulario.
          </p>
        </div>

        <div className="admin-usu-toolbar" style={{ justifyContent: 'flex-end' }}>
          <button
            type="button"
            className="admin-usu-btn admin-usu-btn-new"
            onClick={() => navigate('/admin/herramientas/encuestas/nueva')}
          >
            + Nueva encuesta
          </button>
        </div>

        <div className="admin-usu-table-card">
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '2.5rem' }}>
              <CircularProgress />
            </div>
          ) : encuestas.length === 0 ? (
            <div style={{ padding: '2.5rem', textAlign: 'center', color: '#6b7280' }}>
              No hay encuestas aún. Pulsa «Nueva encuesta» para comenzar.
            </div>
          ) : (
            <div className="admin-usu-table-scroll">
              <table className="admin-usu-table">
                <thead>
                  <tr>
                    <th>Título</th>
                    <th>Estado</th>
                    <th>Vigencia</th>
                    <th>Audiencias</th>
                    <th>Respuestas</th>
                    <th style={{ minWidth: 220 }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {encuestas.map((e) => (
                    <tr key={e.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{e.titulo}</div>
                        {e.categoria_metrica ? (
                          <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: 2 }}>{e.categoria_metrica}</div>
                        ) : null}
                      </td>
                      <td>
                        {e.estado === 'ACTIVO' ? (
                          <span className="admin-usu-badge admin-usu-badge-ok">Activa</span>
                        ) : (
                          <span className="admin-usu-badge admin-usu-badge-off">{e.estado || 'Inactiva'}</span>
                        )}
                      </td>
                      <td>
                        {fmt(e.fecha_inicio)} → {fmt(e.fecha_fin)}
                      </td>
                      <td>
                        <div className="admin-enc-audiencias-chips">
                          {(e.audiencias || []).map((a) => (
                            <span key={a} className="admin-usu-badge admin-usu-badge-muted">
                              {a}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td>{e.total_respuestas ?? 0}</td>
                      <td>
                        <div className="admin-enc-tabla-acciones">
                          <button
                            type="button"
                            className="admin-usu-btn admin-usu-btn-primary"
                            onClick={() => navigate(`/admin/herramientas/encuestas/${e.id}/estadisticas`)}
                          >
                            Estadísticas
                          </button>
                          <button
                            type="button"
                            className="admin-usu-btn admin-usu-btn-secondary"
                            onClick={() => navigate(`/admin/herramientas/encuestas/${e.id}/editar`)}
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            className="admin-usu-btn admin-usu-btn-danger"
                            onClick={() => eliminarEncuesta(e)}
                          >
                            Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
