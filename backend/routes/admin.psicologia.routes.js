/**
 * Módulo Psicología — administración (tablas psicologia_*).
 * Perfiles: ADMINISTRADOR, PROMOTORIA, SECRETARIA.
 */
const express = require('express');
const PDFDocument = require('pdfkit');
const router = express.Router();
const { query, execute } = require('../utils/mysql');
const { authenticateToken } = require('../middleware/auth');
const { fechaHoraMySQLLima, fechaHoraTextoLima, fechaTextoLima } = require('../utils/fechaHoraLima');
const { insertNotificacionUsuario, notificacionMensajeDuplicadaReciente } = require('../utils/notificacionInsert');

const PSICOLOGIA_TIPOS = new Set(['ADMINISTRADOR', 'PROMOTORIA', 'SECRETARIA', 'PSICOLOGA']);

function colegioId(req) {
  if (req.psico_colegio_id != null) return req.psico_colegio_id;
  const raw = req.user?.colegio_id;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

router.use(authenticateToken);
router.use((req, res, next) => {
  if (PSICOLOGIA_TIPOS.has(req.user?.tipo)) return next();
  return res.status(403).json({ error: 'Sin permiso para el módulo de Psicología.' });
});
router.use((req, res, next) => {
  const n = Number(req.user?.colegio_id);
  if (!Number.isFinite(n)) {
    return res.status(400).json({ error: 'Usuario sin colegio asignado (colegio_id).' });
  }
  req.psico_colegio_id = n;
  next();
});

function ordenNivelEducativoNombre(nombre) {
  const n = String(nombre || '').toLowerCase();
  if (n.includes('inicial')) return 0;
  if (n.includes('primaria')) return 1;
  if (n.includes('secundaria')) return 2;
  return 50;
}

/** Expresión SQL: nombre desde `personal` (misma convención que el resto del intranet: apellidos + nombres). */
function sqlNombrePersonal(alias = 'p') {
  return `TRIM(CONCAT(COALESCE(${alias}.apellidos,''), ' ', COALESCE(${alias}.nombres,'')))`;
}

/** Catálogos para buscador (no depende de /admin/academico/meta, restringido a administrador). */
router.get('/meta', async (req, res) => {
  try {
    const cid = colegioId(req);
    let anioActivo = new Date().getFullYear();
    try {
      const cRows = await query('SELECT anio_activo FROM colegios WHERE id = ? LIMIT 1', [cid]);
      const cRow = cRows[0];
      if (cRow?.anio_activo != null && cRow.anio_activo !== '') {
        anioActivo = parseInt(cRow.anio_activo, 10) || anioActivo;
      }
    } catch (eColegio) {
      console.warn('[admin/psicologia/meta] colegios:', eColegio.message);
      try {
        const chk = await query('SELECT id FROM colegios WHERE id = ? LIMIT 1', [cid]);
        if (!chk.length) return res.status(404).json({ error: 'Colegio no encontrado' });
      } catch (e2) {
        console.error('[admin/psicologia/meta]', e2);
        return res.status(500).json({ error: e2.message || 'Error al leer colegio' });
      }
    }
    let niveles = [];
    try {
      niveles = await query(
        `SELECT id, nombre, grado_minimo, grado_maximo FROM niveles WHERE colegio_id = ?
         ORDER BY COALESCE(grado_minimo, 0) ASC, id ASC`,
        [cid]
      );
    } catch {
      try {
        niveles = await query('SELECT id, nombre FROM niveles WHERE colegio_id = ? ORDER BY id ASC', [cid]);
      } catch (eNiv) {
        console.warn('[admin/psicologia/meta] niveles:', eNiv.message);
        niveles = [];
      }
    }
    niveles = [...(niveles || [])].sort((a, b) => {
      const oa = ordenNivelEducativoNombre(a.nombre);
      const ob = ordenNivelEducativoNombre(b.nombre);
      if (oa !== ob) return oa - ob;
      return String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es');
    });
    let turnos = await query('SELECT id, nombre FROM turnos WHERE colegio_id = ? ORDER BY nombre ASC', [cid]).catch(() => []);
    if (!turnos || turnos.length === 0) {
      turnos = await query('SELECT id, nombre FROM turnos ORDER BY nombre ASC').catch(() => []);
    }
    const sedes = await query('SELECT id, nombre FROM sedes WHERE colegio_id = ? ORDER BY id ASC', [cid]).catch(() => []);
    const docentes = await query(
      `SELECT p.id, ${sqlNombrePersonal('p')} AS nombre
       FROM personal p
       INNER JOIN (
         SELECT u.personal_id
         FROM usuarios u
         WHERE u.colegio_id = ? AND u.estado = 'ACTIVO' AND u.tipo = 'DOCENTE'
         GROUP BY u.personal_id
       ) ux ON ux.personal_id = p.id
       WHERE p.colegio_id = ?
       ORDER BY nombre ASC`,
      [cid, cid]
    ).catch(() => []);
    const personal = await query(
      `SELECT p.id, ${sqlNombrePersonal('p')} AS nombre
       FROM personal p
       INNER JOIN (
         SELECT u.personal_id
         FROM usuarios u
         WHERE u.colegio_id = ? AND u.estado = 'ACTIVO'
         GROUP BY u.personal_id
       ) ux ON ux.personal_id = p.id
       WHERE p.colegio_id = ?
       ORDER BY nombre ASC`,
      [cid, cid]
    ).catch(() => []);
    res.json({
      anio_activo: anioActivo,
      niveles: niveles || [],
      turnos: turnos || [],
      sedes: sedes || [],
      docentes: docentes || [],
      personal: personal || [],
    });
  } catch (e) {
    console.error('[admin/psicologia/meta]', e);
    res.status(500).json({ error: e.message || 'Error al cargar catálogos' });
  }
});

async function columnExists(table, col) {
  const rows = await query(
    `SELECT 1 AS ok
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
     LIMIT 1`,
    [table, col]
  );
  return Array.isArray(rows) && rows.length > 0;
}

async function assertAlumnoEnColegio(cid, alumnoId) {
  const rows = await query('SELECT id FROM alumnos WHERE id = ? AND colegio_id = ? LIMIT 1', [alumnoId, cid]);
  return rows.length > 0;
}

async function assertMatriculaAlumno(cid, matriculaId, alumnoId) {
  if (!matriculaId) return true;
  const rows = await query(
    'SELECT id FROM matriculas WHERE id = ? AND colegio_id = ? AND alumno_id = ? LIMIT 1',
    [matriculaId, cid, alumnoId]
  );
  return rows.length > 0;
}

/** Mensaje interno + notificación al docente referente cuando se registra una derivación. */
async function notificarDocenteDerivacion(req, { colegio_id, docentePersonalId, alumnoId, derivacionId }) {
  if (!docentePersonalId || !Number.isFinite(Number(docentePersonalId))) return;
  const destRows = await query(
    `SELECT u.id FROM usuarios u
     WHERE u.personal_id = ? AND u.colegio_id = ? AND u.estado = 'ACTIVO' AND u.tipo = 'DOCENTE' LIMIT 1`,
    [docentePersonalId, colegio_id]
  );
  if (!destRows.length) return;
  const destinatarioId = destRows[0].id;
  const remitenteId = req.user.usuario_id;
  if (!remitenteId) return;

  const [alRow] = await query(
    `SELECT TRIM(CONCAT(COALESCE(a.apellido_paterno,''),' ',COALESCE(a.apellido_materno,''),' ',COALESCE(a.nombres,''))) AS nombre
     FROM alumnos a WHERE a.id = ? AND a.colegio_id = ? LIMIT 1`,
    [alumnoId, colegio_id]
  );
  const nombreAl = (alRow && alRow.nombre) || `Alumno ${alumnoId}`;
  const asunto = 'Derivación psicológica registrada';
  const mensaje = `Psicología registró una derivación en la que usted figura como docente referente.\n\nEstudiante: ${nombreAl}\nPuede coordinar con el equipo de Psicología o revisar Mensajes.`;

  try {
    const dup = await notificacionMensajeDuplicadaReciente(query, {
      usuario_id: remitenteId,
      destinatario_id: destinatarioId,
      accion_tipo: 'PSICOLOGIA_DERIVACION',
      contenido: `der#${derivacionId}`,
      ventanaSegundos: 60,
    });
    if (!dup) {
      await insertNotificacionUsuario(execute, {
        para: 'USUARIO',
        usuario_id: remitenteId,
        destinatario_id: destinatarioId,
        asunto,
        contenido: mensaje,
        estado: 'NO ENVIADO',
        accion_tipo: 'PSICOLOGIA_DERIVACION',
        accion_payload: { derivacion_id: derivacionId, alumno_id: alumnoId },
        url_destino: '/docente/mensajes',
      });
    }
  } catch (nErr) {
    console.warn('[psicologia] notificación derivación:', nErr.message);
  }

  const fh = fechaHoraMySQLLima();
  try {
    await execute(
      `INSERT INTO mensajes (remitente_id, destinatario_id, asunto, mensaje, fecha_hora, estado, tipo, borrado, favorito)
       VALUES (?, ?, ?, ?, ?, 'NO_LEIDO', 'ENVIADO', 'NO', 'NO')`,
      [remitenteId, destinatarioId, asunto, mensaje, fh]
    );
    await execute(
      `INSERT INTO mensajes (remitente_id, destinatario_id, asunto, mensaje, fecha_hora, estado, tipo, borrado, favorito)
       VALUES (?, ?, ?, ?, ?, 'NO_LEIDO', 'RECIBIDO', 'NO', 'NO')`,
      [remitenteId, destinatarioId, asunto, mensaje, fh]
    );
  } catch (msgErr) {
    console.error('[psicologia] mensaje docente derivación:', msgErr.message);
  }
}

/** Derivaciones pendientes de atención (RECIBIDA), más recientes primero. */
router.get('/derivaciones/pendientes', async (req, res) => {
  try {
    const cid = colegioId(req);
    const lim = Math.min(parseInt(req.query.limit, 10) || 80, 200);
    const rows = await query(
      `SELECT d.id, d.created_at, d.urgencia, d.estado, d.alumno_id, d.matricula_id, d.descripcion_caso,
              TRIM(CONCAT(
                COALESCE(a.apellido_paterno,''), ' ',
                COALESCE(a.apellido_materno,''), ' ',
                COALESCE(a.nombres,''))) AS alumno_nombre,
              ${sqlNombrePersonal('p')} AS docente_nombre
       FROM psicologia_derivaciones d
       INNER JOIN alumnos a ON a.id = d.alumno_id AND a.colegio_id = d.colegio_id
       LEFT JOIN personal p ON p.id = d.docente_personal_id
       WHERE d.colegio_id = ? AND d.estado = 'RECIBIDA' AND d.psicologia_leida_en IS NULL
       ORDER BY d.id DESC
       LIMIT ?`,
      [cid, lim]
    );
    res.json({ derivaciones: rows || [] });
  } catch (e) {
    console.error('[admin/psicologia/derivaciones/pendientes]', e);
    res.status(500).json({ error: e.message || 'Error' });
  }
});

/** Marca derivación como vista por el equipo (deja de listarse en pendientes). */
router.post('/derivaciones/:id/marcar-leida', async (req, res) => {
  try {
    const cid = colegioId(req);
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'id inválido' });
    const r = await execute(
      `UPDATE psicologia_derivaciones SET psicologia_leida_en = NOW() WHERE id = ? AND colegio_id = ?`,
      [id, cid]
    );
    if (!r.affectedRows) return res.status(404).json({ error: 'No encontrado' });
    res.json({ ok: true });
  } catch (e) {
    console.error('[admin/psicologia/derivaciones/marcar-leida]', e);
    res.status(500).json({ error: e.message || 'Error' });
  }
});

