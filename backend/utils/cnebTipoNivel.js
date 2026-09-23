const { query, execute, getAnioActivo } = require('./mysql');

function nivelDesdeNombre(nombre) {
  const u = String(nombre || '').toUpperCase();
  if (u.includes('SECUNDARIA')) return 'SECUNDARIA';
  if (u.includes('PRIMARIA')) return 'PRIMARIA';
  if (u.includes('INICIAL')) return 'INICIAL';
  return null;
}

/** Si el tipo viene informado, manda él. El nombre Inicial solo cubre datos viejos sin tipo. */
function esCualitativoNivel(tipo, nombre) {
  if (tipo === 0 || tipo === '0') return true;
  if (tipo === 1 || tipo === '1') return false;
  return String(nombre || '').toUpperCase().includes('INICIAL');
}

async function tiposPorNivelCneb(cid) {
  const rows = await query('SELECT nombre, tipo_calificacion FROM niveles WHERE colegio_id = ?', [cid]);
  const map = {};
  for (const row of rows || []) {
    const nivel = nivelDesdeNombre(row.nombre);
    if (!nivel) continue;
    const cuali = esCualitativoNivel(row.tipo_calificacion, row.nombre);
    map[nivel] = map[nivel] === true ? true : cuali;
  }
  return map;
}

async function aplicarTipoNivel(cid, nivel, activo) {
  const rows = await query('SELECT id, nombre FROM niveles WHERE colegio_id = ?', [cid]);
  for (const row of rows || []) {
    if (nivelDesdeNombre(row.nombre) !== nivel) continue;
    if (activo) {
      await execute(
        'UPDATE niveles SET tipo_calificacion = 0 WHERE id = ? AND colegio_id = ?',
        [row.id, cid]
      );
    } else {
      await execute(
        `UPDATE niveles SET tipo_calificacion = 1,
           tipo_calificacion_final = COALESCE(tipo_calificacion_final, 0),
           nota_maxima = COALESCE(nota_maxima, 20),
           nota_minima = COALESCE(nota_minima, 0),
           nota_aprobatoria = COALESCE(nota_aprobatoria, 11)
         WHERE id = ? AND colegio_id = ?`,
        [row.id, cid]
      );
    }
  }
}

async function aplicarUsoCneb(cid, anio, nivel, activo) {
  const year = parseInt(anio, 10) || new Date().getFullYear();
  await execute(
    `INSERT INTO cneb_uso_colegio (colegio_id, anio, bimestre, nivel_cneb, activo)
     VALUES (?, ?, 4, ?, ?)
     ON DUPLICATE KEY UPDATE activo = VALUES(activo)`,
    [cid, year, nivel, activo ? 1 : 0]
  );
}

async function sincronizarDesdeTipo(cid, nombre, tipo) {
  const nivel = nivelDesdeNombre(nombre);
  if (!nivel || !cid) return;
  const anio = (await getAnioActivo(cid)) || new Date().getFullYear();
  try {
    await aplicarUsoCneb(cid, anio, nivel, esCualitativoNivel(tipo, nombre));
  } catch (e) {
    if (e.code !== 'ER_NO_SUCH_TABLE' && e.code !== 'ER_BAD_FIELD_ERROR') throw e;
  }
}

module.exports = {
  nivelDesdeNombre,
  esCualitativoNivel,
  tiposPorNivelCneb,
  aplicarTipoNivel,
  sincronizarDesdeTipo,
};
