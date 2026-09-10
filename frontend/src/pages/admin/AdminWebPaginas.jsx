import React, { useCallback, useEffect, useState } from 'react';
import Swal from 'sweetalert2';
import api from '../../services/api';
import './AdminWebPaginas.css';

const API = '/admin/reclamos-sugerencias';
const WEB = 'https://www.vanguardschools.com';

const NIVEL_TABS = [
  {
    id: 'inicial',
    label: 'Inicial',
    hint: '3, 4 y 5 años',
    montoKey: 'monto_inicial',
    web: `${WEB}/niveles/inicial`,
  },
  {
    id: 'primaria',
    label: 'Primaria',
    hint: '1.° a 6.°',
    montoKey: 'monto_primaria',
    web: `${WEB}/niveles/primaria`,
  },
  {
    id: 'secundaria',
    label: 'Secundaria',
    hint: '1.° a 5.°',
    montoKey: 'monto_secundaria',
    web: `${WEB}/niveles/secundaria`,
  },
];

const CAMPUS = [
  { n: 1, slot: 'campus1', titulo: 'campus1_titulo', texto: 'campus1_texto', ruta: 'campus1_ruta' },
  { n: 2, slot: 'campus2', titulo: 'campus2_titulo', texto: 'campus2_texto', ruta: 'campus2_ruta' },
  { n: 3, slot: 'campus3', titulo: 'campus3_titulo', texto: 'campus3_texto', ruta: 'campus3_ruta' },
];

const VACIO_PRECIO = {
  monto_inicial: '510.00',
  monto_primaria: '510.00',
  monto_secundaria: '530.00',
  descuento_hermano: '20.00',
  texto_linea: 'Matrícula y Pensión',
};

const VACIO_MEDIA = {
  home_ruta: '',
  hero_ruta: '',
  campus1_titulo: '',
  campus1_texto: '',
  campus1_ruta: '',
  campus2_titulo: '',
  campus2_texto: '',
  campus2_ruta: '',
  campus3_titulo: '',
  campus3_texto: '',
  campus3_ruta: '',
};

const swalOpts = {
  target: document.body,
  customClass: { container: 'rs-swal-over-modal' },
  didOpen: (popup) => {
    const root = popup?.closest?.('.swal2-container');
    if (root) root.style.setProperty('z-index', '250000', 'important');
  },
};

function aInput(n, fallback) {
  const v = Number(n);
  return Number.isFinite(v) ? v.toFixed(2) : fallback;
}

function TamanoFoto({ ancho, alto, extra }) {
  return (
    <p className="wp-tamano">
      Medida recomendada: <strong>{ancho} × {alto} px</strong>
      {extra ? <span> · {extra}</span> : null}
    </p>
  );
}

