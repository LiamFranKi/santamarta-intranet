const { query } = require('./mysql');
const { getColegioData } = require('./colegio');
const { fechaMySQLLima } = require('./fechaHoraLima');
const {
  archivosTieneEstructuraCols,
  obtenerConfigEstructura,
  cantidadParaCiclo,
  clasificarFila,
} = require('./aulaEstructuraTemas');

function ymd(val) {
  if (val == null || val === '') return null;
  if (val instanceof Date && !Number.isNaN(val.getTime())) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const m = String(val).match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

function tieneContenido(row) {
  const archivo = row?.archivo && String(row.archivo).trim() !== '';
  const enlace = row?.enlace && String(row.enlace).trim() !== '';
  return Boolean(archivo || enlace);
}

function etiquetaAula(nivel, grado, seccion) {
  const sec = String(seccion || '').trim();
  const g = grado == null ? '' : String(grado).trim();
  const niv = String(nivel || '').toLowerCase();
  const gradoTxt = /^\d+$/.test(g) && niv.includes('inicial') ? `${g} años` : g;
  return [gradoTxt, sec].filter(Boolean).join(' ');
}

function ordenNivel(nombre) {
  const n = String(nombre || '').toLowerCase();
  if (n.includes('inicial')) return 1;
  if (n.includes('primaria')) return 2;
  if (n.includes('secundaria')) return 3;
  return 4;
}

async function fechasAuditoria(ids) {
  const map = new Map();
  if (!ids.length) return map;
  const size = 400;
  for (let i = 0; i < ids.length; i += size) {
    const slice = ids.slice(i, i + size);
    const ph = slice.map(() => '?').join(',');
    try {
      const rows = await query(
        `SELECT entidad_id, MIN(fecha_hora) AS fecha
         FROM auditoria_logs
         WHERE entidad = 'archivo'
           AND accion IN ('CREAR', 'EDITAR')
           AND entidad_id IN (${ph})
         GROUP BY entidad_id`,
        slice
      );
      (rows || []).forEach((r) => {
        map.set(Number(r.entidad_id), ymd(r.fecha));
      });
    } catch (e) {
      if (e && (e.code === 'ER_NO_SUCH_TABLE' || e.code === 'ER_BAD_FIELD_ERROR')) return map;
      throw e;
    }
  }
  return map;
}

function armarLista(rows, fechas) {
  return (rows || [])
    .map((row) => {
      const c = clasificarFila(row);
      const nombre = String(row.nombre || '').trim() || (c.numero ? `${c.tipo === 'FICHA' ? 'Ficha' : 'Tema'} ${c.numero}` : 'Sin nombre');
      const fecha = fechas.get(Number(row.id)) || ymd(row.fecha_hora);
      return {
        id: row.id,
        numero: c.numero || null,
        nombre,
        fecha,
      };
    })
    .sort((a, b) => {
      const na = a.numero == null ? 999 : a.numero;
      const nb = b.numero == null ? 999 : b.numero;
      if (na !== nb) return na - nb;
      return a.nombre.localeCompare(b.nombre, 'es');
    });
}

/**
 * Seguimiento de todo el colegio: una fila por docente + aula + curso.
 * Temas, fichas y sesiones se cuentan aparte. Un hueco vacío no cuenta como subido.
 * La fecha es la de la subida (auditoría o fecha del archivo), no la de este reporte.
 */
async function armarSeguimientoTemas({ colegioId, anio, ciclo }) {
  const cid = parseInt(colegioId, 10);
  const year = parseInt(anio, 10);
  const bim = Math.min(4, Math.max(1, parseInt(ciclo, 10) || 1));
  const colegio = await getColegioData(cid);
  const cfg = await obtenerConfigEstructura(cid, year);
  const esperado = cfg.activo ? cantidadParaCiclo(cfg, bim) : 0;
  const tieneCols = await archivosTieneEstructuraCols();

  const asignRows = await query(
    `SELECT a.id AS asignatura_id,
            a.personal_id,
            c.nombre AS curso_nombre,
            g.grado,
            g.seccion,
            n.nombre AS nivel_nombre,
            TRIM(CONCAT(COALESCE(p.apellidos, ''), ', ', COALESCE(p.nombres, ''))) AS docente_nombre
     FROM asignaturas a
     INNER JOIN cursos c ON c.id = a.curso_id AND c.colegio_id = ?
     INNER JOIN grupos g ON g.id = a.grupo_id AND g.colegio_id = ?
     INNER JOIN niveles n ON n.id = g.nivel_id AND n.colegio_id = ?
     INNER JOIN personal p ON p.id = a.personal_id
     WHERE a.colegio_id = ? AND g.anio = ?
     ORDER BY
       CASE
         WHEN LOWER(TRIM(COALESCE(n.nombre, ''))) LIKE '%inicial%' THEN 1
         WHEN LOWER(TRIM(COALESCE(n.nombre, ''))) LIKE '%primaria%' THEN 2
         WHEN LOWER(TRIM(COALESCE(n.nombre, ''))) LIKE '%secundaria%' THEN 3
         ELSE 4
       END ASC,
       CAST(g.grado AS UNSIGNED) ASC,
       g.grado ASC,
       g.seccion ASC,
       docente_nombre ASC,
       c.nombre ASC`,
    [cid, cid, cid, cid, year]
  );

  const ids = (asignRows || []).map((r) => r.asignatura_id);
  let archivos = [];
  let sesiones = [];
  if (ids.length) {
    const inList = ids.map(() => '?').join(',');
    const cols = tieneCols
      ? 'id, asignatura_id, nombre, archivo, enlace, fecha_hora, item_tipo, item_numero'
      : 'id, asignatura_id, nombre, archivo, enlace, fecha_hora';
    archivos = await query(
      `SELECT ${cols}
       FROM asignaturas_archivos
       WHERE asignatura_id IN (${inList}) AND ciclo = ?`,
      [...ids, bim]
    );
    sesiones = await query(
      `SELECT s.id, s.asignatura_id, s.titulo, s.archivo, s.fecha_hora, aa.nombre AS tema_nombre
       FROM asignaturas_sesion_pdf s
       LEFT JOIN asignaturas_archivos aa ON aa.id = s.tema_id
       WHERE s.asignatura_id IN (${inList}) AND s.ciclo = ?
         AND s.archivo IS NOT NULL AND TRIM(s.archivo) <> ''`,
      [...ids, bim]
    );
  }

  const subidos = (archivos || []).filter(tieneContenido);
  const fechas = await fechasAuditoria(subidos.map((r) => r.id));

  const temasPorAsig = {};
  const fichasPorAsig = {};
  subidos.forEach((row) => {
    const c = clasificarFila(row);
    const bolsa = c.tipo === 'FICHA' ? fichasPorAsig : temasPorAsig;
    const aid = row.asignatura_id;
    if (!bolsa[aid]) bolsa[aid] = [];
    bolsa[aid].push(row);
  });

  const sesionesPorAsig = {};
  (sesiones || []).forEach((s) => {
    const aid = s.asignatura_id;
    if (!sesionesPorAsig[aid]) sesionesPorAsig[aid] = [];
    const titulo = String(s.titulo || '').trim();
    const tema = String(s.tema_nombre || '').trim();
    const nombre = titulo || tema || 'Sesión';
    sesionesPorAsig[aid].push({
      id: s.id,
      nombre: tema && titulo && !titulo.toLowerCase().includes(tema.toLowerCase()) ? `${tema} — ${titulo}` : nombre,
      fecha: ymd(s.fecha_hora),
    });
  });
  Object.values(sesionesPorAsig).forEach((lista) => {
    lista.sort((a, b) => String(a.fecha || '').localeCompare(String(b.fecha || '')) || a.nombre.localeCompare(b.nombre, 'es'));
  });

  const filas = (asignRows || []).map((row) => {
    const temas = armarLista(temasPorAsig[row.asignatura_id], fechas);
    const fichas = armarLista(fichasPorAsig[row.asignatura_id], fechas);
    const ses = sesionesPorAsig[row.asignatura_id] || [];
    return {
      asignatura_id: row.asignatura_id,
      personal_id: row.personal_id,
      docente: String(row.docente_nombre || '').replace(/^,\s*/, '').trim() || 'Sin docente',
      nivel: row.nivel_nombre || '',
      nivel_orden: ordenNivel(row.nivel_nombre),
      grado: row.grado,
      seccion: row.seccion || '',
      aula: etiquetaAula(row.nivel_nombre, row.grado, row.seccion),
      curso: row.curso_nombre || 'Curso',
      temas: { subidos: temas.length, items: temas },
      fichas: { subidos: fichas.length, items: fichas },
      sesiones: { subidos: ses.length, items: ses },
    };
  });

  return {
    anio: year,
    ciclo: bim,
    esperado: esperado > 0 ? esperado : 0,
    fecha_revision: fechaMySQLLima(),
    colegio: colegio?.nombre_intranet || colegio?.nombre || '',
    filas,
  };
}

module.exports = { armarSeguimientoTemas };
