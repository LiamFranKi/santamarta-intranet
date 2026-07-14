import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
import HistoryIcon from '@mui/icons-material/History';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import VisibilityIcon from '@mui/icons-material/Visibility';
import DashboardLayout from '../../components/DashboardLayout';
import api from '../../services/api';
import Swal from 'sweetalert2';
import './AdminUsuarios.css';
import './AdminEncuestas.css';

export default function AdminEncuestas() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [encuestas, setEncuestas] = useState([]);
  const [menuCtx, setMenuCtx] = useState(null);

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

  const closeMenu = () => setMenuCtx(null);

  const eliminarEncuesta = async (e) => {
    closeMenu();
    const r = await Swal.fire({
      title: '¿Eliminar esta encuesta?',
      html: 'Se borrarán <strong>definitivamente</strong> la encuesta, preguntas, audiencias y todas las respuestas registradas. Esta acción no se puede deshacer.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
      focusCancel: true
    });
    if (!r.isConfirmed) return;
    try {
      await api.delete(`/encuestas/admin/${e.id}`);
      await Swal.fire('Listo', 'Encuesta eliminada.', 'success');
      loadEncuestas();
    } catch (err) {
      Swal.fire('Error', err.response?.data?.error || 'No se pudo eliminar', 'error');
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
                    <th style={{ minWidth: 140 }}>Acciones</th>
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
                        <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 4 }}>
                          {String(e.alcance_grupos || '').toUpperCase() === 'GRUPOS' || (e.grupos || []).length
                            ? `Grupos: ${(e.grupos || []).length}`
                            : 'Cobertura: todos'}
                        </div>
                      </td>
                      <td>{e.total_respuestas ?? 0}</td>
                      <td>
                        <div className="admin-enc-tabla-acciones" style={{ justifyContent: 'center' }}>
                          <button
                            type="button"
                            className="admin-usu-btn admin-usu-btn-primary admin-enc-opciones-btn"
                            onClick={(ev) => setMenuCtx({ anchor: ev.currentTarget, enc: e })}
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

        <Menu
          anchorEl={menuCtx?.anchor}
          open={Boolean(menuCtx)}
          onClose={closeMenu}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        >
          <MenuItem
            onClick={() => {
              const enc = menuCtx.enc;
              closeMenu();
              navigate(`/encuestas/responder/${enc.id}?preview=1`);
            }}
          >
            <ListItemIcon>
              <VisibilityIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Ver encuesta</ListItemText>
          </MenuItem>
          <MenuItem
            onClick={() => {
              const enc = menuCtx.enc;
              closeMenu();
              navigate(`/admin/herramientas/encuestas/${enc.id}/editar`);
            }}
          >
            <ListItemIcon>
              <EditIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Editar</ListItemText>
          </MenuItem>
          <MenuItem
            onClick={() => {
              const enc = menuCtx.enc;
              closeMenu();
              navigate(`/admin/herramientas/encuestas/${enc.id}/estadisticas`);
            }}
          >
            <ListItemIcon>
              <BarChartIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Estadísticas</ListItemText>
          </MenuItem>
          <MenuItem
            onClick={() => {
              const enc = menuCtx.enc;
              closeMenu();
              navigate(`/admin/herramientas/encuestas/${enc.id}/historial`);
            }}
          >
            <ListItemIcon>
              <HistoryIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Historial de respuestas</ListItemText>
          </MenuItem>
          <MenuItem
            onClick={() => {
              const enc = menuCtx.enc;
              eliminarEncuesta(enc);
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
