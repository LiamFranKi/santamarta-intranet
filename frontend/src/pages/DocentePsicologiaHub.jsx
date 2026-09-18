import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import DashboardLayout from '../components/DashboardLayout';
import api from '../services/api';
import Swal from 'sweetalert2';
import './DocentePsicologia.css';
import './admin/AdminPsicologia.css';
import '../components/psicologia/PiarStudio.css';
import { PIAR_ESTADO_LABEL } from '../utils/piarEtiquetas';

const LIMA_TZ = 'America/Lima';

const DER_ESTADO_LABEL = {
  RECIBIDA: 'Recibida',
  EN_EVALUACION: 'En evaluación',
  CERRADA: 'Cerrada',
  DERIVADA_EXTERNA: 'Derivada externa',
};

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

function chipClassDer(estado) {
  const e = String(estado || '').toUpperCase();
  if (e === 'RECIBIDA') return 'psi-doc-der-chip psi-doc-der-chip--recibida';
  if (e === 'EN_EVALUACION') return 'psi-doc-der-chip psi-doc-der-chip--eval';
  if (e === 'CERRADA') return 'psi-doc-der-chip psi-doc-der-chip--cerrada';
  return 'psi-doc-der-chip';
}

function normFiltro(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export default function DocentePsicologiaHub() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'derivaciones' ? 'derivaciones' : 'piar';

  const [piarRows, setPiarRows] = useState([]);
  const [derRows, setDerRows] = useState([]);
  const [loadingPiar, setLoadingPiar] = useState(true);
  const [loadingDer, setLoadingDer] = useState(true);
  const [errPiar, setErrPiar] = useState(null);
  const [errDer, setErrDer] = useState(null);
  const [q, setQ] = useState('');

  const setTab = (next) => {
    const nextParams = new URLSearchParams(params);
    nextParams.set('tab', next);
    setParams(nextParams, { replace: true });
  };

  const cargarPiar = useCallback(() => {
    setLoadingPiar(true);
    api
      .get('/docente/psicologia/mis-piar')
      .then(({ data }) => {
        setPiarRows(data.piar_lista || []);
        setErrPiar(null);
      })
      .catch((e) => setErrPiar(e.response?.data?.error || 'No se pudo cargar el PIAR'))
      .finally(() => setLoadingPiar(false));
  }, []);

  const cargarDer = useCallback(() => {
    setLoadingDer(true);
    api
      .get('/docente/psicologia/mis-derivaciones')
      .then(({ data }) => {
        setDerRows(data.derivaciones || []);
        setErrDer(null);
      })
      .catch((e) => setErrDer(e.response?.data?.error || 'No se pudieron cargar las derivaciones'))
      .finally(() => setLoadingDer(false));
  }, []);

  useEffect(() => {
    cargarPiar();
    cargarDer();
  }, [cargarPiar, cargarDer]);

  const piarFiltrado = useMemo(() => {
    const nq = normFiltro(q);
    if (!nq) return piarRows;
    return piarRows.filter((r) =>
      [r.alumno_nombre, r.grupo_aula_etiqueta, r.anio, PIAR_ESTADO_LABEL[r.estado] || r.estado]
        .map(normFiltro)
        .join(' ')
        .includes(nq)
    );
  }, [piarRows, q]);

  const derFiltrado = useMemo(() => {
    const nq = normFiltro(q);
    if (!nq) return derRows;
    return derRows.filter((r) =>
      [r.alumno_nombre, r.estado, DER_ESTADO_LABEL[r.estado] || r.estado, r.urgencia, r.descripcion_caso]
        .map(normFiltro)
        .join(' ')
        .includes(nq)
    );
  }, [derRows, q]);

  const irEditarDer = (r) => {
    const mid = r.matricula_id != null ? String(r.matricula_id) : '';
    const qs = new URLSearchParams();
    if (mid) qs.set('matricula_id', mid);
    qs.set('derivacion_id', String(r.id));
    navigate(`/docente/psicologia/derivar/${r.alumno_id}?${qs.toString()}`);
  };

  const eliminarDer = async (r) => {
    if (String(r.estado) !== 'RECIBIDA') {
      Swal.fire({ icon: 'info', title: 'Solo se pueden eliminar derivaciones en estado Recibida.' });
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
      cargarDer();
    } catch (e) {
      Swal.fire({ icon: 'error', title: e.response?.data?.error || 'No se pudo eliminar' });
    }
  };

  return (
    <DashboardLayout>
      <div className="psi-doc-page">
        <div className="psi-doc-hero psi-doc-hero--hub">
          <p className="psi-doc-hero__kicker">Aula inclusiva</p>
          <h1>Psicología</h1>
          <p>
            PIAR y derivaciones de los estudiantes de <strong>sus grupos o tutorías</strong>. El plan de apoyos y el
            aviso a psicología viven aquí, en la misma pantalla.
          </p>
        </div>

        <div className="psi-doc-hub-bar">
          <nav className="psi-tabs" role="tablist" aria-label="Psicología docente">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'piar'}
              className={`psi-tab psi-tab--violet${tab === 'piar' ? ' is-active' : ''}`}
              onClick={() => setTab('piar')}
            >
              PIAR ({loadingPiar ? '…' : piarRows.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'derivaciones'}
              className={`psi-tab psi-tab--amber${tab === 'derivaciones' ? ' is-active' : ''}`}
              onClick={() => setTab('derivaciones')}
            >
              Derivaciones ({loadingDer ? '…' : derRows.length})
            </button>
          </nav>
          <input
            className="psi-doc-hub-search"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={tab === 'piar' ? 'Buscar alumno, aula o estado…' : 'Buscar alumno, estado o resumen…'}
            aria-label="Buscar en esta pestaña"
          />
        </div>

        {tab === 'piar' && (
          <section className="psi-doc-hub-panel" role="tabpanel">
            <p className="psi-doc-hub-lead">
              Planes publicados o en borrador de sus aulas. Ábralo para ver apoyos, su parte en clase y la bitácora.
            </p>
            {errPiar && (
              <div className="psi-doc-alert" role="alert">
                {errPiar}
              </div>
            )}
            {loadingPiar ? (
              <Box display="flex" justifyContent="center" py={4}>
                <CircularProgress size={32} />
              </Box>
            ) : piarRows.length === 0 ? (
              <div className="psi-doc-empty">
                <strong>Aún no hay PIAR en sus aulas</strong>
                <p>Cuando psicología publique un plan de un niño de su grupo o tutoría, aparecerá aquí.</p>
              </div>
            ) : piarFiltrado.length === 0 ? (
              <div className="psi-doc-empty">
                <strong>Ningún PIAR coincide</strong>
                <p>Pruebe otro nombre, aula o estado.</p>
              </div>
            ) : (
              <div className="psi-doc-piar-list">
                {piarFiltrado.map((r, i) => (
                  <div key={r.id} className={`psi-doc-piar-item psi-doc-piar-item--${i % 4}`}>
                    <div className="psi-doc-piar-item__main">
                      <div className="psi-doc-piar-item__name">{r.alumno_nombre || `Alumno #${r.alumno_id}`}</div>
                      {r.grupo_aula_etiqueta ? (
                        <div className="psi-doc-piar-item__grupo">{String(r.grupo_aula_etiqueta).trim()}</div>
                      ) : null}
                      <div className="psi-doc-piar-item__chips">
                        <span className="psi-doc-piar-chip">Año {r.anio}</span>
                        <span className="psi-doc-piar-chip">v{r.numero_version}</span>
                        <span className={chipClassEstado(r.estado)}>{PIAR_ESTADO_LABEL[r.estado] || r.estado}</span>
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
                        Abrir plan
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {tab === 'derivaciones' && (
          <section className="psi-doc-hub-panel" role="tabpanel">
            <div className="psi-doc-hub-der-head">
              <p className="psi-doc-hub-lead" style={{ margin: 0 }}>
                Fichas que usted envió. Una derivación nueva se registra desde{' '}
                <strong>Grupos asignados → Opciones → Derivación psicológica</strong>.
              </p>
              <button type="button" className="psi-doc-btn psi-doc-btn-secondary" onClick={() => navigate('/docente/grupos')}>
                Ir a mis grupos
              </button>
            </div>
            {errDer && (
              <div className="psi-doc-alert" role="alert">
                {errDer}
              </div>
            )}
            {loadingDer ? (
              <Box display="flex" justifyContent="center" py={4}>
                <CircularProgress size={32} />
              </Box>
            ) : derRows.length === 0 ? (
              <div className="psi-doc-empty">
                <strong>Aún no tiene derivaciones</strong>
                <p>Cuando envíe una ficha a psicología desde un grupo, quedará listada en esta pestaña.</p>
              </div>
            ) : derFiltrado.length === 0 ? (
              <div className="psi-doc-empty">
                <strong>Ninguna derivación coincide</strong>
                <p>Pruebe otro alumno o estado.</p>
              </div>
            ) : (
              <div className="psi-doc-der-list">
                {derFiltrado.map((r) => (
                  <article key={r.id} className="psi-doc-der-card">
                    <div className="psi-doc-der-card__main">
                      <div className="psi-doc-der-card__name">{r.alumno_nombre || `#${r.alumno_id}`}</div>
                      <div className="psi-doc-piar-item__chips">
                        <span className={chipClassDer(r.estado)}>{DER_ESTADO_LABEL[r.estado] || r.estado}</span>
                        {r.urgencia ? <span className="psi-doc-piar-chip">{r.urgencia}</span> : null}
                        <span className="psi-doc-piar-chip">{formatLimaSoloFecha(r.created_at)}</span>
                      </div>
                      <p className="psi-doc-der-card__resumen">
                        {(r.descripcion_caso || 'Sin resumen').slice(0, 160)}
                        {(r.descripcion_caso || '').length > 160 ? '…' : ''}
                      </p>
                    </div>
                    <div className="psi-doc-actions">
                      <button
                        type="button"
                        className="psi-doc-icon-btn"
                        title="Editar"
                        disabled={String(r.estado) !== 'RECIBIDA'}
                        onClick={() => irEditarDer(r)}
                      >
                        <EditIcon fontSize="small" />
                      </button>
                      <button
                        type="button"
                        className="psi-doc-icon-btn danger"
                        title="Eliminar"
                        disabled={String(r.estado) !== 'RECIBIDA'}
                        onClick={() => eliminarDer(r)}
                      >
                        <DeleteOutlineIcon fontSize="small" />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </DashboardLayout>
  );
}
