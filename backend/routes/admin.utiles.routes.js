/**
 * Admin — Lista de útiles (web pública).
 * Tablas: web_utiles_niveles, web_utiles_grados
 * PDFs: WEB_VANGUARD_ROOT/public/utiles/ → ruta /utiles/...
 */
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { authenticateToken } = require('../middleware/auth');
const { query, execute } = require('../utils/mysql');
const {
  ensureWebPublicDir,
  sanitizePdfBasename,
  saveWebPublicPdf,
  removeWebPublicFileIfSafe,
  resolveWebVanguardRoot,
  isUnderRoot,
} = require('../utils/webVanguardFiles');

router.use(authenticateToken);
router.use((req, res, next) => {
  if (req.user?.tipo === 'ADMINISTRADOR') return next();
  return res.status(403).json({ error: 'Solo el administrador puede gestionar la lista de útiles.' });
});

const COLORES = new Set(['pink', 'blue', 'purple']);

function normalizeColor(raw) {
  const s = String(raw || '').trim();
  if (/^#[0-9a-fA-F]{3,8}$/.test(s)) return s.toLowerCase();
  const named = s.toLowerCase();
  if (COLORES.has(named)) return named;
  return null;
}

const uploadPdf = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      const dir = path.join(os.tmpdir(), 'intranet-web-utiles');
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      cb(null, `${Date.now()}-${sanitizePdfBasename(file.originalname)}`);
    },
  }),
  fileFilter: (_req, file, cb) => {
    const ok =
      file.mimetype === 'application/pdf' ||
      String(file.originalname || '')
        .toLowerCase()
        .endsWith('.pdf');
    cb(ok ? null : new Error('Solo se permiten PDF'), ok);
  },
  limits: { fileSize: 30 * 1024 * 1024 },
});

function parseId(raw) {
  const id = parseInt(raw, 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function toBool01(v, fallback = 1) {
  if (Buffer.isBuffer(v)) return v.length && v[0] ? 1 : 0;
  if (v && typeof v === 'object' && Array.isArray(v.data)) return v.data[0] ? 1 : 0;
  if (v === true || v === 1 || v === '1' || v === 'true') return 1;
  if (v === false || v === 0 || v === '0' || v === 'false') return 0;
  return fallback;
}

function mapActivo(row) {
  if (!row) return row;
  return { ...row, activo: toBool01(row.activo, 0) };
}

async function obtenerConfigDescargas() {
  try {
    const rows = await query(
      `SELECT descargas_habilitadas FROM web_utiles_config WHERE id = 1 LIMIT 1`
    );
    if (!rows?.length) {
      await execute(`INSERT INTO web_utiles_config (id, descargas_habilitadas) VALUES (1, 0)`);
      return { descargas_habilitadas: 0 };
    }
    return { descargas_habilitadas: toBool01(rows[0].descargas_habilitadas, 0) };
  } catch (e) {
    if (e && (e.code === 'ER_NO_SUCH_TABLE' || e.errno === 1146)) {
      const err = new Error('Falta ejecutar la migración 076 de lista de útiles (config).');
      err.status = 503;
      throw err;
    }
    throw e;
  }
}

function slugify(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function applyPdfUpload(req, body) {
  if (!req.file) return null;
  const destName = String(body.archivo || req.file.originalname || '').trim();
  return saveWebPublicPdf({
    subdir: 'utiles',
    publicPrefix: 'utiles',
    originalName: req.file.originalname,
    destName,
    tempPath: req.file.path,
  });
}

// ─── Meta ───────────────────────────────────────────────────────────────────

router.get('/meta', (_req, res) => {
  res.json({
    colores: [
      { value: 'pink', label: 'Rosa (Inicial)', hex: '#ec4899' },
      { value: 'blue', label: 'Azul (Primaria)', hex: '#3b82f6' },
      { value: 'purple', label: 'Morado (Secundaria)', hex: '#a855f7' },
    ],
    webRoot: resolveWebVanguardRoot(),
    pdfDir: ensureWebPublicDir('utiles'),
  });
});

router.get('/config', async (_req, res) => {
  try {
    const cfg = await obtenerConfigDescargas();
    res.json({ descargas_habilitadas: !!cfg.descargas_habilitadas });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'Error al leer la configuración.' });
  }
});

router.put('/config', async (req, res) => {
  try {
    const valor = toBool01(req.body?.descargas_habilitadas, 0);
    await obtenerConfigDescargas();
    await execute(`UPDATE web_utiles_config SET descargas_habilitadas = ? WHERE id = 1`, [valor]);
    const cfg = await obtenerConfigDescargas();
    res.json({ descargas_habilitadas: !!cfg.descargas_habilitadas });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'Error al guardar la configuración.' });
  }
});

