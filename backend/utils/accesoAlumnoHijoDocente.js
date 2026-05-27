/**
 * Acceso a rutas /docente/hijos/:id/* : docente-apoderado o staff (admin/promotoría/psicóloga).
 */
const { query } = require('./mysql');

function esStaffAlumnoColegio(tipo) {
  return tipo === 'ADMINISTRADOR' || tipo === 'PROMOTORIA' || tipo === 'PSICOLOGA';
}

/**
 * @returns {Promise<{ ok: boolean, status?: number, error?: string, nroDocumento?: string|null, staff?: boolean }>}
 */
async function verificarAccesoAlumnoHijoDocente(req, hijoIdNum) {
  const { colegio_id, usuario_id, personal_id, tipo } = req.user;

  if (!hijoIdNum || !Number.isFinite(hijoIdNum)) {
    return { ok: false, status: 400, error: 'ID de alumno inválido' };
  }

  if (esStaffAlumnoColegio(tipo)) {
    const r = await query('SELECT id FROM alumnos WHERE id = ? AND colegio_id = ? LIMIT 1', [
      hijoIdNum,
      colegio_id,
    ]);
    if (!r.length) {
      return { ok: false, status: 404, error: 'Alumno no encontrado' };
    }
    return { ok: true, nroDocumento: null, staff: true };
  }

  if (!personal_id) {
    return { ok: false, status: 400, error: 'Información de usuario incompleta. No se encontró personal_id.' };
  }

  let nroDocumento = null;
  const personalData = await query('SELECT nro_documento FROM personal WHERE id = ? AND colegio_id = ? LIMIT 1', [
    personal_id,
    colegio_id,
  ]);
  if (personalData?.[0]?.nro_documento) {
    nroDocumento = personalData[0].nro_documento;
  } else {
    const usuarioData = await query(
      'SELECT usuario FROM usuarios WHERE id = ? AND colegio_id = ? AND personal_id = ? LIMIT 1',
      [usuario_id, colegio_id, personal_id]
    );
    if (usuarioData?.[0]?.usuario) {
      nroDocumento = usuarioData[0].usuario;
    }
  }

  if (!nroDocumento) {
    return { ok: false, status: 403, error: 'No se encontró tu número de documento. Contacta al administrador.' };
  }

  const esHijo = await query(
    `SELECT COUNT(*) as count
     FROM apoderados ap
     INNER JOIN familias f ON f.apoderado_id = ap.id
     INNER JOIN alumnos a ON a.id = f.alumno_id
     WHERE ap.colegio_id = ? AND ap.nro_documento = ? AND a.id = ? AND a.colegio_id = ?`,
    [colegio_id, nroDocumento, hijoIdNum, colegio_id]
  );

  if (!esHijo?.length || Number(esHijo[0].count) === 0) {
    return {
      ok: false,
      status: 403,
      error: 'No tienes permisos. El alumno no está registrado como tu hijo.',
    };
  }

  return { ok: true, nroDocumento, staff: false };
}

module.exports = {
  esStaffAlumnoColegio,
  verificarAccesoAlumnoHijoDocente,
};
