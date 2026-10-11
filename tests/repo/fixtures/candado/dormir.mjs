// Orden de juguete para los tests del candado de la máquina.
//   node dormir.mjs <ms> <marcador> [código]
// Deja su PID en <marcador> al empezar, duerme <ms> y sale con <código> (0 por defecto).
import { writeFileSync } from 'node:fs';

const [ms, marcador, codigo = '0'] = process.argv.slice(2);
if (marcador) writeFileSync(marcador, String(process.pid));
setTimeout(() => process.exit(Number(codigo)), Number(ms));
