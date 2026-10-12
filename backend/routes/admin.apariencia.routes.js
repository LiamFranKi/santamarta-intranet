/**
 * Elección de plantilla de login, plantilla de la web, colores e imagen de fondo.
 * Solo el administrador. Si no elige nada, sigue el diseño actual.
 */
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { staticFsSubdir } = require('../utils/staticStorage');
const { leerApariencia, guardarApariencia } = require('../utils/apariencia');

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, staticFsSubdir('Image', 'Fondos'));
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase();
      cb(null, `login-fondo-${Date.now()}${ext === '.png' ? '.png' : '.jpg'}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /jpeg|jpg|png/.test(path.extname(file.originalname || '').toLowerCase())
      && /jpeg|jpg|png/.test(file.mimetype || '');
    cb(ok ? null : new Error('Solo se permiten imágenes JPG o PNG'), ok);
  },
});

router.use(authenticateToken);
router.use((req, res, next) => {
  if (req.user?.tipo === 'ADMINISTRADOR') return next();
  return res.status(403).json({ error: 'Solo el administrador cambia la apariencia.' });
});

router.get('/', async (req, res) => {
  try {
    const data = await leerApariencia(req.user.colegio_id);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message || 'No se pudo leer la apariencia.' });
  }
});

router.put('/', (req, res) => {
  upload.fields([
    { name: 'login_fondo', maxCount: 1 },
    { name: 'intranet_fondo', maxCount: 1 },
  ])(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message || 'No se pudo subir la imagen.' });
    const login = req.files?.login_fondo?.[0] || null;
    const intranet = req.files?.intranet_fondo?.[0] || null;
    try {
      const data = await guardarApariencia(
        req.user.colegio_id,
        req.body || {},
        login ? login.filename : null,
        intranet ? intranet.filename : null
      );
      res.json(data);
    } catch (e) {
      for (const file of [login, intranet]) {
        if (file?.path && fs.existsSync(file.path)) {
          try { fs.unlinkSync(file.path); } catch (_) { /* ignore */ }
        }
      }
      res.status(e.status || 500).json({ error: e.message || 'No se pudo guardar.' });
    }
  });
});

module.exports = router;
