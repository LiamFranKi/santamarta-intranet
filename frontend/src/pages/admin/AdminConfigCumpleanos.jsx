import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import Swal from 'sweetalert2';
import './AdminConfigCumpleanos.css';

const DEFAULTS = {
  push: '¡Feliz cumpleaños, {nombre}! Te desea un gran día {colegio}.',
  ventana:
    'En {colegio} celebramos a quienes cumplen años. Este mes podés ver el detalle en el widget de cumpleaños.',
  correoAsunto: '🎂 Cumpleaños — {colegio}',
  correoCuerpo: `Hola,

Hoy cumplen años: {nombre}.

Un saludo cordial,
{colegio}`,
  mensajeSistema:
    'Recordatorio de cumpleaños: {nombre}. Mes: {mes}. — {colegio}'
};

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
    <p className="admin-config-cumpleanos__hint">
      Podés usar <code>{'{nombre}'}</code> (lista de personas separadas por comas cuando aplique),{' '}
      <code>{'{colegio}'}</code> y <code>{'{mes}'}</code>. Son textos de ejemplo hasta activar cada canal.
    </p>
  );

  if (loading) {
    return (
      <div className="admin-config-cumpleanos admin-config-cumpleanos--loading">
        <p>Cargando…</p>
      </div>
    );
  }

  return (
    <div className="admin-config-cumpleanos">
      <header className="admin-config-cumpleanos__header">
        <h1>🎂 Cumpleaños</h1>
        <p className="admin-config-cumpleanos__intro">
          Plantillas para los avisos automáticos del colegio: push (activo), ventana/widget, correo y mensaje al
          sistema. Aquí solo configurás textos; el envío de correo y mensajes se conectará después.
        </p>
      </header>

      <section className="admin-config-cumpleanos__card">
        <h2 className="admin-config-cumpleanos__card-title">Plantilla — Push</h2>
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

      <section className="admin-config-cumpleanos__card admin-config-cumpleanos__card--spaced">
        <h2 className="admin-config-cumpleanos__card-title">Plantilla — Ventana / widget</h2>
        <p className="admin-config-cumpleanos__hint">
          Texto introductorio o recordatorio en la ventana flotante de cumpleaños (listado del mes). Podés usar HTML
          simple más adelante; por ahora texto plano.
        </p>
        <textarea
          className="admin-config-cumpleanos__textarea"
          rows={4}
          maxLength={800}
          value={plantillaVentana}
          onChange={(e) => setPlantillaVentana(e.target.value)}
          placeholder={DEFAULTS.ventana}
          aria-label="Plantilla ventana cumpleaños"
        />
      </section>

      <section className="admin-config-cumpleanos__card admin-config-cumpleanos__card--spaced">
        <h2 className="admin-config-cumpleanos__card-title">Plantilla — Correo electrónico</h2>
        <p className="admin-config-cumpleanos__hint">Asunto y cuerpo del correo (cuando se implemente el envío).</p>
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

      <section className="admin-config-cumpleanos__card admin-config-cumpleanos__card--spaced">
        <h2 className="admin-config-cumpleanos__card-title">Plantilla — Mensaje al sistema</h2>
        <p className="admin-config-cumpleanos__hint">
          Texto para mensajes internos tipo bandeja o aviso en intranet (cuando se implemente el envío automático).
        </p>
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

      <div className="admin-config-cumpleanos__actions admin-config-cumpleanos__actions--footer">
        <button
          type="button"
          className="admin-config-cumpleanos__btn"
          onClick={restaurarEjemplos}
          disabled={saving}
        >
          Restaurar todos los ejemplos
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
