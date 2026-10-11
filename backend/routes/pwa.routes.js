const express = require('express');
const router = express.Router();
const { resolverLogoVariante } = require('../utils/logoColegio');
const { leerIdentidadColegio } = require('../utils/identidadColegio');

const ICONOS_ACTUALES = [72, 96, 128, 144, 152, 192, 384, 512].map((size) => ({
  src: `/icons/icon-${size}x${size}.png`,
  sizes: `${size}x${size}`,
  type: 'image/png',
  purpose: size === 192 || size === 512 ? 'any maskable' : 'any',
}));

/**
 * Manifiesto de instalación.
 * Sin icono subido: los iconos de siempre.
 * Con icono de la aplicación: ese PNG es el de instalar, inicio y notificaciones.
 */
router.get('/manifest', async (req, res) => {
  let marca = 'VanguardNet';
  let titulo = 'Intranet del Colegio - Aula Virtual';
  let icons = ICONOS_ACTUALES;
  try {
    const id = await leerIdentidadColegio(1);
    marca = id.marca || marca;
    titulo = id.titulo || titulo;
    const icono = await resolverLogoVariante('icono_app');
    const logo = icono.desdeConfig ? icono : await resolverLogoVariante('logo_colegio');
    if (logo.desdeConfig && (logo.urlPath || logo.urlAbsoluta)) {
      const src = logo.urlPath || logo.urlAbsoluta;
      icons = [
        { src, sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src, sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
      ];
    }
  } catch (_) {
    /* manifiesto actual */
  }

  res.set('Content-Type', 'application/manifest+json; charset=utf-8');
  res.set('Cache-Control', 'no-cache');
  res.json({
    short_name: marca,
    name: titulo,
    icons,
    start_url: '/',
    display: 'standalone',
    theme_color: '#1976d2',
    background_color: '#ffffff',
    orientation: 'portrait-primary',
    scope: '/',
    categories: ['education', 'productivity'],
  });
});

module.exports = router;
