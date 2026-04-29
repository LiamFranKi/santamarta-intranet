/**
 * Psicología — perfil DOCENTE: derivaciones propias y alta desde alumno de sus grupos.
 */
const express = require('express');
const router = express.Router();
const { query, execute } = require('../utils/mysql');
const { authenticateToken } = require('../middleware/auth');
const { notificarStaffNuevaDerivacionDocente } = require('../utils/psicologiaDerivacionNotificarStaff');

router.use(authenticateToken);
router.use((req, res, next) => {
  if (req.user?.tipo === 'DOCENTE') return next();
  return res.status(403).json({ error: 'Solo docentes pueden usar esta sección.' });
});

function cid(req) {
  const n = Number(req.user?.colegio_id);
  return Number.isFinite(n) ? n : null;
}

function personalId(req) {
  const n = Number(req.user?.personal_id);
  return Number.isFinite(n) ? n : null;
}

async function assertAlumnoEnColegio(colegioId, alumnoId) {
  const rows = await query('SELECT id FROM alumnos WHERE id = ? AND colegio_id = ? LIMIT 1', [alumnoId, colegioId]);
  return rows.length > 0;
}

/** Docente imparte o tutorea el grupo del alumno en el año activo. */
async function assertDocentePuedeAlumno(req, alumnoId) {
  const colegio_id = cid(req);
  const pid = personalId(req);
  const anio = parseInt(req.user?.anio_activo, 10);
  if (!colegio_id || !pid || !Number.isFinite(anio)) return false;
  const rows = await query(
    `SELECT 1
     FROM matriculas m
     INNER JOIN grupos g ON g.id = m.grupo_id AND g.colegio_id = m.colegio_id AND g.anio = ?
     WHERE m.alumno_id = ? AND m.colegio_id = ? AND (m.estado = 0)
       AND (
         EXISTS (
           SELECT 1 FROM asignaturas a
           WHERE a.grupo_id = g.id AND a.personal_id = ? AND a.colegio_id = g.colegio_id
         )
         OR g.tutor_id = ?
       )
     LIMIT 1`,
    [anio, alumnoId, colegio_id, pid, pid]
  );
  return rows.length > 0;
}

async function assertMatriculaAlumno(colegioId, matriculaId, alumnoId) {
  if (!matriculaId) return true;
  const rows = await query(
    'SELECT id FROM matriculas WHERE id = ? AND colegio_id = ? AND alumno_id = ? LIMIT 1',
    [matriculaId, colegioId, alumnoId]
  );
  return rows.length > 0;
}

/** Listado de derivaciones donde el docente figura como referente. */
router.get('/mis-derivaciones', async (req, res) => {
  try {
    const colegio_id = cid(req);
    const pid = personalId(req);
    if (!colegio_id || !pid) return res.status(400).json({ error: 'Sesión incompleta.' });
    const rows = await query(
      `SELECT d.id, d.alumno_id, d.matricula_id, d.estado, d.urgencia, d.descripcion_caso, d.created_at,
              TRIM(CONCAT(
                COALESCE(a.apellido_paterno,''), ' ',
                COALESCE(a.apellido_materno,''), ' ',
                COALESCE(a.nombres,'')
              )) AS alumno_nombre
       FROM psicologia_derivaciones d
       INNER JOIN alumnos a ON a.id = d.alumno_id AND a.colegio_id = d.colegio_id
       WHERE d.colegio_id = ? AND d.docente_personal_id = ?
       ORDER BY d.id DESC
       LIMIT 200`,
      [colegio_id, pid]
    );
    res.json({ derivaciones: rows || [] });
  } catch (e) {
    console.error('[docente/psicologia/mis-derivaciones]', e);
    res.status(500).json({ error: e.message || 'Error' });
  }
});

