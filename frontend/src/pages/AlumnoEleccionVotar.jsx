import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CircularProgress } from '@mui/material';
import DashboardLayout from '../components/DashboardLayout';
import EleccionCampanaLayout from '../components/elecciones/EleccionCampanaLayout';
import api from '../services/api';
import Swal from 'sweetalert2';
import { useEleccionPortalPaths } from './elecciones/useEleccionPortalPaths';
import './AlumnoElecciones.css';

export default function AlumnoEleccionVotar() {
  const { isCampana, apiPrefix, routeBase } = useEleccionPortalPaths();
  const { procesoId } = useParams();
  const navigate = useNavigate();
  const pid = parseInt(procesoId, 10);
  const [loading, setLoading] = useState(true);
  const [urna, setUrna] = useState(null);
  const [seleccion, setSeleccion] = useState(null);
  const [modalListaId, setModalListaId] = useState(null);
  const [modalData, setModalData] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`${apiPrefix}/procesos/${pid}/urna`);
      setUrna(data);
      if (!data?.ya_voto) setSeleccion(null);
      else setSeleccion(null);
    } catch (e) {
      const msg = e.response?.data?.error || 'La urna no está disponible';
      await Swal.fire('Urna', msg, 'info');
      navigate(`${routeBase}/${pid}`);
    } finally {
      setLoading(false);
    }
  }, [pid, navigate, apiPrefix, routeBase]);

  useEffect(() => {
    load();
  }, [load]);

  const abrirModal = async (listaId) => {
    setModalListaId(listaId);
    setModalData(null);
    try {
      const { data } = await api.get(`${apiPrefix}/procesos/${pid}/listas/${listaId}`);
      setModalData(data);
    } catch {
      Swal.fire('', 'No se pudo cargar la plancha', 'error');
      setModalListaId(null);
    }
  };

  const confirmar = async () => {
    if (!seleccion) {
      Swal.fire('', 'Selecciona una opción antes de confirmar.', 'warning');
      return;
    }
    const r = await Swal.fire({
      title: '¿Confirmas tu voto?',
      html: '<p>Después de confirmar no podrás cambiarlo.</p>',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sí, votar',
      cancelButtonText: 'Cancelar'
    });
    if (!r.isConfirmed) return;
    try {
      await api.post(`${apiPrefix}/procesos/${pid}/voto`, { lista_id: seleccion });
      await Swal.fire('¡Gracias!', 'Tu voto quedó registrado.', 'success');
      navigate(`${routeBase}/${pid}`);
    } catch (e) {
      Swal.fire('No se registró el voto', e.response?.data?.error || 'Intenta nuevamente', 'error');
    }
  };

  if (loading || !urna) {
    const wrap = (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
        <CircularProgress />
      </div>
    );
    return isCampana ? <EleccionCampanaLayout>{wrap}</EleccionCampanaLayout> : <DashboardLayout>{wrap}</DashboardLayout>;
  }

  if (urna.ya_voto) {
    const wrap = (
      <div className="elcc-alum-hub" style={{ textAlign: 'center', paddingTop: '2rem' }}>
        <h1>Voto registrado</h1>
        <p className="elcc-alum-muted">Gracias por participar.</p>
        <button type="button" className="elcc-alum-btn elcc-alum-btn-primary" onClick={() => navigate(`${routeBase}/${pid}`)}>
          Volver
        </button>
      </div>
    );
    return isCampana ? <EleccionCampanaLayout>{wrap}</EleccionCampanaLayout> : <DashboardLayout>{wrap}</DashboardLayout>;
  }

  const inner = (
    <>
      <div className="elcc-alum-hub">
        <button type="button" className="elcc-alum-btn elcc-alum-btn-secondary" style={{ marginBottom: '1rem' }} onClick={() => navigate(`${routeBase}/${pid}`)}>
          ← Atrás
        </button>
        <header className="elcc-alum-hero" style={{ marginBottom: '1.75rem' }}>
          <h1 style={{ margin: '0 0 0.5rem', fontSize: '1.5rem' }}>Urna: {urna.proceso.titulo}</h1>
          <p style={{ margin: 0 }}>
            Solo ves al candidato a alcalde y el logo de su lista. Toca una tarjeta para marcar tu voto. El botón «Ver plancha»
            muestra al equipo sin cambiar tu elección si ya marcaste otra antes.
          </p>
        </header>

        <div className="elcc-urna-grid">
          {(urna.opciones || []).map((opt) => {
            const selected = seleccion === opt.lista_id;
            return (
              <div
                role="button"
                tabIndex={0}
                key={opt.lista_id}
                className={`elcc-urna-card${selected ? ' selected' : ''}`}
                style={{ '--elcc-accent': opt.color_primario || '#6366f1' }}
                onClick={() => setSeleccion(opt.lista_id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSeleccion(opt.lista_id);
                  }
                }}
              >
                <div className="elcc-urna-lista-nombre">{opt.nombre_lista}</div>
                {opt.logo_url ? <img src={opt.logo_url} alt="" className="elcc-urna-logo-lg" /> : <div className="elcc-urna-logo-lg" />}
                {opt.alcalde_foto_url ? <img src={opt.alcalde_foto_url} alt="" className="elcc-urna-face" /> : <div className="elcc-urna-face" style={{ background: '#e2e8f0' }} />}
                <div className="elcc-urna-alcalde">{opt.alcalde_nombre_completo}</div>
                <button
                  type="button"
                  className="elcc-alum-btn elcc-alum-btn-secondary"
                  style={{ marginTop: 12 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    abrirModal(opt.lista_id);
                  }}
                >
                  Ver plancha completa
                </button>
              </div>
            );
          })}
        </div>

        <div style={{ textAlign: 'center', marginTop: '1.5rem', paddingBottom: '2rem' }}>
          <button type="button" className="elcc-alum-btn elcc-alum-btn-primary" style={{ padding: '0.75rem 2rem', fontSize: '1rem' }} onClick={confirmar}>
            Confirmar mi voto
          </button>
        </div>
      </div>

      {modalListaId && (
        <div className="elcc-alum-modal-backdrop" role="presentation" onClick={() => setModalListaId(null)}>
          <div className="elcc-alum-modal" role="dialog" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ marginTop: 0 }}>Plancha</h2>
            {!modalData ? (
              <CircularProgress size={28} />
            ) : (
              <>
                <p style={{ fontWeight: 700 }}>{modalData.lista?.nombre_lista}</p>
                <p className="elcc-alum-muted" style={{ marginTop: '-2px' }}>
                  Alcalde: {modalData.lista?.alcalde?.nombre_completo}
                </p>
                <hr style={{ border: 'none', borderTop: '1px solid #e2e8f0' }} />
                <ul style={{ paddingLeft: 18, margin: 0 }}>
                  {(modalData.plancha || []).map((m, i) => (
                    <li key={i} style={{ marginBottom: 10 }}>
                      <strong>{m.cargo}</strong>
                      <br />
                      {m.nombre_completo}
                      {m.foto_url ? <img alt="" src={m.foto_url} style={{ display: 'block', width: 80, marginTop: 8, borderRadius: 12 }} /> : null}
                    </li>
                  ))}
                </ul>
              </>
            )}
            <button type="button" className="elcc-alum-btn elcc-alum-btn-primary" style={{ width: '100%', marginTop: 16 }} onClick={() => setModalListaId(null)}>
              Cerrar
            </button>
          </div>
        </div>
      )}
    </>
  );

  return isCampana ? <EleccionCampanaLayout>{inner}</EleccionCampanaLayout> : <DashboardLayout>{inner}</DashboardLayout>;
}
