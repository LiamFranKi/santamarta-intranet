/**
 * Público — configuración de visitas guiadas para la web.
 * Misma BD que usa el admin (fuente de verdad).
 * GET /api/public/visitas-config
 */
const express = require('express');
const router = express.Router();
const { query } = require('../utils/mysql');

function to01(v) {
  if (Buffer.isBuffer(v)) return v.length && v[0] ? 1 : 0;
  if (v && typeof v === 'object' && Array.isArray(v.data)) return v.data[0] ? 1 : 0;
  if (v === true || v === 1 || v === '1') return 1;
  return 0;
}

router.get('/visitas-config', async (_req, res) => {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    Pragma: 'no-cache',
    'CDN-Cache-Control': 'no-store',
    'Cloudflare-CDN-Cache-Control': 'no-store',
  });

  try {
    const diasRows = await query(
      `SELECT dia_semana, etiqueta, activo FROM web_visita_dias ORDER BY dia_semana ASC`
    );
    const horariosRows = await query(
      `SELECT id, etiqueta, activo, orden FROM web_visita_horarios ORDER BY orden ASC, id ASC`
    );

    const diasEtiquetas = (diasRows || [])
      .filter((r) => to01(r.activo) === 1)
      .map((r) => ({
        dia_semana: Number(r.dia_semana),
        etiqueta: String(r.etiqueta || ''),
      }));
    const horarios = (horariosRows || [])
      .filter((r) => to01(r.activo) === 1)
      .map((r) => ({
        id: Number(r.id),
        etiqueta: String(r.etiqueta || ''),
      }));

    let database = null;
    try {
      const dbRows = await query('SELECT DATABASE() AS db');
      database = dbRows?.[0]?.db || null;
    } catch {
      /* ignore */
    }

    if (!diasEtiquetas.length || !horarios.length) {
      return res.json({
        diasSemana: [],
        diasEtiquetas: [],
        horarios: [],
        usaSecuencias: false,
        mensajeDias: 'No hay días disponibles',
        disponible: false,
        source: 'intranet-mysql',
        database,
        generatedAt: new Date().toISOString(),
      });
    }

    return res.json({
      diasSemana: diasEtiquetas.map((d) => d.dia_semana),
      diasEtiquetas,
      horarios,
      usaSecuencias: false,
      mensajeDias: diasEtiquetas.map((d) => d.etiqueta).join(', '),
      disponible: true,
      source: 'intranet-mysql',
      database,
      generatedAt: new Date().toISOString(),
    });
  } catch (e) {
    console.error('[public/visitas-config]', e);
    return res.status(500).json({
      error: e.message || 'Error al leer config de visitas',
      disponible: false,
      diasSemana: [],
      horarios: [],
      source: 'error',
    });
  }
});

module.exports = router;