/** Buscar grupo exacto y devolver id (o null si no existe / hay duplicado extraño). */
router.get('/grupo', async (req, res) => {
  try {
    const cid = colegioId(req);
    const anio = parseInt(req.query.anio, 10);
    const nivelId = parseInt(req.query.nivel_id, 10);
    const grado = parseInt(req.query.grado, 10);
    const seccion = String(req.query.seccion || '').trim();
    const turnoId = parseInt(req.query.turno_id, 10);
    const sedeIdRaw = req.query.sede_id;
    const sedeId = sedeIdRaw !== undefined && sedeIdRaw !== '' ? parseInt(sedeIdRaw, 10) : null;

    if (!Number.isFinite(anio) || !Number.isFinite(nivelId) || !Number.isFinite(grado) || !seccion || !Number.isFinite(turnoId)) {
      return res.status(400).json({ error: 'Parámetros incompletos: anio, nivel_id, grado, seccion, turno_id' });
    }

    let hasSede = false;
    try {
      hasSede = await columnExists('grupos', 'sede_id');
    } catch (eCol) {
      console.warn('[admin/psicologia/grupo] columnExists sede_id:', eCol.message);
    }
    let sql = `SELECT g.id FROM grupos g
      WHERE g.colegio_id = ? AND g.anio = ? AND g.nivel_id = ? AND g.grado = ?
        AND UPPER(TRIM(g.seccion)) = UPPER(?) AND g.turno_id = ?`;
    const params = [cid, anio, nivelId, grado, seccion, turnoId];
    if (hasSede && Number.isFinite(sedeId)) {
      sql += ' AND g.sede_id = ?';
      params.push(sedeId);
    }
    sql += ' LIMIT 3';
    const rows = await query(sql, params);
    if (!rows.length) {
      return res.json({ grupo: null, matriculas: [] });
    }
    if (rows.length > 1) {
      return res.status(409).json({ error: 'Hay más de un grupo que coincide. Refine sede o datos.' });
    }
    const grupoId = rows[0].id;
    const mats = await query(
      `SELECT m.id AS matricula_id, m.alumno_id, m.estado, m.grupo_id,
              TRIM(CONCAT(
                COALESCE(a.apellido_paterno,''), ' ',
                COALESCE(a.apellido_materno,''), ' ',
                COALESCE(a.nombres,'')
              )) AS nombre_completo,
              NULLIF(TRIM(a.foto), '') AS foto_alumno,
              NULLIF(TRIM(a.nro_documento), '') AS nro_documento,
              TRIM(CONCAT(
                COALESCE(n.nombre, ''),
                ' — ',
                COALESCE(g.grado, ''),
                ' — ',
                COALESCE(g.seccion, '')
              )) AS grupo_etiqueta
       FROM matriculas m
       INNER JOIN alumnos a ON a.id = m.alumno_id AND a.colegio_id = m.colegio_id
       INNER JOIN grupos g ON g.id = m.grupo_id AND g.colegio_id = m.colegio_id
       LEFT JOIN niveles n ON n.id = g.nivel_id
       WHERE m.colegio_id = ? AND m.grupo_id = ? AND (m.estado = 0 OR m.estado = 4)
       ORDER BY a.apellido_paterno ASC, a.apellido_materno ASC, a.nombres ASC`,
      [cid, grupoId]
    );
    res.json({ grupo: { id: grupoId }, matriculas: mats || [] });
  } catch (e) {
    console.error('[admin/psicologia/grupo]', e);
    res.status(500).json({ error: e.message || 'Error al buscar grupo' });
  }
});

