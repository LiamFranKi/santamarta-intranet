/**
 * Servicio de notificaciones push para cumpleaños del día.
 * Envía push a cada usuario con la lista de personas de su alcance que cumplen años hoy.
 * Docente: personal + alumnos/apoderados de sus grupos
 * Alumno: personal + alumnos/apoderados de su grupo
 * Apoderado: personal + alumnos/apoderados de grupos de sus hijos
 * Administrador: todo el colegio
 */
const { query } = require('../utils/mysql');
const { getAnioActivo } = require('../utils/mysql');
const { enviarPushNotificationMultiple } = require('./pushNotificationService');

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

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
async function enviarNotificacionesCumpleanos() {
  try {
    const configs = await query(`SELECT valor FROM config WHERE clave = 'show_birthday_window' LIMIT 1`);
    if ((configs[0]?.valor || 'NO').toUpperCase() !== 'SI') {
      console.log('🎂 [CUMPLEANOS-PUSH] show_birthday_window=NO, no se envían notificaciones');
      return;
    }

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

      const subs = await query(
        `SELECT endpoint, p256dh, auth FROM push_subscriptions
         WHERE usuario_id = ? AND colegio_id = ? AND (activo = 1 OR activo IS NULL)`,
        [u.id, colegio_id]
      );
      if (subs.length === 0) continue;

      const nombres = cumpleanos.map(c => c.nombre).join(', ');
      const titulo = cumpleanos.length === 1
        ? '🎂 ¡Feliz cumpleaños!'
        : `🎂 ${cumpleanos.length} cumpleaños hoy`;
      let body = cumpleanos.length === 1
        ? `${nombres} cumple años hoy`
        : nombres;
      if (body.length > 200) body = body.substring(0, 197) + '...';

      const subscriptions = subs.map(sub => ({
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth }
      }));

      const urlDashboard = u.tipo === 'ADMINISTRADOR' ? '/admin/dashboard'
        : u.tipo === 'ALUMNO' ? '/alumno/dashboard'
        : u.tipo === 'APODERADO' ? '/apoderado/dashboard'
        : '/docente/dashboard';
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
        await enviarPushNotificationMultiple(subscriptions, payload);
        totalEnviados += subscriptions.length;
        console.log(`🎂 [CUMPLEANOS-PUSH] Usuario ${u.id} (${u.tipo}): ${cumpleanos.length} cumpleaños, ${subscriptions.length} push enviados`);
      } catch (err) {
        console.error(`🎂 [CUMPLEANOS-PUSH] Error usuario ${u.id}:`, err.message);
      }
    }

    console.log(`🎂 [CUMPLEANOS-PUSH] Total notificaciones enviadas: ${totalEnviados}`);
  } catch (error) {
    console.error('🎂 [CUMPLEANOS-PUSH] Error:', error);
  }
}

module.exports = { enviarNotificacionesCumpleanos, getCumpleanosHoyParaUsuario };
