const { query, execute, getAnioActivo } = require('./mysql');
const { generarSesionConIa, PROMPT_SESION_DEFAULT } = require('./cnebGeminiSesion');
const { varsGenerarSesionIa } = require('./cnebPiarAula');
const { insertarSesion } = require('./cnebSesionStore');

const NIVELES = ['INICIAL', 'PRIMARIA', 'SECUNDARIA'];

function nivelOk(raw) {
  const n = String(raw || '').toUpperCase();
  return NIVELES.includes(n) ? n : null;
}

async function listarUnidades(cid, nivel, bimestre) {
  const anio = (await getAnioActivo(cid)) || new Date().getFullYear();
  const params = [cid, anio, nivel];
  let extra = '';
  const b = parseInt(bimestre, 10);
  if (b >= 1 && b <= 4) {
    extra = ' AND bimestre = ?';
    params.push(b);
  }
  const rows = await query(
    `SELECT id, bimestre, nombre, orden
     FROM cneb_unidades
     WHERE colegio_id = ? AND anio = ? AND nivel_cneb = ?${extra}
     ORDER BY bimestre ASC, orden ASC, id ASC`,
    params
  );
  return { anio, unidades: rows || [] };
}

async function guardarUnidades(cid, nivel, items) {
  const anio = (await getAnioActivo(cid)) || new Date().getFullYear();
  await execute('DELETE FROM cneb_unidades WHERE colegio_id = ? AND anio = ? AND nivel_cneb = ?', [
    cid,
    anio,
    nivel,
  ]);
  let ordenPorBim = { 1: 0, 2: 0, 3: 0, 4: 0 };
  let n = 0;
  for (const raw of items || []) {
    const bimestre = parseInt(raw.bimestre, 10);
    const nombre = String(raw.nombre || '').trim().slice(0, 220);
    if (bimestre < 1 || bimestre > 4 || !nombre) continue;
    ordenPorBim[bimestre] += 1;
    await execute(
      `INSERT INTO cneb_unidades (colegio_id, anio, nivel_cneb, bimestre, nombre, orden)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [cid, anio, nivel, bimestre, nombre, ordenPorBim[bimestre]]
    );
    n += 1;
  }
  return { anio, guardadas: n };
}

async function textosDeCompetencia(compId, nivel, corte) {
  const n = parseInt(corte, 10);
  const filtro = nivel === 'INICIAL' ? 'edad' : 'grado';
  const base = `SELECT id, texto FROM cneb_desempenos WHERE competencia_id = ? AND ${filtro} = ?`;
  try {
    return await query(
      `${base} AND (origen = 'catalogo' OR origen IS NULL) ORDER BY orden ASC, id ASC`,
      [compId, n]
    );
  } catch (e) {
    if (e.code !== 'ER_BAD_FIELD_ERROR') throw e;
    return query(`${base} ORDER BY orden ASC, id ASC`, [compId, n]);
  }
}

async function generarLoteSesiones(cid, usuarioId, body) {
  const nivel = nivelOk(body?.nivel);
  if (!nivel) {
    const e = new Error('Indique el nivel.');
    e.status = 400;
    throw e;
  }
  const cantidadPedida = Math.min(6, Math.max(1, parseInt(body?.cantidad, 10) || 1));
  const ids = [...new Set((body?.competencia_ids || []).map((x) => parseInt(x, 10)).filter((n) => n > 0))];
  const titulosLista = (Array.isArray(body?.titulos) ? body.titulos : [])
    .map((t) => String(t || '').trim().slice(0, 220))
    .filter(Boolean)
    .slice(0, 6);
  const tituloUno = String(body?.titulo || '').trim().slice(0, 220);
  const unidad = String(body?.unidad || '').trim().slice(0, 220);
  if (!unidad) {
    const e = new Error('Escriba la unidad del bimestre. Todas las sesiones salen sobre ese tema.');
    e.status = 400;
    throw e;
  }
  const esTaller = !ids.length;
  const corte = parseInt(body?.corte, 10) || (nivel === 'INICIAL' ? 5 : 1);
  const duracion = Math.min(180, Math.max(20, parseInt(body?.duracion_min, 10) || 60));
  const anio = (await getAnioActivo(cid)) || new Date().getFullYear();
  let plantilla = PROMPT_SESION_DEFAULT;
  try {
    const [row] = await query('SELECT prompt_sesion FROM cneb_ajustes WHERE colegio_id = ? LIMIT 1', [cid]);
    if (row?.prompt_sesion) plantilla = row.prompt_sesion;
  } catch (e) {
    if (e.code !== 'ER_NO_SUCH_TABLE') throw e;
  }
  const cursoNombre = String(body?.curso_nombre || '').trim().slice(0, 160) || 'Taller interno';
  let piezas = [];
  if (esTaller) {
    const n = titulosLista.length ? titulosLista.length : cantidadPedida;
    piezas = Array.from({ length: n }, (_, i) => ({
      taller: true,
      area_id: null,
      competencia_id: null,
      area_nombre: cursoNombre,
      competencia_nombre: cursoNombre,
      capacidades: [],
      textos: [],
      des: [],
      tituloFijo: titulosLista[i] || (i === 0 ? tituloUno : ''),
      etiqueta: cursoNombre,
    }));
  } else {
    const ph = ids.map(() => '?').join(',');
    const comps = await query(
      `SELECT c.id, c.nombre, a.id AS area_id, a.nombre AS area_nombre
       FROM cneb_competencias c
       INNER JOIN cneb_areas a ON a.id = c.area_id
       WHERE c.id IN (${ph}) AND a.nivel_cneb = ? AND c.activo = 1
       ORDER BY a.orden ASC, c.orden ASC, c.id ASC`,
      [...ids, nivel]
    );
    if (!comps.length) {
      const e = new Error('No se encontraron esas competencias en el catálogo de este nivel.');
      e.status = 400;
      throw e;
    }
    const n = titulosLista.length ? titulosLista.length : cantidadPedida;
    piezas = [];
    for (let i = 0; i < n; i += 1) {
      const comp = comps[i % comps.length];
      const [caps, des] = await Promise.all([
        query('SELECT nombre FROM cneb_capacidades WHERE competencia_id = ? ORDER BY orden ASC, id ASC', [comp.id]),
        textosDeCompetencia(comp.id, nivel, corte),
      ]);
      const textos = (des || []).map((d) => d.texto).filter(Boolean);
      piezas.push({
        taller: false,
        area_id: comp.area_id,
        competencia_id: comp.id,
        area_nombre: comp.area_nombre,
        competencia_nombre: comp.nombre,
        capacidades: (caps || []).map((c) => c.nombre),
        textos,
        des: des || [],
        tituloFijo: titulosLista[i] || (i === 0 ? tituloUno : ''),
        etiqueta: comp.nombre,
      });
    }
  }
  const hoy = new Date();
  const fecha = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
  const creadas = [];
  const usados = [];
  for (let i = 0; i < piezas.length; i += 1) {
    const pieza = piezas[i];
    const vars = await varsGenerarSesionIa(
      cid,
      {
        nivel,
        corte_label: body?.corte_label || '',
        duracion_min: duracion,
        area_nombre: pieza.area_nombre,
        competencia_nombre: pieza.competencia_nombre,
        capacidades: pieza.capacidades,
        desempenos_texto: pieza.textos,
        proponer_desempenos: pieza.taller || !pieza.textos.length,
        titulo: pieza.tituloFijo,
        proposito: piezas.length === 1 ? body?.proposito || '' : '',
        unidad,
        indicacion_ia: body?.indicacion_ia,
        grupo_id: body?.grupo_id,
        dua: body?.dua,
        taller: pieza.taller,
        evitar_titulos: [body?.evitar_titulos, usados.filter(Boolean).join('; ')].filter(Boolean).join('; '),
      },
      anio
    );
    const result = await generarSesionConIa({ plantilla, duracionMin: duracion, vars });
    const b = result.borrador || {};
    const tituloFinal = pieza.tituloFijo || b.titulo || pieza.etiqueta;
    usados.push(tituloFinal);
    const sesion = await insertarSesion(cid, usuarioId, {
      nivel_cneb: nivel,
      grupo_id: body?.grupo_id,
      asignatura_id: body?.asignatura_id,
      area_id: pieza.area_id,
      competencia_id: pieza.competencia_id,
      titulo: tituloFinal,
      unidad,
      indicacion_ia: body?.indicacion_ia,
      proposito: b.proposito || '',
      material_teoria: b.teoria || '',
      ficha_estudiante: b.ficha || '',
      duracion_min: duracion,
      corte,
      bimestre: body?.bimestre,
      fecha_sesion: body?.fecha_sesion || fecha,
      estado: 'borrador',
      desempeno_ids: pieza.textos.length ? pieza.des.map((d) => d.id) : [],
      desempenos_libre: pieza.textos.length ? [] : b.desempenos || [],
      momentos: b.momentos || {},
      minutos: b.minutos || {},
      cotejo: (b.cotejo || []).map((item) => ({ item })),
      dua: body?.dua,
    });
    creadas.push({ id: sesion?.id, titulo: sesion?.titulo || tituloFinal, competencia: pieza.etiqueta });
  }
  return { creadas };
}

module.exports = {
  nivelOk,
  listarUnidades,
  guardarUnidades,
  generarLoteSesiones,
};