/** Sirve PDF desde public/utiles para vista previa admin */
router.get('/archivo', (req, res) => {
  try {
    const ruta = String(req.query.ruta || '').trim();
    if (!ruta.startsWith('/utiles/')) {
      return res.status(400).json({ error: 'Ruta inválida' });
    }
    const root = path.resolve(resolveWebVanguardRoot());
    const publicRoot = path.join(root, 'public');
    const abs = path.resolve(publicRoot, ruta.replace(/^[/\\]+/, ''));
    if (!isUnderRoot(abs, path.join(publicRoot, 'utiles'))) {
      return res.status(400).json({ error: 'Ruta fuera de útiles' });
    }
    if (!fs.existsSync(abs)) return res.status(404).json({ error: 'Archivo no encontrado en disco' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${path.basename(abs)}"`);
    return res.sendFile(abs);
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Error al abrir PDF' });
  }
});

// ─── Niveles ────────────────────────────────────────────────────────────────

router.get('/niveles', async (_req, res) => {
  try {
    const rows = await query(
      `SELECT n.id, n.codigo, n.nombre, n.color, n.orden, n.activo,
              (SELECT COUNT(*) FROM web_utiles_grados g WHERE g.nivel_id = n.id) AS total_grados
       FROM web_utiles_niveles n
       ORDER BY n.orden ASC, n.id ASC`
    );
    res.json({ niveles: (rows || []).map(mapActivo) });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al listar niveles.' });
  }
});

router.post('/niveles', async (req, res) => {
  try {
    const b = req.body || {};
    let codigo = slugify(b.codigo || b.nombre);
    const nombre = String(b.nombre || '').trim();
    const color = normalizeColor(b.color || 'blue');
    if (!codigo || !nombre) return res.status(400).json({ error: 'Código y nombre obligatorios' });
    if (!color) return res.status(400).json({ error: 'Color inválido (pink|blue|purple o #hex)' });
    const orden = Number.isFinite(Number(b.orden)) ? Number(b.orden) : 0;
    const activo = toBool01(b.activo, 1);
    const r = await execute(
      `INSERT INTO web_utiles_niveles (codigo, nombre, color, orden, activo) VALUES (?, ?, ?, ?, ?)`,
      [codigo, nombre, color, orden, activo]
    );
    const rows = await query(`SELECT * FROM web_utiles_niveles WHERE id = ?`, [r.insertId]);
    res.status(201).json({ nivel: mapActivo(rows[0]) });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Ese código de nivel ya existe' });
    res.status(500).json({ error: e.message || 'Error al crear nivel.' });
  }
});

router.put('/niveles/:id', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });
    const exists = await query(`SELECT id FROM web_utiles_niveles WHERE id = ?`, [id]);
    if (!exists?.length) return res.status(404).json({ error: 'Nivel no encontrado' });

    const b = req.body || {};
    const codigo = slugify(b.codigo);
    const nombre = String(b.nombre || '').trim();
    const color = normalizeColor(b.color || 'blue');
    if (!codigo || !nombre) return res.status(400).json({ error: 'Código y nombre obligatorios' });
    if (!color) return res.status(400).json({ error: 'Color inválido (pink|blue|purple o #hex)' });

    await execute(
      `UPDATE web_utiles_niveles SET codigo = ?, nombre = ?, color = ?, orden = ?, activo = ? WHERE id = ?`,
      [codigo, nombre, color, Number.isFinite(Number(b.orden)) ? Number(b.orden) : 0, toBool01(b.activo, 1), id]
    );
    const updated = await query(`SELECT * FROM web_utiles_niveles WHERE id = ?`, [id]);
    res.json({ nivel: mapActivo(updated[0]) });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Ese código de nivel ya existe' });
    res.status(500).json({ error: e.message || 'Error al actualizar nivel.' });
  }
});

