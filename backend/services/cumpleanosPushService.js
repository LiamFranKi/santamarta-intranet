/**
 * Servicio de notificaciones push + campanita (tabla notificaciones) para cumpleaños del día.
 * Docente: personal + alumnos/apoderados de sus grupos
 * Alumno: personal + alumnos/apoderados de su grupo
 * Apoderado: personal + alumnos/apoderados de grupos de sus hijos
 * Administrador: todo el colegio
 */
const { query, execute } = require('../utils/mysql');
const { getAnioActivo } = require('../utils/mysql');
const { envolverMarcoCumpleanosWeb } = require('../utils/cumpleanosMarcoHtml');
const { enviarPushNotificationMultiple } = require('./pushNotificationService');
const { insertNotificacionUsuario } = require('../utils/notificacionInsert');
const { fechaHoraMySQLLima } = require('../utils/fechaHoraLima');

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

/** Misma default que AdminConfigCumpleanos.jsx */
const DEFAULT_PLANTILLA_PUSH =
  '¡Feliz cumpleaños, {nombre}! Te desea un gran día {colegio}.';

const TITULO_PUSH_FALLBACK = '🎂 Cumpleaños';

function truncarTexto(s, max) {
  if (!s || s.length <= max) return s || '';
  return s.slice(0, max - 3) + '...';
}

/**
 * Sustituye {nombre} y {colegio} (case-insensitive en la clave).
 * Opcional: {mes} = nombre del mes actual (p. ej. "Marzo").
 */
function aplicarPlantillaPush(plantilla, { nombre, colegio, mesNombre }) {
  let t = String(plantilla || '').trim();
  if (!t) t = DEFAULT_PLANTILLA_PUSH;
  return t
    .replace(/\{nombre\}/gi, nombre)
    .replace(/\{colegio\}/gi, colegio)
    .replace(/\{mes\}/gi, mesNombre || '');
}

/**
 * Si hay salto de línea: primera línea = título, resto = cuerpo.
 * Si es una sola línea: título corto fijo + toda la plantilla en el cuerpo (como en la UI de admin).
 */
function construirTituloYBody(textoSustituido) {
  const t = (textoSustituido || '').trim();
  if (!t) {
    return { titulo: TITULO_PUSH_FALLBACK, cuerpo: 'Hay cumpleaños hoy.' };
  }
  const idx = t.indexOf('\n');
  if (idx === -1) {
    return {
      titulo: truncarTexto(TITULO_PUSH_FALLBACK, 80),
      cuerpo: truncarTexto(t, 450),
    };
  }
  let titulo = t.slice(0, idx).trim() || TITULO_PUSH_FALLBACK;
  let cuerpo = t.slice(idx + 1).trim();
  if (!cuerpo) cuerpo = titulo;
  return {
    titulo: truncarTexto(titulo, 100),
    cuerpo: truncarTexto(cuerpo, 450),
  };
}

const nombreColegioCache = new Map();

async function obtenerNombreColegio(colegioId) {
  if (nombreColegioCache.has(colegioId)) return nombreColegioCache.get(colegioId);
  const rows = await query(`SELECT nombre FROM colegios WHERE id = ? LIMIT 1`, [colegioId]);
  const n = (rows[0] && rows[0].nombre) ? String(rows[0].nombre).trim() : 'tu colegio';
  nombreColegioCache.set(colegioId, n);
  return n;
}

/**
 * Obtener lista de cumpleaños de HOY para un usuario según su rol
 */
