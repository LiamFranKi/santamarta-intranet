/**
 * Reportes → General (admin / promotoría).
 */
const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { obtenerListaUnGrupo, obtenerListaTodosGrupos } = require('../utils/listaAlumnosMatriculadosReporte');
const { cargarMetaReportesGeneral } = require('../utils/reportesGeneralMeta');
const {
  obtenerResumenMatriculados,
  obtenerListaRetirados,
} = require('../utils/reportesGeneralResumenRetirados');
const {
  obtenerListaDeudores,
  obtenerListaPagadores,
} = require('../utils/reportesGeneralDeudoresPagadores');
const { obtenerResumenIngresos } = require('../utils/reportesGeneralResumenIngresos');
const { obtenerListaMaestrosPorAula } = require('../utils/reportesGeneralMaestrosPorAula');
const { obtenerListaPersonal } = require('../utils/reportesGeneralListaPersonal');
const { obtenerAsistenciaMensual } = require('../utils/reportesGeneralAsistenciaMensual');

router.use(authenticateToken);
router.use((req, res, next) => {
  const t = req.user?.tipo;
  if (t === 'ADMINISTRADOR' || t === 'PROMOTORIA') return next();
  return res.status(403).json({ error: 'No autorizado para reportes administrativos.' });
});

function colegioId(req) {
  return req.user.colegio_id;
}

/** GET /api/admin/reportes/general/meta — catálogos compartidos */
router.get('/meta', async (req, res) => {
  try {
    res.json(await cargarMetaReportesGeneral(colegioId(req)));
  } catch (e) {
    console.error('[reportes/general/meta]', e);
    res.status(500).json({ error: e.message || 'Error al cargar catálogos' });
  }
});

/** @deprecated use /meta */
router.get('/alumnos-matriculados/meta', async (req, res) => {
  try {
    res.json(await cargarMetaReportesGeneral(colegioId(req)));
  } catch (e) {
    console.error('[reportes/general/meta]', e);
    res.status(500).json({ error: e.message || 'Error al cargar catálogos' });
  }
});

/** GET /api/admin/reportes/general/resumen-matriculados */
router.get('/resumen-matriculados', async (req, res) => {
  try {
    const cid = colegioId(req);
    const anio = parseInt(req.query.anio, 10);
    const sedeId = parseInt(req.query.sede_id, 10);
    if (!Number.isFinite(anio)) {
      return res.status(400).json({ error: 'Indique un año válido.' });
    }
    const data = await obtenerResumenMatriculados(cid, {
      anio,
      sedeId: Number.isFinite(sedeId) ? sedeId : null,
    });
    res.json(data);
  } catch (e) {
    console.error('[reportes/general/resumen-matriculados]', e);
    res.status(500).json({ error: e.message || 'Error al generar resumen' });
  }
});

/** GET /api/admin/reportes/general/alumnos-retirados */
router.get('/alumnos-retirados', async (req, res) => {
  try {
    const cid = colegioId(req);
    const anio = parseInt(req.query.anio, 10);
    const sedeId = parseInt(req.query.sede_id, 10);
    const nivelRaw = req.query.nivel_id;
    let nivelId = null;
    if (nivelRaw !== undefined && nivelRaw !== '' && String(nivelRaw).toUpperCase() !== 'TODOS') {
      nivelId = parseInt(nivelRaw, 10);
      if (!Number.isFinite(nivelId)) {
        return res.status(400).json({ error: 'Nivel inválido.' });
      }
    }
    if (!Number.isFinite(anio)) {
      return res.status(400).json({ error: 'Indique un año válido.' });
    }
    const data = await obtenerListaRetirados(cid, {
      anio,
      sedeId: Number.isFinite(sedeId) ? sedeId : null,
      nivelId,
    });
    res.json(data);
  } catch (e) {
    console.error('[reportes/general/alumnos-retirados]', e);
    res.status(500).json({ error: e.message || 'Error al generar lista' });
  }
});

function parseSedeAnioConcepto(req) {
  const anio = parseInt(req.query.anio, 10);
  const sedeId = parseInt(req.query.sede_id, 10);
  const conceptoRaw = req.query.concepto != null ? String(req.query.concepto).trim() : 'todos';
  if (!Number.isFinite(anio)) {
    return { error: 'Indique un año válido.', status: 400 };
  }
  if (!Number.isFinite(sedeId)) {
    return { error: 'Indique una sede válida.', status: 400 };
  }
  return { anio, sedeId, conceptoRaw };
}

/** GET /api/admin/reportes/general/resumen-ingresos?desde=YYYY-MM-DD&hasta=YYYY-MM-DD&sede_id= */
router.get('/resumen-ingresos', async (req, res) => {
  try {
    const sedeId = parseInt(req.query.sede_id, 10);
    const data = await obtenerResumenIngresos(colegioId(req), {
      desde: req.query.desde,
      hasta: req.query.hasta,
      sedeId: Number.isFinite(sedeId) ? sedeId : null,
    });
    res.json(data);
  } catch (e) {
    const msg = e.message || 'Error al generar resumen de ingresos';
    const status = /válid|posterior|Indique/i.test(msg) ? 400 : 500;
    console.error('[reportes/general/resumen-ingresos]', e);
    res.status(status).json({ error: msg });
  }
});