/** Búsqueda por apellidos, nombres o DNI en matrículas del año (todo el colegio). */
router.get('/alumnos-buscar', async (req, res) => {
  try {
    const cid = colegioId(req);
    const anio = parseInt(req.query.anio, 10);
    let q = String(req.query.q || '')
      .trim()
      .replace(/[%_\\]/g, ' ')
      .replace(/\s+/g, ' ');
    if (!Number.isFinite(anio)) return res.status(400).json({ error: 'Indique un año escolar válido.' });
    if (q.length < 2) return res.status(400).json({ error: 'Escriba al menos 2 caracteres para buscar.' });
    const like = `%${q}%`;
    let mats;
    try {
      mats = await query(
        `SELECT m.id AS matricula_id, m.alumno_id, m.estado, m.grupo_id,
                TRIM(CONCAT(
                  COALESCE(a.apellido_paterno,''), ' ',
                  COALESCE(a.apellido_materno,''), ' ',
                  COALESCE(a.nombres,'')
                )) AS nombre_completo,
                NULLIF(TRIM(a.foto), '') AS foto_alumno,
                NULLIF(TRIM(a.nro_documento), '') AS nro_documento,
                TRIM(CONCAT(
                  COALESCE(n.nombre, ''),
                  ' — ',
                  COALESCE(g.grado, ''),
                  ' — ',
                  COALESCE(g.seccion, '')
                )) AS grupo_etiqueta
         FROM matriculas m
         INNER JOIN alumnos a ON a.id = m.alumno_id AND a.colegio_id = m.colegio_id
         INNER JOIN grupos g ON g.id = m.grupo_id AND g.colegio_id = m.colegio_id
         LEFT JOIN niveles n ON n.id = g.nivel_id
         WHERE m.colegio_id = ? AND g.anio = ? AND (m.estado = 0 OR m.estado = 4)
           AND (
             a.nro_documento LIKE ?
             OR CONCAT_WS(' ', a.apellido_paterno, a.apellido_materno, a.nombres) LIKE ?
           )
         ORDER BY a.apellido_paterno ASC, a.apellido_materno ASC, a.nombres ASC
         LIMIT 80`,
        [cid, anio, like, like]
      );
    } catch (eSql) {
      if (String(eSql.message || '').includes('nro_documento')) {
        mats = await query(
          `SELECT m.id AS matricula_id, m.alumno_id, m.estado, m.grupo_id,
                  TRIM(CONCAT(
                    COALESCE(a.apellido_paterno,''), ' ',
                    COALESCE(a.apellido_materno,''), ' ',
                    COALESCE(a.nombres,'')
                  )) AS nombre_completo,
                  NULLIF(TRIM(a.foto), '') AS foto_alumno,
                  NULL AS nro_documento,
                  TRIM(CONCAT(
                    COALESCE(n.nombre, ''),
                    ' — ',
                    COALESCE(g.grado, ''),
                    ' — ',
                    COALESCE(g.seccion, '')
                  )) AS grupo_etiqueta
           FROM matriculas m
           INNER JOIN alumnos a ON a.id = m.alumno_id AND a.colegio_id = m.colegio_id
           INNER JOIN grupos g ON g.id = m.grupo_id AND g.colegio_id = m.colegio_id
           LEFT JOIN niveles n ON n.id = g.nivel_id
           WHERE m.colegio_id = ? AND g.anio = ? AND (m.estado = 0 OR m.estado = 4)
             AND CONCAT_WS(' ', a.apellido_paterno, a.apellido_materno, a.nombres) LIKE ?
           ORDER BY a.apellido_paterno ASC, a.apellido_materno ASC, a.nombres ASC
           LIMIT 80`,
          [cid, anio, like]
        );
      } else {
        throw eSql;
      }
    }
    res.json({ matriculas: mats || [], por_texto: true });
  } catch (e) {
    console.error('[admin/psicologia/alumnos-buscar]', e);
    res.status(500).json({ error: e.message || 'Error al buscar alumnos' });
  }
});

/** Resumen de contadores + última actividad para cards del expediente. */
router.get('/alumnos/:alumnoId/resumen', async (req, res) => {
  try {
    const cid = colegioId(req);
    const alumnoId = parseInt(req.params.alumnoId, 10);
    if (!Number.isFinite(alumnoId)) return res.status(400).json({ error: 'alumno inválido' });
    if (!(await assertAlumnoEnColegio(cid, alumnoId))) return res.status(404).json({ error: 'Alumno no encontrado' });

    const [aRow] = await query(
      `SELECT a.id,
              TRIM(CONCAT(
                COALESCE(a.apellido_paterno,''), ' ',
                COALESCE(a.apellido_materno,''), ' ',
                COALESCE(a.nombres,'')
              )) AS nombre_completo,
              a.fecha_nacimiento
       FROM alumnos a WHERE a.id = ? AND a.colegio_id = ? LIMIT 1`,
      [alumnoId, cid]
    );

    const [atnRows, derRows, reuRows, piarRows] = await Promise.all([
      query(
        `SELECT COUNT(*) AS c FROM psicologia_atenciones WHERE colegio_id = ? AND alumno_id = ?`,
        [cid, alumnoId]
      ),
      query(
        `SELECT COUNT(*) AS c FROM psicologia_derivaciones WHERE colegio_id = ? AND alumno_id = ? AND estado != 'CERRADA'`,
        [cid, alumnoId]
      ),
      query(
        `SELECT COUNT(*) AS c FROM psicologia_reuniones_acta WHERE colegio_id = ? AND alumno_id = ? AND estado = 'BORRADOR'`,
        [cid, alumnoId]
      ),
      query(
        `SELECT COUNT(*) AS c FROM psicologia_piar WHERE colegio_id = ? AND alumno_id = ? AND estado = 'ACTIVO'`,
        [cid, alumnoId]
      ),
    ]);
    const atn = atnRows[0];
    const der = derRows[0];
    const reu = reuRows[0];
    const piar = piarRows[0];

    const ultima = await query(
      `SELECT tipo, id, cuando FROM (
         SELECT 'atencion' AS tipo, a.id, a.fecha_hora AS cuando
         FROM psicologia_atenciones a WHERE a.colegio_id = ? AND a.alumno_id = ?
         UNION ALL
         SELECT 'derivacion', d.id, d.created_at FROM psicologia_derivaciones d WHERE d.colegio_id = ? AND d.alumno_id = ?
         UNION ALL
         SELECT 'reunion', r.id, COALESCE(r.updated_at, r.created_at) FROM psicologia_reuniones_acta r WHERE r.colegio_id = ? AND r.alumno_id = ?
         UNION ALL
         SELECT 'piar', p.id, COALESCE(p.updated_at, p.created_at) FROM psicologia_piar p WHERE p.colegio_id = ? AND p.alumno_id = ?
       ) u ORDER BY u.cuando DESC LIMIT 5`,
      [cid, alumnoId, cid, alumnoId, cid, alumnoId, cid, alumnoId]
    ).catch(() => []);

    res.json({
      alumno: aRow || null,
      conteos: {
        atenciones: Number(atn?.c || 0),
        derivaciones_abiertas: Number(der?.c || 0),
        reuniones_borrador: Number(reu?.c || 0),
        piar_activos: Number(piar?.c || 0),
      },
      ultimas_lineas: ultima || [],
    });
  } catch (e) {
    console.error('[admin/psicologia/resumen]', e);
    if (String(e.message || '').includes("doesn't exist") || e.code === 'ER_NO_SUCH_TABLE') {
      return res.status(503).json({
        error: 'Módulo Psicología no instalado en la base de datos.',
        hint: 'Ejecute database/migrations/035_psicologia_modulo_mysql.sql',
      });
    }
    res.status(500).json({ error: e.message || 'Error' });
  }
});

/** Línea de tiempo unificada (últimos eventos). */
router.get('/alumnos/:alumnoId/timeline', async (req, res) => {
  try {
    const cid = colegioId(req);
    const alumnoId = parseInt(req.params.alumnoId, 10);
    if (!Number.isFinite(alumnoId)) return res.status(400).json({ error: 'alumno inválido' });
    if (!(await assertAlumnoEnColegio(cid, alumnoId))) return res.status(404).json({ error: 'Alumno no encontrado' });

    const lim = Math.min(parseInt(req.query.limit, 10) || 40, 100);
    const rows = await query(
      `SELECT tipo, id, cuando, subtipo, titulo, por_personal FROM (
         SELECT 'atencion' AS tipo, a.id, a.fecha_hora AS cuando, a.tipo AS subtipo,
                LEFT(a.motivo, 120) AS titulo,
                TRIM(CONCAT(COALESCE(p.apellidos,''), ' ', COALESCE(p.nombres,''))) AS por_personal
         FROM psicologia_atenciones a
         LEFT JOIN personal p ON p.id = a.registrado_por_personal_id
         WHERE a.colegio_id = ? AND a.alumno_id = ?
         UNION ALL
         SELECT 'derivacion', d.id, d.created_at, d.urgencia,
                CONCAT('Derivación ', d.estado),
                NULL
         FROM psicologia_derivaciones d
         WHERE d.colegio_id = ? AND d.alumno_id = ?
         UNION ALL
         SELECT 'reunion', r.id, COALESCE(r.updated_at, r.created_at), r.estado,
                'Acta reunión familias',
                NULL
         FROM psicologia_reuniones_acta r
         WHERE r.colegio_id = ? AND r.alumno_id = ?
         UNION ALL
         SELECT 'piar', p.id, COALESCE(p.updated_at, p.created_at), p.estado,
                CONCAT('PIAR v', p.numero_version, ' · ', p.anio),
                NULL
         FROM psicologia_piar p
         WHERE p.colegio_id = ? AND p.alumno_id = ?
       ) u
       ORDER BY u.cuando DESC
       LIMIT ${lim}`,
      [cid, alumnoId, cid, alumnoId, cid, alumnoId, cid, alumnoId]
    );
    res.json({ items: rows || [] });
  } catch (e) {
    console.error('[admin/psicologia/timeline]', e);
    if (String(e.message || '').includes("doesn't exist") || e.code === 'ER_NO_SUCH_TABLE') {
      return res.status(503).json({ error: 'Tablas de psicología no instaladas.', hint: '035_psicologia_modulo_mysql.sql' });
    }
    res.status(500).json({ error: e.message || 'Error' });
  }
});

