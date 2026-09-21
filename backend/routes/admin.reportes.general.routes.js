/**
 * Reportes → General (admin / promotoría / coordinador).
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
const { obtenerListaAlumnosPuntuales } = require('../utils/reportesGeneralAlumnosPuntuales');
const { obtenerResumenIngresos } = require('../utils/reportesGeneralResumenIngresos');
const { obtenerListaMaestrosPorAula } = require('../utils/reportesGeneralMaestrosPorAula');
const { obtenerListaPersonal } = require('../utils/reportesGeneralListaPersonal');
const { obtenerHorariosPersonal } = require('../utils/reportesGeneralHorariosPersonal');
const { obtenerAsistenciaMensual } = require('../utils/reportesGeneralAsistenciaMensual');
const {
  obtenerConsolidadoAsistencia,
  obtenerDetalleConsolidadoAsistencia,
  generarExcelConsolidadoAsistencia,
} = require('../utils/reportesGeneralAsistenciaConsolidado');
const { generarExcelMontoPagarReal } = require('../utils/reportesGeneralMontoPagarReal');
const { generarExcelReporteAlumnos } = require('../utils/reportesGeneralAlumnos');
const { generarExcelDeudaAnual } = require('../utils/reportesGeneralDeudaAnual');
const { obtenerRankingNotas } = require('../utils/reportesGeneralRankingNotas');
const {
  construirDatosAsistenciaPersonal,
  generarExcelAsistenciaPersonal,
} = require('../utils/reportesGeneralAsistenciaPersonal');
const {
  construirConsolidadoPromedios,
  generarExcelConsolidadoPromedios,
} = require('../utils/reportesGeneralConsolidadoPromedios');
const {
  generarExcelConsolidadoPromediosDetallado,
} = require('../utils/reportesGeneralConsolidadoPromediosDetallado');
const {
  obtenerExamenesVirtuales,
  generarExcelExamenesVirtuales,
} = require('../utils/reportesGeneralExamenesVirtuales');
const {
  obtenerIncidenciasEstrellas,
  generarExcelIncidenciasEstrellas,
} = require('../utils/reportesGeneralIncidenciasEstrellas');

router.use(authenticateToken);
router.use((req, res, next) => {
  const t = req.user?.tipo;
  if (t === 'ADMINISTRADOR' || t === 'PROMOTORIA' || t === 'COORDINADOR' || t === 'DIRECTOR' || t === 'CONTADOR') return next();
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

/** GET /api/admin/reportes/general/alumnos-puntuales?anio=&sede_id=&mes_hasta= */
router.get('/alumnos-puntuales', async (req, res) => {
  try {
    const anio = parseInt(req.query.anio, 10);
    const sedeId = parseInt(req.query.sede_id, 10);
    const mesHasta = parseInt(req.query.mes_hasta, 10);
    if (!Number.isFinite(anio)) {
      return res.status(400).json({ error: 'Indique un año válido.' });
    }
    if (!Number.isFinite(sedeId)) {
      return res.status(400).json({ error: 'Indique una sede válida.' });
    }
    if (!Number.isFinite(mesHasta)) {
      return res.status(400).json({ error: 'Indique el mes de pensión hasta el cual filtrar.' });
    }
    const data = await obtenerListaAlumnosPuntuales(colegioId(req), { anio, sedeId, mesHasta });
    res.json(data);
  } catch (e) {
    const msg = e.message || 'Error al generar lista de alumnos puntuales';
    const status = /válid|Indique/i.test(msg) ? 400 : 500;
    console.error('[reportes/general/alumnos-puntuales]', e);
    res.status(status).json({ error: msg });
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

/** GET /api/admin/reportes/general/horarios-personal */
router.get('/horarios-personal', async (req, res) => {
  try {
    const cid = colegioId(req);
    const anio = parseInt(req.query.anio, 10);
    const nivelRaw = req.query.nivel_id;
    const nivelId = nivelRaw !== undefined && nivelRaw !== '' ? parseInt(nivelRaw, 10) : null;
    const soloLista = String(req.query.solo_lista || '') === '1';

    const result = await obtenerHorariosPersonal(cid, {
      anio,
      nivelId: Number.isFinite(nivelId) ? nivelId : null,
      personalIds: req.query.personal_ids,
      soloLista,
    });
    if (!result.ok) {
      return res.status(result.status || 500).json({ error: result.error });
    }
    res.json(result);
  } catch (e) {
    console.error('[reportes/general/horarios-personal]', e);
    res.status(500).json({ error: e.message || 'Error al generar horarios del personal' });
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

/** GET /api/admin/reportes/general/asistencia-consolidado */
router.get('/asistencia-consolidado', async (req, res) => {
  try {
    const cid = colegioId(req);
    const anio = parseInt(req.query.anio, 10);
    const mes = parseInt(req.query.mes, 10);
    const sedeRaw = req.query.sede_id;
    const turnoRaw = req.query.turno_id;
    const sedeId = sedeRaw !== undefined && sedeRaw !== '' ? parseInt(sedeRaw, 10) : null;
    const turnoId = turnoRaw !== undefined && turnoRaw !== '' ? parseInt(turnoRaw, 10) : null;
    const result = await obtenerConsolidadoAsistencia(cid, {
      anio,
      mes,
      sedeId: Number.isFinite(sedeId) ? sedeId : null,
      turnoId: Number.isFinite(turnoId) ? turnoId : null,
    });
    if (!result.ok) {
      return res.status(result.status || 500).json({ error: result.error });
    }
    res.json(result);
  } catch (e) {
    console.error('[reportes/general/asistencia-consolidado]', e);
    res.status(500).json({ error: e.message || 'Error al generar el consolidado de asistencia' });
  }
});

/** GET /api/admin/reportes/general/asistencia-consolidado/detalle */
router.get('/asistencia-consolidado/detalle', async (req, res) => {
  try {
    const cid = colegioId(req);
    const result = await obtenerDetalleConsolidadoAsistencia(cid, {
      anio: req.query.anio,
      mes: req.query.mes,
      grupoId: req.query.grupo_id,
      tipo: req.query.tipo,
    });
    if (!result.ok) {
      return res.status(result.status || 500).json({ error: result.error });
    }
    res.json(result);
  } catch (e) {
    console.error('[reportes/general/asistencia-consolidado/detalle]', e);
    res.status(500).json({ error: e.message || 'Error al cargar el detalle' });
  }
});

/** GET /api/admin/reportes/general/asistencia-consolidado/excel */
router.get('/asistencia-consolidado/excel', async (req, res) => {
  try {
    const cid = colegioId(req);
    const anio = parseInt(req.query.anio, 10);
    const mes = parseInt(req.query.mes, 10);
    const sedeRaw = req.query.sede_id;
    const turnoRaw = req.query.turno_id;
    const sedeId = sedeRaw !== undefined && sedeRaw !== '' ? parseInt(sedeRaw, 10) : null;
    const turnoId = turnoRaw !== undefined && turnoRaw !== '' ? parseInt(turnoRaw, 10) : null;
    const result = await generarExcelConsolidadoAsistencia(cid, {
      anio,
      mes,
      sedeId: Number.isFinite(sedeId) ? sedeId : null,
      turnoId: Number.isFinite(turnoId) ? turnoId : null,
    });
    if (!result.ok) {
      return res.status(result.status || 500).json({ error: result.error });
    }
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(Buffer.from(result.buffer));
  } catch (e) {
    console.error('[reportes/general/asistencia-consolidado/excel]', e);
    res.status(500).json({ error: e.message || 'Error al exportar Excel' });
  }
});

/** GET /api/admin/reportes/general/monto-pagar-real — Excel con montos de matrícula y pensiones */
router.get('/monto-pagar-real', async (req, res) => {
  try {
    const cid = colegioId(req);
    const anio = parseInt(req.query.anio, 10);
    const sedeRaw = req.query.sede_id;
    const sedeId = sedeRaw !== undefined && sedeRaw !== '' ? parseInt(sedeRaw, 10) : null;

    if (!Number.isFinite(anio)) {
      return res.status(400).json({ error: 'Indique un año válido.' });
    }

    const result = await generarExcelMontoPagarReal(cid, {
      anio,
      sedeId: Number.isFinite(sedeId) ? sedeId : null,
    });
    if (!result.ok) {
      return res.status(result.status || 500).json({ error: result.error });
    }

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(Buffer.from(result.buffer));
  } catch (e) {
    console.error('[reportes/general/monto-pagar-real]', e);
    res.status(500).json({ error: e.message || 'Error al generar Excel' });
  }
});

/** GET /api/admin/reportes/general/reporte-alumnos — Excel con antigüedad */
router.get('/reporte-alumnos', async (req, res) => {
  try {
    const cid = colegioId(req);
    const anio = parseInt(req.query.anio, 10);
    const sedeRaw = req.query.sede_id;
    const sedeId = sedeRaw !== undefined && sedeRaw !== '' ? parseInt(sedeRaw, 10) : null;

    if (!Number.isFinite(anio)) {
      return res.status(400).json({ error: 'Indique un año válido.' });
    }

    const result = await generarExcelReporteAlumnos(cid, {
      anio,
      sedeId: Number.isFinite(sedeId) ? sedeId : null,
      antiguedad: req.query.antiguedad,
    });
    if (!result.ok) {
      return res.status(result.status || 500).json({ error: result.error });
    }

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(Buffer.from(result.buffer));
  } catch (e) {
    console.error('[reportes/general/reporte-alumnos]', e);
    res.status(500).json({ error: e.message || 'Error al generar Excel' });
  }
});

/** GET /api/admin/reportes/general/deuda-anual — Excel deuda por matrícula y pensiones */
router.get('/deuda-anual', async (req, res) => {
  try {
    const cid = colegioId(req);
    const anio = parseInt(req.query.anio, 10);
    const sedeRaw = req.query.sede_id;
    const sedeId = sedeRaw !== undefined && sedeRaw !== '' ? parseInt(sedeRaw, 10) : null;

    if (!Number.isFinite(anio)) {
      return res.status(400).json({ error: 'Indique un año válido.' });
    }

    const result = await generarExcelDeudaAnual(cid, {
      anio,
      sedeId: Number.isFinite(sedeId) ? sedeId : null,
    });
    if (!result.ok) {
      return res.status(result.status || 500).json({ error: result.error });
    }

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(Buffer.from(result.buffer));
  } catch (e) {
    console.error('[reportes/general/deuda-anual]', e);
    res.status(500).json({ error: e.message || 'Error al generar Excel' });
  }
});

/** GET /api/admin/reportes/general/ranking-notas */
router.get('/ranking-notas', async (req, res) => {
  try {
    const cid = colegioId(req);
    const anio = parseInt(req.query.anio, 10);
    const nivelId = parseInt(req.query.nivel_id, 10);
    const grado = parseInt(req.query.grado, 10);
    const seccion = String(req.query.seccion || '').trim();
    const turnoId = parseInt(req.query.turno_id, 10);
    const bimestre = parseInt(req.query.bimestre, 10);
    const sedeRaw = req.query.sede_id;
    const sedeId = sedeRaw !== undefined && sedeRaw !== '' ? parseInt(sedeRaw, 10) : null;

    const result = await obtenerRankingNotas(cid, {
      anio,
      nivelId,
      grado,
      seccion,
      turnoId,
      bimestre,
      sedeId: Number.isFinite(sedeId) ? sedeId : null,
    });
    if (!result.ok) {
      return res.status(result.status || 500).json({ error: result.error });
    }
    res.json(result);
  } catch (e) {
    console.error('[reportes/general/ranking-notas]', e);
    res.status(500).json({ error: e.message || 'Error al generar ranking de notas' });
  }
});

/** GET /api/admin/reportes/general/asistencia-personal */
router.get('/asistencia-personal', async (req, res) => {
  try {
    const cid = colegioId(req);
    const result = await construirDatosAsistenciaPersonal(cid, {
      desde: req.query.desde,
      hasta: req.query.hasta,
    });
    if (!result.ok) {
      return res.status(result.status || 500).json({ error: result.error });
    }
    res.json(result);
  } catch (e) {
    console.error('[reportes/general/asistencia-personal]', e);
    res.status(500).json({ error: e.message || 'Error al generar asistencia del personal' });
  }
});

/** GET /api/admin/reportes/general/asistencia-personal/excel */
router.get('/asistencia-personal/excel', async (req, res) => {
  try {
    const cid = colegioId(req);
    const result = await generarExcelAsistenciaPersonal(cid, {
      desde: req.query.desde,
      hasta: req.query.hasta,
    });
    if (!result.ok) {
      return res.status(result.status || 500).json({ error: result.error });
    }
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(Buffer.from(result.buffer));
  } catch (e) {
    console.error('[reportes/general/asistencia-personal/excel]', e);
    res.status(500).json({ error: e.message || 'Error al exportar Excel' });
  }
});

/** GET /api/admin/reportes/general/consolidado-promedios */
router.get('/consolidado-promedios', async (req, res) => {
  try {
    const cid = colegioId(req);
    const result = await construirConsolidadoPromedios(cid, {
      anio: req.query.anio,
      bimestre: req.query.bimestre,
      turno_id: req.query.turno_id,
      sede_id: req.query.sede_id,
    });
    if (!result.ok) {
      return res.status(result.status || 500).json({ error: result.error });
    }
    res.json(result);
  } catch (e) {
    console.error('[reportes/general/consolidado-promedios]', e);
    res.status(500).json({ error: e.message || 'Error al generar consolidado de promedios' });
  }
});

/** GET /api/admin/reportes/general/consolidado-promedios/excel */
router.get('/consolidado-promedios/excel', async (req, res) => {
  try {
    const cid = colegioId(req);
    const result = await generarExcelConsolidadoPromedios(cid, {
      anio: req.query.anio,
      bimestre: req.query.bimestre,
      turno_id: req.query.turno_id,
      sede_id: req.query.sede_id,
    });
    if (!result.ok) {
      return res.status(result.status || 500).json({ error: result.error });
    }
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(Buffer.from(result.buffer));
  } catch (e) {
    console.error('[reportes/general/consolidado-promedios/excel]', e);
    res.status(500).json({ error: e.message || 'Error al exportar Excel' });
  }
});

/** GET /api/admin/reportes/general/consolidado-promedios-detallado/excel */
router.get('/consolidado-promedios-detallado/excel', async (req, res) => {
  try {
    const cid = colegioId(req);
    const result = await generarExcelConsolidadoPromediosDetallado(cid, {
      anio: req.query.anio,
      bimestre: req.query.bimestre,
      turno_id: req.query.turno_id,
      sede_id: req.query.sede_id,
    });
    if (!result.ok) {
      return res.status(result.status || 500).json({ error: result.error });
    }
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(Buffer.from(result.buffer));
  } catch (e) {
    console.error('[reportes/general/consolidado-promedios-detallado/excel]', e);
    res.status(500).json({ error: e.message || 'Error al exportar Excel detallado' });
  }
});

function filtrosExamenesVirtuales(req) {
  const optInt = (v) => {
    if (v === undefined || v === null || v === '') return null;
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
  };
  return {
    anio: req.query.anio,
    bimestre: req.query.bimestre,
    sedeId: optInt(req.query.sede_id),
    nivelId: optInt(req.query.nivel_id),
    grado: optInt(req.query.grado),
    docenteId: optInt(req.query.docente_id),
    desde: req.query.desde,
    hasta: req.query.hasta,
  };
}

/** GET /api/admin/reportes/general/examenes-virtuales */
router.get('/examenes-virtuales', async (req, res) => {
  try {
    const cid = colegioId(req);
    const result = await obtenerExamenesVirtuales(cid, filtrosExamenesVirtuales(req));
    if (!result.ok) {
      return res.status(result.status || 500).json({ error: result.error });
    }
    res.json(result);
  } catch (e) {
    console.error('[reportes/general/examenes-virtuales]', e);
    res.status(500).json({ error: e.message || 'Error al generar el reporte de exámenes virtuales' });
  }
});

/** GET /api/admin/reportes/general/examenes-virtuales/excel */
router.get('/examenes-virtuales/excel', async (req, res) => {
  try {
    const cid = colegioId(req);
    const result = await generarExcelExamenesVirtuales(cid, filtrosExamenesVirtuales(req));
    if (!result.ok) {
      return res.status(result.status || 500).json({ error: result.error });
    }
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(Buffer.from(result.buffer));
  } catch (e) {
    console.error('[reportes/general/examenes-virtuales/excel]', e);
    res.status(500).json({ error: e.message || 'Error al exportar Excel de exámenes virtuales' });
  }
});

function filtrosIncidenciasEstrellas(req) {
  const optInt = (v) => {
    if (v === undefined || v === null || v === '') return null;
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
  };
  const docRaw = req.query.docente_id;
  const docenteId = String(docRaw || '').toLowerCase() === 'ingreso' ? 'ingreso' : optInt(docRaw);
  return {
    anio: req.query.anio,
    bimestre: req.query.bimestre,
    sedeId: optInt(req.query.sede_id),
    nivelId: optInt(req.query.nivel_id),
    grado: optInt(req.query.grado),
    docenteId,
    categoria: req.query.categoria,
    desde: req.query.desde,
    hasta: req.query.hasta,
  };
}

/** GET /api/admin/reportes/general/incidencias-estrellas */
router.get('/incidencias-estrellas', async (req, res) => {
  try {
    const result = await obtenerIncidenciasEstrellas(colegioId(req), filtrosIncidenciasEstrellas(req));
    if (!result.ok) {
      return res.status(result.status || 500).json({ error: result.error });
    }
    res.json(result);
  } catch (e) {
    console.error('[reportes/general/incidencias-estrellas]', e);
    res.status(500).json({ error: e.message || 'Error al generar el reporte de incidencias y estrellas' });
  }
});

/** GET /api/admin/reportes/general/incidencias-estrellas/excel */
router.get('/incidencias-estrellas/excel', async (req, res) => {
  try {
    const result = await generarExcelIncidenciasEstrellas(colegioId(req), filtrosIncidenciasEstrellas(req));
    if (!result.ok) {
      return res.status(result.status || 500).json({ error: result.error });
    }
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(Buffer.from(result.buffer));
  } catch (e) {
    console.error('[reportes/general/incidencias-estrellas/excel]', e);
    res.status(500).json({ error: e.message || 'Error al exportar Excel de incidencias y estrellas' });
  }
});

module.exports = router;
