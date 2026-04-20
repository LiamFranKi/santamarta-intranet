/**
 * Catálogo académico (alineado a tablas MySQL del sistema anterior: niveles, grupos, cursos, áreas, asignaturas).
 * Solo ADMINISTRADOR.
 */
const express = require('express');
const router = express.Router();
const { query, execute } = require('../utils/mysql');
const { authenticateToken } = require('../middleware/auth');

router.use(authenticateToken);
router.use((req, res, next) => {
  if (req.user?.tipo === 'ADMINISTRADOR') return next();
  return res.status(403).json({ error: 'Solo el perfil Administrador puede gestionar el catálogo académico.' });
});

function colegio(req) {
  return req.user.colegio_id;
}

/** Catálogos para formularios */
router.get('/meta', async (req, res) => {
  try {
    const cid = colegio(req);
    const [cRow] = await query('SELECT anio_activo FROM colegios WHERE id = ? LIMIT 1', [cid]);
    const anioActivo = parseInt(cRow?.anio_activo || new Date().getFullYear(), 10);
    const niveles = await query(
      'SELECT id, nombre FROM niveles WHERE colegio_id = ? ORDER BY id ASC',
      [cid]
    );
    let turnos = await query('SELECT id, nombre FROM turnos WHERE colegio_id = ? ORDER BY nombre ASC', [cid]).catch(() => []);
    if (!turnos || turnos.length === 0) {
      turnos = await query('SELECT id, nombre FROM turnos ORDER BY nombre ASC').catch(() => []);
    }
    const sedes = await query('SELECT id, nombre FROM sedes WHERE colegio_id = ? ORDER BY id ASC', [cid]);
    const docentes = await query(
      `SELECT p.id,
              TRIM(CONCAT(COALESCE(p.apellidos,''), ' ', COALESCE(p.nombres,''))) AS nombre
       FROM personal p
       INNER JOIN usuarios u ON u.personal_id = p.id AND u.colegio_id = ? AND u.estado = 'ACTIVO' AND u.tipo = 'DOCENTE'
       ORDER BY p.apellidos, p.nombres`,
      [cid]
    );
    res.json({
      anio_activo: anioActivo,
      niveles: niveles || [],
      turnos: turnos || [],
      sedes: sedes || [],
      docentes: docentes || []
    });
  } catch (e) {
    console.error('[admin/academico/meta]', e);
    res.status(500).json({ error: e.message || 'Error al cargar catálogos' });
  }
});

// ——— Niveles ———
router.get('/niveles', async (req, res) => {
  try {
    const rows = await query(
      `SELECT id, nombre, hora_entrada, tolerancia_minutos, tipo_calificacion
       FROM niveles WHERE colegio_id = ? ORDER BY id ASC`,
      [colegio(req)]
    );
    res.json({ niveles: rows || [] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al listar niveles' });
  }
});

router.post('/niveles', async (req, res) => {
  try {
    const nombre = String(req.body?.nombre || '').trim();
    if (!nombre) return res.status(400).json({ error: 'El nombre es obligatorio' });
    const cid = colegio(req);
    const hora = req.body?.hora_entrada != null ? String(req.body.hora_entrada).trim() : null;
    const tol = req.body?.tolerancia_minutos != null ? parseInt(req.body.tolerancia_minutos, 10) : null;
    const tipoCal = req.body?.tipo_calificacion != null ? String(req.body.tipo_calificacion).trim() : null;

    let r;
    try {
      r = await execute(
        `INSERT INTO niveles (colegio_id, nombre, hora_entrada, tolerancia_minutos, tipo_calificacion)
         VALUES (?, ?, ?, ?, ?)`,
        [cid, nombre, hora || null, Number.isFinite(tol) ? tol : null, tipoCal || null]
      );
    } catch (e1) {
      r = await execute(`INSERT INTO niveles (colegio_id, nombre) VALUES (?, ?)`, [cid, nombre]);
    }
    res.json({ success: true, id: r.insertId });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || 'No se pudo crear el nivel' });
  }
});

