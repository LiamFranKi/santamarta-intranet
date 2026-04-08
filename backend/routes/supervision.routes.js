/**
 * Módulo SUPERVISIÓN: rúbricas configurables, supervisores y evaluaciones por docente.
 * Montaje: /api/supervision
 * - Configuración (instrumentos, preguntas, rangos, cierre, supervisores, alta/baja participantes): solo ADMINISTRADOR.
 * - Ejecución y consultas: ADMINISTRADOR o usuario en supervision_supervisores (activo).
 * - Listado GET de participantes por instrumento: también supervisores (solo lectura en UI).
 */
const express = require('express');
const router = express.Router();
const { query, execute } = require('../utils/mysql');
const { authenticateToken } = require('../middleware/auth');

router.use(authenticateToken);

router.use(async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'No autenticado' });
    }
    const { colegio_id, usuario_id, tipo } = req.user;
    if (tipo === 'ADMINISTRADOR') {
      req.supervision = { isAdmin: true, isSupervisor: true };
      return next();
    }
    const rows = await query(
      `SELECT id FROM supervision_supervisores 
       WHERE colegio_id = ? AND usuario_id = ? AND activo = 1 LIMIT 1`,
      [colegio_id, usuario_id]
    );
    req.supervision = {
      isAdmin: false,
      isSupervisor: Array.isArray(rows) && rows.length > 0
    };
    return next();
  } catch (e) {
    const sinTabla =
      e.code === 'ER_NO_SUCH_TABLE' || String(e.message || '').includes('supervision_supervisores');
    // GET /yo: no romper sesión; devolver flags en false (DashboardLayout llama siempre).
    const esYo =
      req.method === 'GET' &&
      (req.path === '/yo' || String(req.originalUrl || '').split('?')[0].endsWith('/supervision/yo'));
    if (sinTabla && esYo) {
      req.supervision = { isAdmin: false, isSupervisor: false };
      return next();
    }
    if (sinTabla) {
      return res.status(503).json({
        error:
          'Módulo de supervisión no instalado en la base de datos. Ejecute la migración 016_supervision_mysql.sql.'
      });
    }
    return next(e);
  }
});

function requireAdmin(req, res, next) {
  if (req.user.tipo !== 'ADMINISTRADOR') {
    return res.status(403).json({ error: 'Solo el administrador puede configurar la supervisión' });
  }
  return next();
}

function requireAdminOrSupervisor(req, res, next) {
  if (req.supervision?.isAdmin || req.supervision?.isSupervisor) {
    return next();
  }
  return res.status(403).json({ error: 'No tienes permiso de supervisor' });
}

// --- Instrumentos ---

router.get('/instrumentos', requireAdmin, async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const rows = await query(
      `SELECT id, colegio_id, anio, titulo, descripcion, activo, cierre_usa_global, created_at, updated_at
       FROM supervision_instrumentos
       WHERE colegio_id = ?
       ORDER BY activo DESC, titulo ASC`,
      [colegio_id]
    );
    res.json({ instrumentos: rows || [] });
  } catch (e) {
    console.error('[supervision] list instrumentos', e);
    res.status(500).json({ error: 'Error al listar instrumentos' });
  }
});

router.get('/instrumentos/activos', requireAdminOrSupervisor, async (req, res) => {
  try {
    const { colegio_id, anio_activo } = req.user;
    const anio = parseInt(anio_activo || new Date().getFullYear(), 10);
    const rows = await query(
      `SELECT id, titulo, descripcion, anio, cierre_usa_global
       FROM supervision_instrumentos
       WHERE colegio_id = ? AND activo = 1
         AND (anio IS NULL OR anio = ?)
       ORDER BY titulo ASC`,
      [colegio_id, anio]
    );
    res.json({ instrumentos: rows || [] });
  } catch (e) {
    console.error('[supervision] instrumentos activos', e);
    res.status(500).json({ error: 'Error al listar instrumentos activos' });
  }
});

