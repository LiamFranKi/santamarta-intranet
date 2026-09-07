/**
 * Gestión operativa — /api/sgoi
 */
const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { query, execute } = require('../utils/mysql');
const moment = require('moment-timezone');
const { fechaHoraMySQLLima, fechaMySQLLima } = require('../utils/fechaHoraLima');
const {
  ESTADOS_CASO_CIERRE,
  ESTADOS_TRABAJO_CIERRE,
  TIPOS_TRABAJO,
  tableMissing,
  sgoiNoTablePayload,
  requireSgoi,
  asegurarAreaSistemas,
  obtenerActivo,
  padCodigo,
  segundosEntre,
  sanitizarTexto,
  agregarSeguimiento,
  auditarSgoi,
  resolvePersonalId,
} = require('../utils/sgoi');

const router = express.Router();
router.use(authenticateToken);
router.use(requireSgoi);

function handleSgoiError(res, e, etiqueta) {
  if (tableMissing(e)) {
    return res.status(503).json(sgoiNoTablePayload());
  }
  console.error(`[sgoi] ${etiqueta}`, e);
  return res.status(500).json({ error: e.message || 'Error en Gestión operativa.' });
}

function nombreUsuarioSql(alias = 'u') {
  return `TRIM(CONCAT(COALESCE(p.nombres,''), ' ', COALESCE(p.apellidos,'')))`;
}

async function contextoUsuario(req) {
  const colegio_id = parseInt(req.user.colegio_id, 10);
  const usuario_id = parseInt(req.user.usuario_id, 10);
  const personal_id = await resolvePersonalId(req);
  const area = await asegurarAreaSistemas(colegio_id);
  return { colegio_id, usuario_id, personal_id, area_id: area?.id || null };
}

router.get('/me', async (req, res) => {
  try {
    const { colegio_id, usuario_id, area_id } = await contextoUsuario(req);
    const activo = await obtenerActivo(colegio_id, usuario_id);
    res.json({
      acceso: true,
      area_id,
      activo,
    });
  } catch (e) {
    return handleSgoiError(res, e, 'me');
  }
});

router.get('/dia', async (req, res) => {
  try {
    const { colegio_id } = await contextoUsuario(req);
    const fecha = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.fecha || ''))
      ? String(req.query.fecha)
      : fechaMySQLLima();
    const usuarioFiltro = parseInt(req.query.usuario_id, 10);
    const paramsBase = [colegio_id, fecha];
    let extra = '';
    if (Number.isFinite(usuarioFiltro) && usuarioFiltro > 0) {
      extra = ' AND x.usuario_id = ?';
      paramsBase.push(usuarioFiltro);
    }

    const casos = await query(
      `SELECT x.id, x.codigo, x.titulo, x.nota, x.estado, x.prioridad, x.inicio_at, x.fin_at,
              x.duracion_seg, x.usuario_id, ${nombreUsuarioSql()} AS usuario_nombre,
              'CASO' AS kind, NULL AS tipo
       FROM sgoi_casos x
       LEFT JOIN usuarios u ON u.id = x.usuario_id
       LEFT JOIN personal p ON p.id = u.personal_id
       WHERE x.colegio_id = ? AND DATE(x.inicio_at) = ?${extra}
       ORDER BY x.inicio_at ASC`,
      paramsBase
    );
    const trabajos = await query(
      `SELECT x.id, x.codigo, x.titulo, x.nota, x.estado, NULL AS prioridad, x.inicio_at, x.fin_at,
              x.duracion_seg, x.usuario_id, ${nombreUsuarioSql()} AS usuario_nombre,
              'TRABAJO' AS kind, x.tipo
       FROM sgoi_trabajos x
       LEFT JOIN usuarios u ON u.id = x.usuario_id
       LEFT JOIN personal p ON p.id = u.personal_id
       WHERE x.colegio_id = ? AND DATE(x.inicio_at) = ?${extra}
       ORDER BY x.inicio_at ASC`,
      paramsBase
    );

    const items = [...casos, ...trabajos].sort((a, b) =>
      String(a.inicio_at).localeCompare(String(b.inicio_at))
    );
    res.json({ fecha, items });
  } catch (e) {
    return handleSgoiError(res, e, 'dia');
  }
});

