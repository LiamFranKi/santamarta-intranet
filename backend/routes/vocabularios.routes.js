/**
 * Vocabularios (PDF por grupo = nivel + grado + sección, año lectivo).
 * Admin/Promotoría: todo el colegio. Docente: grupos a su cargo. Alumno: solo su grupo.
 */
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { query, execute } = require('../utils/mysql');
const { authenticateToken } = require('../middleware/auth');
const { fechaHoraMySQLLima } = require('../utils/fechaHoraLima');
const { notificarVocabularioNuevo } = require('../utils/vocabulariosNotificar');

const uploadDir = path.join(__dirname, '../uploads/vocabularios');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const uploadPdf = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
      const safe = (file.originalname || 'doc').replace(/[^a-zA-Z0-9._-]/g, '_');
      cb(null, `vocab-${Date.now()}-${safe}`);
    }
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /\.pdf$/i.test(file.originalname || '') && (file.mimetype === 'application/pdf' || file.mimetype === 'application/x-pdf');
    if (ok) cb(null, true);
    else cb(new Error('Solo archivos PDF'));
  }
});

const esAdminOPromo = (tipo) => tipo === 'ADMINISTRADOR' || tipo === 'PROMOTORIA';

/** Grupos del año: id, nivel, grado, sección (para selects). */
async function gruposAlcanceDocente(colegio_id, anio_activo, personal_id) {
  if (!personal_id) return [];
  const rows = await query(
    `SELECT DISTINCT g.id AS grupo_id, g.nivel_id, g.grado, g.seccion, n.nombre AS nivel_nombre
     FROM grupos g
     INNER JOIN niveles n ON n.id = g.nivel_id
     WHERE g.colegio_id = ? AND g.anio = ?
       AND (
         EXISTS (
           SELECT 1 FROM asignaturas a
           WHERE a.grupo_id = g.id AND a.personal_id = ? AND a.colegio_id = ?
         )
         OR g.tutor_id = ?
       )
     ORDER BY n.nombre, g.grado, g.seccion`,
    [colegio_id, anio_activo, personal_id, colegio_id, personal_id]
  );
  return rows || [];
}

async function gruposTodosColegio(colegio_id, anio_activo) {
  const rows = await query(
    `SELECT DISTINCT g.id AS grupo_id, g.nivel_id, g.grado, g.seccion, n.nombre AS nivel_nombre
     FROM grupos g
     INNER JOIN niveles n ON n.id = g.nivel_id
     WHERE g.colegio_id = ? AND g.anio = ?
     ORDER BY n.nombre, g.grado, g.seccion`,
    [colegio_id, anio_activo]
  );
  return rows || [];
}

async function docentePuedeGrupo(colegio_id, anio, personal_id, grupo_id) {
  const rows = await query(
    `SELECT g.id FROM grupos g
     WHERE g.id = ? AND g.colegio_id = ? AND g.anio = ?
       AND (
         EXISTS (
           SELECT 1 FROM asignaturas a
           WHERE a.grupo_id = g.id AND a.personal_id = ? AND a.colegio_id = ?
         )
         OR g.tutor_id = ?
       )
     LIMIT 1`,
    [grupo_id, colegio_id, anio, personal_id, colegio_id, personal_id]
  );
  return rows && rows.length > 0;
}

async function alumnoGrupoId(colegio_id, anio_activo, usuario_id) {
  const rows = await query(
    `SELECT g.id AS grupo_id, g.nivel_id, g.grado
     FROM matriculas m
     INNER JOIN alumnos al ON al.id = m.alumno_id
     INNER JOIN usuarios u ON u.alumno_id = al.id
     INNER JOIN grupos g ON g.id = m.grupo_id
     WHERE u.id = ? AND m.colegio_id = ? AND g.anio = ?
       AND (m.estado = 0 OR m.estado = 4)
     LIMIT 1`,
    [usuario_id, colegio_id, anio_activo]
  );
  return rows && rows.length ? rows[0] : null;
}