router.post('/instrumentos', requireAdmin, async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const { titulo, descripcion, anio, activo, cierre_usa_global } = req.body;
    if (!titulo || String(titulo).trim() === '') {
      return res.status(400).json({ error: 'El título es requerido' });
    }
    const anioVal = anio === '' || anio === undefined || anio === null ? null : parseInt(anio, 10);
    const act = activo === false || activo === 0 ? 0 : 1;
    const cug = cierre_usa_global === false || cierre_usa_global === 0 ? 0 : 1;
    const r = await execute(
      `INSERT INTO supervision_instrumentos (colegio_id, anio, titulo, descripcion, activo, cierre_usa_global)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [colegio_id, anioVal, String(titulo).trim(), descripcion || null, act, cug]
    );
    res.json({ success: true, id: r.insertId });
  } catch (e) {
    console.error('[supervision] create instrumento', e);
    res.status(500).json({ error: 'Error al crear instrumento' });
  }
});

router.put('/instrumentos/:id', requireAdmin, async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const id = parseInt(req.params.id, 10);
    const { titulo, descripcion, anio, activo, cierre_usa_global } = req.body;
    const cur = await query(
      `SELECT id FROM supervision_instrumentos WHERE id = ? AND colegio_id = ?`,
      [id, colegio_id]
    );
    if (!cur.length) return res.status(404).json({ error: 'Instrumento no encontrado' });
    const anioVal = anio === '' || anio === undefined || anio === null ? null : parseInt(anio, 10);
    const act = activo === false || activo === 0 ? 0 : 1;
    const cug = cierre_usa_global === false || cierre_usa_global === 0 ? 0 : 1;
    await execute(
      `UPDATE supervision_instrumentos
       SET titulo = COALESCE(?, titulo),
           descripcion = COALESCE(?, descripcion),
           anio = ?,
           activo = ?,
           cierre_usa_global = ?
       WHERE id = ? AND colegio_id = ?`,
      [
        titulo != null ? String(titulo).trim() : null,
        descripcion !== undefined ? descripcion : null,
        anioVal,
        act,
        cug,
        id,
        colegio_id
      ]
    );
    res.json({ success: true });
  } catch (e) {
    console.error('[supervision] update instrumento', e);
    res.status(500).json({ error: 'Error al actualizar instrumento' });
  }
});

router.delete('/instrumentos/:id', requireAdmin, async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const id = parseInt(req.params.id, 10);
    const r = await execute(`DELETE FROM supervision_instrumentos WHERE id = ? AND colegio_id = ?`, [
      id,
      colegio_id
    ]);
    if (!r.affectedRows) return res.status(404).json({ error: 'Instrumento no encontrado' });
    res.json({ success: true });
  } catch (e) {
    if (e.code === 'ER_ROW_IS_REFERENCED_2' || e.errno === 1451) {
      return res.status(400).json({
        error: 'No se puede eliminar: hay evaluaciones registradas con este instrumento'
      });
    }
    console.error('[supervision] delete instrumento', e);
    res.status(500).json({ error: 'Error al eliminar instrumento' });
  }
});

async function cargarDetalleInstrumento(colegioId, instrumentoId) {
  const inst = await query(
    `SELECT * FROM supervision_instrumentos WHERE id = ? AND colegio_id = ?`,
    [instrumentoId, colegioId]
  );
  if (!inst.length) return null;
  const preguntas = await query(
    `SELECT id, instrumento_id, orden, titulo, texto_ayuda
     FROM supervision_preguntas WHERE instrumento_id = ?
     ORDER BY orden ASC, id ASC`,
    [instrumentoId]
  );
  const preguntaIds = (preguntas || []).map((p) => p.id);
  let nivelesPorPregunta = {};
  if (preguntaIds.length) {
    const niveles = await query(
      `SELECT id, pregunta_id, orden, valor_numerico, etiqueta, descripcion
       FROM supervision_pregunta_niveles WHERE pregunta_id IN (${preguntaIds.map(() => '?').join(',')})
       ORDER BY pregunta_id, orden ASC, id ASC`,
      preguntaIds
    );
    for (const n of niveles || []) {
      if (!nivelesPorPregunta[n.pregunta_id]) nivelesPorPregunta[n.pregunta_id] = [];
      nivelesPorPregunta[n.pregunta_id].push(n);
    }
  }
  const rangos = await query(
    `SELECT id, instrumento_id, orden, puntaje_min, puntaje_max, etiqueta
     FROM supervision_rangos_resultado WHERE instrumento_id = ?
     ORDER BY orden ASC, id ASC`,
    [instrumentoId]
  );
  const instRow = inst[0];
  let camposCierre;
  if (instRow.cierre_usa_global) {
    camposCierre = await query(
      `SELECT id, orden, etiqueta, requerido, tipo
       FROM supervision_campos_cierre
       WHERE colegio_id = ? AND instrumento_id IS NULL
       ORDER BY orden ASC, id ASC`,
      [colegioId]
    );
  } else {
    camposCierre = await query(
      `SELECT id, orden, etiqueta, requerido, tipo
       FROM supervision_campos_cierre
       WHERE colegio_id = ? AND instrumento_id = ?
       ORDER BY orden ASC, id ASC`,
      [colegioId, instrumentoId]
    );
  }
  return {
    instrumento: instRow,
    preguntas: (preguntas || []).map((p) => ({
      ...p,
      niveles: nivelesPorPregunta[p.id] || []
    })),
    rangos_resultado: rangos || [],
    campos_cierre: camposCierre || []
  };
}

router.get('/instrumentos/:id/detalle', requireAdminOrSupervisor, async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const id = parseInt(req.params.id, 10);
    const detalle = await cargarDetalleInstrumento(colegio_id, id);
    if (!detalle) return res.status(404).json({ error: 'Instrumento no encontrado' });
    res.json(detalle);
  } catch (e) {
    console.error('[supervision] detalle instrumento', e);
    res.status(500).json({ error: 'Error al cargar instrumento' });
  }
});

// --- Preguntas ---

router.post('/instrumentos/:id/preguntas', requireAdmin, async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const instId = parseInt(req.params.id, 10);
    const ok = await query(
      `SELECT id FROM supervision_instrumentos WHERE id = ? AND colegio_id = ?`,
      [instId, colegio_id]
    );
    if (!ok.length) return res.status(404).json({ error: 'Instrumento no encontrado' });
    const { titulo, texto_ayuda, orden } = req.body;
    if (!titulo || String(titulo).trim() === '') {
      return res.status(400).json({ error: 'El título de la pregunta es requerido' });
    }
    const ord = orden != null ? parseInt(orden, 10) : 0;
    const r = await execute(
      `INSERT INTO supervision_preguntas (instrumento_id, orden, titulo, texto_ayuda)
       VALUES (?, ?, ?, ?)`,
      [instId, ord, String(titulo).trim(), texto_ayuda || null]
    );
    res.json({ success: true, id: r.insertId });
  } catch (e) {
    console.error('[supervision] add pregunta', e);
    res.status(500).json({ error: 'Error al crear pregunta' });
  }
});

router.put('/preguntas/:preguntaId', requireAdmin, async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const preguntaId = parseInt(req.params.preguntaId, 10);
    const row = await query(
      `SELECT p.id FROM supervision_preguntas p
       INNER JOIN supervision_instrumentos i ON i.id = p.instrumento_id
       WHERE p.id = ? AND i.colegio_id = ?`,
      [preguntaId, colegio_id]
    );
    if (!row.length) return res.status(404).json({ error: 'Pregunta no encontrada' });
    const { titulo, texto_ayuda, orden } = req.body;
    await execute(
      `UPDATE supervision_preguntas SET
         titulo = COALESCE(?, titulo),
         texto_ayuda = ?,
         orden = COALESCE(?, orden)
       WHERE id = ?`,
      [
        titulo != null ? String(titulo).trim() : null,
        texto_ayuda !== undefined ? texto_ayuda : null,
        orden != null ? parseInt(orden, 10) : null,
        preguntaId
      ]
    );
    res.json({ success: true });
  } catch (e) {
    console.error('[supervision] update pregunta', e);
    res.status(500).json({ error: 'Error al actualizar pregunta' });
  }
});

router.delete('/preguntas/:preguntaId', requireAdmin, async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const preguntaId = parseInt(req.params.preguntaId, 10);
    const row = await query(
      `SELECT p.id FROM supervision_preguntas p
       INNER JOIN supervision_instrumentos i ON i.id = p.instrumento_id
       WHERE p.id = ? AND i.colegio_id = ?`,
      [preguntaId, colegio_id]
    );
    if (!row.length) return res.status(404).json({ error: 'Pregunta no encontrada' });
    await execute(`DELETE FROM supervision_preguntas WHERE id = ?`, [preguntaId]);
    res.json({ success: true });
  } catch (e) {
    console.error('[supervision] delete pregunta', e);
    res.status(500).json({ error: 'Error al eliminar pregunta' });
  }
});

// --- Niveles por pregunta ---

router.post('/preguntas/:preguntaId/niveles', requireAdmin, async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const preguntaId = parseInt(req.params.preguntaId, 10);
    const row = await query(
      `SELECT p.id FROM supervision_preguntas p
       INNER JOIN supervision_instrumentos i ON i.id = p.instrumento_id
       WHERE p.id = ? AND i.colegio_id = ?`,
      [preguntaId, colegio_id]
    );
    if (!row.length) return res.status(404).json({ error: 'Pregunta no encontrada' });
    const { orden, valor_numerico, etiqueta, descripcion } = req.body;
    if (valor_numerico === undefined || valor_numerico === null || valor_numerico === '') {
      return res.status(400).json({ error: 'valor_numerico es requerido' });
    }
    const r = await execute(
      `INSERT INTO supervision_pregunta_niveles (pregunta_id, orden, valor_numerico, etiqueta, descripcion)
       VALUES (?, ?, ?, ?, ?)`,
      [
        preguntaId,
        orden != null ? parseInt(orden, 10) : 0,
        parseFloat(valor_numerico),
        etiqueta || null,
        descripcion || null
      ]
    );
    res.json({ success: true, id: r.insertId });
  } catch (e) {
    console.error('[supervision] add nivel', e);
    res.status(500).json({ error: 'Error al crear nivel' });
  }
});

router.put('/niveles/:nivelId', requireAdmin, async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const nivelId = parseInt(req.params.nivelId, 10);
    const row = await query(
      `SELECT n.id FROM supervision_pregunta_niveles n
       INNER JOIN supervision_preguntas p ON p.id = n.pregunta_id
       INNER JOIN supervision_instrumentos i ON i.id = p.instrumento_id
       WHERE n.id = ? AND i.colegio_id = ?`,
      [nivelId, colegio_id]
    );
    if (!row.length) return res.status(404).json({ error: 'Nivel no encontrado' });
    const { orden, valor_numerico, etiqueta, descripcion } = req.body;
    await execute(
      `UPDATE supervision_pregunta_niveles SET
         orden = COALESCE(?, orden),
         valor_numerico = COALESCE(?, valor_numerico),
         etiqueta = ?,
         descripcion = ?
       WHERE id = ?`,
      [
        orden != null ? parseInt(orden, 10) : null,
        valor_numerico != null ? parseFloat(valor_numerico) : null,
        etiqueta !== undefined ? etiqueta : null,
        descripcion !== undefined ? descripcion : null,
        nivelId
      ]
    );
    res.json({ success: true });
  } catch (e) {
    console.error('[supervision] update nivel', e);
    res.status(500).json({ error: 'Error al actualizar nivel' });
  }
});

router.delete('/niveles/:nivelId', requireAdmin, async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const nivelId = parseInt(req.params.nivelId, 10);
    const row = await query(
      `SELECT n.id FROM supervision_pregunta_niveles n
       INNER JOIN supervision_preguntas p ON p.id = n.pregunta_id
       INNER JOIN supervision_instrumentos i ON i.id = p.instrumento_id
       WHERE n.id = ? AND i.colegio_id = ?`,
      [nivelId, colegio_id]
    );
    if (!row.length) return res.status(404).json({ error: 'Nivel no encontrado' });
    await execute(`DELETE FROM supervision_pregunta_niveles WHERE id = ?`, [nivelId]);
    res.json({ success: true });
  } catch (e) {
    console.error('[supervision] delete nivel', e);
    res.status(500).json({ error: 'Error al eliminar nivel' });
  }
});

// --- Rangos resultado ---

router.post('/instrumentos/:id/rangos', requireAdmin, async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const instId = parseInt(req.params.id, 10);
    const ok = await query(
      `SELECT id FROM supervision_instrumentos WHERE id = ? AND colegio_id = ?`,
      [instId, colegio_id]
    );
    if (!ok.length) return res.status(404).json({ error: 'Instrumento no encontrado' });
    const { puntaje_min, puntaje_max, etiqueta, orden } = req.body;
    if (etiqueta == null || String(etiqueta).trim() === '') {
      return res.status(400).json({ error: 'etiqueta es requerida' });
    }
    if (puntaje_min === undefined || puntaje_max === undefined) {
      return res.status(400).json({ error: 'puntaje_min y puntaje_max son requeridos' });
    }
    const r = await execute(
      `INSERT INTO supervision_rangos_resultado (instrumento_id, orden, puntaje_min, puntaje_max, etiqueta)
       VALUES (?, ?, ?, ?, ?)`,
      [
        instId,
        orden != null ? parseInt(orden, 10) : 0,
        parseFloat(puntaje_min),
        parseFloat(puntaje_max),
        String(etiqueta).trim()
      ]
    );
    res.json({ success: true, id: r.insertId });
  } catch (e) {
    console.error('[supervision] add rango', e);
    res.status(500).json({ error: 'Error al crear rango' });
  }
});

router.put('/rangos/:rangoId', requireAdmin, async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const rangoId = parseInt(req.params.rangoId, 10);
    const row = await query(
      `SELECT r.id FROM supervision_rangos_resultado r
       INNER JOIN supervision_instrumentos i ON i.id = r.instrumento_id
       WHERE r.id = ? AND i.colegio_id = ?`,
      [rangoId, colegio_id]
    );
    if (!row.length) return res.status(404).json({ error: 'Rango no encontrado' });
    const { puntaje_min, puntaje_max, etiqueta, orden } = req.body;
    await execute(
      `UPDATE supervision_rangos_resultado SET
         orden = COALESCE(?, orden),
         puntaje_min = COALESCE(?, puntaje_min),
         puntaje_max = COALESCE(?, puntaje_max),
         etiqueta = COALESCE(?, etiqueta)
       WHERE id = ?`,
      [
        orden != null ? parseInt(orden, 10) : null,
        puntaje_min != null ? parseFloat(puntaje_min) : null,
        puntaje_max != null ? parseFloat(puntaje_max) : null,
        etiqueta != null ? String(etiqueta).trim() : null,
        rangoId
      ]
    );
    res.json({ success: true });
  } catch (e) {
    console.error('[supervision] update rango', e);
    res.status(500).json({ error: 'Error al actualizar rango' });
  }
});

router.delete('/rangos/:rangoId', requireAdmin, async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const rangoId = parseInt(req.params.rangoId, 10);
    const row = await query(
      `SELECT r.id FROM supervision_rangos_resultado r
       INNER JOIN supervision_instrumentos i ON i.id = r.instrumento_id
       WHERE r.id = ? AND i.colegio_id = ?`,
      [rangoId, colegio_id]
    );
    if (!row.length) return res.status(404).json({ error: 'Rango no encontrado' });
    await execute(`DELETE FROM supervision_rangos_resultado WHERE id = ?`, [rangoId]);
    res.json({ success: true });
  } catch (e) {
    console.error('[supervision] delete rango', e);
    res.status(500).json({ error: 'Error al eliminar rango' });
  }
});

// --- Campos de cierre (global: instrumento_id null; por instrumento: cierre_usa_global = 0) ---

router.get('/campos-cierre/global', requireAdmin, async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const rows = await query(
      `SELECT id, orden, etiqueta, requerido, tipo
       FROM supervision_campos_cierre
       WHERE colegio_id = ? AND instrumento_id IS NULL
       ORDER BY orden ASC, id ASC`,
      [colegio_id]
    );
    res.json({ campos: rows || [] });
  } catch (e) {
    console.error('[supervision] campos cierre global', e);
    res.status(500).json({ error: 'Error al listar campos de cierre' });
  }
});

router.post('/campos-cierre/global', requireAdmin, async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const { etiqueta, requerido, tipo, orden } = req.body;
    if (!etiqueta || String(etiqueta).trim() === '') {
      return res.status(400).json({ error: 'etiqueta es requerida' });
    }
    const t = tipo === 'texto' ? 'texto' : 'textarea';
    const reqd = requerido === true || requerido === 1 ? 1 : 0;
    const r = await execute(
      `INSERT INTO supervision_campos_cierre (colegio_id, instrumento_id, orden, etiqueta, requerido, tipo)
       VALUES (?, NULL, ?, ?, ?, ?)`,
      [colegio_id, orden != null ? parseInt(orden, 10) : 0, String(etiqueta).trim(), reqd, t]
    );
    res.json({ success: true, id: r.insertId });
  } catch (e) {
    console.error('[supervision] add campo cierre global', e);
    res.status(500).json({ error: 'Error al crear campo' });
  }
});

router.put('/campos-cierre/:id', requireAdmin, async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const id = parseInt(req.params.id, 10);
    const row = await query(
      `SELECT id FROM supervision_campos_cierre WHERE id = ? AND colegio_id = ?`,
      [id, colegio_id]
    );
    if (!row.length) return res.status(404).json({ error: 'Campo no encontrado' });
    const { etiqueta, requerido, tipo, orden } = req.body;
    const t = tipo === 'texto' || tipo === 'textarea' ? tipo : undefined;
    await execute(
      `UPDATE supervision_campos_cierre SET
         etiqueta = COALESCE(?, etiqueta),
         requerido = COALESCE(?, requerido),
         tipo = COALESCE(?, tipo),
         orden = COALESCE(?, orden)
       WHERE id = ? AND colegio_id = ?`,
      [
        etiqueta != null ? String(etiqueta).trim() : null,
        requerido === true || requerido === 1 ? 1 : requerido === false || requerido === 0 ? 0 : null,
        t || null,
        orden != null ? parseInt(orden, 10) : null,
        id,
        colegio_id
      ]
    );
    res.json({ success: true });
  } catch (e) {
    console.error('[supervision] update campo cierre', e);
    res.status(500).json({ error: 'Error al actualizar campo' });
  }
});

router.delete('/campos-cierre/:id', requireAdmin, async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const id = parseInt(req.params.id, 10);
    const r = await execute(
      `DELETE FROM supervision_campos_cierre WHERE id = ? AND colegio_id = ?`,
      [id, colegio_id]
    );
    if (!r.affectedRows) return res.status(404).json({ error: 'Campo no encontrado' });
    res.json({ success: true });
  } catch (e) {
    console.error('[supervision] delete campo cierre', e);
    res.status(500).json({ error: 'Error al eliminar campo' });
  }
});

router.get('/instrumentos/:id/campos-cierre', requireAdmin, async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const instId = parseInt(req.params.id, 10);
    const ok = await query(
      `SELECT id FROM supervision_instrumentos WHERE id = ? AND colegio_id = ?`,
      [instId, colegio_id]
    );
    if (!ok.length) return res.status(404).json({ error: 'Instrumento no encontrado' });
    const rows = await query(
      `SELECT id, orden, etiqueta, requerido, tipo
       FROM supervision_campos_cierre
       WHERE colegio_id = ? AND instrumento_id = ?
       ORDER BY orden ASC, id ASC`,
      [colegio_id, instId]
    );
    res.json({ campos: rows || [] });
  } catch (e) {
    console.error('[supervision] campos cierre inst', e);
    res.status(500).json({ error: 'Error al listar campos' });
  }
});

router.post('/instrumentos/:id/campos-cierre', requireAdmin, async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const instId = parseInt(req.params.id, 10);
    const inst = await query(
      `SELECT id, cierre_usa_global FROM supervision_instrumentos WHERE id = ? AND colegio_id = ?`,
      [instId, colegio_id]
    );
    if (!inst.length) return res.status(404).json({ error: 'Instrumento no encontrado' });
    if (inst[0].cierre_usa_global) {
      return res.status(400).json({
        error: 'Este instrumento usa cierre global. Desactive "cierre global" o edite los campos globales.'
      });
    }
    const { etiqueta, requerido, tipo, orden } = req.body;
    if (!etiqueta || String(etiqueta).trim() === '') {
      return res.status(400).json({ error: 'etiqueta es requerida' });
    }
    const t = tipo === 'texto' ? 'texto' : 'textarea';
    const reqd = requerido === true || requerido === 1 ? 1 : 0;
    const r = await execute(
      `INSERT INTO supervision_campos_cierre (colegio_id, instrumento_id, orden, etiqueta, requerido, tipo)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [colegio_id, instId, orden != null ? parseInt(orden, 10) : 0, String(etiqueta).trim(), reqd, t]
    );
    res.json({ success: true, id: r.insertId });
  } catch (e) {
    console.error('[supervision] add campo cierre inst', e);
    res.status(500).json({ error: 'Error al crear campo' });
  }
});