router.get('/tablero', async (req, res) => {
  try {
    const { colegio_id } = await contextoUsuario(req);
    const hoy = fechaMySQLLima();
    let desde = String(req.query.desde || '').trim();
    let hasta = String(req.query.hasta || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) {
      const m = moment.tz(hoy, 'YYYY-MM-DD', 'America/Lima');
      desde = m.clone().isoWeekday(1).format('YYYY-MM-DD');
      hasta = m.clone().isoWeekday(7).format('YYYY-MM-DD');
    }

    const casos = await query(
      `SELECT estado, COUNT(*) AS n, COALESCE(SUM(duracion_seg),0) AS segundos
       FROM sgoi_casos
       WHERE colegio_id = ? AND DATE(inicio_at) BETWEEN ? AND ?
       GROUP BY estado`,
      [colegio_id, desde, hasta]
    );
    const trabajos = await query(
      `SELECT estado, tipo, COUNT(*) AS n, COALESCE(SUM(duracion_seg),0) AS segundos
       FROM sgoi_trabajos
       WHERE colegio_id = ? AND DATE(inicio_at) BETWEEN ? AND ?
       GROUP BY estado, tipo`,
      [colegio_id, desde, hasta]
    );
    const pendientesAbiertos = await query(
      `SELECT COUNT(*) AS n FROM sgoi_pendientes
       WHERE colegio_id = ? AND estado IN ('ABIERTO','EN_CURSO')`,
      [colegio_id]
    );
    const recientes = await query(
      `SELECT * FROM (
         SELECT id, codigo, titulo, estado, inicio_at, fin_at, duracion_seg, usuario_id, 'CASO' AS kind
         FROM sgoi_casos WHERE colegio_id = ? AND DATE(inicio_at) BETWEEN ? AND ?
         UNION ALL
         SELECT id, codigo, titulo, estado, inicio_at, fin_at, duracion_seg, usuario_id, 'TRABAJO' AS kind
         FROM sgoi_trabajos WHERE colegio_id = ? AND DATE(inicio_at) BETWEEN ? AND ?
       ) z
       ORDER BY inicio_at DESC
       LIMIT 12`,
      [colegio_id, desde, hasta, colegio_id, desde, hasta]
    );
    const abiertos = await query(
      `SELECT * FROM (
         SELECT id, codigo, titulo, estado, inicio_at, usuario_id, 'CASO' AS kind
         FROM sgoi_casos WHERE colegio_id = ? AND estado = 'EN_CURSO'
         UNION ALL
         SELECT id, codigo, titulo, estado, inicio_at, usuario_id, 'TRABAJO' AS kind
         FROM sgoi_trabajos WHERE colegio_id = ? AND estado = 'EN_CURSO'
       ) z
       ORDER BY inicio_at ASC`,
      [colegio_id, colegio_id]
    );

    const casosMap = Object.fromEntries(casos.map((r) => [r.estado, r]));
    const casosTotal = casos.reduce((s, r) => s + Number(r.n || 0), 0);
    const casosResueltos = Number(casosMap.RESUELTO?.n || 0);
    const segSoporte = Number(casosMap.RESUELTO?.segundos || 0)
      + Number(casosMap.PENDIENTE?.segundos || 0)
      + Number(casosMap.EN_CURSO?.segundos || 0)
      + trabajos
        .filter((t) => t.tipo === 'SOPORTE')
        .reduce((s, t) => s + Number(t.segundos || 0), 0);
    const segDesarrollo = trabajos
      .filter((t) => t.tipo === 'DESARROLLO' || t.tipo === 'DESPLIEGUE')
      .reduce((s, t) => s + Number(t.segundos || 0), 0);
    const trabajosHechos = trabajos
      .filter((t) => t.estado === 'HECHO')
      .reduce((s, t) => s + Number(t.n || 0), 0);

    res.json({
      desde,
      hasta,
      resumen: {
        casos_total: casosTotal,
        casos_resueltos: casosResueltos,
        casos_pendientes: Number(casosMap.PENDIENTE?.n || 0),
        casos_en_curso: Number(casosMap.EN_CURSO?.n || 0),
        trabajos_hechos: trabajosHechos,
        pendientes_abiertos: Number(pendientesAbiertos[0]?.n || 0),
        segundos_soporte: segSoporte,
        segundos_desarrollo: segDesarrollo,
      },
      recientes,
      en_curso: abiertos,
    });
  } catch (e) {
    return handleSgoiError(res, e, 'tablero');
  }
});

