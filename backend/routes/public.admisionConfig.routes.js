/**
 * Público — campaña de admisión para la web.
 * GET /api/public/admision-config
 */
const express = require('express');
const router = express.Router();
const { query } = require('../utils/mysql');
const { leerAdmisionConfig } = require('../utils/admisionCampanaConfig');

router.get('/admision-config', async (_req, res) => {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    Pragma: 'no-cache',
    'CDN-Cache-Control': 'no-store',
    'Cloudflare-CDN-Cache-Control': 'no-store',
  });

  try {
    const payload = await leerAdmisionConfig(query);
    return res.json({
      ...payload,
      generatedAt: new Date().toISOString(),
    });
  } catch (e) {
    console.error('[public/admision-config]', e);
    return res.status(500).json({
      error: e.message || 'Error al leer config de admisión',
      anio: 2027,
      bannerFlotante: false,
      chipHero: false,
      etiquetaBoton: 'Admisión 2027',
      tituloPagina: 'Admisión y Ratificación 2027',
      textoBanner: 'Ya abrió Admisión 2027',
      textoChip: 'Inscripciones abiertas 2027',
      textoChipSub: 'Cupos limitados · Inicial, Primaria y Secundaria',
      rutaFormulario: '/admision',
      source: 'error',
    });
  }
});

module.exports = router;
