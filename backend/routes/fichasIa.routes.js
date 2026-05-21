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
  probarConexionVanguarcito,
  modelosAProbar,
} = require('../services/fichasIa/geminiFichaService');
const { renderFichaHtml } = require('../services/fichasIa/renderFichaHtml');
const { renderFichaPdfYHtml } = require('../services/fichasIa/renderFichaPdf');
const { ensurePlantillaDefault } = require('../services/fichasIa/ensurePlantillaDefault');
const {
  listarGruposOpciones,
  listarCursosPorGrupo,
  etiquetaGrupo,
} = require('../services/fichasIa/fichasIaMeta');

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
    const tieneClave = geminiDisponible();
    let verificacion = null;
    if (req.query.verificar === '1' && tieneClave) {
      verificacion = await probarConexionVanguarcito();
      if (verificacion && verificacion.clave_sufijo) {
        verificacion = { ok: verificacion.ok, codigo: verificacion.codigo, mensaje: verificacion.mensaje, modelo: verificacion.modelo };
      }
    }
    res.json({
      vanguarcito_disponible: tieneClave && (verificacion ? verificacion.ok : true),
      gemini_configurado: tieneClave,
      tiene_clave_servidor: tieneClave,
      verificacion,
      plantillas: plantillas || [],
    });
  } catch (e) {
    console.error('[fichas-ia/config]', e);
    res.status(500).json({ error: e.message || 'Error' });
  }
});

router.get('/vanguarcito/probar', async (req, res) => {
  try {
    const resultado = await probarConexionVanguarcito();
    res.json(resultado);
  } catch (e) {
    console.error('[fichas-ia/vanguarcito/probar]', e);
    res.status(500).json({ ok: false, mensaje: e.message || 'Error al probar' });
  }
});

router.get('/meta/grupos', async (req, res) => {
  try {
    const { colegio_id, anio_activo, tipo, personal_id } = req.user;
    const anio = parseInt(anio_activo, 10) || new Date().getFullYear();
    const opciones = await listarGruposOpciones(colegio_id, anio, { tipo, personal_id });
    res.json({ opciones });
  } catch (e) {
    console.error('[fichas-ia/meta/grupos]', e);
    res.status(500).json({ error: e.message || 'Error' });
  }
});

router.get('/meta/grupos/:grupoId/cursos', async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const grupoId = parseInt(req.params.grupoId, 10);
    if (!Number.isFinite(grupoId)) return res.status(400).json({ error: 'Grupo inválido' });
    const cursos = await listarCursosPorGrupo(colegio_id, grupoId);
    res.json({ cursos });
  } catch (e) {
    console.error('[fichas-ia/meta/cursos]', e);
    res.status(500).json({ error: e.message || 'Error' });
  }
});

router.get('/trabajos', async (req, res) => {
  try {
    const { colegio_id, usuario_id } = req.user;
    const limit = Math.min(parseInt(req.query.limit, 10) || 80, 200);
    const filtroGrupo = parseInt(req.query.grupo_id, 10);
    const filtroAsig = parseInt(req.query.asignatura_id, 10);

    let sql = `
      SELECT t.id, t.titulo, t.grado, t.area, t.unidad, t.estado, t.origen_tipo,
             t.archivo_generado_nombre, t.ia_proveedor, t.creado_en, t.completado_en,
             t.usuario_id, t.grupo_id, t.asignatura_id, t.grupo_etiqueta, t.error_mensaje,
             c.nombre AS curso_nombre
      FROM fichas_ia_trabajos t
      LEFT JOIN asignaturas a ON a.id = t.asignatura_id
      LEFT JOIN cursos c ON c.id = a.curso_id
      WHERE t.colegio_id = ?`;
    const params = [colegio_id];

    if (Number.isFinite(filtroGrupo)) {
      sql += ' AND t.grupo_id = ?';
      params.push(filtroGrupo);
    }
    if (Number.isFinite(filtroAsig)) {
      sql += ' AND t.asignatura_id = ?';
      params.push(filtroAsig);
    }
    sql += ' ORDER BY t.id DESC LIMIT ?';
    params.push(limit);

    const rows = await query(sql, params);
    const data = (rows || []).map((r) => ({
      ...r,
      pdf_url: r.archivo_generado_nombre
        ? urlUploads(`generados/${r.archivo_generado_nombre}`)
        : null,
      puede_editar: Number(r.usuario_id) === Number(usuario_id),
      grupo_display: r.grupo_etiqueta || (r.grado ? `${r.grado}°` : '—'),
      curso_display: r.curso_nombre || r.area || '—',
      generado_con:
        r.ia_proveedor === 'google'
          ? 'vanguarcito'
          : r.error_mensaje && String(r.error_mensaje).includes('Vanguarcito')
            ? 'vanguarcito_parcial'
            : 'formulario',
    }));
    res.json({ data });
  } catch (e) {
    console.error('[fichas-ia/trabajos GET]', e);
    res.status(500).json({ error: e.message || 'Error' });
  }
});

