/**
 * Catálogo académico (alineado a tablas MySQL del sistema anterior: niveles, grupos, cursos, áreas, asignaturas).
 * ADMINISTRADOR: todo. PSICOLOGA: solo meta + grupos/grados (aulas del año activo).
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const router = express.Router();
const { query, execute } = require('../utils/mysql');
const { authenticateToken } = require('../middleware/auth');
const { sqlMatriculaEstadoSoloRegular } = require('../utils/matriculaEstados');
const moment = require('moment-timezone');
const mensajesConfig = require('../config/mensajes.json');
const { crearNotificacionesApoderados } = require('./docente.routes');
const {
  buildQrCarnetPayloadForAlumnoEnGrupo,
  leerLogoBoletaBase64,
} = require('../utils/qrCarnetAlumnoData');
const { fetchNotasTodosGrupoData } = require('../utils/notasTodosGrupoData');
const {
  fetchGrupoRecomendacionesContext,
  listarAlumnosRecomendacionesPorGrupo,
  guardarRecomendacionesPorGrupo,
} = require('../utils/recomendacionesGrupoMatriculas');
const {
  fetchGrupoConductaContext,
  listarAlumnosConductaPorGrupo,
  guardarConductaPorGrupo,
} = require('../utils/conductaGrupoMatriculas');

router.use(authenticateToken);
router.use((req, res, next) => {
  if (req.user?.tipo === 'ADMINISTRADOR') return next();
  if (req.user?.tipo === 'PSICOLOGA') {
    const p = req.path || '';
    if (p.includes('/qr-carnets')) {
      return res.status(403).json({ error: 'No autorizado para exportar carnets QR.' });
    }
    if (p.includes('/notas-todos')) {
      return res.status(403).json({ error: 'No autorizado para exportar registro de notas.' });
    }
    if (p.includes('/recomendaciones')) {
      return res.status(403).json({ error: 'No autorizado para apreciaciones o recomendaciones del grupo.' });
    }
    if (p.includes('/asistencia')) {
      return res.status(403).json({ error: 'No autorizado para registro de asistencia.' });
    }
    if (p.includes('/conducta')) {
      return res.status(403).json({ error: 'No autorizado para registro de conducta.' });
    }
    if (p === '/meta' || p.startsWith('/grupos') || p.startsWith('/grados')) {
      return next();
    }
    return res.status(403).json({ error: 'No autorizado para esta sección del catálogo académico.' });
  }
  return res.status(403).json({ error: 'Solo el perfil Administrador puede gestionar el catálogo académico.' });
});

function colegio(req) {
  return req.user.colegio_id;
}

/** Inicial → Primaria → Secundaria; el resto al final. */
function ordenNivelEducativoNombre(nombre) {
  const n = String(nombre || '').toLowerCase();
  if (n.includes('inicial')) return 0;
  if (n.includes('primaria')) return 1;
  if (n.includes('secundaria')) return 2;
  return 50;
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
    const nivelesRows = await query(
      `SELECT ${nivelesSelect} FROM niveles WHERE colegio_id = ? ORDER BY ${nivelesOrder}`,
      [cid]
    );
    const niveles = [...(nivelesRows || [])].sort((a, b) => {
      const oa = ordenNivelEducativoNombre(a.nombre);
      const ob = ordenNivelEducativoNombre(b.nombre);
      if (oa !== ob) return oa - ob;
      return String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es');
    });
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
      `SELECT DISTINCT p.id,
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
    // Solo matrícula **Regular** (estado = 0); ver `matriculaEstados.sqlMatriculaEstadoSoloRegular`.
    sql += `, (SELECT COUNT(DISTINCT m.alumno_id) FROM matriculas m
         WHERE m.grupo_id = g.id AND m.colegio_id = g.colegio_id
           AND ${sqlMatriculaEstadoSoloRegular('m')}) AS matriculas_count`;
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

/**
 * GET /api/admin/academico/grupos/:grupoId/cursos-disponibles
 * Cursos del nivel del grupo que aún no tienen asignatura en ese grupo.
 * Query: exclude_asignatura_id — en edición, incluye el curso de esa asignatura aunque esté "ocupado".
 */
router.get('/grupos/:grupoId/cursos-disponibles', async (req, res) => {
  try {
    const grupoId = parseInt(req.params.grupoId, 10);
    const cid = colegio(req);
    const excludeAsignaturaId =
      req.query.exclude_asignatura_id != null && String(req.query.exclude_asignatura_id).trim() !== ''
        ? parseInt(req.query.exclude_asignatura_id, 10)
        : null;

    if (!Number.isFinite(grupoId)) {
      return res.status(400).json({ error: 'ID de grupo inválido' });
    }

    const [gRow] = await query(
      `SELECT g.id, g.nivel_id, g.grado, g.seccion, g.anio, n.nombre AS nivel_nombre
       FROM grupos g
       LEFT JOIN niveles n ON n.id = g.nivel_id
       WHERE g.id = ? AND g.colegio_id = ?`,
      [grupoId, cid]
    );
    if (!gRow) return res.status(404).json({ error: 'Grupo no encontrado' });

    const ccols = await getTableColumns('cursos').catch(() => null);
    if (!ccols?.has('nivel_id')) {
      return res.status(400).json({
        error: 'La tabla cursos no tiene nivel_id; no se puede filtrar por nivel del grupo.',
      });
    }

    let asignadosSql = `SELECT id, curso_id FROM asignaturas WHERE grupo_id = ? AND colegio_id = ?`;
    const asignadosParams = [grupoId, cid];
    if (Number.isFinite(excludeAsignaturaId)) {
      asignadosSql += ' AND id != ?';
      asignadosParams.push(excludeAsignaturaId);
    }
    const asignadosRows = await query(asignadosSql, asignadosParams);
    const ocupados = new Set((asignadosRows || []).map((r) => r.curso_id));

    const todosNivel = await query(
      `SELECT c.id, c.nombre, c.abreviatura, c.nivel_id
       FROM cursos c
       WHERE c.colegio_id = ? AND c.nivel_id = ?
       ORDER BY c.nombre ASC`,
      [cid, gRow.nivel_id]
    );

    let cursos = (todosNivel || []).filter((c) => !ocupados.has(c.id));

    if (Number.isFinite(excludeAsignaturaId)) {
      const [actual] = await query(
        'SELECT curso_id FROM asignaturas WHERE id = ? AND colegio_id = ? LIMIT 1',
        [excludeAsignaturaId, cid]
      );
      const cursoActualId = actual?.curso_id;
      if (cursoActualId && !cursos.some((c) => c.id === cursoActualId)) {
        const [curActual] = await query(
          `SELECT id, nombre, abreviatura, nivel_id FROM cursos WHERE id = ? AND colegio_id = ?`,
          [cursoActualId, cid]
        );
        if (curActual) {
          cursos = [{ ...curActual, asignado_actual: true }, ...cursos];
        }
      }
    }

    res.json({
      grupo: {
        id: gRow.id,
        nivel_id: gRow.nivel_id,
        nivel_nombre: gRow.nivel_nombre,
        grado: gRow.grado,
        seccion: gRow.seccion,
        anio: gRow.anio,
      },
      cursos,
      total_nivel: (todosNivel || []).length,
      total_ocupados: ocupados.size,
    });
  } catch (e) {
    console.error('[admin/academico/grupos/:grupoId/cursos-disponibles]', e);
    res.status(500).json({ error: 'Error al listar cursos disponibles' });
  }
});

/**
 * GET /api/admin/academico/grupos/:grupoId/horario
 * Horario completo del aula (misma lógica que tutoría / alumno). Query opcional ?anio= (por defecto año del grupo).
 */
router.get('/grupos/:grupoId/horario', async (req, res) => {
  try {
    const grupoId = parseInt(req.params.grupoId, 10);
    const cid = colegio(req);
    if (!Number.isFinite(grupoId)) {
      return res.status(400).json({ error: 'ID de grupo inválido' });
    }

    const grupoRows = await query(
      `SELECT g.*, n.nombre AS nivel_nombre
       FROM grupos g
       INNER JOIN niveles n ON n.id = g.nivel_id
       WHERE g.id = ? AND g.colegio_id = ?
       LIMIT 1`,
      [grupoId, cid]
    );
    if (!grupoRows || grupoRows.length === 0) {
      return res.status(404).json({ error: 'Grupo no encontrado' });
    }
    const grupo = grupoRows[0];
    const anioParam = parseInt(req.query.anio, 10);
    const anioHorario = Number.isFinite(anioParam) ? anioParam : parseInt(grupo.anio, 10);
    if (!Number.isFinite(anioHorario)) {
      return res.status(400).json({ error: 'Año académico no válido' });
    }

    const horarioCrudo = await query(
      `SELECT 
         gh.id,
         gh.dia,
         gh.hora_inicio,
         gh.hora_final,
         gh.anio,
         c.nombre AS curso_nombre,
         gh.descripcion AS descripcion,
         g.grado,
         g.seccion,
         n.nombre AS nivel_nombre,
         CONCAT(p.nombres, ' ', p.apellidos) AS docente_nombre
       FROM grupos_horarios gh
       LEFT JOIN asignaturas a ON a.id = gh.asignatura_id AND a.colegio_id = ?
       LEFT JOIN grupos g ON g.id = COALESCE(a.grupo_id, gh.grupo_id)
       LEFT JOIN niveles n ON n.id = g.nivel_id
       LEFT JOIN cursos c ON c.id = a.curso_id
       LEFT JOIN personal p ON p.id = COALESCE(a.personal_id, gh.personal_id)
       WHERE gh.anio = ?
         AND (
           (a.grupo_id = ? AND a.colegio_id = ?)
           OR
           (gh.grupo_id = ? AND a.id IS NULL)
         )
       ORDER BY gh.dia,
         TIME(STR_TO_DATE(gh.hora_inicio, '%l:%i %p')),
         COALESCE(TIME(STR_TO_DATE(gh.hora_inicio, '%H:%i:%s')), TIME(STR_TO_DATE(gh.hora_inicio, '%H:%i')))`,
      [cid, anioHorario, grupoId, cid, grupoId]
    );

    const horario = (horarioCrudo || []).map((row) => {
      let grupoTexto = '';
      if (row.nivel_nombre || row.grado || row.seccion) {
        const gradoTexto = row.grado ? `${row.grado}°` : '';
        grupoTexto = `${row.nivel_nombre || ''} ${gradoTexto} ${row.seccion || ''}`.trim();
        if (row.anio) grupoTexto = `${grupoTexto} - ${row.anio}`;
      }
      const titulo = row.curso_nombre || row.descripcion || '';
      return {
        id: row.id,
        dia: typeof row.dia === 'number' ? row.dia : parseInt(row.dia || 0, 10),
        inicio: row.hora_inicio,
        fin: row.hora_final,
        anio: row.anio,
        titulo,
        grupo: grupoTexto,
        docente_nombre: row.docente_nombre || ''
      };
    });

    res.json({ horario, grupo });
  } catch (e) {
    console.error('[admin/academico/grupos/:grupoId/horario]', e);
    res.status(500).json({ error: 'Error al obtener horario' });
  }
});

/** Solo administrador: registro de asistencia por grupo (misma lógica que tutoría docente). */
function assertSoloAdminAsistencia(req, res) {
  if (req.user?.tipo !== 'ADMINISTRADOR') {
    res.status(403).json({
      error: 'Solo el administrador puede registrar asistencia desde Grados.',
    });
    return false;
  }
  return true;
}

/**
 * GET /api/admin/academico/grupos/:grupoId/asistencia?fecha=YYYY-MM-DD
 */
router.get('/grupos/:grupoId/asistencia', async (req, res) => {
  try {
    if (!assertSoloAdminAsistencia(req, res)) return;
    const grupoId = parseInt(req.params.grupoId, 10);
    const cid = colegio(req);
    if (!Number.isFinite(grupoId)) {
      return res.status(400).json({ error: 'ID de grupo inválido' });
    }

    const grupoRows = await query(
      `SELECT g.*, n.nombre as nivel_nombre FROM grupos g
       INNER JOIN niveles n ON n.id = g.nivel_id
       WHERE g.id = ? AND g.colegio_id = ?`,
      [grupoId, cid]
    );
    if (!grupoRows.length) {
      return res.status(404).json({ error: 'Grupo no encontrado' });
    }

    const { fecha } = req.query;
    const fechaQuery = fecha
      ? moment(fecha).format('YYYY-MM-DD')
      : moment().tz('America/Lima').format('YYYY-MM-DD');

    const matriculas = await query(
      `SELECT m.id as matricula_id, a.id as alumno_id,
              CONCAT(a.apellido_paterno, ' ', a.apellido_materno, ', ', a.nombres) as nombre_completo
       FROM matriculas m
       INNER JOIN alumnos a ON a.id = m.alumno_id
       WHERE m.grupo_id = ? AND m.colegio_id = ? AND (m.estado = 0)
       ORDER BY a.apellido_paterno, a.apellido_materno, a.nombres`,
      [grupoId, cid]
    );

    const asistencias =
      matriculas.length === 0
        ? []
        : await query(
            `SELECT matricula_id, tipo, hora_entrada, hora_salida
             FROM matriculas_asistencias
             WHERE matricula_id IN (${matriculas.map(() => '?').join(',')}) AND fecha = ?`,
            [...matriculas.map((m) => m.matricula_id), fechaQuery]
          );
    const mapaAsistencia = {};
    (asistencias || []).forEach((a) => {
      mapaAsistencia[a.matricula_id] = a;
    });

    const lista = matriculas.map((m, i) => ({
      numero: i + 1,
      matricula_id: m.matricula_id,
      alumno_id: m.alumno_id,
      nombre_completo: m.nombre_completo,
      asistencia: mapaAsistencia[m.matricula_id] || null,
      tipo: mapaAsistencia[m.matricula_id]?.tipo || null,
    }));

    res.json({ grupo: grupoRows[0], alumnos: lista, fecha: fechaQuery });
  } catch (e) {
    console.error('[admin/academico/grupos/:grupoId/asistencia GET]', e);
    res.status(500).json({ error: 'Error al obtener asistencia' });
  }
});

/**
 * POST /api/admin/academico/grupos/:grupoId/asistencia
 */
router.post('/grupos/:grupoId/asistencia', async (req, res) => {
  try {
    if (!assertSoloAdminAsistencia(req, res)) return;
    const grupoId = parseInt(req.params.grupoId, 10);
    const cid = colegio(req);
    const anio_activo = parseInt(req.user.anio_activo, 10);
    const { usuario_id } = req.user;
    const { matricula_id, fecha, tipo, hora_dispositivo } = req.body;

    if (!Number.isFinite(grupoId)) {
      return res.status(400).json({ error: 'ID de grupo inválido' });
    }
    if (!matricula_id || !fecha || !tipo) {
      return res.status(400).json({ error: 'Datos incompletos' });
    }
    const tiposValidos = ['PRESENTE', 'TARDANZA', 'TARDANZA_JUSTIFICADA', 'FALTA', 'FALTA_JUSTIFICADA'];
    if (!tiposValidos.includes(tipo)) {
      return res.status(400).json({ error: 'Tipo inválido' });
    }

    const grupoOk = await query(`SELECT g.id FROM grupos g WHERE g.id = ? AND g.colegio_id = ?`, [grupoId, cid]);
    if (!grupoOk.length) {
      return res.status(403).json({ error: 'Grupo no encontrado o no pertenece a su colegio' });
    }

    const fechaNorm = moment(fecha).format('YYYY-MM-DD');
    let horaActual = moment().tz('America/Lima').format('HH:mm:ss');
    if (hora_dispositivo && typeof hora_dispositivo === 'string') {
      const h = hora_dispositivo.trim();
      const match = h.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/);
      if (match) {
        const hour = parseInt(match[1], 10);
        const min = parseInt(match[2], 10);
        const sec = match[3] != null ? parseInt(match[3], 10) : 0;
        if (hour >= 0 && hour <= 23 && min >= 0 && min <= 59 && sec >= 0 && sec <= 59) {
          horaActual = `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
        }
      }
    }

    const existente = await query(
      `SELECT id, tipo FROM matriculas_asistencias WHERE matricula_id = ? AND fecha = ?`,
      [matricula_id, fechaNorm]
    );

    let enviarNotificacion = false;
    if (existente.length > 0) {
      if (existente[0].tipo !== tipo) {
        await execute(
          `UPDATE matriculas_asistencias SET tipo = ?, hora_entrada = COALESCE(hora_entrada, ?) WHERE id = ?`,
          [tipo, horaActual, existente[0].id]
        );
        enviarNotificacion = true;
      }
    } else {
      await execute(
        `INSERT INTO matriculas_asistencias (matricula_id, fecha, tipo, hora_entrada, created_at) VALUES (?, ?, ?, ?, NOW())`,
        [matricula_id, fechaNorm, tipo, horaActual]
      );
      enviarNotificacion = true;
    }

    if (enviarNotificacion) {
      const alumnoData = await query(
        `SELECT a.id, a.nombres, a.apellido_paterno, a.apellido_materno
         FROM alumnos a INNER JOIN matriculas m ON m.alumno_id = a.id
         WHERE m.id = ? AND m.grupo_id = ? AND m.colegio_id = ?`,
        [matricula_id, grupoId, cid]
      );
      if (alumnoData.length > 0) {
        const nombreAlumno = `${alumnoData[0].nombres} ${alumnoData[0].apellido_paterno} ${alumnoData[0].apellido_materno}`.trim();
        const fechaForm = moment(fechaNorm).format('DD/MM/YYYY');
        const cfg = mensajesConfig.asistencia?.manual?.[tipo];
        const tituloBase = cfg?.titulo || `Asistencia: ${tipo}`;
        const palabraClaveManual =
          {
            PRESENTE: 'ASISTIÓ',
            TARDANZA: 'TARDANZA',
            TARDANZA_JUSTIFICADA: 'TARDANZA JUSTIFICADA',
            FALTA: 'FALTA',
            FALTA_JUSTIFICADA: 'FALTA JUSTIFICADA',
          }[tipo] || tipo;
        const titulo = `${palabraClaveManual} - ${tituloBase}`;
        let mensaje = (cfg?.mensaje_corto || '')
          .replace('{nombreAlumno}', nombreAlumno)
          .replace('{fecha}', fechaForm);
        if (tipo === 'FALTA' || tipo === 'TARDANZA') {
          mensaje += (mensaje.trim() ? ' ' : '') + 'Comuníquese con su tutora para poder justificar su Falta o Tardanza.';
        }
        setImmediate(() => {
          crearNotificacionesApoderados({
            alumno_id: alumnoData[0].id,
            usuario_id,
            colegio_id: cid,
            anio_activo,
            tituloNotificacion: titulo,
            mensajeNotificacion: mensaje,
            tipoNotificacion: `asistencia_manual_${tipo}`,
            dataExtra: { fecha: fechaNorm, tipo },
          }).catch((err) => console.error('Error notificando asistencia:', err));
        });
      }
    }

    res.json({ success: true, tipo });
  } catch (e) {
    console.error('[admin/academico/grupos/:grupoId/asistencia POST]', e);
    res.status(500).json({ error: 'Error al guardar asistencia' });
  }
});

