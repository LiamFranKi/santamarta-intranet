import React, { useEffect, useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import DashboardLayout from '../../components/DashboardLayout';
import EleccionesCampanaBanner from '../../components/EleccionesCampanaBanner';
import TarjetasTardanzaPersonal from '../../components/TarjetasTardanzaPersonal';
import api from '../../services/api';
import './PsicologaDashboard.css';

const enlaces = [
  { to: '/admin/psicologia', label: 'Psicología', desc: 'Búsqueda de alumnos y expediente', icon: '🧠' },
  { to: '/admin/usuarios/alumnos', label: 'Alumnos', desc: 'Datos y matrícula de alumnos', icon: '🎓' },
  { to: '/admin/usuarios/apoderados', label: 'Apoderados', desc: 'Familias y apoderados', icon: '👨‍👩‍👧' },
  { to: '/admin/academico/grados', label: 'Grados', desc: 'Aulas del año lectivo', icon: '📑' },
  { to: '/docente/herramientas/documentos', label: 'Herramientas', desc: 'Documentos, exámenes, encuestas y vocabularios', icon: '🧰' },
  { to: '/docente/comunicados', label: 'Comunicados', desc: 'Avisos del colegio', icon: '📢' },
  { to: '/docente/actividades', label: 'Actividades', desc: 'Agenda escolar', icon: '📅' },
  { to: '/admin/mensajes', label: 'Mensajes', desc: 'Bandeja interna', icon: '✉️' },
];

export default function PsicologaDashboard() {
  const [manualPsicologia, setManualPsicologia] = useState(null);

  useEffect(() => {
    let mounted = true;
    const cargarManual = async () => {
      try {
        const { data } = await api.get('/docente/documentos-gestion');
        const docs = Array.isArray(data?.documentos) ? data.documentos : [];
        const normalizar = (v) =>
          String(v || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .trim();
        const manual = docs.find((d) => {
          const categoria = normalizar(d?.categoria_nombre);
          const titulo = normalizar(d?.titulo);
          return categoria === 'manuales' && titulo === 'manual de psicologia';
        });
        if (mounted) setManualPsicologia(manual || null);
      } catch (e) {
        if (mounted) setManualPsicologia(null);
      }
    };
    cargarManual();
    return () => {
      mounted = false;
    };
  }, []);

  const manualUrl = useMemo(() => {
    if (!manualPsicologia?.archivo_url) return '';
    const base = (api.defaults.baseURL || '').replace(/\/api\/?$/, '');
    const p = manualPsicologia.archivo_url.startsWith('/')
      ? manualPsicologia.archivo_url
      : `/${manualPsicologia.archivo_url}`;
    return `${base}${p}`;
  }, [manualPsicologia]);

  return (
    <DashboardLayout>
      <EleccionesCampanaBanner />
      <div className="dashboard-container psicologa-dashboard">
        <div className="psicologa-dashboard__manual-card-wrap">
          {manualUrl ? (
            <a
              className="psicologa-dashboard__manual-card"
              href={manualUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className="psicologa-dashboard__manual-icon" aria-hidden>📘</span>
              <div className="psicologa-dashboard__manual-text">
                <span className="psicologa-dashboard__manual-title">Manual de Psicología</span>
                <span className="psicologa-dashboard__manual-desc">
                  Guía de uso del módulo de psicología. Haga clic para abrir el PDF.
                </span>
              </div>
              <span className="psicologa-dashboard__manual-cta">Abrir manual</span>
            </a>
          ) : (
            <div className="psicologa-dashboard__manual-card psicologa-dashboard__manual-card--empty">
              <span className="psicologa-dashboard__manual-icon" aria-hidden>📘</span>
              <div className="psicologa-dashboard__manual-text">
                <span className="psicologa-dashboard__manual-title">Manual de Psicología</span>
                <span className="psicologa-dashboard__manual-desc">
                  No se encontró el archivo en la categoría MANUALES (título: Manual de Psicología).
                </span>
              </div>
            </div>
          )}
        </div>
        <TarjetasTardanzaPersonal />
        <div className="psicologa-dashboard__grid">
          {enlaces.map(({ to, label, desc, icon }) => (
            <NavLink key={to} to={to} className="psicologa-dashboard__card">
              <span className="psicologa-dashboard__card-icon" aria-hidden>
                {icon}
              </span>
              <span className="psicologa-dashboard__card-title">{label}</span>
              <span className="psicologa-dashboard__card-desc">{desc}</span>
            </NavLink>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}
