/**
 * Bloqueo de edición de preguntas/alternativas de exámenes virtuales para DOCENTE.
 * Si existe al menos una prueba ACTIVO (en curso) o FINALIZADA, el docente no debe
 * poder mutar el contenido (cierra el caso de poner el examen INACTIVO y editar).
 * ADMINISTRADOR: sin bloqueo (se excluye en assert).
 */

const MENSAJE_BLOQUEO =
  'No puedes modificar preguntas ni alternativas: ya hay alumnos con el examen en curso o con un intento finalizado. Solo el administrador puede editar el contenido de este examen.';

/**
 * @param {Function} query - mysql query(sql, params)
 * @param {number|string} examenId
 * @returns {Promise<boolean>}
 */
async function examenBloqueaEdicionContenidoDocente(query, examenId) {
  const id = parseInt(examenId, 10);
  if (!id || Number.isNaN(id)) return false;
  const rows = await query(
    `SELECT 1 AS ok
     FROM asignaturas_examenes_pruebas
     WHERE examen_id = ? AND estado IN ('ACTIVO', 'FINALIZADA')
     LIMIT 1`,
    [id]
  );
  return Array.isArray(rows) && rows.length > 0;
}

/**
 * @returns {Promise<boolean>} true si puede continuar el handler
 */
async function assertDocentePuedeEditarContenidoExamenVirtual(req, res, queryFn, examenId) {
  if (req.user && (req.user.tipo === 'ADMINISTRADOR' || req.user.tipo === 'COORDINADOR' || req.user.tipo === 'DIRECTOR' || req.user.tipo === 'CONTADOR')) {
    return true;
  }
  const blocked = await examenBloqueaEdicionContenidoDocente(queryFn, examenId);
  if (blocked) {
    res.status(403).json({
      error: MENSAJE_BLOQUEO,
      code: 'EXAMEN_CONTENIDO_BLOQUEADO',
    });
    return false;
  }
  return true;
}

module.exports = {
  examenBloqueaEdicionContenidoDocente,
  assertDocentePuedeEditarContenidoExamenVirtual,
  mensajeBloqueoExamenContenido: MENSAJE_BLOQUEO,
};