// --- Participantes por supervisión (instrumento) — migración 018 ---

router.get('/instrumentos/:instrumentoId/participantes', requireAdminOrSupervisor, async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const instrumentoId = parseInt(req.params.instrumentoId, 10);
    if (!instrumentoId) return res.status(400).json({ error: 'instrumento inválido' });
    const chk = await query(
      `SELECT id FROM supervision_instrumentos WHERE id = ? AND colegio_id = ? LIMIT 1`,
      [instrumentoId, colegio_id]
    );
    if (!Array.isArray(chk) || !chk.length) return res.status(404).json({ error: 'Supervisión no encontrada' });
    const rows = await query(
      `SELECT ip.id, ip.usuario_id, u.usuario as dni, p.nombres, p.apellidos
       FROM supervision_instrumento_participantes ip
       INNER JOIN usuarios u ON u.id = ip.usuario_id
       LEFT JOIN personal p ON p.id = u.personal_id
       WHERE ip.colegio_id = ? AND ip.instrumento_id = ?
       ORDER BY p.apellidos, p.nombres, u.usuario`,
      [colegio_id, instrumentoId]
    );
    res.json({ participantes: rows || [] });
  } catch (e) {
    if (e.code === 'ER_NO_SUCH_TABLE') {
      return res.status(503).json({
        error: 'Ejecute la migración database/migrations/018_supervision_instrumento_participantes_mysql.sql'
      });
    }
    console.error('[supervision] list participantes instrumento', e);
    res.status(500).json({ error: 'Error al listar participantes' });
  }
});

