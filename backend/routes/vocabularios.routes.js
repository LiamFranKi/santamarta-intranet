/**
 * Vocabularios (PDF por nivel/grado, año lectivo).
 * Admin/Promotoría: todo el colegio. Docente: grados a su cargo. Alumno: solo lectura de su nivel+grado.
 */
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { query, execute } = require('../utils/mysql');
const { authenticateToken } = require('../middleware/auth');
const { fechaHoraMySQLLima } = require('../utils/fechaHoraLima');

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

async function gradosAlcanceDocente(colegio_id, anio_activo, personal_id) {
  if (!personal_id) return [];
  const rows = await query(
    `SELECT DISTINCT g.nivel_id, g.grado, n.nombre AS nivel_nombre
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
     ORDER BY n.nombre, g.grado`,
    [colegio_id, anio_activo, personal_id, colegio_id, personal_id]
  );
  return rows || [];
}

async function gradosTodosColegio(colegio_id, anio_activo) {
  const rows = await query(
    `SELECT DISTINCT g.nivel_id, g.grado, n.nombre AS nivel_nombre
     FROM grupos g
     INNER JOIN niveles n ON n.id = g.nivel_id
     WHERE g.colegio_id = ? AND g.anio = ?
     ORDER BY n.nombre, g.grado`,
    [colegio_id, anio_activo]
  );
  return rows || [];
}

function inTupleList(rows, nivel_id, grado) {
  return rows.some((r) => Number(r.nivel_id) === Number(nivel_id) && Number(r.grado) === Number(grado));
}

