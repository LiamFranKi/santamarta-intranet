const express = require('express');
const multer = require('multer');
const { authenticateToken } = require('../middleware/auth');
const {
  estadoPublico,
  instalarColegio,
  cargarPadron,
  plantillaBuffer,
  contarColegios,
} = require('../utils/aperturaColegio');
const { query } = require('../utils/mysql');

const router = express.Router();
const publico = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

function soloSuperadmin(req, res, next) {
  if (!req.user?.es_superadmin) {
    return res.status(403).json({ error: 'Solo el super administrador puede aperturar el colegio.' });
  }
  next();
}

function errorHttp(res, e) {
  const status = e.status || 500;
  res.status(status).json({ error: e.message || 'No se pudo completar la apertura.' });
}

publico.get('/estado', async (req, res) => {
  try {
    res.json(await estadoPublico());
  } catch (e) {
    errorHttp(res, e);
  }
});

publico.post('/instalar', async (req, res) => {
  try {
    const out = await instalarColegio(req.body || {});
    res.status(201).json({ success: true, ...out });
  } catch (e) {
    console.error('[apertura/instalar]', e.message);
    errorHttp(res, e);
  }
});

router.use(authenticateToken, soloSuperadmin);

router.get('/estado', async (req, res) => {
  try {
    const n = await contarColegios();
    const [col] = await query(
      'SELECT id, nombre, anio_activo FROM colegios WHERE id = ? LIMIT 1',
      [req.user.colegio_id]
    );
    res.json({
      abierto: n > 0,
      colegio: col ? { id: col.id, nombre: col.nombre, anio_activo: col.anio_activo } : null,
    });
  } catch (e) {
    errorHttp(res, e);
  }
});

router.get('/plantilla', async (req, res) => {
  try {
    const buf = await plantillaBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="apertura_padron.xlsx"');
    res.send(buf);
  } catch (e) {
    errorHttp(res, e);
  }
});

router.post('/padron', upload.single('archivo'), async (req, res) => {
  try {
    if (!req.file?.buffer) return res.status(400).json({ error: 'Suba el Excel del padrón.' });
    const nombre = String(req.file.originalname || '').toLowerCase();
    if (!nombre.endsWith('.xlsx')) return res.status(400).json({ error: 'El archivo debe ser .xlsx.' });
    const aplicar = String(req.body?.confirmar || '') === 'CARGAR';
    const n = await contarColegios();
    if (!n) return res.status(409).json({ error: 'Primero hay que aperturar el colegio.' });
    const out = await cargarPadron(req.user.colegio_id, req.file.buffer, aplicar);
    if (!out.ok) return res.status(400).json(out);
    res.json(out);
  } catch (e) {
    console.error('[apertura/padron]', e.message);
    errorHttp(res, e);
  }
});

module.exports = { router, publico };
