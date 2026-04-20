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

/** Tablas permitidas para introspección vía information_schema (whitelist). */
const TABLES_INTROSPECT = new Set(['niveles', 'cursos', 'areas', 'grupos']);
const tableColumnsCache = Object.create(null);

async function getTableColumns(table) {
  if (!TABLES_INTROSPECT.has(table)) throw new Error('Tabla no permitida');
  if (!tableColumnsCache[table]) {
    // No usar SHOW COLUMNS: utils/mysql.query() solo admite SELECT.
    const rows = await query(
      `SELECT COLUMN_NAME AS \`Field\`
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
      [table]
    );
    tableColumnsCache[table] = new Set(rows.map((r) => r.Field || r.field || r.COLUMN_NAME));
  }
  return tableColumnsCache[table];
}

function pickExisting(cols, wanted) {
  return wanted.filter((w) => cols.has(w));
}

function parseNum(v, fallback = null) {
  if (v === '' || v === undefined || v === null) return fallback;
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : fallback;
}

function parseIntOrNull(v) {
  if (v === '' || v === undefined || v === null) return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

/** Catálogos para formularios */
router.get('/meta', async (req, res) => {
  try {
    const cid = colegio(req);
    const [cRow] = await query('SELECT anio_activo FROM colegios WHERE id = ? LIMIT 1', [cid]);
    const anioActivo = parseInt(cRow?.anio_activo || new Date().getFullYear(), 10);
    const nivCols = await getTableColumns('niveles').catch(() => null);
    let nivelesSelect = 'id, nombre';
    if (nivCols?.has('grado_minimo')) nivelesSelect += ', grado_minimo';
    if (nivCols?.has('grado_maximo')) nivelesSelect += ', grado_maximo';
    const nivelesOrder = nivCols?.has('grado_minimo')
      ? 'COALESCE(grado_minimo, 0) ASC, id ASC'
      : 'id ASC';
    const niveles = await query(
      `SELECT ${nivelesSelect} FROM niveles WHERE colegio_id = ? ORDER BY ${nivelesOrder}`,
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
    /** Todo el personal con usuario activo (tutores / equipo) */
    const personal = await query(
      `SELECT p.id,
              TRIM(CONCAT(COALESCE(p.apellidos,''), ' ', COALESCE(p.nombres,''))) AS nombre
       FROM personal p
       INNER JOIN usuarios u ON u.personal_id = p.id AND u.colegio_id = ? AND u.estado = 'ACTIVO'
       ORDER BY p.apellidos, p.nombres`,
      [cid]
    ).catch(() => []);
    const [cCols, aCols] = await Promise.all([
      getTableColumns('cursos').catch(() => null),
      getTableColumns('areas').catch(() => null)
    ]);
    res.json({
      anio_activo: anioActivo,
      niveles: niveles || [],
      turnos: turnos || [],
      sedes: sedes || [],
      docentes: docentes || [],
      personal: personal || [],
      schema: {
        cursos_nivel_id: !!(cCols && cCols.has('nivel_id')),
        areas_nivel_id: !!(aCols && aCols.has('nivel_id'))
      }
    });
  } catch (e) {
    console.error('[admin/academico/meta]', e);
    res.status(500).json({ error: e.message || 'Error al cargar catálogos' });
  }
});

// ——— Niveles (campos alineados al sistema anterior; columnas opcionales según existan en MySQL) ———
const NIVEL_BODY_KEYS = [
  'nombre',
  'abreviatura',
  'codigo_modular',
  'definicion_grado',
  'grado_minimo',
  'grado_maximo',
  'tipo_calificacion',
  'tipo_calificacion_final',
  'nota_maxima',
  'nota_minima',
  'nota_aprobatoria',
  'hora_entrada',
  'tolerancia_minutos'
];

router.get('/niveles', async (req, res) => {
  try {
    const cid = colegio(req);
    const cols = await getTableColumns('niveles');
    const selectList = pickExisting(cols, [
      'id',
      'nombre',
      'abreviatura',
      'codigo_modular',
      'definicion_grado',
      'grado_minimo',
      'grado_maximo',
      'tipo_calificacion',
      'tipo_calificacion_final',
      'nota_maxima',
      'nota_minima',
      'nota_aprobatoria',
      'hora_entrada',
      'tolerancia_minutos'
    ]);
    if (selectList.length === 0) {
      return res.status(500).json({ error: 'Estructura de tabla niveles no reconocida' });
    }
    const rows = await query(
      `SELECT ${selectList.join(', ')} FROM niveles WHERE colegio_id = ? ORDER BY id ASC`,
      [cid]
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
    const cols = await getTableColumns('niveles');
    const fields = ['colegio_id', 'nombre'];
    const values = [cid, nombre];
    for (const key of NIVEL_BODY_KEYS) {
      if (key === 'nombre') continue;
      if (!cols.has(key)) continue;
      let v = req.body?.[key];
      if (key === 'tolerancia_minutos' || key === 'grado_minimo' || key === 'grado_maximo') {
        v = parseIntOrNull(v);
      } else if (
        key === 'tipo_calificacion' ||
        key === 'tipo_calificacion_final' ||
        key === 'nota_maxima' ||
        key === 'nota_minima' ||
        key === 'nota_aprobatoria'
      ) {
        v = v === '' || v === undefined || v === null ? null : parseNum(v, null);
      } else if (typeof v === 'string') {
        v = v.trim() || null;
      }
      fields.push(key);
      values.push(v);
    }
    const placeholders = fields.map(() => '?').join(', ');
    const r = await execute(`INSERT INTO niveles (${fields.join(', ')}) VALUES (${placeholders})`, values);
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
    const cols = await getTableColumns('niveles');
    const sets = ['nombre = ?'];
    const vals = [nombre];
    for (const key of NIVEL_BODY_KEYS) {
      if (key === 'nombre') continue;
      if (!cols.has(key)) continue;
      let v = req.body?.[key];
      if (key === 'tolerancia_minutos' || key === 'grado_minimo' || key === 'grado_maximo') {
        v = parseIntOrNull(v);
      } else if (
        key === 'tipo_calificacion' ||
        key === 'tipo_calificacion_final' ||
        key === 'nota_maxima' ||
        key === 'nota_minima' ||
        key === 'nota_aprobatoria'
      ) {
        v = v === '' || v === undefined || v === null ? null : parseNum(v, null);
      } else if (typeof v === 'string') {
        v = v.trim() || null;
      }
      sets.push(`${key} = ?`);
      vals.push(v);
    }
    vals.push(id, cid);
    await execute(`UPDATE niveles SET ${sets.join(', ')} WHERE id = ? AND colegio_id = ?`, vals);
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
const GRUPO_EXTRA_KEYS = ['enlace_archivos', 'aula_virtual', 'horario_virtual'];

/** Lista grupos con SQL según columnas reales en MySQL (evita 500 si falta p. ej. sede_id). Alias GET /grados = /grupos (UI). */
async function listGrupos(req, res) {
  try {
    const cid = colegio(req);
    const anio = req.query.anio != null ? parseInt(req.query.anio, 10) : null;
    const nivelIdQ = req.query.nivel_id != null && String(req.query.nivel_id).trim() !== '' ? parseInt(req.query.nivel_id, 10) : null;
    const [cRow] = await query('SELECT anio_activo FROM colegios WHERE id = ? LIMIT 1', [cid]);
    const anioF = Number.isFinite(anio) ? anio : parseInt(cRow?.anio_activo || new Date().getFullYear(), 10);
    const gcols = await getTableColumns('grupos');
    const core = pickExisting(gcols, ['id', 'anio', 'nivel_id', 'grado', 'seccion', 'turno_id', 'tutor_id', 'sede_id']);
    const extras = pickExisting(gcols, GRUPO_EXTRA_KEYS);
    const gFields = [...new Set([...core, ...extras])];
    if (!gFields.length || !gFields.includes('id')) {
      return res.status(500).json({ error: 'Tabla grupos no tiene la estructura esperada (falta id).' });
    }

    let sql = `SELECT ${gFields.map((c) => `g.\`${c}\``).join(', ')}`;
    sql += `, (SELECT COUNT(*) FROM matriculas m WHERE m.grupo_id = g.id) AS matriculas_count`;
    if (gcols.has('nivel_id')) sql += `, n.nombre AS nivel_nombre`;
    if (gcols.has('turno_id')) sql += `, t.nombre AS turno_nombre`;
    if (gcols.has('sede_id')) sql += `, s.nombre AS sede_nombre`;
    if (gcols.has('tutor_id')) {
      sql += `, TRIM(CONCAT(COALESCE(p.nombres,''), ' ', COALESCE(p.apellidos,''))) AS tutor_nombre`;
    }

    sql += ` FROM grupos g`;
    const params = [];
    if (gcols.has('nivel_id')) {
      sql += ` INNER JOIN niveles n ON n.id = g.nivel_id AND n.colegio_id = ?`;
      params.push(cid);
    }
    if (gcols.has('turno_id')) {
      sql += ` LEFT JOIN turnos t ON t.id = g.turno_id`;
    }
    if (gcols.has('sede_id')) {
      sql += ` LEFT JOIN sedes s ON s.id = g.sede_id`;
    }
    if (gcols.has('tutor_id')) {
      sql += ` LEFT JOIN personal p ON p.id = g.tutor_id`;
    }
    sql += ` WHERE g.colegio_id = ?`;
    params.push(cid);
    if (gcols.has('anio')) {
      sql += ` AND g.anio = ?`;
      params.push(anioF);
    }
    if (Number.isFinite(nivelIdQ) && gcols.has('nivel_id')) {
      sql += ` AND g.nivel_id = ?`;
      params.push(nivelIdQ);
    }

    const nivColsOrder = gcols.has('nivel_id') ? await getTableColumns('niveles').catch(() => null) : null;
    const orderParts = [];
    if (gcols.has('nivel_id')) {
      if (nivColsOrder?.has('grado_minimo')) orderParts.push('COALESCE(n.grado_minimo, 0) ASC');
      orderParts.push('n.id ASC');
    }
    if (gcols.has('grado')) orderParts.push('g.grado ASC');
    if (gcols.has('seccion')) orderParts.push('g.seccion ASC');
    sql += ` ORDER BY ${orderParts.length ? orderParts.join(', ') : 'g.id'}`;

    const rows = await query(sql, params);
    res.json({ anio: anioF, grupos: rows || [] });
  } catch (e) {
    console.error('[admin/academico/grupos]', e);
    res.status(500).json({
      error: 'Error al listar grupos',
      details: process.env.NODE_ENV !== 'production' ? e.message : undefined
    });
  }
}

router.get('/grupos', listGrupos);
router.get('/grados', listGrupos);

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
    const gcols = await getTableColumns('grupos');
    const fields = ['colegio_id', 'anio', 'nivel_id', 'grado', 'seccion', 'turno_id', 'tutor_id', 'sede_id'];
    const values = [cid, anio, nivel_id, grado, seccion, turno_id, tutor_id, sede_id];
    for (const key of GRUPO_EXTRA_KEYS) {
      if (!gcols.has(key)) continue;
      const v = req.body?.[key];
      const s = v != null ? String(v).trim() : '';
      fields.push(key);
      values.push(s || null);
    }
    const placeholders = fields.map(() => '?').join(', ');
    let r;
    try {
      r = await execute(`INSERT INTO grupos (${fields.join(', ')}) VALUES (${placeholders})`, values);
    } catch (e1) {
      const tIdx = fields.indexOf('tutor_id');
      if (tIdx >= 0) values[tIdx] = tutor_id || 0;
      r = await execute(`INSERT INTO grupos (${fields.join(', ')}) VALUES (${placeholders})`, values);
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
    const gcols = await getTableColumns('grupos');
    const sets = ['anio = ?', 'nivel_id = ?', 'grado = ?', 'seccion = ?', 'turno_id = ?', 'tutor_id = ?', 'sede_id = ?'];
    const vals = [anio, nivel_id, grado, seccion, turno_id, tutor_id, sede_id];
    for (const key of GRUPO_EXTRA_KEYS) {
      if (!gcols.has(key)) continue;
      const v = req.body?.[key];
      const s = v != null ? String(v).trim() : '';
      sets.push(`${key} = ?`);
      vals.push(s || null);
    }
    vals.push(id, cid);
    try {
      await execute(`UPDATE grupos SET ${sets.join(', ')} WHERE id = ? AND colegio_id = ?`, vals);
    } catch (e2) {
      vals[5] = tutor_id || 0;
      await execute(`UPDATE grupos SET ${sets.join(', ')} WHERE id = ? AND colegio_id = ?`, vals);
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

// ——— Cursos (nivel_id y demás campos como en el sistema anterior, si existen columnas) ———
router.get('/cursos', async (req, res) => {
  try {
    const cid = colegio(req);
    const cols = await getTableColumns('cursos');
    const base = pickExisting(cols, ['id', 'nivel_id', 'nombre', 'abreviatura', 'descripcion', 'imagen', 'link_libro']);
    if (!base.includes('id') || !base.includes('nombre')) {
      return res.status(500).json({ error: 'Estructura de tabla cursos no reconocida' });
    }
    const sel = base.map((c) => `c.${c}`).join(', ');
    let sql;
    if (cols.has('nivel_id')) {
      sql = `SELECT ${sel}, n.nombre AS nivel_nombre
       FROM cursos c
       LEFT JOIN niveles n ON n.id = c.nivel_id AND n.colegio_id = c.colegio_id
       WHERE c.colegio_id = ? ORDER BY n.nombre, c.nombre`;
    } else {
      sql = `SELECT ${sel} FROM cursos c WHERE c.colegio_id = ? ORDER BY c.nombre`;
    }
    const rows = await query(sql, [cid]);
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
    const cols = await getTableColumns('cursos');
    const fields = ['colegio_id', 'nombre'];
    const values = [cid, nombre];
    if (cols.has('nivel_id')) {
      const nid = parseInt(req.body?.nivel_id, 10);
      if (!Number.isFinite(nid)) {
        return res.status(400).json({ error: 'Debe seleccionar el nivel del curso' });
      }
      const [nv] = await query('SELECT id FROM niveles WHERE id = ? AND colegio_id = ?', [nid, cid]);
      if (!nv) return res.status(400).json({ error: 'Nivel no válido' });
      fields.push('nivel_id');
      values.push(nid);
    }
    for (const key of ['abreviatura', 'descripcion', 'imagen', 'link_libro']) {
      if (!cols.has(key)) continue;
      const v = req.body?.[key];
      const s = v != null ? String(v).trim() : '';
      fields.push(key);
      values.push(s || null);
    }
    const placeholders = fields.map(() => '?').join(', ');
    const r = await execute(`INSERT INTO cursos (${fields.join(', ')}) VALUES (${placeholders})`, values);
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
    const cols = await getTableColumns('cursos');
    const sets = ['nombre = ?'];
    const vals = [nombre];
    if (cols.has('nivel_id')) {
      const nid = parseInt(req.body?.nivel_id, 10);
      if (!Number.isFinite(nid)) return res.status(400).json({ error: 'Nivel obligatorio' });
      const [nv] = await query('SELECT id FROM niveles WHERE id = ? AND colegio_id = ?', [nid, cid]);
      if (!nv) return res.status(400).json({ error: 'Nivel no válido' });
      sets.push('nivel_id = ?');
      vals.push(nid);
    }
    for (const key of ['abreviatura', 'descripcion', 'imagen', 'link_libro']) {
      if (!cols.has(key)) continue;
      const v = req.body?.[key];
      const s = v != null ? String(v).trim() : '';
      sets.push(`${key} = ?`);
      vals.push(s || null);
    }
    vals.push(id, cid);
    await execute(`UPDATE cursos SET ${sets.join(', ')} WHERE id = ? AND colegio_id = ?`, vals);
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

// ——— Áreas (nivel_id como en el sistema anterior, si la columna existe) ———
router.get('/areas', async (req, res) => {
  try {
    const cid = colegio(req);
    const cols = await getTableColumns('areas');
    const base = pickExisting(cols, ['id', 'nombre', 'nivel_id']);
    if (!base.includes('id') || !base.includes('nombre')) {
      return res.status(500).json({ error: 'Estructura de tabla areas no reconocida' });
    }
    let sql;
    if (cols.has('nivel_id')) {
      sql = `SELECT ${base.map((c) => `a.${c}`).join(', ')}, n.nombre AS nivel_nombre
             FROM areas a
             LEFT JOIN niveles n ON n.id = a.nivel_id AND n.colegio_id = a.colegio_id
             WHERE a.colegio_id = ? ORDER BY n.nombre, a.nombre`;
    } else {
      sql = `SELECT ${base.map((c) => `a.${c}`).join(', ')} FROM areas a WHERE a.colegio_id = ? ORDER BY a.nombre`;
    }
    const rows = await query(sql, [cid]);
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
    const cid = colegio(req);
    const cols = await getTableColumns('areas');
    const fields = ['colegio_id', 'nombre'];
    const values = [cid, nombre];
    if (cols.has('nivel_id')) {
      const nid = parseInt(req.body?.nivel_id, 10);
      if (!Number.isFinite(nid)) return res.status(400).json({ error: 'Debe seleccionar el nivel del área' });
      const [nv] = await query('SELECT id FROM niveles WHERE id = ? AND colegio_id = ?', [nid, cid]);
      if (!nv) return res.status(400).json({ error: 'Nivel no válido' });
      fields.push('nivel_id');
      values.push(nid);
    }
    const placeholders = fields.map(() => '?').join(', ');
    const r = await execute(`INSERT INTO areas (${fields.join(', ')}) VALUES (${placeholders})`, values);
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
    const cols = await getTableColumns('areas');
    const sets = ['nombre = ?'];
    const vals = [nombre];
    if (cols.has('nivel_id')) {
      const nid = parseInt(req.body?.nivel_id, 10);
      if (!Number.isFinite(nid)) return res.status(400).json({ error: 'Nivel obligatorio' });
      const [nv] = await query('SELECT id FROM niveles WHERE id = ? AND colegio_id = ?', [nid, cid]);
      if (!nv) return res.status(400).json({ error: 'Nivel no válido' });
      sets.push('nivel_id = ?');
      vals.push(nid);
    }
    vals.push(id, cid);
    const r = await execute(`UPDATE areas SET ${sets.join(', ')} WHERE id = ? AND colegio_id = ?`, vals);
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
