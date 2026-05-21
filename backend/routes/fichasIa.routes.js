/**
 * Diseñador de fichas pedagógicas (IA opcional con Gemini).
 * Archivos solo en intranet2026/backend/uploads/fichas-ia y assets locales.
 */
const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { query, execute } = require('../utils/mysql');
const { authenticateToken } = require('../middleware/auth');
const { ensureFichasIaDirs, dirs, urlUploads } = require('../utils/fichasIaPaths');
const { extractPdfText } = require('../services/fichasIa/extractPdfText');
const {
  geminiDisponible,
  estructurarContenidoConGemini,
  contenidoDesdeFormulario,
} = require('../services/fichasIa/geminiFichaService');
const { renderFichaHtml } = require('../services/fichasIa/renderFichaHtml');
const { renderFichaPdfYHtml } = require('../services/fichasIa/renderFichaPdf');
const { ensurePlantillaDefault } = require('../services/fichasIa/ensurePlantillaDefault');

const router = express.Router();

ensureFichasIaDirs();

const puedeUsar = (tipo) =>
  tipo === 'ADMINISTRADOR' || tipo === 'DOCENTE' || tipo === 'PROMOTORIA';

const uploadOrigen = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      ensureFichasIaDirs();
      cb(null, dirs.origen);
    },
    filename: (_req, file, cb) => {
      const safe = (file.originalname || 'origen.pdf').replace(/[^a-zA-Z0-9._-]/g, '_');
      cb(null, `origen-${Date.now()}-${safe}`);
    },
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok =
      /\.pdf$/i.test(file.originalname || '') &&
      (file.mimetype === 'application/pdf' || file.mimetype === 'application/x-pdf');
    if (ok) cb(null, true);
    else cb(new Error('Solo se permiten archivos PDF'));
  },
});

router.use(authenticateToken);
router.use((req, res, next) => {
  if (!req.user || !puedeUsar(req.user.tipo)) {
    return res.status(403).json({ error: 'No tienes permiso para usar el diseñador de fichas' });
  }
  next();
});

router.get('/config', async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const plantillas = await query(
      `SELECT id, codigo, nombre, grado, area, archivo_plantilla, version
       FROM fichas_ia_plantillas WHERE colegio_id = ? AND activo = 1 ORDER BY nombre`,
      [colegio_id]
    );
    res.json({
      gemini_configurado: geminiDisponible(),
      plantillas: plantillas || [],
      assets_nota:
        'Coloque logo-vanguard.png en backend/public/assets/fichas-ia/ para el encabezado.',
    });
  } catch (e) {
    console.error('[fichas-ia/config]', e);
    res.status(500).json({ error: e.message || 'Error' });
  }
});

router.get('/trabajos', async (req, res) => {
  try {
    const { colegio_id, usuario_id } = req.user;
    const limit = Math.min(parseInt(req.query.limit, 10) || 30, 100);
    const rows = await query(
      `SELECT id, titulo, grado, area, unidad, estado, origen_tipo,
              archivo_generado_nombre, ia_proveedor, creado_en, completado_en
       FROM fichas_ia_trabajos
       WHERE colegio_id = ? AND usuario_id = ?
       ORDER BY id DESC LIMIT ?`,
      [colegio_id, usuario_id, limit]
    );
    const data = (rows || []).map((r) => ({
      ...r,
      pdf_url: r.archivo_generado_nombre
        ? urlUploads(`generados/${r.archivo_generado_nombre}`)
        : null,
    }));
    res.json({ data });
  } catch (e) {
    console.error('[fichas-ia/trabajos GET]', e);
    res.status(500).json({ error: e.message || 'Error' });
  }
});

router.get('/trabajos/:id', async (req, res) => {
  try {
    const trabajo = await cargarTrabajo(req, parseInt(req.params.id, 10));
    if (!trabajo) return res.status(404).json({ error: 'Trabajo no encontrado' });
    const secciones = await query(
      `SELECT id, orden, tipo, titulo, contenido_json FROM fichas_ia_trabajo_secciones
       WHERE trabajo_id = ? ORDER BY orden`,
      [trabajo.id]
    );
    res.json({
      trabajo: enrichTrabajo(trabajo),
      secciones: secciones || [],
    });
  } catch (e) {
    console.error('[fichas-ia/trabajos/:id GET]', e);
    res.status(500).json({ error: e.message || 'Error' });
  }
});

