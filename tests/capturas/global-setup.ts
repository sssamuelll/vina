import { rmSync } from 'node:fs';
import path from 'node:path';

// Runs once, before the workers. Each project's worker merges its shots into these files, so a run
// starts them empty: nothing written by an earlier run can survive into the new one.
export default function globalSetup(): void {
  const texto = process.env.CAPTURAS_TEXTO;
  const compare = process.env.CAPTURAS_COMPARE;
  if (texto && compare && path.resolve(texto) === path.resolve(compare)) {
    throw new Error('CAPTURAS_TEXTO and CAPTURAS_COMPARE name the same file: write the new texts elsewhere and compare them afterwards.');
  }
  if (texto) rmSync(texto, { force: true });
  const fecha = process.env.CAPTURAS_FECHA;
  if (fecha) rmSync(path.resolve('docs/reports', `ui-audit-${fecha}`, 'capturas', 'superficies.json'), { force: true });
}
