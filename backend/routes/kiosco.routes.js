/**
 * Kiosco cafetín. Montaje: /api/kiosco
 */
const express = require('express');
const crypto = require('crypto');
const path = require('path');
const multer = require('multer');
const router = express.Router();
const { query, execute } = require('../utils/mysql');
const { authenticateToken } = require('../middleware/auth');
const { DEFAULT_COLEGIO_ID } = require('../utils/defaultColegio');
const { moduloActivo } = require('../utils/modulosSistema');
const { insertNotificacionUsuario } = require('../utils/notificacionInsert');
const { fechaHoraMySQLLima } = require('../utils/fechaHoraLima');
const { staticFsSubdir, getPublicStaticBaseUrl } = require('../utils/staticStorage');

const uploadKiosco = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, staticFsSubdir('Image', 'Kiosco')),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
      cb(null, `kiosco-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpeg|jpg|png|webp|gif)$/i.test(file.mimetype || '')) return cb(null, true);
    cb(new Error('La imagen debe ser JPG, PNG o WEBP'));
  },
});

function urlImagenKiosco(file) {
  if (!file) return '';
  return `${getPublicStaticBaseUrl()}/Static/Image/Kiosco/${file.filename}`;
}

router.use(authenticateToken);

function hoyLima() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
}

function horaLima() {
  return new Date().toLocaleTimeString('en-GB', { timeZone: 'America/Lima', hour12: false }).slice(0, 5);
}

function codigoPedido() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

async function exigirModulo(res) {
  if (await moduloActivo('kiosco')) return true;
  res.status(403).json({ error: 'El kiosco cafetín está apagado en Módulos.' });
  return false;
}

const TIPOS_PERSONAL = new Set([
  'ADMINISTRADOR', 'DIRECTOR', 'DOCENTE', 'AUXILIAR', 'SECRETARIA', 'CAJERO',
  'ENFERMERA', 'PROMOTORIA', 'COORDINADOR', 'PSICOLOGA', 'CONTADOR', 'TUTOR', 'MANTENIMIENTO',
]);

function esCaja(user) {
  return user?.tipo === 'KIOSCO' || user?.tipo === 'ADMINISTRADOR';
}

function esPersonal(user) {
  return TIPOS_PERSONAL.has(user?.tipo);
}

async function leerConfig(colegioId) {
  const [row] = await query('SELECT * FROM kiosco_config WHERE colegio_id = ? LIMIT 1', [colegioId]);
  if (row) {
    return {
      quien_pide: row.quien_pide || 'AMBOS',
      pide_personal: row.pide_personal == null ? true : Number(row.pide_personal) === 1,
      limite_activo: Number(row.limite_activo) === 1,
      limite_monto: Number(row.limite_monto) || 0,
      corte_activo: Number(row.corte_activo) === 1,
      corte_hora: row.corte_hora ? String(row.corte_hora).slice(0, 5) : '',
      comida_activa: Number(row.comida_activa) === 1,
      fiado_activo: Number(row.fiado_activo) === 1,
    };
  }
  return {
    quien_pide: 'AMBOS',
    pide_personal: true,
    limite_activo: false,
    limite_monto: 0,
    corte_activo: false,
    corte_hora: '',
    comida_activa: true,
    fiado_activo: true,
  };
}

async function deudaDeCliente(colegioId, alumnoId, usuarioId) {
  const [row] = alumnoId
    ? await query(
      `SELECT COALESCE(SUM(total), 0) AS deuda
       FROM kiosco_pedidos
       WHERE colegio_id = ? AND alumno_id = ? AND pago IN ('pendiente','fiado') AND estado IN ('aceptado','entregado')`,
      [colegioId, alumnoId]
    )
    : await query(
      `SELECT COALESCE(SUM(total), 0) AS deuda
       FROM kiosco_pedidos
       WHERE colegio_id = ? AND cliente_usuario_id = ? AND pago IN ('pendiente','fiado') AND estado IN ('aceptado','entregado')`,
      [colegioId, usuarioId]
    );
  return Number(row?.deuda) || 0;
}

async function gradoDeAlumno(alumnoId, colegioId) {
  const [row] = await query(
    `SELECT n.nombre AS nivel, g.grado, g.seccion
     FROM matriculas m
     INNER JOIN grupos g ON g.id = m.grupo_id
     INNER JOIN niveles n ON n.id = g.nivel_id
     WHERE m.alumno_id = ? AND m.colegio_id = ? AND m.estado NOT IN (2, 3)
     ORDER BY g.anio DESC, m.id DESC
     LIMIT 1`,
    [alumnoId, colegioId]
  );
  if (!row) return '';
  return `${row.nivel || ''} ${row.grado || ''}° ${row.seccion || ''}`.replace(/\s+/g, ' ').trim();
}

router.get('/config', async (req, res) => {
  if (!(await exigirModulo(res))) return;
  try {
    const config = await leerConfig(req.user.colegio_id || DEFAULT_COLEGIO_ID);
    res.json({ config, caja: esCaja(req.user), hoy: hoyLima() });
  } catch (e) {
    res.status(500).json({ error: e.message || 'No se pudo leer el kiosco' });
  }
});

router.put('/config', async (req, res) => {
  if (!(await exigirModulo(res))) return;
  if (!esCaja(req.user)) return res.status(403).json({ error: 'Solo el perfil Kiosco puede cambiar estos ajustes.' });
  const colegioId = req.user.colegio_id || DEFAULT_COLEGIO_ID;
  const b = req.body || {};
  const quien = ['APODERADO', 'ALUMNO', 'AMBOS'].includes(b.quien_pide) ? b.quien_pide : 'AMBOS';
  const corte = /^\d{2}:\d{2}$/.test(String(b.corte_hora || '')) ? b.corte_hora : null;
  try {
    await execute(
      `INSERT INTO kiosco_config
        (colegio_id, quien_pide, pide_personal, limite_activo, limite_monto, corte_activo, corte_hora, comida_activa, fiado_activo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
        quien_pide = VALUES(quien_pide), pide_personal = VALUES(pide_personal),
        limite_activo = VALUES(limite_activo), limite_monto = VALUES(limite_monto),
        corte_activo = VALUES(corte_activo), corte_hora = VALUES(corte_hora),
        comida_activa = VALUES(comida_activa), fiado_activo = VALUES(fiado_activo)`,
      [
        colegioId,
        quien,
        b.pide_personal === false ? 0 : 1,
        b.limite_activo ? 1 : 0,
        Number(b.limite_monto) || 0,
        b.corte_activo ? 1 : 0,
        corte,
        b.comida_activa === false ? 0 : 1,
        b.fiado_activo === false ? 0 : 1,
      ]
    );
    res.json({ config: await leerConfig(colegioId) });
  } catch (e) {
    res.status(500).json({ error: e.message || 'No se pudo guardar' });
  }
});

router.get('/carta', async (req, res) => {
  if (!(await exigirModulo(res))) return;
  const colegioId = req.user.colegio_id || DEFAULT_COLEGIO_ID;
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.fecha || '')) ? req.query.fecha : hoyLima();
  try {
    const config = await leerConfig(colegioId);
    const categorias = await query(
      'SELECT id, nombre, emoji, imagen_url FROM kiosco_categorias WHERE colegio_id = ? AND activo = 1 ORDER BY orden, nombre',
      [colegioId]
    );
    const productos = await query(
      `SELECT p.id, p.categoria_id, p.nombre, p.descripcion, p.precio, p.emoji, p.imagen_url,
              p.siempre, p.es_comida, p.stock
       FROM kiosco_productos p
       WHERE p.colegio_id = ? AND p.activo = 1
         AND (p.siempre = 1 OR EXISTS (
           SELECT 1 FROM kiosco_carta c WHERE c.producto_id = p.id AND c.fecha = ?
         ))
       ORDER BY p.nombre`,
      [colegioId, fecha]
    );
    const visibles = (productos || []).filter((p) => config.comida_activa || Number(p.es_comida) !== 1);
    res.json({ fecha, config, categorias: categorias || [], productos: visibles });
  } catch (e) {
    res.status(500).json({ error: e.message || 'No se pudo cargar la carta' });
  }
});

router.get('/hijos', async (req, res) => {
  if (!(await exigirModulo(res))) return;
  const colegioId = req.user.colegio_id || DEFAULT_COLEGIO_ID;
  try {
    let rows = [];
    if (req.user.tipo === 'ALUMNO' && req.user.alumno_id) {
      rows = await query(
        'SELECT id, nombres, apellido_paterno, apellido_materno FROM alumnos WHERE id = ? AND colegio_id = ?',
        [req.user.alumno_id, colegioId]
      );
    } else if (req.user.tipo === 'APODERADO' && req.user.apoderado_id) {
      rows = await query(
        `SELECT a.id, a.nombres, a.apellido_paterno, a.apellido_materno
         FROM alumnos a
         INNER JOIN familias f ON f.alumno_id = a.id AND f.apoderado_id = ?
         WHERE a.colegio_id = ?
         ORDER BY a.apellido_paterno, a.nombres`,
        [req.user.apoderado_id, colegioId]
      );
    }
    const hijos = [];
    for (const a of rows || []) {
      hijos.push({
        id: a.id,
        nombre: `${a.nombres || ''} ${a.apellido_paterno || ''} ${a.apellido_materno || ''}`.replace(/\s+/g, ' ').trim(),
        grado: await gradoDeAlumno(a.id, colegioId),
        deuda: await deudaDeCliente(colegioId, a.id, null),
      });
    }
    if (!rows.length && esPersonal(req.user) && req.user.tipo !== 'KIOSCO') {
      const [p] = await query(
        `SELECT p.nombres, p.apellidos FROM personal p
         INNER JOIN usuarios u ON u.personal_id = p.id
         WHERE u.id = ? LIMIT 1`,
        [req.user.id]
      );
      const nombre = p
        ? `${p.nombres || ''} ${p.apellidos || ''}`.replace(/\s+/g, ' ').trim()
        : (req.user.nombres || req.user.usuario || 'Personal');
      return res.json({
        hijos: [],
        yo: {
          usuario_id: req.user.id,
          nombre,
          deuda: await deudaDeCliente(colegioId, null, req.user.id),
        },
      });
    }
    res.json({ hijos });
  } catch (e) {
    res.status(500).json({ error: e.message || 'No se pudieron cargar los estudiantes' });
  }
});

router.post('/pedidos', async (req, res) => {
  if (!(await exigirModulo(res))) return;
  const colegioId = req.user.colegio_id || DEFAULT_COLEGIO_ID;
  const tipo = req.user.tipo;
  if (tipo !== 'APODERADO' && tipo !== 'ALUMNO' && tipo !== 'KIOSCO' && !esPersonal(req.user)) {
    return res.status(403).json({ error: 'No puedes hacer pedidos.' });
  }
  try {
    const config = await leerConfig(colegioId);
    const mostrador = esCaja(req.user) && req.body?.origen === 'mostrador';
    if (!mostrador) {
      if (tipo === 'APODERADO' && config.quien_pide === 'ALUMNO') {
        return res.status(403).json({ error: 'En este momento solo el alumno puede pedir.' });
      }
      if (tipo === 'ALUMNO' && config.quien_pide === 'APODERADO') {
        return res.status(403).json({ error: 'En este momento solo el apoderado puede pedir.' });
      }
      if (esPersonal(req.user) && tipo !== 'ADMINISTRADOR' && !config.pide_personal) {
        return res.status(403).json({ error: 'El personal no puede pedir en línea en este momento.' });
      }
    }
    const alumnoId = parseInt(req.body?.alumno_id, 10) || null;
    const clienteUsuarioId = parseInt(req.body?.cliente_usuario_id, 10) || (req.body?.para_mi ? req.user.id : null);
    const fecha = String(req.body?.fecha || '');
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const pago = ['pagado', 'pendiente', 'fiado'].includes(req.body?.pago) ? req.body.pago : 'pendiente';
    if ((!alumnoId && !clienteUsuarioId) || !/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !items.length) {
      return res.status(400).json({ error: 'Elige a la persona, el día y al menos un producto.' });
    }
    if (clienteUsuarioId && !mostrador && clienteUsuarioId !== req.user.id) {
      return res.status(403).json({ error: 'Solo puedes pedir para ti.' });
    }
    if (!mostrador && config.corte_activo && config.corte_hora && horaLima() >= config.corte_hora && fecha <= hoyLima()) {
      return res.status(400).json({ error: `El corte de pedidos de hoy fue a las ${config.corte_hora}.` });
    }
    if (!config.fiado_activo && (pago === 'fiado' || pago === 'pendiente') && mostrador) {
      return res.status(400).json({ error: 'El fiado está apagado.' });
    }
    const ids = items.map((it) => parseInt(it.producto_id, 10)).filter((n) => n > 0);
    if (!ids.length) return res.status(400).json({ error: 'Elige al menos un producto.' });
    const prods = await query(
      `SELECT id, nombre, precio, stock, es_comida FROM kiosco_productos WHERE colegio_id = ? AND activo = 1 AND id IN (${ids.map(() => '?').join(',')})`,
      [colegioId, ...ids]
    );
    const map = new Map((prods || []).map((p) => [p.id, p]));
    let total = 0;
    const lineas = [];
    for (const it of items) {
      const p = map.get(parseInt(it.producto_id, 10));
      const cant = Math.max(1, parseInt(it.cantidad, 10) || 1);
      if (!p) continue;
      if (!config.comida_activa && Number(p.es_comida) === 1) continue;
      if (Number(p.stock) < cant) {
        return res.status(400).json({ error: `No hay stock suficiente de ${p.nombre}.` });
      }
      total += Number(p.precio) * cant;
      lineas.push({ id: p.id, nombre: p.nombre, precio: Number(p.precio), cantidad: cant });
    }
    if (!lineas.length) return res.status(400).json({ error: 'No hay productos válidos en el pedido.' });
    if (!mostrador && config.limite_activo && total > Number(config.limite_monto)) {
      return res.status(400).json({ error: `El pedido supera el límite de S/ ${Number(config.limite_monto).toFixed(2)}.` });
    }
    const codigo = codigoPedido();
    const estado = mostrador ? 'entregado' : 'pedido';
    const pagoFinal = mostrador ? pago : 'pendiente';
    const ins = await execute(
      `INSERT INTO kiosco_pedidos
        (colegio_id, alumno_id, cliente_usuario_id, usuario_id, codigo, fecha_consumo, estado, pago, origen, total, nota, creado_en)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        colegioId,
        alumnoId,
        clienteUsuarioId,
        req.user.id,
        codigo,
        fecha,
        estado,
        pagoFinal,
        mostrador ? 'mostrador' : 'linea',
        total,
        String(req.body?.nota || '').slice(0, 255),
        fechaHoraMySQLLima(),
      ]
    );
    const pedidoId = ins.insertId;
    for (const ln of lineas) {
      await execute(
        'INSERT INTO kiosco_pedido_items (pedido_id, producto_id, nombre, precio, cantidad) VALUES (?, ?, ?, ?, ?)',
        [pedidoId, ln.id, ln.nombre, ln.precio, ln.cantidad]
      );
      if (mostrador) {
        await execute('UPDATE kiosco_productos SET stock = GREATEST(stock - ?, 0) WHERE id = ?', [ln.cantidad, ln.id]);
      }
    }
    if (!mostrador) {
      const cajeros = await query(
        `SELECT id FROM usuarios WHERE colegio_id = ? AND tipo = 'KIOSCO' AND estado = 'ACTIVO'`,
        [colegioId]
      );
      for (const c of cajeros || []) {
        await insertNotificacionUsuario(execute, {
          usuario_id: c.id,
          destinatario_id: c.id,
          asunto: 'Nuevo pedido del kiosco',
          contenido: `Pedido ${codigo} por S/ ${total.toFixed(2)}.`,
          url_destino: '/kiosco',
        });
      }
    }
    res.json({ ok: true, id: pedidoId, codigo, total });
  } catch (e) {
    res.status(500).json({ error: e.message || 'No se pudo registrar el pedido' });
  }
});

