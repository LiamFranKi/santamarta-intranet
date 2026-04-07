import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import DOMPurify from 'dompurify';
import api from '../../services/api';
import Swal from 'sweetalert2';
import { procesarHTMLMensaje } from '../../utils/mensajesHtml';
import {
  previewPushTituloCuerpo,
  previewHtmlPlantilla,
  previewTextoAsunto,
  MUESTRA_CUMPLEANOS,
  mesActualNombre,
} from '../../utils/cumpleanosPlantillaPreview';
import './AdminConfigCumpleanos.css';

const DEFAULTS = {
  push: '🎂 Cumpleaños de hoy\n{nombre} — {colegio}',
  ventana: `<h2>¡Feliz cumpleaños! 🎂</h2>
<p>Hola <strong>{nombre}</strong>,</p>
<p><strong>{colegio}</strong> te desea un gran día. Mes: <em>{mes}</em></p>`,
  correoAsunto: '🎂 ¡Feliz cumpleaños, {nombre}! — {colegio}',
  correoCuerpo: `<p>Estimado/a <strong>{nombre}</strong>,</p>
<p>Desde <strong>{colegio}</strong> te enviamos un saludo muy especial en tu día.</p>
<p>¡Que lo disfrutes!</p>`,
  mensajeSistema:
    '<p>🎂 <strong>{colegio}</strong> te saluda por tu cumpleaños, <strong>{nombre}</strong>. Mes: {mes}.</p>',
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
      'Ejemplo abajo. En el envío real, {nombre} lista a quienes cumplen hoy en el alcance de ese aviso. Primera línea = título.',
    activo: true,
  },
  {
    id: 'ventana',
    emoji: '🪟',
    titulo: 'Ventana al iniciar sesión',
    destino: 'Modal al login',
    descripcion:
      'Solo si tu usuario cumple años hoy (fecha en ficha). {nombre} = tu nombre. Título y texto salen solo de esta plantilla.',
    activo: true,
  },
  {
    id: 'correo',
    emoji: '✉️',
    titulo: 'Correo electrónico',
    destino: 'Bandeja de email',
    descripcion:
      'Ejemplo de asunto y cuerpo; {nombre} = el cumpleañero cuando exista envío automático.',
    activo: false,
  },
  {
    id: 'mensaje',
    emoji: '💬',
    titulo: 'Mensaje al sistema',
    destino: 'Mensajes de la intranet',
    descripcion:
      'Ejemplo para el aviso en mensajes internos; {nombre} = el cumpleañero cuando se conecte el envío.',
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
  /** null | 'push' | 'ventana' | 'correo' | 'mensaje' */
  const [previewAbierto, setPreviewAbierto] = useState(null);

  const quillVentanaRef = useRef(null);
  const quillCorreoRef = useRef(null);
  const quillMensajeRef = useRef(null);

  useEffect(() => {
    const cargar = async () => {
      try {
        setLoading(true);
        const { data } = await api.get('/admin/configuracion');
        const str = (k) => (typeof data[k] === 'string' ? data[k] : '');
        setPlantillaPush(str('cumpleanos_plantilla_push').trim() || DEFAULTS.push);
        setPlantillaVentana(
          ensureHtmlForQuill(str('cumpleanos_plantilla_ventana')) || DEFAULTS.ventana
        );
        setPlantillaCorreoAsunto(
          str('cumpleanos_plantilla_correo_asunto').trim() || DEFAULTS.correoAsunto
        );
        setPlantillaCorreoCuerpo(
          ensureHtmlForQuill(str('cumpleanos_plantilla_correo_cuerpo')) || DEFAULTS.correoCuerpo
        );
        setPlantillaMensajeSistema(
          ensureHtmlForQuill(str('cumpleanos_plantilla_mensaje_sistema')) || DEFAULTS.mensajeSistema
        );
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

  const cerrarPreview = () => setPreviewAbierto(null);

  const leyendaMuestra = (
    <p className="admin-config-cumpleanos__preview-leyenda">
      {previewAbierto === 'push' ? (
        <>
          En el <strong>push</strong>, <code>{'{nombre}'}</code> se sustituye por una lista de cumpleañeros (ej.:{' '}
          <em>{MUESTRA_CUMPLEANOS.nombreListaPush}</em>). <code>{'{colegio}'}</code> → {MUESTRA_CUMPLEANOS.colegio};{' '}
          <code>{'{mes}'}</code> → {mesActualNombre()}.
        </>
      ) : (
        <>
          Datos de ejemplo: <code>{'{nombre}'}</code> → {MUESTRA_CUMPLEANOS.nombreUno}; <code>{'{colegio}'}</code> →{' '}
          {MUESTRA_CUMPLEANOS.colegio}; <code>{'{mes}'}</code> → {mesActualNombre()}.
        </>
      )}
    </p>
  );

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
            Cada bloque tiene <strong>ejemplos</strong> que podés editar. En <strong>modal</strong>, <strong>correo</strong> y{' '}
            <strong>mensaje</strong>, <code>{'{nombre}'}</code> es el <strong>cumpleañero</strong> (una persona). En{' '}
            <strong>push</strong>, <code>{'{nombre}'}</code> es la lista de quienes cumplen hoy en el alcance de ese aviso.
            El menú lateral usa el emoji <code className="admin-config-cumpleanos__inline-code">🎂</code> (U+1F382).
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
            Texto plano: dos líneas (primera = título del push, resto = cuerpo). Una sola línea usa título corto fijo en el
            servidor.
          </p>
          {hintPlaceholders}
          <div className="admin-config-cumpleanos__preview-row">
            <button
              type="button"
              className="admin-config-cumpleanos__btn-preview"
              onClick={() => setPreviewAbierto('push')}
            >
              Ver ejemplo (push)
            </button>
          </div>
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
            Todo lo que ves en el modal (títulos, emojis, párrafos) lo definís acá. Imágenes: botón de la barra (mismo
            servidor que mensajes).
          </p>
          <p className="admin-config-cumpleanos__hint admin-config-cumpleanos__hint--note">
            Solo aparece si <strong>hoy es tu cumpleaños</strong> según la fecha de nacimiento del alumno, personal o
            apoderado vinculado a tu usuario. Si ya pulsaste Entendido, no se repite hasta mañana en este navegador.{' '}
            <strong>Reiniciar PM2 no vuelve a mostrarlo</strong> (no hace falta tocar la base de datos: el cierre se guarda
            en el navegador). Para probar de nuevo: ventana privada, borrar datos del sitio o esperar al día siguiente.
          </p>
          {hintPlaceholders}
          <div className="admin-config-cumpleanos__preview-row">
            <button
              type="button"
              className="admin-config-cumpleanos__btn-preview"
              onClick={() => setPreviewAbierto('ventana')}
            >
              Ver ejemplo (modal)
            </button>
          </div>
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
          <div className="admin-config-cumpleanos__preview-row">
            <button
              type="button"
              className="admin-config-cumpleanos__btn-preview"
              onClick={() => setPreviewAbierto('correo')}
            >
              Ver ejemplo (correo)
            </button>
          </div>
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
          <div className="admin-config-cumpleanos__preview-row">
            <button
              type="button"
              className="admin-config-cumpleanos__btn-preview"
              onClick={() => setPreviewAbierto('mensaje')}
            >
              Ver ejemplo (mensaje al sistema)
            </button>
          </div>
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

      {previewAbierto &&
        createPortal(
          <div
            className="admin-cumple-preview-overlay"
            role="dialog"
            aria-modal="true"
            aria-label="Vista previa de plantilla"
            onClick={cerrarPreview}
          >
            <div className="admin-cumple-preview-dialog" onClick={(e) => e.stopPropagation()}>
              <div className="admin-cumple-preview-dialog__head">
                <h2 className="admin-cumple-preview-dialog__title">
                  {previewAbierto === 'push' && 'Vista previa: notificación push'}
                  {previewAbierto === 'ventana' && 'Vista previa: modal al iniciar sesión'}
                  {previewAbierto === 'correo' && 'Vista previa: correo electrónico'}
                  {previewAbierto === 'mensaje' && 'Vista previa: mensaje al sistema'}
                </h2>
                <button
                  type="button"
                  className="admin-cumple-preview-dialog__close"
                  onClick={cerrarPreview}
                  aria-label="Cerrar"
                >
                  ×
                </button>
              </div>
              {leyendaMuestra}

              {previewAbierto === 'push' && (() => {
                const { titulo, cuerpo } = previewPushTituloCuerpo(plantillaPush);
                return (
                  <div className="admin-cumple-preview-push-wrap">
                    <div className="admin-cumple-preview-push-card">
                      <div className="admin-cumple-preview-push-icon" aria-hidden>
                        🎂
                      </div>
                      <div className="admin-cumple-preview-push-text">
                        <div className="admin-cumple-preview-push-title">{titulo}</div>
                        <div className="admin-cumple-preview-push-body">{cuerpo}</div>
                      </div>
                    </div>
                    <p className="admin-cumple-preview-push-hint">
                      Aproximación del título y cuerpo que usa el servidor (primera línea = título si hay salto de línea).
                    </p>
                  </div>
                );
              })()}

              {(previewAbierto === 'ventana' || previewAbierto === 'mensaje') &&
                (() => {
                  const raw =
                    previewAbierto === 'ventana' ? plantillaVentana : plantillaMensajeSistema;
                  const html = previewHtmlPlantilla(raw);
                  const safe = DOMPurify.sanitize(procesarHTMLMensaje(html), {
                    USE_PROFILES: { html: true },
                    ADD_ATTR: ['style', 'target', 'rel', 'class'],
                  });
                  return (
                    <div
                      className={
                        previewAbierto === 'ventana'
                          ? 'admin-cumple-preview-ventana admin-cumple-preview-ventana--modal'
                          : 'admin-cumple-preview-ventana admin-cumple-preview-ventana--mensaje'
                      }
                    >
                      {previewAbierto === 'ventana' && (
                        <div className="admin-cumple-preview-fiesta" aria-hidden="true">
                          <span className="admin-cumple-preview-fiesta__balloon admin-cumple-preview-fiesta__balloon--1">
                            🎈
                          </span>
                          <span className="admin-cumple-preview-fiesta__balloon admin-cumple-preview-fiesta__balloon--2">
                            🎈
                          </span>
                          <span className="admin-cumple-preview-fiesta__balloon admin-cumple-preview-fiesta__balloon--3">
                            🎈
                          </span>
                          <span className="admin-cumple-preview-fiesta__confetti admin-cumple-preview-fiesta__confetti--1" />
                          <span className="admin-cumple-preview-fiesta__confetti admin-cumple-preview-fiesta__confetti--2" />
                          <span className="admin-cumple-preview-fiesta__confetti admin-cumple-preview-fiesta__confetti--3" />
                          <span className="admin-cumple-preview-fiesta__confetti admin-cumple-preview-fiesta__confetti--4" />
                          <span className="admin-cumple-preview-fiesta__confetti admin-cumple-preview-fiesta__confetti--5" />
                          <span className="admin-cumple-preview-fiesta__confetti admin-cumple-preview-fiesta__confetti--6" />
                        </div>
                      )}
                      {previewAbierto === 'mensaje' && (
                        <p className="admin-cumple-preview-bandeja-label">Bandeja de mensajes (contenido del aviso)</p>
                      )}
                      <div
                        className="admin-cumple-preview-ventana__body ql-editor"
                        dangerouslySetInnerHTML={{ __html: safe }}
                      />
                    </div>
                  );
                })()}

              {previewAbierto === 'correo' &&
                (() => {
                  const asunto = previewTextoAsunto(plantillaCorreoAsunto);
                  const html = previewHtmlPlantilla(plantillaCorreoCuerpo);
                  const safe = DOMPurify.sanitize(procesarHTMLMensaje(html), {
                    USE_PROFILES: { html: true },
                    ADD_ATTR: ['style', 'target', 'rel', 'class'],
                  });
                  return (
                    <div className="admin-cumple-preview-correo">
                      <div className="admin-cumple-preview-correo__meta">
                        <strong>Asunto:</strong> {asunto}
                      </div>
                      <div className="admin-cumple-preview-correo__cuerpo ql-editor" dangerouslySetInnerHTML={{ __html: safe }} />
                    </div>
                  );
                })()}

              <div className="admin-cumple-preview-dialog__actions">
                <button type="button" className="admin-config-cumpleanos__btn admin-config-cumpleanos__btn--primary" onClick={cerrarPreview}>
                  Cerrar
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

export default AdminConfigCumpleanos;
