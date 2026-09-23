const { query, execute } = require('./mysql');
const { CATALOGO_INICIAL, FUENTE: FUENTE_INICIAL } = require('../data/cnebInicialCatalogo');
const { CATALOGO_PRIMARIA, CATALOGO_SECUNDARIA, FUENTE_EBR } = require('../data/cnebCatalogosEbr');

const NIVELES = ['INICIAL', 'PRIMARIA', 'SECUNDARIA'];

const CATALOGOS = {
  INICIAL: { areas: CATALOGO_INICIAL, fuente: FUENTE_INICIAL, ciclo: 'II' },
  PRIMARIA: { areas: CATALOGO_PRIMARIA, fuente: FUENTE_EBR, ciclo: 'III-V' },
  SECUNDARIA: { areas: CATALOGO_SECUNDARIA, fuente: FUENTE_EBR, ciclo: 'VI-VII' },
};

async function contarCatalogo(nivelCneb) {
  const nivel = String(nivelCneb || 'INICIAL').toUpperCase();
  const [a] = await query('SELECT COUNT(*) AS n FROM cneb_areas WHERE nivel_cneb = ?', [nivel]);
  const [c] = await query(
    `SELECT COUNT(*) AS n FROM cneb_competencias c
     INNER JOIN cneb_areas a ON a.id = c.area_id
     WHERE a.nivel_cneb = ?`,
    [nivel]
  );
  const [d] = await query(
    `SELECT COUNT(*) AS n FROM cneb_desempenos d
     INNER JOIN cneb_competencias c ON c.id = d.competencia_id
     INNER JOIN cneb_areas a ON a.id = c.area_id
     WHERE a.nivel_cneb = ?`,
    [nivel]
  );
  return {
    nivel,
    areas: Number(a?.n || 0),
    competencias: Number(c?.n || 0),
    desempenos: Number(d?.n || 0),
  };
}

async function contarTodos() {
  const porNivel = {};
  for (const n of NIVELES) {
    porNivel[n] = await contarCatalogo(n);
  }
  return porNivel;
}

