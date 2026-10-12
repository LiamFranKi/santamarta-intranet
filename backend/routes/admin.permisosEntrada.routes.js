/**
 * Permisos de hora de entrada del personal. Solo el administrador.
 */
const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { query } = require('../utils/mysql');
const { loadPersonalColegio, personalCuentaControlAsistencia } = require('../utils/adminTardanzasHuellero');
const {
  listarPermisos,
  guardarPermiso,
  borrarPermiso,
} = require('../utils/permisoEntradaPersonal');

router.use(authenticateToken);
router.use((req, res, next) => {
  if (req.user?.tipo === 'ADMINISTRADOR') return next();
  return res.status(403).json({ error: 'Solo el administrador configura los permisos de entrada.' });
});

router.get('/', async (req, res) => {
  try {
    const colegioId = req.user.colegio_id;
    const permisos = await listarPermisos(colegioId);
    const personal = (await loadPersonalColegio(query, colegioId))
      .filter(personalCuentaControlAsistencia)
      .map((p) => ({
        id: p.personal_id,
        nombre: `${String(p.apellidos || '').trim()}, ${String(p.nombres || '').trim()}`.replace(/^,\s*|,\s*$/g, '').trim(),
        tipo: p.usuario_tipo || '',
        hora_entrada: p.hora_entrada ? String(p.hora_entrada).slice(0, 5) : '',
      }));
    res.json({ permisos, personal });
  } catch (e) {
    res.status(500).json({ error: e.message || 'No se pudieron leer los permisos.' });
  }
});

router.post('/', async (req, res) => {
  try {
    const id = await guardarPermiso(req.user.colegio_id, req.body || {});
    res.json({ id, permisos: await listarPermisos(req.user.colegio_id) });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'No se pudo guardar el permiso.' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    await guardarPermiso(req.user.colegio_id, req.body || {}, id);
    res.json({ permisos: await listarPermisos(req.user.colegio_id) });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'No se pudo guardar el permiso.' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const ok = await borrarPermiso(req.user.colegio_id, parseInt(req.params.id, 10));
    if (!ok) return res.status(404).json({ error: 'No se encontró el permiso.' });
    res.json({ permisos: await listarPermisos(req.user.colegio_id) });
  } catch (e) {
    res.status(500).json({ error: e.message || 'No se pudo quitar el permiso.' });
  }
});

module.exports = router;