router.put('/trabajos/:id', async (req, res) => {
  try {
    const trabajoId = parseInt(req.params.id, 10);
    const trabajo = await cargarTrabajo(req, trabajoId, { requierePropiedad: true });
    if (!trabajo) return res.status(404).json({ error: 'Trabajo no encontrado o sin permiso' });

    const titulo = String(req.body.titulo || trabajo.titulo || '').trim();
    if (!titulo) return res.status(400).json({ error: 'Indique el título' });

    const { colegio_id } = req.user;
    const grupo_id = parseInt(req.body.grupo_id, 10) || trabajo.grupo_id;
    const asignatura_id = parseInt(req.body.asignatura_id, 10);
    const unidad = String(req.body.unidad || trabajo.unidad || '1').trim();

    let grupo_etiqueta = trabajo.grupo_etiqueta;
    let grado = trabajo.grado;
    let nivel_id = trabajo.nivel_id;
    let curso_id = trabajo.curso_id;
    let area = String(req.body.area || trabajo.area || '').trim() || null;

    if (Number.isFinite(grupo_id)) {
      const grupoRows = await query(
        `SELECT g.id, g.nivel_id, g.grado, g.seccion, n.nombre AS nivel_nombre
         FROM grupos g INNER JOIN niveles n ON n.id = g.nivel_id
         WHERE g.id = ? AND g.colegio_id = ? LIMIT 1`,
        [grupo_id, colegio_id]
      );
      if (grupoRows.length) {
        const gRow = grupoRows[0];
        grupo_etiqueta = etiquetaGrupo(gRow);
        grado = String(gRow.grado ?? '').trim() || null;
        nivel_id = gRow.nivel_id;
      }
    }

    let asigFinal = Number.isFinite(asignatura_id) ? asignatura_id : trabajo.asignatura_id;
    if (Number.isFinite(asigFinal) && Number.isFinite(grupo_id)) {
      const asigRows = await query(
        `SELECT a.curso_id, c.nombre AS curso_nombre
         FROM asignaturas a INNER JOIN cursos c ON c.id = a.curso_id
         WHERE a.id = ? AND a.grupo_id = ? AND a.colegio_id = ? LIMIT 1`,
        [asigFinal, grupo_id, colegio_id]
      );
      if (asigRows.length) {
        curso_id = asigRows[0].curso_id;
        if (!area) area = asigRows[0].curso_nombre;
      }
    }

    await execute(
      `UPDATE fichas_ia_trabajos SET
        titulo = ?, grupo_id = ?, nivel_id = ?, curso_id = ?, asignatura_id = ?,
        grado = ?, area = ?, unidad = ?, grupo_etiqueta = ?
       WHERE id = ?`,
      [
        titulo,
        grupo_id || null,
        nivel_id || null,
        curso_id || null,
        asigFinal || null,
        grado,
        area,
        unidad,
        grupo_etiqueta,
        trabajoId,
      ]
    );

    const puntos_clave = String(req.body.puntos_clave || '').trim();
    const instrucciones_ia = String(req.body.instrucciones_ia || '').trim();
    if (puntos_clave) await upsertSeccionCustom(trabajoId, 'Puntos clave', { puntos_clave });
    if (instrucciones_ia) {
      await upsertSeccionCustom(trabajoId, 'Instrucciones docente', { instrucciones_ia });
    }

    const actualizado = await cargarTrabajo(req, trabajoId, { requierePropiedad: false });
    res.json({ mensaje: 'Ficha actualizada', trabajo: enrichTrabajo(actualizado, req.user.usuario_id) });
  } catch (e) {
    console.error('[fichas-ia/trabajos PUT]', e);
    res.status(500).json({ error: e.message || 'Error' });
  }
});

