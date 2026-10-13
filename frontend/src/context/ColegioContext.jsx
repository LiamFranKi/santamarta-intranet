import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import { useAuth } from './AuthContext';

function textoSobre(hex) {
  const h = String(hex || '').replace('#', '');
  if (h.length !== 6) return '#1f2937';
  const y = (parseInt(h.slice(0, 2), 16) * 299 + parseInt(h.slice(2, 4), 16) * 587 + parseInt(h.slice(4, 6), 16) * 114) / 1000;
  return y > 160 ? '#1f2937' : '#ffffff';
}

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

  useEffect(() => {
    const alCambiar = () => recargarColegio();
    window.addEventListener('colegio-identidad-actualizada', alCambiar);
    return () => window.removeEventListener('colegio-identidad-actualizada', alCambiar);
  }, [recargarColegio]);

  // Aplicar variables CSS globales basadas en configuración del colegio
  useEffect(() => {
    const root = document.documentElement;
    const elegido = String(colegioData?.color_principal || '').trim();
    const primary = elegido || '#667eea';
    const secondary = String(colegioData?.color_secundario || '').trim() || '#764ba2';

    root.style.setProperty('--primary-color', primary);
    root.style.setProperty('--secondary-color', secondary);
    root.style.setProperty('--sidebar-bg', primary);
    root.style.setProperty('--sidebar-text', 'white');
    root.style.setProperty('--navbar-bg', '#ffffff');
    if (elegido) root.style.setProperty('--apariencia-sidebar', elegido);
    else root.style.removeProperty('--apariencia-sidebar');

    const navbar = String(colegioData?.color_navbar || '').trim();
    if (navbar) {
      root.style.setProperty('--apariencia-navbar', navbar);
      root.dataset.navbarCustom = '1';
      root.style.setProperty('--apariencia-navbar-texto', textoSobre(navbar));
    } else {
      root.style.removeProperty('--apariencia-navbar');
      root.style.removeProperty('--apariencia-navbar-texto');
      delete root.dataset.navbarCustom;
    }

    const acento = String(colegioData?.color_acento || '').trim();
    if (acento) {
      root.style.setProperty('--apariencia-acento', acento);
      root.dataset.acento = '1';
    } else {
      root.style.removeProperty('--apariencia-acento');
      delete root.dataset.acento;
    }

    const fondo = String(colegioData?.color_fondo || '').trim();
    if (fondo) root.style.setProperty('--apariencia-fondo', fondo);
    else root.style.removeProperty('--apariencia-fondo');

    const foto = colegioData?.intranet_fondo_modo === 'imagen' ? String(colegioData?.intranet_fondo || '').trim() : '';
    if (foto) {
      const abs = foto.startsWith('http') ? foto : `${window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? 'http://localhost:5000' : window.location.origin}${foto.startsWith('/') ? foto : `/${foto}`}`;
      root.style.setProperty('--apariencia-fondo-imagen', `url("${abs}")`);
    } else {
      root.style.removeProperty('--apariencia-fondo-imagen');
    }
  }, [colegioData]);

  useEffect(() => {
    const marca = String(colegioData?.texto_intranet || colegioData?.nombre_intranet || '').trim() || 'Intranet';
    document.title = marca;
    const appleTitulo = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    if (appleTitulo) appleTitulo.setAttribute('content', marca);

    const usarIcono = colegioData?.icono_desde_config && colegioData?.icono_app;
    const ruta = usarIcono
      ? String(colegioData.icono_app)
      : (colegioData?.logo_desde_config && colegioData?.logo ? String(colegioData.logo) : '');
    if (!ruta) return;
    let href = ruta;
    if (!ruta.startsWith('http')) {
      const host = window.location.hostname;
      const esLocal = host === 'localhost' || host === '127.0.0.1';
      const origen = esLocal
        ? String(process.env.REACT_APP_API_URL || 'http://localhost:5000/api').replace(/\/api\/?$/, '')
        : window.location.origin;
      href = `${origen}${ruta}`;
    }
    if (usarIcono) {
      document
        .querySelectorAll('link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"], link[rel="apple-touch-icon-precomposed"]')
        .forEach((el) => el.setAttribute('href', href));
      return;
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
    colorAcento: colegioData?.color_acento || '',
    colorNavbar: colegioData?.color_navbar || '',
    colorFondo: colegioData?.color_fondo || '',
    intranetFondoModo: colegioData?.intranet_fondo_modo || 'color',
    intranetFondo: colegioData?.intranet_fondo || null,
    loginPlantilla: colegioData?.login_plantilla || 'actual',
    loginFondoModo: colegioData?.login_fondo_modo || 'color',
    loginFondo: colegioData?.login_fondo || null,
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

