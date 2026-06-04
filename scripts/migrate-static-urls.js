const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SKIP = new Set(['node_modules', '.git', 'build', 'dist']);
const EXT = new Set(['.js', '.jsx', '.md', '.example', '.conf']);

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (EXT.has(path.extname(name)) || name.endsWith('-ssl.conf')) out.push(p);
  }
  return out;
}

const dirs = ['backend', 'frontend'].map((d) => path.join(ROOT, d));
const extra = path.join(ROOT, 'sistema.vanguardschools.edu.pe-le-ssl.conf');
const files = [...dirs.flatMap((d) => walk(d)), extra].filter((f) => fs.existsSync(f));

let updated = 0;
for (const f of files) {
  const c = fs.readFileSync(f, 'utf8');
  if (!/nuevo\.vanguardschools/i.test(c)) continue;
  const u = c
    .replace(/https:\/\/nuevo\.vanguardschools\.edu\.pe/gi, 'https://sistema.vanguardschools.edu.pe')
    .replace(/\/home\/vanguard\/nuevo\.vanguardschools\.edu\.pe/g, '/home/vanguard/intranet2026/backend');
  if (u !== c) {
    fs.writeFileSync(f, u);
    updated++;
  }
}
console.log(`Updated ${updated} files`);