router.get('/clientes', async (req, res) => {
  if (!(await exigirModulo(res))) return;
  if (!esCaja(req.user)) return res.status(403).json({ error: 'No autorizado' });
  const colegioId = req.user.colegio_id || DEFAULT_COLEGIO_ID;
  const q = `%${String(req.query.q || '').trim()}%`;
  if (q === '%%') return res.json({ clientes: [] });
  try {
    const alumnos = await query(
      `SELECT id AS alumno_id, NULL AS usuario_id, CONCAT(nombres, ' ', apellido_paterno) AS nombre, 'Alumno' AS clase
       FROM alumnos
       WHERE colegio_id = ? AND (nombres LIKE ? OR apellido_paterno LIKE ? OR nro_documento LIKE ?)
       ORDER BY apellido_paterno LIMIT 8`,
      [colegioId, q, q, q]
    );
    const personal = await query(
      `SELECT NULL AS alumno_id, u.id AS usuario_id, CONCAT(p.nombres, ' ', p.apellidos) AS nombre, u.tipo AS clase
       FROM personal p
       INNER JOIN usuarios u ON u.personal_id = p.id AND u.colegio_id = p.colegio_id AND u.estado = 'ACTIVO'
       WHERE p.colegio_id = ? AND u.tipo <> 'KIOSCO'
         AND (p.nombres LIKE ? OR p.apellidos LIKE ? OR p.nro_documento LIKE ?)
       ORDER BY p.apellidos LIMIT 8`,
      [colegioId, q, q, q]
    );
    res.json({ clientes: [...(alumnos || []), ...(personal || [])] });
  } catch (e) {
    res.status(500).json({ error: e.message || 'No se pudo buscar' });
  }
});

