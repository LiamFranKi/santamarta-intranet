/**
 * Libreta Inicial personalizada: áreas/indicadores por grupo y registro por alumno.
 * Montado en /api/docente (después de docente.routes).
 */
const express = require('express');
const router = express.Router();
const { query, execute } = require('../utils/mysql');
const { authenticateToken } = require('../middleware/auth');
const phpSerialize = require('php-serialize');

function esAdminOPromotoria(tipo) {
  return tipo === 'ADMINISTRADOR' || tipo === 'PROMOTORIA';
}

async function assertAccesoGrupoLibretaInicial(req, grupoId) {
  const { colegio_id, anio_activo, tipo } = req.user;
  if (!grupoId || !colegio_id || !anio_activo) {
    return { ok: false, status: 400, error: 'Parámetros requeridos' };
  }
  const esStaffColegio =
    esAdminOPromotoria(tipo) || tipo === 'PSICOLOGA' || tipo === 'SECRETARIA' || tipo === 'COORDINADOR' || tipo === 'DIRECTOR' || tipo === 'CONTADOR';

  if (esStaffColegio) {
    const gRow = await query(
      `SELECT g.id, g.anio FROM grupos g WHERE g.id = ? AND g.colegio_id = ? AND g.anio = ? LIMIT 1`,
      [grupoId, colegio_id, anio_activo]
    );
    if (!gRow.length) return { ok: false, status: 403, error: 'No tienes acceso a este grupo' };
    return { ok: true, anioEsc: Number(gRow[0].anio) };
  }

  if (req._tutoriaAccesoGeneral || req._tutoriaGrupoAccesoOk) {
    const gRow = await query(
      `SELECT g.id, g.anio FROM grupos g WHERE g.id = ? AND g.colegio_id = ? AND g.anio = ? LIMIT 1`,
      [grupoId, colegio_id, anio_activo]
    );
    if (!gRow.length) return { ok: false, status: 403, error: 'No tienes acceso a este grupo' };
    return { ok: true, anioEsc: Number(gRow[0].anio) };
  }

  const personalId = req.user.personal_id;
  if (!personalId) return { ok: false, status: 404, error: 'Docente no encontrado' };

  const tieneAccesoAsignatura = await query(
    `SELECT 1 FROM asignaturas a
     INNER JOIN grupos g ON g.id = a.grupo_id
     WHERE a.personal_id = ? AND a.grupo_id = ? AND a.colegio_id = ? AND g.anio = ? LIMIT 1`,
    [personalId, grupoId, colegio_id, anio_activo]
  );
  const esTutorDelGrupo = await query(
    `SELECT 1 FROM grupos g
     WHERE g.id = ? AND (g.tutor_id = ? OR (COALESCE(g.tutor_id_2, 0) > 0 AND g.tutor_id_2 = ?))
       AND g.colegio_id = ? AND g.anio = ? LIMIT 1`,
    [grupoId, personalId, personalId, colegio_id, anio_activo]
  );

  if (!tieneAccesoAsignatura?.length && !esTutorDelGrupo?.length) {
    return { ok: false, status: 403, error: 'No tienes acceso a este grupo' };
  }

  const gRow = await query(
    `SELECT g.id, g.anio FROM grupos g WHERE g.id = ? AND g.colegio_id = ? AND g.anio = ? LIMIT 1`,
    [grupoId, colegio_id, anio_activo]
  );
  if (!gRow.length) return { ok: false, status: 403, error: 'No tienes acceso a este grupo' };
  return { ok: true, anioEsc: Number(gRow[0].anio) };
}

function parseRecomendacionCiclo(recomendacionesBlob, ciclo) {
  if (!recomendacionesBlob) return '';
  try {
    const decoded = Buffer.from(recomendacionesBlob, 'base64').toString('binary');
    const deserialized = phpSerialize.unserialize(decoded);
    if (deserialized && typeof deserialized === 'object' && deserialized[ciclo] && deserialized[ciclo].descripcion) {
      return String(deserialized[ciclo].descripcion).trim();
    }
  } catch (e) {
    /* ignore */
  }
  return '';
}

