import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Los tres trinquetes de la interfaz corren en el gate del deploy (spec
 * 2026-10-02 «la interfaz en papel» § 9).
 *
 * Hasta ese día corrían «antes de cada PR», o sea cuando alguien se acordaba, y
 * la ley «se mide» era prosa: nada impedía desplegar con un contador subido.
 * Este test lee la lista del propio script, que es la que manda, y de paso
 * guarda que cada spec que nombra exista: una lista con un archivo que ya no
 * está corre menos de lo que dice.
 */
const RAIZ = process.cwd();
const GUION = readFileSync(join(RAIZ, 'scripts/deploy-prod.sh'), 'utf8');

/** Los specs del comando `npx playwright test --workers=2 \` del gate, en orden. */
function specsDelGate(): string[] {
  const lineas = GUION.split('\n');
  const inicio = lineas.findIndex((l) => l.startsWith('npx playwright test --workers=2 \\'));
  if (inicio === -1) return [];
  const specs: string[] = [];
  for (const linea of lineas.slice(inicio + 1)) {
    const m = linea.match(/^\s+(tests\/e2e\/\S+\.spec\.ts) \\$/);
    if (!m) break;
    specs.push(m[1]);
  }
  return specs;
}

describe('el gate del deploy corre los trinquetes de la interfaz', () => {
  it('el censo no está ciego: la lista se lee y es larga', () => {
    expect(specsDelGate().length).toBeGreaterThanOrEqual(28);
  });

  it('están los tres trinquetes', () => {
    expect(specsDelGate()).toEqual(expect.arrayContaining([
      'tests/e2e/reposo-solo-lo-que-perdura.spec.ts',
      'tests/e2e/superficies-por-accion.spec.ts',
      'tests/e2e/contraste-del-cromo.spec.ts',
    ]));
  });

  it('y las dos redes de emplazamiento de P2a: el margen y la barra superior (§ 9)', () => {
    expect(specsDelGate()).toEqual(expect.arrayContaining([
      'tests/e2e/margen-de-herramientas.spec.ts',
      'tests/e2e/barra-superior.spec.ts',
    ]));
  });

  it('y la red de la línea al pie (P2b), que sustituye a la de la tira', () => {
    const specs = specsDelGate();
    expect(specs).toContain('tests/e2e/linea-al-pie.spec.ts');
    expect(specs).not.toContain('tests/e2e/emplazamiento-tira.spec.ts');
  });

  it('y la red de la IA convocada (P2c): no está en reposo y sus puertas abren', () => {
    expect(specsDelGate()).toContain('tests/e2e/ia-convocada.spec.ts');
  });

  it('y la red de la cabina de la pieza (P3a): la barrita de cuatro y una cota a la vez', () => {
    expect(specsDelGate()).toContain('tests/e2e/la-cabina-de-la-pieza.spec.ts');
  });

  it('cada spec de la lista existe en disco', () => {
    expect(specsDelGate().filter((s) => !existsSync(join(RAIZ, s)))).toEqual([]);
  });

  it('ninguno está repetido', () => {
    const specs = specsDelGate();
    expect(new Set(specs).size).toBe(specs.length);
  });
});
