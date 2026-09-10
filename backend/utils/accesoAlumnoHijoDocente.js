/**
 * Acceso a rutas /docente/hijos/:id/* : docente-apoderado o staff (admin/promotoría/psicóloga).
 */
const { query } = require('./mysql');
const { esTutoriaGeneralActivo, resolvePersonalId } = require('./tutoriaGeneral');
const {
  personalHijoTieneMatriculaAnioActivoOperativa,
  MENSAJE_SIN_MATRICULA
} = require('./matriculaAnioActivo');

function esStaffAlumnoColegio(tipo) {
  return tipo === 'ADMINISTRADOR' || tipo === 'PROMOTORIA' || tipo === 'PSICOLOGA' || tipo === 'COORDINADOR' || tipo === 'DIRECTOR' || tipo === 'CONTADOR';
}

/**
 * Docente tutor, con asignatura en el aula, o Tutoría General puede ver libreta de alumnos del grupo.
 */
async function verificarDocenteAccesoAlumnoEnGrupo(req, hijoIdNum) {
  const { colegio_id, anio_activo, personal_id } = req.user;
  if (!colegio_id || !anio_activo) return { ok: false };

  const matRows = await query(
    `SELECT m.grupo_id
     FROM matriculas m
     INNER JOIN grupos g ON g.id = m.grupo_id
     WHERE m.alumno_id = ? AND m.colegio_id = ? AND g.anio = ? AND (m.estado = 0)
     LIMIT 1`,
    [hijoIdNum, colegio_id, anio_activo]
  );
  if (!matRows?.length) return { ok: false };

  const grupoId = matRows[0].grupo_id;
  const personalIdResolved = personal_id ? parseInt(personal_id, 10) : await resolvePersonalId(req);

  if (req._tutoriaAccesoGeneral && personalIdResolved) {
    const gRow = await query(
      `SELECT g.id FROM grupos g WHERE g.id = ? AND g.colegio_id = ? AND g.anio = ? LIMIT 1`,
      [grupoId, colegio_id, anio_activo]
    );
    if (gRow?.length) return { ok: true };
  }

  if (personalIdResolved) {
    if (await esTutoriaGeneralActivo(personalIdResolved, colegio_id)) {
      const gRow = await query(
        `SELECT g.id FROM grupos g WHERE g.id = ? AND g.colegio_id = ? AND g.anio = ? LIMIT 1`,
        [grupoId, colegio_id, anio_activo]
      );
      if (gRow?.length) return { ok: true };
    }

    const tutorRow = await query(
      `SELECT 1 FROM grupos g
       WHERE g.id = ? AND g.colegio_id = ? AND g.anio = ?
         AND (g.tutor_id = ? OR (COALESCE(g.tutor_id_2, 0) > 0 AND g.tutor_id_2 = ?))
       LIMIT 1`,
      [grupoId, colegio_id, anio_activo, personalIdResolved, personalIdResolved]
    );
    if (tutorRow?.length) return { ok: true };

    const asigRow = await query(
      `SELECT 1 FROM asignaturas a
       INNER JOIN grupos g ON g.id = a.grupo_id
       WHERE a.grupo_id = ? AND a.personal_id = ? AND a.colegio_id = ? AND g.anio = ?
       LIMIT 1`,
      [grupoId, personalIdResolved, colegio_id, anio_activo]
    );
    if (asigRow?.length) return { ok: true };
  }

  return { ok: false };
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

  const accesoGrupo = await verificarDocenteAccesoAlumnoEnGrupo(req, hijoIdNum);
  if (accesoGrupo.ok) {
    return { ok: true, nroDocumento: null, staff: false };
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

  const matriculaOk = await personalHijoTieneMatriculaAnioActivoOperativa(
    query,
    nroDocumento,
    hijoIdNum,
    colegio_id,
    req.user.anio_activo
  );
  if (!matriculaOk) {
    return { ok: false, status: 403, error: MENSAJE_SIN_MATRICULA };
  }

  return { ok: true, nroDocumento, staff: false };
}

module.exports = {
  esStaffAlumnoColegio,
  verificarAccesoAlumnoHijoDocente,
  verificarDocenteAccesoAlumnoEnGrupo,
};
