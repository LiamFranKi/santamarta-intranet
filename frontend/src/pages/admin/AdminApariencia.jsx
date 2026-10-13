import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import Swal from 'sweetalert2';
import { invalidarIdentidadColegio } from '../../utils/identidadColegio';
import { useColegio } from '../../context/ColegioContext';
import './AdminApariencia.css';

const LOGINS = [
  { id: 'actual', nombre: 'Actual', texto: 'El de hoy: panel con el asistente y el formulario al lado.' },
  { id: 'partido', nombre: 'Partido', texto: 'Foto a un lado y el formulario al otro. Sin la lista del asistente.' },
  { id: 'tarjeta', nombre: 'Tarjeta', texto: 'Imagen de fondo y el formulario flotando al centro.' },
  { id: 'amplio', nombre: 'Amplio', texto: 'Mucho aire, logo arriba y el formulario debajo.' },
  { id: 'compacto', nombre: 'Compacto', texto: 'Formulario pequeño sobre el fondo. Sin panel lateral.' },
];

const WEBS = [
  { id: 'actual', nombre: 'Actual', texto: 'Menú blanco arriba y el banner a pantalla completa debajo.' },
  { id: 'barra', nombre: 'Barra', texto: 'Franja de color arriba y el menú debajo, separado del banner.' },
  { id: 'sobre-banner', nombre: 'Sobre el banner', texto: 'El menú flota encima de la foto, que ocupa toda la portada.' },
  { id: 'editorial', nombre: 'Editorial', texto: 'Logo al centro, menú debajo y un banner más bajo.' },
  { id: 'tarjetas', nombre: 'Tarjetas', texto: 'El banner queda dentro de un marco, con el menú arriba.' },
  { id: 'sobrio', nombre: 'Sobrio', texto: 'Menú compacto y un banner corto, con más texto a la vista.' },
];

const VACIO = {
  login_plantilla: 'actual',
  login_fondo_modo: 'color',
  login_fondo: '',
  web_plantilla: 'actual',
  color_primario: '',
  color_secundario: '',
  color_acento: '',
  color_navbar: '',
  color_fondo: '',
  intranet_fondo_modo: 'color',
  intranet_fondo: '',
  web_intranet_url: '',
  web_titulo: '',
};