router.get('/pedidos', async (req, res) => {
  if (!(await exigirModulo(res))) return;
  if (!esCaja(req.user)) return res.status(403).json({ error: 'Solo el perfil Kiosco ve la cola.' });
  const colegioId = req.user.colegio_id || DEFAULT_COLEGIO_ID;
  const estado = String(req.query.estado || 'pedido');
  try {
    const pedidos = await query(
      `SELECT p.id, p.codigo, p.fecha_consumo, p.estado, p.pago, p.origen, p.total, p.nota, p.creado_en,
              a.nombres, a.apellido_paterno, a.apellido_materno, p.alumno_id, p.cliente_usuario_id,
              per.nombres AS per_nombres, per.apellidos AS per_apellidos
       FROM kiosco_pedidos p
       LEFT JOIN alumnos a ON a.id = p.alumno_id
       LEFT JOIN usuarios cu ON cu.id = p.cliente_usuario_id
       LEFT JOIN personal per ON per.id = cu.personal_id
       WHERE p.colegio_id = ? AND (? = 'todos' OR p.estado = ?)
       ORDER BY p.id DESC
       LIMIT 80`,
      [colegioId, estado, estado]
    );
    const salida = [];
    for (const p of pedidos || []) {
      const items = await query(
        'SELECT nombre, precio, cantidad FROM kiosco_pedido_items WHERE pedido_id = ?',
        [p.id]
      );
      salida.push({
        ...p,
        alumno: p.alumno_id
          ? `${p.nombres || ''} ${p.apellido_paterno || ''}`.replace(/\s+/g, ' ').trim()
          : `${p.per_nombres || ''} ${p.per_apellidos || ''}`.replace(/\s+/g, ' ').trim() || 'Personal',
        grado: p.alumno_id ? await gradoDeAlumno(p.alumno_id, colegioId) : 'Personal',
        deuda: await deudaDeCliente(colegioId, p.alumno_id, p.cliente_usuario_id),
        items: items || [],
      });
    }
    res.json({ pedidos: salida });
  } catch (e) {
    res.status(500).json({ error: e.message || 'No se pudieron leer los pedidos' });
  }
});