router.delete('/niveles/:id', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });
    const count = await query(`SELECT COUNT(*) AS n FROM web_utiles_grados WHERE nivel_id = ?`, [id]);
    if (Number(count?.[0]?.n || 0) > 0) {
      return res.status(409).json({
        error: 'No se puede eliminar: tiene grados asociados. Desactívelo en su lugar.',
      });
    }
    const r = await execute(`DELETE FROM web_utiles_niveles WHERE id = ?`, [id]);
    if (!r?.affectedRows) return res.status(404).json({ error: 'Nivel no encontrado' });
    res.json({ message: 'Nivel eliminado' });
  } catch (e) {
    if (e.code === 'ER_ROW_IS_REFERENCED_2' || e.errno === 1451) {
      return res.status(409).json({
        error: 'No se puede eliminar: tiene grados asociados. Desactívelo en su lugar.',
      });
    }
    res.status(500).json({ error: e.message || 'Error al eliminar nivel.' });
  }
});

// ─── Grados ─────────────────────────────────────────────────────────────────

router.get('/grados', async (req, res) => {
  try {
    const params = [];
    let sql = `
      SELECT g.id, g.nivel_id, g.codigo, g.nombre, g.archivo, g.ruta, g.orden, g.activo,
             n.codigo AS nivel_codigo, n.nombre AS nivel_nombre, n.color AS nivel_color, n.orden AS nivel_orden
      FROM web_utiles_grados g
      INNER JOIN web_utiles_niveles n ON n.id = g.nivel_id
      WHERE 1=1
    `;
    if (req.query.nivel_id) {
      const nid = parseId(req.query.nivel_id);
      if (nid) {
        sql += ' AND g.nivel_id = ?';
        params.push(nid);
      }
    }
    if (req.query.q && String(req.query.q).trim()) {
      const like = `%${String(req.query.q).trim()}%`;
      sql += ' AND (g.nombre LIKE ? OR g.codigo LIKE ? OR g.archivo LIKE ?)';
      params.push(like, like, like);
    }
    sql += ' ORDER BY n.orden ASC, g.orden ASC, g.id ASC';
    const rows = await query(sql, params);
    res.json({ grados: (rows || []).map(mapActivo) });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al listar grados.' });
  }
});

