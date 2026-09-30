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
const {
  asegurarLimites,
  fechaSql,
  revisarCupoFiado,
  resumenCupo,
  guardarLimiteHijo,
  horaSql,
} = require('../utils/kioscoCupo');
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

function fotoProducto(row) {
  const propia = String(row?.imagen_url || '').trim();
  if (propia) return propia;
  return String(row?.categoria_imagen || '').trim();
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

function idDe(user) {
  const n = parseInt(user?.usuario_id ?? user?.id, 10);
  return n > 0 ? n : null;
}

async function leerConfig(colegioId) {
  try {
    await asegurarLimites();
  } catch (e) {
    console.error('[kiosco] no se pudieron preparar las columnas del cupo:', e.message);
  }
  let row;
  try {
    const rows = await query(
      `SELECT *, DATE_FORMAT(limite_general_desde, '%Y-%m-%d %H:%i:%s') AS limite_general_desde_txt
       FROM kiosco_config WHERE colegio_id = ? LIMIT 1`,
      [colegioId]
    );
    row = rows?.[0];
  } catch (e) {
    console.error('[kiosco] lectura de config sin columnas nuevas:', e.message);
    const rows = await query('SELECT * FROM kiosco_config WHERE colegio_id = ? LIMIT 1', [colegioId]);
    row = rows?.[0];
  }
  if (row) {
    return {
      quien_pide: row.quien_pide || 'AMBOS',
      pide_personal: row.pide_personal == null ? true : Number(row.pide_personal) === 1,
      limite_activo: Number(row.limite_activo) === 1,
      limite_monto: Number(row.limite_monto) || 0,
      limite_dia_activo: Number(row.limite_dia_activo) === 1,
      limite_dia_monto: Number(row.limite_dia_monto) || 0,
      limite_general_activo: Number(row.limite_general_activo) === 1,
      limite_general_monto: Number(row.limite_general_monto) || 0,
      limite_general_desde: row.limite_general_desde_txt || horaSql(row.limite_general_desde) || '',
      corte_activo: Number(row.corte_activo) === 1,
      corte_hora: row.corte_hora ? String(row.corte_hora).slice(0, 5) : '',
      comida_activa: Number(row.comida_activa) === 1,
      fiado_activo: Number(row.fiado_activo) === 1,
      carta_imagen_url: String(row.carta_imagen_url || '').trim(),
    };
  }
  return {
    quien_pide: 'AMBOS',
    pide_personal: true,
    limite_activo: false,
    limite_monto: 0,
    limite_dia_activo: false,
    limite_dia_monto: 0,
    limite_general_activo: false,
    limite_general_monto: 0,
    limite_general_desde: '',
    corte_activo: false,
    corte_hora: '',
    comida_activa: true,
    fiado_activo: true,
    carta_imagen_url: '',
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
    const previa = await leerConfig(colegioId);
    const generalActivo = !!b.limite_general_activo;
    let generalDesde = previa.limite_general_desde || null;
    if (generalActivo && !previa.limite_general_activo) generalDesde = fechaHoraMySQLLima();
    if (!generalActivo) generalDesde = null;
    await execute(
      `INSERT INTO kiosco_config
        (colegio_id, quien_pide, pide_personal, limite_activo, limite_monto,
         limite_dia_activo, limite_dia_monto, limite_general_activo, limite_general_monto, limite_general_desde,
         corte_activo, corte_hora, comida_activa, fiado_activo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
        quien_pide = VALUES(quien_pide), pide_personal = VALUES(pide_personal),
        limite_activo = VALUES(limite_activo), limite_monto = VALUES(limite_monto),
        limite_dia_activo = VALUES(limite_dia_activo), limite_dia_monto = VALUES(limite_dia_monto),
        limite_general_activo = VALUES(limite_general_activo), limite_general_monto = VALUES(limite_general_monto),
        limite_general_desde = VALUES(limite_general_desde),
        corte_activo = VALUES(corte_activo), corte_hora = VALUES(corte_hora),
        comida_activa = VALUES(comida_activa), fiado_activo = VALUES(fiado_activo)`,
      [
        colegioId,
        quien,
        b.pide_personal === false ? 0 : 1,
        b.limite_activo ? 1 : 0,
        Number(b.limite_monto) || 0,
        b.limite_dia_activo ? 1 : 0,
        Number(b.limite_dia_monto) || 0,
        generalActivo ? 1 : 0,
        Number(b.limite_general_monto) || 0,
        generalDesde,
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

async function esPapaDelAlumno(user, alumnoId) {
  const alumno = parseInt(alumnoId, 10);
  if (!alumno) return false;
  const colegioId = user?.colegio_id || DEFAULT_COLEGIO_ID;
  const ids = [];
  const apoderadoId = parseInt(user?.apoderado_id, 10);
  if (user?.tipo === 'APODERADO' && apoderadoId > 0) ids.push(apoderadoId);

  let personalId = parseInt(user?.personal_id, 10);
  if (!(personalId > 0) && user?.usuario_id) {
    const [u] = await query(
      'SELECT personal_id FROM usuarios WHERE id = ? AND colegio_id = ? LIMIT 1',
      [user.usuario_id, colegioId]
    );
    personalId = parseInt(u?.personal_id, 10);
  }
  if (personalId > 0) {
    const rows = await query(
      `SELECT ap.id
       FROM personal p
       INNER JOIN apoderados ap
         ON ap.colegio_id = p.colegio_id
        AND ap.nro_documento IS NOT NULL
        AND TRIM(ap.nro_documento) <> ''
        AND TRIM(ap.nro_documento) = TRIM(p.nro_documento)
       WHERE p.id = ? AND p.colegio_id = ?`,
      [personalId, colegioId]
    );
    for (const r of rows || []) {
      const id = parseInt(r.id, 10);
      if (id > 0) ids.push(id);
    }
  }
  const unicos = [...new Set(ids)];
  if (!unicos.length) return false;
  const [row] = await query(
    `SELECT 1 AS ok FROM familias WHERE alumno_id = ? AND apoderado_id IN (${unicos.map(() => '?').join(',')}) LIMIT 1`,
    [alumno, ...unicos]
  );
  return !!row;
}

async function puedeVerCupo(user, alumnoId) {
  if (esCaja(user)) return true;
  if (user?.tipo === 'ALUMNO' && Number(user.alumno_id) === Number(alumnoId)) return true;
  return esPapaDelAlumno(user, alumnoId);
}

router.get('/cupo', async (req, res) => {
  if (!(await exigirModulo(res))) return;
  const colegioId = req.user.colegio_id || DEFAULT_COLEGIO_ID;
  const alumnoId = parseInt(req.query.alumno_id, 10) || null;
  const clienteUsuarioId = parseInt(req.query.cliente_usuario_id, 10) || null;
  const fecha = fechaValida(req.query.fecha) || hoyLima();
  if (!alumnoId && !clienteUsuarioId) return res.status(400).json({ error: 'Falta la persona.' });
  try {
    if (alumnoId && !(await puedeVerCupo(req.user, alumnoId))) {
      return res.status(403).json({ error: 'No puedes ver el cupo de este alumno.' });
    }
    if (!alumnoId && !esCaja(req.user) && clienteUsuarioId !== idDe(req.user)) {
      return res.status(403).json({ error: 'No puedes ver este cupo.' });
    }
    const config = await leerConfig(colegioId);
    const cupo = await resumenCupo(colegioId, config, { alumnoId, clienteUsuarioId, fecha });
    const editable = !!(alumnoId && await esPapaDelAlumno(req.user, alumnoId));
    res.json({ ...cupo, editable: !!editable });
  } catch (e) {
    res.status(500).json({ error: e.message || 'No se pudo leer el cupo' });
  }
});

router.put('/cupo', async (req, res) => {
  if (!(await exigirModulo(res))) return;
  const colegioId = req.user.colegio_id || DEFAULT_COLEGIO_ID;
  const alumnoId = parseInt(req.body?.alumno_id, 10);
  const fecha = fechaValida(req.body?.fecha) || hoyLima();
  if (!alumnoId) return res.status(400).json({ error: 'Elige al hijo.' });
  try {
    if (!(await esPapaDelAlumno(req.user, alumnoId))) {
      return res.status(403).json({ error: 'Ese alumno no está en tu familia.' });
    }
    await guardarLimiteHijo(colegioId, alumnoId, req.body || {});
    const config = await leerConfig(colegioId);
    const cupo = await resumenCupo(colegioId, config, { alumnoId, fecha });
    res.json({ ...cupo, editable: true });
  } catch (e) {
    res.status(500).json({ error: e.message || 'No se pudo guardar el límite' });
  }
});

router.post('/carta-portada', uploadKiosco.single('imagen'), async (req, res) => {
  if (!(await exigirModulo(res))) return;
  if (!esCaja(req.user)) return res.status(403).json({ error: 'Solo el perfil Kiosco cambia la foto de la carta.' });
  const url = urlImagenKiosco(req.file);
  if (!url) return res.status(400).json({ error: 'Elige una foto.' });
  const colegioId = req.user.colegio_id || DEFAULT_COLEGIO_ID;
  try {
    await execute(
      `INSERT INTO kiosco_config (colegio_id, carta_imagen_url) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE carta_imagen_url = VALUES(carta_imagen_url)`,
      [colegioId, url]
    );
    res.json({ config: await leerConfig(colegioId) });
  } catch (e) {
    res.status(500).json({ error: e.message || 'No se pudo guardar la foto' });
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
              cat.imagen_url AS categoria_imagen,
              p.siempre, p.es_comida, p.stock
       FROM kiosco_productos p
       LEFT JOIN kiosco_categorias cat ON cat.id = p.categoria_id
       WHERE p.colegio_id = ? AND p.activo = 1
         AND (p.siempre = 1 OR EXISTS (
           SELECT 1 FROM kiosco_carta c WHERE c.producto_id = p.id AND c.fecha = ?
         ))
       ORDER BY p.nombre`,
      [colegioId, fecha]
    );
    const visibles = (productos || [])
      .filter((p) => config.comida_activa || Number(p.es_comida) !== 1)
      .map((p) => ({ ...p, imagen_url: fotoProducto(p) }));
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
        [idDe(req.user)]
      );
      const nombre = p
        ? `${p.nombres || ''} ${p.apellidos || ''}`.replace(/\s+/g, ' ').trim()
        : (req.user.nombres || req.user.usuario || 'Personal');
      return res.json({
        hijos: [],
        yo: {
          usuario_id: idDe(req.user),
          nombre,
          deuda: await deudaDeCliente(colegioId, null, idDe(req.user)),
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
    const mio = idDe(req.user);
    let clienteUsuarioId = parseInt(req.body?.cliente_usuario_id, 10) || (req.body?.para_mi ? mio : null);
    if (!mostrador && !alumnoId && !clienteUsuarioId && esPersonal(req.user) && tipo !== 'KIOSCO') {
      clienteUsuarioId = mio;
    }
    const fecha = String(req.body?.fecha || '');
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const pago = ['pagado', 'pendiente', 'fiado'].includes(req.body?.pago) ? req.body.pago : 'pendiente';
    if ((!alumnoId && !clienteUsuarioId) || !/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !items.length) {
      return res.status(400).json({ error: 'Elige a la persona, el día y al menos un producto.' });
    }
    if (clienteUsuarioId && !mostrador && clienteUsuarioId !== mio) {
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
        const quedan = Number(p.stock) || 0;
        return res.status(400).json({
          error: quedan > 0
            ? `De ${p.nombre} solo quedan ${quedan}.`
            : `${p.nombre} está agotado.`,
        });
      }
      total += Number(p.precio) * cant;
      lineas.push({ id: p.id, nombre: p.nombre, precio: Number(p.precio), cantidad: cant });
    }
    if (!lineas.length) return res.status(400).json({ error: 'No hay productos válidos en el pedido.' });
    if (mostrador && pago === 'fiado') {
      const motivo = await revisarCupoFiado({
        colegioId,
        config,
        alumnoId,
        clienteUsuarioId,
        fecha,
        monto: total,
      });
      if (motivo) return res.status(400).json({ error: motivo });
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
        mio,
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
    const descontados = [];
    for (const ln of lineas) {
      await execute(
        'INSERT INTO kiosco_pedido_items (pedido_id, producto_id, nombre, precio, cantidad) VALUES (?, ?, ?, ?, ?)',
        [pedidoId, ln.id, ln.nombre, ln.precio, ln.cantidad]
      );
      const baja = await execute(
        'UPDATE kiosco_productos SET stock = stock - ? WHERE id = ? AND stock >= ?',
        [ln.cantidad, ln.id, ln.cantidad]
      );
      if (!baja.affectedRows) {
        for (const prev of descontados) {
          await execute('UPDATE kiosco_productos SET stock = stock + ? WHERE id = ?', [prev.cantidad, prev.id]);
        }
        await execute('DELETE FROM kiosco_pedido_items WHERE pedido_id = ?', [pedidoId]);
        await execute('DELETE FROM kiosco_pedidos WHERE id = ?', [pedidoId]);
        return res.status(400).json({ error: `De ${ln.nombre} ya no queda esa cantidad.` });
      }
      descontados.push(ln);
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

router.get('/mis-pedidos', async (req, res) => {
  if (!(await exigirModulo(res))) return;
  const colegioId = req.user.colegio_id || DEFAULT_COLEGIO_ID;
  const tipo = req.user.tipo;
  try {
    let where = 'p.usuario_id = ?';
    const params = [colegioId, idDe(req.user)];
    if (tipo === 'ALUMNO' && req.user.alumno_id) {
      where = 'p.alumno_id = ?';
      params[1] = req.user.alumno_id;
    } else if (tipo === 'APODERADO' && req.user.apoderado_id) {
      where = 'p.alumno_id IN (SELECT alumno_id FROM familias WHERE apoderado_id = ?)';
      params[1] = req.user.apoderado_id;
    } else if (tipo !== 'KIOSCO') {
      where = '(p.cliente_usuario_id = ? OR p.usuario_id = ?)';
      params.push(idDe(req.user));
    }
    const pedidos = await query(
      `SELECT p.id, p.codigo, p.fecha_consumo, p.estado, p.pago, p.origen, p.total, p.creado_en,
              a.nombres, a.apellido_paterno
       FROM kiosco_pedidos p
       LEFT JOIN alumnos a ON a.id = p.alumno_id
       WHERE p.colegio_id = ? AND ${where}
       ORDER BY p.id DESC
       LIMIT 60`,
      params
    );
    const salida = [];
    for (const p of pedidos || []) {
      const items = await query(
        'SELECT nombre, precio, cantidad FROM kiosco_pedido_items WHERE pedido_id = ?',
        [p.id]
      );
      salida.push({
        ...p,
        alumno: `${p.nombres || ''} ${p.apellido_paterno || ''}`.replace(/\s+/g, ' ').trim(),
        items: items || [],
      });
    }
    const deuda = salida
      .filter((p) => (p.pago === 'fiado' || p.pago === 'pendiente') && (p.estado === 'aceptado' || p.estado === 'entregado'))
      .reduce((s, p) => s + Number(p.total), 0);
    res.json({ pedidos: salida, deuda });
  } catch (e) {
    res.status(500).json({ error: e.message || 'No se pudieron leer tus pedidos' });
  }
});

router.get('/pedidos', async (req, res) => {
  if (!(await exigirModulo(res))) return;
  if (!esCaja(req.user)) return res.status(403).json({ error: 'Solo el perfil Kiosco ve la cola.' });
  const colegioId = req.user.colegio_id || DEFAULT_COLEGIO_ID;
  const estado = String(req.query.estado || 'pedido');
  const enEspera = estado === 'pedido';
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
       ORDER BY ${enEspera ? 'p.creado_en ASC, p.id ASC' : 'p.id DESC'}
       LIMIT ${enEspera ? 200 : 80}`,
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
    const pagoSqlPrevio = ['pagado', 'pendiente', 'fiado'].includes(pago) ? pago : ped.pago;
    const pasaAFiado = pagoSqlPrevio === 'fiado' && estado !== 'rechazado' && ped.pago !== 'fiado';
    if (pasaAFiado) {
      const config = await leerConfig(colegioId);
      const motivo = await revisarCupoFiado({
        colegioId,
        config,
        alumnoId: ped.alumno_id || null,
        clienteUsuarioId: ped.cliente_usuario_id || null,
        fecha: fechaSql(ped.fecha_consumo),
        monto: ped.total,
      });
      if (motivo) return res.status(400).json({ error: motivo });
    }
    if (estado === 'rechazado' && ped.estado === 'pedido') {
      const items = await query('SELECT producto_id, cantidad FROM kiosco_pedido_items WHERE pedido_id = ?', [id]);
      for (const it of items || []) {
        if (it.producto_id) {
          await execute('UPDATE kiosco_productos SET stock = stock + ? WHERE id = ?', [it.cantidad, it.producto_id]);
        }
      }
    }
    const pagoSql = ['pagado', 'pendiente', 'fiado'].includes(pago) ? pago : ped.pago;
    const saliaDeEspera = ped.estado === 'pedido' && (estado === 'aceptado' || estado === 'rechazado');
    await execute('UPDATE kiosco_pedidos SET estado = ?, pago = ? WHERE id = ?', [estado, pagoSql, id]);
    if (saliaDeEspera) {
      const destinos = new Set();
      const sumar = (valor) => {
        const n = Number(valor);
        if (n > 0) destinos.add(n);
      };
      sumar(ped.usuario_id);
      sumar(ped.cliente_usuario_id);
      let nombreAlumno = '';
      if (ped.alumno_id) {
        const padres = await query(
          `SELECT u.id FROM usuarios u
           INNER JOIN familias f ON f.apoderado_id = u.apoderado_id
           WHERE f.alumno_id = ? AND u.tipo = 'APODERADO' AND u.colegio_id = ?`,
          [ped.alumno_id, colegioId]
        );
        for (const padre of padres || []) sumar(padre.id);
        const alumnosUser = await query(
          `SELECT id FROM usuarios WHERE alumno_id = ? AND tipo = 'ALUMNO' AND colegio_id = ?`,
          [ped.alumno_id, colegioId]
        );
        for (const alumno of alumnosUser || []) sumar(alumno.id);
        const [al] = await query(
          'SELECT nombres, apellido_paterno FROM alumnos WHERE id = ? AND colegio_id = ? LIMIT 1',
          [ped.alumno_id, colegioId]
        );
        nombreAlumno = al
          ? `${al.nombres || ''} ${al.apellido_paterno || ''}`.replace(/\s+/g, ' ').trim()
          : '';
      }
      const deQuien = nombreAlumno ? ` de ${nombreAlumno}` : '';
      const totalTxt = `S/ ${Number(ped.total).toFixed(2)}`;
      const texto = estado === 'rechazado'
        ? `El pedido ${ped.codigo}${deQuien} no fue atendido.`
        : pagoSql === 'fiado'
          ? `El pedido ${ped.codigo}${deQuien} ya fue atendido y quedó fiado. Total ${totalTxt}.`
          : `El pedido ${ped.codigo}${deQuien} ya fue atendido y está pagado. Total ${totalTxt}.`;
      const asunto = estado === 'rechazado' ? 'Pedido del kiosco rechazado' : 'Pedido del kiosco atendido';
      for (const uid of destinos) {
        await insertNotificacionUsuario(execute, {
          usuario_id: uid,
          destinatario_id: uid,
          asunto,
          contenido: texto,
          url_destino: '/kiosco',
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
      `SELECT p.*, cat.imagen_url AS categoria_imagen
       FROM kiosco_productos p
       LEFT JOIN kiosco_categorias cat ON cat.id = p.categoria_id
       WHERE p.colegio_id = ? AND p.activo = 1
       ORDER BY p.nombre`,
      [colegioId]
    );
    res.json({
      categorias: categorias || [],
      productos: (productos || []).map((p) => ({ ...p, imagen_url: fotoProducto(p) })),
    });
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
      `UPDATE kiosco_productos
       SET categoria_id = ?, nombre = ?, descripcion = ?, precio = ?, emoji = ?,
           imagen_url = IF(? IS NULL, imagen_url, ?),
           siempre = ?, es_comida = ?, stock = ?
       WHERE id = ? AND colegio_id = ?`,
      [
        parseInt(req.body?.categoria_id, 10) || null,
        nombre,
        String(req.body?.descripcion || '').slice(0, 255),
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
      `SELECT c.id, c.fecha, c.producto_id, p.nombre, p.emoji, p.imagen_url, p.precio,
              cat.imagen_url AS categoria_imagen
       FROM kiosco_carta c
       INNER JOIN kiosco_productos p ON p.id = c.producto_id
       LEFT JOIN kiosco_categorias cat ON cat.id = p.categoria_id
       WHERE p.colegio_id = ? AND p.activo = 1 AND c.fecha >= CURDATE()
       ORDER BY c.fecha, p.nombre`,
      [colegioId]
    );
    const especiales = await query(
      `SELECT p.id, p.nombre, p.emoji, p.precio, p.imagen_url, cat.imagen_url AS categoria_imagen,
              MAX(c.fecha) AS ultima
       FROM kiosco_productos p
       LEFT JOIN kiosco_categorias cat ON cat.id = p.categoria_id
       LEFT JOIN kiosco_carta c ON c.producto_id = p.id
       WHERE p.colegio_id = ? AND p.activo = 1 AND p.siempre = 0
       GROUP BY p.id, p.nombre, p.emoji, p.precio, p.imagen_url, cat.imagen_url
       ORDER BY p.nombre`,
      [colegioId]
    );
    res.json({
      filas: (filas || []).map((f) => ({ ...f, imagen_url: fotoProducto(f) })),
      especiales: (especiales || []).map((p) => ({ ...p, imagen_url: fotoProducto(p) })),
    });
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

function fechaValida(valor) {
  const s = String(valor || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return '';
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return '';
  return s;
}

function dinero(valor) {
  return Math.round((Number(valor) || 0) * 100) / 100;
}

function prepararRango(query) {
  const hoy = hoyLima();
  let desde = fechaValida(query.desde) || hoy;
  let hasta = fechaValida(query.hasta) || hoy;
  if (desde > hasta) {
    const tmp = desde;
    desde = hasta;
    hasta = tmp;
  }
  const [y0, m0, d0] = desde.split('-').map(Number);
  const tope = new Date(Date.UTC(y0, m0 - 1, d0 + 400));
  if (hasta > tope.toISOString().slice(0, 10)) return { error: 'El rango no puede pasar de 400 días.' };
  return { desde, hasta };
}

async function armarReporte(colegioId, desde, hasta) {
    const grupos = await query(
      `SELECT estado, pago, COUNT(*) AS n, COALESCE(SUM(total), 0) AS total
       FROM kiosco_pedidos
       WHERE colegio_id = ? AND DATE(creado_en) BETWEEN ? AND ?
       GROUP BY estado, pago`,
      [colegioId, desde, hasta]
    );
    const cierre = {
      vendido: { n: 0, total: 0 },
      pagado: { n: 0, total: 0 },
      fiado: { n: 0, total: 0 },
      pendiente: { n: 0, total: 0 },
      rechazado: { n: 0, total: 0 },
      espera: { n: 0, total: 0 },
    };
    for (const row of grupos || []) {
      const n = Number(row.n) || 0;
      const total = Number(row.total) || 0;
      const atendido = row.estado === 'aceptado' || row.estado === 'entregado';
      if (atendido) {
        cierre.vendido.n += n;
        cierre.vendido.total += total;
        if (row.pago === 'pagado') {
          cierre.pagado.n += n;
          cierre.pagado.total += total;
        } else if (row.pago === 'fiado') {
          cierre.fiado.n += n;
          cierre.fiado.total += total;
        } else {
          cierre.pendiente.n += n;
          cierre.pendiente.total += total;
        }
      } else if (row.estado === 'rechazado') {
        cierre.rechazado.n += n;
        cierre.rechazado.total += total;
      } else if (row.estado === 'pedido') {
        cierre.espera.n += n;
        cierre.espera.total += total;
      }
    }
    for (const clave of Object.keys(cierre)) cierre[clave].total = dinero(cierre[clave].total);

    const pedidos = await query(
      `SELECT p.id, p.codigo, DATE_FORMAT(p.creado_en, '%Y-%m-%d') AS fecha,
              DATE_FORMAT(p.creado_en, '%H:%i') AS hora, p.estado, p.pago, p.origen, p.total, p.nota,
              p.alumno_id, a.nombres, a.apellido_paterno,
              per.nombres AS per_nombres, per.apellidos AS per_apellidos
       FROM kiosco_pedidos p
       LEFT JOIN alumnos a ON a.id = p.alumno_id
       LEFT JOIN usuarios cu ON cu.id = p.cliente_usuario_id
       LEFT JOIN personal per ON per.id = cu.personal_id
       WHERE p.colegio_id = ? AND DATE(p.creado_en) BETWEEN ? AND ?
       ORDER BY p.creado_en DESC, p.id DESC
       LIMIT 2000`,
      [colegioId, desde, hasta]
    );
    const ids = (pedidos || []).map((p) => p.id);
    const items = ids.length
      ? await query(
        `SELECT pedido_id, nombre, cantidad, precio FROM kiosco_pedido_items WHERE pedido_id IN (${ids.map(() => '?').join(',')})`,
        ids
      )
      : [];
    const porPedido = new Map();
    for (const it of items || []) {
      if (!porPedido.has(it.pedido_id)) porPedido.set(it.pedido_id, []);
      porPedido.get(it.pedido_id).push({
        nombre: it.nombre,
        cantidad: Number(it.cantidad) || 0,
        precio: dinero(it.precio),
      });
    }
    const alumnoIds = [...new Set((pedidos || []).map((p) => p.alumno_id).filter(Boolean))];
    const grados = new Map();
    if (alumnoIds.length) {
      const filas = await query(
        `SELECT m.alumno_id, n.nombre AS nivel, g.grado, g.seccion
         FROM matriculas m
         INNER JOIN grupos g ON g.id = m.grupo_id
         INNER JOIN niveles n ON n.id = g.nivel_id
         WHERE m.colegio_id = ? AND m.estado NOT IN (2, 3)
           AND m.alumno_id IN (${alumnoIds.map(() => '?').join(',')})
         ORDER BY g.anio DESC, m.id DESC`,
        [colegioId, ...alumnoIds]
      );
      for (const fila of filas || []) {
        if (grados.has(fila.alumno_id)) continue;
        grados.set(
          fila.alumno_id,
          `${fila.nivel || ''} ${fila.grado || ''}° ${fila.seccion || ''}`.replace(/\s+/g, ' ').trim()
        );
      }
    }
    const productos = await query(
      `SELECT i.nombre,
              SUM(CASE WHEN p.estado IN ('aceptado','entregado') THEN i.cantidad ELSE 0 END) AS vendidos,
              SUM(CASE WHEN p.estado IN ('aceptado','entregado') THEN i.precio * i.cantidad ELSE 0 END) AS monto,
              SUM(CASE WHEN p.estado = 'rechazado' THEN i.cantidad ELSE 0 END) AS no_vendidos
       FROM kiosco_pedido_items i
       INNER JOIN kiosco_pedidos p ON p.id = i.pedido_id
       WHERE p.colegio_id = ? AND DATE(p.creado_en) BETWEEN ? AND ?
       GROUP BY i.nombre
       HAVING SUM(CASE WHEN p.estado IN ('aceptado','entregado') THEN i.cantidad ELSE 0 END) > 0
           OR SUM(CASE WHEN p.estado = 'rechazado' THEN i.cantidad ELSE 0 END) > 0
       ORDER BY vendidos DESC, i.nombre`,
      [colegioId, desde, hasta]
    );
    return {
      desde,
      hasta,
      cortado: (pedidos || []).length >= 2000,
      cierre,
      pedidos: (pedidos || []).map((p) => ({
        id: p.id,
        codigo: p.codigo,
        fecha: p.fecha,
        hora: p.hora,
        estado: p.estado,
        pago: p.pago,
        origen: p.origen === 'mostrador' ? 'Mostrador' : 'En línea',
        total: dinero(p.total),
        nota: p.nota || '',
        cliente: p.alumno_id
          ? `${p.nombres || ''} ${p.apellido_paterno || ''}`.replace(/\s+/g, ' ').trim()
          : `${p.per_nombres || ''} ${p.per_apellidos || ''}`.replace(/\s+/g, ' ').trim() || 'Personal',
        grado: p.alumno_id ? (grados.get(p.alumno_id) || '') : 'Personal',
        detalle: (porPedido.get(p.id) || []).map((it) => `${it.cantidad} × ${it.nombre}`).join(', '),
      })),
      productos: (productos || []).map((p) => ({
        nombre: p.nombre,
        vendidos: Number(p.vendidos) || 0,
        monto: dinero(p.monto),
        no_vendidos: Number(p.no_vendidos) || 0,
      })),
    };
}

router.get('/reporte', async (req, res) => {
  if (!(await exigirModulo(res))) return;
  if (!esCaja(req.user)) return res.status(403).json({ error: 'Solo el perfil Kiosco ve los reportes.' });
  const rango = prepararRango(req.query);
  if (rango.error) return res.status(400).json({ error: rango.error });
  try {
    res.json(await armarReporte(req.user.colegio_id || DEFAULT_COLEGIO_ID, rango.desde, rango.hasta));
  } catch (e) {
    res.status(500).json({ error: e.message || 'No se pudo armar el reporte' });
  }
});

router.get('/reporte/pdf', async (req, res) => {
  if (!(await exigirModulo(res))) return;
  if (!esCaja(req.user)) return res.status(403).json({ error: 'Solo el perfil Kiosco ve los reportes.' });
  const rango = prepararRango(req.query);
  if (rango.error) return res.status(400).json({ error: rango.error });
  try {
    const data = await armarReporte(req.user.colegio_id || DEFAULT_COLEGIO_ID, rango.desde, rango.hasta);
    const { escribirReporteKioscoPdf } = require('../utils/kioscoReportePdf');
    escribirReporteKioscoPdf(res, data, String(req.query.filtro || 'todos'));
  } catch (e) {
    if (!res.headersSent) res.status(500).json({ error: e.message || 'No se pudo armar el PDF' });
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
