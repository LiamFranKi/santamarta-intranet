/**
 * Monta /api/docente/tutoria-general reutilizando rutas GET de docente (solo lectura).
 */
const { authenticateToken } = require('../middleware/auth');
const { middlewareTutoriaGeneral, middlewareSoloLectura } = require('../utils/tutoriaGeneral');

function mountTutoriaGeneral(app, docenteRoutes) {
  app.use(
    '/api/docente/tutoria-general',
    authenticateToken,
    middlewareTutoriaGeneral,
    middlewareSoloLectura,
    (req, res, next) => {
      req._tutoriaAccesoGeneral = true;
      const suffix = req.url || '';
      req.url = '/tutoria' + (suffix === '/' ? '' : suffix);
      docenteRoutes(req, res, next);
    }
  );
}

module.exports = { mountTutoriaGeneral };