router.post('/grados', uploadPdf.single('pdf'), async (req, res) => {
  try {
    const b = req.body || {};
    const nivel_id = parseId(b.nivel_id);
    let codigo = slugify(b.codigo || b.nombre);
    const nombre = String(b.nombre || '').trim();
    if (!nivel_id) return res.status(400).json({ error: 'Nivel obligatorio' });
    if (!codigo || !nombre) return res.status(400).json({ error: 'Código y nombre obligatorios' });

    const nivel = await query(`SELECT id FROM web_utiles_niveles WHERE id = ?`, [nivel_id]);
    if (!nivel?.length) return res.status(400).json({ error: 'Nivel no existe' });

    let archivo = String(b.archivo || '').trim();
    let ruta = String(b.ruta || '').trim();
    const uploaded = applyPdfUpload(req, b);
    if (uploaded) {
      archivo = uploaded.archivo;
      ruta = uploaded.ruta;
    }
    if (!archivo || !ruta) {
      return res.status(400).json({ error: 'Suba un PDF o indique archivo y ruta (/utiles/...)' });
    }
    if (!ruta.startsWith('/utiles/')) {
      ruta = `/utiles/${path.basename(ruta)}`;
    }

    const orden = Number.isFinite(Number(b.orden)) ? Number(b.orden) : 0;
    const activo = toBool01(b.activo, 1);
    const r = await execute(
      `INSERT INTO web_utiles_grados (nivel_id, codigo, nombre, archivo, ruta, orden, activo)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [nivel_id, codigo, nombre, archivo, ruta, orden, activo]
    );
    const rows = await query(`SELECT * FROM web_utiles_grados WHERE id = ?`, [r.insertId]);
    res.status(201).json({ grado: mapActivo(rows[0]) });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Ese código de grado ya existe' });
    res.status(500).json({ error: e.message || 'Error al crear grado.' });
  }
});

router.put('/grados/:id', uploadPdf.single('pdf'), async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });
    const curRows = await query(`SELECT * FROM web_utiles_grados WHERE id = ?`, [id]);
    if (!curRows?.length) return res.status(404).json({ error: 'Grado no encontrado' });
    const cur = curRows[0];

    const b = req.body || {};
    const nivel_id = parseId(b.nivel_id) || cur.nivel_id;
    const codigo = slugify(b.codigo || cur.codigo);
    const nombre = String(b.nombre || cur.nombre || '').trim();
    if (!codigo || !nombre) return res.status(400).json({ error: 'Código y nombre obligatorios' });

    let archivo = String(b.archivo || cur.archivo || '').trim();
    let ruta = String(b.ruta || cur.ruta || '').trim();
    const uploaded = applyPdfUpload(req, { ...b, archivo: b.archivo || archivo });
    if (uploaded) {
      if (cur.ruta && cur.ruta !== uploaded.ruta) removeWebPublicFileIfSafe(cur.ruta);
      archivo = uploaded.archivo;
      ruta = uploaded.ruta;
    }
    if (!ruta.startsWith('/utiles/')) ruta = `/utiles/${path.basename(ruta)}`;

    await execute(
      `UPDATE web_utiles_grados
       SET nivel_id = ?, codigo = ?, nombre = ?, archivo = ?, ruta = ?, orden = ?, activo = ?
       WHERE id = ?`,
      [
        nivel_id,
        codigo,
        nombre,
        archivo,
        ruta,
        Number.isFinite(Number(b.orden)) ? Number(b.orden) : cur.orden,
        toBool01(b.activo, toBool01(cur.activo, 1)),
        id,
      ]
    );
    const updated = await query(`SELECT * FROM web_utiles_grados WHERE id = ?`, [id]);
    res.json({ grado: mapActivo(updated[0]) });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Ese código de grado ya existe' });
    res.status(500).json({ error: e.message || 'Error al actualizar grado.' });
  }
});

router.delete('/grados/:id', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });
    const rows = await query(`SELECT ruta FROM web_utiles_grados WHERE id = ?`, [id]);
    const r = await execute(`DELETE FROM web_utiles_grados WHERE id = ?`, [id]);
    if (!r?.affectedRows) return res.status(404).json({ error: 'Grado no encontrado' });
    if (rows?.[0]?.ruta) removeWebPublicFileIfSafe(rows[0].ruta);
    res.json({ message: 'Grado eliminado' });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al eliminar grado.' });
  }
});

/** Vista agrupada como la web */
router.get('/preview', async (_req, res) => {
  try {
    const niveles = await query(
      `SELECT id, codigo, nombre, color, orden, activo FROM web_utiles_niveles WHERE activo = 1 ORDER BY orden ASC, id ASC`
    );
    const grados = await query(
      `SELECT id, nivel_id, codigo, nombre, archivo, ruta, orden, activo
       FROM web_utiles_grados WHERE activo = 1 ORDER BY orden ASC, id ASC`
    );
    const grupos = (niveles || []).map((n) => ({
      ...mapActivo(n),
      grados: (grados || []).filter((g) => Number(g.nivel_id) === Number(n.id)).map(mapActivo),
    }));
    let descargasHabilitadas = 0;
    try {
      descargasHabilitadas = (await obtenerConfigDescargas()).descargas_habilitadas;
    } catch {
      descargasHabilitadas = 0;
    }
    res.json({
      grupos,
      webRoot: resolveWebVanguardRoot(),
      descargas_habilitadas: !!descargasHabilitadas,
    });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al generar vista previa.' });
  }
});

module.exports = router;
