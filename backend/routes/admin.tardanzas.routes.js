/**
 * Admin — Tardanzas del personal (importación huellero + listado).
 */
const express = require('express');
const multer = require('multer');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const {
  previewHuelleroImport,
  importarHuellero,
  listarTardanzas,
  actualizarHoraRegistro,
  eliminarRegistroTardanza,
  loadPersonalColegio,
  getAnioActivo,
  buildExportWorkbook,
  DESCUENTO_POR_MINUTO,
} = require('../utils/adminTardanzasHuellero');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok =
      /\.xlsx?$/i.test(file.originalname || '') ||
      file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      file.mimetype === 'application/vnd.ms-excel';
    cb(ok ? null : new Error('Solo archivos Excel (.xlsx, .xls).'), ok);
  },
});

router.use(authenticateToken);
router.use((req, res, next) => {
  if (req.user?.tipo === 'ADMINISTRADOR') return next();
  return res.status(403).json({ error: 'Solo el administrador puede gestionar tardanzas del personal.' });
});

function colegioId(req) {
  return req.user.colegio_id;
}

/** GET /api/admin/tardanzas/meta */
router.get('/meta', async (req, res) => {
  try {
    const { query } = require('../utils/mysql');
    const cid = colegioId(req);
    const { anio, colegio_nombre } = await getAnioActivo(query, cid);
    const personal = await loadPersonalColegio(query, cid);
    res.json({
      colegio_nombre,
      anio,
      tarifa_por_minuto: DESCUENTO_POR_MINUTO,
      personal: personal.map((p) => ({
        id: p.personal_id,
        nombre: `${String(p.apellidos || '').trim()}, ${String(p.nombres || '').trim()}`.replace(/^,\s*|,\s*$/g, '').trim(),
        tiene_usuario: !!p.usuario_id,
      })),
    });
  } catch (e) {
    console.error('[admin/tardanzas/meta]', e);
    res.status(500).json({ error: e.message || 'Error al cargar metadatos.' });
  }
});

/** GET /api/admin/tardanzas/lista?personal_id=&desde=&hasta= */
router.get('/lista', async (req, res) => {
  try {
    const { query } = require('../utils/mysql');
    const data = await listarTardanzas(query, colegioId(req), req.query);
    res.json(data);
  } catch (e) {
    console.error('[admin/tardanzas/lista]', e);
    res.status(500).json({ error: e.message || 'Error al listar tardanzas.' });
  }
});

/** GET /api/admin/tardanzas/export — Excel con mismos filtros que lista */
router.get('/export', async (req, res) => {
  try {
    const { query } = require('../utils/mysql');
    const data = await listarTardanzas(query, colegioId(req), req.query);
    const buf = buildExportWorkbook(data);
    const suffix = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="tardanzas-personal-${suffix}.xlsx"`);
    res.send(buf);
  } catch (e) {
    console.error('[admin/tardanzas/export]', e);
    res.status(500).json({ error: e.message || 'Error al exportar.' });
  }
});

/** POST /api/admin/tardanzas/preview */
router.post('/preview', upload.single('archivo'), async (req, res) => {
  try {
    if (!req.file?.buffer?.length) {
      return res.status(400).json({ error: 'Adjunte un archivo Excel.' });
    }
    const { query } = require('../utils/mysql');
    const data = await previewHuelleroImport(query, colegioId(req), req.file.buffer);
    res.json(data);
  } catch (e) {
    console.error('[admin/tardanzas/preview]', e);
    res.status(e.status || 500).json({ error: e.message || 'No se pudo leer el Excel.' });
  }
});

/** POST /api/admin/tardanzas/importar */
router.post('/importar', upload.single('archivo'), async (req, res) => {
  try {
    if (!req.file?.buffer?.length) {
      return res.status(400).json({ error: 'Adjunte un archivo Excel.' });
    }
    const { query, execute } = require('../utils/mysql');
    const adminUsuarioId = req.user?.usuario_id || req.user?.id || null;
    const stats = await importarHuellero(
      query,
      execute,
      colegioId(req),
      adminUsuarioId,
      req.file.buffer
    );
    res.json({ ok: true, stats });
  } catch (e) {
    console.error('[admin/tardanzas/importar]', e);
    res.status(e.status || 500).json({ error: e.message || 'Error al importar.' });
  }
});

/** PATCH /api/admin/tardanzas/registro/:id — editar solo hora de marcación */
router.patch('/registro/:id', async (req, res) => {
  try {
    const registroId = parseInt(req.params.id, 10);
    if (!Number.isFinite(registroId)) {
      return res.status(400).json({ error: 'ID de registro inválido.' });
    }
    const horaMarcacion = req.body?.hora_marcacion ?? req.body?.hora;
    if (!horaMarcacion) {
      return res.status(400).json({ error: 'Indique la hora de marcación (HH:MM).' });
    }
    const { query, execute } = require('../utils/mysql');
    const adminUsuarioId = req.user?.usuario_id || req.user?.id || null;
    const fila = await actualizarHoraRegistro(
      query,
      execute,
      colegioId(req),
      registroId,
      horaMarcacion,
      adminUsuarioId
    );
    res.json({ ok: true, fila });
  } catch (e) {
    console.error('[admin/tardanzas/registro PATCH]', e);
    res.status(e.status || 500).json({ error: e.message || 'Error al actualizar la hora.' });
  }
});

/** DELETE /api/admin/tardanzas/registro/:id */
router.delete('/registro/:id', async (req, res) => {
  try {
    const registroId = parseInt(req.params.id, 10);
    if (!Number.isFinite(registroId)) {
      return res.status(400).json({ error: 'ID de registro inválido.' });
    }
    const { query, execute } = require('../utils/mysql');
    const result = await eliminarRegistroTardanza(query, execute, colegioId(req), registroId);
    res.json(result);
  } catch (e) {
    console.error('[admin/tardanzas/registro DELETE]', e);
    res.status(e.status || 500).json({ error: e.message || 'Error al eliminar el registro.' });
  }
});

module.exports = router;
