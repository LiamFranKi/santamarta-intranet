/**
 * Reporte de conducta (Reportes → General → Académico).
 * Bimestres 1 a 3: promedio final guardado.
 * Bimestre 4, cuando rige la regla nueva: nota de ahora (20 menos las faltas del bimestre).
 */
const { query } = require('./mysql');
const { sqlMatriculaEstadoSoloRegular } = require('./matriculaEstados');
const { etiquetaGradoTitulo } = require('./listaAlumnosMatriculadosReporte');
const {
  ASIGNATURA_CONDUCTA,
  toFechaYmd,
  obtenerRangoBimestre,
} = require('./conductaIncidenciasBimestre');
const {
  usaConductaNueva,
  bloquesDelBimestre,
  notaDesdeSuma,
  promedioDos,
  LABEL_GRUPO,
} = require('./conductaCatalogo');

const DETALLE_MAX_ALUMNOS = 45;

function parseNum(raw) {
  if (raw == null || raw === '' || raw === '-') return null;
  const n = parseFloat(String(raw).replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function media(vals) {
  const nums = (vals || []).filter((n) => n != null && Number.isFinite(Number(n))).map(Number);
  if (!nums.length) return null;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100;
}

function nombreAlumno(row) {
  const ap = [row.apellido_paterno, row.apellido_materno]
    .filter((x) => x != null && String(x).trim())
    .join(' ')
    .trim();
  const nom = String(row.nombres || '').trim();
  if (ap && nom) return `${ap}, ${nom}`;
  return ap || nom || '—';
}

function aulaDe(row) {
  const nivel = String(row.nivel_nombre || '').trim();
  const grado = etiquetaGradoTitulo(row.nivel_nombre, row.grado);
  const sec = String(row.seccion || '').trim();
  return [nivel, grado, sec].filter(Boolean).join(' ');
}

async function leerAjustesReporte() {
  let inicial = 20;
  let minima = 0;
  let redondear = false;
  try {
    const rows = await query(
      `SELECT clave, valor FROM config
       WHERE clave IN ('conducta_nota_inicial','conducta_nota_minima','conducta_redondear_promedio')`
    );
    const map = {};
    (rows || []).forEach((r) => {
      map[r.clave] = r.valor;
    });
    if (map.conducta_nota_inicial != null && map.conducta_nota_inicial !== '') {
      inicial = Math.round(Number(map.conducta_nota_inicial) * 100) / 100;
    }
    if (map.conducta_nota_minima != null && map.conducta_nota_minima !== '') {
      minima = Math.round(Number(map.conducta_nota_minima) * 100) / 100;
    }
    redondear = map.conducta_redondear_promedio === '1' || map.conducta_redondear_promedio === 'true';
  } catch (_) {
    /* config ausente: se usan 20 y 0 */
  }
  if (!Number.isFinite(inicial) || inicial < 0) inicial = 20;
  if (inicial > 20) inicial = 20;
  if (!Number.isFinite(minima) || minima < 0) minima = 0;
  if (minima > inicial) minima = inicial;
  return { nota_inicial: inicial, nota_minima: minima, redondear_promedio: redondear };
}

function notaViva(suma1, suma2, bloques, ajustes) {
  const sumas = [Number(suma1) || 0, Number(suma2) || 0];
  const notas = (bloques || []).map((bloque, i) => {
    if (!bloque) return ajustes.nota_inicial;
    return notaDesdeSuma(sumas[i] || 0, ajustes.nota_inicial, ajustes.nota_minima);
  });
  const mes1 = notas[0] != null ? notas[0] : ajustes.nota_inicial;
  const mes2 = notas[1] != null ? notas[1] : ajustes.nota_inicial;
  const descontado = Math.round(((bloques?.[0] ? sumas[0] : 0) + (bloques?.[1] ? sumas[1] : 0)) * 100) / 100;
  return {
    final: promedioDos(mes1, mes2, ajustes.redondear_promedio),
    descontado,
  };
}

async function sumasBimestreNuevo(matriculaIds, anio, bloques) {
  const vacio = new Map();
  if (!matriculaIds.length) return { map: vacio, ok: true };
  const b1 = bloques?.[0];
  const b2 = bloques?.[1];
  if (!b1?.desde || !b1?.hasta) return { map: vacio, ok: false };
  const ph = matriculaIds.map(() => '?').join(',');
  const desde = b1.desde;
  const hasta = b2?.hasta || b1.hasta;
  try {
    const rows = await query(
      `SELECT matricula_id,
              SUM(CASE WHEN fecha BETWEEN ? AND ? THEN descuento ELSE 0 END) AS s1,
              SUM(CASE WHEN ? IS NOT NULL AND fecha BETWEEN ? AND ? THEN descuento ELSE 0 END) AS s2,
              COUNT(*) AS n
       FROM conducta_registros
       WHERE matricula_id IN (${ph})
         AND anio = ?
         AND fecha BETWEEN ? AND ?
       GROUP BY matricula_id`,
      [
        b1.desde,
        b1.hasta,
        b2 ? 1 : null,
        b2?.desde || '1000-01-01',
        b2?.hasta || '1000-01-01',
        ...matriculaIds,
        anio,
        desde,
        hasta,
      ]
    );
    const map = new Map();
    (rows || []).forEach((r) => {
      map.set(Number(r.matricula_id), {
        s1: Number(r.s1) || 0,
        s2: Number(r.s2) || 0,
        n: Number(r.n) || 0,
      });
    });
    return { map, ok: true };
  } catch (e) {
    if (e && (e.code === 'ER_NO_SUCH_TABLE' || e.errno === 1146)) {
      return { map: vacio, ok: false };
    }
    throw e;
  }
}

function subtituloDe(filtros, anio) {
  const partes = [];
  if (filtros.nivelNombre) partes.push(String(filtros.nivelNombre).trim());
  else partes.push('Todos los niveles');
  if (filtros.grado != null) {
    const g = etiquetaGradoTitulo(filtros.nivelNombre, filtros.grado);
    partes.push(g || `${filtros.grado}°`);
  }
  if (filtros.seccion) partes.push(String(filtros.seccion).trim());
  if (filtros.q) partes.push(`Alumno: ${filtros.q}`);
  partes.push(String(anio));
  return partes.filter(Boolean).join(' · ');
}

async function obtenerReporteConducta(colegioId, filtros) {
  const anio = parseInt(filtros.anio, 10);
  if (!Number.isFinite(anio) || anio < 2000) {
    return { ok: false, status: 400, error: 'Indique un año válido.' };
  }

  const nivelId = filtros.nivelId != null && filtros.nivelId !== '' ? parseInt(filtros.nivelId, 10) : null;
  const grado = filtros.grado != null && filtros.grado !== '' ? parseInt(filtros.grado, 10) : null;
  const seccion = String(filtros.seccion || '').trim();
  const q = String(filtros.q || '').trim().replace(/\s+/g, ' ');

  if (nivelId != null && !Number.isFinite(nivelId)) {
    return { ok: false, status: 400, error: 'El nivel no es válido.' };
  }
  if (grado != null && !Number.isFinite(grado)) {
    return { ok: false, status: 400, error: 'El grado no es válido.' };
  }
  if (q && q.length < 2) {
    return { ok: false, status: 400, error: 'Escriba al menos 2 letras del alumno.' };
  }

  const where = [`m.colegio_id = ?`, `g.anio = ?`, sqlMatriculaEstadoSoloRegular('m')];
  const params = [colegioId, anio];
  if (nivelId != null) {
    where.push('g.nivel_id = ?');
    params.push(nivelId);
  }
  if (grado != null) {
    where.push('g.grado = ?');
    params.push(grado);
  }
  if (seccion) {
    where.push('UPPER(TRIM(g.seccion)) = ?');
    params.push(seccion.toUpperCase());
  }
  if (q) {
    where.push(
      `CONCAT(a.apellido_paterno, ' ', a.apellido_materno, ' ', a.nombres) LIKE ?`
    );
    params.push(`%${q}%`);
  }

  let nivelNombre = '';
  if (nivelId != null) {
    const niv = await query(
      `SELECT nombre FROM niveles WHERE id = ? AND colegio_id = ? LIMIT 1`,
      [nivelId, colegioId]
    );
    nivelNombre = niv?.[0]?.nombre || '';
  }

  const alumnos = await query(
    `SELECT m.id AS matricula_id,
            a.apellido_paterno, a.apellido_materno, a.nombres,
            n.nombre AS nivel_nombre, g.grado, g.seccion
     FROM matriculas m
     INNER JOIN alumnos a ON a.id = m.alumno_id AND a.colegio_id = m.colegio_id
     INNER JOIN grupos g ON g.id = m.grupo_id AND g.colegio_id = m.colegio_id
     INNER JOIN niveles n ON n.id = g.nivel_id
     WHERE ${where.join(' AND ')}
     ORDER BY n.id ASC, g.grado ASC, g.seccion ASC,
              a.apellido_paterno ASC, a.apellido_materno ASC, a.nombres ASC`,
    params
  );

  const ids = (alumnos || []).map((a) => a.matricula_id);
  const guardadas = new Map();
  if (ids.length) {
    const ph = ids.map(() => '?').join(',');
    const proms = await query(
      `SELECT matricula_id, ciclo, promedio
       FROM promedios
       WHERE asignatura_id = ?
         AND ciclo IN (1, 2, 3, 4)
         AND matricula_id IN (${ph})`,
      [ASIGNATURA_CONDUCTA, ...ids]
    );
    (proms || []).forEach((p) => {
      const mid = Number(p.matricula_id);
      const ciclo = parseInt(p.ciclo, 10);
      if (!guardadas.has(mid)) guardadas.set(mid, {});
      guardadas.get(mid)[ciclo] = parseNum(p.promedio);
    });
  }

  const b4Nuevo = usaConductaNueva(anio, 4);
  let vivo = { map: new Map(), ok: false };
  let ajustes = { nota_inicial: 20, nota_minima: 0, redondear_promedio: false };
  let bloques = [null, null];
  if (b4Nuevo && ids.length) {
    ajustes = await leerAjustesReporte();
    const rango = await obtenerRangoBimestre(query, colegioId, 4, anio);
    bloques = bloquesDelBimestre(rango.desde, rango.hasta);
    vivo = await sumasBimestreNuevo(ids, anio, bloques);
  }
  const b4EnCurso = b4Nuevo && vivo.ok;

  const filas = (alumnos || []).map((row, i) => {
    const mid = Number(row.matricula_id);
    const g = guardadas.get(mid) || {};
    let b4 = g[4] != null ? g[4] : null;
    let faltas = null;
    let descontado = null;
    if (b4EnCurso) {
      const s = vivo.map.get(mid) || { s1: 0, s2: 0, n: 0 };
      const calc = notaViva(s.s1, s.s2, bloques, ajustes);
      b4 = parseNum(calc.final);
      faltas = s.n;
      descontado = calc.descontado;
    }
    const b1 = g[1] != null ? g[1] : null;
    const b2 = g[2] != null ? g[2] : null;
    const b3 = g[3] != null ? g[3] : null;
    return {
      numero: i + 1,
      matricula_id: mid,
      alumno: nombreAlumno(row),
      aula: aulaDe(row),
      b1,
      b2,
      b3,
      b4,
      promedio: media([b1, b2, b3, b4]),
      faltas_b4: faltas,
      descontado_b4: descontado,
    };
  });

  let registros = [];
  if (b4EnCurso && ids.length > 0 && ids.length <= DETALLE_MAX_ALUMNOS) {
    const ph = ids.map(() => '?').join(',');
    const b1 = bloques?.[0];
    const b2 = bloques?.[1];
    const desde = b1?.desde;
    const hasta = b2?.hasta || b1?.hasta;
    if (desde && hasta) {
      try {
        const regs = await query(
          `SELECT matricula_id, fecha, hora, codigo, nombre, grupo, descuento
           FROM conducta_registros
           WHERE matricula_id IN (${ph}) AND anio = ? AND fecha BETWEEN ? AND ?
           ORDER BY fecha ASC, hora ASC, id ASC`,
          [...ids, anio, desde, hasta]
        );
        const porId = new Map(filas.map((f) => [f.matricula_id, f]));
        registros = (regs || []).map((r) => {
          const f = porId.get(Number(r.matricula_id));
          const grupo = String(r.grupo || '');
          return {
            alumno: f?.alumno || '',
            aula: f?.aula || '',
            fecha: toFechaYmd(r.fecha) || String(r.fecha || '').slice(0, 10),
            hora: r.hora ? String(r.hora).slice(0, 5) : '',
            codigo: r.codigo || '',
            falta: r.nombre || '',
            tipo: LABEL_GRUPO[grupo] || grupo,
            descuento: parseNum(r.descuento),
          };
        });
      } catch (e) {
        if (!(e && (e.code === 'ER_NO_SUCH_TABLE' || e.errno === 1146))) throw e;
      }
    }
  }

  const promedios = {
    b1: media(filas.map((f) => f.b1)),
    b2: media(filas.map((f) => f.b2)),
    b3: media(filas.map((f) => f.b3)),
    b4: media(filas.map((f) => f.b4)),
    general: media(filas.map((f) => f.promedio)),
  };

  return {
    ok: true,
    anio,
    titulo: 'REPORTE DE CONDUCTA',
    subtitulo: subtituloDe({ nivelNombre, grado, seccion, q }, anio),
    b4_en_curso: b4EnCurso,
    b4_modo: b4EnCurso ? 'ahora' : 'guardada',
    nota_inicial: ajustes.nota_inicial,
    filas,
    registros,
    detalle_omitido: b4EnCurso && ids.length > DETALLE_MAX_ALUMNOS,
    promedios,
    total: filas.length,
  };
}

module.exports = { obtenerReporteConducta };
