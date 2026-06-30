/**
 * Módulo Pagos escolares + BCP (admin / secretaría / cajero).
 * Montaje: /api/admin/pagos
 */
const express = require('express');
const multer = require('multer');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { cargarMetaReportesGeneral } = require('../utils/reportesGeneralMeta');
const { buscarAlumnosPagosGrupo } = require('../utils/pagosBuscarAlumnos');
const { cargarBcpColegioConfig } = require('../utils/bcpColegioConfig');
const { generarCrep, listarGruposBcp, buscarMatriculasAutocomplete } = require('../utils/bcpCrepExport');
const { importarCdpg, importarNumeroOperacion, listarHistorialImportaciones, obtenerHistorialImportacion } = require('../utils/bcpCdpgImport');
const { boletearGeneral, boletearMoras, boletearHistorialImportacion } = require('../utils/boletearPagos');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

router.use(authenticateToken);
router.use((req, res, next) => {
  const t = req.user?.tipo;
  if (t === 'ADMINISTRADOR' || t === 'SECRETARIA' || t === 'CAJERO') return next();
  return res.status(403).json({ error: 'No autorizado para el módulo de pagos.' });
});

function colegioId(req) {
  return req.user.colegio_id;
}

/** GET /api/admin/pagos/meta */
router.get('/meta', async (req, res) => {
  try {
    res.json(await cargarMetaReportesGeneral(colegioId(req)));
  } catch (e) {
    console.error('[admin/pagos/meta]', e);
    res.status(500).json({ error: e.message || 'Error al cargar catálogos' });
  }
});

/** GET /api/admin/pagos/bcp/config — recaudo + opciones nro_pago */
router.get('/bcp/config', async (req, res) => {
  try {
    const cfg = await cargarBcpColegioConfig(colegioId(req));
    res.json({
      anio_activo: cfg.anio_activo,
      total_pensiones: cfg.total_pensiones,
      opciones_nro_pago: cfg.opciones_nro_pago,
      recaudo: cfg.recaudo,
      recaudo_completo: !cfg.recaudo.nro_sucursal || !cfg.recaudo.nro_cuenta || !cfg.recaudo.razon_social ? false : true,
    });
  } catch (e) {
    console.error('[admin/pagos/bcp/config]', e);
    res.status(500).json({ error: e.message || 'Error al cargar configuración BCP' });
  }
});

/** GET /api/admin/pagos/bcp/grupos?anio=&sede_id= */
router.get('/bcp/grupos', async (req, res) => {
  try {
    const anio = parseInt(req.query.anio, 10);
    const sedeId = req.query.sede_id !== undefined && req.query.sede_id !== '' ? parseInt(req.query.sede_id, 10) : null;
    if (!Number.isFinite(anio)) {
      return res.status(400).json({ error: 'Indique un año válido.' });
    }
    const grupos = await listarGruposBcp(colegioId(req), anio, sedeId);
    res.json({ grupos });
  } catch (e) {
    console.error('[admin/pagos/bcp/grupos]', e);
    res.status(500).json({ error: e.message || 'Error al listar grupos' });
  }
});

/** GET /api/admin/pagos/bcp/matriculas-buscar?q=&anio= */
router.get('/bcp/matriculas-buscar', async (req, res) => {
  try {
    const anio = parseInt(req.query.anio, 10);
    if (!Number.isFinite(anio)) {
      return res.status(400).json({ error: 'Indique un año válido.' });
    }
    const items = await buscarMatriculasAutocomplete(colegioId(req), anio, req.query.q);
    res.json({ items });
  } catch (e) {
    console.error('[admin/pagos/bcp/matriculas-buscar]', e);
    res.status(500).json({ error: e.message || 'Error en búsqueda' });
  }
});

