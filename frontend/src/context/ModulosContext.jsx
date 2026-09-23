import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import { useAuth } from './AuthContext';
import { CLAVES_CONFIG_PAGINA, CLAVES_WEB, estadosDeFabrica } from '../utils/modulosSistema';

const ModulosContext = createContext(null);

export function ModulosProvider({ children }) {
  const { isAuthenticated } = useAuth();
  const [estados, setEstados] = useState(estadosDeFabrica);
  const [listo, setListo] = useState(false);

  const recargar = useCallback(async () => {
    try {
      const { data } = await api.get('/modulos');
      const remoto = data?.estados && typeof data.estados === 'object' ? data.estados : {};
      setEstados({ ...estadosDeFabrica(), ...remoto });
    } catch {
      setEstados(estadosDeFabrica());
    } finally {
      setListo(true);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      setEstados(estadosDeFabrica());
      setListo(false);
      return;
    }
    recargar();
  }, [isAuthenticated, recargar]);

  const activo = useCallback((clave) => {
    if (!clave) return true;
    if (Object.prototype.hasOwnProperty.call(estados, clave)) return !!estados[clave];
    return true;
  }, [estados]);

  const alguno = useCallback((claves) => (claves || []).some((clave) => activo(clave)), [activo]);

  const value = useMemo(() => ({
    estados,
    listo,
    activo,
    alguno,
    recargar,
    setEstados,
    webActiva: alguno(CLAVES_WEB),
    configActiva: alguno([...CLAVES_CONFIG_PAGINA, 'config.cumpleanos', 'config.indicadores']),
  }), [estados, listo, activo, alguno, recargar]);

  return <ModulosContext.Provider value={value}>{children}</ModulosContext.Provider>;
}

export function useModulos() {
  const ctx = useContext(ModulosContext);
  if (ctx) return ctx;
  const fabrica = estadosDeFabrica();
  return {
    estados: fabrica,
    listo: false,
    activo: (clave) => (clave && Object.prototype.hasOwnProperty.call(fabrica, clave) ? !!fabrica[clave] : true),
    alguno: (claves) => (claves || []).some((clave) => (Object.prototype.hasOwnProperty.call(fabrica, clave) ? !!fabrica[clave] : true)),
    recargar: async () => {},
    setEstados: () => {},
    webActiva: true,
    configActiva: true,
  };
}