async function getCumpleanosHoyParaUsuario(colegio_id, anio_activo, tipo, personal_id, alumno_id, apoderado_id, diaHoy, mesHoy) {
  const resultado = [];

  // Personal - cumple hoy
  const personal = await query(
    `SELECT CONCAT(COALESCE(p.apellidos,''), ', ', COALESCE(p.nombres,'')) as nombre
     FROM personal p
     WHERE p.colegio_id = ? 
       AND p.fecha_nacimiento IS NOT NULL 
       AND p.fecha_nacimiento != '0000-00-00'
       AND MONTH(p.fecha_nacimiento) = ? AND DAY(p.fecha_nacimiento) = ?`,
    [colegio_id, mesHoy, diaHoy]
  );
  personal.forEach(r => resultado.push({ nombre: r.nombre, perfil: 'Personal' }));

  let grupoIds = [];
  if (tipo === 'ADMINISTRADOR') {
    grupoIds = null;
  } else if (tipo === 'DOCENTE' && personal_id) {
    const grupos = await query(
      `SELECT DISTINCT g.id FROM asignaturas a INNER JOIN grupos g ON g.id = a.grupo_id
       WHERE a.personal_id = ? AND a.colegio_id = ? AND g.anio = ?`,
      [personal_id, colegio_id, anio_activo]
    );
    grupoIds = grupos.map(g => g.id);
  } else if (tipo === 'ALUMNO' && alumno_id) {
    const grupos = await query(
      `SELECT m.grupo_id as id FROM matriculas m INNER JOIN grupos g ON g.id = m.grupo_id
       WHERE m.alumno_id = ? AND m.colegio_id = ? AND g.anio = ? AND (m.estado = 0 OR m.estado = 4)`,
      [alumno_id, colegio_id, anio_activo]
    );
    grupoIds = grupos.map(g => g.id);
  } else if (tipo === 'APODERADO' && apoderado_id) {
    const grupos = await query(
      `SELECT DISTINCT g.id FROM familias f INNER JOIN matriculas m ON m.alumno_id = f.alumno_id
       INNER JOIN grupos g ON g.id = m.grupo_id
       WHERE f.apoderado_id = ? AND m.colegio_id = ? AND g.anio = ? AND (m.estado = 0 OR m.estado = 4)`,
      [apoderado_id, colegio_id, anio_activo]
    );
    grupoIds = grupos.map(g => g.id);
  }

  const tieneGrupos = grupoIds === null || (Array.isArray(grupoIds) && grupoIds.length > 0);

  if (tieneGrupos) {
    if (grupoIds === null) {
      const alumnos = await query(
        `SELECT CONCAT(a.apellido_paterno, ' ', a.apellido_materno, ', ', a.nombres) as nombre
         FROM alumnos a INNER JOIN matriculas m ON m.alumno_id = a.id INNER JOIN grupos g ON g.id = m.grupo_id
         WHERE a.colegio_id = ? AND g.anio = ?
           AND a.fecha_nacimiento IS NOT NULL AND a.fecha_nacimiento != '0000-00-00'
           AND MONTH(a.fecha_nacimiento) = ? AND DAY(a.fecha_nacimiento) = ?
           AND (m.estado = 0 OR m.estado = 4)`,
        [colegio_id, anio_activo, mesHoy, diaHoy]
      );
      alumnos.forEach(r => resultado.push({ nombre: r.nombre, perfil: 'Alumno' }));

      const apoderados = await query(
        `SELECT DISTINCT CONCAT(ap.apellido_paterno, ' ', ap.apellido_materno, ', ', ap.nombres) as nombre
         FROM apoderados ap INNER JOIN familias f ON f.apoderado_id = ap.id
         INNER JOIN matriculas m ON m.alumno_id = f.alumno_id INNER JOIN grupos g ON g.id = m.grupo_id
         WHERE ap.colegio_id = ? AND g.anio = ?
           AND ap.fecha_nacimiento IS NOT NULL AND ap.fecha_nacimiento != '0000-00-00'
           AND MONTH(ap.fecha_nacimiento) = ? AND DAY(ap.fecha_nacimiento) = ?
           AND (m.estado = 0 OR m.estado = 4)`,
        [colegio_id, anio_activo, mesHoy, diaHoy]
      );
      apoderados.forEach(r => resultado.push({ nombre: r.nombre, perfil: 'Apoderado' }));
    } else {
      const placeholders = grupoIds.map(() => '?').join(',');
      const alumnos = await query(
        `SELECT CONCAT(a.apellido_paterno, ' ', a.apellido_materno, ', ', a.nombres) as nombre
         FROM alumnos a INNER JOIN matriculas m ON m.alumno_id = a.id
         WHERE a.colegio_id = ? AND m.grupo_id IN (${placeholders})
           AND a.fecha_nacimiento IS NOT NULL AND a.fecha_nacimiento != '0000-00-00'
           AND MONTH(a.fecha_nacimiento) = ? AND DAY(a.fecha_nacimiento) = ?
           AND (m.estado = 0 OR m.estado = 4)`,
        [colegio_id, ...grupoIds, mesHoy, diaHoy]
      );
      alumnos.forEach(r => resultado.push({ nombre: r.nombre, perfil: 'Alumno' }));

      const apoderados = await query(
        `SELECT DISTINCT CONCAT(ap.apellido_paterno, ' ', ap.apellido_materno, ', ', ap.nombres) as nombre
         FROM apoderados ap INNER JOIN familias f ON f.apoderado_id = ap.id INNER JOIN matriculas m ON m.alumno_id = f.alumno_id
         WHERE ap.colegio_id = ? AND m.grupo_id IN (${placeholders})
           AND ap.fecha_nacimiento IS NOT NULL AND ap.fecha_nacimiento != '0000-00-00'
           AND MONTH(ap.fecha_nacimiento) = ? AND DAY(ap.fecha_nacimiento) = ?
           AND (m.estado = 0 OR m.estado = 4)`,
        [colegio_id, ...grupoIds, mesHoy, diaHoy]
      );
      apoderados.forEach(r => resultado.push({ nombre: r.nombre, perfil: 'Apoderado' }));
    }
  }

  return resultado;
}

