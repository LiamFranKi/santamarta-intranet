import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import Swal from 'sweetalert2';
import './AdminConfigCumpleanos.css';

const DEFAULTS = {
  push: '¡Feliz cumpleaños, {nombre}! Te desea un gran día {colegio}.',
  ventana:
    'En {colegio} celebramos a quienes cumplen años. Iniciá sesión para ver el detalle de cumpleaños del día.',
  correoAsunto: '🎂 Cumpleaños — {colegio}',
  correoCuerpo: `Hola,

Hoy cumplen años: {nombre}.

Un saludo cordial,
{colegio}`,
  mensajeSistema:
    'Recordatorio de cumpleaños: {nombre}. Mes: {mes}. — {colegio}'
};

const CANALES = [
  {
    id: 'push',
    emoji: '📱',
    titulo: 'Notificación push',
    destino: 'Dispositivo (PWA / navegador)',
    descripcion:
      'Texto de la alerta push cuando hay cumpleaños en el alcance del usuario. Ya está en uso con la tarea programada del servidor.',
    activo: true
  },
  {
    id: 'ventana',
    emoji: '🪟',
    titulo: 'Ventana al iniciar sesión',
    destino: 'Modal al login',
    descripcion:
      'Mensaje que verá el usuario en el modal de cumpleaños al ingresar a la intranet (antes o después de iniciar sesión, según lo conectemos).',
    activo: false
  },
  {
    id: 'correo',
    emoji: '✉️',
    titulo: 'Correo electrónico',
    destino: 'Bandeja de email',
    descripcion: 'Asunto y cuerpo del correo automático cuando implementemos el envío por SMTP o servicio de correo.',
    activo: false
  },
  {
    id: 'mensaje',
    emoji: '💬',
    titulo: 'Mensaje al sistema',
    destino: 'Mensajes de la intranet',
    descripcion:
      'Contenido del aviso que se generará en la bandeja de mensajes del sistema (módulo de mensajes internos).',
    activo: false
  }
];

