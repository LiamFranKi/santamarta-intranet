import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import Swal from 'sweetalert2';
import './AsistenciaEscaneo.css';

function AsistenciaEscaneo() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [modo, setModo] = useState('continuo'); // 'continuo' o 'manual'
  const [escaneando, setEscaneando] = useState(false);
  const [mostrarBusqueda, setMostrarBusqueda] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [resultadosBusqueda, setResultadosBusqueda] = useState([]);
  const [usuarioSeleccionado, setUsuarioSeleccionado] = useState(null);
  const [procesando, setProcesando] = useState(false);
  const [historial, setHistorial] = useState([]);
  const [buscando, setBuscando] = useState(false);
  
  const qrCodeRef = useRef(null);
  const html5QrCodeRef = useRef(null);
  const scannerId = useRef(null);
  const busquedaTimeoutRef = useRef(null);
  const ultimoQRProcesado = useRef(null); // Prevenir procesar el mismo QR múltiples veces
  const tiempoUltimoQR = useRef(0); // Timestamp del último QR procesado

  useEffect(() => {
    // Limpiar al desmontar
    return () => {
      detenerEscaneo();
    };
  }, []);

  // Iniciar escaneo automáticamente cuando se cambia a modo continuo
  useEffect(() => {
    if (modo === 'continuo' && !escaneando && !procesando && !mostrarBusqueda) {
      // Pequeño delay para asegurar que el DOM esté listo
      const timer = setTimeout(() => {
        iniciarEscaneo();
      }, 500);
      return () => clearTimeout(timer);
    } else if (modo === 'manual' && escaneando) {
      // Si cambia a manual y está escaneando, detener
      detenerEscaneo();
    }
  }, [modo]);

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
    // Prevenir iniciar si ya está escaneando o procesando
    if (escaneando) {
      console.log('⚠️ Ya está escaneando, ignorando inicio...');
      return;
    }
    
    if (procesando) {
      console.log('⚠️ Hay un proceso en curso, esperando...');
      return;
    }

    try {
      // Limpiar cualquier instancia anterior
      if (html5QrCodeRef.current) {
        try {
          await html5QrCodeRef.current.stop();
        } catch (e) {
          // Ignorar errores al detener instancia anterior
        }
      }
      
      const html5QrCode = new Html5Qrcode('qr-reader');
      html5QrCodeRef.current = html5QrCode;

      await html5QrCode.start(
        {
          facingMode: 'environment' // Cámara trasera
        },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 }
        },
        (decodedText) => {
          // QR escaneado exitosamente - procesar solo si no está procesando otro
          if (!procesando) {
            procesarQR(decodedText);
          }
        },
        (errorMessage) => {
          // Ignorar errores de escaneo (solo log en desarrollo)
          // No hacer nada para evitar spam de errores
        }
      );

      setEscaneando(true);
    } catch (error) {
      console.error('Error iniciando escáner:', error);
      Swal.fire({
        title: 'Error',
        text: 'No se pudo acceder a la cámara. Verifica los permisos.',
        icon: 'error'
      });
    }
  };

  const procesarQR = async (qrData) => {
    // Prevenir procesar si ya está procesando
    if (procesando) {
      console.log('⚠️ Ya hay un QR siendo procesado, ignorando...');
      return;
    }
    
    // Prevenir procesar el mismo QR múltiples veces en menos de 2 segundos
    const ahora = Date.now();
    if (ultimoQRProcesado.current === qrData && (ahora - tiempoUltimoQR.current) < 2000) {
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
      
      if (response.data.success) {
        setUsuarioSeleccionado(response.data.usuario);
        mostrarModalConfirmacion(response.data);
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
      
      // Reanudar escaneo si es modo continuo y no hay usuario seleccionado
      if (modo === 'continuo' && !usuarioSeleccionado) {
        // Esperar un poco más antes de reanudar para evitar escaneos múltiples
        setTimeout(() => {
          if (!procesando && !usuarioSeleccionado) {
            iniciarEscaneo();
          }
        }, 1500); // Aumentado a 1.5 segundos
      }
    }
  };

  const mostrarModalConfirmacion = (data) => {
    const { usuario, tipo_registro } = data;
    const tipoTexto = tipo_registro === 'ENTRADA' ? 'Entrada' : 'Salida';
    const icono = tipo_registro === 'ENTRADA' ? '✅' : '👋';
    
    Swal.fire({
      title: `${icono} ${tipoTexto}`,
      html: `
        <div style="text-align: left; margin-top: 20px;">
          <p><strong>Nombre:</strong> ${usuario.nombres} ${usuario.apellidos}</p>
          <p><strong>Tipo:</strong> ${usuario.tipo}</p>
          <p><strong>DNI:</strong> ${usuario.nro_documento || 'N/A'}</p>
        </div>
      `,
      icon: 'info',
      showCancelButton: true,
      confirmButtonText: `Registrar ${tipoTexto}`,
      cancelButtonText: 'Cancelar',
      confirmButtonColor: tipo_registro === 'ENTRADA' ? '#10b981' : '#3b82f6',
      reverseButtons: true
    }).then(async (result) => {
      if (result.isConfirmed) {
        await registrarAsistencia(usuario.usuario_id, usuario.tipo, tipo_registro);
      } else {
        setUsuarioSeleccionado(null);
        if (modo === 'continuo') {
          iniciarEscaneo();
        }
      }
    });
  };

  const registrarAsistencia = async (usuarioId, tipoUsuario, tipoRegistro) => {
    // Prevenir múltiples registros simultáneos
    if (procesando) {
      console.log('⚠️ Ya hay un registro en proceso, ignorando...');
      return;
    }
    
    try {
      setProcesando(true);
      
      console.log('📝 Registrando asistencia:', { usuarioId, tipoUsuario, tipoRegistro });
      
      const response = await api.post('/asistencia/registrar', {
        usuario_id: usuarioId,
        tipo_usuario: tipoUsuario,
        tipo_registro: tipoRegistro
      });

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

        // Limpiar estado
        setUsuarioSeleccionado(null);
        ultimoQRProcesado.current = null;
        tiempoUltimoQR.current = 0;
        
        // Reanudar escaneo si es modo continuo (con delay para evitar escaneos inmediatos)
        if (modo === 'continuo') {
          setTimeout(() => {
            if (!procesando && !usuarioSeleccionado) {
              iniciarEscaneo();
            }
          }, 1500); // Aumentado a 1.5 segundos
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
      setUsuarioSeleccionado(null);
      ultimoQRProcesado.current = null;
      tiempoUltimoQR.current = 0;
      
      // Reanudar escaneo si es modo continuo (solo si no es error de duplicado)
      if (modo === 'continuo' && !errorMessage.includes('Ya existe un registro')) {
        setTimeout(() => {
          if (!procesando && !usuarioSeleccionado) {
            iniciarEscaneo();
          }
        }, 2000); // Esperar más tiempo después de un error
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

  const seleccionarUsuarioManual = (usuario) => {
    setUsuarioSeleccionado(usuario);
    setMostrarBusqueda(false);
    setBusqueda('');
    setResultadosBusqueda([]);
    
    // Determinar tipo de registro
    const tipoRegistro = 'ENTRADA'; // Por defecto entrada, se puede mejorar
    mostrarModalConfirmacion({
      usuario,
      tipo_registro: tipoRegistro
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
      logout();
      navigate('/login');
    }
  };

  return (
    <div className="asistencia-escaneo">
      {/* Header */}
      <div className="escaneo-header">
        <div className="header-left">
          <h1>📱 Escáner de Asistencia</h1>
        </div>
        <div className="header-right">
          <select 
            className="modo-select"
            value={modo}
            onChange={(e) => {
              setModo(e.target.value);
              if (escaneando) {
                detenerEscaneo();
              }
            }}
          >
            <option value="continuo">Modo Continuo</option>
            <option value="manual">Modo Manual</option>
          </select>
          <button 
            className="btn-buscar"
            onClick={() => setMostrarBusqueda(!mostrarBusqueda)}
          >
            🔍 Buscar
          </button>
          <button 
            className="btn-cerrar-sesion"
            onClick={handleCerrarSesion}
          >
            🚪 Salir
          </button>
        </div>
      </div>

      {/* Búsqueda Manual */}
      {mostrarBusqueda && (
        <div className="busqueda-manual">
          <div className="busqueda-input-container">
            <input
              type="text"
              className="busqueda-input"
              placeholder="Buscar por DNI, nombres o apellidos... (mínimo 2 caracteres)"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              autoFocus
            />
            {buscando && (
              <div className="busqueda-loading">🔍</div>
            )}
            <button 
              className="btn-cerrar-busqueda"
              onClick={() => {
                setMostrarBusqueda(false);
                setBusqueda('');
                setResultadosBusqueda([]);
                if (busquedaTimeoutRef.current) {
                  clearTimeout(busquedaTimeoutRef.current);
                }
              }}
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
              ) : resultadosBusqueda.length > 0 ? (
                <div className="resultados-busqueda">
                  {resultadosBusqueda.map((usuario, idx) => (
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
                  No se encontraron resultados
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