router.post('/trabajos', uploadOrigen.single('archivo_pdf'), async (req, res) => {
  try {
    const { colegio_id, usuario_id } = req.user;
    const titulo = String(req.body.titulo || '').trim();
    if (!titulo) return res.status(400).json({ error: 'Indique el título de la ficha' });

    const plantilla_id = await ensurePlantillaDefault(colegio_id);
    const grado = String(req.body.grado || '').trim() || null;
    const area = String(req.body.area || '').trim() || null;
    const unidad = String(req.body.unidad || '').trim() || '1';
    const puntos_clave = String(req.body.puntos_clave || '').trim();
    const usar_ia = req.body.usar_ia === '1' || req.body.usar_ia === 'true';

    let origen_tipo = 'FORMULARIO';
    let archivo_origen = null;
    if (req.file) {
      origen_tipo = puntos_clave ? 'PDF_Y_FORMULARIO' : 'PDF';
      archivo_origen = req.file.filename;
    }

    const ins = await execute(
      `INSERT INTO fichas_ia_trabajos (
        colegio_id, usuario_id, plantilla_id, titulo, grado, area, unidad,
        estado, origen_tipo, archivo_origen_nombre, prompt_version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'BORRADOR', ?, ?, 'v1')`,
      [
        colegio_id,
        usuario_id,
        plantilla_id,
        titulo,
        grado,
        area,
        unidad,
        origen_tipo,
        archivo_origen,
      ]
    );
    const trabajoId = ins.insertId;

    if (puntos_clave) {
      await execute(
        `INSERT INTO fichas_ia_trabajo_secciones (trabajo_id, orden, tipo, titulo, contenido_json)
         VALUES (?, 0, 'CUSTOM', 'Puntos clave', ?)`,
        [trabajoId, JSON.stringify({ puntos_clave })]
      );
    }

    if (usar_ia && !geminiDisponible()) {
      return res.status(400).json({
        error: 'IA no disponible: configure GOOGLE_AI_API_KEY en el servidor.',
        trabajo_id: trabajoId,
      });
    }

    res.status(201).json({
      trabajo_id: trabajoId,
      mensaje: 'Borrador creado. Use Generar para producir la ficha.',
      usar_ia,
    });
  } catch (e) {
    console.error('[fichas-ia/trabajos POST]', e);
    res.status(500).json({ error: e.message || 'Error al crear trabajo' });
  }
});