/**
 * Enviar notificaciones push de cumpleaños del día a todos los usuarios.
 * Se ejecuta una vez al día (ej. 8:00 AM).
 */
let cumpleanosEnEjecucion = false;

async function enviarNotificacionesCumpleanos() {
  if (cumpleanosEnEjecucion) {
    console.log('🎂 [CUMPLEANOS-PUSH] Ya hay una ejecución en curso, omitiendo');
    return;
  }
  cumpleanosEnEjecucion = true;
  try {
    nombreColegioCache.clear();
    const configRows = await query(
      `SELECT clave, valor FROM config WHERE clave IN ('show_birthday_window', 'cumpleanos_plantilla_push')`
    );
    const cfg = Object.fromEntries(configRows.map((r) => [r.clave, r.valor]));
    if ((cfg.show_birthday_window || 'NO').toUpperCase() !== 'SI') {
      console.log('🎂 [CUMPLEANOS-PUSH] show_birthday_window=NO, no se envían notificaciones');
      return;
    }

    const plantillaGuardada = (cfg.cumpleanos_plantilla_push || '').trim();
    const plantillaPush = plantillaGuardada || DEFAULT_PLANTILLA_PUSH;

    const hoy = new Date();
    const diaHoy = hoy.getDate();
    const mesHoy = hoy.getMonth() + 1;
    const mesNombre = MESES[mesHoy - 1];

    const usuarios = await query(
      `SELECT u.id, u.colegio_id, u.tipo, u.personal_id, u.alumno_id, u.apoderado_id
       FROM usuarios u
       WHERE u.estado = 'ACTIVO'
         AND u.tipo IN ('DOCENTE', 'ALUMNO', 'APODERADO', 'ADMINISTRADOR')
         AND (u.personal_id IS NOT NULL OR u.alumno_id IS NOT NULL OR u.apoderado_id IS NOT NULL OR u.tipo = 'ADMINISTRADOR')`
    );

    let totalEnviados = 0;
    let totalCampanita = 0;
    for (const u of usuarios) {
      const colegio_id = u.colegio_id;
      const anio_activo = await getAnioActivo(colegio_id);
      if (!anio_activo) continue;

      const cumpleanos = await getCumpleanosHoyParaUsuario(
        colegio_id,
        anio_activo,
        u.tipo,
        u.personal_id || 0,
        u.alumno_id || 0,
        u.apoderado_id || 0,
        diaHoy,
        mesHoy
      );

      if (cumpleanos.length === 0) continue;

      const nombresLista = cumpleanos.map((c) => c.nombre).join(', ');
      const nombreColegio = await obtenerNombreColegio(colegio_id);
      const textoPush = aplicarPlantillaPush(plantillaPush, {
        nombre: nombresLista,
        colegio: nombreColegio,
        mesNombre,
      });
      const { titulo, cuerpo: body } = construirTituloYBody(textoPush);

      const urlDashboard = u.tipo === 'ADMINISTRADOR' ? '/admin/dashboard'
        : u.tipo === 'ALUMNO' ? '/alumno/dashboard'
        : u.tipo === 'APODERADO' ? '/apoderado/dashboard'
        : '/docente/dashboard';

      // Campanita in-app (todos los perfiles; independiente de si tiene push)
      try {
        await insertNotificacionUsuario(execute, {
          usuario_id: u.id,
          destinatario_id: u.id,
          asunto: titulo,
          contenido: body,
          estado: 'NO ENVIADO',
          accion_tipo: 'cumpleanos',
          accion_payload: { tipo: 'cumpleanos', dia: diaHoy, mes: mesHoy },
          url_destino: urlDashboard
        });
        totalCampanita += 1;
      } catch (bellErr) {
        console.error(`🎂 [CUMPLEANOS-PUSH] Error campanita usuario ${u.id}:`, bellErr.message);
      }

      const subs = await query(
        `SELECT endpoint, p256dh, auth FROM push_subscriptions
         WHERE usuario_id = ? AND colegio_id = ? AND (activo = 1 OR activo IS NULL)`,
        [u.id, colegio_id]
      );
      if (subs.length === 0) {
        console.log(`🎂 [CUMPLEANOS-PUSH] Usuario ${u.id} (${u.tipo}): sin push; campanita registrada`);
        continue;
      }

      const subscriptions = subs.map(sub => ({
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth }
      }));

      const payload = {
        title: titulo,
        body: body,
        icon: '/icons/icon-192x192.png',
        badge: '/icons/icon-192x192.png',
        vibrate: [200, 100, 200],
        tag: `cumpleanos-${diaHoy}-${mesHoy}-${u.id}`,
        data: { url: urlDashboard, tipo: 'cumpleanos' }
      };

      try {
        const resultadosPush = await enviarPushNotificationMultiple(subscriptions, payload);
        const exitosas = resultadosPush.filter(r => r.resultado && r.resultado.success).length;
        totalEnviados += exitosas;
        // Marcar suscripciones expiradas (410) como inactivas para no reintentar
        const expiradas = resultadosPush.filter(r => r.resultado && r.resultado.expired && r.subscription?.endpoint);
        for (const { subscription } of expiradas) {
          await execute('UPDATE push_subscriptions SET activo = 0 WHERE endpoint = ?', [subscription.endpoint]);
        }
        if (expiradas.length > 0) {
          console.log(`🎂 [CUMPLEANOS-PUSH] ${expiradas.length} suscripción(es) marcadas inactivas (410)`);
        }
        console.log(`🎂 [CUMPLEANOS-PUSH] Usuario ${u.id} (${u.tipo}): ${cumpleanos.length} cumpleaños, ${exitosas} push enviados`);
      } catch (err) {
        console.error(`🎂 [CUMPLEANOS-PUSH] Error usuario ${u.id}:`, err.message);
      }
    }

    console.log(`🎂 [CUMPLEANOS-PUSH] Campanita (BD): ${totalCampanita} | Push enviados (dispositivos): ${totalEnviados}`);

    await enviarFelicitacionesCorreoYMensajeCumpleanos();
  } catch (error) {
    console.error('🎂 [CUMPLEANOS-PUSH] Error:', error);
  } finally {
    cumpleanosEnEjecucion = false;
  }
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Sustituye variables en HTML/texto de plantillas (modal, correo, mensaje).
 * Escapa valores para evitar XSS en {nombre}, {colegio}, {mes}.
 */