router.post('/instrumentos/:instrumentoId/participantes', requireAdmin, async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const instrumentoId = parseInt(req.params.instrumentoId, 10);
    const uid = parseInt(req.body?.usuario_id, 10);
    if (!instrumentoId || !uid) return res.status(400).json({ error: 'Datos inválidos' });
    const chk = await query(
      `SELECT id FROM supervision_instrumentos WHERE id = ? AND colegio_id = ? LIMIT 1`,
      [instrumentoId, colegio_id]
    );
    if (!Array.isArray(chk) || !chk.length) return res.status(404).json({ error: 'Supervisión no encontrada' });
    const u = await query(`SELECT id FROM usuarios WHERE id = ? AND colegio_id = ? AND estado = 'ACTIVO'`, [
      uid,
      colegio_id
    ]);
    if (!u.length) return res.status(404).json({ error: 'Usuario no encontrado en este colegio' });
    await execute(
      `INSERT INTO supervision_instrumento_participantes (colegio_id, instrumento_id, usuario_id) VALUES (?, ?, ?)`,
      [colegio_id, instrumentoId, uid]
    );
    res.json({ success: true });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY' || e.errno === 1062) {
      return res.status(409).json({ error: 'Esa persona ya está en la lista' });
    }
    if (e.code === 'ER_NO_SUCH_TABLE') {
      return res.status(503).json({
        error: 'Ejecute la migración database/migrations/018_supervision_instrumento_participantes_mysql.sql'
      });
    }
    console.error('[supervision] add participante instrumento', e);
    res.status(500).json({ error: 'Error al agregar participante' });
  }
});

