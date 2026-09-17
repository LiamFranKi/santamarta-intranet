import React, { useCallback, useEffect, useState } from 'react';
import Swal from 'sweetalert2';
import api from '../../services/api';

const API = '/admin/reclamos-sugerencias';
const WEB = 'https://www.vanguardschools.com';

const COLORES = [
  { id: 'from-green-500 to-emerald-500', label: 'Verde' },
  { id: 'from-cyan-500 to-blue-500', label: 'Celeste' },
  { id: 'from-purple-500 to-pink-500', label: 'Morado' },
  { id: 'from-amber-500 to-orange-500', label: 'Naranja' },
  { id: 'from-sky-500 to-indigo-600', label: 'Azul' },
  { id: 'from-rose-500 to-pink-600', label: 'Rosa' },
  { id: 'from-slate-700 to-slate-900', label: 'Oscuro' },
];

const VACIO_PAGINA = {
  titulo: 'Convenios',
  subtitulo: 'Alianzas estratégicas para una educación integral',
  intro:
    'Trabajamos con instituciones reconocidas para ofrecer programas de excelencia que complementan nuestra formación académica.',
  cta_texto:
    '¿Interesado en nuestros convenios? Contáctanos para más información sobre cómo participar en estos programas.',
};

const swalOpts = {
  target: document.body,
  customClass: { container: 'rs-swal-over-modal' },
  didOpen: (popup) => {
    const root = popup?.closest?.('.swal2-container');
    if (root) root.style.setProperty('z-index', '250000', 'important');
  },
};

function TamanoFoto({ ancho, alto, extra }) {
  return (
    <p className="wp-tamano">
      Medida recomendada: <strong>{ancho} × {alto} px</strong>
      {extra ? <span> · {extra}</span> : null}
    </p>
  );
}

function ConvenioFoto({ ruta, alt, className }) {
  const [src, setSrc] = useState('');

  useEffect(() => {
    let obj;
    let alive = true;
    (async () => {
      if (!ruta) {
        setSrc('');
        return;
      }
      try {
        const res = await api.get(`${API}/paginas-niveles/archivo`, {
          params: { ruta },
          responseType: 'blob',
        });
        obj = URL.createObjectURL(res.data);
        if (alive) setSrc(obj);
      } catch {
        if (alive) setSrc(`${WEB}${ruta}`);
      }
    })();
    return () => {
      alive = false;
      if (obj) URL.revokeObjectURL(obj);
    };
  }, [ruta]);

  if (!src) {
    return (
      <div className={`${className} wp-foto--empty`} aria-hidden>
        Sin foto
      </div>
    );
  }
  return <img src={src} alt={alt} className={className} />;
}

