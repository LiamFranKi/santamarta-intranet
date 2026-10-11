const express = require('express');
const path = require('path');
const router = express.Router();
const { query } = require('../utils/mysql');
const { getColegioData } = require('../utils/colegio');
const { resolverLogoVariante } = require('../utils/logoColegio');
const { leerMascota } = require('../utils/mascotaColegio');

/**
 * GET /api/colegio/:colegioId
 * Obtener datos del colegio (nombre, logo, colores, etc.)
 */
router.get('/:colegioId', async (req, res) => {
  try {
    const { colegioId } = req.params;
    const colegioData = await getColegioData(parseInt(colegioId));

    if (!colegioData) {
      return res.status(404).json({ error: 'Colegio no encontrado' });
    }

    const logo = await resolverLogoVariante('logo_colegio');
    const logoBlanco = await resolverLogoVariante('logo_blanco');
    const icono = await resolverLogoVariante('icono_app');
    let libretaLogo = null;
    let libretaFondo = null;
    try {
      const fondos = await query(
        `SELECT clave, valor FROM config WHERE clave IN ('libreta_logo', 'libreta_fondo')`
      );
      for (const row of fondos || []) {
        const name = row.valor ? path.basename(String(row.valor)) : '';
        if (!name) continue;
        const url = `/api/static/fondos/${name}`;
        if (row.clave === 'libreta_logo') libretaLogo = url;
        if (row.clave === 'libreta_fondo') libretaFondo = url;
      }
    } catch (_) {
      libretaLogo = null;
      libretaFondo = null;
    }
    let textoIntranet = '';
    try {
      const rows = await query(`SELECT valor FROM config WHERE clave = 'texto_intranet' LIMIT 1`);
      textoIntranet = rows?.[0]?.valor != null ? String(rows[0].valor) : '';
    } catch (_) {
      textoIntranet = '';
    }

    const mascota = await leerMascota(colegioId);
    res.json({
      ...colegioData,
      logo: logo.urlPath,
      logo_desde_config: logo.desdeConfig,
      logo_blanco: logoBlanco.urlPath,
      logo_blanco_desde_config: logoBlanco.desdeConfig,
      icono_app: icono.desdeConfig ? icono.urlPath : null,
      icono_desde_config: icono.desdeConfig,
      libreta_logo: libretaLogo,
      libreta_fondo: libretaFondo,
      texto_intranet: textoIntranet,
      mascota_nombre: mascota.nombre,
      mascota_imagen: mascota.imagen_url,
    });
  } catch (error) {
    console.error('Error obteniendo datos del colegio:', error);
    res.status(500).json({ error: 'Error obteniendo datos del colegio' });
  }
});

/**
 * GET /api/colegio/:colegioId/nombre-intranet
 * Obtener solo el nombre de la intranet
 */
router.get('/:colegioId/nombre-intranet', async (req, res) => {
  try {
    const { colegioId } = req.params;
    const colegioData = await getColegioData(parseInt(colegioId));

    if (!colegioData) {
      return res.status(404).json({ error: 'Colegio no encontrado' });
    }

    res.json({
      nombre_intranet: colegioData.nombre_intranet,
      nombre: colegioData.nombre,
    });
  } catch (error) {
    console.error('Error obteniendo nombre de intranet:', error);
    res.status(500).json({ error: 'Error obteniendo nombre de intranet' });
  }
});

module.exports = router;

