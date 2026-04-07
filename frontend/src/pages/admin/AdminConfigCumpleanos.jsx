import React, { useState, useEffect, useRef } from 'react';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import api from '../../services/api';
import Swal from 'sweetalert2';
import './AdminConfigCumpleanos.css';

const DEFAULTS = {
  push: '¡Feliz cumpleaños, {nombre}! Te desea un gran día {colegio}.',
  ventana:
    '<p>En <strong>{colegio}</strong> celebramos los cumpleaños de hoy. 🎂</p><p>Hoy cumplen: <em>{nombre}</em>.</p>',
  correoAsunto: '🎂 Cumpleaños — {colegio}',
  correoCuerpo: `<p>Hola,</p>
<p>Hoy cumplen años: <strong>{nombre}</strong>.</p>
<p>Un saludo cordial,<br/>{colegio}</p>`,
  mensajeSistema:
    '<p>Recordatorio de cumpleaños: <strong>{nombre}</strong>. Mes: {mes}. — {colegio}</p>',
};

const QUILL_MODULES = {
  toolbar: [
    [{ header: [1, 2, 3, false] }],
    ['bold', 'italic', 'underline', 'strike'],
    [{ list: 'ordered' }, { list: 'bullet' }],
    [{ color: [] }, { background: [] }],
    [{ align: [] }],
    ['link', 'image'],
    ['clean'],
  ],
};

const QUILL_FORMATS = [
  'header',
  'bold',
  'italic',
  'underline',
  'strike',
  'list',
  'bullet',
  'color',
  'background',
  'align',
  'link',
  'image',
];

/** Texto plano guardado antes del editor → HTML mínimo para Quill */
function ensureHtmlForQuill(raw) {
  const t = String(raw ?? '').trim();
  if (!t) return '';
  if (/^<[a-z]/i.test(t)) return t;
  return `<p>${t.replace(/\n\n+/g, '</p><p>').replace(/\n/g, '<br/>')}</p>`;
}

const CANALES = [
  {
    id: 'push',
    emoji: '📱',
    titulo: 'Notificación push',
    destino: 'Dispositivo (PWA / navegador)',
    descripcion:
      'Texto de la alerta push cuando hay cumpleaños en el alcance del usuario. Ya está en uso con la tarea programada del servidor.',
    activo: true,
  },
  {
    id: 'ventana',
    emoji: '🪟',
    titulo: 'Ventana al iniciar sesión',
    destino: 'Modal al login',
    descripcion:
      'Se muestra un modal con esta plantilla cuando hay cumpleaños hoy en tu alcance y la opción “Mostrar ventana cumpleaños” está activa en Configuración general.',
    activo: true,
  },
  {
    id: 'correo',
    emoji: '✉️',
    titulo: 'Correo electrónico',
    destino: 'Bandeja de email',
    descripcion: 'Asunto en texto plano; cuerpo enriquecido para cuando el envío automático por correo esté conectado.',
    activo: false,
  },
  {
    id: 'mensaje',
    emoji: '💬',
    titulo: 'Mensaje al sistema',
    destino: 'Mensajes de la intranet',
    descripcion:
      'Contenido enriquecido del aviso automático en el módulo de mensajes internos (cuando se implemente el envío).',
    activo: false,
  },
];

