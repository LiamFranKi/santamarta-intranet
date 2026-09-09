/**
 * Admin — Preguntas frecuentes (web pública).
 * Tablas: web_faq_categorias, web_faqs
 */
const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { query, execute } = require('../utils/mysql');

router.use(authenticateToken);
router.use(require('../utils/coordinadorAcceso').requireAdminOCoordinadorGet);

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

function slugify(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ─── Categorías ─────────────────────────────────────────────────────────────

router.get('/categorias', async (_req, res) => {
  try {
    const rows = await query(
      `SELECT c.id, c.codigo, c.etiqueta, c.orden, c.activo,
              (SELECT COUNT(*) FROM web_faqs f WHERE f.categoria_id = c.id) AS total_faqs
       FROM web_faq_categorias c
       ORDER BY c.orden ASC, c.id ASC`
    );
    res.json({ categorias: (rows || []).map(mapActivo) });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al listar categorías.' });
  }
});

router.post('/categorias', async (req, res) => {
  try {
    const b = req.body || {};
    let codigo = String(b.codigo || '').trim() || slugify(b.etiqueta);
    codigo = slugify(codigo);
    const etiqueta = String(b.etiqueta || '').trim();
    if (!codigo || !etiqueta) {
      return res.status(400).json({ error: 'Código y etiqueta obligatorios' });
    }
    const orden = Number.isFinite(Number(b.orden)) ? Number(b.orden) : 0;
    const activo = toBool01(b.activo, 1);
    const r = await execute(
      `INSERT INTO web_faq_categorias (codigo, etiqueta, orden, activo) VALUES (?, ?, ?, ?)`,
      [codigo, etiqueta, orden, activo]
    );
    const rows = await query(`SELECT * FROM web_faq_categorias WHERE id = ?`, [r.insertId]);
    res.status(201).json({ categoria: mapActivo(rows[0]) });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Ese código de categoría ya existe' });
    }
    res.status(500).json({ error: e.message || 'Error al crear categoría.' });
  }
});

router.put('/categorias/:id', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });
    const rows = await query(`SELECT id FROM web_faq_categorias WHERE id = ?`, [id]);
    if (!rows?.length) return res.status(404).json({ error: 'Categoría no encontrada' });

    const b = req.body || {};
    let codigo = String(b.codigo || '').trim();
    codigo = slugify(codigo);
    const etiqueta = String(b.etiqueta || '').trim();
    if (!codigo || !etiqueta) {
      return res.status(400).json({ error: 'Código y etiqueta obligatorios' });
    }
    await execute(
      `UPDATE web_faq_categorias SET codigo = ?, etiqueta = ?, orden = ?, activo = ? WHERE id = ?`,
      [
        codigo,
        etiqueta,
        Number.isFinite(Number(b.orden)) ? Number(b.orden) : 0,
        toBool01(b.activo, 1),
        id,
      ]
    );
    const updated = await query(`SELECT * FROM web_faq_categorias WHERE id = ?`, [id]);
    res.json({ categoria: mapActivo(updated[0]) });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Ese código de categoría ya existe' });
    }
    res.status(500).json({ error: e.message || 'Error al actualizar categoría.' });
  }
});

router.delete('/categorias/:id', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });
    const count = await query(`SELECT COUNT(*) AS n FROM web_faqs WHERE categoria_id = ?`, [id]);
    if (Number(count?.[0]?.n || 0) > 0) {
      return res.status(409).json({
        error: 'No se puede eliminar: tiene preguntas asociadas. Desactívela en su lugar.',
      });
    }
    const r = await execute(`DELETE FROM web_faq_categorias WHERE id = ?`, [id]);
    if (!r?.affectedRows) return res.status(404).json({ error: 'Categoría no encontrada' });
    res.json({ message: 'Categoría eliminada' });
  } catch (e) {
    if (e.code === 'ER_ROW_IS_REFERENCED_2' || e.errno === 1451) {
      return res.status(409).json({
        error: 'No se puede eliminar: tiene preguntas asociadas. Desactívela en su lugar.',
      });
    }
    res.status(500).json({ error: e.message || 'Error al eliminar categoría.' });
  }
});

// ─── Preguntas ──────────────────────────────────────────────────────────────

router.get('/preguntas', async (req, res) => {
  try {
    const params = [];
    let sql = `
      SELECT f.id, f.categoria_id, f.pregunta, f.respuesta, f.orden, f.activo,
             c.codigo AS categoria_codigo, c.etiqueta AS categoria_etiqueta, c.orden AS categoria_orden
      FROM web_faqs f
      INNER JOIN web_faq_categorias c ON c.id = f.categoria_id
      WHERE 1=1
    `;
    if (req.query.categoria_id) {
      const cid = parseId(req.query.categoria_id);
      if (cid) {
        sql += ' AND f.categoria_id = ?';
        params.push(cid);
      }
    }
    if (req.query.activo === '0' || req.query.activo === '1') {
      sql += ' AND f.activo = ?';
      params.push(Number(req.query.activo));
    }
    if (req.query.q && String(req.query.q).trim()) {
      const like = `%${String(req.query.q).trim()}%`;
      sql += ' AND (f.pregunta LIKE ? OR f.respuesta LIKE ?)';
      params.push(like, like);
    }
    sql += ' ORDER BY c.orden ASC, f.orden ASC, f.id ASC';
    const rows = await query(sql, params);
    res.json({ preguntas: (rows || []).map(mapActivo) });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al listar preguntas.' });
  }
});

