/**
 * Psicología — perfil DOCENTE: derivaciones propias y alta desde alumno de sus grupos.
 */
const express = require('express');
const router = express.Router();
const { query, execute } = require('../utils/mysql');
const { authenticateToken } = require('../middleware/auth');

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
     WHERE m.alumno_id = ? AND m.colegio_id = ? AND (m.estado = 0 OR m.estado = 4)
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

/** Crear derivación (sin recepción de psicología; la registra luego el equipo). */
router.post('/alumnos/:alumnoId/derivaciones', async (req, res) => {
  try {
    const colegio_id = cid(req);
    const pid = personalId(req);
    const uid = req.user.usuario_id != null ? parseInt(req.user.usuario_id, 10) : null;
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
        Number.isFinite(uid) ? uid : null,
      ]
    );
    res.json({ id: r.insertId });
  } catch (e) {
    console.error('[docente/psicologia/derivaciones POST]', e);
    res.status(500).json({ error: e.message || 'Error' });
  }
});

module.exports = router;