export default function AdminWebConvenios() {
  const [pagina, setPagina] = useState(VACIO_PAGINA);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [uploading, setUploading] = useState('');
  const [error, setError] = useState('');
  const [necesitaMigracion, setNecesitaMigracion] = useState(false);

  const aplicarPayload = (data) => {
    setPagina({
      titulo: String(data.titulo || VACIO_PAGINA.titulo),
      subtitulo: String(data.subtitulo || VACIO_PAGINA.subtitulo),
      intro: String(data.intro || ''),
      cta_texto: String(data.cta_texto || VACIO_PAGINA.cta_texto),
    });
    setItems(Array.isArray(data.items) ? data.items : []);
    setNecesitaMigracion(Boolean(data.necesita_migracion_convenios));
  };

  const cargar = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const { data } = await api.get(`${API}/paginas-convenios`);
      aplicarPayload(data);
    } catch (e) {
      setError(e.response?.data?.error || 'Error al cargar Convenios');
      setNecesitaMigracion(e.response?.status === 503);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const setItemCampo = (id, key, value) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, [key]: value } : it)));
  };

  const guardarPagina = async () => {
    try {
      setSaving('pagina');
      const { data } = await api.put(`${API}/paginas-convenios`, pagina);
      aplicarPayload(data);
      Swal.fire({
        icon: 'success',
        title: 'Textos guardados',
        timer: 1400,
        showConfirmButton: false,
        ...swalOpts,
      });
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'No se pudo guardar',
        text: e.response?.data?.error || 'Error',
        ...swalOpts,
      });
      setNecesitaMigracion(e.response?.status === 503);
    } finally {
      setSaving('');
    }
  };

  const guardarItem = async (item) => {
    try {
      setSaving(`item-${item.id}`);
      const { data } = await api.put(`${API}/paginas-convenios/items/${item.id}`, {
        nombre: item.nombre,
        descripcion: item.descripcion,
        beneficios: item.beneficios,
        color: item.color,
        orden: item.orden,
        activo: item.activo,
      });
      aplicarPayload(data);
      Swal.fire({
        icon: 'success',
        title: 'Convenio guardado',
        timer: 1200,
        showConfirmButton: false,
        ...swalOpts,
      });
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'No se pudo guardar',
        text: e.response?.data?.error || 'Error',
        ...swalOpts,
      });
    } finally {
      setSaving('');
    }
  };

  const crearItem = async () => {
    try {
      setSaving('nuevo');
      const { data } = await api.post(`${API}/paginas-convenios/items`, {
        nombre: 'Nuevo convenio',
        descripcion: '',
        beneficios: '',
        color: 'from-green-500 to-emerald-500',
      });
      aplicarPayload(data);
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'No se pudo crear',
        text: e.response?.data?.error || 'Error',
        ...swalOpts,
      });
      setNecesitaMigracion(e.response?.status === 503);
    } finally {
      setSaving('');
    }
  };

  const eliminarItem = async (item) => {
    const ok = await Swal.fire({
      icon: 'warning',
      title: '¿Quitar este convenio?',
      text: item.nombre || 'Se eliminará de la web pública.',
      showCancelButton: true,
      confirmButtonText: 'Sí, quitar',
      cancelButtonText: 'Cancelar',
      ...swalOpts,
    });
    if (!ok.isConfirmed) return;
    try {
      setSaving(`del-${item.id}`);
      const { data } = await api.delete(`${API}/paginas-convenios/items/${item.id}`);
      aplicarPayload(data);
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'No se pudo eliminar',
        text: e.response?.data?.error || 'Error',
        ...swalOpts,
      });
    } finally {
      setSaving('');
    }
  };

  const subirImagen = async (id, slot, file) => {
    if (!file) return;
    const fd = new FormData();
    fd.append('slot', slot);
    fd.append('imagen', file);
    const key = `${id}-${slot}`;
    try {
      setUploading(key);
      const { data } = await api.post(`${API}/paginas-convenios/items/${id}/imagen`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      aplicarPayload(data);
      Swal.fire({
        icon: 'success',
        title: slot === 'logo' ? 'Logo actualizado' : 'Foto actualizada',
        timer: 1200,
        showConfirmButton: false,
        ...swalOpts,
      });
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'No se pudo subir',
        text: e.response?.data?.error || 'Error',
        ...swalOpts,
      });
    } finally {
      setUploading('');
    }
  };

  const subirPdf = async (id, file) => {
    if (!file) return;
    const fd = new FormData();
    fd.append('pdf', file);
    try {
      setUploading(`${id}-pdf`);
      const { data } = await api.post(`${API}/paginas-convenios/items/${id}/pdf`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      aplicarPayload(data);
      Swal.fire({
        icon: 'success',
        title: 'PDF actualizado',
        timer: 1200,
        showConfirmButton: false,
        ...swalOpts,
      });
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'No se pudo subir el PDF',
        text: e.response?.data?.error || 'Error',
        ...swalOpts,
      });
    } finally {
      setUploading('');
    }
  };

  if (loading) return <p className="rs-loading">Cargando convenios…</p>;

  return (
    <article className="wp-nivel-panel">
      <header className="wp-nivel-panel__head">
        <div>
          <p className="wp-kicker">Página pública</p>
          <h3>Convenios</h3>
          <p>Títulos, textos, logo, foto y PDF de cada alianza que se ve en la web.</p>
        </div>
        <a className="wp-web-link" href={`${WEB}/convenios`} target="_blank" rel="noopener noreferrer">
          Ver en la web
        </a>
      </header>

      {necesitaMigracion && (
        <p className="rs-error" style={{ textAlign: 'left' }}>
          Falta ejecutar <code>database/migrations/098_web_paginas_convenios_mysql.sql</code> en phpMyAdmin.
        </p>
      )}
      {error && !necesitaMigracion && <p className="rs-error">{error}</p>}

      <div className="wp-convenio-page">
        <label className="rs-field">
          <span>Título</span>
          <input
            value={pagina.titulo}
            maxLength={120}
            onChange={(e) => setPagina((p) => ({ ...p, titulo: e.target.value }))}
          />
        </label>
        <label className="rs-field">
          <span>Subtítulo</span>
          <input
            value={pagina.subtitulo}
            maxLength={255}
            onChange={(e) => setPagina((p) => ({ ...p, subtitulo: e.target.value }))}
          />
        </label>
        <label className="rs-field">
          <span>Texto de introducción</span>
          <textarea
            rows={3}
            value={pagina.intro}
            maxLength={800}
            onChange={(e) => setPagina((p) => ({ ...p, intro: e.target.value }))}
          />
        </label>
        <label className="rs-field">
          <span>Texto del recuadro final (contacto)</span>
          <textarea
            rows={2}
            value={pagina.cta_texto}
            maxLength={255}
            onChange={(e) => setPagina((p) => ({ ...p, cta_texto: e.target.value }))}
          />
        </label>
        <div className="wp-actions">
          <button
            type="button"
            className="rs-btn rs-btn-primary"
            disabled={Boolean(saving) || necesitaMigracion}
            onClick={guardarPagina}
          >
            {saving === 'pagina' ? 'Guardando…' : 'Guardar textos de la página'}
          </button>
        </div>
      </div>

      <div className="wp-convenio-list-head">
        <h4 className="wp-campus-title">Convenios</h4>
        <button
          type="button"
          className="rs-btn"
          disabled={Boolean(saving) || necesitaMigracion}
          onClick={crearItem}
        >
          {saving === 'nuevo' ? 'Creando…' : '+ Agregar convenio'}
        </button>
      </div>
      <p className="wp-campus-lead">Cada uno tiene logo, foto, texto, beneficios y un PDF opcional.</p>

      <div className="wp-convenio-list">
        {items.map((item) => (
          <section key={item.id} className={`wp-convenio-card${!item.activo ? ' is-off' : ''}`}>
            <div className="wp-convenio-card__meta">
              <label className="rs-field">
                <span>Nombre</span>
                <input
                  value={item.nombre}
                  maxLength={120}
                  onChange={(e) => setItemCampo(item.id, 'nombre', e.target.value)}
                />
              </label>
              <label className="rs-field">
                <span>Descripción</span>
                <input
                  value={item.descripcion}
                  maxLength={400}
                  onChange={(e) => setItemCampo(item.id, 'descripcion', e.target.value)}
                />
              </label>
              <label className="rs-field">
                <span>Beneficios (uno por línea)</span>
                <textarea
                  rows={4}
                  value={item.beneficios || ''}
                  maxLength={2000}
                  onChange={(e) => setItemCampo(item.id, 'beneficios', e.target.value)}
                />
              </label>
              <div className="wp-convenio-row">
                <label className="rs-field">
                  <span>Color de la franja</span>
                  <select
                    value={item.color}
                    onChange={(e) => setItemCampo(item.id, 'color', e.target.value)}
                  >
                    {COLORES.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="rs-field">
                  <span>Orden</span>
                  <input
                    type="number"
                    min="1"
                    max="999"
                    value={item.orden}
                    onChange={(e) => setItemCampo(item.id, 'orden', e.target.value)}
                  />
                </label>
                <label className="wp-convenio-check">
                  <input
                    type="checkbox"
                    checked={Boolean(item.activo)}
                    onChange={(e) => setItemCampo(item.id, 'activo', e.target.checked ? 1 : 0)}
                  />
                  Visible en la web
                </label>
              </div>
            </div>

            <div className="wp-convenio-media">
              <div>
                <p className="wp-kicker">Logo</p>
                <ConvenioFoto ruta={item.logo_ruta} alt={`Logo ${item.nombre}`} className="wp-convenio-logo" />
                <TamanoFoto ancho={400} alto={400} extra="cuadrado, PNG con fondo transparente" />
                <label className={`wp-file wp-file--sm${uploading === `${item.id}-logo` ? ' is-busy' : ''}`}>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    disabled={Boolean(uploading)}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      subirImagen(item.id, 'logo', file);
                    }}
                  />
                  {uploading === `${item.id}-logo` ? 'Subiendo…' : 'Cambiar logo'}
                </label>
              </div>
              <div>
                <p className="wp-kicker">Imagen</p>
                <ConvenioFoto ruta={item.imagen_ruta} alt={`Foto ${item.nombre}`} className="wp-convenio-img" />
                <TamanoFoto ancho={1200} alto={800} extra="horizontal, JPG o PNG" />
                <label className={`wp-file wp-file--sm${uploading === `${item.id}-imagen` ? ' is-busy' : ''}`}>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    disabled={Boolean(uploading)}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      subirImagen(item.id, 'imagen', file);
                    }}
                  />
                  {uploading === `${item.id}-imagen` ? 'Subiendo…' : 'Cambiar foto'}
                </label>
              </div>
              <div>
                <p className="wp-kicker">PDF del convenio</p>
                <p className="wp-campus-lead" style={{ marginBottom: '0.55rem' }}>
                  {item.pdf_ruta ? item.pdf_ruta : 'Aún no hay PDF'}
                </p>
                <label className={`wp-file wp-file--sm${uploading === `${item.id}-pdf` ? ' is-busy' : ''}`}>
                  <input
                    type="file"
                    accept="application/pdf"
                    disabled={Boolean(uploading)}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      subirPdf(item.id, file);
                    }}
                  />
                  {uploading === `${item.id}-pdf` ? 'Subiendo…' : 'Subir PDF'}
                </label>
              </div>
            </div>

            <div className="wp-convenio-actions">
              <button
                type="button"
                className="rs-btn rs-btn-primary"
                disabled={Boolean(saving) || necesitaMigracion}
                onClick={() => guardarItem(item)}
              >
                {saving === `item-${item.id}` ? 'Guardando…' : 'Guardar este convenio'}
              </button>
              <button
                type="button"
                className="rs-btn"
                disabled={Boolean(saving)}
                onClick={() => eliminarItem(item)}
              >
                Quitar
              </button>
            </div>
          </section>
        ))}
      </div>
    </article>
  );
}
