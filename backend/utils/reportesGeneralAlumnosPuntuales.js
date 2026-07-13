/**
 * Alumnos puntuales: pensiones canceladas hasta un mes dado, sin mora en ninguna.
 * Una fila por alumno (Reportes → General).
 */
const { query } = require('./mysql');
const { sqlMatriculaEstadoSoloRegular } = require('./matriculaEstados');
const { ordenNivelEducativoNombre, columnExists } = require('./listaAlumnosMatriculadosReporte');
const {
  cargarConfigColegio,
  nombreMesPension,
  buildMesesPensionOpciones,
} = require('./reportesGeneralDeudoresPagadores');

function nombreAlumnoLista(row) {
  const ap = [row.apellido_paterno, row.apellido_materno]
    .filter((x) => x != null && String(x).trim())
    .join(' ')
    .trim();
  const nom = String(row.nombres || '').trim();
  if (ap && nom) return `${ap}, ${nom}`;
  return ap || nom || '—';
}

function etiquetaGrado(row) {
  const sec = (row.seccion || '').toString().trim();
  const g = row.grado != null && row.grado !== '' ? `${row.grado}°` : '';
  return [g, sec].filter(Boolean).join(' ') || '—';
}

function tituloAgrupacion(row) {
  return `${String(row.nivel_nombre || '').toUpperCase()} — ${row.grado}° grado`;
}

function sortFilas(a, b) {
  const oa = ordenNivelEducativoNombre(a.nivel_nombre);
  const ob = ordenNivelEducativoNombre(b.nivel_nombre);
  if (oa !== ob) return oa - ob;
  const nid = (parseInt(a.nivel_id, 10) || 0) - (parseInt(b.nivel_id, 10) || 0);
  if (nid !== 0) return nid;
  const gd = (parseInt(a.grado, 10) || 0) - (parseInt(b.grado, 10) || 0);
  if (gd !== 0) return gd;
  const sec = String(a.seccion || '').localeCompare(String(b.seccion || ''), 'es', { sensitivity: 'base' });
  if (sec !== 0) return sec;
  const ap = String(a.apellido_paterno || '').localeCompare(String(b.apellido_paterno || ''), 'es', {
    sensitivity: 'base',
  });
  if (ap !== 0) return ap;
  const am = String(a.apellido_materno || '').localeCompare(String(b.apellido_materno || ''), 'es', {
    sensitivity: 'base',
  });
  if (am !== 0) return am;
  return String(a.nombres || '').localeCompare(String(b.nombres || ''), 'es', { sensitivity: 'base' });
}

async function etiquetaSede(colegioId, sedeId) {
  if (!Number.isFinite(sedeId)) return '';
  const [row] = await query('SELECT nombre FROM sedes WHERE id = ? AND colegio_id = ? LIMIT 1', [
    sedeId,
    colegioId,
  ]);
  return row?.nombre ? String(row.nombre).trim() : '';
}

async function contactosPorAlumno(colegioId, alumnoIds) {
  const map = {};
  const uniq = [...new Set((alumnoIds || []).filter((id) => id != null))];
  if (uniq.length === 0) return map;
  const ph = uniq.map(() => '?').join(',');
  const trows = await query(
    `SELECT f.alumno_id, f.id AS familia_id,
        COALESCE(NULLIF(TRIM(ap.telefono_celular), ''), NULLIF(TRIM(ap.telefono_fijo), ''), '') AS telefono,
        COALESCE(NULLIF(TRIM(ap.email), ''), '') AS email,
        COALESCE(NULLIF(TRIM(f.direccion), ''), '') AS direccion
     FROM familias f
     INNER JOIN apoderados ap ON ap.familia_id = f.id
     WHERE f.colegio_id = ? AND f.alumno_id IN (${ph})
     ORDER BY ap.id ASC`,
    [colegioId, ...uniq]
  );
  for (const tr of trows || []) {
    const aid = tr.alumno_id;
    if (map[aid] == null) {
      map[aid] = {
        telefono: String(tr.telefono || '').trim(),
        email: String(tr.email || '').trim(),
        direccion: String(tr.direccion || '').trim(),
      };
    }
  }
  return map;
}

/**
 * @param {number} colegioId
 * @param {{ anio: number, sedeId?: number|null, mesHasta: number }} opts
 */
