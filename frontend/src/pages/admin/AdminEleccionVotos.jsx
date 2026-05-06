import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CircularProgress } from '@mui/material';
import DashboardLayout from '../../components/DashboardLayout';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import Swal from 'sweetalert2';
import './AdminUsuarios.css';
import './AdminElecciones.css';

const TIPOS = [
  { value: '', label: 'Todos los perfiles' },
  { value: 'ALUMNO', label: 'Alumno' },
  { value: 'APODERADO', label: 'Apoderado' },
  { value: 'DOCENTE', label: 'Docente' }
];

const filtrosVacios = () => ({
  dni: '',
  nombre: '',
  lista_id: '',
  grupo_id: '',
  tipo_usuario: '',
  desde: '',
  hasta: ''
});

export default function AdminEleccionVotos() {
  const { procesoId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const anio = user?.anio_activo;
  const idNum = parseInt(procesoId, 10);

  const [loading, setLoading] = useState(true);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [procesoTitulo, setProcesoTitulo] = useState('');
  const [listas, setListas] = useState([]);
  const [grupos, setGrupos] = useState([]);
  const [votos, setVotos] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 40, total: 0, total_pages: 0 });

  const [filtrosBorrador, setFiltrosBorrador] = useState(filtrosVacios);
  const [filtrosApi, setFiltrosApi] = useState(filtrosVacios);

  const cargarMeta = useCallback(async () => {
    if (!idNum || Number.isNaN(idNum)) return;
    setLoadingMeta(true);
    try {
      const [p, ls] = await Promise.all([
        api.get(`/elecciones/admin/procesos/${idNum}`),
        api.get(`/elecciones/admin/procesos/${idNum}/listas`)
      ]);
      setProcesoTitulo(p.data?.proceso?.titulo || `Proceso #${idNum}`);
      setListas(ls.data?.listas || []);
    } catch (e) {
      Swal.fire('Error', e.response?.data?.error || 'No se pudo cargar el proceso', 'error');
      navigate('/admin/herramientas/elecciones');
    } finally {
      setLoadingMeta(false);
    }
  }, [idNum, navigate]);

  const cargarGrupos = useCallback(async () => {
    if (!anio) return;
    try {
      const { data } = await api.get('/elecciones/admin/meta-grupos', { params: { anio } });
      setGrupos(data?.grupos || []);
    } catch {
      setGrupos([]);
    }
  }, [anio]);

  const fetchVotos = useCallback(
    async (page, limit, f) => {
      if (!idNum || Number.isNaN(idNum)) return;
      setLoading(true);
      try {
        const { data } = await api.get(`/elecciones/admin/procesos/${idNum}/votos`, {
          params: {
            page,
            limit,
            dni: f.dni.trim() || undefined,
            nombre: f.nombre.trim() || undefined,
            lista_id: f.lista_id ? Number(f.lista_id) : undefined,
            grupo_id: f.grupo_id ? Number(f.grupo_id) : undefined,
            tipo_usuario: f.tipo_usuario || undefined,
            desde: f.desde || undefined,
            hasta: f.hasta || undefined
          }
        });
        if (data?.proceso?.titulo) setProcesoTitulo(data.proceso.titulo);
        setVotos(data.votos || []);
        setPagination((prev) => ({
          ...prev,
          page: data.pagination?.page ?? page,
          limit,
          total: data.pagination?.total ?? 0,
          total_pages: data.pagination?.total_pages ?? 0
        }));
      } catch (e) {
        Swal.fire('Error', e.response?.data?.error || 'No se pudieron cargar los votos', 'error');
        setVotos([]);
      } finally {
        setLoading(false);
      }
    },
    [idNum]
  );

  useEffect(() => {
    cargarMeta();
  }, [cargarMeta]);

  useEffect(() => {
    cargarGrupos();
  }, [cargarGrupos]);

  useEffect(() => {
    if (loadingMeta) return;
    fetchVotos(pagination.page, pagination.limit, filtrosApi);
  }, [loadingMeta, pagination.page, pagination.limit, filtrosApi, fetchVotos]);

  const aplicarFiltros = () => {
    setFiltrosApi({ ...filtrosBorrador });
    setPagination((p) => ({ ...p, page: 1 }));
  };

  const eliminarVoto = async (v) => {
    const r = await Swal.fire({
      title: '¿Eliminar este voto?',
      text: `Se borrará el voto registrado (${String(v.votante_dni)}). La persona podrá votar de nuevo solo en este proceso.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    });
    if (!r.isConfirmed) return;
    try {
      await api.delete(`/elecciones/admin/procesos/${idNum}/votos/${v.id}`);
      await Swal.fire('Listo', 'Voto eliminado. El usuario puede emitir otro voto.', 'success');
      fetchVotos(pagination.page, pagination.limit, filtrosApi);
    } catch (e) {
      Swal.fire('Error', e.response?.data?.error || 'No se pudo eliminar', 'error');
    }
  };

  if (!idNum || Number.isNaN(idNum)) {
    return (
      <DashboardLayout>
        <p className="admin-elcc-muted">ID inválido.</p>
      </DashboardLayout>
    );
  }

  const hayPaginas = pagination.total_pages > 1;

  return (
    <DashboardLayout>
      <div className="admin-elcc-detalle-layout">
        <div className="admin-elcc-proceso-toolbar" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
          <button type="button" className="admin-elcc-btn admin-elcc-btn-ghost" onClick={() => navigate(`/admin/herramientas/elecciones/${idNum}`)}>
            ← Volver al proceso
          </button>
          <button type="button" className="admin-elcc-btn admin-elcc-btn-ghost" onClick={() => navigate('/admin/herramientas/elecciones')}>
            Listado de elecciones
          </button>
        </div>

        <section className="admin-elcc-panel admin-elcc-card-surface admin-elcc-surf-mint" style={{ marginTop: '0.75rem' }}>
          <h2 style={{ marginTop: 0 }}>Votos emitidos</h2>
          <p className="admin-elcc-muted admin-elcc-lead">
            <strong>{procesoTitulo || '…'}</strong> — Consulta y, si hace falta, elimina un voto para que la misma persona pueda votar otra vez en este proceso (la restricción es un voto por usuario y proceso).
          </p>

          <div className="admin-elcc-grid-proceso-3x2" style={{ marginTop: '0.75rem' }}>
            <label className="admin-elcc-label">
              DNI / documento / usuario
              <input
                className="admin-elcc-input"
                value={filtrosBorrador.dni}
                onChange={(e) => setFiltrosBorrador((f) => ({ ...f, dni: e.target.value }))}
                placeholder="Ej. 12345678"
              />
            </label>
            <label className="admin-elcc-label">
              Nombre o apellido
              <input
                className="admin-elcc-input"
                value={filtrosBorrador.nombre}
                onChange={(e) => setFiltrosBorrador((f) => ({ ...f, nombre: e.target.value }))}
                placeholder="Parte del nombre"
              />
            </label>
            <label className="admin-elcc-label">
              Lista elegida
              <select
                className="admin-elcc-select"
                value={filtrosBorrador.lista_id}
                onChange={(e) => setFiltrosBorrador((f) => ({ ...f, lista_id: e.target.value }))}
              >
                <option value="">Todas</option>
                {listas.map((L) => (
                  <option key={L.id} value={L.id}>
                    {L.nombre_lista}
                  </option>
                ))}
              </select>
            </label>
            <label className="admin-elcc-label">
              Aula (snapshot)
              <select
                className="admin-elcc-select"
                value={filtrosBorrador.grupo_id}
                onChange={(e) => setFiltrosBorrador((f) => ({ ...f, grupo_id: e.target.value }))}
              >
                <option value="">Todas</option>
                {grupos.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.grado ?? '—'}° {g.seccion ?? ''}
                    {g.nivel_nombre ? ` · ${g.nivel_nombre}` : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="admin-elcc-label">
              Tipo de usuario
              <select
                className="admin-elcc-select"
                value={filtrosBorrador.tipo_usuario}
                onChange={(e) => setFiltrosBorrador((f) => ({ ...f, tipo_usuario: e.target.value }))}
              >
                {TIPOS.map((t) => (
                  <option key={t.value || 'all'} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="admin-elcc-label">
              Rango de fechas (opcional)
              <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                <input
                  type="date"
                  className="admin-elcc-input"
                  value={filtrosBorrador.desde}
                  onChange={(e) => setFiltrosBorrador((f) => ({ ...f, desde: e.target.value }))}
                />
                <input
                  type="date"
                  className="admin-elcc-input"
                  value={filtrosBorrador.hasta}
                  onChange={(e) => setFiltrosBorrador((f) => ({ ...f, hasta: e.target.value }))}
                />
              </div>
            </label>
          </div>
          <div className="admin-elcc-save-bar" style={{ marginTop: '0.75rem' }}>
            <button type="button" className="admin-elcc-btn admin-elcc-btn-primary" onClick={aplicarFiltros} disabled={loadingMeta}>
              Aplicar filtros
            </button>
          </div>
        </section>

        <section className="admin-elcc-panel admin-elcc-card-surface" style={{ marginTop: '0.85rem', overflowX: 'auto' }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
              <CircularProgress size={28} />
            </div>
          ) : votos.length === 0 ? (
            <p className="admin-elcc-muted">No hay votos que coincidan con los filtros.</p>
          ) : (
            <table className="admin-elcc-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Votante</th>
                  <th>DNI / login</th>
                  <th>Tipo</th>
                  <th>Lista</th>
                  <th>Aula</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {votos.map((v) => (
                  <tr key={v.id}>
                    <td style={{ whiteSpace: 'nowrap', fontSize: '0.88rem' }}>{v.created_at ? String(v.created_at).replace('T', ' ').slice(0, 19) : '—'}</td>
                    <td>{v.votante_nombre || '—'}</td>
                    <td>{v.votante_dni || '—'}</td>
                    <td>{v.votante_tipo || v.usuario_tipo || '—'}</td>
                    <td>{v.nombre_lista || `#${v.lista_id}`}</td>
                    <td>{v.aula_etiqueta || (v.grado_snap != null ? `${v.grado_snap}°` : '—')}</td>
                    <td>
                      <button type="button" className="admin-elcc-btn admin-elcc-btn-xs" style={{ color: '#b91c1c' }} onClick={() => eliminarVoto(v)}>
                        Quitar voto
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!loading && pagination.total > 0 && (
            <p className="admin-elcc-muted" style={{ marginTop: '0.65rem', fontSize: '0.88rem' }}>
              Mostrando página {pagination.page} de {Math.max(1, pagination.total_pages)} — {pagination.total} voto{pagination.total === 1 ? '' : 's'} en total.
            </p>
          )}
          {hayPaginas && !loading && (
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="admin-elcc-btn admin-elcc-btn-ghost"
                disabled={pagination.page <= 1}
                onClick={() => setPagination((p) => ({ ...p, page: Math.max(1, p.page - 1) }))}
              >
                Anterior
              </button>
              <button
                type="button"
                className="admin-elcc-btn admin-elcc-btn-ghost"
                disabled={pagination.page >= pagination.total_pages}
                onClick={() => setPagination((p) => ({ ...p, page: Math.min(p.total_pages, p.page + 1) }))}
              >
                Siguiente
              </button>
            </div>
          )}
        </section>
      </div>
    </DashboardLayout>
  );
}
