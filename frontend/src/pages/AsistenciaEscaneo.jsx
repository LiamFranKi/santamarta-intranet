import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import Swal from 'sweetalert2';
import AsistenciaConfirmModal from '../components/AsistenciaConfirmModal';
import './AsistenciaEscaneo.css';

function etiquetaCamara(cam) {
  return String(cam?.label || '').toLowerCase();
}

function idCamaraPreferida(cameras, prefer) {
  if (!cameras?.length) return null;
  const esTrasera = (c) => /back|rear|environment|trasera|posterior|wide|ultra/i.test(etiquetaCamara(c));
  const esFrontal = (c) => /front|user|frontal|face|selfie/i.test(etiquetaCamara(c));
  if (prefer === 'user') {
    return (cameras.find(esFrontal) || cameras[0]).id;
  }
  return (cameras.find(esTrasera) || cameras[cameras.length - 1]).id;
}

function AsistenciaEscaneo() {
  const navigate = useNavigate();
  const { logout, user, loading: authLoading } = useAuth();
  const [accesoVerificado, setAccesoVerificado] = useState(false);
  const [docentePuedeEscanear, setDocentePuedeEscanear] = useState(true);
  const [modalConfirmacion, setModalConfirmacion] = useState(null);
  const modalBloqueaScanRef = useRef(false);
  const [modo, setModo] = useState('continuo'); // 'continuo' o 'manual'
  const [escaneando, setEscaneando] = useState(false);
  const [mostrarBusqueda, setMostrarBusqueda] = useState(false);
  const [modoBusqueda, setModoBusqueda] = useState(null); // 'buscar' | 'olvido_qr'
  const [busqueda, setBusqueda] = useState('');
  const [resultadosBusqueda, setResultadosBusqueda] = useState([]);
  const [procesando, setProcesando] = useState(false);
  const [historial, setHistorial] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [camaraSeleccionada, setCamaraSeleccionada] = useState('environment'); // 'environment' (trasera) o 'user' (frontal)
  
  const qrCodeRef = useRef(null);
  const html5QrCodeRef = useRef(null);
  const scannerId = useRef(null);
  const busquedaTimeoutRef = useRef(null);
  const ultimoQRProcesado = useRef(null);
  const tiempoUltimoQR = useRef(0);
  const registroCompletoThrottleUntil = useRef(0);
  const registroCompletoQR = useRef(null); // QR que dio "registro completo" (throttle 5s)
  const cambiandoCamara = useRef(false);
  const iniciandoScanRef = useRef(false);

  // Solo docentes con al menos un grupo como tutor acceden; ASISTENCIA/ADMIN entran directo
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setAccesoVerificado(true);
      return;
    }
    if (user.tipo !== 'DOCENTE') {
      setDocentePuedeEscanear(true);
      setAccesoVerificado(true);
      return;
    }
    let cancel = false;
    (async () => {
      try {
        const { data } = await api.get('/docente/tutoria');
        if (cancel) return;
        if (!data.es_tutor) {
          setDocentePuedeEscanear(false);
          Swal.fire({
            icon: 'info',
            title: 'Sin acceso al escáner',
            text: 'Solo los docentes con grupo de tutoría a cargo pueden escanear asistencia.',
            confirmButtonText: 'Volver al panel'
          }).then(() => {
            navigate('/docente/tutoria', { replace: true });
          });
        } else {
          setDocentePuedeEscanear(true);
        }
      } catch (e) {
        if (cancel) return;
        console.error(e);
        Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo verificar el acceso al escáner.' });
        navigate('/docente/tutoria', { replace: true });
      } finally {
        if (!cancel) setAccesoVerificado(true);
      }
    })();
    return () => { cancel = true; };
  }, [user, authLoading, navigate]);

  useEffect(() => {
    // Limpiar al desmontar
    return () => {
      detenerEscaneo();
    };
  }, []);

  // Delay inicial al cargar la página para evitar problemas
  const [cargado, setCargado] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      setCargado(true);
    }, 1000); // Esperar 1 segundo antes de permitir inicio automático
    return () => clearTimeout(timer);
  }, []);

  // Iniciar escaneo automáticamente cuando se cambia a modo continuo o cambia la cámara
  useEffect(() => {
    if (cargado && modo === 'continuo' && !escaneando && !procesando && !mostrarBusqueda) {
      // Pequeño delay para asegurar que el DOM esté listo
      const timer = setTimeout(() => {
        iniciarEscaneo();
      }, 500);
      return () => clearTimeout(timer);
    } else if (modo === 'manual' && escaneando) {
      // Si cambia a manual y está escaneando, detener
      detenerEscaneo();
    }
  }, [modo, cargado, camaraSeleccionada]); // Agregar camaraSeleccionada como dependencia

  // Detener escaneo cuando cambia la cámara (solo en modo continuo)
  // El useEffect del modo continuo se encargará de reiniciar automáticamente
  useEffect(() => {
    if (!cargado) return; // No hacer nada hasta que la página esté cargada
    if (modo !== 'continuo') return; // Solo en modo continuo
    if (mostrarBusqueda) return; // No reiniciar si está en búsqueda manual
    if (cambiandoCamara.current) return; // Evitar múltiples cambios simultáneos
    if (!escaneando) return; // Solo detener si está escaneando
    
    cambiandoCamara.current = true;
    console.log(`🔄 Cambiando a cámara: ${camaraSeleccionada === 'environment' ? 'TRASERA' : 'FRONTAL'}`);
    
    // Detener escaneo actual - el useEffect del modo continuo se encargará de reiniciar
    const cambiarCamara = async () => {
      try {
        // Detener escaneo actual si existe
        if (html5QrCodeRef.current) {
          try {
            await html5QrCodeRef.current.stop();
            html5QrCodeRef.current = null;
          } catch (e) {
            console.warn('Error deteniendo escáner anterior:', e);
          }
        }
        setEscaneando(false);
        
        // Esperar para asegurar que la cámara anterior se liberó completamente
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Liberar el flag - esto permitirá que el useEffect del modo continuo se ejecute
        cambiandoCamara.current = false;
        console.log('✅ Cámara detenida, esperando reinicio automático...');
      } catch (error) {
        console.error('❌ Error al cambiar cámara:', error);
        cambiandoCamara.current = false;
      }
    };
    
    cambiarCamara();
  }, [camaraSeleccionada]);

  const detenerEscaneo = async () => {
    if (html5QrCodeRef.current) {
      try {
        await html5QrCodeRef.current.stop();
        html5QrCodeRef.current = null;
      } catch (error) {
        console.error('Error deteniendo escáner:', error);
      }
    }
    setEscaneando(false);
  };

  const iniciarEscaneo = async () => {
    if (escaneando || procesando || iniciandoScanRef.current) {
      return;
    }
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      Swal.fire({
        title: 'Cámara no disponible',
        text: 'El escáner necesita una conexión segura (https). Abre el sitio con https.',
        icon: 'warning',
      });
      return;
    }

    iniciandoScanRef.current = true;
    const qrReaderElement = document.getElementById('qr-reader');
    if (!qrReaderElement) {
      iniciandoScanRef.current = false;
      return;
    }

    const scanConfig = {
      fps: 10,
      qrbox: (viewfinderWidth, viewfinderHeight) => {
        const lado = Math.floor(Math.min(viewfinderWidth, viewfinderHeight) * 0.7);
        const size = Math.max(Math.min(lado, 360), 160);
        return { width: size, height: size };
      },
    };
    const onSuccess = (decodedText) => {
      if (!procesando) procesarQR(decodedText);
    };
    const onScanError = () => {};

    const limpiarInstancia = async () => {
      if (html5QrCodeRef.current) {
        try {
          await html5QrCodeRef.current.stop();
        } catch {
          /* ignore */
        }
        html5QrCodeRef.current = null;
      }
      qrReaderElement.innerHTML = '';
    };

    const intentarStart = async (cameraConfig) => {
      await limpiarInstancia();
      const inst = new Html5Qrcode('qr-reader');
      html5QrCodeRef.current = inst;
      await inst.start(cameraConfig, scanConfig, onSuccess, onScanError);
    };

    try {
      await limpiarInstancia();

      let cameras = [];
      try {
        cameras = await Html5Qrcode.getCameras();
      } catch (eList) {
        console.warn('No se pudieron listar cámaras:', eList);
      }

      if (!cameras.length && navigator.mediaDevices?.getUserMedia) {
        const pedirStream = async (video) => {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video });
          stream.getTracks().forEach((t) => t.stop());
        };
        try {
          try {
            await pedirStream({ facingMode: { ideal: camaraSeleccionada } });
          } catch {
            await pedirStream(true);
          }
          cameras = await Html5Qrcode.getCameras();
        } catch (eWarm) {
          console.warn('No se pudo pedir permiso de cámara:', eWarm);
        }
      }

      cameras = (cameras || []).filter((c) => c && c.id);

      const intentos = [];
      if (cameras.length) {
        const preferida = idCamaraPreferida(cameras, camaraSeleccionada);
        if (preferida) intentos.push(preferida);
        cameras.forEach((c) => {
          if (c.id && !intentos.includes(c.id)) intentos.push(c.id);
        });
      }
      intentos.push({ facingMode: { ideal: camaraSeleccionada } });
      intentos.push({
        facingMode: { ideal: camaraSeleccionada === 'environment' ? 'user' : 'environment' },
      });
      intentos.push({ facingMode: { ideal: 'environment' } });
      intentos.push({ facingMode: { ideal: 'user' } });

      let ultimoError = null;
      for (const cfg of intentos) {
        try {
          await intentarStart(cfg);
          setEscaneando(true);
          iniciandoScanRef.current = false;
          return;
        } catch (eTry) {
          ultimoError = eTry;
          console.warn('Intento de cámara falló:', cfg, eTry);
        }
      }

      setEscaneando(false);
      const msg = String(ultimoError?.message || ultimoError || '');
      const denegado = /notallowed|permission|denied|permiso/i.test(msg);
      Swal.fire({
        title: denegado ? 'Permiso de cámara' : 'No se encontró la cámara',
        text: denegado
          ? 'Permite el acceso a la cámara en el navegador (candado de la barra de dirección) e inténtalo de nuevo.'
          : 'El celular no entregó la cámara. Cierra otras apps que la usen, recarga la página y, si pide permiso, elige Permitir.',
        icon: 'error',
      });
    } catch (error) {
      console.error('Error iniciando escáner:', error);
      setEscaneando(false);
      Swal.fire({
        title: 'Error',
        text: 'No se pudo iniciar el escáner. Recarga la página e inténtalo de nuevo.',
        icon: 'error',
      });
    } finally {
      iniciandoScanRef.current = false;
    }
  };

  const procesarQR = async (qrData) => {
    // Prevenir procesar si ya está procesando
    if (procesando) {
      console.log('⚠️ Ya hay un QR siendo procesado, ignorando...');
      return;
    }
    
    // Prevenir procesar el mismo QR múltiples veces (2s normal, 5s si mismo QR dio "registro completo")
    const ahora = Date.now();
    const usoThrottleCompleto = registroCompletoQR.current === qrData && registroCompletoThrottleUntil.current > ahora;
    const limite = usoThrottleCompleto ? registroCompletoThrottleUntil.current : tiempoUltimoQR.current + 2000;
    if (ultimoQRProcesado.current === qrData && ahora < limite) {
      console.log('⚠️ QR ya procesado recientemente, ignorando...');
      return;
    }
    
    // Marcar como procesando
    ultimoQRProcesado.current = qrData;
    tiempoUltimoQR.current = ahora;
    setProcesando(true);
    
    try {
      // Vibración si está disponible
      if (navigator.vibrate) {
        navigator.vibrate(200);
      }

      // Detener escaneo temporalmente para evitar múltiples escaneos
      if (modo === 'continuo' && html5QrCodeRef.current) {
        try {
          await detenerEscaneo();
        } catch (error) {
          console.warn('Error deteniendo escáner:', error);
        }
      }

      console.log('📱 Procesando QR:', qrData.substring(0, 20) + '...');
      const response = await api.post('/asistencia/escaneo', { qr_data: qrData });
      
      if (response.data.registro_completo) {
        // Ya tiene entrada y salida hoy - mostrar mensaje informativo (evita bucle)
        const u = response.data.usuario;
        Swal.fire({
          title: 'Registro completo',
          html: `Ya tiene entrada y salida registradas hoy para <strong>${u?.nombres || ''} ${u?.apellidos || ''}</strong>.`,
          icon: 'info',
          confirmButtonText: 'Entendido',
          timer: 4000,
          timerProgressBar: true
        });
        ultimoQRProcesado.current = qrData;
        tiempoUltimoQR.current = ahora;
        registroCompletoQR.current = qrData;
        registroCompletoThrottleUntil.current = ahora + 5000;
      } else if (response.data.success) {
        abrirModalConfirmacion(response.data);
      } else {
        Swal.fire({
          title: 'Error',
          text: 'No se pudo procesar el QR',
          icon: 'error',
          confirmButtonText: 'Entendido'
        });
        // Limpiar estado para permitir nuevo intento
        ultimoQRProcesado.current = null;
        tiempoUltimoQR.current = 0;
      }
    } catch (error) {
      console.error('❌ Error procesando QR:', error);
      const errorMessage = error.response?.data?.error || 'No se pudo procesar el QR. Intenta nuevamente.';
      
      Swal.fire({
        title: 'Error al Escanear',
        text: errorMessage,
        icon: 'error',
        confirmButtonText: 'Entendido'
      });
      
      // Limpiar estado para permitir nuevo intento
      ultimoQRProcesado.current = null;
      tiempoUltimoQR.current = 0;
    } finally {
      setProcesando(false);
      
      // Reanudar escaneo si el modal de confirmación no está abierto
      if (modo === 'continuo' && !modalBloqueaScanRef.current) {
        setTimeout(() => {
          if (!modalBloqueaScanRef.current) {
            iniciarEscaneo();
          }
        }, 1500);
      }
    }
  };

  const abrirModalConfirmacion = (data) => {
    modalBloqueaScanRef.current = true;
    setModalConfirmacion({
      usuario: data.usuario,
      tipo_registro: data.tipo_registro,
      aplicarOlvidoQr: !!data.aplicarOlvidoQr,
    });
  };

  const cerrarModalConfirmacion = () => {
    modalBloqueaScanRef.current = false;
    setModalConfirmacion(null);
  };

  const registrarAsistencia = async (usuarioId, tipoUsuario, tipoRegistro, descuentosPresentacion = []) => {
    // Prevenir múltiples registros simultáneos
    if (procesando) {
      console.log('⚠️ Ya hay un registro en proceso, ignorando...');
      return;
    }
    
    try {
      setProcesando(true);
      
      console.log('📝 Registrando asistencia:', { usuarioId, tipoUsuario, tipoRegistro });
      const now = new Date();
      const fecha_dispositivo = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const hora_dispositivo = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
      const body = {
        usuario_id: usuarioId,
        tipo_usuario: tipoUsuario,
        tipo_registro: tipoRegistro,
        fecha_dispositivo,
        hora_dispositivo
      };
      if (Array.isArray(descuentosPresentacion) && descuentosPresentacion.length > 0) {
        body.descuentos_presentacion = descuentosPresentacion;
      }
      const response = await api.post('/asistencia/registrar', body);

      if (response.data.success) {
        const { usuario, mensaje } = response.data;
        
        // Agregar al historial
        setHistorial(prev => [{
          id: Date.now(),
          nombre: `${usuario.nombres} ${usuario.apellidos}`,
          tipo: tipoUsuario,
          registro: tipoRegistro,
          hora: new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })
        }, ...prev.slice(0, 9)]); // Máximo 10 en historial

        Swal.fire({
          title: '¡Registrado!',
          text: mensaje,
          icon: 'success',
          timer: 2000,
          showConfirmButton: false
        });

        modalBloqueaScanRef.current = false;
        setModalConfirmacion(null);
        ultimoQRProcesado.current = null;
        tiempoUltimoQR.current = 0;
        
        // Reanudar escaneo si es modo continuo (con delay para evitar escaneos inmediatos)
        if (modo === 'continuo') {
          setTimeout(() => {
            if (!modalBloqueaScanRef.current) {
              iniciarEscaneo();
            }
          }, 1500);
        }
      }
    } catch (error) {
      console.error('❌ Error registrando asistencia:', error);
      const errorMessage = error.response?.data?.error || 'No se pudo registrar la asistencia. Intenta nuevamente.';
      
      Swal.fire({
        title: 'Error al Registrar',
        text: errorMessage,
        icon: 'error',
        confirmButtonText: 'Entendido'
      });
      
      // Limpiar estado para permitir nuevo intento
      modalBloqueaScanRef.current = false;
      setModalConfirmacion(null);
      ultimoQRProcesado.current = null;
      tiempoUltimoQR.current = 0;
      
      if (modo === 'continuo' && !errorMessage.includes('Ya existe un registro')) {
        setTimeout(() => {
          if (!modalBloqueaScanRef.current) {
            iniciarEscaneo();
          }
        }, 2000);
      }
    } finally {
      setProcesando(false);
    }
  };

  const buscarUsuario = async (termino) => {
    if (!termino || termino.trim().length < 2) {
      setResultadosBusqueda([]);
      return;
    }

    try {
      setBuscando(true);
      const response = await api.post('/asistencia/buscar', { busqueda: termino.trim() });
      
      if (response.data.success) {
        setResultadosBusqueda(response.data.resultados);
      } else {
        setResultadosBusqueda([]);
      }
    } catch (error) {
      console.error('Error buscando usuario:', error);
      setResultadosBusqueda([]);
    } finally {
      setBuscando(false);
    }
  };

  // Búsqueda en tiempo real con debounce
  useEffect(() => {
    // Limpiar timeout anterior
    if (busquedaTimeoutRef.current) {
      clearTimeout(busquedaTimeoutRef.current);
    }

    // Si la búsqueda tiene menos de 2 caracteres, limpiar resultados
    if (busqueda.trim().length < 2) {
      setResultadosBusqueda([]);
      return;
    }

    // Esperar 300ms después de que el usuario deje de escribir
    busquedaTimeoutRef.current = setTimeout(() => {
      buscarUsuario(busqueda);
    }, 300);

    return () => {
      if (busquedaTimeoutRef.current) {
        clearTimeout(busquedaTimeoutRef.current);
      }
    };
  }, [busqueda]);

  const cerrarPanelBusqueda = () => {
    setMostrarBusqueda(false);
    setModoBusqueda(null);
    setBusqueda('');
    setResultadosBusqueda([]);
    if (busquedaTimeoutRef.current) {
      clearTimeout(busquedaTimeoutRef.current);
    }
  };

  const togglePanelBusqueda = (modo) => {
    if (mostrarBusqueda && modoBusqueda === modo) {
      cerrarPanelBusqueda();
      return;
    }
    setModoBusqueda(modo);
    setMostrarBusqueda(true);
    setBusqueda('');
    setResultadosBusqueda([]);
  };

  const seleccionarUsuarioManual = (usuario) => {
    const aplicarOlvidoQr = modoBusqueda === 'olvido_qr' && usuario?.tipo === 'ALUMNO';
    cerrarPanelBusqueda();

    const tipoRegistro = 'ENTRADA';
    abrirModalConfirmacion({
      usuario,
      tipo_registro: tipoRegistro,
      aplicarOlvidoQr,
    });
  };

  const handleCerrarSesion = async () => {
    const result = await Swal.fire({
      title: '¿Cerrar sesión?',
      text: 'Estás seguro de que deseas cerrar sesión?',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sí, cerrar sesión',
      cancelButtonText: 'Cancelar'
    });

    if (result.isConfirmed) {
      await detenerEscaneo();
      await logout();
      navigate('/login');
    }
  };

  if (authLoading || !accesoVerificado || !docentePuedeEscanear) {
    return (
      <div className="asistencia-escaneo asistencia-escaneo--cargando">
        <div className="asistencia-escaneo-cargando-inner">
          <div className="spinner" style={{ borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#fff' }} />
          <p>{authLoading ? 'Cargando sesión…' : 'Verificando acceso…'}</p>
        </div>
      </div>
    );
  }

  const tituloEscaneo =
    user?.tipo === 'DOCENTE' ? '📱 Escanear asistencia (tutoría)' : '📱 Escáner de Asistencia';

  return (
    <div className="asistencia-escaneo">
      <AsistenciaConfirmModal
        open={!!modalConfirmacion}
        usuario={modalConfirmacion?.usuario}
        tipoRegistro={modalConfirmacion?.tipo_registro}
        aplicarOlvidoQr={!!modalConfirmacion?.aplicarOlvidoQr}
        processing={procesando}
        onCancel={() => {
          cerrarModalConfirmacion();
          if (modo === 'continuo') {
            setTimeout(() => iniciarEscaneo(), 400);
          }
        }}
        onConfirm={async (descuentos) => {
          if (!modalConfirmacion) return;
          const { usuario, tipo_registro } = modalConfirmacion;
          await registrarAsistencia(usuario.usuario_id, usuario.tipo, tipo_registro, descuentos);
        }}
      />
      {/* Header */}
      <div className="escaneo-header">
        <div className="header-left">
          <h1>{tituloEscaneo}</h1>
          {user?.tipo === 'DOCENTE' && (
            <button
              type="button"
              className="btn-volver-tutoria"
              onClick={async () => {
                await detenerEscaneo();
                navigate('/docente/tutoria');
              }}
            >
              ← Volver a Tutoría
            </button>
          )}
        </div>
        <div className="header-right">
          <button
            type="button"
            className="escaneo-toolbar-btn btn-cambiar-camara"
            onClick={() => {
              setCamaraSeleccionada(prev => prev === 'environment' ? 'user' : 'environment');
            }}
            title={camaraSeleccionada === 'environment' ? 'Cambiar a cámara frontal' : 'Cambiar a cámara trasera'}
          >
            <span className="escaneo-btn-icon" aria-hidden="true">
              {camaraSeleccionada === 'environment' ? '📷' : '🤳'}
            </span>
            <span className="escaneo-btn-label">Cámara</span>
          </button>
          <button
            type="button"
            className="escaneo-toolbar-btn btn-modo"
            onClick={() => {
              const siguiente = modo === 'continuo' ? 'manual' : 'continuo';
              setModo(siguiente);
              if (escaneando) detenerEscaneo();
            }}
            title={modo === 'continuo' ? 'Cambiar a modo manual' : 'Cambiar a modo continuo'}
          >
            <span className="escaneo-btn-icon" aria-hidden="true">
              {modo === 'continuo' ? '🔁' : '✋'}
            </span>
            <span className="escaneo-btn-label">{modo === 'continuo' ? 'Continuo' : 'Manual'}</span>
          </button>
          <button
            type="button"
            className={`escaneo-toolbar-btn btn-buscar${mostrarBusqueda && modoBusqueda === 'buscar' ? ' is-activo' : ''}`}
            onClick={() => togglePanelBusqueda('buscar')}
          >
            <span className="escaneo-btn-icon" aria-hidden="true">🔍</span>
            <span className="escaneo-btn-label">Buscar</span>
          </button>
          <button
            type="button"
            className={`escaneo-toolbar-btn btn-olvido-qr${mostrarBusqueda && modoBusqueda === 'olvido_qr' ? ' is-activo' : ''}`}
            onClick={() => togglePanelBusqueda('olvido_qr')}
          >
            <span className="escaneo-btn-icon" aria-hidden="true">📱</span>
            <span className="escaneo-btn-label">Olvidé QR</span>
          </button>
          <button
            type="button"
            className="escaneo-toolbar-btn btn-cerrar-sesion"
            onClick={handleCerrarSesion}
          >
            <span className="escaneo-btn-icon" aria-hidden="true">🚪</span>
            <span className="escaneo-btn-label">Salir</span>
          </button>
        </div>
      </div>

      {/* Búsqueda Manual */}
      {mostrarBusqueda && (
        <div className={`busqueda-manual${modoBusqueda === 'olvido_qr' ? ' busqueda-manual--olvido' : ''}`}>
          {modoBusqueda === 'olvido_qr' ? (
            <p className="busqueda-manual-aviso">
              Olvido QR: busca al alumno. Al confirmar se registra la entrada y se descuenta conducta.
            </p>
          ) : null}
          <div className="busqueda-input-container">
            <input
              type="text"
              className="busqueda-input"
              placeholder={
                modoBusqueda === 'olvido_qr'
                  ? 'Olvido QR — DNI, nombres o apellidos (mínimo 2 caracteres)'
                  : 'Buscar por DNI, nombres o apellidos... (mínimo 2 caracteres)'
              }
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              autoFocus
            />
            {buscando && (
              <div className="busqueda-loading">🔍</div>
            )}
            <button 
              className="btn-cerrar-busqueda"
              onClick={cerrarPanelBusqueda}
            >
              ✕
            </button>
          </div>
          
          {busqueda.trim().length >= 2 && (
            <div className="resultados-busqueda-container">
              {buscando ? (
                <div className="resultado-cargando">
                  <div className="spinner-pequeño"></div>
                  <span>Buscando...</span>
                </div>
              ) : (modoBusqueda === 'olvido_qr'
                ? resultadosBusqueda.filter((u) => u.tipo === 'ALUMNO')
                : resultadosBusqueda
              ).length > 0 ? (
                <div className="resultados-busqueda">
                  {(modoBusqueda === 'olvido_qr'
                    ? resultadosBusqueda.filter((u) => u.tipo === 'ALUMNO')
                    : resultadosBusqueda
                  ).map((usuario, idx) => (
                    <div 
                      key={idx}
                      className="resultado-item"
                      onClick={() => seleccionarUsuarioManual(usuario)}
                    >
                      <div className="resultado-info">
                        <strong>{usuario.nombre_completo}</strong>
                        <span className="resultado-tipo">{usuario.tipo}</span>
                      </div>
                      <div className="resultado-dni">DNI: {usuario.nro_documento || 'N/A'}</div>
                    </div>
                  ))}
                </div>
              ) : busqueda.trim().length >= 2 ? (
                <div className="resultado-vacio">
                  {modoBusqueda === 'olvido_qr'
                    ? 'No se encontraron alumnos'
                    : 'No se encontraron resultados'}
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}

      {/* Área de Escaneo */}
      <div className="escaneo-container">
        <div className="qr-reader-container">
          <div id="qr-reader" className="qr-reader"></div>
          
          {!escaneando && modo === 'manual' && (
            <div className="overlay-inactivo">
              <button 
                className="btn-iniciar-escaneo"
                onClick={iniciarEscaneo}
                disabled={procesando}
              >
                📷 Iniciar Escaneo
              </button>
            </div>
          )}

          {escaneando && (
            <div className="overlay-activo">
              <div className="indicador-escaneando">
                <div className="pulso"></div>
                <span>Escaneando...</span>
              </div>
              {modo === 'manual' && (
                <button 
                  className="btn-detener-escaneo"
                  onClick={detenerEscaneo}
                >
                  ⏹ Detener
                </button>
              )}
            </div>
          )}

          {procesando && (
            <div className="overlay-procesando">
              <div className="spinner"></div>
              <span>Procesando...</span>
            </div>
          )}
        </div>

        {/* Historial */}
        {historial.length > 0 && (
          <div className="historial-container">
            <h3>Últimos registros</h3>
            <div className="historial-lista">
              {historial.map((item) => (
                <div key={item.id} className="historial-item">
                  <span className="historial-icono">
                    {item.registro === 'ENTRADA' ? '✅' : '👋'}
                  </span>
                  <div className="historial-info">
                    <strong>{item.nombre}</strong>
                    <span>{item.tipo} - {item.hora}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default AsistenciaEscaneo;