router.delete('/instrumento-participantes/:id', requireAdmin, async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: 'id inválido' });
    const r = await execute(
      `DELETE FROM supervision_instrumento_participantes WHERE id = ? AND colegio_id = ?`,
      [id, colegio_id]
    );
    if (!r.affectedRows) return res.status(404).json({ error: 'Registro no encontrado' });
    res.json({ success: true });
  } catch (e) {
    if (e.code === 'ER_NO_SUCH_TABLE') {
      return res.status(503).json({
        error: 'Ejecute la migración database/migrations/018_supervision_instrumento_participantes_mysql.sql'
      });
    }
    console.error('[supervision] delete participante instrumento', e);
    res.status(500).json({ error: 'Error al quitar participante' });
  }
});

// --- Supervisores ---

router.get('/supervisores', requireAdmin, async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const rows = await query(
      `SELECT s.id, s.usuario_id, s.activo, s.created_at,
              u.usuario as dni, p.nombres, p.apellidos
       FROM supervision_supervisores s
       INNER JOIN usuarios u ON u.id = s.usuario_id
       LEFT JOIN personal p ON p.id = u.personal_id
       WHERE s.colegio_id = ?
       ORDER BY p.apellidos, p.nombres, u.usuario`,
      [colegio_id]
    );
    res.json({ supervisores: rows || [] });
  } catch (e) {
    console.error('[supervision] list supervisores', e);
    res.status(500).json({ error: 'Error al listar supervisores' });
  }
});

