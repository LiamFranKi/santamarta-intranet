/**
 * Control de sesiones JWT vía usuarios.token_version.
 * Cualquier token con tv distinto al de BD se rechaza.
 */

async function getTokenVersion(query, usuarioId) {
  try {
    const rows = await query(
      'SELECT token_version FROM usuarios WHERE id = ? LIMIT 1',
      [usuarioId]
    );
    if (!rows?.length) return null;
    const v = parseInt(rows[0].token_version, 10);
    return Number.isFinite(v) ? v : 1;
  } catch (e) {
    // Columna aún no migrada: no romper login
    if (String(e.message || '').includes('token_version') || e.code === 'ER_BAD_FIELD_ERROR') {
      return 1;
    }
    throw e;
  }
}

/** Sube la versión → invalida todos los JWT de ese usuario. */
async function bumpTokenVersion(execute, usuarioId) {
  try {
    await execute(
      'UPDATE usuarios SET token_version = COALESCE(token_version, 1) + 1 WHERE id = ?',
      [usuarioId]
    );
    return true;
  } catch (e) {
    if (String(e.message || '').includes('token_version') || e.code === 'ER_BAD_FIELD_ERROR') {
      console.warn('[tokenVersion] columna token_version ausente; ejecute migración 068');
      return false;
    }
    throw e;
  }
}

/** Cierra sesión de todos los usuarios de un colegio (o uno concreto). */
async function bumpTokenVersionColegio(execute, colegioId, usuarioId = null) {
  try {
    if (usuarioId) {
      await execute(
        `UPDATE usuarios
         SET token_version = COALESCE(token_version, 1) + 1
         WHERE id = ? AND colegio_id = ?`,
        [usuarioId, colegioId]
      );
    } else {
      await execute(
        `UPDATE usuarios
         SET token_version = COALESCE(token_version, 1) + 1
         WHERE colegio_id = ?`,
        [colegioId]
      );
    }
    return true;
  } catch (e) {
    if (String(e.message || '').includes('token_version') || e.code === 'ER_BAD_FIELD_ERROR') {
      console.warn('[tokenVersion] columna token_version ausente; ejecute migración 068');
      return false;
    }
    throw e;
  }
}

module.exports = {
  getTokenVersion,
  bumpTokenVersion,
  bumpTokenVersionColegio,
};