/** Carga fila de grupo y valida colegio + año */
async function grupoPorId(colegio_id, anio, grupo_id) {
  const rows = await query(
    `SELECT g.id, g.nivel_id, g.grado, g.seccion, g.colegio_id, g.anio
     FROM grupos g WHERE g.id = ? AND g.colegio_id = ? AND g.anio = ? LIMIT 1`,
    [grupo_id, colegio_id, anio]
  );
  return rows && rows.length ? rows[0] : null;
}

router.use(authenticateToken);

/** Opciones de grupo (nivel — grado — sección) para el desplegable */
router.get('/opciones-grado', async (req, res) => {
  try {
    const { colegio_id, anio_activo, tipo, personal_id } = req.user;
    const anio = parseInt(anio_activo, 10) || new Date().getFullYear();
    if (esAdminOPromo(tipo)) {
      const opciones = await gruposTodosColegio(colegio_id, anio);
      return res.json({ opciones });
    }
    if (tipo === 'DOCENTE') {
      const opciones = await gruposAlcanceDocente(colegio_id, anio, personal_id);
      return res.json({ opciones });
    }
    return res.status(403).json({ error: 'No autorizado' });
  } catch (err) {
    console.error('vocabularios opciones-grado:', err);
    res.status(500).json({ error: err.message || 'Error' });
  }
});

const SELECT_LIST = `
      SELECT v.id, v.colegio_id, v.anio, v.nivel_id, v.grado, v.grupo_id, v.titulo, v.descripcion,
             v.nombre_archivo_original, v.ruta_almacenamiento, v.personal_id, v.usuario_creador_id,
             v.created_at, v.updated_at,
             n.nombre AS nivel_nombre,
             COALESCE(g.seccion, '') AS seccion,
             TRIM(CONCAT(COALESCE(p.nombres, ''), ' ', COALESCE(p.apellidos, ''))) AS docente_nombre
      FROM vocabularios v
      INNER JOIN niveles n ON n.id = v.nivel_id
      LEFT JOIN grupos g ON g.id = v.grupo_id
      LEFT JOIN personal p ON p.id = v.personal_id
`;

/** Listado según rol */
router.get('/', async (req, res) => {
  try {
    const { colegio_id, anio_activo, tipo, personal_id, usuario_id } = req.user;
    const anio = parseInt(anio_activo, 10) || new Date().getFullYear();

    let sql = `${SELECT_LIST}
      WHERE v.colegio_id = ? AND v.anio = ?
    `;
    const params = [colegio_id, anio];

    if (esAdminOPromo(tipo)) {
      sql += ' ORDER BY v.created_at DESC';
      const list = await query(sql, params);
      return res.json({
        items: (list || []).map((r) => ({
          ...r,
          archivo_url: `/uploads/${r.ruta_almacenamiento}`,
          es_mio: true,
          puede_editar: true
        }))
      });
    }

    if (tipo === 'DOCENTE') {
      const misGrupos = await gruposAlcanceDocente(colegio_id, anio, personal_id);
      if (!misGrupos.length) {
        return res.json({ items: [] });
      }
      const ids = misGrupos.map((g) => g.grupo_id);
      const ph = ids.map(() => '?').join(', ');
      sql += ` AND (
        v.grupo_id IN (${ph})
        OR (
          v.grupo_id IS NULL
          AND (v.nivel_id, v.grado) IN (
            SELECT DISTINCT g2.nivel_id, g2.grado FROM grupos g2 WHERE g2.id IN (${ph})
          )
        )
      ) ORDER BY v.created_at DESC`;
      const list = await query(sql, [...params, ...ids, ...ids]);
      return res.json({
        items: (list || []).map((r) => ({
          ...r,
          archivo_url: `/uploads/${r.ruta_almacenamiento}`,
          es_mio: personal_id != null && Number(r.personal_id) === Number(personal_id),
          puede_editar: personal_id != null && Number(r.personal_id) === Number(personal_id)
        }))
      });
    }

    if (tipo === 'ALUMNO') {
      const ag = await alumnoGrupoId(colegio_id, anio, usuario_id);
      if (!ag) {
        return res.json({ items: [] });
      }
      sql += ` AND (
        v.grupo_id = ?
        OR (v.grupo_id IS NULL AND v.nivel_id = ? AND v.grado = ?)
      ) ORDER BY v.created_at DESC`;
      const list = await query(sql, [...params, ag.grupo_id, ag.nivel_id, ag.grado]);
      return res.json({
        items: (list || []).map((r) => ({
          ...r,
          archivo_url: `/uploads/${r.ruta_almacenamiento}`,
          es_mio: false,
          puede_editar: false
        }))
      });
    }

    return res.status(403).json({ error: 'No autorizado' });
  } catch (err) {
    if (err.message && (err.message.includes("doesn't exist") || err.message.includes('Unknown column'))) {
      return res.json({ items: [] });
    }
    console.error('vocabularios list:', err);
    res.status(500).json({ error: err.message || 'Error al listar' });
  }
});