router.post('/supervisores', requireAdmin, async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const { usuario_id } = req.body;
    const uid = parseInt(usuario_id, 10);
    if (!uid) return res.status(400).json({ error: 'usuario_id es requerido' });
    const u = await query(
      `SELECT id FROM usuarios WHERE id = ? AND colegio_id = ? AND estado = 'ACTIVO'`,
      [uid, colegio_id]
    );
    if (!u.length) return res.status(404).json({ error: 'Usuario no encontrado en este colegio' });
    await execute(
      `INSERT INTO supervision_supervisores (colegio_id, usuario_id, activo) VALUES (?, ?, 1)
       ON DUPLICATE KEY UPDATE activo = 1`,
      [colegio_id, uid]
    );
    res.json({ success: true });
  } catch (e) {
    console.error('[supervision] add supervisor', e);
    res.status(500).json({ error: 'Error al asignar supervisor' });
  }
});

router.delete('/supervisores/:id', requireAdmin, async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const id = parseInt(req.params.id, 10);
    const r = await execute(`DELETE FROM supervision_supervisores WHERE id = ? AND colegio_id = ?`, [
      id,
      colegio_id
    ]);
    if (!r.affectedRows) return res.status(404).json({ error: 'Registro no encontrado' });
    res.json({ success: true });
  } catch (e) {
    console.error('[supervision] delete supervisor', e);
    res.status(500).json({ error: 'Error al quitar supervisor' });
  }
});

router.get('/personal-candidatos', requireAdmin, async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const q = (req.query.q || '').trim();
    let sql = `SELECT u.id as usuario_id, u.usuario as dni, p.nombres, p.apellidos, u.tipo
               FROM usuarios u
               INNER JOIN personal p ON p.id = u.personal_id
               WHERE u.colegio_id = ? AND u.estado = 'ACTIVO' AND u.personal_id IS NOT NULL`;
    const params = [colegio_id];
    if (q) {
      sql += ` AND (u.usuario LIKE ? OR p.nombres LIKE ? OR p.apellidos LIKE ?)`;
      const like = `%${q}%`;
      params.push(like, like, like);
    }
    sql += ` ORDER BY p.apellidos, p.nombres LIMIT 80`;
    const rows = await query(sql, params);
    res.json({ personal: rows || [] });
  } catch (e) {
    console.error('[supervision] personal candidatos', e);
    res.status(500).json({ error: 'Error al buscar personal' });
  }
});

// --- Contexto ejecución (nivel → grupos → docentes) ---

router.get('/contexto/niveles', requireAdminOrSupervisor, async (req, res) => {
  try {
    const { colegio_id, anio_activo } = req.user;
    const anio = parseInt(anio_activo || new Date().getFullYear(), 10);
    const rows = await query(
      `SELECT DISTINCT n.id, n.nombre
       FROM grupos g
       INNER JOIN niveles n ON n.id = g.nivel_id
       WHERE g.colegio_id = ? AND g.anio = ?
       ORDER BY n.id ASC`,
      [colegio_id, anio]
    );
    res.json({ niveles: rows || [] });
  } catch (e) {
    console.error('[supervision] contexto niveles', e);
    res.status(500).json({ error: 'Error al cargar niveles' });
  }
});

