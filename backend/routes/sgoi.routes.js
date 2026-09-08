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
  esTipoHorarioSgoi,
  asegurarAreaSistemas,
  obtenerActivo,
  asegurarPlantilla,
  materializarDia,
  hhmm,
  colgarCasosEnBloques,
  padCodigo,
  segundosEntre,
  sanitizarTexto,
  agregarSeguimiento,
  nombrePersonalDeUsuario,
  auditarSgoi,
  resolvePersonalId,
  sqlDt,
  serializarFilaSgoi,
  serializarFilasSgoi,
} = require('../utils/sgoi');

const router = express.Router();
router.use(authenticateToken);
router.use(requireSgoi);

function requireHorarioAdmin(req, res, next) {
  if (!esTipoHorarioSgoi(req.user?.tipo)) {
    return res.status(403).json({ error: 'El horario de Sistemas solo está disponible para Administrador.' });
  }
  return next();
}

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

function asTime(valor) {
  const s = String(valor || '').trim();
  if (/^\d{2}:\d{2}$/.test(s)) return `${s}:00`;
  if (/^\d{2}:\d{2}:\d{2}$/.test(s)) return s;
  return '';
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function rangoLima(desde, hasta) {
  return {
    desdeAt: `${desde} 00:00:00`,
    hastaExcl: moment.tz(hasta, 'YYYY-MM-DD', 'America/Lima').add(1, 'day').format('YYYY-MM-DD') + ' 00:00:00',
  };
}

function cadaDia(desde, hasta) {
  const days = [];
  const cur = moment.tz(desde, 'YYYY-MM-DD', 'America/Lima');
  const end = moment.tz(hasta, 'YYYY-MM-DD', 'America/Lima');
  while (!cur.isAfter(end, 'day')) {
    days.push(cur.format('YYYY-MM-DD'));
    cur.add(1, 'day');
  }
  return days;
}

router.get('/dia', async (req, res) => {
  try {
    const { colegio_id, usuario_id } = await contextoUsuario(req);
    const fecha = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.fecha || ''))
      ? String(req.query.fecha)
      : fechaMySQLLima();
    const usuarioFiltro = parseInt(req.query.usuario_id, 10);
    const uid = Number.isFinite(usuarioFiltro) && usuarioFiltro > 0 ? usuarioFiltro : usuario_id;

    let bloques = [];
    try {
      if (esTipoHorarioSgoi(req.user?.tipo)) {
        await materializarDia(colegio_id, uid, fecha);
        bloques = await query(
          `SELECT id, fecha, hora_ini, hora_fin, titulo, tipo, plantilla_id
           FROM sgoi_dia_bloques
           WHERE colegio_id = ? AND usuario_id = ? AND fecha = ?
           ORDER BY hora_ini ASC`,
          [colegio_id, uid, fecha]
        );
      }
    } catch (e) {
      if (!tableMissing(e)) throw e;
    }

    const extra = uid ? ' AND x.usuario_id = ?' : '';
    const paramsCasos = [colegio_id, `${fecha} 00:00:00`, `${fecha} 23:59:59`, uid];
    const casos = await query(
      `SELECT x.id, x.codigo, x.titulo, x.nota, x.estado, x.prioridad, ${sqlDt('x.inicio_at', 'inicio_at')}, ${sqlDt('x.fin_at', 'fin_at')},
              x.duracion_seg, x.usuario_id, ${nombreUsuarioSql()} AS usuario_nombre,
              'CASO' AS kind, NULL AS tipo,
              DATE_FORMAT(x.inicio_at, '%H:%i') AS hora_ini_hm,
              DATE_FORMAT(x.fin_at, '%H:%i') AS hora_fin_hm
       FROM sgoi_casos x
       LEFT JOIN usuarios u ON u.id = x.usuario_id
       LEFT JOIN personal p ON p.id = u.personal_id
       WHERE x.colegio_id = ? AND x.inicio_at >= ? AND x.inicio_at <= ?${extra}
       ORDER BY x.inicio_at ASC`,
      paramsCasos
    );
    const trabajos = await query(
      `SELECT x.id, x.codigo, x.titulo, x.nota, x.estado, NULL AS prioridad, ${sqlDt('x.inicio_at', 'inicio_at')}, ${sqlDt('x.fin_at', 'fin_at')},
              x.duracion_seg, x.usuario_id, ${nombreUsuarioSql()} AS usuario_nombre,
              'TRABAJO' AS kind, x.tipo
       FROM sgoi_trabajos x
       LEFT JOIN usuarios u ON u.id = x.usuario_id
       LEFT JOIN personal p ON p.id = u.personal_id
       WHERE x.colegio_id = ? AND x.inicio_at >= ? AND x.inicio_at <= ?${extra}
       ORDER BY x.inicio_at ASC`,
      paramsCasos
    );

    const { bloques: bloquesOut, casos_sueltos: casosSueltos } = colgarCasosEnBloques(bloques, casos);
    const items = serializarFilasSgoi([...casos, ...trabajos]).sort((a, b) =>
      String(a.inicio_at).localeCompare(String(b.inicio_at))
    );
    res.json({
      fecha,
      bloques: bloquesOut,
      casos_sueltos: serializarFilasSgoi(casosSueltos),
      items,
    });
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
    const { desdeAt, hastaExcl } = rangoLima(desde, hasta);

    const casos = await query(
      `SELECT estado, COUNT(*) AS n, COALESCE(SUM(duracion_seg),0) AS segundos
       FROM sgoi_casos
       WHERE colegio_id = ? AND inicio_at >= ? AND inicio_at < ?
       GROUP BY estado`,
      [colegio_id, desdeAt, hastaExcl]
    );
    const trabajos = await query(
      `SELECT estado, tipo, COUNT(*) AS n, COALESCE(SUM(duracion_seg),0) AS segundos
       FROM sgoi_trabajos
       WHERE colegio_id = ? AND inicio_at >= ? AND inicio_at < ?
       GROUP BY estado, tipo`,
      [colegio_id, desdeAt, hastaExcl]
    );
    const pendientesAbiertos = await query(
      `SELECT COUNT(*) AS n FROM sgoi_pendientes
       WHERE colegio_id = ? AND estado IN ('ABIERTO','EN_CURSO')`,
      [colegio_id]
    );
    const porDia = await query(
      `SELECT dia, SUM(casos) AS casos, SUM(trabajos) AS trabajos,
              SUM(seg_casos) AS seg_casos, SUM(seg_trabajos) AS seg_trabajos
       FROM (
         SELECT DATE_FORMAT(inicio_at, '%Y-%m-%d') AS dia, COUNT(*) AS casos, 0 AS trabajos,
                COALESCE(SUM(duracion_seg),0) AS seg_casos, 0 AS seg_trabajos
         FROM sgoi_casos
         WHERE colegio_id = ? AND inicio_at >= ? AND inicio_at < ?
         GROUP BY DATE_FORMAT(inicio_at, '%Y-%m-%d')
         UNION ALL
         SELECT DATE_FORMAT(inicio_at, '%Y-%m-%d') AS dia, 0 AS casos, COUNT(*) AS trabajos,
                0 AS seg_casos, COALESCE(SUM(duracion_seg),0) AS seg_trabajos
         FROM sgoi_trabajos
         WHERE colegio_id = ? AND inicio_at >= ? AND inicio_at < ?
         GROUP BY DATE_FORMAT(inicio_at, '%Y-%m-%d')
       ) z
       GROUP BY dia
       ORDER BY dia ASC`,
      [colegio_id, desdeAt, hastaExcl, colegio_id, desdeAt, hastaExcl]
    );
    const recientes = await query(
      `SELECT * FROM (
         SELECT id, codigo, titulo, estado, ${sqlDt('inicio_at')}, ${sqlDt('fin_at')}, duracion_seg, usuario_id, 'CASO' AS kind, NULL AS tipo
         FROM sgoi_casos WHERE colegio_id = ? AND inicio_at >= ? AND inicio_at < ?
         UNION ALL
         SELECT id, codigo, titulo, estado, ${sqlDt('inicio_at')}, ${sqlDt('fin_at')}, duracion_seg, usuario_id, 'TRABAJO' AS kind, tipo
         FROM sgoi_trabajos WHERE colegio_id = ? AND inicio_at >= ? AND inicio_at < ?
       ) z
       ORDER BY inicio_at DESC
       LIMIT 12`,
      [colegio_id, desdeAt, hastaExcl, colegio_id, desdeAt, hastaExcl]
    );
    const abiertos = await query(
      `SELECT * FROM (
         SELECT id, codigo, titulo, estado, ${sqlDt('inicio_at')}, usuario_id, 'CASO' AS kind
         FROM sgoi_casos WHERE colegio_id = ? AND estado = 'EN_CURSO'
         UNION ALL
         SELECT id, codigo, titulo, estado, ${sqlDt('inicio_at')}, usuario_id, 'TRABAJO' AS kind
         FROM sgoi_trabajos WHERE colegio_id = ? AND estado = 'EN_CURSO'
       ) z
       ORDER BY inicio_at ASC`,
      [colegio_id, colegio_id]
    );

    const casosTotal = casos.reduce((s, r) => s + num(r.n), 0);
    const casosResueltos = num(casos.find((r) => r.estado === 'RESUELTO')?.n);
    const casosPendientes = num(casos.find((r) => r.estado === 'PENDIENTE')?.n);
    const casosEnCurso = num(casos.find((r) => r.estado === 'EN_CURSO')?.n);
    const trabajosTotal = trabajos.reduce((s, r) => s + num(r.n), 0);
    const trabajosHechos = trabajos.filter((t) => t.estado === 'HECHO').reduce((s, t) => s + num(t.n), 0);
    const segCasos = casos.reduce((s, r) => s + num(r.segundos), 0);
    const segTrabajos = trabajos.reduce((s, r) => s + num(r.segundos), 0);
    const porTipo = {};
    trabajos.forEach((t) => {
      const k = t.tipo || 'OTRO';
      porTipo[k] = (porTipo[k] || 0) + num(t.n);
    });

    res.json({
      desde,
      hasta,
      resumen: {
        casos_total: casosTotal,
        casos_resueltos: casosResueltos,
        casos_pendientes: casosPendientes,
        casos_en_curso: casosEnCurso,
        trabajos_total: trabajosTotal,
        trabajos_hechos: trabajosHechos,
        pendientes_abiertos: num(pendientesAbiertos[0]?.n),
        segundos_casos: segCasos,
        segundos_trabajos: segTrabajos,
        segundos_soporte: segCasos + num(trabajos.filter((t) => t.tipo === 'SOPORTE').reduce((s, t) => s + num(t.segundos), 0)),
        segundos_desarrollo: num(trabajos.filter((t) => t.tipo === 'DESARROLLO' || t.tipo === 'DESPLIEGUE').reduce((s, t) => s + num(t.segundos), 0)),
      },
      por_dia: cadaDia(desde, hasta).map((fecha) => {
        const d = porDia.find((row) => String(row.dia || '').slice(0, 10) === fecha);
        return {
          fecha,
          casos: num(d?.casos),
          trabajos: num(d?.trabajos),
          seg_casos: num(d?.seg_casos),
          seg_trabajos: num(d?.seg_trabajos),
        };
      }),
      por_tipo: porTipo,
      recientes: serializarFilasSgoi(recientes),
      en_curso: serializarFilasSgoi(abiertos),
    });
  } catch (e) {
    return handleSgoiError(res, e, 'tablero');
  }
});