async function listarEntidad(req, res, kind) {
  const { colegio_id } = await contextoUsuario(req);
  const estado = sanitizarTexto(req.query.estado, 16);
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 80));
  const tabla = kind === 'CASO' ? 'sgoi_casos' : 'sgoi_trabajos';
  const extraCols = kind === 'CASO' ? 'x.prioridad,' : 'x.tipo,';
  const where = ['x.colegio_id = ?'];
  const params = [colegio_id];
  if (estado) {
    where.push('x.estado = ?');
    params.push(estado);
  }
  params.push(limit);
  const rows = await query(
    `SELECT x.id, x.codigo, x.titulo, x.nota, x.estado, ${extraCols} x.inicio_at, x.fin_at,
            x.duracion_seg, x.usuario_id, ${nombreUsuarioSql()} AS usuario_nombre,
            '${kind}' AS kind
     FROM ${tabla} x
     LEFT JOIN usuarios u ON u.id = x.usuario_id
     LEFT JOIN personal p ON p.id = u.personal_id
     WHERE ${where.join(' AND ')}
     ORDER BY x.inicio_at DESC
     LIMIT ?`,
    params
  );
  res.json({ items: rows });
}

router.get('/casos', async (req, res) => {
  try {
    await listarEntidad(req, res, 'CASO');
  } catch (e) {
    return handleSgoiError(res, e, 'casos');
  }
});

router.get('/trabajos', async (req, res) => {
  try {
    await listarEntidad(req, res, 'TRABAJO');
  } catch (e) {
    return handleSgoiError(res, e, 'trabajos');
  }
});

router.get('/pendientes', async (req, res) => {
  try {
    const { colegio_id } = await contextoUsuario(req);
    const estado = sanitizarTexto(req.query.estado, 16);
    const where = ['x.colegio_id = ?'];
    const params = [colegio_id];
    if (estado) {
      where.push('x.estado = ?');
      params.push(estado);
    } else {
      where.push("x.estado IN ('ABIERTO','EN_CURSO')");
    }
    const rows = await query(
      `SELECT x.*, ${nombreUsuarioSql()} AS usuario_nombre
       FROM sgoi_pendientes x
       LEFT JOIN usuarios u ON u.id = x.usuario_id
       LEFT JOIN personal p ON p.id = u.personal_id
       WHERE ${where.join(' AND ')}
       ORDER BY x.updated_at DESC
       LIMIT 150`,
      params
    );
    res.json({ items: rows });
  } catch (e) {
    return handleSgoiError(res, e, 'pendientes');
  }
});

router.post('/casos/iniciar', async (req, res) => {
  try {
    const ctx = await contextoUsuario(req);
    const activo = await obtenerActivo(ctx.colegio_id, ctx.usuario_id);
    if (activo) {
      return res.status(409).json({
        error: 'Ya tienes algo en curso. Ciérralo o déjalo pendiente antes de abrir otro.',
        activo,
      });
    }
    const titulo = sanitizarTexto(req.body?.titulo, 200) || 'Caso en atención';
    const prioridad = ['NORMAL', 'ALTA', 'URGENTE'].includes(req.body?.prioridad)
      ? req.body.prioridad
      : 'NORMAL';
    const pendienteId = parseInt(req.body?.pendiente_id, 10) || null;
    const ahora = fechaHoraMySQLLima();
    const ins = await execute(
      `INSERT INTO sgoi_casos
        (colegio_id, area_id, usuario_id, personal_id, pendiente_id, codigo, titulo, prioridad, estado, inicio_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'EN_CURSO', ?)`,
      [ctx.colegio_id, ctx.area_id, ctx.usuario_id, ctx.personal_id, pendienteId, 'TMP', titulo, prioridad, ahora]
    );
    const codigo = padCodigo('CAS', ins.insertId);
    await execute('UPDATE sgoi_casos SET codigo = ? WHERE id = ? AND colegio_id = ?', [
      codigo,
      ins.insertId,
      ctx.colegio_id,
    ]);
    if (pendienteId) {
      await execute(
        `UPDATE sgoi_pendientes SET estado = 'EN_CURSO' WHERE id = ? AND colegio_id = ?`,
        [pendienteId, ctx.colegio_id]
      );
    }
    auditarSgoi(req, {
      accion: 'CREAR',
      entidad: 'caso',
      entidad_id: ins.insertId,
      descripcion: `Inició ${codigo}: ${titulo}`,
    });
    const creado = await obtenerActivo(ctx.colegio_id, ctx.usuario_id);
    res.status(201).json({ activo: creado });
  } catch (e) {
    return handleSgoiError(res, e, 'casos/iniciar');
  }
});

