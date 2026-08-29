import React, { useEffect, useRef, useState } from 'react';
import AdminMensajeQuillEditor from '../../components/admin/AdminMensajeQuillEditor';
import { procesarHTMLMensaje } from '../../utils/mensajesHtml';
import api from '../../services/api';

function htmlActa(raw) {
  const s = String(raw || '');
  if (!s.trim()) return '';
  return procesarHTMLMensaje(/<[a-z][\s\S]*>/i.test(s) ? s : s.replace(/\n/g, '<br>'));
}

export default function ReunionActaViva({ reunionId, puedeEscribir, puedePermiso, actaInicial, acuerdosInicial, editableInicial }) {
  const [acta, setActa] = useState(actaInicial || '');
  const [acuerdos, setAcuerdos] = useState(acuerdosInicial || '');
  const [editable, setEditable] = useState(!!editableInicial);
  const [escribir, setEscribir] = useState(!!puedeEscribir);
  const [estado, setEstado] = useState('');
  const actaRef = useRef(acta);
  const acuerdosRef = useRef(acuerdos);
  const timer = useRef(null);

  useEffect(() => {
    setEscribir(!!puedeEscribir);
  }, [puedeEscribir]);

  useEffect(() => {
    actaRef.current = acta;
    acuerdosRef.current = acuerdos;
  }, [acta, acuerdos]);

  const programarGuardado = () => {
    if (!escribir) return;
    setEstado('Escribiendo…');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        await api.patch(`/reuniones/${reunionId}/acta`, {
          acta: actaRef.current,
          acuerdos: acuerdosRef.current,
        });
        setEstado('Actualizado');
      } catch {
        setEstado('No se pudo guardar');
      }
    }, 2200);
  };

  const onActa = (v) => {
    setActa(v);
    programarGuardado();
  };
  const onAcuerdos = (v) => {
    setAcuerdos(v);
    programarGuardado();
  };

  useEffect(() => {
    if (escribir) return undefined;
    const t = setInterval(async () => {
      try {
        const { data } = await api.get(`/reuniones/${reunionId}/acta-vivo`);
        setActa(data.acta || '');
        setAcuerdos(data.acuerdos || '');
        setEditable(!!data.acta_editable);
        if (data.acta_editable) setEscribir(true);
      } catch {
        /* silencio */
      }
    }, 2500);
    return () => clearInterval(t);
  }, [reunionId, escribir]);

  const cambiarPermiso = async (on) => {
    try {
      await api.patch(`/reuniones/${reunionId}/acta-permiso`, { acta_editable: on });
      setEditable(on);
    } catch {
      /* silencio */
    }
  };

  if (!escribir) {
    return (
      <div className="re-acta-viva">
        <h3>Acta y acuerdos</h3>
        <p className="re-hint">Solo lectura. Se actualiza mientras el anfitrión escribe.</p>
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
      <h3>Acta y acuerdos</h3>
      <p className="re-hint">Se guarda solo, cada 2 o 3 segundos. Los demás lo van viendo sin pulsar Guardar. {estado}</p>
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