// ——— Atenciones ———
router.get('/alumnos/:alumnoId/atenciones', async (req, res) => {
  try {
    const cid = colegioId(req);
    const alumnoId = parseInt(req.params.alumnoId, 10);
    const tipo = req.query.tipo ? String(req.query.tipo).toUpperCase() : null;
    if (!Number.isFinite(alumnoId) || !(await assertAlumnoEnColegio(cid, alumnoId))) {
      return res.status(404).json({ error: 'Alumno no encontrado' });
    }
    let sql = `SELECT a.*, TRIM(CONCAT(COALESCE(p.apellidos,''), ' ', COALESCE(p.nombres,''))) AS registrado_por_nombre
               FROM psicologia_atenciones a
               LEFT JOIN personal p ON p.id = a.registrado_por_personal_id
               WHERE a.colegio_id = ? AND a.alumno_id = ?`;
    const params = [cid, alumnoId];
    if (tipo && ['ALUMNO', 'FAMILIA', 'OTRO'].includes(tipo)) {
      sql += ' AND a.tipo = ?';
      params.push(tipo);
    }
    sql += ' ORDER BY a.fecha_hora DESC';
    const rows = await query(sql, params);
    res.json({ atenciones: rows || [] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || 'Error' });
  }
});

router.post('/alumnos/:alumnoId/atenciones', async (req, res) => {
  try {
    const cid = colegioId(req);
    const alumnoId = parseInt(req.params.alumnoId, 10);
    const b = req.body || {};
    const matriculaId = b.matricula_id != null ? parseInt(b.matricula_id, 10) : null;
    const tipo = String(b.tipo || 'ALUMNO').toUpperCase();
    if (!['ALUMNO', 'FAMILIA', 'OTRO'].includes(tipo)) return res.status(400).json({ error: 'tipo inválido' });
    if (!Number.isFinite(alumnoId) || !(await assertAlumnoEnColegio(cid, alumnoId))) {
      return res.status(404).json({ error: 'Alumno no encontrado' });
    }
    if (!(await assertMatriculaAlumno(cid, matriculaId, alumnoId))) {
      return res.status(400).json({ error: 'matricula_id no pertenece al alumno' });
    }
    const motivo = String(b.motivo || '').trim();
    const trat = String(b.tratamiento_intervencion || b.tratamiento || '').trim();
    if (!motivo || !trat) return res.status(400).json({ error: 'motivo y tratamiento_intervencion son obligatorios' });
    const fechaHora = b.fecha_hora ? String(b.fecha_hora) : null;
    const observaciones = b.observaciones != null ? String(b.observaciones) : null;
    const estado = b.estado === 'BORRADOR' ? 'BORRADOR' : 'REGISTRADO';
    const personalId = req.user.personal_id != null ? parseInt(req.user.personal_id, 10) : null;

    const r = await execute(
      `INSERT INTO psicologia_atenciones
        (colegio_id, alumno_id, matricula_id, tipo, fecha_hora, motivo, tratamiento_intervencion, observaciones, registrado_por_personal_id, estado)
       VALUES (?,?,?,?,COALESCE(?, NOW()),?,?,?,?,?)`,
      [
        cid,
        alumnoId,
        Number.isFinite(matriculaId) ? matriculaId : null,
        tipo,
        fechaHora,
        motivo,
        trat,
        observaciones,
        Number.isFinite(personalId) ? personalId : null,
        estado,
      ]
    );
    res.json({ id: r.insertId });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || 'Error' });
  }
});

router.put('/atenciones/:id', async (req, res) => {
  try {
    const cid = colegioId(req);
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'id inválido' });
    const [row] = await query(
      'SELECT id, alumno_id FROM psicologia_atenciones WHERE id = ? AND colegio_id = ? LIMIT 1',
      [id, cid]
    );
    if (!row) return res.status(404).json({ error: 'No encontrado' });
    const b = req.body || {};
    const sets = [];
    const params = [];
    if (b.motivo != null) {
      sets.push('motivo = ?');
      params.push(String(b.motivo));
    }
    if (b.tratamiento_intervencion != null || b.tratamiento != null) {
      sets.push('tratamiento_intervencion = ?');
      params.push(String(b.tratamiento_intervencion || b.tratamiento));
    }
    if (b.observaciones !== undefined) {
      sets.push('observaciones = ?');
      params.push(b.observaciones != null ? String(b.observaciones) : null);
    }
    if (b.tipo != null && ['ALUMNO', 'FAMILIA', 'OTRO'].includes(String(b.tipo).toUpperCase())) {
      sets.push('tipo = ?');
      params.push(String(b.tipo).toUpperCase());
    }
    if (b.fecha_hora != null) {
      sets.push('fecha_hora = ?');
      params.push(String(b.fecha_hora));
    }
    if (b.estado === 'BORRADOR' || b.estado === 'REGISTRADO') {
      sets.push('estado = ?');
      params.push(b.estado);
    }
    if (!sets.length) return res.status(400).json({ error: 'Nada que actualizar' });
    params.push(id, cid);
    await execute(`UPDATE psicologia_atenciones SET ${sets.join(', ')} WHERE id = ? AND colegio_id = ?`, params);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || 'Error' });
  }
});

router.delete('/atenciones/:id', async (req, res) => {
  try {
    const cid = colegioId(req);
    const id = parseInt(req.params.id, 10);
    const r = await execute('DELETE FROM psicologia_atenciones WHERE id = ? AND colegio_id = ?', [id, cid]);
    if (!r.affectedRows) return res.status(404).json({ error: 'No encontrado' });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || 'Error' });
  }
});

// ——— Derivaciones ———
router.get('/alumnos/:alumnoId/derivaciones', async (req, res) => {
  try {
    const cid = colegioId(req);
    const alumnoId = parseInt(req.params.alumnoId, 10);
    if (!Number.isFinite(alumnoId) || !(await assertAlumnoEnColegio(cid, alumnoId))) {
      return res.status(404).json({ error: 'Alumno no encontrado' });
    }
    const rows = await query(
      `SELECT d.*, ${sqlNombrePersonal('pd')} AS docente_nombre
       FROM psicologia_derivaciones d
       LEFT JOIN personal pd ON pd.id = d.docente_personal_id
       WHERE d.colegio_id = ? AND d.alumno_id = ?
       ORDER BY d.id DESC`,
      [cid, alumnoId]
    );
    res.json({ derivaciones: rows || [] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || 'Error' });
  }
});