router.post('/trabajos/:id/generar', async (req, res) => {
  try {
    const trabajoId = parseInt(req.params.id, 10);
    const trabajo = await cargarTrabajo(req, trabajoId);
    if (!trabajo) return res.status(404).json({ error: 'Trabajo no encontrado' });

    const usar_ia = req.body.usar_ia !== false && req.body.usar_ia !== '0';
    const forzar_sin_ia = req.body.sin_ia === true || req.body.sin_ia === '1';

    await execute(`UPDATE fichas_ia_trabajos SET estado = 'EXTRAYENDO' WHERE id = ?`, [trabajoId]);

    let textoOrigen = '';
    if (trabajo.archivo_origen_nombre) {
      const pdfPath = path.join(dirs.origen, trabajo.archivo_origen_nombre);
      textoOrigen = await extractPdfText(pdfPath);
      await execute(
        `UPDATE fichas_ia_trabajos SET texto_extraido = ? WHERE id = ?`,
        [textoOrigen.slice(0, 65000), trabajoId]
      );
    }

    const puntosRow = await query(
      `SELECT contenido_json FROM fichas_ia_trabajo_secciones
       WHERE trabajo_id = ? AND titulo = 'Puntos clave' LIMIT 1`,
      [trabajoId]
    );
    let puntosClave = '';
    if (puntosRow.length) {
      try {
        const j = JSON.parse(puntosRow[0].contenido_json);
        puntosClave = j.puntos_clave || '';
      } catch (_e) {
        /* ignore */
      }
    }

    let contenido;
    let tokens_entrada = null;
    let tokens_salida = null;
    let ia_proveedor = null;
    let ia_modelo = null;

    await execute(`UPDATE fichas_ia_trabajos SET estado = 'IA_PROCESANDO' WHERE id = ?`, [trabajoId]);

    if (usar_ia && !forzar_sin_ia && geminiDisponible()) {
      try {
        const gem = await estructurarContenidoConGemini({
          titulo: trabajo.titulo,
          grado: trabajo.grado,
          area: trabajo.area,
          unidad: trabajo.unidad,
          textoOrigen,
          puntosClave,
        });
        contenido = gem.contenido;
        tokens_entrada = gem.tokens_entrada;
        tokens_salida = gem.tokens_salida;
        ia_proveedor = gem.proveedor;
        ia_modelo = gem.modelo;
      } catch (gemErr) {
        console.warn('[fichas-ia] Gemini falló, usando formulario:', gemErr.message);
        contenido = contenidoDesdeFormulario({
          titulo: trabajo.titulo,
          puntosClave,
          textoOrigen,
        });
        await execute(
          `UPDATE fichas_ia_trabajos SET error_mensaje = ? WHERE id = ?`,
          [`IA: ${gemErr.message}. Se usó modo sin IA.`, trabajoId]
        );
      }
    } else {
      contenido = contenidoDesdeFormulario({
        titulo: trabajo.titulo,
        puntosClave,
        textoOrigen,
      });
    }

    await guardarSeccionesDesdeContenido(trabajoId, contenido);

    await execute(`UPDATE fichas_ia_trabajos SET estado = 'MAQUETANDO' WHERE id = ?`, [trabajoId]);

    const plantillaRows = await query(
      `SELECT archivo_plantilla FROM fichas_ia_plantillas WHERE id = ? LIMIT 1`,
      [trabajo.plantilla_id]
    );
    const archivoPlantilla = plantillaRows[0]?.archivo_plantilla;

    const ctx = {
      titulo: trabajo.titulo,
      grado: trabajo.grado || '',
      area: trabajo.area || 'Área curricular',
      unidad: trabajo.unidad || '1',
      intro: contenido.intro,
      recuerda: contenido.recuerda,
      actividades: contenido.actividades,
      pie_motivacional: contenido.pie_motivacional,
      contenido,
    };

    const { pdfFilename } = await renderFichaPdfYHtml(ctx, archivoPlantilla, trabajoId);

    const costo =
      tokens_entrada != null && tokens_salida != null
        ? (tokens_entrada * 0.1 + tokens_salida * 0.4) / 1e6
        : null;

    await execute(
      `UPDATE fichas_ia_trabajos SET
        estado = 'LISTO',
        archivo_generado_nombre = ?,
        ia_proveedor = ?,
        ia_modelo = ?,
        tokens_entrada = ?,
        tokens_salida = ?,
        costo_estimado_usd = ?,
        completado_en = NOW()
       WHERE id = ?`,
      [pdfFilename, ia_proveedor, ia_modelo, tokens_entrada, tokens_salida, costo, trabajoId]
    );

    const actualizado = await cargarTrabajo(req, trabajoId);
    res.json({
      mensaje: 'Ficha generada correctamente',
      trabajo: enrichTrabajo(actualizado),
      preview_url: `/api/fichas-ia/trabajos/${trabajoId}/preview-html`,
      pdf_url: urlUploads(`generados/${pdfFilename}`),
    });
  } catch (e) {
    console.error('[fichas-ia/generar]', e);
    const trabajoId = parseInt(req.params.id, 10);
    if (Number.isFinite(trabajoId)) {
      await execute(
        `UPDATE fichas_ia_trabajos SET estado = 'ERROR', error_mensaje = ? WHERE id = ?`,
        [String(e.message || e).slice(0, 2000), trabajoId]
      ).catch(() => {});
    }
    const msg = String(e.message || 'Error al generar la ficha');
    res.status(500).json({
      error: msg,
      detalle: e.code || undefined,
    });
  }
});

router.get('/trabajos/:id/preview-html', async (req, res) => {
  try {
    const trabajo = await cargarTrabajo(req, parseInt(req.params.id, 10));
    if (!trabajo) return res.status(404).send('No encontrado');
    const contenido = await contenidoDesdeTrabajo(trabajo.id);
    const plantillaRows = await query(
      `SELECT archivo_plantilla FROM fichas_ia_plantillas WHERE id = ? LIMIT 1`,
      [trabajo.plantilla_id]
    );
    const html = renderFichaHtml(
      {
        titulo: trabajo.titulo,
        grado: trabajo.grado || '',
        area: trabajo.area || '',
        unidad: trabajo.unidad || '1',
        intro: contenido.intro,
        recuerda: contenido.recuerda,
        actividades: contenido.actividades,
        pie_motivacional: contenido.pie_motivacional,
      },
      plantillaRows[0]?.archivo_plantilla
    );
    res.type('html').send(html);
  } catch (e) {
    console.error('[fichas-ia/preview]', e);
    res.status(500).send('Error al generar vista previa');
  }
});

router.get('/trabajos/:id/descargar-pdf', async (req, res) => {
  try {
    const trabajo = await cargarTrabajo(req, parseInt(req.params.id, 10));
    if (!trabajo?.archivo_generado_nombre) {
      return res.status(404).json({ error: 'PDF aún no generado' });
    }
    const pdfPath = path.join(dirs.generados, trabajo.archivo_generado_nombre);
    if (!fs.existsSync(pdfPath)) return res.status(404).json({ error: 'Archivo no encontrado en disco' });
    res.download(pdfPath, trabajo.archivo_generado_nombre);
  } catch (e) {
    console.error('[fichas-ia/descargar]', e);
    res.status(500).json({ error: e.message || 'Error' });
  }
});