router.put('/niveles/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const nombre = String(req.body?.nombre || '').trim();
    if (!id || !nombre) return res.status(400).json({ error: 'Datos inválidos' });
    const cid = colegio(req);
    const [ex] = await query('SELECT id FROM niveles WHERE id = ? AND colegio_id = ?', [id, cid]);
    if (!ex) return res.status(404).json({ error: 'Nivel no encontrado' });
    const hora = req.body?.hora_entrada != null ? String(req.body.hora_entrada).trim() : null;
    const tol = req.body?.tolerancia_minutos != null ? parseInt(req.body.tolerancia_minutos, 10) : null;
    const tipoCal = req.body?.tipo_calificacion != null ? String(req.body.tipo_calificacion).trim() : null;
    try {
      await execute(
        `UPDATE niveles SET nombre = ?, hora_entrada = ?, tolerancia_minutos = ?, tipo_calificacion = ?
         WHERE id = ? AND colegio_id = ?`,
        [nombre, hora || null, Number.isFinite(tol) ? tol : null, tipoCal || null, id, cid]
      );
    } catch {
      await execute(`UPDATE niveles SET nombre = ? WHERE id = ? AND colegio_id = ?`, [nombre, id, cid]);
    }
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || 'No se pudo actualizar' });
  }
});

router.delete('/niveles/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const cid = colegio(req);
    const [c] = await query('SELECT COUNT(*) AS n FROM grupos WHERE nivel_id = ? AND colegio_id = ?', [id, cid]);
    if ((c?.n || 0) > 0) {
      return res.status(400).json({ error: 'No se puede eliminar: hay grupos que usan este nivel.' });
    }
    const r = await execute('DELETE FROM niveles WHERE id = ? AND colegio_id = ?', [id, cid]);
    if (!r.affectedRows) return res.status(404).json({ error: 'No encontrado' });
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || 'No se pudo eliminar' });
  }
});