function aplicarPlantillaCumpleanosHtml(plantilla, { nombre, colegio, mesNombre }) {
  return String(plantilla || '')
    .replace(/\{nombre\}/gi, escapeHtml(nombre))
    .replace(/\{colegio\}/gi, escapeHtml(colegio))
    .replace(/\{mes\}/gi, escapeHtml(mesNombre || ''));
}

/** Asunto y textos planos (sin escapar HTML en valores — solo sustitución). */
function aplicarPlantillaCumpleanosTexto(plantilla, { nombre, colegio, mesNombre }) {
  return String(plantilla || '')
    .replace(/\{nombre\}/gi, String(nombre ?? ''))
    .replace(/\{colegio\}/gi, String(colegio ?? ''))
    .replace(/\{mes\}/gi, String(mesNombre ?? ''));
}

const DEDUP_FELICITACIONES_CLAVE = 'cumpleanos_felicitaciones_ultima_fecha';

/**
 * Una vez al día: correo festivo + mensaje interno con marco web a cada cumpleañero con email/usuario.
 * Requiere show_birthday_window=SI y plantillas configuradas; deduplica por fecha en `config`.
 */
async function enviarFelicitacionesCorreoYMensajeCumpleanos() {
  const hoy = new Date();
  const ymd = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
  const dup = await query(`SELECT valor FROM config WHERE clave = ? LIMIT 1`, [DEDUP_FELICITACIONES_CLAVE]);
  if (dup[0]?.valor === ymd) {
    console.log('🎂 [CUMPLEANOS-FELIC] Ya procesado hoy (deduplicado)');
    return;
  }

  const configRows = await query(
    `SELECT clave, valor FROM config WHERE clave IN (
      'show_birthday_window',
      'cumpleanos_plantilla_correo_asunto',
      'cumpleanos_plantilla_correo_cuerpo',
      'cumpleanos_plantilla_mensaje_sistema'
    )`
  );
  const cfg = Object.fromEntries(configRows.map((r) => [r.clave, r.valor]));
  if ((cfg.show_birthday_window || 'NO').toUpperCase() !== 'SI') {
    return;
  }

  const mesHoy = hoy.getMonth() + 1;
  const diaHoy = hoy.getDate();
  const mesNombre = MESES[mesHoy - 1];

  const plantillaAsunto = (cfg.cumpleanos_plantilla_correo_asunto || '').trim();
  const plantillaCorreo = (cfg.cumpleanos_plantilla_correo_cuerpo || '').trim();
  const plantillaMsg = (cfg.cumpleanos_plantilla_mensaje_sistema || '').trim();

  if (!plantillaCorreo && !plantillaMsg) {
    console.log('🎂 [CUMPLEANOS-FELIC] Sin plantillas de correo ni mensaje, omitiendo');
    return;
  }

  const { enviarCorreoCumpleanosHtml } = require('./emailService');

  let correosOk = 0;
  let mensajesPares = 0;

  const colegios = await query(`SELECT id FROM colegios`);
  for (const { id: colegio_id } of colegios) {
    const nombreColegio = await obtenerNombreColegio(colegio_id);
    const remRows = await query(
      `SELECT id FROM usuarios WHERE colegio_id = ? AND tipo = 'ADMINISTRADOR' AND estado = 'ACTIVO' ORDER BY id ASC LIMIT 1`,
      [colegio_id]
    );
    const remitenteId = remRows[0]?.id || null;

    const alumnos = await query(
      `SELECT u.id as usuario_id, NULLIF(TRIM(a.email), '') as email,
        TRIM(CONCAT(a.apellido_paterno, ' ', a.apellido_materno, ', ', a.nombres)) as nombre
       FROM alumnos a
       INNER JOIN usuarios u ON u.alumno_id = a.id AND u.colegio_id = a.colegio_id AND u.estado = 'ACTIVO'
       WHERE a.colegio_id = ?
         AND a.fecha_nacimiento IS NOT NULL AND a.fecha_nacimiento != '0000-00-00'
         AND MONTH(a.fecha_nacimiento) = ? AND DAY(a.fecha_nacimiento) = ?`,
      [colegio_id, mesHoy, diaHoy]
    );

    const pers = await query(
      `SELECT u.id as usuario_id, NULLIF(TRIM(p.email), '') as email,
        TRIM(CONCAT(COALESCE(p.apellidos, ''), ', ', COALESCE(p.nombres, ''))) as nombre
       FROM personal p
       INNER JOIN usuarios u ON u.personal_id = p.id AND u.colegio_id = p.colegio_id AND u.estado = 'ACTIVO'
       WHERE p.colegio_id = ?
         AND p.fecha_nacimiento IS NOT NULL AND p.fecha_nacimiento != '0000-00-00'
         AND MONTH(p.fecha_nacimiento) = ? AND DAY(p.fecha_nacimiento) = ?`,
      [colegio_id, mesHoy, diaHoy]
    );

    const apods = await query(
      `SELECT u.id as usuario_id, NULLIF(TRIM(ap.email), '') as email,
        TRIM(CONCAT(ap.apellido_paterno, ' ', ap.apellido_materno, ', ', ap.nombres)) as nombre
       FROM apoderados ap
       INNER JOIN usuarios u ON u.apoderado_id = ap.id AND u.colegio_id = ap.colegio_id AND u.estado = 'ACTIVO'
       WHERE ap.colegio_id = ?
         AND ap.fecha_nacimiento IS NOT NULL AND ap.fecha_nacimiento != '0000-00-00'
         AND MONTH(ap.fecha_nacimiento) = ? AND DAY(ap.fecha_nacimiento) = ?`,
      [colegio_id, mesHoy, diaHoy]
    );

    const candidatos = [...alumnos, ...pers, ...apods];

    for (const c of candidatos) {
      const nombre = c.nombre;
      const vars = { nombre, colegio: nombreColegio, mesNombre };

      if (plantillaCorreo && c.email) {
        const innerHtml = aplicarPlantillaCumpleanosHtml(plantillaCorreo, vars);
        const asunto = aplicarPlantillaCumpleanosTexto(
          plantillaAsunto || '🎂 ¡Feliz cumpleaños, {nombre}! — {colegio}',
          vars
        );
        const r = await enviarCorreoCumpleanosHtml(c.email, asunto, innerHtml, nombreColegio);
        if (r.success) correosOk += 1;
      }

      if (plantillaMsg && remitenteId) {
        const innerHtmlMsg = aplicarPlantillaCumpleanosHtml(plantillaMsg, vars);
        const cuerpoMensaje = envolverMarcoCumpleanosWeb(innerHtmlMsg);
        const asuntoMsg = aplicarPlantillaCumpleanosTexto('🎂 Feliz cumpleaños — {colegio}', vars);
        const fechaHora = fechaHoraMySQLLima();
        try {
          await execute(
            `INSERT INTO mensajes (remitente_id, destinatario_id, asunto, mensaje, fecha_hora, estado, tipo, borrado, favorito)
             VALUES (?, ?, ?, ?, ?, 'NO_LEIDO', 'ENVIADO', 'NO', 'NO')`,
            [remitenteId, c.usuario_id, asuntoMsg, cuerpoMensaje, fechaHora]
          );
          await execute(
            `INSERT INTO mensajes (remitente_id, destinatario_id, asunto, mensaje, fecha_hora, estado, tipo, borrado, favorito)
             VALUES (?, ?, ?, ?, ?, 'NO_LEIDO', 'RECIBIDO', 'NO', 'NO')`,
            [remitenteId, c.usuario_id, asuntoMsg, cuerpoMensaje, fechaHora]
          );
          mensajesPares += 1;
        } catch (e) {
          console.error(`🎂 [CUMPLEANOS-FELIC] Mensaje usuario ${c.usuario_id}:`, e.message);
        }
      }
    }
  }

  const ex = await query(`SELECT valor FROM config WHERE clave = ? LIMIT 1`, [DEDUP_FELICITACIONES_CLAVE]);
  if (ex.length) {
    await execute(`UPDATE config SET valor = ? WHERE clave = ?`, [ymd, DEDUP_FELICITACIONES_CLAVE]);
  } else {
    await execute(`INSERT INTO config (clave, valor) VALUES (?, ?)`, [DEDUP_FELICITACIONES_CLAVE, ymd]);
  }

  console.log(`🎂 [CUMPLEANOS-FELIC] Correos enviados: ${correosOk} | Mensajes (pares enviado+recibido): ${mensajesPares}`);
}

