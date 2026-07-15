import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
  RESULTADOS: 'admin-elcc-badge admin-elcc-badge-resultados',
  CERRADA: 'admin-elcc-badge admin-elcc-badge-cerrada',
  ARCHIVO: 'admin-elcc-badge admin-elcc-badge-archivo'
};

export default function AdminElecciones() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [procesos, setProcesos] = useState([]);
  const [filtroTab, setFiltroTab] = useState('todos');

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

  const conteos = useMemo(() => {
    const archivo = procesos.filter((p) => p.estado === 'ARCHIVO').length;
    return {
      total: procesos.length,
      activos: procesos.length - archivo,
      archivo
    };
  }, [procesos]);

  const procesosVisibles = useMemo(() => {
    if (filtroTab === 'archivo') return procesos.filter((p) => p.estado === 'ARCHIVO');
    if (filtroTab === 'activos') return procesos.filter((p) => p.estado !== 'ARCHIVO');
    return procesos;
  }, [procesos, filtroTab]);

  return (
    <DashboardLayout>
      <div className="admin-elcc-wrap">
        <header className="admin-elcc-hero admin-elcc-hero--banner">
          <div className="admin-elcc-hero-icon" aria-hidden="true">
            🗳
          </div>
          <div className="admin-elcc-hero-text">
            <h1>Elecciones escolares</h1>
            <p>
              Configura alcaldías o procesos similares: cargos de plancha, listas con logo del «partido»,
              foto del candidato a alcalde, propuestas y enlaces. Los alumnos convocados conocen las
              propuestas en campaña y en la urna solo eligen por el rostro del alcalde y el logo.
            </p>
            <div className="admin-elcc-hero-meta">
              <span className="admin-elcc-hero-chip">{conteos.total} proceso(s)</span>
              <span className="admin-elcc-hero-chip">{conteos.activos} en curso</span>
              {conteos.archivo > 0 && (
                <span className="admin-elcc-hero-chip">{conteos.archivo} archivo</span>
              )}
            </div>
          </div>
        </header>

        <div className="admin-elcc-help">
          <div className="admin-elcc-help-icon" aria-hidden="true">
            💡
          </div>
          <div>
            <h2>Procesos electorales</h2>
            <p>
              Filtrá por estado y entrá a <strong>Configurar</strong> para cargos, listas y resultados. Archivo
              guarda procesos cerrados sin eliminarlos.
            </p>
          </div>
        </div>

        <div className="admin-elcc-toolbar">
          <nav className="admin-elcc-tabs" role="tablist" aria-label="Filtro de procesos">
            <button
              type="button"
              role="tab"
              aria-selected={filtroTab === 'todos'}
              className={`admin-elcc-tab${filtroTab === 'todos' ? ' is-active' : ''}`}
              onClick={() => setFiltroTab('todos')}
            >
              Todos ({conteos.total})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={filtroTab === 'activos'}
              className={`admin-elcc-tab admin-elcc-tab--sky${filtroTab === 'activos' ? ' is-active' : ''}`}
              onClick={() => setFiltroTab('activos')}
            >
              En curso ({conteos.activos})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={filtroTab === 'archivo'}
              className={`admin-elcc-tab admin-elcc-tab--muted${filtroTab === 'archivo' ? ' is-active' : ''}`}
              onClick={() => setFiltroTab('archivo')}
            >
              Archivo ({conteos.archivo})
            </button>
          </nav>
          <button type="button" className="admin-elcc-btn-nuevo" onClick={crearProceso}>
            + Nuevo proceso
          </button>
        </div>

        <div className="admin-elcc-grid-wrap">
          {loading ? (
            <div className="admin-elcc-grid-loading">
              <CircularProgress />
            </div>
          ) : procesosVisibles.length === 0 ? (
            <div className="admin-elcc-empty">
              {procesos.length === 0
                ? 'No hay procesos. Crea uno para empezar.'
                : 'No hay procesos en este filtro.'}
            </div>
          ) : (
            <div className="admin-elcc-proceso-grid">
              {procesosVisibles.map((p) => (
                <article key={p.id} className="admin-elcc-proceso-card">
                  <div className="admin-elcc-proceso-card-top">
                    <h2 className="admin-elcc-proceso-title">{p.titulo}</h2>
                    <span className={BADGE_CLASS[p.estado] || BADGE_CLASS.BORRADOR}>{p.estado}</span>
                  </div>
                  <p className="admin-elcc-proceso-meta">{p.modalidad || '—'}</p>
                  <div className="admin-elcc-proceso-card-actions">
                    <button
                      type="button"
                      className="admin-elcc-btn admin-elcc-btn-primary admin-elcc-btn-sm"
                      onClick={() => navigate(`/admin/herramientas/elecciones/${p.id}`)}
                    >
                      Configurar
                    </button>
                    <details className="admin-elcc-opt-menu">
                      <summary className="admin-elcc-opt-trigger">
                        <span className="admin-elcc-opt-chev">▾</span> Más opciones
                      </summary>
                      <div className="admin-elcc-opt-dropdown" role="menu">
                        <button
                          type="button"
                          className="admin-elcc-opt-item"
                          onClick={() => navigate(`/admin/herramientas/elecciones/${p.id}?panel=resultados`)}
                        >
                          <span className="admin-elcc-opt-ico" aria-hidden>
                            📊
                          </span>
                          <span className="admin-elcc-opt-txt">
                            <span className="admin-elcc-opt-line1">Resultados</span>
                            <span className="admin-elcc-opt-line2">Conteo por lista</span>
                          </span>
                        </button>
                        <button
                          type="button"
                          className="admin-elcc-opt-item"
                          onClick={() => navigate(`/admin/herramientas/elecciones/${p.id}/votos`)}
                        >
                          <span className="admin-elcc-opt-ico" aria-hidden>
                            🗂️
                          </span>
                          <span className="admin-elcc-opt-txt">
                            <span className="admin-elcc-opt-line1">Ver votos</span>
                            <span className="admin-elcc-opt-line2">Filtros y anular voto puntual</span>
                          </span>
                        </button>
                        <button
                          type="button"
                          className="admin-elcc-opt-item"
                          onClick={() => navigate(`/admin/herramientas/elecciones/${p.id}?panel=cargos`)}
                        >
                          <span className="admin-elcc-opt-ico" aria-hidden>
                            📋
                          </span>
                          <span className="admin-elcc-opt-txt">
                            <span className="admin-elcc-opt-line1">Cargos de plancha</span>
                            <span className="admin-elcc-opt-line2">Tesorero, vocal…</span>
                          </span>
                        </button>
                        <button
                          type="button"
                          className="admin-elcc-opt-item"
                          onClick={() => navigate(`/admin/herramientas/elecciones/${p.id}?panel=listas`)}
                        >
                          <span className="admin-elcc-opt-ico" aria-hidden>
                            🗳️
                          </span>
                          <span className="admin-elcc-opt-txt">
                            <span className="admin-elcc-opt-line1">Listas y candidatos</span>
                            <span className="admin-elcc-opt-line2">Logos, plancha, propuestas</span>
                          </span>
                        </button>
                        <hr className="admin-elcc-opt-sep" />
                        <button type="button" className="admin-elcc-opt-item admin-elcc-opt-danger" onClick={() => eliminar(p)}>
                          <span className="admin-elcc-opt-ico" aria-hidden>
                            🗑️
                          </span>
                          <span className="admin-elcc-opt-txt">
                            <span className="admin-elcc-opt-line1">Eliminar proceso</span>
                            <span className="admin-elcc-opt-line2">Irreversible</span>
                          </span>
                        </button>
                      </div>
                    </details>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