router.post('/trabajos/iniciar', async (req, res) => {
  try {
    const ctx = await contextoUsuario(req);
    const activo = await obtenerActivo(ctx.colegio_id, ctx.usuario_id);
    if (activo) {
      return res.status(409).json({
        error: 'Ya tienes algo en curso. Ciérralo o déjalo pendiente antes de abrir otro.',
        activo,
      });
    }
    const titulo = sanitizarTexto(req.body?.titulo, 200) || 'Trabajo en curso';
    const tipo = TIPOS_TRABAJO.includes(req.body?.tipo) ? req.body.tipo : 'DESARROLLO';
    const pendienteId = parseInt(req.body?.pendiente_id, 10) || null;
    const ahora = fechaHoraMySQLLima();
    const ins = await execute(
      `INSERT INTO sgoi_trabajos
        (colegio_id, area_id, usuario_id, personal_id, pendiente_id, codigo, tipo, titulo, estado, inicio_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'EN_CURSO', ?)`,
      [ctx.colegio_id, ctx.area_id, ctx.usuario_id, ctx.personal_id, pendienteId, 'TMP', tipo, titulo, ahora]
    );
    const codigo = padCodigo('TRB', ins.insertId);
    await execute('UPDATE sgoi_trabajos SET codigo = ? WHERE id = ? AND colegio_id = ?', [
      codigo,
      ins.insertId,
      ctx.colegio_id,
    ]);
    if (pendienteId) {
      await execute(
        `UPDATE sgoi_pendientes SET estado = 'EN_CURSO' WHERE id = ? AND colegio_id = ?`,
        [pendienteId, ctx.colegio_id]
      );
    }
    auditarSgoi(req, {
      accion: 'CREAR',
      entidad: 'trabajo',
      entidad_id: ins.insertId,
      descripcion: `Inició ${codigo}: ${titulo}`,
    });
    const creado = await obtenerActivo(ctx.colegio_id, ctx.usuario_id);
    res.status(201).json({ activo: creado });
  } catch (e) {
    return handleSgoiError(res, e, 'trabajos/iniciar');
  }
});

