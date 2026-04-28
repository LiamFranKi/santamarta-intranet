import fs from 'fs';

const p = 'c:/react-aula-virtual/frontend/src/pages/DocenteGrupos.jsx';
let s = fs.readFileSync(p, 'utf8');

const start = '\n      {/* Modal de Información del Alumno */}';
const end = '\n    </DashboardLayout>';
const i = s.indexOf(start);
const j = s.indexOf(end);
if (i < 0 || j < 0) {
  console.error('not found', i, j);
  process.exit(1);
}
const s2 = s.slice(0, i) + s.slice(j);
fs.writeFileSync(p, s2);
console.log('removed modals', j - i);