async function guardarRecomendacionUnAlumno(matriculaId, grupoId, colegio_id, cicloInt, descripcion, personalId) {
  const rows = await query(
    `SELECT id, recomendaciones FROM matriculas WHERE id = ? AND grupo_id = ? AND colegio_id = ? LIMIT 1`,
    [matriculaId, grupoId, colegio_id]
  );
  if (!rows.length) return false;
  let rec = {};
  if (rows[0].recomendaciones) {
    try {
      const decoded = Buffer.from(rows[0].recomendaciones, 'base64').toString('binary');
      rec = phpSerialize.unserialize(decoded) || {};
    } catch (e) {
      rec = {};
    }
  }
  rec[cicloInt] = { descripcion: String(descripcion || '').trim(), personal: personalId };
  const serialized = phpSerialize.serialize(rec);
  const encoded = Buffer.from(serialized, 'binary').toString('base64');
  await execute(`UPDATE matriculas SET recomendaciones = ? WHERE id = ?`, [encoded, matriculaId]);
  return true;
}

router.use(authenticateToken);

/** Filtro SQL: indicadores de todo el año (0) o del bimestre elegido (1–4). */
function sqlFiltroAlcanceCiclo(cicloInt) {
  const c = parseInt(cicloInt, 10);
  if (!Number.isFinite(c) || c < 1 || c > 4) return { sql: '', params: [] };
  return { sql: ' AND (i.alcance_ciclo = 0 OR i.alcance_ciclo = ?) ', params: [c] };
}

router.get('/grupos/:grupoId/libreta-inicial/estructura', async (req, res) => {
  try {
    const { grupoId } = req.params;
    const { colegio_id } = req.user;
    const acc = await assertAccesoGrupoLibretaInicial(req, grupoId);
    if (!acc.ok) return res.status(acc.status).json({ error: acc.error });
    const cicloVista = parseInt(req.query.ciclo, 10);
    const filtro = sqlFiltroAlcanceCiclo(cicloVista);

    const areas =
      (await query(
        `SELECT id, nombre, orden FROM libreta_inicial_areas
         WHERE grupo_id = ? AND colegio_id = ? AND anio = ?
         ORDER BY orden ASC, id ASC`,
        [grupoId, colegio_id, acc.anioEsc]
      )) || [];
    if (!areas.length) return res.json({ areas: [] });

    const ids = areas.map((a) => a.id);
    const ph = ids.map(() => '?').join(',');
    const indParams = [...ids, colegio_id, ...filtro.params];
    const indicadores =
      (await query(
        `SELECT i.id, i.area_id, i.descripcion, i.orden, i.alcance_ciclo FROM libreta_inicial_indicadores i
         WHERE i.area_id IN (${ph}) AND i.colegio_id = ?
         ${filtro.sql}
         ORDER BY i.orden ASC, i.id ASC`,
        indParams
      )) || [];

    const conInd = areas.map((a) => ({
      ...a,
      indicadores: indicadores.filter((i) => Number(i.area_id) === Number(a.id))
    }));
    res.json({ areas: conInd, anio: acc.anioEsc });
  } catch (e) {
    console.error('libreta-inicial estructura:', e);
    res.status(500).json({ error: 'Error al cargar estructura (¿ejecutó el SQL de tablas?)' });
  }
});

router.post('/grupos/:grupoId/libreta-inicial/areas', async (req, res) => {
  try {
    const { grupoId } = req.params;
    const { colegio_id } = req.user;
    const acc = await assertAccesoGrupoLibretaInicial(req, grupoId);
    if (!acc.ok) return res.status(acc.status).json({ error: acc.error });
    const nombre = String(req.body.nombre || '').trim();
    if (!nombre) return res.status(400).json({ error: 'Nombre del área requerido' });

    const mx = await query(
      `SELECT COALESCE(MAX(orden), 0) as m FROM libreta_inicial_areas WHERE grupo_id = ? AND colegio_id = ? AND anio = ?`,
      [grupoId, colegio_id, acc.anioEsc]
    );
    const orden = Number(mx[0]?.m || 0) + 1;
    const r = await execute(
      `INSERT INTO libreta_inicial_areas (grupo_id, colegio_id, anio, nombre, orden) VALUES (?, ?, ?, ?, ?)`,
      [grupoId, colegio_id, acc.anioEsc, nombre, orden]
    );
    res.json({ id: r.insertId, nombre, orden });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al crear área' });
  }
});

