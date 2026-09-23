import React, { useMemo, useState } from 'react';
import api from '../../services/api';
import { useModulos } from '../../context/ModulosContext';
import { MODULOS } from '../../utils/modulosSistema';
import './AdminModulos.css';

export default function AdminModulos() {
  const { estados, activo, setEstados } = useModulos();
  const [guardando, setGuardando] = useState('');
  const [error, setError] = useState('');

  const grupos = useMemo(() => {
    const map = new Map();
    for (const item of MODULOS) {
      if (!map.has(item.grupo)) map.set(item.grupo, []);
      map.get(item.grupo).push(item);
    }
    return Array.from(map.entries());
  }, []);

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
      <h1>Módulos del sistema</h1>
      <p className="modulos-lead">
        Apagar un módulo lo oculta en el menú de todos los cargos y la pantalla deja de abrir.
        Si no tocas nada, el colegio sigue viendo lo mismo que hoy.
      </p>
      {error && <p className="modulos-error">{error}</p>}
      {grupos.map(([grupo, items]) => (
        <section key={grupo} className="modulos-grupo">
          <h2>{grupo}</h2>
          <ul>
            {items.map((item) => {
              const on = activo(item.clave);
              return (
                <li key={item.clave}>
                  <span>{item.nombre}</span>
                  <button
                    type="button"
                    className={on ? 'modulos-switch is-on' : 'modulos-switch'}
                    aria-pressed={on}
                    disabled={guardando === item.clave}
                    onClick={() => cambiar(item.clave, !on)}
                  >
                    {on ? 'Encendido' : 'Apagado'}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
