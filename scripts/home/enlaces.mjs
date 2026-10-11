#!/usr/bin/env node
/** HEAD a cada enlace externo de home/datos/ (issues, ROADMAP, PRs). Lo corre
 *  scripts/deploy-prod.sh antes de enviar: un 404 público en «En construcción» para el deploy. */
import { readFileSync } from 'node:fs';
const json = (rel) => JSON.parse(readFileSync(rel, 'utf8'));
const urls = new Set([
  ...json('home/datos/en-construccion.json').map((e) => e.enlace),
  ...json('home/datos/diario.json').map((d) => `https://github.com/sssamuelll/vina/pull/${d.pr}`),
  'https://github.com/sssamuelll/vina/tree/main/docs/superpowers/specs',
]);
let rotos = 0;
for (const url of urls) {
  const limpio = url.split('#')[0];
  const r = await fetch(limpio, { method: 'HEAD', redirect: 'follow' }).catch(() => null);
  const ok = r && r.status === 200;
  console.log(`${ok ? '✓' : '✗'} ${r ? r.status : 'sin respuesta'} ${url}`);
  if (!ok) rotos++;
}
if (rotos) { console.error(`${rotos} enlace(s) roto(s)`); process.exit(1); }