router.put('/grupos/:grupoId/libreta-inicial/areas/:areaId', async (req, res) => {
  try {
    const { grupoId, areaId } = req.params;
    const { colegio_id } = req.user;
    const acc = await assertAccesoGrupoLibretaInicial(req, grupoId);
    if (!acc.ok) return res.status(acc.status).json({ error: acc.error });
    const nombre = req.body.nombre != null ? String(req.body.nombre).trim() : null;
    const orden = req.body.orden != null ? parseInt(req.body.orden, 10) : null;
    const rows = await query(
      `SELECT id FROM libreta_inicial_areas WHERE id = ? AND grupo_id = ? AND colegio_id = ? AND anio = ?`,
      [areaId, grupoId, colegio_id, acc.anioEsc]
    );
    if (!rows.length) return res.status(404).json({ error: 'Área no encontrada' });
    if (nombre != null && nombre !== '') {
      await execute(`UPDATE libreta_inicial_areas SET nombre = ? WHERE id = ?`, [nombre, areaId]);
    }
    if (orden != null && !Number.isNaN(orden)) {
      await execute(`UPDATE libreta_inicial_areas SET orden = ? WHERE id = ?`, [orden, areaId]);
    }
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al actualizar área' });
  }
});

router.delete('/grupos/:grupoId/libreta-inicial/areas/:areaId', async (req, res) => {
  try {
    const { grupoId, areaId } = req.params;
    const { colegio_id } = req.user;
    const acc = await assertAccesoGrupoLibretaInicial(req, grupoId);
    if (!acc.ok) return res.status(acc.status).json({ error: acc.error });
    await execute(
      `DELETE FROM libreta_inicial_areas WHERE id = ? AND grupo_id = ? AND colegio_id = ? AND anio = ?`,
      [areaId, grupoId, colegio_id, acc.anioEsc]
    );
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al eliminar área' });
  }
});

router.post('/grupos/:grupoId/libreta-inicial/indicadores', async (req, res) => {
  try {
    const { grupoId } = req.params;
    const { colegio_id } = req.user;
    const acc = await assertAccesoGrupoLibretaInicial(req, grupoId);
    if (!acc.ok) return res.status(acc.status).json({ error: acc.error });
    const areaId = parseInt(req.body.area_id, 10);
    const descripcion = String(req.body.descripcion || '').trim();
    if (!areaId || !descripcion) return res.status(400).json({ error: 'Área e indicador requeridos' });

    const ar = await query(
      `SELECT id FROM libreta_inicial_areas WHERE id = ? AND grupo_id = ? AND colegio_id = ? AND anio = ?`,
      [areaId, grupoId, colegio_id, acc.anioEsc]
    );
    if (!ar.length) return res.status(404).json({ error: 'Área no encontrada' });

    let alcance = parseInt(req.body.alcance_ciclo, 10);
    if (!Number.isFinite(alcance) || alcance < 0 || alcance > 4) alcance = 0;

    const mx = await query(
      `SELECT COALESCE(MAX(orden), 0) as m FROM libreta_inicial_indicadores WHERE area_id = ? AND colegio_id = ?`,
      [areaId, colegio_id]
    );
    const orden = Number(mx[0]?.m || 0) + 1;
    const r = await execute(
      `INSERT INTO libreta_inicial_indicadores (area_id, colegio_id, descripcion, orden, alcance_ciclo) VALUES (?, ?, ?, ?, ?)`,
      [areaId, colegio_id, descripcion, orden, alcance]
    );
    res.json({ id: r.insertId, area_id: areaId, descripcion, orden, alcance_ciclo: alcance });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al crear indicador' });
  }
});

