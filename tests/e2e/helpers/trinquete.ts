import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Línea base de un trinquete e2e, con la misma regla que
 * `scripts/ui-contract-baseline.json`: un contador solo BAJA. Con la variable
 * de entorno de actualización el spec escribe lo medido, pero nunca por encima
 * del techo vigente. Nunca se edita a mano.
 */
export interface Baseline {
  _doc: string;
  meta: number;
  estados: Record<string, number>;
}

export function leerBaseline(ruta: string): Baseline {
  return JSON.parse(readFileSync(join(process.cwd(), ruta), 'utf8')) as Baseline;
}

export function fijarBaseline(ruta: string, medidas: Record<string, number>): void {
  const b = leerBaseline(ruta);
  for (const [estado, n] of Object.entries(medidas)) {
    const techo = b.estados[estado];
    if (techo === undefined || n < techo) b.estados[estado] = n;
  }
  writeFileSync(join(process.cwd(), ruta), JSON.stringify(b, null, 2) + '\n');
}
