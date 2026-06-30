import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import DashboardLayout from '../../../components/DashboardLayout';
import TabBuscarAlumnos from './TabBuscarAlumnos';
import TabBcp from './TabBcp';
import TabBoletear from './TabBoletear';
import { PAGOS_ESCOLARES_TABS, tabPagosFromSearchParams } from './pagosEscolaresFilters';
import './AdminPagosEscolares.css';

export default function AdminPagosEscolares() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tabActivo = tabPagosFromSearchParams(searchParams);

  const cambiarTab = (tabId) => {
    const next = new URLSearchParams(searchParams);
    if (tabId === 'buscar') {
      next.delete('tab');
    } else {
      next.set('tab', tabId);
    }
    const qs = next.toString();
    navigate(`/admin/pagos-facturas/buscar-pagos${qs ? `?${qs}` : ''}`, { replace: true });
  };

  return (
    <DashboardLayout>
      <div className="pe-wrap">
        <header className="pe-header">
          <h1>Pagos escolares</h1>
          <p>Buscar alumnos, integración BCP, boletear y historial de importaciones.</p>
        </header>

        <nav className="pe-tabs" aria-label="Secciones de pagos escolares">
          {PAGOS_ESCOLARES_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`pe-tab${tabActivo === tab.id ? ' pe-tab--active' : ''}`}
              onClick={() => cambiarTab(tab.id)}
              aria-selected={tabActivo === tab.id}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="pe-tab-panel">
          {tabActivo === 'buscar' && <TabBuscarAlumnos />}
          {tabActivo === 'bcp' && <TabBcp />}
          {tabActivo === 'boletear' && <TabBoletear />}
        </div>
      </div>
    </DashboardLayout>
  );
}