// ——— Grupos (menú "Grados" / aulas por año) ———
router.get('/grupos', async (req, res) => {
  try {
    const cid = colegio(req);
    const anio = req.query.anio != null ? parseInt(req.query.anio, 10) : null;
    const [cRow] = await query('SELECT anio_activo FROM colegios WHERE id = ? LIMIT 1', [cid]);
    const anioF = Number.isFinite(anio) ? anio : parseInt(cRow?.anio_activo || new Date().getFullYear(), 10);
    const rows = await query(
      `SELECT g.id, g.anio, g.nivel_id, g.grado, g.seccion, g.turno_id, g.tutor_id, g.sede_id,
              n.nombre AS nivel_nombre, t.nombre AS turno_nombre, s.nombre AS sede_nombre,
              TRIM(CONCAT(COALESCE(p.nombres,''), ' ', COALESCE(p.apellidos,''))) AS tutor_nombre
       FROM grupos g
       INNER JOIN niveles n ON n.id = g.nivel_id AND n.colegio_id = ?
       INNER JOIN turnos t ON t.id = g.turno_id
       LEFT JOIN sedes s ON s.id = g.sede_id
       LEFT JOIN personal p ON p.id = g.tutor_id
       WHERE g.colegio_id = ? AND g.anio = ?
       ORDER BY n.nombre, g.grado, g.seccion`,
      [cid, cid, anioF]
    );
    res.json({ anio: anioF, grupos: rows || [] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al listar grupos' });
  }
});

router.post('/grupos', async (req, res) => {
  try {
    const cid = colegio(req);
    const anio = parseInt(req.body?.anio, 10);
    const nivel_id = parseInt(req.body?.nivel_id, 10);
    const grado = parseInt(req.body?.grado, 10);
    const seccion = String(req.body?.seccion || '').trim().toUpperCase();
    const turno_id = parseInt(req.body?.turno_id, 10);
    const sede_id = parseInt(req.body?.sede_id, 10);
    const tutor_id = req.body?.tutor_id != null && req.body.tutor_id !== '' ? parseInt(req.body.tutor_id, 10) : null;
    if (!Number.isFinite(anio) || !Number.isFinite(nivel_id) || !Number.isFinite(grado) || !seccion || !Number.isFinite(turno_id) || !Number.isFinite(sede_id)) {
      return res.status(400).json({ error: 'Año, nivel, grado, sección, turno y sede son obligatorios' });
    }
    let r;
    try {
      r = await execute(
        `INSERT INTO grupos (colegio_id, anio, nivel_id, grado, seccion, turno_id, tutor_id, sede_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [cid, anio, nivel_id, grado, seccion, turno_id, tutor_id, sede_id]
      );
    } catch (e1) {
      r = await execute(
        `INSERT INTO grupos (colegio_id, anio, nivel_id, grado, seccion, turno_id, tutor_id, sede_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [cid, anio, nivel_id, grado, seccion, turno_id, tutor_id || 0, sede_id]
      );
    }
    res.json({ success: true, id: r.insertId });
  } catch (e) {
    if (String(e.message || '').includes('Duplicate') || e.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Ya existe un grupo con ese nivel, grado, sección, turno y sede para ese año.' });
    }
    console.error(e);
    res.status(500).json({ error: e.message || 'No se pudo crear el grupo' });
  }
});

router.put('/grupos/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const cid = colegio(req);
    const nivel_id = parseInt(req.body?.nivel_id, 10);
    const grado = parseInt(req.body?.grado, 10);
    const seccion = String(req.body?.seccion || '').trim().toUpperCase();
    const turno_id = parseInt(req.body?.turno_id, 10);
    const sede_id = parseInt(req.body?.sede_id, 10);
    const tutor_id = req.body?.tutor_id != null && req.body.tutor_id !== '' ? parseInt(req.body.tutor_id, 10) : null;
    const anio = parseInt(req.body?.anio, 10);
    if (!id || !Number.isFinite(nivel_id) || !Number.isFinite(grado) || !seccion || !Number.isFinite(turno_id) || !Number.isFinite(sede_id) || !Number.isFinite(anio)) {
      return res.status(400).json({ error: 'Datos incompletos' });
    }
    const [ex] = await query('SELECT id FROM grupos WHERE id = ? AND colegio_id = ?', [id, cid]);
    if (!ex) return res.status(404).json({ error: 'Grupo no encontrado' });
    try {
      await execute(
        `UPDATE grupos SET anio = ?, nivel_id = ?, grado = ?, seccion = ?, turno_id = ?, tutor_id = ?, sede_id = ?
         WHERE id = ? AND colegio_id = ?`,
        [anio, nivel_id, grado, seccion, turno_id, tutor_id, sede_id, id, cid]
      );
    } catch (e2) {
      await execute(
        `UPDATE grupos SET anio = ?, nivel_id = ?, grado = ?, seccion = ?, turno_id = ?, tutor_id = ?, sede_id = ?
         WHERE id = ? AND colegio_id = ?`,
        [anio, nivel_id, grado, seccion, turno_id, tutor_id || 0, sede_id, id, cid]
      );
    }
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || 'No se pudo actualizar' });
  }
});

router.delete('/grupos/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const cid = colegio(req);
    const [m] = await query('SELECT COUNT(*) AS n FROM matriculas WHERE grupo_id = ? AND colegio_id = ?', [id, cid]);
    if ((m?.n || 0) > 0) {
      return res.status(400).json({ error: 'No se puede eliminar: hay matrículas en este grupo.' });
    }
    const [a] = await query('SELECT COUNT(*) AS n FROM asignaturas WHERE grupo_id = ? AND colegio_id = ?', [id, cid]);
    if ((a?.n || 0) > 0) {
      return res.status(400).json({ error: 'No se puede eliminar: hay asignaturas en este grupo.' });
    }
    const r = await execute('DELETE FROM grupos WHERE id = ? AND colegio_id = ?', [id, cid]);
    if (!r.affectedRows) return res.status(404).json({ error: 'No encontrado' });
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || 'No se pudo eliminar' });
  }
});

