/**
 * Vista CNEB para alumno y familia (apoderado / docente como apoderado).
 * Solo título, fecha, área, ficha y evidencias. Sin plan ni cotejo.
 */
const express = require('express');
const { query, getAnioActivo } = require('./mysql');
const { cargarSesion } = require('./cnebSesionStore');
const { sesionPdfBuffer } = require('./cnebPdfs');
const { contextoAulaCneb, listarSesionesAula, vistaAlumnoSesion } = require('./cnebAulaAsignatura');
const { parseBimestre, responderPdfCnebAlumno } = require('./cnebAlumnoPdf');

function colegioId(req) {
  const n = Number(req.user?.colegio_id);
  return Number.isFinite(n) ? n : null;
}

async function anioConsulta(req, cid) {
  return req.user?.anio_activo || (await getAnioActivo(cid));
}

async function alumnoEnAsignatura(cid, alumnoId, asignaturaId, anio) {
  if (!cid || !alumnoId || !asignaturaId || !anio) return false;
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
  return Boolean(row);
}

async function alumnoEnGrupo(cid, alumnoId, grupoId, anio) {
  if (!cid || !alumnoId || !grupoId || !anio) return false;
  const [ok] = await query(
    `SELECT m.id FROM matriculas m
     WHERE m.alumno_id = ? AND m.grupo_id = ? AND m.colegio_id = ? AND m.estado = 0
       AND EXISTS (SELECT 1 FROM grupos g WHERE g.id = m.grupo_id AND g.anio = ?)
     LIMIT 1`,
    [alumnoId, grupoId, cid, anio]
  );
  return Boolean(ok);
}

function resumenSesionFamilia(s) {
  return {
    id: s.id,
    titulo: s.titulo,
    fecha_sesion: s.fecha_sesion,
    area_nombre: s.area_nombre,
  };
}

async function payloadAulaFamilia(cid, asignaturaId) {
  const ctx = await contextoAulaCneb(cid, asignaturaId);
  if (!ctx) return null;
  const sesiones = ctx.es_cneb ? await listarSesionesAula(cid, ctx) : [];
  return {
    ...ctx,
    sesiones: (sesiones || []).filter((s) => s.estado === 'aprobada').map(resumenSesionFamilia),
  };
}

async function sesionVisibleFamilia(cid, alumnoId, sesionId, anio) {
  const ses = await cargarSesion(cid, sesionId);
  if (!ses) return { error: 404, mensaje: 'Sesión no encontrada.' };
  if (!(await alumnoEnGrupo(cid, alumnoId, ses.grupo_id, anio))) {
    return { error: 403, mensaje: 'Esa sesión no es de tu aula.' };
  }
  if (ses.estado !== 'aprobada') return { error: 404, mensaje: 'Sesión no encontrada.' };
  return { ses };
}

function crearRouterCnebFamilia({ resolverAlumno, logTag = 'cneb-familia' }) {
  const router = express.Router({ mergeParams: true });

  async function contextoAlumno(req, res) {
    try {
      return await resolverAlumno(req);
    } catch (e) {
      res.status(403).json({ error: e.message || 'No tienes acceso.' });
      return null;
    }
  }

  router.get('/aula/:asignaturaId', async (req, res) => {
    try {
      const ctxUser = await contextoAlumno(req, res);
      if (!ctxUser) return;
      const { alumnoId, cid, anio } = ctxUser;
      const asignaturaId = parseInt(req.params.asignaturaId, 10);
      if (!cid || !asignaturaId) return res.status(400).json({ error: 'Faltan datos.' });
      if (!(await alumnoEnAsignatura(cid, alumnoId, asignaturaId, anio))) {
        return res.status(403).json({ error: 'No tienes acceso a este curso.' });
      }
      const payload = await payloadAulaFamilia(cid, asignaturaId);
      if (!payload) return res.status(404).json({ error: 'Curso no encontrado.' });
      res.json(payload);
    } catch (e) {
      console.error(`[${logTag}/aula]`, e);
      res.status(500).json({ error: e.message || 'No se pudo abrir el aula.' });
    }
  });

  router.get('/sesiones/:id/pdf', async (req, res) => {
    try {
      const ctxUser = await contextoAlumno(req, res);
      if (!ctxUser) return;
      const { alumnoId, cid, anio } = ctxUser;
      const id = parseInt(req.params.id, 10);
      if (!cid || !id) return res.status(400).json({ error: 'Datos inválidos.' });
      const vis = await sesionVisibleFamilia(cid, alumnoId, id, anio);
      if (vis.error) return res.status(vis.error).json({ error: vis.mensaje });
      const partePedida = String(req.query?.parte || 'ficha').toLowerCase();
      const out = await sesionPdfBuffer(cid, id, {
        parte: partePedida === 'teoria' ? 'teoria' : 'ficha',
        formato: req.query?.formato || 'colegio',
      });
      if (!out) return res.status(404).json({ error: 'No se pudo generar el PDF.' });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${out.filename}"`);
      res.send(Buffer.from(out.buffer));
    } catch (e) {
      console.error(`[${logTag}/pdf]`, e);
      res.status(500).json({ error: e.message || 'No se pudo descargar el PDF.' });
    }
  });

  router.get('/libreta.pdf', async (req, res) => {
    try {
      const ctxUser = await contextoAlumno(req, res);
      if (!ctxUser) return;
      const { alumnoId, cid, anio } = ctxUser;
      const anioQ = parseInt(req.query.anio, 10);
      await responderPdfCnebAlumno(res, cid, {
        alumnoId,
        anio: Number.isFinite(anioQ) && anioQ > 0 ? anioQ : anio,
        bimestre: parseBimestre(req.query.bimestre || req.query.ciclo),
        tipo: 'libreta',
      });
    } catch (e) {
      console.error(`[${logTag}/libreta.pdf]`, e);
      res.status(500).json({ error: e.message || 'No se pudo generar la libreta.' });
    }
  });

  router.get('/informe.pdf', async (req, res) => {
    try {
      const ctxUser = await contextoAlumno(req, res);
      if (!ctxUser) return;
      const { alumnoId, cid, anio } = ctxUser;
      const anioQ = parseInt(req.query.anio, 10);
      await responderPdfCnebAlumno(res, cid, {
        alumnoId,
        anio: Number.isFinite(anioQ) && anioQ > 0 ? anioQ : anio,
        bimestre: parseBimestre(req.query.bimestre || req.query.ciclo),
        tipo: 'informe',
      });
    } catch (e) {
      console.error(`[${logTag}/informe.pdf]`, e);
      res.status(500).json({ error: e.message || 'No se pudo generar el informe.' });
    }
  });

  router.get('/sesiones/:id', async (req, res) => {
    try {
      const ctxUser = await contextoAlumno(req, res);
      if (!ctxUser) return;
      const { alumnoId, cid, anio } = ctxUser;
      const id = parseInt(req.params.id, 10);
      if (!cid || !id) return res.status(400).json({ error: 'Datos inválidos.' });
      const vis = await sesionVisibleFamilia(cid, alumnoId, id, anio);
      if (vis.error) return res.status(vis.error).json({ error: vis.mensaje });
      res.json({ sesion: vistaAlumnoSesion(vis.ses) });
    } catch (e) {
      console.error(`[${logTag}/sesion]`, e);
      res.status(500).json({ error: e.message || 'No se pudo abrir la sesión.' });
    }
  });

  return router;
}

module.exports = {
  colegioId,
  anioConsulta,
  crearRouterCnebFamilia,
  payloadAulaFamilia,
};
