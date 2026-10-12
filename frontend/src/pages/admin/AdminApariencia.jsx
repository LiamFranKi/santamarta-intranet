import React, { useCallback, useEffect, useState } from 'react';
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

        <h3 className="ap-titulo">Botón Intranet de la página web</h3>
        <div className="form-group">
          <label>Dirección de la intranet</label>
          <input
            type="url"
            value={datos.web_intranet_url}
            placeholder="https://sistema.vanguardschools.edu.pe"
            onChange={(e) => setDatos((p) => ({ ...p, web_intranet_url: e.target.value }))}
          />
          <small>
            El botón Intranet de la página abre esta dirección. En Santa Marta, por ejemplo,
            http://89.117.52.9:8080. Si se deja vacío, la web de Vanguard sigue yendo a la intranet de siempre.
          </small>
        </div>

        <h3 className="ap-titulo">Fondo del login y colores</h3>
        <div className="form-grid">
          <div className="form-group">
            <label>Fondo del login</label>
            <select
              value={datos.login_fondo_modo}
              onChange={(e) => setDatos((p) => ({ ...p, login_fondo_modo: e.target.value }))}
            >
              <option value="color">Color</option>
              <option value="imagen">Imagen</option>
            </select>
          </div>
          <div className="form-group">
            <label>Imagen de fondo</label>
            {datos.login_fondo ? (
              <div className="file-preview">
                <img src={urlMedia(datos.login_fondo)} alt="Fondo actual del login" />
              </div>
            ) : null}
            <input type="file" accept=".jpg,.jpeg,.png" onChange={(e) => setArchivo(e.target.files?.[0] || null)} />
            <small>Se usa cuando el fondo está en Imagen. JPG o PNG.</small>
          </div>
          <div className="form-group">
            <label>Color del menú lateral</label>
            <input
              type="color"
              value={datos.color_primario || '#375b81'}
              onChange={(e) => setDatos((p) => ({ ...p, color_primario: e.target.value }))}
            />
            <small>La barra de la izquierda. Vacío, se queda el azul de siempre.</small>
          </div>
          <div className="form-group">
            <label>Color de la barra superior</label>
            <input
              type="color"
              value={datos.color_navbar || '#d7eafe'}
              onChange={(e) => setDatos((p) => ({ ...p, color_navbar: e.target.value }))}
            />
            <small>La franja de arriba, donde está el nombre.</small>
          </div>
          <div className="form-group">
            <label>Fondo del centro</label>
            <select
              value={datos.intranet_fondo_modo}
              onChange={(e) => setDatos((p) => ({ ...p, intranet_fondo_modo: e.target.value }))}
            >
              <option value="color">Color</option>
              <option value="imagen">Imagen</option>
            </select>
          </div>
          <div className="form-group">
            <label>Color del centro</label>
            <input
              type="color"
              value={datos.color_fondo || '#f5f6fa'}
              onChange={(e) => setDatos((p) => ({ ...p, color_fondo: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label>Imagen del centro</label>
            {datos.intranet_fondo ? (
              <div className="file-preview">
                <img src={urlMedia(datos.intranet_fondo)} alt="Fondo del centro" />
              </div>
            ) : null}
            <input type="file" accept=".jpg,.jpeg,.png" onChange={(e) => setArchivoIntranet(e.target.files?.[0] || null)} />
            <small>Se usa cuando el fondo del centro está en Imagen.</small>
          </div>
          <div className="form-group">
            <label>Color secundario</label>
            <input
              type="color"
              value={datos.color_secundario || '#4a83c1'}
              onChange={(e) => setDatos((p) => ({ ...p, color_secundario: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label>Acento</label>
            <input
              type="color"
              value={datos.color_acento || '#2563eb'}
              onChange={(e) => setDatos((p) => ({ ...p, color_acento: e.target.value }))}
            />
          </div>
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