router.post('/', uploadPdf.single('archivo'), async (req, res) => {
  try {
    const { colegio_id, anio_activo, tipo, personal_id, usuario_id } = req.user;
    if (tipo === 'ALUMNO') {
      if (req.file?.path) fs.unlink(req.file.path, () => {});
      return res.status(403).json({ error: 'No autorizado' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Debe adjuntar un PDF' });
    }
    const anio = parseInt(anio_activo, 10) || new Date().getFullYear();
    const grupo_id = parseInt(req.body.grupo_id, 10);
    const titulo = String(req.body.titulo || '').trim();
    const descripcion = req.body.descripcion != null ? String(req.body.descripcion).trim().slice(0, 1000) : null;

    if (!grupo_id || Number.isNaN(grupo_id) || !titulo) {
      fs.unlink(req.file.path, () => {});
      return res.status(400).json({ error: 'Grupo y título son obligatorios' });
    }

    const g = await grupoPorId(colegio_id, anio, grupo_id);
    if (!g) {
      fs.unlink(req.file.path, () => {});
      return res.status(400).json({ error: 'Grupo no válido para este colegio y año' });
    }

    const niv = await query(`SELECT id FROM niveles WHERE id = ? AND colegio_id = ? LIMIT 1`, [g.nivel_id, colegio_id]);
    if (!niv.length) {
      fs.unlink(req.file.path, () => {});
      return res.status(400).json({ error: 'Nivel no válido' });
    }

    if (esAdminOPromo(tipo)) {
      /* ya validado por grupoPorId */
    } else if (tipo === 'DOCENTE') {
      const ok = await docentePuedeGrupo(colegio_id, anio, personal_id, grupo_id);
      if (!ok) {
        fs.unlink(req.file.path, () => {});
        return res.status(403).json({ error: 'No puede publicar para ese grupo' });
      }
    } else {
      fs.unlink(req.file.path, () => {});
      return res.status(403).json({ error: 'No autorizado' });
    }

    const rel = `vocabularios/${req.file.filename}`;
    const now = fechaHoraMySQLLima();

    const detGrupo = await query(
      `SELECT g.grado, g.seccion, n.nombre AS nivel_nombre
       FROM grupos g
       INNER JOIN niveles n ON n.id = g.nivel_id
       WHERE g.id = ? AND g.colegio_id = ? AND g.anio = ?
       LIMIT 1`,
      [grupo_id, colegio_id, anio]
    );
    const secNotif = (detGrupo[0]?.seccion || '').trim();
    const etiquetaGrupo = detGrupo.length
      ? `${detGrupo[0].nivel_nombre} — ${detGrupo[0].grado}°${secNotif ? ` · Sec. ${secNotif}` : ''}`
      : '';

    let nombreDocente = '';
    if (personal_id) {
      const pn = await query(
        `SELECT TRIM(CONCAT(COALESCE(nombres,''), ' ', COALESCE(apellidos,''))) AS n FROM personal WHERE id = ? LIMIT 1`,
        [personal_id]
      );
      if (pn.length && pn[0].n) nombreDocente = String(pn[0].n).trim();
    }

    const sqlInsertLegacy = `INSERT INTO vocabularios
       (colegio_id, anio, nivel_id, grado, titulo, descripcion, nombre_archivo_original, ruta_almacenamiento, personal_id, usuario_creador_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    const insertParamsLegacy = [
      colegio_id,
      anio,
      g.nivel_id,
      g.grado,
      titulo,
      descripcion || null,
      req.file.originalname,
      rel,
      personal_id || null,
      usuario_id,
      now,
      now
    ];

    let insertResult;
    try {
      insertResult = await execute(
        `INSERT INTO vocabularios
         (colegio_id, anio, nivel_id, grado, grupo_id, titulo, descripcion, nombre_archivo_original, ruta_almacenamiento, personal_id, usuario_creador_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          colegio_id,
          anio,
          g.nivel_id,
          g.grado,
          grupo_id,
          titulo,
          descripcion || null,
          req.file.originalname,
          rel,
          personal_id || null,
          usuario_id,
          now,
          now
        ]
      );
    } catch (e) {
      if (e.message && e.message.includes('Unknown column') && e.message.includes('grupo_id')) {
        insertResult = await execute(sqlInsertLegacy, insertParamsLegacy);
      } else throw e;
    }

    const newId = insertResult && insertResult.insertId;
    if (newId && grupo_id && etiquetaGrupo) {
      setImmediate(() => {
        notificarVocabularioNuevo({
          query,
          execute,
          colegio_id,
          grupo_id,
          titulo,
          etiquetaGrupo,
          nombreDocente,
          vocabularioId: newId,
          usuario_emisor_id: usuario_id
        }).catch((e) => console.error('📚 [VOCABULARIOS] notificar async:', e));
      });
    }

    res.status(201).json({ success: true, id: newId || undefined });
  } catch (err) {
    if (req.file?.path) fs.unlink(req.file.path, () => {});
    console.error('vocabularios create:', err);
    res.status(500).json({ error: err.message || 'Error al guardar' });
  }
});

