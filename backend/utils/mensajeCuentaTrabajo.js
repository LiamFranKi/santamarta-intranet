/**
 * Si el apoderado también tiene cuenta de trabajo (mismo DNI), el mensaje
 * va solo a esa cuenta. Quien entra como docente o personal no mira el buzón de mamá.
 */
const { TIPOS_PERSONAL } = require('./hexAudiencias');
const { sqlUsuariosSinSuperadmin } = require('./superadminOculto');

function idsLimpios(usuarioIds) {
  return [...new Set(
    (usuarioIds || [])
      .map((id) => parseInt(id, 10))
      .filter((n) => Number.isFinite(n) && n > 0)
  )];
}

function elegirStaff(actual, candidato) {
  if (!actual) return candidato;
  const rank = (tipo) => (String(tipo || '').toUpperCase() === 'DOCENTE' ? 0 : 1);
  const ra = rank(actual.tipo);
  const rb = rank(candidato.tipo);
  if (rb < ra) return candidato;
  if (rb === ra && Number(candidato.usuario_id) < Number(actual.usuario_id)) return candidato;
  return actual;
}

/**
 * @returns {Promise<number[]>} mismos ids, con cada cuenta APODERADO cambiada por la de trabajo si el DNI coincide
 */
async function redirigirApoderadosACuentaTrabajo(query, colegioId, usuarioIds) {
  const ids = idsLimpios(usuarioIds);
  if (!ids.length || !colegioId) return ids;

  const ph = ids.map(() => '?').join(',');
  const apod = await query(
    `SELECT u.id AS usuario_id, TRIM(CAST(ap.nro_documento AS CHAR)) AS dni
     FROM usuarios u
     INNER JOIN apoderados ap ON ap.id = u.apoderado_id AND ap.colegio_id = u.colegio_id
     WHERE u.colegio_id = ?
       AND u.id IN (${ph})
       AND u.estado = 'ACTIVO'
       AND u.tipo = 'APODERADO'
       AND ap.nro_documento IS NOT NULL
       AND TRIM(CAST(ap.nro_documento AS CHAR)) <> ''`,
    [colegioId, ...ids]
  );
  if (!apod?.length) return ids;

  const dnis = [...new Set(apod.map((r) => String(r.dni || '').trim()).filter(Boolean))];
  if (!dnis.length) return ids;

  const phDni = dnis.map(() => '?').join(',');
  const phTipos = TIPOS_PERSONAL.map(() => '?').join(',');
  const staff = await query(
    `SELECT u.id AS usuario_id, u.tipo,
            TRIM(CAST(p.nro_documento AS CHAR)) AS dni,
            TRIM(u.usuario) AS login
     FROM usuarios u
     INNER JOIN personal p ON p.id = u.personal_id AND p.colegio_id = u.colegio_id
     WHERE u.colegio_id = ?
       AND u.estado = 'ACTIVO'
       AND u.personal_id > 0
       AND u.tipo IN (${phTipos})
       AND ${sqlUsuariosSinSuperadmin('u')}
       AND (
         (p.nro_documento IS NOT NULL AND TRIM(CAST(p.nro_documento AS CHAR)) IN (${phDni}))
         OR TRIM(u.usuario) IN (${phDni})
       )`,
    [colegioId, ...TIPOS_PERSONAL, ...dnis, ...dnis]
  );

  const porClave = new Map();
  for (const s of staff || []) {
    const claves = [String(s.dni || '').trim(), String(s.login || '').trim()].filter(Boolean);
    for (const clave of claves) {
      porClave.set(clave, elegirStaff(porClave.get(clave), s));
    }
  }

  const dniPorApoderado = new Map(
    apod.map((r) => [Number(r.usuario_id), String(r.dni || '').trim()])
  );
  const out = [];
  const vistos = new Set();
  for (const id of ids) {
    const dni = dniPorApoderado.get(id);
    const hit = dni ? porClave.get(dni) : null;
    const destino = hit ? Number(hit.usuario_id) : id;
    if (!vistos.has(destino)) {
      vistos.add(destino);
      out.push(destino);
    }
  }
  return out;
}

module.exports = {
  redirigirApoderadosACuentaTrabajo,
};
