import React, { useMemo, useState } from 'react';
import api from '../../services/api';
import { useModulos } from '../../context/ModulosContext';
import { useColegio } from '../../context/ColegioContext';
import { MODULOS } from '../../utils/modulosSistema';
import './AdminModulos.css';

const ICONO_GRUPO = {
  General: '✦',
  Usuarios: '👥',
  Académico: '📚',
  Herramientas: '🧰',
  Comunicaciones: '📣',
  'Pagos y facturas': '💳',
  Reportes: '📊',
  Web: '🌐',
  Configuración: '⚙️',
};

export default function AdminModulos() {
  const { estados, activo, setEstados } = useModulos();
  const { mascotaNombre } = useColegio();
  const [guardando, setGuardando] = useState('');
  const [error, setError] = useState('');
  const [tab, setTab] = useState('General');

  const grupos = useMemo(() => {
    const map = new Map();
    for (const item of MODULOS) {
      if (item.oculto) continue;
      if (!map.has(item.grupo)) map.set(item.grupo, []);
      map.get(item.grupo).push(item);
    }
    return Array.from(map.entries());
  }, []);

  const visibles = useMemo(() => grupos.flatMap(([, items]) => items), [grupos]);
  const encendidos = visibles.filter((item) => activo(item.clave)).length;
  const grupoActivo = grupos.find(([nombre]) => nombre === tab) || grupos[0];
  const itemsTab = grupoActivo?.[1] || [];
  const encendidosTab = itemsTab.filter((item) => activo(item.clave)).length;

  const cambiar = async (clave, encendido) => {
    setError('');
    setGuardando(clave);
    const previo = !!estados[clave];
    setEstados((actual) => ({ ...actual, [clave]: encendido }));
    try {
      const { data } = await api.put('/modulos', { clave, activo: encendido });
      if (data?.estados) setEstados(data.estados);
    } catch (e) {
      setEstados((actual) => ({ ...actual, [clave]: previo }));
      setError(e.response?.data?.error || 'No se pudo guardar. El módulo quedó como estaba.');
    } finally {
      setGuardando('');
    }
  };

  return (
    <div className="modulos-page">
      <header className="modulos-hero">
        <div className="modulos-hero-icon" aria-hidden>▦</div>
        <div className="modulos-hero-text">
          <h1>Módulos del sistema</h1>
          <p>Enciende o apaga lo que ve cada cargo. Si no tocas nada, el colegio sigue igual.</p>
          <div className="modulos-hero-meta">
            <span>{encendidos} encendidos</span>
            <span>{visibles.length - encendidos} apagados</span>
            <span>{grupos.length} grupos</span>
          </div>
        </div>
      </header>

      {error && <p className="modulos-error">{error}</p>}

      <nav className="modulos-tabs" role="tablist" aria-label="Grupos de módulos">
        {grupos.map(([nombre, items]) => {
          const on = items.filter((item) => activo(item.clave)).length;
          const activoTab = (grupoActivo?.[0] || tab) === nombre;
          return (
            <button
              key={nombre}
              type="button"
              role="tab"
              aria-selected={activoTab}
              className={activoTab ? 'modulos-tab is-on' : 'modulos-tab'}
              onClick={() => setTab(nombre)}
            >
              <span className="modulos-tab-ico" aria-hidden>{ICONO_GRUPO[nombre] || '•'}</span>
              <span className="modulos-tab-label">{nombre}</span>
              <span className="modulos-tab-count">{on}/{items.length}</span>
            </button>
          );
        })}
      </nav>

      <section className="modulos-panel" role="tabpanel">
        <div className="modulos-panel-head">
          <h2>{grupoActivo?.[0]}</h2>
          <p>{encendidosTab} de {itemsTab.length} encendidos en este grupo.</p>
        </div>
        <ul className="modulos-grid">
          {itemsTab.map((item) => {
            const on = activo(item.clave);
            const nombre = item.clave === 'herramientas.vanguarcito' ? mascotaNombre : item.nombre;
            const ocupado = guardando === item.clave;
            return (
              <li key={item.clave}>
                <button
                  type="button"
                  className={on ? 'modulos-card is-on' : 'modulos-card'}
                  aria-pressed={on}
                  disabled={ocupado}
                  onClick={() => cambiar(item.clave, !on)}
                >
                  <span className="modulos-card-copy">
                    <strong>{nombre}</strong>
                    <em>{ocupado ? 'Guardando…' : on ? 'Visible en el menú' : 'Oculto para todos'}</em>
                  </span>
                  <span className={on ? 'modulos-pill is-on' : 'modulos-pill'} aria-hidden>
                    <i />
                    {on ? 'Sí' : 'No'}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
