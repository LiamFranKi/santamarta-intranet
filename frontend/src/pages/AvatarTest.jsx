import React, { useState } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import LayeredAvatar from '../components/LayeredAvatar';

/**
 * Página de prueba para el componente LayeredAvatar.
 * Muestra Volt Spectrum + 4 accesorios superpuestos.
 */
function AvatarTest() {
  const apiBase = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
  const baseUrl = apiBase.replace(/\/+$/, '') + '/static/avatars/';

  /* Orden z-index: Capa (1) detrás de hombros → Base (2) → Núcleo (3) → Visor (4) → Dron (5) al frente */
  const accessories = [
    { image: '03_Capa_de_Fibra_Óptica.png', name: 'Capa de Fibra Óptica', zIndex: 1 },
    { image: '04_Núcleo_de_Plasma.png', name: 'Núcleo de Plasma', zIndex: 3 },
    { image: '02_Visor_Táctico_Neón.png', name: 'Visor Táctico Neón', zIndex: 4 },
    { image: '05_Dron_de_Vigilancia.png', name: 'Dron de Vigilancia', zIndex: 5 },
  ];

  const [size, setSize] = useState('512px');
  const [showLayers, setShowLayers] = useState([true, true, true, true]);

  const toggleLayer = (i) => {
    setShowLayers((prev) => {
      const next = [...prev];
      next[i] = !next[i];
      return next;
    });
  };

  const visibleAccessories = accessories.filter((_, i) => showLayers[i]);

  return (
    <DashboardLayout>
      <div className="avatar-test-page" style={{ padding: '2rem', maxWidth: 800, margin: '0 auto' }}>
        <h1 style={{ marginBottom: '0.5rem' }}>Prueba Avatar Modular</h1>
        <p style={{ color: '#6b7280', marginBottom: '2rem' }}>
          Base + 4 accesorios (512×512 PNG transparente, aspect-ratio 1:1)
        </p>

        <div style={{ marginBottom: '1.5rem', display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <label>
            Tamaño:
            <select
              value={size}
              onChange={(e) => setSize(e.target.value)}
              style={{ marginLeft: '0.5rem', padding: '0.25rem 0.5rem' }}
            >
              <option value="256px">256px</option>
              <option value="512px">512px</option>
              <option value="100%">100% (responsive)</option>
            </select>
          </label>
        </div>

        <div style={{ marginBottom: '1rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {accessories.map((acc, i) => (
            <label key={acc.image} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={showLayers[i]}
                onChange={() => toggleLayer(i)}
              />
              <span>{acc.name}</span>
            </label>
          ))}
        </div>

        <div
          style={{
            border: '2px solid #e5e7eb',
            borderRadius: 12,
            padding: '1rem',
            background: '#f9fafb',
            display: 'inline-block',
            width: size === '100%' ? '100%' : 'auto',
            maxWidth: 600,
          }}
        >
          <LayeredAvatar
            baseImage="01_Volt_Spectrum.png"
            accessories={visibleAccessories}
            baseUrl={baseUrl}
            size={size === '100%' ? '100%' : size}
          />
        </div>

        <p style={{ marginTop: '1rem', fontSize: '0.875rem', color: '#6b7280' }}>
          Base: 01_Volt_Spectrum.png | Accesorios: Visor, Capa, Núcleo, Dron
        </p>
      </div>
    </DashboardLayout>
  );
}

export default AvatarTest;
