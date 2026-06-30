/**
 * Catálogo facturación: boletas_categorias, boletas_subcategorias, boletas_conceptos.
 */
const { query, execute, mysqlReadPool } = require('./mysql');

async function listarCategorias(colegioId) {
  return query(
    `SELECT id, nombre, descripcion FROM boletas_categorias
     WHERE colegio_id = ? ORDER BY nombre`,
    [colegioId]
  );
}

async function crearCategoria(colegioId, body) {
  const nombre = String(body.nombre || '').trim();
  if (!nombre) return { ok: false, status: 400, error: 'Nombre requerido' };
  const r = await execute(
    `INSERT INTO boletas_categorias (colegio_id, nombre, descripcion) VALUES (?, ?, ?)`,
    [colegioId, nombre, String(body.descripcion || '').trim()]
  );
  return { ok: true, id: r.insertId };
}

async function actualizarCategoria(colegioId, id, body) {
  const nombre = String(body.nombre || '').trim();
  if (!nombre) return { ok: false, status: 400, error: 'Nombre requerido' };
  const r = await execute(
    `UPDATE boletas_categorias SET nombre = ?, descripcion = ? WHERE id = ? AND colegio_id = ?`,
    [nombre, String(body.descripcion || '').trim(), id, colegioId]
  );
  if (!r.affectedRows) return { ok: false, status: 404, error: 'Categoría no encontrada' };
  return { ok: true };
}

async function eliminarCategoria(colegioId, id) {
  const subs = await query(`SELECT COUNT(*) AS n FROM boletas_subcategorias WHERE categoria_id = ?`, [id]);
  if (parseInt(subs?.[0]?.n, 10) > 0) {
    return { ok: false, status: 400, error: 'No se puede eliminar: tiene subcategorías asociadas.' };
  }
  const r = await execute(`DELETE FROM boletas_categorias WHERE id = ? AND colegio_id = ?`, [id, colegioId]);
  if (!r.affectedRows) return { ok: false, status: 404, error: 'Categoría no encontrada' };
  return { ok: true };
}

async function listarSubcategorias(colegioId, categoriaId = null) {
  let sql = `SELECT s.id, s.categoria_id, s.nombre, s.descripcion, s.concar_igv, s.concar_cuenta, s.starsoft_cuenta,
      c.nombre AS categoria_nombre
     FROM boletas_subcategorias s
     LEFT JOIN boletas_categorias c ON c.id = s.categoria_id
     WHERE s.colegio_id = ?`;
  const params = [colegioId];
  if (categoriaId) {
    sql += ' AND s.categoria_id = ?';
    params.push(categoriaId);
  }
  sql += ' ORDER BY c.nombre, s.nombre';
  return query(sql, params);
}

