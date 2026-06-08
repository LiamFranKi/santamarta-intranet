const fs = require('fs');
const path = require('path');

const p = path.join(__dirname, '../routes/docente.routes.js');
let s = fs.readFileSync(p, 'utf8');
const start = s.indexOf("router.use('/tutoria/grupos/:grupoId'");
const end = s.indexOf("router.get('/roles-adicionales'", start);
if (start < 0 || end < 0) {
  console.error('markers not found', start, end);
  process.exit(1);
}
let chunk = s.slice(start, end);
const before = chunk;
chunk = chunk.replace(
  /if \(!ok \|\| ok\.length === 0\) \{\s*return res\.status\(403\)\.json\(\{ error: 'No eres tutor de este grupo' \}\);\s*\}/g,
  "if (!req._tutoriaGrupoAccesoOk && (!ok || ok.length === 0)) { return res.status(403).json({ error: 'No eres tutor de este grupo' }); }"
);
chunk = chunk.replace(
  /if \(grupoTutor\.length === 0\) \{\s*return res\.status\(403\)\.json\(\{ error: 'No eres tutor de este grupo' \}\);\s*\}/g,
  "if (!req._tutoriaGrupoAccesoOk && grupoTutor.length === 0) { return res.status(403).json({ error: 'No eres tutor de este grupo' }); }"
);
chunk = chunk.replace(
  /if \(!grupoTutor\.length\) \{\s*return res\.status\(403\)\.json\(\{ error: 'No eres tutor de este grupo' \}\);\s*\}/g,
  "if (!req._tutoriaGrupoAccesoOk && !grupoTutor.length) { return res.status(403).json({ error: 'No eres tutor de este grupo' }); }"
);
chunk = chunk.replace(
  /if \(!grupoTutor\.length\) return res\.status\(403\)\.json\(\{ error: 'No eres tutor de este grupo' \}\);/g,
  "if (!req._tutoriaGrupoAccesoOk && !grupoTutor.length) return res.status(403).json({ error: 'No eres tutor de este grupo' });"
);
chunk = chunk.replace(
  /if \(!grupoTutor \|\| grupoTutor\.length === 0\) \{\s*return res\.status\(403\)\.json\(\{ error: 'No eres tutor de este grupo' \}\);\s*\}/g,
  "if (!req._tutoriaGrupoAccesoOk && (!grupoTutor || grupoTutor.length === 0)) { return res.status(403).json({ error: 'No eres tutor de este grupo' }); }"
);
chunk = chunk.replace(
  /return res\.status\(403\)\.json\(\{ error: 'No eres tutor de este grupo' \}\);/g,
  (match, offset, str) => {
    const lineStart = str.lastIndexOf('\n', offset) + 1;
    const line = str.slice(lineStart, str.indexOf('\n', offset));
    if (line.includes('_tutoriaGrupoAccesoOk')) return match;
    if (line.trim().startsWith('if (')) return match;
    return "if (!req._tutoriaGrupoAccesoOk) " + match;
  }
);
console.log('changed', before !== chunk);
s = s.slice(0, start) + chunk + s.slice(end);
fs.writeFileSync(p, s);