router.post('/pedidos/:id/estado', async (req, res) => {
  if (!(await exigirModulo(res))) return;
  if (!esCaja(req.user)) return res.status(403).json({ error: 'Solo el perfil Kiosco decide el pedido.' });
  const colegioId = req.user.colegio_id || DEFAULT_COLEGIO_ID;
  const id = parseInt(req.params.id, 10);
  const estado = String(req.body?.estado || '');
  const pago = req.body?.pago;
  if (!['aceptado', 'rechazado', 'entregado'].includes(estado)) {
    return res.status(400).json({ error: 'Estado no válido.' });
  }
  try {
    const [ped] = await query(
      'SELECT * FROM kiosco_pedidos WHERE id = ? AND colegio_id = ? LIMIT 1',
      [id, colegioId]
    );
    if (!ped) return res.status(404).json({ error: 'Pedido no encontrado.' });
    if (estado === 'aceptado' && ped.estado === 'pedido') {
      const items = await query('SELECT producto_id, cantidad FROM kiosco_pedido_items WHERE pedido_id = ?', [id]);
      for (const it of items || []) {
        if (it.producto_id) {
          await execute('UPDATE kiosco_productos SET stock = GREATEST(stock - ?, 0) WHERE id = ?', [it.cantidad, it.producto_id]);
        }
      }
    }
    const pagoSql = ['pagado', 'pendiente', 'fiado'].includes(pago) ? pago : ped.pago;
    await execute('UPDATE kiosco_pedidos SET estado = ?, pago = ? WHERE id = ?', [estado, pagoSql, id]);
    if (estado === 'aceptado' || estado === 'rechazado') {
      const padres = ped.alumno_id
        ? await query(
          `SELECT u.id FROM usuarios u
           INNER JOIN familias f ON f.apoderado_id = u.apoderado_id
           WHERE f.alumno_id = ? AND u.tipo = 'APODERADO' AND u.colegio_id = ?`,
          [ped.alumno_id, colegioId]
        )
        : [];
      if (ped.cliente_usuario_id) padres.push({ id: ped.cliente_usuario_id });
      const texto = estado === 'aceptado'
        ? `Tu pedido ${ped.codigo} fue aceptado. Total S/ ${Number(ped.total).toFixed(2)}.`
        : `Tu pedido ${ped.codigo} no fue aceptado.`;
      for (const padre of padres || []) {
        await insertNotificacionUsuario(execute, {
          usuario_id: padre.id,
          destinatario_id: padre.id,
          asunto: estado === 'aceptado' ? 'Pedido del kiosco aceptado' : 'Pedido del kiosco rechazado',
          contenido: texto,
          url_destino: '/kiosco/pedir',
        });
      }
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message || 'No se pudo actualizar el pedido' });
  }
});

