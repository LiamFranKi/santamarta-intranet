import React, { useCallback, useEffect, useRef, useState } from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import api from '../../services/api';
import './VanguarcitoChat.css';

function textoHtml(s) {
  const esc = String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return esc.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
}

const IDEAS = [
  'Explícame este tema en pasos cortos',
  'Hazme un resumen para estudiar',
  'Arma una lista de tareas de la semana',
];

export default function VanguarcitoChat() {
  const [estado, setEstado] = useState(null);
  const [error, setError] = useState('');
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [mensajes, setMensajes] = useState([]);
  const listaRef = useRef(null);
  const cajaRef = useRef(null);

  const cargar = useCallback(async () => {
    try {
      const { data } = await api.get('/vanguarcito/estado');
      setEstado(data);
      setMensajes(data.mensajes || []);
      setError('');
    } catch (e) {
      setError(e.response?.data?.error || 'No se pudo abrir el asistente.');
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    const el = listaRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [mensajes, enviando]);

  const sinCupo = estado && !estado.ilimitado && Number(estado.restantes) <= 0;
  const nombre = estado?.nombre || 'Vanguarcito';

  const enviar = async (valor) => {
    const pregunta = String(valor ?? texto).trim();
    if (!pregunta || enviando || sinCupo) return;
    setTexto('');
    setEnviando(true);
    setError('');
    setMensajes((prev) => [...prev, { id: `local-${Date.now()}`, rol: 'usuario', texto: pregunta }]);
    try {
      const { data } = await api.post('/vanguarcito/preguntar', { texto: pregunta }, { timeout: 70000 });
      setMensajes((prev) => [...prev, { id: data.id || `r-${Date.now()}`, rol: 'modelo', texto: data.respuesta }]);
      setEstado((prev) => ({
        ...prev,
        cupo: data.cupo,
        usadas: data.usadas,
        restantes: data.restantes,
        ilimitado: data.ilimitado,
      }));
    } catch (e) {
      setError(e.response?.data?.error || 'No se pudo responder.');
    } finally {
      setEnviando(false);
      cajaRef.current?.focus();
    }
  };

  const bajar = async (formato, contenido) => {
    try {
      const res = await api.post(
        '/vanguarcito/archivo',
        { texto: contenido, formato },
        { responseType: 'blob', timeout: 60000 }
      );
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `respuesta.${formato === 'xlsx' ? 'xlsx' : formato === 'docx' ? 'docx' : 'pdf'}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError('No se pudo crear el archivo.');
    }
  };

  const pct = estado?.ilimitado || !estado?.cupo
    ? 100
    : Math.max(0, Math.min(100, Math.round((Number(estado.restantes) / Number(estado.cupo)) * 100)));

  return (
    <DashboardLayout>
      <div className="vg-page">
        <aside className="vg-lado">
          <div className="vg-marca">
            {estado?.imagen_url ? <img src={estado.imagen_url} alt="" /> : <span>🤖</span>}
            <div>
              <h1>{nombre}</h1>
              <p>Asistente de texto del colegio</p>
            </div>
          </div>
          <div className="vg-cupo">
            {estado?.ilimitado ? (
              <>
                <span className="vg-cupo-etiqueta">Cupo de hoy</span>
                <strong>Sin límite</strong>
                <span>Administración puede preguntar todo el día.</span>
              </>
            ) : estado ? (
              <>
                <span className="vg-cupo-etiqueta">Cupo de hoy</span>
                <div className="vg-numeros">
                  <div>
                    <b>{estado.cupo}</b>
                    <small>Tiene</small>
                  </div>
                  <div>
                    <b>{estado.restantes}</b>
                    <small>Le quedan</small>
                  </div>
                </div>
                <span>
                  {Number(estado.usadas)
                    ? `Ya usó ${estado.usadas} de ${estado.cupo}.`
                    : `Todavía no usa ninguna de sus ${estado.cupo}.`}
                </span>
                <div className="vg-barra" aria-hidden>
                  <i style={{ width: `${pct}%` }} />
                </div>
              </>
            ) : (
              <span>Cargando cupo…</span>
            )}
          </div>
          <p className="vg-nota">Solo texto. Puede bajar la respuesta en PDF, Excel o Word. No crea imágenes ni videos.</p>
        </aside>

        <section className="vg-chat">
          <header className="vg-top">
            <div>
              <h2>{nombre}</h2>
              <p>
                {estado?.ilimitado
                  ? 'Preguntas ilimitadas'
                  : estado
                    ? `Tiene ${estado.cupo} · le quedan ${estado.restantes}`
                    : 'Chat'}
              </p>
            </div>
          </header>

          <div className="vg-lista" ref={listaRef}>
            {!mensajes.length && !enviando ? (
              <div className="vg-vacio">
                <h3>Hola. Pregúntame lo que necesites.</h3>
                <p>Te respondo con texto. Si quieres guardar la respuesta, bájala en PDF, Excel o Word.</p>
                <div className="vg-ideas">
                  {IDEAS.map((idea) => (
                    <button key={idea} type="button" onClick={() => enviar(idea)} disabled={sinCupo}>
                      {idea}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {mensajes.map((m) => (
              <article key={m.id} className={m.rol === 'usuario' ? 'vg-burbuja vg-burbuja--mia' : 'vg-burbuja'}>
                {m.rol === 'modelo' && estado?.imagen_url ? <img src={estado.imagen_url} alt="" /> : null}
                <div>
                  <div className="vg-texto" dangerouslySetInnerHTML={{ __html: textoHtml(m.texto) }} />
                  {m.rol === 'modelo' ? (
                    <div className="vg-archivos">
                      <button type="button" onClick={() => bajar('pdf', m.texto)}>PDF</button>
                      <button type="button" onClick={() => bajar('xlsx', m.texto)}>Excel</button>
                      <button type="button" onClick={() => bajar('docx', m.texto)}>Word</button>
                    </div>
                  ) : null}
                </div>
              </article>
            ))}
            {enviando ? (
              <p className="vg-espera">
                <span className="vg-puntos" aria-hidden><i /><i /><i /></span>
                {nombre} está escribiendo…
              </p>
            ) : null}
          </div>

          {error ? <p className="vg-error">{error}</p> : null}
          {estado && !estado.disponible ? (
            <p className="vg-error">La IA no está activada en el servidor.</p>
          ) : null}

          <form
            className="vg-form"
            onSubmit={(e) => {
              e.preventDefault();
              enviar();
            }}
          >
            <textarea
              ref={cajaRef}
              rows={2}
              maxLength={2000}
              value={texto}
              disabled={enviando || sinCupo || !estado?.disponible}
              placeholder={sinCupo ? 'Hoy ya no te quedan preguntas' : `Escribe tu pregunta para ${nombre}`}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  enviar();
                }
              }}
            />
            <button type="submit" disabled={enviando || sinCupo || !String(texto).trim()}>
              Enviar
            </button>
          </form>
        </section>
      </div>
    </DashboardLayout>
  );
}