router.post('/alumnos/:alumnoId/derivaciones', async (req, res) => {
  try {
    const cid = colegioId(req);
    const alumnoId = parseInt(req.params.alumnoId, 10);
    const b = req.body || {};
    if (!Number.isFinite(alumnoId) || !(await assertAlumnoEnColegio(cid, alumnoId))) {
      return res.status(404).json({ error: 'Alumno no encontrado' });
    }
    const matriculaId = b.matricula_id != null ? parseInt(b.matricula_id, 10) : null;
    if (!(await assertMatriculaAlumno(cid, matriculaId, alumnoId))) {
      return res.status(400).json({ error: 'matricula_id inválida' });
    }
    const descripcion = String(b.descripcion_caso || '').trim();
    if (!descripcion) return res.status(400).json({ error: 'descripcion_caso es obligatoria' });
    const motivosJson = JSON.stringify(Array.isArray(b.motivos_json) ? b.motivos_json : []);
    const docentePersonalId = b.docente_personal_id != null ? parseInt(b.docente_personal_id, 10) : null;
    const urgencia = ['ALTA', 'MEDIA', 'BAJA'].includes(String(b.urgencia || '').toUpperCase())
      ? String(b.urgencia).toUpperCase()
      : 'MEDIA';
    const uid = req.user.usuario_id != null ? parseInt(req.user.usuario_id, 10) : null;
    const derEstados = ['RECIBIDA', 'EN_EVALUACION', 'CERRADA', 'DERIVADA_EXTERNA'];
    const estadoDer = derEstados.includes(String(b.estado || '').toUpperCase()) ? String(b.estado).toUpperCase() : 'RECIBIDA';

    let recepPid = b.recepcion_psicologia_personal_id != null ? parseInt(b.recepcion_psicologia_personal_id, 10) : null;
    if (!Number.isFinite(recepPid) && req.user.personal_id != null) {
      recepPid = parseInt(req.user.personal_id, 10);
    }
    const recepFecha = Number.isFinite(recepPid) ? (b.recepcion_psicologia_fecha || fechaHoraMySQLLima()) : null;

    const r = await execute(
      `INSERT INTO psicologia_derivaciones
        (colegio_id, alumno_id, matricula_id, docente_personal_id, motivos_json, motivo_otro, descripcion_caso, estrategias_aula, urgencia, observaciones, estado,
         firma_docente_imagen, firma_docente_fecha, recepcion_psicologia_personal_id, recepcion_psicologia_fecha, creado_por_usuario_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        cid,
        alumnoId,
        Number.isFinite(matriculaId) ? matriculaId : null,
        Number.isFinite(docentePersonalId) ? docentePersonalId : null,
        motivosJson,
        b.motivo_otro != null ? String(b.motivo_otro).slice(0, 500) : null,
        descripcion,
        b.estrategias_aula != null ? String(b.estrategias_aula) : null,
        urgencia,
        b.observaciones != null ? String(b.observaciones) : null,
        estadoDer,
        b.firma_docente_imagen != null ? String(b.firma_docente_imagen) : null,
        b.firma_docente_fecha || null,
        Number.isFinite(recepPid) ? recepPid : null,
        recepFecha,
        Number.isFinite(uid) ? uid : null,
      ]
    );

    try {
      await notificarDocenteDerivacion(req, {
        colegio_id: cid,
        docentePersonalId: Number.isFinite(docentePersonalId) ? docentePersonalId : null,
        alumnoId,
        derivacionId: r.insertId,
      });
    } catch (nErr) {
      console.warn('[psicologia] notificación derivación omitida:', nErr.message);
    }

    res.json({ id: r.insertId });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || 'Error' });
  }
});

router.put('/derivaciones/:id', async (req, res) => {
  try {
    const cid = colegioId(req);
    const id = parseInt(req.params.id, 10);
    const [row] = await query('SELECT id FROM psicologia_derivaciones WHERE id = ? AND colegio_id = ? LIMIT 1', [id, cid]);
    if (!row) return res.status(404).json({ error: 'No encontrado' });
    const b = req.body || {};
    const sets = [];
    const params = [];
    const map = [
      ['estado', 'estado'],
      ['descripcion_caso', 'descripcion_caso'],
      ['estrategias_aula', 'estrategias_aula'],
      ['observaciones', 'observaciones'],
      ['motivo_otro', 'motivo_otro'],
      ['firma_docente_imagen', 'firma_docente_imagen'],
      ['firma_docente_fecha', 'firma_docente_fecha'],
      ['recepcion_psicologia_personal_id', 'recepcion_psicologia_personal_id'],
      ['recepcion_psicologia_fecha', 'recepcion_psicologia_fecha'],
    ];
    for (const [k, col] of map) {
      if (b[k] !== undefined) {
        sets.push(`${col} = ?`);
        params.push(b[k]);
      }
    }
    if (b.motivos_json !== undefined) {
      sets.push('motivos_json = ?');
      params.push(JSON.stringify(Array.isArray(b.motivos_json) ? b.motivos_json : []));
    }
    if (b.docente_personal_id !== undefined) {
      sets.push('docente_personal_id = ?');
      params.push(b.docente_personal_id != null ? parseInt(b.docente_personal_id, 10) : null);
    }
    if (b.urgencia != null && ['ALTA', 'MEDIA', 'BAJA'].includes(String(b.urgencia).toUpperCase())) {
      sets.push('urgencia = ?');
      params.push(String(b.urgencia).toUpperCase());
    }
    if (!sets.length) return res.status(400).json({ error: 'Nada que actualizar' });
    params.push(id, cid);
    await execute(`UPDATE psicologia_derivaciones SET ${sets.join(', ')} WHERE id = ? AND colegio_id = ?`, params);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || 'Error' });
  }
});

router.delete('/derivaciones/:id', async (req, res) => {
  try {
    const cid = colegioId(req);
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'id inválido' });
    const r = await execute('DELETE FROM psicologia_derivaciones WHERE id = ? AND colegio_id = ?', [id, cid]);
    if (!r.affectedRows) return res.status(404).json({ error: 'No encontrado' });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || 'Error' });
  }
});

// ——— Reuniones / acta ———
router.get('/alumnos/:alumnoId/reuniones', async (req, res) => {
  try {
    const cid = colegioId(req);
    const alumnoId = parseInt(req.params.alumnoId, 10);
    if (!Number.isFinite(alumnoId) || !(await assertAlumnoEnColegio(cid, alumnoId))) {
      return res.status(404).json({ error: 'Alumno no encontrado' });
    }
    const rows = await query(
      `SELECT r.*, ${sqlNombrePersonal('p')} AS facilitador_nombre
       FROM psicologia_reuniones_acta r
       LEFT JOIN personal p ON p.id = r.facilitador_personal_id
       WHERE r.colegio_id = ? AND r.alumno_id = ?
       ORDER BY r.id DESC`,
      [cid, alumnoId]
    );
    res.json({ reuniones: rows || [] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || 'Error' });
  }
});

router.post('/alumnos/:alumnoId/reuniones', async (req, res) => {
  try {
    const cid = colegioId(req);
    const alumnoId = parseInt(req.params.alumnoId, 10);
    const b = req.body || {};
    if (!Number.isFinite(alumnoId) || !(await assertAlumnoEnColegio(cid, alumnoId))) {
      return res.status(404).json({ error: 'Alumno no encontrado' });
    }
    const matriculaId = b.matricula_id != null ? parseInt(b.matricula_id, 10) : null;
    if (!(await assertMatriculaAlumno(cid, matriculaId, alumnoId))) {
      return res.status(400).json({ error: 'matricula_id inválida' });
    }
    const facId = req.user.personal_id != null ? parseInt(req.user.personal_id, 10) : null;
    const r = await execute(
      `INSERT INTO psicologia_reuniones_acta
        (colegio_id, alumno_id, matricula_id, fecha_reunion, participantes, temas_tratados, acuerdos, compromisos_familia, compromisos_colegio, estado, facilitador_personal_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [
        cid,
        alumnoId,
        Number.isFinite(matriculaId) ? matriculaId : null,
        b.fecha_reunion || null,
        b.participantes != null ? String(b.participantes) : null,
        b.temas_tratados != null ? String(b.temas_tratados) : null,
        b.acuerdos != null ? String(b.acuerdos) : null,
        b.compromisos_familia != null ? String(b.compromisos_familia) : null,
        b.compromisos_colegio != null ? String(b.compromisos_colegio) : null,
        b.estado === 'CERRADA' ? 'CERRADA' : 'BORRADOR',
        Number.isFinite(facId) ? facId : null,
      ]
    );
    res.json({ id: r.insertId });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || 'Error' });
  }
});