router.get('/catalogo', async (req, res) => {
  if (!(await exigirModulo(res))) return;
  if (!esCaja(req.user)) return res.status(403).json({ error: 'Solo el perfil Kiosco administra la carta.' });
  const colegioId = req.user.colegio_id || DEFAULT_COLEGIO_ID;
  try {
    const categorias = await query(
      'SELECT * FROM kiosco_categorias WHERE colegio_id = ? AND activo = 1 ORDER BY orden, nombre',
      [colegioId]
    );
    const productos = await query(
      'SELECT * FROM kiosco_productos WHERE colegio_id = ? AND activo = 1 ORDER BY nombre',
      [colegioId]
    );
    res.json({ categorias: categorias || [], productos: productos || [] });
  } catch (e) {
    res.status(500).json({ error: e.message || 'No se pudo leer el catálogo' });
  }
});

router.post('/categorias', uploadKiosco.single('imagen'), async (req, res) => {
  if (!(await exigirModulo(res))) return;
  if (!esCaja(req.user)) return res.status(403).json({ error: 'No autorizado' });
  const nombre = String(req.body?.nombre || '').trim();
  if (!nombre) return res.status(400).json({ error: 'Escribe el nombre de la categoría.' });
  try {
    await execute(
      'INSERT INTO kiosco_categorias (colegio_id, nombre, emoji, imagen_url) VALUES (?, ?, ?, ?)',
      [
        req.user.colegio_id || DEFAULT_COLEGIO_ID,
        nombre,
        String(req.body?.emoji || '🍽️').slice(0, 16),
        urlImagenKiosco(req.file),
      ]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message || 'No se pudo crear' });
  }
});

