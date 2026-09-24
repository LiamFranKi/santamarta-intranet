/**
 * API Biblioteca: catálogo, ejemplares, separación virtual y préstamos.
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { query, execute } = require('../utils/mysql');
const {
  hoyLima,
  sumarDias,
  dirPortadas,
  portadaUrl,
  puedeGestionarBiblioteca,
  requireModuloBiblioteca,
  requireGestionBiblioteca,
  resolveAlumnoId,
  resolveApoderadoId,
  resolvePersonalId,
  hijosDelApoderado,
  apoderadoPuedeHijo,
  mapLibro,
} = require('../utils/biblioteca');

router.use(authenticateToken);
router.use(requireModuloBiblioteca);

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const uploadPortada = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = dirPortadas(req.user.colegio_id);
      try {
        ensureDir(dir);
        cb(null, dir);
      } catch (e) {
        cb(e);
      }
    },
    filename: (req, file, cb) => {
      const ext = (path.extname(file.originalname || '') || '.jpg').toLowerCase().replace(/[^.a-z0-9]/g, '');
      cb(null, `portada-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext || '.jpg'}`);
    },
  }),
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if ((file.mimetype || '').startsWith('image/')) return cb(null, true);
    cb(new Error('Solo se permiten imágenes de portada'));
  },
});

function sqlCatalogoLibro() {
  return `
    SELECT l.*,
           c.nombre AS categoria_nombre,
           ar.nombre AS area_nombre,
           (SELECT COUNT(*) FROM biblioteca_ejemplares e
             WHERE e.libro_id = l.id AND e.estado <> 'BAJA') AS total_ejemplares,
           (SELECT COUNT(*) FROM biblioteca_ejemplares e
             WHERE e.libro_id = l.id AND e.estado = 'DISPONIBLE') AS disponibles
    FROM biblioteca_libros l
    LEFT JOIN biblioteca_categorias c ON c.id = l.categoria_id
    LEFT JOIN biblioteca_areas ar ON ar.id = l.area_id
  `;
}

function nombrePersonaMov(row) {
  if (row.alumno_nombres) {
    return `${row.alumno_apellidos || ''} ${row.alumno_nombres}`.trim();
  }
  if (row.personal_nombres) {
    return `${row.personal_apellidos || ''} ${row.personal_nombres}`.trim();
  }
  if (row.apoderado_nombres) {
    return `${row.apoderado_apellidos || ''} ${row.apoderado_nombres}`.trim();
  }
  return '—';
}

function sqlMovimientos() {
  return `
    SELECT m.*,
           l.titulo AS libro_titulo, l.autor AS libro_autor, l.portada,
           e.codigo AS ejemplar_codigo, e.estado AS ejemplar_estado,
           TRIM(CONCAT(COALESCE(a.apellido_paterno,''), ' ', COALESCE(a.apellido_materno,''))) AS alumno_apellidos,
           a.nombres AS alumno_nombres,
           p.apellidos AS personal_apellidos, p.nombres AS personal_nombres,
           TRIM(CONCAT(COALESCE(ap.apellido_paterno,''), ' ', COALESCE(ap.apellido_materno,''))) AS apoderado_apellidos,
           ap.nombres AS apoderado_nombres
    FROM biblioteca_movimientos m
    INNER JOIN biblioteca_libros l ON l.id = m.libro_id
    INNER JOIN biblioteca_ejemplares e ON e.id = m.ejemplar_id
    LEFT JOIN alumnos a ON a.id = m.alumno_id
    LEFT JOIN personal p ON p.id = m.personal_id
    LEFT JOIN apoderados ap ON ap.id = m.apoderado_id
  `;
}

function mapMov(row, colegioId) {
  return {
    ...row,
    persona: nombrePersonaMov(row),
    portada_url: portadaUrl(colegioId, row.portada),
  };
}

router.get('/meta', async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const gestionar = await puedeGestionarBiblioteca(req);
    const [categorias, areas] = await Promise.all([
      query(
        `SELECT id, nombre, activo, orden FROM biblioteca_categorias
         WHERE colegio_id = ? ORDER BY orden ASC, nombre ASC`,
        [colegio_id]
      ),
      query(
        `SELECT id, nombre, activo, orden FROM biblioteca_areas
         WHERE colegio_id = ? ORDER BY orden ASC, nombre ASC`,
        [colegio_id]
      ),
    ]);
    let hijos = [];
    if (String(req.user.tipo || '').toUpperCase() === 'APODERADO') {
      const apId = await resolveApoderadoId(req);
      hijos = await hijosDelApoderado(apId, colegio_id);
    }
    res.json({
      puede_gestionar: gestionar,
      categorias: categorias || [],
      areas: areas || [],
      hijos,
    });
  } catch (e) {
    if (e.code === 'ER_NO_SUCH_TABLE') {
      return res.status(503).json({ error: 'Ejecute la migración 107_biblioteca_mysql.sql en phpMyAdmin.' });
    }
    console.error('[biblioteca] meta', e);
    res.status(500).json({ error: e.message || 'Error al cargar biblioteca' });
  }
});

router.get('/catalogo', async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const q = String(req.query.q || '').trim();
    const cat = parseInt(req.query.categoria_id, 10);
    const area = parseInt(req.query.area_id, 10);
    const where = ['l.colegio_id = ?', 'l.activo = 1'];
    const params = [colegio_id];
    if (q) {
      where.push('(l.titulo LIKE ? OR l.autor LIKE ? OR l.isbn LIKE ?)');
      const like = `%${q.replace(/%/g, '')}%`;
      params.push(like, like, like);
    }
    if (Number.isFinite(cat) && cat > 0) {
      where.push('l.categoria_id = ?');
      params.push(cat);
    }
    if (Number.isFinite(area) && area > 0) {
      where.push('l.area_id = ?');
      params.push(area);
    }
    const rows = await query(
      `${sqlCatalogoLibro()} WHERE ${where.join(' AND ')} ORDER BY l.titulo ASC LIMIT 200`,
      params
    );
    res.json({ libros: (rows || []).map((r) => mapLibro(r, colegio_id)) });
  } catch (e) {
    console.error('[biblioteca] catalogo', e);
    res.status(500).json({ error: e.message || 'Error al listar libros' });
  }
});

router.get('/libros/:id', async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const id = parseInt(req.params.id, 10);
    const rows = await query(`${sqlCatalogoLibro()} WHERE l.id = ? AND l.colegio_id = ? LIMIT 1`, [id, colegio_id]);
    if (!rows.length) return res.status(404).json({ error: 'Libro no encontrado' });
    const gestionar = await puedeGestionarBiblioteca(req);
    let ejemplares = [];
    if (gestionar) {
      ejemplares = await query(
        `SELECT id, codigo, estado FROM biblioteca_ejemplares
         WHERE libro_id = ? AND colegio_id = ? ORDER BY id ASC`,
        [id, colegio_id]
      );
    }
    res.json({ libro: mapLibro(rows[0], colegio_id), ejemplares, puede_gestionar: gestionar });
  } catch (e) {
    console.error('[biblioteca] libro', e);
    res.status(500).json({ error: e.message || 'Error al cargar libro' });
  }
});

router.post('/categorias', requireGestionBiblioteca, async (req, res) => {
  try {
    const nombre = String(req.body?.nombre || '').trim().slice(0, 120);
    if (!nombre) return res.status(400).json({ error: 'Indique el nombre de la categoría' });
    const r = await execute(
      `INSERT INTO biblioteca_categorias (colegio_id, nombre) VALUES (?, ?)`,
      [req.user.colegio_id, nombre]
    );
    res.status(201).json({ id: r.insertId, nombre });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al crear categoría' });
  }
});

router.put('/categorias/:id', requireGestionBiblioteca, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const nombre = String(req.body?.nombre || '').trim().slice(0, 120);
    const activo = req.body?.activo === 0 || req.body?.activo === false ? 0 : 1;
    if (!nombre) return res.status(400).json({ error: 'Indique el nombre' });
    const r = await execute(
      `UPDATE biblioteca_categorias SET nombre = ?, activo = ? WHERE id = ? AND colegio_id = ?`,
      [nombre, activo, id, req.user.colegio_id]
    );
    if (!r.affectedRows) return res.status(404).json({ error: 'Categoría no encontrada' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al actualizar categoría' });
  }
});

router.delete('/categorias/:id', requireGestionBiblioteca, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    await execute(`UPDATE biblioteca_libros SET categoria_id = NULL WHERE categoria_id = ? AND colegio_id = ?`, [
      id,
      req.user.colegio_id,
    ]);
    const r = await execute(`DELETE FROM biblioteca_categorias WHERE id = ? AND colegio_id = ?`, [
      id,
      req.user.colegio_id,
    ]);
    if (!r.affectedRows) return res.status(404).json({ error: 'Categoría no encontrada' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al eliminar categoría' });
  }
});

router.post('/areas', requireGestionBiblioteca, async (req, res) => {
  try {
    const nombre = String(req.body?.nombre || '').trim().slice(0, 120);
    if (!nombre) return res.status(400).json({ error: 'Indique el nombre del área' });
    const r = await execute(`INSERT INTO biblioteca_areas (colegio_id, nombre) VALUES (?, ?)`, [
      req.user.colegio_id,
      nombre,
    ]);
    res.status(201).json({ id: r.insertId, nombre });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al crear área' });
  }
});

router.put('/areas/:id', requireGestionBiblioteca, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const nombre = String(req.body?.nombre || '').trim().slice(0, 120);
    const activo = req.body?.activo === 0 || req.body?.activo === false ? 0 : 1;
    if (!nombre) return res.status(400).json({ error: 'Indique el nombre' });
    const r = await execute(
      `UPDATE biblioteca_areas SET nombre = ?, activo = ? WHERE id = ? AND colegio_id = ?`,
      [nombre, activo, id, req.user.colegio_id]
    );
    if (!r.affectedRows) return res.status(404).json({ error: 'Área no encontrada' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al actualizar área' });
  }
});

router.delete('/areas/:id', requireGestionBiblioteca, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    await execute(`UPDATE biblioteca_libros SET area_id = NULL WHERE area_id = ? AND colegio_id = ?`, [
      id,
      req.user.colegio_id,
    ]);
    const r = await execute(`DELETE FROM biblioteca_areas WHERE id = ? AND colegio_id = ?`, [id, req.user.colegio_id]);
    if (!r.affectedRows) return res.status(404).json({ error: 'Área no encontrada' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al eliminar área' });
  }
});

function payloadLibro(body) {
  return {
    titulo: String(body.titulo || '').trim().slice(0, 255),
    autor: String(body.autor || '').trim().slice(0, 255) || null,
    editorial: String(body.editorial || '').trim().slice(0, 255) || null,
    isbn: String(body.isbn || '').trim().slice(0, 40) || null,
    anio: body.anio ? parseInt(body.anio, 10) || null : null,
    categoria_id: body.categoria_id ? parseInt(body.categoria_id, 10) || null : null,
    area_id: body.area_id ? parseInt(body.area_id, 10) || null : null,
    descripcion: String(body.descripcion || '').trim() || null,
  };
}

router.post('/libros', requireGestionBiblioteca, uploadPortada.single('portada'), async (req, res) => {
  try {
    const d = payloadLibro(req.body || {});
    if (!d.titulo) return res.status(400).json({ error: 'El título es obligatorio' });
    const cid = req.user.colegio_id;
    const r = await execute(
      `INSERT INTO biblioteca_libros
        (colegio_id, titulo, autor, editorial, isbn, anio, categoria_id, area_id, descripcion, portada)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [cid, d.titulo, d.autor, d.editorial, d.isbn, d.anio, d.categoria_id, d.area_id, d.descripcion, req.file?.filename || null]
    );
    const libroId = r.insertId;
    const copias = Math.min(50, Math.max(1, parseInt(req.body.ejemplares, 10) || 1));
    for (let i = 0; i < copias; i += 1) {
      await execute(
        `INSERT INTO biblioteca_ejemplares (colegio_id, libro_id, codigo, estado) VALUES (?,?,?, 'DISPONIBLE')`,
        [cid, libroId, `${libroId}-${i + 1}`]
      );
    }
    res.status(201).json({ id: libroId });
  } catch (e) {
    console.error('[biblioteca] crear libro', e);
    res.status(500).json({ error: e.message || 'Error al crear libro' });
  }
});

router.put('/libros/:id', requireGestionBiblioteca, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const d = payloadLibro(req.body || {});
    if (!d.titulo) return res.status(400).json({ error: 'El título es obligatorio' });
    const activo = req.body?.activo === 0 || req.body?.activo === false ? 0 : 1;
    const r = await execute(
      `UPDATE biblioteca_libros
       SET titulo=?, autor=?, editorial=?, isbn=?, anio=?, categoria_id=?, area_id=?, descripcion=?, activo=?
       WHERE id = ? AND colegio_id = ?`,
      [d.titulo, d.autor, d.editorial, d.isbn, d.anio, d.categoria_id, d.area_id, d.descripcion, activo, id, req.user.colegio_id]
    );
    if (!r.affectedRows) return res.status(404).json({ error: 'Libro no encontrado' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al actualizar libro' });
  }
});

router.post('/libros/:id/portada', requireGestionBiblioteca, uploadPortada.single('portada'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!req.file) return res.status(400).json({ error: 'Imagen requerida' });
    const r = await execute(
      `UPDATE biblioteca_libros SET portada = ? WHERE id = ? AND colegio_id = ?`,
      [req.file.filename, id, req.user.colegio_id]
    );
    if (!r.affectedRows) return res.status(404).json({ error: 'Libro no encontrado' });
    res.json({ ok: true, portada_url: portadaUrl(req.user.colegio_id, req.file.filename) });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al subir portada' });
  }
});

router.post('/libros/:id/ejemplares', requireGestionBiblioteca, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const cid = req.user.colegio_id;
    const libro = await query(`SELECT id FROM biblioteca_libros WHERE id = ? AND colegio_id = ? LIMIT 1`, [id, cid]);
    if (!libro.length) return res.status(404).json({ error: 'Libro no encontrado' });
    const cantidad = Math.min(30, Math.max(1, parseInt(req.body?.cantidad, 10) || 1));
    const countRows = await query(
      `SELECT COUNT(*) AS n FROM biblioteca_ejemplares WHERE libro_id = ?`,
      [id]
    );
    const base = Number(countRows[0]?.n || 0);
    const ids = [];
    for (let i = 0; i < cantidad; i += 1) {
      const r = await execute(
        `INSERT INTO biblioteca_ejemplares (colegio_id, libro_id, codigo, estado) VALUES (?,?,?, 'DISPONIBLE')`,
        [cid, id, `${id}-${base + i + 1}`]
      );
      ids.push(r.insertId);
    }
    res.status(201).json({ ok: true, creados: ids.length });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al agregar ejemplares' });
  }
});

router.put('/ejemplares/:id', requireGestionBiblioteca, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const estado = String(req.body?.estado || '').toUpperCase();
    if (estado !== 'BAJA' && estado !== 'DISPONIBLE') {
      return res.status(400).json({ error: 'Solo se puede pasar a BAJA o DISPONIBLE desde aquí.' });
    }
    const rows = await query(
      `SELECT id, estado FROM biblioteca_ejemplares WHERE id = ? AND colegio_id = ? LIMIT 1`,
      [id, req.user.colegio_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Ejemplar no encontrado' });
    if (rows[0].estado === 'PRESTADO' || rows[0].estado === 'SEPARADO') {
      return res.status(409).json({ error: 'El ejemplar está separado o prestado. Cierre el movimiento primero.' });
    }
    await execute(`UPDATE biblioteca_ejemplares SET estado = ? WHERE id = ? AND colegio_id = ?`, [
      estado,
      id,
      req.user.colegio_id,
    ]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al actualizar ejemplar' });
  }
});

async function crearMovimiento({
  colegioId,
  libroId,
  ejemplarId,
  canal,
  estado,
  solicitanteTipo,
  alumnoId,
  personalId,
  apoderadoId,
  dias,
  usuarioId,
  observacion,
}) {
  const hoy = hoyLima();
  const prestamo = estado === 'PRESTADO';
  const venc = prestamo ? sumarDias(hoy, dias) : null;
  await execute(`UPDATE biblioteca_ejemplares SET estado = ? WHERE id = ? AND colegio_id = ?`, [
    prestamo ? 'PRESTADO' : 'SEPARADO',
    ejemplarId,
    colegioId,
  ]);
  const r = await execute(
    `INSERT INTO biblioteca_movimientos
      (colegio_id, libro_id, ejemplar_id, canal, estado, solicitante_tipo,
       alumno_id, personal_id, apoderado_id, dias_prestamo,
       fecha_separacion, fecha_prestamo, fecha_vencimiento, observacion, creado_por_usuario_id)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      colegioId,
      libroId,
      ejemplarId,
      canal,
      estado,
      solicitanteTipo,
      alumnoId || null,
      personalId || null,
      apoderadoId || null,
      dias,
      hoy,
      prestamo ? hoy : null,
      venc,
      observacion || null,
      usuarioId || null,
    ]
  );
  return r.insertId;
}

router.post('/separar', async (req, res) => {
  try {
    const cid = req.user.colegio_id;
    const libroId = parseInt(req.body?.libro_id, 10);
    if (!libroId) return res.status(400).json({ error: 'libro_id requerido' });
    const tipo = String(req.user.tipo || '').toUpperCase();

    let solicitanteTipo = 'PERSONAL';
    let alumnoId = null;
    let personalId = null;
    let apoderadoId = null;

    if (tipo === 'ALUMNO') {
      solicitanteTipo = 'ALUMNO';
      alumnoId = await resolveAlumnoId(req);
      if (!alumnoId) return res.status(400).json({ error: 'No se encontró su ficha de alumno.' });
    } else if (tipo === 'APODERADO') {
      solicitanteTipo = 'APODERADO';
      apoderadoId = await resolveApoderadoId(req);
      alumnoId = parseInt(req.body?.alumno_id, 10);
      if (!apoderadoId || !alumnoId) {
        return res.status(400).json({ error: 'Seleccione el hijo para quien separa el libro.' });
      }
      if (!(await apoderadoPuedeHijo(apoderadoId, alumnoId, cid))) {
        return res.status(403).json({ error: 'Ese estudiante no está a su cargo.' });
      }
    } else {
      personalId = await resolvePersonalId(req);
      if (!personalId) return res.status(400).json({ error: 'No se encontró su ficha de personal.' });
    }

    const ej = await query(
      `SELECT id FROM biblioteca_ejemplares
       WHERE libro_id = ? AND colegio_id = ? AND estado = 'DISPONIBLE'
       ORDER BY id ASC LIMIT 1`,
      [libroId, cid]
    );
    if (!ej.length) return res.status(409).json({ error: 'No hay ejemplares disponibles.' });

    const upd = await execute(
      `UPDATE biblioteca_ejemplares SET estado = 'SEPARADO'
       WHERE id = ? AND colegio_id = ? AND estado = 'DISPONIBLE'`,
      [ej[0].id, cid]
    );
    if (!upd.affectedRows) return res.status(409).json({ error: 'Ese ejemplar acaba de ocuparse. Intente de nuevo.' });

    const hoy = hoyLima();
    const r = await execute(
      `INSERT INTO biblioteca_movimientos
        (colegio_id, libro_id, ejemplar_id, canal, estado, solicitante_tipo,
         alumno_id, personal_id, apoderado_id, dias_prestamo,
         fecha_separacion, observacion, creado_por_usuario_id)
       VALUES (?,?,?,'VIRTUAL','SEPARADO',?,?,?,?,7,?, 'Separación virtual', ?)`,
      [cid, libroId, ej[0].id, solicitanteTipo, alumnoId, personalId, apoderadoId, hoy, req.user.usuario_id]
    );

    res.status(201).json({
      ok: true,
      id: r.insertId,
      mensaje: 'Libro separado. Pase a recogerlo en biblioteca.',
    });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    console.error('[biblioteca] separar', e);
    res.status(500).json({ error: e.message || 'Error al separar el libro' });
  }
});

router.post('/prestamo', requireGestionBiblioteca, async (req, res) => {
  try {
    const cid = req.user.colegio_id;
    const libroId = parseInt(req.body?.libro_id, 10);
    const dias = Math.min(90, Math.max(1, parseInt(req.body?.dias, 10) || 7));
    const destTipo = String(req.body?.destinatario_tipo || '').toUpperCase();
    if (!libroId) return res.status(400).json({ error: 'libro_id requerido' });
    if (!['ALUMNO', 'PERSONAL'].includes(destTipo)) {
      return res.status(400).json({ error: 'Indique si el préstamo es a alumno o personal.' });
    }
    const alumnoId = destTipo === 'ALUMNO' ? parseInt(req.body.alumno_id, 10) : null;
    const personalId = destTipo === 'PERSONAL' ? parseInt(req.body.personal_id, 10) : null;
    if (destTipo === 'ALUMNO' && !alumnoId) return res.status(400).json({ error: 'Seleccione el alumno.' });
    if (destTipo === 'PERSONAL' && !personalId) return res.status(400).json({ error: 'Seleccione el personal.' });

    const ej = await query(
      `SELECT id FROM biblioteca_ejemplares
       WHERE libro_id = ? AND colegio_id = ? AND estado = 'DISPONIBLE'
       ORDER BY id ASC LIMIT 1`,
      [libroId, cid]
    );
    if (!ej.length) return res.status(409).json({ error: 'No hay ejemplares disponibles.' });

    const id = await crearMovimiento({
      colegioId: cid,
      libroId,
      ejemplarId: ej[0].id,
      canal: 'PRESENCIAL',
      estado: 'PRESTADO',
      solicitanteTipo: destTipo,
      alumnoId,
      personalId,
      apoderadoId: null,
      dias,
      usuarioId: req.user.usuario_id,
      observacion: String(req.body?.observacion || '').trim() || 'Préstamo presencial',
    });
    res.status(201).json({ ok: true, id });
  } catch (e) {
    console.error('[biblioteca] prestamo', e);
    res.status(500).json({ error: e.message || 'Error al registrar préstamo' });
  }
});

router.get('/movimientos', async (req, res) => {
  try {
    const cid = req.user.colegio_id;
    const gestionar = await puedeGestionarBiblioteca(req);
    const estado = String(req.query.estado || '').toUpperCase();
    const desde = String(req.query.desde || '').slice(0, 10);
    const hasta = String(req.query.hasta || '').slice(0, 10);
    const campoRaw = String(req.query.fecha_campo || 'PRESTAMO').toUpperCase();
    const campoFecha = {
      PRESTAMO: 'm.fecha_prestamo',
      VENCIMIENTO: 'm.fecha_vencimiento',
      DEVOLUCION: 'm.fecha_devolucion',
      SEPARACION: 'm.fecha_separacion',
    }[campoRaw] || 'm.fecha_prestamo';
    const where = ['m.colegio_id = ?'];
    const params = [cid];
    if (['SEPARADO', 'PRESTADO', 'DEVUELTO', 'CANCELADO', 'NO_RECOGIDO'].includes(estado)) {
      where.push('m.estado = ?');
      params.push(estado);
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(desde)) {
      where.push(`${campoFecha} >= ?`);
      params.push(desde);
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(hasta)) {
      where.push(`${campoFecha} <= ?`);
      params.push(hasta);
    }
    if (!gestionar) {
      const tipo = String(req.user.tipo || '').toUpperCase();
      if (tipo === 'ALUMNO') {
        const alumnoId = await resolveAlumnoId(req);
        where.push('m.alumno_id = ?');
        params.push(alumnoId || 0);
      } else if (tipo === 'APODERADO') {
        const apId = await resolveApoderadoId(req);
        const hijos = await hijosDelApoderado(apId, cid);
        const ids = hijos.map((h) => h.id);
        if (!ids.length) {
          where.push('(m.apoderado_id = ?)');
          params.push(apId || 0);
        } else {
          where.push(`(m.apoderado_id = ? OR m.alumno_id IN (${ids.map(() => '?').join(',')}))`);
          params.push(apId || 0, ...ids);
        }
      } else {
        const pid = await resolvePersonalId(req);
        where.push('m.personal_id = ?');
        params.push(pid || 0);
      }
    }
    const rows = await query(
      `${sqlMovimientos()} WHERE ${where.join(' AND ')} ORDER BY m.id DESC LIMIT 1000`,
      params
    );
    res.json({ movimientos: (rows || []).map((r) => mapMov(r, cid)), puede_gestionar: gestionar });
  } catch (e) {
    console.error('[biblioteca] movimientos', e);
    res.status(500).json({ error: e.message || 'Error al listar movimientos' });
  }
});

async function getMovGestion(id, colegioId) {
  const rows = await query(
    `SELECT * FROM biblioteca_movimientos WHERE id = ? AND colegio_id = ? LIMIT 1`,
    [id, colegioId]
  );
  return rows[0] || null;
}

router.post('/movimientos/:id/entregar', requireGestionBiblioteca, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const dias = Math.min(90, Math.max(1, parseInt(req.body?.dias, 10) || 7));
    const mov = await getMovGestion(id, req.user.colegio_id);
    if (!mov) return res.status(404).json({ error: 'Movimiento no encontrado' });
    if (mov.estado !== 'SEPARADO') return res.status(409).json({ error: 'Solo se entrega un libro separado.' });
    const hoy = hoyLima();
    await execute(
      `UPDATE biblioteca_movimientos
       SET estado = 'PRESTADO', dias_prestamo = ?, fecha_prestamo = ?, fecha_vencimiento = ?
       WHERE id = ? AND colegio_id = ?`,
      [dias, hoy, sumarDias(hoy, dias), id, req.user.colegio_id]
    );
    await execute(`UPDATE biblioteca_ejemplares SET estado = 'PRESTADO' WHERE id = ? AND colegio_id = ?`, [
      mov.ejemplar_id,
      req.user.colegio_id,
    ]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al entregar' });
  }
});

router.post('/movimientos/:id/no-recogido', requireGestionBiblioteca, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const mov = await getMovGestion(id, req.user.colegio_id);
    if (!mov) return res.status(404).json({ error: 'Movimiento no encontrado' });
    if (mov.estado !== 'SEPARADO') return res.status(409).json({ error: 'Solo aplica a reservas no recogidas.' });
    const hoy = hoyLima();
    await execute(
      `UPDATE biblioteca_movimientos SET estado = 'NO_RECOGIDO', fecha_cancelacion = ?, observacion = ?
       WHERE id = ? AND colegio_id = ?`,
      [hoy, String(req.body?.observacion || 'No recogió la reserva').slice(0, 500), id, req.user.colegio_id]
    );
    await execute(`UPDATE biblioteca_ejemplares SET estado = 'DISPONIBLE' WHERE id = ? AND colegio_id = ?`, [
      mov.ejemplar_id,
      req.user.colegio_id,
    ]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al liberar reserva' });
  }
});

router.post('/movimientos/:id/devolver', requireGestionBiblioteca, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const mov = await getMovGestion(id, req.user.colegio_id);
    if (!mov) return res.status(404).json({ error: 'Movimiento no encontrado' });
    if (mov.estado !== 'PRESTADO') return res.status(409).json({ error: 'Solo se devuelve un préstamo activo.' });
    const hoy = hoyLima();
    await execute(
      `UPDATE biblioteca_movimientos SET estado = 'DEVUELTO', fecha_devolucion = ? WHERE id = ? AND colegio_id = ?`,
      [hoy, id, req.user.colegio_id]
    );
    await execute(`UPDATE biblioteca_ejemplares SET estado = 'DISPONIBLE' WHERE id = ? AND colegio_id = ?`, [
      mov.ejemplar_id,
      req.user.colegio_id,
    ]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al devolver' });
  }
});

router.post('/movimientos/:id/cancelar', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const cid = req.user.colegio_id;
    const mov = await getMovGestion(id, cid);
    if (!mov) return res.status(404).json({ error: 'Movimiento no encontrado' });
    if (mov.estado !== 'SEPARADO') return res.status(409).json({ error: 'Solo se puede cancelar una separación.' });
    const gestionar = await puedeGestionarBiblioteca(req);
    if (!gestionar) {
      const tipo = String(req.user.tipo || '').toUpperCase();
      let ok = false;
      if (tipo === 'ALUMNO') ok = mov.alumno_id === (await resolveAlumnoId(req));
      else if (tipo === 'APODERADO') ok = mov.apoderado_id === (await resolveApoderadoId(req));
      else ok = mov.personal_id === (await resolvePersonalId(req));
      if (!ok) return res.status(403).json({ error: 'No puede cancelar esta reserva.' });
    }
    const hoy = hoyLima();
    await execute(
      `UPDATE biblioteca_movimientos SET estado = 'CANCELADO', fecha_cancelacion = ? WHERE id = ? AND colegio_id = ?`,
      [hoy, id, cid]
    );
    await execute(`UPDATE biblioteca_ejemplares SET estado = 'DISPONIBLE' WHERE id = ? AND colegio_id = ?`, [
      mov.ejemplar_id,
      cid,
    ]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al cancelar' });
  }
});

router.get('/buscar-personas', requireGestionBiblioteca, async (req, res) => {
  try {
    const cid = req.user.colegio_id;
    const q = String(req.query.q || '').trim();
    const tipo = String(req.query.tipo || 'ALUMNO').toUpperCase();
    if (q.length < 2) return res.json({ personas: [] });
    const like = `%${q.replace(/%/g, '')}%`;
    if (tipo === 'PERSONAL') {
      const rows = await query(
        `SELECT p.id, CONCAT(p.apellidos, ', ', p.nombres) AS nombre, p.nro_documento AS dni
         FROM personal p
         WHERE p.colegio_id = ?
           AND (p.nombres LIKE ? OR p.apellidos LIKE ? OR p.nro_documento LIKE ?)
         ORDER BY p.apellidos, p.nombres LIMIT 20`,
        [cid, like, like, like]
      );
      return res.json({ personas: rows || [] });
    }
    const rows = await query(
      `SELECT a.id, CONCAT(a.apellido_paterno, ' ', COALESCE(a.apellido_materno,''), ', ', a.nombres) AS nombre,
              a.nro_documento AS dni
       FROM alumnos a
       WHERE a.colegio_id = ?
         AND (a.nombres LIKE ? OR a.apellido_paterno LIKE ? OR a.apellido_materno LIKE ? OR a.nro_documento LIKE ?)
       ORDER BY a.apellido_paterno, a.nombres LIMIT 20`,
      [cid, like, like, like, like]
    );
    res.json({ personas: rows || [] });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al buscar' });
  }
});

module.exports = router;