router.put('/reuniones/:id', async (req, res) => {
  try {
    const cid = colegioId(req);
    const id = parseInt(req.params.id, 10);
    const [row] = await query('SELECT id FROM psicologia_reuniones_acta WHERE id = ? AND colegio_id = ? LIMIT 1', [id, cid]);
    if (!row) return res.status(404).json({ error: 'No encontrado' });
    const b = req.body || {};
    const sets = [];
    const params = [];
    const textFields = [
      'participantes',
      'temas_tratados',
      'acuerdos',
      'compromisos_familia',
      'compromisos_colegio',
      'firma_padre_imagen',
      'firma_psicologia_imagen',
      'firma_docente_imagen',
    ];
    for (const f of textFields) {
      if (b[f] !== undefined) {
        sets.push(`${f} = ?`);
        params.push(b[f]);
      }
    }
    if (b.fecha_reunion !== undefined) {
      sets.push('fecha_reunion = ?');
      params.push(b.fecha_reunion || null);
    }
    if (b.estado === 'BORRADOR' || b.estado === 'CERRADA') {
      sets.push('estado = ?');
      params.push(b.estado);
    }
    if (b.firma_padre_fecha !== undefined) {
      sets.push('firma_padre_fecha = ?');
      params.push(b.firma_padre_fecha || null);
    }
    if (b.firma_psicologia_fecha !== undefined) {
      sets.push('firma_psicologia_fecha = ?');
      params.push(b.firma_psicologia_fecha || null);
    }
    if (b.firma_docente_fecha !== undefined) {
      sets.push('firma_docente_fecha = ?');
      params.push(b.firma_docente_fecha || null);
    }
    if (b.facilitador_personal_id !== undefined) {
      sets.push('facilitador_personal_id = ?');
      params.push(b.facilitador_personal_id != null ? parseInt(b.facilitador_personal_id, 10) : null);
    }
    if (!sets.length) return res.status(400).json({ error: 'Nada que actualizar' });
    params.push(id, cid);
    await execute(`UPDATE psicologia_reuniones_acta SET ${sets.join(', ')} WHERE id = ? AND colegio_id = ?`, params);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || 'Error' });
  }
});

router.delete('/reuniones/:id', async (req, res) => {
  try {
    const cid = colegioId(req);
    const id = parseInt(req.params.id, 10);
    const r = await execute('DELETE FROM psicologia_reuniones_acta WHERE id = ? AND colegio_id = ?', [id, cid]);
    if (!r.affectedRows) return res.status(404).json({ error: 'No encontrado' });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || 'Error' });
  }
});

// ——— PIAR ———
router.get('/alumnos/:alumnoId/piar', async (req, res) => {
  try {
    const cid = colegioId(req);
    const alumnoId = parseInt(req.params.alumnoId, 10);
    if (!Number.isFinite(alumnoId) || !(await assertAlumnoEnColegio(cid, alumnoId))) {
      return res.status(404).json({ error: 'Alumno no encontrado' });
    }
    const rows = await query(
      `SELECT * FROM psicologia_piar WHERE colegio_id = ? AND alumno_id = ? ORDER BY anio DESC, numero_version DESC`,
      [cid, alumnoId]
    );
    res.json({ piar_lista: rows || [] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || 'Error' });
  }
});