/** GET /api/admin/pagos/bcp/exportar-crep — descarga CREP.txt */
router.get('/bcp/exportar-crep', async (req, res) => {
  try {
    const matriculaIds = [];
    if (req.query.matricula_id) {
      const raw = Array.isArray(req.query.matricula_id) ? req.query.matricula_id : [req.query.matricula_id];
      raw.forEach((id) => matriculaIds.push(id));
    }

    const result = await generarCrep(colegioId(req), {
      anio: req.query.anio,
      fecha: req.query.fecha,
      nro_pago: parseInt(req.query.nro_pago, 10),
      grupo_id: req.query.grupo_id,
      sede_id: req.query.sede_id,
      tipo: req.query.tipo,
      tipo_alumno: req.query.tipo_alumno,
      tipo_documento: req.query.tipo_documento,
      matricula_id: matriculaIds,
    });

    if (!result.ok) {
      return res.status(result.status || 500).json({ error: result.error });
    }

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=CREP.txt');
    res.send(result.content);
  } catch (e) {
    console.error('[admin/pagos/bcp/exportar-crep]', e);
    res.status(500).json({ error: e.message || 'Error al generar CREP' });
  }
});

/** POST /api/admin/pagos/bcp/importar-cdpg — multipart archivo */
router.post('/bcp/importar-cdpg', upload.single('archivo'), async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ code: -1, error: 'No se pudo subir el archivo.' });
    }

    const nombre = req.file.originalname || 'importacion.txt';
    if (!/\.txt$/i.test(nombre)) {
      return res.status(400).json({ code: -1, error: 'El archivo debe ser .txt (formato CDPG del banco).' });
    }

    const text = req.file.buffer.toString('utf8');
    if (!text.trim()) {
      return res.status(400).json({ code: -3, error: 'El archivo está vacío.', errores: ['Archivo sin contenido'] });
    }

    const result = await importarCdpg(colegioId(req), text, nombre, req.user);

    if (!result.ok) {
      return res.status(result.status || 400).json({
        code: result.code,
        error: result.error,
        errores: result.errores || [],
        pagos_procesados: result.pagos_procesados,
      });
    }

    res.json({
      code: result.code,
      pagos_procesados: result.pagos_procesados,
      historial_id: result.historial_id,
    });
  } catch (e) {
    console.error('[admin/pagos/bcp/importar-cdpg]', e);
    res.status(500).json({ code: -1, error: e.message || 'Error al importar CDPG' });
  }
});

/** POST /api/admin/pagos/bcp/importar-operacion — Excel */
router.post('/bcp/importar-operacion', upload.single('archivo'), async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ code: -1, error: 'No se pudo subir el archivo.' });
    }

    const startRow = parseInt(req.body.start_row, 10) || 5;
    const result = await importarNumeroOperacion(colegioId(req), req.file.buffer, startRow);

    if (!result.ok) {
      return res.status(result.status || 400).json({ code: -1, error: result.error });
    }

    res.json({
      code: result.code,
      actualizados: result.actualizados,
      errores: result.errores || [],
    });
  } catch (e) {
    console.error('[admin/pagos/bcp/importar-operacion]', e);
    res.status(500).json({ code: -1, error: e.message || 'Error al importar operaciones' });
  }
});

/** GET /api/admin/pagos/bcp/historial?page=1&page_size=10&anio= */
router.get('/bcp/historial', async (req, res) => {
  try {
    const cid = colegioId(req);
    const cfg = await cargarBcpColegioConfig(cid);
    const anio = parseInt(req.query.anio, 10) || cfg.anio_activo;
    const data = await listarHistorialImportaciones(cid, {
      anio,
      page: req.query.page,
      pageSize: req.query.page_size,
    });
    res.json(data);
  } catch (e) {
    console.error('[admin/pagos/bcp/historial]', e);
    res.status(500).json({ error: e.message || 'Error al cargar historial' });
  }
});

/** GET /api/admin/pagos/bcp/historial/:id — detalle del lote importado */
router.get('/bcp/historial/:id', async (req, res) => {
  try {
    const result = await obtenerHistorialImportacion(colegioId(req), req.params.id);
    if (!result.ok) {
      return res.status(result.status || 400).json({ error: result.error });
    }
    res.json(result);
  } catch (e) {
    console.error('[admin/pagos/bcp/historial/:id]', e);
    res.status(500).json({ error: e.message || 'Error al cargar detalle del historial' });
  }
});

