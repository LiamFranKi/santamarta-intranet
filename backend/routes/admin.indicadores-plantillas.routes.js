/**
 * Plantillas de criterios/indicadores (solo niveles cuantitativos).
 * Editar plantilla no modifica asignaturas ya asignadas.
 */
const express = require('express');
const router = express.Router();
const { query, execute } = require('../utils/mysql');
const { authenticateToken } = require('../middleware/auth');
const {
  listarAsignaturasCuantitativas,
  aplicarPlantillaAAsignatura,
  expandirItemsPlantillaPorDesdeCiclo,
  normalizarDesdeCiclo,
} = require('../utils/indicadoresPlantillaService');

router.use(authenticateToken);
router.use((req, res, next) => {
  if (req.user?.tipo === 'ADMINISTRADOR') return next();
  return res.status(403).json({ error: 'Solo el perfil Administrador puede gestionar plantillas de indicadores.' });
});

function colegioId(req) {
  return req.user.colegio_id;
}

async function getPlantillaOr404(colegio_id, plantillaId) {
  const rows = await query(
    `SELECT * FROM indicadores_plantillas WHERE id = ? AND colegio_id = ?`,
    [plantillaId, colegio_id]
  );
  return rows[0] || null;
}

async function getItemsPlantilla(plantillaId) {
  return query(
    `SELECT * FROM indicadores_plantilla_items
     WHERE plantilla_id = ?
     ORDER BY orden ASC, id ASC`,
    [plantillaId]
  );
}

/** GET /api/admin/indicadores-plantillas */
router.get('/', async (req, res) => {
  try {
    const colegio_id = colegioId(req);
    const plantillas = await query(
      `SELECT p.*,
              (SELECT COUNT(*) FROM indicadores_plantilla_items i WHERE i.plantilla_id = p.id) AS total_items
       FROM indicadores_plantillas p
       WHERE p.colegio_id = ?
       ORDER BY p.nombre ASC`,
      [colegio_id]
    );
    res.json({ plantillas });
  } catch (error) {
    console.error('Error listando plantillas:', error);
    res.status(500).json({ error: 'Error al listar plantillas' });
  }
});

/** GET /api/admin/indicadores-plantillas/meta-asignacion */
router.get('/meta-asignacion', async (req, res) => {
  try {
    const colegio_id = colegioId(req);
    const anio = parseInt(req.user.anio_activo, 10);
    const niveles = await query(
      `SELECT id, nombre, tipo_calificacion
       FROM niveles
       WHERE colegio_id = ? AND tipo_calificacion = 1
       ORDER BY nombre ASC`,
      [colegio_id]
    );
    const conteo = await query(
      `SELECT n.id AS nivel_id, n.nombre AS nivel_nombre, COUNT(a.id) AS total_asignaturas
       FROM asignaturas a
       INNER JOIN grupos g ON g.id = a.grupo_id
       INNER JOIN niveles n ON n.id = g.nivel_id
       WHERE a.colegio_id = ? AND g.anio = ? AND n.tipo_calificacion = 1
       GROUP BY n.id, n.nombre
       ORDER BY n.nombre`,
      [colegio_id, anio]
    );
    const cursos = await query(
      `SELECT DISTINCT c.id, c.nombre, n.id AS nivel_id, n.nombre AS nivel_nombre
       FROM asignaturas a
       INNER JOIN grupos g ON g.id = a.grupo_id
       INNER JOIN cursos c ON c.id = a.curso_id
       INNER JOIN niveles n ON n.id = g.nivel_id
       WHERE a.colegio_id = ? AND g.anio = ? AND n.tipo_calificacion = 1
       ORDER BY n.nombre ASC, c.nombre ASC`,
      [colegio_id, anio]
    );
    const asignaturas = await listarAsignaturasCuantitativas(colegio_id, anio, {});
    res.json({
      niveles,
      conteo_por_nivel: conteo,
      cursos,
      asignaturas,
      anio_activo: anio,
    });
  } catch (error) {
    console.error('Error meta asignación:', error);
    res.status(500).json({ error: 'Error al cargar datos de asignación' });
  }
});

/** GET /api/admin/indicadores-plantillas/:id */
router.get('/:id', async (req, res) => {
  try {
    const colegio_id = colegioId(req);
    const plantilla = await getPlantillaOr404(colegio_id, req.params.id);
    if (!plantilla) return res.status(404).json({ error: 'Plantilla no encontrada' });
    const items = await getItemsPlantilla(plantilla.id);
    res.json({ plantilla, items });
  } catch (error) {
    console.error('Error obteniendo plantilla:', error);
    res.status(500).json({ error: 'Error al obtener plantilla' });
  }
});

