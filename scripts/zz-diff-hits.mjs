import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
const ROOT = process.cwd();
const tracked = (p) => execFileSync('git', ['ls-files', ...p], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
const isTest = (f) => /__tests__|\.test\.|\.spec\./.test(f);
const files = [
  ...tracked(['*.css']).filter(f => f.startsWith('src/') && f !== 'src/styles/tokens.css'),
  ...tracked(['*.ts','*.tsx']).filter(f => f.startsWith('src/') && !isTest(f)),
];
const RE = /#[0-9a-fA-F]{3,8}\b|\brgba?\(\s*\d/g;
function scan(file, jsx) {
  const src = readFileSync(join(ROOT, file), 'utf8');
  let inBlock = false; const out = [];
  src.split('\n').forEach((raw, i) => {
    const t = raw.trim();
    if (inBlock) { if (t.includes('*/')) inBlock = false; return; }
    if (t.startsWith('/*') || (jsx && t.startsWith('{/*'))) { if (!t.includes('*/')) inBlock = true; return; }
    if (t.startsWith('//') || t.startsWith('*')) return;
    for (const m of raw.matchAll(RE)) out.push(`${file}:${i+1}: ${m[0]}  ||  ${t.slice(0,110)}`);
  });
  return out;
}
const a = new Set(); const b = new Set();
for (const f of files) { for (const h of scan(f,false)) a.add(h); for (const h of scan(f,true)) b.add(h); }
console.log('OLD', a.size, 'NEW', b.size);
console.log('--- solo en OLD (los que la regla nueva CIEGA) ---');
for (const h of a) if (!b.has(h)) console.log(h);