router.put('/categorias/:id', uploadKiosco.single('imagen'), async (req, res) => {
  if (!(await exigirModulo(res))) return;
  if (!esCaja(req.user)) return res.status(403).json({ error: 'No autorizado' });
  const id = parseInt(req.params.id, 10);
  const nombre = String(req.body?.nombre || '').trim();
  if (!id || !nombre) return res.status(400).json({ error: 'Escribe el nombre de la categoría.' });
  const colegioId = req.user.colegio_id || DEFAULT_COLEGIO_ID;
  try {
    const imagen = urlImagenKiosco(req.file) || null;
    await execute(
      `UPDATE kiosco_categorias
       SET nombre = ?, emoji = ?, imagen_url = IF(? IS NULL, imagen_url, ?)
       WHERE id = ? AND colegio_id = ?`,
      [nombre, String(req.body?.emoji || '🍽️').slice(0, 16), imagen, imagen || '', id, colegioId]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message || 'No se pudo guardar la categoría' });
  }
});

router.delete('/categorias/:id', async (req, res) => {
  if (!(await exigirModulo(res))) return;
  if (!esCaja(req.user)) return res.status(403).json({ error: 'No autorizado' });
  try {
    await execute(
      'UPDATE kiosco_categorias SET activo = 0 WHERE id = ? AND colegio_id = ?',
      [parseInt(req.params.id, 10), req.user.colegio_id || DEFAULT_COLEGIO_ID]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message || 'No se pudo quitar la categoría' });
  }
});