function ColorFila({ etiqueta, ayuda, valor, sugerido, onChange }) {
  const activo = /^#[0-9a-fA-F]{6}$/.test(String(valor || ''));
  const muestra = activo ? valor : sugerido;
  return (
    <div className="ap-color">
      <label className="ap-color-muestra" style={{ background: muestra }} title={muestra}>
        <input
          type="color"
          value={muestra}
          onChange={(e) => onChange(e.target.value)}
          aria-label={etiqueta}
        />
      </label>
      <div className="ap-color-texto">
        <strong>{etiqueta}</strong>
        <p>{ayuda}</p>
        <div className="ap-color-linea">
          <code>{activo ? String(valor).toUpperCase() : 'Color de siempre'}</code>
          {activo ? (
            <button type="button" className="ap-color-quitar" onClick={() => onChange('')}>
              Quitar
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function VistaFoto({ src, vacio }) {
  const [rota, setRota] = useState(false);
  useEffect(() => { setRota(false); }, [src]);
  if (!src || rota) {
    return <div className="ap-vista is-vacia"><span>{rota ? 'Esta foto no se puede abrir. Elige otra.' : vacio}</span></div>;
  }
  return (
    <div className="ap-vista">
      <img src={src} alt="" onError={() => setRota(true)} />
    </div>
  );
}

function urlMedia(ruta) {
  const raw = String(ruta || '');
  if (!raw) return '';
  if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('blob:')) return raw;
  const host = window.location.hostname;
  const local = host === 'localhost' || host === '127.0.0.1';
  const origen = local ? 'http://localhost:5000' : window.location.origin;
  return `${origen}${raw.startsWith('/') ? raw : `/${raw}`}`;
}

function MiniLogin({ id }) {
  if (id === 'partido') {
    return (
      <div className="ap-mini ap-mini-partido">
        <div className="ap-mini-foto" />
        <div className="ap-mini-form" />
      </div>
    );
  }
  if (id === 'tarjeta') {
    return (
      <div className="ap-mini ap-mini-foto-full">
        <div className="ap-mini-tarjeta" />
      </div>
    );
  }
  if (id === 'amplio') {
    return (
      <div className="ap-mini ap-mini-claro">
        <div className="ap-mini-logo" />
        <div className="ap-mini-form ap-mini-form-sola" />
      </div>
    );
  }
  if (id === 'compacto') {
    return (
      <div className="ap-mini ap-mini-foto-full">
        <div className="ap-mini-form ap-mini-form-chica" />
      </div>
    );
  }
  return (
    <div className="ap-mini ap-mini-actual">
      <div className="ap-mini-lado" />
      <div className="ap-mini-form" />
    </div>
  );
}

function MiniWeb({ id }) {
  if (id === 'sobre-banner') {
    return (
      <div className="ap-mini ap-mini-foto-full">
        <div className="ap-mini-menu ap-mini-menu-sobre" />
      </div>
    );
  }
  if (id === 'barra') {
    return (
      <div className="ap-mini">
        <div className="ap-mini-franja" />
        <div className="ap-mini-menu" />
        <div className="ap-mini-banner" />
      </div>
    );
  }
  if (id === 'tarjetas') {
    return (
      <div className="ap-mini ap-mini-claro">
        <div className="ap-mini-menu" />
        <div className="ap-mini-banner ap-mini-banner-marco" />
      </div>
    );
  }
  if (id === 'editorial') {
    return (
      <div className="ap-mini">
        <div className="ap-mini-logo ap-mini-logo-centro" />
        <div className="ap-mini-menu" />
        <div className="ap-mini-banner ap-mini-banner-bajo" />
      </div>
    );
  }
  if (id === 'sobrio') {
    return (
      <div className="ap-mini">
        <div className="ap-mini-menu ap-mini-menu-bajo" />
        <div className="ap-mini-banner ap-mini-banner-bajo" />
      </div>
    );
  }
  return (
    <div className="ap-mini">
      <div className="ap-mini-menu" />
      <div className="ap-mini-banner" />
    </div>
  );
}

export default function AdminApariencia() {
  const { recargarColegio } = useColegio();
  const [datos, setDatos] = useState(VACIO);
  const [archivo, setArchivo] = useState(null);
  const [archivoIntranet, setArchivoIntranet] = useState(null);
  const [prevLogin, setPrevLogin] = useState('');
  const [prevCentro, setPrevCentro] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [listo, setListo] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const { data } = await api.get('/admin/apariencia');
      setDatos({
        ...VACIO,
        ...data,
        login_fondo: data?.login_fondo || '',
        intranet_fondo: data?.intranet_fondo || '',
        web_intranet_url: data?.web_intranet_url || '',
        web_titulo: data?.web_titulo || '',
      });
      setListo(true);
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'No se pudo abrir la apariencia', text: e.response?.data?.error || '' });
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const aplicar = async (parcial, file, fileIntranet) => {
    setGuardando(true);
    try {
      const fd = new FormData();
      const junto = { ...datos, ...parcial };
      fd.append('login_plantilla', junto.login_plantilla || 'actual');
      fd.append('web_plantilla', junto.web_plantilla || 'actual');
      fd.append('login_fondo_modo', junto.login_fondo_modo || 'color');
      fd.append('color_primario', junto.color_primario || '');
      fd.append('color_secundario', junto.color_secundario || '');
      fd.append('color_acento', junto.color_acento || '');
      fd.append('color_navbar', junto.color_navbar || '');
      fd.append('color_fondo', junto.color_fondo || '');
      fd.append('intranet_fondo_modo', junto.intranet_fondo_modo || 'color');
      fd.append('web_intranet_url', junto.web_intranet_url || '');
      fd.append('web_titulo', junto.web_titulo || '');
      if (parcial?.quitar_fondo) fd.append('quitar_fondo', '1');
      else if (file) fd.append('login_fondo', file);
      if (parcial?.quitar_fondo_intranet) fd.append('quitar_fondo_intranet', '1');
      else if (fileIntranet) fd.append('intranet_fondo', fileIntranet);
      const { data } = await api.put('/admin/apariencia', fd);
      setDatos({
        ...VACIO,
        ...data,
        login_fondo: data?.login_fondo || '',
        intranet_fondo: data?.intranet_fondo || '',
        web_intranet_url: data?.web_intranet_url || '',
        web_titulo: data?.web_titulo || '',
      });
      setArchivo(null);
      setArchivoIntranet(null);
      invalidarIdentidadColegio();
      recargarColegio?.();
      Swal.fire({
        icon: 'success',
        title: 'Apariencia actualizada',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 1600,
      });
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'No se guardó', text: e.response?.data?.error || '' });
    } finally {
      setGuardando(false);
    }
  };

  const elegirLogin = (id) => aplicar({ login_plantilla: id });
  const elegirWeb = (id) => aplicar({ web_plantilla: id });

  return (
    <div className="config-panel-card config-panel-card--spaced">
      <div className="config-panel-card-header config-panel-card-header--sky">
        <span className="config-panel-card-ico" aria-hidden="true">◈</span>
        Apariencia
      </div>
      <div className="config-section">
        <p className="config-section-hint">
          El diseño de ahora queda como predeterminado. Elija otra tarjeta para cambiar el login o la portada.
          La intranet mantiene su menú. Los colores, si los elige, pintan el ingreso y la barra lateral.
        </p>

        <h3 className="ap-titulo">Login</h3>
        <div className="ap-galeria">
          {LOGINS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`ap-tarjeta${datos.login_plantilla === item.id ? ' is-on' : ''}`}
              onClick={() => elegirLogin(item.id)}
              disabled={guardando || !listo}
            >
              <MiniLogin id={item.id} />
              <strong>
                {item.nombre}
                {datos.login_plantilla === item.id ? ' · en uso' : ''}
              </strong>
              <span>{item.texto}</span>
            </button>
          ))}
        </div>

        <h3 className="ap-titulo">Página web</h3>
        <div className="ap-galeria">
          {WEBS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`ap-tarjeta${datos.web_plantilla === item.id ? ' is-on' : ''}`}
              onClick={() => elegirWeb(item.id)}
              disabled={guardando || !listo}
            >
              <MiniWeb id={item.id} />
              <strong>
                {item.nombre}
                {datos.web_plantilla === item.id ? ' · en uso' : ''}
              </strong>
              <span>{item.texto}</span>
            </button>
          ))}
        </div>

        <div className="ap-guia">
          <strong>Dónde se cambian las imágenes de la página web</strong>
          <p>
            El logo del menú de la página es el <b>Logo a color</b> de Información general, la tarjeta de arriba.
            El <b>Logo blanco</b> es el del pie oscuro de la página.
          </p>
          <p>
            La foto grande del inicio (el campo, detrás de Contáctanos) no está aquí. Se cambia en el menú{' '}
            <Link to="/admin/comunicaciones/web?tab=paginas&seccion=banner">Web → Páginas → Banner del inicio</Link>.
          </p>
          <p>
            En esta pantalla, la imagen de fondo es solo del login. La imagen del centro es el fondo de la intranet.
          </p>
        </div>

        <h3 className="ap-titulo">Título de la pestaña</h3>
        <div className="form-group">
          <label>Frase de la pestaña del navegador</label>
          <input
            type="text"
            maxLength={140}
            value={datos.web_titulo}
            placeholder="Santa Marta School"
            onChange={(e) => setDatos((p) => ({ ...p, web_titulo: e.target.value }))}
          />
          <small>
            Es el texto de la pestaña de la página web. Si escribes una frase, sale exactamente esa.
            Si lo dejas vacío, sale el Título / Nombre del Colegio. En Vanguard, vacío, sigue la frase de siempre.
          </small>
        </div>

        <h3 className="ap-titulo">Botón Intranet de la página web</h3>
        <div className="form-group">
          <label>Dirección de la intranet</label>
          <input
            type="url"
            value={datos.web_intranet_url}
            placeholder="https://intranet.del.colegio"
            onChange={(e) => setDatos((p) => ({ ...p, web_intranet_url: e.target.value }))}
          />
          <small>
            El botón Intranet de la página abre esta dirección. En Santa Marta es http://89.117.52.9:8080.
            Si el recuadro está vacío, la web de Vanguard sigue yendo a su intranet de siempre.
          </small>
        </div>

        <h3 className="ap-titulo">Pantalla de ingreso</h3>
        <p className="ap-nota">Es la página donde se escribe el usuario y la contraseña, antes de entrar a la intranet. No es la página web.</p>
        <section className="ap-bloque">
          <div className="ap-bloque-texto">
            <strong>Fondo de esa pantalla</strong>
            <p>Elige si detrás del formulario va un color de la plantilla o una foto que tú subes.</p>
            <label className="ap-elige">
              Qué se usa
              <select
                value={datos.login_fondo_modo}
                onChange={(e) => setDatos((p) => ({ ...p, login_fondo_modo: e.target.value }))}
              >
                <option value="color">El color de la plantilla</option>
                <option value="imagen">Una foto que yo subo</option>
              </select>
            </label>
            {datos.login_fondo_modo === 'imagen' ? (
              <label className="ap-elige">
                Foto del login
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    setArchivo(file);
                    setPrevLogin((anterior) => {
                      if (anterior) URL.revokeObjectURL(anterior);
                      return file ? URL.createObjectURL(file) : '';
                    });
                  }}
                />
                <small>{archivo ? `Se va a guardar: ${archivo.name}` : 'JPG o PNG. Después hay que pulsar Guardar.'}</small>
              </label>
            ) : (
              <p className="ap-aviso">Con esta opción no se usa ninguna foto. El fondo lo pone la plantilla de login que elegiste arriba.</p>
            )}
          </div>
          <VistaFoto
            src={datos.login_fondo_modo === 'imagen' ? (prevLogin || (datos.login_fondo ? urlMedia(datos.login_fondo) : '')) : ''}
            vacio={datos.login_fondo_modo === 'imagen' ? 'Todavía no hay foto. Elígela aquí arriba.' : 'Ahora no hay foto: se usa el color de la plantilla.'}
          />
        </section>

        <h3 className="ap-titulo">Área de trabajo de la intranet</h3>
        <p className="ap-nota">Es el espacio grande a la derecha del menú de la izquierda, donde se abren las páginas. No es la foto de la página web.</p>
        <section className="ap-bloque">
          <div className="ap-bloque-texto">
            <strong>Fondo de esa área</strong>
            <p>Si eliges un color, se pinta liso. Si eliges una foto, el archivo se elige aquí mismo.</p>
            <label className="ap-elige">
              Qué se usa
              <select
                value={datos.intranet_fondo_modo}
                onChange={(e) => setDatos((p) => ({ ...p, intranet_fondo_modo: e.target.value }))}
              >
                <option value="color">Un color</option>
                <option value="imagen">Una foto que yo subo</option>
              </select>
            </label>
            {datos.intranet_fondo_modo === 'imagen' ? (
              <label className="ap-elige">
                Foto del área de trabajo
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    setArchivoIntranet(file);
                    setPrevCentro((anterior) => {
                      if (anterior) URL.revokeObjectURL(anterior);
                      return file ? URL.createObjectURL(file) : '';
                    });
                  }}
                />
                <small>{archivoIntranet ? `Se va a guardar: ${archivoIntranet.name}` : 'JPG o PNG. Después hay que pulsar Guardar.'}</small>
              </label>
            ) : (
              <div className="ap-color ap-color-dentro">
                <label className="ap-color-muestra" style={{ background: datos.color_fondo || '#f5f6fa' }}>
                  <input
                    type="color"
                    value={datos.color_fondo || '#f5f6fa'}
                    aria-label="Color del área de trabajo"
                    onChange={(e) => setDatos((p) => ({ ...p, color_fondo: e.target.value }))}
                  />
                </label>
                <div className="ap-color-texto">
                  <strong>Color de esa área</strong>
                  <p>Haz clic en el cuadrado para cambiarlo.</p>
                  <div className="ap-color-linea">
                    <code>{datos.color_fondo ? String(datos.color_fondo).toUpperCase() : 'Color de siempre'}</code>
                    {datos.color_fondo ? (
                      <button type="button" className="ap-color-quitar" onClick={() => setDatos((p) => ({ ...p, color_fondo: '' }))}>
                        Quitar
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            )}
          </div>
          {datos.intranet_fondo_modo === 'imagen' ? (
            <VistaFoto
              src={prevCentro || (datos.intranet_fondo ? urlMedia(datos.intranet_fondo) : '')}
              vacio="Todavía no hay foto. Elígela aquí al lado."
            />
          ) : (
            <div className="ap-vista" style={{ background: datos.color_fondo || '#f5f6fa' }}>
              <span className="ap-vista-nota">Así se ve el color del área de trabajo</span>
            </div>
          )}
        </section>

        <h3 className="ap-titulo">Colores de la intranet</h3>
        <p className="ap-nota">El cuadrado es el color. Se hace clic encima para cambiarlo. Si dice «Color de siempre», todavía no hay uno elegido.</p>
        <div className="ap-colores">
          <ColorFila
            etiqueta="Color del menú lateral"
            ayuda="La barra de la izquierda."
            valor={datos.color_primario}
            sugerido="#375b81"
            onChange={(color) => setDatos((p) => ({ ...p, color_primario: color }))}
          />
          <ColorFila
            etiqueta="Color de la barra superior"
            ayuda="La franja de arriba, donde está el nombre."
            valor={datos.color_navbar}
            sugerido="#d7eafe"
            onChange={(color) => setDatos((p) => ({ ...p, color_navbar: color }))}
          />
          <ColorFila
            etiqueta="Color secundario"
            ayuda="El segundo color del círculo de la foto, arriba a la derecha."
            valor={datos.color_secundario}
            sugerido="#4a83c1"
            onChange={(color) => setDatos((p) => ({ ...p, color_secundario: color }))}
          />
          <ColorFila
            etiqueta="Acento"
            ayuda="La franja del menú que está seleccionado."
            valor={datos.color_acento}
            sugerido="#2563eb"
            onChange={(color) => setDatos((p) => ({ ...p, color_acento: color }))}
          />
        </div>
        <div className="ap-acciones">
          <button
            type="button"
            className="btn-submit-card"
            disabled={guardando || !listo}
            onClick={() => aplicar({}, archivo, archivoIntranet)}
          >
            {guardando ? 'Guardando…' : 'Guardar dirección, fondo y colores'}
          </button>
          {(datos.color_primario || datos.color_secundario || datos.color_acento || datos.color_navbar || datos.color_fondo) && (
            <button
              type="button"
              className="btn-submit-card"
              disabled={guardando || !listo}
              onClick={() => aplicar({
                color_primario: '',
                color_secundario: '',
                color_acento: '',
                color_navbar: '',
                color_fondo: '',
                intranet_fondo_modo: 'color',
              })}
            >
              Volver a los colores de siempre
            </button>
          )}
          {datos.login_fondo ? (
            <button
              type="button"
              className="btn-submit-card"
              disabled={guardando || !listo}
              onClick={() => aplicar({ quitar_fondo: '1' })}
            >
              Quitar la foto del login
            </button>
          ) : null}
          {datos.intranet_fondo ? (
            <button
              type="button"
              className="btn-submit-card"
              disabled={guardando || !listo}
              onClick={() => aplicar({ quitar_fondo_intranet: '1', intranet_fondo_modo: 'color' })}
            >
              Quitar la foto del área de trabajo
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