function NivelFoto({ ruta, alt, className }) {
  const [src, setSrc] = useState('');

  useEffect(() => {
    let obj;
    let alive = true;
    (async () => {
      if (!ruta) {
        setSrc('');
        return;
      }
      if (ruta.startsWith('blob:')) {
        setSrc(ruta);
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

export default function AdminWebPaginas() {
  const [subTab, setSubTab] = useState('niveles');
  const [nivelId, setNivelId] = useState('inicial');
  const [form, setForm] = useState(VACIO_PRECIO);
  const [media, setMedia] = useState({
    inicial: { ...VACIO_MEDIA },
    primaria: { ...VACIO_MEDIA },
    secundaria: { ...VACIO_MEDIA },
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState('');
  const [inicioRuta, setInicioRuta] = useState('/FONDOBANNER.jpg');
  const [necesitaInicio, setNecesitaInicio] = useState(false);
  const [error, setError] = useState('');
  const [necesitaMigracion, setNecesitaMigracion] = useState(false);
  const [necesitaMedia, setNecesitaMedia] = useState(false);

  const setPrecio = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const setMediaCampo = (nivel, key, value) =>
    setMedia((prev) => ({ ...prev, [nivel]: { ...prev[nivel], [key]: value } }));

  const cargar = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const { data } = await api.get(`${API}/paginas-niveles`);
      setForm({
        monto_inicial: aInput(data.monto_inicial, VACIO_PRECIO.monto_inicial),
        monto_primaria: aInput(data.monto_primaria, VACIO_PRECIO.monto_primaria),
        monto_secundaria: aInput(data.monto_secundaria, VACIO_PRECIO.monto_secundaria),
        descuento_hermano: aInput(data.descuento_hermano, VACIO_PRECIO.descuento_hermano),
        texto_linea: String(data.texto_linea || VACIO_PRECIO.texto_linea),
      });
      if (data.media) {
        setMedia({
          inicial: { ...VACIO_MEDIA, ...(data.media.inicial || {}) },
          primaria: { ...VACIO_MEDIA, ...(data.media.primaria || {}) },
          secundaria: { ...VACIO_MEDIA, ...(data.media.secundaria || {}) },
        });
      }
      setNecesitaMigracion(Boolean(data.necesita_migracion));
      setNecesitaMedia(Boolean(data.necesita_migracion_media));
      try {
        const ini = await api.get(`${API}/paginas-inicio`);
        setInicioRuta(ini.data.banner_ruta || '/FONDOBANNER.jpg');
        setNecesitaInicio(Boolean(ini.data.necesita_migracion_inicio));
      } catch (e) {
        setNecesitaInicio(e.response?.status === 503);
      }
    } catch (e) {
      setError(e.response?.data?.error || 'Error al cargar páginas de niveles');
      setNecesitaMigracion(e.response?.status === 503);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const subirFoto = async (nivel, slot, file) => {
    if (!file) return;
    const fd = new FormData();
    fd.append('nivel', nivel);
    fd.append('slot', slot);
    fd.append('imagen', file);
    const key = `${nivel}-${slot}`;
    try {
      setUploading(key);
      const { data } = await api.post(`${API}/paginas-niveles/imagen`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (data.media) {
        setMedia((prev) => ({ ...prev, [nivel]: { ...prev[nivel], ...data.media } }));
      }
      setNecesitaMedia(false);
      Swal.fire({
        icon: 'success',
        title: 'Foto actualizada',
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

  const subirBannerInicio = async (file) => {
    if (!file) return;
    const fd = new FormData();
    fd.append('imagen', file);
    try {
      setUploading('inicio-banner');
      const { data } = await api.post(`${API}/paginas-inicio/imagen`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setInicioRuta(data.banner_ruta || data.ruta || inicioRuta);
      setNecesitaInicio(false);
      Swal.fire({
        icon: 'success',
        title: 'Banner actualizado',
        text: 'Ya se ve en la portada de vanguardschools.com',
        timer: 1600,
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

  const guardar = async () => {
    const payload = {
      monto_inicial: Number(form.monto_inicial),
      monto_primaria: Number(form.monto_primaria),
      monto_secundaria: Number(form.monto_secundaria),
      descuento_hermano: Number(form.descuento_hermano),
      texto_linea: String(form.texto_linea || '').trim(),
    };
    const montos = [
      payload.monto_inicial,
      payload.monto_primaria,
      payload.monto_secundaria,
      payload.descuento_hermano,
    ];
    if (montos.some((n) => !Number.isFinite(n) || n < 0 || n > 99999.99)) {
      Swal.fire({
        icon: 'warning',
        title: 'Monto inválido',
        text: 'Use números entre 0 y 99999.99.',
        ...swalOpts,
      });
      return;
    }
    try {
      setSaving(true);
      const { data } = await api.put(`${API}/paginas-niveles`, payload);
      setForm({
        monto_inicial: aInput(data.monto_inicial, payload.monto_inicial.toFixed(2)),
        monto_primaria: aInput(data.monto_primaria, payload.monto_primaria.toFixed(2)),
        monto_secundaria: aInput(data.monto_secundaria, payload.monto_secundaria.toFixed(2)),
        descuento_hermano: aInput(data.descuento_hermano, payload.descuento_hermano.toFixed(2)),
        texto_linea: String(data.texto_linea || payload.texto_linea),
      });
      setNecesitaMigracion(Boolean(data.necesita_migracion));

      try {
        for (const n of NIVEL_TABS) {
          const mrow = media[n.id];
          const { data: md } = await api.put(`${API}/paginas-niveles/media/${n.id}`, {
            campus1_titulo: mrow.campus1_titulo,
            campus1_texto: mrow.campus1_texto,
            campus2_titulo: mrow.campus2_titulo,
            campus2_texto: mrow.campus2_texto,
            campus3_titulo: mrow.campus3_titulo,
            campus3_texto: mrow.campus3_texto,
          });
          if (md.media) {
            setMedia((prev) => ({ ...prev, [n.id]: { ...prev[n.id], ...md.media } }));
          }
        }
        setNecesitaMedia(false);
      } catch (mediaErr) {
        setNecesitaMedia(true);
        Swal.fire({
          icon: 'warning',
          title: 'Precios guardados',
          text:
            mediaErr.response?.data?.error ||
            'Falta la migración 088 para guardar banners y títulos del campus.',
          ...swalOpts,
        });
        return;
      }

      Swal.fire({
        icon: 'success',
        title: 'Guardado',
        text: 'Precios, títulos y fotos ya se muestran en la web pública.',
        timer: 1800,
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
      setSaving(false);
    }
  };

  if (loading) return <p className="rs-loading">Cargando páginas…</p>;

  const tab = NIVEL_TABS.find((t) => t.id === nivelId) || NIVEL_TABS[0];
  const m = media[tab.id] || VACIO_MEDIA;

  return (
    <div className="wp-paginas">
      <nav className="rs-tabs" aria-label="Secciones de páginas">
        <button
          type="button"
          className={`rs-tab${subTab === 'niveles' ? ' rs-tab--active' : ''}`}
          onClick={() => setSubTab('niveles')}
        >
          Niveles
        </button>
        <button
          type="button"
          className={`rs-tab${subTab === 'banner' ? ' rs-tab--active' : ''}`}
          onClick={() => setSubTab('banner')}
        >
          Banner del inicio
        </button>
      </nav>

      {subTab === 'niveles' && (
        <>
          {(necesitaMigracion || necesitaMedia) && (
            <p className="rs-error" style={{ textAlign: 'left', padding: '0.5rem 0 0.85rem' }}>
              Falta ejecutar en phpMyAdmin{' '}
              <code>database/migrations/088_web_paginas_nivel_media_faqs_mysql.sql</code>
              {necesitaMigracion ? ' (también la 080 de precios).' : '.'}
            </p>
          )}
          {error && !necesitaMigracion && <p className="rs-error">{error}</p>}

          <div className="wp-nivel-switch" role="tablist" aria-label="Nivel">
            {NIVEL_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={nivelId === t.id}
                className={`wp-nivel-chip wp-nivel-chip--${t.id}${nivelId === t.id ? ' is-on' : ''}`}
                onClick={() => setNivelId(t.id)}
              >
                <span>{t.label}</span>
                <small>{t.hint}</small>
              </button>
            ))}
          </div>

          <article className={`wp-nivel-panel wp-nivel-panel--${tab.id}`}>
            <header className="wp-nivel-panel__head">
              <div>
                <p className="wp-kicker">Página pública</p>
                <h3>Educación {tab.label}</h3>
                <p>Precio, foto de la tarjeta del inicio, banner de la página y campus.</p>
              </div>
              <a className="wp-web-link" href={tab.web} target="_blank" rel="noopener noreferrer">
                Ver en la web
              </a>
            </header>

            <label className="wp-precio">
              <span>Inversión (matrícula y pensión)</span>
              <div>
                <em>S/.</em>
                <input
                  type="number"
                  min="0"
                  max="99999.99"
                  step="0.01"
                  value={form[tab.montoKey]}
                  onChange={(e) => setPrecio(tab.montoKey, e.target.value)}
                />
              </div>
            </label>

            <div className="wp-fotos-duo">
              <section className="wp-hero-edit wp-hero-edit--home">
                <div className="wp-hero-edit__copy">
                  <p className="wp-kicker">Portada · Inicio</p>
                  <h4>Tarjeta del inicio</h4>
                  <p>
                    Esta foto sale en la <strong>página de inicio</strong>, en las 3 tarjetas de “Niveles Educativos”
                    (Inicial, Primaria o Secundaria). No es el banner grande de la página del nivel.
                  </p>
                  <TamanoFoto ancho={1200} alto={800} extra="horizontal, JPG o PNG" />
                  <label className={`wp-file${uploading === `${tab.id}-home` ? ' is-busy' : ''}`}>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      disabled={Boolean(uploading)}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        subirFoto(tab.id, 'home', file);
                      }}
                    />
                    {uploading === `${tab.id}-home` ? 'Subiendo…' : 'Cambiar foto'}
                  </label>
                </div>
                <NivelFoto ruta={m.home_ruta} alt={`Tarjeta inicio ${tab.label}`} className="wp-hero-edit__img" />
              </section>

              <section className="wp-hero-edit">
                <div className="wp-hero-edit__copy">
                  <p className="wp-kicker">Página /niveles/{tab.id}</p>
                  <h4>Banner principal del nivel</h4>
                  <p>La foto grande al entrar a Educación {tab.label}.</p>
                  <TamanoFoto ancho={1920} alto={1080} extra="horizontal, JPG o PNG" />
                  <label className={`wp-file${uploading === `${tab.id}-hero` ? ' is-busy' : ''}`}>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      disabled={Boolean(uploading)}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        subirFoto(tab.id, 'hero', file);
                      }}
                    />
                    {uploading === `${tab.id}-hero` ? 'Subiendo…' : 'Cambiar foto'}
                  </label>
                </div>
                <NivelFoto ruta={m.hero_ruta} alt={`Banner ${tab.label}`} className="wp-hero-edit__img" />
              </section>
            </div>

            <section>
              <h4 className="wp-campus-title">Campus que se vive</h4>
              <p className="wp-campus-lead">Tres tarjetas: cada una con título, texto corto y foto.</p>
              <TamanoFoto ancho={1200} alto={800} extra="horizontal, igual para las tres" />
              <div className="wp-campus-grid">
                {CAMPUS.map((c) => (
                  <div key={c.slot} className="wp-campus-card">
                    <NivelFoto
                      ruta={m[c.ruta]}
                      alt={`Campus ${c.n}`}
                      className="wp-campus-card__img"
                    />
                    <label className={`wp-file wp-file--sm${uploading === `${tab.id}-${c.slot}` ? ' is-busy' : ''}`}>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        disabled={Boolean(uploading)}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          e.target.value = '';
                          subirFoto(tab.id, c.slot, file);
                        }}
                      />
                      {uploading === `${tab.id}-${c.slot}` ? 'Subiendo…' : 'Cambiar foto'}
                    </label>
                    <label className="rs-field">
                      <span>Título</span>
                      <input
                        value={m[c.titulo]}
                        maxLength={80}
                        onChange={(e) => setMediaCampo(tab.id, c.titulo, e.target.value)}
                      />
                    </label>
                    <label className="rs-field">
                      <span>Texto</span>
                      <textarea
                        rows={3}
                        value={m[c.texto]}
                        maxLength={220}
                        onChange={(e) => setMediaCampo(tab.id, c.texto, e.target.value)}
                      />
                    </label>
                  </div>
                ))}
              </div>
            </section>
          </article>

          <div className="wp-extras wp-extras--bar">
            <div className="rs-field">
              <label>Descuento por hermano (S/.)</label>
              <input
                type="number"
                min="0"
                max="99999.99"
                step="0.01"
                value={form.descuento_hermano}
                onChange={(e) => setPrecio('descuento_hermano', e.target.value)}
              />
            </div>
            <div className="rs-field">
              <label>Texto bajo el monto</label>
              <input
                value={form.texto_linea}
                onChange={(e) => setPrecio('texto_linea', e.target.value)}
                maxLength={80}
                placeholder="Matrícula y Pensión"
              />
            </div>
          </div>

          <div className="wp-actions">
            <button type="button" className="rs-btn rs-btn-primary" disabled={saving} onClick={guardar}>
              {saving ? 'Guardando…' : 'Guardar precios y textos'}
            </button>
          </div>
        </>
      )}

      {subTab === 'banner' && (
        <article className="wp-nivel-panel">
          <header className="wp-nivel-panel__head">
            <div>
              <p className="wp-kicker">Portada · vanguardschools.com</p>
              <h3>Banner principal del inicio</h3>
              <p>
                Es la foto grande del campo (o la que elijan) que se ve al abrir la web, detrás de Contáctanos,
                Visita Guiada, Admisión y Conócenos.
              </p>
            </div>
            <a className="wp-web-link" href={WEB} target="_blank" rel="noopener noreferrer">
              Ver portada
            </a>
          </header>

          {necesitaInicio && (
            <p className="rs-error" style={{ textAlign: 'left' }}>
              Falta ejecutar <code>database/migrations/090_web_paginas_inicio_banner_mysql.sql</code> en phpMyAdmin.
            </p>
          )}

          <NivelFoto ruta={inicioRuta} alt="Banner principal del inicio" className="wp-banner-preview" />

          <div className="wp-hero-edit__copy" style={{ marginTop: '1rem' }}>
            <p className="rs-muted" style={{ marginBottom: '0.45rem' }}>
              JPG, PNG o WEBP. Máx. 12 MB.
            </p>
            <TamanoFoto ancho={1920} alto={1080} extra="horizontal, a pantalla completa" />
            <label className={`wp-file${uploading === 'inicio-banner' ? ' is-busy' : ''}`}>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={Boolean(uploading)}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  subirBannerInicio(file);
                }}
              />
              {uploading === 'inicio-banner' ? 'Subiendo…' : 'Cambiar foto del banner'}
            </label>
          </div>
        </article>
      )}
    </div>
  );
}