router.post('/productos', uploadKiosco.single('imagen'), async (req, res) => {
  if (!(await exigirModulo(res))) return;
  if (!esCaja(req.user)) return res.status(403).json({ error: 'No autorizado' });
  const nombre = String(req.body?.nombre || '').trim();
  if (!nombre) return res.status(400).json({ error: 'Escribe el nombre del producto.' });
  const colegioId = req.user.colegio_id || DEFAULT_COLEGIO_ID;
  try {
    await execute(
      `INSERT INTO kiosco_productos
        (colegio_id, categoria_id, nombre, descripcion, precio, emoji, imagen_url, siempre, es_comida, stock)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        colegioId,
        parseInt(req.body?.categoria_id, 10) || null,
        nombre,
        String(req.body?.descripcion || '').slice(0, 255),
        Number(req.body?.precio) || 0,
        String(req.body?.emoji || '🥤').slice(0, 16),
        urlImagenKiosco(req.file) || String(req.body?.imagen_url || '').slice(0, 500),
        String(req.body?.siempre) === 'false' || req.body?.siempre === false ? 0 : 1,
        String(req.body?.es_comida) === 'true' || req.body?.es_comida === true ? 1 : 0,
        parseInt(req.body?.stock, 10) || 0,
      ]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message || 'No se pudo crear el producto' });
  }
});

router.put('/productos/:id', uploadKiosco.single('imagen'), async (req, res) => {
  if (!(await exigirModulo(res))) return;
  if (!esCaja(req.user)) return res.status(403).json({ error: 'No autorizado' });
  const id = parseInt(req.params.id, 10);
  const nombre = String(req.body?.nombre || '').trim();
  if (!id || !nombre) return res.status(400).json({ error: 'Escribe el nombre del producto.' });
  const colegioId = req.user.colegio_id || DEFAULT_COLEGIO_ID;
  try {
    const imagen = urlImagenKiosco(req.file) || null;
    await execute(
      `UPDATE kiosco_productos`
       SET categoria_id = ?, nombre = ?, precio = ?, emoji = ?,
           imagen_url = IF(? IS NULL, imagen_url, ?),
           siempre = ?, es_comida = ?, stock = ?
       WHERE id = ? AND colegio_id = ?`,
      [
        parseInt(req.body?.categoria_id, 10) || null,
        nombre,
        Number(req.body?.precio) || 0,
        String(req.body?.emoji || '🥤').slice(0, 16),
        imagen,
        imagen || '',
        String(req.body?.siempre) === 'false' || req.body?.siempre === false ? 0 : 1,
        String(req.body?.es_comida) === 'true' || req.body?.es_comida === true ? 1 : 0,
        parseInt(req.body?.stock, 10) || 0,
        id,
        colegioId,
      ]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message || 'No se pudo guardar el producto' });
  }
});

router.delete('/productos/:id', async (req, res) => {
  if (!(await exigirModulo(res))) return;
  if (!esCaja(req.user)) return res.status(403).json({ error: 'No autorizado' });
  try {
    await execute(
      'UPDATE kiosco_productos SET activo = 0 WHERE id = ? AND colegio_id = ?',
      [parseInt(req.params.id, 10), req.user.colegio_id || DEFAULT_COLEGIO_ID]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message || 'No se pudo quitar el producto' });
  }
});