// ——— Cursos ———
router.get('/cursos', async (req, res) => {
  try {
    const rows = await query(
      `SELECT id, nombre, imagen FROM cursos WHERE colegio_id = ? ORDER BY nombre ASC`,
      [colegio(req)]
    );
    res.json({ cursos: rows || [] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al listar cursos' });
  }
});

router.post('/cursos', async (req, res) => {
  try {
    const nombre = String(req.body?.nombre || '').trim();
    if (!nombre) return res.status(400).json({ error: 'El nombre es obligatorio' });
    const cid = colegio(req);
    const imagen = req.body?.imagen != null ? String(req.body.imagen).trim() : '';
    let r;
    try {
      r = await execute(`INSERT INTO cursos (colegio_id, nombre, imagen) VALUES (?, ?, ?)`, [cid, nombre, imagen || null]);
    } catch {
      r = await execute(`INSERT INTO cursos (colegio_id, nombre) VALUES (?, ?)`, [cid, nombre]);
    }
    res.json({ success: true, id: r.insertId });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || 'No se pudo crear el curso' });
  }
});

router.put('/cursos/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const nombre = String(req.body?.nombre || '').trim();
    if (!id || !nombre) return res.status(400).json({ error: 'Datos inválidos' });
    const cid = colegio(req);
    const [ex] = await query('SELECT id FROM cursos WHERE id = ? AND colegio_id = ?', [id, cid]);
    if (!ex) return res.status(404).json({ error: 'Curso no encontrado' });
    const imagen = req.body?.imagen != null ? String(req.body.imagen).trim() : '';
    try {
      await execute(`UPDATE cursos SET nombre = ?, imagen = ? WHERE id = ? AND colegio_id = ?`, [nombre, imagen || null, id, cid]);
    } catch {
      await execute(`UPDATE cursos SET nombre = ? WHERE id = ? AND colegio_id = ?`, [nombre, id, cid]);
    }
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || 'No se pudo actualizar' });
  }
});

router.delete('/cursos/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const cid = colegio(req);
    const [c] = await query('SELECT COUNT(*) AS n FROM asignaturas WHERE curso_id = ? AND colegio_id = ?', [id, cid]);
    if ((c?.n || 0) > 0) {
      return res.status(400).json({ error: 'No se puede eliminar: hay asignaturas que usan este curso.' });
    }
    await execute('DELETE FROM areas_cursos WHERE curso_id = ?', [id]).catch(() => {});
    const r = await execute('DELETE FROM cursos WHERE id = ? AND colegio_id = ?', [id, cid]);
    if (!r.affectedRows) return res.status(404).json({ error: 'No encontrado' });
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || 'No se pudo eliminar' });
  }
});