/** POST /api/admin/indicadores-plantillas */
router.post('/', async (req, res) => {
  try {
    const colegio_id = colegioId(req);
    const { nombre, descripcion } = req.body;
    if (!nombre || !String(nombre).trim()) {
      return res.status(400).json({ error: 'El nombre es obligatorio' });
    }
    const result = await execute(
      `INSERT INTO indicadores_plantillas (colegio_id, nombre, descripcion)
       VALUES (?, ?, ?)`,
      [colegio_id, String(nombre).trim(), (descripcion || '').trim() || null]
    );
    const id = result.insertId;
    const plantilla = await getPlantillaOr404(colegio_id, id);
    res.status(201).json({ plantilla, items: [] });
  } catch (error) {
    console.error('Error creando plantilla:', error);
    res.status(500).json({ error: 'Error al crear plantilla' });
  }
});

/** PUT /api/admin/indicadores-plantillas/:id */
router.put('/:id', async (req, res) => {
  try {
    const colegio_id = colegioId(req);
    const plantilla = await getPlantillaOr404(colegio_id, req.params.id);
    if (!plantilla) return res.status(404).json({ error: 'Plantilla no encontrada' });

    const { nombre, descripcion, activa } = req.body;
    if (nombre !== undefined && !String(nombre).trim()) {
      return res.status(400).json({ error: 'El nombre no puede estar vacío' });
    }

    await execute(
      `UPDATE indicadores_plantillas
       SET nombre = COALESCE(?, nombre),
           descripcion = COALESCE(?, descripcion),
           activa = COALESCE(?, activa)
       WHERE id = ? AND colegio_id = ?`,
      [
        nombre !== undefined ? String(nombre).trim() : null,
        descripcion !== undefined ? (String(descripcion).trim() || null) : null,
        activa !== undefined ? (activa ? 1 : 0) : null,
        plantilla.id,
        colegio_id,
      ]
    );

    const updated = await getPlantillaOr404(colegio_id, plantilla.id);
    const items = await getItemsPlantilla(plantilla.id);
    res.json({ plantilla: updated, items });
  } catch (error) {
    console.error('Error actualizando plantilla:', error);
    res.status(500).json({ error: 'Error al actualizar plantilla' });
  }
});

/** DELETE /api/admin/indicadores-plantillas/:id */
router.delete('/:id', async (req, res) => {
  try {
    const colegio_id = colegioId(req);
    const plantilla = await getPlantillaOr404(colegio_id, req.params.id);
    if (!plantilla) return res.status(404).json({ error: 'Plantilla no encontrada' });
    await execute(`DELETE FROM indicadores_plantillas WHERE id = ? AND colegio_id = ?`, [
      plantilla.id,
      colegio_id,
    ]);
    res.json({ success: true, message: 'Plantilla eliminada' });
  } catch (error) {
    console.error('Error eliminando plantilla:', error);
    res.status(500).json({ error: 'Error al eliminar plantilla' });
  }
});