router.get('/preguntas/:id', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });
    const rows = await query(
      `SELECT f.*, c.codigo AS categoria_codigo, c.etiqueta AS categoria_etiqueta
       FROM web_faqs f
       INNER JOIN web_faq_categorias c ON c.id = f.categoria_id
       WHERE f.id = ? LIMIT 1`,
      [id]
    );
    if (!rows?.length) return res.status(404).json({ error: 'Pregunta no encontrada' });
    res.json({ pregunta: mapActivo(rows[0]) });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al obtener pregunta.' });
  }
});

router.post('/preguntas', async (req, res) => {
  try {
    const b = req.body || {};
    const categoria_id = parseId(b.categoria_id);
    const pregunta = String(b.pregunta || '').trim();
    const respuesta = String(b.respuesta || '').trim();
    if (!categoria_id) return res.status(400).json({ error: 'Categoría obligatoria' });
    if (!pregunta) return res.status(400).json({ error: 'Pregunta obligatoria' });
    if (!respuesta) return res.status(400).json({ error: 'Respuesta obligatoria' });

    const cat = await query(`SELECT id FROM web_faq_categorias WHERE id = ?`, [categoria_id]);
    if (!cat?.length) return res.status(400).json({ error: 'Categoría no existe' });

    const orden = Number.isFinite(Number(b.orden)) ? Number(b.orden) : 0;
    const activo = toBool01(b.activo, 1);
    const r = await execute(
      `INSERT INTO web_faqs (categoria_id, pregunta, respuesta, orden, activo) VALUES (?, ?, ?, ?, ?)`,
      [categoria_id, pregunta, respuesta, orden, activo]
    );
    const rows = await query(`SELECT * FROM web_faqs WHERE id = ?`, [r.insertId]);
    res.status(201).json({ pregunta: mapActivo(rows[0]) });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al crear pregunta.' });
  }
});

router.put('/preguntas/:id', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });
    const rows = await query(`SELECT id FROM web_faqs WHERE id = ?`, [id]);
    if (!rows?.length) return res.status(404).json({ error: 'Pregunta no encontrada' });

    const b = req.body || {};
    const categoria_id = parseId(b.categoria_id);
    const pregunta = String(b.pregunta || '').trim();
    const respuesta = String(b.respuesta || '').trim();
    if (!categoria_id) return res.status(400).json({ error: 'Categoría obligatoria' });
    if (!pregunta) return res.status(400).json({ error: 'Pregunta obligatoria' });
    if (!respuesta) return res.status(400).json({ error: 'Respuesta obligatoria' });

    await execute(
      `UPDATE web_faqs SET categoria_id = ?, pregunta = ?, respuesta = ?, orden = ?, activo = ? WHERE id = ?`,
      [
        categoria_id,
        pregunta,
        respuesta,
        Number.isFinite(Number(b.orden)) ? Number(b.orden) : 0,
        toBool01(b.activo, 1),
        id,
      ]
    );
    const updated = await query(`SELECT * FROM web_faqs WHERE id = ?`, [id]);
    res.json({ pregunta: mapActivo(updated[0]) });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al actualizar pregunta.' });
  }
});

router.delete('/preguntas/:id', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });
    const r = await execute(`DELETE FROM web_faqs WHERE id = ?`, [id]);
    if (!r?.affectedRows) return res.status(404).json({ error: 'Pregunta no encontrada' });
    res.json({ message: 'Pregunta eliminada' });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al eliminar pregunta.' });
  }
});

/** Vista agrupada como la web */
router.get('/preview', async (_req, res) => {
  try {
    const cats = await query(
      `SELECT id, codigo, etiqueta, orden, activo FROM web_faq_categorias WHERE activo = 1 ORDER BY orden ASC, id ASC`
    );
    const faqs = await query(
      `SELECT id, categoria_id, pregunta, respuesta, orden, activo
       FROM web_faqs WHERE activo = 1 ORDER BY orden ASC, id ASC`
    );
    const grupos = (cats || []).map((c) => ({
      ...mapActivo(c),
      preguntas: (faqs || []).filter((f) => Number(f.categoria_id) === Number(c.id)).map(mapActivo),
    }));
    res.json({ grupos });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al generar vista previa.' });
  }
});

module.exports = router;