router.post('/activo/cerrar', async (req, res) => {
  try {
    const ctx = await contextoUsuario(req);
    const activo = await obtenerActivo(ctx.colegio_id, ctx.usuario_id);
    if (!activo) {
      return res.status(404).json({ error: 'No tienes nada en curso.' });
    }
    const nota = sanitizarTexto(req.body?.nota, 4000);
    if (!nota) {
      return res.status(400).json({ error: 'Escribe qué pasó o qué hiciste.' });
    }
    const titulo = sanitizarTexto(req.body?.titulo, 200);
    const ahora = fechaHoraMySQLLima();
    const duracion = segundosEntre(activo.inicio_at, ahora);
    const dejarPendiente = String(req.body?.estado || '').toUpperCase() === 'PENDIENTE';

    if (activo.kind === 'CASO') {
      const estado = dejarPendiente ? 'PENDIENTE' : 'RESUELTO';
      if (!ESTADOS_CASO_CIERRE.includes(estado)) {
        return res.status(400).json({ error: 'Estado de cierre inválido.' });
      }
      const prioridad = ['NORMAL', 'ALTA', 'URGENTE'].includes(req.body?.prioridad)
        ? req.body.prioridad
        : null;
      await execute(
        `UPDATE sgoi_casos
         SET nota = ?, titulo = COALESCE(NULLIF(?, ''), titulo),
             estado = ?, fin_at = ?, duracion_seg = ?,
             prioridad = COALESCE(?, prioridad)
         WHERE id = ? AND colegio_id = ? AND usuario_id = ? AND estado = 'EN_CURSO'`,
        [nota, titulo, estado, ahora, duracion, prioridad, activo.id, ctx.colegio_id, ctx.usuario_id]
      );
      await agregarSeguimiento({
        colegioId: ctx.colegio_id,
        entidad: 'CASO',
        entidadId: activo.id,
        usuarioId: ctx.usuario_id,
        texto: nota,
      });
      if (dejarPendiente) {
        await asegurarPendienteDesde(ctx, {
          origen: 'CASO',
          origenId: activo.id,
          titulo: titulo || activo.titulo,
          descripcion: nota,
          pendienteId: activo.pendiente_id,
        });
      } else if (activo.pendiente_id) {
        await execute(
          `UPDATE sgoi_pendientes SET estado = 'HECHO', cerrado_at = ?
           WHERE id = ? AND colegio_id = ?`,
          [ahora, activo.pendiente_id, ctx.colegio_id]
        );
      }
      auditarSgoi(req, {
        accion: 'EDITAR',
        entidad: 'caso',
        entidad_id: activo.id,
        descripcion: `Cerró ${activo.codigo} como ${estado}`,
      });
    } else {
      const estado = dejarPendiente ? 'PENDIENTE' : 'HECHO';
      if (!ESTADOS_TRABAJO_CIERRE.includes(estado)) {
        return res.status(400).json({ error: 'Estado de cierre inválido.' });
      }
      const tipo = TIPOS_TRABAJO.includes(req.body?.tipo) ? req.body.tipo : null;
      await execute(
        `UPDATE sgoi_trabajos
         SET nota = ?, titulo = COALESCE(NULLIF(?, ''), titulo),
             estado = ?, fin_at = ?, duracion_seg = ?,
             tipo = COALESCE(?, tipo)
         WHERE id = ? AND colegio_id = ? AND usuario_id = ? AND estado = 'EN_CURSO'`,
        [nota, titulo, estado, ahora, duracion, tipo, activo.id, ctx.colegio_id, ctx.usuario_id]
      );
      await agregarSeguimiento({
        colegioId: ctx.colegio_id,
        entidad: 'TRABAJO',
        entidadId: activo.id,
        usuarioId: ctx.usuario_id,
        texto: nota,
      });
      if (dejarPendiente) {
        await asegurarPendienteDesde(ctx, {
          origen: 'TRABAJO',
          origenId: activo.id,
          titulo: titulo || activo.titulo,
          descripcion: nota,
          pendienteId: activo.pendiente_id,
        });
      } else if (activo.pendiente_id) {
        await execute(
          `UPDATE sgoi_pendientes SET estado = 'HECHO', cerrado_at = ?
           WHERE id = ? AND colegio_id = ?`,
          [ahora, activo.pendiente_id, ctx.colegio_id]
        );
      }
      auditarSgoi(req, {
        accion: 'EDITAR',
        entidad: 'trabajo',
        entidad_id: activo.id,
        descripcion: `Cerró ${activo.codigo} como ${estado}`,
      });
    }

    res.json({ ok: true, cerrado: { ...activo, estado: dejarPendiente ? 'PENDIENTE' : activo.kind === 'CASO' ? 'RESUELTO' : 'HECHO' } });
  } catch (e) {
    return handleSgoiError(res, e, 'activo/cerrar');
  }
});

async function asegurarPendienteDesde(ctx, { origen, origenId, titulo, descripcion, pendienteId }) {
  if (pendienteId) {
    await execute(
      `UPDATE sgoi_pendientes
       SET estado = 'ABIERTO', titulo = ?, descripcion = ?, origen = ?, origen_id = ?
       WHERE id = ? AND colegio_id = ?`,
      [sanitizarTexto(titulo, 200) || 'Pendiente', sanitizarTexto(descripcion, 4000), origen, origenId, pendienteId, ctx.colegio_id]
    );
    return pendienteId;
  }
  const ins = await execute(
    `INSERT INTO sgoi_pendientes
      (colegio_id, area_id, usuario_id, origen, origen_id, titulo, descripcion, estado)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'ABIERTO')`,
    [
      ctx.colegio_id,
      ctx.area_id,
      ctx.usuario_id,
      origen,
      origenId,
      sanitizarTexto(titulo, 200) || 'Pendiente',
      sanitizarTexto(descripcion, 4000),
    ]
  );
  return ins.insertId;
}

router.post('/pendientes', async (req, res) => {
  try {
    const ctx = await contextoUsuario(req);
    const titulo = sanitizarTexto(req.body?.titulo, 200);
    if (!titulo) {
      return res.status(400).json({ error: 'El título es obligatorio.' });
    }
    const ins = await execute(
      `INSERT INTO sgoi_pendientes
        (colegio_id, area_id, usuario_id, origen, titulo, descripcion, prioridad, estado)
       VALUES (?, ?, ?, 'MANUAL', ?, ?, ?, 'ABIERTO')`,
      [
        ctx.colegio_id,
        ctx.area_id,
        ctx.usuario_id,
        titulo,
        sanitizarTexto(req.body?.descripcion, 4000),
        ['NORMAL', 'ALTA', 'URGENTE'].includes(req.body?.prioridad) ? req.body.prioridad : 'NORMAL',
      ]
    );
    auditarSgoi(req, {
      accion: 'CREAR',
      entidad: 'pendiente',
      entidad_id: ins.insertId,
      descripcion: titulo,
    });
    const rows = await query('SELECT * FROM sgoi_pendientes WHERE id = ? AND colegio_id = ?', [
      ins.insertId,
      ctx.colegio_id,
    ]);
    res.status(201).json({ pendiente: rows[0] });
  } catch (e) {
    return handleSgoiError(res, e, 'pendientes/crear');
  }
});