async function obtenerListaAlumnosPuntuales(colegioId, opts) {
  const anio = parseInt(opts.anio, 10);
  const sedeId = opts.sedeId != null ? parseInt(opts.sedeId, 10) : null;
  const mesHasta = parseInt(opts.mesHasta, 10);

  if (!Number.isFinite(anio)) {
    throw new Error('Indique un año válido.');
  }
  if (!Number.isFinite(sedeId)) {
    throw new Error('Indique una sede válida.');
  }

  const cfg = await cargarConfigColegio(colegioId);
  const { totalPensiones, inicioPensiones, moneda, colegioNombre } = cfg;

  if (!Number.isFinite(mesHasta) || mesHasta < 1 || mesHasta > totalPensiones) {
    throw new Error(`Indique un mes de pensión válido (1 a ${totalPensiones}).`);
  }

  const hasSede = await columnExists('grupos', 'sede_id');
  const sedeSql = hasSede && Number.isFinite(sedeId) ? ' AND g.sede_id = ?' : '';
  const sedeEtiqueta = await etiquetaSede(colegioId, sedeId);
  const mesEtiqueta = nombreMesPension(mesHasta, inicioPensiones);

  const subParams = [mesHasta, colegioId, mesHasta, mesHasta];
  const outerParams = [colegioId, anio];
  if (hasSede && Number.isFinite(sedeId)) outerParams.push(sedeId);

  const rows = await query(
    `SELECT m.id AS matricula_id, m.alumno_id,
        a.nombres, a.apellido_paterno, a.apellido_materno,
        NULLIF(TRIM(a.nro_documento), '') AS nro_documento,
        g.grado, g.seccion, n.nombre AS nivel_nombre, n.id AS nivel_id,
        COALESCE(c.pension, 0) AS monto_pension,
        pun.fecha_ultimo_pago
     FROM matriculas m
     INNER JOIN grupos g ON g.id = m.grupo_id AND g.colegio_id = m.colegio_id
     INNER JOIN niveles n ON n.id = g.nivel_id
     INNER JOIN alumnos a ON a.id = m.alumno_id AND a.colegio_id = m.colegio_id
     LEFT JOIN costos c ON c.id = m.costo_id
     INNER JOIN (
       SELECT px.matricula_id,
              MAX(CASE WHEN px.nro_pago = ? THEN px.fecha_cancelado END) AS fecha_ultimo_pago
       FROM pagos px
       WHERE px.colegio_id = ?
         AND px.estado = 'ACTIVO'
         AND px.estado_pago = 'CANCELADO'
         AND px.tipo = 1
         AND px.nro_pago BETWEEN 1 AND ?
       GROUP BY px.matricula_id
       HAVING COUNT(DISTINCT px.nro_pago) = ?
          AND SUM(COALESCE(px.mora, 0)) = 0
     ) pun ON pun.matricula_id = m.id
     WHERE m.colegio_id = ? AND g.anio = ?${sedeSql}
       AND ${sqlMatriculaEstadoSoloRegular('m')}`,
    [...subParams, ...outerParams]
  );

  const filasRaw = (rows || []).map((r) => ({
    matricula_id: r.matricula_id,
    alumno_id: r.alumno_id,
    alumno_nombre: nombreAlumnoLista(r),
    grado_seccion: etiquetaGrado(r),
    nro_documento: r.nro_documento || '—',
    nivel_nombre: r.nivel_nombre || '',
    grado_agrupacion_key: `${r.nivel_id}|${r.grado}`,
    grado_agrupacion_titulo: tituloAgrupacion(r),
    nivel_id: r.nivel_id,
    grado: r.grado,
    seccion: r.seccion,
    monto_pension: Math.round((parseFloat(r.monto_pension) || 0) * 100) / 100,
    pensiones_pagadas: mesHasta,
    fecha_pago_ultimo_mes: r.fecha_ultimo_pago || null,
    apellido_paterno: r.apellido_paterno,
    apellido_materno: r.apellido_materno,
    nombres: r.nombres,
  }));

  filasRaw.sort(sortFilas);

  const contactMap = await contactosPorAlumno(
    colegioId,
    filasRaw.map((f) => f.alumno_id)
  );

  const filas = filasRaw.map((f) => {
    const c = contactMap[f.alumno_id] || {};
    return {
      ...f,
      telefono_apoderado: c.telefono || '',
      email_apoderado: c.email || '',
      direccion: c.direccion || '',
    };
  });

  const totalMontoPension = Math.round(
    filas.reduce((s, r) => s + (parseFloat(r.monto_pension) || 0), 0) * 100
  ) / 100;

  return {
    colegio_nombre: colegioNombre,
    anio,
    moneda,
    mes_hasta: mesHasta,
    mes_etiqueta: mesEtiqueta,
    meses_pension_opciones: buildMesesPensionOpciones(totalPensiones, inicioPensiones),
    sede_etiqueta: sedeEtiqueta,
    total_registros: filas.length,
    total_monto_pension: totalMontoPension,
    filas,
  };
}

module.exports = { obtenerListaAlumnosPuntuales };