// ——— Áreas ———
router.get('/areas', async (req, res) => {
  try {
    const rows = await query(
      `SELECT id, nombre FROM areas WHERE colegio_id = ? ORDER BY nombre ASC`,
      [colegio(req)]
    );
    res.json({ areas: rows || [] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al listar áreas' });
  }
});

router.get('/areas/:id/cursos', async (req, res) => {
  try {
    const areaId = parseInt(req.params.id, 10);
    const cid = colegio(req);
    const [a] = await query('SELECT id FROM areas WHERE id = ? AND colegio_id = ?', [areaId, cid]);
    if (!a) return res.status(404).json({ error: 'Área no encontrada' });
    const rows = await query(
      `SELECT c.id, c.nombre
       FROM areas_cursos ac
       INNER JOIN cursos c ON c.id = ac.curso_id AND c.colegio_id = ?
       WHERE ac.area_id = ?
       ORDER BY c.nombre`,
      [cid, areaId]
    );
    res.json({ cursos: rows || [] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al listar cursos del área' });
  }
});

router.post('/areas', async (req, res) => {
  try {
    const nombre = String(req.body?.nombre || '').trim();
    if (!nombre) return res.status(400).json({ error: 'El nombre es obligatorio' });
    const r = await execute(`INSERT INTO areas (colegio_id, nombre) VALUES (?, ?)`, [colegio(req), nombre]);
    res.json({ success: true, id: r.insertId });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || 'No se pudo crear el área' });
  }
});

router.put('/areas/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const nombre = String(req.body?.nombre || '').trim();
    if (!id || !nombre) return res.status(400).json({ error: 'Datos inválidos' });
    const cid = colegio(req);
    const r = await execute(`UPDATE areas SET nombre = ? WHERE id = ? AND colegio_id = ?`, [nombre, id, cid]);
    if (!r.affectedRows) return res.status(404).json({ error: 'No encontrado' });
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || 'No se pudo actualizar' });
  }
});

router.post('/areas/:id/cursos', async (req, res) => {
  try {
    const areaId = parseInt(req.params.id, 10);
    const cursoId = parseInt(req.body?.curso_id, 10);
    const cid = colegio(req);
    if (!areaId || !cursoId) return res.status(400).json({ error: 'Área y curso son obligatorios' });
    const [a] = await query('SELECT id FROM areas WHERE id = ? AND colegio_id = ?', [areaId, cid]);
    if (!a) return res.status(404).json({ error: 'Área no encontrada' });
    const [c] = await query('SELECT id FROM cursos WHERE id = ? AND colegio_id = ?', [cursoId, cid]);
    if (!c) return res.status(404).json({ error: 'Curso no encontrado' });
    try {
      await execute(`INSERT INTO areas_cursos (area_id, curso_id) VALUES (?, ?)`, [areaId, cursoId]);
    } catch (e) {
      if (String(e.message || '').includes('Duplicate') || e.code === 'ER_DUP_ENTRY') {
        return res.status(400).json({ error: 'Este curso ya está vinculado al área.' });
      }
      throw e;
    }
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || 'No se pudo vincular' });
  }
});

router.delete('/areas/:areaId/cursos/:cursoId', async (req, res) => {
  try {
    const areaId = parseInt(req.params.areaId, 10);
    const cursoId = parseInt(req.params.cursoId, 10);
    const cid = colegio(req);
    const [a] = await query('SELECT id FROM areas WHERE id = ? AND colegio_id = ?', [areaId, cid]);
    if (!a) return res.status(404).json({ error: 'Área no encontrada' });
    await execute(`DELETE FROM areas_cursos WHERE area_id = ? AND curso_id = ?`, [areaId, cursoId]);
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || 'No se pudo quitar el vínculo' });
  }
});

router.delete('/areas/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const cid = colegio(req);
    await execute('DELETE FROM areas_cursos WHERE area_id = ?', [id]).catch(() => {});
    const r = await execute('DELETE FROM areas WHERE id = ? AND colegio_id = ?', [id, cid]);
    if (!r.affectedRows) return res.status(404).json({ error: 'No encontrado' });
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || 'No se pudo eliminar' });
  }
});

