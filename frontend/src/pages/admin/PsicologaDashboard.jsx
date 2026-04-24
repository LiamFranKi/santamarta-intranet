import React from 'react';
import { NavLink } from 'react-router-dom';
import DashboardLayout from '../../components/DashboardLayout';
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
  return (
    <DashboardLayout>
      <div className="dashboard-container psicologa-dashboard">
        <header className="psicologa-dashboard__header">
          <h1>Panel de psicología</h1>
          <p className="psicologa-dashboard__sub">
            Accesos rápidos a psicología, familias, aulas y comunicación. Use el menú lateral para navegar.
          </p>
        </header>
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