function htmlBienvenidaVacioEfectivo(html) {
  const t = String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return !t;
}

/**
 * Si el usuario logueado cumple años HOY (según personal/alumno/apoderado vinculado), devuelve su nombre para saludo.
 * No lista a otras personas.
 */
async function obtenerNombreCumpleaneroSesionHoy(colegio_id, personal_id, alumno_id, apoderado_id, mesHoy, diaHoy) {
  if (alumno_id) {
    const rows = await query(
      `SELECT CONCAT(a.apellido_paterno, ' ', a.apellido_materno, ', ', a.nombres) as nombre
       FROM alumnos a
       WHERE a.id = ? AND a.colegio_id = ?
         AND a.fecha_nacimiento IS NOT NULL AND a.fecha_nacimiento != '0000-00-00'
         AND MONTH(a.fecha_nacimiento) = ? AND DAY(a.fecha_nacimiento) = ?`,
      [alumno_id, colegio_id, mesHoy, diaHoy]
    );
    return rows[0]?.nombre ? String(rows[0].nombre).trim() : null;
  }
  if (apoderado_id) {
    const rows = await query(
      `SELECT CONCAT(ap.apellido_paterno, ' ', ap.apellido_materno, ', ', ap.nombres) as nombre
       FROM apoderados ap
       WHERE ap.id = ? AND ap.colegio_id = ?
         AND ap.fecha_nacimiento IS NOT NULL AND ap.fecha_nacimiento != '0000-00-00'
         AND MONTH(ap.fecha_nacimiento) = ? AND DAY(ap.fecha_nacimiento) = ?`,
      [apoderado_id, colegio_id, mesHoy, diaHoy]
    );
    return rows[0]?.nombre ? String(rows[0].nombre).trim() : null;
  }
  if (personal_id) {
    const rows = await query(
      `SELECT CONCAT(COALESCE(p.apellidos,''), ', ', COALESCE(p.nombres,'')) as nombre
       FROM personal p
       WHERE p.id = ? AND p.colegio_id = ?
         AND p.fecha_nacimiento IS NOT NULL AND p.fecha_nacimiento != '0000-00-00'
         AND MONTH(p.fecha_nacimiento) = ? AND DAY(p.fecha_nacimiento) = ?`,
      [personal_id, colegio_id, mesHoy, diaHoy]
    );
    return rows[0]?.nombre ? String(rows[0].nombre).trim() : null;
  }
  return null;
}