router.get('/contexto/grupos', requireAdminOrSupervisor, async (req, res) => {
  try {
    const { colegio_id, anio_activo } = req.user;
    const nivelId = parseInt(req.query.nivel_id, 10);
    if (!nivelId) return res.status(400).json({ error: 'nivel_id es requerido' });
    const anio = parseInt(anio_activo || new Date().getFullYear(), 10);
    const rows = await query(
      `SELECT g.id, g.grado, g.seccion, n.nombre as nivel_nombre
       FROM grupos g
       INNER JOIN niveles n ON n.id = g.nivel_id
       WHERE g.colegio_id = ? AND g.anio = ? AND g.nivel_id = ?
       ORDER BY g.grado, g.seccion`,
      [colegio_id, anio, nivelId]
    );
    res.json({ grupos: rows || [] });
  } catch (e) {
    console.error('[supervision] contexto grupos', e);
    res.status(500).json({ error: 'Error al cargar grupos' });
  }
});

router.get('/contexto/docentes', requireAdminOrSupervisor, async (req, res) => {
  try {
    const { colegio_id, anio_activo } = req.user;
    const grupoId = parseInt(req.query.grupo_id, 10);
    if (!grupoId) return res.status(400).json({ error: 'grupo_id es requerido' });
    const anio = parseInt(anio_activo || new Date().getFullYear(), 10);
    const g = await query(
      `SELECT id FROM grupos WHERE id = ? AND colegio_id = ? AND anio = ?`,
      [grupoId, colegio_id, anio]
    );
    if (!g.length) return res.status(404).json({ error: 'Grupo no encontrado' });
    const rows = await query(
      `SELECT DISTINCT p.id as personal_id, p.nombres, p.apellidos, u.id as usuario_id, u.usuario as dni
       FROM asignaturas a
       INNER JOIN personal p ON p.id = a.personal_id
       INNER JOIN usuarios u ON u.personal_id = p.id AND u.colegio_id = a.colegio_id AND u.estado = 'ACTIVO'
       WHERE a.grupo_id = ? AND a.colegio_id = ?`,
      [grupoId, colegio_id]
    );
    res.json({ docentes: rows || [] });
  } catch (e) {
    console.error('[supervision] contexto docentes', e);
    res.status(500).json({ error: 'Error al cargar docentes' });
  }
});

function etiquetaPorRango(total, rangos) {
  const t = parseFloat(total);
  for (const r of rangos || []) {
    const min = parseFloat(r.puntaje_min);
    const max = parseFloat(r.puntaje_max);
    if (t >= min && t <= max) return r.etiqueta;
  }
  return null;
}