router.put('/:id', uploadPdf.single('archivo'), async (req, res) => {
  try {
    const { colegio_id, anio_activo, tipo, personal_id, usuario_id } = req.user;
    if (tipo === 'ALUMNO') {
      if (req.file?.path) fs.unlink(req.file.path, () => {});
      return res.status(403).json({ error: 'No autorizado' });
    }
    const id = parseInt(req.params.id, 10);
    const rows = await query(`SELECT * FROM vocabularios WHERE id = ? AND colegio_id = ?`, [id, colegio_id]);
    if (!rows.length) {
      if (req.file?.path) fs.unlink(req.file.path, () => {});
      return res.status(404).json({ error: 'No encontrado' });
    }
    const cur = rows[0];

    if (tipo === 'DOCENTE') {
      if (!personal_id || Number(cur.personal_id) !== Number(personal_id)) {
        if (req.file?.path) fs.unlink(req.file.path, () => {});
        return res.status(403).json({ error: 'Solo puede editar sus propios vocabularios' });
      }
    } else if (!esAdminOPromo(tipo)) {
      if (req.file?.path) fs.unlink(req.file.path, () => {});
      return res.status(403).json({ error: 'No autorizado' });
    }

    const anio = parseInt(anio_activo, 10) || new Date().getFullYear();
    const grupo_id = req.body.grupo_id != null ? parseInt(req.body.grupo_id, 10) : cur.grupo_id;
    const titulo = req.body.titulo != null ? String(req.body.titulo).trim() : cur.titulo;
    const descripcion = req.body.descripcion !== undefined ? (req.body.descripcion ? String(req.body.descripcion).trim().slice(0, 1000) : null) : cur.descripcion;

    if (!grupo_id || Number.isNaN(grupo_id)) {
      if (req.file?.path) fs.unlink(req.file.path, () => {});
      return res.status(400).json({ error: 'Debe indicar el grupo' });
    }

    const g = await grupoPorId(colegio_id, anio, grupo_id);
    if (!g) {
      if (req.file?.path) fs.unlink(req.file.path, () => {});
      return res.status(400).json({ error: 'Grupo no válido' });
    }

    const niv = await query(`SELECT id FROM niveles WHERE id = ? AND colegio_id = ? LIMIT 1`, [g.nivel_id, colegio_id]);
    if (!niv.length) {
      if (req.file?.path) fs.unlink(req.file.path, () => {});
      return res.status(400).json({ error: 'Nivel no válido' });
    }

    if (esAdminOPromo(tipo)) {
      /* ok */
    } else {
      const ok = await docentePuedeGrupo(colegio_id, anio, personal_id, grupo_id);
      if (!ok) {
        if (req.file?.path) fs.unlink(req.file.path, () => {});
        return res.status(403).json({ error: 'No puede asignar ese grupo' });
      }
    }

    let ruta = cur.ruta_almacenamiento;
    let nombreOrig = cur.nombre_archivo_original;
    if (req.file) {
      const oldAbs = path.join(__dirname, '../uploads', cur.ruta_almacenamiento);
      if (fs.existsSync(oldAbs)) {
        try {
          fs.unlinkSync(oldAbs);
        } catch (e) {
          console.warn('vocab unlink old:', e.message);
        }
      }
      ruta = `vocabularios/${req.file.filename}`;
      nombreOrig = req.file.originalname;
    }

    const now = fechaHoraMySQLLima();

    try {
      await execute(
        `UPDATE vocabularios SET
           nivel_id = ?, grado = ?, grupo_id = ?, titulo = ?, descripcion = ?,
           nombre_archivo_original = ?, ruta_almacenamiento = ?, usuario_creador_id = ?, updated_at = ?
         WHERE id = ? AND colegio_id = ?`,
        [g.nivel_id, g.grado, grupo_id, titulo, descripcion, nombreOrig, ruta, usuario_id, now, id, colegio_id]
      );
    } catch (e) {
      if (e.message && e.message.includes('Unknown column') && e.message.includes('grupo_id')) {
        await execute(
          `UPDATE vocabularios SET
             nivel_id = ?, grado = ?, titulo = ?, descripcion = ?,
             nombre_archivo_original = ?, ruta_almacenamiento = ?, usuario_creador_id = ?, updated_at = ?
           WHERE id = ? AND colegio_id = ?`,
          [g.nivel_id, g.grado, titulo, descripcion, nombreOrig, ruta, usuario_id, now, id, colegio_id]
        );
      } else throw e;
    }
    res.json({ success: true });
  } catch (err) {
    if (req.file?.path) fs.unlink(req.file.path, () => {});
    console.error('vocabularios update:', err);
    res.status(500).json({ error: err.message || 'Error al actualizar' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { colegio_id, tipo, personal_id } = req.user;
    const id = parseInt(req.params.id, 10);
    const rows = await query(`SELECT * FROM vocabularios WHERE id = ? AND colegio_id = ?`, [id, colegio_id]);
    if (!rows.length) return res.status(404).json({ error: 'No encontrado' });
    const cur = rows[0];

    if (tipo === 'DOCENTE') {
      if (!personal_id || Number(cur.personal_id) !== Number(personal_id)) {
        return res.status(403).json({ error: 'Solo puede eliminar sus propios vocabularios' });
      }
    } else if (!esAdminOPromo(tipo)) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const abs = path.join(__dirname, '../uploads', cur.ruta_almacenamiento);
    await execute(`DELETE FROM vocabularios WHERE id = ? AND colegio_id = ?`, [id, colegio_id]);
    if (fs.existsSync(abs)) {
      try {
        fs.unlinkSync(abs);
      } catch (e) {
        console.warn('vocab delete file:', e.message);
      }
    }
    res.json({ success: true });
  } catch (err) {
    console.error('vocabularios delete:', err);
    res.status(500).json({ error: err.message || 'Error al eliminar' });
  }
});

module.exports = router;
