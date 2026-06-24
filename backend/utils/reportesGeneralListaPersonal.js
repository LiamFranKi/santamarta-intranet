/**
 * Reporte «Lista de Personal» / Personal Administrativo (admin reportes general).
 */
const { query } = require('./mysql');

const ORDEN_CAMPOS = {
  NOMBRES: 'p.nombres',
  APELLIDOS: 'p.apellidos',
  CARGO: 'p.cargo',
};

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

function fechaCorta(val) {
  if (val == null || val === '') return '—';
  const s = String(val).slice(0, 10);
  return s || '—';
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
  const campoRaw = String(filtros.ordenCampo || 'NOMBRES').toUpperCase();
  const ordenCampo = ORDEN_CAMPOS[campoRaw] || ORDEN_CAMPOS.NOMBRES;
  const dirRaw = String(filtros.ordenDir || 'ASC').toUpperCase();
  const ordenDir = dirRaw === 'DESC' ? 'DESC' : 'ASC';

  if (!Number.isFinite(anio)) {
    return { ok: false, status: 400, error: 'Indique un año válido.' };
  }

  const { sedeNombre, turnoNombre } = await resolverEtiquetaSedeTurno(colegioId, sedeId, turnoId);

  const orderSecondary =
    ordenCampo === ORDEN_CAMPOS.APELLIDOS
      ? 'p.nombres ASC'
      : ordenCampo === ORDEN_CAMPOS.CARGO
        ? 'p.apellidos ASC, p.nombres ASC'
        : 'p.apellidos ASC';

  const rows = await query(
    `SELECT
       p.apellidos,
       p.nombres,
       p.cargo,
       p.fecha_nacimiento,
       p.telefono_celular,
       p.telefono_fijo,
       p.email
     FROM personal p
     WHERE p.colegio_id = ?
     ORDER BY ${ordenCampo} ${ordenDir}, ${orderSecondary}`,
    [colegioId]
  );

  const filas = (rows || []).map((row) => ({
    nombre_completo: nombrePersonalLista(row),
    cargo: String(row.cargo || '').trim() || '—',
    fecha_nacimiento: fechaCorta(row.fecha_nacimiento),
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
    orden_campo: campoRaw in ORDEN_CAMPOS ? campoRaw : 'NOMBRES',
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