router.delete('/trabajos/:id', async (req, res) => {
  try {
    const trabajoId = parseInt(req.params.id, 10);
    const trabajo = await cargarTrabajo(req, trabajoId, { requierePropiedad: true });
    if (!trabajo) return res.status(404).json({ error: 'Trabajo no encontrado o sin permiso' });

    await execute(`DELETE FROM fichas_ia_trabajo_secciones WHERE trabajo_id = ?`, [trabajoId]);
    await execute(`DELETE FROM fichas_ia_trabajos WHERE id = ?`, [trabajoId]);

    for (const rel of [trabajo.archivo_origen_nombre, trabajo.archivo_generado_nombre]) {
      if (!rel) continue;
      const sub = trabajo.archivo_origen_nombre === rel ? dirs.origen : dirs.generados;
      const fp = path.join(sub, rel);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    }

    res.json({ mensaje: 'Ficha eliminada' });
  } catch (e) {
    console.error('[fichas-ia/trabajos DELETE]', e);
    res.status(500).json({ error: e.message || 'Error' });
  }
});

router.get('/trabajos/:id', async (req, res) => {
  try {
    const trabajo = await cargarTrabajo(req, parseInt(req.params.id, 10), { requierePropiedad: false });
    if (!trabajo) return res.status(404).json({ error: 'Trabajo no encontrado' });
    const secciones = await query(
      `SELECT id, orden, tipo, titulo, contenido_json FROM fichas_ia_trabajo_secciones
       WHERE trabajo_id = ? ORDER BY orden`,
      [trabajo.id]
    );
    res.json({
      trabajo: enrichTrabajo(trabajo, req.user.usuario_id),
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
    const grupo_id = parseInt(req.body.grupo_id, 10);
    const asignatura_id = parseInt(req.body.asignatura_id, 10);
    if (!Number.isFinite(grupo_id)) {
      return res.status(400).json({ error: 'Seleccione el grupo (nivel, grado y sección)' });
    }
    const grupoRows = await query(
      `SELECT g.id, g.nivel_id, g.grado, g.seccion, n.nombre AS nivel_nombre
       FROM grupos g INNER JOIN niveles n ON n.id = g.nivel_id
       WHERE g.id = ? AND g.colegio_id = ? LIMIT 1`,
      [grupo_id, colegio_id]
    );
    if (!grupoRows.length) return res.status(400).json({ error: 'Grupo no válido' });

    const gRow = grupoRows[0];
    const grupo_etiqueta = etiquetaGrupo(gRow);
    const grado = String(gRow.grado ?? '').trim() || null;
    const nivel_id = gRow.nivel_id;

    let area = String(req.body.area || '').trim() || null;
    let curso_id = null;
    if (Number.isFinite(asignatura_id)) {
      const asigRows = await query(
        `SELECT a.curso_id, c.nombre AS curso_nombre
         FROM asignaturas a INNER JOIN cursos c ON c.id = a.curso_id
         WHERE a.id = ? AND a.grupo_id = ? AND a.colegio_id = ? LIMIT 1`,
        [asignatura_id, grupo_id, colegio_id]
      );
      if (asigRows.length) {
        curso_id = asigRows[0].curso_id;
        if (!area) area = asigRows[0].curso_nombre;
      }
    }

    const unidad = String(req.body.unidad || '').trim() || '1';
    const puntos_clave = String(req.body.puntos_clave || '').trim();
    const instrucciones_ia = String(req.body.instrucciones_ia || '').trim();
    const usar_ia = req.body.usar_ia === '1' || req.body.usar_ia === 'true';

    let origen_tipo = 'FORMULARIO';
    let archivo_origen = null;
    if (req.file) {
      origen_tipo = puntos_clave ? 'PDF_Y_FORMULARIO' : 'PDF';
      archivo_origen = req.file.filename;
    }

    const ins = await execute(
      `INSERT INTO fichas_ia_trabajos (
        colegio_id, usuario_id, plantilla_id, grupo_id, nivel_id, curso_id, asignatura_id,
        titulo, grado, area, unidad, grupo_etiqueta,
        estado, origen_tipo, archivo_origen_nombre, prompt_version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'BORRADOR', ?, ?, 'v1')`,
      [
        colegio_id,
        usuario_id,
        plantilla_id,
        grupo_id,
        nivel_id,
        curso_id,
        Number.isFinite(asignatura_id) ? asignatura_id : null,
        titulo,
        grado,
        area,
        unidad,
        grupo_etiqueta,
        origen_tipo,
        archivo_origen,
      ]
    );
    const trabajoId = ins.insertId;

    if (puntos_clave) {
      await upsertSeccionCustom(trabajoId, 'Puntos clave', { puntos_clave });
    }
    if (instrucciones_ia) {
      await upsertSeccionCustom(trabajoId, 'Instrucciones docente', { instrucciones_ia });
    }

    if (usar_ia && !geminiDisponible()) {
      return res.status(400).json({
        error: 'Vanguarcito no está disponible. El administrador debe activarlo en el servidor.',
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
    const trabajo = await cargarTrabajo(req, trabajoId, { requierePropiedad: true });
    if (!trabajo) return res.status(404).json({ error: 'Trabajo no encontrado o sin permiso' });

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

    const instrRow = await query(
      `SELECT contenido_json FROM fichas_ia_trabajo_secciones
       WHERE trabajo_id = ? AND titulo = 'Instrucciones docente' LIMIT 1`,
      [trabajoId]
    );
    let instruccionesDocente = '';
    if (instrRow.length) {
      try {
        const j = JSON.parse(instrRow[0].contenido_json);
        instruccionesDocente = j.instrucciones_ia || '';
      } catch (_e) {
        /* ignore */
      }
    }

    let contenido;
    let tokens_entrada = null;
    let tokens_salida = null;
    let ia_proveedor = null;
    let ia_modelo = null;
    let aviso_ia = null;

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
          instruccionesDocente,
        });
        contenido = gem.contenido;
        tokens_entrada = gem.tokens_entrada;
        tokens_salida = gem.tokens_salida;
        ia_proveedor = gem.proveedor;
        ia_modelo = gem.modelo;
      } catch (gemErr) {
        console.warn(
          '[fichas-ia] Gemini falló, usando formulario:',
          gemErr.message,
          gemErr.code ? `(${gemErr.code})` : '',
          'modelos:',
          modelosAProbar().join(', ')
        );
        aviso_ia = String(gemErr.message || gemErr).slice(0, 2000);
        contenido = contenidoDesdeFormulario({
          titulo: trabajo.titulo,
          puntosClave,
          textoOrigen,
          area: trabajo.area,
        });
        await execute(
          `UPDATE fichas_ia_trabajos SET error_mensaje = ? WHERE id = ?`,
          [`Vanguarcito: ${aviso_ia}. Se usó modo formulario.`, trabajoId]
        );
      }
    } else {
      const motivo = !geminiDisponible()
        ? 'No hay GOOGLE_AI_API_KEY en el servidor (backend/.env).'
        : !usar_ia
          ? 'Generación sin Vanguarcito (casilla desmarcada).'
          : 'Modo sin IA forzado.';
      await execute(
        `UPDATE fichas_ia_trabajos SET error_mensaje = ? WHERE id = ?`,
        [`Modo formulario: ${motivo}`, trabajoId]
      ).catch(() => {});
      contenido = contenidoDesdeFormulario({
        titulo: trabajo.titulo,
        puntosClave,
        textoOrigen,
        area: trabajo.area,
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
      trabajoId,
      titulo: trabajo.titulo,
      grado: trabajo.grado || '',
      grupoEtiqueta: trabajo.grupo_etiqueta || '',
      area: trabajo.area || 'Área curricular',
      unidad: trabajo.unidad || '1',
      teoria: contenido.teoria,
      aplicacion: contenido.aplicacion,
      intro: contenido.intro,
      recuerda: contenido.recuerda,
      actividades: contenido.actividades,
      pie_motivacional: contenido.pie_motivacional,
      glosario: contenido.glosario,
      ilustraciones: contenido.ilustraciones,
      contenido,
      usoVanguarcito: ia_proveedor === 'google',
      inlineAssets: true,
    };

    let pdfFilename;
    try {
      ({ pdfFilename } = await renderFichaPdfYHtml(ctx, archivoPlantilla, trabajoId));
    } catch (pdfErr) {
      console.error('[fichas-ia/pdf]', pdfErr);
      await execute(
        `UPDATE fichas_ia_trabajos SET estado = 'ERROR', error_mensaje = ? WHERE id = ?`,
        [
          `PDF: ${pdfErr.message}. En el servidor ejecute: cd backend && npm install && pm2 restart all`,
          trabajoId,
        ]
      );
      const esChromeLibs = pdfErr.code === 'PUPPETEER_CHROME_LIBS';
      return res.status(500).json({
        error: esChromeLibs
          ? 'Falta Chromium en el VPS (libatk). Ejecute en PuTTY: sudo apt-get install -y chromium-browser libatk1.0-0 libnss3 libgbm1 && pm2 restart all'
          : pdfErr.code === 'PUPPETEER_MISSING'
            ? 'Falta instalar dependencias PDF en el servidor (npm install en backend).'
            : pdfErr.message || 'Error al generar PDF',
        ayuda_pdf_vps: esChromeLibs
          ? 'Ver docs/FICHAS_IA_PDF_VPS.md en el repositorio.'
          : undefined,
      });
    }

    const costo =
      tokens_entrada != null && tokens_salida != null
        ? (tokens_entrada * 0.1 + tokens_salida * 0.4) / 1e6
        : null;

    await execute(
      `UPDATE fichas_ia_trabajos SET
        estado = 'LISTO',
        error_mensaje = NULL,
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
      mensaje: aviso_ia ? 'Ficha generada en modo formulario (Vanguarcito falló)' : 'Ficha generada correctamente',
      uso_vanguarcito: ia_proveedor === 'google',
      aviso_ia,
      trabajo: enrichTrabajo(actualizado, req.user.usuario_id),
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
    const trabajo = await cargarTrabajo(req, parseInt(req.params.id, 10), { requierePropiedad: false });
    if (!trabajo) return res.status(404).send('No encontrado');
    const contenido = await contenidoDesdeTrabajo(trabajo.id);
    const plantillaRows = await query(
      `SELECT archivo_plantilla FROM fichas_ia_plantillas WHERE id = ? LIMIT 1`,
      [trabajo.plantilla_id]
    );
    const html = renderFichaHtml(
      {
        trabajoId: trabajo.id,
        titulo: trabajo.titulo,
        grado: trabajo.grado || '',
        grupoEtiqueta: trabajo.grupo_etiqueta || '',
        area: trabajo.area || '',
        unidad: trabajo.unidad || '1',
        teoria: contenido.teoria,
        aplicacion: contenido.aplicacion,
        intro: contenido.intro,
        recuerda: contenido.recuerda,
        actividades: contenido.actividades,
        pie_motivacional: contenido.pie_motivacional,
        glosario: contenido.glosario || contenido.teoria?.glosario,
        ilustraciones: contenido.ilustraciones || contenido.teoria?.ilustraciones,
        usoVanguarcito: trabajo.ia_proveedor === 'google',
        inlineAssets: true,
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
    const trabajo = await cargarTrabajo(req, parseInt(req.params.id, 10), { requierePropiedad: false });
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

async function cargarTrabajo(req, id, { requierePropiedad = true } = {}) {
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
  const esAdmin = tipo === 'ADMINISTRADOR' || tipo === 'PROMOTORIA';
  const esPropio = Number(t.usuario_id) === Number(usuario_id);
  if (requierePropiedad && !esAdmin && !esPropio) return null;
  return t;
}

function enrichTrabajo(t, usuario_id) {
  if (!t) return t;
  return {
    ...t,
    pdf_url: t.archivo_generado_nombre
      ? urlUploads(`generados/${t.archivo_generado_nombre}`)
      : null,
    origen_url: t.archivo_origen_nombre
      ? urlUploads(`origen/${t.archivo_origen_nombre}`)
      : null,
    puede_editar: usuario_id != null ? Number(t.usuario_id) === Number(usuario_id) : undefined,
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
    teoria: null,
    aplicacion: null,
  };
  for (const row of rows || []) {
    let j;
    try {
      j = JSON.parse(row.contenido_json);
    } catch (_e) {
      continue;
    }
    if (row.tipo === 'INTRO') {
      contenido.intro = j.texto || j.intro || '';
      if (j.teoria) contenido.teoria = j.teoria;
      if (j.glosario) contenido.glosario = j.glosario;
      if (j.ilustraciones) contenido.ilustraciones = j.ilustraciones;
      if (j.aplicacion_meta) {
        contenido.aplicacion = {
          titulo_seccion: j.aplicacion_meta.titulo_seccion || 'FICHA DE APLICACIÓN',
          instruccion_general: j.aplicacion_meta.instruccion_general || '',
          actividades: [],
        };
      }
    } else if (row.tipo === 'RECUERDA') contenido.recuerda = j.items || j.recuerda || [];
    else if (row.tipo === 'PIE_MOTIVACIONAL') contenido.pie_motivacional = j.texto || '';
    else if (String(row.tipo).startsWith('ACTIVIDAD')) contenido.actividades.push(j);
  }
  if (!contenido.teoria && contenido.intro) {
    contenido.teoria = {
      titulo_seccion: 'Aprendemos el tema',
      parrafos: [contenido.intro],
      recuerda: contenido.recuerda,
    };
  }
  if (!contenido.aplicacion) {
    contenido.aplicacion = {
      titulo_seccion: 'FICHA DE APLICACIÓN',
      instruccion_general: 'Demuestra lo que aprendiste.',
      actividades: contenido.actividades,
    };
  } else {
    contenido.aplicacion.actividades = contenido.actividades;
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

async function upsertSeccionCustom(trabajoId, titulo, data) {
  const exist = await query(
    `SELECT id FROM fichas_ia_trabajo_secciones WHERE trabajo_id = ? AND titulo = ? LIMIT 1`,
    [trabajoId, titulo]
  );
  const json = JSON.stringify(data);
  if (exist.length) {
    await execute(`UPDATE fichas_ia_trabajo_secciones SET contenido_json = ? WHERE id = ?`, [
      json,
      exist[0].id,
    ]);
  } else {
    await execute(
      `INSERT INTO fichas_ia_trabajo_secciones (trabajo_id, orden, tipo, titulo, contenido_json)
       VALUES (?, 0, 'CUSTOM', ?, ?)`,
      [trabajoId, titulo, json]
    );
  }
}

async function guardarSeccionesDesdeContenido(trabajoId, contenido) {
  await execute(`DELETE FROM fichas_ia_trabajo_secciones WHERE trabajo_id = ? AND tipo != 'CUSTOM'`, [
    trabajoId,
  ]);
  let orden = 1;
  await execute(
    `INSERT INTO fichas_ia_trabajo_secciones (trabajo_id, orden, tipo, titulo, contenido_json)
     VALUES (?, ?, 'INTRO', 'Teoría', ?)`,
    [
      trabajoId,
      orden++,
      JSON.stringify({
        texto: contenido.intro,
        teoria: contenido.teoria,
        glosario: contenido.glosario,
        ilustraciones: contenido.ilustraciones,
        aplicacion_meta: contenido.aplicacion
          ? {
              titulo_seccion: contenido.aplicacion.titulo_seccion,
              instruccion_general: contenido.aplicacion.instruccion_general,
            }
          : null,
      }),
    ]
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