async function alumnoNivelGrado(colegio_id, anio_activo, usuario_id) {
  const rows = await query(
    `SELECT g.nivel_id, g.grado
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

router.use(authenticateToken);

/** Opciones de nivel+grado para selects */
router.get('/opciones-grado', async (req, res) => {
  try {
    const { colegio_id, anio_activo, tipo, personal_id } = req.user;
    const anio = parseInt(anio_activo, 10) || new Date().getFullYear();
    if (esAdminOPromo(tipo)) {
      const opciones = await gradosTodosColegio(colegio_id, anio);
      return res.json({ opciones });
    }
    if (tipo === 'DOCENTE') {
      const opciones = await gradosAlcanceDocente(colegio_id, anio, personal_id);
      return res.json({ opciones });
    }
    return res.status(403).json({ error: 'No autorizado' });
  } catch (err) {
    console.error('vocabularios opciones-grado:', err);
    res.status(500).json({ error: err.message || 'Error' });
  }
});

/** Listado según rol */
router.get('/', async (req, res) => {
  try {
    const { colegio_id, anio_activo, tipo, personal_id, usuario_id } = req.user;
    const anio = parseInt(anio_activo, 10) || new Date().getFullYear();

    let sql = `
      SELECT v.id, v.colegio_id, v.anio, v.nivel_id, v.grado, v.titulo, v.descripcion,
             v.nombre_archivo_original, v.ruta_almacenamiento, v.personal_id, v.usuario_creador_id,
             v.created_at, v.updated_at,
             n.nombre AS nivel_nombre,
             TRIM(CONCAT(COALESCE(p.nombres, ''), ' ', COALESCE(p.apellidos, ''))) AS docente_nombre
      FROM vocabularios v
      INNER JOIN niveles n ON n.id = v.nivel_id
      LEFT JOIN personal p ON p.id = v.personal_id
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
      const grados = await gradosAlcanceDocente(colegio_id, anio, personal_id);
      if (!grados.length) {
        return res.json({ items: [] });
      }
      const ph = grados.map(() => '(?, ?)').join(', ');
      const flat = grados.flatMap((g) => [g.nivel_id, g.grado]);
      sql += ` AND (v.nivel_id, v.grado) IN (${ph}) ORDER BY v.created_at DESC`;
      const list = await query(sql, [...params, ...flat]);
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
      const ng = await alumnoNivelGrado(colegio_id, anio, usuario_id);
      if (!ng) {
        return res.json({ items: [] });
      }
      sql += ' AND v.nivel_id = ? AND v.grado = ? ORDER BY v.created_at DESC';
      const list = await query(sql, [...params, ng.nivel_id, ng.grado]);
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
    if (err.message && err.message.includes("doesn't exist")) {
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
    const nivel_id = parseInt(req.body.nivel_id, 10);
    const grado = parseInt(req.body.grado, 10);
    const titulo = String(req.body.titulo || '').trim();
    const descripcion = req.body.descripcion != null ? String(req.body.descripcion).trim().slice(0, 1000) : null;

    if (!nivel_id || Number.isNaN(grado) || !titulo) {
      fs.unlink(req.file.path, () => {});
      return res.status(400).json({ error: 'Nivel, grado y título son obligatorios' });
    }

    const niv = await query(`SELECT id FROM niveles WHERE id = ? AND colegio_id = ? LIMIT 1`, [nivel_id, colegio_id]);
    if (!niv.length) {
      fs.unlink(req.file.path, () => {});
      return res.status(400).json({ error: 'Nivel no válido' });
    }

    if (esAdminOPromo(tipo)) {
      const okGrado = await query(
        `SELECT 1 FROM grupos g WHERE g.colegio_id = ? AND g.anio = ? AND g.nivel_id = ? AND g.grado = ? LIMIT 1`,
        [colegio_id, anio, nivel_id, grado]
      );
      if (!okGrado.length) {
        fs.unlink(req.file.path, () => {});
        return res.status(400).json({ error: 'No existe un grupo con ese nivel y grado en el año lectivo' });
      }
    } else if (tipo === 'DOCENTE') {
      const grados = await gradosAlcanceDocente(colegio_id, anio, personal_id);
      if (!inTupleList(grados, nivel_id, grado)) {
        fs.unlink(req.file.path, () => {});
        return res.status(403).json({ error: 'No puede publicar para ese grado' });
      }
    } else {
      fs.unlink(req.file.path, () => {});
      return res.status(403).json({ error: 'No autorizado' });
    }

    const rel = `vocabularios/${req.file.filename}`;
    const now = fechaHoraMySQLLima();
    await execute(
      `INSERT INTO vocabularios
       (colegio_id, anio, nivel_id, grado, titulo, descripcion, nombre_archivo_original, ruta_almacenamiento, personal_id, usuario_creador_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        colegio_id,
        anio,
        nivel_id,
        grado,
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
    res.status(201).json({ success: true });
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
    const nivel_id = req.body.nivel_id != null ? parseInt(req.body.nivel_id, 10) : cur.nivel_id;
    const grado = req.body.grado != null ? parseInt(req.body.grado, 10) : cur.grado;
    const titulo = req.body.titulo != null ? String(req.body.titulo).trim() : cur.titulo;
    const descripcion = req.body.descripcion !== undefined ? (req.body.descripcion ? String(req.body.descripcion).trim().slice(0, 1000) : null) : cur.descripcion;

    const niv = await query(`SELECT id FROM niveles WHERE id = ? AND colegio_id = ? LIMIT 1`, [nivel_id, colegio_id]);
    if (!niv.length) {
      if (req.file?.path) fs.unlink(req.file.path, () => {});
      return res.status(400).json({ error: 'Nivel no válido' });
    }

    if (esAdminOPromo(tipo)) {
      const okGrado = await query(
        `SELECT 1 FROM grupos g WHERE g.colegio_id = ? AND g.anio = ? AND g.nivel_id = ? AND g.grado = ? LIMIT 1`,
        [colegio_id, anio, nivel_id, grado]
      );
      if (!okGrado.length) {
        if (req.file?.path) fs.unlink(req.file.path, () => {});
        return res.status(400).json({ error: 'No existe un grupo con ese nivel y grado en el año lectivo' });
      }
    } else {
      const grados = await gradosAlcanceDocente(colegio_id, anio, personal_id);
      if (!inTupleList(grados, nivel_id, grado)) {
        if (req.file?.path) fs.unlink(req.file.path, () => {});
        return res.status(403).json({ error: 'No puede asignar ese grado' });
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
    await execute(
      `UPDATE vocabularios SET
         nivel_id = ?, grado = ?, titulo = ?, descripcion = ?,
         nombre_archivo_original = ?, ruta_almacenamiento = ?, usuario_creador_id = ?, updated_at = ?
       WHERE id = ? AND colegio_id = ?`,
      [nivel_id, grado, titulo, descripcion, nombreOrig, ruta, usuario_id, now, id, colegio_id]
    );
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