router.put('/grupos/:grupoId/libreta-inicial/indicadores/:indicadorId', async (req, res) => {
  try {
    const { grupoId, indicadorId } = req.params;
    const { colegio_id } = req.user;
    const acc = await assertAccesoGrupoLibretaInicial(req, grupoId);
    if (!acc.ok) return res.status(acc.status).json({ error: acc.error });
    const descripcion = req.body.descripcion != null ? String(req.body.descripcion).trim() : null;
    const orden = req.body.orden != null ? parseInt(req.body.orden, 10) : null;
    let alcance = null;
    if (req.body.alcance_ciclo !== undefined && req.body.alcance_ciclo !== null) {
      alcance = parseInt(req.body.alcance_ciclo, 10);
      if (!Number.isFinite(alcance) || alcance < 0 || alcance > 4) {
        return res.status(400).json({ error: 'alcance_ciclo debe ser 0 (todo el año) o 1–4 (bimestre)' });
      }
    }

    const row = await query(
      `SELECT i.id FROM libreta_inicial_indicadores i
       INNER JOIN libreta_inicial_areas a ON a.id = i.area_id
       WHERE i.id = ? AND i.colegio_id = ? AND a.grupo_id = ? AND a.anio = ?`,
      [indicadorId, colegio_id, grupoId, acc.anioEsc]
    );
    if (!row.length) return res.status(404).json({ error: 'Indicador no encontrado' });
    if (descripcion != null && descripcion !== '') {
      await execute(`UPDATE libreta_inicial_indicadores SET descripcion = ? WHERE id = ?`, [descripcion, indicadorId]);
    }
    if (orden != null && !Number.isNaN(orden)) {
      await execute(`UPDATE libreta_inicial_indicadores SET orden = ? WHERE id = ?`, [orden, indicadorId]);
    }
    if (alcance !== null) {
      await execute(`UPDATE libreta_inicial_indicadores SET alcance_ciclo = ? WHERE id = ?`, [alcance, indicadorId]);
    }
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al actualizar indicador' });
  }
});

router.delete('/grupos/:grupoId/libreta-inicial/indicadores/:indicadorId', async (req, res) => {
  try {
    const { grupoId, indicadorId } = req.params;
    const { colegio_id } = req.user;
    const acc = await assertAccesoGrupoLibretaInicial(req, grupoId);
    if (!acc.ok) return res.status(acc.status).json({ error: acc.error });
    const row = await query(
      `SELECT i.id FROM libreta_inicial_indicadores i
       INNER JOIN libreta_inicial_areas a ON a.id = i.area_id
       WHERE i.id = ? AND i.colegio_id = ? AND a.grupo_id = ? AND a.anio = ?`,
      [indicadorId, colegio_id, grupoId, acc.anioEsc]
    );
    if (!row.length) return res.status(404).json({ error: 'Indicador no encontrado' });
    await execute(`DELETE FROM libreta_inicial_indicadores WHERE id = ?`, [indicadorId]);
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al eliminar indicador' });
  }
});

router.get('/grupos/:grupoId/libreta-inicial/registro', async (req, res) => {
  try {
    const { grupoId } = req.params;
    const ciclo = parseInt(req.query.ciclo, 10) || 1;
    const filtro = sqlFiltroAlcanceCiclo(ciclo);
    const { colegio_id } = req.user;
    const acc = await assertAccesoGrupoLibretaInicial(req, grupoId);
    if (!acc.ok) return res.status(acc.status).json({ error: acc.error });

    const estructuraRes = await query(
      `SELECT id, nombre, orden FROM libreta_inicial_areas
       WHERE grupo_id = ? AND colegio_id = ? AND anio = ?
       ORDER BY orden ASC, id ASC`,
      [grupoId, colegio_id, acc.anioEsc]
    );
    const areas = estructuraRes || [];
    let indicadores = [];
    if (areas.length) {
      const ids = areas.map((a) => a.id);
      const ph = ids.map(() => '?').join(',');
      const indParams = [...ids, colegio_id, ...filtro.params];
      indicadores =
        (await query(
          `SELECT i.id, i.area_id, i.descripcion, i.orden, i.alcance_ciclo FROM libreta_inicial_indicadores i
           WHERE i.area_id IN (${ph}) AND i.colegio_id = ?
           ${filtro.sql}
           ORDER BY i.orden ASC, i.id ASC`,
          indParams
        )) || [];
    }

    const matriculas =
      (await query(
        `SELECT m.id as matricula_id,
                CONCAT(a.apellido_paterno, ' ', a.apellido_materno, ', ', a.nombres) as nombre_completo,
                m.recomendaciones
         FROM matriculas m
         INNER JOIN alumnos a ON a.id = m.alumno_id
         WHERE m.grupo_id = ? AND m.colegio_id = ? AND (m.estado = 0)
         ORDER BY a.apellido_paterno, a.apellido_materno, a.nombres`,
        [grupoId, colegio_id]
      )) || [];

    const mids = matriculas.map((m) => m.matricula_id);
    let valores = [];
    if (mids.length && indicadores.length) {
      const indIds = indicadores.map((i) => i.id);
      const phM = mids.map(() => '?').join(',');
      const phI = indIds.map(() => '?').join(',');
      valores =
        (await query(
          `SELECT indicador_id, matricula_id, ciclo, detalle, nota FROM libreta_inicial_valores
           WHERE matricula_id IN (${phM}) AND indicador_id IN (${phI}) AND colegio_id = ?`,
          [...mids, ...indIds, colegio_id]
        )) || [];
    }

    const alumnos = matriculas.map((m) => {
      const rec = parseRecomendacionCiclo(m.recomendaciones, ciclo);
      const valsAl = valores.filter((v) => Number(v.matricula_id) === Number(m.matricula_id));
      const porInd = {};
      valsAl.forEach((v) => {
        porInd[v.indicador_id] = { detalle: v.detalle || '', nota: v.nota || '' };
      });
      return {
        matricula_id: m.matricula_id,
        nombre_completo: m.nombre_completo,
        recomendacion: rec,
        valores: porInd
      };
    });

    const areasCon = areas.map((a) => ({
      ...a,
      indicadores: indicadores.filter((i) => Number(i.area_id) === Number(a.id))
    }));

    res.json({ ciclo, anio: acc.anioEsc, areas: areasCon, alumnos });
  } catch (e) {
    console.error('libreta-inicial registro:', e);
    res.status(500).json({ error: 'Error al cargar registro' });
  }
});

