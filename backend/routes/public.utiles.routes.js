/**
 * Público — lista de útiles para la web (misma BD que el admin).
 * GET /api/public/utiles
 */
const express = require('express');
const router = express.Router();
const { query } = require('../utils/mysql');

function to01(v) {
  if (Buffer.isBuffer(v)) return v.length && v[0] ? 1 : 0;
  if (v && typeof v === 'object' && Array.isArray(v.data)) return v.data[0] ? 1 : 0;
  if (v === true || v === 1 || v === '1' || v === 'true') return 1;
  return 0;
}

function noStore(res) {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    Pragma: 'no-cache',
    'CDN-Cache-Control': 'no-store',
    'Cloudflare-CDN-Cache-Control': 'no-store',
  });
}

router.get('/utiles', async (_req, res) => {
  noStore(res);
  try {
    let descargasHabilitadas = 0;
    try {
      const cfg = await query(
        `SELECT descargas_habilitadas FROM web_utiles_config WHERE id = 1 LIMIT 1`
      );
      descargasHabilitadas = to01(cfg?.[0]?.descargas_habilitadas);
    } catch (e) {
      if (!(e && (e.code === 'ER_NO_SUCH_TABLE' || e.errno === 1146))) throw e;
    }

    const niveles = await query(
      `SELECT id, codigo, nombre, color, orden FROM web_utiles_niveles WHERE activo = 1 ORDER BY orden ASC, id ASC`
    );
    const grados = await query(
      `SELECT id, nivel_id, codigo, nombre, archivo, ruta, orden
       FROM web_utiles_grados WHERE activo = 1 ORDER BY orden ASC, id ASC`
    );

    const grupos = (niveles || []).map((n) => ({
      id: Number(n.id),
      codigo: n.codigo,
      nombre: n.nombre,
      color: n.color,
      orden: Number(n.orden) || 0,
      grados: (grados || [])
        .filter((g) => Number(g.nivel_id) === Number(n.id))
        .map((g) => ({
          id: Number(g.id),
          codigo: g.codigo,
          nombre: g.nombre,
          orden: Number(g.orden) || 0,
          archivo: descargasHabilitadas ? g.archivo : null,
          ruta: descargasHabilitadas ? g.ruta : null,
          descarga_disponible: !!descargasHabilitadas,
        })),
    }));

    return res.json({
      descargas_habilitadas: !!descargasHabilitadas,
      grupos,
      source: 'intranet-mysql',
      generatedAt: new Date().toISOString(),
    });
  } catch (e) {
    console.error('[public/utiles]', e);
    return res.status(500).json({
      descargas_habilitadas: false,
      grupos: [],
      error: 'Error al leer lista de útiles',
    });
  }
});

module.exports = router;