function rangoPeriodo(periodo, fecha) {
  const m = moment.tz(fecha, 'YYYY-MM-DD', 'America/Lima');
  if (periodo === 'dia') {
    return { desde: fecha, hasta: fecha };
  }
  if (periodo === 'mes') {
    return {
      desde: m.clone().startOf('month').format('YYYY-MM-DD'),
      hasta: m.clone().endOf('month').format('YYYY-MM-DD'),
    };
  }
  return {
    desde: m.clone().isoWeekday(1).format('YYYY-MM-DD'),
    hasta: m.clone().isoWeekday(7).format('YYYY-MM-DD'),
  };
}

router.get('/reporte', async (req, res) => {
  try {
    const { colegio_id, usuario_id } = await contextoUsuario(req);
    const periodo = ['dia', 'semana', 'mes'].includes(String(req.query.periodo || ''))
      ? String(req.query.periodo)
      : 'semana';
    const fecha = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.fecha || ''))
      ? String(req.query.fecha)
      : fechaMySQLLima();
    const { desde, hasta } = rangoPeriodo(periodo, fecha);
    const { desdeAt, hastaExcl } = rangoLima(desde, hasta);
    const fechas = cadaDia(desde, hasta);

    const casosRows = await query(
      `SELECT x.id, x.codigo, x.titulo, x.nota, x.estado, x.prioridad, ${sqlDt('x.inicio_at', 'inicio_at')}, ${sqlDt('x.fin_at', 'fin_at')},
              x.duracion_seg, x.usuario_id, ${nombreUsuarioSql()} AS usuario_nombre,
              'CASO' AS kind, NULL AS tipo, DATE_FORMAT(x.inicio_at, '%Y-%m-%d') AS dia,
              DATE_FORMAT(x.inicio_at, '%H:%i') AS hora_ini_hm,
              DATE_FORMAT(x.fin_at, '%H:%i') AS hora_fin_hm
       FROM sgoi_casos x
       LEFT JOIN usuarios u ON u.id = x.usuario_id
       LEFT JOIN personal p ON p.id = u.personal_id
       WHERE x.colegio_id = ? AND x.inicio_at >= ? AND x.inicio_at < ?
       ORDER BY x.inicio_at ASC`,
      [colegio_id, desdeAt, hastaExcl]
    );
    const trabajosRows = await query(
      `SELECT x.id, x.codigo, x.titulo, x.nota, x.estado, NULL AS prioridad, ${sqlDt('x.inicio_at', 'inicio_at')}, ${sqlDt('x.fin_at', 'fin_at')},
              x.duracion_seg, x.usuario_id, ${nombreUsuarioSql()} AS usuario_nombre,
              'TRABAJO' AS kind, x.tipo, DATE_FORMAT(x.inicio_at, '%Y-%m-%d') AS dia
       FROM sgoi_trabajos x
       LEFT JOIN usuarios u ON u.id = x.usuario_id
       LEFT JOIN personal p ON p.id = u.personal_id
       WHERE x.colegio_id = ? AND x.inicio_at >= ? AND x.inicio_at < ?
       ORDER BY x.inicio_at ASC`,
      [colegio_id, desdeAt, hastaExcl]
    );
    const pendientesAbiertos = await query(
      `SELECT COUNT(*) AS n FROM sgoi_pendientes
       WHERE colegio_id = ? AND estado IN ('ABIERTO','EN_CURSO')`,
      [colegio_id]
    );

    const porTipo = {};
    trabajosRows.forEach((t) => {
      const k = t.tipo || 'OTRO';
      porTipo[k] = (porTipo[k] || 0) + 1;
    });
    const porDiaMap = {};
    casosRows.forEach((c) => {
      const f = String(c.dia || '').slice(0, 10);
      if (!porDiaMap[f]) porDiaMap[f] = { casos: 0, trabajos: 0, seg_casos: 0, seg_trabajos: 0 };
      porDiaMap[f].casos += 1;
      porDiaMap[f].seg_casos += num(c.duracion_seg);
    });
    trabajosRows.forEach((t) => {
      const f = String(t.dia || '').slice(0, 10);
      if (!porDiaMap[f]) porDiaMap[f] = { casos: 0, trabajos: 0, seg_casos: 0, seg_trabajos: 0 };
      porDiaMap[f].trabajos += 1;
      porDiaMap[f].seg_trabajos += num(t.duracion_seg);
    });

    const bloquesPorFecha = {};
    if (esTipoHorarioSgoi(req.user?.tipo)) {
      try {
        for (const f of fechas) {
          await materializarDia(colegio_id, usuario_id, f);
        }
        const bloquesRows = await query(
          `SELECT id, DATE_FORMAT(fecha, '%Y-%m-%d') AS fecha, hora_ini, hora_fin, titulo, tipo
           FROM sgoi_dia_bloques
           WHERE colegio_id = ? AND usuario_id = ? AND fecha >= ? AND fecha <= ?
           ORDER BY fecha ASC, hora_ini ASC`,
          [colegio_id, usuario_id, desde, hasta]
        );
        bloquesRows.forEach((b) => {
          const f = String(b.fecha || '').slice(0, 10);
          if (!bloquesPorFecha[f]) bloquesPorFecha[f] = [];
          bloquesPorFecha[f].push(b);
        });
      } catch (e) {
        if (!tableMissing(e)) throw e;
      }
    }

    const dias = fechas
      .map((dia) => {
        const casos = serializarFilasSgoi(casosRows.filter((c) => String(c.dia).slice(0, 10) === dia));
        const trabajos = serializarFilasSgoi(trabajosRows.filter((t) => String(t.dia).slice(0, 10) === dia));
        const colgados = colgarCasosEnBloques(bloquesPorFecha[dia] || [], casos);
        return {
          fecha: dia,
          casos,
          trabajos,
          bloques: colgados.bloques,
          casos_sueltos: colgados.casos_sueltos,
        };
      })
      .filter((d) => d.casos.length || d.trabajos.length || d.bloques.length);

    const personaNombre = await nombrePersonalDeUsuario(usuario_id);
    res.json({
      periodo,
      fecha,
      desde,
      hasta,
      usuario: { id: usuario_id, nombre: personaNombre },
      resumen: {
        casos_total: casosRows.length,
        casos_resueltos: casosRows.filter((c) => c.estado === 'RESUELTO').length,
        casos_pendientes: casosRows.filter((c) => c.estado === 'PENDIENTE').length,
        casos_en_curso: casosRows.filter((c) => c.estado === 'EN_CURSO').length,
        trabajos_total: trabajosRows.length,
        trabajos_hechos: trabajosRows.filter((t) => t.estado === 'HECHO').length,
        pendientes_abiertos: num(pendientesAbiertos[0]?.n),
        segundos_casos: casosRows.reduce((s, c) => s + num(c.duracion_seg), 0),
        segundos_trabajos: trabajosRows.reduce((s, t) => s + num(t.duracion_seg), 0),
        dias_con_actividad: dias.filter((d) => d.casos.length).length,
      },
      por_dia: cadaDia(desde, hasta).map((f) => ({
        fecha: f,
        casos: porDiaMap[f]?.casos || 0,
        trabajos: porDiaMap[f]?.trabajos || 0,
        seg_casos: porDiaMap[f]?.seg_casos || 0,
        seg_trabajos: porDiaMap[f]?.seg_trabajos || 0,
      })),
      por_tipo: porTipo,
      dias,
    });
  } catch (e) {
    return handleSgoiError(res, e, 'reporte');
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
    `SELECT x.id, x.codigo, x.titulo, x.nota, x.estado, ${extraCols} ${sqlDt('x.inicio_at', 'inicio_at')}, ${sqlDt('x.fin_at', 'fin_at')},
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
  res.json({ items: serializarFilasSgoi(rows) });
}

router.get('/horario', requireHorarioAdmin, async (req, res) => {
  try {
    const { colegio_id, usuario_id } = await contextoUsuario(req);
    await asegurarPlantilla(colegio_id, usuario_id);
    const rows = await query(
      `SELECT id, weekday, hora_ini, hora_fin, titulo, tipo, orden
       FROM sgoi_plantilla_bloques
       WHERE colegio_id = ? AND usuario_id = ?
       ORDER BY weekday ASC, hora_ini ASC`,
      [colegio_id, usuario_id]
    );
    const dias = [1, 2, 3, 4, 5, 6, 7].map((wd) => ({
      weekday: wd,
      bloques: rows
        .filter((r) => Number(r.weekday) === wd)
        .map((r) => ({ ...r, hora_ini: hhmm(r.hora_ini), hora_fin: hhmm(r.hora_fin) })),
    }));
    const personaNombre = await nombrePersonalDeUsuario(usuario_id);
    res.json({ dias, usuario: { id: usuario_id, nombre: personaNombre } });
  } catch (e) {
    return handleSgoiError(res, e, 'horario');
  }
});

function parseWeekday(valor) {
  const n = parseInt(valor, 10);
  return n >= 1 && n <= 7 ? n : 0;
}

function bloquesDesdeBody(body) {
  const lista = Array.isArray(body?.bloques) ? body.bloques : [];
  return lista
    .map((b, i) => {
      const titulo = sanitizarTexto(b?.titulo, 160);
      if (!titulo) return null;
      return {
        hora_ini: asTime(b?.hora_ini) || '08:00:00',
        hora_fin: asTime(b?.hora_fin) || '09:00:00',
        titulo,
        tipo: sanitizarTexto(b?.tipo, 24) || 'DESARROLLO',
        orden: i + 1,
      };
    })
    .filter(Boolean);
}

router.post('/horario/plantilla', requireHorarioAdmin, async (req, res) => {
  try {
    const { colegio_id, usuario_id } = await contextoUsuario(req);
    await asegurarPlantilla(colegio_id, usuario_id);
    const weekday = parseWeekday(req.body?.weekday);
    const titulo = sanitizarTexto(req.body?.titulo, 160);
    if (!weekday) return res.status(400).json({ error: 'Día inválido.' });
    if (!titulo) return res.status(400).json({ error: 'El título es obligatorio.' });
    const ins = await execute(
      `INSERT INTO sgoi_plantilla_bloques
        (colegio_id, usuario_id, weekday, hora_ini, hora_fin, titulo, tipo, orden)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        colegio_id,
        usuario_id,
        weekday,
        asTime(req.body?.hora_ini) || '08:00:00',
        asTime(req.body?.hora_fin) || '09:00:00',
        titulo,
        sanitizarTexto(req.body?.tipo, 24) || 'DESARROLLO',
        parseInt(req.body?.orden, 10) || 99,
      ]
    );
    res.status(201).json({ id: ins.insertId });
  } catch (e) {
    return handleSgoiError(res, e, 'horario/plantilla-crear');
  }
});

