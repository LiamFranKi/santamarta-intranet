import fs from 'fs';

const p = 'c:/react-aula-virtual/frontend/src/pages/DocenteGrupos.jsx';
const s = fs.readFileSync(p, 'utf8');
const start = '  const ordenarGruposPlaceholder = () => null;';
const end = '\n  const ordenarGrupos = (a, b) => {';
const i = s.indexOf(start);
const j = s.indexOf(end);
if (i < 0 || j < 0) {
  console.error('markers', i, j);
  process.exit(1);
}
const s2 = s.slice(0, i) + s.slice(j);
fs.writeFileSync(p, s2);
console.log('removed bytes', j - i);
