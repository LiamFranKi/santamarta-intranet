const { formatSqlTextProtocol } = require('../utils/mysql');

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

const oldRegexp = `SELECT a.id,
  (SELECT ROUND(AVG(CAST(p.promedio AS DECIMAL(5,2))), 0)
   FROM promedios p
   WHERE p.matricula_id = m.id
     AND p.asignatura_id = ?
     AND p.promedio REGEXP '^[0-9]+\\.?[0-9]*$') as promedio_final
 FROM alumnos a
 WHERE m.grupo_id = ? AND m.colegio_id = ? AND g.anio = ?`;

const naive = require('mysql2').format(oldRegexp, [10, 20, 1, 2026]);
assert(!naive.includes('\\.?'), 'naive format debe comerse el ? del REGEXP: ' + naive);

const safe = formatSqlTextProtocol(oldRegexp, [10, 20, 1, 2026]);
assert(safe.includes("REGEXP '^[0-9]+\\.?[0-9]*$'"), 'debe conservar REGEXP: ' + safe);
assert(safe.includes('asignatura_id = 10'), 'placeholder 1: ' + safe);
assert(safe.includes('grupo_id = 20'), 'placeholder 2: ' + safe);
assert(safe.includes('colegio_id = 1'), 'placeholder 3: ' + safe);
assert(safe.includes('anio = 2026'), 'placeholder 4: ' + safe);

const like = formatSqlTextProtocol('SELECT id FROM t WHERE nombre LIKE ? AND id = ?', ['%ana%', 5]);
assert(like.includes("LIKE '%ana%'"), like);
assert(like.includes('id = 5'), like);

const inList = formatSqlTextProtocol(
  `SELECT id FROM t WHERE id IN (${[1, 2, 3].map(() => '?').join(',')}) AND tipo = 'DOCENTE'`,
  [1, 2, 3]
);
assert(inList.includes('IN (1,2,3)') || inList.includes('IN (1, 2, 3)'), inList);
assert(inList.includes("'DOCENTE'"), inList);

console.log('OK formatSqlTextProtocol');
