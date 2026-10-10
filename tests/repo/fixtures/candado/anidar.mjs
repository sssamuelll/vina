// Orden de juguete para los tests del candado de la máquina: pide el candado
// DESDE DENTRO de una orden que ya lo tiene, como hace `npm run build` cuando lo
// lanza el deploy.
//   node anidar.mjs <pesado.mjs> <dormir.mjs> <marcador>
import { spawnSync } from 'node:child_process';

const [pesado, dormir, marcador] = process.argv.slice(2);
const r = spawnSync(
  process.execPath,
  [pesado, '--sin-admision', '--espera=0', '--', 'node', `"${dormir}"`, '0', `"${marcador}"`],
  { stdio: 'inherit', env: process.env, timeout: 10_000 },
);
process.exit(r.status ?? 1);
