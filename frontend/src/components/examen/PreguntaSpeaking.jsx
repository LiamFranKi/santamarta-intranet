import React, { useEffect, useRef, useState } from 'react';
import api from '../../services/api';
import { parseSpeakingRespuesta } from '../../utils/examenTipo';
import { urlStaticArchivos } from '../../utils/staticUrl';
import './PreguntaSpeaking.css';

function PreguntaSpeaking({
  pregunta,
  respuesta,
  onRespuestaChange,
  examenId,
  getExamHeaders,
}) {
  const modo = String(pregunta.speaking_modo || 'AUDIO').toUpperCase() === 'EN_VIVO' ? 'EN_VIVO' : 'AUDIO';
  const parsed = parseSpeakingRespuesta(respuesta);
  const [grabando, setGrabando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState('');
  const mediaRef = useRef(null);
  const chunksRef = useRef([]);

  useEffect(() => {
    if (modo !== 'EN_VIVO') return;
    if (parsed.visto) return;
    onRespuestaChange({ modo: 'EN_VIVO', visto: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modo, pregunta.id]);

  useEffect(() => {
    return () => {
      if (mediaRef.current && mediaRef.current.state !== 'inactive') {
        try {
          mediaRef.current.stop();
        } catch {
          /* ignore */
        }
      }
    };
  }, []);

  const audioSrc = parsed.audio
    ? parsed.audio_url || urlStaticArchivos(parsed.audio)
    : '';

  const subirBlob = async (blob) => {
    setSubiendo(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('audio', blob, 'speaking.webm');
      fd.append('pregunta_id', String(pregunta.id));
      const res = await api.post(`/alumno/examenes/${examenId}/speaking-audio`, fd, {
        ...(getExamHeaders ? getExamHeaders() : {}),
        timeout: 60000
      });
      onRespuestaChange({
        modo: 'AUDIO',
        audio: res.data.audio,
        audio_url: res.data.audio_url,
        visto: true,
        nota_docente: res.data.nota_docente
      });
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo guardar el audio. Intenta de nuevo.');
    } finally {
      setSubiendo(false);
    }
  };

  const iniciarGrabacion = async () => {
    setError('');
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError('Este dispositivo no permite grabar audio. Pide ayuda a tu docente.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' });
        await subirBlob(blob);
      };
      mediaRef.current = rec;
      rec.start();
      setGrabando(true);
    } catch {
      setError('No se pudo usar el micrófono. Revisa el permiso del navegador.');
    }
  };

  const detenerGrabacion = () => {
    if (mediaRef.current && mediaRef.current.state !== 'inactive') {
      mediaRef.current.stop();
    }
    setGrabando(false);
  };

  return (
    <div className="pregunta-speaking">
      <div className="pregunta-descripcion" dangerouslySetInnerHTML={{ __html: pregunta.descripcion }} />

      <div className={`pspk-card ${modo === 'EN_VIVO' ? 'pspk-card--vivo' : 'pspk-card--audio'}`}>
        <div className="pspk-kicker">{modo === 'EN_VIVO' ? 'Speaking en clase' : 'Speaking con audio'}</div>
        {modo === 'EN_VIVO' ? (
          <>
            <p className="pspk-text">
              Lee la oración en voz alta. Tu docente te escucha y pone la nota en el sistema. No hace falta grabar.
            </p>
            <div className="pspk-ok">Listo para evaluación en vivo</div>
          </>
        ) : (
          <>
            <p className="pspk-text">Graba tu respuesta. Puedes volver a grabar si no te convence.</p>
            <div className="pspk-actions">
              {!grabando ? (
                <button type="button" className="pspk-btn pspk-btn-main" onClick={iniciarGrabacion} disabled={subiendo}>
                  {parsed.audio ? 'Volver a grabar' : 'Grabar audio'}
                </button>
              ) : (
                <button type="button" className="pspk-btn pspk-btn-stop" onClick={detenerGrabacion}>
                  Detener y guardar
                </button>
              )}
            </div>
            {grabando ? <p className="pspk-rec">Grabando… habla con claridad.</p> : null}
            {subiendo ? <p className="pspk-rec">Guardando audio…</p> : null}
            {audioSrc ? (
              <audio className="pspk-player" controls src={audioSrc} preload="metadata">
                Tu navegador no reproduce audio.
              </audio>
            ) : null}
          </>
        )}
        {error ? <p className="pspk-error">{error}</p> : null}
      </div>
    </div>
  );
}

export default PreguntaSpeaking;