router.post('/pendientes/:id/continuar', async (req, res) => {
  try {
    const ctx = await contextoUsuario(req);
    const id = parseInt(req.params.id, 10);
    const rows = await query(
      `SELECT * FROM sgoi_pendientes WHERE id = ? AND colegio_id = ? LIMIT 1`,
      [id, ctx.colegio_id]
    );
    if (!rows[0]) {
      return res.status(404).json({ error: 'Pendiente no encontrado.' });
    }
    const activo = await obtenerActivo(ctx.colegio_id, ctx.usuario_id);
    if (activo) {
      return res.status(409).json({
        error: 'Ya tienes algo en curso. Ciérralo antes de continuar este pendiente.',
        activo,
      });
    }
    const como = String(req.body?.como || 'CASO').toUpperCase() === 'TRABAJO' ? 'TRABAJO' : 'CASO';
    const ahora = fechaHoraMySQLLima();
    let ins;
    let codigo;
    if (como === 'TRABAJO') {
      ins = await execute(
        `INSERT INTO sgoi_trabajos
          (colegio_id, area_id, usuario_id, personal_id, pendiente_id, codigo, tipo, titulo, estado, inicio_at)
         VALUES (?, ?, ?, ?, ?, ?, 'DESARROLLO', ?, 'EN_CURSO', ?)`,
        [
          ctx.colegio_id,
          ctx.area_id,
          ctx.usuario_id,
          ctx.personal_id,
          rows[0].id,
          'TMP',
          rows[0].titulo,
          ahora,
        ]
      );
      codigo = padCodigo('TRB', ins.insertId);
      await execute('UPDATE sgoi_trabajos SET codigo = ? WHERE id = ? AND colegio_id = ?', [
        codigo,
        ins.insertId,
        ctx.colegio_id,
      ]);
    } else {
      ins = await execute(
        `INSERT INTO sgoi_casos
          (colegio_id, area_id, usuario_id, personal_id, pendiente_id, codigo, titulo, prioridad, estado, inicio_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'EN_CURSO', ?)`,
        [
          ctx.colegio_id,
          ctx.area_id,
          ctx.usuario_id,
          ctx.personal_id,
          rows[0].id,
          'TMP',
          rows[0].titulo,
          rows[0].prioridad || 'NORMAL',
          ahora,
        ]
      );
      codigo = padCodigo('CAS', ins.insertId);
      await execute('UPDATE sgoi_casos SET codigo = ? WHERE id = ? AND colegio_id = ?', [
        codigo,
        ins.insertId,
        ctx.colegio_id,
      ]);
    }
    await execute(
      `UPDATE sgoi_pendientes SET estado = 'EN_CURSO' WHERE id = ? AND colegio_id = ?`,
      [rows[0].id, ctx.colegio_id]
    );
    const creado = await obtenerActivo(ctx.colegio_id, ctx.usuario_id);
    res.status(201).json({ activo: creado });
  } catch (e) {
    return handleSgoiError(res, e, 'pendientes/continuar');
  }
});

router.post('/pendientes/:id/hecho', async (req, res) => {
  try {
    const ctx = await contextoUsuario(req);
    const id = parseInt(req.params.id, 10);
    const r = await execute(
      `UPDATE sgoi_pendientes SET estado = 'HECHO', cerrado_at = ?
       WHERE id = ? AND colegio_id = ? AND estado <> 'HECHO'`,
      [fechaHoraMySQLLima(), id, ctx.colegio_id]
    );
    if (!r.affectedRows) {
      return res.status(404).json({ error: 'Pendiente no encontrado o ya estaba cerrado.' });
    }
    res.json({ ok: true });
  } catch (e) {
    return handleSgoiError(res, e, 'pendientes/hecho');
  }
});

module.exports = router;
