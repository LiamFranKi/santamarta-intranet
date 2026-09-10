/**
 * Reportes administrativos de notas y calificaciones.
 * ADMINISTRADOR, PROMOTORÍA y COORDINADOR.
 */
const express = require('express');
const router = express.Router();
const { getMeta, runReport, reportCoberturaDetalle, REPORT_TYPES } = require('../utils/adminReportesNotasData');
const { authenticateToken } = require('../middleware/auth');

router.use(authenticateToken);
router.use((req, res, next) => {
  const t = req.user?.tipo;
  if (t === 'ADMINISTRADOR' || t === 'PROMOTORIA' || t === 'COORDINADOR' || t === 'DIRECTOR' || t === 'CONTADOR') return next();
  return res.status(403).json({ error: 'No autorizado para reportes administrativos.' });
});

function colegioId(req) {
  return req.user.colegio_id;
}

/** GET /api/admin/reportes/notas/meta?anio=2025 */
router.get('/meta', async (req, res) => {
  try {
    const anioQ = req.query.anio != null ? parseInt(req.query.anio, 10) : null;
    const data = await getMeta(colegioId(req), anioQ);
    res.json(data);
  } catch (e) {
    console.error('[reportes/notas/meta]', e);
    res.status(500).json({ error: e.message || 'Error al cargar metadatos.' });
  }
});

/** GET /api/admin/reportes/notas/tipos */
router.get('/tipos', (_req, res) => {
  res.json({ tipos: REPORT_TYPES });
});

/** GET /api/admin/reportes/notas/cobertura-detalle?grupo_id=&anio=&ciclo= */
router.get('/cobertura-detalle', async (req, res) => {
  try {
    const cid = colegioId(req);
    const anioQ = req.query.anio != null ? parseInt(req.query.anio, 10) : null;
    const meta = await getMeta(cid, anioQ);
    const anio = meta.anio;
    const data = await reportCoberturaDetalle(cid, { ...req.query, anio });
    res.json({ ...data, colegio_nombre: meta.colegio_nombre });
  } catch (e) {
    console.error('[reportes/notas/cobertura-detalle]', e);
    res.status(e.status || 500).json({ error: e.message || 'Error al cargar detalle de cobertura.' });
  }
});

/** GET /api/admin/reportes/notas/reporte/:tipo */
router.get('/reporte/:tipo', async (req, res) => {
  try {
    const data = await runReport(req.params.tipo, colegioId(req), req.query);
    res.json(data);
  } catch (e) {
    console.error(`[reportes/notas/${req.params.tipo}]`, e);
    res.status(e.status || 500).json({ error: e.message || 'Error al generar el reporte.' });
  }
});

module.exports = router;
