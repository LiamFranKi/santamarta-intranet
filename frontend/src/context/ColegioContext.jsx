import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import { useAuth } from './AuthContext';

const ColegioContext = createContext();

export const useColegio = () => {
  const context = useContext(ColegioContext);
  if (!context) {
    throw new Error('useColegio debe usarse dentro de ColegioProvider');
  }
  return context;
};

export const ColegioProvider = ({ children, colegioId = 1 }) => {
  const { user } = useAuth();
  const id = Number(user?.colegio_id) || Number(colegioId) || 1;
  const [colegioData, setColegioData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tick, setTick] = useState(0);

  const recargarColegio = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    const obtenerDatosColegio = async () => {
      try {
        setLoading(true);
        const response = await api.get(`/colegio/${id}`);
        setColegioData(response.data);
        setError(null);
      } catch (err) {
        // Solo mostrar error si no es un error de conexión (normal en desarrollo local)
        if (err.response?.status !== 500 || err.code !== 'ECONNREFUSED') {
          console.warn('⚠️ No se pudieron obtener datos del colegio desde MySQL:', err.message);
        } else {
          console.log('ℹ️ MySQL remoto no disponible (normal en desarrollo local)');
        }
        setError(err.message);
        // Valores por defecto en caso de error
        setColegioData({
          nombre_intranet: '',
          nombre: 'Colegio',
          logo: null,
          color_principal: null,
          color_secundario: null,
          mascota_nombre: 'Vanguarcito',
          mascota_imagen: null,
        });
      } finally {
        setLoading(false);
      }
    };

    obtenerDatosColegio();
  }, [id, tick]);

  // Aplicar variables CSS globales basadas en configuración del colegio
  useEffect(() => {
    const root = document.documentElement;
    const primary = colegioData?.color_principal || '#667eea';
    const secondary = colegioData?.color_secundario || '#764ba2';

    root.style.setProperty('--primary-color', primary);
    root.style.setProperty('--secondary-color', secondary);

    // Sidebar / navbar (pueden ajustarse luego según diseño)
    root.style.setProperty('--sidebar-bg', primary);
    root.style.setProperty('--sidebar-text', 'white');
    root.style.setProperty('--navbar-bg', '#ffffff');
  }, [colegioData]);

  useEffect(() => {
    const marca = String(colegioData?.texto_intranet || colegioData?.nombre_intranet || '').trim() || 'Intranet';
    document.title = marca;
    const appleTitulo = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    if (appleTitulo) appleTitulo.setAttribute('content', marca);

    if (!colegioData?.logo_desde_config || !colegioData?.logo) return;
    const ruta = String(colegioData.logo);
    let href = ruta;
    if (!ruta.startsWith('http')) {
      const host = window.location.hostname;
      const esLocal = host === 'localhost' || host === '127.0.0.1';
      const origen = esLocal
        ? String(process.env.REACT_APP_API_URL || 'http://localhost:5000/api').replace(/\/api\/?$/, '')
        : window.location.origin;
      href = `${origen}${ruta}`;
    }
    const icono = document.querySelector('link[rel="icon"]');
    if (icono) icono.setAttribute('href', href);
    const apple = document.querySelector('link[rel="apple-touch-icon"]');
    if (apple) apple.setAttribute('href', href);
  }, [colegioData]);

  const value = {
    colegioData,
    loading,
    error,
    nombreIntranet: colegioData?.nombre_intranet || 'Aula Virtual',
    nombre: colegioData?.nombre || 'Colegio',
    logo: colegioData?.logo || null,
    logoDesdeConfig: !!colegioData?.logo_desde_config,
    logoBlanco: colegioData?.logo_blanco || null,
    logoBlancoDesdeConfig: !!colegioData?.logo_blanco_desde_config,
    textoIntranet: colegioData?.texto_intranet || '',
    colorPrincipal: colegioData?.color_principal || null,
    colorSecundario: colegioData?.color_secundario || null,
    anioActivo: colegioData?.anio_activo || null,
    mascotaNombre: String(colegioData?.mascota_nombre || '').trim() || 'Vanguarcito',
    mascotaImagen: colegioData?.mascota_imagen || null,
    recargarColegio,
  };

  return (
    <ColegioContext.Provider value={value}>
      {children}
    </ColegioContext.Provider>
  );
};

