import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useExamProtection } from '../hooks/useExamProtection';
import api from '../services/api';
import Swal from 'sweetalert2';
import PreguntaAlternativas from '../components/examen/PreguntaAlternativas';
import PreguntaCompletar from '../components/examen/PreguntaCompletar';
import PreguntaVerdaderoFalso from '../components/examen/PreguntaVerdaderoFalso';
import PreguntaRespuestaCorta from '../components/examen/PreguntaRespuestaCorta';
import PreguntaOrdenar from '../components/examen/PreguntaOrdenar';
import PreguntaEmparejar from '../components/examen/PreguntaEmparejar';
import PreguntaArrastrarSoltar from '../components/examen/PreguntaArrastrarSoltar';
import './AlumnoExamen.css';
import { findAlternativaMarcadaVF } from '../utils/examenRespuestaIds';
import {
  clearDraft,
  markServerSaveAt,
  queuePendingAnswer,
  readMergedRespuestas,
  readPendingQueue,
  removePendingAnswer,
  writeDraft
} from '../utils/examenDraftLocal';
import { resolverPreguntasParaIntento } from '../utils/examenLayout';
import { normalizarRespuestaParaGuardar } from '../utils/examenRespuestaNormalizar';

function respuestaTieneValor(v) {
  if (v === null || v === undefined) return false;
  if (v === '') return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.keys(v).length > 0;
  return true;
}

