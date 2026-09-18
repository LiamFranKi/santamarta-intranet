/**
 * CNEB en el aula virtual del alumno (Inicial).
 * Solo lectura: tema (título), ficha y evidencias. Sin plan ni cotejo.
 */
const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { colegioId, anioConsulta, crearRouterCnebFamilia } = require('../utils/cnebVistaFamilia');

router.use(authenticateToken);
router.use((req, res, next) => {
  if (req.user?.tipo === 'ALUMNO') return next();
  return res.status(403).json({ error: 'Solo el alumno usa este módulo.' });
});

router.use(
  crearRouterCnebFamilia({
    logTag: 'alumno/cneb',
    resolverAlumno: async (req) => {
      const cid = colegioId(req);
      const alumnoId = req.user?.alumno_id;
      if (!cid || !alumnoId) throw new Error('No tienes acceso a este curso.');
      return { alumnoId, cid, anio: await anioConsulta(req, cid) };
    },
  })
);

module.exports = router;
