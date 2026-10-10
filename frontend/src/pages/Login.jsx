import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Swal from 'sweetalert2';
import { useAuth } from '../context/AuthContext';
import { useColegio } from '../context/ColegioContext';
import { rutaPostLoginSegunRol } from '../utils/hijosDeepLink';
import './Login.css';

function Login() {
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [puedeAperturar, setPuedeAperturar] = useState(false);

  const { login, isAuthenticated, user } = useAuth();
  const { loading: loadingColegio, error: errorColegio, logo, logoDesdeConfig, textoIntranet, nombreIntranet } = useColegio();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const irTrasLogin = (tipo) => {
    navigate(rutaPostLoginSegunRol(tipo, searchParams.get('next')));
  };

  // Resolver URL base en tiempo de ejecución (no en compilación)
  const apiBaseUrl = useMemo(() => {
    const hostname = window.location.hostname || '';
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
    
    if (isLocalhost) {
      return 'http://localhost:5000';
    }
    return window.location.origin;
  }, []); // Solo calcular una vez al montar el componente

  const logoUrl = useMemo(() => {
    if (logoDesdeConfig && logo) {
      const raw = String(logo);
      if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
      return `${apiBaseUrl}${raw.startsWith('/') ? raw : `/${raw}`}`;
    }
    return `${apiBaseUrl}/assets/logos/logo.png`;
  }, [apiBaseUrl, logo, logoDesdeConfig]);

  useEffect(() => {
    if (isAuthenticated && user) {
      irTrasLogin(user.tipo);
    }
  }, [isAuthenticated, user, navigate, searchParams]);

  useEffect(() => {
    let vivo = true;
    fetch(`${apiBaseUrl}/api/apertura/estado`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (vivo && data?.necesita_instalacion) setPuedeAperturar(true);
      })
      .catch(() => {});
    return () => { vivo = false; };
  }, [apiBaseUrl]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!usuario || !password) {
      Swal.fire({
        icon: 'warning',
        title: 'Campos requeridos',
        text: 'Por favor ingresa tu usuario y contraseña',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000,
        timerProgressBar: true,
      });
      return;
    }

    setSubmitting(true);
    try {
      const result = await login(usuario, password);
      if (!result?.success) {
        Swal.fire({
          icon: 'error',
          title: 'Error de autenticación',
          text: result?.error || 'No se pudo iniciar sesión',
          toast: true,
          position: 'top-end',
          showConfirmButton: false,
          timer: 4000,
          timerProgressBar: true,
        });
        return;
      }

      Swal.fire({
        icon: 'success',
        title: '¡Bienvenido!',
        text: `Hola ${result.user?.nombres || result.user?.usuario || usuario}`,
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 1800,
        timerProgressBar: true,
      });

      irTrasLogin(result.user?.tipo);
    } catch (error) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'Error al conectar con el servidor',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 4000,
        timerProgressBar: true,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-background" />

      <div className="login-container-simple">
        <div className="login-card-wide">
          {/* Panel Izquierdo: Branding */}
          <div className="login-branding-left">
            <div className="branding-content">
              <div className="brand-logo-main">
                <h1>{(textoIntranet || '').trim() || (nombreIntranet || '').trim() || 'Intranet'}</h1>
              </div>

              <p className="brand-description">
                Accede a tu aula virtual gamificada, chatea con ASISTENTE IA y lleva tu aprendizaje al siguiente nivel.
              </p>

              <div className="brand-features-list">
                <div className="feature-item">
                  <span className="feature-icon">🎮</span>
                  <span>Aula Virtual Gamificada</span>
                </div>
                <div className="feature-item">
                  <span className="feature-icon">🤖</span>
                  <span>Asistente IA</span>
                </div>
                <div className="feature-item">
                  <span className="feature-icon">📲</span>
                  <span>Aplicación PWA Instalable</span>
                </div>
              </div>
            </div>
          </div>

          {/* Panel Derecho: Formulario */}
          <div className="login-form-right">
            {/* Logo en esquina superior derecha */}
            <div className="form-logo-container">
              <img 
                src={logoUrl} 
                alt="Logo" 
                className="form-logo"
                crossOrigin="anonymous"
                onError={(e) => {
                  e.currentTarget.onerror = null;
                  e.currentTarget.style.display = 'none';
                }}
              />
            </div>

            <div className="form-header">
              <h2>Iniciar Sesión</h2>
              <p>Ingresa tus credenciales para acceder</p>
            </div>

            <form className="login-form" onSubmit={handleSubmit}>
              <div className="form-group">
                <label htmlFor="usuario">Usuario</label>
                <div className="input-wrapper">
                  <span className="input-icon">👤</span>
                  <input
                    id="usuario"
                    type="text"
                    inputMode="text"
                    placeholder="Ingresa tu usuario"
                    value={usuario}
                    onChange={(e) => setUsuario(e.target.value)}
                    autoComplete="username"
                    disabled={submitting}
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="password">Contraseña</label>
                <div className="input-wrapper input-wrapper-password">
                  <span className="input-icon">🔒</span>
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Ingresa tu contraseña"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    disabled={submitting}
                  />
                  <button
                    className="toggle-password"
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  >
                    {showPassword ? '🙈' : '👁️'}
                  </button>
                </div>
              </div>

              <button className="btn-submit" type="submit" disabled={submitting}>
                {submitting ? (
                  <>
                    <span className="spinner" /> <span>Ingresando...</span>
                  </>
                ) : (
                  <>
                    <span>Iniciar Sesión</span> <span>→</span>
                  </>
                )}
              </button>

              {loadingColegio ? (
                <div className="login-hint">Cargando configuración del colegio...</div>
              ) : errorColegio ? (
                <div className="login-hint login-hint--warn" role="alert">
                  No se pudo cargar la configuración del colegio desde el servidor. Si el problema continúa, el servicio
                  puede estar en mantenimiento o la base de datos no responde (comuníquese con administración).
                </div>
              ) : null}
              {puedeAperturar && (
                <p className="login-hint">
                  Esta base todavía no tiene colegio.{' '}
                  <a href="/apertura">Aperturar el sistema</a>
                </p>
              )}
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Login;