router.put('/horario/semana/:weekday', requireHorarioAdmin, async (req, res) => {
  try {
    const { colegio_id, usuario_id } = await contextoUsuario(req);
    const weekday = parseWeekday(req.params.weekday);
    if (!weekday) return res.status(400).json({ error: 'Día inválido.' });
    const bloques = bloquesDesdeBody(req.body);
    if (!bloques.length) return res.status(400).json({ error: 'Indica al menos una franja.' });
    await asegurarPlantilla(colegio_id, usuario_id);
    await execute(
      `DELETE FROM sgoi_plantilla_bloques
       WHERE colegio_id = ? AND usuario_id = ? AND weekday = ?`,
      [colegio_id, usuario_id, weekday]
    );
    for (const b of bloques) {
      await execute(
        `INSERT INTO sgoi_plantilla_bloques
          (colegio_id, usuario_id, weekday, hora_ini, hora_fin, titulo, tipo, orden)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [colegio_id, usuario_id, weekday, b.hora_ini, b.hora_fin, b.titulo, b.tipo, b.orden]
      );
    }
    res.json({ ok: true, weekday, n: bloques.length });
  } catch (e) {
    return handleSgoiError(res, e, 'horario/semana');
  }
});

router.put('/horario/plantilla/:bloqueId', requireHorarioAdmin, async (req, res) => {
  try {
    const { colegio_id, usuario_id } = await contextoUsuario(req);
    const id = parseInt(req.params.bloqueId, 10);
    const row = await query(
      `SELECT * FROM sgoi_plantilla_bloques WHERE id = ? AND colegio_id = ? AND usuario_id = ? LIMIT 1`,
      [id, colegio_id, usuario_id]
    );
    if (!row[0]) return res.status(404).json({ error: 'Franja no encontrada.' });
    const titulo = sanitizarTexto(req.body?.titulo, 160);
    await execute(
      `UPDATE sgoi_plantilla_bloques SET titulo = ?, tipo = ?, hora_ini = ?, hora_fin = ?
       WHERE id = ? AND colegio_id = ? AND usuario_id = ?`,
      [
        titulo || row[0].titulo,
        sanitizarTexto(req.body?.tipo, 24) || row[0].tipo,
        asTime(req.body?.hora_ini) || row[0].hora_ini,
        asTime(req.body?.hora_fin) || row[0].hora_fin,
        id,
        colegio_id,
        usuario_id,
      ]
    );
    res.json({ ok: true });
  } catch (e) {
    return handleSgoiError(res, e, 'horario/plantilla-editar');
  }
});

router.delete('/horario/plantilla/:bloqueId', requireHorarioAdmin, async (req, res) => {
  try {
    const { colegio_id, usuario_id } = await contextoUsuario(req);
    const id = parseInt(req.params.bloqueId, 10);
    const row = await query(
      `SELECT id FROM sgoi_plantilla_bloques WHERE id = ? AND colegio_id = ? AND usuario_id = ? LIMIT 1`,
      [id, colegio_id, usuario_id]
    );
    if (!row[0]) return res.status(404).json({ error: 'Franja no encontrada.' });
    await execute(
      `DELETE FROM sgoi_plantilla_bloques WHERE id = ? AND colegio_id = ? AND usuario_id = ?`,
      [id, colegio_id, usuario_id]
    );
    res.json({ ok: true });
  } catch (e) {
    return handleSgoiError(res, e, 'horario/plantilla-borrar');
  }
});

router.put('/horario/dia/:bloqueId', requireHorarioAdmin, async (req, res) => {
  try {
    const { colegio_id, usuario_id } = await contextoUsuario(req);
    const id = parseInt(req.params.bloqueId, 10);
    const alcance = String(req.body?.alcance || 'DIA').toUpperCase() === 'SIEMPRE' ? 'SIEMPRE' : 'DIA';
    const titulo = sanitizarTexto(req.body?.titulo, 160);
    const tipo = sanitizarTexto(req.body?.tipo, 24) || 'DESARROLLO';
    const row = await query(
      `SELECT * FROM sgoi_dia_bloques WHERE id = ? AND colegio_id = ? AND usuario_id = ? LIMIT 1`,
      [id, colegio_id, usuario_id]
    );
    if (!row[0]) return res.status(404).json({ error: 'Franja no encontrada.' });
    const horaIni = asTime(req.body?.hora_ini) || row[0].hora_ini;
    const horaFin = asTime(req.body?.hora_fin) || row[0].hora_fin;
    await execute(
      `UPDATE sgoi_dia_bloques SET titulo = ?, tipo = ?, hora_ini = ?, hora_fin = ?
       WHERE id = ? AND colegio_id = ?`,
      [titulo || row[0].titulo, tipo, horaIni, horaFin, id, colegio_id]
    );
    if (alcance === 'SIEMPRE' && row[0].plantilla_id) {
      await execute(
        `UPDATE sgoi_plantilla_bloques SET titulo = ?, tipo = ?, hora_ini = ?, hora_fin = ?
         WHERE id = ? AND colegio_id = ? AND usuario_id = ?`,
        [titulo || row[0].titulo, tipo, horaIni, horaFin, row[0].plantilla_id, colegio_id, usuario_id]
      );
    }
    res.json({ ok: true, alcance });
  } catch (e) {
    return handleSgoiError(res, e, 'horario/dia');
  }
});

router.post('/horario/dia', requireHorarioAdmin, async (req, res) => {
  try {
    const { colegio_id, usuario_id } = await contextoUsuario(req);
    const fecha = /^\d{4}-\d{2}-\d{2}$/.test(String(req.body?.fecha || ''))
      ? String(req.body.fecha)
      : fechaMySQLLima();
    await materializarDia(colegio_id, usuario_id, fecha);
    const titulo = sanitizarTexto(req.body?.titulo, 160);
    if (!titulo) return res.status(400).json({ error: 'El título es obligatorio.' });
    const ins = await execute(
      `INSERT INTO sgoi_dia_bloques
        (colegio_id, usuario_id, fecha, hora_ini, hora_fin, titulo, tipo)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        colegio_id,
        usuario_id,
        fecha,
        asTime(req.body?.hora_ini) || '08:00:00',
        asTime(req.body?.hora_fin) || '09:00:00',
        titulo,
        sanitizarTexto(req.body?.tipo, 24) || 'DESARROLLO',
      ]
    );
    res.status(201).json({ id: ins.insertId });
  } catch (e) {
    return handleSgoiError(res, e, 'horario/dia-crear');
  }
});

