const { fechaMySQLLima } = require('./fechaHoraLima');

function to01(v) {
  if (Buffer.isBuffer(v)) return v.length && v[0] ? 1 : 0;
  if (v && typeof v === 'object' && Array.isArray(v.data)) return v.data[0] ? 1 : 0;
  if (v === true || v === 1 || v === '1') return 1;
  return 0;
}

function ymdPad(y, m, d) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function parseYmd(raw) {
  const s = String(raw || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return s;
}

/** Fechas de un mes que caen en esos días de semana (0=dom … 6=sáb), posteriores a hoyYmd. */
function fechasPorMesYDias(anio, mes, diasSemana, hoyYmd) {
  const anioN = parseInt(anio, 10);
  const mesN = parseInt(mes, 10);
  const set = new Set((diasSemana || []).map(Number).filter((n) => n >= 0 && n <= 6));
  if (!set.size || mesN < 1 || mesN > 12 || !Number.isFinite(anioN) || anioN < 2020 || anioN > 2100) {
    return [];
  }
  const last = new Date(anioN, mesN, 0).getDate();
  const out = [];
  for (let d = 1; d <= last; d += 1) {
    const dt = new Date(anioN, mesN - 1, d);
    if (!set.has(dt.getDay())) continue;
    const ymd = ymdPad(anioN, mesN, d);
    if (hoyYmd && ymd <= hoyYmd) continue;
    out.push(ymd);
  }
  return out;
}

function mensajeFechas(fechas) {
  const list = (fechas || []).slice(0, 8).map((f) => {
    const [y, m, d] = String(f).split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString('es-PE', { weekday: 'short', day: 'numeric', month: 'short' });
  });
  if (!list.length) return 'No hay fechas disponibles';
  const extra = (fechas || []).length - list.length;
  return extra > 0 ? `${list.join(', ')} y ${extra} más` : list.join(', ');
}

async function leerModoFechas(queryFn) {
  try {
    const rows = await queryFn(`SELECT modo_fechas FROM web_visita_config WHERE id = 1 LIMIT 1`);
    const m = String(rows?.[0]?.modo_fechas || 'semana').toLowerCase();
    return m === 'lista' ? 'lista' : 'semana';
  } catch (e) {
    if (e && (e.code === 'ER_NO_SUCH_TABLE' || e.errno === 1146)) return 'semana';
    throw e;
  }
}

async function leerFechasActivasFuturas(queryFn) {
  const hoy = fechaMySQLLima();
  try {
    const rows = await queryFn(
      `SELECT DATE_FORMAT(fecha, '%Y-%m-%d') AS fecha
       FROM web_visita_fechas
       WHERE activo = 1 AND fecha > ?
       ORDER BY fecha ASC`,
      [hoy]
    );
    return (rows || []).map((r) => String(r.fecha).slice(0, 10)).filter(Boolean);
  } catch (e) {
    if (e && (e.code === 'ER_NO_SUCH_TABLE' || e.errno === 1146)) return [];
    throw e;
  }
}

async function buildVisitaConfigPublica(queryFn) {
  const diasRows = await queryFn(
    `SELECT dia_semana, etiqueta, activo FROM web_visita_dias ORDER BY dia_semana ASC`
  );
  const horariosRows = await queryFn(
    `SELECT id, etiqueta, activo, orden FROM web_visita_horarios ORDER BY orden ASC, id ASC`
  );

  const diasEtiquetas = (diasRows || [])
    .filter((r) => to01(r.activo) === 1)
    .map((r) => ({
      dia_semana: Number(r.dia_semana),
      etiqueta: String(r.etiqueta || ''),
    }));
  const horarios = (horariosRows || [])
    .filter((r) => to01(r.activo) === 1)
    .map((r) => ({
      id: Number(r.id),
      etiqueta: String(r.etiqueta || ''),
    }));

  const modoFechas = await leerModoFechas(queryFn);
  const fechas = modoFechas === 'lista' ? await leerFechasActivasFuturas(queryFn) : [];

  let database = null;
  try {
    const dbRows = await queryFn('SELECT DATABASE() AS db');
    database = dbRows?.[0]?.db || null;
  } catch {
    /* ignore */
  }

  const base = {
    modoFechas,
    fechas,
    diasSemana: diasEtiquetas.map((d) => d.dia_semana),
    diasEtiquetas,
    horarios,
    usaSecuencias: false,
    source: 'intranet-mysql',
    database,
    generatedAt: new Date().toISOString(),
  };

  if (!horarios.length) {
    return {
      ...base,
      diasSemana: [],
      diasEtiquetas: [],
      fechas: [],
      mensajeDias: 'No hay horarios disponibles',
      disponible: false,
    };
  }

  if (modoFechas === 'lista') {
    if (!fechas.length) {
      return {
        ...base,
        diasSemana: [],
        mensajeDias: 'No hay fechas disponibles',
        disponible: false,
      };
    }
    return {
      ...base,
      diasSemana: [...new Set(fechas.map((f) => {
        const [y, m, d] = f.split('-').map(Number);
        return new Date(y, m - 1, d).getDay();
      }))],
      mensajeDias: mensajeFechas(fechas),
      disponible: true,
    };
  }

  if (!diasEtiquetas.length) {
    return {
      ...base,
      mensajeDias: 'No hay días disponibles',
      disponible: false,
    };
  }

  return {
    ...base,
    mensajeDias: diasEtiquetas.map((d) => d.etiqueta).join(', '),
    disponible: true,
  };
}

module.exports = {
  to01,
  parseYmd,
  fechasPorMesYDias,
  mensajeFechas,
  leerModoFechas,
  leerFechasActivasFuturas,
  buildVisitaConfigPublica,
};
