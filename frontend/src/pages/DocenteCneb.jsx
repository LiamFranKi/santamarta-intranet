import React, { useEffect, useMemo, useState } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import api from '../services/api';
import Swal from 'sweetalert2';
import AdminCnebSesiones from './admin/AdminCnebSesiones';
import AdminCnebRegistro from './admin/AdminCnebRegistro';
import './admin/AdminCnebPiloto.css';

const NIVELES_UI = [
  { id: 'INICIAL', label: 'Inicial' },
  { id: 'PRIMARIA', label: 'Primaria' },
  { id: 'SECUNDARIA', label: 'Secundaria' },
];

function etiquetaNivel(id) {
  return NIVELES_UI.find((n) => n.id === id)?.label || id;
}

export default function DocenteCneb() {
  const [tab, setTab] = useState('sesiones');
  const [nivel, setNivel] = useState('INICIAL');
  const [loading, setLoading] = useState(true);
  const [inicio, setInicio] = useState(null);
  const [areas, setAreas] = useState([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data: ini } = await api.get('/docente/cneb/inicio');
        if (!alive) return;
        setInicio(ini);
        const presentes = [...new Set((ini.grupos || []).map((g) => g.nivel_cneb).filter(Boolean))];
        setNivel((n) => (presentes.includes(n) ? n : presentes[0] || 'INICIAL'));
      } catch (e) {
        if (alive) {
          Swal.fire({
            icon: 'error',
            title: 'No se pudo abrir CNEB',
            text: e.response?.data?.error || e.message,
          });
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data: cat } = await api.get('/docente/cneb/catalogo', { params: { nivel } });
        if (alive) setAreas(cat.areas || []);
      } catch {
        if (alive) setAreas([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [nivel]);

  const nivelesDocente = useMemo(() => {
    const ids = new Set((inicio?.grupos || []).map((g) => g.nivel_cneb).filter(Boolean));
    const list = NIVELES_UI.filter((n) => ids.has(n.id));
    return list.length ? list : NIVELES_UI;
  }, [inicio]);

  const gruposNivel = useMemo(
    () => (inicio?.grupos || []).filter((g) => g.nivel_cneb === nivel),
    [inicio, nivel]
  );

  if (loading && !inicio) {
    return (
      <DashboardLayout>
        <div className="cneb-page cneb-page--loading">
          <div className="cneb-loading-card">
            <div className="cneb-spinner" />
            <p>Preparando CNEB de sus aulas…</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="cneb-page">
        <header className="cneb-hero">
          <div className="cneb-hero-text">
            <div className="cneb-hero-kicker">
              <span className="cneb-badge">Docente</span>
              <span>Solo sus aulas</span>
            </div>
            <h1>Evaluación CNEB</h1>
            <p>
              Arme la sesión (inicio, desarrollo y cierre), marque el cotejo y registre la conclusión
              descriptiva AD/A/B/C. No cambia las notas 0–20 ni la libreta vigente.
            </p>
          </div>
        </header>

        {nivelesDocente.length > 1 ? (
          <div className="cneb-nivel-switch" role="group" aria-label="Nivel">
            {nivelesDocente.map((n) => (
              <button
                key={n.id}
                type="button"
                className={nivel === n.id ? 'is-active' : ''}
                onClick={() => setNivel(n.id)}
              >
                <strong>{n.label}</strong>
              </button>
            ))}
          </div>
        ) : null}

        <nav className="cneb-tabs" role="tablist">
          <button
            type="button"
            className={`cneb-tab${tab === 'sesiones' ? ' is-active' : ''}`}
            onClick={() => setTab('sesiones')}
          >
            <strong>Sesiones</strong>
            <span>Momentos y cotejo</span>
          </button>
          <button
            type="button"
            className={`cneb-tab${tab === 'registro' ? ' is-active' : ''}`}
            onClick={() => setTab('registro')}
          >
            <strong>Registro</strong>
            <span>Auxiliar y conclusión</span>
          </button>
        </nav>

        {tab === 'sesiones' ? (
          <AdminCnebSesiones
            apiBase="/docente/cneb"
            nivel={nivel}
            areas={areas}
            etiquetaNivel={etiquetaNivel}
            bimestre={inicio?.bimestre || 4}
          />
        ) : (
          <AdminCnebRegistro
            apiBase="/docente/cneb"
            nivel={nivel}
            grupos={gruposNivel}
            bimestreDefault={inicio?.bimestre || 4}
            etiquetaNivel={etiquetaNivel}
          />
        )}
      </div>
    </DashboardLayout>
  );
}
