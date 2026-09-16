/**
 * CNEB en el aula virtual del alumno (Inicial).
 * Solo lectura: propósito, momentos y ficha. Sin cotejo ni corte.
 */
const express = require('express');
const router = express.Router();
const { query, getAnioActivo } = require('../utils/mysql');
const { authenticateToken } = require('../middleware/auth');
const { cargarSesion } = require('../utils/cnebSesionStore');
const { sesionPdfBuffer } = require('../utils/cnebPdfs');
const { contextoAulaCneb, listarSesionesAula, vistaAlumnoSesion } = require('../utils/cnebAulaAsignatura');

router.use(authenticateToken);
router.use((req, res, next) => {
  if (req.user?.tipo === 'ALUMNO') return next();
  return res.status(403).json({ error: 'Solo el alumno usa este módulo.' });
});

function colegio(req) {
  const n = Number(req.user?.colegio_id);
  return Number.isFinite(n) ? n : null;
}

async function asignaturaDelAlumno(req, asignaturaId) {
  const alumnoId = req.user?.alumno_id;
  const cid = colegio(req);
  const anio = req.user?.anio_activo || (await getAnioActivo(cid));
  if (!alumnoId || !cid || !asignaturaId) return null;
  const [row] = await query(
    `SELECT a.id
     FROM asignaturas a
     INNER JOIN grupos g ON g.id = a.grupo_id
     INNER JOIN matriculas m ON m.grupo_id = g.id
     WHERE a.id = ? AND m.alumno_id = ? AND m.colegio_id = ? AND g.anio = ?
       AND (m.estado = 0)
     LIMIT 1`,
    [asignaturaId, alumnoId, cid, anio]
  );
  return row || null;
}

router.get('/aula/:asignaturaId', async (req, res) => {
  try {
    const cid = colegio(req);
    const asignaturaId = parseInt(req.params.asignaturaId, 10);
    if (!cid || !asignaturaId) return res.status(400).json({ error: 'Faltan datos.' });
    if (!(await asignaturaDelAlumno(req, asignaturaId))) {
      return res.status(403).json({ error: 'No tienes acceso a este curso.' });
    }
    const ctx = await contextoAulaCneb(cid, asignaturaId);
    if (!ctx) return res.status(404).json({ error: 'Curso no encontrado.' });
    const sesiones = ctx.es_inicial ? await listarSesionesAula(cid, ctx) : [];
    res.json({
      ...ctx,
      sesiones: (sesiones || [])
        .filter((s) => s.estado === 'aprobada')
        .map((s) => ({
        id: s.id,
        titulo: s.titulo,
        proposito: s.proposito,
        duracion_min: s.duracion_min,
        fecha_sesion: s.fecha_sesion,
        estado: s.estado,
        area_nombre: s.area_nombre,
      })),
    });
  } catch (e) {
    console.error('[alumno/cneb/aula]', e);
    res.status(500).json({ error: e.message || 'No se pudo abrir el aula.' });
  }
});

router.get('/sesiones/:id/pdf', async (req, res) => {
  try {
    const cid = colegio(req);
    const id = parseInt(req.params.id, 10);
    if (!cid || !id) return res.status(400).json({ error: 'Datos inválidos.' });
    const ses = await cargarSesion(cid, id);
    if (!ses) return res.status(404).json({ error: 'Sesión no encontrada.' });
    const alumnoId = req.user?.alumno_id;
    const anio = req.user?.anio_activo || (await getAnioActivo(cid));
    const [ok] = await query(
      `SELECT m.id FROM matriculas m
       WHERE m.alumno_id = ? AND m.grupo_id = ? AND m.colegio_id = ? AND m.estado = 0
         AND EXISTS (SELECT 1 FROM grupos g WHERE g.id = m.grupo_id AND g.anio = ?)
       LIMIT 1`,
      [alumnoId, ses.grupo_id, cid, anio]
    );
    if (!ok) return res.status(403).json({ error: 'Esa sesión no es de tu aula.' });
    if (ses.estado !== 'aprobada') {
      return res.status(404).json({ error: 'Sesión no encontrada.' });
    }
    const parte = String(req.query?.parte || 'ficha').toLowerCase() === 'sesion' ? 'sesion' : 'ficha';
    const out = await sesionPdfBuffer(cid, id, { parte, formato: req.query?.formato || 'colegio' });
    if (!out) return res.status(404).json({ error: 'No se pudo generar el PDF.' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${out.filename}"`);
    res.send(Buffer.from(out.buffer));
  } catch (e) {
    console.error('[alumno/cneb pdf]', e);
    res.status(500).json({ error: e.message || 'No se pudo descargar el PDF.' });
  }
});

router.get('/sesiones/:id', async (req, res) => {
  try {
    const cid = colegio(req);
    const id = parseInt(req.params.id, 10);
    if (!cid || !id) return res.status(400).json({ error: 'Datos inválidos.' });
    const ses = await cargarSesion(cid, id);
    if (!ses) return res.status(404).json({ error: 'Sesión no encontrada.' });
    const alumnoId = req.user?.alumno_id;
    const anio = req.user?.anio_activo || (await getAnioActivo(cid));
    const [ok] = await query(
      `SELECT m.id FROM matriculas m
       WHERE m.alumno_id = ? AND m.grupo_id = ? AND m.colegio_id = ? AND m.estado = 0
         AND EXISTS (SELECT 1 FROM grupos g WHERE g.id = m.grupo_id AND g.anio = ?)
       LIMIT 1`,
      [alumnoId, ses.grupo_id, cid, anio]
    );
    if (!ok) return res.status(403).json({ error: 'Esa sesión no es de tu aula.' });
    if (ses.estado !== 'aprobada') {
      return res.status(404).json({ error: 'Sesión no encontrada.' });
    }
    res.json({ sesion: vistaAlumnoSesion(ses) });
  } catch (e) {
    console.error('[alumno/cneb/sesion]', e);
    res.status(500).json({ error: e.message || 'No se pudo abrir la sesión.' });
  }
});

module.exports = router;
