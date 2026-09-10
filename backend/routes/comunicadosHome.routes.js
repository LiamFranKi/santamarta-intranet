/**
 * Ventana(s) de comunicados al iniciar sesión.
 * Independiente del dashboard de cada rol (un 500 ahí no debe ocultar el comunicado).
 */
const express = require('express');
const router = express.Router();
const { query } = require('../utils/mysql');
const { authenticateToken, requireUserType } = require('../middleware/auth');
const { listarComunicadosInicio } = require('../utils/comunicadosHome');

router.use(authenticateToken);
router.use(
  requireUserType(
    'DOCENTE',
    'ALUMNO',
    'APODERADO',
    'ADMINISTRADOR',
    'PROMOTORIA',
    'SECRETARIA',
    'PSICOLOGA',
    'COORDINADOR'
  )
);

/**
 * GET /api/comunicados/inicio
 */
router.get('/inicio', async (req, res) => {
  try {
    const colegioId = req.user?.colegio_id;
    if (!colegioId) {
      return res.json({ comunicados: [] });
    }
    const comunicados = await listarComunicadosInicio(query, colegioId);
    res.json({ comunicados });
  } catch (error) {
    console.error('Error comunicados inicio:', error);
    res.json({ comunicados: [] });
  }
});

module.exports = router;
