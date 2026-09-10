import React, { useCallback, useEffect, useState } from 'react';
import Swal from 'sweetalert2';
import api from '../../services/api';
import './AdminWebPaginas.css';

const API = '/admin/reclamos-sugerencias';

const SUBTABS = [
  { id: 'niveles', label: '🏫 Niveles' },
  { id: 'banner', label: '🖼️ Banner principal' },
];

const NIVELES = [
  { key: 'monto_inicial', label: 'Educación Inicial', hint: '3, 4 y 5 años', accent: 'inicial' },
  { key: 'monto_primaria', label: 'Educación Primaria', hint: '1° a 6°', accent: 'primaria' },
  { key: 'monto_secundaria', label: 'Educación Secundaria', hint: '1° a 5°', accent: 'secundaria' },
];

const WEB_NIVELES = {
  monto_inicial: 'https://www.vanguardschools.com/niveles/inicial',
  monto_primaria: 'https://www.vanguardschools.com/niveles/primaria',
  monto_secundaria: 'https://www.vanguardschools.com/niveles/secundaria',
};

const swalOpts = {
  target: document.body,
  customClass: { container: 'rs-swal-over-modal' },
  didOpen: (popup) => {
    const root = popup?.closest?.('.swal2-container');
    if (root) root.style.setProperty('z-index', '250000', 'important');
  },
};

const VACIO = {
  monto_inicial: '510.00',
  monto_primaria: '510.00',
  monto_secundaria: '530.00',
  descuento_hermano: '20.00',
  texto_linea: 'Matrícula y Pensión',
};

function aInput(n, fallback) {
  const v = Number(n);
  return Number.isFinite(v) ? v.toFixed(2) : fallback;
}

export default function AdminWebPaginas() {
  const [subTab, setSubTab] = useState('niveles');
  const [form, setForm] = useState(VACIO);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [necesitaMigracion, setNecesitaMigracion] = useState(false);

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const cargar = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const { data } = await api.get(`${API}/paginas-niveles`);
      setForm({
        monto_inicial: aInput(data.monto_inicial, VACIO.monto_inicial),
        monto_primaria: aInput(data.monto_primaria, VACIO.monto_primaria),
        monto_secundaria: aInput(data.monto_secundaria, VACIO.monto_secundaria),
        descuento_hermano: aInput(data.descuento_hermano, VACIO.descuento_hermano),
        texto_linea: String(data.texto_linea || VACIO.texto_linea),
      });
      setNecesitaMigracion(Boolean(data.necesita_migracion));
    } catch (e) {
      setError(e.response?.data?.error || 'Error al cargar inversión de niveles');
      setNecesitaMigracion(e.response?.status === 503);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const guardar = async () => {
    const payload = {
      monto_inicial: Number(form.monto_inicial),
      monto_primaria: Number(form.monto_primaria),
      monto_secundaria: Number(form.monto_secundaria),
      descuento_hermano: Number(form.descuento_hermano),
      texto_linea: String(form.texto_linea || '').trim(),
    };
    const montos = [payload.monto_inicial, payload.monto_primaria, payload.monto_secundaria, payload.descuento_hermano];
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
      Swal.fire({
        icon: 'success',
        title: 'Guardado',
        text: 'Los montos ya se muestran en las páginas de niveles de la web.',
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
  if (error && !form) return <p className="rs-error">{error}</p>;

  return (
    <div className="wp-paginas">
      <nav className="rs-tabs" aria-label="Secciones de páginas">
        {SUBTABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`rs-tab${subTab === t.id ? ' rs-tab--active' : ''}`}
            onClick={() => setSubTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {subTab === 'niveles' && (
        <div className="rs-card">
          <div className="rs-matricula-card__head">
            <h3 className="rs-matricula-card__title">Inversión por nivel</h3>
            <p className="rs-matricula-card__lead">
              Un monto para todo el nivel. Las páginas nuevas de la web (
              <a href="https://www.vanguardschools.com/niveles/inicial" target="_blank" rel="noopener noreferrer">inicial</a>, primaria, secundaria)
              muestran este precio en un solo esquema de pagos. El diseño anterior sigue en{' '}
              <code>/niveles/inicial/clasico</code> (igual para primaria y secundaria).
            </p>
          </div>

          {necesitaMigracion && (
            <p className="rs-error" style={{ textAlign: 'left', padding: '0.75rem 0' }}>
              Falta ejecutar <code>database/migrations/080_web_paginas_niveles_mysql.sql</code> en MySQL.
            </p>
          )}
          {error && !necesitaMigracion && <p className="rs-error">{error}</p>}

          <div className="wp-niveles-grid">
            {NIVELES.map((n) => (
              <div key={n.key} className={`wp-nivel-card wp-nivel-card--${n.accent}`}>
                <p className="wp-nivel-card__label">{n.label}</p>
                <p className="wp-nivel-card__hint">{n.hint}</p>
                <label className="wp-monto">
                  <span>S/.</span>
                  <input
                    type="number"
                    min="0"
                    max="99999.99"
                    step="0.01"
                    value={form[n.key]}
                    onChange={(e) => set(n.key, e.target.value)}
                  />
                </label>
                <a className="wp-nivel-card__link" href={WEB_NIVELES[n.key]} target="_blank" rel="noopener noreferrer">
                  Ver en la web
                </a>
              </div>
            ))}
          </div>

          <div className="wp-extras">
            <div className="rs-field">
              <label>Descuento por hermano (S/.)</label>
              <input
                type="number"
                min="0"
                max="99999.99"
                step="0.01"
                value={form.descuento_hermano}
                onChange={(e) => set('descuento_hermano', e.target.value)}
              />
            </div>
            <div className="rs-field">
              <label>Texto bajo el monto</label>
              <input
                value={form.texto_linea}
                onChange={(e) => set('texto_linea', e.target.value)}
                maxLength={80}
                placeholder="Matrícula y Pensión"
              />
            </div>
          </div>

          <div className="wp-actions">
            <button type="button" className="rs-btn rs-btn-primary" disabled={saving} onClick={guardar}>
              {saving ? 'Guardando…' : 'Guardar inversión'}
            </button>
          </div>
        </div>
      )}

      {subTab === 'banner' && (
        <div className="rs-card">
          <h3 className="rs-matricula-card__title">Banner principal</h3>
          <p className="rs-matricula-card__lead">
            Aquí se podrá cambiar la imagen grande del inicio. Todavía no está habilitado.
          </p>
        </div>
      )}
    </div>
  );
}
