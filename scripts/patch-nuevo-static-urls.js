const fs = require('fs');
const files = [
  'backend/routes/docente.routes.js',
  'backend/routes/apoderado.routes.js',
  'backend/routes/alumno.routes.js',
  'backend/routes/admin.reportes.routes.js',
];
const needle =
  '.replace(/https?:\\/\\/(www\\.)?vanguardschools\\.edu\\.pe/gi, phpSystemUrl)';
const replacement =
  '.replace(/https?:\\/\\/(www\\.)?vanguardschools\\.edu\\.pe/gi, phpSystemUrl).replace(/https?:\\/\\/nuevo\\.vanguardschools\\.edu\\.pe/gi, phpSystemUrl)';

for (const f of files) {
  let c = fs.readFileSync(f, 'utf8');
  if (!c.includes(needle)) continue;
  if (c.includes('nuevo\\.vanguardschools\\.edu\\.pe/gi, phpSystemUrl)')) {
    console.log(`${f}: ya actualizado`);
    continue;
  }
  const count = c.split(needle).length - 1;
  c = c.split(needle).join(replacement);
  fs.writeFileSync(f, c);
  console.log(`${f}: ${count} reemplazos`);
}
