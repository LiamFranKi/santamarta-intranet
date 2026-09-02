import React, { useCallback, useEffect, useRef, useState } from 'react';
import AdminMensajeQuillEditor from '../../components/admin/AdminMensajeQuillEditor';
import { procesarHTMLMensaje } from '../../utils/mensajesHtml';
import api from '../../services/api';

function htmlActa(raw) {
  const s = String(raw || '');
  if (!s.trim()) return '';
  return procesarHTMLMensaje(/<[a-z][\s\S]*>/i.test(s) ? s : s.replace(/\n/g, '<br>'));
}

function esCambioDeUsuario(source) {
  return source === 'user';
}

export default function ReunionActaViva({
  reunionId,
  puedeEscribir,
  puedePermiso,
  actaInicial,
  acuerdosInicial,
  editableInicial,
}) {
  const [acta, setActa] = useState(actaInicial || '');
  const [acuerdos, setAcuerdos] = useState(acuerdosInicial || '');
  const [editable, setEditable] = useState(!!editableInicial);
  const [escribir, setEscribir] = useState(!!puedeEscribir);
  const [estado, setEstado] = useState('');
  const [guardando, setGuardando] = useState(false);
  const actaRef = useRef(actaInicial || '');
  const acuerdosRef = useRef(acuerdosInicial || '');
  const dirtyRef = useRef(false);
  const lastRemoteRef = useRef('');
  const timer = useRef(null);

  useEffect(() => {
    setEscribir(!!puedeEscribir);
  }, [puedeEscribir]);

  useEffect(() => {
    actaRef.current = acta;
    acuerdosRef.current = acuerdos;
  }, [acta, acuerdos]);

  const marcarSucio = () => {
    dirtyRef.current = true;
    setEstado('Sin guardar');
  };

  const guardarAhora = useCallback(async () => {
    if (!escribir) return false;
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    setGuardando(true);
    setEstado('Guardando…');
    try {
      const { data } = await api.patch(`/reuniones/${reunionId}/acta`, {
        acta: actaRef.current,
        acuerdos: acuerdosRef.current,
      });
      dirtyRef.current = false;
      if (data?.reunion?.updated_at) lastRemoteRef.current = String(data.reunion.updated_at);
      setEstado('Guardado');
      return true;
    } catch (e) {
      setEstado(e.response?.data?.error || 'No se pudo guardar');
      return false;
    } finally {
      setGuardando(false);
    }
  }, [escribir, reunionId]);

  const programarGuardado = () => {
    if (!escribir) return;
    marcarSucio();
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      guardarAhora();
    }, 4000);
  };

  const onActa = (v, _d, source) => {
    if (!esCambioDeUsuario(source)) return;
    setActa(v);
    programarGuardado();
  };
  const onAcuerdos = (v, _d, source) => {
    if (!esCambioDeUsuario(source)) return;
    setAcuerdos(v);
    programarGuardado();
  };

  useEffect(() => {
    const t = setInterval(async () => {
      if (dirtyRef.current || guardando) return;
      try {
        const { data } = await api.get(`/reuniones/${reunionId}/acta-vivo`);
        const stamp = String(data.updated_at || '');
        if (stamp && stamp === lastRemoteRef.current) return;
        lastRemoteRef.current = stamp;
        setActa(data.acta || '');
        setAcuerdos(data.acuerdos || '');
        setEditable(!!data.acta_editable);
        if (data.acta_editable && !escribir) setEscribir(true);
      } catch {
        /* silencio: la reunión sigue */
      }
    }, 2500);
    return () => clearInterval(t);
  }, [reunionId, escribir, guardando]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const cambiarPermiso = async (on) => {
    try {
      await api.patch(`/reuniones/${reunionId}/acta-permiso`, { acta_editable: on });
      setEditable(on);
    } catch (e) {
      setEstado(e.response?.data?.error || 'No se pudo cambiar el permiso');
    }
  };

  if (!escribir) {
    return (
      <div className="re-acta-viva">
        <h3>Acta y acuerdos</h3>
        <p className="re-hint">Solo lectura. Se actualiza cada pocos segundos mientras escriben.</p>
        {acta ? <div className="re-html" dangerouslySetInnerHTML={{ __html: htmlActa(acta) }} /> : <p className="re-hint">Aún no hay desarrollo.</p>}
        {acuerdos ? (
          <>
            <strong>Acuerdos</strong>
            <div className="re-html" dangerouslySetInnerHTML={{ __html: htmlActa(acuerdos) }} />
          </>
        ) : null}
      </div>
    );
  }

  return (
    <div className="re-acta-viva">
      <div className="re-acta-toolbar">
        <div>
          <h3>Acta y acuerdos</h3>
          <p className="re-hint">
            Pulsa <strong>Guardar</strong> para que los demás lo vean. También se intenta guardar solo a los 4 s.
            {estado ? ` ${estado}.` : ''}
          </p>
        </div>
        <button type="button" className="re-btn re-btn-primary re-acta-save" onClick={guardarAhora} disabled={guardando}>
          {guardando ? 'Guardando…' : '💾 Guardar'}
        </button>
      </div>
      {puedePermiso ? (
        <label className="re-acta-check">
          <input type="checkbox" checked={editable} onChange={(e) => cambiarPermiso(e.target.checked)} />
          Permitir que los convocados también escriban el acta
        </label>
      ) : null}
      <div className="re-field full">
        <label>Desarrollo / minuta</label>
        <AdminMensajeQuillEditor value={acta} onChange={onActa} placeholder="Redacta el acta…" />
      </div>
      <div className="re-field full" style={{ marginTop: '0.75rem' }}>
        <label>Acuerdos</label>
        <AdminMensajeQuillEditor value={acuerdos} onChange={onAcuerdos} placeholder="Acuerdos y compromisos…" />
      </div>
    </div>
  );
}