async function sembrarCatalogoNivel(nivelCneb) {
  const nivel = String(nivelCneb || '').toUpperCase();
  const pack = CATALOGOS[nivel];
  if (!pack) throw new Error('Nivel CNEB no válido.');

  let areasOk = 0;
  let compsOk = 0;
  let capsOk = 0;
  let desOk = 0;

  for (const area of pack.areas) {
    let [row] = await query(
      'SELECT id FROM cneb_areas WHERE codigo = ? AND nivel_cneb = ? LIMIT 1',
      [area.codigo, nivel]
    );
    if (!row) {
      const ins = await execute(
        `INSERT INTO cneb_areas (codigo, nombre, nivel_cneb, ciclo, tipo, descripcion, orden, fuente, activo)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [area.codigo, area.nombre, nivel, pack.ciclo, area.tipo, area.descripcion || null, area.orden || 0, pack.fuente]
      );
      row = { id: ins.insertId };
    } else {
      await execute(
        `UPDATE cneb_areas SET nombre = ?, tipo = ?, descripcion = ?, orden = ?, fuente = ?, ciclo = ?, activo = 1
         WHERE id = ?`,
        [area.nombre, area.tipo, area.descripcion || null, area.orden || 0, pack.fuente, pack.ciclo, row.id]
      );
    }
    areasOk += 1;
    const areaId = row.id;

    for (let ci = 0; ci < (area.competencias || []).length; ci += 1) {
      const comp = area.competencias[ci];
      let [cRow] = await query(
        'SELECT id FROM cneb_competencias WHERE area_id = ? AND codigo = ? LIMIT 1',
        [areaId, comp.codigo]
      );
      if (!cRow) {
        const insC = await execute(
          `INSERT INTO cneb_competencias (area_id, codigo, nombre, estandar_ciclo, orden, activo)
           VALUES (?, ?, ?, ?, ?, 1)`,
          [areaId, comp.codigo, comp.nombre, comp.estandar_ciclo || null, ci + 1]
        );
        cRow = { id: insC.insertId };
      } else {
        await execute(
          `UPDATE cneb_competencias SET nombre = ?, estandar_ciclo = ?, orden = ?, activo = 1 WHERE id = ?`,
          [comp.nombre, comp.estandar_ciclo || null, ci + 1, cRow.id]
        );
      }
      compsOk += 1;
      const compId = cRow.id;

      const [capN] = await query(
        'SELECT COUNT(*) AS n FROM cneb_capacidades WHERE competencia_id = ?',
        [compId]
      );
      if (Number(capN?.n || 0) === 0) {
        for (let k = 0; k < (comp.capacidades || []).length; k += 1) {
          await execute(
            'INSERT INTO cneb_capacidades (competencia_id, nombre, orden) VALUES (?, ?, ?)',
            [compId, comp.capacidades[k], k + 1]
          );
          capsOk += 1;
        }
      }

      const clavesDes = Object.keys(comp.desempenos || {}).map((x) => parseInt(x, 10)).filter((n) => Number.isFinite(n));
      const edades = nivel === 'INICIAL' ? clavesDes.filter((n) => n >= 3 && n <= 5) : [];
      const grados = nivel === 'INICIAL' ? [] : clavesDes.filter((n) => n >= 1 && n <= 6);
      for (const edad of edades) {
        const lista = comp.desempenos[edad] || [];
        const [dn] = await query(
          `SELECT COUNT(*) AS n FROM cneb_desempenos
           WHERE competencia_id = ? AND edad = ? AND (origen = 'catalogo' OR origen IS NULL)`,
          [compId, edad]
        ).catch((e) => {
          if (e.code !== 'ER_BAD_FIELD_ERROR') throw e;
          return query(
            'SELECT COUNT(*) AS n FROM cneb_desempenos WHERE competencia_id = ? AND edad = ?',
            [compId, edad]
          );
        });
        if (Number(dn?.n || 0) > 0) continue;
        for (let i = 0; i < lista.length; i += 1) {
          try {
            await execute(
              'INSERT INTO cneb_desempenos (competencia_id, edad, grado, texto, orden) VALUES (?, ?, NULL, ?, ?)',
              [compId, edad, lista[i], i + 1]
            );
          } catch (e) {
            if (e.code !== 'ER_BAD_FIELD_ERROR') throw e;
            await execute(
              'INSERT INTO cneb_desempenos (competencia_id, edad, texto, orden) VALUES (?, ?, ?, ?)',
              [compId, edad, lista[i], i + 1]
            );
          }
          desOk += 1;
        }
      }
      for (const grado of grados) {
        const lista = comp.desempenos[grado] || [];
        const [dn] = await query(
          `SELECT COUNT(*) AS n FROM cneb_desempenos
           WHERE competencia_id = ? AND grado = ? AND (origen = 'catalogo' OR origen IS NULL)`,
          [compId, grado]
        ).catch((e) => {
          if (e.code !== 'ER_BAD_FIELD_ERROR') throw e;
          return query(
            'SELECT COUNT(*) AS n FROM cneb_desempenos WHERE competencia_id = ? AND grado = ?',
            [compId, grado]
          );
        });
        if (Number(dn?.n || 0) > 0) continue;
        for (let i = 0; i < lista.length; i += 1) {
          await execute(
            'INSERT INTO cneb_desempenos (competencia_id, edad, grado, texto, orden) VALUES (?, NULL, ?, ?, ?)',
            [compId, grado, lista[i], i + 1]
          );
          desOk += 1;
        }
      }
    }
  }

  return {
    nivel,
    insertados: { areas: areasOk, competencias: compsOk, capacidades: capsOk, desempenos: desOk },
    totals: await contarCatalogo(nivel),
  };
}

async function sembrarCatalogosTodos() {
  const resultados = [];
  for (const n of NIVELES) {
    resultados.push(await sembrarCatalogoNivel(n));
  }
  return { sembrado: true, resultados, totals: await contarTodos() };
}

async function asegurarCatalogos() {
  const totals = await contarTodos();
  const faltan = NIVELES.filter((n) => (totals[n]?.areas || 0) === 0);
  if (!faltan.length) return { sembrado: false, totals };
  const resultados = [];
  for (const n of faltan) {
    resultados.push(await sembrarCatalogoNivel(n));
  }
  return { sembrado: true, resultados, totals: await contarTodos() };
}

function fuenteDe(nivel) {
  return CATALOGOS[String(nivel || 'INICIAL').toUpperCase()]?.fuente || FUENTE_EBR;
}

async function listarDesempenosCatalogo(ids) {
  if (!ids.length) return [];
  const ph = ids.map(() => '?').join(',');
  const intentos = [
    `SELECT id, competencia_id, edad, grado, texto, orden FROM cneb_desempenos
     WHERE competencia_id IN (${ph}) AND (origen = 'catalogo' OR origen IS NULL)
     ORDER BY COALESCE(edad, grado) ASC, orden ASC, id ASC`,
    `SELECT id, competencia_id, edad, grado, texto, orden FROM cneb_desempenos
     WHERE competencia_id IN (${ph})
     ORDER BY COALESCE(edad, grado) ASC, orden ASC, id ASC`,
    `SELECT id, competencia_id, edad, texto, orden FROM cneb_desempenos
     WHERE competencia_id IN (${ph})
     ORDER BY edad ASC, orden ASC, id ASC`,
  ];
  let ultimo;
  for (const sql of intentos) {
    try {
      return await query(sql, ids);
    } catch (e) {
      ultimo = e;
      if (e.code !== 'ER_BAD_FIELD_ERROR') throw e;
    }
  }
  throw ultimo;
}

async function arbolCatalogo(nivelCneb) {
  const nivel = String(nivelCneb || 'INICIAL').toUpperCase();
  await asegurarCatalogos();
  const areas = await query(
    `SELECT id, codigo, nombre, tipo, descripcion, orden, fuente, ciclo, nivel_cneb
     FROM cneb_areas WHERE nivel_cneb = ? AND activo = 1
     ORDER BY orden ASC, id ASC`,
    [nivel]
  );
  const competencias = await query(
    `SELECT c.id, c.area_id, c.codigo, c.nombre, c.estandar_ciclo, c.orden
     FROM cneb_competencias c
     INNER JOIN cneb_areas a ON a.id = c.area_id
     WHERE a.nivel_cneb = ? AND c.activo = 1
     ORDER BY c.orden ASC, c.id ASC`,
    [nivel]
  );
  const capacidades = competencias.length
    ? await query(
        `SELECT id, competencia_id, nombre, orden FROM cneb_capacidades
         WHERE competencia_id IN (${competencias.map(() => '?').join(',')})
         ORDER BY orden ASC, id ASC`,
        competencias.map((c) => c.id)
      )
    : [];
  const desempenos = competencias.length
    ? await listarDesempenosCatalogo(competencias.map((c) => c.id))
    : [];

  const capBy = new Map();
  (capacidades || []).forEach((x) => {
    if (!capBy.has(x.competencia_id)) capBy.set(x.competencia_id, []);
    capBy.get(x.competencia_id).push(x);
  });
  const desBy = new Map();
  (desempenos || []).forEach((x) => {
    if (!desBy.has(x.competencia_id)) desBy.set(x.competencia_id, []);
    desBy.get(x.competencia_id).push({ ...x, grado: x.grado ?? null });
  });

  const tree = (areas || []).map((area) => ({
    ...area,
    competencias: competencias
      .filter((c) => Number(c.area_id) === Number(area.id))
      .map((c) => ({
        ...c,
        capacidades: capBy.get(c.id) || [],
        desempenos: desBy.get(c.id) || [],
      })),
  }));

  return { nivel, fuente: fuenteDe(nivel), areas: tree };
}

module.exports = {
  NIVELES,
  CATALOGOS,
  contarCatalogo,
  contarTodos,
  sembrarCatalogoNivel,
  sembrarCatalogosTodos,
  asegurarCatalogos,
  arbolCatalogo,
  listarDesempenosCatalogo,
  fuenteDe,
  FUENTE: FUENTE_INICIAL,
};