router.post('/evaluaciones', requireAdminOrSupervisor, async (req, res) => {
  try {
    const { colegio_id, usuario_id, anio_activo } = req.user;
    const anio = parseInt(anio_activo || new Date().getFullYear(), 10);
    const {
      instrumento_id,
      grupo_id,
      personal_id_evaluado,
      fecha_evaluacion,
      respuestas,
      observaciones
    } = req.body;

    const instId = parseInt(instrumento_id, 10);
    const gId = parseInt(grupo_id, 10);
    const persId = parseInt(personal_id_evaluado, 10);
    if (!instId || !gId || !persId) {
      return res.status(400).json({ error: 'instrumento_id, grupo_id y personal_id_evaluado son requeridos' });
    }
    const fecha = fecha_evaluacion || new Date().toISOString().slice(0, 10);

    const detalle = await cargarDetalleInstrumento(colegio_id, instId);
    if (!detalle || !detalle.instrumento.activo) {
      return res.status(404).json({ error: 'Instrumento no encontrado o inactivo' });
    }

    const preguntas = detalle.preguntas || [];
    if (!preguntas.length) {
      return res.status(400).json({ error: 'El instrumento no tiene preguntas configuradas' });
    }
    const mapPreguntaIds = new Set(preguntas.map((p) => p.id));
    const respMap = {};
    for (const r of respuestas || []) {
      const pid = parseInt(r.pregunta_id, 10);
      const nid = parseInt(r.nivel_id, 10);
      if (!pid || !nid) continue;
      respMap[pid] = nid;
    }
    for (const p of preguntas) {
      if (!respMap[p.id]) {
        return res.status(400).json({ error: `Falta respuesta para la pregunta: ${p.titulo}` });
      }
    }

    const nivelRows = await query(
      `SELECT n.id, n.pregunta_id, n.valor_numerico
       FROM supervision_pregunta_niveles n
       INNER JOIN supervision_preguntas p ON p.id = n.pregunta_id
       WHERE p.instrumento_id = ?`,
      [instId]
    );
    const nivelInfo = {};
    for (const n of nivelRows || []) {
      nivelInfo[n.id] = { pregunta_id: n.pregunta_id, puntaje: parseFloat(n.valor_numerico) };
    }

    let total = 0;
    const detalleInsert = [];
    for (const p of preguntas) {
      const nid = respMap[p.id];
      const info = nivelInfo[nid];
      if (!info || info.pregunta_id !== p.id) {
        return res.status(400).json({ error: 'Nivel inválido para una de las preguntas' });
      }
      total += info.puntaje;
      detalleInsert.push({ pregunta_id: p.id, nivel_id: nid, puntaje: info.puntaje });
    }

    const rangos = detalle.rangos_resultado || [];
    const etiquetaResultado = etiquetaPorRango(total, rangos);
    if (!rangos.length) {
      return res.status(400).json({ error: 'Configure al menos un rango de resultado para este instrumento' });
    }
    if (etiquetaResultado == null) {
      return res.status(400).json({
        error: `El puntaje total ${total} no coincide con ningún rango configurado`
      });
    }

    const campos = detalle.campos_cierre || [];
    const obsList = Array.isArray(observaciones) ? observaciones : [];
    const obsById = {};
    for (const o of obsList) {
      if (o && o.campo_cierre_id != null) obsById[Number(o.campo_cierre_id)] = o;
      if (o && o.etiqueta_snapshot) obsById[`_${String(o.etiqueta_snapshot).trim()}`] = o;
    }

    for (const c of campos) {
      const o = obsById[c.id] || obsById[`_${c.etiqueta}`];
      const val = o && o.valor != null ? String(o.valor).trim() : '';
      if (c.requerido && !val) {
        return res.status(400).json({ error: `El campo "${c.etiqueta}" es obligatorio` });
      }
    }

    const gCheck = await query(
      `SELECT id FROM grupos WHERE id = ? AND colegio_id = ? AND anio = ?`,
      [gId, colegio_id, anio]
    );
    if (!gCheck.length) return res.status(400).json({ error: 'Grupo inválido' });

    const evalRes = await execute(
      `INSERT INTO supervision_evaluaciones
       (instrumento_id, colegio_id, anio, grupo_id, personal_id_evaluado, usuario_id_evaluador, fecha_evaluacion, puntaje_total, resultado_etiqueta)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [instId, colegio_id, anio, gId, persId, usuario_id, fecha, total, etiquetaResultado]
    );
    const evalId = evalRes.insertId;

    for (const d of detalleInsert) {
      await execute(
        `INSERT INTO supervision_evaluacion_detalle (evaluacion_id, pregunta_id, nivel_id, puntaje)
         VALUES (?, ?, ?, ?)`,
        [evalId, d.pregunta_id, d.nivel_id, d.puntaje]
      );
    }

    for (const c of campos) {
      const o = obsById[c.id] || obsById[`_${c.etiqueta}`];
      const val = o && o.valor != null ? String(o.valor) : '';
      if (!val.trim()) continue;
      await execute(
        `INSERT INTO supervision_evaluacion_observaciones (evaluacion_id, campo_cierre_id, etiqueta_snapshot, valor)
         VALUES (?, ?, ?, ?)`,
        [evalId, c.id, c.etiqueta, val]
      );
    }

    res.json({
      success: true,
      evaluacion_id: evalId,
      puntaje_total: total,
      resultado_etiqueta: etiquetaResultado
    });
  } catch (e) {
    console.error('[supervision] post evaluacion', e);
    res.status(500).json({ error: 'Error al guardar la evaluación' });
  }
});

router.get('/evaluaciones', requireAdminOrSupervisor, async (req, res) => {
  try {
    const { colegio_id, anio_activo } = req.user;
    const anio = parseInt(req.query.anio || anio_activo || new Date().getFullYear(), 10);
    const instrumentoId = req.query.instrumento_id ? parseInt(req.query.instrumento_id, 10) : null;
    const grupoId = req.query.grupo_id ? parseInt(req.query.grupo_id, 10) : null;
    const personalId = req.query.personal_id ? parseInt(req.query.personal_id, 10) : null;
    const desde = req.query.desde || null;
    const hasta = req.query.hasta || null;

    let sql = `
      SELECT e.*, i.titulo as instrumento_titulo,
             p.nombres as evaluado_nombres, p.apellidos as evaluado_apellidos,
             g.grado, g.seccion,
             n.nombre as nivel_nombre,
             ue.usuario as evaluador_dni,
             pe.nombres as evaluador_nombres, pe.apellidos as evaluador_apellidos
      FROM supervision_evaluaciones e
      INNER JOIN supervision_instrumentos i ON i.id = e.instrumento_id
      INNER JOIN personal p ON p.id = e.personal_id_evaluado
      INNER JOIN grupos g ON g.id = e.grupo_id
      INNER JOIN niveles n ON n.id = g.nivel_id
      INNER JOIN usuarios ue ON ue.id = e.usuario_id_evaluador
      LEFT JOIN personal pe ON pe.id = ue.personal_id
      WHERE e.colegio_id = ? AND e.anio = ?
    `;
    const params = [colegio_id, anio];
    if (instrumentoId) {
      sql += ` AND e.instrumento_id = ?`;
      params.push(instrumentoId);
    }
    if (grupoId) {
      sql += ` AND e.grupo_id = ?`;
      params.push(grupoId);
    }
    if (personalId) {
      sql += ` AND e.personal_id_evaluado = ?`;
      params.push(personalId);
    }
    if (desde) {
      sql += ` AND e.fecha_evaluacion >= ?`;
      params.push(desde);
    }
    if (hasta) {
      sql += ` AND e.fecha_evaluacion <= ?`;
      params.push(hasta);
    }
    sql += ` ORDER BY e.fecha_evaluacion DESC, e.id DESC LIMIT 500`;

    const rows = await query(sql, params);
    res.json({ evaluaciones: rows || [] });
  } catch (e) {
    console.error('[supervision] list evaluaciones', e);
    res.status(500).json({ error: 'Error al listar evaluaciones' });
  }
});

/**
 * GET /api/supervision/yo
 * Solo indica si el usuario es admin de supervisión o supervisor asignado.
 * No debe usar requireAdminOrSupervisor: un 403 aquí cerraba la sesión de todos los docentes
 * porque DashboardLayout llama a esta ruta al cargar (interceptor 403 en api.js).
 */
router.get('/yo', (req, res) => {
  res.json({
    is_admin: !!req.supervision?.isAdmin,
    is_supervisor: !!req.supervision?.isSupervisor
  });
});

module.exports = router;