async function cargarTrabajo(req, id) {
  const { colegio_id, usuario_id, tipo } = req.user;
  const rows = await query(
    `SELECT t.*, p.archivo_plantilla
     FROM fichas_ia_trabajos t
     LEFT JOIN fichas_ia_plantillas p ON p.id = t.plantilla_id
     WHERE t.id = ? AND t.colegio_id = ? LIMIT 1`,
    [id, colegio_id]
  );
  if (!rows.length) return null;
  const t = rows[0];
  if (tipo !== 'ADMINISTRADOR' && Number(t.usuario_id) !== Number(usuario_id)) {
    return null;
  }
  return t;
}

function enrichTrabajo(t) {
  if (!t) return t;
  return {
    ...t,
    pdf_url: t.archivo_generado_nombre
      ? urlUploads(`generados/${t.archivo_generado_nombre}`)
      : null,
    origen_url: t.archivo_origen_nombre
      ? urlUploads(`origen/${t.archivo_origen_nombre}`)
      : null,
  };
}

async function contenidoDesdeTrabajo(trabajoId) {
  const rows = await query(
    `SELECT tipo, titulo, contenido_json FROM fichas_ia_trabajo_secciones
     WHERE trabajo_id = ? AND tipo != 'CUSTOM' ORDER BY orden`,
    [trabajoId]
  );
  const contenido = {
    intro: '',
    recuerda: [],
    actividades: [],
    pie_motivacional: '',
  };
  for (const row of rows || []) {
    let j;
    try {
      j = JSON.parse(row.contenido_json);
    } catch (_e) {
      continue;
    }
    if (row.tipo === 'INTRO') contenido.intro = j.texto || j.intro || '';
    else if (row.tipo === 'RECUERDA') contenido.recuerda = j.items || j.recuerda || [];
    else if (row.tipo === 'PIE_MOTIVACIONAL') contenido.pie_motivacional = j.texto || '';
    else if (String(row.tipo).startsWith('ACTIVIDAD')) contenido.actividades.push(j);
  }
  if (!contenido.intro && contenido.actividades.length === 0) {
    const introRow = await query(
      `SELECT contenido_json FROM fichas_ia_trabajo_secciones WHERE trabajo_id = ? AND tipo = 'INTRO' LIMIT 1`,
      [trabajoId]
    );
    if (introRow.length) {
      try {
        const j = JSON.parse(introRow[0].contenido_json);
        return { ...contenido, ...j };
      } catch (_e) {
        /* */
      }
    }
  }
  return contenido;
}

async function guardarSeccionesDesdeContenido(trabajoId, contenido) {
  await execute(`DELETE FROM fichas_ia_trabajo_secciones WHERE trabajo_id = ? AND tipo != 'CUSTOM'`, [
    trabajoId,
  ]);
  let orden = 1;
  await execute(
    `INSERT INTO fichas_ia_trabajo_secciones (trabajo_id, orden, tipo, titulo, contenido_json)
     VALUES (?, ?, 'INTRO', 'Introducción', ?)`,
    [trabajoId, orden++, JSON.stringify({ texto: contenido.intro })]
  );
  await execute(
    `INSERT INTO fichas_ia_trabajo_secciones (trabajo_id, orden, tipo, titulo, contenido_json)
     VALUES (?, ?, 'RECUERDA', 'Recuerda', ?)`,
    [trabajoId, orden++, JSON.stringify({ items: contenido.recuerda })]
  );
  for (const act of contenido.actividades || []) {
    const tipo =
      act.tipo === 'tabla_partes' ? 'ACTIVIDAD_TABLA' : 'ACTIVIDAD_PREGUNTAS';
    await execute(
      `INSERT INTO fichas_ia_trabajo_secciones (trabajo_id, orden, tipo, titulo, contenido_json)
       VALUES (?, ?, ?, ?, ?)`,
      [trabajoId, orden++, tipo, act.titulo || 'Actividad', JSON.stringify(act)]
    );
  }
  if (contenido.pie_motivacional) {
    await execute(
      `INSERT INTO fichas_ia_trabajo_secciones (trabajo_id, orden, tipo, titulo, contenido_json)
       VALUES (?, ?, 'PIE_MOTIVACIONAL', 'Pie', ?)`,
      [trabajoId, orden++, JSON.stringify({ texto: contenido.pie_motivacional })]
    );
  }
}

module.exports = router;
