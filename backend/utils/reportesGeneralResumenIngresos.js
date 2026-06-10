/**
 * Resumen de ingresos por rango de fechas (Reportes → General).
 */
const { query } = require('./mysql');
const { columnExists } = require('./listaAlumnosMatriculadosReporte');

const MESES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

/** Fecha efectiva del cobro (legado 1970 → fecha_cancelado). */
const SQL_FECHA_PAGO = `(CASE
  WHEN YEAR(p.fecha_hora) = 1970 AND UPPER(TRIM(p.estado_pago)) = 'CANCELADO' THEN DATE(p.fecha_cancelado)
  ELSE DATE(p.fecha_hora)
END)`;

function parseFechaIso(raw) {
  const s = String(raw || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return s;
}

function fmtFechaDisplay(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}-${m}-${y}`;
}

function nombreAlumnoReporte(row) {
  const ap = [row.apellido_paterno, row.apellido_materno]
    .filter((x) => x != null && String(x).trim())
    .join(' ')
    .trim()
    .toUpperCase();
  const nom = String(row.nombres || '').trim();
  if (ap && nom) return `${ap}, ${nom}`;
  return ap || nom || '—';
}

function formatSerieNumero(serie, numero) {
  const hasSerie = serie != null && String(serie).trim() !== '';
  const hasNum = numero != null && String(numero).trim() !== '';
  if (!hasSerie && !hasNum) return '—';
  const s = String(serie ?? '0').padStart(3, '0');
  const n = String(numero ?? '0').padStart(7, '0');
  return `${s}-${n}`;
}

function descripcionPago(row, inicioPensiones, cicloPensiones) {
  const tipo = parseInt(row.tipo, 10);
  if (tipo === 0) return 'Matrícula';
  if (tipo === 1) {
    const nro = parseInt(row.nro_pago, 10) || 0;
    if (cicloPensiones === 0 || cicloPensiones === '0') {
      const indice = nro + inicioPensiones - 1;
      const mes = indice >= 0 && indice < MESES.length ? MESES[indice] : `Mes ${nro}`;
      return `Pensión - ${mes}`;
    }
    return `Pensión - ${nro}`;
  }
  if (tipo === 3) return `Comedor - ${row.nro_pago || ''}`.trim();
  const desc = String(row.descripcion || '').trim();
  return desc || 'Otro';
}

async function etiquetaSede(colegioId, sedeId) {
  if (!Number.isFinite(sedeId)) return '';
  const [row] = await query('SELECT nombre FROM sedes WHERE id = ? AND colegio_id = ? LIMIT 1', [
    sedeId,
    colegioId,
  ]);
  return row?.nombre ? String(row.nombre).trim() : '';
}

async function obtenerResumenIngresos(colegioId, { desde, hasta, sedeId }) {
  const desdeIso = parseFechaIso(desde);
  const hastaIso = parseFechaIso(hasta);
  if (!desdeIso || !hastaIso) {
    throw new Error('Indique fechas válidas (desde y hasta).');
  }
  if (desdeIso > hastaIso) {
    throw new Error('La fecha «desde» no puede ser posterior a «hasta».');
  }
  if (!Number.isFinite(sedeId)) {
    throw new Error('Indique una sede válida.');
  }

  const [colegio] = await query(
    `SELECT nombre, razon_social, titulo_intranet, moneda, inicio_pensiones, ciclo_pensiones
     FROM colegios WHERE id = ? LIMIT 1`,
    [colegioId]
  );
  const moneda = colegio?.moneda || 'S/';
  const colegioNombre = (colegio?.razon_social || colegio?.titulo_intranet || colegio?.nombre || 'Colegio').trim();
  const inicioPensiones = parseInt(colegio?.inicio_pensiones ?? 2, 10);
  const cicloPensiones = colegio?.ciclo_pensiones;

  const hasSede = await columnExists('grupos', 'sede_id');
  const sedeSql = hasSede ? ' AND g.sede_id = ?' : '';
  const params = [colegioId, desdeIso, hastaIso];
  if (hasSede) params.push(sedeId);

  const rows = await query(
    `SELECT
        p.id AS pago_id,
        p.tipo,
        p.nro_pago,
        p.descripcion,
        p.monto,
        p.fecha_hora,
        p.fecha_cancelado,
        ${SQL_FECHA_PAGO} AS fecha_pago,
        a.nombres,
        a.apellido_paterno,
        a.apellido_materno,
        imp.serie AS boleta_serie,
        imp.numero AS boleta_numero
     FROM pagos p
     INNER JOIN matriculas m ON m.id = p.matricula_id
     INNER JOIN grupos g ON g.id = m.grupo_id
     INNER JOIN alumnos a ON a.id = m.alumno_id
     LEFT JOIN (
       SELECT i1.pago_id, i1.serie, i1.numero
       FROM impresiones i1
       INNER JOIN (
         SELECT pago_id, MAX(id) AS max_id
         FROM impresiones
         WHERE tipo = 'PAGO' AND tipo_documento = 'BOLETA' AND estado = 'ACTIVO'
         GROUP BY pago_id
       ) ix ON ix.max_id = i1.id
     ) imp ON imp.pago_id = p.id
     WHERE p.colegio_id = ?
       AND p.estado = 'ACTIVO'
       AND UPPER(TRIM(p.estado_pago)) = 'CANCELADO'
       AND ${SQL_FECHA_PAGO} >= ?
       AND ${SQL_FECHA_PAGO} <= ?${sedeSql}
     ORDER BY ${SQL_FECHA_PAGO} ASC, imp.serie ASC, imp.numero ASC, p.id ASC`,
    params
  );

  const sedeEtiqueta = await etiquetaSede(colegioId, sedeId);

  const filas = (rows || []).map((r) => {
    const fechaPago = r.fecha_pago
      ? String(r.fecha_pago).slice(0, 10)
      : r.fecha_cancelado
        ? String(r.fecha_cancelado).slice(0, 10)
        : String(r.fecha_hora || '').slice(0, 10);
    const monto = Math.round((parseFloat(r.monto) || 0) * 100) / 100;
    return {
      pago_id: r.pago_id,
      nro_recibo: formatSerieNumero(r.boleta_serie, r.boleta_numero),
      monto,
      descripcion: descripcionPago(r, inicioPensiones, cicloPensiones),
      alumno_nombre: nombreAlumnoReporte(r),
      fecha_pago: fechaPago,
    };
  });

  const totalIngresos = Math.round(filas.reduce((s, f) => s + (f.monto || 0), 0) * 100) / 100;

  return {
    colegio_nombre: colegioNombre,
    moneda,
    sede_etiqueta: sedeEtiqueta,
    desde: desdeIso,
    hasta: hastaIso,
    rango_etiqueta: `${fmtFechaDisplay(desdeIso)} - ${fmtFechaDisplay(hastaIso)}`,
    total_ingresos: totalIngresos,
    total_registros: filas.length,
    filas,
  };
}

module.exports = { obtenerResumenIngresos, fmtFechaDisplay };
