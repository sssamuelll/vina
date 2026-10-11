import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Vitest ni se lleva la máquina entera ni se rinde cuando está cargada
 * (2026-10-10).
 *
 * Dos ensayos de la #1241 murieron en los unitarios por tiempo, no por fallo:
 * tests chicos que leen archivos, 0,5 s solos y 5,4 s con 23 workers en 24 CPU,
 * por encima de los 5 s por defecto. Se lee la config como texto, igual que los
 * demás tests del gate: importarla metería un archivo de la raíz en el proyecto
 * de tipos de los tests.
 */
const CONFIG = readFileSync(join(process.cwd(), 'vitest.config.ts'), 'utf8');

const numero = (campo: string): number => {
  const m = CONFIG.match(new RegExp(`${campo}:\\s*([\\d_]+)`));
  return m ? Number(m[1].replace(/_/g, '')) : NaN;
};

describe('la config de vitest aguanta una máquina cargada', () => {
  it('da 30 s o más a cada test y a cada hook, no los 5 y 10 s por defecto', () => {
    expect(numero('testTimeout')).toBeGreaterThanOrEqual(30_000);
    expect(numero('hookTimeout')).toBeGreaterThanOrEqual(30_000);
  });

  it('no usa más de la mitad de las CPU lógicas', () => {
    const m = CONFIG.match(/maxWorkers:[^\n]*availableParallelism\(\)\s*\/\s*(\d+)/);
    expect(m, 'maxWorkers ya no se calcula sobre availableParallelism()').not.toBeNull();
    expect(Number(m?.[1])).toBeGreaterThanOrEqual(2);
  });
});
