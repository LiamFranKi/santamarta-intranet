import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import Swal from 'sweetalert2';
import './AdminConfigCumpleanos.css';

const DEFAULT_PUSH = '¡Feliz cumpleaños, {nombre}! Te desea un gran día {colegio}.';

function AdminConfigCumpleanos() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [plantillaPush, setPlantillaPush] = useState('');

  useEffect(() => {
    const cargar = async () => {
      try {
        setLoading(true);
        const { data } = await api.get('/admin/configuracion');
        setPlantillaPush(
          typeof data.cumpleanos_plantilla_push === 'string'
            ? data.cumpleanos_plantilla_push
            : ''
        );
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
        cumpleanos_plantilla_push: plantillaPush
      });
      Swal.fire({
        title: 'Guardado',
        text: 'La plantilla de notificación push se guardó correctamente.',
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
          Plantillas para felicitaciones automáticas del colegio. Aquí configuras el texto de la{' '}
          <strong>notificación push</strong> (los demás canales se añadirán después).
        </p>
      </header>

      <section className="admin-config-cumpleanos__card">
        <h2 className="admin-config-cumpleanos__card-title">Plantilla — Push</h2>
        <p className="admin-config-cumpleanos__hint">
          Texto corto (las notificaciones push tienen límite de caracteres según el dispositivo). Podés usar{' '}
          <code>{'{nombre}'}</code> y <code>{'{colegio}'}</code>; se reemplazarán al enviar.
        </p>
        <textarea
          className="admin-config-cumpleanos__textarea"
          rows={4}
          maxLength={500}
          value={plantillaPush}
          onChange={(e) => setPlantillaPush(e.target.value)}
          placeholder={DEFAULT_PUSH}
          aria-label="Plantilla de notificación push para cumpleaños"
        />
        <div className="admin-config-cumpleanos__actions">
          <button
            type="button"
            className="admin-config-cumpleanos__btn"
            onClick={() => setPlantillaPush(DEFAULT_PUSH)}
            disabled={saving}
          >
            Restaurar ejemplo
          </button>
          <button
            type="button"
            className="admin-config-cumpleanos__btn admin-config-cumpleanos__btn--primary"
            onClick={guardar}
            disabled={saving}
          >
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </section>
    </div>
  );
}

export default AdminConfigCumpleanos;
