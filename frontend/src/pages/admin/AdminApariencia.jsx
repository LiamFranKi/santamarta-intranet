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

function FotoCaja({ etiqueta, ayuda, src, vacio, onArchivo }) {
  return (
    <div className="ap-foto">
      <div className={`ap-foto-marco${src ? '' : ' is-vacia'}`}>
        {src ? <img src={src} alt={etiqueta} /> : <span>{vacio}</span>}
      </div>
      <div className="ap-color-texto">
        <strong>{etiqueta}</strong>
        <p>{ayuda}</p>
        <input type="file" accept=".jpg,.jpeg,.png" onChange={(e) => onArchivo(e.target.files?.[0] || null)} />
      </div>
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

        <h3 className="ap-titulo">Fondo del login y colores</h3>
        <p className="ap-nota">El cuadrado es el color. Se hace clic encima para cambiarlo. Si dice «Color de siempre», todavía no hay uno elegido.</p>
        <div className="ap-colores">
          <div className="ap-color ap-color-modo">
            <div className="ap-color-texto">
              <strong>Fondo del login</strong>
              <p>Color o una foto detrás del formulario de ingreso.</p>
              <select
                value={datos.login_fondo_modo}
                onChange={(e) => setDatos((p) => ({ ...p, login_fondo_modo: e.target.value }))}
              >
                <option value="color">Color</option>
                <option value="imagen">Imagen</option>
              </select>
            </div>
          </div>
          <FotoCaja
            etiqueta="Imagen del login"
            ayuda="Se usa cuando el fondo del login está en Imagen. JPG o PNG."
            src={datos.login_fondo ? urlMedia(datos.login_fondo) : ''}
            vacio="Todavía no hay imagen"
            onArchivo={setArchivo}
          />
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
          <div className="ap-color ap-color-modo">
            <div className="ap-color-texto">
              <strong>Fondo del centro</strong>
              <p>El área de trabajo de la intranet, no la página web.</p>
              <select
                value={datos.intranet_fondo_modo}
                onChange={(e) => setDatos((p) => ({ ...p, intranet_fondo_modo: e.target.value }))}
              >
                <option value="color">Color</option>
                <option value="imagen">Imagen</option>
              </select>
            </div>
          </div>
          <ColorFila
            etiqueta="Color del centro"
            ayuda="Se usa cuando el fondo del centro está en Color."
            valor={datos.color_fondo}
            sugerido="#f5f6fa"
            onChange={(color) => setDatos((p) => ({ ...p, color_fondo: color }))}
          />
          <FotoCaja
            etiqueta="Imagen del centro"
            ayuda="Se usa cuando el fondo del centro está en Imagen."
            src={datos.intranet_fondo ? urlMedia(datos.intranet_fondo) : ''}
            vacio="Todavía no hay imagen"
            onArchivo={setArchivoIntranet}
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
        <div className="card-actions">
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
              Quitar imagen de fondo
            </button>
          ) : null}
          {datos.intranet_fondo ? (
            <button
              type="button"
              className="btn-submit-card"
              disabled={guardando || !listo}
              onClick={() => aplicar({ quitar_fondo_intranet: '1', intranet_fondo_modo: 'color' })}
            >
              Quitar imagen del centro
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
