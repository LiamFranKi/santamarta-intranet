/**
 * Reporte «Lista de Personal» / Personal Administrativo (admin reportes general).
 */
const { query } = require('./mysql');
const { sqlPersonalSinSuperadmin } = require('./superadminOculto');

const ORDEN_CAMPOS = {
  NOMBRES: 'p.nombres',
  APELLIDOS: 'p.apellidos',
  PERFIL: 'u.tipo',
  CARGO: 'p.cargo',
};

function fechaDdMmAaaa(val) {
  if (val == null || val === '') return '—';
  if (val instanceof Date && !Number.isNaN(val.getTime())) {
    const dd = String(val.getDate()).padStart(2, '0');
    const mm = String(val.getMonth() + 1).padStart(2, '0');
    const yyyy = val.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }
  const s = String(val).trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }
  return '—';
}

function etiquetaPerfil(tipo) {
  const t = String(tipo || '').trim();
  if (!t) return '—';
  return t.replace(/_/g, ' ');
}

function tituloCadaPalabra(texto) {
  return String(texto || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function nombrePersonalLista(row) {
  const ap = String(row.apellidos || '').trim();
  const nom = String(row.nombres || '').trim();
  if (ap && nom) return `${ap.toUpperCase()}, ${tituloCadaPalabra(nom)}`;
  return (ap || nom || '—').toUpperCase();
}

function telefonoPersonalLista(row) {
  const cel = String(row.telefono_celular || '').trim();
  const fijo = String(row.telefono_fijo || '').trim();
  if (cel && fijo) return `${cel} ${fijo}`.trim();
  return cel || fijo || '—';
}


async function resolverEtiquetaSedeTurno(colegioId, sedeId, turnoId) {
  let sedeNombre = '';
  let turnoNombre = '';
  if (Number.isFinite(sedeId)) {
    const rows = await query('SELECT nombre FROM sedes WHERE id = ? AND colegio_id = ? LIMIT 1', [
      sedeId,
      colegioId,
    ]);
    sedeNombre = String(rows[0]?.nombre || '').trim();
  }
  if (Number.isFinite(turnoId)) {
    const rows = await query('SELECT nombre FROM turnos WHERE id = ? AND colegio_id = ? LIMIT 1', [
      turnoId,
      colegioId,
    ]).catch(async () => {
      return query('SELECT nombre FROM turnos WHERE id = ? LIMIT 1', [turnoId]);
    });
    turnoNombre = String(rows[0]?.nombre || '').trim();
  }
  return { sedeNombre, turnoNombre };
}

async function obtenerListaPersonal(colegioId, filtros) {
  const anio = parseInt(filtros.anio, 10);
  const sedeId = filtros.sedeId != null ? parseInt(filtros.sedeId, 10) : null;
  const turnoId = filtros.turnoId != null ? parseInt(filtros.turnoId, 10) : null;
  const campoRaw = String(filtros.ordenCampo || 'APELLIDOS').toUpperCase();
  const campoKey = campoRaw === 'CARGO' ? 'PERFIL' : campoRaw;
  const ordenCampo = ORDEN_CAMPOS[campoKey] || ORDEN_CAMPOS.NOMBRES;
  const dirRaw = String(filtros.ordenDir || 'ASC').toUpperCase();
  const ordenDir = dirRaw === 'DESC' ? 'DESC' : 'ASC';

  if (!Number.isFinite(anio)) {
    return { ok: false, status: 400, error: 'Indique un año válido.' };
  }

  const { sedeNombre, turnoNombre } = await resolverEtiquetaSedeTurno(colegioId, sedeId, turnoId);

  const orderSecondary =
    ordenCampo === ORDEN_CAMPOS.APELLIDOS
      ? 'p.nombres ASC'
      : ordenCampo === ORDEN_CAMPOS.PERFIL
        ? 'p.apellidos ASC, p.nombres ASC'
        : ordenCampo === ORDEN_CAMPOS.CARGO
          ? 'p.apellidos ASC, p.nombres ASC'
          : 'p.apellidos ASC';

  const rows = await query(
    `SELECT
       p.apellidos,
       p.nombres,
       p.fecha_nacimiento,
       p.telefono_celular,
       p.telefono_fijo,
       p.email,
       u.tipo AS usuario_tipo
     FROM personal p
     LEFT JOIN usuarios u ON u.id = (
       SELECT uu.id
       FROM usuarios uu
       WHERE uu.personal_id = p.id AND uu.colegio_id = p.colegio_id
       ORDER BY (uu.estado = 'ACTIVO') DESC, uu.id ASC
       LIMIT 1
     )
     WHERE p.colegio_id = ?
       AND ${sqlPersonalSinSuperadmin('p')}
     ORDER BY ${ordenCampo} ${ordenDir}, ${orderSecondary}`,
    [colegioId]
  );

  const filas = (rows || []).map((row) => ({
    nombre_completo: nombrePersonalLista(row),
    perfil: etiquetaPerfil(row.usuario_tipo),
    fecha_nacimiento: fechaDdMmAaaa(row.fecha_nacimiento),
    telefono: telefonoPersonalLista(row),
    email: String(row.email || '').trim() || '—',
  }));

  const partesSub = [];
  if (sedeNombre) partesSub.push(`Sede: ${sedeNombre}`);
  if (turnoNombre) partesSub.push(`Turno: ${turnoNombre}`);
  partesSub.push(`Año: ${anio}`);

  return {
    ok: true,
    titulo: 'Personal Administrativo',
    subtitulo: partesSub.join(' — '),
    anio,
    sede_nombre: sedeNombre,
    turno_nombre: turnoNombre,
    orden_campo: campoKey in ORDEN_CAMPOS ? campoKey : 'APELLIDOS',
    orden_dir: ordenDir,
    filas,
    total: filas.length,
  };
}

module.exports = {
  obtenerListaPersonal,
  nombrePersonalLista,
  telefonoPersonalLista,
};
