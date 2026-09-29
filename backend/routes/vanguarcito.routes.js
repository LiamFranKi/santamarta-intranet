const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { moduloActivo } = require('../utils/modulosSistema');
const { guardarCupos, paraCliente, leerMascota } = require('../utils/mascotaColegio');
const { estadoChat, responder, exportar, perfilDe } = require('../services/vanguarcitoChat');

const router = express.Router();
router.use(authenticateToken);

function puedeEditar(tipo) {
  return tipo === 'ADMINISTRADOR' || tipo === 'PROMOTORIA';
}

router.get('/estado', async (req, res) => {
  try {
    if (!(await moduloActivo('herramientas.vanguarcito'))) {
      return res.status(403).json({ error: 'El asistente está apagado.' });
    }
    const data = await estadoChat(req.user);
    if (!data.permitido) return res.status(403).json({ error: 'Este perfil no usa el asistente.' });
    res.json(data);
  } catch (e) {
    console.error('[vanguarcito estado]', e);
    res.status(500).json({ error: 'No se pudo abrir el asistente.' });
  }
});

router.post('/preguntar', async (req, res) => {
  try {
    const data = await responder(req.user, req.body?.texto);
    res.json(data);
  } catch (e) {
    if (e.causa) console.error('[vanguarcito]', e.causa);
    const status = e.status || 500;
    if (status >= 500) console.error('[vanguarcito preguntar]', e.message);
    res.status(status).json({ error: e.message || 'No se pudo responder.' });
  }
});

router.post('/archivo', async (req, res) => {
  try {
    if (!perfilDe(req.user?.tipo)) {
      return res.status(403).json({ error: 'Este perfil no usa el asistente.' });
    }
    const archivo = await exportar(req.user, req.body?.texto, req.body?.formato);
    const nombre = `respuesta.${archivo.ext}`;
    res.setHeader('Content-Type', archivo.mime);
    res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
    res.send(archivo.buffer);
  } catch (e) {
    const status = e.status || 500;
    if (status >= 500) console.error('[vanguarcito archivo]', e);
    res.status(status).json({ error: e.message || 'No se pudo crear el archivo.' });
  }
});

router.put('/cupos', async (req, res) => {
  try {
    if (!puedeEditar(req.user?.tipo)) {
      return res.status(403).json({ error: 'Solo administración puede cambiar el cupo.' });
    }
    const mascota = await guardarCupos(req.user.colegio_id, req.body || {});
    res.json(paraCliente(mascota));
  } catch (e) {
    console.error('[vanguarcito cupos]', e);
    res.status(500).json({ error: 'No se pudo guardar el cupo.' });
  }
});

router.get('/cupos', async (req, res) => {
  try {
    if (!puedeEditar(req.user?.tipo)) {
      return res.status(403).json({ error: 'Solo administración puede ver esta configuración.' });
    }
    const mascota = await leerMascota(req.user.colegio_id);
    res.json(paraCliente(mascota));
  } catch (e) {
    res.status(500).json({ error: 'No se pudo leer el cupo.' });
  }
});

module.exports = router;