router.post('/grupos/:grupoId/libreta-inicial/guardar-alumno', async (req, res) => {
  try {
    const { grupoId } = req.params;
    const { colegio_id } = req.user;
    const personalId = req.user.personal_id || 0;
    const acc = await assertAccesoGrupoLibretaInicial(req, grupoId);
    if (!acc.ok) return res.status(acc.status).json({ error: acc.error });

    const cicloInt = parseInt(req.body.ciclo, 10) || 1;
    if (cicloInt < 1 || cicloInt > 4) return res.status(400).json({ error: 'Ciclo inválido' });
    const matriculaId = parseInt(req.body.matricula_id, 10);
    if (!matriculaId) return res.status(400).json({ error: 'matricula_id requerido' });

    const chk = await query(
      `SELECT id FROM matriculas WHERE id = ? AND grupo_id = ? AND colegio_id = ? AND (estado = 0) LIMIT 1`,
      [matriculaId, grupoId, colegio_id]
    );
    if (!chk.length) return res.status(404).json({ error: 'Matrícula no encontrada en el grupo' });

    const valores = Array.isArray(req.body.valores) ? req.body.valores : [];
    for (const v of valores) {
      const indId = parseInt(v.indicador_id, 10);
      if (!indId) continue;
      const indOk = await query(
        `SELECT i.id FROM libreta_inicial_indicadores i
         INNER JOIN libreta_inicial_areas a ON a.id = i.area_id
         WHERE i.id = ? AND i.colegio_id = ? AND a.grupo_id = ? AND a.anio = ?
         AND (i.alcance_ciclo = 0 OR i.alcance_ciclo = ?)`,
        [indId, colegio_id, grupoId, acc.anioEsc, cicloInt]
      );
      if (!indOk.length) continue;
      const detalle = v.detalle != null ? String(v.detalle) : '';
      const nota = v.nota != null && String(v.nota).trim() !== '' ? String(v.nota).trim().slice(0, 12) : null;
      await execute(
        `INSERT INTO libreta_inicial_valores (indicador_id, matricula_id, colegio_id, ciclo, detalle, nota)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE detalle = VALUES(detalle), nota = VALUES(nota), updated_at = CURRENT_TIMESTAMP`,
        [indId, matriculaId, colegio_id, cicloInt, detalle, nota]
      );
    }

    if (req.body.recomendacion !== undefined) {
      await guardarRecomendacionUnAlumno(
        matriculaId,
        grupoId,
        colegio_id,
        cicloInt,
        req.body.recomendacion,
        personalId
      );
    }

    res.json({ success: true });
  } catch (e) {
    console.error('guardar-alumno libreta-inicial:', e);
    res.status(500).json({ error: 'Error al guardar' });
  }
});

module.exports = router;