async function crearSubcategoria(colegioId, body) {
  const nombre = String(body.nombre || '').trim();
  const categoriaId = parseInt(body.categoria_id, 10);
  if (!nombre || !Number.isFinite(categoriaId)) {
    return { ok: false, status: 400, error: 'Categoría y nombre requeridos' };
  }
  const r = await execute(
    `INSERT INTO boletas_subcategorias (colegio_id, categoria_id, nombre, descripcion, concar_igv, concar_cuenta, starsoft_cuenta)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      colegioId,
      categoriaId,
      nombre,
      String(body.descripcion || '').trim(),
      String(body.concar_igv || '').trim(),
      String(body.concar_cuenta || '').trim(),
      String(body.starsoft_cuenta || '').trim(),
    ]
  );
  return { ok: true, id: r.insertId };
}

async function actualizarSubcategoria(colegioId, id, body) {
  const nombre = String(body.nombre || '').trim();
  const categoriaId = parseInt(body.categoria_id, 10);
  if (!nombre || !Number.isFinite(categoriaId)) {
    return { ok: false, status: 400, error: 'Categoría y nombre requeridos' };
  }
  const r = await execute(
    `UPDATE boletas_subcategorias SET categoria_id = ?, nombre = ?, descripcion = ?, concar_igv = ?, concar_cuenta = ?, starsoft_cuenta = ?
     WHERE id = ? AND colegio_id = ?`,
    [
      categoriaId,
      nombre,
      String(body.descripcion || '').trim(),
      String(body.concar_igv || '').trim(),
      String(body.concar_cuenta || '').trim(),
      String(body.starsoft_cuenta || '').trim(),
      id,
      colegioId,
    ]
  );
  if (!r.affectedRows) return { ok: false, status: 404, error: 'Subcategoría no encontrada' };
  return { ok: true };
}

async function eliminarSubcategoria(colegioId, id) {
  const prods = await query(`SELECT COUNT(*) AS n FROM boletas_conceptos WHERE subcategoria_id = ?`, [id]);
  if (parseInt(prods?.[0]?.n, 10) > 0) {
    return { ok: false, status: 400, error: 'No se puede eliminar: tiene productos asociados.' };
  }
  const r = await execute(`DELETE FROM boletas_subcategorias WHERE id = ? AND colegio_id = ?`, [id, colegioId]);
  if (!r.affectedRows) return { ok: false, status: 404, error: 'Subcategoría no encontrada' };
  return { ok: true };
}

async function listarConceptos(colegioId, { categoriaId, ocultos } = {}) {
  let sql = `SELECT p.id, p.categoria_id, p.subcategoria_id, p.descripcion, p.descripcion_proveedor,
      p.controlar_stock, p.stock, p.stock_inicial, p.precio_inicial, p.costo_unitario,
      p.ocultar, p.codigo_existencia, p.tipo_existencia, p.codigo_unidad_medida,
      c.nombre AS categoria_nombre, s.nombre AS subcategoria_nombre
     FROM boletas_conceptos p
     LEFT JOIN boletas_categorias c ON c.id = p.categoria_id
     LEFT JOIN boletas_subcategorias s ON s.id = p.subcategoria_id
     WHERE p.colegio_id = ?`;
  const params = [colegioId];
  if (categoriaId) {
    sql += ' AND p.categoria_id = ?';
    params.push(categoriaId);
  }
  if (!ocultos) sql += ` AND (p.ocultar IS NULL OR p.ocultar = '' OR UPPER(TRIM(p.ocultar)) = 'NO')`;
  sql += ' ORDER BY c.nombre, p.descripcion';
  return query(sql, params);
}

async function crearConcepto(colegioId, body) {
  const descripcion = String(body.descripcion || '').trim();
  const categoriaId = parseInt(body.categoria_id, 10);
  const subcategoriaId = parseInt(body.subcategoria_id, 10) || 0;
  if (!descripcion || !Number.isFinite(categoriaId)) {
    return { ok: false, status: 400, error: 'Categoría y descripción requeridos' };
  }
  const r = await execute(
    `INSERT INTO boletas_conceptos (
      colegio_id, categoria_id, subcategoria_id, descripcion, descripcion_proveedor,
      controlar_stock, stock, stock_inicial, precio_inicial, costo_unitario, ocultar,
      codigo_existencia, tipo_existencia, codigo_unidad_medida
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      colegioId,
      categoriaId,
      subcategoriaId || null,
      descripcion,
      String(body.descripcion_proveedor || '').trim(),
      String(body.controlar_stock || 'NO').toUpperCase() === 'SI' ? 'SI' : 'NO',
      parseFloat(body.stock) || 0,
      parseFloat(body.stock_inicial) || parseFloat(body.stock) || 0,
      parseFloat(body.precio_inicial) || 0,
      parseFloat(body.costo_unitario) || 0,
      String(body.ocultar || 'NO').toUpperCase() === 'SI' ? 'SI' : 'NO',
      String(body.codigo_existencia || '').trim(),
      String(body.tipo_existencia || '').trim(),
      String(body.codigo_unidad_medida || '').trim(),
    ]
  );
  return { ok: true, id: r.insertId };
}

