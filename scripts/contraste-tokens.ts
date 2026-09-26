import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { verificarContraste } from '../src/styles/contrasteDeTokens';
import { resolveToken, tokenColor, toHex } from '../src/styles/colorMath';

const css = readFileSync(join(process.cwd(), 'src/styles/tokens.css'), 'utf8');
const resultados = verificarContraste(css);
console.log('\n  tinta                    fondo                    hex tinta  ratio   piso  ');
for (const r of resultados) {
  const hex = toHex(tokenColor(css, r.tinta).rgb);
  console.log(`  ${r.tinta.padEnd(24)} ${r.fondo.padEnd(24)} ${hex}    ${r.ratio.toFixed(2).padStart(5)}   ${String(r.minimo).padStart(4)}  ${r.ok ? '' : '✗ ' + r.por}`);
}
const fallos = resultados.filter((r) => !r.ok);
console.log(fallos.length ? `\n  ✗ ${fallos.length} par(es) por debajo del piso.\n` : '\n  ✓ todos los pares cumplen.\n');
// Recordatorio para quien cambie un token: el hex del comentario sale de aquí.
console.log(`  --accent resuelve a ${resolveToken(css, '--accent')} = ${toHex(tokenColor(css, '--accent').rgb)}`);
process.exit(fallos.length ? 1 : 0);