function AdminConfigCumpleanos() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [plantillaPush, setPlantillaPush] = useState('');
  const [plantillaVentana, setPlantillaVentana] = useState('');
  const [plantillaCorreoAsunto, setPlantillaCorreoAsunto] = useState('');
  const [plantillaCorreoCuerpo, setPlantillaCorreoCuerpo] = useState('');
  const [plantillaMensajeSistema, setPlantillaMensajeSistema] = useState('');

  useEffect(() => {
    const cargar = async () => {
      try {
        setLoading(true);
        const { data } = await api.get('/admin/configuracion');
        const str = (k) => (typeof data[k] === 'string' ? data[k] : '');
        setPlantillaPush(str('cumpleanos_plantilla_push'));
        setPlantillaVentana(str('cumpleanos_plantilla_ventana'));
        setPlantillaCorreoAsunto(str('cumpleanos_plantilla_correo_asunto'));
        setPlantillaCorreoCuerpo(str('cumpleanos_plantilla_correo_cuerpo'));
        setPlantillaMensajeSistema(str('cumpleanos_plantilla_mensaje_sistema'));
      } catch (e) {
        console.error(e);
        Swal.fire({
          title: 'Error',
          text: 'No se pudo cargar la configuración de cumpleaños',
          icon: 'error'
        });
      } finally {
        setLoading(false);
      }
    };
    cargar();
  }, []);

  const guardar = async () => {
    try {
      setSaving(true);
      await api.put('/admin/configuracion', {
        cumpleanos_plantilla_push: plantillaPush,
        cumpleanos_plantilla_ventana: plantillaVentana,
        cumpleanos_plantilla_correo_asunto: plantillaCorreoAsunto,
        cumpleanos_plantilla_correo_cuerpo: plantillaCorreoCuerpo,
        cumpleanos_plantilla_mensaje_sistema: plantillaMensajeSistema
      });
      Swal.fire({
        title: 'Guardado',
        text: 'Las plantillas de cumpleaños se guardaron correctamente.',
        icon: 'success',
        timer: 2200,
        showConfirmButton: false
      });
    } catch (e) {
      console.error(e);
      Swal.fire({
        title: 'Error',
        text: e.response?.data?.error || 'No se pudo guardar',
        icon: 'error'
      });
    } finally {
      setSaving(false);
    }
  };

  const restaurarEjemplos = () => {
    setPlantillaPush(DEFAULTS.push);
    setPlantillaVentana(DEFAULTS.ventana);
    setPlantillaCorreoAsunto(DEFAULTS.correoAsunto);
    setPlantillaCorreoCuerpo(DEFAULTS.correoCuerpo);
    setPlantillaMensajeSistema(DEFAULTS.mensajeSistema);
  };

  const hintPlaceholders = (
    <div className="admin-config-cumpleanos__placeholders">
      <span className="admin-config-cumpleanos__ph-label">Variables</span>
      <code>{'{nombre}'}</code>
      <code>{'{colegio}'}</code>
      <code>{'{mes}'}</code>
    </div>
  );

  if (loading) {
    return (
      <div className="admin-config-cumpleanos admin-config-cumpleanos--loading">
        <div className="admin-config-cumpleanos__spinner" aria-hidden />
        <p>Cargando plantillas…</p>
      </div>
    );
  }

  return (
    <div className="admin-config-cumpleanos">
      <header className="admin-config-cumpleanos__hero">
        <div className="admin-config-cumpleanos__hero-inner">
          <h1>Cumpleaños</h1>
          <p className="admin-config-cumpleanos__lead">
            Definí el texto de cada canal. El <strong>push</strong> y la <strong>campanita</strong> ya usan parte de la
            lógica en servidor; <strong>modal al login</strong>, <strong>correo</strong> y <strong>mensajes</strong> se
            enlazan cuando actives esos envíos.
          </p>
          <div className="admin-config-cumpleanos__map">
            {CANALES.map((c) => (
              <div key={c.id} className="admin-config-cumpleanos__map-item">
                <span className="admin-config-cumpleanos__map-emoji" aria-hidden>
                  {c.emoji}
                </span>
                <div>
                  <strong>{c.titulo}</strong>
                  <span className="admin-config-cumpleanos__map-dest">{c.destino}</span>
                </div>
                {c.activo ? <span className="admin-config-cumpleanos__pill admin-config-cumpleanos__pill--on">Activo</span> : <span className="admin-config-cumpleanos__pill">Próximo</span>}
              </div>
            ))}
          </div>
        </div>
      </header>

      <div className="admin-config-cumpleanos__grid">
        <section className="admin-config-cumpleanos__card admin-config-cumpleanos__card--accent admin-config-cumpleanos__card--push">
          <div className="admin-config-cumpleanos__card-head">
            <span className="admin-config-cumpleanos__card-icon" aria-hidden>📱</span>
            <div>
              <h2 className="admin-config-cumpleanos__card-title">Notificación push</h2>
              <p className="admin-config-cumpleanos__card-destino">→ Alerta en el dispositivo (PWA)</p>
            </div>
          </div>
          <p className="admin-config-cumpleanos__hint">
            Dos líneas: primera = título, resto = cuerpo. Una sola línea usa título corto fijo y el texto completo abajo.
          </p>
          {hintPlaceholders}
          <textarea
            className="admin-config-cumpleanos__textarea"
            rows={4}
            maxLength={500}
            value={plantillaPush}
            onChange={(e) => setPlantillaPush(e.target.value)}
            placeholder={DEFAULTS.push}
            aria-label="Plantilla push cumpleaños"
          />
        </section>

        <section className="admin-config-cumpleanos__card admin-config-cumpleanos__card--accent admin-config-cumpleanos__card--ventana">
          <div className="admin-config-cumpleanos__card-head">
            <span className="admin-config-cumpleanos__card-icon" aria-hidden>🪟</span>
            <div>
              <h2 className="admin-config-cumpleanos__card-title">Modal al iniciar sesión</h2>
              <p className="admin-config-cumpleanos__card-destino">→ Ventana al ingresar (login / bienvenida)</p>
            </div>
          </div>
          <p className="admin-config-cumpleanos__hint">
            Texto del modal de cumpleaños que verá el usuario al acceder; no es el widget del dashboard. Podés usar HTML
            más adelante.
          </p>
          {hintPlaceholders}
          <textarea
            className="admin-config-cumpleanos__textarea"
            rows={4}
            maxLength={800}
            value={plantillaVentana}
            onChange={(e) => setPlantillaVentana(e.target.value)}
            placeholder={DEFAULTS.ventana}
            aria-label="Plantilla modal login cumpleaños"
          />
        </section>

        <section className="admin-config-cumpleanos__card admin-config-cumpleanos__card--accent admin-config-cumpleanos__card--correo">
          <div className="admin-config-cumpleanos__card-head">
            <span className="admin-config-cumpleanos__card-icon" aria-hidden>✉️</span>
            <div>
              <h2 className="admin-config-cumpleanos__card-title">Correo electrónico</h2>
              <p className="admin-config-cumpleanos__card-destino">→ Bandeja de correo del usuario</p>
            </div>
          </div>
          <p className="admin-config-cumpleanos__hint">Plantilla del email cuando el servidor envíe el aviso automático.</p>
          {hintPlaceholders}
          <label className="admin-config-cumpleanos__label" htmlFor="cumple-correo-asunto">
            Asunto
          </label>
          <input
            id="cumple-correo-asunto"
            type="text"
            className="admin-config-cumpleanos__input"
            maxLength={200}
            value={plantillaCorreoAsunto}
            onChange={(e) => setPlantillaCorreoAsunto(e.target.value)}
            placeholder={DEFAULTS.correoAsunto}
            aria-label="Asunto correo cumpleaños"
          />
          <label className="admin-config-cumpleanos__label" htmlFor="cumple-correo-cuerpo">
            Cuerpo
          </label>
          <textarea
            id="cumple-correo-cuerpo"
            className="admin-config-cumpleanos__textarea"
            rows={8}
            maxLength={4000}
            value={plantillaCorreoCuerpo}
            onChange={(e) => setPlantillaCorreoCuerpo(e.target.value)}
            placeholder={DEFAULTS.correoCuerpo}
            aria-label="Cuerpo correo cumpleaños"
          />
        </section>

        <section className="admin-config-cumpleanos__card admin-config-cumpleanos__card--accent admin-config-cumpleanos__card--mensaje">
          <div className="admin-config-cumpleanos__card-head">
            <span className="admin-config-cumpleanos__card-icon" aria-hidden>💬</span>
            <div>
              <h2 className="admin-config-cumpleanos__card-title">Mensaje al sistema</h2>
              <p className="admin-config-cumpleanos__card-destino">→ Bandeja de mensajes de la intranet</p>
            </div>
          </div>
          <p className="admin-config-cumpleanos__hint">
            Contenido del mensaje interno (módulo Mensajes) cuando se genere el aviso automático de cumpleaños.
          </p>
          {hintPlaceholders}
          <textarea
            className="admin-config-cumpleanos__textarea"
            rows={6}
            maxLength={4000}
            value={plantillaMensajeSistema}
            onChange={(e) => setPlantillaMensajeSistema(e.target.value)}
            placeholder={DEFAULTS.mensajeSistema}
            aria-label="Plantilla mensaje sistema cumpleaños"
          />
        </section>
      </div>

      <div className="admin-config-cumpleanos__footer-bar">
        <button
          type="button"
          className="admin-config-cumpleanos__btn"
          onClick={restaurarEjemplos}
          disabled={saving}
        >
          Restaurar ejemplos
        </button>
        <button
          type="button"
          className="admin-config-cumpleanos__btn admin-config-cumpleanos__btn--primary"
          onClick={guardar}
          disabled={saving}
        >
          {saving ? 'Guardando…' : 'Guardar todas las plantillas'}
        </button>
      </div>
    </div>
  );
}

export default AdminConfigCumpleanos;