/** Nombre del alumno + matrícula de referencia (formulario derivación). */
router.get('/alumnos/:alumnoId/cabecera', async (req, res) => {
  try {
    const colegio_id = cid(req);
    const alumnoId = parseInt(req.params.alumnoId, 10);
    if (!colegio_id || !Number.isFinite(alumnoId)) return res.status(400).json({ error: 'Parámetros inválidos' });
    if (!(await assertAlumnoEnColegio(colegio_id, alumnoId))) {
      return res.status(404).json({ error: 'Alumno no encontrado' });
    }
    if (!(await assertDocentePuedeAlumno(req, alumnoId))) {
      return res.status(403).json({ error: 'No tiene al alumno en sus grupos o tutorías este año.' });
    }
    const [row] = await query(
      `SELECT TRIM(CONCAT(
          COALESCE(a.apellido_paterno,''), ' ',
          COALESCE(a.apellido_materno,''), ' ',
          COALESCE(a.nombres,''))) AS nombre_completo
       FROM alumnos a WHERE a.id = ? AND a.colegio_id = ? LIMIT 1`,
      [alumnoId, colegio_id]
    );
    res.json({ nombre_completo: (row && row.nombre_completo) || '' });
  } catch (e) {
    console.error('[docente/psicologia/cabecera]', e);
    res.status(500).json({ error: e.message || 'Error' });
  }
});

/** Detalle de una derivación propia (solo docente referente). */
router.get('/derivaciones/:id', async (req, res) => {
  try {
    const colegio_id = cid(req);
    const pid = personalId(req);
    const id = parseInt(req.params.id, 10);
    if (!colegio_id || !pid || !Number.isFinite(id)) return res.status(400).json({ error: 'Parámetros inválidos' });
    const rows = await query(
      `SELECT d.* FROM psicologia_derivaciones d
       WHERE d.id = ? AND d.colegio_id = ? AND d.docente_personal_id = ? LIMIT 1`,
      [id, colegio_id, pid]
    );
    const d = rows[0];
    if (!d) return res.status(404).json({ error: 'No encontrado' });
    let motivos = [];
    try {
      motivos = typeof d.motivos_json === 'string' ? JSON.parse(d.motivos_json || '[]') : d.motivos_json || [];
    } catch (_) {
      motivos = [];
    }
    res.json({ derivacion: { ...d, motivos_json: Array.isArray(motivos) ? motivos : [] } });
  } catch (e) {
    console.error('[docente/psicologia/derivaciones GET]', e);
    res.status(500).json({ error: e.message || 'Error' });
  }
});

/** Actualizar derivación propia mientras siga RECIBIDA. */
router.put('/derivaciones/:id', async (req, res) => {
  try {
    const colegio_id = cid(req);
    const pid = personalId(req);
    const id = parseInt(req.params.id, 10);
    if (!colegio_id || !pid || !Number.isFinite(id)) return res.status(400).json({ error: 'Parámetros inválidos' });
    const [row] = await query(
      `SELECT id, estado FROM psicologia_derivaciones
       WHERE id = ? AND colegio_id = ? AND docente_personal_id = ? LIMIT 1`,
      [id, colegio_id, pid]
    );
    if (!row) return res.status(404).json({ error: 'No encontrado' });
    if (String(row.estado) !== 'RECIBIDA') {
      return res.status(400).json({ error: 'Solo puede editar derivaciones en estado RECIBIDA.' });
    }
    const b = req.body || {};
    const descripcion = b.descripcion_caso != null ? String(b.descripcion_caso).trim() : null;
    if (descripcion !== null && descripcion === '') {
      return res.status(400).json({ error: 'descripcion_caso no puede quedar vacía' });
    }
    const sets = [];
    const params = [];
    if (b.motivos_json !== undefined) {
      sets.push('motivos_json = ?');
      params.push(JSON.stringify(Array.isArray(b.motivos_json) ? b.motivos_json : []));
    }
    if (b.motivo_otro !== undefined) {
      sets.push('motivo_otro = ?');
      params.push(b.motivo_otro != null ? String(b.motivo_otro).slice(0, 500) : null);
    }
    if (descripcion != null) {
      sets.push('descripcion_caso = ?');
      params.push(descripcion);
    }
    if (b.estrategias_aula !== undefined) {
      sets.push('estrategias_aula = ?');
      params.push(b.estrategias_aula != null ? String(b.estrategias_aula) : null);
    }
    if (b.urgencia != null && ['ALTA', 'MEDIA', 'BAJA'].includes(String(b.urgencia).toUpperCase())) {
      sets.push('urgencia = ?');
      params.push(String(b.urgencia).toUpperCase());
    }
    if (b.firma_docente_imagen !== undefined) {
      sets.push('firma_docente_imagen = ?');
      params.push(b.firma_docente_imagen != null ? String(b.firma_docente_imagen) : null);
    }
    if (b.firma_docente_fecha !== undefined) {
      sets.push('firma_docente_fecha = ?');
      params.push(b.firma_docente_fecha || null);
    }
    if (!sets.length) return res.status(400).json({ error: 'Nada que actualizar' });
    params.push(id, colegio_id, pid);
    await execute(
      `UPDATE psicologia_derivaciones SET ${sets.join(', ')}
       WHERE id = ? AND colegio_id = ? AND docente_personal_id = ? AND estado = 'RECIBIDA'`,
      params
    );
    res.json({ ok: true });
  } catch (e) {
    console.error('[docente/psicologia/derivaciones PUT]', e);
    res.status(500).json({ error: e.message || 'Error' });
  }
});