/** POST /api/admin/indicadores-plantillas/:id/items */
router.post('/:id/items', async (req, res) => {
  try {
    const colegio_id = colegioId(req);
    const plantilla = await getPlantillaOr404(colegio_id, req.params.id);
    if (!plantilla) return res.status(404).json({ error: 'Plantilla no encontrada' });

    const { descripcion, abreviatura, peso, ciclo, cuadros } = req.body;
    if (!descripcion || !String(descripcion).trim()) {
      return res.status(400).json({ error: 'La descripción es obligatoria' });
    }
    const cicloInt =
      ciclo !== undefined && ciclo !== null && ciclo !== '' ? parseInt(ciclo, 10) : 0;
    if (!Number.isFinite(cicloInt) || cicloInt < 0 || cicloInt > 4) {
      return res.status(400).json({ error: 'Bimestre no válido (0=TODOS, 1-4)' });
    }
    const cuadrosInt = Math.max(1, parseInt(cuadros, 10) || 1);

    const maxOrden = await query(
      `SELECT COALESCE(MAX(orden), 0) AS m FROM indicadores_plantilla_items WHERE plantilla_id = ?`,
      [plantilla.id]
    );
    const orden = (maxOrden[0]?.m || 0) + 1;

    await execute(
      `INSERT INTO indicadores_plantilla_items
         (plantilla_id, descripcion, abreviatura, peso, ciclo, cuadros, orden)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        plantilla.id,
        String(descripcion).trim(),
        (abreviatura || '').trim(),
        Math.max(0, parseFloat(peso) || 0),
        cicloInt,
        cuadrosInt,
        orden,
      ]
    );

    const items = await getItemsPlantilla(plantilla.id);
    res.status(201).json({ items });
  } catch (error) {
    console.error('Error creando ítem plantilla:', error);
    res.status(500).json({ error: 'Error al registrar ítem' });
  }
});

/** PUT /api/admin/indicadores-plantillas/:id/items/:itemId */
router.put('/:id/items/:itemId', async (req, res) => {
  try {
    const colegio_id = colegioId(req);
    const plantilla = await getPlantillaOr404(colegio_id, req.params.id);
    if (!plantilla) return res.status(404).json({ error: 'Plantilla no encontrada' });

    const itemRows = await query(
      `SELECT * FROM indicadores_plantilla_items WHERE id = ? AND plantilla_id = ?`,
      [req.params.itemId, plantilla.id]
    );
    if (!itemRows.length) return res.status(404).json({ error: 'Ítem no encontrado' });

    const { descripcion, abreviatura, peso, ciclo, cuadros, orden } = req.body;
    const cicloInt =
      ciclo !== undefined && ciclo !== null && ciclo !== ''
        ? parseInt(ciclo, 10)
        : itemRows[0].ciclo;
    if (!Number.isFinite(cicloInt) || cicloInt < 0 || cicloInt > 4) {
      return res.status(400).json({ error: 'Bimestre no válido' });
    }

    await execute(
      `UPDATE indicadores_plantilla_items SET
         descripcion = COALESCE(?, descripcion),
         abreviatura = COALESCE(?, abreviatura),
         peso = COALESCE(?, peso),
         ciclo = ?,
         cuadros = COALESCE(?, cuadros),
         orden = COALESCE(?, orden)
       WHERE id = ? AND plantilla_id = ?`,
      [
        descripcion !== undefined ? String(descripcion).trim() : null,
        abreviatura !== undefined ? String(abreviatura).trim() : null,
        peso !== undefined ? Math.max(0, parseFloat(peso) || 0) : null,
        cicloInt,
        cuadros !== undefined ? Math.max(1, parseInt(cuadros, 10) || 1) : null,
        orden !== undefined ? parseInt(orden, 10) : null,
        req.params.itemId,
        plantilla.id,
      ]
    );

    const items = await getItemsPlantilla(plantilla.id);
    res.json({ items });
  } catch (error) {
    console.error('Error actualizando ítem:', error);
    res.status(500).json({ error: 'Error al actualizar ítem' });
  }
});

/** DELETE /api/admin/indicadores-plantillas/:id/items/:itemId */
router.delete('/:id/items/:itemId', async (req, res) => {
  try {
    const colegio_id = colegioId(req);
    const plantilla = await getPlantillaOr404(colegio_id, req.params.id);
    if (!plantilla) return res.status(404).json({ error: 'Plantilla no encontrada' });

    await execute(
      `DELETE FROM indicadores_plantilla_items WHERE id = ? AND plantilla_id = ?`,
      [req.params.itemId, plantilla.id]
    );
    const items = await getItemsPlantilla(plantilla.id);
    res.json({ items });
  } catch (error) {
    console.error('Error eliminando ítem:', error);
    res.status(500).json({ error: 'Error al eliminar ítem' });
  }
});

/** POST /api/admin/indicadores-plantillas/:id/preview-asignacion */
router.post('/:id/preview-asignacion', async (req, res) => {
  try {
    const colegio_id = colegioId(req);
    const anio = parseInt(req.user.anio_activo, 10);
    const plantilla = await getPlantillaOr404(colegio_id, req.params.id);
    if (!plantilla) return res.status(404).json({ error: 'Plantilla no encontrada' });

    const items = await getItemsPlantilla(plantilla.id);
    if (!items.length) {
      return res.status(400).json({ error: 'La plantilla no tiene ítems' });
    }

    const {
      nivel_ids = [],
      curso_ids = [],
      asignatura_ids = [],
      modo = 'agregar',
      desde_ciclo = 1,
    } = req.body;
    const desde = normalizarDesdeCiclo(desde_ciclo);
    const itemsEfectivos = expandirItemsPlantillaPorDesdeCiclo(items, desde);

    const asignaturas = await listarAsignaturasCuantitativas(colegio_id, anio, {
      nivel_ids,
      curso_ids,
      asignatura_ids,
    });

    let destino = asignaturas.length;
    if (modo === 'solo_vacias') {
      const ids = asignaturas.map((a) => a.id);
      if (!ids.length) {
        return res.json({
          total_asignaturas: 0,
          con_criterios: 0,
          destino: 0,
          items: items.length,
          items_efectivos: itemsEfectivos.length,
          desde_ciclo: desde,
        });
      }
      const conCriterios = await query(
        `SELECT DISTINCT asignatura_id FROM asignaturas_criterios
         WHERE asignatura_id IN (${ids.map(() => '?').join(',')}) AND colegio_id = ?`,
        [...ids, colegio_id]
      );
      const setCon = new Set(conCriterios.map((r) => r.asignatura_id));
      destino = asignaturas.filter((a) => !setCon.has(a.id)).length;
      return res.json({
        total_asignaturas: asignaturas.length,
        con_criterios: setCon.size,
        destino,
        items: items.length,
        items_efectivos: itemsEfectivos.length,
        desde_ciclo: desde,
        modo,
      });
    }

    res.json({
      total_asignaturas: asignaturas.length,
      destino,
      items: items.length,
      items_efectivos: itemsEfectivos.length,
      desde_ciclo: desde,
      modo,
    });
  } catch (error) {
    console.error('Error preview asignación:', error);
    res.status(500).json({ error: 'Error al calcular vista previa' });
  }
});

/** POST /api/admin/indicadores-plantillas/:id/asignar */
router.post('/:id/asignar', async (req, res) => {
  try {
    const colegio_id = colegioId(req);
    const anio = parseInt(req.user.anio_activo, 10);
    const plantilla = await getPlantillaOr404(colegio_id, req.params.id);
    if (!plantilla) return res.status(404).json({ error: 'Plantilla no encontrada' });

    const items = await getItemsPlantilla(plantilla.id);
    if (!items.length) {
      return res.status(400).json({ error: 'La plantilla no tiene ítems para asignar' });
    }

    const {
      nivel_ids = [],
      curso_ids = [],
      asignatura_ids = [],
      modo = 'agregar',
      eliminar_obsoletos_sin_notas = false,
      desde_ciclo = 1,
    } = req.body;

    const modosValidos = ['solo_vacias', 'agregar', 'reemplazar_sin_notas'];
    if (!modosValidos.includes(modo)) {
      return res.status(400).json({ error: 'Modo de asignación no válido' });
    }

    const desde = normalizarDesdeCiclo(desde_ciclo);
    const itemsEfectivos = expandirItemsPlantillaPorDesdeCiclo(items, desde);

    const asignaturas = await listarAsignaturasCuantitativas(colegio_id, anio, {
      nivel_ids,
      curso_ids,
      asignatura_ids,
    });

    if (!asignaturas.length) {
      return res.status(400).json({ error: 'No hay asignaturas cuantitativas para el alcance seleccionado' });
    }

    const resumen = {
      asignaturas_procesadas: 0,
      creados: 0,
      omitidos: 0,
      eliminados: 0,
      no_eliminados_con_notas: 0,
      asignaturas_saltadas_vacias: 0,
      desde_ciclo: desde,
      items_efectivos: itemsEfectivos.length,
    };

    for (const asig of asignaturas) {
      const r = await aplicarPlantillaAAsignatura({
        colegioId: colegio_id,
        asignaturaId: asig.id,
        items,
        modo,
        eliminarObsoletosSinNotas: !!eliminar_obsoletos_sin_notas,
        desde_ciclo: desde,
      });
      resumen.asignaturas_procesadas += 1;
      resumen.creados += r.creados;
      resumen.omitidos += r.omitidos;
      resumen.eliminados += r.eliminados;
      resumen.no_eliminados_con_notas += r.no_eliminados_con_notas;
      if (modo === 'solo_vacias' && r.creados === 0) {
        resumen.asignaturas_saltadas_vacias += 1;
      }
    }

    res.json({
      success: true,
      message: 'Asignación completada',
      resumen,
    });
  } catch (error) {
    console.error('Error asignando plantilla:', error);
    res.status(500).json({ error: error.message || 'Error al asignar plantilla' });
  }
});

/** POST /api/admin/indicadores-plantillas/:id/duplicar */
router.post('/:id/duplicar', async (req, res) => {
  try {
    const colegio_id = colegioId(req);
    const plantilla = await getPlantillaOr404(colegio_id, req.params.id);
    if (!plantilla) return res.status(404).json({ error: 'Plantilla no encontrada' });

    const { nombre } = req.body;
    const nuevoNombre =
      (nombre && String(nombre).trim()) || `${plantilla.nombre} (copia)`;

    const ins = await execute(
      `INSERT INTO indicadores_plantillas (colegio_id, nombre, descripcion)
       VALUES (?, ?, ?)`,
      [colegio_id, nuevoNombre, plantilla.descripcion]
    );
    const newId = ins.insertId;
    const items = await getItemsPlantilla(plantilla.id);
    for (const it of items) {
      await execute(
        `INSERT INTO indicadores_plantilla_items
           (plantilla_id, descripcion, abreviatura, peso, ciclo, cuadros, orden)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          newId,
          it.descripcion,
          it.abreviatura,
          it.peso,
          it.ciclo,
          it.cuadros,
          it.orden,
        ]
      );
    }

    const nueva = await getPlantillaOr404(colegio_id, newId);
    const itemsNuevos = await getItemsPlantilla(newId);
    res.status(201).json({ plantilla: nueva, items: itemsNuevos });
  } catch (error) {
    console.error('Error duplicando plantilla:', error);
    res.status(500).json({ error: 'Error al duplicar plantilla' });
  }
});

module.exports = router;