router.post('/alumnos/:alumnoId/piar', async (req, res) => {
  try {
    const cid = colegioId(req);
    const alumnoId = parseInt(req.params.alumnoId, 10);
    const b = req.body || {};
    if (!Number.isFinite(alumnoId) || !(await assertAlumnoEnColegio(cid, alumnoId))) {
      return res.status(404).json({ error: 'Alumno no encontrado' });
    }
    const anio = parseInt(b.anio, 10);
    if (!Number.isFinite(anio)) return res.status(400).json({ error: 'anio es obligatorio' });
    const matriculaId = b.matricula_id != null ? parseInt(b.matricula_id, 10) : null;
    if (!(await assertMatriculaAlumno(cid, matriculaId, alumnoId))) {
      return res.status(400).json({ error: 'matricula_id inválida' });
    }
    const verRows = await query(
      'SELECT COALESCE(MAX(numero_version),0)+1 AS nv FROM psicologia_piar WHERE colegio_id = ? AND alumno_id = ? AND anio = ?',
      [cid, alumnoId, anio]
    );
    const nv = Number(verRows[0]?.nv || 1);
    const personalId = req.user.personal_id != null ? parseInt(req.user.personal_id, 10) : null;

    const estado = b.estado === 'ACTIVO' || b.estado === 'ARCHIVADO' ? b.estado : 'BORRADOR';
    const ins = await execute(
      `INSERT INTO psicologia_piar
        (colegio_id, alumno_id, matricula_id, anio, numero_version, estado, fecha_elaboracion,
         docente_responsable_personal_id, coordinador_personal_id,
         diagnostico, fortalezas, areas_dificultad, estilo_aprendizaje, observaciones_relevantes,
         ajustes_checklist_json, objetivos_json, estrategias_docentes, frecuencia_aplicacion, evaluacion_kpi_json,
         fecha_revision, avances_observados, ajustes_necesarios_revision, creado_por_personal_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        cid,
        alumnoId,
        Number.isFinite(matriculaId) ? matriculaId : null,
        anio,
        nv,
        estado,
        b.fecha_elaboracion || null,
        b.docente_responsable_personal_id != null ? parseInt(b.docente_responsable_personal_id, 10) : null,
        b.coordinador_personal_id != null ? parseInt(b.coordinador_personal_id, 10) : null,
        b.diagnostico != null ? String(b.diagnostico) : null,
        b.fortalezas != null ? String(b.fortalezas) : null,
        b.areas_dificultad != null ? String(b.areas_dificultad) : null,
        b.estilo_aprendizaje != null ? String(b.estilo_aprendizaje).slice(0, 255) : null,
        b.observaciones_relevantes != null ? String(b.observaciones_relevantes) : null,
        JSON.stringify(b.ajustes_checklist_json != null ? b.ajustes_checklist_json : {}),
        JSON.stringify(Array.isArray(b.objetivos_json) ? b.objetivos_json : []),
        b.estrategias_docentes != null ? String(b.estrategias_docentes) : null,
        b.frecuencia_aplicacion != null ? String(b.frecuencia_aplicacion) : null,
        JSON.stringify(b.evaluacion_kpi_json != null ? b.evaluacion_kpi_json : {}),
        b.fecha_revision || null,
        b.avances_observados != null ? String(b.avances_observados) : null,
        b.ajustes_necesarios_revision != null ? String(b.ajustes_necesarios_revision) : null,
        Number.isFinite(personalId) ? personalId : null,
      ]
    );

    if (estado === 'ACTIVO') {
      await execute(
        `UPDATE psicologia_piar SET estado = 'ARCHIVADO'
         WHERE colegio_id = ? AND alumno_id = ? AND anio = ? AND id != ? AND estado = 'ACTIVO'`,
        [cid, alumnoId, anio, ins.insertId]
      );
    }

    res.json({ id: ins.insertId, numero_version: nv });
  } catch (e) {
    console.error(e);
    if (e.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Versión duplicada; recargue e intente de nuevo.' });
    }
    res.status(500).json({ error: e.message || 'Error' });
  }
});

router.put('/piar/:id', async (req, res) => {
  try {
    const cid = colegioId(req);
    const id = parseInt(req.params.id, 10);
    const [row] = await query('SELECT id, alumno_id, anio FROM psicologia_piar WHERE id = ? AND colegio_id = ? LIMIT 1', [id, cid]);
    if (!row) return res.status(404).json({ error: 'No encontrado' });
    const b = req.body || {};
    const sets = [];
    const params = [];

    const texts = [
      'diagnostico',
      'fortalezas',
      'areas_dificultad',
      'estilo_aprendizaje',
      'observaciones_relevantes',
      'estrategias_docentes',
      'frecuencia_aplicacion',
      'avances_observados',
      'ajustes_necesarios_revision',
      'firma_docente_imagen',
      'firma_coordinador_imagen',
      'firma_padre_imagen',
    ];
    for (const f of texts) {
      if (b[f] !== undefined) {
        sets.push(`${f} = ?`);
        params.push(b[f]);
      }
    }
    if (b.fecha_elaboracion !== undefined) {
      sets.push('fecha_elaboracion = ?');
      params.push(b.fecha_elaboracion || null);
    }
    if (b.fecha_revision !== undefined) {
      sets.push('fecha_revision = ?');
      params.push(b.fecha_revision || null);
    }
    if (b.docente_responsable_personal_id !== undefined) {
      sets.push('docente_responsable_personal_id = ?');
      params.push(b.docente_responsable_personal_id != null ? parseInt(b.docente_responsable_personal_id, 10) : null);
    }
    if (b.coordinador_personal_id !== undefined) {
      sets.push('coordinador_personal_id = ?');
      params.push(b.coordinador_personal_id != null ? parseInt(b.coordinador_personal_id, 10) : null);
    }
    if (b.ajustes_checklist_json !== undefined) {
      sets.push('ajustes_checklist_json = ?');
      params.push(JSON.stringify(b.ajustes_checklist_json != null ? b.ajustes_checklist_json : {}));
    }
    if (b.objetivos_json !== undefined) {
      sets.push('objetivos_json = ?');
      params.push(JSON.stringify(Array.isArray(b.objetivos_json) ? b.objetivos_json : []));
    }
    if (b.evaluacion_kpi_json !== undefined) {
      sets.push('evaluacion_kpi_json = ?');
      params.push(JSON.stringify(b.evaluacion_kpi_json != null ? b.evaluacion_kpi_json : {}));
    }
    if (b.estado === 'BORRADOR' || b.estado === 'ACTIVO' || b.estado === 'ARCHIVADO') {
      sets.push('estado = ?');
      params.push(b.estado);
    }
    const fechaFirma = ['firma_docente_fecha', 'firma_coordinador_fecha', 'firma_padre_fecha'];
    for (const f of fechaFirma) {
      if (b[f] !== undefined) {
        sets.push(`${f} = ?`);
        params.push(b[f] || null);
      }
    }
    if (!sets.length) return res.status(400).json({ error: 'Nada que actualizar' });
    params.push(id, cid);
    await execute(`UPDATE psicologia_piar SET ${sets.join(', ')} WHERE id = ? AND colegio_id = ?`, params);

    if (b.estado === 'ACTIVO') {
      await execute(
        `UPDATE psicologia_piar SET estado = 'ARCHIVADO'
         WHERE colegio_id = ? AND alumno_id = ? AND anio = ? AND id != ? AND estado = 'ACTIVO'`,
        [cid, row.alumno_id, row.anio, id]
      );
    }

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || 'Error' });
  }
});

router.delete('/piar/:id', async (req, res) => {
  try {
    const cid = colegioId(req);
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'id inválido' });
    const [row] = await query('SELECT id, estado FROM psicologia_piar WHERE id = ? AND colegio_id = ? LIMIT 1', [id, cid]);
    if (!row) return res.status(404).json({ error: 'No encontrado' });
    if (String(row.estado) !== 'BORRADOR') {
      return res.status(409).json({ error: 'Solo se pueden eliminar PIAR en estado BORRADOR.' });
    }
    const r = await execute('DELETE FROM psicologia_piar WHERE id = ? AND colegio_id = ?', [id, cid]);
    if (!r.affectedRows) return res.status(404).json({ error: 'No encontrado' });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || 'Error' });
  }
});

/** Entradas de seguimiento del PIAR (cronológico). */
router.get('/piar/:id/seguimiento', async (req, res) => {
  try {
    const cid = colegioId(req);
    const piarId = parseInt(req.params.id, 10);
    if (!Number.isFinite(piarId)) return res.status(400).json({ error: 'id inválido' });
    const [p] = await query('SELECT id FROM psicologia_piar WHERE id = ? AND colegio_id = ? LIMIT 1', [piarId, cid]);
    if (!p) return res.status(404).json({ error: 'No encontrado' });
    const rows = await query(
      `SELECT s.id, s.autor_tipo, s.contenido, s.created_at, s.creado_por_usuario_id
       FROM psicologia_piar_seguimiento s
       WHERE s.colegio_id = ? AND s.piar_id = ?
       ORDER BY s.id ASC`,
      [cid, piarId]
    );
    res.json({ items: rows || [] });
  } catch (e) {
    console.error('[admin/psicologia/piar/seguimiento GET]', e);
    res.status(500).json({ error: e.message || 'Error' });
  }
});

router.post('/piar/:id/seguimiento', async (req, res) => {
  try {
    const cid = colegioId(req);
    const uid = req.user.usuario_id != null ? parseInt(req.user.usuario_id, 10) : null;
    const piarId = parseInt(req.params.id, 10);
    const contenido = String((req.body || {}).contenido || '').trim();
    if (!Number.isFinite(piarId)) return res.status(400).json({ error: 'id inválido' });
    if (!contenido) return res.status(400).json({ error: 'contenido es obligatorio' });
    const [p] = await query('SELECT id FROM psicologia_piar WHERE id = ? AND colegio_id = ? LIMIT 1', [piarId, cid]);
    if (!p) return res.status(404).json({ error: 'No encontrado' });
    await execute(
      `INSERT INTO psicologia_piar_seguimiento (colegio_id, piar_id, autor_tipo, creado_por_usuario_id, contenido)
       VALUES (?,?,?,?,?)`,
      [cid, piarId, 'PSICOLOGIA', Number.isFinite(uid) ? uid : null, contenido.slice(0, 8000)]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error('[admin/psicologia/piar/seguimiento POST]', e);
    res.status(500).json({ error: e.message || 'Error' });
  }
});

function parseJsonSafe(v, fallback) {
  if (v == null) return fallback;
  if (typeof v === 'object') return v;
  try {
    return JSON.parse(String(v));
  } catch {
    return fallback;
  }
}

/** Inserta imagen base64 (data URL) en PDFKit; devuelve false si no hay imagen válida. */
function tryPdfImageFromDataUrl(doc, dataUrl, maxW = 220, maxH = 100) {
  if (!dataUrl || typeof dataUrl !== 'string') return false;
  const m = dataUrl.match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/i);
  if (!m) return false;
  try {
    const buf = Buffer.from(m[2], 'base64');
    doc.image(buf, { fit: [maxW, maxH] });
    return true;
  } catch (imgErr) {
    console.warn('[psicologia pdf] firma imagen:', imgErr.message);
    return false;
  }
}

/** PDF — Acta de reunión (texto; firmas digitalizadas en intranet). */
router.get('/reuniones/:id/pdf', async (req, res) => {
  try {
    const cid = colegioId(req);
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'id inválido' });
    const rows = await query(
      `SELECT r.*, TRIM(CONCAT(COALESCE(a.apellido_paterno,''),' ',COALESCE(a.apellido_materno,''),' ',COALESCE(a.nombres,''))) AS alumno_nombre
       FROM psicologia_reuniones_acta r
       INNER JOIN alumnos a ON a.id = r.alumno_id AND a.colegio_id = r.colegio_id
       WHERE r.id = ? AND r.colegio_id = ? LIMIT 1`,
      [id, cid]
    );
    if (!rows.length) return res.status(404).json({ error: 'No encontrado' });
    const r = rows[0];
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Acta_reunion_psicologia_${id}.pdf"`);
    doc.pipe(res);
    doc.fontSize(15).font('Helvetica-Bold').text('ACTA DE REUNIÓN CON PADRES / FAMILIA', { align: 'center' });
    doc.moveDown(0.6);
    doc.fontSize(10).font('Helvetica');
    doc.text(`Alumno/a: ${r.alumno_nombre || '—'}`);
    const refReu =
      r.fecha_reunion != null && String(r.fecha_reunion).trim() !== ''
        ? r.fecha_reunion
        : r.updated_at || r.created_at;
    const fechaReuTxt = refReu ? fechaHoraTextoLima(refReu) : '—';
    doc.text(`Fecha y hora reunión (Lima): ${fechaReuTxt}`);
    doc.text(`Estado documento: ${r.estado || '—'}`);
    doc.moveDown();
    const bloques = [
      ['Participantes', r.participantes],
      ['Temas tratados', r.temas_tratados],
      ['Acuerdos', r.acuerdos],
      ['Compromisos de la familia', r.compromisos_familia],
      ['Compromisos del colegio', r.compromisos_colegio],
    ];
    for (const [tit, txt] of bloques) {
      doc.font('Helvetica-Bold').text(`${tit}`, { underline: true });
      doc.font('Helvetica').text(String(txt && String(txt).trim() ? txt : '—'), { align: 'left' });
      doc.moveDown(0.4);
    }
    doc.moveDown(0.5);
    doc.fontSize(11).fillColor('#000').font('Helvetica-Bold').text('Firmas (registradas en intranet)', { underline: true });
    doc.moveDown(0.35);
    doc.fontSize(9).font('Helvetica');
    const firmasPdf = [
      ['Familia / apoderado', r.firma_padre_imagen],
      ['Psicología', r.firma_psicologia_imagen],
      ['Docente', r.firma_docente_imagen],
    ];
    for (const [etiq, img] of firmasPdf) {
      doc.fillColor('#000').font('Helvetica-Bold').text(`${etiq}`);
      doc.font('Helvetica').fillColor('#333');
      if (!tryPdfImageFromDataUrl(doc, img)) {
        doc.text('(Sin firma digital en este documento)');
      }
      doc.moveDown(0.5);
    }
    doc.moveDown(0.2);
    doc.fontSize(8).fillColor('#555').font('Helvetica').text(
      'Documento generado desde VanguardNet. Las firmas arriba corresponden a las capturadas en el expediente electrónico.',
      { align: 'left' }
    );
    doc.end();
  } catch (e) {
    console.error('[psicologia pdf reunion]', e);
    if (!res.headersSent) res.status(500).json({ error: e.message || 'Error' });
  }
});