/**
 * POST /api/admin/academico/grupos/:grupoId/asistencia/guardar-todo
 */
router.post('/grupos/:grupoId/asistencia/guardar-todo', async (req, res) => {
  try {
    if (!assertSoloAdminAsistencia(req, res)) return;
    const grupoId = parseInt(req.params.grupoId, 10);
    const cid = colegio(req);
    const anio_activo = parseInt(req.user.anio_activo, 10);
    const { usuario_id } = req.user;
    const { fecha, hora_dispositivo } = req.body;

    if (!Number.isFinite(grupoId)) {
      return res.status(400).json({ error: 'ID de grupo inválido' });
    }

    const grupoOk = await query(`SELECT g.id FROM grupos g WHERE g.id = ? AND g.colegio_id = ?`, [grupoId, cid]);
    if (!grupoOk.length) {
      return res.status(403).json({ error: 'Grupo no encontrado o no pertenece a su colegio' });
    }

    const fechaNorm = fecha
      ? moment(fecha).format('YYYY-MM-DD')
      : moment().tz('America/Lima').format('YYYY-MM-DD');
    let horaActual = moment().tz('America/Lima').format('HH:mm:ss');
    if (hora_dispositivo && typeof hora_dispositivo === 'string') {
      const h = hora_dispositivo.trim();
      const match = h.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/);
      if (match) {
        const hour = parseInt(match[1], 10);
        const min = parseInt(match[2], 10);
        const sec = match[3] != null ? parseInt(match[3], 10) : 0;
        if (hour >= 0 && hour <= 23 && min >= 0 && min <= 59 && sec >= 0 && sec <= 59) {
          horaActual = `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
        }
      }
    }

    const matriculas = await query(
      `SELECT m.id as matricula_id, a.id as alumno_id, a.nombres, a.apellido_paterno, a.apellido_materno
       FROM matriculas m INNER JOIN alumnos a ON a.id = m.alumno_id
       WHERE m.grupo_id = ? AND m.colegio_id = ? AND (m.estado = 0)`,
      [grupoId, cid]
    );

    const asistenciasExistentes =
      matriculas.length === 0
        ? []
        : await query(
            `SELECT matricula_id, tipo FROM matriculas_asistencias WHERE matricula_id IN (${matriculas.map(() => '?').join(',')}) AND fecha = ?`,
            [...matriculas.map((m) => m.matricula_id), fechaNorm]
          );
    const mapa = {};
    (asistenciasExistentes || []).forEach((a) => {
      mapa[a.matricula_id] = a.tipo;
    });

    const considerarPresente = ['PRESENTE', 'TARDANZA', 'TARDANZA_JUSTIFICADA'];
    const marcadosComoFalta = [];

    for (const m of matriculas) {
      const tipoActual = mapa[m.matricula_id];
      const tienePresenteOTardanza = tipoActual && considerarPresente.includes(tipoActual);
      if (!tienePresenteOTardanza) {
        const existenteRow = await query(
          `SELECT id, tipo FROM matriculas_asistencias WHERE matricula_id = ? AND fecha = ?`,
          [m.matricula_id, fechaNorm]
        );
        const yaTieneFalta =
          existenteRow.length > 0 &&
          (existenteRow[0].tipo === 'FALTA' || existenteRow[0].tipo === 'FALTA_JUSTIFICADA');
        if (yaTieneFalta) continue;
        if (existenteRow.length > 0) {
          await execute(`UPDATE matriculas_asistencias SET tipo = 'FALTA' WHERE id = ?`, [existenteRow[0].id]);
        } else {
          await execute(
            `INSERT INTO matriculas_asistencias (matricula_id, fecha, tipo, hora_entrada, created_at) VALUES (?, ?, ?, ?, NOW())`,
            [m.matricula_id, fechaNorm, 'FALTA', horaActual]
          );
        }
        marcadosComoFalta.push({
          alumno_id: m.alumno_id,
          nombre_completo: `${m.nombres} ${m.apellido_paterno} ${m.apellido_materno}`.trim(),
        });
      }
    }

    for (const item of marcadosComoFalta) {
      const cfg = mensajesConfig.asistencia?.manual?.FALTA;
      const tituloBase = cfg?.titulo || 'Falta Registrada';
      const titulo = `FALTA - ${tituloBase}`;
      const fechaForm = moment(fechaNorm).format('DD/MM/YYYY');
      let mensaje = (cfg?.mensaje_corto || '')
        .replace('{nombreAlumno}', item.nombre_completo)
        .replace('{fecha}', fechaForm);
      mensaje += (mensaje.trim() ? ' ' : '') + 'Comuníquese con su tutora para poder justificar su Falta o Tardanza.';
      setImmediate(() => {
        crearNotificacionesApoderados({
          alumno_id: item.alumno_id,
          usuario_id,
          colegio_id: cid,
          anio_activo,
          tituloNotificacion: titulo,
          mensajeNotificacion: mensaje,
          tipoNotificacion: 'asistencia_manual_FALTA',
          dataExtra: { fecha: fechaNorm, tipo: 'FALTA' },
        }).catch((err) => console.error('Error notificando falta:', err));
      });
    }

    res.json({ success: true, marcados_como_falta: marcadosComoFalta.length });
  } catch (e) {
    console.error('[admin/academico/grupos/:grupoId/asistencia/guardar-todo]', e);
    res.status(500).json({ error: 'Error al guardar asistencias' });
  }
});

/**
 * GET /api/admin/academico/grupos/:grupoId/qr-carnets
 * Carnets QR por alumno del grupo (matrícula en ese grupo). Solo administrador.
 */
router.get('/grupos/:grupoId/qr-carnets', async (req, res) => {
  try {
    if (req.user?.tipo !== 'ADMINISTRADOR') {
      return res.status(403).json({ error: 'Solo el administrador puede exportar carnets QR por grupo.' });
    }
    const grupoId = parseInt(req.params.grupoId, 10);
    const cid = colegio(req);
    if (!Number.isFinite(grupoId)) {
      return res.status(400).json({ error: 'ID de grupo inválido' });
    }

    const grupoRows = await query(
      `SELECT g.*, n.nombre AS nivel_nombre FROM grupos g
       INNER JOIN niveles n ON n.id = g.nivel_id
       WHERE g.id = ? AND g.colegio_id = ?`,
      [grupoId, cid]
    );
    if (!grupoRows.length) {
      return res.status(404).json({ error: 'Grupo no encontrado' });
    }
    const grupo = grupoRows[0];

    const [cRow] = await query('SELECT anio_activo FROM colegios WHERE id = ? LIMIT 1', [cid]);
    const anioColegio = parseInt(cRow?.anio_activo || new Date().getFullYear(), 10);
    const anioCarnet = Number.isFinite(parseInt(grupo.anio, 10)) ? parseInt(grupo.anio, 10) : anioColegio;

    const alumnosRows = await query(
      `SELECT a.id AS alumno_id
       FROM matriculas m
       INNER JOIN alumnos a ON a.id = m.alumno_id
       WHERE m.grupo_id = ? AND m.colegio_id = ? AND (m.estado = 0)
       ORDER BY a.apellido_paterno, a.apellido_materno, a.nombres`,
      [grupoId, cid]
    );

    let logo_url = null;
    let logo_base64 = null;
    try {
      const logos = await leerLogoBoletaBase64(query);
      logo_url = logos.logo_url;
      logo_base64 = logos.logo_base64;
    } catch (logoErr) {
      console.error('[admin/academico/grupos/:grupoId/qr-carnets] logo boleta:', logoErr);
    }

    const carnets = [];
    for (const row of alumnosRows) {
      try {
        const alumnoId = row.alumno_id;
        const payload = await buildQrCarnetPayloadForAlumnoEnGrupo(query, {
          colegio_id: cid,
          alumno_id: alumnoId,
          grupo_id: grupoId,
          anio_activo: anioCarnet,
        });
        if (!payload || payload.alumno_id !== alumnoId) continue;
        carnets.push({
          ...payload,
          logo_url,
          logo_base64,
        });
      } catch (oneErr) {
        console.error('[admin/academico/grupos/:grupoId/qr-carnets] alumno_id=', row?.alumno_id, oneErr);
      }
    }

    res.json({
      grupo: {
        id: grupo.id,
        grado: grupo.grado,
        seccion: grupo.seccion,
        nivel_nombre: grupo.nivel_nombre,
        anio: grupo.anio,
      },
      total_matriculas: alumnosRows.length,
      carnets,
    });
  } catch (e) {
    console.error('[admin/academico/grupos/:grupoId/qr-carnets]', e);
    res.status(500).json({ error: 'Error al armar carnets QR del grupo' });
  }
});

/**
 * GET /api/admin/academico/grupos/:grupoId/notas-todos?ciclo=1&anio=2025
 * Mismos datos que tutoría (PDF notas todos los cursos). Solo administrador.
 */
router.get('/grupos/:grupoId/notas-todos', async (req, res) => {
  try {
    if (req.user?.tipo !== 'ADMINISTRADOR') {
      return res.status(403).json({ error: 'Solo el administrador puede exportar el registro de notas por grupo.' });
    }
    const grupoId = parseInt(req.params.grupoId, 10);
    const cid = colegio(req);
    const cicloInt = parseInt(req.query.ciclo, 10) || 1;
    const anioGrupo = parseInt(req.query.anio, 10);
    if (!Number.isFinite(grupoId)) {
      return res.status(400).json({ error: 'ID de grupo inválido' });
    }
    if (!Number.isFinite(anioGrupo)) {
      return res.status(400).json({ error: 'Año escolar inválido' });
    }
    if (cicloInt < 1 || cicloInt > 4) {
      return res.status(400).json({ error: 'Bimestre inválido' });
    }

    const { cursos, grupo } = await fetchNotasTodosGrupoData(query, {
      grupoId,
      colegio_id: cid,
      anioGrupo,
      cicloInt,
    });
    res.json({ cursos, grupo });
  } catch (e) {
    if (e.code === 'GRUPO_NOT_FOUND') {
      return res.status(404).json({ error: 'Grupo no encontrado o no pertenece a ese año en su colegio' });
    }
    console.error('[admin/academico/grupos/:grupoId/notas-todos]', e);
    res.status(500).json({ error: 'Error al obtener notas del grupo' });
  }
});

/**
 * GET /api/admin/academico/grupos/:grupoId/recomendaciones?ciclo=1
 * Misma carga que tutoría. Solo administrador.
 */
router.get('/grupos/:grupoId/recomendaciones', async (req, res) => {
  try {
    if (req.user?.tipo !== 'ADMINISTRADOR') {
      return res.status(403).json({ error: 'Solo el administrador puede ver recomendaciones por grupo.' });
    }
    const grupoId = parseInt(req.params.grupoId, 10);
    const cid = colegio(req);
    const ciclo = parseInt(req.query.ciclo, 10) || 1;
    if (!Number.isFinite(grupoId)) {
      return res.status(400).json({ error: 'ID de grupo inválido' });
    }
    const grupo = await fetchGrupoRecomendacionesContext(query, grupoId, cid);
    if (!grupo) {
      return res.status(404).json({ error: 'Grupo no encontrado' });
    }
    const lista = await listarAlumnosRecomendacionesPorGrupo(query, { grupoId, colegio_id: cid, ciclo });
    res.json({ grupo, alumnos: lista, ciclo });
  } catch (error) {
    console.error('[admin/academico/grupos/:grupoId/recomendaciones GET]', error);
    res.status(500).json({ error: 'Error al obtener recomendaciones' });
  }
});

/**
 * POST /api/admin/academico/grupos/:grupoId/recomendaciones
 * body: { ciclo, recomendaciones: { matricula_id: texto } }
 */
router.post('/grupos/:grupoId/recomendaciones', async (req, res) => {
  try {
    if (req.user?.tipo !== 'ADMINISTRADOR') {
      return res.status(403).json({ error: 'Solo el administrador puede guardar recomendaciones por grupo.' });
    }
    const grupoId = parseInt(req.params.grupoId, 10);
    const cid = colegio(req);
    const { ciclo, recomendaciones } = req.body;
    if (!Number.isFinite(grupoId)) {
      return res.status(400).json({ error: 'ID de grupo inválido' });
    }
    const cicloInt = parseInt(ciclo, 10) || 1;
    if (cicloInt < 1 || cicloInt > 4) {
      return res.status(400).json({ error: 'Ciclo inválido' });
    }
    const grupo = await fetchGrupoRecomendacionesContext(query, grupoId, cid);
    if (!grupo) {
      return res.status(404).json({ error: 'Grupo no encontrado' });
    }
    const personalActor =
      req.user.personal_id != null && req.user.personal_id !== ''
        ? parseInt(req.user.personal_id, 10)
        : parseInt(req.user.usuario_id, 10) || 0;
    await guardarRecomendacionesPorGrupo(query, execute, {
      grupoId,
      cicloInt,
      recomendaciones,
      personalActor,
    });
    res.json({ success: true });
  } catch (error) {
    console.error('[admin/academico/grupos/:grupoId/recomendaciones POST]', error);
    res.status(500).json({ error: 'Error al guardar recomendaciones' });
  }
});

/**
 * GET /api/admin/academico/grupos/:grupoId/conducta?ciclo=1
 * Misma carga que tutoría. Solo administrador.
 */
router.get('/grupos/:grupoId/conducta', async (req, res) => {
  try {
    if (req.user?.tipo !== 'ADMINISTRADOR') {
      return res.status(403).json({ error: 'Solo el administrador puede ver conducta por grupo.' });
    }
    const grupoId = parseInt(req.params.grupoId, 10);
    const cid = colegio(req);
    const ciclo = parseInt(req.query.ciclo, 10) || 1;
    if (!Number.isFinite(grupoId)) {
      return res.status(400).json({ error: 'ID de grupo inválido' });
    }
    const grupo = await fetchGrupoConductaContext(query, grupoId, cid);
    if (!grupo) {
      return res.status(404).json({ error: 'Grupo no encontrado' });
    }
    const { lista, ciclo: cicloInt } = await listarAlumnosConductaPorGrupo(query, {
      grupoId,
      colegio_id: cid,
      ciclo,
    });
    res.json({ grupo, alumnos: lista, ciclo: cicloInt });
  } catch (error) {
    console.error('[admin/academico/grupos/:grupoId/conducta GET]', error);
    res.status(500).json({ error: 'Error al obtener conducta' });
  }
});

/**
 * POST /api/admin/academico/grupos/:grupoId/conducta
 * body: { ciclo, notas: { matricula_id: nota } }
 */
router.post('/grupos/:grupoId/conducta', async (req, res) => {
  try {
    if (req.user?.tipo !== 'ADMINISTRADOR') {
      return res.status(403).json({ error: 'Solo el administrador puede guardar conducta por grupo.' });
    }
    const grupoId = parseInt(req.params.grupoId, 10);
    const cid = colegio(req);
    const { ciclo, notas } = req.body;
    if (!Number.isFinite(grupoId)) {
      return res.status(400).json({ error: 'ID de grupo inválido' });
    }
    const cicloInt = parseInt(ciclo, 10) || 1;
    if (cicloInt < 1 || cicloInt > 4) {
      return res.status(400).json({ error: 'Ciclo inválido' });
    }
    const grupo = await fetchGrupoConductaContext(query, grupoId, cid);
    if (!grupo) {
      return res.status(404).json({ error: 'Grupo no encontrado' });
    }
    await guardarConductaPorGrupo(execute, { cicloInt, notas });
    res.json({ success: true });
  } catch (error) {
    console.error('[admin/academico/grupos/:grupoId/conducta POST]', error);
    res.status(500).json({ error: 'Error al guardar conducta' });
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
    const gcols = await getTableColumns('grupos');
    const fields = ['colegio_id', 'anio', 'nivel_id', 'grado', 'seccion', 'turno_id', 'tutor_id', 'sede_id'];
    const values = [cid, anio, nivel_id, grado, seccion, turno_id, tutor_id, sede_id];
    for (const key of GRUPO_EXTRA_KEYS) {
      if (!gcols.has(key)) continue;
      const v = req.body?.[key];
      const s = v != null ? String(v).trim() : '';
      fields.push(key);
      values.push(s);
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
      if (!Object.prototype.hasOwnProperty.call(req.body ?? {}, key)) continue;
      const v = req.body[key];
      const s = v != null ? String(v).trim() : '';
      sets.push(`${key} = ?`);
      vals.push(s);
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
function normalizarSeccionFiltro(sec) {
  const u = String(sec || '').trim().toUpperCase();
  if (u === 'ÚNICA') return 'UNICA';
  return u;
}

router.get('/asignaturas', async (req, res) => {
  try {
    const cid = colegio(req);
    const anio = req.query.anio != null ? parseInt(req.query.anio, 10) : null;
    const grupoId = req.query.grupo_id != null ? parseInt(req.query.grupo_id, 10) : null;
    const sedeId = req.query.sede_id != null && String(req.query.sede_id).trim() !== ''
      ? parseInt(req.query.sede_id, 10)
      : null;
    const nivelId = req.query.nivel_id != null && String(req.query.nivel_id).trim() !== ''
      ? parseInt(req.query.nivel_id, 10)
      : null;
    const grado = req.query.grado != null && String(req.query.grado).trim() !== ''
      ? parseInt(req.query.grado, 10)
      : null;
    const seccionRaw = req.query.seccion != null ? String(req.query.seccion).trim() : '';
    const turnoId = req.query.turno_id != null && String(req.query.turno_id).trim() !== ''
      ? parseInt(req.query.turno_id, 10)
      : null;

    const [cRow] = await query('SELECT anio_activo FROM colegios WHERE id = ? LIMIT 1', [cid]);
    const anioF = Number.isFinite(anio) ? anio : parseInt(cRow?.anio_activo || new Date().getFullYear(), 10);
    const gcols = await getTableColumns('grupos').catch(() => null);

    let sql = `
      SELECT a.id, a.grupo_id, a.curso_id, a.personal_id,
             c.nombre AS curso_nombre,
             g.grado, g.seccion, g.anio, g.nivel_id, g.turno_id,
             n.nombre AS nivel_nombre,
             TRIM(CONCAT(COALESCE(p.apellidos,''), ', ', COALESCE(p.nombres,''))) AS docente_nombre`;
    if (gcols?.has('sede_id')) sql += `, s.nombre AS sede_nombre, g.sede_id`;
    if (gcols?.has('turno_id')) sql += `, t.nombre AS turno_nombre`;
    sql += `
      FROM asignaturas a
      INNER JOIN grupos g ON g.id = a.grupo_id
      INNER JOIN cursos c ON c.id = a.curso_id
      INNER JOIN niveles n ON n.id = g.nivel_id
      INNER JOIN personal p ON p.id = a.personal_id`;
    if (gcols?.has('sede_id')) sql += ` LEFT JOIN sedes s ON s.id = g.sede_id`;
    if (gcols?.has('turno_id')) sql += ` LEFT JOIN turnos t ON t.id = g.turno_id`;
    sql += ` WHERE a.colegio_id = ? AND g.anio = ?`;
    const params = [cid, anioF];

    if (Number.isFinite(grupoId)) {
      sql += ' AND a.grupo_id = ?';
      params.push(grupoId);
    }
    if (Number.isFinite(sedeId) && gcols?.has('sede_id')) {
      sql += ' AND g.sede_id = ?';
      params.push(sedeId);
    }
    if (Number.isFinite(nivelId)) {
      sql += ' AND g.nivel_id = ?';
      params.push(nivelId);
    }
    if (Number.isFinite(grado)) {
      sql += ' AND g.grado = ?';
      params.push(grado);
    }
    if (seccionRaw) {
      sql += ' AND UPPER(TRIM(g.seccion)) = ?';
      params.push(normalizarSeccionFiltro(seccionRaw));
    }
    if (Number.isFinite(turnoId) && gcols?.has('turno_id')) {
      sql += ' AND g.turno_id = ?';
      params.push(turnoId);
    }

    sql += ' ORDER BY n.nombre, g.grado, g.seccion, c.nombre';
    const rows = await query(sql, params);
    res.json({ anio: anioF, asignaturas: rows || [] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al listar asignaturas' });
  }
});

/** Resumen de una asignatura (p. ej. Aula Virtual desde admin). */
router.get('/asignaturas/:id/resumen', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const cid = colegio(req);
    const anioQ = req.query.anio != null ? parseInt(req.query.anio, 10) : null;
    const [cRow] = await query('SELECT anio_activo FROM colegios WHERE id = ? LIMIT 1', [cid]);
    const anioF = Number.isFinite(anioQ) ? anioQ : parseInt(cRow?.anio_activo || new Date().getFullYear(), 10);

    const rows = await query(
      `SELECT a.id, a.grupo_id, a.curso_id, a.personal_id, a.aula_virtual, a.habilitar_aula,
              c.nombre AS curso_nombre, c.imagen AS curso_imagen,
              g.grado, g.seccion, g.anio, g.nivel_id, g.turno_id, g.sede_id,
              n.nombre AS nivel_nombre, t.nombre AS turno_nombre, s.nombre AS sede_nombre,
              TRIM(CONCAT(COALESCE(p.apellidos,''), ', ', COALESCE(p.nombres,''))) AS docente_nombre
       FROM asignaturas a
       INNER JOIN grupos g ON g.id = a.grupo_id
       INNER JOIN cursos c ON c.id = a.curso_id
       INNER JOIN niveles n ON n.id = g.nivel_id
       INNER JOIN personal p ON p.id = a.personal_id
       LEFT JOIN turnos t ON t.id = g.turno_id
       LEFT JOIN sedes s ON s.id = g.sede_id
       WHERE a.id = ? AND a.colegio_id = ? AND g.anio = ?`,
      [id, cid, anioF]
    );
    if (!rows.length) return res.status(404).json({ error: 'Asignatura no encontrada' });
    res.json({ asignatura: rows[0] });
  } catch (e) {
    console.error('[admin/academico/asignaturas/:id/resumen]', e);
    res.status(500).json({ error: 'Error al obtener asignatura' });
  }
});

router.post('/asignaturas', async (req, res) => {
  try {
    const cid = colegio(req);
    const grupo_id = parseInt(req.body?.grupo_id, 10);
    const personal_id = parseInt(req.body?.personal_id, 10);

    let cursoIds = [];
    if (Array.isArray(req.body?.curso_ids)) {
      cursoIds = [...new Set(
        req.body.curso_ids
          .map((x) => parseInt(x, 10))
          .filter((n) => Number.isFinite(n) && n > 0)
      )];
    } else if (req.body?.curso_id != null && String(req.body.curso_id).trim() !== '') {
      const uno = parseInt(req.body.curso_id, 10);
      if (Number.isFinite(uno)) cursoIds = [uno];
    }

    if (!grupo_id || !personal_id || !cursoIds.length) {
      return res.status(400).json({
        error: 'Grupo, docente y al menos un curso son obligatorios',
      });
    }

    const [g] = await query(
      'SELECT id, nivel_id FROM grupos WHERE id = ? AND colegio_id = ?',
      [grupo_id, cid]
    );
    if (!g) return res.status(400).json({ error: 'Grupo no válido' });

    const [p] = await query('SELECT id FROM personal WHERE id = ? AND colegio_id = ?', [personal_id, cid]);
    if (!p) return res.status(400).json({ error: 'Docente no válido' });

    const ccols = await getTableColumns('cursos').catch(() => null);
    const asignadosRows = await query(
      'SELECT curso_id FROM asignaturas WHERE grupo_id = ? AND colegio_id = ?',
      [grupo_id, cid]
    );
    const ocupados = new Set((asignadosRows || []).map((r) => r.curso_id));

    const insertados = [];
    const omitidos = [];
    const errores = [];

    for (const curso_id of cursoIds) {
      if (ocupados.has(curso_id)) {
        omitidos.push({ curso_id, motivo: 'Ya tiene docente en este grupo' });
        continue;
      }

      const [c] = await query(
        ccols?.has('nivel_id')
          ? 'SELECT id, nivel_id FROM cursos WHERE id = ? AND colegio_id = ?'
          : 'SELECT id FROM cursos WHERE id = ? AND colegio_id = ?',
        [curso_id, cid]
      );
      if (!c) {
        errores.push({ curso_id, motivo: 'Curso no válido' });
        continue;
      }
      if (ccols?.has('nivel_id') && c.nivel_id !== g.nivel_id) {
        errores.push({ curso_id, motivo: 'El curso no pertenece al nivel del grupo' });
        continue;
      }

      try {
        const r = await execute(
          `INSERT INTO asignaturas (colegio_id, grupo_id, curso_id, personal_id) VALUES (?, ?, ?, ?)`,
          [cid, grupo_id, curso_id, personal_id]
        );
        ocupados.add(curso_id);
        insertados.push({ id: r.insertId, curso_id });
      } catch (e) {
        if (String(e.message || '').includes('Duplicate') || e.code === 'ER_DUP_ENTRY') {
          omitidos.push({ curso_id, motivo: 'Asignación duplicada' });
        } else {
          errores.push({ curso_id, motivo: e.message || 'Error al insertar' });
        }
      }
    }

    if (!insertados.length) {
      const msg =
        omitidos.length && !errores.length
          ? 'Los cursos seleccionados ya tienen docente en este grupo.'
          : 'No se pudo crear ninguna asignatura. Revise los cursos seleccionados.';
      return res.status(400).json({
        error: msg,
        omitidos,
        errores,
      });
    }

    res.json({
      success: true,
      id: insertados[0].id,
      creadas: insertados.length,
      insertados,
      omitidos,
      errores,
    });
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

/** Subida de horario de aula virtual (grupo); se guarda en Static/Archivos y se devuelve ruta relativa para `horario_virtual`. */
const horarioGrupoDir = path.join(__dirname, '../Static/Archivos/grupos-horarios');
const horarioGrupoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      if (!fs.existsSync(horarioGrupoDir)) fs.mkdirSync(horarioGrupoDir, { recursive: true });
    } catch (err) {
      return cb(err);
    }
    cb(null, horarioGrupoDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '') || '';
    const base = `horario_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    cb(null, `${base}${ext}`);
  }
});
const uploadHorarioGrupo = multer({
  storage: horarioGrupoStorage,
  limits: { fileSize: 12 * 1024 * 1024 }
});

router.post('/grupos/upload-horario', uploadHorarioGrupo.single('archivo'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se recibió archivo' });
    const relPath = `Archivos/grupos-horarios/${req.file.filename}`;
    res.json({
      path: relPath,
      originalName: req.file.originalname || req.file.filename
    });
  } catch (e) {
    console.error('[grupos/upload-horario]', e);
    res.status(500).json({ error: e.message || 'Error al subir archivo' });
  }
});

module.exports = router;
