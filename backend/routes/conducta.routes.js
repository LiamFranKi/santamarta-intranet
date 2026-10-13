const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const {
  catalogoAgrupado,
  crearItem,
  actualizarItem,
  eliminarItem,
  guardarAjustes,
  leerAjustes,
  regimenHoy,
  recalcularCicloNuevo,
  buscarAlumnosDocente,
  registrarRapido,
  ANIO_INICIO,
  CICLO_INICIO,
} = require('../utils/conductaCatalogo');

const admin = express.Router();
admin.use(authenticateToken);

function esAdminConducta(tipo) {
  const t = String(tipo || '').toUpperCase();
  return t === 'ADMINISTRADOR' || t === 'SUPERADMINISTRADOR' || t === 'DIRECTOR';
}

admin.use((req, res, next) => {
  if (!esAdminConducta(req.user?.tipo)) {
    return res.status(403).json({ error: 'No tienes permiso para el catálogo de conducta' });
  }
  next();
});

admin.get('/catalogo', async (req, res) => {
  try {
    const data = await catalogoAgrupado(false);
    res.json(data);
  } catch (e) {
    console.error('[conducta] catalogo', e);
    res.status(500).json({ error: 'No se pudo cargar el catálogo de conducta' });
  }
});

admin.put('/ajustes', async (req, res) => {
  try {
    const ajustes = await guardarAjustes(req.body || {});
    const anio = parseInt(req.user?.anio_activo, 10) || new Date().getFullYear();
    let recalculados = 0;
    if (anio > ANIO_INICIO || (anio === ANIO_INICIO && CICLO_INICIO <= 4)) {
      for (let c = 1; c <= 4; c += 1) {
        recalculados += await recalcularCicloNuevo(req.user.colegio_id, anio, c);
      }
    }
    res.json({ ajustes, recalculados });
  } catch (e) {
    res.status(400).json({ error: e.message || 'No se pudieron guardar los ajustes' });
  }
});

admin.post('/items', async (req, res) => {
  try {
    const item = await crearItem(req.body || {});
    res.json({ item });
  } catch (e) {
    const dup = e && (e.code === 'ER_DUP_ENTRY' || String(e.message || '').includes('Duplicate'));
    res.status(400).json({ error: dup ? 'Ese código ya existe' : (e.message || 'No se pudo crear el ítem') });
  }
});

admin.put('/items/:id', async (req, res) => {
  try {
    const item = await actualizarItem(req.params.id, req.body || {});
    res.json({ item });
  } catch (e) {
    const dup = e && (e.code === 'ER_DUP_ENTRY' || String(e.message || '').includes('Duplicate'));
    res.status(400).json({ error: dup ? 'Ese código ya existe' : (e.message || 'No se pudo guardar el ítem') });
  }
});

admin.delete('/items/:id', async (req, res) => {
  try {
    const out = await eliminarItem(req.params.id);
    res.json(out);
  } catch (e) {
    res.status(400).json({ error: e.message || 'No se pudo quitar el ítem' });
  }
});

const docente = express.Router();
docente.use(authenticateToken);

docente.get('/buscar', async (req, res) => {
  try {
    const anio = parseInt(req.user?.anio_activo, 10) || new Date().getFullYear();
    const personalId = parseInt(req.user?.personal_id, 10) || 0;
    const alumnos = await buscarAlumnosDocente({
      colegioId: req.user.colegio_id,
      anio,
      personalId,
      texto: req.query.q,
    });
    let vigente = false;
    try {
      vigente = !!(await regimenHoy(req.user.colegio_id, anio)).nueva;
    } catch (_) { vigente = false; }
    res.json({ alumnos, vigente });
  } catch (e) {
    console.error('[conducta] buscar', e);
    res.status(500).json({ error: 'No se pudo buscar' });
  }
});

docente.post('/registrar', async (req, res) => {
  try {
    const anio = parseInt(req.user?.anio_activo, 10) || new Date().getFullYear();
    const personalId = parseInt(req.user?.personal_id, 10) || 0;
    if (!personalId) return res.status(403).json({ error: 'Tu usuario no está ligado a un docente' });
    const out = await registrarRapido({
      colegioId: req.user.colegio_id,
      anio,
      personalId,
      usuarioId: req.user.usuario_id,
      matriculaId: parseInt(req.body?.matricula_id, 10),
      itemId: parseInt(req.body?.item_id, 10),
    });
    res.json({ success: true, message: 'Falta registrada', nota: out.nota, codigo: out.codigo });
  } catch (e) {
    const status = e.status || 500;
    if (status >= 500) console.error('[conducta] registrar', e);
    res.status(status).json({ error: e.message || 'No se pudo registrar' });
  }
});

docente.get('/catalogo', async (req, res) => {
  try {
    const data = await catalogoAgrupado(true);
    const anio = parseInt(req.user?.anio_activo, 10) || new Date().getFullYear();
    let vigente = false;
    try {
      const reg = await regimenHoy(req.user.colegio_id, anio);
      vigente = !!reg.nueva;
    } catch (e) {
      vigente = false;
    }
    const ajustes = data.ajustes || await leerAjustes();
    res.json({ ...data, ajustes, vigente, anio_inicio: ANIO_INICIO, ciclo_inicio: CICLO_INICIO });
  } catch (e) {
    console.error('[conducta] catalogo docente', e);
    res.status(500).json({ error: 'No se pudo cargar el catálogo' });
  }
});

module.exports = { admin, docente };