// ——— Asignaturas ———
router.get('/asignaturas', async (req, res) => {
  try {
    const cid = colegio(req);
    const anio = req.query.anio != null ? parseInt(req.query.anio, 10) : null;
    const grupoId = req.query.grupo_id != null ? parseInt(req.query.grupo_id, 10) : null;
    const [cRow] = await query('SELECT anio_activo FROM colegios WHERE id = ? LIMIT 1', [cid]);
    const anioF = Number.isFinite(anio) ? anio : parseInt(cRow?.anio_activo || new Date().getFullYear(), 10);
    let sql = `
      SELECT a.id, a.grupo_id, a.curso_id, a.personal_id,
             c.nombre AS curso_nombre,
             g.grado, g.seccion, g.anio, n.nombre AS nivel_nombre,
             TRIM(CONCAT(COALESCE(p.nombres,''), ' ', COALESCE(p.apellidos,''))) AS docente_nombre
      FROM asignaturas a
      INNER JOIN grupos g ON g.id = a.grupo_id
      INNER JOIN cursos c ON c.id = a.curso_id
      INNER JOIN niveles n ON n.id = g.nivel_id
      INNER JOIN personal p ON p.id = a.personal_id
      WHERE a.colegio_id = ? AND g.anio = ?`;
    const params = [cid, anioF];
    if (grupoId) {
      sql += ' AND a.grupo_id = ?';
      params.push(grupoId);
    }
    sql += ' ORDER BY n.nombre, g.grado, g.seccion, c.nombre';
    const rows = await query(sql, params);
    res.json({ anio: anioF, asignaturas: rows || [] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al listar asignaturas' });
  }
});

router.post('/asignaturas', async (req, res) => {
  try {
    const cid = colegio(req);
    const grupo_id = parseInt(req.body?.grupo_id, 10);
    const curso_id = parseInt(req.body?.curso_id, 10);
    const personal_id = parseInt(req.body?.personal_id, 10);
    if (!grupo_id || !curso_id || !personal_id) {
      return res.status(400).json({ error: 'Grupo, curso y docente son obligatorios' });
    }
    const [g] = await query('SELECT id FROM grupos WHERE id = ? AND colegio_id = ?', [grupo_id, cid]);
    if (!g) return res.status(400).json({ error: 'Grupo no válido' });
    const [c] = await query('SELECT id FROM cursos WHERE id = ? AND colegio_id = ?', [curso_id, cid]);
    if (!c) return res.status(400).json({ error: 'Curso no válido' });
    const [p] = await query('SELECT id FROM personal WHERE id = ? AND colegio_id = ?', [personal_id, cid]);
    if (!p) return res.status(400).json({ error: 'Docente no válido' });
    let r;
    try {
      r = await execute(
        `INSERT INTO asignaturas (colegio_id, grupo_id, curso_id, personal_id) VALUES (?, ?, ?, ?)`,
        [cid, grupo_id, curso_id, personal_id]
      );
    } catch (e) {
      if (String(e.message || '').includes('Duplicate') || e.code === 'ER_DUP_ENTRY') {
        return res.status(400).json({ error: 'Ya existe esa asignación (grupo/curso/docente).' });
      }
      throw e;
    }
    res.json({ success: true, id: r.insertId });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || 'No se pudo crear la asignatura' });
  }
});

router.put('/asignaturas/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const cid = colegio(req);
    const grupo_id = parseInt(req.body?.grupo_id, 10);
    const curso_id = parseInt(req.body?.curso_id, 10);
    const personal_id = parseInt(req.body?.personal_id, 10);
    if (!id || !grupo_id || !curso_id || !personal_id) {
      return res.status(400).json({ error: 'Datos incompletos' });
    }
    const [ex] = await query('SELECT id FROM asignaturas WHERE id = ? AND colegio_id = ?', [id, cid]);
    if (!ex) return res.status(404).json({ error: 'Asignatura no encontrada' });
    await execute(
      `UPDATE asignaturas SET grupo_id = ?, curso_id = ?, personal_id = ? WHERE id = ? AND colegio_id = ?`,
      [grupo_id, curso_id, personal_id, id, cid]
    );
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || 'No se pudo actualizar' });
  }
});

router.delete('/asignaturas/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const cid = colegio(req);
    const r = await execute('DELETE FROM asignaturas WHERE id = ? AND colegio_id = ?', [id, cid]);
    if (!r.affectedRows) return res.status(404).json({ error: 'No encontrado' });
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || 'No se pudo eliminar (puede haber notas o contenidos vinculados).' });
  }
});

module.exports = router;
