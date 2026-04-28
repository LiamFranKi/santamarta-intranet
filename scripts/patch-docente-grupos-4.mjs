import fs from 'fs';

const p = 'c:/react-aula-virtual/frontend/src/pages/DocenteGrupos.jsx';
const s = fs.readFileSync(p, 'utf8');
const start = '\n  const cargarAlumnos = async (grupoId) => {';
const end = '\n  const gruposFiltrados = grupos.filter(grupo => {';
const i = s.indexOf(start);
const j = s.indexOf(end);
if (i < 0 || j < 0) {
  console.error(i, j);
  process.exit(1);
}
const mid = `
  const cargarAlumnos = async (gid) => {
    const grupo = grupos.find((g) => g.id === gid);
    setGrupoInfo(grupo || null);
    setSelectedGrupo(gid);
    setTimeout(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      const el = document.querySelector('.docente-grupos');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  const volverAGrupos = () => {
    setSelectedGrupo(null);
    setGrupoInfo(null);
  };
`;
const s2 = s.slice(0, i) + mid + s.slice(j);
fs.writeFileSync(p, s2);
console.log('ok');