/** GET /api/admin/reportes/general/alumnos-deudores */
router.get('/alumnos-deudores', async (req, res) => {
  try {
    const parsed = parseSedeAnioConcepto(req);
    if (parsed.error) return res.status(parsed.status).json({ error: parsed.error });
    const data = await obtenerListaDeudores(colegioId(req), parsed);
    res.json(data);
  } catch (e) {
    console.error('[reportes/general/alumnos-deudores]', e);
    res.status(500).json({ error: e.message || 'Error al generar lista de deudores' });
  }
});

/** GET /api/admin/reportes/general/alumnos-pagadores */
router.get('/alumnos-pagadores', async (req, res) => {
  try {
    const parsed = parseSedeAnioConcepto(req);
    if (parsed.error) return res.status(parsed.status).json({ error: parsed.error });
    const data = await obtenerListaPagadores(colegioId(req), parsed);
    res.json(data);
  } catch (e) {
    console.error('[reportes/general/alumnos-pagadores]', e);
    res.status(500).json({ error: e.message || 'Error al generar lista de pagadores' });
  }
});

/** GET /api/admin/reportes/general/alumnos-matriculados/lista */
router.get('/alumnos-matriculados/lista', async (req, res) => {
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
      return res.status(400).json({ error: 'Parámetros incompletos: anio, nivel_id, grado, seccion, turno_id' });
    }

    const result = await obtenerListaUnGrupo(cid, { anio, nivelId, grado, seccion, turnoId, sedeId });
    if (!result.ok) {
      return res.status(result.status || 500).json({ error: result.error });
    }
    res.json(result);
  } catch (e) {
    console.error('[reportes/general/lista]', e);
    res.status(500).json({ error: e.message || 'Error al generar lista' });
  }
});

/** GET /api/admin/reportes/general/alumnos-matriculados/lista-todos */
router.get('/alumnos-matriculados/lista-todos', async (req, res) => {
  try {
    const cid = colegioId(req);
    const anio = parseInt(req.query.anio, 10);
    const turnoId = parseInt(req.query.turno_id, 10);
    const sedeRaw = req.query.sede_id;
    const sedeId = sedeRaw !== undefined && sedeRaw !== '' ? parseInt(sedeRaw, 10) : null;

    if (!Number.isFinite(anio) || !Number.isFinite(turnoId)) {
      return res.status(400).json({ error: 'Indique año y turno válidos.' });
    }

    const result = await obtenerListaTodosGrupos(cid, { anio, turnoId, sedeId });
    res.json(result);
  } catch (e) {
    console.error('[reportes/general/lista-todos]', e);
    res.status(500).json({ error: e.message || 'Error al generar listas' });
  }
});

/** GET /api/admin/reportes/general/maestros-por-aula */
router.get('/maestros-por-aula', async (req, res) => {
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
      return res.status(400).json({ error: 'Parámetros incompletos: anio, nivel_id, grado, seccion, turno_id' });
    }

    const result = await obtenerListaMaestrosPorAula(cid, {
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
    console.error('[reportes/general/maestros-por-aula]', e);
    res.status(500).json({ error: e.message || 'Error al generar lista de maestros' });
  }
});

/** GET /api/admin/reportes/general/lista-personal */
router.get('/lista-personal', async (req, res) => {
  try {
    const cid = colegioId(req);
    const anio = parseInt(req.query.anio, 10);
    const turnoId = parseInt(req.query.turno_id, 10);
    const sedeRaw = req.query.sede_id;
    const sedeId = sedeRaw !== undefined && sedeRaw !== '' ? parseInt(sedeRaw, 10) : null;

    const result = await obtenerListaPersonal(cid, {
      anio,
      sedeId: Number.isFinite(sedeId) ? sedeId : null,
      turnoId: Number.isFinite(turnoId) ? turnoId : null,
      ordenCampo: req.query.orden_campo,
      ordenDir: req.query.orden_dir,
    });
    if (!result.ok) {
      return res.status(result.status || 500).json({ error: result.error });
    }
    res.json(result);
  } catch (e) {
    console.error('[reportes/general/lista-personal]', e);
    res.status(500).json({ error: e.message || 'Error al generar lista de personal' });
  }
});

/** GET /api/admin/reportes/general/asistencia-mensual */
router.get('/asistencia-mensual', async (req, res) => {
  try {
    const cid = colegioId(req);
    const anio = parseInt(req.query.anio, 10);
    const mes = parseInt(req.query.mes, 10);
    const nivelId = parseInt(req.query.nivel_id, 10);
    const grado = parseInt(req.query.grado, 10);
    const seccion = String(req.query.seccion || '').trim();
    const turnoId = parseInt(req.query.turno_id, 10);
    const sedeRaw = req.query.sede_id;
    const sedeId = sedeRaw !== undefined && sedeRaw !== '' ? parseInt(sedeRaw, 10) : null;

    if (!Number.isFinite(anio) || !Number.isFinite(mes) || !Number.isFinite(nivelId) || !Number.isFinite(grado) || !seccion || !Number.isFinite(turnoId)) {
      return res.status(400).json({ error: 'Parámetros incompletos: anio, mes, nivel_id, grado, seccion, turno_id' });
    }

    const result = await obtenerAsistenciaMensual(cid, {
      anio,
      mes,
      nivelId,
      grado,
      seccion,
      turnoId,
      sedeId: Number.isFinite(sedeId) ? sedeId : null,
    });
    if (!result.ok) {
      return res.status(result.status || 500).json({ error: result.error });
    }
    res.json(result);
  } catch (e) {
    console.error('[reportes/general/asistencia-mensual]', e);
    res.status(500).json({ error: e.message || 'Error al generar reporte de asistencia' });
  }
});

module.exports = router;
