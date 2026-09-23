const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { MODULOS, leerEstados, guardarEstado } = require('../utils/modulosSistema');

router.use(authenticateToken);

router.get('/', async (req, res) => {
  const estados = await leerEstados();
  res.json({ estados });
});

router.get('/catalogo', (req, res) => {
  if (!req.user?.es_superadmin) {
    return res.status(403).json({ error: 'No autorizado' });
  }
  res.json({
    modulos: MODULOS.map((m) => ({
      clave: m.clave,
      grupo: m.grupo,
      nombre: m.nombre,
    })),
  });
});

router.put('/', async (req, res) => {
  if (!req.user?.es_superadmin) {
    return res.status(403).json({ error: 'No autorizado' });
  }
  const clave = String(req.body?.clave || '').trim();
  const activo = req.body?.activo === true || req.body?.activo === 1 || req.body?.activo === '1';
  try {
    const valor = await guardarEstado(clave, activo);
    const estados = await leerEstados();
    res.json({ ok: true, clave, activo: valor, estados });
  } catch (e) {
    const status = e.status || 500;
    if (status >= 500) console.error('[modulos] guardar:', e.message);
    res.status(status).json({ error: status === 400 ? e.message : 'No se pudo guardar el módulo' });
  }
});

module.exports = router;
