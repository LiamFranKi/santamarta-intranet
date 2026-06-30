/**
 * Facturación comercial — productos, ventas, compras, caja chica.
 * Montaje: /api/admin/facturacion
 */
const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { query } = require('../utils/mysql');
const { obtenerSiguienteNumero, getBoletaConfigPorSede } = require('../utils/boletasVentaNumeracion');
const catalogo = require('../utils/facturacionCatalogo');
const ventas = require('../utils/facturacionVentas');
const compras = require('../utils/facturacionCompras');
const caja = require('../utils/facturacionCaja');

router.use(authenticateToken);

function colegioId(req) {
  return req.user.colegio_id;
}

function puedeFacturacion(req) {
  const t = req.user?.tipo;
  return t === 'ADMINISTRADOR' || t === 'SECRETARIA' || t === 'CAJERO';
}

function puedeCatalogo(req) {
  const t = req.user?.tipo;
  return t === 'ADMINISTRADOR' || t === 'SECRETARIA';
}

router.use((req, res, next) => {
  if (!puedeFacturacion(req)) {
    return res.status(403).json({ error: 'No autorizado para facturación.' });
  }
  next();
});

/** GET /meta — sedes, árbol catálogo, series */
router.get('/meta', async (req, res) => {
  try {
    const cid = colegioId(req);
    const sedes = await query(`SELECT id, nombre FROM sedes WHERE colegio_id = ? ORDER BY nombre`, [cid]);
    const arbol = await catalogo.arbolCatalogoVenta(cid);
    const configs = [];
    for (const s of sedes || []) {
      const cfg = await getBoletaConfigPorSede(s.id);
      if (cfg) {
        configs.push({
          sede_id: s.id,
          serie: cfg.serie,
          numero: cfg.numero,
          serie_2: cfg.serie_2,
          numero_2: cfg.numero_2,
          serie_3: cfg.serie_3,
          numero_3: cfg.numero_3,
        });
      }
    }
    res.json({ sedes: sedes || [], catalogo: arbol, numeracion: configs });
  } catch (e) {
    console.error('[facturacion/meta]', e);
    res.status(500).json({ error: e.message || 'Error al cargar meta' });
  }
});