/**
 * Payload para el modal de bienvenida (plantilla ventana): solo si **quien inicia sesión**
 * cumple años hoy y show_birthday_window = SI. {nombre} = solo ese usuario.
 */
async function obtenerPayloadBienvenidaModal(user) {
  const { colegio_id, personal_id, alumno_id, apoderado_id } = user;
  const configRows = await query(
    `SELECT clave, valor FROM config WHERE clave IN ('show_birthday_window', 'cumpleanos_plantilla_ventana')`
  );
  const cfg = Object.fromEntries(configRows.map((r) => [r.clave, r.valor]));
  if ((cfg.show_birthday_window || 'NO').toUpperCase() !== 'SI') {
    return { show_modal: false };
  }

  const anio_activo = await getAnioActivo(colegio_id);
  if (!anio_activo) {
    return { show_modal: false };
  }

  const hoy = new Date();
  const diaHoy = hoy.getDate();
  const mesHoy = hoy.getMonth() + 1;
  const mesNombre = MESES[mesHoy - 1];

  const nombreCumpleanero = await obtenerNombreCumpleaneroSesionHoy(
    colegio_id,
    personal_id || null,
    alumno_id || null,
    apoderado_id || null,
    mesHoy,
    diaHoy
  );

  if (!nombreCumpleanero) {
    return { show_modal: false };
  }

  const nombreColegio = await obtenerNombreColegio(colegio_id);
  const plantilla = (cfg.cumpleanos_plantilla_ventana || '').trim();

  let html = aplicarPlantillaCumpleanosHtml(plantilla, {
    nombre: nombreCumpleanero,
    colegio: nombreColegio,
    mesNombre,
  });

  if (htmlBienvenidaVacioEfectivo(html)) {
    html = `<h2 style="margin:0 0 0.75rem;font-size:1.35rem;text-align:center;">¡Feliz cumpleaños! 🎂</h2>
<p>Hola <strong>${escapeHtml(nombreCumpleanero)}</strong>, <strong>${escapeHtml(nombreColegio)}</strong> te desea un gran día.</p>`;
  }

  html = envolverMarcoCumpleanosWeb(html);

  return { show_modal: true, html };
}

module.exports = {
  enviarNotificacionesCumpleanos,
  getCumpleanosHoyParaUsuario,
  aplicarPlantillaCumpleanosHtml,
  obtenerPayloadBienvenidaModal,
  envolverMarcoCumpleanosWeb,
};
