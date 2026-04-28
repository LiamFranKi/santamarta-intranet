import fs from 'fs';

const p = 'c:/react-aula-virtual/frontend/src/pages/DocenteGrupos.jsx';
const s = fs.readFileSync(p, 'utf8');

const startMarker = '        ) : (\n          <div className="alumnos-container">';
const endMarker = '\n            </div>\n          </div>\n        )}';

const i = s.indexOf(startMarker);
const j = s.indexOf(endMarker, i);
if (i < 0 || j < 0) {
  console.error('markers not found', i, j);
  process.exit(1);
}

const mid = `        ) : (
          <GrupoAlumnosListaView
            grupoId={selectedGrupo}
            grupoInfo={grupoInfo}
            onVolver={volverAGrupos}
            psicologiaLinkMode="docente"
          />
        )}`;

const s2 = s.slice(0, i) + mid + s.slice(j + endMarker.length);
fs.writeFileSync(p, s2);
console.log('step1 ok', i, j);