router.get('/carta-dias', async (req, res) => {
  if (!(await exigirModulo(res))) return;
  if (!esCaja(req.user)) return res.status(403).json({ error: 'No autorizado' });
  const colegioId = req.user.colegio_id || DEFAULT_COLEGIO_ID;
  try {
    const filas = await query(
      `SELECT c.id, c.fecha, c.producto_id, p.nombre, p.emoji, p.imagen_url, p.precio
       FROM kiosco_carta c
       INNER JOIN kiosco_productos p ON p.id = c.producto_id
       WHERE p.colegio_id = ? AND p.activo = 1 AND c.fecha >= DATE_SUB(CURDATE(), INTERVAL 1 DAY)
       ORDER BY c.fecha, p.nombre`,
      [colegioId]
    );
    res.json({ filas: filas || [] });
  } catch (e) {
    res.status(500).json({ error: e.message || 'No se pudo leer la carta' });
  }
});

router.delete('/carta/:id', async (req, res) => {
  if (!(await exigirModulo(res))) return;
  if (!esCaja(req.user)) return res.status(403).json({ error: 'No autorizado' });
  try {
    await execute(
      `DELETE c FROM kiosco_carta c
       INNER JOIN kiosco_productos p ON p.id = c.producto_id
       WHERE c.id = ? AND p.colegio_id = ?`,
      [parseInt(req.params.id, 10), req.user.colegio_id || DEFAULT_COLEGIO_ID]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message || 'No se pudo quitar de la carta' });
  }
});

router.post('/carta', async (req, res) => {
  if (!(await exigirModulo(res))) return;
  if (!esCaja(req.user)) return res.status(403).json({ error: 'No autorizado' });
  const productoId = parseInt(req.body?.producto_id, 10);
  const fecha = String(req.body?.fecha || '');
  if (!productoId || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return res.status(400).json({ error: 'Elige producto y día.' });
  }
  try {
    await execute(
      'INSERT IGNORE INTO kiosco_carta (producto_id, fecha) VALUES (?, ?)',
      [productoId, fecha]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message || 'No se pudo publicar el día' });
  }
});

router.post('/stock', async (req, res) => {
  if (!(await exigirModulo(res))) return;
  if (!esCaja(req.user)) return res.status(403).json({ error: 'No autorizado' });
  const productoId = parseInt(req.body?.producto_id, 10);
  const cantidad = parseInt(req.body?.cantidad, 10);
  if (!productoId || !cantidad) return res.status(400).json({ error: 'Indica producto y cantidad.' });
  try {
    await execute(
      'UPDATE kiosco_productos SET stock = GREATEST(stock + ?, 0) WHERE id = ? AND colegio_id = ?',
      [cantidad, productoId, req.user.colegio_id || DEFAULT_COLEGIO_ID]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message || 'No se pudo mover el stock' });
  }
});

router.get('/resumen', async (req, res) => {
  if (!(await exigirModulo(res))) return;
  if (!esCaja(req.user)) return res.status(403).json({ error: 'No autorizado' });
  const colegioId = req.user.colegio_id || DEFAULT_COLEGIO_ID;
  const hoy = hoyLima();
  try {
    const [dia] = await query(
      `SELECT COALESCE(SUM(total),0) AS ventas, COUNT(*) AS n
       FROM kiosco_pedidos
       WHERE colegio_id = ? AND estado IN ('aceptado','entregado') AND DATE(creado_en) = ?`,
      [colegioId, hoy]
    );
    const [mes] = await query(
      `SELECT COALESCE(SUM(total),0) AS ventas
       FROM kiosco_pedidos
       WHERE colegio_id = ? AND estado IN ('aceptado','entregado') AND DATE_FORMAT(creado_en, '%Y-%m') = DATE_FORMAT(?, '%Y-%m')`,
      [colegioId, hoy]
    );
    const [fiado] = await query(
      `SELECT COALESCE(SUM(total),0) AS deuda
       FROM kiosco_pedidos
       WHERE colegio_id = ? AND pago IN ('pendiente','fiado') AND estado IN ('aceptado','entregado')`,
      [colegioId]
    );
    res.json({
      ventas_dia: Number(dia?.ventas) || 0,
      pedidos_dia: Number(dia?.n) || 0,
      ventas_mes: Number(mes?.ventas) || 0,
      fiado: Number(fiado?.deuda) || 0,
    });
  } catch (e) {
    res.status(500).json({ error: e.message || 'No se pudo armar el resumen' });
  }
});

module.exports = router;
