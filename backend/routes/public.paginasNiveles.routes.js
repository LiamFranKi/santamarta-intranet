/**
 * Público — inversión por nivel para la web.
 * GET /api/public/paginas-niveles
 */
const express = require('express');
const router = express.Router();
const { query } = require('../utils/mysql');
const { leerPaginasNiveles, FALLBACK } = require('../utils/webPaginasNiveles');

router.get('/paginas-niveles', async (_req, res) => {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    Pragma: 'no-cache',
    'CDN-Cache-Control': 'no-store',
    'Cloudflare-CDN-Cache-Control': 'no-store',
  });

  try {
    const payload = await leerPaginasNiveles(query);
    return res.json({
      ...payload,
      generatedAt: new Date().toISOString(),
    });
  } catch (e) {
    console.error('[public/paginas-niveles]', e);
    return res.status(500).json({
      error: e.message || 'Error al leer inversión de niveles',
      ...FALLBACK,
      source: 'error',
    });
  }
});

module.exports = router;