async function actualizarConcepto(colegioId, id, body) {
  const descripcion = String(body.descripcion || '').trim();
  const categoriaId = parseInt(body.categoria_id, 10);
  if (!descripcion || !Number.isFinite(categoriaId)) {
    return { ok: false, status: 400, error: 'Categoría y descripción requeridos' };
  }
  const subcategoriaId = parseInt(body.subcategoria_id, 10) || null;
  const r = await execute(
    `UPDATE boletas_conceptos SET
      categoria_id = ?, subcategoria_id = ?, descripcion = ?, descripcion_proveedor = ?,
      controlar_stock = ?, precio_inicial = ?, costo_unitario = ?, ocultar = ?,
      codigo_existencia = ?, tipo_existencia = ?, codigo_unidad_medida = ?
     WHERE id = ? AND colegio_id = ?`,
    [
      categoriaId,
      subcategoriaId,
      descripcion,
      String(body.descripcion_proveedor || '').trim(),
      String(body.controlar_stock || 'NO').toUpperCase() === 'SI' ? 'SI' : 'NO',
      parseFloat(body.precio_inicial) || 0,
      parseFloat(body.costo_unitario) || 0,
      String(body.ocultar || 'NO').toUpperCase() === 'SI' ? 'SI' : 'NO',
      String(body.codigo_existencia || '').trim(),
      String(body.tipo_existencia || '').trim(),
      String(body.codigo_unidad_medida || '').trim(),
      id,
      colegioId,
    ]
  );
  if (!r.affectedRows) return { ok: false, status: 404, error: 'Producto no encontrado' };
  return { ok: true };
}

async function eliminarConcepto(colegioId, id) {
  const r = await execute(`DELETE FROM boletas_conceptos WHERE id = ? AND colegio_id = ?`, [id, colegioId]);
  if (!r.affectedRows) return { ok: false, status: 404, error: 'Producto no encontrado' };
  return { ok: true };
}

/** Legacy do_actualizar_stock */
async function recalcularStockConcepto(colegioId, conceptoId, body) {
  const stockInicial = parseFloat(body.stock_inicial);
  const precioInicial = parseFloat(body.precio_inicial);
  if (!Number.isFinite(stockInicial) || stockInicial <= 0) {
    return { ok: false, status: 400, error: 'Stock inicial debe ser mayor a 0' };
  }

  const [ventas] = await query(
    `SELECT COALESCE(SUM(d.cantidad), 0) AS total
     FROM boletas_detalles d
     INNER JOIN boletas b ON b.id = d.boleta_id
     WHERE b.colegio_id = ? AND d.concepto_id = ? AND b.estado = 'ACTIVO'`,
    [colegioId, conceptoId]
  );
  const [compras] = await query(
    `SELECT COALESCE(SUM(d.cantidad), 0) AS total
     FROM boletas_ingresos_detalles d
     INNER JOIN boletas_ingresos i ON i.id = d.boleta_ingreso_id
     WHERE i.colegio_id = ? AND d.concepto_id = ? AND i.estado = 'ACTIVO'`,
    [colegioId, conceptoId]
  );

  const v = parseFloat(ventas?.total) || 0;
  const c = parseFloat(compras?.total) || 0;
  const stock = stockInicial - v + c;

  const r = await execute(
    `UPDATE boletas_conceptos SET stock = ?, stock_inicial = ?, precio_inicial = ?
     WHERE id = ? AND colegio_id = ?`,
    [stock, stockInicial, precioInicial || 0, conceptoId, colegioId]
  );
  if (!r.affectedRows) return { ok: false, status: 404, error: 'Producto no encontrado' };
  return { ok: true, stock };
}

/** Árbol categorías → conceptos para formulario ventas */
async function arbolCatalogoVenta(colegioId) {
  const categorias = await listarCategorias(colegioId);
  const conceptos = await listarConceptos(colegioId, { ocultos: false });
  return categorias.map((cat) => ({
    ...cat,
    conceptos: conceptos
      .filter((p) => Number(p.categoria_id) === Number(cat.id))
      .map((p) => ({
        id: p.id,
        descripcion: p.descripcion,
        precio_inicial: p.precio_inicial,
        stock: p.stock,
        controlar_stock: p.controlar_stock,
        subcategoria_id: p.subcategoria_id,
      })),
  }));
}

module.exports = {
  listarCategorias,
  crearCategoria,
  actualizarCategoria,
  eliminarCategoria,
  listarSubcategorias,
  crearSubcategoria,
  actualizarSubcategoria,
  eliminarSubcategoria,
  listarConceptos,
  crearConcepto,
  actualizarConcepto,
  eliminarConcepto,
  recalcularStockConcepto,
  arbolCatalogoVenta,
};