/** Evita persistir claves vacías que pueden confundir resultados o informes */
function sanitizarRespuestasExamen(raw) {
  const out = {};
  for (const [k, v] of Object.entries(raw || {})) {
    if (respuestaTieneValor(v)) out[k] = v;
  }
  return out;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 409 del examen: token incorrecto o sesión en otro dispositivo (mismo código en ambos casos). */
function errorEsConflictoSesionExamen(error) {
  return error?.response?.status === 409 && error?.response?.data?.code === 'EXAM_ALREADY_IN_PROGRESS';
}

/** Fallos que suelen resolverse reintentando (internet inestable, servidor ocupado, timeout). */
function errorRedTransitoria(error) {
  if (!error) return false;
  if (error.code === 'ECONNABORTED') return true;
  if (!error.response) return true;
  const s = error.response.status;
  return s === 408 || s === 429 || s === 502 || s === 503 || s === 504;
}

function examSessionTokenStorageKey(examenId) {
  return `exam_sess_tok_v1_${examenId}`;
}

function persistExamSessionToken(examenId, token) {
  try {
    const t = String(token || '').trim();
    if (!t || !examenId) return;
    sessionStorage.setItem(examSessionTokenStorageKey(examenId), t);
  } catch (_) {
    // Ignorar (modo privado estricto, cuota, etc.)
  }
}

function readStoredExamSessionToken(examenId) {
  try {
    return String(sessionStorage.getItem(examSessionTokenStorageKey(examenId)) || '').trim();
  } catch (_) {
    return '';
  }
}

function clearStoredExamSessionToken(examenId) {
  try {
    sessionStorage.removeItem(examSessionTokenStorageKey(examenId));
  } catch (_) {
    // Ignorar
  }
}

/** Aulas WiFi: guardado frecuente; timeout alto por latencia / cola de AP */
const EXAM_AUTOSAVE_INTERVAL_MS = 12000;
const EXAM_LAYOUT_SAVE_MAX_RETRIES = 8;
const EXAM_SESSION_PING_MS = 42000;
const EXAM_HTTP_TIMEOUT_MS = 55000;

const PENDING_EXAM_SECURITY_KEY = 'pending_exam_security_events';
const EXAM_DEVICE_ID_KEY = 'exam_device_id_v1';

function getExamDeviceId() {
  try {
    const existente = localStorage.getItem(EXAM_DEVICE_ID_KEY);
    if (existente && String(existente).trim() !== '') return String(existente);
    const nuevo = `dev_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`.slice(0, 100);
    localStorage.setItem(EXAM_DEVICE_ID_KEY, nuevo);
    return nuevo;
  } catch (_) {
    return `dev_fallback_${Date.now().toString(36)}`;
  }
}

function pushPendingSecurityEvent(evento) {
  try {
    const raw = localStorage.getItem(PENDING_EXAM_SECURITY_KEY);
    const prev = raw ? JSON.parse(raw) : [];
    const next = Array.isArray(prev) ? prev : [];
    next.push(evento);
    localStorage.setItem(PENDING_EXAM_SECURITY_KEY, JSON.stringify(next.slice(-20)));
  } catch (_) {
    // Ignorar fallas de almacenamiento local
  }
}

function AlumnoExamen() {
  const { examenId } = useParams();
  const navigate = useNavigate();
  
  const [examen, setExamen] = useState(null);
  const [preguntas, setPreguntas] = useState([]);
  const [respuestas, setRespuestas] = useState({});
  const [preguntaActual, setPreguntaActual] = useState(0);
  const [tiempoRestante, setTiempoRestante] = useState(0);
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [mostrarResumen, setMostrarResumen] = useState(false);
  const [error, setError] = useState(null);
  const [renderError, setRenderError] = useState(null);
  const [esExamenPdf, setEsExamenPdf] = useState(false);
  /** Contexto compartido (caso + imagen) definido por el docente; no forma parte del sorteo de preguntas. */
  const [bloqueExamen, setBloqueExamen] = useState(null);
  /** Por defecto expandido si hay contexto: el alumno ve el caso al entrar; puede ocultar para ganar espacio. */
  const [bloqueContextoExpandido, setBloqueContextoExpandido] = useState(true);
  /** online | offline | syncing | synced | error */
  const [estadoConexion, setEstadoConexion] = useState(
    typeof navigator !== 'undefined' && navigator.onLine ? 'online' : 'offline'
  );
  
  const intervaloGuardado = useRef(null);
  const intervaloReloj = useRef(null);
  const tiempoInicio = useRef(null);
  const tiempoExpiracion = useRef(null);
  const respuestasRef = useRef({});
  const preguntasRef = useRef([]);
  const cierreForzadoPorSeguridadRef = useRef(false);
  const finalizacionEnCursoRef = useRef(false);
  const examSessionTokenRef = useRef('');
  const examDeviceIdRef = useRef(getExamDeviceId());
  const pruebaIdRef = useRef(null);

  const limpiarDatosLocalesExamen = useCallback(() => {
    clearStoredExamSessionToken(examenId);
    if (pruebaIdRef.current) {
      clearDraft(examenId, pruebaIdRef.current);
    }
  }, [examenId]);

  const getExamDeviceOnlyHeaders = useCallback(() => ({
    headers: { 'x-exam-device-id': examDeviceIdRef.current }
  }), []);

  const getExamHeaders = useCallback(() => {
    const headers = { 'x-exam-device-id': examDeviceIdRef.current };
    const token =
      String(examSessionTokenRef.current || '').trim() ||
      readStoredExamSessionToken(examenId);
    if (token) {
      headers['x-exam-session-token'] = token;
      if (!String(examSessionTokenRef.current || '').trim()) {
        examSessionTokenRef.current = token;
      }
    }
    return { headers };
  }, [examenId]);

  const aplicarTokenSesionDesdeIniciar = useCallback(
    (data) => {
      const tok = String(data?.session_token || '').trim();
      if (tok) {
        examSessionTokenRef.current = tok;
        persistExamSessionToken(examenId, tok);
      }
    },
    [examenId]
  );
  useEffect(() => {
    const syncPendientes = async () => {
      try {
        const raw = localStorage.getItem(PENDING_EXAM_SECURITY_KEY);
        const eventos = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(eventos) || eventos.length === 0) return;
        const restantes = [];
        for (const ev of eventos) {
          if (!ev || Number(ev.examenId) !== Number(examenId)) {
            restantes.push(ev);
            continue;
          }
          try {
            await api.post(
              `/alumno/examenes/${ev.examenId}/violaciones`,
              {
                tipo: ev.tipo,
                timestamp: ev.timestamp
              },
              { ...getExamHeaders(), timeout: EXAM_HTTP_TIMEOUT_MS }
            );
          } catch (_) {
            restantes.push(ev);
          }
        }
        localStorage.setItem(PENDING_EXAM_SECURITY_KEY, JSON.stringify(restantes));
      } catch (_) {
        // Ignorar si no se puede sincronizar pendientes
      }
    };
    syncPendientes();
  }, [examenId, getExamHeaders]);

  /** Serializa guardados bulk y por línea para evitar carreras y pérdida de la última marca. */
  const guardarRespuestasMutexRef = useRef(Promise.resolve());
  const guardarLineaMutexRef = useRef(Promise.resolve());
  const flushPendingSyncRef = useRef(null);
  const guardarRespuestasRef = useRef(null);
  const postFinalizarConResilienciaRef = useRef(null);

  // Función para cargar examen
  const cargarExamen = useCallback(async () => {
    try {
      console.log('📝 Iniciando carga de examen:', examenId);
      setLoading(true);
      setError(null);
      setEsExamenPdf(false);

      const examenResPrimero = await api.get(`/alumno/examenes/${examenId}`, {
        timeout: EXAM_HTTP_TIMEOUT_MS
      });
      const datosMeta = examenResPrimero.data;
      if (String(datosMeta.tipo || '').toUpperCase().trim() === 'PDF') {
        if (datosMeta.estado !== 'ACTIVO') {
          setLoading(false);
          const msg = 'Este material PDF no está disponible en este momento.';
          setError(msg);
          Swal.fire({ icon: 'info', title: 'No disponible', text: msg, confirmButtonText: 'Volver' }).then(() =>
            navigate(-1)
          );
          return;
        }
        if (!datosMeta.archivo_pdf_url) {
          setLoading(false);
          const msg = 'No hay archivo PDF configurado para este examen.';
          setError(msg);
          Swal.fire({ icon: 'error', title: 'Error', text: msg, confirmButtonText: 'Volver' }).then(() =>
            navigate(-1)
          );
          return;
        }
        setExamen(datosMeta);
        setPreguntas([]);
        setBloqueExamen(null);
        setEsExamenPdf(true);
        setLoading(false);
        return;
      }

      // Iniciar examen (crear prueba) — solo exámenes VIRTUAL u otros no-PDF
      console.log('📝 Llamando a /alumno/examenes/' + examenId + '/iniciar');
      const iniciarRes = await api.post(`/alumno/examenes/${examenId}/iniciar`, {}, {
        ...getExamHeaders(),
        timeout: EXAM_HTTP_TIMEOUT_MS
      });
      console.log('📝 Respuesta iniciar:', iniciarRes.data);
      aplicarTokenSesionDesdeIniciar(iniciarRes.data);
      const pruebaId = iniciarRes.data.prueba_id;
      pruebaIdRef.current = pruebaId;
      const fechaInicio = new Date(iniciarRes.data.fecha_inicio);
      tiempoInicio.current = fechaInicio;
      
      if (iniciarRes.data.fecha_expiracion) {
        tiempoExpiracion.current = new Date(iniciarRes.data.fecha_expiracion);
      }
      
      // Cargar datos del examen y preguntas
      console.log('📝 Cargando datos del examen y preguntas');
      const [examenRes, preguntasRes] = await Promise.all([
        Promise.resolve(examenResPrimero),
        api.get(`/alumno/examenes/${examenId}/preguntas`, { timeout: EXAM_HTTP_TIMEOUT_MS })
      ]);

      console.log('📝 Examen cargado:', examenRes.data);
      console.log('📝 Preguntas cargadas:', preguntasRes.data.preguntas?.length || 0);
      setExamen(examenRes.data);

      const bloqueRaw = preguntasRes.data.bloque;
      if (bloqueRaw && (bloqueRaw.contenido || bloqueRaw.imagen_url)) {
        setBloqueExamen({
          contenido: bloqueRaw.contenido || '',
          imagen_url: bloqueRaw.imagen_url || null
        });
      } else {
        setBloqueExamen(null);
      }

      const listaBase = preguntasRes.data.preguntas || [];
      const { preguntas: preguntasOrdenadas, layout, esReanudacion } = resolverPreguntasParaIntento({
        listaBase,
        examenMeta: examenRes.data,
        layoutServidor: iniciarRes.data.layout,
        preguntaIdsLegacy: iniciarRes.data.pregunta_ids
      });

      if (!esReanudacion && layout?.pregunta_ids?.length) {
        let layoutGuardado = false;
        for (let intento = 0; intento < EXAM_LAYOUT_SAVE_MAX_RETRIES; intento++) {
          try {
            const layoutRes = await api.post(
              `/alumno/examenes/${examenId}/guardar-preguntas`,
              { layout },
              { ...getExamHeaders(), timeout: EXAM_HTTP_TIMEOUT_MS }
            );
            if (layoutRes?.data?.success || layoutRes?.data?.already_saved) {
              layoutGuardado = true;
              break;
            }
          } catch (layoutErr) {
            if (errorRedTransitoria(layoutErr) && intento < EXAM_LAYOUT_SAVE_MAX_RETRIES - 1) {
              await sleep(500 * Math.pow(2, Math.min(intento, 4)));
              continue;
            }
            console.warn('No se pudo guardar layout del examen:', layoutErr?.message);
          }
        }
        if (!layoutGuardado) {
          setLoading(false);
          const msg =
            'No se pudo fijar el orden del examen en el servidor. Revisa tu conexión e intenta de nuevo.';
          setError(msg);
          Swal.fire({ icon: 'warning', title: 'Conexión necesaria', text: msg, confirmButtonText: 'Reintentar' }).then(
            (r) => {
              if (r.isConfirmed) cargarExamen();
              else navigate(-1);
            }
          );
          return;
        }
      }

      const respuestasServidor =
        iniciarRes.data.respuestas && typeof iniciarRes.data.respuestas === 'object'
          ? iniciarRes.data.respuestas
          : {};
      const respuestasCrudas = pruebaId
        ? readMergedRespuestas(examenId, pruebaId, respuestasServidor)
        : respuestasServidor;
      const respuestasLimpias = sanitizarRespuestasExamen(respuestasCrudas);
      setRespuestas(respuestasLimpias);
      respuestasRef.current = respuestasLimpias;
      if (pruebaId) {
        writeDraft(examenId, pruebaId, respuestasLimpias);
      }

      setPreguntas(preguntasOrdenadas);
      console.log('📝 Preguntas ordenadas:', preguntasOrdenadas.length);
      setLoading(false);
      setError(null);
    } catch (error) {
      console.error('Error cargando examen:', error);
      setLoading(false);
      const status = error?.response?.status;
      const code = error?.response?.data?.code;
      const isExamInProgress = status === 409 && code === 'EXAM_ALREADY_IN_PROGRESS';
      const msg = isExamInProgress
        ? 'El examen ya se está dando en otro dispositivo.'
        : (error.response?.data?.error || 'No se pudo cargar el examen');
      setError(msg);
      Swal.fire({
        icon: isExamInProgress ? 'warning' : 'error',
        title: isExamInProgress ? 'Examen en curso' : 'Error',
        text: msg,
        confirmButtonText: 'Volver'
      }).then(() => {
        navigate(-1);
      });
    }
  }, [examenId, navigate, getExamHeaders, aplicarTokenSesionDesdeIniciar]);

  // Cargar examen al montar
  useEffect(() => {
    if (examenId) {
      cargarExamen();
    }
    return () => {
      if (intervaloGuardado.current) clearInterval(intervaloGuardado.current);
      if (intervaloReloj.current) clearInterval(intervaloReloj.current);
    };
  }, [examenId, cargarExamen]);

  const prevMostrarResumenRef = useRef(false);
  /** Al pasar de examen → resumen, abrir de nuevo el contexto para repasar (no fuerza si ya estabas en resumen y lo ocultaste). */
  useEffect(() => {
    const entroResumen = mostrarResumen && !prevMostrarResumenRef.current;
    prevMostrarResumenRef.current = mostrarResumen;
    if (
      entroResumen &&
      bloqueExamen &&
      (bloqueExamen.contenido || bloqueExamen.imagen_url)
    ) {
      setBloqueContextoExpandido(true);
    }
  }, [mostrarResumen, bloqueExamen]);

  // Protección de examen
  const handleViolation = useCallback((violation) => {
    if (cierreForzadoPorSeguridadRef.current) return;

    /** Internet caído: solo aviso + respaldo local; nunca llamar al servidor para cerrar. */
    if (violation?.type === 'INTERNET_LOSS') {
      setEstadoConexion('offline');
      Swal.fire({
        icon: 'warning',
        title: 'Sin conexión',
        html: `
          <div style="text-align:left;">
            <p>Se detectó pérdida de internet.</p>
            <p><strong>El examen sigue activo.</strong> Tus respuestas se guardan en esta pantalla y se enviarán al reconectar.</p>
          </div>
        `,
        timer: 4500,
        showConfirmButton: false,
        toast: true,
        position: 'top-end'
      });
      (async () => {
        try {
          await flushPendingSyncRef.current?.();
          await guardarRespuestasRef.current?.({ exigirExito: false });
        } catch (_) {
          // offline: respuestas quedan en borrador local
        }
      })();
      return;
    }

    const registrarViolacion = () => api
      .post(
        `/alumno/examenes/${examenId}/violaciones`,
        {
          tipo: violation.type,
          timestamp: violation.timestamp
        },
        { ...getExamHeaders(), timeout: EXAM_HTTP_TIMEOUT_MS }
      )
      .then((response) => {
      const data = response?.data || {};
      if (data.action === 'AUTO_FINALIZED' && data.closes_exam !== false) {
        const motivo = data.reason || 'SALIDA_DE_PANTALLA';
        const esFoco = motivo === 'FUERA_DE_FOCO';
        const titulo = esFoco ? 'Examen cerrado por seguridad' : 'Examen cerrado por seguridad';
        const mensaje = esFoco
          ? 'Se cerró por salir de la pantalla del examen varias veces.'
          : 'Se cerró por incumplir las reglas de seguridad del examen.';
        cierreForzadoPorSeguridadRef.current = true;
        void postFinalizarConResilienciaRef.current?.().catch(() => {});
        Swal.fire({
          icon: 'error',
          title: titulo,
          html: `
            <div style="text-align:left;">
              <p>${mensaje}</p>
              <p><strong>El examen fue finalizado automáticamente y este intento quedó cerrado.</strong></p>
            </div>
          `,
          confirmButtonText: 'Entendido'
        }).then(() => navigate(-1));
        return;
      }

      // Solo mostrar advertencia cuando backend la devuelve explícitamente
      if (data.action === 'WARNING' && !data.internet_only) {
        Swal.fire({
          icon: 'warning',
          title: '⚠️ Advertencia de seguridad',
          html: `
            <div style="text-align:left;">
              <p>Saliste de la ventana o pantalla del examen.</p>
              <p><strong>Si se repite varias veces, el examen se cerrará automáticamente.</strong> La pérdida de internet no cierra el examen.</p>
            </div>
          `,
          timer: 4000,
          showConfirmButton: false,
          toast: true,
          position: 'top-end'
        });
      }
    }).catch(() => {
      // Sin conexión: no encolar cierre; el borrador local protege las respuestas.
    });

    (async () => {
      try {
        await flushPendingSyncRef.current?.();
        await guardarRespuestasRef.current?.({ exigirExito: false });
      } catch (_) {
        // seguir con registro de violación
      }
      registrarViolacion();
    })();
  }, [examenId, navigate, getExamHeaders]);

  // Protección de examen (siempre activa, pero solo funciona cuando hay examen)
  // El hook debe estar siempre presente, pero el callback verifica si hay examen
  const safeHandleViolation = useCallback((violation) => {
    if (examen && !loading) {
      handleViolation(violation);
    }
  }, [examen, loading, handleViolation]);

  const proteccionActiva =
    !esExamenPdf && !!examen && !loading && Array.isArray(preguntas) && preguntas.length > 0;
  useExamProtection(safeHandleViolation, false, proteccionActiva);

  /**
   * POST respuestas con reintentos por red y recuperación de token vía /iniciar
   * (el backend no exige token en iniciar para reanudar; devuelve el token vigente).
   */
  const postRespuestasConResiliencia = useCallback(
    async (limpio) => {
      const postOnce = () =>
        api.post(
          `/alumno/examenes/${examenId}/respuestas`,
          { respuestas: limpio },
          { ...getExamHeaders(), timeout: EXAM_HTTP_TIMEOUT_MS }
        );

      let recuperoSesion = false;
      for (let intento = 0; intento < 8; intento++) {
        try {
          await postOnce();
          return;
        } catch (error) {
          if (errorEsConflictoSesionExamen(error) && !recuperoSesion) {
            recuperoSesion = true;
            const res = await api.post(
              `/alumno/examenes/${examenId}/iniciar`,
              {},
              { ...getExamDeviceOnlyHeaders(), timeout: EXAM_HTTP_TIMEOUT_MS }
            );
            aplicarTokenSesionDesdeIniciar(res.data);
            continue;
          }
          if (errorEsConflictoSesionExamen(error) && recuperoSesion) {
            throw error;
          }
          if (errorRedTransitoria(error) && intento < 7) {
            await sleep(450 * Math.pow(2, Math.min(intento, 4)));
            continue;
          }
          throw error;
        }
      }
    },
    [examenId, getExamHeaders, getExamDeviceOnlyHeaders, aplicarTokenSesionDesdeIniciar]
  );

  const postLineaConResiliencia = useCallback(
    async (preguntaId, respuesta, tipoPregunta) => {
      const respuestaNorm = normalizarRespuestaParaGuardar(respuesta, tipoPregunta);

      const ejecutar = async () => {
        const postOnce = () =>
          api.post(
            `/alumno/examenes/${examenId}/respuesta-linea`,
            { pregunta_id: preguntaId, respuesta: respuestaNorm },
            { ...getExamHeaders(), timeout: EXAM_HTTP_TIMEOUT_MS }
          );

        let recuperoSesion = false;
        for (let intento = 0; intento < 8; intento++) {
          try {
            const res = await postOnce();
            if (res?.data?.already_finalized) {
              return { res, guardado: false };
            }
            return { res, guardado: true };
          } catch (error) {
            if (errorEsConflictoSesionExamen(error) && !recuperoSesion) {
              recuperoSesion = true;
              const res = await api.post(
                `/alumno/examenes/${examenId}/iniciar`,
                {},
                { ...getExamDeviceOnlyHeaders(), timeout: EXAM_HTTP_TIMEOUT_MS }
              );
              aplicarTokenSesionDesdeIniciar(res.data);
              if (res.data?.prueba_id) pruebaIdRef.current = res.data.prueba_id;
              continue;
            }
            if (errorEsConflictoSesionExamen(error) && recuperoSesion) {
              throw error;
            }
            if (errorRedTransitoria(error) && intento < 7) {
              await sleep(450 * Math.pow(2, Math.min(intento, 4)));
              continue;
            }
            throw error;
          }
        }
        return { res: null, guardado: false };
      };

      const encadenado = guardarLineaMutexRef.current.then(ejecutar, ejecutar);
      guardarLineaMutexRef.current = encadenado.catch(() => {});
      return encadenado;
    },
    [examenId, getExamHeaders, getExamDeviceOnlyHeaders, aplicarTokenSesionDesdeIniciar]
  );

  const flushPendingSync = useCallback(async () => {
    const pruebaId = pruebaIdRef.current;
    if (!pruebaId || !examenId) return true;
    const pendientes = readPendingQueue(examenId, pruebaId);
    if (!pendientes.length) return true;

    setEstadoConexion('syncing');
    for (const item of pendientes) {
      try {
        const tipo =
          preguntasRef.current?.find((p) => Number(p.id) === Number(item.pregunta_id))?.tipo || '';
        const { guardado } = await postLineaConResiliencia(item.pregunta_id, item.respuesta, tipo);
        if (guardado) {
          removePendingAnswer(examenId, pruebaId, item.pregunta_id);
        }
      } catch (_) {
        setEstadoConexion(navigator.onLine ? 'error' : 'offline');
        return false;
      }
    }
    markServerSaveAt(examenId, pruebaId);
    setEstadoConexion(navigator.onLine ? 'synced' : 'online');
    return true;
  }, [examenId, postLineaConResiliencia]);

  const postFinalizarConResiliencia = useCallback(async () => {
    const finOnce = () =>
      api.post(`/alumno/examenes/${examenId}/finalizar`, {}, {
        ...getExamHeaders(),
        timeout: EXAM_HTTP_TIMEOUT_MS
      });

    let recuperoSesion = false;
    for (let intento = 0; intento < 8; intento++) {
      try {
        const res = await finOnce();
        return res;
      } catch (error) {
        if (errorEsConflictoSesionExamen(error) && !recuperoSesion) {
          recuperoSesion = true;
          const res = await api.post(
            `/alumno/examenes/${examenId}/iniciar`,
            {},
            { ...getExamDeviceOnlyHeaders(), timeout: EXAM_HTTP_TIMEOUT_MS }
          );
          aplicarTokenSesionDesdeIniciar(res.data);
          continue;
        }
        if (errorEsConflictoSesionExamen(error) && recuperoSesion) {
          throw error;
        }
        if (errorRedTransitoria(error) && intento < 7) {
          await sleep(450 * Math.pow(2, Math.min(intento, 4)));
          continue;
        }
        throw error;
      }
    }
    throw new Error('No se pudo finalizar el examen tras varios intentos');
  }, [examenId, getExamHeaders, getExamDeviceOnlyHeaders, aplicarTokenSesionDesdeIniciar]);

  // Función para guardar respuestas (debe estar antes de las funciones que la usan)
  const guardarRespuestas = useCallback(
    (opciones = {}) => {
      const exigirExito = opciones.exigirExito === true;
      const ejecutar = async () => {
        setGuardando(true);
        try {
          const limpio = sanitizarRespuestasExamen(respuestasRef.current);
          await postRespuestasConResiliencia(limpio);
          const actual = sanitizarRespuestasExamen(respuestasRef.current);
          setRespuestas(actual);
          respuestasRef.current = actual;
          if (pruebaIdRef.current) {
            writeDraft(examenId, pruebaIdRef.current, actual);
            markServerSaveAt(examenId, pruebaIdRef.current);
            setEstadoConexion(navigator.onLine ? 'synced' : 'offline');
          }
        } catch (error) {
          console.error('Error guardando respuestas:', error);
          if (exigirExito) throw error;
        } finally {
          setGuardando(false);
        }
      };
      const encadenado = guardarRespuestasMutexRef.current.then(ejecutar, ejecutar);
      guardarRespuestasMutexRef.current = encadenado.catch(() => {});
      return encadenado;
    },
    [postRespuestasConResiliencia, examenId]
  );

  /** Tras una operación crítica, segunda pasada para cubrir cambios al `ref` durante el POST anterior. */
  const persistirRespuestasParaFinalizar = useCallback(async () => {
    await flushPendingSync();
    await guardarRespuestas({ exigirExito: true });
    await guardarRespuestas({ exigirExito: true });
  }, [guardarRespuestas, flushPendingSync]);

  useEffect(() => {
    flushPendingSyncRef.current = flushPendingSync;
    guardarRespuestasRef.current = guardarRespuestas;
    postFinalizarConResilienciaRef.current = postFinalizarConResiliencia;
  }, [flushPendingSync, guardarRespuestas, postFinalizarConResiliencia]);

  // Función para finalizar examen automáticamente
  const finalizarExamenAutomatico = useCallback(async () => {
    if (finalizacionEnCursoRef.current) return;
    finalizacionEnCursoRef.current = true;
    if (intervaloReloj.current) clearInterval(intervaloReloj.current);
    if (intervaloGuardado.current) clearInterval(intervaloGuardado.current);

    let persistido = false;
    while (!persistido) {
      for (let ola = 0; ola < 20; ola++) {
        try {
          await persistirRespuestasParaFinalizar();
          persistido = true;
          break;
        } catch {
          await sleep(1000);
        }
      }
      if (persistido) break;
      await Swal.fire({
        icon: 'warning',
        title: 'Sin conexión',
        html:
          '<p>Se acabó el tiempo y <strong>no pudimos guardar</strong> tus respuestas en el servidor.</p><p>No cierres esta ventana. Recupera internet y pulsa <strong>Reintentar</strong>.</p>',
        confirmButtonText: 'Reintentar',
        allowOutsideClick: false
      });
    }

    try {
      await postFinalizarConResiliencia();
      limpiarDatosLocalesExamen();

      Swal.fire({
        icon: 'info',
        title: 'Tiempo agotado',
        text: 'El examen se ha finalizado automáticamente. Podrás ver tus resultados cuando el docente los publique.',
        confirmButtonText: 'Entendido'
      }).then(() => {
        navigate(-1);
      });
    } catch (error) {
      console.error('Error finalizando examen:', error);
      const status = error?.response?.status;
      const code = error?.response?.data?.code;
      if (status === 409 && code === 'EXAM_ALREADY_IN_PROGRESS') {
        Swal.fire({
          icon: 'warning',
          title: 'Examen en curso',
          text: 'El examen ya se está dando en otro dispositivo.',
          confirmButtonText: 'Entendido'
        }).then(() => navigate(-1));
        return;
      }
      if (status === 404) {
        Swal.fire({
          icon: 'info',
          title: 'Examen ya cerrado',
          text: 'Este intento ya no está activo. Tus respuestas guardadas fueron conservadas.',
          confirmButtonText: 'Entendido'
        }).then(() => navigate(-1));
        return;
      }
      Swal.fire({
        icon: 'error',
        title: 'Error al cerrar',
        text: error?.response?.data?.error || 'No se pudo finalizar. Si el problema continúa, avisa al docente.',
        confirmButtonText: 'Entendido'
      }).then(() => navigate(-1));
    } finally {
      finalizacionEnCursoRef.current = false;
    }
  }, [examenId, navigate, persistirRespuestasParaFinalizar, postFinalizarConResiliencia]);

  // Temporizador
  useEffect(() => {
    if (
      !esExamenPdf &&
      examen &&
      examen.tiempo > 0 &&
      (tiempoInicio.current || tiempoExpiracion.current)
    ) {
      const calcularTiempoRestante = () => {
        const ahora = new Date();
        let tiempoLimite;
        
        if (tiempoExpiracion.current) {
          tiempoLimite = tiempoExpiracion.current;
        } else if (tiempoInicio.current) {
          tiempoLimite = new Date(tiempoInicio.current.getTime() + (examen.tiempo * 60 * 1000));
        } else {
          return;
        }
        
        const diferencia = Math.max(0, Math.floor((tiempoLimite - ahora) / 1000));
        setTiempoRestante(diferencia);
        
        if (diferencia <= 0) {
          finalizarExamenAutomatico();
        }
      };

      calcularTiempoRestante();
      
      intervaloReloj.current = setInterval(calcularTiempoRestante, 1000);

      return () => {
        if (intervaloReloj.current) {
          clearInterval(intervaloReloj.current);
        }
      };
    }
  }, [examen, esExamenPdf, finalizarExamenAutomatico]);

  // Alertas de tiempo
  useEffect(() => {
    if (!esExamenPdf && examen && examen.tiempo > 0 && tiempoRestante > 0) {
      // Alerta cuando quedan 5 minutos
      if (tiempoRestante === 300) {
        Swal.fire({
          icon: 'warning',
          title: '⏰ 5 minutos restantes',
          text: 'Te quedan 5 minutos para finalizar el examen',
          timer: 5000,
          showConfirmButton: false
        });
      }

      // Alerta cuando quedan 1 minuto
      if (tiempoRestante === 60) {
        Swal.fire({
          icon: 'error',
          title: '⏰ 1 minuto restante',
          text: '¡Apúrate! Te queda 1 minuto',
          timer: 3000,
          showConfirmButton: false
        });
      }
    }
  }, [tiempoRestante, examen, esExamenPdf]);

  // Actualizar refs cuando cambian respuestas / preguntas
  useEffect(() => {
    respuestasRef.current = respuestas;
  }, [respuestas]);

  useEffect(() => {
    preguntasRef.current = preguntas;
  }, [preguntas]);

  /** Autosave más seguido en WiFi congestionado */
  useEffect(() => {
    if (!examen || esExamenPdf) {
      return undefined;
    }
    intervaloGuardado.current = setInterval(() => {
      guardarRespuestas();
    }, EXAM_AUTOSAVE_INTERVAL_MS);

    return () => {
      if (intervaloGuardado.current) {
        clearInterval(intervaloGuardado.current);
      }
    };
  }, [guardarRespuestas, examen, esExamenPdf]);

  /** Mantiene viva la sesión en servidor con poco peso entre autosaves largos */
  useEffect(() => {
    if (!examen || esExamenPdf) return undefined;
    const ping = () => {
      api
        .post(`/alumno/examenes/${examenId}/sesion-ping`, {}, { ...getExamHeaders(), timeout: 18000 })
        .catch(() => {});
    };
    const id = window.setInterval(ping, EXAM_SESSION_PING_MS);
    return () => clearInterval(id);
  }, [examen, esExamenPdf, examenId, getExamHeaders]);

  // Tras recuperar internet, sincronizar cola local y respaldo bulk
  useEffect(() => {
    if (!examen || esExamenPdf) return undefined;
    let timeoutId;
    const onOnline = () => {
      setEstadoConexion('online');
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        flushPendingSync().then((ok) => {
          if (ok) guardarRespuestas();
        });
      }, 400);
    };
    const onOffline = () => {
      setEstadoConexion('offline');
      Swal.fire({
        icon: 'info',
        title: 'Sin internet',
        text: 'El examen sigue activo. Tus respuestas se guardan en esta pantalla.',
        timer: 3500,
        showConfirmButton: false,
        toast: true,
        position: 'top-end'
      });
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      clearTimeout(timeoutId);
    };
  }, [examen, esExamenPdf, guardarRespuestas, flushPendingSync]);

  useEffect(() => {
    if (!loading && examen && !esExamenPdf && pruebaIdRef.current) {
      flushPendingSync().catch(() => {});
    }
  }, [loading, examen, esExamenPdf, flushPendingSync]);

  useEffect(() => {
    if (estadoConexion !== 'synced') return undefined;
    const t = setTimeout(() => setEstadoConexion(navigator.onLine ? 'online' : 'offline'), 3500);
    return () => clearTimeout(t);
  }, [estadoConexion]);

  /** Último intento de sincronizar al cerrar pestaña / suspender (WiFi inestable). */
  useEffect(() => {
    if (!examen || esExamenPdf) return undefined;

    const flushKeepalive = () => {
      const pruebaId = pruebaIdRef.current;
      if (!pruebaId) return;
      const limpio = sanitizarRespuestasExamen(respuestasRef.current);
      const base = api.defaults.baseURL || '';
      const url = `${base.replace(/\/$/, '')}/alumno/examenes/${examenId}/respuestas`;
      const headers = getExamHeaders().headers || {};
      const token = localStorage.getItem('token');
      if (token) headers.Authorization = `Bearer ${token}`;
      try {
        fetch(url, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ respuestas: limpio }),
          keepalive: true
        }).catch(() => {});
      } catch (_) {
        // ignorar
      }
    };

    const onPageHide = () => flushKeepalive();
    window.addEventListener('pagehide', onPageHide);
    return () => window.removeEventListener('pagehide', onPageHide);
  }, [examen, esExamenPdf, examenId, getExamHeaders]);

  const handleFinalizarExamen = async () => {
    const result = await Swal.fire({
      title: 'Revisa bien tus respuestas antes de terminar',
      text: 'Puedes volver al examen para revisar o terminar ahora.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Terminar',
      cancelButtonText: 'Revisar',
      reverseButtons: true
    });
    if (result.isConfirmed) {
      await handleConfirmarFinalizar();
    }
  };

  const handleConfirmarFinalizar = async () => {
    if (finalizacionEnCursoRef.current) return;
    finalizacionEnCursoRef.current = true;
    setMostrarResumen(false);
    if (intervaloReloj.current) clearInterval(intervaloReloj.current);
    if (intervaloGuardado.current) clearInterval(intervaloGuardado.current);

    for (;;) {
      try {
        await persistirRespuestasParaFinalizar();
        break;
      } catch {
        const r = await Swal.fire({
          icon: 'warning',
          title: 'No se pudo guardar en el servidor',
          html:
            '<p>Revisa tu conexión a internet. <strong>Tus respuestas siguen en esta pantalla.</strong></p><p>Sin guardar no podemos enviar el examen correctamente.</p>',
          confirmButtonText: 'Reintentar',
          showCancelButton: true,
          cancelButtonText: 'Volver al examen'
        });
        if (!r.isConfirmed) {
          finalizacionEnCursoRef.current = false;
          return;
        }
      }
    }

    try {
      const response = await postFinalizarConResiliencia();
      limpiarDatosLocalesExamen();
      const yaFinalizado = Boolean(response?.data?.already_finalized);

      Swal.fire({
        icon: yaFinalizado ? 'info' : 'success',
        title: yaFinalizado ? 'Examen ya finalizado' : 'Examen finalizado',
        text: yaFinalizado
          ? 'Tu examen ya había sido cerrado previamente. Tus respuestas guardadas se mantuvieron.'
          : 'Tu examen ha sido enviado correctamente. Las respuestas fueron enviadas a tu correo interno.',
        confirmButtonText: 'Entendido'
      }).then(() => {
        navigate(-1);
      });
    } catch (error) {
      console.error('Error finalizando examen:', error);
      const status = error?.response?.status;
      const code = error?.response?.data?.code;
      if (status === 409 && code === 'EXAM_ALREADY_IN_PROGRESS') {
        Swal.fire({
          icon: 'warning',
          title: 'Examen en curso',
          text: 'El examen ya se está dando en otro dispositivo.',
          confirmButtonText: 'Entendido'
        }).then(() => navigate(-1));
        return;
      }
      if (status === 404) {
        Swal.fire({
          icon: 'info',
          title: 'Examen ya cerrado',
          text: 'Este intento ya no está activo. Se conservaron tus respuestas registradas.',
          confirmButtonText: 'Entendido'
        }).then(() => navigate(-1));
        return;
      }
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: error?.response?.data?.error || 'No se pudo finalizar el examen'
      });
    } finally {
      finalizacionEnCursoRef.current = false;
    }
  };

  const handleCancelarFinalizar = () => {
    setMostrarResumen(false);
  };

  const formatearTiempo = (segundos) => {
    const horas = Math.floor(segundos / 3600);
    const minutos = Math.floor((segundos % 3600) / 60);
    const segs = segundos % 60;
    
    if (horas > 0) {
      return `${horas}:${minutos.toString().padStart(2, '0')}:${segs.toString().padStart(2, '0')}`;
    }
    return `${minutos}:${segs.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="examen-loading" style={{ 
        minHeight: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 50%, #f0fdf4 100%)'
      }}>
        <div className="loading-spinner" style={{ fontSize: '1.5rem', color: '#3b82f6' }}>
          Cargando examen...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="examen-error" style={{ 
        minHeight: '100vh', 
        display: 'flex', 
        flexDirection: 'column',
        alignItems: 'center', 
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 50%, #f0fdf4 100%)',
        gap: '1rem',
        padding: '2rem'
      }}>
        <h2 style={{ color: '#ef4444', margin: 0 }}>❌ Error</h2>
        <p style={{ color: '#6b7280', fontSize: '1.1rem' }}>{error}</p>
        <button 
          onClick={() => navigate(-1)}
          style={{
            padding: '0.75rem 2rem',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '1rem',
            fontWeight: '600',
            cursor: 'pointer'
          }}
        >
          Volver
        </button>
      </div>
    );
  }

  if (esExamenPdf && examen?.archivo_pdf_url) {
    return (
      <div
        className="examen-pdf-material"
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 50%, #f0fdf4 100%)'
        }}
      >
        <div
          style={{
            padding: '1rem 1.25rem',
            borderBottom: '1px solid #e5e7eb',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.75rem',
            background: 'rgba(255,255,255,0.95)'
          }}
        >
          <h1 style={{ margin: 0, fontSize: '1.125rem', color: '#1f2937' }}>{examen.titulo}</h1>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <a
              href={examen.archivo_pdf_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                padding: '0.5rem 1rem',
                background: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)',
                color: 'white',
                borderRadius: '8px',
                fontSize: '0.875rem',
                fontWeight: '600',
                textDecoration: 'none'
              }}
            >
              Abrir PDF en nueva pestaña
            </a>
            <button
              type="button"
              onClick={() => navigate(-1)}
              style={{
                padding: '0.5rem 1rem',
                background: '#f3f4f6',
                color: '#374151',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '0.875rem',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              Volver al aula
            </button>
          </div>
        </div>
        <iframe
          title={examen.titulo || 'PDF'}
          src={examen.archivo_pdf_url}
          style={{ flex: 1, width: '100%', minHeight: '70vh', border: 'none' }}
        />
      </div>
    );
  }

  if (!examen || preguntas.length === 0) {
    return (
      <div className="examen-error" style={{ 
        minHeight: '100vh', 
        display: 'flex', 
        flexDirection: 'column',
        alignItems: 'center', 
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 50%, #f0fdf4 100%)',
        gap: '1rem',
        padding: '2rem'
      }}>
        <h2 style={{ color: '#6b7280', margin: 0 }}>⚠️ No hay preguntas</h2>
        <p style={{ color: '#6b7280', fontSize: '1.1rem' }}>Este examen no tiene preguntas disponibles.</p>
        <button 
          onClick={() => navigate(-1)}
          style={{
            padding: '0.75rem 2rem',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '1rem',
            fontWeight: '600',
            cursor: 'pointer'
          }}
        >
          Volver
        </button>
      </div>
    );
  }

  // Verificar que tenemos datos válidos antes de renderizar
  if (!preguntas || preguntas.length === 0) {
    console.error('❌ No hay preguntas para renderizar');
    return (
      <div className="examen-error" style={{ 
        minHeight: '100vh', 
        display: 'flex', 
        flexDirection: 'column',
        alignItems: 'center', 
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 50%, #f0fdf4 100%)',
        gap: '1rem',
        padding: '2rem'
      }}>
        <h2 style={{ color: '#6b7280', margin: 0 }}>⚠️ No hay preguntas</h2>
        <p style={{ color: '#6b7280', fontSize: '1.1rem' }}>Este examen no tiene preguntas disponibles.</p>
        <button 
          onClick={() => navigate(-1)}
          style={{
            padding: '0.75rem 2rem',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '1rem',
            fontWeight: '600',
            cursor: 'pointer'
          }}
        >
          Volver
        </button>
      </div>
    );
  }

  const pregunta = preguntas[preguntaActual];
  if (!pregunta) {
    console.error('❌ Pregunta actual no existe:', preguntaActual, 'de', preguntas.length);
    return (
      <div className="examen-error" style={{ 
        minHeight: '100vh', 
        display: 'flex', 
        flexDirection: 'column',
        alignItems: 'center', 
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 50%, #f0fdf4 100%)',
        gap: '1rem',
        padding: '2rem'
      }}>
        <h2 style={{ color: '#ef4444', margin: 0 }}>❌ Error</h2>
        <p style={{ color: '#6b7280', fontSize: '1.1rem' }}>Error al cargar la pregunta actual.</p>
        <button 
          onClick={() => navigate(-1)}
          style={{
            padding: '0.75rem 2rem',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '1rem',
            fontWeight: '600',
            cursor: 'pointer'
          }}
        >
          Volver
        </button>
      </div>
    );
  }

  const totalPreguntas = preguntas.length;
  const progreso = ((preguntaActual + 1) / totalPreguntas) * 100;
  const porcentajeRestante = examen.tiempo > 0 
    ? (tiempoRestante / (examen.tiempo * 60)) * 100 
    : 100;
  const colorTimer = tiempoRestante <= 60 ? '#ef4444' : tiempoRestante <= 300 ? '#f59e0b' : '#10b981';

  // Log solo en desarrollo y solo una vez por cambio de pregunta
  if (process.env.NODE_ENV === 'development') {
    console.log('✅ Renderizando examen:', {
      examenId,
      totalPreguntas,
      preguntaActual,
      preguntaId: pregunta.id,
      preguntaTipo: pregunta.tipo
    });
  }

  // Función para formatear la respuesta según el tipo de pregunta
  const formatearRespuesta = (pregunta, respuesta) => {
    // Verificar si hay respuesta (incluyendo strings no vacíos y arrays/objetos)
    const tieneRespuesta = respuesta !== null && 
                          respuesta !== undefined && 
                          respuesta !== '' &&
                          !(typeof respuesta === 'object' && Object.keys(respuesta).length === 0) &&
                          !(Array.isArray(respuesta) && respuesta.length === 0);
    
    if (!tieneRespuesta) return null; // Retornar null para indicar que no hay respuesta
    
    switch (pregunta.tipo) {
      case 'ALTERNATIVAS': {
        const alternativa = findAlternativaMarcadaVF(pregunta.alternativas, respuesta);
        return alternativa ? { html: alternativa.descripcion, tipo: 'html' } : null;
      }

      case 'VERDADERO_FALSO': {
        const alternativa = findAlternativaMarcadaVF(pregunta.alternativas, respuesta);
        if (alternativa) {
          const desc = alternativa.descripcion
            ? alternativa.descripcion.replace(/<[^>]*>/g, '').trim().toLowerCase()
            : '';
          if (desc.includes('verdadero')) {
            return { html: 'Verdadero', tipo: 'text' };
          }
          if (desc.includes('falso')) {
            return { html: 'Falso', tipo: 'text' };
          }
          return { html: alternativa.descripcion || 'Sin descripción', tipo: 'html' };
        }
        return null;
      }
      
      case 'ORDENAR':
        if (Array.isArray(respuesta) && respuesta.length > 0) {
          const ordenadas = respuesta
            .map(id => pregunta.alternativas?.find(alt => alt.id === id))
            .filter(Boolean);
          const texto = ordenadas.map((alt, idx) => `${idx + 1}. ${alt.descripcion}`).join(' | ');
          return { html: texto, tipo: 'html' };
        }
        return null;
      
      case 'COMPLETAR':
        if (typeof respuesta === 'object' && Object.keys(respuesta).length > 0) {
          // Solo mostrar las respuestas completadas, no toda la pregunta
          const respuestasCompletadas = Object.entries(respuesta)
            .map(([index, valor]) => {
              const num = parseInt(index) + 1;
              return `<span style="background: #e0f2fe; padding: 0.25rem 0.5rem; border-radius: 4px; margin: 0.25rem; display: inline-block; border: 1px solid #0ea5e9;">${num}. ${valor || '___'}</span>`;
            })
            .join('');
          return { html: respuestasCompletadas, tipo: 'html' };
        }
        return null;
      
      case 'RESPUESTA_CORTA':
        return respuesta ? { html: respuesta, tipo: 'text' } : null;
      
      case 'EMPAREJAR':
        if (typeof respuesta === 'object' && Object.keys(respuesta).length > 0) {
          const pares = Object.entries(respuesta).map(([idOrigen, idDestino]) => {
            const origen = pregunta.alternativas?.find(alt => alt.id === parseInt(idOrigen));
            const destino = pregunta.alternativas?.find(alt => alt.id === parseInt(idDestino));
            const origenText = origen?.descripcion?.replace(/<[^>]*>/g, '') || '?';
            const destinoText = destino?.descripcion?.replace(/<[^>]*>/g, '') || '?';
            return `<div style="background: #f0f9ff; padding: 0.5rem; margin: 0.25rem 0; border-radius: 6px; border-left: 3px solid #3b82f6; display: flex; align-items: center; gap: 0.5rem;"><span style="font-weight: 600; color: #1e40af;">${origenText}</span><span style="color: #3b82f6; font-size: 1.2rem;">→</span><span style="color: #059669;">${destinoText}</span></div>`;
          }).join('');
          return { html: pares, tipo: 'html' };
        }
        return null;
      
      case 'ARRASTRAR_Y_SOLTAR':
        if (typeof respuesta === 'object' && Object.keys(respuesta).length > 0) {
          const zonas = Object.entries(respuesta).map(([altId, valor]) => {
            const alt = pregunta.alternativas?.find(a => a.id === parseInt(altId));
            const altText = alt?.descripcion?.replace(/<[^>]*>/g, '') || '?';
            // La respuesta puede ser { zona: "Zona1" } o directamente "Zona1"
            const zonaNombre = typeof valor === 'object' && valor.zona ? valor.zona : valor;
            return `<div style="background: #fef3c7; padding: 0.5rem; margin: 0.25rem 0; border-radius: 6px; border-left: 3px solid #f59e0b; display: flex; align-items: center; gap: 0.5rem;"><span style="background: #fbbf24; color: white; padding: 0.25rem 0.5rem; border-radius: 4px; font-weight: 600; font-size: 0.85rem;">Zona ${zonaNombre}</span><span style="color: #92400e;">${altText}</span></div>`;
          }).join('');
          return { html: zonas, tipo: 'html' };
        }
        return null;
      
      default:
        return respuesta ? { html: String(respuesta), tipo: 'text' } : null;
    }
  };

  if (mostrarResumen) {
    return (
      <div className="examen-resumen-container">
        <div className="examen-resumen-card">
          <h2>📋 Resumen del Examen</h2>
          {bloqueExamen && (bloqueExamen.contenido || bloqueExamen.imagen_url) && (
            <div
              className={`examen-bloque-contexto examen-bloque-contexto--resumen examen-bloque-alumno-acc${
                bloqueContextoExpandido ? ' examen-bloque-alumno-acc--abierto' : ''
              }`}
            >
              <button
                type="button"
                className="examen-bloque-alumno-acc__bar"
                onClick={() => setBloqueContextoExpandido((v) => !v)}
                aria-expanded={bloqueContextoExpandido}
              >
                <span className="examen-bloque-alumno-acc__bar-title">📎 Contexto del examen</span>
                <span className="examen-bloque-alumno-acc__bar-action">
                  {bloqueContextoExpandido ? 'Ocultar' : 'Ver contexto'}
                </span>
              </button>
              {bloqueContextoExpandido && (
                <div className="examen-bloque-alumno-acc__body">
                  {bloqueExamen.imagen_url ? (
                    <img
                      src={bloqueExamen.imagen_url}
                      alt="Contexto"
                      className="examen-bloque-alumno-acc__img"
                    />
                  ) : null}
                  {bloqueExamen.contenido ? (
                    <div className="examen-bloque-html" dangerouslySetInnerHTML={{ __html: bloqueExamen.contenido }} />
                  ) : null}
                </div>
              )}
            </div>
          )}
          <div className="resumen-preguntas">
            {preguntas.map((p, index) => {
              const respuesta = respuestas[p.id];
              // Verificar si hay respuesta (incluyendo strings no vacíos y arrays/objetos)
              const tieneRespuesta = respuesta !== null && 
                                    respuesta !== undefined && 
                                    respuesta !== '' &&
                                    !(typeof respuesta === 'object' && Object.keys(respuesta).length === 0) &&
                                    !(Array.isArray(respuesta) && respuesta.length === 0);
              const respuestaFormateada = formatearRespuesta(p, respuesta);
              
              // Para COMPLETAR, limpiar la descripción removiendo los placeholders [[...]]
              let descripcionLimpia = p.descripcion || 'Pregunta sin título';
              if (p.tipo === 'COMPLETAR') {
                descripcionLimpia = descripcionLimpia.replace(/\[\[.*?\]\]/g, '[...]');
              }
              
              return (
                <div key={p.id} className={`resumen-pregunta-item ${tieneRespuesta ? 'respondida' : 'sin-responder'}`}>
                  <div className="resumen-pregunta-numero">{index + 1}</div>
                  <div className="resumen-pregunta-info">
                    <div className="resumen-pregunta-titulo" dangerouslySetInnerHTML={{ __html: descripcionLimpia }} />
                    <div className="resumen-pregunta-respuesta">
                      <strong>Tu respuesta:</strong>{' '}
                      {respuestaFormateada ? (
                        respuestaFormateada.tipo === 'html' ? (
                          <span dangerouslySetInnerHTML={{ __html: respuestaFormateada.html }} />
                        ) : (
                          <span>{respuestaFormateada.html}</span>
                        )
                      ) : (
                        <span style={{ color: '#ef4444', fontStyle: 'italic' }}>Sin responder</span>
                      )}
                    </div>
                    <div className="resumen-pregunta-estado">
                      {tieneRespuesta ? '✓ Respondida' : '⚠️ Sin responder'}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="resumen-acciones">
            <button className="btn-resumen-cancelar" onClick={handleCancelarFinalizar}>
              ← Volver al Examen
            </button>
            <button className="btn-resumen-finalizar" onClick={handleConfirmarFinalizar}>
              ✓ Finalizar Examen
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="examen-container">
      {(estadoConexion === 'offline' ||
        estadoConexion === 'syncing' ||
        estadoConexion === 'error') && (
        <div
          className={`examen-conexion-banner examen-conexion-banner--${estadoConexion}`}
          role="status"
          aria-live="polite"
        >
          {estadoConexion === 'offline' && (
            <>
              <strong>Sin conexión.</strong> Tus respuestas se guardan en esta tablet y se
              enviarán al servidor cuando vuelva internet.
            </>
          )}
          {estadoConexion === 'syncing' && (
            <>
              <strong>Sincronizando…</strong> Enviando respuestas guardadas localmente.
            </>
          )}
          {estadoConexion === 'error' && (
            <>
              <strong>No se pudo guardar en el servidor.</strong> Revisa la conexión; tus marcas
              siguen en esta pantalla.
            </>
          )}
        </div>
      )}
      {estadoConexion === 'synced' && (
        <div className="examen-conexion-banner examen-conexion-banner--synced" role="status">
          Respuestas guardadas en el servidor.
        </div>
      )}
      {/* Header del Examen */}
      <div className="examen-header">
        <div className="examen-header-left">
          <h2>📝 {examen.titulo}</h2>
        </div>
        <div className="examen-header-right">
          {examen.tiempo > 0 && (
            <div className="examen-timer" style={{ color: colorTimer }}>
              <div className="timer-icon">⏱️</div>
              <div className="timer-text">{formatearTiempo(tiempoRestante)}</div>
              <div className="timer-bar">
                <div 
                  className="timer-bar-fill" 
                  style={{ 
                    width: `${porcentajeRestante}%`,
                    backgroundColor: colorTimer
                  }}
                ></div>
              </div>
            </div>
          )}
          <button 
            className="btn-finalizar-examen"
            onClick={handleFinalizarExamen}
          >
            ✓ Finalizar Examen
          </button>
        </div>
      </div>

      {/* Contenido Principal */}
      <div className="examen-content">
        {bloqueExamen && (bloqueExamen.contenido || bloqueExamen.imagen_url) && (
          <div
            className={`examen-bloque-contexto examen-bloque-alumno-acc${
              bloqueContextoExpandido ? ' examen-bloque-alumno-acc--abierto' : ''
            }`}
          >
            <button
              type="button"
              className="examen-bloque-alumno-acc__bar"
              onClick={() => setBloqueContextoExpandido((v) => !v)}
              aria-expanded={bloqueContextoExpandido}
            >
              <span className="examen-bloque-alumno-acc__bar-title">📎 Contexto del examen</span>
              <span className="examen-bloque-alumno-acc__bar-action">
                {bloqueContextoExpandido ? 'Ocultar' : 'Ver contexto'}
              </span>
            </button>
            {bloqueContextoExpandido && (
              <div className="examen-bloque-alumno-acc__body">
                {bloqueExamen.imagen_url ? (
                  <img
                    src={bloqueExamen.imagen_url}
                    alt="Contexto del examen"
                    className="examen-bloque-alumno-acc__img"
                  />
                ) : null}
                {bloqueExamen.contenido ? (
                  <div className="examen-bloque-html" dangerouslySetInnerHTML={{ __html: bloqueExamen.contenido }} />
                ) : null}
              </div>
            )}
          </div>
        )}
        {/* Barra de Progreso */}
        <div className="examen-progress">
          <div className="examen-progress-bar">
            <div 
              className="examen-progress-fill" 
              style={{ width: `${progreso}%` }}
            ></div>
          </div>
          <div className="examen-progress-text">
            Pregunta {preguntaActual + 1} de {totalPreguntas}
          </div>
        </div>

        {/* Navegación de Preguntas (Miniaturas) */}
        <div className="examen-navegacion">
          {preguntas.map((p, index) => (
            <button
              key={p.id}
              className={`examen-nav-btn ${index === preguntaActual ? 'active' : ''} ${respuestaTieneValor(respuestas[p.id]) ? 'answered' : ''}`}
              onClick={() => setPreguntaActual(index)}
            >
              {index + 1}
            </button>
          ))}
        </div>

        {/* Pregunta Actual */}
        <div className="examen-pregunta-container">
          {pregunta && (
            <RenderizarPregunta
              pregunta={pregunta}
              respuesta={respuestas[pregunta.id] || null}
              onRespuestaChange={(respuesta) => {
                const tipoPreg = pregunta.tipo;
                const respNorm = normalizarRespuestaParaGuardar(respuesta, tipoPreg);
                setRespuestas((prev) => {
                  const nuevasRespuestas = {
                    ...prev,
                    [pregunta.id]: respNorm
                  };
                  respuestasRef.current = nuevasRespuestas;
                  const pid = pruebaIdRef.current;
                  const limpias = sanitizarRespuestasExamen(nuevasRespuestas);
                  if (pid) {
                    writeDraft(examenId, pid, limpias);
                    queuePendingAnswer(examenId, pid, pregunta.id, respNorm);
                  }
                  (async () => {
                    try {
                      const { guardado } = await postLineaConResiliencia(
                        pregunta.id,
                        respNorm,
                        tipoPreg
                      );
                      if (pid && guardado) {
                        removePendingAnswer(examenId, pid, pregunta.id);
                        markServerSaveAt(examenId, pid);
                        setEstadoConexion(navigator.onLine ? 'synced' : 'offline');
                      } else if (!guardado) {
                        setEstadoConexion(navigator.onLine ? 'error' : 'offline');
                      }
                    } catch (_) {
                      setEstadoConexion(navigator.onLine ? 'error' : 'offline');
                    }
                  })();
                  return nuevasRespuestas;
                });
              }}
            />
          )}
        </div>

        {/* Navegación */}
        <div className="examen-navegacion-botones">
          <button
            className="btn-examen-nav"
            onClick={() => setPreguntaActual(prev => Math.max(0, prev - 1))}
            disabled={preguntaActual === 0}
          >
            ← Anterior
          </button>
          <button
            className="btn-examen-nav"
            onClick={() => setPreguntaActual(prev => Math.min(totalPreguntas - 1, prev + 1))}
            disabled={preguntaActual === totalPreguntas - 1}
          >
            Siguiente →
          </button>
        </div>
      </div>

      {/* Indicador de Guardado */}
      {guardando && (
        <div className="examen-guardando">
          💾 Guardando respuestas...
        </div>
      )}
    </div>
  );
}

// Componente para renderizar preguntas según su tipo
function RenderizarPregunta({ pregunta, respuesta, onRespuestaChange }) {
  if (!pregunta) {
    return (
      <div className="pregunta-container">
        <p style={{ color: '#ef4444' }}>❌ Error: No se pudo cargar la pregunta</p>
      </div>
    );
  }

  const props = {
    pregunta,
    respuesta,
    onRespuestaChange
  };

  try {
    // Normalizar el tipo de pregunta (trim y uppercase para evitar problemas de formato)
    const tipoPregunta = pregunta.tipo ? String(pregunta.tipo).trim().toUpperCase() : '';
    
    // Debug: solo en desarrollo
    if (process.env.NODE_ENV === 'development') {
      console.log('🔍 Renderizando pregunta tipo:', tipoPregunta, 'ID:', pregunta.id);
    }
    
    switch (tipoPregunta) {
      case 'ALTERNATIVAS':
        return <PreguntaAlternativas {...props} />;
      case 'COMPLETAR':
        return <PreguntaCompletar {...props} />;
      case 'VERDADERO_FALSO':
        return <PreguntaVerdaderoFalso {...props} />;
      case 'RESPUESTA_CORTA':
        return <PreguntaRespuestaCorta {...props} />;
      case 'ORDENAR':
        return <PreguntaOrdenar {...props} />;
      case 'EMPAREJAR':
        return <PreguntaEmparejar {...props} />;
      case 'ARRASTRAR_Y_SOLTAR':
        return <PreguntaArrastrarSoltar {...props} />;
      default:
        console.warn('⚠️ Tipo de pregunta no reconocido:', tipoPregunta, 'Original:', pregunta.tipo);
        return (
          <div className="pregunta-container">
            <div 
              className="pregunta-descripcion"
              dangerouslySetInnerHTML={{ __html: pregunta.descripcion || 'Sin descripción' }}
            />
            <p style={{ color: '#ef4444', marginTop: '1rem' }}>
              ⚠️ Tipo de pregunta no soportado: {pregunta.tipo || 'Desconocido'}
            </p>
            <p style={{ color: '#6b7280', marginTop: '0.5rem', fontSize: '0.875rem' }}>
              Tipo normalizado: {tipoPregunta || 'N/A'}
            </p>
          </div>
        );
    }
  } catch (error) {
    console.error('Error renderizando pregunta:', error);
    console.error('Tipo de pregunta:', pregunta?.tipo);
    console.error('Pregunta completa:', pregunta);
    return (
      <div className="pregunta-container">
        <div 
          className="pregunta-descripcion"
          dangerouslySetInnerHTML={{ __html: pregunta?.descripcion || 'Sin descripción' }}
        />
        <p style={{ color: '#ef4444', marginTop: '1rem' }}>
          ❌ Error al renderizar la pregunta: {error.message}
        </p>
        <p style={{ color: '#6b7280', marginTop: '0.5rem', fontSize: '0.875rem' }}>
          Tipo: {pregunta?.tipo || 'Desconocido'}
        </p>
      </div>
    );
  }
}

export default AlumnoExamen;