/** GET /ventas/siguiente-numero?sede_id=&serie=1 */
router.get('/ventas/siguiente-numero', async (req, res) => {
  try {
    const sedeId = parseInt(req.query.sede_id, 10);
    const serie = parseInt(req.query.serie, 10) || 1;
    const result = await obtenerSiguienteNumero(sedeId, serie);
    if (!result.ok) return res.status(result.status || 400).json({ error: result.error });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ——— Categorías ———
router.get('/categorias', async (req, res) => {
  try {
    res.json({ items: await catalogo.listarCategorias(colegioId(req)) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/categorias', async (req, res) => {
  if (!puedeCatalogo(req)) return res.status(403).json({ error: 'Solo administrador o secretaría.' });
  const r = await catalogo.crearCategoria(colegioId(req), req.body);
  if (!r.ok) return res.status(r.status || 400).json({ error: r.error });
  res.status(201).json(r);
});

router.put('/categorias/:id', async (req, res) => {
  if (!puedeCatalogo(req)) return res.status(403).json({ error: 'Solo administrador o secretaría.' });
  const r = await catalogo.actualizarCategoria(colegioId(req), parseInt(req.params.id, 10), req.body);
  if (!r.ok) return res.status(r.status || 400).json({ error: r.error });
  res.json(r);
});

router.delete('/categorias/:id', async (req, res) => {
  if (!puedeCatalogo(req)) return res.status(403).json({ error: 'Solo administrador o secretaría.' });
  const r = await catalogo.eliminarCategoria(colegioId(req), parseInt(req.params.id, 10));
  if (!r.ok) return res.status(r.status || 400).json({ error: r.error });
  res.json(r);
});

// ——— Subcategorías ———
router.get('/subcategorias', async (req, res) => {
  try {
    const catId = req.query.categoria_id ? parseInt(req.query.categoria_id, 10) : null;
    res.json({ items: await catalogo.listarSubcategorias(colegioId(req), catId) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/subcategorias', async (req, res) => {
  if (!puedeCatalogo(req)) return res.status(403).json({ error: 'Solo administrador o secretaría.' });
  const r = await catalogo.crearSubcategoria(colegioId(req), req.body);
  if (!r.ok) return res.status(r.status || 400).json({ error: r.error });
  res.status(201).json(r);
});

router.put('/subcategorias/:id', async (req, res) => {
  if (!puedeCatalogo(req)) return res.status(403).json({ error: 'Solo administrador o secretaría.' });
  const r = await catalogo.actualizarSubcategoria(colegioId(req), parseInt(req.params.id, 10), req.body);
  if (!r.ok) return res.status(r.status || 400).json({ error: r.error });
  res.json(r);
});

router.delete('/subcategorias/:id', async (req, res) => {
  if (!puedeCatalogo(req)) return res.status(403).json({ error: 'Solo administrador o secretaría.' });
  const r = await catalogo.eliminarSubcategoria(colegioId(req), parseInt(req.params.id, 10));
  if (!r.ok) return res.status(r.status || 400).json({ error: r.error });
  res.json(r);
});

// ——— Productos (conceptos) ———
router.get('/productos', async (req, res) => {
  try {
    const catId = req.query.categoria_id ? parseInt(req.query.categoria_id, 10) : null;
    const ocultos = req.query.ocultos === '1';
    res.json({ items: await catalogo.listarConceptos(colegioId(req), { categoriaId: catId, ocultos }) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/productos', async (req, res) => {
  if (!puedeCatalogo(req)) return res.status(403).json({ error: 'Solo administrador o secretaría.' });
  const r = await catalogo.crearConcepto(colegioId(req), req.body);
  if (!r.ok) return res.status(r.status || 400).json({ error: r.error });
  res.status(201).json(r);
});

router.put('/productos/:id', async (req, res) => {
  if (!puedeCatalogo(req)) return res.status(403).json({ error: 'Solo administrador o secretaría.' });
  const r = await catalogo.actualizarConcepto(colegioId(req), parseInt(req.params.id, 10), req.body);
  if (!r.ok) return res.status(r.status || 400).json({ error: r.error });
  res.json(r);
});

router.delete('/productos/:id', async (req, res) => {
  if (!puedeCatalogo(req)) return res.status(403).json({ error: 'Solo administrador o secretaría.' });
  const r = await catalogo.eliminarConcepto(colegioId(req), parseInt(req.params.id, 10));
  if (!r.ok) return res.status(r.status || 400).json({ error: r.error });
  res.json(r);
});

router.post('/productos/:id/recalcular-stock', async (req, res) => {
  if (!puedeCatalogo(req)) return res.status(403).json({ error: 'Solo administrador o secretaría.' });
  const r = await catalogo.recalcularStockConcepto(colegioId(req), parseInt(req.params.id, 10), req.body);
  if (!r.ok) return res.status(r.status || 400).json({ error: r.error });
  res.json(r);
});

// ——— Ventas ———
router.get('/ventas', async (req, res) => {
  try {
    const items = await ventas.listarVentas(colegioId(req), {
      fecha1: req.query.fecha1,
      fecha2: req.query.fecha2,
      estado: req.query.estado || 'ACTIVO',
    });
    res.json({ items });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/ventas/:id', async (req, res) => {
  const item = await ventas.obtenerVenta(colegioId(req), parseInt(req.params.id, 10));
  if (!item) return res.status(404).json({ error: 'Venta no encontrada' });
  res.json(item);
});

router.post('/ventas', async (req, res) => {
  const r = await ventas.guardarVenta(colegioId(req), req.body, req.user);
  if (!r.ok) return res.status(r.status || 400).json({ error: r.error });
  res.status(201).json(r);
});

router.put('/ventas/:id', async (req, res) => {
  const r = await ventas.guardarVenta(colegioId(req), { ...req.body, id: req.params.id }, req.user);
  if (!r.ok) return res.status(r.status || 400).json({ error: r.error });
  res.json(r);
});

router.post('/ventas/:id/toggle-estado', async (req, res) => {
  const r = await ventas.toggleEstadoVenta(colegioId(req), parseInt(req.params.id, 10));
  if (!r.ok) return res.status(r.status || 400).json({ error: r.error });
  res.json(r);
});

router.post('/ventas/:id/marcar-impresa', async (req, res) => {
  const r = await ventas.marcarImpresa(colegioId(req), parseInt(req.params.id, 10));
  if (!r.ok) return res.status(r.status || 400).json({ error: r.error });
  res.json(r);
});

// ——— Compras ———
router.get('/compras', async (req, res) => {
  try {
    const items = await compras.listarCompras(colegioId(req), {
      desde: req.query.desde,
      hasta: req.query.hasta,
    });
    res.json({ items });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/compras/:id', async (req, res) => {
  const item = await compras.obtenerCompra(colegioId(req), parseInt(req.params.id, 10));
  if (!item) return res.status(404).json({ error: 'Compra no encontrada' });
  res.json(item);
});

router.post('/compras', async (req, res) => {
  const r = await compras.guardarCompra(colegioId(req), req.body);
  if (!r.ok) return res.status(r.status || 400).json({ error: r.error });
  res.status(201).json(r);
});

router.put('/compras/:id', async (req, res) => {
  const r = await compras.guardarCompra(colegioId(req), { ...req.body, id: req.params.id });
  if (!r.ok) return res.status(r.status || 400).json({ error: r.error });
  res.json(r);
});

router.delete('/compras/:id', async (req, res) => {
  const r = await compras.eliminarCompra(colegioId(req), parseInt(req.params.id, 10));
  if (!r.ok) return res.status(r.status || 400).json({ error: r.error });
  res.json(r);
});

// ——— Caja chica ———
router.get('/caja/meta', async (req, res) => {
  try {
    res.json(await caja.metaCaja());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/caja/cuentas', async (req, res) => {
  try {
    const esAdmin = req.user?.tipo === 'ADMINISTRADOR';
    res.json({ items: await caja.listarCuentas(esAdmin) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/caja/cuentas', async (req, res) => {
  if (req.user?.tipo !== 'ADMINISTRADOR') return res.status(403).json({ error: 'Solo administrador.' });
  const r = await caja.guardarCuenta(req.body);
  if (!r.ok) return res.status(r.status || 400).json({ error: r.error });
  res.status(201).json(r);
});

router.put('/caja/cuentas/:id', async (req, res) => {
  if (req.user?.tipo !== 'ADMINISTRADOR') return res.status(403).json({ error: 'Solo administrador.' });
  const r = await caja.guardarCuenta(req.body, parseInt(req.params.id, 10));
  if (!r.ok) return res.status(r.status || 400).json({ error: r.error });
  res.json(r);
});

router.delete('/caja/cuentas/:id', async (req, res) => {
  if (req.user?.tipo !== 'ADMINISTRADOR') return res.status(403).json({ error: 'Solo administrador.' });
  const r = await caja.eliminarCuenta(parseInt(req.params.id, 10));
  if (!r.ok) return res.status(r.status || 400).json({ error: r.error });
  res.json(r);
});

router.get('/caja/cuentas/:id/movimientos', async (req, res) => {
  try {
    res.json({ items: await caja.listarMovimientos(parseInt(req.params.id, 10)) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/caja/movimientos', async (req, res) => {
  const r = await caja.guardarMovimiento(req.body);
  if (!r.ok) return res.status(r.status || 400).json({ error: r.error });
  res.status(201).json(r);
});

router.put('/caja/movimientos/:id', async (req, res) => {
  const r = await caja.guardarMovimiento(req.body, parseInt(req.params.id, 10));
  if (!r.ok) return res.status(r.status || 400).json({ error: r.error });
  res.json(r);
});

router.delete('/caja/movimientos/:id', async (req, res) => {
  const r = await caja.eliminarMovimiento(parseInt(req.params.id, 10));
  if (!r.ok) return res.status(r.status || 400).json({ error: r.error });
  res.json(r);
});

module.exports = router;