/** Eliminar derivación propia solo en RECIBIDA. */
router.delete('/derivaciones/:id', async (req, res) => {
  try {
    const colegio_id = cid(req);
    const pid = personalId(req);
    const id = parseInt(req.params.id, 10);
    if (!colegio_id || !pid || !Number.isFinite(id)) return res.status(400).json({ error: 'Parámetros inválidos' });
    const r = await execute(
      `DELETE FROM psicologia_derivaciones
       WHERE id = ? AND colegio_id = ? AND docente_personal_id = ? AND estado = 'RECIBIDA'`,
      [id, colegio_id, pid]
    );
    if (!r.affectedRows) return res.status(404).json({ error: 'No encontrado o ya atendida por psicología' });
    res.json({ ok: true });
  } catch (e) {
    console.error('[docente/psicologia/derivaciones DELETE]', e);
    res.status(500).json({ error: e.message || 'Error' });
  }
});

/** Crear derivación (sin recepción de psicología; la registra luego el equipo). */
router.post('/alumnos/:alumnoId/derivaciones', async (req, res) => {
  try {
    const colegio_id = cid(req);
    const pid = personalId(req);
    const uidRaw =
      req.user.usuario_id != null && req.user.usuario_id !== ''
        ? req.user.usuario_id
        : req.user.id;
    const uidParsed = uidRaw != null && uidRaw !== '' ? parseInt(uidRaw, 10) : NaN;
    const uid = Number.isFinite(uidParsed) ? uidParsed : null;
    const alumnoId = parseInt(req.params.alumnoId, 10);
    if (!colegio_id || !pid) return res.status(400).json({ error: 'Sesión incompleta.' });
    if (!Number.isFinite(alumnoId) || !(await assertAlumnoEnColegio(colegio_id, alumnoId))) {
      return res.status(404).json({ error: 'Alumno no encontrado' });
    }
    if (!(await assertDocentePuedeAlumno(req, alumnoId))) {
      return res.status(403).json({ error: 'No tiene al alumno en sus grupos o tutorías este año.' });
    }
    const b = req.body || {};
    const matriculaId = b.matricula_id != null ? parseInt(b.matricula_id, 10) : null;
    if (!(await assertMatriculaAlumno(colegio_id, matriculaId, alumnoId))) {
      return res.status(400).json({ error: 'matricula_id inválida' });
    }
    const descripcion = String(b.descripcion_caso || '').trim();
    if (!descripcion) return res.status(400).json({ error: 'descripcion_caso es obligatoria' });
    const motivosJson = JSON.stringify(Array.isArray(b.motivos_json) ? b.motivos_json : []);
    const urgencia = ['ALTA', 'MEDIA', 'BAJA'].includes(String(b.urgencia || '').toUpperCase())
      ? String(b.urgencia).toUpperCase()
      : 'MEDIA';

    const r = await execute(
      `INSERT INTO psicologia_derivaciones
        (colegio_id, alumno_id, matricula_id, docente_personal_id, motivos_json, motivo_otro, descripcion_caso, estrategias_aula, urgencia, observaciones, estado,
         firma_docente_imagen, firma_docente_fecha, recepcion_psicologia_personal_id, recepcion_psicologia_fecha, creado_por_usuario_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        colegio_id,
        alumnoId,
        Number.isFinite(matriculaId) ? matriculaId : null,
        pid,
        motivosJson,
        b.motivo_otro != null ? String(b.motivo_otro).slice(0, 500) : null,
        descripcion,
        b.estrategias_aula != null ? String(b.estrategias_aula) : null,
        urgencia,
        b.observaciones != null ? String(b.observaciones) : null,
        'RECIBIDA',
        b.firma_docente_imagen != null ? String(b.firma_docente_imagen) : null,
        b.firma_docente_fecha || null,
        null,
        null,
        Number.isFinite(uid) ? uid : null
      ]
    );
    const newId = r.insertId;
    try {
      await notificarStaffNuevaDerivacionDocente({
        colegio_id,
        derivacionId: newId,
        alumnoId,
        matriculaId: Number.isFinite(matriculaId) ? matriculaId : null,
        docentePersonalId: pid,
        remitenteUsuarioId: uid,
      });
    } catch (nErr) {
      console.warn('[docente/psicologia] notificación staff omitida:', nErr.message);
    }
    res.json({ id: newId });
  } catch (e) {
    console.error('[docente/psicologia/derivaciones POST]', e);
    res.status(500).json({ error: e.message || 'Error' });
  }
});

/** Matrícula del año del PIAR: nivel — grado — sección (última matrícula vigente). */
const sqlGrupoAulaPiar = `
  (SELECT TRIM(CONCAT(
      COALESCE(nv.nombre, ''),
      ' — ',
      COALESCE(gv.grado, ''),
      ' — ',
      COALESCE(gv.seccion, '')
    ))
   FROM matriculas mv
   INNER JOIN grupos gv ON gv.id = mv.grupo_id AND gv.colegio_id = mv.colegio_id AND gv.anio = p.anio
   LEFT JOIN niveles nv ON nv.id = gv.nivel_id
   WHERE mv.alumno_id = p.alumno_id AND mv.colegio_id = p.colegio_id AND (mv.estado = 0)
   ORDER BY mv.id DESC LIMIT 1)`;

async function assertDocentePuedeVerPiar(colegio_id, pid, piarId) {
  if (!colegio_id || !pid || !Number.isFinite(piarId)) return null;
  const rows = await query(
    `SELECT p.id, p.alumno_id, p.anio, p.numero_version, p.estado, p.diagnostico, p.fortalezas, p.areas_dificultad,
            p.estilo_aprendizaje, p.observaciones_relevantes, p.estrategias_docentes, p.frecuencia_aplicacion,
            p.fecha_revision, p.avances_observados, p.ajustes_necesarios_revision, p.docente_responsable_personal_id,
            p.ajustes_checklist_json, p.objetivos_json, p.evaluacion_kpi_json, p.firma_docente_imagen, p.firma_docente_fecha,
            ${sqlGrupoAulaPiar} AS grupo_aula_etiqueta
     FROM psicologia_piar p
     WHERE p.id = ? AND p.colegio_id = ?
       AND p.estado IN ('ACTIVO','BORRADOR','ARCHIVADO')
       AND EXISTS (
         SELECT 1
         FROM matriculas m
         INNER JOIN grupos g ON g.id = m.grupo_id AND g.colegio_id = m.colegio_id AND g.anio = p.anio
         WHERE m.alumno_id = p.alumno_id AND m.colegio_id = p.colegio_id AND (m.estado = 0)
           AND (
             EXISTS (
               SELECT 1 FROM asignaturas a
               WHERE a.grupo_id = g.id AND a.personal_id = ? AND a.colegio_id = g.colegio_id
             )
             OR g.tutor_id = ?
           )
       )
     LIMIT 1`,
    [piarId, colegio_id, pid, pid]
  );
  return rows[0] || null;
}

/** PIAR visibles para el docente (alumnos de sus grupos/tutorías del año del plan). */
router.get('/mis-piar', async (req, res) => {
  try {
    const colegio_id = cid(req);
    const pid = personalId(req);
    if (!colegio_id || !pid) return res.status(400).json({ error: 'Sesión incompleta.' });
    const rows = await query(
      `SELECT p.id, p.alumno_id, p.anio, p.numero_version, p.estado, p.created_at, p.updated_at,
              TRIM(CONCAT(
                COALESCE(a.apellido_paterno,''), ' ',
                COALESCE(a.apellido_materno,''), ' ',
                COALESCE(a.nombres,''))) AS alumno_nombre,
              ${sqlGrupoAulaPiar} AS grupo_aula_etiqueta
       FROM psicologia_piar p
       INNER JOIN alumnos a ON a.id = p.alumno_id AND a.colegio_id = p.colegio_id
       WHERE p.colegio_id = ? AND p.estado IN ('ACTIVO','BORRADOR','ARCHIVADO')
         AND EXISTS (
           SELECT 1
           FROM matriculas m
           INNER JOIN grupos g ON g.id = m.grupo_id AND g.colegio_id = m.colegio_id AND g.anio = p.anio
           WHERE m.alumno_id = p.alumno_id AND m.colegio_id = p.colegio_id AND (m.estado = 0)
             AND (
               EXISTS (
                 SELECT 1 FROM asignaturas a2
                 WHERE a2.grupo_id = g.id AND a2.personal_id = ? AND a2.colegio_id = g.colegio_id
               )
               OR g.tutor_id = ?
             )
         )
       ORDER BY p.id DESC
       LIMIT 300`,
      [colegio_id, pid, pid]
    );
    res.json({ piar_lista: rows || [] });
  } catch (e) {
    console.error('[docente/psicologia/mis-piar]', e);
    res.status(500).json({ error: e.message || 'Error' });
  }
});

router.get('/piar/:id', async (req, res) => {
  try {
    const colegio_id = cid(req);
    const pid = personalId(req);
    const id = parseInt(req.params.id, 10);
    if (!colegio_id || !pid || !Number.isFinite(id)) return res.status(400).json({ error: 'Parámetros inválidos' });
    const row = await assertDocentePuedeVerPiar(colegio_id, pid, id);
    if (!row) return res.status(404).json({ error: 'PIAR no encontrado o sin acceso para usted.' });
    const [al] = await query(
      `SELECT TRIM(CONCAT(
          COALESCE(a.apellido_paterno,''), ' ',
          COALESCE(a.apellido_materno,''), ' ',
          COALESCE(a.nombres,''))) AS nombre
       FROM alumnos a WHERE a.id = ? AND a.colegio_id = ? LIMIT 1`,
      [row.alumno_id, colegio_id]
    );
    const items = await query(
      `SELECT s.id, s.autor_tipo, s.contenido, s.created_at
       FROM psicologia_piar_seguimiento s
       WHERE s.colegio_id = ? AND s.piar_id = ?
       ORDER BY s.id ASC`,
      [colegio_id, id]
    );
    const respPid =
      row.docente_responsable_personal_id != null ? Number(row.docente_responsable_personal_id) : null;
    const puedeEditarAula =
      row.estado !== 'ARCHIVADO' && (respPid == null || respPid === pid);

    res.json({
      piar: { ...row, alumno_nombre: al?.nombre || '' },
      seguimiento: items || [],
      puede_editar_aula: puedeEditarAula,
      solo_lectura_motivo: puedeEditarAula
        ? null
        : row.estado === 'ARCHIVADO'
          ? 'archivado'
          : 'otro_docente_responsable',
    });
  } catch (e) {
    console.error('[docente/psicologia/piar GET]', e);
    res.status(500).json({ error: e.message || 'Error' });
  }
});

/** Docente: actualiza solo estrategias / frecuencia / avances (aula). */
router.put('/piar/:id', async (req, res) => {
  try {
    const colegio_id = cid(req);
    const pid = personalId(req);
    const id = parseInt(req.params.id, 10);
    if (!colegio_id || !pid || !Number.isFinite(id)) return res.status(400).json({ error: 'Parámetros inválidos' });
    const row = await assertDocentePuedeVerPiar(colegio_id, pid, id);
    if (!row) return res.status(404).json({ error: 'PIAR no encontrado o sin acceso para usted.' });
    if (row.estado === 'ARCHIVADO') {
      return res.status(403).json({ error: 'Este PIAR está archivado y no admite cambios del aula.' });
    }
    const respPid =
      row.docente_responsable_personal_id != null ? Number(row.docente_responsable_personal_id) : null;
    if (respPid != null && respPid !== pid) {
      return res.status(403).json({
        error: 'Solo el docente responsable asignado en el PIAR puede editar estrategias, frecuencia y avances.',
      });
    }
    const body = req.body || {};
    const estr = String(body.estrategias_docentes ?? '').slice(0, 65000);
    const freq = String(body.frecuencia_aplicacion ?? '').slice(0, 65000);
    const ava = String(body.avances_observados ?? '').slice(0, 65000);
    await execute(
      `UPDATE psicologia_piar
       SET estrategias_docentes = ?, frecuencia_aplicacion = ?, avances_observados = ?, updated_at = NOW()
       WHERE id = ? AND colegio_id = ?`,
      [estr, freq, ava, id, colegio_id]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error('[docente/psicologia/piar PUT]', e);
    res.status(500).json({ error: e.message || 'Error' });
  }
});

/** Docente: nueva entrada en bitácora (mismo historial que ve psicología). */
router.post('/piar/:id/seguimiento', async (req, res) => {
  try {
    const colegio_id = cid(req);
    const pid = personalId(req);
    const uid = req.user.usuario_id != null ? parseInt(req.user.usuario_id, 10) : null;
    const id = parseInt(req.params.id, 10);
    const contenido = String((req.body || {}).contenido || '').trim();
    if (!colegio_id || !pid || !Number.isFinite(id)) return res.status(400).json({ error: 'Parámetros inválidos' });
    if (!contenido) return res.status(400).json({ error: 'contenido es obligatorio' });
    const row = await assertDocentePuedeVerPiar(colegio_id, pid, id);
    if (!row) return res.status(404).json({ error: 'PIAR no encontrado o sin acceso para usted.' });
    if (row.estado === 'ARCHIVADO') {
      return res.status(403).json({ error: 'Este PIAR está archivado y no admite nuevas notas.' });
    }
    const respPid =
      row.docente_responsable_personal_id != null ? Number(row.docente_responsable_personal_id) : null;
    if (respPid != null && respPid !== pid) {
      return res.status(403).json({
        error: 'Solo el docente responsable puede registrar notas en la bitácora de este PIAR.',
      });
    }
    await execute(
      `INSERT INTO psicologia_piar_seguimiento (colegio_id, piar_id, autor_tipo, creado_por_usuario_id, contenido)
       VALUES (?,?,?,?,?)`,
      [colegio_id, id, 'DOCENTE', Number.isFinite(uid) ? uid : null, contenido.slice(0, 8000)]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error('[docente/psicologia/piar seguimiento POST]', e);
    res.status(500).json({ error: e.message || 'Error' });
  }
});

module.exports = router;