/** POST /api/admin/pagos/bcp/historial/:id/boletear — ZIP boletas del lote */
router.post('/bcp/historial/:id/boletear', async (req, res) => {
  try {
    const result = await boletearHistorialImportacion(colegioId(req), req.params.id);
    if (!result.ok) {
      return res.status(result.status || 400).json({ error: result.error });
    }
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename=${result.filename}`);
    res.setHeader('X-Boletas-Count', String(result.boletas));
    res.send(result.buffer);
  } catch (e) {
    console.error('[admin/pagos/bcp/historial/:id/boletear]', e);
    res.status(500).json({ error: e.message || 'Error al boletear historial' });
  }
});

/** POST /api/admin/pagos/boletear/general — todos los grupos (do_boletear_json2) */
router.post('/boletear/general', async (req, res) => {
  try {
    const result = await boletearGeneral(colegioId(req), {
      nro_pago: req.body.nro_pago,
      personal_id: req.user.personal_id,
    });
    if (!result.ok) {
      return res.status(result.status || 400).json({ error: result.error });
    }
    if (result.boletas === 0) {
      return res.status(400).json({
        error: 'No hay boletas pendientes de impresión para la mensualidad seleccionada.',
      });
    }
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename=${result.filename}`);
    res.setHeader('X-Boletas-Count', String(result.boletas));
    res.send(result.buffer);
  } catch (e) {
    console.error('[admin/pagos/boletear/general]', e);
    res.status(500).json({ error: e.message || 'Error al boletear pagos' });
  }
});

/** POST /api/admin/pagos/boletear/moras — rango fechas (do_boletear_moras_json) */
router.post('/boletear/moras', async (req, res) => {
  try {
    const result = await boletearMoras(colegioId(req), {
      from: req.body.from,
      to: req.body.to,
      cantidad: req.body.cantidad,
    });
    if (!result.ok) {
      return res.status(result.status || 400).json({ error: result.error });
    }
    if (result.boletas === 0) {
      return res.status(400).json({
        error: 'No hay notas de débito pendientes de impresión en el rango indicado.',
      });
    }
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename=${result.filename}`);
    res.setHeader('X-Boletas-Count', String(result.boletas));
    res.send(result.buffer);
  } catch (e) {
    console.error('[admin/pagos/boletear/moras]', e);
    res.status(500).json({ error: e.message || 'Error al boletear moras' });
  }
});

/** GET /api/admin/pagos/buscar-alumnos */
router.get('/buscar-alumnos', async (req, res) => {
  try {
    const cid = colegioId(req);
    const anio = parseInt(req.query.anio, 10);
    const nivelId = parseInt(req.query.nivel_id, 10);
    const grado = parseInt(req.query.grado, 10);
    const seccion = String(req.query.seccion || '').trim();
    const turnoId = parseInt(req.query.turno_id, 10);
    const sedeRaw = req.query.sede_id;
    const sedeId = sedeRaw !== undefined && sedeRaw !== '' ? parseInt(sedeRaw, 10) : null;

    if (!Number.isFinite(anio) || !Number.isFinite(nivelId) || !Number.isFinite(grado) || !seccion || !Number.isFinite(turnoId)) {
      return res.status(400).json({
        error: 'Parámetros incompletos: anio, nivel_id, grado, seccion, turno_id',
      });
    }

    const result = await buscarAlumnosPagosGrupo(cid, {
      anio,
      nivelId,
      grado,
      seccion,
      turnoId,
      sedeId,
    });

    if (!result.ok) {
      return res.status(result.status || 500).json({ error: result.error });
    }

    res.json(result);
  } catch (e) {
    console.error('[admin/pagos/buscar-alumnos]', e);
    res.status(500).json({ error: e.message || 'Error al buscar alumnos' });
  }
});

module.exports = router;