router.delete('/horario/dia/:bloqueId', requireHorarioAdmin, async (req, res) => {
  try {
    const { colegio_id, usuario_id } = await contextoUsuario(req);
    const id = parseInt(req.params.bloqueId, 10);
    const row = await query(
      `SELECT id FROM sgoi_dia_bloques WHERE id = ? AND colegio_id = ? AND usuario_id = ? LIMIT 1`,
      [id, colegio_id, usuario_id]
    );
    if (!row[0]) return res.status(404).json({ error: 'Franja no encontrada.' });
    await execute(
      `DELETE FROM sgoi_dia_bloques WHERE id = ? AND colegio_id = ? AND usuario_id = ?`,
      [id, colegio_id, usuario_id]
    );
    res.json({ ok: true });
  } catch (e) {
    return handleSgoiError(res, e, 'horario/dia-borrar');
  }
});

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
    if (estado && estado !== 'TODOS') {
      where.push('x.estado = ?');
      params.push(estado);
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
    res.json({ items: serializarFilasSgoi(rows) });
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
    res.status(201).json({ pendiente: serializarFilaSgoi(rows[0]) });
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
    const como = String(req.body?.como || 'CASO').toUpperCase() === 'TRABAJO' ? 'TRABAJO' : 'CASO';
    const ahora = fechaHoraMySQLLima();
    if (como === 'TRABAJO') {
      const ins = await execute(
        `INSERT INTO sgoi_trabajos
          (colegio_id, area_id, usuario_id, personal_id, pendiente_id, codigo, tipo, titulo, estado, inicio_at, fin_at, duracion_seg, nota)
         VALUES (?, ?, ?, ?, ?, ?, 'DESARROLLO', ?, 'HECHO', ?, ?, 0, ?)`,
        [
          ctx.colegio_id,
          ctx.area_id,
          ctx.usuario_id,
          ctx.personal_id,
          rows[0].id,
          'TMP',
          rows[0].titulo,
          ahora,
          ahora,
          sanitizarTexto(rows[0].descripcion, 4000) || 'Registrado desde pendientes.',
        ]
      );
      const codigo = padCodigo('TRB', ins.insertId);
      await execute('UPDATE sgoi_trabajos SET codigo = ? WHERE id = ? AND colegio_id = ?', [
        codigo,
        ins.insertId,
        ctx.colegio_id,
      ]);
      await execute(
        `UPDATE sgoi_pendientes SET estado = 'HECHO' WHERE id = ? AND colegio_id = ?`,
        [rows[0].id, ctx.colegio_id]
      );
      return res.status(201).json({ ok: true, kind: 'TRABAJO', id: ins.insertId, codigo });
    }
    const activo = await obtenerActivo(ctx.colegio_id, ctx.usuario_id);
    if (activo) {
      return res.status(409).json({
        error: 'Ya tienes un caso en curso. Ciérralo antes de continuar este pendiente.',
        activo,
      });
    }
    const ins = await execute(
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
    const codigo = padCodigo('CAS', ins.insertId);
    await execute('UPDATE sgoi_casos SET codigo = ? WHERE id = ? AND colegio_id = ?', [
      codigo,
      ins.insertId,
      ctx.colegio_id,
    ]);
    await execute(
      `UPDATE sgoi_pendientes SET estado = 'EN_CURSO' WHERE id = ? AND colegio_id = ?`,
      [rows[0].id, ctx.colegio_id]
    );
    const creado = await obtenerActivo(ctx.colegio_id, ctx.usuario_id);
    res.status(201).json({ activo: creado, kind: 'CASO', codigo });
  } catch (e) {
    return handleSgoiError(res, e, 'pendientes/continuar');
  }
});

