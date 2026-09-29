const express = require('express');
const fs = require('fs');
const os = require('os');
const multer = require('multer');
const { authenticateToken } = require('../middleware/auth');
const {
  leerMascota,
  paraCliente,
  guardarNombre,
  guardarImagenPrincipal,
  quitarImagenPrincipal,
  agregarImagenesFicha,
  quitarImagenFicha,
} = require('../utils/mascotaColegio');

const router = express.Router();

const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 2 * 1024 * 1024, files: 12 },
  fileFilter: (_req, file, cb) => {
    const okExt = /\.(png|jpe?g|webp)$/i.test(file.originalname || '');
    const mime = String(file.mimetype || '');
    const okMime = !mime || mime === 'application/octet-stream' || /^image\/(png|jpeg|webp)$/i.test(mime);
    if (okExt && okMime) cb(null, true);
    else cb(new Error('Solo imágenes PNG, JPG o WEBP'));
  },
});

function puedeEditar(tipo) {
  return tipo === 'ADMINISTRADOR' || tipo === 'PROMOTORIA';
}

function colegioDe(req) {
  const n = parseInt(req.user?.colegio_id, 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

router.use(authenticateToken);

router.get('/', async (req, res) => {
  try {
    const mascota = await leerMascota(colegioDe(req));
    res.json({
      ...paraCliente(mascota),
      puede_editar: puedeEditar(req.user?.tipo),
    });
  } catch (e) {
    console.error('[mascota GET]', e);
    res.status(500).json({ error: 'No se pudo leer la mascota del colegio' });
  }
});

router.put('/nombre', async (req, res) => {
  try {
    if (!puedeEditar(req.user?.tipo)) {
      return res.status(403).json({ error: 'Solo administración puede cambiar la mascota' });
    }
    const mascota = await guardarNombre(colegioDe(req), req.body?.nombre);
    res.json(paraCliente(mascota));
  } catch (e) {
    console.error('[mascota nombre]', e);
    res.status(e.status || 500).json({ error: e.status === 400 ? e.message : 'No se pudo guardar el nombre' });
  }
});

router.post('/imagen', (req, res) => {
  upload.single('imagen')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Imagen no válida' });
    try {
      if (!puedeEditar(req.user?.tipo)) {
        return res.status(403).json({ error: 'Solo administración puede cambiar la mascota' });
      }
      if (!req.file) return res.status(400).json({ error: 'Falta la imagen' });
      const mascota = await guardarImagenPrincipal(colegioDe(req), req.file.path, req.file.originalname);
      res.json(paraCliente(mascota));
    } catch (e) {
      if (req.file?.path) fs.unlink(req.file.path, () => {});
      console.error('[mascota imagen]', e);
      res.status(e.status || 500).json({ error: e.status === 400 ? e.message : 'No se pudo guardar la imagen' });
    }
  });
});

router.delete('/imagen', async (req, res) => {
  try {
    if (!puedeEditar(req.user?.tipo)) {
      return res.status(403).json({ error: 'Solo administración puede cambiar la mascota' });
    }
    const mascota = await quitarImagenPrincipal(colegioDe(req));
    res.json(paraCliente(mascota));
  } catch (e) {
    console.error('[mascota imagen delete]', e);
    res.status(500).json({ error: 'No se pudo quitar la imagen' });
  }
});

router.post('/fichas', (req, res) => {
  upload.array('imagenes', 12)(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Imagen no válida' });
    try {
      if (!puedeEditar(req.user?.tipo)) {
        return res.status(403).json({ error: 'Solo administración puede cambiar la mascota' });
      }
      if (!req.files?.length) return res.status(400).json({ error: 'Falta al menos un dibujo' });
      const mascota = await agregarImagenesFicha(
        colegioDe(req),
        req.files.map((f) => ({ path: f.path, originalname: f.originalname }))
      );
      for (const f of req.files) {
        if (f.path && fs.existsSync(f.path)) fs.unlink(f.path, () => {});
      }
      res.json(paraCliente(mascota));
    } catch (e) {
      for (const f of req.files || []) {
        if (f.path && fs.existsSync(f.path)) fs.unlink(f.path, () => {});
      }
      console.error('[mascota fichas]', e);
      res.status(e.status || 500).json({ error: e.status === 400 ? e.message : 'No se pudieron guardar los dibujos' });
    }
  });
});

router.delete('/fichas/:id', async (req, res) => {
  try {
    if (!puedeEditar(req.user?.tipo)) {
      return res.status(403).json({ error: 'Solo administración puede cambiar la mascota' });
    }
    const mascota = await quitarImagenFicha(colegioDe(req), req.params.id);
    res.json(paraCliente(mascota));
  } catch (e) {
    console.error('[mascota ficha delete]', e);
    res.status(500).json({ error: 'No se pudo quitar el dibujo' });
  }
});

module.exports = router;
