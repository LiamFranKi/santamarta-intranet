/**
 * Público — configuración de visitas guiadas para la web.
 * GET /api/public/visitas-config
 */
const express = require('express');
const router = express.Router();
const { query } = require('../utils/mysql');
const { buildVisitaConfigPublica } = require('../utils/visitaGuiadaPublicConfig');

router.get('/visitas-config', async (_req, res) => {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    Pragma: 'no-cache',
    'CDN-Cache-Control': 'no-store',
    'Cloudflare-CDN-Cache-Control': 'no-store',
  });

  try {
    const payload = await buildVisitaConfigPublica(query);
    return res.json(payload);
  } catch (e) {
    console.error('[public/visitas-config]', e);
    return res.status(500).json({
      error: e.message || 'Error al leer config de visitas',
      disponible: false,
      diasSemana: [],
      horarios: [],
      fechas: [],
      modoFechas: 'semana',
      source: 'error',
    });
  }
});

module.exports = router;