router.put('/casos/:id', async (req, res) => {
  try {
    const ctx = await contextoUsuario(req);
    const id = parseInt(req.params.id, 10);
    const rows = await query(
      `SELECT * FROM sgoi_casos WHERE id = ? AND colegio_id = ? LIMIT 1`,
      [id, ctx.colegio_id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Caso no encontrado.' });
    const titulo = sanitizarTexto(req.body?.titulo, 200);
    const nota = sanitizarTexto(req.body?.nota, 4000);
    const prioridad = ['NORMAL', 'ALTA', 'URGENTE'].includes(req.body?.prioridad)
      ? req.body.prioridad
      : rows[0].prioridad;
    let estado = sanitizarTexto(req.body?.estado, 16) || rows[0].estado;
    if (!['EN_CURSO', 'RESUELTO', 'PENDIENTE'].includes(estado)) {
      return res.status(400).json({ error: 'Estado inválido.' });
    }
    if (rows[0].estado === 'EN_CURSO' && estado !== 'EN_CURSO') {
      return res.status(400).json({
        error: 'Un caso en curso se cierra desde el flotante (Resuelto o Pendiente).',
      });
    }
    if (estado === 'EN_CURSO' && rows[0].estado !== 'EN_CURSO') {
      return res.status(400).json({ error: 'No se puede reabrir un caso como en curso desde aquí.' });
    }
    await execute(
      `UPDATE sgoi_casos SET titulo = ?, nota = ?, prioridad = ?, estado = ?
       WHERE id = ? AND colegio_id = ?`,
      [titulo || rows[0].titulo, nota, prioridad, estado, id, ctx.colegio_id]
    );
    if (nota && nota !== rows[0].nota) {
      await agregarSeguimiento({
        colegioId: ctx.colegio_id,
        entidad: 'CASO',
        entidadId: id,
        usuarioId: ctx.usuario_id,
        texto: `Edición: ${nota}`,
      });
    }
    auditarSgoi(req, { accion: 'EDITAR', entidad: 'caso', entidad_id: id, descripcion: titulo || rows[0].codigo });
    const updated = await query(`SELECT * FROM sgoi_casos WHERE id = ? AND colegio_id = ?`, [id, ctx.colegio_id]);
    res.json({ caso: serializarFilaSgoi(updated[0]) });
  } catch (e) {
    return handleSgoiError(res, e, 'casos/editar');
  }
});

router.put('/trabajos/:id', async (req, res) => {
  try {
    const ctx = await contextoUsuario(req);
    const id = parseInt(req.params.id, 10);
    const rows = await query(
      `SELECT * FROM sgoi_trabajos WHERE id = ? AND colegio_id = ? LIMIT 1`,
      [id, ctx.colegio_id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Trabajo no encontrado.' });
    const titulo = sanitizarTexto(req.body?.titulo, 200);
    const nota = sanitizarTexto(req.body?.nota, 4000);
    const tipo = TIPOS_TRABAJO.includes(req.body?.tipo) ? req.body.tipo : rows[0].tipo;
    let estado = sanitizarTexto(req.body?.estado, 16) || rows[0].estado;
    if (!['EN_CURSO', 'HECHO', 'PENDIENTE'].includes(estado)) {
      return res.status(400).json({ error: 'Estado inválido.' });
    }
    if (estado === 'EN_CURSO' && rows[0].estado !== 'EN_CURSO') {
      return res.status(400).json({ error: 'No se puede reabrir un trabajo como en curso desde aquí.' });
    }
    const tituloFinal = titulo || rows[0].titulo;
    if (rows[0].estado === 'EN_CURSO' && estado !== 'EN_CURSO') {
      const ahora = fechaHoraMySQLLima();
      await execute(
        `UPDATE sgoi_trabajos SET titulo = ?, nota = ?, tipo = ?, estado = ?, fin_at = ?, duracion_seg = ?
         WHERE id = ? AND colegio_id = ?`,
        [tituloFinal, nota, tipo, estado, ahora, segundosEntre(rows[0].inicio_at, ahora), id, ctx.colegio_id]
      );
    } else {
      await execute(
        `UPDATE sgoi_trabajos SET titulo = ?, nota = ?, tipo = ?, estado = ?
         WHERE id = ? AND colegio_id = ?`,
        [tituloFinal, nota, tipo, estado, id, ctx.colegio_id]
      );
    }
    auditarSgoi(req, { accion: 'EDITAR', entidad: 'trabajo', entidad_id: id, descripcion: titulo || rows[0].codigo });
    const updated = await query(`SELECT * FROM sgoi_trabajos WHERE id = ? AND colegio_id = ?`, [id, ctx.colegio_id]);
    res.json({ trabajo: serializarFilaSgoi(updated[0]) });
  } catch (e) {
    return handleSgoiError(res, e, 'trabajos/editar');
  }
});

router.put('/pendientes/:id', async (req, res) => {
  try {
    const ctx = await contextoUsuario(req);
    const id = parseInt(req.params.id, 10);
    const rows = await query(
      `SELECT * FROM sgoi_pendientes WHERE id = ? AND colegio_id = ? LIMIT 1`,
      [id, ctx.colegio_id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Pendiente no encontrado.' });
    const titulo = sanitizarTexto(req.body?.titulo, 200);
    const descripcion = sanitizarTexto(req.body?.descripcion, 4000);
    const prioridad = ['NORMAL', 'ALTA', 'URGENTE'].includes(req.body?.prioridad)
      ? req.body.prioridad
      : rows[0].prioridad;
    const estado = ['ABIERTO', 'EN_CURSO', 'HECHO'].includes(req.body?.estado)
      ? req.body.estado
      : rows[0].estado;
    const cerradoAt = estado === 'HECHO' ? (rows[0].cerrado_at || fechaHoraMySQLLima()) : null;
    await execute(
      `UPDATE sgoi_pendientes SET titulo = ?, descripcion = ?, prioridad = ?, estado = ?, cerrado_at = ?
       WHERE id = ? AND colegio_id = ?`,
      [titulo || rows[0].titulo, descripcion, prioridad, estado, cerradoAt, id, ctx.colegio_id]
    );
    auditarSgoi(req, { accion: 'EDITAR', entidad: 'pendiente', entidad_id: id, descripcion: titulo || rows[0].titulo });
    const updated = await query(`SELECT * FROM sgoi_pendientes WHERE id = ? AND colegio_id = ?`, [id, ctx.colegio_id]);
    res.json({ pendiente: serializarFilaSgoi(updated[0]) });
  } catch (e) {
    return handleSgoiError(res, e, 'pendientes/editar');
  }
});

router.delete('/casos/:id', async (req, res) => {
  try {
    const ctx = await contextoUsuario(req);
    const id = parseInt(req.params.id, 10);
    const rows = await query(
      `SELECT id, codigo FROM sgoi_casos WHERE id = ? AND colegio_id = ? LIMIT 1`,
      [id, ctx.colegio_id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Caso no encontrado.' });
    await execute(
      `DELETE FROM sgoi_seguimientos WHERE colegio_id = ? AND entidad = 'CASO' AND entidad_id = ?`,
      [ctx.colegio_id, id]
    );
    await execute(`DELETE FROM sgoi_casos WHERE id = ? AND colegio_id = ?`, [id, ctx.colegio_id]);
    auditarSgoi(req, { accion: 'ELIMINAR', entidad: 'caso', entidad_id: id, descripcion: rows[0].codigo });
    res.json({ ok: true });
  } catch (e) {
    return handleSgoiError(res, e, 'casos/eliminar');
  }
});

router.delete('/trabajos/:id', async (req, res) => {
  try {
    const ctx = await contextoUsuario(req);
    const id = parseInt(req.params.id, 10);
    const rows = await query(
      `SELECT id, codigo FROM sgoi_trabajos WHERE id = ? AND colegio_id = ? LIMIT 1`,
      [id, ctx.colegio_id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Trabajo no encontrado.' });
    await execute(
      `DELETE FROM sgoi_seguimientos WHERE colegio_id = ? AND entidad = 'TRABAJO' AND entidad_id = ?`,
      [ctx.colegio_id, id]
    );
    await execute(`DELETE FROM sgoi_trabajos WHERE id = ? AND colegio_id = ?`, [id, ctx.colegio_id]);
    auditarSgoi(req, { accion: 'ELIMINAR', entidad: 'trabajo', entidad_id: id, descripcion: rows[0].codigo });
    res.json({ ok: true });
  } catch (e) {
    return handleSgoiError(res, e, 'trabajos/eliminar');
  }
});

router.delete('/pendientes/:id', async (req, res) => {
  try {
    const ctx = await contextoUsuario(req);
    const id = parseInt(req.params.id, 10);
    const rows = await query(
      `SELECT id, titulo FROM sgoi_pendientes WHERE id = ? AND colegio_id = ? LIMIT 1`,
      [id, ctx.colegio_id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Pendiente no encontrado.' });
    await execute(
      `DELETE FROM sgoi_seguimientos WHERE colegio_id = ? AND entidad = 'PENDIENTE' AND entidad_id = ?`,
      [ctx.colegio_id, id]
    );
    await execute(`DELETE FROM sgoi_pendientes WHERE id = ? AND colegio_id = ?`, [id, ctx.colegio_id]);
    auditarSgoi(req, { accion: 'ELIMINAR', entidad: 'pendiente', entidad_id: id, descripcion: rows[0].titulo });
    res.json({ ok: true });
  } catch (e) {
    return handleSgoiError(res, e, 'pendientes/eliminar');
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
