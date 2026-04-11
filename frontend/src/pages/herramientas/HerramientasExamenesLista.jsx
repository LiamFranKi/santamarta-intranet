import React, { useCallback, useEffect, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import {
  CircularProgress,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem
} from '@mui/material';
import BarChartIcon from '@mui/icons-material/BarChart';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditIcon from '@mui/icons-material/Edit';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import VisibilityIcon from '@mui/icons-material/Visibility';
import DashboardLayout from '../../components/DashboardLayout';
import api from '../../services/api';
import Swal from 'sweetalert2';
import '../../pages/admin/AdminUsuarios.css';
import '../../pages/admin/AdminEncuestas.css';
import './HerramientasExamenes.css';
import HerramientasExamenesDisponiblesPanel from './HerramientasExamenesDisponiblesPanel';

const MODO_LABEL = {
  PRACTICA: 'Práctica',
  CALIFICADO: 'Calificatorio',
  MIXTO: 'Mixto'
};

export default function HerramientasExamenesLista({ variant = 'admin' }) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const esAdmin = variant === 'admin';
  const adminTab = searchParams.get('tab') === 'responder' ? 'responder' : 'gestionar';

  const setAdminTab = (t) => {
    if (t === 'gestionar') {
      setSearchParams({}, { replace: true });
    } else {
      setSearchParams({ tab: 'responder' }, { replace: true });
    }
  };
  const base = '/admin/herramientas/examenes';
  const apiLista = '/herramientas-examenes/admin/lista';
  const apiDel = (id) => `/herramientas-examenes/admin/${id}`;

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [menuCtx, setMenuCtx] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(apiLista);
      setItems(data.examenes || []);
    } catch (e) {
      Swal.fire('Error', e.response?.data?.error || 'No se pudo cargar la lista', 'error');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [apiLista]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setMenuCtx(null);
  }, [adminTab]);

  if (!esAdmin) {
    return <Navigate to="/herramientas-examenes" replace />;
  }

  const fmt = (d) => (d ? String(d).slice(0, 10) : '—');

  const eliminar = async (row) => {
    const r = await Swal.fire({
      title: '¿Eliminar este examen?',
      html: 'Se borrarán las preguntas, audiencias, alcance por grupos y <strong>todas las respuestas</strong>.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
      focusCancel: true
    });
    if (!r.isConfirmed) return;
    try {
      await api.delete(apiDel(row.id));
      await Swal.fire('Listo', 'Examen eliminado.', 'success');
      load();
    } catch (err) {
      Swal.fire('Error', err.response?.data?.error || 'No se pudo eliminar', 'error');
    }
  };

  return (
    <DashboardLayout>
      <div className="hex-exam-wrap">
        <div className="hex-exam-hero">
          <h1>Exámenes de herramientas</h1>
          <p>
            Crea evaluaciones con <strong>audiencias</strong> (alumnos, docentes, apoderados, todos…),{' '}
            <strong>alcance por aulas</strong> (vacío = toda la institución), modo{' '}
            <strong>práctica, calificatorio o mixto</strong>, preguntas con puntaje y revisión manual en texto
            corto.
          </p>
        </div>

        <div className="hex-exam-admin-tabs" role="tablist" aria-label="Vista de exámenes">
          <button
            type="button"
            role="tab"
            aria-selected={adminTab === 'gestionar'}
            className={`hex-exam-admin-tab ${adminTab === 'gestionar' ? 'active' : ''}`}
            onClick={() => setAdminTab('gestionar')}
          >
            Gestionar exámenes
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={adminTab === 'responder'}
            className={`hex-exam-admin-tab ${adminTab === 'responder' ? 'active' : ''}`}
            onClick={() => setAdminTab('responder')}
          >
            Exámenes para responder
          </button>
        </div>

        {adminTab === 'gestionar' && (
          <>
            <div
              className="admin-usu-toolbar"
              style={{
                justifyContent: 'flex-end',
                flexWrap: 'wrap',
                gap: 12
              }}
            >
              <button
                type="button"
                className="admin-usu-btn admin-usu-btn-new"
                onClick={() => navigate(`${base}/nueva`)}
              >
                + Nuevo examen
              </button>
            </div>

            <div className="admin-usu-table-card" style={{ marginTop: 16 }}>
              {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '2.5rem' }}>
                  <CircularProgress />
                </div>
              ) : items.length === 0 ? (
                <div style={{ padding: '2.5rem', textAlign: 'center', color: '#6b7280' }}>
                  No hay exámenes aún. Pulsa «Nuevo examen» para comenzar.
                </div>
              ) : (
                <div className="admin-usu-table-scroll">
                  <table className="admin-usu-table">
                    <thead>
                      <tr>
                        <th>Título</th>
                        <th>Estado</th>
                        <th>Modo</th>
                        <th>Vigencia</th>
                        <th>Audiencias</th>
                        <th>Intentos</th>
                        <th style={{ minWidth: 140 }}>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((e) => (
                        <tr key={e.id}>
                          <td>
                            <div style={{ fontWeight: 600 }}>{e.titulo}</div>
                            {e.grupos_count > 0 ? (
                              <div className="hex-exam-mini-hint">{e.grupos_count} aula(s) seleccionada(s)</div>
                            ) : (
                              <div className="hex-exam-mini-hint">Toda la institución</div>
                            )}
                          </td>
                          <td>
                            {e.estado === 'ACTIVO' ? (
                              <span className="admin-usu-badge admin-usu-badge-ok">Activo</span>
                            ) : (
                              <span className="admin-usu-badge admin-usu-badge-off">{e.estado || '—'}</span>
                            )}
                          </td>
                          <td>
                            <span className="admin-usu-badge admin-usu-badge-muted">{MODO_LABEL[e.modo] || e.modo}</span>
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
                          <td>{e.total_intentos ?? 0}</td>
                          <td>
                            <div className="admin-enc-tabla-acciones" style={{ justifyContent: 'center' }}>
                              <button
                                type="button"
                                className="admin-usu-btn admin-usu-btn-primary admin-enc-opciones-btn"
                                onClick={(ev) => setMenuCtx({ anchor: ev.currentTarget, row: e })}
                              >
                                <MoreHorizIcon style={{ fontSize: 18, marginRight: 4, verticalAlign: 'text-bottom' }} />
                                Opciones
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
          </>
        )}

        {adminTab === 'responder' ? (
          <div className="hex-exam-panel-embedded-wrap" style={{ marginTop: 16 }}>
            <HerramientasExamenesDisponiblesPanel compact />
          </div>
        ) : null}

        <Menu
          anchorEl={menuCtx?.anchor}
          open={Boolean(menuCtx)}
          onClose={() => setMenuCtx(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        >
          <MenuItem
            onClick={() => {
              const row = menuCtx.row;
              setMenuCtx(null);
              navigate(`/herramientas-examenes/realizar/${row.id}?preview=1&from=admin`);
            }}
          >
            <ListItemIcon>
              <VisibilityIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Vista previa (nueva pestaña)</ListItemText>
          </MenuItem>
          <MenuItem
            onClick={() => {
              const row = menuCtx.row;
              setMenuCtx(null);
              navigate(`${base}/${row.id}/estadisticas`);
            }}
          >
            <ListItemIcon>
              <BarChartIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Estadísticas y revisiones</ListItemText>
          </MenuItem>
          <MenuItem
            onClick={() => {
              const row = menuCtx.row;
              setMenuCtx(null);
              navigate(`${base}/${row.id}/editar`);
            }}
          >
            <ListItemIcon>
              <EditIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Editar</ListItemText>
          </MenuItem>
          <MenuItem
            onClick={() => {
              const row = menuCtx.row;
              setMenuCtx(null);
              eliminar(row);
            }}
            sx={{ color: 'error.main' }}
          >
            <ListItemIcon>
              <DeleteOutlineIcon fontSize="small" color="error" />
            </ListItemIcon>
            <ListItemText>Eliminar</ListItemText>
          </MenuItem>
        </Menu>
      </div>
    </DashboardLayout>
  );
}