function AdminConfigCumpleanos() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [plantillaPush, setPlantillaPush] = useState('');
  const [plantillaVentana, setPlantillaVentana] = useState('');
  const [plantillaCorreoAsunto, setPlantillaCorreoAsunto] = useState('');
  const [plantillaCorreoCuerpo, setPlantillaCorreoCuerpo] = useState('');
  const [plantillaMensajeSistema, setPlantillaMensajeSistema] = useState('');

  const quillVentanaRef = useRef(null);
  const quillCorreoRef = useRef(null);
  const quillMensajeRef = useRef(null);

  useEffect(() => {
    const cargar = async () => {
      try {
        setLoading(true);
        const { data } = await api.get('/admin/configuracion');
        const str = (k) => (typeof data[k] === 'string' ? data[k] : '');
        setPlantillaPush(str('cumpleanos_plantilla_push'));
        setPlantillaVentana(ensureHtmlForQuill(str('cumpleanos_plantilla_ventana')));
        setPlantillaCorreoAsunto(str('cumpleanos_plantilla_correo_asunto'));
        setPlantillaCorreoCuerpo(ensureHtmlForQuill(str('cumpleanos_plantilla_correo_cuerpo')));
        setPlantillaMensajeSistema(ensureHtmlForQuill(str('cumpleanos_plantilla_mensaje_sistema')));
      } catch (e) {
        console.error(e);
        Swal.fire({
          title: 'Error',
          text: 'No se pudo cargar la configuración de cumpleaños',
          icon: 'error',
        });
      } finally {
        setLoading(false);
      }
    };
    cargar();
  }, []);

  useEffect(() => {
    if (loading) return;

    const attachImage = (ref) => {
      if (!ref.current) return;
      const quill = ref.current.getEditor();
      const toolbar = quill.getModule('toolbar');
      toolbar.addHandler('image', () => {
        const input = document.createElement('input');
        input.setAttribute('type', 'file');
        input.setAttribute('accept', 'image/*');
        input.click();

        input.onchange = async () => {
          const file = input.files[0];
          if (!file) return;
          if (file.size > 5 * 1024 * 1024) {
            Swal.fire('Error', 'La imagen no puede ser mayor a 5MB', 'error');
            return;
          }
          if (!file.type.startsWith('image/')) {
            Swal.fire('Error', 'Solo se permiten archivos de imagen', 'error');
            return;
          }
          try {
            const formData = new FormData();
            formData.append('imagen', file);
            const response = await api.post('/docente/mensajes/subir-imagen', formData, {
              headers: { 'Content-Type': 'multipart/form-data' },
            });
            const imagenUrl = response.data.url;
            const range = quill.getSelection(true);
            quill.insertEmbed(range.index, 'image', imagenUrl);
            quill.setSelection(range.index + 1);
          } catch (err) {
            console.error(err);
            Swal.fire('Error', 'No se pudo subir la imagen', 'error');
          }
        };
      });
    };

    attachImage(quillVentanaRef);
    attachImage(quillCorreoRef);
    attachImage(quillMensajeRef);
  }, [loading]);

  const guardar = async () => {
    try {
      setSaving(true);
      await api.put('/admin/configuracion', {
        cumpleanos_plantilla_push: plantillaPush,
        cumpleanos_plantilla_ventana: plantillaVentana,
        cumpleanos_plantilla_correo_asunto: plantillaCorreoAsunto,
        cumpleanos_plantilla_correo_cuerpo: plantillaCorreoCuerpo,
        cumpleanos_plantilla_mensaje_sistema: plantillaMensajeSistema,
      });
      Swal.fire({
        title: 'Guardado',
        text: 'Las plantillas de cumpleaños se guardaron correctamente.',
        icon: 'success',
        timer: 2200,
        showConfirmButton: false,
      });
    } catch (e) {
      console.error(e);
      Swal.fire({
        title: 'Error',
        text: e.response?.data?.error || 'No se pudo guardar',
        icon: 'error',
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
            Definí el contenido de cada canal. <strong>Modal al iniciar sesión</strong>, <strong>correo</strong> y{' '}
            <strong>mensajes</strong> usan editor enriquecido (negritas, colores, imágenes). El ícono de torta en el menú
            es el emoji <code className="admin-config-cumpleanos__inline-code">🎂</code> (Unicode U+1F382); podés
            insertarlo desde el teclado o copiarlo aquí.
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
                {c.activo ? (
                  <span className="admin-config-cumpleanos__pill admin-config-cumpleanos__pill--on">Activo</span>
                ) : (
                  <span className="admin-config-cumpleanos__pill">Próximo</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </header>

      <div className="admin-config-cumpleanos__grid">
        <section className="admin-config-cumpleanos__card admin-config-cumpleanos__card--accent admin-config-cumpleanos__card--push">
          <div className="admin-config-cumpleanos__card-head">
            <span className="admin-config-cumpleanos__card-icon" aria-hidden>
              📱
            </span>
            <div>
              <h2 className="admin-config-cumpleanos__card-title">Notificación push</h2>
              <p className="admin-config-cumpleanos__card-destino">→ Alerta en el dispositivo (PWA)</p>
            </div>
          </div>
          <p className="admin-config-cumpleanos__hint">
            Solo texto plano: dos líneas (primera = título, resto = cuerpo). Una sola línea usa título corto fijo.
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
            <span className="admin-config-cumpleanos__card-icon" aria-hidden>
              🪟
            </span>
            <div>
              <h2 className="admin-config-cumpleanos__card-title">Modal al iniciar sesión</h2>
              <p className="admin-config-cumpleanos__card-destino">→ Ventana al ingresar (con fondo festivo)</p>
            </div>
          </div>
          <p className="admin-config-cumpleanos__hint">
            Se muestra cuando hay cumpleaños hoy en tu alcance. Usá imágenes con el botón de la barra; se suben al mismo
            servidor que los mensajes.
          </p>
          {hintPlaceholders}
          <div className="admin-config-cumpleanos__quill-wrap">
            <ReactQuill
              ref={quillVentanaRef}
              theme="snow"
              value={plantillaVentana}
              onChange={setPlantillaVentana}
              modules={QUILL_MODULES}
              formats={QUILL_FORMATS}
              placeholder="Escribí el contenido del modal…"
              className="admin-config-cumpleanos__quill"
            />
          </div>
        </section>

        <section className="admin-config-cumpleanos__card admin-config-cumpleanos__card--accent admin-config-cumpleanos__card--correo">
          <div className="admin-config-cumpleanos__card-head">
            <span className="admin-config-cumpleanos__card-icon" aria-hidden>
              ✉️
            </span>
            <div>
              <h2 className="admin-config-cumpleanos__card-title">Correo electrónico</h2>
              <p className="admin-config-cumpleanos__card-destino">→ Bandeja de correo del usuario</p>
            </div>
          </div>
          <p className="admin-config-cumpleanos__hint">El asunto va en una línea; el cuerpo admite HTML enriquecido.</p>
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
          <div className="admin-config-cumpleanos__quill-wrap">
            <ReactQuill
              ref={quillCorreoRef}
              theme="snow"
              value={plantillaCorreoCuerpo}
              onChange={setPlantillaCorreoCuerpo}
              modules={QUILL_MODULES}
              formats={QUILL_FORMATS}
              placeholder="Cuerpo del correo…"
              className="admin-config-cumpleanos__quill"
            />
          </div>
        </section>

        <section className="admin-config-cumpleanos__card admin-config-cumpleanos__card--accent admin-config-cumpleanos__card--mensaje">
          <div className="admin-config-cumpleanos__card-head">
            <span className="admin-config-cumpleanos__card-icon" aria-hidden>
              💬
            </span>
            <div>
              <h2 className="admin-config-cumpleanos__card-title">Mensaje al sistema</h2>
              <p className="admin-config-cumpleanos__card-destino">→ Bandeja de mensajes de la intranet</p>
            </div>
          </div>
          <p className="admin-config-cumpleanos__hint">Plantilla HTML para el aviso automático en mensajes internos.</p>
          {hintPlaceholders}
          <div className="admin-config-cumpleanos__quill-wrap">
            <ReactQuill
              ref={quillMensajeRef}
              theme="snow"
              value={plantillaMensajeSistema}
              onChange={setPlantillaMensajeSistema}
              modules={QUILL_MODULES}
              formats={QUILL_FORMATS}
              placeholder="Contenido del mensaje del sistema…"
              className="admin-config-cumpleanos__quill"
            />
          </div>
        </section>
      </div>

      <div className="admin-config-cumpleanos__footer-bar">
        <button type="button" className="admin-config-cumpleanos__btn" onClick={restaurarEjemplos} disabled={saving}>
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