/** PDF — PIAR (resumen institucional). */
router.get('/piar/:id/pdf', async (req, res) => {
  try {
    const cid = colegioId(req);
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'id inválido' });
    const rows = await query(
      `SELECT p.*, TRIM(CONCAT(COALESCE(a.apellido_paterno,''),' ',COALESCE(a.apellido_materno,''),' ',COALESCE(a.nombres,''))) AS alumno_nombre,
        ${sqlNombrePersonal('pd')} AS docente_responsable_nombre,
        ${sqlNombrePersonal('pc')} AS coordinador_nombre,
        ${sqlNombrePersonal('pp')} AS elaborado_por_nombre,
        (SELECT TRIM(CONCAT(COALESCE(nv.nombre,''), ' — ', COALESCE(gv.grado,''), ' — ', COALESCE(gv.seccion,'')))
         FROM matriculas mv
         INNER JOIN grupos gv ON gv.id = mv.grupo_id AND gv.colegio_id = mv.colegio_id AND gv.anio = p.anio
         LEFT JOIN niveles nv ON nv.id = gv.nivel_id
         WHERE mv.alumno_id = p.alumno_id AND mv.colegio_id = p.colegio_id AND (mv.estado = 0 OR mv.estado = 4)
         ORDER BY mv.id DESC LIMIT 1) AS grupo_aula_etiqueta
       FROM psicologia_piar p
       INNER JOIN alumnos a ON a.id = p.alumno_id AND a.colegio_id = p.colegio_id
       LEFT JOIN personal pd ON pd.id = p.docente_responsable_personal_id
       LEFT JOIN personal pc ON pc.id = p.coordinador_personal_id
       LEFT JOIN personal pp ON pp.id = p.creado_por_personal_id
       WHERE p.id = ? AND p.colegio_id = ? LIMIT 1`,
      [id, cid]
    );
    if (!rows.length) return res.status(404).json({ error: 'No encontrado' });
    const p = rows[0];
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="PIAR_${p.anio}_v${p.numero_version}_${id}.pdf"`);
    doc.pipe(res);
    doc.fontSize(14).font('Helvetica-Bold').text('PLAN INDIVIDUAL DE AJUSTES RAZONABLES (PIAR)', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica');
    doc.text(`Estudiante: ${p.alumno_nombre || '—'}`);
    doc.text(`Año: ${p.anio} · Versión: ${p.numero_version} · Estado: ${p.estado || '—'}`);
    doc.text(`Fecha elaboración (Lima): ${fechaTextoLima(p.fecha_elaboracion)}`);
    doc.text(
      `Nivel — grado — sección (año PIAR): ${p.grupo_aula_etiqueta && String(p.grupo_aula_etiqueta).trim() ? p.grupo_aula_etiqueta : '—'}`
    );
    doc.moveDown(0.25);
    doc.font('Helvetica-Bold').text('Responsables', { underline: true });
    doc.font('Helvetica');
    doc.text(`Elaboración (psicología / registro): ${String(p.elaborado_por_nombre || '').trim() || '—'}`);
    doc.text(`Docente responsable (seguimiento en aula): ${String(p.docente_responsable_nombre || '').trim() || '—'}`);
    doc.text(`Coordinador PIAR: ${String(p.coordinador_nombre || '').trim() || '—'}`);
    doc.moveDown();
    const narr = [
      ['Diagnóstico (si aplica)', p.diagnostico],
      ['Fortalezas', p.fortalezas],
      ['Áreas de dificultad', p.areas_dificultad],
      ['Estilo de aprendizaje', p.estilo_aprendizaje],
      ['Observaciones', p.observaciones_relevantes],
      ['Estrategias docentes', p.estrategias_docentes],
      ['Frecuencia de aplicación', p.frecuencia_aplicacion],
      ['Fecha de revisión (Lima)', fechaTextoLima(p.fecha_revision)],
      ['Avances observados', p.avances_observados],
      ['Ajustes tras revisión', p.ajustes_necesarios_revision],
    ];
    for (const [tit, txt] of narr) {
      doc.font('Helvetica-Bold').text(`${tit}`, { underline: true });
      doc.font('Helvetica').text(String(txt && String(txt).trim() ? txt : '—'));
      doc.moveDown(0.35);
    }
    const adj = parseJsonSafe(p.ajustes_checklist_json, {});
    doc.font('Helvetica-Bold').text('Ajustes razonables (checklist)', { underline: true });
    doc.font('Helvetica');
    Object.keys(adj).forEach((k) => {
      const arr = Array.isArray(adj[k]) ? adj[k] : [];
      doc.text(`· ${k}: ${arr.length ? arr.join(', ') : '—'}`);
    });
    doc.moveDown(0.3);
    const objs = parseJsonSafe(p.objetivos_json, []);
    doc.font('Helvetica-Bold').text('Objetivos', { underline: true });
    doc.font('Helvetica');
    if (Array.isArray(objs) && objs.length) {
      objs.forEach((o, i) => {
        doc.text(`${i + 1}. ${o.objetivo || '—'} — Indicador: ${o.indicador || '—'}`);
      });
    } else {
      doc.text('—');
    }
    doc.moveDown(0.4);
    let segRows = [];
    try {
      segRows = await query(
        `SELECT s.autor_tipo, s.contenido, s.created_at
         FROM psicologia_piar_seguimiento s
         WHERE s.colegio_id = ? AND s.piar_id = ?
         ORDER BY s.id ASC`,
        [cid, id]
      );
    } catch (segErr) {
      console.warn('[psicologia pdf piar] seguimiento:', segErr.message);
    }
    doc.fontSize(11).fillColor('#000').font('Helvetica-Bold').text('Bitácora de seguimiento', { underline: true });
    doc.font('Helvetica').fontSize(10);
    if (segRows && segRows.length) {
      segRows.forEach((s) => {
        const rol = String(s.autor_tipo || '') === 'DOCENTE' ? 'Docente' : 'Psicología / administración';
        doc.font('Helvetica-Bold').fontSize(9).text(`${rol} · ${fechaHoraTextoLima(s.created_at)}`);
        doc.font('Helvetica').fontSize(10).text(String(s.contenido && String(s.contenido).trim() ? s.contenido : '—'));
        doc.moveDown(0.35);
      });
    } else {
      doc.text('—');
    }
    doc.moveDown();
    doc.fontSize(9).fillColor('#555').font('Helvetica').text(
      'Documento generado desde VanguardNet. Las firmas digitalizadas se encuentran en el expediente electrónico.',
      { align: 'left' }
    );
    doc.end();
  } catch (e) {
    console.error('[psicologia pdf piar]', e);
    if (!res.headersSent) res.status(500).json({ error: e.message || 'Error' });
  }
});

module.exports = router;
